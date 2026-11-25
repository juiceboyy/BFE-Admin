/**
 * js/utils/drive-duplicates.js
 * Analyses exact MD5 duplicates in the Google Drive Bonnetjes folder and maintains a session MD5 index cache.
 */
import { accessToken } from '../api/auth.js';
import {
    DRIVE_FOLDER_ID,
    isProcessedReceiptName,
    listAllReceiptFiles,
    trashDriveFile
} from '../api/storage-drive.js';

const DRIVE_MD5_CACHE_TTL_MS = 60_000;
let _driveMd5IndexCache = null; // { fetchedAt: number, files: Array, byMd5: Map<string, Array> }

/**
 * Clears the cached Google Drive MD5 index.
 */
export function clearDriveMd5IndexCache() {
    _driveMd5IndexCache = null;
}

function buildMd5Map(files) {
    const byMd5 = new Map();
    for (const file of files || []) {
        const md5 = file && file.md5Checksum ? String(file.md5Checksum).toLowerCase().trim() : '';
        if (!md5) continue;
        if (!byMd5.has(md5)) byMd5.set(md5, []);
        byMd5.get(md5).push(file);
    }
    return byMd5;
}

/**
 * Seeds the Drive MD5 index cache from an already-fetched file list.
 * @param {Array<Object>} files
 * @returns {Map<string, Array<Object>>}
 */
export function seedDriveMd5IndexCache(files) {
    const list = Array.isArray(files) ? files : [];
    const byMd5 = buildMd5Map(list);
    _driveMd5IndexCache = {
        fetchedAt: Date.now(),
        files: list,
        byMd5
    };
    return byMd5;
}

/**
 * Groups Drive receipt files by exact MD5 checksum and applies smart pre-selection rules.
 * @param {Array<Object>} files
 * @returns {{ totalFiles: number, duplicateGroupCount: number, redundantFileCount: number, reclaimableBytes: number, groups: Array<Object> }}
 */
export function groupDriveDuplicatesByMd5(files) {
    const list = Array.isArray(files) ? files : [];
    const byMd5 = buildMd5Map(list);
    const groups = [];
    let redundantFileCount = 0;
    let reclaimableBytes = 0;

    for (const [md5, groupFiles] of byMd5.entries()) {
        if (groupFiles.length < 2) continue;

        const annotated = groupFiles.map(f => ({
            ...f,
            sizeBytes: parseInt(f.size, 10) || 0,
            isProcessed: isProcessedReceiptName(f.name)
        }));

        annotated.sort((a, b) => {
            if (a.isProcessed !== b.isProcessed) return a.isProcessed ? -1 : 1;
            const timeA = a.createdTime ? Date.parse(a.createdTime) : Number.MAX_SAFE_INTEGER;
            const timeB = b.createdTime ? Date.parse(b.createdTime) : Number.MAX_SAFE_INTEGER;
            if (timeA !== timeB) return timeA - timeB;
            return String(a.name || '').localeCompare(String(b.name || ''));
        });

        const processedCount = annotated.filter(f => f.isProcessed).length;
        const hasMultipleProcessed = processedCount >= 2;
        const fileSizeBytes = annotated[0]?.sizeBytes || 0;

        const items = annotated.map((file, idx) => ({
            ...file,
            keepRecommended: idx === 0,
            selectedForTrash: hasMultipleProcessed ? false : idx > 0
        }));

        const extraCopies = items.length - 1;
        redundantFileCount += extraCopies;
        reclaimableBytes += extraCopies * fileSizeBytes;

        groups.push({
            md5,
            fileSizeBytes,
            processedCount,
            hasMultipleProcessed,
            files: items
        });
    }

    groups.sort((a, b) => {
        if (a.hasMultipleProcessed !== b.hasMultipleProcessed) {
            return a.hasMultipleProcessed ? -1 : 1;
        }
        return (b.fileSizeBytes * (b.files.length - 1)) - (a.fileSizeBytes * (a.files.length - 1));
    });

    return {
        totalFiles: list.length,
        duplicateGroupCount: groups.length,
        redundantFileCount,
        reclaimableBytes,
        groups
    };
}

/**
 * Fetches all Drive receipt files, updates the MD5 cache, and returns grouped duplicates.
 * @param {string} [folderId]
 * @returns {Promise<Object>}
 */
export async function scanDriveDuplicates(folderId = DRIVE_FOLDER_ID) {
    const files = await listAllReceiptFiles(folderId);
    seedDriveMd5IndexCache(files);
    return groupDriveDuplicatesByMd5(files);
}

/**
 * Returns a cached MD5 -> Drive files Map, fetching from Drive if needed.
 * Returns an empty Map gracefully if the user is not signed in to Google.
 * @param {string} [folderId]
 * @param {boolean} [forceRefresh]
 * @returns {Promise<Map<string, Array<Object>>>}
 */
export async function getDriveMd5Index(folderId = DRIVE_FOLDER_ID, forceRefresh = false) {
    if (!accessToken) return new Map();
    const isFresh = _driveMd5IndexCache && (Date.now() - _driveMd5IndexCache.fetchedAt) < DRIVE_MD5_CACHE_TTL_MS;
    if (!forceRefresh && isFresh) {
        return _driveMd5IndexCache.byMd5;
    }
    const files = await listAllReceiptFiles(folderId);
    return seedDriveMd5IndexCache(files);
}

/**
 * Finds a matching Drive file for a given MD5 checksum, preferring already-processed files.
 * @param {string} md5
 * @param {Map<string, Array<Object>>} md5Index
 * @param {string|null} [excludeFileId]
 * @returns {Object|null}
 */
export function findDriveMd5Match(md5, md5Index, excludeFileId = null) {
    if (!md5 || !md5Index || md5Index.size === 0) return null;
    const key = String(md5).toLowerCase().trim();
    const matches = (md5Index.get(key) || []).filter(f => f.id !== excludeFileId);
    if (matches.length === 0) return null;
    return matches.find(f => isProcessedReceiptName(f.name)) || matches[0];
}

/**
 * Moves multiple Drive files to the Trash sequentially and clears the MD5 index cache.
 * @param {Array<string>} fileIds
 * @param {Function|null} [onProgress]
 * @returns {Promise<{ trashedIds: Array<string>, errors: Array<{ fileId: string, message: string }> }>}
 */
export async function trashDriveFilesBatch(fileIds, onProgress = null) {
    const ids = Array.isArray(fileIds) ? fileIds.filter(Boolean) : [];
    const trashedIds = [];
    const errors = [];

    for (let i = 0; i < ids.length; i++) {
        const fileId = ids[i];
        if (onProgress) {
            onProgress({ current: i + 1, total: ids.length, fileId });
        }
        try {
            await trashDriveFile(fileId);
            trashedIds.push(fileId);
        } catch (err) {
            errors.push({ fileId, message: err.message });
        }
    }

    clearDriveMd5IndexCache();
    return { trashedIds, errors };
}

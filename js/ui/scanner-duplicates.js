/**
 * js/ui/scanner-duplicates.js
 * Scanner MD5 pre-check helpers, direct Drive Trash action, and override rescan.
 */
import { accessToken } from '../api/auth.js';
import {
    DRIVE_FOLDER_ID,
    downloadDriveFileAsBlob,
    isProcessedReceiptName,
    listAllReceiptFiles,
    trashDriveFile
} from '../api/storage-drive.js';
import { computeFileMd5 } from '../utils/md5.js';
import {
    clearDriveMd5IndexCache,
    findDriveMd5Match,
    getDriveMd5Index,
    seedDriveMd5IndexCache
} from '../utils/drive-duplicates.js';

export function findQueueMd5Match(md5, batchQueue, excludeId = null) {
    if (!md5) return null;
    const key = String(md5).toLowerCase().trim();
    return batchQueue.find(item =>
        String(item.id) !== String(excludeId) &&
        item.status !== 'error' &&
        item.md5 &&
        String(item.md5).toLowerCase().trim() === key
    ) || null;
}

export function createSkippedMd5Item({ file, md5, reason, driveFileId = null, driveMeta = null }) {
    return {
        id: Date.now() + Math.random(),
        file,
        md5,
        status: 'duplicate_skipped',
        isDuplicate: true,
        isMd5Duplicate: true,
        duplicateReason: reason,
        data: null,
        driveFileId,
        driveMeta,
        selected: false
    };
}

/**
 * Lists unprocessed Drive receipts, skips exact MD5 duplicates before downloading/AI,
 * and downloads unique receipts into batchQueue.
 */
export async function enqueueDriveReceiptsWithMd5Check(batchQueue) {
    const allFiles = await listAllReceiptFiles(DRIVE_FOLDER_ID);
    const byMd5 = seedDriveMd5IndexCache(allFiles);
    const unprocessed = allFiles.filter(f => !isProcessedReceiptName(f.name));

    if (unprocessed.length === 0) {
        return { unprocessedCount: 0, addedCount: 0, duplicateCount: 0 };
    }

    const seenUnprocessedMd5 = new Map();
    let addedCount = 0;
    let duplicateCount = 0;

    for (const driveFile of unprocessed) {
        if (batchQueue.some(q => q.driveFileId === driveFile.id)) continue;

        const md5 = driveFile.md5Checksum ? String(driveFile.md5Checksum).toLowerCase().trim() : '';
        let duplicateReason = '';

        if (md5) {
            const driveMatches = (byMd5.get(md5) || []).filter(f => f.id !== driveFile.id);
            const processedMatch = driveMatches.find(f => isProcessedReceiptName(f.name));
            const queueMatch = findQueueMd5Match(md5, batchQueue);
            const batchPrevMatch = seenUnprocessedMd5.get(md5);

            if (processedMatch) {
                duplicateReason = `Exact duplicaat van verwerkt bestand '${processedMatch.name}' in Drive`;
            } else if (queueMatch) {
                duplicateReason = `Exact duplicaat van '${queueMatch.file?.name || 'eerder bestand'}' in wachtrij`;
            } else if (batchPrevMatch) {
                duplicateReason = `Exact duplicaat van '${batchPrevMatch.name}' in Drive-map`;
            }
        }

        if (duplicateReason) {
            batchQueue.push(createSkippedMd5Item({
                file: { name: driveFile.name, type: driveFile.mimeType || 'application/pdf' },
                md5,
                reason: duplicateReason,
                driveFileId: driveFile.id,
                driveMeta: driveFile
            }));
            duplicateCount++;
            continue;
        }

        if (md5) seenUnprocessedMd5.set(md5, driveFile);

        try {
            const file = await downloadDriveFileAsBlob(driveFile.id, driveFile.name, driveFile.mimeType);
            batchQueue.push({
                id: Date.now() + Math.random(),
                file,
                md5,
                status: 'pending',
                data: null,
                driveFileId: driveFile.id,
                selected: true
            });
            addedCount++;
        } catch (err) {
            console.error(`Fout bij downloaden ${driveFile.name}:`, err);
        }
    }

    return { unprocessedCount: unprocessed.length, addedCount, duplicateCount };
}

/**
 * Computes MD5 for local uploads and flags exact duplicates against Drive and batchQueue before AI.
 */
export async function enqueueLocalFilesWithMd5Check(files, batchQueue, currentMode = 'inkoop') {
    const validFiles = Array.from(files || []).filter(
        file => !file.name.startsWith('.') && (file.type.startsWith('image/') || file.type === 'application/pdf')
    );
    if (validFiles.length === 0) return { addedCount: 0, duplicateCount: 0 };

    let driveIndex = new Map();
    if (currentMode === 'inkoop' && accessToken) {
        try {
            driveIndex = await getDriveMd5Index(DRIVE_FOLDER_ID);
        } catch (err) {
            console.warn('Kon Drive MD5-index niet ophalen voor lokale check:', err);
        }
    }

    let addedCount = 0;
    let duplicateCount = 0;

    for (const file of validFiles) {
        const md5 = await computeFileMd5(file);
        const driveMatch = currentMode === 'inkoop' ? findDriveMd5Match(md5, driveIndex) : null;
        const queueMatch = findQueueMd5Match(md5, batchQueue);

        if (driveMatch) {
            batchQueue.push(createSkippedMd5Item({
                file,
                md5,
                reason: `Exact duplicaat van '${driveMatch.name}' in Google Drive`
            }));
            duplicateCount++;
        } else if (queueMatch) {
            batchQueue.push(createSkippedMd5Item({
                file,
                md5,
                reason: `Exact duplicaat van '${queueMatch.file?.name || 'eerder bestand'}' in wachtrij`
            }));
            duplicateCount++;
        } else {
            batchQueue.push({
                id: Date.now() + Math.random(),
                file,
                md5,
                status: 'pending',
                data: null,
                selected: true
            });
            addedCount++;
        }
    }

    return { addedCount, duplicateCount };
}

/**
 * Moves a Drive-backed duplicate item directly to Google Drive Trash (no confirmation popup).
 */
export async function trashDriveItemFromQueue(itemId, batchQueue, renderBatchTable) {
    const item = batchQueue.find(i => String(i.id) === String(itemId));
    if (!item || !item.driveFileId) return;

    await trashDriveFile(item.driveFileId);
    clearDriveMd5IndexCache();

    const curIdx = batchQueue.findIndex(i => String(i.id) === String(itemId));
    if (curIdx !== -1) batchQueue.splice(curIdx, 1);
    renderBatchTable();
}

/**
 * Overrides a skipped MD5 duplicate row so it gets downloaded (if needed) and sent through Gemini AI.
 */
export async function forceRescanSkippedItem(itemId, batchQueue, renderBatchTable, processQueue) {
    const item = batchQueue.find(i => String(i.id) === String(itemId));
    if (!item) return;

    if (item.driveFileId && !(item.file instanceof Blob)) {
        item.file = await downloadDriveFileAsBlob(item.driveFileId, item.file.name, item.file.type);
    }

    item.status = 'pending';
    item.isDuplicate = false;
    item.isMd5Duplicate = false;
    item.duplicateReason = '';
    item.selected = true;
    item.forceScan = true;

    renderBatchTable();
    processQueue();
}

/**
 * Handles delegated click events for trash, rescan, and queue-delete buttons on the scanner table.
 */
export async function handleBatchTableClick(e, batchQueue, renderBatchTable, processQueue) {
    const trashBtn = e.target.closest('.trash-drive-btn');
    if (trashBtn) {
        const itemId = trashBtn.getAttribute('data-item-id');
        trashBtn.disabled = true;
        try {
            await trashDriveItemFromQueue(itemId, batchQueue, renderBatchTable);
        } catch (err) {
            trashBtn.disabled = false;
            alert(`Kon bestand niet naar Prullenbak verplaatsen: ${err.message}`);
        }
        return;
    }

    const rescanBtn = e.target.closest('.rescan-item-btn');
    if (rescanBtn) {
        const itemId = rescanBtn.getAttribute('data-item-id');
        rescanBtn.disabled = true;
        try {
            await forceRescanSkippedItem(itemId, batchQueue, renderBatchTable, processQueue);
        } catch (err) {
            rescanBtn.disabled = false;
            alert(`Kon bestand niet opnieuw laden voor scan: ${err.message}`);
        }
        return;
    }

    const deleteBtn = e.target.closest('.delete-item-btn');
    if (!deleteBtn) return;
    const indexToDelete = parseInt(deleteBtn.getAttribute('data-index'), 10);
    if (isNaN(indexToDelete)) return;
    batchQueue.splice(indexToDelete, 1);
    renderBatchTable();
}

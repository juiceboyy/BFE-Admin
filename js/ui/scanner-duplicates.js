/**
 * js/ui/scanner-duplicates.js
 * Scanner MD5 pre-check helpers, direct Drive Trash action, and override rescan.
 */
import { accessToken } from '../api/auth.js';
import { DRIVE_FOLDER_ID, downloadDriveFileAsBlob, isProcessedReceiptName, listAllReceiptFiles, trashDriveFile } from '../api/storage-drive.js';
import { computeFileMd5 } from '../utils/md5.js';
import { clearDriveMd5IndexCache, findDriveMd5Match, getDriveMd5Index, groupDriveDuplicatesByMd5, seedDriveMd5IndexCache, trashDriveFilesBatch } from '../utils/drive-duplicates.js';

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
    const driveDuplicates = groupDriveDuplicatesByMd5(allFiles);
    const unprocessed = allFiles.filter(f => !isProcessedReceiptName(f.name));

    if (unprocessed.length === 0) {
        return { unprocessedCount: 0, addedCount: 0, duplicateCount: 0, driveDuplicates };
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

    return { unprocessedCount: unprocessed.length, addedCount, duplicateCount, driveDuplicates };
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
export async function trashAllDriveDuplicatesInQueue(batchQueue, renderBatchTable) {
    const ids = batchQueue.filter(i => i.isDuplicate && i.driveFileId).map(i => i.driveFileId);
    if (ids.length === 0) return { trashedCount: 0, errorCount: 0 };

    const res = await trashDriveFilesBatch(ids);
    const trashedSet = new Set(res.trashedIds);
    for (let i = batchQueue.length - 1; i >= 0; i--) {
        if (batchQueue[i].driveFileId && trashedSet.has(batchQueue[i].driveFileId)) {
            batchQueue.splice(i, 1);
        }
    }
    renderBatchTable();
    return { trashedCount: res.trashedIds.length, errorCount: res.errors.length };
}

export function updateDuplicateBanner(batchQueue, driveDuplicates, { onTrashAll, onOpenDriveModal } = {}) {
    const banner = document.getElementById('scanner-duplicate-banner');
    if (!banner) return;

    const queueDups = batchQueue.filter(i => i.isDuplicate);
    const queueDriveDups = queueDups.filter(i => Boolean(i.driveFileId));
    const driveGroups = driveDuplicates?.duplicateGroupCount || 0;
    const driveCopies = driveDuplicates?.redundantFileCount || 0;

    if (queueDups.length === 0 && driveGroups === 0) {
        banner.classList.add('hidden');
        banner.innerHTML = '';
        return;
    }

    const parts = [];
    if (queueDups.length > 0) parts.push(`${queueDups.length} duplicaat${queueDups.length === 1 ? '' : 'en'} in wachtrij overgeslagen/gemarkeerd`);
    if (driveGroups > 0) parts.push(`${driveGroups} duplicaatgroep${driveGroups === 1 ? '' : 'en'} (${driveCopies} extra kopieen) in Drive-map`);

    banner.classList.remove('hidden');
    banner.innerHTML = `
        <div class="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
            <div class="flex items-center gap-2 font-medium">
                <i data-lucide="alert-triangle" class="w-4 h-4 text-amber-600 shrink-0"></i>
                <span>Automatische duplicaatcheck: ${parts.join(' - ')}.</span>
            </div>
            <div class="flex items-center gap-2">
                ${driveGroups > 0 ? `<button type="button" id="btn-open-drive-dups" class="px-3 py-1.5 bg-white hover:bg-amber-100 border border-amber-300 text-amber-900 rounded-lg font-medium transition-colors">Bekijk Drive-duplicaten</button>` : ''}
                ${queueDriveDups.length > 0 ? `<button type="button" id="btn-trash-all-queue-dups" class="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors flex items-center gap-1.5"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i> Verplaats ${queueDriveDups.length} naar Prullenbak</button>` : ''}
            </div>
        </div>`;

    document.getElementById('btn-open-drive-dups')?.addEventListener('click', () => onOpenDriveModal?.());
    document.getElementById('btn-trash-all-queue-dups')?.addEventListener('click', () => onTrashAll?.());
    if (window.lucide) window.lucide.createIcons();
}

export async function handleBatchTableClick(e, batchQueue, renderBatchTable, processQueue, onDriveMutated = null) {
    const trashBtn = e.target.closest('.trash-drive-btn');
    if (trashBtn) {
        const itemId = trashBtn.getAttribute('data-item-id');
        trashBtn.disabled = true;
        try {
            await trashDriveItemFromQueue(itemId, batchQueue, renderBatchTable);
            onDriveMutated?.();
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

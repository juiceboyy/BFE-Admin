/**
 * js/ui/duplicates-modal.js
 * UI controller for the on-demand Google Drive MD5 duplicate checker modal.
 */
import { scanDriveDuplicates, trashDriveFilesBatch } from '../utils/drive-duplicates.js';

let _scanResult = null;
let _isScanning = false;
let _isTrashing = false;

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatBytes(bytes) {
    const val = Number(bytes) || 0;
    if (val < 1024) return `${val} B`;
    if (val < 1024 * 1024) return `${(val / 1024).toFixed(1)} KB`;
    return `${(val / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDateNL(isoStr) {
    if (!isoStr) return '-';
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('nl-NL', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function initDuplicatesModal() {
    const modal = document.getElementById('duplicates-modal');
    if (!modal) return;

    document.getElementById('btn-check-duplicates')?.addEventListener('click', openDuplicatesModal);
    document.querySelectorAll('.close-duplicates-modal').forEach(btn => {
        btn.addEventListener('click', closeDuplicatesModal);
    });
    document.getElementById('btn-rescan-duplicates')?.addEventListener('click', runDuplicateScan);
    document.getElementById('btn-trash-duplicates')?.addEventListener('click', handleTrashSelected);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeDuplicatesModal();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
            closeDuplicatesModal();
        }
    });
}

export function openDuplicatesModal() {
    const modal = document.getElementById('duplicates-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    runDuplicateScan();
}

export function closeDuplicatesModal() {
    const modal = document.getElementById('duplicates-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

async function runDuplicateScan() {
    if (_isScanning || _isTrashing) return;
    _isScanning = true;
    _scanResult = null;
    setToolbarLoading(true);
    renderLoadingState('Bonnetjes-map ophalen uit Google Drive...');
    updateFooterButton();

    try {
        _scanResult = await scanDriveDuplicates();
        renderScanResults();
    } catch (err) {
        console.error('Fout bij controleren duplicaten:', err);
        renderErrorState(err.message || 'Kon Google Drive bestanden niet controleren.');
    } finally {
        _isScanning = false;
        setToolbarLoading(false);
        updateFooterButton();
    }
}

function setToolbarLoading(loading) {
    const rescanBtn = document.getElementById('btn-rescan-duplicates');
    if (!rescanBtn) return;
    rescanBtn.disabled = loading;
    rescanBtn.innerHTML = loading
        ? '<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i> Controleren...'
        : '<i data-lucide="rotate-cw" class="w-3.5 h-3.5"></i> Opnieuw scannen';
    if (window.lucide) window.lucide.createIcons();
}

function renderLoadingState(message) {
    const body = document.getElementById('duplicates-modal-body');
    const summary = document.getElementById('duplicates-summary-text');
    if (summary) summary.innerText = 'Bezig met scannen...';
    if (!body) return;
    body.innerHTML = `
        <div class="py-12 flex flex-col items-center justify-center text-gray-500 text-sm gap-3">
            <i data-lucide="loader-2" class="w-6 h-6 animate-spin text-gray-400"></i>
            <span>${escapeHtml(message)}</span>
        </div>`;
    if (window.lucide) window.lucide.createIcons();
}

function renderErrorState(message) {
    const body = document.getElementById('duplicates-modal-body');
    const summary = document.getElementById('duplicates-summary-text');
    if (summary) summary.innerText = 'Scan mislukt';
    if (!body) return;
    body.innerHTML = `
        <div class="p-6 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm flex items-start gap-3">
            <i data-lucide="alert-circle" class="w-5 h-5 text-red-600 shrink-0 mt-0.5"></i>
            <div>
                <div class="font-medium">Kon duplicaten niet ophalen</div>
                <div class="text-xs text-red-700 mt-1">${escapeHtml(message)}</div>
            </div>
        </div>`;
    if (window.lucide) window.lucide.createIcons();
}

function renderScanResults() {
    const body = document.getElementById('duplicates-modal-body');
    const summary = document.getElementById('duplicates-summary-text');
    if (!body || !_scanResult) return;

    const { totalFiles, duplicateGroupCount, redundantFileCount, reclaimableBytes, groups } = _scanResult;
    if (summary) {
        summary.innerText = duplicateGroupCount === 0
            ? `${totalFiles} bestanden gescand - geen duplicaten gevonden`
            : `${totalFiles} bestanden gescand - ${duplicateGroupCount} duplicaatgroepen (${redundantFileCount} dubbele kopieen, ${formatBytes(reclaimableBytes)})`;
    }

    if (groups.length === 0) {
        body.innerHTML = `
            <div class="py-12 flex flex-col items-center justify-center text-center text-gray-500 gap-2">
                <div class="p-3 bg-emerald-50 text-emerald-600 rounded-full">
                    <i data-lucide="check-circle-2" class="w-6 h-6"></i>
                </div>
                <div class="text-sm font-medium text-gray-900">Geen dubbele bestanden gevonden in de Bonnetjes-map.</div>
                <div class="text-xs text-gray-500">Alle ${totalFiles} bestanden hebben een unieke MD5-inhoud.</div>
            </div>`;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    body.innerHTML = groups.map((group, groupIdx) => renderGroupCard(group, groupIdx)).join('');
    bindGroupCheckboxes(body);
    if (window.lucide) window.lucide.createIcons();
}

function renderGroupCard(group, groupIdx) {
    const allChecked = group.files.every(f => f.selectedForTrash);
    const multiWarning = group.hasMultipleProcessed
        ? `<div class="px-4 py-2 bg-amber-50 border-b border-amber-200 text-xs text-amber-900 flex items-center gap-2">
                <i data-lucide="alert-triangle" class="w-4 h-4 text-amber-600 shrink-0"></i>
                <span>Meerdere bestanden in deze groep hebben al een factuurnummer. Controleer Google Sheets voordat je er een verwijdert.</span>
           </div>`
        : '';

    const allCheckedWarning = allChecked
        ? `<div class="group-all-checked-warning px-4 py-2 bg-red-50 border-b border-red-200 text-xs text-red-800 flex items-center gap-2">
                <i data-lucide="alert-circle" class="w-4 h-4 text-red-600 shrink-0"></i>
                <span>Let op: alle kopieen in deze groep zijn aangevinkt voor de Prullenbak.</span>
           </div>`
        : '';

    const rowsHtml = group.files.map((file, fileIdx) => {
        const statusLabel = file.isProcessed
            ? '<span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">Verwerkt</span>'
            : '<span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-700 border border-gray-200">Onverwerkt</span>';

        const keepLabel = file.keepRecommended
            ? '<span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200">Behouden</span>'
            : '';

        const linkHtml = file.webViewLink
            ? `<a href="${escapeHtml(file.webViewLink)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline shrink-0">
                    <i data-lucide="external-link" class="w-3 h-3"></i> Bekijken
               </a>`
            : '';

        return `
            <label class="flex items-center justify-between gap-4 px-4 py-2.5 hover:bg-gray-50 transition-colors cursor-pointer ${file.selectedForTrash ? 'bg-amber-50/40' : ''}">
                <div class="flex items-center gap-3 min-w-0 flex-1">
                    <input type="checkbox"
                        class="dup-file-checkbox w-4 h-4 rounded border-gray-300 text-black focus:ring-black cursor-pointer shrink-0"
                        data-group-idx="${groupIdx}"
                        data-file-idx="${fileIdx}"
                        ${file.selectedForTrash ? 'checked' : ''}>
                    <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-2 min-w-0">
                            <span class="text-xs font-medium text-gray-900 truncate" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
                            ${linkHtml}
                        </div>
                        <div class="text-[11px] text-gray-500 mt-0.5">
                            Geupload: ${formatDateNL(file.createdTime)} &bull; ${formatBytes(file.sizeBytes)}
                        </div>
                    </div>
                </div>
                <div class="flex items-center gap-1.5 shrink-0">
                    ${keepLabel}
                    ${statusLabel}
                </div>
            </label>`;
    }).join('');

    return `
        <div class="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm" data-dup-group="${groupIdx}">
            <div class="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between text-xs">
                <span class="font-semibold text-gray-800">${group.files.length} identieke bestanden (${formatBytes(group.fileSizeBytes)} per stuk)</span>
                <span class="font-mono text-[11px] text-gray-400">MD5 ${escapeHtml(group.md5.slice(0, 10))}...</span>
            </div>
            ${multiWarning}
            ${allCheckedWarning}
            <div class="divide-y divide-gray-100">
                ${rowsHtml}
            </div>
        </div>`;
}

function bindGroupCheckboxes(container) {
    container.querySelectorAll('.dup-file-checkbox').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const gIdx = parseInt(e.target.getAttribute('data-group-idx'), 10);
            const fIdx = parseInt(e.target.getAttribute('data-file-idx'), 10);
            const group = _scanResult?.groups?.[gIdx];
            const file = group?.files?.[fIdx];
            if (!group || !file) return;

            file.selectedForTrash = e.target.checked;
            const rowLabel = e.target.closest('label');
            if (rowLabel) rowLabel.classList.toggle('bg-amber-50/40', file.selectedForTrash);

            renderScanResults();
            updateFooterButton();
        });
    });
}

function getSelectedFileIds() {
    if (!_scanResult || !_scanResult.groups) return [];
    const ids = [];
    for (const group of _scanResult.groups) {
        for (const file of group.files) {
            if (file.selectedForTrash && file.id) ids.push(file.id);
        }
    }
    return ids;
}

function updateFooterButton() {
    const btn = document.getElementById('btn-trash-duplicates');
    if (!btn) return;
    const count = getSelectedFileIds().length;
    btn.disabled = _isScanning || _isTrashing || count === 0;
    btn.innerHTML = _isTrashing
        ? '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Bezig met verplaatsen...'
        : `<i data-lucide="trash-2" class="w-4 h-4"></i> Verplaats ${count} naar Prullenbak`;
    if (window.lucide) window.lucide.createIcons();
}

async function handleTrashSelected() {
    const selectedIds = getSelectedFileIds();
    if (selectedIds.length === 0 || _isTrashing) return;

    _isTrashing = true;
    updateFooterButton();

    try {
        const res = await trashDriveFilesBatch(selectedIds, ({ current, total }) => {
            const summary = document.getElementById('duplicates-summary-text');
            if (summary) summary.innerText = `Verplaatsen naar Prullenbak (${current}/${total})...`;
        });

        if (res.errors.length > 0) {
            alert(`${res.trashedIds.length} bestanden naar de Prullenbak verplaatst, ${res.errors.length} mislukt.`);
        }
        _isTrashing = false;
        await runDuplicateScan();
    } catch (err) {
        console.error('Fout bij verplaatsen duplicaten:', err);
        alert(`Er ging iets mis: ${err.message}`);
        _isTrashing = false;
        updateFooterButton();
    }
}

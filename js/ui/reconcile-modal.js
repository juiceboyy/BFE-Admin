import { runAiAuditAndReconciliation, executeReconcileRenames } from '../utils/ai-reconciler.js';
import { clearSheetCaches } from '../api/storage.js';
import { invalidateDashboardCache } from './dashboard.js';

let _reconcileData = [];
let _activeFilter = 'all'; // 'all' | 'groen' | 'oranje' | 'rood'
let _isScanning = false;
let _cancelScan = false;

export function initReconcileModal() {
    const modal = document.getElementById('reconcile-modal');
    if (!modal) return;

    // Sluitknoppen
    document.querySelectorAll('.close-reconcile-modal').forEach(btn => {
        btn.addEventListener('click', closeReconcileModal);
    });

    // Start & Stop knoppen
    document.getElementById('btn-start-reconcile-scan')?.addEventListener('click', startAuditScan);
    document.getElementById('btn-stop-reconcile-scan')?.addEventListener('click', () => {
        _cancelScan = true;
        const text = document.getElementById('reconcile-progress-text');
        if (text) text.innerText = 'Scannen wordt gestopt...';
    });

    // Filterknoppen
    document.querySelectorAll('.reconcile-filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const filter = e.currentTarget.getAttribute('data-filter');
            setFilter(filter);
        });
    });

    // Selecteer alles checkbox
    document.getElementById('reconcile-select-all')?.addEventListener('change', (e) => {
        const checked = e.target.checked;
        const filtered = getFilteredData();
        filtered.forEach(item => {
            item.selected = checked;
        });
        renderTableRows();
        updateActionButtons();
    });

    // Uitvoer knop
    document.getElementById('btn-execute-reconcile')?.addEventListener('click', handleExecuteRenames);
}

export function openReconcileModal() {
    const modal = document.getElementById('reconcile-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.classList.add('flex');

    if (_reconcileData.length === 0 && !_isScanning) {
        startAuditScan();
    } else {
        renderTable();
    }
}
window.openReconcileModal = openReconcileModal;

export function closeReconcileModal() {
    const modal = document.getElementById('reconcile-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

async function startAuditScan() {
    if (_isScanning) return;
    _isScanning = true;
    _cancelScan = false;
    _reconcileData = [];

    const liveBar = document.getElementById('reconcile-live-bar');
    const progressBar = document.getElementById('reconcile-progress-bar');
    const progressText = document.getElementById('reconcile-progress-text');

    if (liveBar) liveBar.classList.remove('hidden');
    if (liveBar) liveBar.classList.add('flex');
    renderTable();

    try {
        await runAiAuditAndReconciliation(
            2026,
            (evt) => {
                if (evt.type === 'start_file') {
                    if (progressText) progressText.innerText = `Scannen document ${evt.current} van ${evt.total}: ${evt.fileName}`;
                    if (progressBar) progressBar.style.width = `${Math.round((evt.current / evt.total) * 100)}%`;
                } else if (evt.type === 'file_matched') {
                    _reconcileData.push(evt.item);
                    renderTable();
                }
            },
            () => _cancelScan
        );

        if (progressText) {
            progressText.innerText = _cancelScan 
                ? `Scannen onderbroken (${_reconcileData.length} documenten verwerkt)`
                : `Scannen voltooid! ${_reconcileData.length} documenten geanalyseerd.`;
        }
        if (progressBar) progressBar.style.width = '100%';

    } catch (err) {
        console.error("Reconciliatie scan fout:", err);
        alert(`Er ging iets mis tijdens de AI scan: ${err.message}`);
    } finally {
        _isScanning = false;
        setTimeout(() => {
            if (!_isScanning && liveBar) {
                liveBar.classList.add('hidden');
                liveBar.classList.remove('flex');
            }
        }, 4000);
    }
}

function setFilter(filter) {
    _activeFilter = filter;
    document.querySelectorAll('.reconcile-filter-btn').forEach(btn => {
        const isActive = btn.getAttribute('data-filter') === filter;
        btn.className = `reconcile-filter-btn px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            isActive ? 'bg-black text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
        }`;
    });
    renderTableRows();
}

function getFilteredData() {
    if (_activeFilter === 'all') return _reconcileData;
    return _reconcileData.filter(item => item.tier === _activeFilter);
}

function renderTable() {
    const countAll = _reconcileData.length;
    const countGroen = _reconcileData.filter(i => i.tier === 'groen').length;
    const countOranje = _reconcileData.filter(i => i.tier === 'oranje').length;
    const countRood = _reconcileData.filter(i => i.tier === 'rood').length;

    const setText = (id, txt) => { const el = document.getElementById(id); if (el) el.innerText = txt; };
    setText('count-filter-all', `(${countAll})`);
    setText('count-filter-groen', `(${countGroen})`);
    setText('count-filter-oranje', `(${countOranje})`);
    setText('count-filter-rood', `(${countRood})`);

    renderTableRows();
    updateActionButtons();
}

function renderTableRows() {
    const tbody = document.getElementById('reconcile-table-body');
    if (!tbody) return;

    const filtered = getFilteredData();

    if (filtered.length === 0) {
        const msg = _isScanning ? 'Eerste documenten worden geanalyseerd...' : 'Geen documenten in deze categorie.';
        tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-8 text-center text-sm text-gray-500">${msg}</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map((item) => {
        const badge = getTierBadge(item.tier);
        const matchInfo = item.matchedRecord 
            ? `<div class="font-medium text-gray-900">${item.matchedRecord.sheet}: Factuur ${item.matchedRecord.factuurnummer}</div><div class="text-xs text-gray-500">€ ${item.matchedRecord.amount.toFixed(2)} (${item.matchedRecord.datum})</div>`
            : `<span class="text-xs text-red-500 font-medium">Geen boeking gevonden</span>`;

        const formatEur = (val) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(val || 0);

        return `
            <tr class="border-b hover:bg-gray-50 text-xs transition-colors ${item.selected ? 'bg-blue-50/20' : ''}">
                <td class="px-3 py-3 text-center">
                    <input type="checkbox" class="reconcile-row-select w-4 h-4 rounded border-gray-300 text-black focus:ring-black cursor-pointer"
                        data-file-id="${item.fileId}" ${item.selected ? 'checked' : ''}>
                </td>
                <td class="px-3 py-3 font-medium text-gray-900 max-w-[180px] truncate" title="${item.currentName}">
                    ${item.currentName}
                </td>
                <td class="px-3 py-3">
                    <div class="font-medium text-gray-800">${item.aiData.vendor || '-'}</div>
                    <div class="text-gray-500">${item.aiData.date || 'Geen datum'} &bull; ${formatEur(item.aiData.amount)}</div>
                </td>
                <td class="px-3 py-3">
                    ${matchInfo}
                </td>
                <td class="px-3 py-3 font-mono text-[11px] text-gray-700 max-w-[200px] truncate" title="${item.proposedName}">
                    ${item.proposedName}
                </td>
                <td class="px-3 py-3 text-center whitespace-nowrap">
                    ${badge}
                </td>
            </tr>
        `;
    }).join('');

    // Bind checkbox listeners
    tbody.querySelectorAll('.reconcile-row-select').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const fileId = e.target.getAttribute('data-file-id');
            const item = _reconcileData.find(i => i.fileId === fileId);
            if (item) {
                item.selected = e.target.checked;
                updateActionButtons();
            }
        });
    });

    if (window.lucide) window.lucide.createIcons();
}

function getTierBadge(tier) {
    switch (tier) {
        case 'groen':
            return '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-300">Exact Match</span>';
        case 'oranje':
            return '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-900 border border-amber-300">Aandacht</span>';
        case 'rood':
        default:
            return '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 border border-red-200">Onzeker</span>';
    }
}

function updateActionButtons() {
    const selectedCount = _reconcileData.filter(i => i.selected && i.matchedRecord).length;
    const btnExecute = document.getElementById('btn-execute-reconcile');
    if (btnExecute) {
        btnExecute.disabled = selectedCount === 0;
        btnExecute.innerHTML = `<i data-lucide="check-check" class="w-4 h-4"></i> Hernoem ${selectedCount} Geselecteerde Bestanden`;
        if (window.lucide) window.lucide.createIcons();
    }
}

async function handleExecuteRenames() {
    const selected = _reconcileData.filter(i => i.selected && i.matchedRecord);
    if (selected.length === 0) return;

    if (!confirm(`Weet je zeker dat je ${selected.length} bestanden in Google Drive wilt hernoemen naar de gekoppelde factuurnummers?`)) {
        return;
    }

    const btn = document.getElementById('btn-execute-reconcile');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Bezig met hernoemen...';
        if (window.lucide) window.lucide.createIcons();
    }

    try {
        const res = await executeReconcileRenames(selected);
        clearSheetCaches();
        invalidateDashboardCache();

        alert(`Succesvol ${res.renamedCount} bestanden in Google Drive hernoemd!`);
        closeReconcileModal();
    } catch (err) {
        console.error("Fout bij hernoemen:", err);
        alert(`Er ging iets mis tijdens het hernoemen: ${err.message}`);
    } finally {
        if (btn) {
            btn.disabled = false;
            updateActionButtons();
        }
    }
}

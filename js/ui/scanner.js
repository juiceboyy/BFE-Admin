import { analyzeReceipt } from '../api/gemini.js';
import { loadCloudMemory, clearQueryCaches } from '../api/storage-queries-invoices.js';
import { getMonthlyTotals } from '../api/storage-queries-fiscal.js';
import { getTargetDateInfo, isDateValidForPeriod } from '../utils/date.js';
import { fetchDailyExchangeRate } from '../utils/currency.js';
import { getBatchRowHTML } from './scanner-row.js';
import { prepareItemData } from './scanner-helpers.js';
import { updateDashboard, invalidateDashboardCache, updateRealBtwBalans } from './dashboard.js';
import { scanUnprocessedReceipts, downloadDriveFileAsBlob, DRIVE_FOLDER_ID, clearSheetCaches } from '../api/storage.js';
import { checkForDuplicate, clearDuplicateCheckerCache } from '../utils/duplicate-checker.js';
import { saveBatchItem as executeSaveBatchItem, saveAllBatchItems } from './scanner-save.js';
import { setupPeriodSelector } from './scanner-period.js';

let batchQueue = [];
let isProcessingQueue = false;
let currentMode = 'inkoop';

// --- Initialization ---

export function initScanner() {
    const bindEvent = (id, evt, cb) => document.getElementById(id)?.addEventListener(evt, cb);
    bindEvent('receipt-upload', 'change', (e) => handleFiles(e.target.files));
    bindEvent('folder-upload', 'change', (e) => handleFiles(e.target.files));
    bindEvent('btn-scan-drive', 'click', handleScanDriveFolder);
    bindEvent('mode-inkoop', 'click', () => setMode('inkoop'));
    bindEvent('mode-verkoop', 'click', () => setMode('verkoop'));
    bindEvent('btn-refresh-dashboard', 'click', () => { invalidateDashboardCache(); setMode(currentMode); });

    const tbody = document.getElementById('batch-table-body');

    tbody?.addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('.delete-item-btn');
        if (!deleteBtn) return;
        const indexToDelete = parseInt(deleteBtn.getAttribute('data-index'), 10);
        if (isNaN(indexToDelete)) return;
        batchQueue.splice(indexToDelete, 1);
        renderBatchTable();
    });

    tbody?.addEventListener('change', async (e) => {
        const checkbox = e.target.closest('.queue-item-select');
        if (checkbox) {
            const itemId = parseFloat(checkbox.getAttribute('data-item-id'));
            const item = batchQueue.find(i => i.id === itemId);
            if (!item) return;
            item.selected = checkbox.checked;
            const row = document.getElementById(`batch-row-${itemId}`);
            if (row) row.classList.toggle('opacity-40', !item.selected);
            const saveBtn = document.getElementById(`btn-save-${itemId}`);
            if (saveBtn && item.status === 'success') saveBtn.disabled = !item.selected;
            return;
        }

        // Automatische wisselkoers herberekening bij datumwijziging
        if (e.target && e.target.id && e.target.id.startsWith('datum-')) {
            const itemId = parseFloat(e.target.id.replace('datum-', ''));
            const item = batchQueue.find(i => i.id === itemId);
            if (item && item.data && item.data.omgerekend && item.data.origineelBedrag) {
                const newDate = e.target.value;
                if (/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
                    const currency = item.data.origineelValuta || 'USD';
                    const rateInfo = await fetchDailyExchangeRate(currency, newDate);
                    if (rateInfo && rateInfo.rate) {
                        const newBedrag = Math.round(item.data.origineelBedrag * rateInfo.rate * 100) / 100;
                        item.data.factuurBedrag = newBedrag;
                        item.data.wisselkoers = rateInfo.rate;
                        item.data.koersDatum = rateInfo.date;
                        item.data.datum = newDate;

                        const bedragInput = document.getElementById(`factuurbedrag-${itemId}`);
                        if (bedragInput) bedragInput.value = newBedrag.toFixed(2);

                        const currencyInfo = document.getElementById(`currency-info-${itemId}`);
                        if (currencyInfo) {
                            const symbol = currency === 'USD' ? '$' : currency;
                            currencyInfo.innerText = `${symbol} ${Number(item.data.origineelBedrag).toFixed(2)} (@ ${rateInfo.rate})`;
                            currencyInfo.title = `Omgerekend van ${currency} ${Number(item.data.origineelBedrag).toFixed(2)} met dagkoers €${rateInfo.rate} op ${rateInfo.date}`;
                        }
                    }
                }
            }
        }
    });

    setupPeriodSelector(() => {
        clearSheetCaches();
        clearQueryCaches();
        clearDuplicateCheckerCache();
        invalidateDashboardCache();
        setMode(currentMode);
    });
}

// --- Event Handlers ---

async function handleScanDriveFolder() {
    const btn = document.getElementById('btn-scan-drive');
    const setLoading = (loading) => {
        if (!btn) return;
        btn.disabled = loading;
        btn.innerHTML = loading
            ? '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Bezig met scannen...'
            : '<i data-lucide="folder-search" class="w-4 h-4"></i> Scan Bonnetjes Map';
        if (window.lucide) window.lucide.createIcons();
    };

    setLoading(true);
    try {
        const unprocessed = await scanUnprocessedReceipts(DRIVE_FOLDER_ID);

        if (unprocessed.length === 0) {
            alert('Geen nieuwe bonnen gevonden.');
            return;
        }

        for (const driveFile of unprocessed) {
            try {
                const file = await downloadDriveFileAsBlob(driveFile.id, driveFile.name, driveFile.mimeType);
                batchQueue.push({ id: Date.now() + Math.random(), file, status: 'pending', data: null, driveFileId: driveFile.id, selected: true });
            } catch (err) {
                console.error(`Fout bij downloaden ${driveFile.name}:`, err);
            }
        }

        renderBatchTable();
        processQueue();
    } catch (error) {
        console.error('Fout bij scannen Drive map:', error);
        alert(`Er ging iets mis: ${error.message}`);
    } finally {
        setLoading(false);
    }
}

function handleFiles(files) {
    if (!files || !files.length) return;

    Array.from(files).forEach(file => {
        if (!file.name.startsWith('.') && (file.type.startsWith('image/') || file.type === 'application/pdf')) {
            batchQueue.push({ id: Date.now() + Math.random(), file, status: 'pending', data: null, selected: true });
        }
    });

    ['receipt-upload', 'folder-upload'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    renderBatchTable();
    processQueue();
}

async function setMode(mode) {
    currentMode = mode;
    const isVerkoop = mode === 'verkoop';
    
    ['inkoop', 'verkoop'].forEach(m => {
        const btn = document.getElementById(`mode-${m}`);
        if (btn) btn.className = `px-6 py-2 rounded-md text-sm font-medium transition-all ${mode === m ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`;
    });

    const setText = (id, txt) => { const el = document.getElementById(id); if (el) el.innerText = txt; };
    setText('th-leverancier', isVerkoop ? 'Klant' : 'Leverancier');
    setText('th-bedrag', isVerkoop ? 'Totaal (incl)' : 'Factuurbedrag');
    setText('dash-total-label', isVerkoop ? "Totaal Omzet (Huidige Maand)" : "Totaal Uitgaven");
    setText('dash-vat-label', isVerkoop ? "Af te dragen BTW" : "BTW Balans (Huidige Maand)");

    ['upload-zone-container', 'folder-upload-container', 'dash-count-card'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('hidden', isVerkoop);
    });

    renderBatchTable();
    updateDashboard(batchQueue, currentMode);

    if (isVerkoop) {
        const dashTotal = document.getElementById('dash-total');
        const dashVat = document.getElementById('dash-vat');
        if (dashTotal) dashTotal.innerText = 'Laden...';
        if (dashVat) dashVat.innerText = 'Laden...';

        const sheetName = getTargetDateInfo('verkoop').targetSheet;
        getMonthlyTotals(sheetName).then(totals => {
            const formatEur = (num) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(num || 0);
            if (dashTotal) dashTotal.innerText = formatEur(totals.totaalOmzet);
            if (dashVat) dashVat.innerText = formatEur(totals.totaalBtw);

            const vatCard = document.getElementById('dash-vat')?.parentElement;
            if (vatCard) vatCard.querySelector('span.text-xs').innerText = 'Af te dragen BTW';
        });
    } else {
        updateRealBtwBalans();
    }
}

// --- Core Logic ---

async function processQueue() {
    if (isProcessingQueue) return;
    isProcessingQueue = true;
    
    let item;
    while ((item = batchQueue.find(i => i.status === 'pending'))) {
        item.status = 'processing';
        renderBatchTable();
        
        try {
            const currentMemory = await loadCloudMemory();
            const aiData = await analyzeReceipt(item.file, currentMemory, currentMode);

            item.data = prepareItemData(currentMode, aiData, currentMemory);

            // Client-side valutaconversie fallback (als het niet reeds op de server is uitgevoerd)
            if (currentMode === 'inkoop' && item.data.valuta && item.data.valuta !== 'EUR' && !item.data.omgerekend) {
                const currency = (item.data.valuta.length === 3 && item.data.valuta !== 'EUR') ? item.data.valuta : 'USD';
                const rateInfo = await fetchDailyExchangeRate(currency, item.data.datum);
                if (rateInfo && rateInfo.rate) {
                    const origBedrag = parseFloat(item.data.factuurBedrag) || 0;
                    const origBtw = parseFloat(item.data.btwBedrag) || 0;
                    item.data.origineelValuta = currency;
                    item.data.origineelBedrag = origBedrag;
                    item.data.origineelBtwBedrag = origBtw;
                    item.data.wisselkoers = rateInfo.rate;
                    item.data.koersDatum = rateInfo.date;
                    item.data.omgerekend = true;
                    item.data.factuurBedrag = Math.round(origBedrag * rateInfo.rate * 100) / 100;
                    item.data.btwBedrag = Math.round(origBtw * rateInfo.rate * 100) / 100;
                    item.data.valuta = 'EUR';
                }
            }

            item.status = 'success';

            const dateInfo = getTargetDateInfo(currentMode);
            const isPeriodValid = !item.data.datum || isDateValidForPeriod(item.data.datum, dateInfo.targetYear, dateInfo.targetMonthNum);

            // Automatische duplicaat-detectie tegen wachtrij en Sheets
            const dupCheck = await checkForDuplicate(item, batchQueue, dateInfo.targetSheet);
            if (dupCheck.isDuplicate) {
                item.isDuplicate = true;
                item.duplicateReason = dupCheck.reason;
                item.selected = false; // Automatisch uitvinken bij duplicaat
            } else {
                item.selected = isPeriodValid;
            }
        } catch (err) {
            item.status = 'error';
            item.data = { error: err.message };
        }
        renderBatchTable();
    }
    isProcessingQueue = false;
}

export async function saveBatchItem(id) {
    const dateInfo = getTargetDateInfo(currentMode);
    await executeSaveBatchItem(id, batchQueue, currentMode, dateInfo, renderBatchTable);
}
window.saveBatchItem = saveBatchItem;

export async function saveAllSuccessItems() {
    const dateInfo = getTargetDateInfo(currentMode);
    await saveAllBatchItems(
        batchQueue, 
        currentMode, 
        dateInfo, 
        renderBatchTable, 
        () => { batchQueue = batchQueue.filter(i => i.selected !== false || i.status === 'saved'); }
    );
}
window.saveAllSuccessItems = saveAllSuccessItems;

// --- UI Rendering ---

function renderBatchTable() {
    const dashboard = document.getElementById('batch-dashboard');
    const tbody = document.getElementById('batch-table-body');
    if (!dashboard || !tbody) return;
    
    if (currentMode === 'verkoop') {
        dashboard.classList.add('hidden');
        return;
    }
        
    dashboard.classList.toggle('hidden', batchQueue.length === 0);

    let footer = document.getElementById('batch-footer');
    if (!footer && batchQueue.length > 0) {
        footer = document.createElement('div');
        footer.id = 'batch-footer';
        footer.className = 'px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end';
        footer.innerHTML = `<button id="save-all-btn" onclick="saveAllSuccessItems()" class="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-md hover:bg-emerald-700 shadow-sm transition-colors flex items-center gap-2"><i data-lucide="save-all" class="w-4 h-4"></i> Alles Opslaan</button>`;
        dashboard.appendChild(footer);
    }

    const dateInfo = getTargetDateInfo(currentMode);
    tbody.innerHTML = batchQueue.map((item, index) => getBatchRowHTML(item, dateInfo, currentMode, index)).join('');
    if (window.lucide) window.lucide.createIcons();
    updateDashboard(batchQueue, currentMode);
}
import { analyzeReceipt } from '../api/gemini.js';
import { loadCloudMemory, clearQueryCaches } from '../api/storage-queries-invoices.js';
import { getMonthlyTotals } from '../api/storage-queries-fiscal.js';
import { getTargetDateInfo, isDateValidForPeriod } from '../utils/date.js';
import { fetchDailyExchangeRate, normalizeCurrency } from '../utils/currency.js';
import { getBatchRowHTML } from './scanner-row.js';
import { prepareItemData, recalculateCurrencyOnDateChange } from './scanner-helpers.js';
import { updateDashboard, invalidateDashboardCache, updateRealBtwBalans } from './dashboard.js';
import { clearSheetCaches } from '../api/storage.js';
import { checkForDuplicate, clearDuplicateCheckerCache } from '../utils/duplicate-checker.js';
import { clearDriveMd5IndexCache } from '../utils/drive-duplicates.js';
import {
    enqueueDriveReceiptsWithMd5Check,
    enqueueLocalFilesWithMd5Check,
    handleBatchTableClick,
    trashAllDriveDuplicatesInQueue,
    updateDuplicateBanner
} from './scanner-duplicates.js';
import { openDuplicatesModal } from './duplicates-modal.js';
import { saveBatchItem as executeSaveBatchItem, saveAllBatchItems } from './scanner-save.js';
import { setupPeriodSelector } from './scanner-period.js';

let batchQueue = [];
let isProcessingQueue = false;
let currentMode = 'inkoop';
let lastDriveDuplicates = null;

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

    tbody?.addEventListener('click', (e) => handleBatchTableClick(
        e,
        batchQueue,
        renderBatchTable,
        processQueue,
        () => { lastDriveDuplicates = null; updateDuplicateBanner(batchQueue, lastDriveDuplicates, getBannerHandlers()); }
    ));

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
        if (e.target?.id?.startsWith('datum-')) {
            const itemId = parseFloat(e.target.id.replace('datum-', ''));
            const item = batchQueue.find(i => i.id === itemId);
            await recalculateCurrencyOnDateChange(item, itemId, e.target.value);
        }
    });

    setupPeriodSelector(() => {
        clearSheetCaches();
        clearQueryCaches();
        clearDuplicateCheckerCache();
        clearDriveMd5IndexCache();
        lastDriveDuplicates = null;
        invalidateDashboardCache();
        setMode(currentMode);
    });
}

function getBannerHandlers() {
    return {
        onTrashAll: async () => {
            const res = await trashAllDriveDuplicatesInQueue(batchQueue, renderBatchTable);
            lastDriveDuplicates = null;
            renderBatchTable();
            if (res.errorCount > 0) {
                alert(`${res.trashedCount} bestanden naar de Prullenbak verplaatst, ${res.errorCount} mislukt.`);
            }
        },
        onOpenDriveModal: () => openDuplicatesModal(lastDriveDuplicates)
    };
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
        const result = await enqueueDriveReceiptsWithMd5Check(batchQueue);
        lastDriveDuplicates = result.driveDuplicates || null;

        if (result.unprocessedCount === 0) {
            renderBatchTable();
            if (!(lastDriveDuplicates?.duplicateGroupCount > 0)) {
                alert('Geen nieuwe bonnen gevonden.');
            }
            return;
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

async function handleFiles(files) {
    if (!files || !files.length) return;

    await enqueueLocalFilesWithMd5Check(files, batchQueue, currentMode);

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
            if (currentMode === 'inkoop' && item.data.valuta && !item.data.omgerekend) {
                const currency = normalizeCurrency(item.data.valuta, `${item.data.factuurBedrag} ${item.data.omschrijving}`);
                if (currency !== 'EUR') {
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
        () => { batchQueue = batchQueue.filter(i => i.selected !== false || i.status === 'saved' || (i.isDuplicate && Boolean(i.driveFileId))); }
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
        document.getElementById('scanner-duplicate-banner')?.classList.add('hidden');
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
    updateDuplicateBanner(batchQueue, lastDriveDuplicates, getBannerHandlers());
}
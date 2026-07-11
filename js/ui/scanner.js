import { analyzeReceipt } from '../api/gemini.js';
import { loadCloudMemory, getNextInvoiceNumberFromCloud, clearQueryCaches } from '../api/storage-queries-invoices.js';
import { getMonthlyTotals } from '../api/storage-queries-fiscal.js';
import { getTargetDateInfo, isDateValidForPeriod, getGlobalTargetDate, setGlobalTargetDate } from '../utils/date.js';
import { getBatchRowHTML } from './scanner-row.js';
import { prepareItemData, getFormDataFromDOM, processItemSave } from './scanner-helpers.js';
import { updateDashboard, invalidateDashboardCache, updateRealBtwBalans } from './dashboard.js';
import { scanUnprocessedReceipts, downloadDriveFileAsBlob, DRIVE_FOLDER_ID, clearSheetCaches } from '../api/storage.js';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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

    tbody?.addEventListener('change', (e) => {
        const checkbox = e.target.closest('.queue-item-select');
        if (!checkbox) return;
        const itemId = parseFloat(checkbox.getAttribute('data-item-id'));
        const item = batchQueue.find(i => i.id === itemId);
        if (!item) return;
        item.selected = checkbox.checked;
        // Update row opacity and save button in-place to preserve any user edits in the other fields
        const row = document.getElementById(`batch-row-${itemId}`);
        if (row) row.classList.toggle('opacity-40', !item.selected);
        const saveBtn = document.getElementById(`btn-save-${itemId}`);
        if (saveBtn && item.status === 'success') saveBtn.disabled = !item.selected;
    });

    // --- Period Selector Setup ---
    // We zoeken de 2e knop in de header (voorheen "Nieuwe Btw-aangifte")
    const btnPeriod = document.querySelectorAll('header button')[1];
    if (btnPeriod) {
        const updateBtnText = () => {
            const d = getGlobalTargetDate();
            const monthYear = d.toLocaleString('nl-NL', { month: 'long', year: 'numeric' });
            // Hoofdletter voor de maand (bijv. "Februari 2026")
            const formattedDate = monthYear.charAt(0).toUpperCase() + monthYear.slice(1);
            
            btnPeriod.innerHTML = `<i data-lucide="calendar" class="w-4 h-4"></i> Periode: ${formattedDate}`;
            if (window.lucide) window.lucide.createIcons();
        };
        
        updateBtnText(); // Initialiseer direct op opstarten

        btnPeriod.addEventListener('click', () => {
            const currentD = getGlobalTargetDate();
            const currentStr = `${String(currentD.getMonth() + 1).padStart(2, '0')}-${currentD.getFullYear()}`;
            const userInput = prompt("Voor welke maand wil je de data bekijken/boeken? (Formaat: MM-YYYY)", currentStr);
            
            if (userInput) {
                const [month, year] = userInput.split('-');
                if (month && year) {
                    const newDate = new Date(year, parseInt(month) - 1, 1);
                    setGlobalTargetDate(newDate);
                    updateBtnText();
                    // Clear sheet caches so the new period's data is fetched fresh
                    clearSheetCaches();
                    clearQueryCaches();
                    invalidateDashboardCache();
                    setMode(currentMode);
                }
            }
        });
    }
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

            // Force the labels to change so there is no confusion
            const vatCard = document.getElementById('dash-vat')?.parentElement;
            if (vatCard) vatCard.querySelector('span.text-xs').innerText = 'Af te dragen BTW';
        });
    } else {
        // Voor inkoop, willen we ook de cloud data herladen.
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
            item.status = 'success';

            // Auto-deselect if the parsed date falls outside the active fiscal period
            const dateInfo = getTargetDateInfo(currentMode);
            item.selected = !item.data.datum || isDateValidForPeriod(item.data.datum, dateInfo.targetYear, dateInfo.targetMonthNum);
        } catch (err) {
            item.status = 'error';
            item.data = { error: err.message };
        }
        renderBatchTable();
    }
    isProcessingQueue = false;
}

export async function saveBatchItem(id) {
    const item = batchQueue.find(i => i.id === id);
    if (!item) return;

    const setBtnState = (loading, icon = 'save', isErr = false) => {
        const btn = document.getElementById(`btn-save-${id}`);
        if (!btn) return;
        btn.disabled = loading;
        btn.innerHTML = loading ? '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i>' : `<i data-lucide="${icon}" class="w-4 h-4"></i>`;
        btn.classList.toggle('text-red-500', isErr);
        if (window.lucide) window.lucide.createIcons();
    };

    // --- Amount validation (before spinner) ---
    // Vergoeding (excl. BTW) is always derived: factuurBedrag − btw.
    // If btw > factuurBedrag the implied vergoeding is negative, which is impossible.
    if (currentMode === 'inkoop') {
        const preCheck = getFormDataFromDOM(id);
        const vergoedingVal = preCheck.factuurBedrag - preCheck.btw;
        const calculatedTotal = vergoedingVal + preCheck.btw; // == preCheck.factuurBedrag
        const difference = Math.abs(calculatedTotal - preCheck.factuurBedrag);
        if (preCheck.factuurBedrag > 0 && (vergoedingVal < -0.02 || difference > 0.02)) {
            alert(
                `Fout in bedragen!\n\n` +
                `Vergoeding (${vergoedingVal.toFixed(2)}) + BTW (${preCheck.btw.toFixed(2)}) = ${calculatedTotal.toFixed(2)}.\n` +
                `Dit komt niet overeen met het ingevulde Factuurbedrag (${preCheck.factuurBedrag.toFixed(2)}).\n\n` +
                `Corrigeer de bedragen voordat je opslaat.`
            );
            return;
        }
    }

    setBtnState(true);

    try {
        const formData = getFormDataFromDOM(id);
        const dateInfo = getTargetDateInfo(currentMode);

        if (!isDateValidForPeriod(formData.datum, dateInfo.targetYear, dateInfo.targetMonthNum)) {
            if (!confirm(`⚠️ WAARSCHUWING: De datum (${formData.datum}) valt buiten de boekhoudperiode (${dateInfo.targetSheet}).\n\nDoorgaan?`)) return setBtnState(false);
        }

        const factuurnummer = await getNextInvoiceNumberFromCloud(dateInfo.targetSheet, dateInfo.prevSheet, dateInfo.targetYear);
        const factuurInput = document.getElementById(`factuurnummer-${id}`);
        if (factuurInput) factuurInput.value = factuurnummer;

        await processItemSave(item.file, formData, item.data || {}, currentMode, factuurnummer, dateInfo, item.driveFileId || null);

        item.status = 'saved';
        invalidateDashboardCache();
        renderBatchTable();

        // Force a refresh of the monthly VAT balance from Sheets now that a new item is saved.
        if (currentMode === 'inkoop') {
            updateRealBtwBalans();
        }
    } catch (error) {
        console.error("Fout bij opslaan:", error);
        setBtnState(false, 'alert-circle', true);
        const btn = document.getElementById(`btn-save-${id}`);
        if (btn) btn.title = error.message;
        alert(`Er ging iets mis: ${error.message}`);
    }
}
// Maak globaal beschikbaar voor de onclick handlers
window.saveBatchItem = saveBatchItem;

export async function saveAllSuccessItems() {
    const btn = document.getElementById('save-all-btn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Bezig...';
        if (window.lucide) window.lucide.createIcons();
    }

    // Only save items the user has selected; sequential with a pause to respect the Sheets quota
    const itemsToSave = batchQueue.filter(i => i.status === 'success' && i.selected !== false);
    for (const item of itemsToSave) {
        await saveBatchItem(item.id);
        await delay(1000);
    }

    // Remove unselected items from the local queue — Drive files are left untouched
    // so they will be picked up again during the next month's scan.
    batchQueue = batchQueue.filter(i => i.selected !== false || i.status === 'saved');
    renderBatchTable();

    if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="save-all" class="w-4 h-4"></i> Alles Opslaan';
        if (window.lucide) window.lucide.createIcons();
    }
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
import { analyzeReceipt } from '../api/gemini.js';
import { loadCloudMemory, getNextInvoiceNumberFromCloud, getMonthlyTotals } from '../api/storage-queries.js';
import { getTargetDateInfo, isDateValidForPeriod } from '../utils/date.js';
import { getBatchRowHTML } from './scanner-row.js';
import { prepareItemData, getFormDataFromDOM, processItemSave } from './scanner-helpers.js';
import { updateDashboard, invalidateDashboardCache } from './dashboard.js';

let batchQueue = [];
let isProcessingQueue = false;
let currentMode = 'inkoop';

// --- Initialization ---

export function initScanner() {
    const bindEvent = (id, evt, cb) => { const el = document.getElementById(id); if (el) el.addEventListener(evt, cb); };
    
    bindEvent('receipt-upload', 'change', (e) => handleFiles(e.target.files));
    bindEvent('folder-upload', 'change', (e) => handleFiles(e.target.files));
    bindEvent('mode-inkoop', 'click', () => setMode('inkoop'));
    bindEvent('mode-verkoop', 'click', () => setMode('verkoop'));
    bindEvent('btn-refresh-dashboard', 'click', () => {
        invalidateDashboardCache();
        setMode(currentMode);
    });
}

// --- Event Handlers ---

function handleFiles(files) {
    if (!files || files.length === 0) return;

    Array.from(files).forEach(file => {
        if (!file.name.startsWith('.') && (file.type.startsWith('image/') || file.type === 'application/pdf')) {
            batchQueue.push({ id: Date.now() + Math.random(), file, status: 'pending', data: null });
        }
    });

    const resetInput = (id) => { const el = document.getElementById(id); if (el) el.value = ''; };
    resetInput('receipt-upload');
    resetInput('folder-upload');
    
    renderBatchTable();
    processQueue();
}

async function setMode(mode) {
    currentMode = mode;
    const isVerkoop = mode === 'verkoop';
    
    const updateBtn = (id, active) => {
        const btn = document.getElementById(id);
        if (btn) btn.className = `px-6 py-2 rounded-md text-sm font-medium transition-all ${active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`;
    };
    
    updateBtn('mode-inkoop', !isVerkoop);
    updateBtn('mode-verkoop', isVerkoop);

    const thLev = document.getElementById('th-leverancier');
    const thBed = document.getElementById('th-bedrag');
    if (thLev) thLev.innerText = isVerkoop ? 'Klant' : 'Leverancier';
    if (thBed) thBed.innerText = isVerkoop ? 'Totaal (incl)' : 'Factuurbedrag';

    const uploadZone = document.getElementById('upload-zone-container');
    const folderUpload = document.getElementById('folder-upload-container');
    const dashCountCard = document.getElementById('dash-count-card');
    const totalLabel = document.getElementById('dash-total-label');
    const vatLabel = document.getElementById('dash-vat-label');
    const dashTotal = document.getElementById('dash-total');
    const dashVat = document.getElementById('dash-vat');

    if (isVerkoop) {
        if (uploadZone) uploadZone.classList.add('hidden');
        if (folderUpload) folderUpload.classList.add('hidden');
        if (dashCountCard) dashCountCard.classList.add('hidden');
        
        if (totalLabel) totalLabel.innerText = "Totaal Omzet (Huidige Maand)";
        if (vatLabel) vatLabel.innerText = "Af te dragen BTW";
        
        if (dashTotal) {
            dashTotal.classList.add('opacity-50');
            dashTotal.innerText = "Laden...";
        }
        if (dashVat) {
            dashVat.classList.add('opacity-50');
            dashVat.innerText = "Laden...";
        }
        
        renderBatchTable();
        
        try {
            const sheetName = getTargetDateInfo('verkoop').targetSheet;
            const totals = await getMonthlyTotals(sheetName);
            const formatEur = (num) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(num);
            if (dashTotal) {
                dashTotal.innerText = formatEur(totals.totaalOmzet);
                dashTotal.classList.remove('opacity-50');
            }
            if (dashVat) {
                dashVat.innerText = formatEur(totals.totaalBtw);
                dashVat.className = "text-2xl font-bold text-gray-900 transition-all"; 
            }
        } catch (e) {
            if (dashTotal) { dashTotal.innerText = "Fout"; dashTotal.classList.remove('opacity-50'); }
            if (dashVat) { dashVat.innerText = "Fout"; dashVat.classList.remove('opacity-50'); }
        }
    } else {
        if (uploadZone) uploadZone.classList.remove('hidden');
        if (folderUpload) folderUpload.classList.remove('hidden');
        if (dashCountCard) dashCountCard.classList.remove('hidden');
        if (vatLabel) vatLabel.innerText = "BTW Balans";
        
        renderBatchTable();
        updateDashboard(batchQueue, 'inkoop');
    }
}

// --- Core Logic ---

async function processQueue() {
    if (isProcessingQueue) return;
    isProcessingQueue = true;
    
    while (true) {
        const item = batchQueue.find(i => i.status === 'pending');
            if (!item) break;
        
        item.status = 'processing';
            renderBatchTable();
        
        try {
            const currentMemory = await loadCloudMemory();
            const aiData = await analyzeReceipt(item.file, currentMemory, currentMode);
            
            item.data = prepareItemData(currentMode, aiData, currentMemory);
            item.status = 'success';
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

    const setBtnState = (loading, icon = 'save', isError = false) => {
        const btn = document.getElementById(`btn-save-${id}`);
        if (!btn) return;
        btn.disabled = loading;
        btn.innerHTML = loading ? '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i>' : `<i data-lucide="${icon}" class="w-4 h-4"></i>`;
        if (isError) btn.classList.add('text-red-500');
        else btn.classList.remove('text-red-500');
        if (window.lucide) window.lucide.createIcons();
    };

    setBtnState(true);

    try {
        const formData = getFormDataFromDOM(id);
        const dateInfo = getTargetDateInfo(currentMode);

        if (!isDateValidForPeriod(formData.datum, dateInfo.targetYear, dateInfo.targetMonthNum)) {
            if (!confirm(`⚠️ WAARSCHUWING: De datum (${formData.datum}) valt buiten de boekhoudperiode (${dateInfo.targetSheet}).\n\nDoorgaan?`)) {
                setBtnState(false);
                return;
            }
        }

        const factuurnummer = await getNextInvoiceNumberFromCloud(dateInfo.targetSheet, dateInfo.prevSheet, dateInfo.targetYear);
        const factuurInput = document.getElementById(`factuurnummer-${id}`);
        if (factuurInput) factuurInput.value = factuurnummer;

        await processItemSave(item.file, formData, item.data || {}, currentMode, factuurnummer, dateInfo);

        item.status = 'saved';
        invalidateDashboardCache(); // Zorgt voor een herberekening van de actuele BTW balans
        renderBatchTable();
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
        btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Bezig met opslaan...';
        if (window.lucide) window.lucide.createIcons();
    }

    const itemsToSave = batchQueue.filter(i => i.status === 'success');
    for (const item of itemsToSave) await saveBatchItem(item.id);

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
        footer.innerHTML = `
            <button id="save-all-btn" onclick="saveAllSuccessItems()" class="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-md hover:bg-emerald-700 shadow-sm transition-colors flex items-center gap-2">
                <i data-lucide="save-all" class="w-4 h-4"></i> Alles Opslaan
            </button>`;
        dashboard.appendChild(footer);
    }

    const dateInfo = getTargetDateInfo(currentMode);
    tbody.innerHTML = batchQueue.map(item => getBatchRowHTML(item, dateInfo, currentMode)).join('');
    if (window.lucide) window.lucide.createIcons();
    updateDashboard(batchQueue, currentMode);
}
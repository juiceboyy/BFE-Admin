import { analyzeReceipt } from '../api/gemini.js';
import { uploadToDrive, insertRowInSheet, loadCloudMemory, saveCloudMemory, getNextInvoiceNumberFromCloud } from '../api/storage.js';
import { getTargetDateInfo, isDateValidForPeriod } from '../utils/date.js';
import { getBatchRowHTML } from './scanner-row.js';
import { prepareItemData, getFormDataFromDOM, constructSheetRow } from './scanner-helpers.js';

let batchQueue = [];
let isProcessingQueue = false;
let currentMode = 'inkoop';

// --- Initialization ---

export function initScanner() {
    const uploadInput = document.getElementById('receipt-upload');
    const folderInput = document.getElementById('folder-upload');

    if (uploadInput) uploadInput.addEventListener('change', (e) => handleFiles(e.target.files));
    if (folderInput) folderInput.addEventListener('change', (e) => handleFiles(e.target.files));

    // Mode Toggles
    const btnInkoop = document.getElementById('mode-inkoop');
    const btnVerkoop = document.getElementById('mode-verkoop');

    if (btnInkoop) btnInkoop.addEventListener('click', () => setMode('inkoop'));
    if (btnVerkoop) btnVerkoop.addEventListener('click', () => setMode('verkoop'));
}

// --- Event Handlers ---

function handleFiles(files) {
    if (!files || files.length === 0) return;

    Array.from(files).forEach(file => {
        if (file.name.startsWith('.') || (!file.type.startsWith('image/') && file.type !== 'application/pdf')) return;
        batchQueue.push({
            id: Date.now() + Math.random(), file: file, status: 'pending', data: null
        });
    });

    renderBatchTable();
    
    // Reset inputs
    const uploadInput = document.getElementById('receipt-upload');
    const folderInput = document.getElementById('folder-upload');
    if (uploadInput) uploadInput.value = '';
    if (folderInput) folderInput.value = '';
    
    processQueue();
}

function setMode(mode) {
    currentMode = mode;
    const thLeverancier = document.getElementById('th-leverancier');
    const thBedrag = document.getElementById('th-bedrag');
    const btnInkoop = document.getElementById('mode-inkoop');
    const btnVerkoop = document.getElementById('mode-verkoop');

    if (mode === 'inkoop') {
        if (btnInkoop) btnInkoop.className = 'px-6 py-2 rounded-md text-sm font-medium transition-all bg-white text-gray-900 shadow-sm';
        if (btnVerkoop) btnVerkoop.className = 'px-6 py-2 rounded-md text-sm font-medium transition-all text-gray-500 hover:text-gray-900';
        if (thLeverancier) thLeverancier.innerText = 'Leverancier';
        if (thBedrag) thBedrag.innerText = 'Factuurbedrag';
    } else {
        if (btnVerkoop) btnVerkoop.className = 'px-6 py-2 rounded-md text-sm font-medium transition-all bg-white text-gray-900 shadow-sm';
        if (btnInkoop) btnInkoop.className = 'px-6 py-2 rounded-md text-sm font-medium transition-all text-gray-500 hover:text-gray-900';
        if (thLeverancier) thLeverancier.innerText = 'Klant';
        if (thBedrag) thBedrag.innerText = 'Totaal (incl)';
    }
    renderBatchTable();
}

// --- Core Logic ---

async function processQueue() {
    if (isProcessingQueue) return;
    isProcessingQueue = true;
    
    while (true) {
        const item = batchQueue.find(i => i.status === 'pending');
        if (!item) break; // Queue is leeg of alles is verwerkt
        
        item.status = 'processing';
        renderBatchTable(); // Update UI naar 'Bezig...'
        
        try {
            const currentMemory = await loadCloudMemory();
            const aiData = await analyzeReceipt(item.file, currentMemory, currentMode);
            console.log('🤖 RAW AI DATA:', aiData);
            
            item.data = prepareItemData(currentMode, aiData, currentMemory);
            item.status = 'success';
        } catch (err) {
            item.status = 'error';
            item.data = { error: err.message };
        }
        renderBatchTable(); // Update UI met resultaten
    }
    isProcessingQueue = false;
}

export async function saveBatchItem(id) {
    const item = batchQueue.find(i => i.id === id);
    if (!item) return;

    const btn = document.getElementById(`btn-save-${id}`);
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i>';
        if (window.lucide) window.lucide.createIcons();
    }

    try {
        // 1. Data ophalen uit DOM
        const formData = getFormDataFromDOM(id);

        // 2. Nummering & Datum
        const dateInfo = getTargetDateInfo(currentMode);
        if (!isDateValidForPeriod(formData.datum, dateInfo.targetYear, dateInfo.targetMonthNum)) {
            const proceed = confirm(`⚠️ WAARSCHUWING: De datum (${formData.datum}) valt buiten de boekhoudperiode (${dateInfo.targetSheet}).\n\nWeet je zeker dat je deze bon in dit tijdvak wilt inboeken?`);
            if (!proceed) {
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = '<i data-lucide="save" class="w-4 h-4"></i>';
                    if (window.lucide) window.lucide.createIcons();
                }
                return;
            }
        }
        const factuurnummer = await getNextInvoiceNumberFromCloud(dateInfo.targetSheet, dateInfo.prevSheet, dateInfo.targetYear);
        const factuurInput = document.getElementById(`factuurnummer-${id}`);
        if (factuurInput) factuurInput.value = factuurnummer;

        // 3. Opslaan
        
        // Upload naar Drive (naamgeving: Factuurnummer - Tegenpartij)
        await uploadToDrive(item.file, `${factuurnummer} - ${formData.leverancier}`);

        // Bereid de rij voor de sheet voor (inclusief 'Wasstraat' cleaning)
        const rowValues = constructSheetRow(currentMode, formData, item.data || {}, factuurnummer);
        await insertRowInSheet(dateInfo.targetSheet, rowValues);

        // Cloud Memory updaten indien nodig (Alleen bij inkoop)
        if (currentMode === 'inkoop' && formData.leverancier) {
            const currentMemory = await loadCloudMemory();
            const vendorKey = formData.leverancier.toLowerCase().trim();
            const existingOptions = currentMemory[vendorKey] || [];
            if (!existingOptions.some(opt => opt.omschrijving === formData.omschrijving)) {
                await saveCloudMemory(formData.leverancier, formData.omschrijving, 'Mix');
            }
        }

        // 4. Succes UI
        item.status = 'saved'; // Update status om re-renders goed te houden
        renderBatchTable(); // Herrender de tabel om de 'saved' status correct te tonen (inputs disabled, groen vinkje)

    } catch (error) {
        console.error("Fout bij opslaan rij:", error);
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="alert-circle" class="w-4 h-4"></i>';
            btn.classList.add('text-red-500');
            btn.title = error.message;
        }
        if (window.lucide) window.lucide.createIcons();
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

    // Filter items die klaar staan (success)
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
    dashboard.classList.toggle('hidden', batchQueue.length === 0);

    // Footer toevoegen voor 'Alles Opslaan'
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
}
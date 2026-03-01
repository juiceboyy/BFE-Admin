import { analyzeReceipt } from '../api/gemini.js';
import { uploadToDrive, insertRowInSheet, loadCloudMemory, saveCloudMemory, getNextInvoiceNumberFromCloud } from '../api/storage.js';
import { getTargetDateInfo, isDateValidForPeriod } from '../utils/date.js';
import { getBatchRowHTML } from './scanner-row.js';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];
let batchQueue = [];
let isProcessingQueue = false;

function getTargetDateInfo() {
    const now = new Date();
    let targetMonthIndex = now.getMonth() - 1;
    let targetYear = now.getFullYear();

    if (targetMonthIndex < 0) {
        targetMonthIndex = 11;
        targetYear -= 1;
    }

    const prevMonthIndex = targetMonthIndex === 0 ? 11 : targetMonthIndex - 1;

    return {
        targetSheet: `${MONTH_NAMES[targetMonthIndex]} Inkoop`,
        prevSheet: `${MONTH_NAMES[prevMonthIndex]} Inkoop`,
        targetYear: targetYear,
        targetMonthNum: targetMonthIndex + 1
    };
}

function isDateValidForPeriod(dateStr, targetYear, targetMonthNum) {
    if (!dateStr) return true;
    const [year, month] = dateStr.split('-');
    return parseInt(year, 10) === targetYear && parseInt(month, 10) === targetMonthNum;
}

export function initScanner() {
    const uploadInput = document.getElementById('receipt-upload');
    const folderInput = document.getElementById('folder-upload');

    const handleFiles = (files) => {
        if (!files || files.length === 0) return;

        Array.from(files).forEach(file => {
            if (file.name.startsWith('.') || (!file.type.startsWith('image/') && file.type !== 'application/pdf')) return;
            batchQueue.push({
                id: Date.now() + Math.random(), file: file, status: 'pending', data: null
            });
        });

        renderBatchTable();
        if (uploadInput) uploadInput.value = '';
        if (folderInput) folderInput.value = '';
        processQueue();
    };

    if (uploadInput) uploadInput.addEventListener('change', (e) => handleFiles(e.target.files));
    if (folderInput) folderInput.addEventListener('change', (e) => handleFiles(e.target.files));
}

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
            const aiData = await analyzeReceipt(item.file, currentMemory);
            
            // Opties ophalen voor deze leverancier
            const vendorKey = aiData.naamLeverancier ? aiData.naamLeverancier.toLowerCase().trim() : '';
            const options = currentMemory[vendorKey] || [];

            item.data = { ...aiData, factuurnummer: '', options };
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
        // 1. DOM Lezen
        const getVal = (f) => document.getElementById(`${f}-${id}`)?.value || '';
        const [leverancier, omschrijving, datum] = ['leverancier', 'omschrijving', 'datum'].map(getVal);
        const factuurBedrag = parseFloat(getVal('factuurbedrag')) || 0;
        const btw = parseFloat(getVal('btw')) || 0;
        const vergoedingExcl = factuurBedrag - btw;

        // 2. Nummering & Datum
        const dateInfo = getTargetDateInfo();
        if (!isDateValidForPeriod(datum, dateInfo.targetYear, dateInfo.targetMonthNum)) {
            const proceed = confirm(`⚠️ WAARSCHUWING: De datum (${datum}) valt buiten de boekhoudperiode (${dateInfo.targetSheet}).\n\nWeet je zeker dat je deze bon in dit tijdvak wilt inboeken?`);
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
        // Upload naar Drive
        await uploadToDrive(item.file, `${factuurnummer} - ${leverancier}`);

        // Rij toevoegen aan Sheet
        await insertRowInSheet(dateInfo.targetSheet, [datum, factuurnummer, omschrijving, leverancier, factuurBedrag, btw, vergoedingExcl]);

        // Cloud Memory updaten indien nodig
        if (leverancier) {
            const currentMemory = await loadCloudMemory();
            const vendorKey = leverancier.toLowerCase().trim();
            const existingOptions = currentMemory[vendorKey] || [];
            if (!existingOptions.some(opt => opt.omschrijving === omschrijving)) {
                await saveCloudMemory(leverancier, omschrijving, 'Mix');
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

function renderBatchTable() {
    const dashboard = document.getElementById('batch-dashboard');
    const tbody = document.getElementById('batch-table-body');
    if (!dashboard || !tbody) return;
    dashboard.classList.toggle('hidden', batchQueue.length === 0);

    tbody.innerHTML = '';

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

    tbody.innerHTML = batchQueue.map(item => getBatchRowHTML(item)).join('');
    if (window.lucide) window.lucide.createIcons();
}

function getBatchRowHTML(item) {
    const isDisabled = ['pending', 'processing', 'saved'].includes(item.status);
    const disabledAttr = isDisabled ? 'disabled' : '';
    const opacityClass = isDisabled ? 'opacity-50 cursor-not-allowed' : '';
    const d = item.data || {};
    const options = d.options || [];
    
    const dateInfo = getTargetDateInfo();
    const isDateWarning = d.datum ? !isDateValidForPeriod(d.datum, dateInfo.targetYear, dateInfo.targetMonthNum) : false;
    const dateClass = isDateWarning 
        ? `bg-orange-50 border-b border-orange-500 text-orange-700 focus:border-orange-600 outline-none text-sm ${opacityClass}`
        : `bg-transparent border-b border-transparent focus:border-blue-500 outline-none text-sm ${opacityClass}`;

    let omschrijvingInput;
    if (options.length > 0) {
        const listId = `list-omschrijving-${item.id}`;
        omschrijvingInput = `
            <input type="text" id="omschrijving-${item.id}" list="${listId}" class="w-full bg-transparent border-b border-transparent focus:border-blue-500 outline-none text-sm ${opacityClass}" value="${d.omschrijving || ''}" ${disabledAttr} placeholder="Kies of typ...">
            <datalist id="${listId}">${options.map(opt => `<option value="${opt.omschrijving}">`).join('')}</datalist>`;
    } else {
        omschrijvingInput = `<input type="text" id="omschrijving-${item.id}" class="w-full bg-transparent border-b border-transparent focus:border-blue-500 outline-none text-sm ${opacityClass}" value="${d.omschrijving || ''}" ${disabledAttr} placeholder="Omschrijving">`;
    }

    return `
        <tr id="batch-row-${item.id}" class="bg-white border-b hover:bg-gray-50 transition-colors">
            <td class="px-4 py-3 whitespace-nowrap">
                <div class="flex items-center gap-2">
                    <i data-lucide="file-text" class="w-4 h-4 text-gray-400"></i>
                    <span class="text-sm font-medium text-gray-900 truncate max-w-[150px]" title="${item.file.name}">${item.file.name}</span>
                </div>
            </td>
            <td class="px-4 py-3 whitespace-nowrap">
                ${getStatusBadge(item.status)}
            </td>
            <td class="px-4 py-3 whitespace-nowrap">
                <input type="date" id="datum-${item.id}" class="${dateClass}" 
                    value="${d.datum || ''}" ${disabledAttr}>
            </td>
            <td class="px-4 py-3 whitespace-nowrap">
                <input type="text" id="leverancier-${item.id}" class="w-full bg-transparent border-b border-transparent focus:border-blue-500 outline-none text-sm ${opacityClass}" 
                    value="${d.naamLeverancier || ''}" ${disabledAttr} placeholder="Leverancier">
            </td>
            <td class="px-4 py-3 whitespace-nowrap">
                ${omschrijvingInput}
            </td>
            <td class="px-4 py-3 whitespace-nowrap text-right">
                <input type="number" id="factuurbedrag-${item.id}" step="0.01" class="w-24 text-right bg-transparent border-b border-transparent focus:border-blue-500 outline-none text-sm ${opacityClass}" 
                    value="${d.factuurBedrag || ''}" ${disabledAttr} placeholder="0.00">
            </td>
            <td class="px-4 py-3 whitespace-nowrap text-right">
                 <input type="number" id="btw-${item.id}" step="0.01" class="w-20 text-right bg-transparent border-b border-transparent focus:border-blue-500 outline-none text-sm ${opacityClass}" 
                    value="${d.btwBedrag || ''}" ${disabledAttr} placeholder="0.00">
            </td>
            <td class="px-4 py-3 whitespace-nowrap">
                <input type="text" id="factuurnummer-${item.id}" class="w-32 bg-transparent border-b border-transparent outline-none text-sm text-gray-500 cursor-default" 
                    value="${d.factuurnummer || ''}" readonly placeholder="Auto (bij opslaan)">
            </td>
            <td class="px-4 py-3 whitespace-nowrap text-center">
                <button id="btn-save-${item.id}" onclick="saveBatchItem(${item.id})" 
                    class="p-1 ${item.status === 'saved' ? 'text-green-500 cursor-default' : 'text-green-600 hover:text-green-800'} disabled:text-gray-300 transition-colors" 
                    ${item.status !== 'success' && item.status !== 'saved' ? 'disabled' : ''} 
                    ${item.status === 'saved' ? 'disabled' : ''}
                    title="${item.status === 'saved' ? 'Opgeslagen' : 'Opslaan'}">
                    <i data-lucide="${item.status === 'saved' ? 'check' : 'save'}" class="w-4 h-4"></i>
                </button>
            </td>
        </tr>`;
}

function getStatusBadge(status) {
    switch(status) {
        case 'pending': return '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">Wachtend...</span>';
        case 'processing': return '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">⏳ Scannen...</span>';
        case 'success': return '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">✅ Klaar</span>';
        case 'error': return '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">❌ Fout</span>';
        case 'saved': return '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">💾 Opgeslagen</span>';
        default: return '';
    }
}
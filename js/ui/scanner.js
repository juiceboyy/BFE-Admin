import { analyzeReceipt } from '../api/gemini.js';
import { uploadToDrive, insertRowInSheet, loadCloudMemory, saveCloudMemory, getNextInvoiceNumberFromCloud } from '../api/storage.js';

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
        targetYear: targetYear
    };
}

export function initScanner() {
    const uploadInput = document.getElementById('receipt-upload');
    const folderInput = document.getElementById('folder-upload');

    const handleFiles = (files) => {
        if (!files || files.length === 0) return;

        Array.from(files).forEach(file => {
            // Negeer verborgen bestanden (zoals .DS_Store) en sta alleen images/pdfs toe
            if (file.name.startsWith('.') || (!file.type.startsWith('image/') && file.type !== 'application/pdf')) {
                return;
            }

            batchQueue.push({
                id: Date.now() + Math.random(),
                file: file,
                status: 'pending',
                data: null
            });
        });

        renderBatchTable();
        
        // Reset inputs
        if (uploadInput) uploadInput.value = '';
        if (folderInput) folderInput.value = '';

        processQueue();
    };

    if (uploadInput) {
        uploadInput.addEventListener('change', (e) => handleFiles(e.target.files));
    }

    if (folderInput) {
        folderInput.addEventListener('change', (e) => handleFiles(e.target.files));
    }
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
            const aiData = await analyzeReceipt(item.file);
            const currentMemory = await loadCloudMemory();
            const vendorKey = aiData.naamLeverancier ? aiData.naamLeverancier.toLowerCase().trim() : '';
            const savedVendor = currentMemory[vendorKey];
            item.data = {
                ...aiData,
                omschrijving: savedVendor ? savedVendor.omschrijving : aiData.omschrijving,
                btwTarief: savedVendor ? savedVendor.btwTarief : aiData.btwTarief,
                factuurnummer: ''
            };
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
    // UI Loading State
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i>';
        if (window.lucide) window.lucide.createIcons();
    }

    try {
        // 1. DOM Lezen (actuele waarden ophalen)
        const leverancierInput = document.getElementById(`leverancier-${id}`);
        const omschrijvingInput = document.getElementById(`omschrijving-${id}`);
        const bedragInput = document.getElementById(`bedrag-${id}`);
        const btwInput = document.getElementById(`btw-${id}`);
        const factuurInput = document.getElementById(`factuurnummer-${id}`);

        const leverancier = leverancierInput.value;
        const omschrijving = omschrijvingInput.value;
        const bedrag = parseFloat(bedragInput.value) || 0;
        const btw = parseFloat(btwInput.value) || 0;
        const totaal = bedrag + btw;

        // 2. Nummering & Datum
        const dateInfo = getTargetDateInfo();
        const factuurnummer = await getNextInvoiceNumberFromCloud(dateInfo.targetSheet, dateInfo.prevSheet, dateInfo.targetYear);
        
        // Visueel invullen
        if (factuurInput) factuurInput.value = factuurnummer;

        // Datum bepalen (uit AI data of vandaag)
        const datum = item.data && item.data.datum ? item.data.datum : new Date().toISOString().split('T')[0];

        // 3. Opslaan
        // Upload naar Drive
        await uploadToDrive(item.file, factuurnummer);

        // Rij toevoegen aan Sheet
        await insertRowInSheet(dateInfo.targetSheet, [datum, factuurnummer, omschrijving, leverancier, totaal, btw, bedrag]);

        // Cloud Memory updaten indien nodig
        if (leverancier) {
            const currentMemory = await loadCloudMemory();
            const vendorKey = leverancier.toLowerCase().trim();
            if (!currentMemory[vendorKey]) {
                const tarief = item.data.btwTarief || '21';
                await saveCloudMemory(leverancier, omschrijving, tarief);
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

function renderBatchTable() {
    const dashboard = document.getElementById('batch-dashboard');
    const tbody = document.getElementById('batch-table-body');

    if (!dashboard || !tbody) return;

    if (batchQueue.length > 0) {
        dashboard.classList.remove('hidden');
    } else {
        dashboard.classList.add('hidden');
    }

    tbody.innerHTML = '';

    batchQueue.forEach(item => {
        const tr = document.createElement('tr');
        tr.className = 'bg-white border-b hover:bg-gray-50 transition-colors';
        tr.id = `batch-row-${item.id}`;

        const isDisabled = item.status === 'pending' || item.status === 'processing' || item.status === 'saved';
        const disabledAttr = isDisabled ? 'disabled' : '';
        const opacityClass = isDisabled ? 'opacity-50 cursor-not-allowed' : '';
        
        const d = item.data || {};

        tr.innerHTML = `
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
                <input type="text" id="leverancier-${item.id}" class="w-full bg-transparent border-b border-transparent focus:border-blue-500 outline-none text-sm ${opacityClass}" 
                    value="${d.naamLeverancier || ''}" ${disabledAttr} placeholder="Leverancier">
            </td>
            <td class="px-4 py-3 whitespace-nowrap">
                <input type="text" id="omschrijving-${item.id}" class="w-full bg-transparent border-b border-transparent focus:border-blue-500 outline-none text-sm ${opacityClass}" 
                    value="${d.omschrijving || ''}" ${disabledAttr} placeholder="Omschrijving">
            </td>
            <td class="px-4 py-3 whitespace-nowrap text-right">
                <input type="number" id="bedrag-${item.id}" step="0.01" class="w-24 text-right bg-transparent border-b border-transparent focus:border-blue-500 outline-none text-sm ${opacityClass}" 
                    value="${d.bedragExclusief || ''}" ${disabledAttr} placeholder="0.00">
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
        `;
        tbody.appendChild(tr);
    });

    if (window.lucide) window.lucide.createIcons();
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
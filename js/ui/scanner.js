import { analyzeReceipt } from '../api/gemini.js';
import { uploadToDrive, insertRowInSheet, loadCloudMemory, saveCloudMemory, getNextInvoiceNumberFromCloud } from '../api/storage.js';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];
let batchQueue = [];

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
    };

    if (uploadInput) {
        uploadInput.addEventListener('change', (e) => handleFiles(e.target.files));
    }

    if (folderInput) {
        folderInput.addEventListener('change', (e) => handleFiles(e.target.files));
    }
}

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

        const isDisabled = item.status === 'pending' || item.status === 'processing';
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
                <input type="text" class="w-full bg-transparent border-b border-transparent focus:border-blue-500 outline-none text-sm ${opacityClass}" 
                    value="${d.naamLeverancier || ''}" ${disabledAttr} placeholder="Leverancier">
            </td>
            <td class="px-4 py-3 whitespace-nowrap">
                <input type="text" class="w-full bg-transparent border-b border-transparent focus:border-blue-500 outline-none text-sm ${opacityClass}" 
                    value="${d.omschrijving || ''}" ${disabledAttr} placeholder="Omschrijving">
            </td>
            <td class="px-4 py-3 whitespace-nowrap text-right">
                <input type="number" step="0.01" class="w-24 text-right bg-transparent border-b border-transparent focus:border-blue-500 outline-none text-sm ${opacityClass}" 
                    value="${d.bedragExclusief || ''}" ${disabledAttr} placeholder="0.00">
            </td>
            <td class="px-4 py-3 whitespace-nowrap text-right">
                 <input type="number" step="0.01" class="w-20 text-right bg-transparent border-b border-transparent focus:border-blue-500 outline-none text-sm ${opacityClass}" 
                    value="${d.btwBedrag || ''}" ${disabledAttr} placeholder="0.00">
            </td>
            <td class="px-4 py-3 whitespace-nowrap">
                <input type="text" class="w-24 bg-transparent border-b border-transparent focus:border-blue-500 outline-none text-sm ${opacityClass}" 
                    value="${d.factuurnummer || ''}" ${disabledAttr} placeholder="Factuurnr">
            </td>
            <td class="px-4 py-3 whitespace-nowrap text-center">
                <button class="p-1 text-blue-600 hover:text-blue-800 disabled:text-gray-300 transition-colors" 
                    ${item.status !== 'success' ? 'disabled' : ''} title="Opslaan">
                    <i data-lucide="save" class="w-4 h-4"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    if (window.lucide) window.lucide.createIcons();
}

function getStatusBadge(status) {
    switch(status) {
        case 'pending': return '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">Wachtrij</span>';
        case 'processing': return '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"><i data-lucide="loader-2" class="w-3 h-3 animate-spin mr-1"></i> Bezig</span>';
        case 'success': return '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Klaar</span>';
        case 'error': return '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">Fout</span>';
        default: return '';
    }
}
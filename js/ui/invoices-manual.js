import { accessToken } from '../api/auth.js';
import { isAmareInvoice } from '../utils/invoice-layouts.js';
import { abbreviateDescription } from '../utils/text-abbreviations.js';
import { fetchSavedClientsFromSheet, getCachedClients } from '../api/storage-clients.js';
import { setupClientAutocomplete } from './client-autocomplete.js';
import {
    buildAmareOpenMicDescription,
    isAmareOpenMicDescription,
    getCurrentManualClientInfo,
    recalculateManualTotals,
    saveManualClientFlow,
    deleteManualClientFlow
} from './invoices-manual-helpers.js';
import { submitManualInvoice } from './invoices-manual-submit.js';

let savedClients = [];
let clientAutocomplete = null;
let manualItems = [
    { desc: '', amount: 0, btwRate: 21 }
];
let isOmschrijvingManuallyEdited = false;

export function initManualInvoices() {
    savedClients = getCachedClients();

    const btnSaveClient = document.getElementById('btn-manual-client-save');
    const btnDeleteClient = document.getElementById('btn-manual-client-delete');
    const btnAddRow = document.getElementById('btn-manual-add-row');
    const btnGenerate = document.getElementById('btn-generate-manual-invoice');
    const bookingDescInput = document.getElementById('manual-booking-desc');
    const invoiceDateInput = document.getElementById('manual-invoice-date');

    const nameInput = document.getElementById('manual-client-name');
    const toggleBtn = document.getElementById('manual-client-toggle');
    const dropdownEl = document.getElementById('manual-client-dropdown');
    const attentionInput = document.getElementById('manual-client-attention');
    const addressInput = document.getElementById('manual-client-address');
    const cityInput = document.getElementById('manual-client-city');

    clientAutocomplete = setupClientAutocomplete({
        nameInput,
        toggleBtn,
        dropdownEl,
        attentionInput,
        addressInput,
        cityInput,
        btnDelete: btnDeleteClient,
        getClients: () => savedClients,
        onSelect: () => syncAmareDefaultDescription(),
        onReset: () => syncAmareDefaultDescription()
    });

    // Default the date to today
    if (invoiceDateInput) {
        invoiceDateInput.valueAsDate = new Date();
    }

    // Event Bindings
    btnSaveClient?.addEventListener('click', () =>
        saveManualClientFlow(() => savedClients, (c) => { savedClients = c; }, () => clientAutocomplete)
    );
    btnDeleteClient?.addEventListener('click', () =>
        deleteManualClientFlow(
            () => savedClients,
            (c) => { savedClients = c; },
            () => clientAutocomplete,
            () => syncAmareDefaultDescription()
        )
    );
    btnAddRow?.addEventListener('click', handleAddRow);
    btnGenerate?.addEventListener('click', handleGenerateManualInvoice);

    [nameInput, attentionInput, addressInput, cityInput].forEach(el => {
        el?.addEventListener('input', () => syncAmareDefaultDescription());
    });

    invoiceDateInput?.addEventListener('change', () => syncAmareDefaultDescription());
    invoiceDateInput?.addEventListener('input', () => syncAmareDefaultDescription());

    bookingDescInput?.addEventListener('input', () => {
        isOmschrijvingManuallyEdited = (bookingDescInput.value.trim() !== '');
    });

    renderItemsTable();
}

/**
 * Loads manual clients from sheet (invoked on demand / after auth)
 */
export async function loadManualClientsAfterAuth() {
    if (!accessToken) return;

    try {
        savedClients = await fetchSavedClientsFromSheet();
        clientAutocomplete?.refreshDeleteState();
    } catch (e) {
        console.error("Fout bij laden klanten na inloggen:", e);
    }
}

function syncAmareDefaultDescription() {
    if (manualItems.length === 0) return;

    const amareActive = isAmareInvoice(getCurrentManualClientInfo());
    const invoiceDateVal = document.getElementById('manual-invoice-date')?.value || '';
    const firstDesc = manualItems[0].desc || '';
    const descEl = document.getElementById('manual-desc-0');

    if (amareActive) {
        if (firstDesc.trim() === '' || isAmareOpenMicDescription(firstDesc)) {
            const nextDesc = buildAmareOpenMicDescription(invoiceDateVal);
            if (firstDesc !== nextDesc) {
                manualItems[0].desc = nextDesc;
                if (descEl) {
                    descEl.value = nextDesc;
                    descEl.rows = Math.max(2, nextDesc.split('\n').length);
                }
                suggestBookingDescription();
            }
        }
    } else if (isAmareOpenMicDescription(firstDesc)) {
        manualItems[0].desc = '';
        if (descEl) {
            descEl.value = '';
            descEl.rows = 1;
        }
        suggestBookingDescription();
    }
}

function escapeTextareaHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function handleAddRow() {
    manualItems.push({ desc: '', amount: 0, btwRate: 21 });
    renderItemsTable();
}

function renderItemsTable() {
    const tbody = document.getElementById('manual-invoice-table-body');
    if (!tbody) return;

    if (manualItems.length === 0) {
        manualItems.push({ desc: '', amount: 0, btwRate: 21 });
    }

    tbody.innerHTML = manualItems.map((item, index) => {
        const rowId = `manual-row-${index}`;
        const rows = (item.desc || '').includes('\n') ? Math.max(2, item.desc.split('\n').length) : 1;
        return `
            <tr id="${rowId}" class="hover:bg-white/40 transition-colors">
                <td class="px-4 py-3">
                    <textarea id="manual-desc-${index}" rows="${rows}" placeholder="Bijv. Optreden Ronald"
                        class="w-full bg-transparent border-b border-transparent hover:border-gray-200 focus:border-blue-500 outline-none text-sm py-0.5 resize-none leading-snug manual-item-desc" data-index="${index}">${escapeTextareaHtml(item.desc)}</textarea>
                </td>
                <td class="px-4 py-3 text-right">
                    <input type="text" inputmode="decimal" id="manual-amount-${index}" value="${item.amount > 0 ? item.amount.toFixed(2) : ''}" placeholder="0,00" 
                        class="w-28 bg-white border border-gray-200 rounded px-2 py-0.5 text-right font-medium text-gray-800 outline-none focus:ring-1 focus:ring-blue-500 manual-item-amount" data-index="${index}">
                </td>
                <td class="px-4 py-3">
                    <select id="manual-btw-${index}" class="bg-white border border-gray-200 rounded px-2 py-0.5 text-sm text-gray-800 outline-none focus:ring-1 focus:ring-blue-500 manual-item-btw" data-index="${index}">
                        <option value="21" ${item.btwRate === 21 ? 'selected' : ''}>21% (Hoog)</option>
                        <option value="9" ${item.btwRate === 9 ? 'selected' : ''}>9% (Laag)</option>
                        <option value="0" ${item.btwRate === 0 ? 'selected' : ''}>0%</option>
                        <option value="Vrijgesteld" ${item.btwRate === 'Vrijgesteld' ? 'selected' : ''}>Vrijgesteld</option>
                    </select>
                </td>
                <td class="px-4 py-3 text-center">
                    <button class="delete-manual-row-btn text-gray-400 hover:text-red-600 transition-colors" data-index="${index}">
                        <i data-lucide="trash-2" class="w-4 h-4 mx-auto"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();

    tbody.querySelectorAll('.manual-item-desc').forEach(textarea => {
        textarea.addEventListener('input', (e) => {
            const idx = parseInt(e.target.getAttribute('data-index'), 10);
            manualItems[idx].desc = e.target.value;
            e.target.rows = e.target.value.includes('\n') ? Math.max(2, e.target.value.split('\n').length) : 1;
            suggestBookingDescription();
        });
    });

    tbody.querySelectorAll('.manual-item-amount').forEach(input => {
        input.addEventListener('input', (e) => {
            const idx = parseInt(e.target.getAttribute('data-index'), 10);
            const clean = String(e.target.value).replace(',', '.').trim();
            const val = parseFloat(clean);
            manualItems[idx].amount = isNaN(val) ? 0 : val;
            recalculateManualTotals(manualItems);
        });
    });

    tbody.querySelectorAll('.manual-item-btw').forEach(select => {
        select.addEventListener('change', (e) => {
            const idx = parseInt(e.target.getAttribute('data-index'), 10);
            const val = e.target.value;
            manualItems[idx].btwRate = (val === 'Vrijgesteld') ? 'Vrijgesteld' : parseInt(val, 10);
            recalculateManualTotals(manualItems);
        });
    });

    tbody.querySelectorAll('.delete-manual-row-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(e.currentTarget.getAttribute('data-index'), 10);
            manualItems.splice(idx, 1);
            renderItemsTable();
            recalculateManualTotals(manualItems);
            suggestBookingDescription();
        });
    });

    recalculateManualTotals(manualItems);
}

function suggestBookingDescription() {
    if (isOmschrijvingManuallyEdited) return;

    const descriptions = manualItems
        .map(item => item.desc.replace(/\r?\n?\s*Event\s+ID\s+\d+/gi, '').trim())
        .filter(desc => desc !== '');

    const bookingDescInput = document.getElementById('manual-booking-desc');
    if (!bookingDescInput) return;

    if (descriptions.length === 0) {
        bookingDescInput.value = '';
    } else {
        const rawText = `werkzh: ${descriptions.join(', ')}`;
        bookingDescInput.value = abbreviateDescription(rawText);
    }
}

function resetManualInvoiceForm() {
    manualItems = [{ desc: '', amount: 0, btwRate: 21 }];
    isOmschrijvingManuallyEdited = false;
    if (document.getElementById('manual-booking-desc')) {
        document.getElementById('manual-booking-desc').value = '';
    }

    if (document.getElementById('manual-client-name')) document.getElementById('manual-client-name').value = '';
    if (document.getElementById('manual-client-attention')) document.getElementById('manual-client-attention').value = '';
    if (document.getElementById('manual-client-address')) document.getElementById('manual-client-address').value = '';
    if (document.getElementById('manual-client-city')) document.getElementById('manual-client-city').value = '';
    clientAutocomplete?.refreshDeleteState();

    renderItemsTable();
}

async function handleGenerateManualInvoice() {
    await submitManualInvoice(manualItems, resetManualInvoiceForm);
}

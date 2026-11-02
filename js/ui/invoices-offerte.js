import { accessToken } from '../api/auth.js';
import { uploadToDrive, DRIVE_FACTUREN_FOLDER_ID } from '../api/storage-drive.js';
import { fetchSavedClientsFromSheet, saveClientToSheetApi, deleteClientFromSheetApi, getCachedClients } from '../api/storage-clients.js';
import { findNextOfferteNumber, saveOfferteToSheet } from '../api/storage-queries-offertes.js';
import { buildInvoiceDOM } from '../utils/invoice-layouts.js';
import { generateAndUploadPDF } from '../utils/pdf-generator.js';

let savedClients = [];
let offerteItems = [
    { desc: 'Optreden Reau (12 november 2026)', amount: 0, btwRate: 9 }
];

export function initOfferteInvoices() {
    const clientSelect = document.getElementById('offerte-client-select');
    const btnSaveClient = document.getElementById('btn-offerte-client-save');
    const btnDeleteClient = document.getElementById('btn-offerte-client-delete');
    const btnAddRow = document.getElementById('btn-offerte-add-row');
    const btnGenerate = document.getElementById('btn-generate-offerte');
    const offerteDateInput = document.getElementById('offerte-date');
    const projectInput = document.getElementById('offerte-project');
    const perfDateInput = document.getElementById('offerte-performance-date');

    // Default dates
    if (offerteDateInput && !offerteDateInput.value) {
        offerteDateInput.valueAsDate = new Date();
    }

    // Event Bindings
    clientSelect?.addEventListener('change', handleClientSelectChange);
    btnSaveClient?.addEventListener('click', handleSaveClient);
    btnDeleteClient?.addEventListener('click', handleDeleteClient);
    btnAddRow?.addEventListener('click', handleAddRow);
    btnGenerate?.addEventListener('click', handleGenerateOfferte);

    offerteDateInput?.addEventListener('change', async () => {
        const d = new Date(offerteDateInput.value);
        if (!isNaN(d.getTime())) {
            await refreshNextOfferteNumber(d.getFullYear());
        }
    });

    projectInput?.addEventListener('input', updateFirstItemSuggestion);
    perfDateInput?.addEventListener('change', updateFirstItemSuggestion);

    // Initial render
    savedClients = getCachedClients();
    renderSavedClientsDropdown();
    renderItemsTable();
    updateDeleteButtonState();
    refreshNextOfferteNumber();
}

/**
 * Loads saved clients and fetches next sequence number after Google auth.
 */
export async function loadOfferteDataAfterAuth() {
    if (!accessToken) return;

    try {
        savedClients = await fetchSavedClientsFromSheet();
        renderSavedClientsDropdown();
        await refreshNextOfferteNumber();
    } catch (e) {
        console.error("Fout bij laden offerte-gegevens na inloggen:", e);
    }
}

async function refreshNextOfferteNumber(targetYear) {
    const numInput = document.getElementById('offerte-number');
    if (!numInput) return;

    const dateVal = document.getElementById('offerte-date')?.value;
    const year = targetYear || (dateVal ? new Date(dateVal).getFullYear() : new Date().getFullYear());

    try {
        const nextNum = await findNextOfferteNumber(year);
        numInput.value = nextNum;
    } catch (e) {
        console.error("Kon offertenummer niet bepalen:", e);
    }
}

function updateFirstItemSuggestion() {
    if (offerteItems.length > 0 && (offerteItems[0].desc.startsWith('Optreden') || offerteItems[0].desc === '')) {
        const project = document.getElementById('offerte-project')?.value.trim() || 'Reau';
        const perfDate = document.getElementById('offerte-performance-date')?.value;
        let dateStr = '';
        if (perfDate) {
            const [y, m, d] = perfDate.split('-');
            const months = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
            dateStr = ` (${parseInt(d, 10)} ${months[parseInt(m, 10) - 1]} ${y})`;
        }
        offerteItems[0].desc = `Optreden ${project}${dateStr}`;
        renderItemsTable();
    }
}

function renderSavedClientsDropdown() {
    const clientSelect = document.getElementById('offerte-client-select');
    if (!clientSelect) return;

    let html = '<option value="">-- Selecteer relatie --</option>';
    if (savedClients.length > 0) {
        savedClients.forEach((c, idx) => {
            html += `<option value="saved-${idx}">${c.name}</option>`;
        });
    }
    html += '<option value="custom">Nieuw / Aangepast...</option>';
    clientSelect.innerHTML = html;
}

function handleClientSelectChange(e) {
    const val = e.target.value;
    const clientName = document.getElementById('offerte-client-name');
    const clientAttention = document.getElementById('offerte-client-attention');
    const clientAddress = document.getElementById('offerte-client-address');
    const clientCity = document.getElementById('offerte-client-city');

    if (!clientName || !clientAttention || !clientAddress || !clientCity) return;

    if (val.startsWith('saved-')) {
        const idx = parseInt(val.split('-')[1], 10);
        const client = savedClients[idx];
        if (client) {
            clientName.value = client.name || '';
            clientAttention.value = client.attention || '';
            clientAddress.value = client.address || '';
            clientCity.value = client.city || '';
        }
    } else {
        clientName.value = '';
        clientAttention.value = '';
        clientAddress.value = '';
        clientCity.value = '';
    }

    updateDeleteButtonState();
}

function updateDeleteButtonState() {
    const clientSelect = document.getElementById('offerte-client-select');
    const btnDeleteClient = document.getElementById('btn-offerte-client-delete');
    if (!clientSelect || !btnDeleteClient) return;

    const val = clientSelect.value;
    if (val.startsWith('saved-')) {
        btnDeleteClient.disabled = false;
        btnDeleteClient.classList.replace('opacity-40', 'opacity-100');
        btnDeleteClient.classList.replace('cursor-not-allowed', 'cursor-pointer');
    } else {
        btnDeleteClient.disabled = true;
        btnDeleteClient.classList.add('opacity-40', 'cursor-not-allowed');
        btnDeleteClient.classList.remove('opacity-100', 'cursor-pointer');
    }
}

async function handleSaveClient() {
    const clientName = document.getElementById('offerte-client-name')?.value.trim();
    const clientAttention = document.getElementById('offerte-client-attention')?.value.trim();
    const clientAddress = document.getElementById('offerte-client-address')?.value.trim();
    const clientCity = document.getElementById('offerte-client-city')?.value.trim();

    if (!clientName) {
        alert("Vul ten minste de klantnaam in om op te slaan.");
        return;
    }

    if (!accessToken) {
        alert("Niet ingelogd met Google. Klik eerst op \"Sync Drive\" bovenaan.");
        return;
    }

    const btn = document.getElementById('btn-offerte-client-save');
    const setSaving = (saving) => {
        if (!btn) return;
        btn.disabled = saving;
        btn.innerHTML = saving ? '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Opslaan...' : '<i data-lucide="save" class="w-3.5 h-3.5"></i> Klant Opslaan in Sheet';
        if (window.lucide) window.lucide.createIcons();
    };

    setSaving(true);

    try {
        const newClient = { name: clientName, attention: clientAttention, address: clientAddress, city: clientCity };
        await saveClientToSheetApi(newClient);
        savedClients = await fetchSavedClientsFromSheet();
        renderSavedClientsDropdown();

        const newIdx = savedClients.findIndex(c => c.name.toLowerCase().trim() === clientName.toLowerCase().trim());
        const clientSelect = document.getElementById('offerte-client-select');
        if (clientSelect && newIdx !== -1) {
            clientSelect.value = `saved-${newIdx}`;
        }
        updateDeleteButtonState();
        alert("Klant succesvol opgeslagen in Google Sheet 'Klanten'!");
    } catch (e) {
        console.error("Fout bij opslaan klant:", e);
        alert(`Fout bij opslaan klant: ${e.message}`);
    } finally {
        setSaving(false);
    }
}

async function handleDeleteClient() {
    const clientSelect = document.getElementById('offerte-client-select');
    if (!clientSelect) return;

    const val = clientSelect.value;
    if (!val.startsWith('saved-')) return;

    const idx = parseInt(val.split('-')[1], 10);
    const client = savedClients[idx];
    if (!client) return;

    if (!confirm(`Weet je zeker dat je '${client.name}' wilt verwijderen uit de Google Sheet?`)) {
        return;
    }

    const btn = document.getElementById('btn-offerte-client-delete');
    const setDeleting = (deleting) => {
        if (!btn) return;
        btn.disabled = deleting;
        btn.innerHTML = deleting ? '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i>' : '<i data-lucide="trash-2" class="w-3.5 h-3.5"></i> Klant Verwijderen';
        if (window.lucide) window.lucide.createIcons();
    };

    setDeleting(true);

    try {
        await deleteClientFromSheetApi(client.name);
        document.getElementById('offerte-client-name').value = '';
        document.getElementById('offerte-client-attention').value = '';
        document.getElementById('offerte-client-address').value = '';
        document.getElementById('offerte-client-city').value = '';

        savedClients = await fetchSavedClientsFromSheet();
        renderSavedClientsDropdown();
        clientSelect.value = '';
        updateDeleteButtonState();
        alert("Klant verwijderd!");
    } catch (e) {
        console.error("Fout bij verwijderen klant:", e);
        alert(`Fout bij verwijderen klant: ${e.message}`);
    } finally {
        setDeleting(false);
    }
}

function handleAddRow() {
    offerteItems.push({ desc: '', amount: 0, btwRate: 9 });
    renderItemsTable();
}

function renderItemsTable() {
    const tbody = document.getElementById('offerte-table-body');
    if (!tbody) return;

    tbody.innerHTML = '';

    offerteItems.forEach((item, index) => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-50/50 transition-colors';

        tr.innerHTML = `
            <td class="px-4 py-2.5">
                <input type="text" data-field="desc" data-index="${index}" value="${item.desc || ''}" placeholder="Bijv. Optreden Reau op 12 november" 
                    class="w-full bg-transparent border-0 border-b border-transparent focus:border-gray-400 outline-none px-1 py-1 text-sm font-medium">
            </td>
            <td class="px-4 py-2.5 text-right">
                <input type="text" inputmode="decimal" data-field="amount" data-index="${index}" value="${item.amount > 0 ? item.amount : ''}" placeholder="0.00" 
                    class="w-28 text-right bg-transparent border-0 border-b border-transparent focus:border-gray-400 outline-none px-1 py-1 text-sm font-semibold">
            </td>
            <td class="px-4 py-2.5">
                <select data-field="btwRate" data-index="${index}" 
                    class="bg-white/80 border border-gray-200 rounded-lg px-2.5 py-1 text-xs outline-none focus:ring-1 focus:ring-blue-500">
                    <option value="9" ${item.btwRate === 9 ? 'selected' : ''}>9% (Optreden/Laag)</option>
                    <option value="21" ${item.btwRate === 21 ? 'selected' : ''}>21% (Hoog)</option>
                    <option value="0" ${item.btwRate === 0 ? 'selected' : ''}>0%</option>
                    <option value="Vrijgesteld" ${item.btwRate === 'Vrijgesteld' ? 'selected' : ''}>Vrijgesteld</option>
                </select>
            </td>
            <td class="px-4 py-2.5 text-center">
                <button type="button" data-action="delete" data-index="${index}" 
                    class="text-gray-400 hover:text-red-500 p-1 rounded-md transition-colors ${offerteItems.length === 1 ? 'opacity-30 cursor-not-allowed' : ''}">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
            </td>
        `;

        tbody.appendChild(tr);
    });

    if (window.lucide) window.lucide.createIcons();

    // Attach listeners
    tbody.querySelectorAll('input, select').forEach(input => {
        input.addEventListener('input', handleItemChange);
        input.addEventListener('change', handleItemChange);
    });

    tbody.querySelectorAll('button[data-action="delete"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (offerteItems.length <= 1) return;
            const idx = parseInt(e.currentTarget.getAttribute('data-index'), 10);
            offerteItems.splice(idx, 1);
            renderItemsTable();
        });
    });

    recalculateTotals();
}

function handleItemChange(e) {
    const field = e.target.getAttribute('data-field');
    const index = parseInt(e.target.getAttribute('data-index'), 10);
    if (isNaN(index) || !offerteItems[index]) return;

    if (field === 'amount') {
        const clean = String(e.target.value).replace(',', '.').trim();
        offerteItems[index].amount = parseFloat(clean) || 0;
    } else if (field === 'btwRate') {
        const val = e.target.value;
        offerteItems[index].btwRate = (val === 'Vrijgesteld') ? 'Vrijgesteld' : parseInt(val, 10);
    } else if (field === 'desc') {
        offerteItems[index].desc = e.target.value;
    }

    recalculateTotals();
}

function recalculateTotals() {
    let subtotal = 0;
    let btw21 = 0;
    let btw9 = 0;

    offerteItems.forEach(item => {
        if (item.amount) {
            subtotal += item.amount;
            if (item.btwRate === 21) {
                btw21 += item.amount * 0.21;
            } else if (item.btwRate === 9) {
                btw9 += item.amount * 0.09;
            }
        }
    });

    const total = subtotal + btw21 + btw9;
    const formatEur = (num) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(num);

    const subtotalEl = document.getElementById('offerte-summary-subtotal');
    if (subtotalEl) subtotalEl.innerText = formatEur(subtotal);

    const vat9Row = document.getElementById('offerte-vat9-row');
    const vat9El = document.getElementById('offerte-summary-vat9');
    if (vat9Row && vat9El) {
        if (btw9 > 0) {
            vat9Row.classList.remove('hidden');
            vat9El.innerText = formatEur(btw9);
        } else {
            vat9Row.classList.add('hidden');
            vat9El.innerText = formatEur(0);
        }
    }

    const vat21Row = document.getElementById('offerte-vat21-row');
    const vat21El = document.getElementById('offerte-summary-vat21');
    if (vat21Row && vat21El) {
        if (btw21 > 0) {
            vat21Row.classList.remove('hidden');
            vat21El.innerText = formatEur(btw21);
        } else {
            vat21Row.classList.add('hidden');
            vat21El.innerText = formatEur(0);
        }
    }

    const hasZeroOrExempt = offerteItems.some(item => item.btwRate === 0 || item.btwRate === 'Vrijgesteld');
    const vatNulRow = document.getElementById('offerte-vatnul-row');
    if (vatNulRow) {
        if (hasZeroOrExempt) {
            vatNulRow.classList.remove('hidden');
        } else {
            vatNulRow.classList.add('hidden');
        }
    }

    const totalEl = document.getElementById('offerte-summary-total');
    if (totalEl) totalEl.innerText = formatEur(total);
}

async function handleGenerateOfferte() {
    const clientName = document.getElementById('offerte-client-name')?.value.trim();
    const clientAttention = document.getElementById('offerte-client-attention')?.value.trim();
    const clientAddress = document.getElementById('offerte-client-address')?.value.trim();
    const clientCity = document.getElementById('offerte-client-city')?.value.trim();
    const offerteDateVal = document.getElementById('offerte-date')?.value;
    const projectVal = document.getElementById('offerte-project')?.value.trim() || 'Reau';
    const perfDateVal = document.getElementById('offerte-performance-date')?.value;
    const offerteNumberVal = document.getElementById('offerte-number')?.value.trim();
    const validityDaysVal = parseInt(document.getElementById('offerte-validity')?.value, 10) || 30;
    const notesVal = document.getElementById('offerte-notes')?.value || '';

    if (!accessToken) {
        alert("Niet ingelogd met Google. Klik eerst op \"Sync Drive\" bovenaan.");
        return;
    }

    if (!clientName || !clientAddress || !clientCity) {
        alert("Vul ten minste de klantnaam, adres en woonplaats in.");
        return;
    }

    if (!offerteDateVal) {
        alert("Selecteer een offertedatum.");
        return;
    }

    if (!offerteNumberVal) {
        alert("Vul een offertenummer in (bijv. 2026-001).");
        return;
    }

    const validItems = offerteItems.filter(item => item.desc.trim() !== '' && item.amount > 0);
    if (validItems.length === 0) {
        alert("Voeg minimaal één geldige offerteregel toe met omschrijving en bedrag.");
        return;
    }

    const btn = document.getElementById('btn-generate-offerte');
    const setLoading = (loading) => {
        if (!btn) return;
        btn.disabled = loading;
        btn.innerHTML = loading
            ? '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Bezig met genereren & opslaan...'
            : '<i data-lucide="printer" class="w-4 h-4"></i> Offerte Genereren & Opslaan';
        if (window.lucide) window.lucide.createIcons();
    };

    setLoading(true);

    try {
        let subtotal = 0;
        let btw21 = 0;
        let btw9 = 0;

        validItems.forEach(item => {
            subtotal += item.amount;
            if (item.btwRate === 21) {
                btw21 += item.amount * 0.21;
            } else if (item.btwRate === 9) {
                btw9 += item.amount * 0.09;
            }
        });

        const totaal = subtotal + btw21 + btw9;

        // Format performance date for display
        let perfDateFormatted = '';
        if (perfDateVal) {
            const [y, m, d] = perfDateVal.split('-');
            const months = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
            perfDateFormatted = `${parseInt(d, 10)} ${months[parseInt(m, 10) - 1]} ${y}`;
        }

        const offerteDOMConfig = {
            type: 'offerte',
            factuurNummer: offerteNumberVal,
            invoiceDate: offerteDateVal,
            clientInfo: {
                name: clientName,
                attention: clientAttention,
                address: clientAddress,
                city: clientCity
            },
            items: validItems,
            totals: {
                subtotal,
                btwBreakdown: {
                    '21': btw21,
                    '9': btw9
                },
                total: totaal
            },
            meta: {
                project: projectVal,
                optreedDatum: perfDateFormatted,
                validityDays: validityDaysVal,
                notes: notesVal
            }
        };

        const offerteElement = buildInvoiceDOM(offerteDOMConfig);

        const cleanNum = offerteNumberVal.replace(/^BFE\d*OF\s*/i, '').trim();
        const invoiceYear = new Date(offerteDateVal).getFullYear();
        const invoiceYear2 = String(invoiceYear).slice(-2);
        const safeSubject = (projectVal ? `${projectVal} ` : '') + clientName;
        const pdfFileName = `BFE${invoiceYear2}OF ${cleanNum} ${safeSubject}`.trim();

        // 1. Generate PDF & trigger browser download
        const pdfBlob = await generateAndUploadPDF(offerteElement, pdfFileName);
        const pdfFile = new File([pdfBlob], `${pdfFileName}.pdf`, { type: 'application/pdf' });

        // 2. Upload to Drive (Facturen folder)
        await uploadToDrive(pdfFile, pdfFileName, DRIVE_FACTUREN_FOLDER_ID);

        // 3. Save record to Google Sheets 'Offertes' tab
        const primaryDesc = validItems.map(i => i.desc).join(', ');
        await saveOfferteToSheet({
            offerteNummer: cleanNum,
            offerteDatum: offerteDateVal,
            clientName,
            clientAttention,
            clientAddress,
            clientCity,
            project: projectVal,
            optreedDatum: perfDateVal,
            omschrijving: primaryDesc,
            subtotal,
            btwTotaal: btw9 + btw21,
            totaal,
            geldigheid: `${validityDaysVal} dagen`,
            status: 'Verzonden'
        });

        alert(`Offerte ${cleanNum} succesvol gegenereerd en opgeslagen!\n\n- PDF gedownload in browser\n- Opgeslagen in Google Drive (Facturen)\n- Geregistreerd in Google Sheets (tabblad 'Offertes')`);

        // Prepare next quote number
        const nextDate = new Date(offerteDateVal);
        await refreshNextOfferteNumber(nextDate.getFullYear());
    } catch (err) {
        console.error('Fout bij genereren offerte:', err);
        alert(`Er ging iets mis bij het genereren of opslaan van de offerte: ${err.message}`);
    } finally {
        setLoading(false);
    }
}

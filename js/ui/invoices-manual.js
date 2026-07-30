import { fetchWithRetry } from '../utils/network.js';
import { accessToken } from '../api/auth.js';
import { SPREADSHEET_ID, clearSheetCaches } from '../api/storage.js';
import { findInvoiceTargetRowAndNumber } from '../api/storage-queries-invoices.js';
import { constructSheetRow, processItemSave } from './scanner-helpers.js';
import { buildInvoiceDOM } from '../utils/invoice-layouts.js';
import { generateAndUploadPDF } from '../utils/pdf-generator.js';

// Pre-programmed default clients


let savedClients = [];
let manualItems = [
    { desc: '', amount: 0, btwRate: 21 }
];
let isOmschrijvingManuallyEdited = false;

export function initManualInvoices() {
    const clientSelect = document.getElementById('manual-client-select');
    const btnSaveClient = document.getElementById('btn-manual-client-save');
    const btnDeleteClient = document.getElementById('btn-manual-client-delete');
    const btnAddRow = document.getElementById('btn-manual-add-row');
    const btnGenerate = document.getElementById('btn-generate-manual-invoice');
    const bookingDescInput = document.getElementById('manual-booking-desc');
    const invoiceDateInput = document.getElementById('manual-invoice-date');

    // Default the date to today
    if (invoiceDateInput) {
        invoiceDateInput.valueAsDate = new Date();
    }

    // Event Bindings
    clientSelect?.addEventListener('change', handleClientSelectChange);
    btnSaveClient?.addEventListener('click', handleSaveClient);
    btnDeleteClient?.addEventListener('click', handleDeleteClient);
    btnAddRow?.addEventListener('click', handleAddRow);
    btnGenerate?.addEventListener('click', handleGenerateManualInvoice);

    bookingDescInput?.addEventListener('input', () => {
        isOmschrijvingManuallyEdited = (bookingDescInput.value.trim() !== '');
    });

    // Initial render
    renderSavedClientsDropdown();
    renderItemsTable();
    updateDeleteButtonState();
}

/**
 * Loads manual clients from sheet and populates dropdown (invoked on demand / after auth)
 */
export async function loadManualClientsAfterAuth() {
    if (!accessToken) return;
    
    const clientSelect = document.getElementById('manual-client-select');
    if (!clientSelect) return;

    // Show loading state in dropdown
    clientSelect.innerHTML = '<option value="">Bezig met laden relaties...</option>';

    try {
        await fetchSavedClientsFromSheet();
        renderSavedClientsDropdown();
    } catch (e) {
        console.error("Fout bij laden klanten na inloggen:", e);
        clientSelect.innerHTML = `
            <option value="">⚠️ Fout bij laden: ${e.message}</option>
            <option value="custom">Nieuw / Aangepast...</option>
        `;
    }
}

async function fetchSavedClientsFromSheet() {
    if (!accessToken) return [];

    const metaRes = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!metaRes.ok) {
        const errorText = await metaRes.text();
        throw new Error(`Google Sheets metadata kon niet worden geladen: ${metaRes.status} ${errorText}`);
    }
    
    const metaData = await metaRes.json();
    const sheetExists = (metaData.sheets || []).some(s => s.properties.title === 'Klanten');

    if (!sheetExists) {
        // Create tab 'Klanten'
        const createRes = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                requests: [
                    {
                        addSheet: {
                            properties: { title: 'Klanten' }
                        }
                    }
                ]
            })
        });
        if (!createRes.ok) {
            const errorText = await createRes.text();
            throw new Error(`Klanten tabblad kon niet worden aangemaakt: ${createRes.status} ${errorText}`);
        }

        // Add headers to newly created Customers sheet
        const seedRes = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/'Klanten'!A1:D1?valueInputOption=USER_ENTERED`, {
            method: 'PUT',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                values: [["Klantnaam", "T.a.v.", "Adres", "Woonplaats"]]
            })
        });
        if (!seedRes.ok) {
            const errorText = await seedRes.text();
            throw new Error(`Klanten tabblad headers konden niet worden aangemaakt: ${seedRes.status} ${errorText}`);
        }
        savedClients = [];
        return savedClients;
    }

    const dataRes = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/'Klanten'!A1:D`, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!dataRes.ok) {
        const errorText = await dataRes.text();
        throw new Error(`Klantgegevens konden niet worden opgehaald: ${dataRes.status} ${errorText}`);
    }
    
    const dataJson = await dataRes.json();
    const rows = dataJson.values || [];

    let existingClients = [];
    if (rows.length > 1) {
        existingClients = rows.slice(1).map(r => ({
            name: r[0] || '',
            attention: r[1] || '',
            address: r[2] || '',
            city: r[3] || ''
        })).filter(c => c.name !== '');
    }



    savedClients = existingClients;
    return savedClients;
}

async function saveClientToSheetApi(client) {
    if (!accessToken) throw new Error("Geen Google access token.");
    await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/'Klanten'!A:D:append?valueInputOption=USER_ENTERED`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            values: [[client.name, client.attention, client.address, client.city]]
        })
    });
}

async function deleteClientFromSheetApi(clientName) {
    if (!accessToken) throw new Error("Geen Google access token.");
    
    const res = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/'Klanten'!A:D`, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) return;
    const data = await res.json();
    const rows = data.values || [];
    if (rows.length <= 1) return;

    const remainingRows = rows.slice(1).filter(r => (r[0] || '').toLowerCase().trim() !== clientName.toLowerCase().trim());

    // Clear and rewrite
    await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/'Klanten'!A2:D:clear`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (remainingRows.length > 0) {
        await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/'Klanten'!A2?valueInputOption=USER_ENTERED`, {
            method: 'PUT',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                values: remainingRows
            })
        });
    }
}

function renderSavedClientsDropdown() {
    const clientSelect = document.getElementById('manual-client-select');
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
    
    const clientName = document.getElementById('manual-client-name');
    const clientAttention = document.getElementById('manual-client-attention');
    const clientAddress = document.getElementById('manual-client-address');
    const clientCity = document.getElementById('manual-client-city');

    if (!clientName || !clientAttention || !clientAddress || !clientCity) return;

    if (val.startsWith('saved-')) {
        const idx = parseInt(val.split('-')[1]);
        const client = savedClients[idx];
        clientName.value = client.name;
        clientAttention.value = client.attention;
        clientAddress.value = client.address;
        clientCity.value = client.city;
    } else {
        // custom or select
        clientName.value = '';
        clientAttention.value = '';
        clientAddress.value = '';
        clientCity.value = '';
    }

    updateDeleteButtonState();
}

function updateDeleteButtonState() {
    const clientSelect = document.getElementById('manual-client-select');
    const btnDeleteClient = document.getElementById('btn-manual-client-delete');
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
    const clientName = document.getElementById('manual-client-name')?.value.trim();
    const clientAttention = document.getElementById('manual-client-attention')?.value.trim();
    const clientAddress = document.getElementById('manual-client-address')?.value.trim();
    const clientCity = document.getElementById('manual-client-city')?.value.trim();

    if (!clientName) {
        alert("Vul ten minste de klantnaam in om op te slaan.");
        return;
    }

    if (!accessToken) {
        alert("Niet ingelogd met Google. Klik eerst op \"Sync Drive\" bovenaan.");
        return;
    }

    const btn = document.getElementById('btn-manual-client-save');
    const setSaving = (saving) => {
        if (!btn) return;
        btn.disabled = saving;
        btn.innerHTML = saving ? '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Opslaan...' : 'Klant Opslaan in Sheet';
        if (window.lucide) window.lucide.createIcons();
    };

    setSaving(true);

    try {
        const newClient = { name: clientName, attention: clientAttention, address: clientAddress, city: clientCity };
        
        // Save to sheet
        await saveClientToSheetApi(newClient);
        
        // Reload list
        await fetchSavedClientsFromSheet();
        renderSavedClientsDropdown();
        
        // Select the newly added client (find it in savedClients list)
        const newIdx = savedClients.findIndex(c => c.name.toLowerCase().trim() === clientName.toLowerCase().trim());
        const clientSelect = document.getElementById('manual-client-select');
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
    const clientSelect = document.getElementById('manual-client-select');
    if (!clientSelect) return;

    const val = clientSelect.value;
    if (!val.startsWith('saved-')) return;

    const idx = parseInt(val.split('-')[1]);
    const client = savedClients[idx];

    if (!confirm(`Weet je zeker dat je '${client.name}' wilt verwijderen uit de Google Sheet?`)) {
        return;
    }

    const btn = document.getElementById('btn-manual-client-delete');
    const setDeleting = (deleting) => {
        if (!btn) return;
        btn.disabled = deleting;
        btn.innerHTML = deleting ? '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i>' : '<i data-lucide="trash-2" class="w-4 h-4"></i>';
        if (window.lucide) window.lucide.createIcons();
    };

    setDeleting(true);

    try {
        await deleteClientFromSheetApi(client.name);
        
        // Clear fields
        document.getElementById('manual-client-name').value = '';
        document.getElementById('manual-client-attention').value = '';
        document.getElementById('manual-client-address').value = '';
        document.getElementById('manual-client-city').value = '';
        
        // Reload list
        await fetchSavedClientsFromSheet();
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
        return `
            <tr id="${rowId}" class="hover:bg-white/40 transition-colors">
                <td class="px-4 py-3">
                    <input type="text" id="manual-desc-${index}" value="${item.desc}" placeholder="Bijv. Optreden Ronald" 
                        class="w-full bg-transparent border-b border-transparent hover:border-gray-200 focus:border-blue-500 outline-none text-sm py-0.5 manual-item-desc" data-index="${index}">
                </td>
                <td class="px-4 py-3 text-right">
                    <input type="number" step="0.01" id="manual-amount-${index}" value="${item.amount > 0 ? item.amount.toFixed(2) : ''}" placeholder="0,00" 
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

    // Bind event listeners to table inputs
    tbody.querySelectorAll('.manual-item-desc').forEach(input => {
        input.addEventListener('input', (e) => {
            const idx = parseInt(e.target.getAttribute('data-index'));
            manualItems[idx].desc = e.target.value;
            suggestBookingDescription();
        });
    });

    tbody.querySelectorAll('.manual-item-amount').forEach(input => {
        input.addEventListener('input', (e) => {
            const idx = parseInt(e.target.getAttribute('data-index'));
            const val = parseFloat(e.target.value);
            manualItems[idx].amount = isNaN(val) ? 0 : val;
            recalculateTotals();
        });
    });

    tbody.querySelectorAll('.manual-item-btw').forEach(select => {
        select.addEventListener('change', (e) => {
            const idx = parseInt(e.target.getAttribute('data-index'));
            const val = e.target.value;
            manualItems[idx].btwRate = (val === 'Vrijgesteld') ? 'Vrijgesteld' : parseInt(val);
            recalculateTotals();
        });
    });

    tbody.querySelectorAll('.delete-manual-row-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(e.currentTarget.getAttribute('data-index'));
            manualItems.splice(idx, 1);
            renderItemsTable();
            recalculateTotals();
            suggestBookingDescription();
        });
    });

    recalculateTotals();
}

function abbreviateDescription(text) {
    if (!text) return '';
    let result = text;
    
    const mappings = [
        [/\bwerkzaamheden\b/gi, 'werkzk'],
        [/\bmanagement\b/gi, 'mgmt'],
        [/\badministratie\b/gi, 'adm'],
        [/\bdiversen\b/gi, 'div'],
        [/\bverhuur\b/gi, 'vh'],
        [/\blesgeven\b/gi, 'lessen'],
        [/\borganisatie\b/gi, 'org'],
        [/\bonderhoud\b/gi, 'ond'],
        [/\breiskosten\b/gi, 'reis'],
        [/\babonnement\b/gi, 'abo'],
        [/\blicentie\b/gi, 'lic'],
        [/\bbijeenkomst\b/gi, 'bijeenk'],
        [/\bvoorstelling\b/gi, 'voorst']
    ];
    
    for (const [regex, replacement] of mappings) {
        result = result.replace(regex, replacement);
    }
    return result;
}

function suggestBookingDescription() {
    if (isOmschrijvingManuallyEdited) return;

    const descriptions = manualItems
        .map(item => item.desc.trim())
        .filter(desc => desc !== '');

    const bookingDescInput = document.getElementById('manual-booking-desc');
    if (!bookingDescInput) return;

    if (descriptions.length === 0) {
        bookingDescInput.value = '';
    } else {
        const rawText = `werkzk: ${descriptions.join(', ')}`;
        bookingDescInput.value = abbreviateDescription(rawText);
    }
}

function recalculateTotals() {
    let subtotal = 0;
    let btw21 = 0;
    let btw9 = 0;

    manualItems.forEach(item => {
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

    const subtotalEl = document.getElementById('manual-summary-subtotal');
    if (subtotalEl) subtotalEl.innerText = formatEur(subtotal);

    // VAT 21% Display
    const vat21Row = document.getElementById('manual-vat21-row');
    const vat21El = document.getElementById('manual-summary-vat21');
    if (vat21Row && vat21El) {
        if (btw21 > 0) {
            vat21Row.classList.remove('hidden');
            vat21El.innerText = formatEur(btw21);
        } else {
            vat21Row.classList.add('hidden');
            vat21El.innerText = formatEur(0);
        }
    }

    // VAT 9% Display
    const vat9Row = document.getElementById('manual-vat9-row');
    const vat9El = document.getElementById('manual-summary-vat9');
    if (vat9Row && vat9El) {
        if (btw9 > 0) {
            vat9Row.classList.remove('hidden');
            vat9El.innerText = formatEur(btw9);
        } else {
            vat9Row.classList.add('hidden');
            vat9El.innerText = formatEur(0);
        }
    }

    // VAT 0% or Exempt Display
    const hasZeroOrExempt = manualItems.some(item => item.btwRate === 0 || item.btwRate === 'Vrijgesteld');
    const vatNulRow = document.getElementById('manual-vatnul-row');
    if (vatNulRow) {
        if (hasZeroOrExempt) {
            vatNulRow.classList.remove('hidden');
        } else {
            vatNulRow.classList.add('hidden');
        }
    }

    const totalEl = document.getElementById('manual-summary-total');
    if (totalEl) totalEl.innerText = formatEur(total);
}

async function handleGenerateManualInvoice() {
    const clientName = document.getElementById('manual-client-name')?.value.trim();
    const clientAttention = document.getElementById('manual-client-attention')?.value.trim();
    const clientAddress = document.getElementById('manual-client-address')?.value.trim();
    const clientCity = document.getElementById('manual-client-city')?.value.trim();
    const invoiceDateVal = document.getElementById('manual-invoice-date')?.value;
    const bookingDesc = document.getElementById('manual-booking-desc')?.value.trim();

    if (!accessToken) {
        alert("Niet ingelogd met Google. Klik eerst op \"Sync Drive\" bovenaan.");
        return;
    }

    if (!clientName || !clientAddress || !clientCity) {
        alert("Vul de klantnaam, adres en woonplaats in.");
        return;
    }

    if (!invoiceDateVal) {
        alert("Selecteer een factuurdatum.");
        return;
    }

    if (!bookingDesc) {
        alert("Vul een omschrijving voor de boekhouding in.");
        return;
    }

    // Filter out items without descriptions/amounts
    const validItems = manualItems.filter(item => item.desc.trim() !== '' && item.amount > 0);
    if (validItems.length === 0) {
        alert("Voeg minimaal één geldige factuurregel toe met omschrijving en bedrag.");
        return;
    }

    const btn = document.getElementById('btn-generate-manual-invoice');
    const setLoading = (loading) => {
        if (!btn) return;
        btn.disabled = loading;
        btn.innerHTML = loading
            ? '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Bezig met genereren & boeken...'
            : '<i data-lucide="printer" class="w-4 h-4"></i> Factuur Genereren & Boeken';
        if (window.lucide) window.lucide.createIcons();
    };

    setLoading(true);

    try {
        clearSheetCaches();

        const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'June', 'July', 'August', 'Sep', 'Okt', 'Nov', 'Dec'];
        const invoiceD = new Date(invoiceDateVal);
        const targetMonthIndex = invoiceD.getMonth();
        const currentYear = invoiceD.getFullYear();
        const targetSheet = `${MONTH_NAMES[targetMonthIndex]} Verkoop`;
        
        const prevMonthIndex = targetMonthIndex === 0 ? 11 : targetMonthIndex - 1;
        const prevSheet = `${MONTH_NAMES[prevMonthIndex]} Verkoop`;

        const { targetRowIndex, factuurNummer } = await findInvoiceTargetRowAndNumber(targetSheet, prevSheet, currentYear);

        // Calculations
        let subtotal = 0;
        let btw21 = 0;
        let btw9 = 0;
        let omzetHoog = 0;
        let omzetLaag = 0;
        let omzetNul = 0;

        validItems.forEach(item => {
            subtotal += item.amount;
            if (item.btwRate === 21) {
                btw21 += item.amount * 0.21;
                omzetHoog += item.amount;
            } else if (item.btwRate === 9) {
                btw9 += item.amount * 0.09;
                omzetLaag += item.amount;
            } else {
                // 0 or Vrijgesteld
                omzetNul += item.amount;
            }
        });

        const invoiceTotal = subtotal + btw21 + btw9;

        // Build config for layout
        const invoiceDOMConfig = {
            type: 'manual',
            factuurNummer,
            invoiceDate: invoiceDateVal,
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
                total: invoiceTotal
            }
        };

        const invoiceElement = buildInvoiceDOM(invoiceDOMConfig);

        // Filename format: BFE26FR 2026-054 <omschrijving voor spreadsheet>
        const invoiceYear2 = String(invoiceD.getFullYear()).slice(-2);
        const factuurNummerFilename = factuurNummer.replace('.', '-');
        const sheetOmschrijving = bookingDesc.trim();
        const pdfFileName = `BFE${invoiceYear2}FR ${factuurNummerFilename} ${sheetOmschrijving}`;

        const pdfBlob = await generateAndUploadPDF(invoiceElement, pdfFileName);
        const pdfFile = new File([pdfBlob], `${pdfFileName}.pdf`, { type: 'application/pdf' });

        // Book row in Google Sheets
        const formData = {
            datum: invoiceDateVal,
            leverancier: clientName,
            omschrijving: sheetOmschrijving,
            factuurBedrag: invoiceTotal,
        };

        const itemData = {
            btwLaag: btw9,
            btwHoog: btw21,
            omzetLaag: omzetLaag,
            omzetHoog: omzetHoog,
            omzetNul: omzetNul,
        };

        const dateInfo = { targetSheet };
        await processItemSave(pdfFile, formData, itemData, 'verkoop', factuurNummer, dateInfo);

        alert(`Factuur ${factuurNummer} succesvol gegenereerd, gedownload en opgeslagen!\n\n- Opgeslagen in Drive\n- Geboekt in Sheet: ${targetSheet}`);
        
        // Reset form
        manualItems = [{ desc: '', amount: 0, btwRate: 21 }];
        isOmschrijvingManuallyEdited = false;
        if (document.getElementById('manual-booking-desc')) {
            document.getElementById('manual-booking-desc').value = '';
        }
        
        // Reset client selection to custom
        const clientSelect = document.getElementById('manual-client-select');
        if (clientSelect) {
            clientSelect.value = '';
            handleClientSelectChange({ target: { value: '' } });
        }
        
        renderItemsTable();
    } catch (err) {
        console.error('Fout bij genereren handmatige factuur:', err);
        alert(`Er ging iets mis bij het genereren of opslaan van de factuur: ${err.message}`);
    } finally {
        setLoading(false);
    }
}

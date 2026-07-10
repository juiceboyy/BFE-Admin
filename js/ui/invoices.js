import { fetchCalendarEvents, parseEventsForInvoicing, updateCalendarEventInvoiceStatus } from '../api/calendar.js';
import { getGlobalTargetDate, getTargetDateInfo } from '../utils/date.js';
import { getNextInvoiceNumberFromCloud } from '../api/storage-queries.js';
import { insertRowInSheet, getSheetHeaders, clearSheetCaches, SPREADSHEET_ID } from '../api/storage.js';
import { constructSheetRow } from './scanner-helpers.js';
import { accessToken } from '../api/auth.js';
import { buildInvoiceDOM, generateAndUploadPDF } from '../utils/pdf-generator.js';


let invoicedEvents = [];
let rentItems = [];

export function initInvoicesModule() {
    const btnFetch = document.getElementById('btn-fetch-calendar');
    const btnGenerate = document.getElementById('btn-generate-invoice');
    
    // Bind fetch button
    btnFetch?.addEventListener('click', handleFetchCalendar);
    
    // Bind generate button
    btnGenerate?.addEventListener('click', handleGenerateInvoice);

    // Bind inputs for automatic re-calculation
    const travelDaysInput = document.getElementById('travel-days');
    const travelDistanceInput = document.getElementById('travel-distance');
    const travelRateInput = document.getElementById('travel-rate');

    [travelDaysInput, travelDistanceInput, travelRateInput].forEach(input => {
        input?.addEventListener('input', recalculateTotals);
    });

    // Default the invoice date to today
    const invoiceDateInput = document.getElementById('invoice-date');
    if (invoiceDateInput) {
        invoiceDateInput.valueAsDate = new Date();
    }

    // --- Studio Verhuur Setup ---
    const rentInvoiceDateInput = document.getElementById('rent-invoice-date');
    if (rentInvoiceDateInput) {
        rentInvoiceDateInput.valueAsDate = new Date();
    }

    const btnRefreshRent = document.getElementById('btn-refresh-rent');
    btnRefreshRent?.addEventListener('click', () => {
        loadDefaultRentItems();
        renderRentTable();
    });

    const btnGenerateRent = document.getElementById('btn-generate-rent');
    btnGenerateRent?.addEventListener('click', handleGenerateRentInvoices);

    const tabInvoices = document.getElementById('tab-invoices');
    tabInvoices?.addEventListener('click', () => {
        loadDefaultRentItems();
        renderRentTable();
    });

    // Initial load
    loadDefaultRentItems();
    renderRentTable();
}

function loadDefaultRentItems() {
    const targetDate = getGlobalTargetDate();
    const MONTH_NAMES_DUTCH_STANDARD = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
    const maandNaam = MONTH_NAMES_DUTCH_STANDARD[targetDate.getMonth()];
    const year2 = String(targetDate.getFullYear()).slice(-2);
    
    rentItems = [
        {
            tenantKey: 'multi_acoustics',
            clientName: "Studio Multi Acoustics",
            attention: "Gijs Hietkamp",
            address: "Van Hogendorpstraat 136",
            city: "2515NX Den Haag",
            fileNamePrefix: "huur studio",
            sheetDescription: "huur studio",
            desc: `Verhuur opslag Binckhorst ${maandNaam} '${year2}`,
            amount: 54.60,
            btwRate: 21
        },
        {
            tenantKey: 'multi_acoustics',
            clientName: "Studio Multi Acoustics",
            attention: "Gijs Hietkamp",
            address: "Van Hogendorpstraat 136",
            city: "2515NX Den Haag",
            fileNamePrefix: "huur studio",
            sheetDescription: "huur studio",
            desc: `Verhuur werkruimte Binckhorst ${maandNaam} '${year2}`,
            amount: 54.60,
            btwRate: 21
        },
        {
            tenantKey: 'oh_snap',
            clientName: "Oh Snap!",
            attention: "Tommy Everts",
            address: "Minister Talmalaan 23",
            city: "2285 EB Rijswijk",
            fileNamePrefix: "huur werkkamer",
            sheetDescription: "huur werkkamer",
            desc: `Verhuur werkruimte ${maandNaam} '${year2} 1.12`,
            amount: 109.20,
            btwRate: 21
        }
    ];
}

function renderRentTable() {
    const tbody = document.getElementById('rent-table-body');
    if (!tbody) return;
    
    tbody.innerHTML = rentItems.map((item, index) => {
        const rowId = `rent-row-${index}`;
        const btwAmount = (item.amount * (item.btwRate / 100)).toFixed(2);
        const totalAmount = (item.amount + parseFloat(btwAmount)).toFixed(2);
        
        return `
            <tr id="${rowId}" class="hover:bg-white/40 transition-colors">
                <td class="px-4 py-3 font-medium text-gray-800">${item.clientName}</td>
                <td class="px-4 py-3">
                    <input type="text" id="rent-desc-${index}" value="${item.desc}" 
                        class="w-full bg-transparent border-b border-transparent hover:border-gray-200 focus:border-blue-500 outline-none text-sm py-0.5 rent-desc-input" data-index="${index}">
                </td>
                <td class="px-4 py-3 text-right">
                    <input type="number" step="0.01" id="rent-amount-${index}" value="${item.amount.toFixed(2)}" 
                        class="w-24 bg-transparent border-b border-transparent hover:border-gray-200 focus:border-blue-500 outline-none text-right font-medium text-gray-800 py-0.5 rent-amount-input" data-index="${index}">
                </td>
                <td class="px-4 py-3 text-center text-gray-500">${item.btwRate}%</td>
                <td class="px-4 py-3 text-right font-medium text-gray-800" id="rent-total-${index}">
                    € ${totalAmount.replace('.', ',')}
                </td>
            </tr>
        `;
    }).join('');
    
    // Bind listeners
    tbody.querySelectorAll('.rent-desc-input').forEach(input => {
        input.addEventListener('change', (e) => {
            const index = parseInt(e.target.getAttribute('data-index'));
            rentItems[index].desc = e.target.value;
        });
    });
    
    tbody.querySelectorAll('.rent-amount-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const index = parseInt(e.target.getAttribute('data-index'));
            const val = parseFloat(e.target.value);
            rentItems[index].amount = isNaN(val) ? 0 : val;
            
            // Recalculate row total in DOM
            const btwRate = rentItems[index].btwRate;
            const btwAmount = rentItems[index].amount * (btwRate / 100);
            const total = rentItems[index].amount + btwAmount;
            
            const totalEl = document.getElementById(`rent-total-${index}`);
            if (totalEl) {
                totalEl.innerText = `€ ${total.toFixed(2).replace('.', ',')}`;
            }
        });
    });
}

async function handleFetchCalendar() {
    const btn = document.getElementById('btn-fetch-calendar');
    const keyword = document.getElementById('invoice-filter-keyword').value || 'MZO';
    const defaultRate = parseFloat(document.getElementById('invoice-default-rate').value) || 50.00;
    
    const setLoading = (loading) => {
        if (!btn) return;
        btn.disabled = loading;
        btn.innerHTML = loading
            ? '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Bezig...'
            : '<i data-lucide="calendar-search" class="w-4 h-4"></i> Agenda Ophalen';
        if (window.lucide) window.lucide.createIcons();
    };

    setLoading(true);

    try {
        const targetDate = getGlobalTargetDate();
        const year = targetDate.getFullYear();
        const month = targetDate.getMonth();
        
        // Define calendar date boundaries (ISO Strings)
        const timeMin = new Date(year, month, 1, 0, 0, 0).toISOString();
        const timeMax = new Date(year, month + 1, 0, 23, 59, 59).toISOString();

        // Fetch from Google Calendar API
        const rawEvents = await fetchCalendarEvents(timeMin, timeMax);
        invoicedEvents = parseEventsForInvoicing(rawEvents, keyword);

        // Apply default rate to fetched events
        invoicedEvents.forEach(e => {
            e.tarief = defaultRate;
        });

        // Warn if some events already contain gefactureerd tag
        const alreadyInvoicedCount = invoicedEvents.filter(e => e.gefactureerd).length;
        if (alreadyInvoicedCount > 0) {
            alert(`Let op: er zijn ${alreadyInvoicedCount} afspraken gevonden die al de status 'gefactureerd' in de agenda-omschrijving hebben.`);
        }

        renderEventsTable();
    } catch (error) {
        console.error('Fout bij ophalen agenda:', error);
        alert(`Fout bij ophalen agenda: ${error.message}`);
    } finally {
        setLoading(false);
    }
}

function renderEventsTable() {
    const container = document.getElementById('invoice-events-container');
    const emptyState = document.getElementById('invoice-empty-state');
    const tbody = document.getElementById('invoice-table-body');

    if (!container || !emptyState || !tbody) return;

    if (invoicedEvents.length === 0) {
        container.classList.add('hidden');
        emptyState.classList.remove('hidden');
        tbody.innerHTML = '';
        return;
    }

    container.classList.remove('hidden');
    emptyState.classList.add('hidden');

    tbody.innerHTML = invoicedEvents.map((event, index) => {
        const rowId = `invoice-event-row-${index}`;
        const hoursAlertClass = event.uren === null ? 'border-red-500 focus:ring-red-200' : 'border-gray-200';
        return `
            <tr id="${rowId}" class="hover:bg-white/40 transition-colors">
                <td class="px-4 py-3 text-center text-gray-500">${event.week}</td>
                <td class="px-4 py-3">
                    <input type="text" id="event-date-${index}" value="${event.datum}" class="w-full bg-transparent border-b border-transparent hover:border-gray-200 focus:border-blue-500 outline-none text-sm py-0.5">
                </td>
                <td class="px-4 py-3">
                    <input type="text" id="event-location-${index}" value="${event.lokatie}" class="w-full bg-transparent border-b border-transparent hover:border-gray-200 focus:border-blue-500 outline-none text-sm py-0.5">
                </td>
                <td class="px-4 py-3">
                    <input type="text" id="event-activity-${index}" value="${event.activiteit}" class="w-full bg-transparent border-b border-transparent hover:border-gray-200 focus:border-blue-500 outline-none text-sm py-0.5">
                </td>
                <td class="px-4 py-3">
                    <input type="text" id="event-instrument-${index}" value="${event.instrument}" class="w-full bg-transparent border-b border-transparent hover:border-gray-200 focus:border-blue-500 outline-none text-sm py-0.5">
                </td>
                <td class="px-4 py-3 text-right">
                    <input type="number" step="0.01" id="event-hours-${index}" value="${event.uren !== null ? event.uren : ''}" placeholder="?" 
                        class="w-16 bg-white border ${hoursAlertClass} rounded px-2 py-0.5 text-right font-medium text-gray-800 outline-none focus:ring-1 focus:ring-blue-500 event-hours-input" data-index="${index}">
                </td>
                <td class="px-4 py-3 text-right">
                    <input type="number" step="0.01" id="event-rate-${index}" value="${event.tarief}" 
                        class="w-16 bg-transparent border-b border-transparent hover:border-gray-200 focus:border-blue-500 outline-none text-right font-medium text-gray-800 py-0.5 event-rate-input" data-index="${index}">
                </td>
                <td class="px-4 py-3 text-right font-medium text-gray-800" id="event-total-${index}">
                    € ${(event.uren * event.tarief || 0).toFixed(2).replace('.', ',')}
                </td>
                <td class="px-4 py-3 text-center">
                    <span class="px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide uppercase ${event.gefactureerd ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-gray-100 text-gray-600'}">
                        ${event.gefactureerd ? 'Gefactureerd' : 'Open'}
                    </span>
                </td>
                <td class="px-4 py-3 text-center">
                    <button class="delete-event-btn text-gray-400 hover:text-red-600 transition-colors" data-index="${index}">
                        <i data-lucide="trash-2" class="w-4 h-4 mx-auto"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();

    // Bind row deletion
    tbody.querySelectorAll('.delete-event-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.currentTarget.getAttribute('data-index'));
            invoicedEvents.splice(index, 1);
            renderEventsTable();
        });
    });

    // Bind real-time recalculations on hours and rate changes
    tbody.querySelectorAll('.event-hours-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const index = parseInt(e.target.getAttribute('data-index'));
            const val = parseFloat(e.target.value);
            invoicedEvents[index].uren = isNaN(val) ? null : val;
            
            if (!isNaN(val)) {
                e.target.classList.replace('border-red-500', 'border-gray-200');
            } else {
                e.target.classList.replace('border-gray-200', 'border-red-500');
            }

            updateRowTotal(index);
        });
    });

    tbody.querySelectorAll('.event-rate-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const index = parseInt(e.target.getAttribute('data-index'));
            const val = parseFloat(e.target.value);
            invoicedEvents[index].tarief = isNaN(val) ? 0 : val;
            updateRowTotal(index);
        });
    });

    calculateTravelDaysAutomatically();
    recalculateTotals();
}

function updateRowTotal(index) {
    const event = invoicedEvents[index];
    const totalEl = document.getElementById(`event-total-${index}`);
    if (totalEl) {
        const total = event.uren * event.tarief || 0;
        totalEl.innerText = `€ ${total.toFixed(2).replace('.', ',')}`;
    }
    recalculateTotals();
}

function calculateTravelDaysAutomatically() {
    const uniqueDates = new Set();
    invoicedEvents.forEach(e => {
        if (e.datum) {
            uniqueDates.add(e.datum);
        }
    });

    const travelDaysInput = document.getElementById('travel-days');
    if (travelDaysInput) {
        travelDaysInput.value = uniqueDates.size;
    }
}

function recalculateTotals() {
    let subtotalLessen = 0;
    
    invoicedEvents.forEach(e => {
        if (e.uren && e.tarief) {
            subtotalLessen += e.uren * e.tarief;
        }
    });

    const travelDays = parseInt(document.getElementById('travel-days').value) || 0;
    const travelDistance = parseFloat(document.getElementById('travel-distance').value) || 0;
    const travelRate = parseFloat(document.getElementById('travel-rate').value) || 0;
    
    const totalTravel = travelDays * travelDistance * travelRate;
    const grandTotal = subtotalLessen + totalTravel;

    const formatEur = (num) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(num);

    document.getElementById('total-travel-amount').innerText = formatEur(totalTravel);
    document.getElementById('summary-subtotal').innerText = formatEur(subtotalLessen);
    document.getElementById('summary-travel').innerText = formatEur(totalTravel);
    document.getElementById('summary-total').innerText = formatEur(grandTotal);
}

async function handleGenerateInvoice() {
    const missingHoursIndex = invoicedEvents.findIndex(e => e.uren === null || isNaN(e.uren));
    if (missingHoursIndex !== -1) {
        alert('Vul a.b.b. alle uren in voor de lessen.');
        document.getElementById(`event-hours-${missingHoursIndex}`)?.focus();
        return;
    }

    const btn = document.getElementById('btn-generate-invoice');
    const invoiceDateVal = document.getElementById('invoice-date').value;
    if (!invoiceDateVal) {
        alert('Selecteer een factuurdatum.');
        return;
    }

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
        // Clear cached rows to ensure we find the first actual empty row fresh from the cloud
        clearSheetCaches();

        // Deriving the target sheet and year directly from the user-selected invoice date
        const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'June', 'July', 'August', 'Sep', 'Okt', 'Nov', 'Dec'];
        const invoiceD = new Date(invoiceDateVal);
        const targetMonthIndex = invoiceD.getMonth();
        const currentYear = invoiceD.getFullYear();
        const targetSheet = `${MONTH_NAMES[targetMonthIndex]} Verkoop`;
        
        const prevMonthIndex = targetMonthIndex === 0 ? 11 : targetMonthIndex - 1;
        const prevSheet = `${MONTH_NAMES[prevMonthIndex]} Verkoop`;

        // Fetch sheet values to locate the target row and check for a pre-filled invoice number
        const getRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/'${targetSheet}'!A1:Z`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        let targetRowIndex = null;
        let factuurNummer = null;
        let sheetRows = [];

        if (getRes.ok) {
            const getJson = await getRes.json();
            sheetRows = getJson.values || [];
        }

        if (sheetRows.length > 0) {
            const headerRow = sheetRows[0] || [];
            const headers = headerRow.map(h => String(h || '').toLowerCase().trim());
            
            const getIdx = (keywords) => headers.findIndex(h => keywords.some(kw => h.includes(kw)));
            
            const datumIdx = getIdx(['datum', 'date']);
            const descIdx = getIdx(['omschrijving', 'beschrijving']);
            const clientIdx = getIdx(['klant', 'relatie', 'naam', 'debiteur', 'leverancier']);
            const factuurIdx = getIdx(['factuur', 'nr', 'nummer']);

            // Find the target row using the same logic as storage.js
            for (let i = 1; i < sheetRows.length; i++) {
                const row = sheetRows[i] || [];
                
                // Stop if we see 'Totalen' sentinel
                const isTotalenSentinel = row.some(cell => {
                    const val = String(cell || '').trim().toLowerCase();
                    return val === 'totalen' || val === 'totaal';
                });
                if (isTotalenSentinel) {
                    targetRowIndex = i + 1;
                    break;
                }

                let isEmpty = true;
                if (headers.length > 0) {
                    const hasDatum = datumIdx !== -1 && row[datumIdx] !== undefined && String(row[datumIdx]).trim() !== '';
                    const hasDesc = descIdx !== -1 && row[descIdx] !== undefined && String(row[descIdx]).trim() !== '';
                    const hasClient = clientIdx !== -1 && row[clientIdx] !== undefined && String(row[clientIdx]).trim() !== '';
                    
                    let hasAmount = false;
                    headers.forEach((h, idx) => {
                        if (h.includes('totaal') || h.includes('bedrag') || h.includes('omzet') || h.includes('btw') || h.includes('excl') || h.includes('vergoeding') || h.includes('voorbelasting')) {
                            if (row[idx] !== undefined && String(row[idx]).trim() !== '' && String(row[idx]).trim() !== '0' && String(row[idx]).trim() !== '0,00') {
                                hasAmount = true;
                            }
                        }
                    });

                    if (hasDatum || hasDesc || hasClient || hasAmount) {
                        isEmpty = false;
                    }
                } else {
                    for (let colIdx = 0; colIdx < row.length; colIdx++) {
                        if (colIdx === 1) continue; // Skip Factuurnummer in fallback
                        const val = String(row[colIdx] || '').trim();
                        if (val !== '' && val !== '0' && val !== '0,00') {
                            isEmpty = false;
                            break;
                        }
                    }
                }

                if (isEmpty) {
                    targetRowIndex = i + 1;
                    const fIdx = factuurIdx !== -1 ? factuurIdx : 1;
                    if (row[fIdx] && String(row[fIdx]).trim() !== '') {
                        factuurNummer = String(row[fIdx]).trim();
                    }
                    break;
                }
            }
            
            if (!targetRowIndex) {
                targetRowIndex = sheetRows.length + 1;
            }
        } else {
            targetRowIndex = 2; // Default if sheet is empty
        }

        // If target row doesn't have a pre-filled invoice number, generate the next one
        if (!factuurNummer) {
            let maxSeq = null;
            const factuurIdx = sheetRows[0] ? sheetRows[0].map(h => String(h || '').toLowerCase().trim()).findIndex(h => h.includes('factuur') || h.includes('nr') || h.includes('nummer')) : 1;
            const fIdx = factuurIdx !== -1 ? factuurIdx : 1;

            for (const row of sheetRows) {
                const val = row[fIdx];
                if (val && typeof val === 'string' && val.startsWith(`${currentYear}.`)) {
                    const parts = val.split('.');
                    if (parts.length === 2) {
                        const seq = parseInt(parts[1], 10);
                        if (!isNaN(seq) && (maxSeq === null || seq > maxSeq)) maxSeq = seq;
                    }
                }
            }

            if (maxSeq !== null) {
                factuurNummer = `${currentYear}.${String(maxSeq + 1).padStart(3, '0')}`;
            } else if (targetSheet.startsWith('Jan')) {
                factuurNummer = `${currentYear}.001`;
            } else if (prevSheet) {
                // Fetch from previous sheet
                const prevRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/'${prevSheet}'!A1:Z`, {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                if (prevRes.ok) {
                    const prevJson = await prevRes.json();
                    const prevRows = prevJson.values || [];
                    const prevFactuurIdx = prevRows[0] ? prevRows[0].map(h => String(h || '').toLowerCase().trim()).findIndex(h => h.includes('factuur') || h.includes('nr') || h.includes('nummer')) : 1;
                    const pfIdx = prevFactuurIdx !== -1 ? prevFactuurIdx : 1;

                    for (const row of prevRows) {
                        const val = row[pfIdx];
                        if (val && typeof val === 'string' && val.startsWith(`${currentYear}.`)) {
                            const parts = val.split('.');
                            if (parts.length === 2) {
                                const seq = parseInt(parts[1], 10);
                                if (!isNaN(seq) && (maxSeq === null || seq > maxSeq)) maxSeq = seq;
                            }
                        }
                    }
                }
                if (maxSeq !== null) {
                    factuurNummer = `${currentYear}.${String(maxSeq + 1).padStart(3, '0')}`;
                } else {
                    factuurNummer = `${currentYear}.001`;
                }
            } else {
                factuurNummer = `${currentYear}.001`;
            }
        }
        
        // 2. Fetch all travel values to generate PDF
        const travelDays = parseInt(document.getElementById('travel-days').value) || 0;
        const travelDistance = parseFloat(document.getElementById('travel-distance').value) || 0;
        const travelRate = parseFloat(document.getElementById('travel-rate').value) || 0;
        const travelAmount = travelDays * travelDistance * travelRate;

        // Gather final lesson rows
        const finalizedRows = invoicedEvents.map((e, index) => ({
            week: e.week,
            datum: document.getElementById(`event-date-${index}`).value || e.datum,
            lokatie: document.getElementById(`event-location-${index}`).value || e.lokatie,
            activiteit: document.getElementById(`event-activity-${index}`).value || e.activiteit,
            instrument: document.getElementById(`event-instrument-${index}`).value || e.instrument,
            uren: parseFloat(document.getElementById(`event-hours-${index}`).value) || 0,
            tarief: parseFloat(document.getElementById(`event-rate-${index}`).value) || 0,
        }));

        let lessonsSubtotal = 0;
        finalizedRows.forEach(r => {
            lessonsSubtotal += r.uren * r.tarief;
        });
        
        const invoiceTotal = lessonsSubtotal + travelAmount;

        // 3. Generate PDF element
        const invoiceElement = buildInvoiceDOM({
            type: 'lesgeven',
            factuurNummer,
            invoiceDate: invoiceDateVal,
            clientInfo: {
                name: 'Muziekcentrum Zuidoost',
                attention: 'Boekhouding',
                address: 'Hofgeest 139',
                city: '1102EG Amsterdam ZO'
            },
            items: finalizedRows,
            totals: {
                subtotal: lessonsSubtotal,
                travelDays,
                travelDistance,
                travelRate,
                travelAmount,
                total: invoiceTotal
            }
        });

        const MONTH_NAMES_DUTCH = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
        const calendarD = getGlobalTargetDate();
        const calendarMaandNaam = MONTH_NAMES_DUTCH[calendarD.getMonth()];
        const calendarYear = calendarD.getFullYear();
        const calendarYear2 = String(calendarYear).slice(-2);

        const invoiceYear2 = String(invoiceD.getFullYear()).slice(-2);
        const factuurNummerFilename = factuurNummer.replace('.', '-');
        const pdfFileName = `BFE${invoiceYear2}FR ${factuurNummerFilename} lesgeven ${calendarMaandNaam} '${calendarYear2}`;

        await generateAndUploadPDF(invoiceElement, pdfFileName);

        // 5. Book row in Google Sheets (Verkoop <maand>)
        const formData = {
            datum: invoiceDateVal,
            leverancier: 'MZO',
            omschrijving: `lesgeven ${calendarMaandNaam} ${calendarYear}`,
            factuurBedrag: invoiceTotal,
        };

        const itemData = {
            btwLaag: 0,
            btwHoog: 0,
            omzetLaag: 0,
            omzetHoog: 0,
            omzetNul: invoiceTotal,
        };

        const headers = await getSheetHeaders(targetSheet);
        const rowValues = constructSheetRow('verkoop', formData, itemData, factuurNummer, headers);
        await insertRowInSheet(targetSheet, rowValues, targetRowIndex);

        // 6. Update Calendar Events in Google Calendar
        const calendarErrors = [];
        let updatedCount = 0;
        for (const event of invoicedEvents) {
            if (event.id) {
                try {
                    await updateCalendarEventInvoiceStatus(event.id, factuurNummer);
                    updatedCount++;
                } catch (calendarErr) {
                    console.error(`Fout bij bijwerken agenda-afspraak ${event.id}:`, calendarErr);
                    calendarErrors.push(`${event.datum} (${event.activiteit}): ${calendarErr.message}`);
                }
            }
        }

        if (calendarErrors.length > 0) {
            alert(`Factuur ${factuurNummer} succesvol gegenereerd, gedownload en opgeslagen!\n\n- Opgeslagen in Drive\n- Geboekt in Sheet: ${targetSheet}\n\n⚠️ LET OP: Het bijwerken van de omschrijving in Google Calendar is (gedeeltelijk) mislukt:\n\n${calendarErrors.join('\n')}`);
        } else {
            alert(`Factuur ${factuurNummer} succesvol gegenereerd, gedownload en opgeslagen!\n\n- Opgeslagen in Drive\n- Geboekt in Sheet: ${targetSheet}\n- ${updatedCount} agenda-afspraken in Google Calendar bijgewerkt.`);
        }
        
        // Clear queue
        invoicedEvents = [];
        renderEventsTable();

    } catch (err) {
        console.error('Fout bij genereren factuur:', err);
        alert(`Er ging iets mis bij het genereren of opslaan van de factuur: ${err.message}`);
    } finally {
        setLoading(false);
    }
}



async function handleGenerateRentInvoices() {
    const invoiceDateVal = new Date().toISOString().split('T')[0]; // Altijd de huidige datum

    const btn = document.getElementById('btn-generate-rent');
    const setLoading = (loading) => {
        if (!btn) return;
        btn.disabled = loading;
        btn.innerHTML = loading
            ? '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Bezig met genereren & boeken...'
            : '<i data-lucide="printer" class="w-4 h-4"></i> Huurfacturen Genereren & Boeken';
        if (window.lucide) window.lucide.createIcons();
    };

    if (!accessToken) {
        alert('Niet ingelogd met Google. Klik eerst op "Sync Drive" om in te loggen.');
        return;
    }

    setLoading(true);

    try {
        // Group the rent items by tenantKey
        const tenantGroups = {};
        rentItems.forEach(item => {
            if (!tenantGroups[item.tenantKey]) {
                tenantGroups[item.tenantKey] = {
                    clientName: item.clientName,
                    attention: item.attention,
                    address: item.address,
                    city: item.city,
                    fileNamePrefix: item.fileNamePrefix,
                    sheetDescription: item.sheetDescription,
                    items: []
                };
            }
            tenantGroups[item.tenantKey].items.push(item);
        });

        const generatedList = [];

        // Run sequentially to prevent race conditions on invoice numbers and row indexes
        for (const key of Object.keys(tenantGroups)) {
            const group = tenantGroups[key];
            
            // Clear sheet caches so we get fresh data
            clearSheetCaches();

            // Deriving target sheet
            const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'June', 'July', 'August', 'Sep', 'Okt', 'Nov', 'Dec'];
            const invoiceD = new Date(invoiceDateVal);
            const targetMonthIndex = invoiceD.getMonth();
            const currentYear = invoiceD.getFullYear();
            const targetSheet = `${MONTH_NAMES[targetMonthIndex]} Verkoop`;
            
            const prevMonthIndex = targetMonthIndex === 0 ? 11 : targetMonthIndex - 1;
            const prevSheet = `${MONTH_NAMES[prevMonthIndex]} Verkoop`;

            // Fetch target sheet to find empty row & calculate next invoice number
            const getRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/'${targetSheet}'!A1:Z`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });

            let targetRowIndex = null;
            let factuurNummer = null;
            let sheetRows = [];

            if (getRes.ok) {
                const getJson = await getRes.json();
                sheetRows = getJson.values || [];
            }

            if (sheetRows.length > 0) {
                const headerRow = sheetRows[0] || [];
                const headers = headerRow.map(h => String(h || '').toLowerCase().trim());
                
                const getIdx = (keywords) => headers.findIndex(h => keywords.some(kw => h.includes(kw)));
                
                const datumIdx = getIdx(['datum', 'date']);
                const descIdx = getIdx(['omschrijving', 'beschrijving']);
                const clientIdx = getIdx(['klant', 'relatie', 'naam', 'debiteur', 'leverancier']);
                const factuurIdx = getIdx(['factuur', 'nr', 'nummer']);

                for (let i = 1; i < sheetRows.length; i++) {
                    const row = sheetRows[i] || [];
                    
                    const isTotalenSentinel = row.some(cell => {
                        const val = String(cell || '').trim().toLowerCase();
                        return val === 'totalen' || val === 'totaal';
                    });
                    if (isTotalenSentinel) {
                        targetRowIndex = i + 1;
                        break;
                    }

                    let isEmpty = true;
                    if (headers.length > 0) {
                        const hasDatum = datumIdx !== -1 && row[datumIdx] !== undefined && String(row[datumIdx]).trim() !== '';
                        const hasDesc = descIdx !== -1 && row[descIdx] !== undefined && String(row[descIdx]).trim() !== '';
                        const hasClient = clientIdx !== -1 && row[clientIdx] !== undefined && String(row[clientIdx]).trim() !== '';
                        
                        let hasAmount = false;
                        headers.forEach((h, idx) => {
                            if (h.includes('totaal') || h.includes('bedrag') || h.includes('omzet') || h.includes('btw') || h.includes('excl') || h.includes('vergoeding') || h.includes('voorbelasting')) {
                                if (row[idx] !== undefined && String(row[idx]).trim() !== '' && String(row[idx]).trim() !== '0' && String(row[idx]).trim() !== '0,00') {
                                    hasAmount = true;
                                }
                            }
                        });

                        if (hasDatum || hasDesc || hasClient || hasAmount) {
                            isEmpty = false;
                        }
                    } else {
                        for (let colIdx = 0; colIdx < row.length; colIdx++) {
                            if (colIdx === 1) continue;
                            const val = String(row[colIdx] || '').trim();
                            if (val !== '' && val !== '0' && val !== '0,00') {
                                isEmpty = false;
                                break;
                            }
                        }
                    }

                    if (isEmpty) {
                        targetRowIndex = i + 1;
                        const fIdx = factuurIdx !== -1 ? factuurIdx : 1;
                        if (row[fIdx] && String(row[fIdx]).trim() !== '') {
                            factuurNummer = String(row[fIdx]).trim();
                        }
                        break;
                    }
                }
                
                if (!targetRowIndex) {
                    targetRowIndex = sheetRows.length + 1;
                }
            } else {
                targetRowIndex = 2;
            }

            if (!factuurNummer) {
                let maxSeq = null;
                const factuurIdx = sheetRows[0] ? sheetRows[0].map(h => String(h || '').toLowerCase().trim()).findIndex(h => h.includes('factuur') || h.includes('nr') || h.includes('nummer')) : 1;
                const fIdx = factuurIdx !== -1 ? factuurIdx : 1;

                for (const row of sheetRows) {
                    const val = row[fIdx];
                    if (val && typeof val === 'string' && val.startsWith(`${currentYear}.`)) {
                        const parts = val.split('.');
                        if (parts.length === 2) {
                            const seq = parseInt(parts[1], 10);
                            if (!isNaN(seq) && (maxSeq === null || seq > maxSeq)) maxSeq = seq;
                        }
                    }
                }

                if (maxSeq !== null) {
                    factuurNummer = `${currentYear}.${String(maxSeq + 1).padStart(3, '0')}`;
                } else if (targetSheet.startsWith('Jan')) {
                    factuurNummer = `${currentYear}.001`;
                } else if (prevSheet) {
                    const prevRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/'${prevSheet}'!A1:Z`, {
                        headers: { 'Authorization': `Bearer ${accessToken}` }
                    });
                    if (prevRes.ok) {
                        const prevJson = await prevRes.json();
                        const prevRows = prevJson.values || [];
                        const prevFactuurIdx = prevRows[0] ? prevRows[0].map(h => String(h || '').toLowerCase().trim()).findIndex(h => h.includes('factuur') || h.includes('nr') || h.includes('nummer')) : 1;
                        const pfIdx = prevFactuurIdx !== -1 ? prevFactuurIdx : 1;

                        for (const row of prevRows) {
                            const val = row[pfIdx];
                            if (val && typeof val === 'string' && val.startsWith(`${currentYear}.`)) {
                                const parts = val.split('.');
                                if (parts.length === 2) {
                                    const seq = parseInt(parts[1], 10);
                                    if (!isNaN(seq) && (maxSeq === null || seq > maxSeq)) maxSeq = seq;
                                }
                            }
                        }
                    }
                    if (maxSeq !== null) {
                        factuurNummer = `${currentYear}.${String(maxSeq + 1).padStart(3, '0')}`;
                    } else {
                        factuurNummer = `${currentYear}.001`;
                    }
                } else {
                    factuurNummer = `${currentYear}.001`;
                }
            }

            // Calculate totals
            let subtotal = 0;
            group.items.forEach(item => {
                subtotal += item.amount;
            });
            const btwRate = group.items[0]?.btwRate || 21;
            const btwAmount = subtotal * (btwRate / 100);
            const total = subtotal + btwAmount;

            // Generate DOM
            const invoiceElement = buildInvoiceDOM({
                type: 'rent',
                factuurNummer,
                invoiceDate: invoiceDateVal,
                clientInfo: {
                    name: group.clientName,
                    attention: group.attention,
                    address: group.address,
                    city: group.city
                },
                items: group.items,
                totals: {
                    subtotal,
                    btwAmount,
                    total
                }
            });

            const factuurNummerFilename = factuurNummer.replace('.', '-');
            const MONTH_NAMES_DUTCH = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
            const calendarMaandNaam = MONTH_NAMES_DUTCH[invoiceD.getMonth()];
            const calendarYear2 = String(invoiceD.getFullYear()).slice(-2);
            
            const pdfFileName = `BFE${calendarYear2}FR ${factuurNummerFilename} ${group.fileNamePrefix} ${calendarMaandNaam} '${calendarYear2}`;

            await generateAndUploadPDF(invoiceElement, pdfFileName);

            // Book row in Google Sheets
            const headers = await getSheetHeaders(targetSheet);
            const formData = {
                datum: invoiceDateVal,
                leverancier: group.clientName,
                omschrijving: `${group.sheetDescription} ${calendarMaandNaam} ${invoiceD.getFullYear()}`,
                factuurBedrag: total,
                btw: btwAmount
            };
            const itemData = {
                btwLaag: 0,
                btwHoog: btwAmount,
                omzetLaag: 0,
                omzetHoog: subtotal,
                omzetNul: 0
            };
            const rowValues = constructSheetRow('verkoop', formData, itemData, factuurNummer, headers);
            await insertRowInSheet(targetSheet, rowValues, targetRowIndex);

            generatedList.push(`Factuur ${factuurNummer} (${group.clientName})`);
        }

        alert(`Huurfacturen succesvol gegenereerd, gedownload en opgeslagen!\n\n${generatedList.map(item => `- ${item}`).join('\n')}\n\n- Opgeslagen in Drive\n- Geboekt in Sheet.`);
    } catch (err) {
        console.error('Fout bij genereren huurfacturen:', err);
        alert(`Er ging iets mis bij het genereren of opslaan van de huurfacturen: ${err.message}`);
    } finally {
        setLoading(false);
    }
}



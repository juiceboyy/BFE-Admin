import { fetchCalendarEvents, parseEventsForInvoicing, updateCalendarEventInvoiceStatus } from '../api/calendar.js';
import { getGlobalTargetDate, getTargetDateInfo } from '../utils/date.js';
import { findInvoiceTargetRowAndNumber } from '../api/storage-queries-invoices.js';
import { clearSheetCaches } from '../api/storage.js';
import { constructSheetRow, processItemSave } from './scanner-helpers.js';
import { buildInvoiceDOM } from '../utils/invoice-layouts.js';
import { generateAndUploadPDF } from '../utils/pdf-generator.js';

let invoicedEvents = [];

export function initLessonsInvoices() {
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
        alert('Vul a.b.w. alle uren in voor de lessen.');
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
        clearSheetCaches();

        const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'June', 'July', 'August', 'Sep', 'Okt', 'Nov', 'Dec'];
        const invoiceD = new Date(invoiceDateVal);
        const targetMonthIndex = invoiceD.getMonth();
        const currentYear = invoiceD.getFullYear();
        const targetSheet = `${MONTH_NAMES[targetMonthIndex]} Verkoop`;
        
        const prevMonthIndex = targetMonthIndex === 0 ? 11 : targetMonthIndex - 1;
        const prevSheet = `${MONTH_NAMES[prevMonthIndex]} Verkoop`;

        const { targetRowIndex, factuurNummer } = await findInvoiceTargetRowAndNumber(targetSheet, prevSheet, currentYear);
        
        const travelDays = parseInt(document.getElementById('travel-days').value) || 0;
        const travelDistance = parseFloat(document.getElementById('travel-distance').value) || 0;
        const travelRate = parseFloat(document.getElementById('travel-rate').value) || 0;
        const travelAmount = travelDays * travelDistance * travelRate;

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
        const sheetOmschrijving = `lesgeven ${calendarMaandNaam} '${calendarYear2}`;
        const pdfFileName = `BFE${invoiceYear2}FR ${factuurNummer} ${sheetOmschrijving}`;

        const pdfBlob = await generateAndUploadPDF(invoiceElement, pdfFileName);
        const pdfFile = new File([pdfBlob], `${pdfFileName}.pdf`, { type: 'application/pdf' });

        const formData = {
            datum: invoiceDateVal,
            leverancier: 'MZO',
            omschrijving: sheetOmschrijving,
            factuurBedrag: invoiceTotal,
        };

        const itemData = {
            btwLaag: 0,
            btwHoog: 0,
            omzetLaag: 0,
            omzetHoog: 0,
            omzetNul: invoiceTotal,
        };

        const dateInfo = { targetSheet };
        await processItemSave(pdfFile, formData, itemData, 'verkoop', factuurNummer, dateInfo);

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
        
        invoicedEvents = [];
        renderEventsTable();
    } catch (err) {
        console.error('Fout bij genereren factuur:', err);
        alert(`Er ging iets mis bij het genereren of opslaan van de factuur: ${err.message}`);
    } finally {
        setLoading(false);
    }
}

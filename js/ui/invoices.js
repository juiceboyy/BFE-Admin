import { fetchCalendarEvents, parseEventsForInvoicing, updateCalendarEventInvoiceStatus } from '../api/calendar.js';
import { getGlobalTargetDate, getTargetDateInfo } from '../utils/date.js';
import { getNextInvoiceNumberFromCloud } from '../api/storage-queries.js';
import { uploadToDrive, insertRowInSheet, getSheetHeaders, clearSheetCaches, SPREADSHEET_ID } from '../api/storage.js';
import { constructSheetRow } from './scanner-helpers.js';
import { accessToken } from '../api/auth.js';

let invoicedEvents = [];

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

        // 3. Generate PDF element offscreen inside a container to prevent browser squishing
        const invoiceElement = buildInvoiceDOM(factuurNummer, invoiceDateVal, finalizedRows, lessonsSubtotal, travelDays, travelDistance, travelRate, travelAmount, invoiceTotal);
        
        const container = document.createElement('div');
        container.style.position = 'absolute';
        container.style.left = '0';
        container.style.top = '0';
        container.style.zIndex = '-9999';
        container.style.width = '794px';
        container.style.overflow = 'hidden';
        
        container.appendChild(invoiceElement);
        document.body.appendChild(container);

        const opt = {
            margin:       0,
            filename:     `${factuurNummer} - Muziekcentrum Zuidoost.pdf`,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { 
                scale: 2, 
                useCORS: true, 
                scrollX: 0, 
                scrollY: 0,
                windowWidth: 800,
                windowHeight: 1200
            },
            jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        const pdfWorker = html2pdf().from(invoiceElement).set(opt);
        await pdfWorker.save();
        
        const pdfBlob = await pdfWorker.outputPdf('blob');
        const pdfFile = new File([pdfBlob], `${factuurNummer} - Muziekcentrum Zuidoost.pdf`, { type: 'application/pdf' });

        document.body.removeChild(container);

        // 4. Upload PDF to Google Drive
        await uploadToDrive(pdfFile, `${factuurNummer} - Muziekcentrum Zuidoost`);

        // 5. Book row in Google Sheets (Verkoop <maand>)
        const formData = {
            datum: invoiceDateVal,
            leverancier: 'Muziekcentrum Zuidoost',
            omschrijving: 'Factuur lesgeven en reiskosten',
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
        for (const event of invoicedEvents) {
            if (event.id) {
                await updateCalendarEventInvoiceStatus(event.id, factuurNummer);
            }
        }

        alert(`Factuur ${factuurNummer} succesvol gegenereerd, gedownload en opgeslagen!\n\n- Opgeslagen in Drive\n- Geboekt in Sheet: ${targetSheet}\n- ${invoicedEvents.length} agenda-afspraken in Google Calendar bijgewerkt.`);
        
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

/**
 * Builds A4 DOM representation of the invoice.
 */
function buildInvoiceDOM(factuurNummer, invoiceDate, rows, lessonsSubtotal, travelDays, travelDistance, travelRate, travelAmount, invoiceTotal) {
    const el = document.createElement('div');
    el.style.width = '794px';
    el.style.minHeight = '1122px';
    el.style.boxSizing = 'border-box';
    el.style.padding = '20mm';
    el.style.backgroundColor = 'white';
    el.style.color = 'black';
    el.style.fontFamily = "'Inter', 'Helvetica Neue', Arial, sans-serif";
    el.style.fontSize = '13px';
    el.style.lineHeight = '1.45';

    const months = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
    const dObj = new Date(invoiceDate);
    const day = dObj.getDate();
    const monthName = months[dObj.getMonth()];
    const yearSuffix = String(dObj.getFullYear()).slice(-2);
    const dateFormatted = `Zoetermeer, ${day} ${monthName} '${yearSuffix}`;

    const formatDutchBedrag = (val) => {
        if (val % 1 === 0) return `${val},=`;
        return new Intl.NumberFormat('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
    };

    const formatDutchTarief = (val) => {
        if (val % 1 === 0) return `${val},=`;
        return new Intl.NumberFormat('nl-NL', { minimumFractionDigits: 2 }).format(val);
    };

    const tableRowsHTML = rows.map(r => `
        <tr style="border-bottom: 1px solid #000;">
            <td style="border-left: 1px solid #000; border-right: 1px solid #000; padding: 6px 8px; text-align: center; font-size: 12px;">${r.week}</td>
            <td style="border-right: 1px solid #000; padding: 6px 8px; font-size: 12px;">${r.datum}</td>
            <td style="border-right: 1px solid #000; padding: 6px 8px; font-size: 12px;">${r.lokatie}</td>
            <td style="border-right: 1px solid #000; padding: 6px 8px; font-size: 12px;">${r.activiteit}</td>
            <td style="border-right: 1px solid #000; padding: 6px 8px; font-size: 12px;">${r.instrument}</td>
            <td style="border-right: 1px solid #000; padding: 6px 8px; text-align: right; font-size: 12px;">${String(r.uren).replace('.', ',')}</td>
            <td style="border-right: 1px solid #000; padding: 6px 8px; text-align: right; font-size: 12px;">${formatDutchTarief(r.tarief)}</td>
            <td style="border-right: 1px solid #000; padding: 6px 8px; text-align: right; font-weight: 500; font-size: 12px;">${formatDutchBedrag(r.uren * r.tarief)}</td>
        </tr>
    `).join('');

    el.innerHTML = `
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 50px;">
            <div>
                <h1 style="font-size: 28px; font-weight: bold; margin: 0 0 10px 0; color: #000; letter-spacing: -0.5px;">Big Fish Entertainment</h1>
                <p style="margin: 0; font-weight: 500; font-size: 14px;">Ronald van Holst</p>
                <p style="margin: 2px 0 0 0; font-size: 13px; color: #333;">Kortlandpad 62</p>
                <p style="margin: 2px 0 15px 0; font-size: 13px; color: #333;">2729DN Zoetermeer</p>
                <p style="margin: 0; font-size: 12px; color: #555;">tel.: 06 2888 4143</p>
                <p style="margin: 2px 0 0 0; font-size: 12px; color: #555;">BTW nr. NL1359.33.729.B.01</p>
                <p style="margin: 2px 0 0 0; font-size: 12px; color: #555;">KvK nr: 34393338</p>
            </div>
            
            <div style="margin-top: 5px;">
                <svg width="140" height="92" viewBox="0 0 150 100" xmlns="http://www.w3.org/2000/svg">
                    <rect x="5" y="5" width="140" height="90" fill="white" stroke="#E30613" stroke-width="8" />
                    <path d="M 32,50 C 52,32 88,32 108,50 C 88,68 52,68 32,50 Z" fill="black" />
                    <path d="M 108,50 L 123,38 L 123,62 Z" fill="black" />
                    <circle cx="47" cy="50" r="3.5" fill="white" />
                </svg>
            </div>
        </div>

        <!-- Address details -->
        <div style="margin-bottom: 40px; font-size: 13px;">
            <table style="width: 100%; border-collapse: collapse;">
                <tr>
                    <td style="width: 18%; vertical-align: top; font-weight: bold; color: #333;">Factuur voor:</td>
                    <td style="width: 47%; vertical-align: top; line-height: 1.45;">
                        <strong style="font-size: 14px; color: #000;">Muziekcentrum Zuidoost</strong><br>
                        Boekhouding<br>
                        Hofgeest 139<br>
                        1102EG Amsterdam ZO
                    </td>
                    <td style="width: 35%; vertical-align: bottom; text-align: right; font-weight: 500; font-size: 13px;">
                        ${dateFormatted}
                    </td>
                </tr>
            </table>
        </div>

        <!-- Invoice Title Block -->
        <div style="margin-bottom: 30px; text-align: center; border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 12px 0;">
            <h2 style="font-size: 20px; font-weight: bold; margin: 0; letter-spacing: 0.5px;">Factuur ${factuurNummer}</h2>
            <p style="margin: 4px 0 0 0; font-size: 12px; color: #333;">Gelieve bij betaling dit nummer te vermelden</p>
        </div>

        <!-- Lesson items Table -->
        <div style="margin-bottom: 30px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 12px; border: 1px solid #000;">
                <thead>
                    <tr style="border-bottom: 1px solid #000; font-weight: bold; background-color: #fff;">
                        <th style="border-left: 1px solid #000; border-right: 1px solid #000; padding: 6px 8px; text-align: center; width: 6%;">Week</th>
                        <th style="border-right: 1px solid #000; padding: 6px 8px; width: 10%; text-align: left;">Datum</th>
                        <th style="border-right: 1px solid #000; padding: 6px 8px; width: 15%; text-align: left;">Lokatie</th>
                        <th style="border-right: 1px solid #000; padding: 6px 8px; width: 25%; text-align: left;">Activiteit</th>
                        <th style="border-right: 1px solid #000; padding: 6px 8px; width: 15%; text-align: left;">Instrument</th>
                        <th style="border-right: 1px solid #000; padding: 6px 8px; width: 8%; text-align: right;">Uren</th>
                        <th style="border-right: 1px solid #000; padding: 6px 8px; width: 10%; text-align: right;">Tarief</th>
                        <th style="border-right: 1px solid #000; padding: 6px 8px; width: 11%; text-align: right;">Bedrag</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRowsHTML}
                    <tr style="font-weight: bold; border-top: 1px solid #000; background-color: #fff;">
                        <td style="border-left: 1px solid #000; border-right: 1px solid #000; padding: 6px 8px;"></td>
                        <td style="border-right: 1px solid #000; padding: 6px 8px;"></td>
                        <td style="border-right: 1px solid #000; padding: 6px 8px;"></td>
                        <td style="border-right: 1px solid #000; padding: 6px 8px;">Subtotaal</td>
                        <td style="border-right: 1px solid #000; padding: 6px 8px;"></td>
                        <td style="border-right: 1px solid #000; padding: 6px 8px;"></td>
                        <td style="border-right: 1px solid #000; padding: 6px 8px;"></td>
                        <td style="border-right: 1px solid #000; padding: 6px 8px; text-align: right;">${formatDutchBedrag(lessonsSubtotal)}</td>
                    </tr>
                </tbody>
            </table>
        </div>

        <!-- Summary & Totals -->
        <div style="margin-top: 35px; margin-bottom: 40px; font-size: 13px; line-height: 1.6;">
            <table style="width: 100%; border-collapse: collapse;">
                <tr>
                    <td style="width: 60%; padding-bottom: 5px; color: #333;">Reiskosten (${travelDays} x ${travelDistance} km à ${travelRate.toFixed(2).replace('.', ',')} ct/km)</td>
                    <td style="width: 40%; text-align: right; font-weight: bold; padding-bottom: 5px;">€ ${formatDutchBedrag(travelAmount)}</td>
                </tr>
                <tr>
                    <td style="padding-bottom: 5px; font-weight: bold;">Subtotaal ex BTW</td>
                    <td style="text-align: right; font-weight: bold; padding-bottom: 5px;">€ ${formatDutchBedrag(invoiceTotal)}</td>
                </tr>
                <tr>
                    <td style="padding-bottom: 5px; color: #555; font-style: italic;">BTW (btw vrijgesteld, onderwijs aan leerlingen onder de 21 jaar)</td>
                    <td style="text-align: right; font-weight: bold; padding-bottom: 5px; color: #555;">€ nihil</td>
                </tr>
                <tr style="font-size: 15px; font-weight: bold; border-top: 1.5px solid #000; border-bottom: 1.5px solid #000;">
                    <td style="padding: 8px 0;">Totaal</td>
                    <td style="text-align: right; padding: 8px 0;">€ ${formatDutchBedrag(invoiceTotal)}</td>
                </tr>
            </table>
        </div>

        <!-- Payment Terms Footer -->
        <div style="margin-top: 45px; font-size: 12.5px; line-height: 1.5; border-top: 1px solid #eee; padding-top: 15px;">
            <p style="margin: 0; color: #111;">
                Betalingswijze: per bank IBAN <strong>NL47INGB0005023386</strong> tnv <strong>Ronald van Holst te Zoetermeer</strong>, ovv factuurnummer.
            </p>
            <p style="margin: 4px 0 0 0; font-weight: bold; color: #000;">
                Te betalen binnen 15 dagen na ontvangst factuur.
            </p>
        </div>
    `;

    return el;
}

import { getGlobalTargetDate } from '../utils/date.js';
import { findInvoiceTargetRowAndNumber } from '../api/storage-queries-invoices.js';
import { insertRowInSheet, getSheetHeaders, clearSheetCaches, SPREADSHEET_ID } from '../api/storage.js';
import { constructSheetRow } from './scanner-helpers.js';
import { accessToken } from '../api/auth.js';
import { buildInvoiceDOM, generateAndUploadPDF } from '../utils/pdf-generator.js';

let rentItems = [];

export function initStudioInvoices() {
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

            const { targetRowIndex, factuurNummer } = await findInvoiceTargetRowAndNumber(targetSheet, prevSheet, currentYear);

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

import { accessToken } from '../api/auth.js';
import { clearSheetCaches } from '../api/storage.js';
import { MONTH_NAMES } from '../utils/date.js';
import { findInvoiceTargetRowAndNumber } from '../api/storage-queries-invoices.js';
import { processItemSave } from './scanner-helpers.js';
import { buildInvoiceDOM } from '../utils/invoice-layouts.js';
import { generateAndUploadPDF } from '../utils/pdf-generator.js';
import { getCurrentManualClientInfo } from './invoices-manual-helpers.js';

/**
 * Validates, generates PDF, uploads to Drive, and books a manual invoice into Google Sheets.
 * @param {Array<{desc: string, amount: number, btwRate: number|string}>} manualItems
 * @param {Function} onSuccess
 */
export async function submitManualInvoice(manualItems, onSuccess) {
    const {
        name: clientName,
        attention: clientAttention,
        address: clientAddress,
        city: clientCity
    } = getCurrentManualClientInfo();
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

        const invoiceD = new Date(invoiceDateVal);
        const targetMonthIndex = invoiceD.getMonth();
        const currentYear = invoiceD.getFullYear();
        const targetSheet = `${MONTH_NAMES[targetMonthIndex]} Verkoop`;

        const prevMonthIndex = targetMonthIndex === 0 ? 11 : targetMonthIndex - 1;
        const prevSheet = `${MONTH_NAMES[prevMonthIndex]} Verkoop`;

        const { factuurNummer } = await findInvoiceTargetRowAndNumber(targetSheet, prevSheet, currentYear);

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
                omzetNul += item.amount;
            }
        });

        const invoiceTotal = subtotal + btw21 + btw9;

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

        const invoiceYear2 = String(invoiceD.getFullYear()).slice(-2);
        const factuurNummerFilename = factuurNummer.replace('.', '-');
        const sheetOmschrijving = bookingDesc.trim();
        const pdfFileName = `BFE${invoiceYear2}FR ${factuurNummerFilename} ${sheetOmschrijving}`;

        const pdfBlob = await generateAndUploadPDF(invoiceElement, pdfFileName);
        const pdfFile = new File([pdfBlob], `${pdfFileName}.pdf`, { type: 'application/pdf' });

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

        await processItemSave(pdfFile, formData, itemData, 'verkoop', factuurNummer, { targetSheet });

        alert(`Factuur ${factuurNummer} succesvol gegenereerd, gedownload en opgeslagen!\n\n- Opgeslagen in Drive\n- Geboekt in Sheet: ${targetSheet}`);

        if (typeof onSuccess === 'function') {
            onSuccess();
        }
    } catch (err) {
        console.error('Fout bij genereren handmatige factuur:', err);
        alert(`Er ging iets mis bij het genereren of opslaan van de factuur: ${err.message}`);
    } finally {
        setLoading(false);
    }
}

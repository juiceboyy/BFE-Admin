import { 
    renderLesgevenSection, 
    renderRentSection, 
    renderManualSection,
    formatDutchBedrag,
    formatDutchTarief
} from './invoice-sections.js';

export { formatDutchBedrag, formatDutchTarief };

export const AMARE_DECLARATION_TEXT = 'De artiest of het gezelschap heeft ervoor gekozen om géén gebruik te maken van de artiestenregeling, dus om géén loonheffingen te laten afdragen en niet verzekerd te zijn voor de werknemersverzekeringen. Door deze keuze mag de opdrachtgever de gage voor het optreden bruto (als uitkoopsom) uitbetalen.';

/**
 * Checks whether the recipient is Amare based on client info fields.
 * @param {Object} clientInfo 
 * @returns {boolean}
 */
export function isAmareInvoice(clientInfo) {
    if (!clientInfo) return false;
    const name = String(clientInfo.name || '');
    const attention = String(clientInfo.attention || '');
    const address = String(clientInfo.address || '');
    const city = String(clientInfo.city || '');
    return /amare/i.test(name) || /amare/i.test(attention) || /amare/i.test(address) || /amare/i.test(city);
}

/**
 * Builds A4 DOM representation of the invoice.
 */
export function buildInvoiceDOM(config) {
    const {
        type, // 'lesgeven', 'rent', or 'manual'
        factuurNummer,
        invoiceDate,
        clientInfo, // { name, attention, address, city }
        items, // for lesgeven: { week, datum, lokatie, activiteit, instrument, uren, tarief }; for rent: { desc, amount }; for manual: { desc, amount, btwRate }
        totals // for lesgeven: { subtotal, travelDays, travelDistance, travelRate, travelAmount, total }; for rent: { subtotal, btwAmount, total }; for manual: { subtotal, btwBreakdown, total }
    } = config;

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

    // Recipient Address
    let recipientHTML = `
        <strong style="font-size: 14px; color: #000;">${clientInfo.name}</strong><br>
    `;
    if (clientInfo.attention) recipientHTML += `${clientInfo.attention}<br>`;
    recipientHTML += `${clientInfo.address}<br>${clientInfo.city}`;

    // Section Content
    let itemsHTML = '';
    let totalsHTML = '';

    if (type === 'lesgeven') {
        ({ itemsHTML, totalsHTML } = renderLesgevenSection(items, totals));
    } else if (type === 'rent') {
        ({ itemsHTML, totalsHTML } = renderRentSection(items, totals));
    } else if (type === 'manual') {
        ({ itemsHTML, totalsHTML } = renderManualSection(items, totals));
    }

    const hasAmareDeclaration = config.isAmare ||
        config.includeArtistDeclaration ||
        (config.optOutClause !== undefined ? config.optOutClause : isAmareInvoice(clientInfo));

    const artistDeclarationHTML = hasAmareDeclaration ? `
        <!-- Artist Declaration (Amare) -->
        <div style="margin-top: 25px; margin-bottom: 25px; padding: 10px 14px; border: 1px solid #d1d5db; background-color: #f9fafb; border-radius: 4px; font-size: 11.5px; line-height: 1.5; color: #1f2937;">
            <p style="margin: 0; font-style: italic;">
                ${AMARE_DECLARATION_TEXT}
            </p>
        </div>
    ` : '';

    const footerMarginTop = hasAmareDeclaration ? '25px' : '45px';

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
                <img src="images/logo.png" alt="Logo" style="width: 140px; height: auto; display: block;" />
            </div>
        </div>

        <!-- Address details -->
        <div style="margin-bottom: 40px; font-size: 13px;">
            <table style="width: 100%; border-collapse: collapse;">
                <tr>
                    <td style="width: 18%; vertical-align: top; font-weight: bold; color: #333;">Factuur voor:</td>
                    <td style="width: 47%; vertical-align: top; line-height: 1.45;">
                        ${recipientHTML}
                    </td>
                    <td style="width: 35%; vertical-align: bottom; text-align: right; font-weight: 500; font-size: 13px;">
                        ${dateFormatted}
                    </td>
                </tr>
            </table>
        </div>

        <!-- Invoice Title Block -->
        <div style="margin-bottom: 45px; text-align: center; border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 12px 0;">
            <h2 style="font-size: 20px; font-weight: bold; margin: 0; letter-spacing: 0.5px;">Factuur ${factuurNummer}</h2>
            <p style="margin: 4px 0 0 0; font-size: 12px; color: #333;">Gelieve bij betaling dit nummer te vermelden</p>
        </div>

        <!-- Items list/table -->
        ${itemsHTML}

        <!-- Summary & Totals -->
        <div style="margin-top: 25px; margin-bottom: 25px; font-size: 13px; line-height: 1.6;">
            ${totalsHTML}
        </div>

        ${artistDeclarationHTML}

        <!-- Payment Terms Footer -->
        <div style="margin-top: ${footerMarginTop}; font-size: 12.5px; line-height: 1.5; border-top: 1px solid #eee; padding-top: 15px;">
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

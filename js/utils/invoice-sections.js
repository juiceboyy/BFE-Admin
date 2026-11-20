/**
 * Invoice section generators for different invoice types.
 */

export function formatDutchBedrag(val) {
    if (val % 1 === 0) return `${val},=`;
    return new Intl.NumberFormat('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
}

export function formatDutchTarief(val) {
    if (val % 1 === 0) return `${val},=`;
    return new Intl.NumberFormat('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
}

export function renderLesgevenSection(items, totals) {
    const tableRowsHTML = items.map(r => `
        <tr style="border-bottom: 1px solid #000;">
            <td style="border-left: 1px solid #000; border-right: 1px solid #000; padding: 6px 5px; text-align: center; font-size: 12px; white-space: nowrap;">${r.week}</td>
            <td style="border-right: 1px solid #000; padding: 6px 5px; font-size: 12px; white-space: nowrap;">${r.datum}</td>
            <td style="border-right: 1px solid #000; padding: 6px 5px; font-size: 12px;">${r.lokatie}</td>
            <td style="border-right: 1px solid #000; padding: 6px 5px; font-size: 12px;">${r.activiteit}</td>
            <td style="border-right: 1px solid #000; padding: 6px 5px; font-size: 12px;">${r.instrument}</td>
            <td style="border-right: 1px solid #000; padding: 6px 5px; text-align: right; font-size: 12px; white-space: nowrap;">${String(r.uren).replace('.', ',')}</td>
            <td style="border-right: 1px solid #000; padding: 6px 5px; text-align: right; font-size: 12px; white-space: nowrap;">${formatDutchTarief(r.tarief)}</td>
            <td style="border-right: 1px solid #000; padding: 6px 5px; text-align: right; font-weight: 500; font-size: 12px; white-space: nowrap;">${formatDutchBedrag(r.uren * r.tarief)}</td>
        </tr>
    `).join('');

    const itemsHTML = `
        <div data-pdf-part="items-wrap" style="margin-bottom: 30px;">
            <table data-pdf-part="items-table" data-table-type="lesgeven" style="table-layout: fixed; width: 100%; border-collapse: collapse; font-size: 12px; border: 1px solid #000;">
                <thead>
                    <tr style="border-bottom: 1px solid #000; font-weight: bold; background-color: #fff;">
                        <th style="border-left: 1px solid #000; border-right: 1px solid #000; padding: 6px 5px; text-align: center; width: 7.5%; white-space: nowrap;">Week</th>
                        <th style="border-right: 1px solid #000; padding: 6px 5px; width: 10.5%; text-align: left; white-space: nowrap;">Datum</th>
                        <th style="border-right: 1px solid #000; padding: 6px 5px; width: 18.5%; text-align: left; white-space: nowrap;">Lokatie</th>
                        <th style="border-right: 1px solid #000; padding: 6px 5px; width: 24%; text-align: left; white-space: nowrap;">Activiteit</th>
                        <th style="border-right: 1px solid #000; padding: 6px 5px; width: 12.5%; text-align: left; white-space: nowrap;">Instrument</th>
                        <th style="border-right: 1px solid #000; padding: 6px 5px; width: 7%; text-align: right; white-space: nowrap;">Uren</th>
                        <th style="border-right: 1px solid #000; padding: 6px 5px; width: 9%; text-align: right; white-space: nowrap;">Tarief</th>
                        <th style="border-right: 1px solid #000; padding: 6px 5px; width: 11%; text-align: right; white-space: nowrap;">Bedrag</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRowsHTML}
                    <tr style="font-weight: bold; border-top: 1px solid #000; background-color: #fff;">
                        <td style="border-left: 1px solid #000; border-right: 1px solid #000; padding: 6px 5px;"></td>
                        <td style="border-right: 1px solid #000; padding: 6px 5px;"></td>
                        <td style="border-right: 1px solid #000; padding: 6px 5px;"></td>
                        <td style="border-right: 1px solid #000; padding: 6px 5px;">Subtotaal</td>
                        <td style="border-right: 1px solid #000; padding: 6px 5px;"></td>
                        <td style="border-right: 1px solid #000; padding: 6px 5px;"></td>
                        <td style="border-right: 1px solid #000; padding: 6px 5px;"></td>
                        <td style="border-right: 1px solid #000; padding: 6px 5px; text-align: right; white-space: nowrap;">${formatDutchBedrag(totals.subtotal)}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    `;

    const totalsHTML = `
        <table data-pdf-part="totals-table" style="width: 100%; border-collapse: collapse;">
            <tr>
                <td style="width: 78%; padding-bottom: 5px; color: #333;">Reiskosten (${totals.travelDays} x ${totals.travelDistance} km à ${totals.travelRate.toFixed(2).replace('.', ',')} ct/km)</td>
                <td style="width: 22%; text-align: right; font-weight: bold; padding-bottom: 5px; white-space: nowrap;">€ ${formatDutchBedrag(totals.travelAmount)}</td>
            </tr>
            <tr>
                <td style="padding-bottom: 5px; font-weight: bold;">Subtotaal ex BTW</td>
                <td style="text-align: right; font-weight: bold; padding-bottom: 5px; white-space: nowrap;">€ ${formatDutchBedrag(totals.total)}</td>
            </tr>
            <tr>
                <td style="padding-bottom: 5px; color: #555; font-style: italic;">BTW (btw vrijgesteld, onderwijs aan leerlingen onder de 21 jaar)</td>
                <td style="text-align: right; font-weight: bold; padding-bottom: 5px; color: #555; white-space: nowrap;">€ nihil</td>
            </tr>
            <tr data-pdf-part="totals-grand" style="font-size: 15px; font-weight: bold; border-top: 1.5px solid #000; border-bottom: 1.5px solid #000;">
                <td style="padding: 8px 0;">Totaal</td>
                <td style="text-align: right; padding: 8px 0; white-space: nowrap;">€ ${formatDutchBedrag(totals.total)}</td>
            </tr>
        </table>
    `;

    return { itemsHTML, totalsHTML };
}

export function renderRentSection(items, totals) {
    const itemsHTML = `
        <div data-pdf-part="items-wrap" style="margin-bottom: 40px; border-bottom: 1px solid #000; padding-bottom: 10px;">
            <table data-pdf-part="items-table" data-table-type="rent" style="width: 100%; border-collapse: collapse; font-size: 13px;">
                <tbody>
                    ${items.map(item => `
                        <tr>
                            <td style="padding: 8px 0; width: 75%; text-align: left; vertical-align: top;">${item.desc}</td>
                            <td style="padding: 8px 0; width: 25%; text-align: right; vertical-align: top; font-weight: 500; white-space: nowrap;">€ ${formatDutchBedrag(item.amount)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;

    const totalsHTML = `
        <table data-pdf-part="totals-table" style="width: 100%; border-collapse: collapse;">
            <tr>
                <td style="width: 78%; padding-bottom: 5px; color: #333;">Totaal ex BTW</td>
                <td style="width: 22%; text-align: right; font-weight: bold; padding-bottom: 5px; white-space: nowrap;">€ ${formatDutchBedrag(totals.subtotal)}</td>
            </tr>
            <tr>
                <td style="padding-bottom: 5px; color: #333;">Totaal btw (21%)</td>
                <td style="text-align: right; font-weight: bold; padding-bottom: 5px; white-space: nowrap;">€ ${formatDutchBedrag(totals.btwAmount)}</td>
            </tr>
            <tr data-pdf-part="totals-grand" style="font-size: 15px; font-weight: bold; border-top: 1.5px solid #000; border-bottom: 1.5px solid #000;">
                <td style="padding: 8px 0;">Totaal, inc. btw</td>
                <td style="text-align: right; padding: 8px 0; white-space: nowrap;">€ ${formatDutchBedrag(totals.total)}</td>
            </tr>
        </table>
    `;

    return { itemsHTML, totalsHTML };
}

export function renderManualSection(items, totals) {
    const tableRowsHTML = items.map(item => {
        let rateText = '';
        if (typeof item.btwRate === 'number' || !isNaN(parseFloat(item.btwRate))) {
            rateText = `${item.btwRate}%`;
        } else {
            rateText = item.btwRate;
        }
        return `
            <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 10px 0; text-align: left; vertical-align: top; line-height: 1.5; white-space: pre-line;">${item.desc}</td>
                <td style="padding: 10px 0; text-align: center; vertical-align: top; color: #555; font-size: 12px; white-space: nowrap;">${rateText}</td>
                <td style="padding: 10px 0; text-align: right; vertical-align: top; font-weight: 500; white-space: nowrap;">€ ${formatDutchBedrag(item.amount)}</td>
            </tr>
        `;
    }).join('');

    const itemsHTML = `
        <div data-pdf-part="items-wrap" style="margin-bottom: 40px; border-bottom: 1px solid #000; padding-bottom: 10px;">
            <table data-pdf-part="items-table" data-table-type="manual" style="width: 100%; border-collapse: collapse; font-size: 13px;">
                <thead>
                    <tr style="border-bottom: 1.5px solid #000; font-weight: bold; text-transform: uppercase; font-size: 11px; color: #444;">
                        <th style="padding-bottom: 8px; text-align: left; width: 65%;">Omschrijving</th>
                        <th style="padding-bottom: 8px; text-align: center; width: 15%;">BTW</th>
                        <th style="padding-bottom: 8px; text-align: right; width: 20%;">Bedrag ex btw</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRowsHTML}
                </tbody>
            </table>
        </div>
    `;

    let btwRowsHTML = '';
    if (totals.btwBreakdown) {
        Object.entries(totals.btwBreakdown).forEach(([rate, amount]) => {
            if (amount > 0) {
                btwRowsHTML += `
                    <tr>
                        <td style="padding-bottom: 5px; color: #333;">Totaal btw (${rate}%)</td>
                        <td style="text-align: right; font-weight: bold; padding-bottom: 5px; white-space: nowrap;">€ ${formatDutchBedrag(amount)}</td>
                    </tr>
                `;
            }
        });
    }

    const exemptSum = items
        .filter(item => String(item.btwRate).toLowerCase() === 'vrijgesteld')
        .reduce((sum, item) => sum + item.amount, 0);
    if (exemptSum > 0) {
        btwRowsHTML += `
            <tr>
                <td style="padding-bottom: 5px; color: #555; font-style: italic;">BTW (vrijgesteld: € ${formatDutchBedrag(exemptSum)} ex btw)</td>
                <td style="text-align: right; font-weight: bold; padding-bottom: 5px; color: #555; white-space: nowrap;">€ nihil</td>
            </tr>
        `;
    }

    const zeroSum = items
        .filter(item => String(item.btwRate) === '0')
        .reduce((sum, item) => sum + item.amount, 0);
    if (zeroSum > 0) {
        btwRowsHTML += `
            <tr>
                <td style="padding-bottom: 5px; color: #555; font-style: italic;">BTW (0% btw-tarief: € ${formatDutchBedrag(zeroSum)} ex btw)</td>
                <td style="text-align: right; font-weight: bold; padding-bottom: 5px; color: #555; white-space: nowrap;">€ nihil</td>
            </tr>
        `;
    }

    const totalsHTML = `
        <table data-pdf-part="totals-table" style="width: 100%; border-collapse: collapse;">
            <tr>
                <td style="width: 78%; padding-bottom: 5px; color: #333;">Totaal ex BTW</td>
                <td style="width: 22%; text-align: right; font-weight: bold; padding-bottom: 5px; white-space: nowrap;">€ ${formatDutchBedrag(totals.subtotal)}</td>
            </tr>
            ${btwRowsHTML}
            <tr data-pdf-part="totals-grand" style="font-size: 15px; font-weight: bold; border-top: 1.5px solid #000; border-bottom: 1.5px solid #000;">
                <td style="padding: 8px 0;">Totaal incl. BTW</td>
                <td style="text-align: right; padding: 8px 0; white-space: nowrap;">€ ${formatDutchBedrag(totals.total)}</td>
            </tr>
        </table>
    `;

    return { itemsHTML, totalsHTML };
}

export { renderOfferteSection } from './invoice-sections-offerte.js';

import { formatDutchBedrag } from './invoice-sections.js';

export function renderOfferteSection(items, totals, meta = {}) {
    const tableRowsHTML = items.map(item => {
        let rateText = '';
        if (typeof item.btwRate === 'number' || !isNaN(parseFloat(item.btwRate))) {
            rateText = `${item.btwRate}%`;
        } else {
            rateText = item.btwRate;
        }
        return `
            <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 10px 0; text-align: left; vertical-align: top; line-height: 1.5;">${item.desc}</td>
                <td style="padding: 10px 0; text-align: center; vertical-align: top; color: #555; font-size: 12px;">${rateText}</td>
                <td style="padding: 10px 0; text-align: right; vertical-align: top; font-weight: 500;">€ ${formatDutchBedrag(item.amount)}</td>
            </tr>
        `;
    }).join('');

    const itemsHTML = `
        <div style="margin-bottom: 35px; border-bottom: 1px solid #000; padding-bottom: 10px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
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
                        <td style="text-align: right; font-weight: bold; padding-bottom: 5px;">€ ${formatDutchBedrag(amount)}</td>
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
                <td style="text-align: right; font-weight: bold; padding-bottom: 5px; color: #555;">€ nihil</td>
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
                <td style="text-align: right; font-weight: bold; padding-bottom: 5px; color: #555;">€ nihil</td>
            </tr>
        `;
    }

    const totalsHTML = `
        <table style="width: 100%; border-collapse: collapse;">
            <tr>
                <td style="width: 60%; padding-bottom: 5px; color: #333;">Totaal ex BTW</td>
                <td style="width: 40%; text-align: right; font-weight: bold; padding-bottom: 5px;">€ ${formatDutchBedrag(totals.subtotal)}</td>
            </tr>
            ${btwRowsHTML}
            <tr style="font-size: 15px; font-weight: bold; border-top: 1.5px solid #000; border-bottom: 1.5px solid #000;">
                <td style="padding: 8px 0;">Totaal incl. BTW</td>
                <td style="text-align: right; padding: 8px 0;">€ ${formatDutchBedrag(totals.total)}</td>
            </tr>
        </table>
    `;

    let notesHTML = '';
    if (meta.notes && meta.notes.trim()) {
        const cleanNotes = meta.notes.trim();
        notesHTML = `
            <div style="margin-top: 18px; margin-bottom: 14px; font-size: 11.5px; line-height: 1.55; color: #222;">
                <strong style="display: block; margin-bottom: 3px;">N.B.:</strong>
                <div style="white-space: pre-line;">${cleanNotes}</div>
            </div>
        `;
    }

    const signatureHTML = `
        <div style="margin-top: 18px; margin-bottom: 12px; padding: 10px 14px; border: 1px solid #111; border-radius: 4px; font-size: 11.5px; line-height: 1.45;">
            <p style="margin: 0 0 8px 0; font-weight: bold; text-transform: uppercase; font-size: 10.5px; letter-spacing: 0.5px; color: #111;">Voor akkoord opdrachtgever:</p>
            <table style="width: 100%; border-collapse: collapse; font-size: 11.5px;">
                <tr>
                    <td style="width: 50%; padding-bottom: 6px;">Naam: ....................................................</td>
                    <td style="width: 50%; padding-bottom: 6px;">Datum: ....................................................</td>
                </tr>
                <tr>
                    <td colspan="2" style="padding-top: 6px;">Handtekening: ....................................................</td>
                </tr>
            </table>
        </div>
    `;

    return { itemsHTML, totalsHTML, notesHTML, signatureHTML };
}

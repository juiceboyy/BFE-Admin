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

    const formatDutchBedrag = (val) => {
        if (val % 1 === 0) return `${val},=`;
        return new Intl.NumberFormat('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
    };

    const formatDutchTarief = (val) => {
        if (val % 1 === 0) return `${val},=`;
        return new Intl.NumberFormat('nl-NL', { minimumFractionDigits: 2 }).format(val);
    };

    // Recipient Address
    let recipientHTML = `
        <strong style="font-size: 14px; color: #000;">${clientInfo.name}</strong><br>
    `;
    if (clientInfo.attention) recipientHTML += `${clientInfo.attention}<br>`;
    recipientHTML += `${clientInfo.address}<br>${clientInfo.city}`;

    // Item details
    let itemsHTML = '';
    let totalsHTML = '';

    if (type === 'lesgeven') {
        const tableRowsHTML = items.map(r => `
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

        itemsHTML = `
            <div style="margin-bottom: 30px;">
                <table style="table-layout: fixed; width: 100%; border-collapse: collapse; font-size: 12px; border: 1px solid #000;">
                    <thead>
                        <tr style="border-bottom: 1px solid #000; font-weight: bold; background-color: #fff;">
                            <th style="border-left: 1px solid #000; border-right: 1px solid #000; padding: 6px 8px; text-align: center; width: 8%;">Week</th>
                            <th style="border-right: 1px solid #000; padding: 6px 8px; width: 12%; text-align: left;">Datum</th>
                            <th style="border-right: 1px solid #000; padding: 6px 8px; width: 15%; text-align: left;">Lokatie</th>
                            <th style="border-right: 1px solid #000; padding: 6px 8px; width: 23%; text-align: left;">Activiteit</th>
                            <th style="border-right: 1px solid #000; padding: 6px 8px; width: 13%; text-align: left;">Instrument</th>
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
                            <td style="border-right: 1px solid #000; padding: 6px 8px; text-align: right;">${formatDutchBedrag(totals.subtotal)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        `;

        totalsHTML = `
            <table style="width: 100%; border-collapse: collapse;">
                <tr>
                    <td style="width: 60%; padding-bottom: 5px; color: #333;">Reiskosten (${totals.travelDays} x ${totals.travelDistance} km à ${totals.travelRate.toFixed(2).replace('.', ',')} ct/km)</td>
                    <td style="width: 40%; text-align: right; font-weight: bold; padding-bottom: 5px;">€ ${formatDutchBedrag(totals.travelAmount)}</td>
                </tr>
                <tr>
                    <td style="padding-bottom: 5px; font-weight: bold;">Subtotaal ex BTW</td>
                    <td style="text-align: right; font-weight: bold; padding-bottom: 5px;">€ ${formatDutchBedrag(totals.total)}</td>
                </tr>
                <tr>
                    <td style="padding-bottom: 5px; color: #555; font-style: italic;">BTW (btw vrijgesteld, onderwijs aan leerlingen onder de 21 jaar)</td>
                    <td style="text-align: right; font-weight: bold; padding-bottom: 5px; color: #555;">€ nihil</td>
                </tr>
                <tr style="font-size: 15px; font-weight: bold; border-top: 1.5px solid #000; border-bottom: 1.5px solid #000;">
                    <td style="padding: 8px 0;">Totaal</td>
                    <td style="text-align: right; padding: 8px 0;">€ ${formatDutchBedrag(totals.total)}</td>
                </tr>
            </table>
        `;
    } else if (type === 'rent') {
        itemsHTML = `
            <div style="margin-bottom: 40px; border-bottom: 1px solid #000; padding-bottom: 10px;">
                <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                    <tbody>
                        ${items.map(item => `
                            <tr>
                                <td style="padding: 8px 0; width: 75%; text-align: left; vertical-align: top;">${item.desc}</td>
                                <td style="padding: 8px 0; width: 25%; text-align: right; vertical-align: top; font-weight: 500;">€ ${formatDutchBedrag(item.amount)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        totalsHTML = `
            <table style="width: 100%; border-collapse: collapse;">
                <tr>
                    <td style="width: 60%; padding-bottom: 5px; color: #333;">Totaal ex BTW</td>
                    <td style="width: 40%; text-align: right; font-weight: bold; padding-bottom: 5px;">€ ${formatDutchBedrag(totals.subtotal)}</td>
                </tr>
                <tr>
                    <td style="padding-bottom: 5px; color: #333;">Totaal btw (21%)</td>
                    <td style="text-align: right; font-weight: bold; padding-bottom: 5px;">€ ${formatDutchBedrag(totals.btwAmount)}</td>
                </tr>
                <tr style="font-size: 15px; font-weight: bold; border-top: 1.5px solid #000; border-bottom: 1.5px solid #000;">
                    <td style="padding: 8px 0;">Totaal, inc. btw</td>
                    <td style="text-align: right; padding: 8px 0;">€ ${formatDutchBedrag(totals.total)}</td>
                </tr>
            </table>
        `;
    } else if (type === 'manual') {
        const tableRowsHTML = items.map(item => {
            let rateText = '';
            if (typeof item.btwRate === 'number' || !isNaN(parseFloat(item.btwRate))) {
                rateText = `${item.btwRate}%`;
            } else {
                rateText = item.btwRate; // e.g. "Vrijgesteld"
            }
            return `
                <tr style="border-bottom: 1px solid #eee;">
                    <td style="padding: 10px 0; text-align: left; vertical-align: top; line-height: 1.5;">${item.desc}</td>
                    <td style="padding: 10px 0; text-align: center; vertical-align: top; color: #555; font-size: 12px;">${rateText}</td>
                    <td style="padding: 10px 0; text-align: right; vertical-align: top; font-weight: 500;">€ ${formatDutchBedrag(item.amount)}</td>
                </tr>
            `;
        }).join('');

        itemsHTML = `
            <div style="margin-bottom: 40px; border-bottom: 1px solid #000; padding-bottom: 10px;">
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
                } else if (rate === 'Vrijgesteld') {
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
                } else if (rate === '0') {
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
                }
            });
        }

        totalsHTML = `
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
    }

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
        <div style="margin-top: 25px; margin-bottom: 40px; font-size: 13px; line-height: 1.6;">
            ${totalsHTML}
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

import { uploadToDrive } from '../api/storage.js';

/**
 * Builds A4 DOM representation of the invoice.
 */
export function buildInvoiceDOM(config) {
    const {
        type, // 'lesgeven' or 'rent'
        factuurNummer,
        invoiceDate,
        clientInfo, // { name, attention, address, city }
        items, // for lesgeven: { week, datum, lokatie, activiteit, instrument, uren, tarief }; for rent: { desc, amount }
        totals // for lesgeven: { subtotal, travelDays, travelDistance, travelRate, travelAmount, total }; for rent: { subtotal, btwAmount, total }
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
    } else {
        // Rent
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

/**
 * Generates PDF from DOM element, triggers browser save/download, and uploads it to Google Drive.
 * Uses global html2pdf library loaded via CDN in index.html.
 */
export async function generateAndUploadPDF(invoiceElement, pdfFileName) {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.left = '0';
    iframe.style.top = '0';
    iframe.style.zIndex = '-9999';
    iframe.style.width = '794px';
    iframe.style.height = '1122px';
    iframe.style.border = 'none';
    
    document.body.appendChild(iframe);
    
    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
    iframeDoc.open();
    iframeDoc.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap">
            <style>
                body { margin: 0; padding: 0; background-color: white; }
            </style>
        </head>
        <body>
        </body>
        </html>
    `);
    iframeDoc.close();
    
    await new Promise(resolve => setTimeout(resolve, 50));
    iframeDoc.body.appendChild(invoiceElement);

    // Wait for images
    const images = invoiceElement.querySelectorAll('img');
    const imageLoadPromises = Array.from(images).map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(resolve => {
            img.onload = resolve;
            img.onerror = resolve;
        });
    });
    await Promise.all(imageLoadPromises);

    const opt = {
        margin:       0,
        filename:     `${pdfFileName}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { 
            scale: 2, 
            useCORS: true, 
            scrollX: 0, 
            scrollY: 0,
            x: 0,
            y: 0,
            windowWidth: 794,
            windowHeight: 1122
        },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    // Reference global html2pdf loaded via script tag in index.html
    const pdfWorker = html2pdf().from(invoiceElement).set(opt);
    await pdfWorker.save();
    
    const pdfBlob = await pdfWorker.outputPdf('blob');
    const pdfFile = new File([pdfBlob], `${pdfFileName}.pdf`, { type: 'application/pdf' });

    document.body.removeChild(iframe);

    await uploadToDrive(pdfFile, pdfFileName);
    return pdfBlob;
}

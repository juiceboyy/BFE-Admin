import { fitInvoiceToSinglePage, SCALE_CONFIRM_THRESHOLD } from './pdf-fit.js';

async function waitForFontsReady(iframeDoc) {
    const fontPromises = [];
    if (iframeDoc.fonts?.ready) fontPromises.push(iframeDoc.fonts.ready);
    if (document.fonts?.ready) fontPromises.push(document.fonts.ready);
    if (fontPromises.length === 0) return;

    await Promise.race([
        Promise.all(fontPromises),
        new Promise(resolve => setTimeout(resolve, 2000))
    ]);
}

/**
 * Generates a single-page A4 PDF from a DOM element and triggers browser download.
 * Uses global html2pdf library loaded via CDN in index.html.
 * @param {HTMLElement} invoiceElement - The HTML element representing the A4 page.
 * @param {string} pdfFileName - Filename for the generated PDF (without extension).
 * @returns {Promise<Blob|null>} The generated PDF blob, or null if cancelled by the user.
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

    try {
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

        // Wait for images and fonts before measuring layout
        const images = invoiceElement.querySelectorAll('img');
        const imageLoadPromises = Array.from(images).map(img => {
            if (img.complete) return Promise.resolve();
            return new Promise(resolve => {
                img.onload = resolve;
                img.onerror = resolve;
            });
        });
        await Promise.all([...imageLoadPromises, waitForFontsReady(iframeDoc)]);

        const fit = fitInvoiceToSinglePage(invoiceElement, iframe);
        if (fit.scale < SCALE_CONFIRM_THRESHOLD) {
            const percent = Math.round(fit.scale * 100);
            const isOfferte = invoiceElement.dataset.docType === 'offerte';
            const confirmed = window.confirm(
                `Let op: deze ${isOfferte ? 'offerte' : 'factuur'} bevat erg veel inhoud en moet extra worden verkleind naar ${percent}% om op 1 pagina te passen.\n\nWil je doorgaan met ${isOfferte ? 'genereren, downloaden en opslaan' : 'genereren, downloaden en boeken'}?`
            );
            if (!confirmed) {
                return null;
            }
        }

        const opt = {
            margin: 0,
            filename: `${pdfFileName}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            pagebreak: { mode: [] },
            html2canvas: {
                scale: 2,
                useCORS: true,
                scrollX: 0,
                scrollY: 0,
                x: 0,
                y: 0,
                width: fit.width,
                height: fit.height,
                windowWidth: fit.width,
                windowHeight: fit.height
            },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        // Reference global html2pdf loaded via script tag in index.html
        const pdfWorker = html2pdf().from(invoiceElement).set(opt);
        const pdf = await pdfWorker.toPdf().get('pdf');
        while (pdf.internal.getNumberOfPages() > 1) {
            pdf.deletePage(pdf.internal.getNumberOfPages());
        }
        pdf.save(`${pdfFileName}.pdf`);

        return pdf.output('blob');
    } finally {
        if (iframe.parentNode) {
            document.body.removeChild(iframe);
        }
    }
}

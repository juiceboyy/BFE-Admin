import { uploadToDrive } from '../api/storage.js';

/**
 * Generates PDF from DOM element, triggers browser save/download, and uploads it to Google Drive.
 * Uses global html2pdf library loaded via CDN in index.html.
 * @param {HTMLElement} invoiceElement - The HTML element representing the A4 page.
 * @param {string} pdfFileName - Filename for the generated PDF.
 * @returns {Promise<Blob>} The generated PDF blob.
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

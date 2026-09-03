/**
 * js/api/extract.js
 * Client-side PDF tekstextractie (PDF.js), snelle regex-parsing en afbeelding-optimalisatie.
 */

/**
 * Extraheert een totaalbedrag uit een PDF-factuur door de tekst te analyseren.
 * @param {string} base64urlData De base64url-geëncodeerde PDF-data.
 * @returns {Promise<number|null>} Het gevonden bedrag als float, of null.
 */
export async function extractAmountFromPDF(base64urlData) {
    try {
        const base64 = base64urlData.replace(/-/g, '+').replace(/_/g, '/');
        const raw = window.atob(base64);
        const rawLength = raw.length;
        const array = new Uint8Array(new ArrayBuffer(rawLength));

        for (let i = 0; i < rawLength; i++) {
            array[i] = raw.charCodeAt(i);
        }

        const pdf = await pdfjsLib.getDocument({ data: array }).promise;
        const page = await pdf.getPage(1);
        const textContent = await page.getTextContent();
        
        const fullText = textContent.items.map(item => item.str).join(' ');

        const regex = /(?:totaal|bedrag|te betalen).*?(?:€|EUR)?\s*(\d{1,3}(?:\.\d{3})*,\d{2})/i;
        const match = fullText.match(regex);

        if (match && match[1]) {
            const amountString = match[1];
            const parsableAmount = amountString.replace(/\./g, '').replace(',', '.');
            return parseFloat(parsableAmount);
        }

        return null;
    } catch (error) {
        console.error("Fout bij het extraheren van factuurbedrag uit PDF:", error);
        return null;
    }
}

/**
 * Extraheert alle leesbare tekst uit een PDF File object via PDF.js.
 * @param {File} file - PDF bestand
 * @param {number} [maxPages=5] - Maximaal aantal pagina's
 * @returns {Promise<string|null>}
 */
export async function extractTextFromPDFFile(file, maxPages = 5) {
    if (!window.pdfjsLib) return null;
    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const numPages = Math.min(pdf.numPages, maxPages);
        let fullText = '';

        for (let i = 1; i <= numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += `\n--- Pagina ${i} ---\n` + pageText;
        }

        return fullText.trim();
    } catch (err) {
        console.warn('PDF tekst kon niet client-side geëxtraheerd worden:', err);
        return null;
    }
}

/**
 * Converteert een Nederlands bedrag (bijv. "1.234,56" of "- 50,00") naar een float.
 */
function parseDutchAmount(str) {
    if (!str) return null;
    const isNegative = str.includes('-');
    const clean = str.replace(/[^\d,.]/g, '');
    const lastComma = clean.lastIndexOf(',');
    const lastDot = clean.lastIndexOf('.');
    let numStr = clean;
    if (lastComma > lastDot) {
        numStr = clean.replace(/\./g, '').replace(',', '.');
    } else {
        numStr = clean.replace(/,/g, '');
    }
    const val = parseFloat(numStr);
    if (isNaN(val)) return null;
    return isNegative ? -Math.abs(val) : Math.abs(val);
}

/**
 * Probeert direct via regex het begin- en eindsaldo uit banktekst te extraheren (0.05s).
 * @param {string} text - Tekst van het bankafschrift
 * @param {string|number} [year] - Optioneel boekjaar ter verificatie
 * @returns {{ beginSaldo: number|null, eindSaldo: number|null, fastMatch: boolean }}
 */
export function fastScanBankStatement(text, year) {
    if (!text || typeof text !== 'string') {
        return { beginSaldo: null, eindSaldo: null, fastMatch: false };
    }

    let beginSaldo = null;
    let eindSaldo = null;

    // Beginsaldo patronen (o.a. ING, Rabo, ABN, Knab)
    const beginPatterns = [
        /(?:saldo\s+(?:per|op)\s+(?:0?1[-/. ]0?1|1\s+jan(?:uari)?)(?:[-/. ]\d{2,4})?|openings(?:saldo)?|begin(?:saldo)?|saldo\s+oud|vorig\s+saldo)\s*[:=]?\s*(?:€|EUR)?\s*([+-]?\s*\d{1,3}(?:\.\d{3})*,\d{2})/i,
        /(?:0?1[-/. ]0?1(?:[-/. ]\d{2,4})?)\s+(?:openingsaldo|beginsaldo|saldo)\s*[:=]?\s*(?:€|EUR)?\s*([+-]?\s*\d{1,3}(?:\.\d{3})*,\d{2})/i
    ];

    for (const pat of beginPatterns) {
        const m = text.match(pat);
        if (m && m[1]) {
            beginSaldo = parseDutchAmount(m[1]);
            if (beginSaldo !== null) break;
        }
    }

    // Eindsaldo patronen
    const eindPatterns = [
        /(?:saldo\s+(?:per|op)\s+(?:31[-/. ]12|31\s+dec(?:ember)?)(?:[-/. ]\d{2,4})?|slot(?:stand|saldo)?|eind(?:saldo)?|saldo\s+nieuw|nieuw\s+saldo)\s*[:=]?\s*(?:€|EUR)?\s*([+-]?\s*\d{1,3}(?:\.\d{3})*,\d{2})/i,
        /(?:31[-/. ]12(?:[-/. ]\d{2,4})?)\s+(?:slotsaldo|eindsaldo|saldo)\s*[:=]?\s*(?:€|EUR)?\s*([+-]?\s*\d{1,3}(?:\.\d{3})*,\d{2})/i
    ];

    for (const pat of eindPatterns) {
        const m = text.match(pat);
        if (m && m[1]) {
            eindSaldo = parseDutchAmount(m[1]);
            if (eindSaldo !== null) break;
        }
    }

    const fastMatch = (beginSaldo !== null && eindSaldo !== null);
    return { beginSaldo, eindSaldo, fastMatch };
}

/**
 * Schaaft grote afbeeldingen client-side bij tot max 1600px voor razendsnelle uploads.
 */
export async function optimizeImageFile(file, maxDim = 1600, quality = 0.8) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                let { width, height } = img;
                if (width <= maxDim && height <= maxDim) {
                    return resolve(e.target.result);
                }
                if (width > height) {
                    height = Math.round((height * maxDim) / width);
                    width = maxDim;
                } else {
                    width = Math.round((width * maxDim) / height);
                    height = maxDim;
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = () => resolve(e.target.result);
            img.src = e.target.result;
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
    });
}
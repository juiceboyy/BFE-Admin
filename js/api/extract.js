/**
 * Extraheert een totaalbedrag uit een PDF-factuur door de tekst te analyseren.
 * @param {string} base64urlData De base64url-geëncodeerde PDF-data.
 * @returns {Promise<number|null>} Het gevonden bedrag als float, of null.
 */
export async function extractAmountFromPDF(base64urlData) {
    try {
        // 1. Decodeer base64url naar een Uint8Array die pdf.js kan lezen.
        // Vervang URL-specifieke karakters en decodeer.
        const base64 = base64urlData.replace(/-/g, '+').replace(/_/g, '/');
        const raw = window.atob(base64);
        const rawLength = raw.length;
        const array = new Uint8Array(new ArrayBuffer(rawLength));

        for (let i = 0; i < rawLength; i++) {
            array[i] = raw.charCodeAt(i);
        }

        // 2. Laad de PDF met pdf.js.
        const pdf = await pdfjsLib.getDocument({ data: array }).promise;

        // 3. Haal de tekstinhoud van de eerste pagina op.
        const page = await pdf.getPage(1);
        const textContent = await page.getTextContent();
        
        // Concateneer alle tekst-items tot één doorlopende string.
        const fullText = textContent.items.map(item => item.str).join(' ');

        // 4. Zoek naar het totaalbedrag met een Regex.
        // Deze regex zoekt naar keywords (totaal, bedrag, etc.), gevolgd door een bedrag
        // in een typisch Nederlands formaat (bijv. 1.234,56).
        const regex = /(?:totaal|bedrag|te betalen).*?(?:€|EUR)?\s*(\d{1,3}(?:\.\d{3})*,\d{2})/i;
        const match = fullText.match(regex);

        if (match && match[1]) {
            // 5. Converteer de gevonden string (bijv. '1.234,56') naar een float (1234.56).
            const amountString = match[1];
            const parsableAmount = amountString.replace(/\./g, '').replace(',', '.');
            return parseFloat(parsableAmount);
        }

        return null; // Geen match gevonden
    } catch (error) {
        console.error("🚨 Fout bij het extraheren van data uit PDF:", error);
        return null;
    }
}
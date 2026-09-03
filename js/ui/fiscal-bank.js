/**
 * js/ui/fiscal-bank.js
 * Beheert de snelle upload, client-side analyse en fallback scanning van het zakelijke bankafschrift.
 */

import { fiscalState } from '../store/fiscal-state.js';
import { extractTextFromPDFFile, fastScanBankStatement, optimizeImageFile } from '../api/extract.js';

/**
 * Verwerkt een geüpload bankafschriftbestand (PDF of afbeelding).
 * @param {File} file - Geüpload bestand
 * @param {HTMLElement} container - Container element van het intake formulier
 */
export async function handleBankStatementUpload(file, container) {
    if (!file) return;

    const idle    = container.querySelector('#bank-upload-idle');
    const loading = container.querySelector('#bank-upload-loading');
    const result  = container.querySelector('#bank-scan-result');
    const uploadInput = container.querySelector('#bank-statement-upload');

    if (idle) idle.classList.add('hidden');
    if (loading) {
        loading.classList.remove('hidden');
        loading.classList.add('flex');
    }
    if (result) result.classList.add('hidden');

    const year = fiscalState.getState().year;

    try {
        let beginSaldo = null;
        let eindSaldo = null;
        let sourceMethod = 'Gemini AI';

        // 1. Snelle route: als het een PDF is, probeer direct tekst te extraheren via PDF.js (50ms)
        const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
        let extractedText = null;

        if (isPDF) {
            extractedText = await extractTextFromPDFFile(file);
            if (extractedText) {
                const fastResult = fastScanBankStatement(extractedText, year);
                if (fastResult.fastMatch) {
                    beginSaldo = fastResult.beginSaldo;
                    eindSaldo = fastResult.eindSaldo;
                    sourceMethod = 'Lokale PDF-scan';
                }
            }
        }

        // 2. Als snelle scan niet beide saldi vond, roep de geoptimaliseerde serverless functie aan
        if (beginSaldo === null || eindSaldo === null) {
            let requestBody = { year };

            if (extractedText && extractedText.trim().length > 0) {
                // Stuur alleen de pure tekst: duurt <1s bij Gemini i.p.v. 10s voor zware PDF
                requestBody.textData = extractedText;
            } else {
                // Beeldoptimalisatie voor afbeeldingen of gescande PDF's zonder tekstlaag
                if (file.type.startsWith('image/')) {
                    const optimizedDataUrl = await optimizeImageFile(file, 1600, 0.85);
                    requestBody.base64Data = optimizedDataUrl;
                    requestBody.mimeType = 'image/jpeg';
                } else {
                    const rawBase64 = await fileToBase64(file);
                    requestBody.base64Data = rawBase64;
                    requestBody.mimeType = file.type || 'application/pdf';
                }
            }

            // Client-side 9.5s timeout om vastlopers te allen tijde te voorkomen
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 9500);

            let response;
            try {
                response = await fetch('/.netlify/functions/scanBankStatement', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody),
                    signal: controller.signal
                });
            } finally {
                clearTimeout(timeoutId);
            }

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || `Server error ${response.status}`);
            }

            const data = await response.json();
            if (beginSaldo === null && data.beginSaldo != null) beginSaldo = data.beginSaldo;
            if (eindSaldo === null && data.eindSaldo != null) eindSaldo = data.eindSaldo;
        }

        // 3. State en UI velden bijwerken
        if (beginSaldo != null) {
            fiscalState.setNested('bank', 'beginSaldo', beginSaldo);
            const input = container.querySelector('[data-bind="beginSaldo"]');
            if (input) input.value = beginSaldo;
        }
        if (eindSaldo != null) {
            fiscalState.setNested('bank', 'eindSaldo', eindSaldo);
            const input = container.querySelector('[data-bind="eindSaldo"]');
            if (input) input.value = eindSaldo;
        }

        const fmt = (n) => n != null ? `€ ${(n).toLocaleString('nl-NL', { minimumFractionDigits: 2 })}` : '?';

        if (result) {
            result.classList.remove('hidden');
            const span = result.querySelector('span');
            if (span) {
                span.textContent = `Ingelezen (${sourceMethod}): beginsaldo ${fmt(beginSaldo)}, eindsaldo ${fmt(eindSaldo)}. Pas aan indien gewenst.`;
            }
            if (window.lucide) window.lucide.createIcons();
        }

    } catch (err) {
        const isTimeout = err.name === 'AbortError';
        const msg = isTimeout
            ? 'Het analyseren duurde te lang (>9s). Je kunt de begin- en eindsaldi direct handmatig invullen in de velden hieronder.'
            : `Kon bankafschrift niet automatisch inlezen: ${err.message}. Vul de saldi a.u.b. handmatig in.`;
        alert(msg);
    } finally {
        if (idle) idle.classList.remove('hidden');
        if (loading) {
            loading.classList.add('hidden');
            loading.classList.remove('flex');
        }
        if (uploadInput) uploadInput.value = '';
    }
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload  = () => resolve(reader.result);
        reader.onerror = reject;
    });
}

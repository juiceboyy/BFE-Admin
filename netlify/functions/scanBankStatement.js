/**
 * netlify/functions/scanBankStatement.js
 * Analyseert een bankafschrift (jaaropgave) via Gemini en extraheert
 * het beginsaldo (1 januari) en eindsaldo (31 december).
 *
 * Ondersteunt zowel pure geëxtraheerde tekst (super-snel) als base64 (afbeelding/PDF).
 * Expected POST body: { textData?, base64Data?, mimeType?, year? }
 * Returns: { beginSaldo: number, eindSaldo: number }
 */

const SYSTEM_PROMPT = `Je bent een Nederlandse accountant die een bankafschrift of jaaropgave analyseert.
Extraheer het beginsaldo (openingssaldo, saldo op 1 januari) en het eindsaldo (slotstand, saldo op 31 december).

Regels:
- Zoek specifiek naar "beginsaldo", "openingssaldo", "saldo begin", "saldo per 01-01", "saldo op 1 januari" of vergelijkbare termen voor het beginsaldo.
- Zoek naar "eindsaldo", "slotstand", "saldo per 31-12", "saldo op 31 december", "saldo einde" of vergelijkbare termen voor het eindsaldo.
- Bedragen zijn standaard positief. Let op eventuele min-tekens of indicaties zoals "Debet / D" vs "Credit / C".
- Als een bedrag niet gevonden kan worden, gebruik dan null.
- Retourneer UITSLUITEND een geldig JSON-object zonder markdown formatting.

JSON structuur:
{ "beginSaldo": 1234.56, "eindSaldo": 2345.67 }`;

function isOriginAllowed(event) {
    const headers = event.headers || {};
    let sourceUrl = '';
    for (const [key, val] of Object.entries(headers)) {
        const k = key.toLowerCase();
        if (k === 'origin' && val) { sourceUrl = val; break; }
        if (k === 'referer' && val && !sourceUrl) { sourceUrl = val; }
    }
    if (!sourceUrl) return false;
    try {
        const hostname = new URL(sourceUrl).hostname.toLowerCase();
        if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
        if (hostname === 'bfe-admin.netlify.app' || hostname.endsWith('--bfe-admin.netlify.app')) return true;
        if (process.env.SITE_NAME && (hostname === `${process.env.SITE_NAME}.netlify.app` || hostname.endsWith(`--${process.env.SITE_NAME}.netlify.app`))) return true;
        const custom = process.env.ALLOWED_DOMAIN ? process.env.ALLOWED_DOMAIN.trim().toLowerCase() : '';
        return Boolean(custom && (hostname === custom || hostname.endsWith('.' + custom)));
    } catch (_) {
        return false;
    }
}

export const handler = async (event) => {
    if (!isOriginAllowed(event)) {
        return {
            statusCode: 403,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Verboden: ongeldige herkomst (invalid origin or referer)' })
        };
    }

    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': event.headers?.origin || event.headers?.Origin || '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            body: ''
        };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    try {
        let { base64Data, mimeType, textData, year } = JSON.parse(event.body || '{}');

        const apiKey = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : '';
        if (!apiKey) {
            return { statusCode: 500, body: JSON.stringify({ error: 'Server configuratiefout: GEMINI_API_KEY ontbreekt.' }) };
        }

        const parts = [];

        if (textData && typeof textData === 'string' && textData.trim().length > 0) {
            // Snelle tekstuele verwerking (duurt typisch < 1 seconde bij Gemini)
            const safeText = textData.slice(0, 15000);
            parts.push({
                text: `${SYSTEM_PROMPT}\n\nAnalyseer deze tekst van het bankafschrift${year ? ` (boekjaar ${year})` : ''}:\n\n${safeText}`
            });
        } else if (base64Data) {
            // Visuele verwerking voor afbeeldingen of gescande documenten
            if (base64Data.includes(',')) base64Data = base64Data.split(',')[1];
            parts.push({
                text: `${SYSTEM_PROMPT}\n\nAnalyseer dit bankafschrift${year ? ` (boekjaar ${year})` : ''} en geef de saldi terug.`
            });
            parts.push({
                inline_data: { mime_type: mimeType || 'application/pdf', data: base64Data }
            });
        } else {
            return { statusCode: 400, body: JSON.stringify({ error: 'Geen documentdata of tekst ontvangen.' }) };
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-4-hydrogen:generateContent?key=${apiKey}`;

        const payload = {
            contents: [{ parts }],
            generationConfig: {
                temperature: 0.0
            }
        };

        // Strikte 8.5s timeout om Netlify's 10s limiet te waarborgen
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8500);

        let response;
        try {
            response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal
            });
        } finally {
            clearTimeout(timeoutId);
        }

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            const msg = err?.error?.message || `Gemini API fout (${response.status})`;
            return { statusCode: 500, body: JSON.stringify({ error: msg }) };
        }

        const data = await response.json();
        let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

        // Strip markdown code fences
        text = text.replace(/```json/gi, '').replace(/```/g, '').trim();

        // Extract JSON object
        const start = text.indexOf('{');
        const end   = text.lastIndexOf('}');
        if (start !== -1 && end > start) text = text.slice(start, end + 1);

        JSON.parse(text); // validate

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: text
        };

    } catch (error) {
        const isTimeout = error.name === 'AbortError';
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: isTimeout
                    ? 'De bankanalyse duurde te lang (>8.5s). Vul de saldi a.u.b. handmatig in.'
                    : error.message
            })
        };
    }
};

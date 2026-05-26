/**
 * netlify/functions/scanBankStatement.js
 * Analyseert een bankafschrift (jaaropgave) via Gemini Vision en extraheert
 * het beginsaldo (1 januari) en eindsaldo (31 december).
 *
 * Expected POST body: { base64Data, mimeType, year }
 * Returns: { beginSaldo: number, eindSaldo: number }
 */

const SYSTEM_PROMPT = `Je bent een Nederlandse accountant die een bankafschrift of jaaropgave analyseert.
Extraheer het beginsaldo (openingssaldo, saldo op 1 januari) en het eindsaldo (slotstand, saldo op 31 december).

Regels:
- Zoek specifiek naar "beginsaldo", "openingssaldo", "saldo begin", "saldo per 01-01" of vergelijkbare termen voor het beginsaldo.
- Zoek naar "eindsaldo", "slotstand", "saldo per 31-12", "saldo einde" of vergelijkbare termen voor het eindsaldo.
- Bedragen zijn altijd positief (creditstand). Geen mintekens gebruiken tenzij het een negatief saldo is.
- Als een bedrag niet gevonden kan worden, gebruik dan null.
- Retourneer UITSLUITEND een geldig JSON-object zonder markdown.

JSON structuur:
{ "beginSaldo": 1234.56, "eindSaldo": 2345.67 }`;

export const handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    try {
        let { base64Data, mimeType, year } = JSON.parse(event.body);

        const apiKey = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : '';
        if (!apiKey) {
            return { statusCode: 500, body: JSON.stringify({ error: 'Server configuratiefout: GEMINI_API_KEY ontbreekt.' }) };
        }

        if (base64Data.includes(',')) base64Data = base64Data.split(',')[1];

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`;

        const payload = {
            contents: [{
                parts: [
                    { text: `${SYSTEM_PROMPT}\n\nAnalyseer dit bankafschrift${year ? ` (boekjaar ${year})` : ''} en geef de saldi terug.` },
                    { inline_data: { mime_type: mimeType, data: base64Data } }
                ]
            }],
            generationConfig: {
                temperature: 0
            }
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            const msg = err?.error?.message || `Gemini API fout (${response.status})`;
            return { statusCode: 500, body: JSON.stringify({ error: msg }) };
        }

        const data = await response.json();
        let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

        // Strip markdown code fences
        text = text.replace(/```json/gi, '').replace(/```/g, '').trim();

        // Extract first JSON object from the response
        const start = text.indexOf('{');
        const end   = text.lastIndexOf('}');
        if (start !== -1 && end > start) text = text.slice(start, end + 1);

        // Validate parseable before returning
        JSON.parse(text);

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: text
        };

    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};

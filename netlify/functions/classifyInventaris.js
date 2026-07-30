/**
 * netlify/functions/classifyInventaris.js
 * Stuurt Inkoop-rijen boven de activeringsdrempel naar Gemini.
 * Gemini beoordeelt welke items activeerbaar zijn als duurzaam bedrijfsmiddel
 * en suggereert een afschrijvingsduur.
 *
 * Expected POST body: { rijen: Array, year: string }
 * Returns: { text: string } — JSON array van geclassificeerde kandidaten
 */

const SYSTEM_PROMPT = `Je bent een Nederlandse belastingadviseur gespecialiseerd in eenmanszaken.
Je taak is om inkooprijen te beoordelen en te bepalen welke items activeerbaar zijn als duurzaam bedrijfsmiddel.

## Activeringsregels (conform Nederlandse belastingwetgeving)
- Activeren ALLEEN als het bedrijfsmiddel een gebruiksduur heeft van meer dan 1 jaar
- Activeringsdrempel: >€450 excl. BTW (items daaronder zijn direct aftrekbaar als kosten)
- Duurzame bedrijfsmiddelen: apparatuur, instrumenten, machines, voertuigen, inventaris
- NIET activeren: verbruiksartikelen, abonnementen, huur, diensten, onderhoud, reparatie,
  software-licenties/subscriptions, reis-/verblijfkosten, representatiekosten

## Afschrijvingsduur (lineaire methode, conform CLAUDE.md)
- Computers/hardware/telefoons: 5 jaar
- Muziekinstrumenten/apparatuur: 5 jaar
- Kantoorinventaris: 5 jaar
- Overige apparatuur: 5 jaar (default)

## Output
Retourneer UITSLUITEND een JSON-array met alleen de items die WEL activeerbaar zijn.
Items die NIET activeerbaar zijn, weglaten.

JSON structuur per item:
[
  {
    "omschrijving": "Korte, duidelijke naam (bijv. 'MacBook Pro 14')",
    "leverancier": "Naam van de leverancier",
    "datum": "Datum zoals aangeleverd",
    "aankoopBedrag": 1299.00,
    "afschrijvingsDuur": 5,
    "reden": "Één zin waarom dit geactiveerd wordt"
  }
]`;

export const handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: true, message: 'Method Not Allowed' }) };
    }

    let rijen, year;
    try {
        ({ rijen, year } = JSON.parse(event.body));
    } catch {
        return { statusCode: 400, body: JSON.stringify({ error: true, message: 'Ongeldig request body.' }) };
    }

    if (!rijen || rijen.length === 0) {
        return { statusCode: 200, body: JSON.stringify({ text: '[]' }) };
    }

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
        return { statusCode: 500, body: JSON.stringify({ error: true, message: 'GEMINI_API_KEY ontbreekt.' }) };
    }

    const rijsamenvatting = rijen.map((r, i) =>
        `${i + 1}. Leverancier: ${r.leverancier} | Omschrijving: "${r.omschrijving || '(geen)'}" | Bedrag excl. BTW: €${r.bedragExcl.toFixed(2)} | Datum: ${r.datum}`
    ).join('\n');

    const userMessage = `Beoordeel de volgende inkooprijen uit boekjaar ${year} op activeerbaarheid als duurzaam bedrijfsmiddel.
Geef alleen de items terug die WEL geactiveerd moeten worden.

INKOOPRIJEN:
${rijsamenvatting}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const payload = {
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{
            parts: [{ text: userMessage }]
        }],
        generationConfig: {
            temperature: 0
        }
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        console.log(`[classifyInventaris] Gemini status: ${response.status}, jaar: ${year}, rijen: ${rijen.length}`);

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            const message = err?.error?.message || `Gemini API fout: ${response.status}`;
            return { statusCode: response.status, body: JSON.stringify({ error: true, message }) };
        }

        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        };

    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: true, message: error.message }) };
    }
};

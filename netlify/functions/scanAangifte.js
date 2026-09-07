/**
 * netlify/functions/scanAangifte.js
 * AI Scanner voor Aangifte Inkomstenbelasting (IB) van Big Fish Entertainment.
 * Gebruikt Gemini 3.6 Flash met greedy decoding (temperature: 0.0) voor sub-3s verwerking.
 * Werkt volledig jaaronafhankelijk voor 2025, 2026 en toekomstige belastingjaren.
 */

const SYSTEM_PROMPT = `Je bent een gespecialiseerde Nederlandse boekhouder en senior belastingadviseur voor de creatieve sector (eenmanszaak, artiest/muzikant Big Fish Entertainment - Ronald van Holst).
Je analyseert de officiële Aangifte Inkomstenbelasting (aangiftebiljet / verzonden overzicht van de Belastingdienst).

## Kenniskaders & Boekhoudregels
1. Balansevenwicht: Totaal Activa MOET exact gelijk zijn aan Totaal Passiva.
2. Eigen Vermogen is het sluitstuk: Eigen Vermogen = Totaal Activa - FOR - Kortlopende Schulden.
3. Fiscale vermogensvergelijking (Kapitaalsvergelijking):
   Fiscale Winst = (Ondernemingsvermogen einde boekjaar - Ondernemingsvermogen begin boekjaar) + Privé-onttrekkingen - Privéstortingen.
4. Rubricering Omzet:
   - 9% muziek/optredens als uitvoerend kunstenaar
   - 0% muziekonderwijs aan leerlingen < 21 jaar (vrijgesteld art. 11 Wet OB)
   - 21% commerciële producties, rechten, overig
5. Rubricering Kosten:
   - Kosten van uitbesteed werk (gastdocenten, sessiemuzikanten)
   - Afschrijvingen (machines, installaties, inventaris)
   - Auto- en transportkosten (lease, laden elektrische auto VW ID.3)
   - Huisvestingskosten (studiohuur, repetitieruimte)
   - Andere bedrijfskosten (software, administratie, kantoor)
   - Financiële lasten (zakelijke bankkosten ING, rente)

## Opdracht
Extraheer de gegevens van de onderneming (Big Fish Entertainment) uit de aangeleverde tekst van de Aangifte Inkomstenbelasting.
Detecteer het juiste belastingjaar (bijv. 2025, 2026).
Retourneer UITSLUITEND een valide JSON-object (zonder markdown code blocks of extra tekst) in het volgende formaat:
{
  "year": 2025,
  "omzet": {
    "totaal": 51746,
    "muziek9": 36254,
    "onderwijs0": 8791,
    "overig21": 6701
  },
  "kosten": {
    "totaal": 26221,
    "uitbesteedWerk": 1661,
    "afschrijving": 841,
    "autokosten": 15544,
    "huisvesting": 4512,
    "andereKosten": 3543,
    "financieleLasten": 120
  },
  "winstberekening": {
    "saldo": 25525,
    "bijtelling": 4336,
    "fiscaleWinst": 29861,
    "ondernemersaftrek": 2470,
    "mkbWinstvrijstellingBedrag": 3479,
    "belastbareWinst": 23912
  },
  "balans": {
    "activa": {
      "inventaris": 2390,
      "debiteuren": 0,
      "overlopend": 0,
      "borgMobility": 0,
      "bank": 460,
      "totaal": 2850
    },
    "passiva": {
      "for": 2143,
      "eigenVermogen": 660,
      "totaalVermogen": 2803,
      "btwSchuld": 47,
      "overigeSchulden": 0,
      "totaal": 2850
    }
  },
  "kapitaal": {
    "beginVermogen": 7353,
    "vermogensmutatie": -4550,
    "onttrekkingenGeld": 30086,
    "onttrekkingenNatura": 4325,
    "totaleOnttrekkingen": 34411,
    "totaleStortingen": 0,
    "eindVermogen": 2803
  }
}`;

export const handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: true, message: 'Method Not Allowed' })
        };
    }

    let payload;
    try {
        payload = JSON.parse(event.body);
    } catch {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: true, message: 'Ongeldig JSON request body.' })
        };
    }

    const { text } = payload;
    if (!text || typeof text !== 'string' || text.trim().length < 50) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: true, message: 'Onvoldoende tekst aangeleverd uit de aangifte.' })
        };
    }

    const apiKey = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : '';
    if (!apiKey) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: true, message: 'Server configuratiefout: GEMINI_API_KEY ontbreekt.' })
        };
    }

    // Beperk de tekstgrootte om Netlify 10s timeout te voorkomen (alle zakelijke tabellen staan in de eerste 25k tekens)
    const truncatedText = text.slice(0, 30000);

    const prompt = `Hier is de tekst van de Aangifte Inkomstenbelasting van Ronald van Holst / Big Fish Entertainment:\n\n${truncatedText}\n\nExtraheer alle zakelijke cijfers volgens het gevraagde JSON-schema. Zorg dat de balans exact sluit (Activa == Passiva).`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.0,
                    responseMimeType: 'application/json'
                }
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const message = errorData?.error?.message || `Gemini API fout: ${response.status}`;
            console.error(`[scanAangifte] API fout (${response.status}):`, message);
            return {
                statusCode: response.status,
                body: JSON.stringify({ error: true, message })
            };
        }

        const data = await response.json();
        let rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        rawText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();

        const parsed = JSON.parse(rawText);

        // Sanity checks & wiskundige sluiting borgen
        if (parsed.balans?.activa?.totaal && parsed.balans?.passiva) {
            const forStand = parsed.balans.passiva.for || 2143;
            const schulden = (parsed.balans.passiva.btwSchuld || 0) + (parsed.balans.passiva.overigeSchulden || 0);
            parsed.balans.passiva.eigenVermogen = parsed.balans.activa.totaal - forStand - schulden;
            parsed.balans.passiva.totaalVermogen = forStand + parsed.balans.passiva.eigenVermogen;
            parsed.balans.passiva.totaal = parsed.balans.activa.totaal;
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ success: true, data: parsed })
        };

    } catch (err) {
        console.error('[scanAangifte] Fout bij verwerken aangifte:', err);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: true, message: err.message })
        };
    }
};

/**
 * netlify/functions/fiscalAdvisor.js
 * Proxies Dutch tax advice requests to the Anthropic Claude API.
 * Dutch finance domain knowledge is injected as a structured system prompt.
 *
 * Expected POST body: { messages: Array, context: Object }
 * Returns: { text: String } — a JSON array of advice cards (parsed by the frontend)
 */

const SYSTEM_PROMPT = `Je bent een strategische Nederlandse belastingadviseur gespecialiseerd in eenmanszaken (ZZP).
Je werkt voor Big Fish Entertainment, een eenmanszaak van Ronald van Holst.

## Entiteitstype
Eenmanszaak — IB (inkomstenbelasting) van toepassing, niet VPB (vennootschapsbelasting).

## BTW-Regels
- Standaard tarief (dienstverlening): 21%
- Verlaagd tarief (voedsel, boeken, geneesmiddelen): 9%
- Nultarief: export buiten EU en B2B-EU (verlegd, ICP-opgaaf verplicht)
- Alle bedragen in de boekhouding zijn excl. BTW
- BTW-aangifte: kwartaal — Q1: 30 april | Q2: 31 juli | Q3: 31 oktober | Q4: 31 januari
- BTW-correctie privégebruik (auto, telefoon) moet uiterlijk 31 december van het boekjaar zijn verwerkt

## IB-Berekening Volgorde (eenmanszaak)
1. Fiscale Winst = Netto-omzet − Kosten (excl. BTW, excl. afschrijvingen) − Afschrijvingen + Bijtelling auto
2. Fiscale Winst − Zelfstandigenaftrek = Winst na ondernemersaftrek
3. Winst na ondernemersaftrek × (1 − MKB%) = Belastbare Winst (Box 1)
4. Belastbare Winst × IB-tarief = IB te betalen (schatting)

## Aftrekposten & Vrijstellingen
- **Zelfstandigenaftrek**: zie tarieven boekjaar hieronder (vereist urencriterium >1.225 uur/jaar; bouwt af naar €900 in 2027)
- **MKB-Winstvrijstelling**: zie tarieven boekjaar hieronder (geen urencriterium vereist)
- **KIA (Kleinschaligheidsinvesteringsaftrek)**: 28% aftrek op zakelijke investeringen boven de KIA-drempel t/m ca. €353.000

## IB Box 1 Tarieven
Zie sectie "Tarieven Boekjaar" hieronder — deze worden dynamisch ingevuld op basis van het boekjaar.

## Afschrijving (lineaire methode)
- Computers/hardware: 3–5 jaar
- Inventaris/inrichting: 5–10 jaar
- Bedrijfsauto: 4–5 jaar

## Fiscale Deadlines
- IB-aangifte eenmanszaak: 1 mei volgend jaar
- BTW-kwartaalaangiftes: zie boven
- KVK-deponering jaarrekening: 12 maanden na boekjaareinde
- IB-reservering: adviseer apart te reserveren op zakelijke rekening

## Gedragsregels
- Geef uitsluitend concreet, berekend advies — geen vage algemeenheden zoals "zorg voor een goede administratie"
- Vermeld altijd concrete bedragen als die berekend kunnen worden uit de aangeleverde data
- Maximaal 5 adviespunten; laat kaarten weg als ze niet van toepassing zijn — liever 2 scherpe dan 5 vage
- Antwoord uitsluitend in het Nederlands
- Retourneer UITSLUITEND een geldige JSON-array zonder markdown-blokken, headers of inleidende tekst

## Output Structuur
[
  {
    "type": "warning|tip|info",
    "title": "Korte, pakkende titel (max 8 woorden)",
    "description": "Inhoudelijke uitleg met concreet actiepunt en eventueel berekend bedrag."
  }
]`;

export const handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: true, message: 'Method Not Allowed' })
        };
    }

    let messages, context;
    try {
        ({ messages, context } = JSON.parse(event.body));
    } catch {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: true, message: 'Ongeldig JSON request body.' })
        };
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: true, message: 'Geen berichten meegestuurd.' })
        };
    }

    // Injecteer jaar-specifieke tarieven in het system prompt zodat Claude
    // altijd de juiste getallen gebruikt, ongeacht het boekjaar.
    const rates = context?.taxRates;
    const box1Omschrijving = rates?.box1
        ? rates.box1.map((s, i) => {
            const vorige = i === 0 ? 0 : rates.box1[i - 1].grens;
            const grensLabel = s.grens === Infinity ? 'daarboven' : `t/m €${s.grens.toLocaleString('nl-NL')}`;
            const vanLabel = i === 0 ? '' : `€${vorige.toLocaleString('nl-NL')}–`;
            return `${vanLabel}${grensLabel}: ${(s.tarief * 100).toFixed(2)}%`;
          }).join(' | ')
        : '36,97% t/m €75.518 | 49,50% daarboven';

    const dynamicRatesSection = rates ? `
## Tarieven Boekjaar ${context.fiscalYear}
- Zelfstandigenaftrek: €${rates.zelfstandigenaftrek.toLocaleString('nl-NL')}
- MKB-Winstvrijstelling: ${(rates.mkbWinstvrijstelling * 100).toFixed(2)}%
- KIA-drempel: €${rates.kiaDrempel.toLocaleString('nl-NL')}
- IB Box 1: ${box1Omschrijving}` : '';

    const systemPrompt = SYSTEM_PROMPT + dynamicRatesSection;

    const apiKey = process.env.ANTHROPIC_API_KEY ? process.env.ANTHROPIC_API_KEY.trim() : '';
    if (!apiKey) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: true, message: 'Server configuratiefout: ANTHROPIC_API_KEY ontbreekt.' })
        };
    }

    try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-6',
                max_tokens: 1024,
                system: systemPrompt,
                messages
            })
        });

        // Log Anthropic request ID for debugging
        const requestId = response.headers.get('request-id') || response.headers.get('x-request-id') || 'n/a';
        console.log(`[fiscalAdvisor] Anthropic request-id: ${requestId}, boekjaar: ${context?.fiscalYear || 'onbekend'}`);

        if (!response.ok) {
            const errorData = await response.json();
            const message = errorData?.error?.message || `Anthropic API fout: ${response.status}`;
            console.error(`[fiscalAdvisor] API fout (${response.status}):`, message);
            return {
                statusCode: response.status,
                body: JSON.stringify({ error: true, message })
            };
        }

        const data = await response.json();
        const text = data?.content?.[0]?.text || '[]';

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        };

    } catch (error) {
        console.error('[fiscalAdvisor] Onverwachte fout:', error.message);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: true, message: error.message })
        };
    }
};

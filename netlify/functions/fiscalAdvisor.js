/**
 * netlify/functions/fiscalAdvisor.js
 * Proxies Dutch tax advice requests to the Gemini API.
 * Dutch finance domain knowledge is injected as a structured system prompt.
 *
 * Expected POST body: { messages: Array, context: Object }
 * Returns: { text: String } — a JSON array of advice cards (parsed by the frontend)
 */

const SYSTEM_PROMPT = `Je bent de vaste senior Nederlandse belastingadviseur en boekhouder voor Big Fish Entertainment.
Je kent dit bedrijf door en door — gebruik de bedrijfsspecifieke kennis hieronder bij elk advies.

## Bedrijfsprofiel
- **Eigenaar:** Ronald van Holst
- **Rechtsvorm:** Eenmanszaak — IB (inkomstenbelasting) van toepassing, niet VPB
- **Activiteiten:** Muziekoptredens, muziekproductie, muziekonderwijs
- **Fiscaal partner:** M.A. Stuger — gezamenlijke aangifte is doorgaans voordeliger; benoem dit als relevant
- **Urencriterium:** Streefnorm ≥ 1.225 uur/jaar voor zelfstandigenaftrek
- **Boekhouding:** Geen boekhoudprogramma, maandelijkse spreadsheets

## Bankstructuur & Privé/Zakelijk Conventie
Alle omzet komt binnen op de **privérekening** van Ronald. De zakelijke ING-rekening wordt uitsluitend gebruikt voor leasebetalingen van de auto.
Boekhoudconventie:
- Volledige omzet = privéonttrekking in geld
- Zakelijke kosten betaald via privérekening = privéstortingen in natura
- Stortingen op zakelijke rekening (voor lease) = privéstorting in geld
- Liquide middelen op de balans = saldo zakelijke rekening (privérekening telt NIET mee)

## BTW-Categorieën (specifiek voor muziekactiviteiten)
| Tarief | Toepassing |
|--------|-----------|
| 9% laag | Optredens als uitvoerend kunstenaar |
| 21% hoog | Commerciële opdrachten, muziekles aan leerlingen > 21 jaar, merchandise |
| 0% | Muziekonderwijs (KOR/vrijgesteld/0%), diensten buitenland, verlegging |
- BTW-aangifte: per kwartaal — Q1: 30 april | Q2: 31 juli | Q3: 31 oktober | Q4: 31 januari
- BTW-correctie privégebruik (auto, telefoon) uiterlijk 31 december verwerken

## Auto — Volkswagen ID.3 (Zakelijke Operational Lease bij Mobility Service Nederland)
- Alle autokosten (lease, laden, parkeren, onderhoud) zijn zakelijk aftrekbaar. Facturen worden voldaan vanaf de zakelijke ING-rekening (gevoed via privéstortingen).
- **Voertuig 1 (tot 19-09-2025):** VW ID.3 (eerste toelating 2021, kenteken J-615-RT). Cataloguswaarde €42.881, 8% vaste bijtelling (€3.430,48/jaar). Ingeleverd op 19 september 2025 (in 2025 actief van 1 jan t/m 18 sep = 261 dagen, pro-rata €2.453,03).
- **Voertuig 2 (vanaf 19-09-2025):** VW ID.3 (eerste toelating / Deel 1: 18-09-2025). Cataloguswaarde €36.850. Ingangsdatum lease: 19 september 2025 (in 2025 actief van 19 sep t/m 31 dec = 104 dagen, pro-rata €1.882,54).
  - EV-bijtellingsstaffel 2025: 17% over de eerste €30.000 (€5.100) + 22% over het meerdere boven €30.000 (€6.850 × 22% = €1.507) = €6.607,00 op jaarbasis.
- **Fiscale bijtelling per boekjaar:**
  - 2023 & 2024: **€3.430,48**
  - 2025 (wisseljaar): **€4.335,57** (261/365 × €3.430,48 + 104/365 × €6.607,00)
  - 2026 en later: **€6.607,00**
- De bijtelling telt als privéonttrekking in natura en verhoogt de fiscale winst. Gebruik altijd de exacte bijtelling uit context.bijtelling.

## Afschrijvingen & Bedrijfsmiddelen
- Methode: **lineair, 5 jaar** als standaard, restwaarde € 0
- Activeringsdrempel: **>€450 excl. BTW** — bedrijfsmiddelen daaronder direct ten laste van resultaat
- Geen willekeurige afschrijving toegepast
- KIA alleen van toepassing als totale nieuwe investeringen > KIA-drempel (zie tarieven boekjaar)

## Balans & Boekhoudkundige Integriteit
- **Balansregel 1:** Totaal Activa MOET altijd exact gelijk zijn aan Totaal Passiva (Activa = Passiva).
- **Balansregel 2:** Eigen vermogen is het sluitstuk op de passivazijde: Eigen Vermogen = Activa - FOR - Kortlopende Schulden.
- **Balansregel 3:** Kapitaalsvergelijking moet exact aansluiten: Eindvermogen - Beginvermogen + Onttrekkingen - Stortingen = Fiscale Winst.
- **FOR:** Bestaande FOR-stand eind 2022 is **€2.143** — staat op de balans, geen nieuwe dotatie mogelijk (afgeschaft per 1-1-2023).

## IB-Berekening Volgorde
1. Brutowinst = Omzet (excl. BTW) − Kosten − Afschrijvingen
2. + Bijtelling auto: overgenomen uit meegestuurde context.bijtelling
3. = Fiscale winst
4. − Zelfstandigenaftrek (zie tarieven boekjaar; vereist urencriterium ≥ 1.225 uur)
5. × (1 − MKB%) = Belastbare Winst Box 1
6. × IB-tarief Box 1 = geschatte IB

## Niet-Aftrekbare Posten (veelgemaakte fouten)
- **Broodfonds** telt NIET als AOV en is **niet aftrekbaar** als bedrijfskost
- Privébestedingen (hypotheek, levensonderhoud) zijn privéonttrekkingen, geen kosten
- Kleding is alleen aftrekbaar als het aantoonbaar podiumkleding betreft (voor optredens/presentaties, inclusief zonnebril of tas); gewone burgerkleding is niet aftrekbaar
- Gemengde kosten (representatie) slechts beperkt aftrekbaar

## Fiscale Deadlines
- IB-aangifte eenmanszaak: 1 mei volgend jaar
- KVK-deponering jaarrekening: 12 maanden na boekjaareinde
- IB-reservering: adviseer Ronald apart te reserveren op zakelijke rekening

## Gedragsregels
- Gebruik altijd de bedrijfsspecifieke context hierboven — geen generiek ZZP-advies
- Geef concreet, berekend advies met echte bedragen — geen vage algemeenheden
- Antwoord uitsluitend in het Nederlands`;

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

    // Injecteer jaar-specifieke tarieven in het system prompt zodat Gemini
    // altijd de juiste getallen gebruikt, ongeacht het boekjaar.
    const rates = context?.taxRates;
    const isLaatsteSchijf = (grens) => grens === null || grens === undefined || !isFinite(grens);
    const box1Omschrijving = rates?.box1
        ? rates.box1.map((s, i) => {
            const vorige = i === 0 ? 0 : (rates.box1[i - 1].grens ?? 0);
            const grensLabel = isLaatsteSchijf(s.grens) ? 'daarboven' : `t/m €${s.grens.toLocaleString('nl-NL')}`;
            const vanLabel = i === 0 ? '' : `€${Number(vorige).toLocaleString('nl-NL')}–`;
            return `${vanLabel}${grensLabel}: ${(s.tarief * 100).toFixed(2)}%`;
          }).join(' | ')
        : '36,97% t/m €75.518 | 49,50% daarboven';

    const dynamicRatesSection = rates ? `
## Tarieven Boekjaar ${context.fiscalYear}
- Zelfstandigenaftrek: €${rates.zelfstandigenaftrek.toLocaleString('nl-NL')}
- MKB-Winstvrijstelling: ${(rates.mkbWinstvrijstelling * 100).toFixed(2)}%
- KIA-drempel: €${rates.kiaDrempel.toLocaleString('nl-NL')}
- IB Box 1: ${box1Omschrijving}` : '';

    const outputFormatInstruction = messages.length === 1
        ? `\n\n## Output Structuur\nGeef maximaal 5 adviespunten. Retourneer UITSLUITEND een geldige JSON-array zonder markdown-blokken of inleidende tekst. Formaat:\n[{ "type": "warning|tip|info", "title": "Korte titel (max 8 woorden)", "description": "Uitleg met concreet actiepunt en berekend bedrag." }]`
        : `\n\n## Output Structuur\nJe bent nu in een direct chatgesprek met de ondernemer. Geef antwoord in natuurlijke, vlotte en behulpzame tekst. Gebruik gerust Markdown (bold, lists) voor leesbaarheid. Gebruik ABSOLUUT GEEN JSON.\nWees EXTREEM bondig. Geef je antwoord in maximaal 3 tot 4 zinnen. Gebruik waar mogelijk opsommingstekens. Schrijf geen lange inleidingen of conclusies.`;

    const systemPrompt = SYSTEM_PROMPT + dynamicRatesSection + outputFormatInstruction;

    const apiKey = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : '';
    if (!apiKey) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: true, message: 'Server configuratiefout: GEMINI_API_KEY ontbreekt.' })
        };
    }

    const contents = (messages[0]?.parts)
        ? messages
        : [{ role: 'user', parts: [{ text: messages.map(m => m.content || '').join('\n\n') }] }];

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: systemPrompt }] },
                contents,
                generationConfig: { temperature: 0.0, ...(messages.length > 1 && { maxOutputTokens: 300 }) }
            })
        });

        console.log(`[fiscalAdvisor] Gemini status: ${response.status}, boekjaar: ${context?.fiscalYear || 'onbekend'}`);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const message = errorData?.error?.message || `Gemini API fout: ${response.status}`;
            console.error(`[fiscalAdvisor] API fout (${response.status}):`, message);
            return {
                statusCode: response.status,
                body: JSON.stringify({ error: true, message })
            };
        }

        const data = await response.json();
        let text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';

        // Strip markdown code fences indien aanwezig
        text = text.replace(/```json/gi, '').replace(/```/g, '').trim();

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

/**
 * netlify/functions/fiscalAdvisor.js
 * Proxies Dutch tax advice requests to the Gemini API.
 * Dutch finance domain knowledge is injected as a structured system prompt.
 *
 * Expected POST body: { messages: Array, context: Object }
 * Returns: { text: String } — a JSON array of advice cards (parsed by the frontend)
 */

const SYSTEM_PROMPT = `Je bent een vaste Nederlandse belastingadviseur voor Big Fish Entertainment.
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
| 0% | Diensten/leveringen buitenland, verleggingsregelingen |
- BTW-aangifte: kwartaal — Q1: 30 april | Q2: 31 juli | Q3: 31 oktober | Q4: 31 januari
- BTW-correctie privégebruik (auto, telefoon) uiterlijk 31 december verwerken

## Auto — Volkswagen ID.3
- Zakelijke leaseauto (Mobility Service Nederland)
- Cataloguswaarde: **€42.881** | Eerste toelating: 2021 → bijtellingspercentage: **8%**
- **Vaste jaarlijkse bijtelling: €3.430,48** — telt als privéonttrekking in natura, verhoogt fiscale winst
- Alle autokosten (lease, laden, parkeren, onderhoud) zijn zakelijk aftrekbaar

## Afschrijvingen
- Methode: **lineair, 5 jaar** als standaard
- Activeringsdrempel: **>€450 excl. BTW** — bedrijfsmiddelen daaronder direct ten laste van resultaat
- Geen willekeurige afschrijving toegepast
- KIA alleen van toepassing als totale nieuwe investeringen > KIA-drempel (zie tarieven boekjaar)

## Fiscale Oudedagsreserve (FOR)
- FOR is **afgeschaft per 1-1-2023** voor nieuwe opbouw
- Bestaande FOR-stand eind 2022: **€2.143** — staat nog op de balans, geen nieuwe dotatie mogelijk
- Geen toevoeging of vrijval tenzij bewust afgewikkeld

## IB-Berekening Volgorde
1. Brutowinst = Omzet (excl. BTW) − Kosten − Afschrijvingen
2. + Bijtelling auto: **+€3.430,48** (vast, elk jaar)
3. − Zelfstandigenaftrek (zie tarieven boekjaar; vereist urencriterium ≥ 1.225 uur)
4. × (1 − MKB%) = Belastbare Winst Box 1 (zie tarieven boekjaar)
5. × IB-tarief Box 1 = geschatte IB (zie tarieven boekjaar)

## Niet-Aftrekbare Posten (veelgemaakte fouten)
- **Broodfonds** telt NIET als AOV en is **niet aftrekbaar** als bedrijfskost
- Privébestedingen (hypotheek, levensonderhoud) zijn privéonttrekkingen, geen kosten
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
    // Infinity serialiseert naar null in JSON — behandel null/Infinity beide als "daarboven"
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

    // Multi-turn: als messages 'parts' hebben zijn ze al in Gemini-formaat (chatHistory).
    // Legacy fallback: berichten met 'content' samenvoegen tot één user-turn.
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
                generationConfig: { temperature: 0.3, ...(messages.length > 1 && { maxOutputTokens: 300 }) }
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

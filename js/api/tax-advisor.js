/**
 * js/api/tax-advisor.js
 * AI Advisor Module — haalt strategisch fiscaal advies op via Gemini.
 * De Dutch finance domain rules worden als system prompt geïnjecteerd in de Netlify function.
 * Ondersteunt multi-turn gesprek via chatHistory.
 */

import { fetchWithRetry } from '../utils/network.js';
import { schattingIB, getRatesForYear } from '../utils/tax-calculator.js';

// Module-level chat state — blijft actief zolang het rapport open is
let chatHistory  = [];
let savedContext = null;

export function clearChatHistory() {
    chatHistory  = [];
    savedContext = null;
}

/**
 * Stuur een vervolgvraag in het lopende gesprek.
 * Geeft de ruwe tekst-response terug (geen JSON-parsing).
 */
export async function sendFollowUp(question) {
    if (!savedContext) throw new Error('Geen actief gesprek. Genereer eerst een rapport.');

    chatHistory.push({ role: 'user', parts: [{ text: question }] });

    try {
        const response = await fetch('/.netlify/functions/fiscalAdvisor', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: chatHistory, context: savedContext })
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.message || `Server error ${response.status}`);
        }

        const data  = await response.json();
        const text  = (data.text || '').trim();
        chatHistory.push({ role: 'model', parts: [{ text }] });
        return text;

    } catch (err) {
        // Verwijder de laatste user-message zodat de gebruiker opnieuw kan proberen
        chatHistory.pop();
        throw err;
    }
}

export async function getFiscalAdvice(calculatedTaxData, fiscalState) {
    const kostenRatio = calculatedTaxData.omzet > 0
        ? ((calculatedTaxData.kosten / calculatedTaxData.omzet) * 100).toFixed(1)
        : '0';

    const btwSaldo = fiscalState.sheetData
        ? (fiscalState.sheetData.btwAfgedragen?.totaal || 0) - (fiscalState.sheetData.voorbelasting?.totaal || 0)
        : null;

    const afschrijvingenSamenvatting = calculatedTaxData.afschrijvingenLog.length > 0
        ? calculatedTaxData.afschrijvingenLog
            .map(i => `${i.omschrijving}: afschrijving €${i.afschrijvingDitJaar.toFixed(2)}, boekwaarde eind €${i.boekwaardeEind.toFixed(2)}`)
            .join('; ')
        : 'Geen inventaris opgegeven';

    const ibSchatting = schattingIB(calculatedTaxData.belastbareWinst, calculatedTaxData.year);
    const taxRates = getRatesForYear(calculatedTaxData.year);

    // Gestructureerd context-object — ook meegestuurd voor logging in de function
    const context = {
        fiscalYear: calculatedTaxData.year,
        omzet: calculatedTaxData.omzet,
        kosten: calculatedTaxData.kosten,
        kostenRatio: parseFloat(kostenRatio),
        totaleAfschrijving: calculatedTaxData.totaleAfschrijving,
        investeringenDitJaar: calculatedTaxData.investeringenDitJaar,
        bijtelling: calculatedTaxData.bijtelling,
        fiscaleWinst: calculatedTaxData.fiscaleWinst,
        zelfstandigenaftrek: calculatedTaxData.ondernemersaftrek,
        mkbVrijstelling: calculatedTaxData.mkbWinstvrijstellingBedrag,
        belastbareWinst: calculatedTaxData.belastbareWinst,
        ibSchatting,
        taxRates,
        urencriteriumGehaald: fiscalState.ondernemer?.urencriteriumGehaald ?? false,
        bankEindsaldo: fiscalState.bank?.eindSaldo || 0,
        btwSaldo
    };

    // User message — bevat de data en de analyse-opdracht
    // De system prompt met Dutch finance rules zit in de Netlify function
    const userMessage = `Analyseer de volgende financiële data voor boekjaar ${context.fiscalYear} en geef concreet fiscaal advies.

FINANCIËLE DATA:
- Omzet (excl. BTW): €${context.omzet.toFixed(2)}
- Kosten (excl. afschrijvingen): €${context.kosten.toFixed(2)}
- Kostenratio: ${context.kostenRatio}% van de omzet
- Totale afschrijvingen: €${context.totaleAfschrijving.toFixed(2)}
- Nieuwe investeringen dit jaar: €${context.investeringenDitJaar.toFixed(2)}
- Bijtelling auto: €${context.bijtelling.toFixed(2)}
- Fiscale Winst: €${context.fiscaleWinst.toFixed(2)}
- Zelfstandigenaftrek toegepast: €${context.zelfstandigenaftrek.toFixed(2)}
- MKB-Winstvrijstelling: €${context.mkbVrijstelling.toFixed(2)}
- Belastbare Winst (Box 1): €${context.belastbareWinst.toFixed(2)}
- Geschatte IB (Box 1): €${context.ibSchatting.toFixed(2)}
- Urencriterium (>1.225 uur) gehaald: ${context.urencriteriumGehaald ? 'Ja' : 'Nee'}
- Bank eindsaldo: €${context.bankEindsaldo.toFixed(2)}
${context.btwSaldo !== null ? `- BTW af te dragen (saldo jaarbasis): €${context.btwSaldo.toFixed(2)}` : ''}
- Inventaris & afschrijvingen: ${afschrijvingenSamenvatting}

ANALYSE-DOELEN (geef alleen een kaart als het echt relevant is):

1. KIA: Beoordeel of de nieuwe investeringen (€${context.investeringenDitJaar.toFixed(2)}) in aanmerking komen voor KIA (drempel €2.801). Als ze er net onder zitten, adviseer concreet om bij te investeren. Als ze er al boven zitten, bereken de verwachte KIA-aftrek (28%).

2. Kostenratio: Signaleer alleen als de ratio opvallend hoog (>60%) of laag (<15%) is — met een concreet actiepunt.

3. Lijfrente/pensioen: Relevant als belastbare winst boven €30.000 ligt. Bereken globaal de maximale jaarruimte.

4. BTW-risico: Waarschuw als het BTW-saldo boven €5.000 ligt (mogelijke suppletie of openstaande betaling).

5. Urencriterium: Als niet gehaald, bereken wat de gemiste zelfstandigenaftrek concreet kost in extra IB.`;

    // Start altijd met een schone lei bij een nieuw rapport
    clearChatHistory();
    savedContext = context;
    chatHistory.push({ role: 'user', parts: [{ text: userMessage }] });

    try {
        const response = await fetchWithRetry('/.netlify/functions/fiscalAdvisor', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: chatHistory, context })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `Server error: ${response.status}`);
        }

        const data     = await response.json();
        const rawText  = (data.text || '').trim();

        // Sla de initiële response op in de history voor vervolgvragen
        chatHistory.push({ role: 'model', parts: [{ text: rawText }] });

        let jsonText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
        const start  = jsonText.indexOf('[');
        const end    = jsonText.lastIndexOf(']');
        if (start !== -1 && end > start) jsonText = jsonText.slice(start, end + 1);

        return JSON.parse(jsonText);

    } catch (error) {
        console.error('🚨 Fout in AI Advisor module:', error);
        clearChatHistory(); // Niet verder chatten na een mislukte initiële aanvraag
        return [
            {
                type: 'warning',
                title: 'AI Adviseur tijdelijk niet beschikbaar',
                description: `Er is een fout opgetreden bij het genereren van het fiscaal advies: ${error.message}`
            }
        ];
    }
}

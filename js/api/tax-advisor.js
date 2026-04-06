/**
 * js/api/tax-advisor.js
 * AI Advisor Module om strategisch fiscaal advies op te halen via Gemini.
 */

import { fetchWithRetry } from '../utils/network.js';

export async function getFiscalAdvice(calculatedTaxData, fiscalState) {
    const kostenRatio = calculatedTaxData.omzet > 0
        ? ((calculatedTaxData.kosten / calculatedTaxData.omzet) * 100).toFixed(1)
        : 0;

    const btwSaldo = fiscalState.sheetData
        ? (fiscalState.sheetData.btwAfgedragen?.totaal || 0) - (fiscalState.sheetData.voorbelasting?.totaal || 0)
        : null;

    const afschrijvingenSamenvatting = calculatedTaxData.afschrijvingenLog.length > 0
        ? calculatedTaxData.afschrijvingenLog.map(i => `${i.omschrijving}: afschrijving €${i.afschrijvingDitJaar.toFixed(2)}, boekwaarde eind €${i.boekwaardeEind.toFixed(2)}`).join('; ')
        : 'Geen inventaris opgegeven';

    const prompt = `Je bent een proactieve, strategische Nederlandse belastingadviseur gespecialiseerd in ZZP/eenmanszaak aangiftes.
Analyseer de volgende financiële data voor boekjaar ${calculatedTaxData.year} en geef concreet, persoonlijk advies.

FINANCIËLE DATA:
- Omzet (excl. BTW): €${calculatedTaxData.omzet.toFixed(2)}
- Kosten (excl. afschrijvingen): €${calculatedTaxData.kosten.toFixed(2)}
- Kostenratio: ${kostenRatio}% van de omzet
- Totale afschrijvingen: €${calculatedTaxData.totaleAfschrijving.toFixed(2)}
- Nieuwe investeringen dit jaar: €${calculatedTaxData.investeringenDitJaar.toFixed(2)}
- Bijtelling auto: €${calculatedTaxData.bijtelling.toFixed(2)}
- Fiscale Winst: €${calculatedTaxData.fiscaleWinst.toFixed(2)}
- Ondernemersaftrek (zelfstandigenaftrek): €${calculatedTaxData.ondernemersaftrek.toFixed(2)}
- MKB-Winstvrijstelling: €${calculatedTaxData.mkbWinstvrijstellingBedrag.toFixed(2)}
- Belastbare Winst: €${calculatedTaxData.belastbareWinst.toFixed(2)}
- Urencriterium (>1225 uur) gehaald: ${fiscalState.ondernemer.urencriteriumGehaald ? 'Ja' : 'Nee'}
- Bank eindsaldo: €${(fiscalState.bank?.eindSaldo || 0).toFixed(2)}
${btwSaldo !== null ? `- BTW af te dragen (saldo): €${btwSaldo.toFixed(2)}` : ''}
- Inventaris & afschrijvingen: ${afschrijvingenSamenvatting}

ANALYSE-DOELEN (controleer elk punt en geef alleen een kaart als het echt relevant is):

1. KIA (Kleinschaligheidsinvesteringsaftrek):
   - De KIA geldt voor investeringen TUSSEN €2.801 en ca. €353.000 (boekjaar ${calculatedTaxData.year}).
   - Als de nieuwe investeringen ONDER €2.801 liggen maar dichtbij (bijv. €1.500–€2.800): adviseer concreet om nog dit jaar te investeren om KIA te activeren (28% aftrek op het totaal).
   - Als de investeringen al boven €2.801 liggen: bereken de verwachte KIA-aftrek (28%) en vermeld dit als positief info-feit.
   - Als er helemaal niet is geïnvesteerd: geef een tip over wat voor investeringen in aanmerking komen.

2. Kostenratio anomalie:
   - Een kostenratio boven 60% is hoog voor een typische ZZP-dienstverlener en verdient aandacht.
   - Een ratio onder 15% kan betekenen dat er aftrekbare kosten gemist worden.
   - Geef alleen een kaart als de ratio opvallend hoog of laag is — met een concreet actiepunt.

3. Lijfrente / pensioensparen:
   - Als de belastbare winst boven €30.000 ligt: wijs op de mogelijkheid om via een lijfrenteverzekering of bankspaarproduct de belastbare winst te verlagen. Bereken globaal hoeveel aftrek mogelijk is (jaarruimte-formule: 30% van de premiegrondslag, maximum ca. €34.550 voor ${calculatedTaxData.year}).
   - Alleen relevant als winst substantieel is.

4. BTW-risico (alleen als btwSaldo beschikbaar en opvallend):
   - Als het BTW-saldo hoger is dan €5.000: waarschuw dat er mogelijk een suppletie of kwartaalbetaling openstaat. Adviseer dit te controleren.

5. Urencriterium:
   - Als urencriterium NIET gehaald is maar de winst positief is: wijs erop dat de zelfstandigenaftrek (€${calculatedTaxData.ondernemersaftrek > 0 ? calculatedTaxData.ondernemersaftrek.toFixed(0) : '3.750'}) daardoor misloopt en wat dat concreet kost in extra belasting.

OUTPUT REGELS:
- Maximaal 5 kaarten. Laat kaarten weg als ze niet van toepassing zijn — liever 2 scherpe kaarten dan 5 vage.
- Vermijd algemeenheden ("zorg voor een goede administratie"). Wees specifiek met bedragen als dat kan.
- Geef je antwoord uitsluitend als een JSON-array, zonder markdown of inleidende tekst.

JSON STRUCTUUR:
[
  {
    "type": "warning|tip|info",
    "title": "Korte, pakkende titel",
    "description": "Inhoudelijke uitleg met concreet actiepunt en eventueel een berekend bedrag."
  }
]`;

    try {
        // We maken gebruik van dezelfde brug-logica als de scanner, gericht op een AI proxy
        const response = await fetchWithRetry('/.netlify/functions/fiscalAdvisor', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ prompt })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Server error: ${response.status}`);
        }

        const data = await response.json();
        
        // Parsen van de AI output en opschonen van eventuele markdown leftovers
        let jsonText = data.text || data.reply || data.advice || "";
        jsonText = jsonText.replace(/```json/g, '').replace(/```/g, '').trim();

        return JSON.parse(jsonText);

    } catch (error) {
        console.error("🚨 Fout in AI Advisor module:", error);
        return [
            {
                type: "error",
                title: "AI Adviseur tijdelijk niet beschikbaar",
                description: "Er is een fout opgetreden bij het genereren van het fiscaal advies. Controleer de internetverbinding of proxy instellingen."
            }
        ];
    }
}
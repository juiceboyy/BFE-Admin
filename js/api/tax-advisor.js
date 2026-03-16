/**
 * js/api/tax-advisor.js
 * AI Advisor Module om strategisch fiscaal advies op te halen via Gemini.
 */

export async function getFiscalAdvice(calculatedTaxData, fiscalState) {
    const prompt = `Je bent een proactieve, strategische Nederlandse belastingadviseur. 
Analyseer de volgende financiële data voor het jaar ${calculatedTaxData.year}.

FINANCIËLE DATA:
- Omzet: €${calculatedTaxData.omzet.toFixed(2)}
- Kosten: €${calculatedTaxData.kosten.toFixed(2)}
- Fiscale Winst: €${calculatedTaxData.fiscaleWinst.toFixed(2)}
- Belastbare Winst: €${calculatedTaxData.belastbareWinst.toFixed(2)}
- Nieuwe investeringen dit jaar: €${calculatedTaxData.investeringenDitJaar.toFixed(2)}
- Urencriterium (>1225 uur) gehaald: ${fiscalState.ondernemer.urencriteriumGehaald ? 'Ja' : 'Nee'}

DOELEN VAN DE ANALYSE:
1. KIA Drempel: Controleer of de nieuwe investeringen in de buurt komen van de Kleinschaligheidsinvesteringsaftrek (KIA) drempel (ca. € 2.800). Adviseer om indien nuttig meer te investeren als ze er net onder zitten.
2. Kosten Anomalieën: Controleer of de verhouding tussen kosten en omzet logisch lijkt.
3. Algemene Fiscale Tips: Geef legale manieren of tips om de belastbare winst verder te verlagen.

OUTPUT FORMAAT (STRIKT JSON):
Geef je antwoord uitsluitend als een JSON-array van objecten, zonder markdown (zoals \`\`\`json) en zonder inleidende of afsluitende tekst. 
Structuur per object:
[
  {
    "type": "warning", // Kan "warning", "tip" of "info" zijn
    "title": "Korte, pakkende titel",
    "description": "De inhoudelijke uitleg en het concrete actiepunt voor de ondernemer."
  }
]`;

    try {
        // We maken gebruik van dezelfde brug-logica als de scanner, gericht op een AI proxy
        const response = await fetch('/.netlify/functions/fiscalAdvisor', {
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
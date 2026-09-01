export const handler = async (event, context) => {
    // Alleen POST requests toestaan
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method Not Allowed' })
        };
    }

    try {
        // Parse de inkomende data
        let { base64Data, mimeType, cloudMemory, mode = 'inkoop' } = JSON.parse(event.body);

        // Haal de API key veilig op en verwijder onzichtbare tekens
        const apiKey = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : '';
        
        if (!apiKey) {
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'Server configuratiefout: API Key ontbreekt.' })
            };
        }

        // Gebruik de stabiele URL voor Gemini 3.6 Flash
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`;

        // Zorg ervoor dat base64Data géén data prefix bevat
        if (base64Data.includes(',')) {
            base64Data = base64Data.split(',')[1];
        }

        // Bepaal de system prompt op basis van de modus (inkoop vs verkoop)
        let systemPrompt;
        if (mode === 'verkoop') {
            systemPrompt = `Je bent een accountant die een UITGAANDE verkoopfactuur analyseert. Jij (de afzender) bent Big Fish Entertainment of Ronald van Holst. Gebruik NOOIT deze namen als klant. De klantNaam is degene AAN WIE de factuur is gericht (vaak onder kopjes als "Factuur voor:" of "Aan:"). Voor de omschrijving: Omdat verkoopfacturen vaak meerdere regels hebben, bedenk zelf een korte, logische samenvatting (bijv. "Huur werkruimte en opslag"). Neem niet letterlijk alle regels over. CRUCIAAL: De omschrijving mag NOOIT worden afgekapt met puntjes (...). Gebruik in plaats daarvan gangbare afkortingen (zoals 'mgmt', 'werkzk', 'vh', 'div', 'adm') om de lengte binnen een acceptabele grens (maximaal 50-60 tekens) te houden. De datum MOET ALTIJD in het format YYYY-MM-DD zijn (bijv. 2026-02-28). Gebruik NOOIT tekst zoals "feb" of "maart". Als je de datum niet exact weet, gebruik dan de laatste dag van de gevonden maand. BELANGRIJK: Je MOET uitsluitend een geldig JSON object returnen dat EXACT deze structuur volgt. Zorg dat de omschrijving altijd is ingevuld met een logische samenvatting van de factuurregels: { "factuurnummer": "...", "datum": "YYYY-MM-DD", "klantNaam": "...", "omschrijving": "Jouw samenvatting hier", "totaalBedrag": 0.00, "btwLaag": 0.00, "btwHoog": 0.00, "omzetLaag": 0.00, "omzetHoog": 0.00, "omzetNul": 0.00 }`;
        } else {
            systemPrompt = `Je bent een Nederlandse accountant die inkoopfacturen en bonnen analyseert.
Haal de volgende velden uit deze bon of factuur:
1. datum: De officiële FACTUURDATUM / UITGIFTEDATUM in het formaat YYYY-MM-DD (bijv. 2026-07-03).
   CRUCIAAL: Gebruik ALTIJD de factuurdatum / aankoopdatum en NOOIT de vervaldatum, uiterste betaaldatum, incassodatum of leverdatum.
2. naamLeverancier: De officiële handelsnaam van het bedrijf / de organisatie die de factuur heeft uitgereikt (de leverancier). Nooit de naam van de klant (Ronald van Holst / Big Fish Entertainment).
3. omschrijving: Een beknopte, duidelijke omschrijving van de gekochte goederen/diensten. De omschrijving mag NOOIT worden afgekapt met puntjes (...). Gebruik gangbare afkortingen om binnen 50-60 tekens te blijven.
   Hier is het historische geheugen van de gebruiker: ${JSON.stringify(cloudMemory)}.
   Als de leverancier voorkomt in het geheugen, kies dan de best passende omschrijving voor deze specifieke aankoop.
4. factuurBedrag: Het exacte TOTAALBEDRAG van de factuur inclusief btw (het totale te betalen/voldane bedrag onderaan de bon). Return dit als getal (float).
5. btwBedrag: Het totale btw-bedrag (zowel 9% als 21% samen) op de factuur. Return dit als getal (float).
6. factuurnummer: Het factuurnummer dat op de bon van de leverancier staat (indien aanwezig).

UITZONDERING VOOR ING BANKAFSCHRIFTEN:
Als je herkent dat het document een bankafschrift is (bijv. ING Af- en bijschrijvingen):
- Focus UITSLUITEND op de eerste pagina van het document.
- Vul "Tesla" in als naamLeverancier.
- Zoek naar het kopje "Totaal af (EUR)" voor het factuurBedrag (negeer mintekens).
- Bereken het btwBedrag als: (factuurBedrag * 21) / 121 (afgerond op 2 decimalen).
- Omschrijving: "Tesla Supercharging".
- Datum: Altijd de LAATSTE DAG VAN DE BETREFFENDE MAAND (YYYY-MM-DD).
- factuurnummer: Laat leeg ("").

BELANGRIJK: Return UITSLUITEND een geldig JSON object met de structuur:
{
  "factuurnummer": "...",
  "datum": "YYYY-MM-DD",
  "naamLeverancier": "...",
  "omschrijving": "...",
  "factuurBedrag": 0.00,
  "btwBedrag": 0.00
}`;
        }

        // Fetch request body volgens Gemini v1beta specificatie
        const payload = {
            contents: [{
                parts: [
                    { text: systemPrompt },
                    {
                        inline_data: {
                            mime_type: mimeType,
                            data: base64Data
                        }
                    }
                ]
            }],
            generationConfig: {
                temperature: 0.0
            }
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        // Error handling: Google API fouten
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const errorMessage = errorData?.error?.message || (typeof errorData?.error === 'string' ? errorData.error : `Gemini API fout (${response.status})`);
            return {
                statusCode: 500,
                body: JSON.stringify({ error: errorMessage })
            };
        }

        // Succes handling: Data extractie en opschoning
        const data = await response.json();
        let text = data.candidates[0].content.parts[0].text;

        // Strip markdown formatting (```json en ```)
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: text
        };

    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};
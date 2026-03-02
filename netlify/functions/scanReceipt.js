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

        // Gebruik de stabiele URL voor Gemini 2.5 Flash
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

        // Zorg ervoor dat base64Data géén data prefix bevat
        if (base64Data.includes(',')) {
            base64Data = base64Data.split(',')[1];
        }

        // Bepaal de system prompt op basis van de modus (inkoop vs verkoop)
        let systemPrompt;
        if (mode === 'verkoop') {
            systemPrompt = `Je bent een accountant die een UITGAANDE verkoopfactuur analyseert. Jij (de afzender) bent Big Fish Entertainment of Ronald van Holst. Gebruik NOOIT deze namen als klant. De klantNaam is degene AAN WIE de factuur is gericht (vaak onder kopjes als "Factuur voor:" of "Aan:"). Voor de omschrijving: Omdat verkoopfacturen vaak meerdere regels hebben, bedenk zelf een korte, logische samenvatting (bijv. "Huur werkruimte en opslag"). Neem niet letterlijk alle regels over. BELANGRIJK: Je MOET uitsluitend een geldig JSON object returnen dat EXACT deze structuur volgt. Zorg dat de omschrijving altijd is ingevuld met een logische samenvatting van de factuurregels: { "factuurnummer": "...", "datum": "...", "klantNaam": "...", "omschrijving": "Jouw samenvatting hier", "totaalBedrag": 0.00, "btwLaag": 0.00, "btwHoog": 0.00, "omzetLaag": 0.00, "omzetHoog": 0.00, "omzetNul": 0.00 }`;
        } else {
            systemPrompt = `Je bent een Nederlandse accountant. Haal factuurnummer, datum (YYYY-MM-DD), naamLeverancier, omschrijving, factuurBedrag, btwBedrag uit deze bon. \nBELANGRIJK: Hier is het historische geheugen van de gebruiker: ${JSON.stringify(cloudMemory)}. \nAls je de leverancier op de bon herkent in dit geheugen, kijk dan goed naar de specifieke producten op de bon. Kies de "omschrijving" uit het geheugen die het beste past bij deze producten. Als de producten nieuw zijn voor deze leverancier, bedenk dan zelf een duidelijke nieuwe omschrijving. \nZoek het absolute eindtotaal van de bon (het volledige bedrag inclusief eventuele btw en onbelaste artikelen, wat de klant daadwerkelijk heeft moeten betalen). Return dit als getal in de key factuurBedrag. \nTel alle btw-bedragen op de bon (zowel hoog als laag) bij elkaar op tot één absoluut totaal en return dit als getal in btwBedrag. Return UITSLUITEND een geldig JSON object.\n\nUITZONDERING VOOR ING BANKAFSCHRIFTEN:\nAls je herkent dat het document een bankafschrift is (bijv. ING Af- en bijschrijvingen):\n\nFocus UITSLUITEND op de eerste pagina van het document, de rest mag je negeren.\n\nVul "Tesla" in als naamLeverancier.\n\n4. Om het factuurBedrag te bepalen: negeer de losse transacties in de tabel. Zoek op de eerste pagina specifiek naar het kopje "Totaal af (EUR)". Het getal dat daar direct onder of naast staat (bijvoorbeeld 158,60) is het absolute eindbedrag. Gebruik dit getal als het factuurBedrag en negeer eventuele mintekens.\n\nEr staat geen btw op een bankafschrift. Bereken dit zelf door uit te gaan van 21% btw. De formule voor het btwBedrag is: (factuurBedrag * 21) / 121. Rond dit af op 2 decimalen.\n\nBedenk een logische omschrijving (bijvoorbeeld "Tesla Supercharging" of "Tesla Afschrijving").\n\n7. Bepaal over welke maand het afschrift gaat en gebruik altijd de LAATSTE DAG VAN DIE MAAND als de datum (format: YYYY-MM-DD).\n8. Laat het factuurnummer altijd helemaal leeg (return een lege string "" of null). Verzin zelf geen nummers, dit wordt door een ander systeem afgehandeld.`;
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
            }]
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
            const errorData = await response.json();
            return {
                statusCode: 500,
                body: JSON.stringify(errorData)
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
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
        let { base64Data, mimeType, cloudMemory } = JSON.parse(event.body);

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

        // Fetch request body volgens Gemini v1beta specificatie
        const payload = {
            contents: [{
                parts: [
                    { text: `Je bent een Nederlandse accountant. Haal factuurnummer, datum (YYYY-MM-DD), naamLeverancier, bedragExclusief, btwTarief, btwBedrag uit deze bon. \nBELANGRIJK: Hier is het historische geheugen van de gebruiker: ${JSON.stringify(cloudMemory)}. \nAls je de leverancier op de bon herkent in dit geheugen, kijk dan goed naar de specifieke producten op de bon. Kies de "omschrijving" en "btwTarief" uit het geheugen die het beste passen bij deze producten. Als de producten nieuw zijn voor deze leverancier, bedenk dan zelf een duidelijke nieuwe omschrijving en bepaal het juiste tarief. Return UITSLUITEND een geldig JSON object.` },
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
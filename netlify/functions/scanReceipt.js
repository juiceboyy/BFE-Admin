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
        const { base64Data, mimeType } = JSON.parse(event.body);

        // Haal de API key veilig op uit de environment variables
        const API_KEY = process.env.GEMINI_API_KEY;

        if (!API_KEY) {
            console.error('GEMINI_API_KEY ontbreekt in environment variables.');
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'Server configuratiefout: API Key ontbreekt.' })
            };
        }

        const prompt = "Act as a Dutch accountant and extract the following fields from the image: factuurnummer, datum (format YYYY-MM-DD), omschrijving (company name or short description), bedragExclusief (number), btwTarief (only 21, 9, or 0), and btwBedrag (number). Instruct it to return ONLY a raw JSON object, without markdown formatting or code blocks.";

        // Doe de request naar Google Gemini
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash:generateContent?key=${API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: prompt },
                        {
                            inline_data: {
                                mime_type: mimeType,
                                data: base64Data
                            }
                        }
                    ]
                }]
            })
        });

        const data = await response.json();

        // Stuur de response van Gemini direct terug naar de frontend
        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data)
        };

    } catch (error) {
        console.error('Fout in scanReceipt functie:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Interne serverfout bij verwerken bon.', details: error.message })
        };
    }
};
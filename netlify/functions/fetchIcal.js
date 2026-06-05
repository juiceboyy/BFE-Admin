export const handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method Not Allowed' })
        };
    }

    try {
        const { url } = event.queryStringParameters || {};
        if (!url) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Parameter url ontbreekt' })
            };
        }

        // Convert webcal:// to https://
        let targetUrl = url.trim();
        if (targetUrl.startsWith('webcal://')) {
            targetUrl = 'https://' + targetUrl.slice(9);
        }

        if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Ongeldige URL. Moet beginnen met http://, https:// of webcal://' })
            };
        }

        const response = await fetch(targetUrl);
        if (!response.ok) {
            return {
                statusCode: response.status,
                headers,
                body: JSON.stringify({ error: `Fout bij ophalen agenda: HTTP ${response.status}` })
            };
        }

        const data = await response.text();
        return {
            statusCode: 200,
            headers: {
                ...headers,
                'Content-Type': 'text/calendar; charset=utf-8'
            },
            body: data
        };

    } catch (error) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message })
        };
    }
};

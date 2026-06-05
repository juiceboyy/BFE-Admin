import https from 'https';

/**
 * Helper to fetch a URL natively with redirect support.
 */
function fetchUrlWithRedirects(url, maxRedirects = 5) {
    return new Promise((resolve, reject) => {
        if (maxRedirects <= 0) {
            reject(new Error('Te veel omleidingen (redirect loop)'));
            return;
        }

        https.get(url, (res) => {
            const statusCode = res.statusCode;

            // Handle redirects (301, 302, 307, 308)
            if (statusCode === 301 || statusCode === 302 || statusCode === 307 || statusCode === 308) {
                const redirectUrl = res.headers.location;
                if (redirectUrl) {
                    fetchUrlWithRedirects(redirectUrl, maxRedirects - 1)
                        .then(resolve)
                        .catch(reject);
                    return;
                }
            }

            if (statusCode < 200 || statusCode >= 300) {
                reject(new Error(`HTTP status ${statusCode}`));
                return;
            }

            // Read response body chunks
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                resolve(data);
            });
        }).on('error', (err) => {
            reject(err);
        });
    });
}

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

        // Fetch using our native resolver (follows redirects, CORS-safe)
        const data = await fetchUrlWithRedirects(targetUrl);

        return {
            statusCode: 200,
            headers: {
                ...headers,
                'Content-Type': 'text/calendar; charset=utf-8'
            },
            body: data
        };

    } catch (error) {
        console.error('fetchIcal function error:', error.message);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message })
        };
    }
};

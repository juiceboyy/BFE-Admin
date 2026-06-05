const https = require('https');
const http = require('http');

/**
 * Fetch a URL natively, handle redirects, select correct protocol client,
 * protect against synchronous crashes, and implement a connection timeout.
 */
function fetchUrlWithRedirects(url, maxRedirects = 5) {
    return new Promise((resolve, reject) => {
        if (maxRedirects <= 0) {
            reject(new Error('Te veel omleidingen (redirect loop)'));
            return;
        }

        try {
            const client = url.startsWith('https') ? https : http;

            const req = client.get(url, (res) => {
                try {
                    const statusCode = res.statusCode;

                    // Handle redirects (301, 302, 307, 308)
                    if (statusCode === 301 || statusCode === 302 || statusCode === 307 || statusCode === 308) {
                        const redirectUrl = res.headers.location;
                        res.resume(); // CRITICAL: Consume the stream to release socket

                        if (redirectUrl) {
                            try {
                                const resolvedUrl = new URL(redirectUrl, url).toString();
                                fetchUrlWithRedirects(resolvedUrl, maxRedirects - 1)
                                    .then(resolve)
                                    .catch(reject);
                            } catch (err) {
                                reject(err);
                            }
                            return;
                        }
                    }

                    if (statusCode < 200 || statusCode >= 300) {
                        res.resume(); // CRITICAL: Consume the stream to release socket
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
                } catch (err) {
                    reject(err);
                }
            });

            // Set an explicit connection timeout (6 seconds) to prevent hanging
            req.setTimeout(6000, () => {
                req.destroy(new Error('Verbinding time-out (iCloud reageert niet of blokkeert de server)'));
            });

            req.on('error', (err) => {
                reject(err);
            });
        } catch (err) {
            // Catch synchronous errors before the request starts
            reject(err);
        }
    });
}

exports.handler = async (event, context) => {
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

        // Fetch using our native resolver (follows redirects, CORS-safe, crash-proof, with timeout)
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

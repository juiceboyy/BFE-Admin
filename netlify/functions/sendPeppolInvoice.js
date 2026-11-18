/**
 * Netlify Function for Peppol Directory OIN search, recipient verification,
 * and sending NLCIUS / Peppol BIS 3.0 UBL XML invoices via Recommand.eu API.
 */

const PEPPOL_DIRECTORY_URL = 'https://directory.peppol.eu/search/1.0/json';
const RECOMMAND_API_BASE = 'https://app.recommand.eu/api/v1';
const PEPPOL_BIS_BILLING_DOCTYPE =
    'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2::Invoice##urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0::2.1';
const DUTCH_STOP_WORDS = new Set(['van', 'en', 'het', 'de', 'der', 'voor', 'op', 'te', 'aan', 'bij']);

function buildSearchCandidateQueries(rawQuery) {
    const trimmed = String(rawQuery || '').trim();
    if (!trimmed) return [];
    const candidates = [trimmed];
    const meaningful = trimmed.split(/\s+/).filter(Boolean)
        .filter(tok => !(/[\/\\]|\d/.test(tok)))
        .map(tok => tok.replace(/^[^a-zA-Z0-9À-ÿ]+|[^a-zA-Z0-9À-ÿ]+$/g, ''))
        .filter(tok => tok.length >= 2 && !DUTCH_STOP_WORDS.has(tok.toLowerCase()));
    if (meaningful.length >= 1) {
        const simplified = meaningful.join(' ');
        if (simplified.toLowerCase() !== trimmed.toLowerCase()) candidates.push(simplified);
        const longest = [...meaningful].sort((a, b) => b.length - a.length)[0];
        if (longest && longest.length >= 4 && longest.toLowerCase() !== simplified.toLowerCase()) candidates.push(longest);
    }
    return candidates.slice(0, 3);
}

function isOriginAllowed(event) {
    const headers = event.headers || {};
    let sourceUrl = '';
    for (const [key, val] of Object.entries(headers)) {
        const k = key.toLowerCase();
        if (k === 'origin' && val) { sourceUrl = val; break; }
        if (k === 'referer' && val && !sourceUrl) { sourceUrl = val; }
    }
    if (!sourceUrl) return false;
    try {
        const hostname = new URL(sourceUrl).hostname.toLowerCase();
        if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
        if (hostname === 'bfe-admin.netlify.app' || hostname.endsWith('--bfe-admin.netlify.app')) return true;
        if (process.env.SITE_NAME && (hostname === `${process.env.SITE_NAME}.netlify.app` || hostname.endsWith(`--${process.env.SITE_NAME}.netlify.app`))) return true;
        const custom = process.env.ALLOWED_DOMAIN ? process.env.ALLOWED_DOMAIN.trim().toLowerCase() : '';
        return Boolean(custom && (hostname === custom || hostname.endsWith('.' + custom)));
    } catch (_) {
        return false;
    }
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 8000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { ...options, signal: controller.signal });
        const text = await res.text();
        let data = null;
        try {
            data = text ? JSON.parse(text) : {};
        } catch (_) {
            data = { raw: text };
        }
        return { ok: res.ok, status: res.status, data };
    } finally {
        clearTimeout(timer);
    }
}

function mapDirectoryMatches(rawMatches = []) {
    if (!Array.isArray(rawMatches)) return [];
    const rank = (scheme) => (scheme === '0190' ? 0 : scheme === '0106' ? 1 : 2);
    return rawMatches
        .map(m => {
            const fullParticipant = m?.participantID?.value || '';
            const [schemeId = '', endpointId = ''] = fullParticipant.split(':');
            const firstEntity = Array.isArray(m?.entities) ? m.entities[0] : null;
            const nameEntry = Array.isArray(firstEntity?.name) ? firstEntity.name[0] : null;
            const docTypes = Array.isArray(m?.docTypes) ? m.docTypes : [];
            return {
                peppolId: fullParticipant,
                schemeId,
                endpointId,
                name: nameEntry?.name || '',
                countryCode: firstEntity?.countryCode || '',
                additionalInfo: firstEntity?.additionalInfo || '',
                supportsBilling3: docTypes.some(d => String(d?.value || '').includes('poacc:billing:3.0'))
            };
        })
        .filter(item => item.peppolId)
        .sort((a, b) => rank(a.schemeId) - rank(b.schemeId));
}

function getRecommandCredentials() {
    const apiKey = (process.env.RECOMMAND_API_KEY || '').trim();
    const apiSecret = (process.env.RECOMMAND_API_SECRET || '').trim();
    const companyId = (process.env.RECOMMAND_COMPANY_ID || '').trim();
    const configured = Boolean(apiKey && apiSecret && companyId);
    const basicAuth = (apiKey && apiSecret)
        ? `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}`
        : '';
    return { configured, hasAuth: Boolean(basicAuth), basicAuth, companyId };
}

async function handleSearch(body) {
    const query = String(body.query || '').trim();
    if (!query || query.length < 2) {
        return { statusCode: 400, payload: { error: 'Geef minimaal 2 tekens op om te zoeken in Peppol.' } };
    }

    const candidates = buildSearchCandidateQueries(query);
    for (const candidate of candidates) {
        const url = `${PEPPOL_DIRECTORY_URL}?country=NL&q=${encodeURIComponent(candidate)}`;
        const res = await fetchJsonWithTimeout(url, { headers: { Accept: 'application/json' } });
        if (!res.ok) {
            return { statusCode: res.status || 502, payload: { error: 'Peppol Directory is tijdelijk niet bereikbaar.' } };
        }
        const matches = mapDirectoryMatches(res.data?.matches || []);
        if (matches.length > 0) {
            return { statusCode: 200, payload: { matches, matchedQuery: candidate } };
        }
    }

    return { statusCode: 200, payload: { matches: [] } };
}

async function handleVerify(body) {
    const peppolAddress = String(body.peppolAddress || '').trim().replace(/^iso6523-actorid-upis::/i, '');
    if (!peppolAddress) {
        return { statusCode: 400, payload: { error: 'Parameter peppolAddress ontbreekt.' } };
    }

    const dirUrl = `${PEPPOL_DIRECTORY_URL}?participant=${encodeURIComponent(`iso6523-actorid-upis::${peppolAddress}`)}`;
    const dirRes = await fetchJsonWithTimeout(dirUrl, { headers: { Accept: 'application/json' } });
    const matches = dirRes.ok ? mapDirectoryMatches(dirRes.data?.matches || []) : [];

    const creds = getRecommandCredentials();
    let apiVerified = null;

    if (creds.hasAuth) {
        try {
            const verifyRes = await fetchJsonWithTimeout(`${RECOMMAND_API_BASE}/verify`, {
                method: 'POST',
                headers: {
                    Authorization: creds.basicAuth,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ peppolAddress })
            });
            if (verifyRes.ok) {
                apiVerified = Boolean(verifyRes.data?.isValid ?? verifyRes.data?.valid ?? verifyRes.data?.registered);
            }
        } catch (_) {
            apiVerified = null;
        }
    }

    const verified = apiVerified !== null ? (apiVerified || matches.length > 0) : matches.length > 0;
    const participantName = matches[0]?.name || null;

    return {
        statusCode: 200,
        payload: {
            verified,
            participantName,
            apiConfigured: creds.configured,
            matches
        }
    };
}

async function handleSend(body) {
    const recipient = String(body.recipient || '').trim().replace(/^iso6523-actorid-upis::/i, '');
    const factuurNummer = String(body.factuurNummer || '').trim();
    const ublXml = String(body.ublXml || '');

    if (!recipient || !ublXml) {
        return { statusCode: 400, payload: { error: 'Ontvanger (recipient) en ublXml zijn verplicht.' } };
    }

    const creds = getRecommandCredentials();
    if (!creds.configured) {
        return {
            statusCode: 200,
            payload: {
                configured: false,
                sent: false,
                message: 'Recommand Peppol API-sleutels zijn nog niet geconfigureerd in Netlify / .env. Het UBL XML-bestand is lokaal gedownload.'
            }
        };
    }

    const sendUrl = `${RECOMMAND_API_BASE}/${encodeURIComponent(creds.companyId)}/send`;
    const apiRes = await fetchJsonWithTimeout(sendUrl, {
        method: 'POST',
        headers: {
            Authorization: creds.basicAuth,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            recipient,
            documentType: 'xml',
            doctypeId: PEPPOL_BIS_BILLING_DOCTYPE,
            document: ublXml
        })
    }, 9000);

    if (!apiRes.ok) {
        const errMsg = apiRes.data?.message || apiRes.data?.error || apiRes.data?.raw || `Recommand API fout (${apiRes.status})`;
        return {
            statusCode: apiRes.status >= 400 ? apiRes.status : 502,
            payload: {
                configured: true,
                sent: false,
                error: `Peppol verzending voor factuur ${factuurNummer} mislukt: ${errMsg}`
            }
        };
    }

    return {
        statusCode: 200,
        payload: {
            configured: true,
            sent: true,
            result: apiRes.data
        }
    };
}

exports.handler = async (event) => {
    const corsHeaders = {
        'Access-Control-Allow-Origin': event.headers?.origin || event.headers?.Origin || '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (!isOriginAllowed(event)) {
        return {
            statusCode: 403,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'Verboden: ongeldige herkomst (invalid origin or referer)' })
        };
    }

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: corsHeaders, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'Method Not Allowed' })
        };
    }

    try {
        const body = event.body ? JSON.parse(event.body) : {};
        const action = String(body.action || '').trim();

        let outcome;
        if (action === 'search') {
            outcome = await handleSearch(body);
        } else if (action === 'verify') {
            outcome = await handleVerify(body);
        } else if (action === 'send') {
            outcome = await handleSend(body);
        } else {
            outcome = { statusCode: 400, payload: { error: `Onbekende Peppol-actie: ${action}` } };
        }

        return {
            statusCode: outcome.statusCode,
            headers: corsHeaders,
            body: JSON.stringify(outcome.payload)
        };
    } catch (err) {
        console.error('sendPeppolInvoice error:', err);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ error: err.message || 'Interne serverfout bij Peppol-verwerking.' })
        };
    }
};

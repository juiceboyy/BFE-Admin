/**
 * Client-side API wrapper for Peppol Directory lookup, recipient verification,
 * and sending NLCIUS / Peppol BIS 3.0 UBL XML invoices via Netlify Functions.
 */

const PEPPOL_ENDPOINT = '/.netlify/functions/sendPeppolInvoice';
const PUBLIC_DIRECTORY_URL = 'https://directory.peppol.eu/search/1.0/json';
const DUTCH_STOP_WORDS = new Set(['van', 'en', 'het', 'de', 'der', 'voor', 'op', 'te', 'aan', 'bij']);

export function buildSearchCandidateQueries(rawQuery) {
    const trimmed = String(rawQuery || '').trim();
    if (!trimmed) return [];

    const candidates = [trimmed];
    const tokens = trimmed.split(/\s+/).filter(Boolean);
    const meaningful = tokens
        .filter(tok => !(/[\/\\]|\d/.test(tok)))
        .map(tok => tok.replace(/^[^a-zA-Z0-9À-ÿ]+|[^a-zA-Z0-9À-ÿ]+$/g, ''))
        .filter(tok => tok.length >= 2 && !DUTCH_STOP_WORDS.has(tok.toLowerCase()));

    if (meaningful.length >= 1) {
        const simplified = meaningful.join(' ');
        if (simplified.toLowerCase() !== trimmed.toLowerCase()) {
            candidates.push(simplified);
        }
        const longest = [...meaningful].sort((a, b) => b.length - a.length)[0];
        if (longest && longest.length >= 4 && longest.toLowerCase() !== simplified.toLowerCase()) {
            candidates.push(longest);
        }
    }

    return candidates.slice(0, 3);
}

function sortPeppolMatches(matches) {
    const rank = (scheme) => (scheme === '0190' ? 0 : scheme === '0106' ? 1 : 2);
    return [...matches].sort((a, b) => rank(a.schemeId) - rank(b.schemeId));
}

function mapDirectoryMatches(rawMatches = []) {
    if (!Array.isArray(rawMatches)) return [];
    const mapped = rawMatches
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
        .filter(item => item.peppolId);
    return sortPeppolMatches(mapped);
}

async function postPeppolAction(payload) {
    const response = await fetch(PEPPOL_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (response.status === 404) {
        return { notFound: true, data: null };
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data?.error || `Peppol verzoek mislukt (status ${response.status})`);
    }
    return { notFound: false, data };
}

/**
 * Searches the OpenPeppol Directory for Dutch participants (e.g. Ministries / OIN).
 * Falls back to direct directory query if Netlify Functions are unavailable.
 * @param {string} query
 * @returns {Promise<Array<{ peppolId: string, schemeId: string, endpointId: string, name: string, additionalInfo: string, supportsBilling3: boolean }>>}
 */
export async function searchPeppolDirectory(query) {
    const cleanQuery = String(query || '').trim();
    if (cleanQuery.length < 2) {
        throw new Error('Typ minimaal 2 tekens om in de Peppol Directory te zoeken.');
    }

    try {
        const res = await postPeppolAction({ action: 'search', query: cleanQuery });
        if (!res.notFound) {
            return res.data?.matches || [];
        }
    } catch (err) {
        if (!String(err?.message || '').includes('Failed to fetch')) {
            throw err;
        }
    }

    const candidates = buildSearchCandidateQueries(cleanQuery);
    for (const candidate of candidates) {
        const fallbackUrl = `${PUBLIC_DIRECTORY_URL}?country=NL&q=${encodeURIComponent(candidate)}`;
        const directRes = await fetch(fallbackUrl, { headers: { Accept: 'application/json' } });
        if (!directRes.ok) {
            throw new Error('Peppol Directory kon niet worden bereikt.');
        }
        const json = await directRes.json();
        const matches = mapDirectoryMatches(json?.matches || []);
        if (matches.length > 0) {
            return matches;
        }
    }
    return [];
}

/**
 * Verifies whether a Peppol participant ID (0190:... or 0106:...) is registered.
 * @param {string} peppolAddress
 * @returns {Promise<{ verified: boolean, participantName: string|null, apiConfigured: boolean, matches: Array }>}
 */
export async function verifyPeppolRecipient(peppolAddress) {
    const clean = String(peppolAddress || '').trim().replace(/^iso6523-actorid-upis::/i, '');
    if (!clean) {
        throw new Error('Geef een Peppol-ID of OIN op om te controleren.');
    }

    try {
        const res = await postPeppolAction({ action: 'verify', peppolAddress: clean });
        if (!res.notFound) {
            return res.data;
        }
    } catch (err) {
        if (!String(err?.message || '').includes('Failed to fetch')) {
            throw err;
        }
    }

    const fallbackUrl = `${PUBLIC_DIRECTORY_URL}?participant=${encodeURIComponent(`iso6523-actorid-upis::${clean}`)}`;
    const directRes = await fetch(fallbackUrl, { headers: { Accept: 'application/json' } });
    if (!directRes.ok) {
        throw new Error('Kon OIN niet controleren in de Peppol Directory.');
    }
    const json = await directRes.json();
    const matches = mapDirectoryMatches(json?.matches || []);
    return {
        verified: matches.length > 0,
        participantName: matches[0]?.name || null,
        apiConfigured: false,
        matches
    };
}

/**
 * Sends a UBL 2.1 XML invoice over the Peppol network via Recommand Netlify Function.
 * @param {{ recipient: string, factuurNummer: string, ublXml: string }} params
 * @returns {Promise<{ configured: boolean, sent: boolean, message?: string, result?: Object }>}
 */
export async function sendPeppolUblInvoice({ recipient, factuurNummer, ublXml }) {
    const res = await postPeppolAction({
        action: 'send',
        recipient,
        factuurNummer,
        ublXml
    });

    if (res.notFound) {
        return {
            configured: false,
            sent: false,
            message: 'Netlify Functions zijn lokaal niet actief; het UBL XML-bestand is lokaal gedownload voor handmatige upload.'
        };
    }

    return res.data;
}

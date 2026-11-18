/**
 * Shared Peppol participant validation, Dutch address parsing, XML escaping,
 * and binary/file download helpers for UBL 2.1 e-invoicing.
 */

export function escapeXml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

export function round2(num) {
    return Math.round((Number(num) + Number.EPSILON) * 100) / 100;
}

export function formatMoney(num) {
    return round2(num).toFixed(2);
}

export function addDaysIso(isoDate, days) {
    const match = String(isoDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const base = match
        ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
        : new Date();
    base.setUTCDate(base.getUTCDate() + days);
    return base.toISOString().slice(0, 10);
}

/**
 * Normalizes and validates a Dutch Peppol participant ID (OIN 0190 or KvK 0106).
 * @param {string} rawPeppolId
 * @returns {{ isValid: boolean, schemeId: string, endpointId: string, fullId: string, reason: string }}
 */
export function normalizePeppolParticipant(rawPeppolId) {
    const cleaned = String(rawPeppolId || '')
        .trim()
        .replace(/^iso6523-actorid-upis::/i, '')
        .replace(/\s+/g, '');

    if (!cleaned) {
        return { isValid: false, schemeId: '', endpointId: '', fullId: '', reason: 'Vul een OIN of Peppol-ID in.' };
    }

    let schemeId = '';
    let endpointId = '';

    if (cleaned.includes(':')) {
        const [rawScheme, rawValue] = cleaned.split(':');
        schemeId = rawScheme.trim();
        endpointId = (rawValue || '').trim();
    } else if (/^\d{8}$/.test(cleaned)) {
        schemeId = '0106';
        endpointId = cleaned;
    } else {
        schemeId = '0190';
        endpointId = cleaned;
    }

    if (schemeId === '0190' && !/^\d{20}$/.test(endpointId)) {
        return {
            isValid: false,
            schemeId,
            endpointId,
            fullId: `${schemeId}:${endpointId}`,
            reason: 'Een OIN (0190) moet uit exact 20 cijfers bestaan.'
        };
    }

    if (schemeId === '0106' && !/^\d{8}$/.test(endpointId)) {
        return {
            isValid: false,
            schemeId,
            endpointId,
            fullId: `${schemeId}:${endpointId}`,
            reason: 'Een KvK-nummer (0106) moet uit exact 8 cijfers bestaan.'
        };
    }

    if (!['0190', '0106', '0188', '0208', '9944', '9954'].includes(schemeId) && !/^\d{4}$/.test(schemeId)) {
        return {
            isValid: false,
            schemeId,
            endpointId,
            fullId: `${schemeId}:${endpointId}`,
            reason: 'Ongeldig Peppol schemeID (gebruik bijv. 0190:<20-cijferig OIN>).'
        };
    }

    return {
        isValid: Boolean(endpointId),
        schemeId,
        endpointId,
        fullId: `${schemeId}:${endpointId}`,
        reason: ''
    };
}

/**
 * Splits a Dutch "postcode + city" line into postalZone and cityName.
 * @param {string} cityLine
 * @returns {{ postalZone: string, cityName: string }}
 */
export function parseDutchCityLine(cityLine) {
    const raw = String(cityLine || '').trim();
    const match = raw.match(/^(\d{4}\s?[A-Za-z]{2})\s+(.+)$/);
    if (match) {
        return {
            postalZone: match[1].toUpperCase().replace(/^(\d{4})\s?([A-Z]{2})$/, '$1 $2'),
            cityName: match[2].trim()
        };
    }
    return {
        postalZone: '0000 AA',
        cityName: raw || 'Onbekend'
    };
}

/**
 * Converts a Blob or Uint8Array to a raw Base64 string without data URI prefix.
 * @param {Blob|Uint8Array} input
 * @returns {Promise<string>}
 */
export async function blobToBase64(input) {
    const bytes = input instanceof Uint8Array
        ? input
        : new Uint8Array(await input.arrayBuffer());

    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
}

/**
 * Triggers a local browser download of a UBL 2.1 XML invoice file.
 * @param {string} xmlString
 * @param {string} baseFileName
 */
export function downloadUblXml(xmlString, baseFileName) {
    const cleanName = String(baseFileName || 'peppol-factuur').replace(/\.xml$/i, '');
    const blob = new Blob([xmlString], { type: 'application/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${cleanName}.xml`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

import { accessToken } from './auth.js';
import { fetchWithRetry } from '../utils/network.js';
import { SPREADSHEET_ID } from './storage.js';

const OFFERTES_TAB_NAME = 'Offertes';

const OFFERTES_HEADERS = [
    'Offertenummer',
    'Offertedatum',
    'Klantnaam',
    'T.a.v.',
    'Adres',
    'Woonplaats',
    'Artiest/Project',
    'Datum Optreden',
    'Omschrijving',
    'Subtotaal ex BTW',
    'BTW Totaal',
    'Totaal incl BTW',
    'Geldigheid',
    'Status'
];

/**
 * Checks if the 'Offertes' tab exists in Google Sheets, creating it with headers if missing.
 */
export async function ensureOffertesSheetExists() {
    if (!accessToken) return false;

    const metaRes = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}?fields=sheets.properties.title`, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!metaRes.ok) {
        throw new Error(`Metadata ophalen mislukt: ${metaRes.status}`);
    }

    const metaData = await metaRes.json();
    const sheetExists = (metaData.sheets || []).some(s => s.properties?.title === OFFERTES_TAB_NAME);

    if (!sheetExists) {
        const createRes = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                requests: [
                    {
                        addSheet: {
                            properties: { title: OFFERTES_TAB_NAME }
                        }
                    }
                ]
            })
        });
        if (!createRes.ok) {
            const err = await createRes.text();
            throw new Error(`Tabblad '${OFFERTES_TAB_NAME}' aanmaken mislukt: ${err}`);
        }

        const seedRes = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/'${OFFERTES_TAB_NAME}'!A1:N1?valueInputOption=USER_ENTERED`, {
            method: 'PUT',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                values: [OFFERTES_HEADERS]
            })
        });
        if (!seedRes.ok) {
            const err = await seedRes.text();
            throw new Error(`Headers schrijven naar '${OFFERTES_TAB_NAME}' mislukt: ${err}`);
        }
    }
    return true;
}

/**
 * Determines the next offertenummer for a given year in the layout:
 * YYYY-001 (e.g. 2026-001).
 * @param {number} [targetYear]
 * @returns {Promise<string>}
 */
export async function findNextOfferteNumber(targetYear = new Date().getFullYear()) {
    const yearNum = parseInt(targetYear, 10) || new Date().getFullYear();

    if (!accessToken) {
        return `${yearNum}-001`;
    }

    try {
        await ensureOffertesSheetExists();

        const dataRes = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/'${OFFERTES_TAB_NAME}'!A:A`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (!dataRes.ok) {
            return `${yearNum}-001`;
        }

        const data = await dataRes.json();
        const rows = data.values || [];
        let maxSeq = 0;

        for (let i = 1; i < rows.length; i++) {
            const val = String(rows[i]?.[0] || '').trim();
            if (!val) continue;

            // Matches e.g. "BFE26OF 2026-001", "2026-001", "2026.001", "OFF2026-001"
            const match = val.match(/(?:^|[^\d])(\d{4})[.-](\d+)/) || val.match(/(?:^|[^\d])(\d{2})[.-](\d+)/);
            if (match) {
                let matchedYear = parseInt(match[1], 10);
                if (match[1].length === 2) matchedYear += 2000;
                if (matchedYear === yearNum) {
                    const seq = parseInt(match[2], 10);
                    if (seq > maxSeq) maxSeq = seq;
                }
            }
        }

        const nextSeq = maxSeq + 1;
        const seqStr = String(nextSeq).padStart(3, '0');
        return `${yearNum}-${seqStr}`;
    } catch (e) {
        console.error('Fout bij bepalen volgend offertenummer:', e);
        return `${yearNum}-001`;
    }
}

/**
 * Appends a generated offerte row to the 'Offertes' tab in Google Sheets.
 * @param {Object} data 
 */
export async function saveOfferteToSheet(data) {
    if (!accessToken) throw new Error("Niet ingelogd bij Google.");

    await ensureOffertesSheetExists();

    const row = [
        data.offerteNummer || '',
        data.offerteDatum || '',
        data.clientName || '',
        data.clientAttention || '',
        data.clientAddress || '',
        data.clientCity || '',
        data.project || '',
        data.optreedDatum || '',
        data.omschrijving || '',
        data.subtotal || 0,
        data.btwTotaal || 0,
        data.totaal || 0,
        data.geldigheid || '30 dagen',
        data.status || 'Verzonden'
    ];

    const res = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/'${OFFERTES_TAB_NAME}'!A:N:append?valueInputOption=USER_ENTERED`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            values: [row]
        })
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Offerte wegschrijven naar tab '${OFFERTES_TAB_NAME}' mislukt: ${err}`);
    }
}

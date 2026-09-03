/**
 * js/api/storage-queries-inventaris.js
 * Beheert Google Sheet CRUD-operaties voor het centrale Inventaris-tabblad in het Trend-spreadsheet.
 */

import { accessToken } from './auth.js';
import { fetchWithRetry } from '../utils/network.js';

export const TREND_SPREADSHEET_ID = '1nWQOkMInrHgo5c1l-FdjM4EoCbPlv86YwEft1OEROfI';

/**
 * Haalt alle inventaris-items op uit het Inventaris-tabblad van het Trend-spreadsheet.
 */
export async function fetchInventarisFromSheet() {
    if (!accessToken) throw new Error('Niet ingelogd bij Google.');

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${TREND_SPREADSHEET_ID}/values/Inventaris!A:F`;
    const response = await fetchWithRetry(url, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (response.status === 401) throw new Error('TOKEN_EXPIRED');
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    const rows = data.values || [];

    const parseAmount = (val) => {
        if (!val) return 0;
        let s = String(val).trim().replace(/[€\s]/g, '');
        const lastComma = s.lastIndexOf(',');
        const lastDot   = s.lastIndexOf('.');
        if (lastComma > lastDot) {
            s = s.replace(/\./g, '').replace(',', '.');
        } else {
            s = s.replace(/,/g, '');
        }
        return parseFloat(s) || 0;
    };

    return rows.slice(1)
        .filter(row => row && row[2])
        .map(row => ({
            id:                row[0] || '',
            datum:             row[1] || '',
            omschrijving:      row[2] || '',
            aanschafwaarde:    parseAmount(row[3]),
            afschrijvingsJaren: parseInt(row[4], 10) || 5,
            restwaarde:        parseAmount(row[5]),
        }));
}

/**
 * Voegt een inventaris-item toe aan het Inventaris-tabblad van het Trend-spreadsheet.
 */
export async function addInventarisItemToSheet(item) {
    if (!accessToken) throw new Error('Niet ingelogd bij Google.');

    const row = [[
        item.id             || '',
        item.aankoopJaar    || item.datum              || '',
        item.omschrijving   || '',
        item.aankoopBedrag  || item.aanschafwaarde     || 0,
        item.afschrijvingsDuur || item.afschrijvingsJaren || 5,
        item.restwaarde     || 0,
    ]];

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${TREND_SPREADSHEET_ID}/values/Inventaris!A:F:append?valueInputOption=USER_ENTERED`;
    const response = await fetchWithRetry(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ values: row })
    });

    if (response.status === 401) throw new Error('TOKEN_EXPIRED');
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.error?.message || `HTTP ${response.status}`);
    }

    return await response.json();
}

/**
 * Verwijdert een inventaris-item uit het Inventaris-tabblad van het Trend-spreadsheet.
 */
export async function deleteInventarisItemFromSheet(itemId) {
    if (!accessToken) throw new Error('Niet ingelogd bij Google.');

    const fetchUrl = `https://sheets.googleapis.com/v4/spreadsheets/${TREND_SPREADSHEET_ID}/values/Inventaris!A:F`;
    const fetchResp = await fetchWithRetry(fetchUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    if (fetchResp.status === 401) throw new Error('TOKEN_EXPIRED');
    if (!fetchResp.ok) {
        const err = await fetchResp.json().catch(() => ({}));
        throw new Error(err?.error?.message || `HTTP ${fetchResp.status}`);
    }
    const data = await fetchResp.json();
    const rows = data.values || [];

    const dataRows = rows.slice(1);
    const filtered = dataRows.filter(row => String(row[0]) !== String(itemId));

    const clearUrl = `https://sheets.googleapis.com/v4/spreadsheets/${TREND_SPREADSHEET_ID}/values/Inventaris!A2:F:clear`;
    const clearResp = await fetchWithRetry(clearUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
    });
    if (clearResp.status === 401) throw new Error('TOKEN_EXPIRED');
    if (!clearResp.ok) {
        const err = await clearResp.json().catch(() => ({}));
        throw new Error(err?.error?.message || `HTTP ${clearResp.status}`);
    }

    if (filtered.length > 0) {
        const writeUrl = `https://sheets.googleapis.com/v4/spreadsheets/${TREND_SPREADSHEET_ID}/values/Inventaris!A2?valueInputOption=USER_ENTERED`;
        const writeResp = await fetchWithRetry(writeUrl, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ values: filtered })
        });
        if (writeResp.status === 401) throw new Error('TOKEN_EXPIRED');
        if (!writeResp.ok) {
            const err = await writeResp.json().catch(() => ({}));
            throw new Error(err?.error?.message || `HTTP ${writeResp.status}`);
        }
    }
}

import { accessToken } from './auth.js';
import { fetchWithRetry } from '../utils/network.js';
import { SPREADSHEET_ID } from './storage.js';
import { MONTH_NAMES } from '../utils/date.js';

const TREND_SPREADSHEET_ID = '1nWQOkMInrHgo5c1l-FdjM4EoCbPlv86YwEft1OEROfI';

/**
 * Voegt een rij toe aan het centrale Trend-archief spreadsheet.
 * @param {string|number} year - Het boekjaar
 * @param {Object} trendData - { omzet, kosten, afschrijvingen, bijtelling, fiscaleWinst, winstmarge, priveOnttrekkingen }
 */
export async function appendToTrendSheet(year, trendData) {
    if (!accessToken) throw new Error('Niet ingelogd bij Google.');

    const row = [[
        year,
        trendData.omzet,
        trendData.kosten,
        trendData.afschrijvingen,
        trendData.bijtelling,
        trendData.fiscaleWinst,
        trendData.winstmarge,
        trendData.priveOnttrekkingen
    ]];

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${TREND_SPREADSHEET_ID}/values/Trends!A:H:append?valueInputOption=USER_ENTERED`;

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

export async function getMonthlyTotals(sheetName) {
    let totaalOmzet = 0;
    let totaalBtw = 0;

    if (typeof accessToken === 'undefined' || !accessToken) {
        console.error("Niet ingelogd bij Google (geen accessToken).");
        return { totaalOmzet, totaalBtw };
    }

    try {
        const response = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/'${sheetName}'!A:Z`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        if (response.status === 401) throw new Error('TOKEN_EXPIRED');
        if (!response.ok) return { totaalOmzet, totaalBtw };
        
        const data = await response.json();
        const rows = data.values;
        if (!rows || rows.length === 0) {
            return { totaalOmzet, totaalBtw };
        }

        const row0 = rows[0].map(h => String(h).toLowerCase().trim());
        const isVerkoop = sheetName.toLowerCase().includes('verkoop');
        const getIdx = (keywords) => row0.findIndex(h => keywords.some(kw => h.includes(kw)));

        let idxBtwLaag = -1, idxBtwHoog = -1, idxBtwInkoop = -1;
        let idxOmzetLaag = -1, idxOmzetHoog = -1, idxOmzetNul = -1, idxInkoopExcl = -1;

        if (isVerkoop) {
            idxBtwLaag = getIdx(['btw laag', 'btw 9', 'btw l']);
            idxBtwHoog = getIdx(['btw hoog', 'btw 21', 'btw h']);
            idxOmzetLaag = getIdx(['omzet laag', 'excl 9', 'vergoeding l', 'netto 9']);
            idxOmzetHoog = getIdx(['omzet hoog', 'excl 21', 'vergoeding h', 'netto 21']);
            idxOmzetNul = getIdx(['omzet nul', 'omzet 0', 'vergoeding 0', 'excl 0']);
        } else {
            idxBtwInkoop = row0.findIndex(h => h === 'btw' || h.includes('voorbelasting'));
            idxInkoopExcl = getIdx(['vergoeding', 'excl', 'factuurbedrag excl']);
            if (idxInkoopExcl === -1) idxInkoopExcl = getIdx(['totaal', 'bedrag incl', 'incl']);
        }

        const parseEuro = (val) => {
            if (!val) return 0;
            let cleaned = String(val).replace(/[^0-9.,-]/g, '');
            if (cleaned.includes(',')) cleaned = cleaned.replace(/\./g, '').replace(',', '.');
            return parseFloat(cleaned) || 0;
        };

        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length === 0) continue;

            const colA = String(row[0] || '').toLowerCase().trim();
            if (colA.includes('totaal') || colA.includes('totalen')) {
                break; 
            }

            if (isVerkoop) {
                const btwL = idxBtwLaag !== -1 ? parseEuro(row[idxBtwLaag]) : 0;
                const btwH = idxBtwHoog !== -1 ? parseEuro(row[idxBtwHoog]) : 0;
                totaalBtw += (btwL + btwH);

                const omzetL = idxOmzetLaag !== -1 ? parseEuro(row[idxOmzetLaag]) : 0;
                const omzetH = idxOmzetHoog !== -1 ? parseEuro(row[idxOmzetHoog]) : 0;
                const omzetN = idxOmzetNul !== -1 ? parseEuro(row[idxOmzetNul]) : 0;
                totaalOmzet += (omzetL + omzetH + omzetN);
            } else {
                const btwI = idxBtwInkoop !== -1 ? parseEuro(row[idxBtwInkoop]) : 0;
                totaalBtw += btwI;

                const inkoopBedrag = idxInkoopExcl !== -1 ? parseEuro(row[idxInkoopExcl]) : 0;
                totaalOmzet += inkoopBedrag;
            }
        }

        totaalOmzet = Math.round(totaalOmzet * 100) / 100;
        totaalBtw = Math.round(totaalBtw * 100) / 100;

        console.log(`--- SUCCES: ${sheetName} ---`, { Omzet: totaalOmzet, BTW: totaalBtw });
        return { totaalOmzet, totaalBtw };

    } catch (error) {
        console.error(`Fout bij ophalen van ${sheetName}:`, error);
        return { totaalOmzet: 0, totaalBtw: 0 };
    }
}

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

export async function getYearlyTotals(year) {
    let omzetEx  = 0;
    let btwVerkoop = 0;
    let inkoopEx = 0;
    let btwInkoop  = 0;

    for (const month of MONTH_NAMES) {
        const verkoop = await getMonthlyTotals(`${month} Verkoop`);
        const inkoop  = await getMonthlyTotals(`${month} Inkoop`);

        omzetEx    += verkoop.totaalOmzet;
        btwVerkoop += verkoop.totaalBtw;
        inkoopEx   += inkoop.totaalOmzet;
        btwInkoop  += inkoop.totaalBtw;
    }

    const priveOnttrekkingenGeld = omzetEx + btwVerkoop;
    const priveStortingenNatura  = inkoopEx + btwInkoop;

    const r = (val) => Math.round(val * 100) / 100;

    return {
        year,
        omzetEx:               r(omzetEx),
        btwVerkoop:            r(btwVerkoop),
        inkoopEx:              r(inkoopEx),
        btwInkoop:             r(btwInkoop),
        btwBalans:             r(btwVerkoop - btwInkoop),
        winst:                 r(omzetEx - inkoopEx),
        priveOnttrekkingenGeld: r(priveOnttrekkingenGeld),
        priveStortingenNatura:  r(priveStortingenNatura),
    };
}

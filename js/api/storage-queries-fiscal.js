import { accessToken } from './auth.js';
import { fetchWithRetry } from '../utils/network.js';
import { SPREADSHEET_ID } from './storage.js';
import { MONTH_NAMES } from '../utils/date.js';
import { TREND_SPREADSHEET_ID } from './storage-queries-inventaris.js';

// Re-export inventaris-functies voor achterwaartse compatibiliteit
export {
    TREND_SPREADSHEET_ID,
    fetchInventarisFromSheet,
    addInventarisItemToSheet,
    deleteInventarisItemFromSheet
} from './storage-queries-inventaris.js';

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

/**
 * Haalt maandtotalen op voor een specifiek tabblad in een spreadsheet.
 * @param {string} sheetName - Naam van het tabblad
 * @param {string} [spreadsheetId] - Optioneel ID van het Google Spreadsheet (standaard SPREADSHEET_ID)
 */
export async function getMonthlyTotals(sheetName, spreadsheetId = SPREADSHEET_ID) {
    let totaalOmzet = 0;
    let totaalBtw = 0;

    if (typeof accessToken === 'undefined' || !accessToken) {
        console.error("Niet ingelogd bij Google (geen accessToken).");
        return { totaalOmzet, totaalBtw };
    }

    try {
        const response = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${sheetName}'!A:Z`, {
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

        return { totaalOmzet, totaalBtw };

    } catch (error) {
        console.error(`Fout bij ophalen van ${sheetName}:`, error);
        return { totaalOmzet: 0, totaalBtw: 0 };
    }
}

/**
 * Berekent jaartotalen door alle 12 maandtabs van verkoop en inkoop op te halen.
 * @param {string|number} year - Boekjaar
 * @param {string} [spreadsheetId] - Optioneel ID van het doelspreadsheet
 */
export async function getYearlyTotals(year, spreadsheetId = null) {
    let omzetEx  = 0;
    let btwVerkoop = 0;
    let inkoopEx = 0;
    let btwInkoop  = 0;

    const targetSheetId = spreadsheetId || SPREADSHEET_ID;

    for (const month of MONTH_NAMES) {
        const verkoop = await getMonthlyTotals(`${month} Verkoop`, targetSheetId);
        const inkoop  = await getMonthlyTotals(`${month} Inkoop`, targetSheetId);

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

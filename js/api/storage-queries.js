import { accessToken } from './auth.js';
import { fetchWithRetry } from '../utils/network.js';
import { SPREADSHEET_ID } from './storage.js';

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

export async function loadCloudMemory() {
    try {
        const res = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/'Leveranciers'!A:C`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        const json = await res.json();
        const memory = {};
        if (json.values && json.values.length > 1) {
            for (let i = 1; i < json.values.length; i++) {
                const row = json.values[i];
                if (row && row[0]) {
                    const key = row[0].toLowerCase().trim();
                    if (!memory[key]) memory[key] = [];

                    const newItem = {
                        omschrijving: row[1] || '',
                        btwTarief: row[2] || 0
                    };

                    const exists = memory[key].some(item => item.omschrijving === newItem.omschrijving && item.btwTarief == newItem.btwTarief);
                    
                    if (!exists) memory[key].push(newItem);
                }
            }
        }
        return memory;
    } catch (e) {
        console.error("Fout bij laden cloud memory:", e);
        return {};
    }
}

export async function saveCloudMemory(leverancier, omschrijving, tarief) {
    if (!accessToken) return;
    try {
        const response = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/'Leveranciers'!A:C:append?valueInputOption=USER_ENTERED`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ values: [[leverancier, omschrijving, tarief]] })
        });
        if (response.status === 401) throw new Error('TOKEN_EXPIRED');
    } catch (error) {
        if (error.message === 'TOKEN_EXPIRED') throw error;
        console.error('Fout bij opslaan cloud memory:', error);
    }
}

export async function getNextInvoiceNumberFromCloud(targetSheet, prevSheet, targetYear) {
    if (!accessToken) return `${targetYear}.001`;

    const fetchMaxFromSheet = async (sheet) => {
        try {
            const response = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/'${sheet}'!B:B`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            if (!response.ok) return null;
            const data = await response.json();
            if (!data.values) return null;
            let maxSeq = null;
            for (const row of data.values) {
                const val = row[0];
                if (val && typeof val === 'string' && val.startsWith(`${targetYear}.`)) {
                    const parts = val.split('.');
                    if (parts.length === 2) {
                        const seq = parseInt(parts[1], 10);
                        if (!isNaN(seq)) {
                            if (maxSeq === null || seq > maxSeq) maxSeq = seq;
                        }
                    }
                }
            }
            return maxSeq;
        } catch (error) {
            console.error('Error fetching max seq:', error);
            return null;
        }
    };

    let maxSeq = await fetchMaxFromSheet(targetSheet);
    if (maxSeq !== null) return `${targetYear}.${String(maxSeq + 1).padStart(3, '0')}`;
    if (targetSheet.startsWith('Jan')) return `${targetYear}.001`;
    if (prevSheet) {
        maxSeq = await fetchMaxFromSheet(prevSheet);
        if (maxSeq !== null) return `${targetYear}.${String(maxSeq + 1).padStart(3, '0')}`;
    }
    return `${targetYear}.001`;
}

export async function getMonthlyTotals(sheetName) {
    let totaalOmzet = 0;
    let totaalBtw = 0;

    // 1. De juiste check voor jouw app (kijkt naar accessToken)
    if (typeof accessToken === 'undefined' || !accessToken) {
        console.error("Niet ingelogd bij Google (geen accessToken).");
        return { totaalOmzet, totaalBtw };
    }

    try {
        // 2. De juiste verbinding die we eerder succesvol gebruikten
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

        // 3. EXACTE KOLOM KOPPELINGEN
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

        // 4. DE BEREKENING MET DE REM OP TOTALEN
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length === 0) continue;

            // Zodra we in kolom A (Datum) het woord "Totaal" of "Totalen" zien, stop direct!
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
 * Verwacht kolommen A:E = omschrijving, datum, aanschafwaarde, afschrijvingsJaren, restwaarde.
 * @returns {Promise<Array<{omschrijving, datum, aanschafwaarde, afschrijvingsJaren, restwaarde}>>}
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
        const cleaned = String(val).replace(/[^0-9.,-]/g, '').replace(',', '.');
        return parseFloat(cleaned) || 0;
    };

    // Sla de headerrij over en filter lege rijen
    return rows.slice(1)
        .filter(row => row && row[0])
        .map((row, idx) => ({
            id: idx + 1,
            omschrijving:      row[0] || '',
            datum:             row[1] || '',
            aanschafwaarde:    parseAmount(row[2]),
            afschrijvingsJaren: parseInt(row[3], 10) || 5,
            restwaarde:        parseAmount(row[4]),
        }));
}

/**
 * Voegt een inventaris-item toe aan het Inventaris-tabblad van het Trend-spreadsheet.
 * @param {{omschrijving, datum, aanschafwaarde, afschrijvingsJaren, restwaarde}} item
 */
export async function addInventarisItemToSheet(item) {
    if (!accessToken) throw new Error('Niet ingelogd bij Google.');

    const row = [[
        item.omschrijving,
        item.datum,
        item.aanschafwaarde,
        item.afschrijvingsJaren,
        item.restwaarde
    ]];

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${TREND_SPREADSHEET_ID}/values/Inventaris!A:E:append?valueInputOption=USER_ENTERED`;
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

export async function getYearlyTotals(year) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'June', 'July', 'August', 'Sep', 'Okt', 'Nov', 'Dec'];

    let omzetEx  = 0;
    let btwVerkoop = 0;
    let inkoopEx = 0;
    let btwInkoop  = 0;

    for (const month of months) {
        const verkoop = await getMonthlyTotals(`${month} Verkoop`);
        const inkoop  = await getMonthlyTotals(`${month} Inkoop`);

        omzetEx    += verkoop.totaalOmzet;
        btwVerkoop += verkoop.totaalBtw;
        inkoopEx   += inkoop.totaalOmzet;
        btwInkoop  += inkoop.totaalBtw;
    }

    // Privé-administratie correcties:
    // Alle omzet komt binnen op privérekening → volledige omzet incl. BTW is privéonttrekking in geld
    const priveOnttrekkingenGeld = omzetEx + btwVerkoop;
    // Zakelijke kosten betaald via privérekening → inkoop incl. BTW is privéstorting in natura
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
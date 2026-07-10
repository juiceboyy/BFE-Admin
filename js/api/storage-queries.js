import { accessToken } from './auth.js';
import { fetchWithRetry } from '../utils/network.js';
import { SPREADSHEET_ID } from './storage.js';

const TREND_SPREADSHEET_ID = '1nWQOkMInrHgo5c1l-FdjM4EoCbPlv86YwEft1OEROfI';

// Per-session caches — cleared when the user changes the fiscal period.
let _cloudMemoryCache = null;              // null = uncached
let _invoiceSeqCache  = {};               // `${sheetName}:${year}` → last-issued seq number

export function clearQueryCaches() {
    _cloudMemoryCache = null;
    _invoiceSeqCache  = {};
}

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
    if (_cloudMemoryCache !== null) return _cloudMemoryCache;
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
        _cloudMemoryCache = memory;
        return memory;
    } catch (e) {
        console.error("Fout bij laden cloud memory:", e);
        return {};
    }
}

export async function saveCloudMemory(leverancier, omschrijving, tarief) {
    if (!accessToken) return;
    _cloudMemoryCache = null; // Invalidate so the next batch picks up the new entry
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
    const cacheKey = `${targetSheet}:${targetYear}`;

    // After the first read, just increment locally — no further Sheets reads needed.
    if (_invoiceSeqCache[cacheKey] !== undefined) {
        _invoiceSeqCache[cacheKey]++;
        return `${targetYear}.${String(_invoiceSeqCache[cacheKey]).padStart(3, '0')}`;
    }

    if (!accessToken) {
        _invoiceSeqCache[cacheKey] = 1;
        return `${targetYear}.001`;
    }

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
                        if (!isNaN(seq) && (maxSeq === null || seq > maxSeq)) maxSeq = seq;
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
    if (maxSeq !== null) {
        _invoiceSeqCache[cacheKey] = maxSeq + 1;
        return `${targetYear}.${String(maxSeq + 1).padStart(3, '0')}`;
    }
    if (targetSheet.startsWith('Jan')) {
        _invoiceSeqCache[cacheKey] = 1;
        return `${targetYear}.001`;
    }
    if (prevSheet) {
        maxSeq = await fetchMaxFromSheet(prevSheet);
        if (maxSeq !== null) {
            _invoiceSeqCache[cacheKey] = maxSeq + 1;
            return `${targetYear}.${String(maxSeq + 1).padStart(3, '0')}`;
        }
    }
    _invoiceSeqCache[cacheKey] = 1;
    return `${targetYear}.001`;
}

/**
 * Finds the target sheet's empty row index and resolves the factuurNummer (generating it if not pre-filled).
 * @param {string} targetSheet - The sheet to search (e.g., 'Jan Verkoop')
 * @param {string} prevSheet - The sheet of the previous month (e.g., 'Dec Verkoop')
 * @param {number} currentYear - The bookkeeping year (e.g., 2026)
 * @returns {Promise<Object>} { targetRowIndex, factuurNummer }
 */
export async function findInvoiceTargetRowAndNumber(targetSheet, prevSheet, currentYear) {
    if (!accessToken) throw new Error('TOKEN_EXPIRED');

    const getRes = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/'${targetSheet}'!A1:Z`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    let targetRowIndex = null;
    let factuurNummer = null;
    let sheetRows = [];

    if (getRes.ok) {
        const getJson = await getRes.json();
        sheetRows = getJson.values || [];
    }

    if (sheetRows.length > 0) {
        const headerRow = sheetRows[0] || [];
        const headers = headerRow.map(h => String(h || '').toLowerCase().trim());
        
        const getIdx = (keywords) => headers.findIndex(h => keywords.some(kw => h.includes(kw)));
        
        const datumIdx = getIdx(['datum', 'date']);
        const descIdx = getIdx(['omschrijving', 'beschrijving']);
        const clientIdx = getIdx(['klant', 'relatie', 'naam', 'debiteur', 'leverancier']);
        const factuurIdx = getIdx(['factuur', 'nr', 'nummer']);

        for (let i = 1; i < sheetRows.length; i++) {
            const row = sheetRows[i] || [];
            
            // Stop if we see 'Totalen' or 'totaal' sentinel in any cell
            const isTotalenSentinel = row.some(cell => {
                const val = String(cell || '').trim().toLowerCase();
                return val === 'totalen' || val === 'totaal';
            });
            if (isTotalenSentinel) {
                targetRowIndex = i + 1;
                break;
            }

            let isEmpty = true;
            if (headers.length > 0) {
                const hasDatum = datumIdx !== -1 && row[datumIdx] !== undefined && String(row[datumIdx]).trim() !== '';
                const hasDesc = descIdx !== -1 && row[descIdx] !== undefined && String(row[descIdx]).trim() !== '';
                const hasClient = clientIdx !== -1 && row[clientIdx] !== undefined && String(row[clientIdx]).trim() !== '';
                
                let hasAmount = false;
                headers.forEach((h, idx) => {
                    if (h.includes('totaal') || h.includes('bedrag') || h.includes('omzet') || h.includes('btw') || h.includes('excl') || h.includes('vergoeding') || h.includes('voorbelasting')) {
                        if (row[idx] !== undefined && String(row[idx]).trim() !== '' && String(row[idx]).trim() !== '0' && String(row[idx]).trim() !== '0,00') {
                            hasAmount = true;
                        }
                    }
                });

                if (hasDatum || hasDesc || hasClient || hasAmount) {
                    isEmpty = false;
                }
            } else {
                for (let colIdx = 0; colIdx < row.length; colIdx++) {
                    if (colIdx === 1) continue; // Skip Factuurnummer in fallback
                    const val = String(row[colIdx] || '').trim();
                    if (val !== '' && val !== '0' && val !== '0,00') {
                        isEmpty = false;
                        break;
                    }
                }
            }

            if (isEmpty) {
                targetRowIndex = i + 1;
                const fIdx = factuurIdx !== -1 ? factuurIdx : 1;
                if (row[fIdx] && String(row[fIdx]).trim() !== '') {
                    factuurNummer = String(row[fIdx]).trim();
                }
                break;
            }
        }
        
        if (!targetRowIndex) {
            targetRowIndex = sheetRows.length + 1;
        }
    } else {
        targetRowIndex = 2; // Default if sheet is empty
    }

    // If target row doesn't have a pre-filled invoice number, generate the next one
    if (!factuurNummer) {
        let maxSeq = null;
        const factuurIdx = sheetRows[0] ? sheetRows[0].map(h => String(h || '').toLowerCase().trim()).findIndex(h => h.includes('factuur') || h.includes('nr') || h.includes('nummer')) : 1;
        const fIdx = factuurIdx !== -1 ? factuurIdx : 1;

        for (const row of sheetRows) {
            const val = row[fIdx];
            if (val && typeof val === 'string' && val.startsWith(`${currentYear}.`)) {
                const parts = val.split('.');
                if (parts.length === 2) {
                    const seq = parseInt(parts[1], 10);
                    if (!isNaN(seq) && (maxSeq === null || seq > maxSeq)) maxSeq = seq;
                }
            }
        }

        if (maxSeq !== null) {
            factuurNummer = `${currentYear}.${String(maxSeq + 1).padStart(3, '0')}`;
        } else if (targetSheet.startsWith('Jan')) {
            factuurNummer = `${currentYear}.001`;
        } else if (prevSheet) {
            // Fetch from previous sheet
            const prevRes = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/'${prevSheet}'!A1:Z`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            if (prevRes.ok) {
                const prevJson = await prevRes.json();
                const prevRows = prevJson.values || [];
                const prevFactuurIdx = prevRows[0] ? prevRows[0].map(h => String(h || '').toLowerCase().trim()).findIndex(h => h.includes('factuur') || h.includes('nr') || h.includes('nummer')) : 1;
                const pfIdx = prevFactuurIdx !== -1 ? prevFactuurIdx : 1;

                for (const row of prevRows) {
                    const val = row[pfIdx];
                    if (val && typeof val === 'string' && val.startsWith(`${currentYear}.`)) {
                        const parts = val.split('.');
                        if (parts.length === 2) {
                            const seq = parseInt(parts[1], 10);
                            if (!isNaN(seq) && (maxSeq === null || seq > maxSeq)) maxSeq = seq;
                        }
                    }
                }
            }
            if (maxSeq !== null) {
                factuurNummer = `${currentYear}.${String(maxSeq + 1).padStart(3, '0')}`;
            } else {
                factuurNummer = `${currentYear}.001`;
            }
        } else {
            factuurNummer = `${currentYear}.001`;
        }
    }

    return { targetRowIndex, factuurNummer };
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
 * Verwacht kolommen A:F = ID, datum/aanschafjaar, omschrijving, aanschafwaarde, afschrijvingsJaren, restwaarde.
 * @returns {Promise<Array<{id, datum, omschrijving, aanschafwaarde, afschrijvingsJaren, restwaarde}>>}
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

    // Handles Dutch formatting: "1.234,56" → 1234.56, "1234,56" → 1234.56, "1234.56" → 1234.56
    const parseAmount = (val) => {
        if (!val) return 0;
        let s = String(val).trim().replace(/[€\s]/g, '');
        const lastComma = s.lastIndexOf(',');
        const lastDot   = s.lastIndexOf('.');
        if (lastComma > lastDot) {
            // Dutch: thousands dot, decimal comma  →  "1.234,56"
            s = s.replace(/\./g, '').replace(',', '.');
        } else {
            // English or no separator: remove thousand commas
            s = s.replace(/,/g, '');
        }
        return parseFloat(s) || 0;
    };

    // Sla de headerrij over en filter lege rijen
    // Kolomvolgorde: A=ID, B=Datum/Aanschafjaar, C=Omschrijving, D=Aanschafwaarde, E=Afschrijvingsjaren, F=Restwaarde
    return rows.slice(1)
        .filter(row => row && row[2])   // rij is geldig als C (omschrijving) gevuld is
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
 * @param {{omschrijving, datum, aanschafwaarde, afschrijvingsJaren, restwaarde}} item
 */
export async function addInventarisItemToSheet(item) {
    if (!accessToken) throw new Error('Niet ingelogd bij Google.');

    // Column order must match fetchInventarisFromSheet: A=ID, B=datum, C=omschrijving, D=aanschafwaarde, E=afschrijvingsJaren, F=restwaarde
    // Accept both UI naming conventions (aankoopJaar/aankoopBedrag/afschrijvingsDuur) and legacy names (datum/aanschafwaarde/afschrijvingsJaren).
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
 * Strategie: fetch → filter → clear → write-back (veilig voor kleine datasets).
 * @param {number|string} itemId - Het ID uit kolom A van het te verwijderen item
 */
export async function deleteInventarisItemFromSheet(itemId) {
    if (!accessToken) throw new Error('Niet ingelogd bij Google.');

    // a) Haal alle rijen op
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

    // b) Filter de te verwijderen rij uit de datarijen (sla headerrij over)
    const dataRows = rows.slice(1);
    const filtered = dataRows.filter(row => String(row[0]) !== String(itemId));

    // c) Wis het volledige databereik
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

    // d) Schrijf de gefilterde rijen terug (alleen als er rijen zijn)
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
import { accessToken } from '../api/auth.js';
import { fetchWithRetry } from './network.js';
import { SPREADSHEET_ID, resolveRealSheetName } from '../api/storage.js';

// Cache voor sheet records tijdens de scan-sessie
const _sheetRowsCache = new Map();

export function clearDuplicateCheckerCache() {
    _sheetRowsCache.clear();
}

/**
 * Normaliseert een leveranciersnaam voor betrouwbare vergelijking.
 * @param {string} str 
 * @returns {string}
 */
export function normalizeVendorName(str) {
    if (!str) return '';
    return String(str)
        .toLowerCase()
        .replace(/\b(b\.?v\.?|n\.?v\.?|v\.?o\.?f\.?|gmbh|ltd|inc|holding|llc)\b/gi, '')
        .replace(/[^a-z0-9]/gi, '')
        .trim();
}

const MONTH_MAP = {
    'jan': 1, 'feb': 2, 'mrt': 3, 'mar': 3, 'apr': 4,
    'mei': 5, 'may': 5, 'jun': 6, 'june': 6, 'juli': 7,
    'jul': 7, 'july': 7, 'aug': 8, 'sep': 9, 'okt': 10,
    'oct': 10, 'nov': 11, 'dec': 12
};

/**
 * Parseert een datum string en retourneert gestandaardiseerde componenten.
 * @param {string} dateStr 
 * @param {string} sheetNameOpt 
 * @returns {{day: number, month: number, year: number, isoDate: string}|null}
 */
export function parseDateInfo(dateStr, sheetNameOpt = '') {
    if (!dateStr) return null;
    const str = String(dateStr).trim().toLowerCase();

    // 1. ISO format: YYYY-MM-DD
    const isoMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (isoMatch) {
        const year = parseInt(isoMatch[1], 10);
        const month = parseInt(isoMatch[2], 10);
        const day = parseInt(isoMatch[3], 10);
        return {
            year,
            month,
            day,
            isoDate: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        };
    }

    // 2. Formaat: "7-mrt", "07-jul-2026", "7/3/2026", "7-3"
    const parts = str.split(/[-/\s.]+/);
    if (parts.length >= 2) {
        const p0 = parseInt(parts[0], 10);
        let month = null;

        // Kijk of parts[1] een maandnaam is
        const monthKey = parts[1].slice(0, 4);
        for (const [k, v] of Object.entries(MONTH_MAP)) {
            if (monthKey.startsWith(k)) {
                month = v;
                break;
            }
        }

        // Of een numerieke maand
        if (!month && !isNaN(parseInt(parts[1], 10))) {
            month = parseInt(parts[1], 10);
        }

        if (!isNaN(p0) && month) {
            const day = p0;
            const year = (parts.length >= 3 && !isNaN(parseInt(parts[2], 10))) ? parseInt(parts[2], 10) : 2026;
            return {
                year,
                month,
                day,
                isoDate: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            };
        }
    }

    // 3. Fallback: haal maand uit tabbladnaam (bijv. "June Inkoop" of "Mrt Inkoop")
    if (sheetNameOpt) {
        const sheetLower = sheetNameOpt.toLowerCase();
        for (const [k, v] of Object.entries(MONTH_MAP)) {
            if (sheetLower.startsWith(k) || sheetLower.includes(` ${k} `) || sheetLower.startsWith(`${k} `)) {
                const dayMatch = str.match(/(\d{1,2})/);
                const day = dayMatch ? parseInt(dayMatch[1], 10) : 1;
                return {
                    year: 2026,
                    month: v,
                    day,
                    isoDate: `2026-${String(v).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                };
            }
        }
    }

    return null;
}

export function normalizeDate(dateStr, sheetNameOpt = '') {
    const info = parseDateInfo(dateStr, sheetNameOpt);
    return info ? info.isoDate : '';
}

/**
 * Parseert een numeriek bedrag uit een celwaarde of getal.
 * @param {any} val 
 * @returns {number}
 */
export function parseAmount(val) {
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    if (!val) return 0;
    const cleaned = String(val).replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.');
    return parseFloat(cleaned) || 0;
}

/**
 * Controleert of een gescande bon een duplicaat is van:
 * 1. Een ander item in de huidige scanwachtrij.
 * 2. Een reeds bestaande boeking in de Google Sheet.
 * 
 * @param {Object} item - Het gescande item object.
 * @param {Array} queue - De volledige wachtrij.
 * @param {string} targetSheet - Het doel-tabblad (bijv. 'July Inkoop').
 * @returns {Promise<{isDuplicate: boolean, reason?: string, existingFactuurNr?: string}>}
 */
export async function checkForDuplicate(item, queue, targetSheet) {
    const itemData = item.data || {};
    const itemVendor = itemData.naamLeverancier || itemData.klantNaam || '';
    const itemNormVendor = normalizeVendorName(itemVendor);
    const itemDate = itemData.datum || '';
    const itemNormDate = normalizeDate(itemDate);
    const itemAmount = parseAmount(itemData.factuurBedrag || itemData.totaalBedrag || itemData.bedrag || 0);

    if (!itemNormVendor || itemAmount <= 0) {
        return { isDuplicate: false };
    }

    // 1. Controleer binnen de huidige wachtrij (voorgaande items)
    for (const other of queue) {
        if (other.id === item.id) continue;
        // Alleen vergelijken met items die vóór dit item in de lijst staan of al 'success'/'saved' zijn
        const otherData = other.data || {};
        const otherVendor = otherData.naamLeverancier || otherData.klantNaam || '';
        const otherNormVendor = normalizeVendorName(otherVendor);
        const otherDate = otherData.datum || '';
        const otherNormDate = normalizeDate(otherDate);
        const otherAmount = parseAmount(otherData.factuurBedrag || otherData.totaalBedrag || otherData.bedrag || 0);

        if (otherNormVendor === itemNormVendor && Math.abs(otherAmount - itemAmount) < 0.05) {
            // Als datum ook overeenkomt of 1 van beide heeft datum
            if (!itemNormDate || !otherNormDate || itemNormDate === otherNormDate || itemNormDate.endsWith(otherNormDate) || otherNormDate.endsWith(itemNormDate)) {
                return {
                    isDuplicate: true,
                    reason: `Dubbel in wachtrij (komt overeen met '${other.file.name}')`
                };
            }
        }
    }

    // 2. Controleer tegen Google Sheet (indien ingelogd)
    if (accessToken && targetSheet) {
        try {
            const realSheetName = await resolveRealSheetName(targetSheet);
            let rows = _sheetRowsCache.get(realSheetName);

            if (!rows) {
                const res = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/'${realSheetName}'!A:Z`, {
                    headers: { Authorization: `Bearer ${accessToken}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    rows = data.values || [];
                    _sheetRowsCache.set(realSheetName, rows);
                }
            }

            if (rows && rows.length > 1) {
                const headers = rows[0].map(h => String(h || '').toLowerCase().trim());
                const vendorIdx = headers.findIndex(h => h.includes('leverancier') || h.includes('relatie') || h.includes('klant') || h.includes('naam'));
                const amountIdx = headers.findIndex(h => h.includes('factuurbedrag') || h.includes('bedrag') || h.includes('totaal') || h.includes('omzet'));
                const dateIdx = headers.findIndex(h => h.includes('datum') || h.includes('date'));
                const factuurIdx = headers.findIndex(h => h.includes('factuurnummer') || h === 'factuur#' || h === 'factuur nr' || h.includes('factuur') || h.includes('bon'));

                if (vendorIdx !== -1 && amountIdx !== -1) {
                    for (let i = 1; i < rows.length; i++) {
                        const row = rows[i];
                        const colA = String(row[0] || '').toLowerCase().trim();
                        if (colA.includes('totaal') || colA.includes('totalen')) break;

                        const rowVendor = row[vendorIdx] || '';
                        const rowNormVendor = normalizeVendorName(rowVendor);
                        const rowAmount = parseAmount(row[amountIdx]);
                        const rowDate = dateIdx !== -1 ? row[dateIdx] : '';
                        const rowNormDate = normalizeDate(rowDate);
                        const rowFactuur = factuurIdx !== -1 ? row[factuurIdx] : '';

                        if (rowNormVendor === itemNormVendor && Math.abs(rowAmount - itemAmount) < 0.05) {
                            // Controleer datum match
                            const datesMatch = !itemNormDate || !rowNormDate || 
                                              itemNormDate === rowNormDate || 
                                              itemNormDate.endsWith(rowNormDate) || 
                                              rowNormDate.endsWith(itemNormDate) ||
                                              itemDate.includes(rowDate) ||
                                              rowDate.includes(itemDate);

                            if (datesMatch) {
                                return {
                                    isDuplicate: true,
                                    reason: `Reeds geboekt in '${realSheetName}' (${rowFactuur ? `Factuur ${rowFactuur}` : `Rij ${i + 1}`}: ${rowVendor} - €${rowAmount.toFixed(2)})`,
                                    existingFactuurNr: rowFactuur,
                                    existingRowIndex: i + 1
                                };
                            }
                        }
                    }
                }
            }
        } catch (e) {
            console.warn("Kon dubbele facturen niet verifiëren tegen Sheets:", e);
        }
    }

    return { isDuplicate: false };
}

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

/**
 * Normaliseert een datum string naar YYYY-MM-DD of DD-MM.
 * @param {string} dateStr 
 * @returns {string}
 */
export function normalizeDate(dateStr) {
    if (!dateStr) return '';
    const str = String(dateStr).trim().toLowerCase();
    
    // ISO format: 2026-07-03
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
        return str;
    }
    
    // Dutch sheet format: "3-jul" of "03-jul-2026"
    const months = {
        'jan': '01', 'feb': '02', 'mrt': '03', 'mar': '03', 'apr': '04',
        'mei': '05', 'may': '05', 'jun': '06', 'june': '06', 'juli': '07',
        'jul': '07', 'july': '07', 'aug': '08', 'sep': '09', 'okt': '10',
        'oct': '10', 'nov': '11', 'dec': '12'
    };
    
    const parts = str.split(/[-/\s.]+/);
    if (parts.length >= 2) {
        const day = parts[0].padStart(2, '0');
        const monthKey = parts[1].slice(0, 4);
        const monthNum = months[monthKey] || Object.keys(months).find(k => monthKey.startsWith(k)) ? months[Object.keys(months).find(k => monthKey.startsWith(k))] : null;
        if (monthNum) {
            return `${day}-${monthNum}`;
        }
    }
    
    return str;
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

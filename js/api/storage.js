import { accessToken } from './auth.js';
import { fetchWithRetry } from '../utils/network.js';

export * from './storage-drive.js';

export const SPREADSHEET_ID = '119dQIOSLFpKDqWUQUMWTU9miIKP3MOR1VHFB5yzmBrg';

// Per-session caches to stay within the Sheets API 60-reads/min quota.
const _headerCache = new Map(); // sheetName → string[]
const _rowCache    = new Map(); // sheetName → next available row number

let _allSheetTitlesCache = null;

export function clearSheetCaches() {
    _headerCache.clear();
    _rowCache.clear();
    _allSheetTitlesCache = null;
}

export async function resolveRealSheetName(sheetName) {
    if (!sheetName) return sheetName;
    if (!_allSheetTitlesCache && accessToken) {
        try {
            const res = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}?fields=sheets.properties.title`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            if (res.ok) {
                const data = await res.json();
                _allSheetTitlesCache = (data.sheets || []).map(s => s.properties?.title).filter(Boolean);
            }
        } catch (e) {
            console.warn("Kon spreadsheet metadata niet inladen voor sheet matching:", e);
        }
    }
    if (!_allSheetTitlesCache || _allSheetTitlesCache.length === 0) return sheetName;

    // Exact match (case-insensitive)
    const exact = _allSheetTitlesCache.find(t => t.toLowerCase() === sheetName.toLowerCase());
    if (exact) return exact;

    // Soft match (e.g. "August Verkoop" -> "Aug Verkoop")
    const parts = sheetName.trim().split(/\s+/);
    if (parts.length >= 2) {
        const monthPart = parts[0].toLowerCase().slice(0, 3);
        const typePart = parts[parts.length - 1].toLowerCase();
        const matched = _allSheetTitlesCache.find(t => {
            const tLower = t.toLowerCase();
            return tLower.startsWith(monthPart) && tLower.includes(typePart);
        });
        if (matched) return matched;
    }

    return sheetName;
}

/**
 * Voegt een rij toe aan de Google Sheet op de eerste lege plek of overschrijft 'Totalen'.
 * @param {string} sheetName - De naam van het tabblad (bijv. 'Jan Inkoop').
 * @param {Array} data - Array met waarden [datum, factuurnummer, omschrijving, leverancier, totaal, btw, excl]
 */
export async function insertRowInSheet(sheetName, data, targetRowOverride = null) {
    if (!accessToken) throw new Error("Niet ingelogd bij Google.");
    sheetName = await resolveRealSheetName(sheetName);

    try {
        let targetRow;

        if (targetRowOverride !== null) {
            targetRow = targetRowOverride;
        } else if (_rowCache.has(sheetName)) {
            // Subsequent saves: use cached row, no read needed
            targetRow = _rowCache.get(sheetName);
        } else {
            // First save: read A1:Z to locate the first empty row, pre-allocated invoice row, or 'Totalen' sentinel
            const getRes = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/'${sheetName}'!A1:Z`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });

            if (getRes.status === 401) throw new Error('TOKEN_EXPIRED');
            if (!getRes.ok) {
                const error = await getRes.json();
                throw new Error(`Fout bij ophalen sheet data: ${error.error.message}`);
            }

            const getJson = await getRes.json();
            const rows = getJson.values || [];
            targetRow = rows.length + 1;

            if (rows.length > 0) {
                const headerRow = rows[0] || [];
                const headers = headerRow.map(h => String(h || '').toLowerCase().trim());
                
                // Helper to find column index by keywords
                const getIdx = (keywords) => headers.findIndex(h => keywords.some(kw => h.includes(kw)));
                
                const datumIdx = getIdx(['datum', 'date']);
                const descIdx = getIdx(['omschrijving', 'beschrijving']);
                const clientIdx = getIdx(['klant', 'relatie', 'naam', 'debiteur', 'leverancier']);

                for (let i = 1; i < rows.length; i++) {
                    const row = rows[i] || [];
                    
                    // Stop if we see 'Totalen' sentinel in any cell of the row
                    const isTotalenSentinel = row.some(cell => {
                        const val = String(cell || '').trim().toLowerCase();
                        return val === 'totalen' || val === 'totaal';
                    });
                    if (isTotalenSentinel) {
                        targetRow = i + 1;
                        break;
                    }

                    // Check if row is empty or only has factuurnummer
                    let isEmpty = true;
                    
                    if (headers.length > 0) {
                        const hasDatum = datumIdx !== -1 && row[datumIdx] !== undefined && String(row[datumIdx]).trim() !== '';
                        const hasDesc = descIdx !== -1 && row[descIdx] !== undefined && String(row[descIdx]).trim() !== '';
                        const hasClient = clientIdx !== -1 && row[clientIdx] !== undefined && String(row[clientIdx]).trim() !== '';
                        
                        // Check for any amount columns
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
                        // Fallback check if headers are not available: check if there's any non-empty cell other than index 1 (Factuurnummer)
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
                        targetRow = i + 1;
                        break;
                    }
                }
            }
        }

        // Write the row
        const response = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/'${sheetName}'!A${targetRow}:Z${targetRow}?valueInputOption=USER_ENTERED`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ values: [data] })
        });

        if (response.status === 401) throw new Error('TOKEN_EXPIRED');
        if (!response.ok) {
            const error = await response.json();
            throw new Error(`Fout bij schrijven naar Sheet: ${error.error.message}`);
        }

        // Advance the cached row for the next save in this session
        _rowCache.set(sheetName, targetRow + 1);

        return await response.json();

    } catch (error) {
        console.error('Sheet insert error:', error);
        throw error;
    }
}

export async function getSheetHeaders(sheetName) {
    if (!accessToken) return [];
    sheetName = await resolveRealSheetName(sheetName);
    if (_headerCache.has(sheetName)) return _headerCache.get(sheetName);
    try {
        const res = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/'${sheetName}'!A1:Z1`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (res.status === 401) throw new Error('TOKEN_EXPIRED');
        if (!res.ok) return [];

        const json = await res.json();
        if (json.values && json.values[0]) {
            const headers = json.values[0].map(h => String(h || '').toLowerCase());
            _headerCache.set(sheetName, headers);
            return headers;
        }
        return [];
    } catch (e) {
        console.error("Fout bij ophalen headers:", e);
        return [];
    }
}
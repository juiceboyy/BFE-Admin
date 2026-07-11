import { accessToken } from './auth.js';
import { fetchWithRetry } from '../utils/network.js';
import { SPREADSHEET_ID } from './storage.js';

// Per-session caches — cleared when the user changes the fiscal period.
let _cloudMemoryCache = null;              // null = uncached
let _invoiceSeqCache  = {};               // `${sheetName}:${year}` → last-issued seq number

export function clearQueryCaches() {
    _cloudMemoryCache = null;
    _invoiceSeqCache  = {};
}

export async function loadCloudMemory() {
    if (_cloudMemoryCache !== null) return _cloudMemoryCache;
    try {
        const res = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/'Leveranciers'!A:C`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (!res.ok) return [];
        const data = await res.json();
        const rows = data.values || [];
        // Skip header [leverancier, omschrijving, tarief]
        _cloudMemoryCache = rows.slice(1).map(r => ({
            leverancier: r[0] || '',
            omschrijving: r[1] || '',
            tarief: parseFloat(r[2]) || 0
        }));
        return _cloudMemoryCache;
    } catch (e) {
        console.error('Kon cloud-memory niet laden:', e);
        return [];
    }
}

export async function saveCloudMemory(leverancier, omschrijving, tarief) {
    if (!accessToken) return;
    try {
        // Controleer of de leverancier al bestaat in het geheugen
        const current = await loadCloudMemory();
        const existing = current.find(item => item.leverancier.toLowerCase() === leverancier.toLowerCase());
        if (existing) {
            // Update lokaal cache
            existing.omschrijving = omschrijving;
            existing.tarief = tarief;
            
            // In een volwaardige database-backed app zouden we de rij updaten in Sheets.
            // Omdat dit een eenvoudig append-only model is, slaan we de schrijfactie over als de key al bestaat
            // om vervuiling en duplicaten in de tabel te voorkomen.
            return;
        }

        const row = [[leverancier, omschrijving, tarief]];
        await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/'Leveranciers'!A:C:append?valueInputOption=USER_ENTERED`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ values: row })
        });
        
        // Voeg toe aan lokale cache
        current.push({ leverancier, omschrijving, tarief });
        _cloudMemoryCache = current;
    } catch (e) {
        console.error('Kon cloud-memory niet opslaan:', e);
    }
}

export async function getNextInvoiceNumberFromCloud(targetSheet, prevSheet, targetYear) {
    const cacheKey = `${targetSheet}:${targetYear}`;
    if (_invoiceSeqCache[cacheKey]) {
        const nextSeq = _invoiceSeqCache[cacheKey] + 1;
        _invoiceSeqCache[cacheKey] = nextSeq;
        return `${targetYear}.${String(nextSeq).padStart(3, '0')}`;
    }

    let maxSeq = 0;

    const scanSheet = async (sheetName) => {
        const res = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/'${sheetName}'!A:Z`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (!res.ok) return;
        const data = await res.json();
        const rows = data.values || [];
        if (rows.length === 0) return;
        const headers = rows[0].map(h => String(h || '').toLowerCase().trim());
        const factuurIdx = headers.findIndex(h => h.includes('factuurnummer') || h === 'factuur#' || h === 'factuur nr' || h.includes('factuur'));
        if (factuurIdx === -1) return;

        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const factVal = row[factuurIdx];
            if (!factVal) continue;
            const match = String(factVal).match(/(\d{4})\.(\d{3})/);
            if (match && parseInt(match[1]) === targetYear) {
                const seq = parseInt(match[2]);
                if (seq > maxSeq) maxSeq = seq;
            }
        }
    };

    // Scan eerst de huidige maand
    await scanSheet(targetSheet);

    // Als er nog niks in de huidige maand staat, scan de vorige maand
    if (maxSeq === 0) {
        await scanSheet(prevSheet);
    }

    const nextSeq = maxSeq + 1;
    _invoiceSeqCache[cacheKey] = nextSeq;

    return `${targetYear}.${String(nextSeq).padStart(3, '0')}`;
}

export async function findInvoiceTargetRowAndNumber(targetSheet, prevSheet, currentYear) {
    if (!accessToken) throw new Error('Niet ingelogd met Google.');

    // 1. Fetch de huidige sheet om de 'Totalen'-rij en de headers te scannen
    const response = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/'${targetSheet}'!A:Z`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (response.status === 401) throw new Error('TOKEN_EXPIRED');

    let targetRowIndex = 2; // Default naar rij 2 (direct onder headers) als de sheet leeg is
    let maxSeq = null;

    if (response.ok) {
        const data = await response.json();
        const rows = data.values || [];

        if (rows.length > 0) {
            // Vind de 'Totalen'-rij
            let totalenRowIdx = -1;
            for (let i = 0; i < rows.length; i++) {
                const colA = String(rows[i][0] || '').toLowerCase().trim();
                if (colA.includes('totaal') || colA.includes('totalen')) {
                    totalenRowIdx = i;
                    break;
                }
            }

            // Bepaal de invoegrij: direct vóór de 'Totalen'-rij, of anders onderaan
            if (totalenRowIdx !== -1) {
                targetRowIndex = totalenRowIdx + 1; // 1-indexed Sheets row
            } else {
                targetRowIndex = rows.length + 1;
            }

            // Scan voor het hoogste factuurnummer in de huidige maand
            const headers = rows[0].map(h => String(h || '').toLowerCase().trim());
            const factuurIdx = headers.findIndex(h => h.includes('factuurnummer') || h === 'factuur#' || h === 'factuur nr' || h.includes('factuur'));
            if (factuurIdx !== -1) {
                for (let i = 1; i < (totalenRowIdx !== -1 ? totalenRowIdx : rows.length); i++) {
                    const factVal = rows[i][factuurIdx];
                    if (!factVal) continue;
                    const match = String(factVal).match(/(\d{4})\.(\d{3})/);
                    if (match && parseInt(match[1]) === currentYear) {
                        const seq = parseInt(match[2]);
                        if (maxSeq === null || seq > maxSeq) {
                            maxSeq = seq;
                        }
                    }
                }
            }
        }
    }

    // 2. Bepaal het factuurnummer
    let factuurNummer = '';
    if (maxSeq !== null) {
        factuurNummer = `${currentYear}.${String(maxSeq + 1).padStart(3, '0')}`;
    } else {
        // Als er niks in de huidige maand is gevonden, check de vorige maand
        const prevResponse = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/'${prevSheet}'!A:Z`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        if (prevResponse.ok) {
            const prevData = await prevResponse.json();
            const prevRows = prevData.values || [];
            if (prevRows.length > 0) {
                const headers = prevRows[0].map(h => String(h || '').toLowerCase().trim());
                const factuurIdx = headers.findIndex(h => h.includes('factuurnummer') || h === 'factuur#' || h === 'factuur nr' || h.includes('factuur'));
                if (factuurIdx !== -1) {
                    for (let i = 1; i < prevRows.length; i++) {
                        const colA = String(prevRows[i][0] || '').toLowerCase().trim();
                        if (colA.includes('totaal') || colA.includes('totalen')) break;

                        const factVal = prevRows[i][factuurIdx];
                        if (!factVal) continue;
                        const match = String(factVal).match(/(\d{4})\.(\d{3})/);
                        if (match && parseInt(match[1]) === currentYear) {
                            const seq = parseInt(match[2]);
                            if (maxSeq === null || seq > maxSeq) {
                                maxSeq = seq;
                            }
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

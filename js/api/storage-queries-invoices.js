import { accessToken } from './auth.js';
import { fetchWithRetry } from '../utils/network.js';
import { SPREADSHEET_ID, resolveRealSheetName } from './storage.js';

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

export async function getMaxSequenceNumberForType(type, targetYear) {
    if (!accessToken) return 0;
    const yearNum = parseInt(targetYear, 10);
    const targetType = String(type).toLowerCase().includes('verkoop') ? 'verkoop' : 'inkoop';

    try {
        // 1. Haal alle tabbladen op via spreadsheet metadata
        const metaRes = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}?fields=sheets.properties.title`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (!metaRes.ok) return 0;
        const metaData = await metaRes.json();
        const allTitles = (metaData.sheets || []).map(s => s.properties?.title).filter(Boolean);

        // Filter op relevante tabbladen (bijv. alle 'Inkoop' of alle 'Verkoop' tabbladen)
        const relevantSheets = allTitles.filter(t => t.toLowerCase().includes(targetType));
        if (relevantSheets.length === 0) return 0;

        // 2. Batch-ophalen van alle relevante tabbladen in 1 enkel verzoek
        const params = new URLSearchParams();
        relevantSheets.forEach(sheet => params.append('ranges', `'${sheet}'!A:Z`));

        const batchRes = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values:batchGet?${params.toString()}`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (!batchRes.ok) return 0;
        const batchData = await batchRes.json();
        const valueRanges = batchData.valueRanges || [];

        let maxSeq = 0;

        for (const rangeData of valueRanges) {
            const rows = rangeData.values || [];
            if (rows.length < 2) continue;

            const headers = rows[0].map(h => String(h || '').toLowerCase().trim());
            const factuurIdx = headers.findIndex(h => h.includes('factuurnummer') || h === 'factuur#' || h === 'factuur nr' || h.includes('factuur') || h.includes('bon'));
            if (factuurIdx === -1) continue;

            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                const colA = String(row[0] || '').toLowerCase().trim();
                if (colA.includes('totaal') || colA.includes('totalen')) break;

                const factVal = row[factuurIdx];
                if (!factVal) continue;
                const match = String(factVal).match(/(\d{4})[.-](\d{3})/);
                if (match && parseInt(match[1], 10) === yearNum) {
                    const seq = parseInt(match[2], 10);
                    if (seq > maxSeq) maxSeq = seq;
                }
            }
        }

        return maxSeq;
    } catch (e) {
        console.error('Fout bij ophalen max volgnummer:', e);
        return 0;
    }
}

export async function getNextInvoiceNumberFromCloud(targetSheet, prevSheet, targetYear) {
    const type = String(targetSheet).toLowerCase().includes('verkoop') ? 'verkoop' : 'inkoop';
    const cacheKey = `${type}:${targetYear}`;

    if (_invoiceSeqCache[cacheKey]) {
        const nextSeq = _invoiceSeqCache[cacheKey] + 1;
        _invoiceSeqCache[cacheKey] = nextSeq;
        return `${targetYear}.${String(nextSeq).padStart(3, '0')}`;
    }

    const maxSeq = await getMaxSequenceNumberForType(type, targetYear);
    const nextSeq = maxSeq + 1;
    _invoiceSeqCache[cacheKey] = nextSeq;

    return `${targetYear}.${String(nextSeq).padStart(3, '0')}`;
}

export async function findInvoiceTargetRowAndNumber(targetSheet, prevSheet, currentYear) {
    if (!accessToken) throw new Error('Niet ingelogd met Google.');
    targetSheet = await resolveRealSheetName(targetSheet);

    // 1. Fetch de huidige sheet om de 'Totalen'-rij en headers te bepalen
    const response = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/'${targetSheet}'!A:Z`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (response.status === 401) throw new Error('TOKEN_EXPIRED');

    let targetRowIndex = 2; // Default naar rij 2 (direct onder headers) als de sheet leeg is

    if (response.ok) {
        const data = await response.json();
        const rows = data.values || [];

        if (rows.length > 0) {
            let totalenRowIdx = -1;
            for (let i = 0; i < rows.length; i++) {
                const colA = String(rows[i][0] || '').toLowerCase().trim();
                if (colA.includes('totaal') || colA.includes('totalen')) {
                    totalenRowIdx = i;
                    break;
                }
            }

            if (totalenRowIdx !== -1) {
                targetRowIndex = totalenRowIdx + 1;
            } else {
                targetRowIndex = rows.length + 1;
            }
        }
    }

    // 2. Bepaal het factuurnummer via de centrale volgnummer-logica
    const factuurNummer = await getNextInvoiceNumberFromCloud(targetSheet, prevSheet, currentYear);

    return { targetRowIndex, factuurNummer };
}

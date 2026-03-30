import { accessToken } from './auth.js';
import { fetchWithRetry } from '../utils/network.js';
import { SPREADSHEET_ID } from './storage.js';

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
    if (!accessToken) throw new Error("Niet ingelogd bij Google.");
    try {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/'${sheetName}'!A:Z?valueRenderOption=UNFORMATTED_VALUE`;
        const res = await fetchWithRetry(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
        
        if (res.status === 401) throw new Error('TOKEN_EXPIRED');
        if (!res.ok) return { totaalOmzet: 0, totaalBtw: 0 };
        
        const data = await res.json();
        if (!data.values || data.values.length <= 1) return { totaalOmzet: 0, totaalBtw: 0 };

        const headers = data.values[0].map(h => String(h || '').toLowerCase());
        const getIdx = (keywords) => headers.findIndex(h => keywords.some(kw => h.includes(kw)));
        const isVerkoop = sheetName.toLowerCase().includes('verkoop');

        const parseEuro = (val) => {
            if (typeof val === 'number') return isNaN(val) ? 0 : val;
            if (!val) return 0;
            const cleaned = String(val).replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.');
            return parseFloat(cleaned) || 0;
        };

        let totaalOmzet = 0;
        let totaalBtw = 0;

        if (isVerkoop) {
            const idxBtwLaag = getIdx(['btw laag', 'btw 9', 'btw l']);
            const idxBtwHoog = getIdx(['btw hoog', 'btw 21', 'btw h']);
            const idxBtwGen = getIdx(['btw', 'btw bedrag', 'belasting']);
            
            const idxOmzetLaag = getIdx(['omzet laag', 'excl 9', 'vergoeding 9', 'vergoeding l', 'netto 9']);
            const idxOmzetHoog = getIdx(['omzet hoog', 'excl 21', 'vergoeding 21', 'vergoeding h', 'netto 21']);
            const idxOmzetNul = getIdx(['omzet nul', 'vrijgesteld', 'omzet 0', 'vergoeding 0', 'excl 0']);
            const idxOmzetGen = getIdx(['omzet', 'excl', 'vergoeding', 'netto']);

            for (let i = 1; i < data.values.length; i++) {
                const row = data.values[i];
                if (!row || row.length === 0) continue;

                const isTotalRow = row.slice(0, 5).some(cell => /^(?:totaal|totalen)(?:\s|$|:)/i.test(String(cell || '').trim()));
                if (isTotalRow) continue;

                const btwLaag = idxBtwLaag !== -1 ? parseEuro(row[idxBtwLaag]) : 0;
                const btwHoog = idxBtwHoog !== -1 ? parseEuro(row[idxBtwHoog]) : 0;
                totaalBtw += (btwLaag + btwHoog);

                let rowOmzet = 0;
                if (idxOmzetLaag !== -1 || idxOmzetHoog !== -1 || idxOmzetNul !== -1) {
                    if (idxOmzetLaag !== -1) rowOmzet += parseEuro(row[idxOmzetLaag]);
                    if (idxOmzetHoog !== -1) rowOmzet += parseEuro(row[idxOmzetHoog]);
                    if (idxOmzetNul !== -1) rowOmzet += parseEuro(row[idxOmzetNul]);
                } else if (idxOmzetGen !== -1) {
                    rowOmzet += parseEuro(row[idxOmzetGen]);
                } else if (row.length >= 10) {
                    rowOmzet += parseEuro(row[7]) + parseEuro(row[8]) + parseEuro(row[9]); // Positional fallback
                }
                totaalOmzet += rowOmzet;
            }
        } else {
            const idxBtw = getIdx(['btw', 'voorbelasting', 'belasting']);
            const idxExcl = getIdx(['vergoeding', 'excl', 'factuurbedrag excl', 'netto']);
            
            for (let i = 1; i < data.values.length; i++) {
                const row = data.values[i];
                if (!row || row.length === 0) continue;

                const isTotalRow = row.slice(0, 5).some(cell => /^(?:totaal|totalen)(?:\s|$|:)/i.test(String(cell || '').trim()));
                if (isTotalRow) continue;

                if (idxBtw !== -1) totaalBtw += parseEuro(row[idxBtw]);
                else if (row.length >= 6) totaalBtw += parseEuro(row[5]);

                if (idxExcl !== -1) totaalOmzet += parseEuro(row[idxExcl]);
                else if (row.length >= 7) totaalOmzet += parseEuro(row[6]);
            }
        }
        if (isVerkoop) console.log('Calculated Verkoop Totals:', { totaalOmzet, totaalBtw });
        return { totaalOmzet, totaalBtw };
    } catch (e) {
        console.error("Fout bij ophalen maandtotalen:", e);
        return { totaalOmzet: 0, totaalBtw: 0 };
    }
}
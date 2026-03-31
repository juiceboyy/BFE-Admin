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
    // 1. DE RESET: Deze variabelen MOETEN binnen de functie staan. Geen geheugenlekken meer!
    let totaalOmzet = 0;
    let totaalBtw = 0;

    try {
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID, // Zorg dat deze goed gelinkt blijft
            range: `'${sheetName}'!A:Z`
        });

        const rows = response.result.values;
        if (!rows || rows.length === 0) {
            return { totaalOmzet, totaalBtw };
        }

        const row0 = rows[0];
        const isVerkoop = sheetName.toLowerCase().includes('verkoop');

        // 2. STRIKTE SCHEIDING VAN KOLOMMEN
        let idxBtwLaag = -1, idxBtwHoog = -1, idxBtwInkoop = -1;
        let idxOmzet = -1;

        if (isVerkoop) {
            idxBtwLaag = row0.findIndex(h => String(h).toLowerCase().includes('btw l'));
            idxBtwHoog = row0.findIndex(h => String(h).toLowerCase().includes('btw h'));
            idxOmzet = row0.findIndex(h => String(h).toLowerCase().includes('omzet') || String(h).toLowerCase().includes('bedrag'));
        } else {
            // Zoekt exact naar het woordje 'BTW' voor Inkoop
            idxBtwInkoop = row0.findIndex(h => {
                const str = String(h).toLowerCase().trim();
                return str === 'btw'; 
            });
            idxOmzet = row0.findIndex(h => String(h).toLowerCase().includes('bedrag') || String(h).toLowerCase().includes('totaal'));
        }

        // 3. BULLETPROOF EURO PARSER
        const parseEuro = (val) => {
            if (!val) return 0;
            let cleaned = String(val).replace(/[^0-9.,-]/g, '');
            if (cleaned.includes(',')) cleaned = cleaned.replace(/\./g, '').replace(',', '.');
            return parseFloat(cleaned) || 0;
        };

        // 4. DE BEREKENING (Rij voor rij)
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length === 0) continue;

            // Omzet optellen
            const omzetBedrag = idxOmzet !== -1 ? parseEuro(row[idxOmzet]) : 0;
            totaalOmzet += omzetBedrag;

            // BTW optellen
            if (isVerkoop) {
                const btwL = idxBtwLaag !== -1 ? parseEuro(row[idxBtwLaag]) : 0;
                const btwH = idxBtwHoog !== -1 ? parseEuro(row[idxBtwHoog]) : 0;
                totaalBtw += (btwL + btwH);
            } else {
                const btwI = idxBtwInkoop !== -1 ? parseEuro(row[idxBtwInkoop]) : 0;
                totaalBtw += btwI;
            }
        }

        console.log(`--- SUCCES: ${sheetName} ---`, { Omzet: totaalOmzet, BTW: totaalBtw });
        return { totaalOmzet, totaalBtw };

    } catch (error) {
        console.error(`Fout bij ophalen van ${sheetName}:`, error);
        return { totaalOmzet: 0, totaalBtw: 0 };
    }
}
import { accessToken } from './auth.js';
import { fetchWithRetry } from '../utils/network.js';

const SPREADSHEET_ID = '119dQIOSLFpKDqWUQUMWTU9miIKP3MOR1VHFB5yzmBrg';
const DRIVE_FOLDER_ID = '1NBCQ89t1soAvZ315_UA-p-lF340qkraH';

/**
 * Uploadt een bestand naar Google Drive in twee stappen (Metadata + Content).
 * @param {File} file - Het bestandsobject.
 * @param {string} factuurNummer - De naam die het bestand krijgt in Drive.
 */
export async function uploadToDrive(file, factuurNummer) {
    if (!accessToken) throw new Error("Niet ingelogd bij Google.");

    try {
        // Stap 1: Metadata aanmaken (lege huls)
        const metadataResponse = await fetchWithRetry('https://www.googleapis.com/drive/v3/files', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: factuurNummer || file.name,
                mimeType: file.type,
                parents: [DRIVE_FOLDER_ID]
            })
        });

        if (metadataResponse.status === 401) throw new Error('TOKEN_EXPIRED');
        if (!metadataResponse.ok) {
            const error = await metadataResponse.json();
            throw new Error(`Fout bij aanmaken bestand in Drive: ${error.error.message}`);
        }

        const metadata = await metadataResponse.json();
        const fileId = metadata.id;

        // Stap 2: Inhoud uploaden (Media)
        const uploadResponse = await fetchWithRetry(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': file.type
            },
            body: file
        });

        if (uploadResponse.status === 401) throw new Error('TOKEN_EXPIRED');
        if (!uploadResponse.ok) {
            const error = await uploadResponse.json();
            throw new Error(`Fout bij uploaden inhoud naar Drive: ${error.error.message}`);
        }

        return await uploadResponse.json();

    } catch (error) {
        console.error('Upload error:', error);
        throw error;
    }
}

/**
 * Voegt een rij toe aan de Google Sheet op de eerste lege plek of overschrijft 'Totalen'.
 * @param {string} sheetName - De naam van het tabblad (bijv. 'Jan Inkoop').
 * @param {Array} data - Array met waarden [datum, factuurnummer, omschrijving, leverancier, totaal, btw, excl]
 */
export async function insertRowInSheet(sheetName, data) {
    if (!accessToken) throw new Error("Niet ingelogd bij Google.");

    try {
        // Stap 1: Zoek de eerste lege rij of de rij met 'Totalen'
        const getRes = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/'${sheetName}'!A1:A`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (getRes.status === 401) throw new Error('TOKEN_EXPIRED');
        if (!getRes.ok) {
            const error = await getRes.json();
            throw new Error(`Fout bij ophalen sheet data: ${error.error.message}`);
        }

        const getJson = await getRes.json();

        let targetRow = getJson.values ? getJson.values.length + 1 : 2;

        if (getJson.values) {
            for (let i = 1; i < getJson.values.length; i++) {
                const cellValue = getJson.values[i] && getJson.values[i][0] ? getJson.values[i][0] : '';
                // Check op lege cel of 'Totalen'
                if (!cellValue || cellValue === 'Totalen') {
                    targetRow = i + 1; // i is 0-based index, Sheets row is 1-based
                    break;
                }
            }
        }

        // Stap 2: Schrijf de data naar die specifieke rij
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

        return await response.json();

    } catch (error) {
        console.error('Sheet insert error:', error);
        throw error;
    }
}

export async function loadCloudMemory() {
    try {
        const res = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/'Leveranciers'!A:C`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        const json = await res.json();
        const memory = {};
        if (json.values && json.values.length > 1) {
            // Loop starts at 1 to skip headers
            for (let i = 1; i < json.values.length; i++) {
                const row = json.values[i];
                if (row && row[0]) {
                    const key = row[0].toLowerCase().trim();
                    if (!memory[key]) memory[key] = [];

                    const newItem = {
                        omschrijving: row[1] || '',
                        btwTarief: row[2] || 0
                    };

                    // Filter duplicaten (zodat we niet 10x dezelfde optie krijgen)
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
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
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
                            if (maxSeq === null || seq > maxSeq) {
                                maxSeq = seq;
                            }
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

    if (maxSeq !== null) {
        return `${targetYear}.${String(maxSeq + 1).padStart(3, '0')}`;
    }

    if (targetSheet.startsWith('Jan')) {
        return `${targetYear}.001`;
    }

    if (prevSheet) {
        maxSeq = await fetchMaxFromSheet(prevSheet);
        if (maxSeq !== null) {
            return `${targetYear}.${String(maxSeq + 1).padStart(3, '0')}`;
        }
    }

    return `${targetYear}.001`;
}

export async function getSheetHeaders(sheetName) {
    if (!accessToken) return [];
    try {
        const res = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/'${sheetName}'!A1:Z1`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (res.status === 401) throw new Error('TOKEN_EXPIRED');
        if (!res.ok) return [];
        
        const json = await res.json();
        if (json.values && json.values[0]) {
            return json.values[0].map(h => String(h || '').toLowerCase());
        }
        return [];
    } catch (e) {
        console.error("Fout bij ophalen headers:", e);
        return [];
    }
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
            const idxOmzetLaag = getIdx(['omzet laag', 'excl 9', 'vergoeding 9', 'vergoeding l', 'netto 9']);
            const idxOmzetHoog = getIdx(['omzet hoog', 'excl 21', 'vergoeding 21', 'vergoeding h', 'netto 21']);
            const idxOmzetNul = getIdx(['omzet nul', 'vrijgesteld', 'omzet 0', 'vergoeding 0', 'excl 0']);

            for (let i = 1; i < data.values.length; i++) {
                const row = data.values[i];
                if (!row || row.length === 0 || String(row[0] || '').toLowerCase().includes('totaal') || String(row[1] || '').toLowerCase().includes('totaal')) continue;

                totaalBtw += (idxBtwLaag !== -1 ? parseEuro(row[idxBtwLaag]) : 0);
                totaalBtw += (idxBtwHoog !== -1 ? parseEuro(row[idxBtwHoog]) : 0);
                
                totaalOmzet += (idxOmzetLaag !== -1 ? parseEuro(row[idxOmzetLaag]) : 0);
                totaalOmzet += (idxOmzetHoog !== -1 ? parseEuro(row[idxOmzetHoog]) : 0);
                totaalOmzet += (idxOmzetNul !== -1 ? parseEuro(row[idxOmzetNul]) : 0);
            }
        } else {
            const idxBtw = getIdx(['btw', 'voorbelasting']);
            const idxExcl = getIdx(['vergoeding', 'excl', 'factuurbedrag excl']);
            
            for (let i = 1; i < data.values.length; i++) {
                const row = data.values[i];
                if (!row || row.length === 0 || String(row[0] || '').toLowerCase().includes('totaal') || String(row[1] || '').toLowerCase().includes('totaal')) continue;

                totaalBtw += (idxBtw !== -1 ? parseEuro(row[idxBtw]) : 0);
                totaalOmzet += (idxExcl !== -1 ? parseEuro(row[idxExcl]) : 0);
            }
        }
        return { totaalOmzet, totaalBtw };
    } catch (e) {
        console.error("Fout bij ophalen maandtotalen:", e);
        return { totaalOmzet: 0, totaalBtw: 0 };
    }
}
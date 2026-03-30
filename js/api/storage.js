import { accessToken } from './auth.js';
import { fetchWithRetry } from '../utils/network.js';

export const SPREADSHEET_ID = '119dQIOSLFpKDqWUQUMWTU9miIKP3MOR1VHFB5yzmBrg';
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
import { accessToken } from './auth.js';

const SPREADSHEET_ID = '119dQIOSLFpKDqWUQUMWTU9miIKP3MOR1VHFB5yzmBrg';

/**
 * Uploadt een bestand naar Google Drive in twee stappen (Metadata + Content).
 * @param {File} file - Het bestandsobject.
 * @param {string} factuurNummer - De naam die het bestand krijgt in Drive.
 */
export async function uploadToDrive(file, factuurNummer) {
    if (!accessToken) throw new Error("Niet ingelogd bij Google.");

    try {
        // Stap 1: Metadata aanmaken (lege huls)
        const metadataResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: factuurNummer || file.name,
                mimeType: file.type
            })
        });

        if (!metadataResponse.ok) {
            const error = await metadataResponse.json();
            throw new Error(`Fout bij aanmaken bestand in Drive: ${error.error.message}`);
        }

        const metadata = await metadataResponse.json();
        const fileId = metadata.id;

        // Stap 2: Inhoud uploaden (Media)
        const uploadResponse = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': file.type
            },
            body: file
        });

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
 * @param {Array} data - Array met waarden [datum, omschrijving, bedragExclusief, btwTarief, btwBedrag, factuurNummer]
 */
export async function insertRowInSheet(data) {
    if (!accessToken) throw new Error("Niet ingelogd bij Google.");

    try {
        // Stap 1: Zoek de eerste lege rij of de rij met 'Totalen'
        const getRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/'Jan Inkoop'!A1:A`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

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
        const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/'Jan Inkoop'!A${targetRow}:G${targetRow}?valueInputOption=USER_ENTERED`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ values: [data] })
        });

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
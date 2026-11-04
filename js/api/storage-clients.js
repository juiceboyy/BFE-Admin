import { fetchWithRetry } from '../utils/network.js';
import { accessToken } from './auth.js';
import { SPREADSHEET_ID } from './storage.js';

let _cachedClients = null;

/**
 * Fetches saved clients from the 'Klanten' tab in Google Sheets.
 * Creates the tab with default headers if it does not exist yet.
 * @returns {Promise<Array<{name: string, attention: string, address: string, city: string}>>}
 */
export async function fetchSavedClientsFromSheet() {
    if (!accessToken) return [];

    const metaRes = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!metaRes.ok) {
        const errorText = await metaRes.text();
        throw new Error(`Google Sheets metadata kon niet worden geladen: ${metaRes.status} ${errorText}`);
    }

    const metaData = await metaRes.json();
    const sheetExists = (metaData.sheets || []).some(s => s.properties?.title === 'Klanten');

    if (!sheetExists) {
        // Create tab 'Klanten'
        const createRes = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                requests: [
                    {
                        addSheet: {
                            properties: { title: 'Klanten' }
                        }
                    }
                ]
            })
        });
        if (!createRes.ok) {
            const errorText = await createRes.text();
            throw new Error(`Klanten tabblad kon niet worden aangemaakt: ${createRes.status} ${errorText}`);
        }

        // Add headers
        const seedRes = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/'Klanten'!A1:D1?valueInputOption=USER_ENTERED`, {
            method: 'PUT',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                values: [["Klantnaam", "T.a.v.", "Adres", "Woonplaats"]]
            })
        });
        if (!seedRes.ok) {
            const errorText = await seedRes.text();
            throw new Error(`Klanten headers konden niet worden aangemaakt: ${seedRes.status} ${errorText}`);
        }
        _cachedClients = [];
        return _cachedClients;
    }

    const dataRes = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/'Klanten'!A1:D`, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!dataRes.ok) {
        const errorText = await dataRes.text();
        throw new Error(`Klantgegevens konden niet worden opgehaald: ${dataRes.status} ${errorText}`);
    }

    const dataJson = await dataRes.json();
    const rows = dataJson.values || [];

    let clients = [];
    if (rows.length > 1) {
        clients = rows.slice(1).map(r => ({
            name: r[0] || '',
            attention: r[1] || '',
            address: r[2] || '',
            city: r[3] || ''
        })).filter(c => c.name.trim() !== '');
        clients.sort((a, b) => a.name.localeCompare(b.name, 'nl', { sensitivity: 'base' }));
    }

    _cachedClients = clients;
    return clients;
}

export function getCachedClients() {
    return _cachedClients || [];
}

/**
 * Saves a new client to the 'Klanten' tab in Google Sheets.
 * @param {{name: string, attention: string, address: string, city: string}} client 
 */
export async function saveClientToSheetApi(client) {
    if (!accessToken) throw new Error("Geen Google access token.");
    await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/'Klanten'!A:D:append?valueInputOption=USER_ENTERED`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            values: [[client.name, client.attention, client.address, client.city]]
        })
    });
    if (_cachedClients) {
        _cachedClients.push(client);
        _cachedClients.sort((a, b) => a.name.localeCompare(b.name, 'nl', { sensitivity: 'base' }));
    }
}

/**
 * Deletes a client from the 'Klanten' tab in Google Sheets by name.
 * @param {string} clientName 
 */
export async function deleteClientFromSheetApi(clientName) {
    if (!accessToken) throw new Error("Geen Google access token.");

    const res = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/'Klanten'!A:D`, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) return;
    const data = await res.json();
    const rows = data.values || [];
    if (rows.length <= 1) return;

    const remainingRows = rows.slice(1).filter(r => (r[0] || '').toLowerCase().trim() !== clientName.toLowerCase().trim());

    // Clear and rewrite
    await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/'Klanten'!A2:D:clear`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (remainingRows.length > 0) {
        await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/'Klanten'!A2?valueInputOption=USER_ENTERED`, {
            method: 'PUT',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                values: remainingRows
            })
        });
    }

    if (_cachedClients) {
        _cachedClients = _cachedClients.filter(c => c.name.toLowerCase().trim() !== clientName.toLowerCase().trim());
    }
}

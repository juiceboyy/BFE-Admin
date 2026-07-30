import { accessToken } from './auth.js';
import { fetchWithRetry } from '../utils/network.js';

export const DRIVE_FOLDER_ID = '1NBCQ89t1soAvZ315_UA-p-lF340qkraH';

let _facturenFolderIdCache = null;

// Files saved by this app start with YYYY.### (e.g. "2026.042 - Supplier")
const PROCESSED_NAME_RE = /^\d{4}\.\d{3}/;

/**
 * Zoekt of maakt de 'Facturen' map in Google Drive voor uitgaande verkoopfacturen.
 * @returns {Promise<string>}
 */
export async function getFacturenFolderId() {
    if (_facturenFolderIdCache) return _facturenFolderIdCache;
    if (!accessToken) throw new Error("Niet ingelogd bij Google.");

    try {
        const q = encodeURIComponent("name = 'Facturen' and mimeType = 'application/vnd.google-apps.folder' and trashed = false");
        const response = await fetchWithRetry(
            `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=1`,
            { headers: { 'Authorization': `Bearer ${accessToken}` } }
        );

        if (response.status === 401) throw new Error('TOKEN_EXPIRED');
        if (response.ok) {
            const data = await response.json();
            if (data.files && data.files.length > 0) {
                _facturenFolderIdCache = data.files[0].id;
                return _facturenFolderIdCache;
            }
        }

        // Als er nog geen map 'Facturen' is in Drive, maak deze dan automatisch aan
        const createResponse = await fetchWithRetry('https://www.googleapis.com/drive/v3/files', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: 'Facturen',
                mimeType: 'application/vnd.google-apps.folder'
            })
        });

        if (createResponse.ok) {
            const folderData = await createResponse.json();
            _facturenFolderIdCache = folderData.id;
            return _facturenFolderIdCache;
        }

    } catch (err) {
        console.error('Fout bij ophalen/aanmaken Facturen map:', err);
    }

    return DRIVE_FOLDER_ID;
}

/**
 * Lists PDFs in the Drive folder that have not yet been processed by this app.
 * @param {string} folderId
 * @returns {Promise<Array<{id, name, mimeType}>>}
 */
export async function scanUnprocessedReceipts(folderId) {
    if (!accessToken) throw new Error('Niet ingelogd bij Google.');

    const q = encodeURIComponent(`'${folderId}' in parents and trashed = false and mimeType = 'application/pdf'`);
    const fields = encodeURIComponent('files(id,name,mimeType)');

    const response = await fetchWithRetry(
        `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&pageSize=100`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );

    if (response.status === 401) throw new Error('TOKEN_EXPIRED');
    if (!response.ok) {
        const err = await response.json();
        throw new Error(`Fout bij ophalen bestanden: ${err.error.message}`);
    }

    const data = await response.json();
    return (data.files || []).filter(f => !PROCESSED_NAME_RE.test(f.name));
}

/**
 * Downloads a Drive file and returns it as a browser File object.
 * @param {string} fileId
 * @param {string} fileName
 * @param {string} mimeType
 * @returns {Promise<File>}
 */
export async function downloadDriveFileAsBlob(fileId, fileName, mimeType) {
    if (!accessToken) throw new Error('Niet ingelogd bij Google.');

    const response = await fetchWithRetry(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );

    if (response.status === 401) throw new Error('TOKEN_EXPIRED');
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(`Fout bij downloaden bestand: ${err?.error?.message || response.status}`);
    }

    const blob = await response.blob();
    return new File([blob], fileName, { type: mimeType || 'application/pdf' });
}

/**
 * Renames an existing Drive file.
 * @param {string} fileId
 * @param {string} newFileName
 */
export async function renameDriveFile(fileId, newFileName) {
    if (!accessToken) throw new Error('Niet ingelogd bij Google.');

    const response = await fetchWithRetry(
        `https://www.googleapis.com/drive/v3/files/${fileId}`,
        {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name: newFileName })
        }
    );

    if (response.status === 401) throw new Error('TOKEN_EXPIRED');
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(`Fout bij hernoemen bestand: ${err?.error?.message || response.status}`);
    }

    return await response.json();
}

/**
 * Uploadt een bestand naar Google Drive in twee stappen (Metadata + Content).
 * @param {File} file - Het bestandsobject.
 * @param {string} factuurNummer - De naam die het bestand krijgt in Drive.
 * @param {string} [folderId] - Doelmap in Drive. Standaard DRIVE_FOLDER_ID.
 */
export async function uploadToDrive(file, factuurNummer, folderId = null) {
    if (!accessToken) throw new Error("Niet ingelogd bij Google.");

    const targetFolderId = folderId || DRIVE_FOLDER_ID;

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
                parents: [targetFolderId]
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

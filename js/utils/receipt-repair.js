import { accessToken } from '../api/auth.js';
import { fetchWithRetry } from './network.js';
import { SPREADSHEET_ID, resolveRealSheetName, clearSheetCaches } from '../api/storage.js';
import { DRIVE_FOLDER_ID, renameDriveFile } from '../api/storage-drive.js';
import { normalizeVendorName } from './duplicate-checker.js';

/**
 * Reconcilieert alle bestandsnamen in Google Drive direct met de Google Sheets data.
 * Google Sheets is de 'single source of truth'. Elk bestand in Drive wordt gekoppeld
 * aan de corresponderende rij in Google Sheets en krijgt exact het juiste bonnummer terug.
 */
export async function reconcileDriveWithSheets(targetYear = 2026) {
    if (!accessToken) {
        throw new Error("Niet ingelogd met Google. Klik eerst op 'Sync Drive'.");
    }

    const yearNum = parseInt(targetYear, 10);

    // 1. Haal alle tabbladtitels op
    const metaRes = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}?fields=sheets.properties.title`, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!metaRes.ok) throw new Error("Kon spreadsheet metadata niet ophalen.");
    const metaData = await metaRes.json();
    const allTitles = (metaData.sheets || []).map(s => s.properties?.title).filter(Boolean);

    // Alle inkoopbladen van het jaar
    const inkoopSheets = allTitles.filter(t => t.toLowerCase().includes('inkoop'));
    if (inkoopSheets.length === 0) throw new Error("Geen inkoop-tabbladen gevonden.");

    // 2. Haal alle rijen op uit alle inkoopbladen
    const params = new URLSearchParams();
    inkoopSheets.forEach(sheet => params.append('ranges', `'${sheet}'!A:Z`));

    const batchRes = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values:batchGet?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!batchRes.ok) throw new Error("Kon spreadsheet rijen niet ophalen.");
    const batchData = await batchRes.json();

    const allSheetEntries = [];
    for (const rangeData of (batchData.valueRanges || [])) {
        const rows = rangeData.values || [];
        if (rows.length < 2) continue;
        const rangeName = rangeData.range || '';
        const headers = rows[0].map(h => String(h || '').toLowerCase().trim());
        const factuurIdx = headers.findIndex(h => h.includes('factuurnummer') || h === 'factuur#' || h === 'factuur nr' || h.includes('factuur') || h.includes('bon'));
        const vendorIdx = headers.findIndex(h => h.includes('leverancier') || h.includes('relatie') || h.includes('naam'));
        const descIdx = headers.findIndex(h => h.includes('omschrijving') || h.includes('beschrijving'));

        if (factuurIdx === -1) continue;

        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const colA = String(row[0] || '').toLowerCase().trim();
            if (colA.includes('totaal') || colA.includes('totalen')) break;

            const factNummer = String(row[factuurIdx] || '').trim();
            const vendor = vendorIdx !== -1 ? String(row[vendorIdx] || '').trim() : '';
            const desc = descIdx !== -1 ? String(row[descIdx] || '').trim() : '';

            if (factNummer) {
                allSheetEntries.push({
                    sheet: rangeName.split('!')[0].replace(/'/g, ''),
                    factuurnummer: factNummer,
                    vendor,
                    normVendor: normalizeVendorName(vendor),
                    desc,
                    rowIndex: i + 1,
                    matched: false
                });
            }
        }
    }

    // 3. Haal alle bestanden op uit Google Drive
    const driveFields = encodeURIComponent('files(id,name,createdTime)');
    const driveRes = await fetchWithRetry(`https://www.googleapis.com/drive/v3/files?q='${DRIVE_FOLDER_ID}'+in+parents+and+trashed=false&fields=${driveFields}&pageSize=300`, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!driveRes.ok) throw new Error("Kon Drive bestanden niet ophalen.");
    const driveData = await driveRes.json();
    const driveFiles = driveData.files || [];

    // 4. Koppel elk Drive-bestand aan de juiste boeking in Sheets
    const renames = [];
    const unmatchedFiles = [];

    for (const file of driveFiles) {
        // Parse de bestandsnaam: bijv. "2026.113 - Tesla.pdf" of "2026.001 - Apple.pdf"
        const cleanName = file.name.replace(/\.pdf$/i, '');
        const parts = cleanName.split(/\s+-\s+/);
        const fileVendor = parts.length > 1 ? parts.slice(1).join(' - ').trim() : cleanName;
        const normFileVendor = normalizeVendorName(fileVendor);

        // Zoek matchende sheet entries
        const candidateEntries = allSheetEntries.filter(e => {
            if (!e.normVendor) return false;
            return e.normVendor === normFileVendor || 
                   normFileVendor.includes(e.normVendor) || 
                   e.normVendor.includes(normFileVendor);
        });

        // Kies de best passende ongematchte entry
        let selectedEntry = candidateEntries.find(e => !e.matched);

        if (!selectedEntry && candidateEntries.length > 0) {
            selectedEntry = candidateEntries[0];
        }

        if (selectedEntry) {
            selectedEntry.matched = true;
            const targetName = `${selectedEntry.factuurnummer} - ${selectedEntry.vendor || fileVendor}`;
            const targetFileName = file.name.toLowerCase().endsWith('.pdf') ? `${targetName}.pdf` : targetName;

            if (file.name !== targetFileName && file.name !== targetName) {
                await renameDriveFile(file.id, targetName);
                renames.push({
                    fileId: file.id,
                    oldName: file.name,
                    newName: targetName,
                    sheet: selectedEntry.sheet,
                    factuurnummer: selectedEntry.factuurnummer
                });
            }
        } else {
            unmatchedFiles.push(file.name);
        }
    }

    clearSheetCaches();

    return {
        status: 'succes',
        totalDriveFiles: driveFiles.length,
        renamesCount: renames.length,
        renames,
        unmatchedFiles
    };
}

if (typeof window !== 'undefined') {
    window.reconcileDriveWithSheets = reconcileDriveWithSheets;
}

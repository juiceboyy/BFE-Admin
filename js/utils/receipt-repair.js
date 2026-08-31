import { accessToken } from '../api/auth.js';
import { fetchWithRetry } from './network.js';
import { SPREADSHEET_ID, resolveRealSheetName, clearSheetCaches } from '../api/storage.js';
import { DRIVE_FOLDER_ID, renameDriveFile } from '../api/storage-drive.js';

/**
 * Voert automatisch het herstelplan uit voor juli 2026:
 * 1. Berekent het hoogste bonnummer t/m juni 2026 over alle eerdere inkoopbladen.
 * 2. Corrigeert de foutief gegenereerde bonnummers in het tabblad van juli (bijv. 2026.001 -> 2026.043).
 * 3. Hernoemt de bijbehorende PDF-bestanden in Google Drive.
 */
export async function autoRepairJulyReceipts(targetYear = 2026) {
    if (!accessToken) {
        throw new Error("Niet ingelogd met Google. Klik eerst op 'Sync Drive' om in te loggen.");
    }

    const yearNum = parseInt(targetYear, 10);

    // 1. Haal alle tabbladtitels op
    const metaRes = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}?fields=sheets.properties.title`, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!metaRes.ok) throw new Error("Kon spreadsheet metadata niet ophalen.");
    const metaData = await metaRes.json();
    const allTitles = (metaData.sheets || []).map(s => s.properties?.title).filter(Boolean);

    // Filter alle inkoopbladen van vóór juli (Jan t/m Jun)
    const preJulyMonths = ['jan', 'feb', 'mar', 'mrt', 'apr', 'may', 'mei', 'jun', 'june', 'juni'];
    const preJulySheets = allTitles.filter(t => {
        const lower = t.toLowerCase();
        return lower.includes('inkoop') && preJulyMonths.some(m => lower.startsWith(m) || lower.includes(` ${m} `) || lower.startsWith(`${m} `));
    });

    let maxSeqBeforeJuly = 0;

    if (preJulySheets.length > 0) {
        const params = new URLSearchParams();
        preJulySheets.forEach(sheet => params.append('ranges', `'${sheet}'!A:Z`));

        const batchRes = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values:batchGet?${params.toString()}`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (batchRes.ok) {
            const batchData = await batchRes.json();
            for (const rangeData of (batchData.valueRanges || [])) {
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
                        if (seq > maxSeqBeforeJuly) maxSeqBeforeJuly = seq;
                    }
                }
            }
        }
    }

    // 2. Zoek het juli inkoop tabblad
    const julySheetTitle = allTitles.find(t => {
        const lower = t.toLowerCase();
        return lower.includes('inkoop') && (lower.startsWith('jul') || lower.startsWith('july') || lower.startsWith('juli'));
    }) || await resolveRealSheetName('Jul Inkoop');

    const julyRes = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/'${julySheetTitle}'!A:Z`, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!julyRes.ok) throw new Error(`Kon tabblad '${julySheetTitle}' niet laden.`);
    const julyData = await julyRes.json();
    const julyRows = julyData.values || [];

    if (julyRows.length < 2) {
        return {
            status: 'geen_rijen',
            message: `Geen rijen gevonden in tabblad '${julySheetTitle}'.`,
            maxSeqBeforeJuly
        };
    }

    const headers = julyRows[0].map(h => String(h || '').toLowerCase().trim());
    const factuurIdx = headers.findIndex(h => h.includes('factuurnummer') || h === 'factuur#' || h === 'factuur nr' || h.includes('factuur') || h.includes('bon'));
    if (factuurIdx === -1) {
        throw new Error(`Geen kolom 'Factuurnummer' gevonden in '${julySheetTitle}'.`);
    }

    // Identificeer rijen in juli die gecorrigeerd moeten worden
    const corrections = [];
    let currentNewSeq = maxSeqBeforeJuly;

    for (let i = 1; i < julyRows.length; i++) {
        const row = julyRows[i];
        const colA = String(row[0] || '').toLowerCase().trim();
        if (colA.includes('totaal') || colA.includes('totalen')) break;

        const factVal = String(row[factuurIdx] || '').trim();
        if (!factVal) continue;

        const match = factVal.match(/(\d{4})[.-](\d{3})/);
        if (match && parseInt(match[1], 10) === yearNum) {
            const oldSeq = parseInt(match[2], 10);
            // Als het volgnummer lager is dan of gelijk aan het laatste nummer van juni, is het een foutieve herstart
            if (oldSeq <= maxSeqBeforeJuly) {
                currentNewSeq += 1;
                const newFactNummer = `${yearNum}.${String(currentNewSeq).padStart(3, '0')}`;
                corrections.push({
                    rowIndex: i + 1, // 1-indexed Sheets row
                    oldNumber: factVal,
                    newNumber: newFactNummer,
                    vendor: row[headers.findIndex(h => h.includes('leverancier') || h.includes('relatie') || h.includes('naam'))] || ''
                });
            }
        }
    }

    if (corrections.length === 0) {
        return {
            status: 'al_correct',
            message: `Alle bonnummers in '${julySheetTitle}' zijn al correct opvolgend (vanaf ${yearNum}.${String(maxSeqBeforeJuly + 1).padStart(3, '0')}).`,
            maxSeqBeforeJuly
        };
    }

    // 3. Update rijen in Google Sheets
    const colLetter = String.fromCharCode(65 + factuurIdx);
    for (const item of corrections) {
        await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/'${julySheetTitle}'!${colLetter}${item.rowIndex}?valueInputOption=USER_ENTERED`, {
            method: 'PUT',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ values: [[item.newNumber]] })
        });
    }

    // 4. Update bestandsnamen in Google Drive
    const driveFields = encodeURIComponent('files(id,name)');
    const driveRes = await fetchWithRetry(`https://www.googleapis.com/drive/v3/files?q='${DRIVE_FOLDER_ID}'+in+parents+and+trashed=false&fields=${driveFields}&pageSize=200`, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });

    const driveRenames = [];
    if (driveRes.ok) {
        const driveData = await driveRes.json();
        const files = driveData.files || [];

        for (const corr of corrections) {
            const oldPrefixDot = corr.oldNumber;
            const oldPrefixDash = corr.oldNumber.replace('.', '-');

            const matchedFiles = files.filter(f => f.name.startsWith(oldPrefixDot) || f.name.startsWith(oldPrefixDash));
            for (const matchedFile of matchedFiles) {
                const newFileName = matchedFile.name
                    .replace(oldPrefixDot, corr.newNumber)
                    .replace(oldPrefixDash, corr.newNumber);

                await renameDriveFile(matchedFile.id, newFileName);
                driveRenames.push({
                    fileId: matchedFile.id,
                    oldName: matchedFile.name,
                    newName: newFileName
                });
            }
        }
    }

    clearSheetCaches();

    return {
        status: 'succes',
        julySheetTitle,
        maxSeqBeforeJuly,
        corrections,
        driveRenames
    };
}

if (typeof window !== 'undefined') {
    window.autoRepairJulyReceipts = autoRepairJulyReceipts;
}

import { accessToken } from '../api/auth.js';
import { fetchWithRetry } from './network.js';
import { SPREADSHEET_ID } from '../api/storage.js';
import { DRIVE_FOLDER_ID, downloadDriveFileAsBlob, renameDriveFile } from '../api/storage-drive.js';
import { analyzeReceipt } from '../api/gemini.js';
import { loadCloudMemory } from '../api/storage-queries-invoices.js';
import { normalizeVendorName, parseAmount, parseDateInfo } from './duplicate-checker.js';

/**
 * Haalt alle inkoop-boekingen op uit Google Sheets over het hele boekjaar.
 * @param {number} targetYear 
 * @returns {Promise<Array<Object>>}
 */
export async function fetchAllInkoopSheetRecords(targetYear = 2026) {
    if (!accessToken) throw new Error("Niet ingelogd met Google.");

    const metaRes = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}?fields=sheets.properties.title`, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!metaRes.ok) throw new Error("Kon spreadsheet metadata niet ophalen.");
    const metaData = await metaRes.json();
    const allTitles = (metaData.sheets || []).map(s => s.properties?.title).filter(Boolean);

    const inkoopSheets = allTitles.filter(t => t.toLowerCase().includes('inkoop'));
    if (inkoopSheets.length === 0) return [];

    const params = new URLSearchParams();
    inkoopSheets.forEach(sheet => params.append('ranges', `'${sheet}'!A:Z`));

    const batchRes = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values:batchGet?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!batchRes.ok) throw new Error("Kon spreadsheet rijen niet ophalen.");
    const batchData = await batchRes.json();

    const sheetRecords = [];

    for (const rangeData of (batchData.valueRanges || [])) {
        const rows = rangeData.values || [];
        if (rows.length < 2) continue;
        const rangeName = rangeData.range || '';
        const sheetTitle = rangeName.split('!')[0].replace(/'/g, '');

        const headers = rows[0].map(h => String(h || '').toLowerCase().trim());
        const factuurIdx = headers.findIndex(h => h.includes('factuurnummer') || h === 'factuur#' || h === 'factuur nr' || h.includes('factuur') || h.includes('bon'));
        const vendorIdx = headers.findIndex(h => h.includes('leverancier') || h.includes('relatie') || h.includes('naam'));
        const amountIdx = headers.findIndex(h => h.includes('factuurbedrag') || h.includes('bedrag') || h.includes('totaal') || h.includes('omzet'));
        const dateIdx = headers.findIndex(h => h.includes('datum') || h.includes('date'));
        const descIdx = headers.findIndex(h => h.includes('omschrijving') || h.includes('beschrijving'));

        if (factuurIdx === -1) continue;

        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const colA = String(row[0] || '').toLowerCase().trim();
            if (colA.includes('totaal') || colA.includes('totalen')) break;

            const factuurnummer = String(row[factuurIdx] || '').trim();
            if (!factuurnummer) continue;

            const vendor = vendorIdx !== -1 ? String(row[vendorIdx] || '').trim() : '';
            const amount = amountIdx !== -1 ? parseAmount(row[amountIdx]) : 0;
            const datum = dateIdx !== -1 ? String(row[dateIdx] || '').trim() : '';
            const desc = descIdx !== -1 ? String(row[descIdx] || '').trim() : '';
            const dateInfo = parseDateInfo(datum, sheetTitle);

            sheetRecords.push({
                sheet: sheetTitle,
                rowIndex: i + 1,
                factuurnummer,
                vendor,
                normVendor: normalizeVendorName(vendor),
                amount,
                datum,
                dateInfo,
                desc,
                matched: false
            });
        }
    }

    return sheetRecords;
}

/**
 * Scant alle PDF-bestanden in Drive met Gemini AI en streamt per bon direct de match.
 * @param {number} targetYear 
 * @param {Function} onItemCallback 
 * @param {Function} shouldCancelFn 
 * @returns {Promise<Object>}
 */
export async function runAiAuditAndReconciliation(targetYear = 2026, onItemCallback = null, shouldCancelFn = null) {
    if (!accessToken) throw new Error("Niet ingelogd met Google.");

    // 1. Haal alle Sheet records en cloud-memory op
    const [sheetRecords, cloudMemory] = await Promise.all([
        fetchAllInkoopSheetRecords(targetYear),
        loadCloudMemory()
    ]);

    // 2. Haal alle bestanden op uit Drive
    const driveFields = encodeURIComponent('files(id,name,mimeType,createdTime)');
    const q = encodeURIComponent(`'${DRIVE_FOLDER_ID}' in parents and trashed = false and (mimeType = 'application/pdf' or mimeType contains 'image/')`);
    const driveRes = await fetchWithRetry(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=${driveFields}&pageSize=300`, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!driveRes.ok) throw new Error("Kon Google Drive bestanden niet ophalen.");
    const driveData = await driveRes.json();
    const driveFiles = driveData.files || [];

    const results = [];
    const total = driveFiles.length;

    for (let idx = 0; idx < total; idx++) {
        if (shouldCancelFn && shouldCancelFn()) {
            break;
        }

        const file = driveFiles[idx];
        if (onItemCallback) {
            onItemCallback({
                type: 'start_file',
                current: idx + 1,
                total,
                fileName: file.name
            });
        }

        try {
            // Download bestand als blob
            const fileBlob = await downloadDriveFileAsBlob(file.id, file.name, file.mimeType);

            // AI Analyse via Gemini
            const aiData = await analyzeReceipt(fileBlob, cloudMemory, 'inkoop');
            const aiVendor = aiData.naamLeverancier || '';
            const normAiVendor = normalizeVendorName(aiVendor);
            const aiAmount = parseAmount(aiData.factuurBedrag || aiData.totaalBedrag || 0);
            const aiDate = aiData.datum || '';
            const aiDateInfo = parseDateInfo(aiDate);

            // Matching tegen Google Sheets records
            let bestMatch = null;
            let bestTier = 'rood'; // 'groen' | 'oranje' | 'rood'
            let matchReason = '';

            for (const rec of sheetRecords) {
                if (rec.matched) continue;

                const isVendorMatch = rec.normVendor && normAiVendor && (
                    rec.normVendor === normAiVendor ||
                    normAiVendor.includes(rec.normVendor) ||
                    rec.normVendor.includes(normAiVendor)
                );

                const isAmountMatch = Math.abs(rec.amount - aiAmount) < 0.05;

                if (!isVendorMatch || !isAmountMatch) continue;

                // STRIKTE MAAND-BEWAKING:
                // Een factuur uit maart mag NOOIT gekoppeld worden aan een sheet uit juni of juli
                if (aiDateInfo && rec.dateInfo) {
                    if (aiDateInfo.month !== rec.dateInfo.month) {
                        continue;
                    }

                    // Zelfde maand: controleer dag
                    if (aiDateInfo.day === rec.dateInfo.day) {
                        bestMatch = rec;
                        bestTier = 'groen';
                        matchReason = `Exacte overeenkomst op leverancier, bedrag en datum (${aiDateInfo.isoDate})`;
                        break;
                    } else if (Math.abs(aiDateInfo.day - rec.dateInfo.day) <= 3) {
                        if (bestTier !== 'groen') {
                            bestMatch = rec;
                            bestTier = 'oranje';
                            matchReason = `Zelfde maand (${rec.sheet}) met kleine dagafwijking (Sheet: ${rec.datum}, AI: ${aiDate})`;
                        }
                    } else if (bestTier === 'rood') {
                        bestMatch = rec;
                        bestTier = 'oranje';
                        matchReason = `Match op leverancier en bedrag in ${rec.sheet}`;
                    }
                } else if (isVendorMatch && isAmountMatch && bestTier === 'rood') {
                    bestMatch = rec;
                    bestTier = 'oranje';
                    matchReason = `Match op leverancier en bedrag (${rec.sheet})`;
                }
            }

            if (bestMatch && bestTier === 'groen') {
                bestMatch.matched = true;
            }

            const currentNumberMatch = file.name.match(/^(\d{4}[.-]\d{3})/);
            const currentNumber = currentNumberMatch ? currentNumberMatch[1].replace('-', '.') : null;
            const proposedNumber = bestMatch ? bestMatch.factuurnummer.replace('-', '.') : null;
            const ext = file.name.toLowerCase().endsWith('.pdf') ? '.pdf' : '';
            const proposedName = bestMatch 
                ? `${bestMatch.factuurnummer} - ${bestMatch.vendor || aiVendor}${ext}`
                : file.name;
            const numberIsUnchanged = Boolean(currentNumber && proposedNumber && currentNumber === proposedNumber);

            const resultItem = {
                fileId: file.id,
                currentName: file.name,
                proposedName,
                currentNumber,
                proposedNumber,
                numberIsUnchanged,
                aiData: { vendor: aiVendor, amount: aiAmount, date: aiDate, desc: aiData.omschrijving || '' },
                matchedRecord: bestMatch,
                tier: bestTier,
                matchReason,
                selected: bestTier === 'groen' && !numberIsUnchanged
            };
            results.push(resultItem);

            if (onItemCallback) {
                onItemCallback({ type: 'file_matched', item: resultItem, current: idx + 1, total });
            }
        } catch (err) {
            console.error(`Fout bij analyseren ${file.name}:`, err);
            const errorItem = {
                fileId: file.id,
                currentName: file.name,
                proposedName: file.name,
                aiData: { vendor: 'Fout bij scannen', amount: 0, date: '', desc: err.message },
                matchedRecord: null,
                tier: 'rood',
                matchReason: `AI Scan fout: ${err.message}`,
                selected: false
            };
            results.push(errorItem);

            if (onItemCallback) {
                onItemCallback({ type: 'file_matched', item: errorItem, current: idx + 1, total });
            }
        }
    }

    return {
        status: 'success',
        totalFiles: total,
        matches: results
    };
}

/**
 * Voert de geselecteerde hernoemingen uit in Google Drive.
 * @param {Array<Object>} matchesToRename 
 * @param {Function} progressCallback 
 * @returns {Promise<Object>}
 */
export async function executeReconcileRenames(matchesToRename, progressCallback = null) {
    if (!accessToken) throw new Error("Niet ingelogd met Google.");

    const renames = [];
    const errors = [];
    const total = matchesToRename.length;

    for (let idx = 0; idx < total; idx++) {
        const item = matchesToRename[idx];
        if (progressCallback) {
            progressCallback({ current: idx + 1, total, fileName: item.proposedName });
        }

        try {
            if (item.currentName !== item.proposedName) {
                await renameDriveFile(item.fileId, item.proposedName.replace(/\.pdf$/i, ''));
                renames.push({
                    fileId: item.fileId,
                    oldName: item.currentName,
                    newName: item.proposedName
                });
            }
        } catch (err) {
            errors.push({ fileId: item.fileId, name: item.currentName, error: err.message });
        }
    }

    return {
        renamedCount: renames.length,
        renames,
        errors
    };
}

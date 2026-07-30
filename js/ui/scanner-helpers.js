import { uploadToDrive, insertRowInSheet, getSheetHeaders, renameDriveFile, getFacturenFolderId, DRIVE_FOLDER_ID } from '../api/storage.js';
import { loadCloudMemory, saveCloudMemory } from '../api/storage-queries-invoices.js';

export function prepareItemData(mode, aiData, memory) {
    if (mode === 'verkoop') {
        return {
            ...aiData,
            omschrijving: aiData.omschrijving || '',
            factuurnummer: '', // Blijft auto-generate bij opslaan
            options: []
        };
    }

    // Inkoop logica
    const vendorKey = aiData.naamLeverancier ? aiData.naamLeverancier.toLowerCase().trim() : '';
    const savedVendor = memory[vendorKey];
    const memoryOmschrijving = (savedVendor && Array.isArray(savedVendor) && savedVendor.length > 0) 
        ? savedVendor[0].omschrijving 
        : (savedVendor ? savedVendor.omschrijving : null);

    return {
        ...aiData,
        omschrijving: memoryOmschrijving || aiData.omschrijving || '',
        factuurnummer: '',
        options: savedVendor || []
    };
}

export function getFormDataFromDOM(id) {
    const getVal = (f) => document.getElementById(`${f}-${id}`)?.value || '';
    return {
        leverancier: getVal('leverancier'), // Bevat 'KlantNaam' in verkoop modus
        omschrijving: getVal('omschrijving'),
        datum: getVal('datum'),
        factuurBedrag: parseFloat(getVal('factuurbedrag')) || 0,
        btw: parseFloat(getVal('btw')) || 0
    };
}

export function constructSheetRow(mode, formData, itemData, factuurnummer, headers = []) {
    let rowValues = [];
    
    // Helper om de index van een kolom te vinden via keywords
    const getIdx = (keywords) => headers.findIndex(h => keywords.some(kw => h.includes(kw)));

    if (mode === 'verkoop') {
        const factuurBedrag = parseFloat(formData.factuurBedrag) || 0;
        let btw = parseFloat(formData.btw);
        if (isNaN(btw) || btw === null) {
            btw = (parseFloat(itemData.btwLaag) || 0) + (parseFloat(itemData.btwHoog) || 0);
        }
        
        const baseExcl = factuurBedrag - btw;

        let btwLaag = 0;
        let btwHoog = 0;
        let omzetLaag = 0;
        let omzetHoog = 0;
        let omzetNul = 0;

        if (btw === 0) {
            omzetNul = factuurBedrag;
        } else {
            // Calculate implied rate.
            const rate = baseExcl > 0 ? (btw / baseExcl) : 0;
            
            if (rate >= 0.15 && rate <= 0.25) {
                // 21% BTW (Hoog)
                btwHoog = btw;
                omzetHoog = baseExcl;
            } else if (rate >= 0.05 && rate < 0.15) {
                // 9% BTW (Laag)
                btwLaag = btw;
                omzetLaag = baseExcl;
            } else {
                // Fallback to itemData/AI proportions, scaled to match the actual btw and factuurBedrag
                const aiBtwLaag = parseFloat(itemData.btwLaag) || 0;
                const aiBtwHoog = parseFloat(itemData.btwHoog) || 0;
                const aiBtwTotal = aiBtwLaag + aiBtwHoog;

                if (aiBtwTotal > 0) {
                    btwLaag = (aiBtwLaag / aiBtwTotal) * btw;
                    btwHoog = (aiBtwHoog / aiBtwTotal) * btw;
                } else {
                    btwHoog = btw;
                }

                const aiOmzetLaag = parseFloat(itemData.omzetLaag) || 0;
                const aiOmzetHoog = parseFloat(itemData.omzetHoog) || 0;
                const aiOmzetNul = parseFloat(itemData.omzetNul) || 0;
                const aiOmzetTotal = aiOmzetLaag + aiOmzetHoog + aiOmzetNul;

                if (aiOmzetTotal > 0) {
                    omzetLaag = (aiOmzetLaag / aiOmzetTotal) * baseExcl;
                    omzetHoog = (aiOmzetHoog / aiOmzetTotal) * baseExcl;
                    omzetNul = (aiOmzetNul / aiOmzetTotal) * baseExcl;
                } else {
                    if (btwHoog > 0) omzetHoog = baseExcl;
                    else if (btwLaag > 0) omzetLaag = baseExcl;
                    else omzetNul = baseExcl;
                }
            }
        }

        if (headers.length > 0) {
            rowValues = new Array(headers.length).fill("");
            const setVal = (keys, val) => { const i = getIdx(keys); if (i !== -1) rowValues[i] = val; };

            setVal(['datum', 'date'], formData.datum);
            setVal(['factuur', 'nr', 'nummer'], factuurnummer);
            setVal(['omschrijving', 'beschrijving'], formData.omschrijving);
            setVal(['klant', 'relatie', 'naam', 'debiteur'], formData.leverancier);
            setVal(['totaal', 'bedrag incl', 'factuurbedrag', 'incl'], factuurBedrag);
            setVal(['btw laag', 'btw 9', 'btw l'], btwLaag);
            setVal(['btw hoog', 'btw 21', 'btw h'], btwHoog);
            setVal(['omzet laag', 'excl 9', 'vergoeding l', 'netto 9'], omzetLaag);
            setVal(['omzet hoog', 'excl 21', 'vergoeding h', 'netto 21'], omzetHoog);
            setVal(['omzet nul', 'omzet 0', 'vergoeding 0', 'excl 0'], omzetNul);
        } else {
            rowValues = [
                formData.datum, factuurnummer, formData.omschrijving, formData.leverancier, factuurBedrag,
                btwLaag, btwHoog, omzetLaag, omzetHoog, omzetNul,
                "", "", ""
            ];
        }
    } else {
        // Normalize: accept any property name the AI might return for the total amount
        const btw = parseFloat(formData.btw) || 0;
        let factuurBedrag = parseFloat(
            formData.factuurBedrag || formData.factuurbedrag || formData.totaalBedrag || formData.totaal || 0
        );
        const vergoedingExcl = factuurBedrag - btw;
        // Failsafe: if total is still 0 but we have excl + btw data, reconstruct it
        if (factuurBedrag === 0 && vergoedingExcl + btw > 0) {
            factuurBedrag = vergoedingExcl + btw;
        }

        if (headers.length > 0) {
            rowValues = new Array(headers.length).fill("");
            const setVal = (keys, val) => { const i = getIdx(keys); if (i !== -1) rowValues[i] = val; };

            setVal(['datum', 'date'], formData.datum);
            setVal(['factuur', 'nr', 'nummer'], factuurnummer);
            setVal(['omschrijving', 'beschrijving'], formData.omschrijving);
            setVal(['leverancier', 'naam leverancier', 'klant'], formData.leverancier);
            // 'factuurbedrag' catches the Dutch column name; more specific terms checked first
            setVal(['totaal', 'bedrag incl', 'factuurbedrag incl', 'factuurbedrag', 'incl'], factuurBedrag);
            setVal(['btw', 'voorbelasting'], btw);
            setVal(['vergoeding', 'excl', 'factuurbedrag excl'], vergoedingExcl);
        } else {
            rowValues = [formData.datum, factuurnummer, formData.omschrijving, formData.leverancier, factuurBedrag, btw, vergoedingExcl];
        }
    }

    // Wasstraat: verander elke 0 of '0.00' in een lege string voor een schonere spreadsheet
    return rowValues.map(val => {
        if (val !== "" && val !== null && !isNaN(val) && parseFloat(val) === 0) {
            return "";
        }
        return val;
    });
}

export async function processItemSave(file, formData, itemData, currentMode, factuurnummer, dateInfo, driveFileId = null) {
    const newName = (currentMode === 'verkoop' && file && file.name) 
        ? file.name.replace(/\.pdf$/i, '') 
        : `${factuurnummer} - ${formData.leverancier}`;
    if (driveFileId) {
        // File is already in Drive — rename it to mark as processed
        await renameDriveFile(driveFileId, newName);
    } else {
        const targetFolderId = (currentMode === 'verkoop') ? await getFacturenFolderId() : DRIVE_FOLDER_ID;
        await uploadToDrive(file, newName, targetFolderId);
    }

    // Haal de dynamische sheet headers op
    const headers = await getSheetHeaders(dateInfo.targetSheet);
    const rowValues = constructSheetRow(currentMode, formData, itemData, factuurnummer, headers);
    await insertRowInSheet(dateInfo.targetSheet, rowValues);

    // Cloud Memory updaten indien nodig (Alleen bij inkoop)
    if (currentMode === 'inkoop' && formData.leverancier) {
        const currentMemory = await loadCloudMemory();
        const vendorKey = formData.leverancier.toLowerCase().trim();
        const existingOptions = currentMemory[vendorKey] || [];
        if (!existingOptions.some(opt => opt.omschrijving === formData.omschrijving)) {
            await saveCloudMemory(formData.leverancier, formData.omschrijving, 'Mix');
        }
    }
}
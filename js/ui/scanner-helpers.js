import { uploadToDrive, insertRowInSheet, getSheetHeaders, renameDriveFile } from '../api/storage.js';
import { loadCloudMemory, saveCloudMemory } from '../api/storage-queries.js';

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
        if (headers.length > 0) {
            rowValues = new Array(headers.length).fill("");
            const setVal = (keys, val) => { const i = getIdx(keys); if (i !== -1) rowValues[i] = val; };

            setVal(['datum', 'date'], formData.datum);
            setVal(['factuur', 'nr', 'nummer'], factuurnummer);
            setVal(['omschrijving', 'beschrijving'], formData.omschrijving);
            setVal(['klant', 'relatie', 'naam', 'debiteur'], formData.leverancier);
            setVal(['totaal', 'bedrag incl', 'incl'], formData.factuurBedrag);
            setVal(['btw laag', 'btw 9', 'btw l'], parseFloat(itemData.btwLaag) || 0);
            setVal(['btw hoog', 'btw 21', 'btw h'], parseFloat(itemData.btwHoog) || 0);
            setVal(['omzet laag', 'excl 9', 'vergoeding l', 'netto 9'], parseFloat(itemData.omzetLaag) || 0);
            setVal(['omzet hoog', 'excl 21', 'vergoeding h', 'netto 21'], parseFloat(itemData.omzetHoog) || 0);
            setVal(['omzet nul', 'omzet 0', 'vergoeding 0', 'excl 0'], parseFloat(itemData.omzetNul) || 0);
        } else {
            rowValues = [
                formData.datum, factuurnummer, formData.omschrijving, formData.leverancier, formData.factuurBedrag,
                parseFloat(itemData.btwLaag) || 0, parseFloat(itemData.btwHoog) || 0,
                parseFloat(itemData.omzetLaag) || 0, parseFloat(itemData.omzetHoog) || 0, parseFloat(itemData.omzetNul) || 0,
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
    const newName = `${factuurnummer} - ${formData.leverancier}`;
    if (driveFileId) {
        // File is already in Drive — rename it to mark as processed
        await renameDriveFile(driveFileId, newName);
    } else {
        await uploadToDrive(file, newName);
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
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

export function constructSheetRow(mode, formData, itemData, factuurnummer) {
    let rowValues = [];

    if (mode === 'verkoop') {
        rowValues = [
            formData.datum,
            factuurnummer,
            formData.omschrijving,
            formData.leverancier, // KlantNaam
            formData.factuurBedrag, // TotaalBedrag
            parseFloat(itemData.btwLaag) || 0,
            parseFloat(itemData.btwHoog) || 0,
            parseFloat(itemData.omzetLaag) || 0,
            parseFloat(itemData.omzetHoog) || 0,
            parseFloat(itemData.omzetNul) || 0,
            "", "", ""
        ];
    } else {
        const vergoedingExcl = formData.factuurBedrag - formData.btw;
        rowValues = [formData.datum, factuurnummer, formData.omschrijving, formData.leverancier, formData.factuurBedrag, formData.btw, vergoedingExcl];
    }

    // Wasstraat: verander elke 0 of '0.00' in een lege string voor een schonere spreadsheet
    return rowValues.map(val => {
        if (val !== "" && val !== null && !isNaN(val) && parseFloat(val) === 0) {
            return "";
        }
        return val;
    });
}
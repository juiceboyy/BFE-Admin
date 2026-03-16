import { accessToken } from './auth.js';

/**
 * Haalt alle financiële data voor een specifiek jaar op en aggregeert dit.
 * @param {string|number} year - Het jaar (bijv. "2026").
 * @param {string} spreadsheetId - Het ID van de Google Sheet.
 * @returns {Promise<Object>} Geaggregeerd data object.
 */
export async function collectYearData(year, spreadsheetId) {
    // 1. Data Contract Initialisatie
    const result = {
        year: String(year),
        omzet: { hoog21: 0, laag9: 0, nul0: 0, totaal: 0 },
        btwAfgedragen: { hoog21: 0, laag9: 0, totaal: 0 },
        kosten: { totaal: 0, perLeverancier: {} },
        voorbelasting: { totaal: 0 }
    };

    try {
        // 2. Metadata: Ophalen van alle sheet titles
        const metaResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        if (metaResponse.status === 401) throw new Error('TOKEN_EXPIRED');
        if (!metaResponse.ok) {
            const error = await metaResponse.json();
            throw new Error(`Fout bij ophalen spreadsheet metadata: ${error.error.message}`);
        }

        const metaData = await metaResponse.json();
        const allSheetTitles = metaData.sheets.map(s => s.properties.title);

        // 3. Categorisatie
        const inkoopSheets = allSheetTitles.filter(title => title.toLowerCase().includes('inkoop'));
        const verkoopSheets = allSheetTitles.filter(title => title.toLowerCase().includes('verkoop'));
        const targetSheets = [...inkoopSheets, ...verkoopSheets];

        if (targetSheets.length === 0) return result;

        // 4. Batch Fetching met strakke constraints voor accurate getallen
        const params = new URLSearchParams({
            valueRenderOption: 'UNFORMATTED_VALUE', // CRITICAL: Raw floats needed, no currency strings
            dateTimeRenderOption: 'FORMATTED_STRING'
        });
        targetSheets.forEach(sheet => params.append('ranges', `'${sheet}'!A:Z`));

        const batchResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${params.toString()}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        if (batchResponse.status === 401) throw new Error('TOKEN_EXPIRED');
        if (!batchResponse.ok) {
            const error = await batchResponse.json();
            throw new Error(`Fout bij ophalen batch data: ${error.error.message}`);
        }

        const batchData = await batchResponse.json();

        // Helper om veilig getallen op te tellen (inclusief string bedragen met komma's)
        const parseAmount = (val) => {
            if (typeof val === 'number') return val;
            if (typeof val === 'string') return parseFloat(val.replace(',', '.')) || 0;
            return 0;
        };

        // 5. Aggregation & Business Rules
        if (batchData.valueRanges) {
            for (const rangeData of batchData.valueRanges) {
                if (!rangeData.values || rangeData.values.length <= 1) continue;

                const rangeName = rangeData.range || '';
                const isInkoop = rangeName.toLowerCase().includes('inkoop');
                const isVerkoop = rangeName.toLowerCase().includes('verkoop');

                // 1. Header mapping
                const headers = rangeData.values[0].map(h => String(h || '').toLowerCase());
                const getIdx = (keywords) => headers.findIndex(h => keywords.some(kw => h.includes(kw)));
                
                let idxDatum = getIdx(['datum', 'date']);
                if (idxDatum === -1) idxDatum = 0; // Fallback
                
                if (isVerkoop) {
                    const idxKlant = getIdx(['klant', 'relatie', 'naam', 'debiteur']);
                    const idxBtwLaag = getIdx(['btw laag', 'btw 9', 'btw l']);
                    const idxBtwHoog = getIdx(['btw hoog', 'btw 21', 'btw h']);
                    const idxOmzetLaag = getIdx(['omzet laag', 'excl 9', 'vergoeding l', 'netto 9']);
                    const idxOmzetHoog = getIdx(['omzet hoog', 'excl 21', 'vergoeding h', 'netto 21']);
                    const idxOmzetNul = getIdx(['omzet nul', 'omzet 0', 'vergoeding 0', 'excl 0']);

                    console.log(`Mapped indices for Verkoop (${rangeName}):`, { idxDatum, idxKlant, idxBtwLaag, idxBtwHoog, idxOmzetLaag, idxOmzetHoog, idxOmzetNul });

                    for (let i = 1; i < rangeData.values.length; i++) {
                        const row = rangeData.values[i];
                        const dateVal = row[idxDatum];
                        if (!dateVal || !String(dateVal).includes(String(year))) continue;

                        result.btwAfgedragen.laag9 += parseAmount(row[idxBtwLaag]);
                        result.btwAfgedragen.hoog21 += parseAmount(row[idxBtwHoog]);
                        result.omzet.laag9 += parseAmount(row[idxOmzetLaag]);
                        result.omzet.hoog21 += parseAmount(row[idxOmzetHoog]);
                        result.omzet.nul0 += parseAmount(row[idxOmzetNul]);
                    }
                } else if (isInkoop) {
                    const idxLeverancier = getIdx(['leverancier', 'naam leverancier', 'klant']);
                    const idxBtw = getIdx(['btw', 'voorbelasting']);
                    const idxExcl = getIdx(['vergoeding', 'excl', 'factuurbedrag excl']);

                    console.log(`Mapped indices for Inkoop (${rangeName}):`, { idxDatum, idxLeverancier, idxBtw, idxExcl });

                    for (let i = 1; i < rangeData.values.length; i++) {
                        const row = rangeData.values[i];
                        const dateVal = row[idxDatum];
                        if (!dateVal || !String(dateVal).includes(String(year))) continue;

                        const leverancier = row[idxLeverancier] ? String(row[idxLeverancier]).trim() : 'Onbekend';
                        const voorbelasting = parseAmount(row[idxBtw]);
                        const kostenExcl = parseAmount(row[idxExcl]);

                        result.voorbelasting.totaal += voorbelasting;
                        result.kosten.totaal += kostenExcl;
                        
                        result.kosten.perLeverancier[leverancier] = (result.kosten.perLeverancier[leverancier] || 0) + kostenExcl;
                    }
                }
            }
        }

        // Sub-totalen berekenen en afronden om JS float errors (e.g., 0.300000000004) te fixen
        const round2 = (num) => Math.round(num * 100) / 100;
        
        result.omzet.totaal = round2(result.omzet.laag9 + result.omzet.hoog21 + result.omzet.nul0);
        result.btwAfgedragen.totaal = round2(result.btwAfgedragen.laag9 + result.btwAfgedragen.hoog21);
        
        // Resultaten object opschonen voor we het doorgeven
        return result;

    } catch (error) {
        console.error('🚨 Fout in tax-collector module:', error);
        throw error;
    }
}
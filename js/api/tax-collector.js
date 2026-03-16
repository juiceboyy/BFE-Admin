import { accessToken } from './auth.js';

/**
 * Haalt alle financiële data voor een specifiek jaar op en aggregeert dit.
 * @param {string|number} year - Het jaar (bijv. "2026").
 * @param {string} spreadsheetId - Het ID van de Google Sheet.
 * @returns {Promise<Object>} Geaggregeerd data object.
 */
export async function collectYearData(year, spreadsheetId) {
    if (!accessToken) throw new Error("Niet ingelogd bij Google.");

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
        targetSheets.forEach(sheet => params.append('ranges', `'${sheet}'!A:K`));

        const batchResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${params.toString()}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        if (!batchResponse.ok) {
            const error = await batchResponse.json();
            throw new Error(`Fout bij ophalen batch data: ${error.error.message}`);
        }

        const batchData = await batchResponse.json();

        // Helper om veilig getallen op te tellen (voorkomt NaN als cell leeg/ongeldig is)
        const getNum = (val) => (typeof val === 'number' ? val : 0);

        // 5. Aggregation & Business Rules
        if (batchData.valueRanges) {
            for (const rangeData of batchData.valueRanges) {
                if (!rangeData.values || rangeData.values.length <= 1) continue;

                const rangeName = rangeData.range || '';
                const isInkoop = rangeName.toLowerCase().includes('inkoop');
                const isVerkoop = rangeName.toLowerCase().includes('verkoop');

                // Sla de header row (index 0) over
                for (let i = 1; i < rangeData.values.length; i++) {
                    const row = rangeData.values[i];
                    const dateVal = row[0];

                    // Controleer of de datum overeenkomt met het opgevraagde jaar
                    if (!dateVal || !String(dateVal).includes(String(year))) continue;

                    if (isVerkoop) {
                        result.btwAfgedragen.laag9 += getNum(row[5]); // BTW Laag
                        result.btwAfgedragen.hoog21 += getNum(row[6]); // BTW Hoog
                        result.omzet.laag9 += getNum(row[7]); // Omzet Laag
                        result.omzet.hoog21 += getNum(row[8]); // Omzet Hoog
                        result.omzet.nul0 += getNum(row[9]); // Omzet Nul
                    } else if (isInkoop) {
                        const leverancier = row[3] ? String(row[3]).trim() : 'Onbekend';
                        const voorbelasting = getNum(row[5]); // BTW / Voorbelasting
                        const kostenExcl = getNum(row[6]); // Kosten Excl. BTW

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
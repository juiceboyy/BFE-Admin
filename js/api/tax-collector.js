import { accessToken } from './auth.js';
import { fetchWithRetry } from '../utils/network.js';

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
        const metaResponse = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
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

        const batchResponse = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${params.toString()}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        if (batchResponse.status === 401) throw new Error('TOKEN_EXPIRED');
        if (!batchResponse.ok) {
            const error = await batchResponse.json();
            throw new Error(`Fout bij ophalen batch data: ${error.error.message}`);
        }

        const batchData = await batchResponse.json();

        // Bulletproof Number Parsing
        const parseEuro = (val) => {
            if (typeof val === 'number') return isNaN(val) ? 0 : val;
            if (!val) return 0;
            // Verwijder alles behalve cijfers, min-tekens, komma's en punten (stript '€', 'EUR', spaties, etc.)
            // Zet daarna "1.234,56" om naar "1234.56"
            const cleaned = String(val).replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.');
            return parseFloat(cleaned) || 0;
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
                        try {
                            const row = rangeData.values[i];
                            if (!row || row.length === 0 || row[idxDatum] === undefined) continue;
                            
                            const isTotalRow = row.slice(0, 5).some(cell => /^(?:totaal|totalen)(?:\s|$|:)/i.test(String(cell || '').trim()));
                            if (isTotalRow) continue;

                            result.btwAfgedragen.laag9 += idxBtwLaag !== -1 ? parseEuro(row[idxBtwLaag]) : 0;
                            result.btwAfgedragen.hoog21 += idxBtwHoog !== -1 ? parseEuro(row[idxBtwHoog]) : 0;
                            result.omzet.laag9 += idxOmzetLaag !== -1 ? parseEuro(row[idxOmzetLaag]) : 0;
                            result.omzet.hoog21 += idxOmzetHoog !== -1 ? parseEuro(row[idxOmzetHoog]) : 0;
                            result.omzet.nul0 += idxOmzetNul !== -1 ? parseEuro(row[idxOmzetNul]) : 0;
                        } catch (err) {
                            console.warn(`⚠️ Fout bij verwerken rij ${i} in ${rangeName} (Verkoop), rij overgeslagen:`, err);
                        }
                    }
                } else if (isInkoop) {
                    const idxLeverancier = getIdx(['leverancier', 'naam leverancier', 'klant']);
                    const idxBtw = getIdx(['btw', 'voorbelasting']);
                    const idxExcl = getIdx(['vergoeding', 'excl', 'factuurbedrag excl']);

                    console.log(`Mapped indices for Inkoop (${rangeName}):`, { idxDatum, idxLeverancier, idxBtw, idxExcl });

                    for (let i = 1; i < rangeData.values.length; i++) {
                        try {
                            const row = rangeData.values[i];
                            if (!row || row.length === 0 || row[idxDatum] === undefined) continue;

                            const isTotalRow = row.slice(0, 5).some(cell => /^(?:totaal|totalen)(?:\s|$|:)/i.test(String(cell || '').trim()));
                            if (isTotalRow) continue;

                            const leverancier = idxLeverancier !== -1 && row[idxLeverancier] ? String(row[idxLeverancier]).trim() : 'Onbekend';
                            const voorbelasting = idxBtw !== -1 ? parseEuro(row[idxBtw]) : 0;
                            const kostenExcl = idxExcl !== -1 ? parseEuro(row[idxExcl]) : 0;

                            result.voorbelasting.totaal += voorbelasting;
                            result.kosten.totaal += kostenExcl;
                            
                            result.kosten.perLeverancier[leverancier] = (result.kosten.perLeverancier[leverancier] || 0) + kostenExcl;
                        } catch (err) {
                            console.warn(`⚠️ Fout bij verwerken rij ${i} in ${rangeName} (Inkoop), rij overgeslagen:`, err);
                        }
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
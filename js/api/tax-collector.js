import { accessToken } from './auth.js';
import { fetchWithRetry } from '../utils/network.js';
import {
    FULL_MONTH_NAMES,
    detectMonthIndex,
    round2,
    processVerkoopRange,
    processInkoopRange
} from './tax-collector-helpers.js';

export { FULL_MONTH_NAMES } from './tax-collector-helpers.js';

/**
 * Haalt alle financiële data voor een specifiek jaar op en aggregeert dit per maand en per jaar.
 * @param {string|number} year - Het boekjaar (bijv. "2025").
 * @param {string} spreadsheetId - Het ID van de Google Sheet.
 * @returns {Promise<Object>} Geaggregeerd data-object inclusief maandenspecificatie en validatie.
 */
export async function collectYearData(year, spreadsheetId) {
    const result = {
        year: String(year),
        spreadsheetId,
        omzet: { hoog21: 0, laag9: 0, nul0: 0, totaal: 0 },
        btwAfgedragen: { hoog21: 0, laag9: 0, totaal: 0 },
        kosten: { totaal: 0, perLeverancier: {} },
        voorbelasting: { totaal: 0 },
        maanden: FULL_MONTH_NAMES.map((name, idx) => ({
            monthIndex: idx,
            monthName: name,
            verkoopSheet: null,
            inkoopSheet: null,
            verkoopFound: false,
            inkoopFound: false,
            verkoop: {
                omzetEx: 0,
                btwLaag9: 0,
                btwHoog21: 0,
                omzetNul0: 0,
                btwTotal: 0,
                count: 0,
                hasTotaalRow: false,
                calculatedSum: 0,
                hasDiscrepancy: false,
                discrepancyDiff: 0
            },
            inkoop: {
                kostenEx: 0,
                voorbelasting: 0,
                count: 0,
                hasTotaalRow: false,
                calculatedKosten: 0,
                calculatedVoorbelasting: 0,
                hasDiscrepancy: false,
                discrepancyDiff: 0
            },
            omzetEx: 0,
            kostenEx: 0,
            winst: 0,
            btwBalans: 0
        })),
        totals: null
    };

    if (!accessToken) throw new Error('Niet ingelogd bij Google (geen accessToken).');

    // 1. Metadata ophalen
    const metaResponse = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (metaResponse.status === 401) throw new Error('TOKEN_EXPIRED');
    if (!metaResponse.ok) {
        const error = await metaResponse.json().catch(() => ({}));
        throw new Error(`Fout bij ophalen spreadsheet metadata: ${error?.error?.message || metaResponse.status}`);
    }

    const metaData = await metaResponse.json();
    const allSheetTitles = (metaData.sheets || []).map(s => s.properties?.title).filter(Boolean);

    const inkoopSheets = allSheetTitles.filter(t => t.toLowerCase().includes('inkoop'));
    const verkoopSheets = allSheetTitles.filter(t => t.toLowerCase().includes('verkoop'));
    const targetSheets = [...inkoopSheets, ...verkoopSheets];

    if (targetSheets.length === 0) {
        finalizeTotals(result);
        return result;
    }

    // 2. Batch data ophalen in één netwerkaanvraag
    const params = new URLSearchParams({
        valueRenderOption: 'UNFORMATTED_VALUE',
        dateTimeRenderOption: 'FORMATTED_STRING'
    });
    targetSheets.forEach(sheet => params.append('ranges', `'${sheet}'!A:Z`));

    const batchResponse = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (batchResponse.status === 401) throw new Error('TOKEN_EXPIRED');
    if (!batchResponse.ok) {
        const error = await batchResponse.json().catch(() => ({}));
        throw new Error(`Fout bij ophalen batch data: ${error?.error?.message || batchResponse.status}`);
    }

    const batchData = await batchResponse.json();

    // 3. Verwerken per tabblad
    if (batchData.valueRanges) {
        for (const rangeData of batchData.valueRanges) {
            const rangeName = (rangeData.range || '').replace(/^'|'![A-Z0-9:]+$/g, '');
            const rawTitle = rangeName.split('!')[0].replace(/'/g, '');
            const lowerTitle = rawTitle.toLowerCase();
            const monthIdx = detectMonthIndex(rawTitle);
            const mObj = monthIdx !== -1 ? result.maanden[monthIdx] : null;

            if (!rangeData.values || rangeData.values.length <= 1) continue;

            if (lowerTitle.includes('verkoop')) {
                processVerkoopRange(rangeData, rawTitle, result, mObj);
            } else if (lowerTitle.includes('inkoop')) {
                processInkoopRange(rangeData, rawTitle, result, mObj);
            }
        }
    }

    // 4. Maandensaldi & Jaartotalen afronden
    result.maanden.forEach(m => {
        m.omzetEx = round2(m.verkoop.omzetEx);
        m.kostenEx = round2(m.inkoop.kostenEx);
        m.winst = round2(m.omzetEx - m.kostenEx);
        m.btwBalans = round2(m.verkoop.btwTotal - m.inkoop.voorbelasting);
    });

    finalizeTotals(result);
    return result;
}

function finalizeTotals(result) {
    result.omzet.totaal = round2(result.omzet.laag9 + result.omzet.hoog21 + result.omzet.nul0);
    result.omzet.laag9 = round2(result.omzet.laag9);
    result.omzet.hoog21 = round2(result.omzet.hoog21);
    result.omzet.nul0 = round2(result.omzet.nul0);

    result.btwAfgedragen.totaal = round2(result.btwAfgedragen.laag9 + result.btwAfgedragen.hoog21);
    result.btwAfgedragen.laag9 = round2(result.btwAfgedragen.laag9);
    result.btwAfgedragen.hoog21 = round2(result.btwAfgedragen.hoog21);

    result.kosten.totaal = round2(result.kosten.totaal);
    result.voorbelasting.totaal = round2(result.voorbelasting.totaal);

    const omzetEx = result.omzet.totaal;
    const btwVerkoop = result.btwAfgedragen.totaal;
    const inkoopEx = result.kosten.totaal;
    const btwInkoop = result.voorbelasting.totaal;

    result.totals = {
        omzetEx,
        btwVerkoop,
        inkoopEx,
        btwInkoop,
        btwBalans: round2(btwVerkoop - btwInkoop),
        winst: round2(omzetEx - inkoopEx),
        priveOnttrekkingenGeld: round2(omzetEx + btwVerkoop),
        priveStortingenNatura: round2(inkoopEx + btwInkoop)
    };
}
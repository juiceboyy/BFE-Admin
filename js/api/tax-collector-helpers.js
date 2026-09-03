/**
 * js/api/tax-collector-helpers.js
 * Hulpfuncties en tabblad-parsers voor tax-collector.
 */

export const FULL_MONTH_NAMES = [
    'Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni',
    'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December'
];

const MONTH_MATCHERS = [
    ['jan', '01'],
    ['feb', '02'],
    ['mrt', 'maart', 'mar', '03'],
    ['apr', '04'],
    ['mei', 'may', '05'],
    ['jun', '06'],
    ['jul', '07'],
    ['aug', '08'],
    ['sep', '09'],
    ['okt', 'oct', '10'],
    ['nov', '11'],
    ['dec', '12']
];

export function detectMonthIndex(title) {
    const lower = String(title || '').toLowerCase().trim();
    for (let i = 0; i < MONTH_MATCHERS.length; i++) {
        if (MONTH_MATCHERS[i].some(kw => lower.includes(kw))) return i;
    }
    return -1;
}

export const parseEuro = (val) => {
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    if (!val) return 0;
    const cleaned = String(val).replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.');
    return parseFloat(cleaned) || 0;
};

export const round2 = (num) => Math.round((Number(num) || 0) * 100) / 100;

export function processVerkoopRange(rangeData, rawTitle, result, mObj) {
    if (mObj) {
        mObj.verkoopSheet = rawTitle;
        mObj.verkoopFound = true;
    }

    const headers = rangeData.values[0].map(h => String(h || '').toLowerCase().trim());
    const getIdx = (keywords) => headers.findIndex(h => keywords.some(kw => h.includes(kw)));

    const idxBtwLaag = getIdx(['btw laag', 'btw 9', 'btw l']);
    const idxBtwHoog = getIdx(['btw hoog', 'btw 21', 'btw h']);
    const idxOmzetLaag = getIdx(['omzet laag', 'excl 9', 'vergoeding l', 'netto 9']);
    const idxOmzetHoog = getIdx(['omzet hoog', 'excl 21', 'vergoeding h', 'netto 21']);
    const idxOmzetNul = getIdx(['omzet nul', 'omzet 0', 'vergoeding 0', 'excl 0']);

    let sumL = 0, sumH = 0, sumN = 0, sumBtwL = 0, sumBtwH = 0, rowCount = 0;
    let totRowL = 0, totRowH = 0, totRowN = 0, totRowBtwL = 0, totRowBtwH = 0;
    let hasTotaalRow = false;

    for (let i = 1; i < rangeData.values.length; i++) {
        const row = rangeData.values[i];
        if (!row || row.length === 0) continue;

        const isTotalRow = row.slice(0, 5).some(cell => /^(?:totaal|totalen)(?:\s|$|:)/i.test(String(cell || '').trim()));
        if (isTotalRow) {
            totRowL = idxOmzetLaag !== -1 ? parseEuro(row[idxOmzetLaag]) : 0;
            totRowH = idxOmzetHoog !== -1 ? parseEuro(row[idxOmzetHoog]) : 0;
            totRowN = idxOmzetNul !== -1 ? parseEuro(row[idxOmzetNul]) : 0;
            totRowBtwL = idxBtwLaag !== -1 ? parseEuro(row[idxBtwLaag]) : 0;
            totRowBtwH = idxBtwHoog !== -1 ? parseEuro(row[idxBtwHoog]) : 0;
            hasTotaalRow = true;
            break; // Stop direct bij Totalen-rij conform CLAUDE.md regel 2
        }

        const omzetL = idxOmzetLaag !== -1 ? parseEuro(row[idxOmzetLaag]) : 0;
        const omzetH = idxOmzetHoog !== -1 ? parseEuro(row[idxOmzetHoog]) : 0;
        const omzetN = idxOmzetNul !== -1 ? parseEuro(row[idxOmzetNul]) : 0;
        const btwL = idxBtwLaag !== -1 ? parseEuro(row[idxBtwLaag]) : 0;
        const btwH = idxBtwHoog !== -1 ? parseEuro(row[idxBtwHoog]) : 0;

        if (omzetL !== 0 || omzetH !== 0 || omzetN !== 0 || btwL !== 0 || btwH !== 0) {
            rowCount++;
            sumL += omzetL;
            sumH += omzetH;
            sumN += omzetN;
            sumBtwL += btwL;
            sumBtwH += btwH;
        }
    }

    const calcSum = round2(sumL + sumH + sumN);
    const officialOmzetL = hasTotaalRow ? totRowL : sumL;
    const officialOmzetH = hasTotaalRow ? totRowH : sumH;
    const officialOmzetN = hasTotaalRow ? totRowN : sumN;
    const officialBtwL = hasTotaalRow ? totRowBtwL : sumBtwL;
    const officialBtwH = hasTotaalRow ? totRowBtwH : sumBtwH;

    const officialOmzetTotal = round2(officialOmzetL + officialOmzetH + officialOmzetN);
    const officialBtwTotal = round2(officialBtwL + officialBtwH);

    result.omzet.laag9 += officialOmzetL;
    result.omzet.hoog21 += officialOmzetH;
    result.omzet.nul0 += officialOmzetN;
    result.btwAfgedragen.laag9 += officialBtwL;
    result.btwAfgedragen.hoog21 += officialBtwH;

    if (mObj) {
        const diff = hasTotaalRow ? round2(officialOmzetTotal - calcSum) : 0;
        const hasDiscrepancy = hasTotaalRow && Math.abs(diff) > 0.05 && rowCount > 0;

        mObj.verkoop = {
            omzetEx: officialOmzetTotal,
            btwLaag9: officialBtwL,
            btwHoog21: officialBtwH,
            omzetNul0: officialOmzetN,
            btwTotal: officialBtwTotal,
            count: rowCount,
            hasTotaalRow,
            calculatedSum: calcSum,
            hasDiscrepancy,
            discrepancyDiff: diff
        };
    }
}

export function processInkoopRange(rangeData, rawTitle, result, mObj) {
    if (mObj) {
        mObj.inkoopSheet = rawTitle;
        mObj.inkoopFound = true;
    }

    const headers = rangeData.values[0].map(h => String(h || '').toLowerCase().trim());
    const getIdx = (keywords) => headers.findIndex(h => keywords.some(kw => h.includes(kw)));

    const idxLeverancier = getIdx(['leverancier', 'naam leverancier', 'klant']);
    const idxBtw = getIdx(['btw', 'voorbelasting']);
    const idxExcl = getIdx(['vergoeding', 'excl', 'factuurbedrag excl']);

    let sumKostenEx = 0, sumVoorbelasting = 0, rowCount = 0;
    let totKostenEx = 0, totVoorbelasting = 0;
    let hasTotaalRow = false;

    for (let i = 1; i < rangeData.values.length; i++) {
        const row = rangeData.values[i];
        if (!row || row.length === 0) continue;

        const isTotalRow = row.slice(0, 5).some(cell => /^(?:totaal|totalen)(?:\s|$|:)/i.test(String(cell || '').trim()));
        if (isTotalRow) {
            totVoorbelasting = idxBtw !== -1 ? parseEuro(row[idxBtw]) : 0;
            totKostenEx = idxExcl !== -1 ? parseEuro(row[idxExcl]) : 0;
            hasTotaalRow = true;
            break; // Stop direct bij Totalen-rij conform CLAUDE.md regel 2
        }

        const voorbelasting = idxBtw !== -1 ? parseEuro(row[idxBtw]) : 0;
        const kostenExcl = idxExcl !== -1 ? parseEuro(row[idxExcl]) : 0;

        if (voorbelasting !== 0 || kostenExcl !== 0 || (idxLeverancier !== -1 && row[idxLeverancier])) {
            rowCount++;
            sumKostenEx += kostenExcl;
            sumVoorbelasting += voorbelasting;

            const leverancier = idxLeverancier !== -1 && row[idxLeverancier] ? String(row[idxLeverancier]).trim() : 'Onbekend';
            result.kosten.perLeverancier[leverancier] = (result.kosten.perLeverancier[leverancier] || 0) + kostenExcl;
        }
    }

    const officialKostenEx = hasTotaalRow ? totKostenEx : sumKostenEx;
    const officialVoorbelasting = hasTotaalRow ? totVoorbelasting : sumVoorbelasting;

    result.kosten.totaal += officialKostenEx;
    result.voorbelasting.totaal += officialVoorbelasting;

    if (mObj) {
        const diffKosten = hasTotaalRow ? round2(totKostenEx - sumKostenEx) : 0;
        const diffBtw = hasTotaalRow ? round2(totVoorbelasting - sumVoorbelasting) : 0;
        const hasDiscrepancy = hasTotaalRow && (Math.abs(diffKosten) > 0.05 || Math.abs(diffBtw) > 0.05) && rowCount > 0;

        mObj.inkoop = {
            kostenEx: round2(officialKostenEx),
            voorbelasting: round2(officialVoorbelasting),
            count: rowCount,
            hasTotaalRow,
            calculatedKosten: round2(sumKostenEx),
            calculatedVoorbelasting: round2(sumVoorbelasting),
            hasDiscrepancy,
            discrepancyDiff: Math.abs(diffBtw) > 0.05 ? diffBtw : diffKosten
        };
    }
}

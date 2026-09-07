/**
 * js/utils/annual-report-resolver.js
 * Resolves en harmoniseert financiële gegevens voor het Jaarverslag.
 * Ondersteunt hiërarchie: Geüploade Aangifte IB > Live Sheet Data > Historische Referentiedata.
 */

import { BFE_COMPANY_INFO, HISTORICAL_ANNUAL_DATA, GOLDEN_INVENTARIS_2025, categorizeKosten } from './annual-report-data.js';
import { getRatesForYear } from './tax-calculator.js';

export function resolveAnnualReportModel(state = {}, calculatedData = {}) {
    const year = parseInt(state.year || new Date().getFullYear(), 10);
    const prevYear = year - 1;
    const prevData = HISTORICAL_ANNUAL_DATA[prevYear] || null;
    const currentHistData = HISTORICAL_ANNUAL_DATA[year] || null;

    // Check of er geüploade Aangifte IB data beschikbaar is voor dit boekjaar
    const rawAangifte = state.balans?.aangifteData || null;
    const aangifte = (rawAangifte && (String(rawAangifte.year) === String(year) || !rawAangifte.year))
        ? rawAangifte
        : null;

    const aangifteWinst = aangifte?.winst || aangifte?.winstberekening || null;
    const aangifteActiva = aangifte?.balans?.activa || null;
    const aangiftePassiva = aangifte?.balans?.passiva || null;

    // 1. Omzetverdeling
    const hasSheetOmzet = Boolean(state.sheetData?.omzet && state.sheetData.omzet.totaal > 0);
    let omzetMuziek9 = hasSheetOmzet ? (state.sheetData.omzet.laag9 || 0) : (currentHistData?.omzet?.muziek9 || 0);
    let omzetOnderwijs0 = hasSheetOmzet ? (state.sheetData.omzet.nul0 || 0) : (currentHistData?.omzet?.onderwijs0 || 0);
    let omzetOverig21 = hasSheetOmzet ? (state.sheetData.omzet.hoog21 || 0) : (currentHistData?.omzet?.overig21 || 0);
    let omzetTotaal = hasSheetOmzet
        ? (calculatedData.omzet || (omzetMuziek9 + omzetOnderwijs0 + omzetOverig21))
        : (currentHistData?.omzet?.totaal || (omzetMuziek9 + omzetOnderwijs0 + omzetOverig21));

    if (aangifte?.omzet) {
        if (aangifte.omzet.muziek9 !== undefined) omzetMuziek9 = Number(aangifte.omzet.muziek9);
        if (aangifte.omzet.onderwijs0 !== undefined) omzetOnderwijs0 = Number(aangifte.omzet.onderwijs0);
        if (aangifte.omzet.overig21 !== undefined) omzetOverig21 = Number(aangifte.omzet.overig21);
        if (aangifte.omzet.totaal !== undefined) omzetTotaal = Number(aangifte.omzet.totaal);
    }

    // 2. Kostenverdeling
    const hasSheetKosten = Boolean(state.sheetData?.kosten && state.sheetData.kosten.totaal > 0);
    const perLev = state.sheetData?.kosten?.perLeverancier || {};
    const categorized = categorizeKosten(perLev, calculatedData.kosten || 0);

    let uitbesteedWerk = hasSheetKosten && categorized.uitbesteedWerk > 0 ? categorized.uitbesteedWerk : (currentHistData?.kosten?.uitbesteedWerk || 0);
    let autokosten = hasSheetKosten && categorized.autokosten > 0 ? categorized.autokosten : (currentHistData?.kosten?.autokosten || 0);
    let huisvesting = hasSheetKosten && categorized.huisvesting > 0 ? categorized.huisvesting : (currentHistData?.kosten?.huisvesting || 0);
    let financieleLasten = hasSheetKosten && categorized.financieleLasten > 0 ? categorized.financieleLasten : (currentHistData?.kosten?.financieleLasten || 0);
    let andereKosten = hasSheetKosten && categorized.andereKosten > 0 ? categorized.andereKosten : (currentHistData?.kosten?.andereKosten || 0);

    if (aangifte?.kosten) {
        if (aangifte.kosten.uitbesteedWerk !== undefined) uitbesteedWerk = Number(aangifte.kosten.uitbesteedWerk);
        if (aangifte.kosten.autokosten !== undefined) autokosten = Number(aangifte.kosten.autokosten);
        if (aangifte.kosten.huisvesting !== undefined) huisvesting = Number(aangifte.kosten.huisvesting);
        if (aangifte.kosten.financieleLasten !== undefined) financieleLasten = Number(aangifte.kosten.financieleLasten);
        if (aangifte.kosten.andereKosten !== undefined) andereKosten = Number(aangifte.kosten.andereKosten);
    }

    // 3. Inventaris & Afschrijvingen
    let inventarisItems = [];
    let totaleAanschaf = 0;
    let totaleAfschrijving = 0;
    let totaleBoekwaarde = 0;

    if (calculatedData.afschrijvingenLog && calculatedData.afschrijvingenLog.length > 0) {
        const inventarisList = Array.isArray(state.inventaris) ? state.inventaris : [];
        inventarisItems = calculatedData.afschrijvingenLog.map(item => {
            const orig = inventarisList.find(i => i.id === item.id) || {};
            const aankoopBedrag = orig.aankoopBedrag || 0;
            totaleAanschaf += aankoopBedrag;
            return {
                id: item.id,
                omschrijving: item.omschrijving,
                aankoopJaar: orig.aankoopJaar || '-',
                aankoopBedrag,
                afschrijvingDitJaar: item.afschrijvingDitJaar || 0,
                boekwaardeEind: item.boekwaardeEind || 0
            };
        });
        totaleAfschrijving = calculatedData.totaleAfschrijving || 0;
        totaleBoekwaarde = inventarisItems.reduce((s, i) => s + (i.boekwaardeEind || 0), 0);
    }

    // Bug 2 fix: als inventarisItems leeg is en boekjaar is 2025, gebruik altijd de geregistreerde inventaris
    if (inventarisItems.length === 0 && (year === 2025 || !currentHistData)) {
        inventarisItems = GOLDEN_INVENTARIS_2025;
        totaleAanschaf = GOLDEN_INVENTARIS_2025.reduce((s, i) => s + i.aankoopBedrag, 0);
        totaleAfschrijving = 841;
        totaleBoekwaarde = 2390;
    } else if (inventarisItems.length === 0 && currentHistData?.balans?.activa?.inventaris) {
        totaleAfschrijving = currentHistData.kosten.afschrijving;
        totaleBoekwaarde = currentHistData.balans.activa.inventaris;
        totaleAanschaf = totaleBoekwaarde + totaleAfschrijving;
    }

    if (aangifte?.kosten?.afschrijving !== undefined) {
        totaleAfschrijving = Number(aangifte.kosten.afschrijving);
    }
    const aangifteMVA = aangifteActiva?.mva ?? aangifteActiva?.inventaris;
    if (aangifteMVA !== undefined) {
        totaleBoekwaarde = Number(aangifteMVA);
    }

    const kostenTotaal = aangifte?.kosten?.totaal !== undefined
        ? Number(aangifte.kosten.totaal)
        : (hasSheetKosten
            ? ((calculatedData.kosten || 0) + totaleAfschrijving)
            : (currentHistData?.kosten?.totaal || (uitbesteedWerk + autokosten + huisvesting + financieleLasten + andereKosten + totaleAfschrijving)));

    // 4. Winstberekening
    const saldo = aangifteWinst?.saldo !== undefined
        ? Number(aangifteWinst.saldo)
        : (omzetTotaal - kostenTotaal);

    const bijtelling = aangifteWinst?.bijtelling !== undefined
        ? Number(aangifteWinst.bijtelling)
        : ((state.auto && state.auto.zakelijkGebruik === false)
            ? 0
            : (calculatedData.bijtelling || currentHistData?.winstberekening?.bijtelling || 0));

    const fiscaleWinst = aangifteWinst?.fiscaleWinst !== undefined
        ? Number(aangifteWinst.fiscaleWinst)
        : ((hasSheetOmzet || hasSheetKosten)
            ? (saldo + bijtelling)
            : (currentHistData?.winstberekening?.fiscaleWinst ?? (saldo + bijtelling)));

    const rates = getRatesForYear(year);
    const ondernemersaftrek = aangifteWinst?.ondernemersaftrek !== undefined
        ? Number(aangifteWinst.ondernemersaftrek)
        : ((state.ondernemer?.urencriteriumGehaald !== false && fiscaleWinst > 0)
            ? (currentHistData?.winstberekening?.ondernemersaftrek ?? Math.min(rates.zelfstandigenaftrek, fiscaleWinst))
            : 0);

    const winstNaOndernemersaftrek = Math.max(0, fiscaleWinst - ondernemersaftrek);
    const mkbWinstvrijstellingBedrag = aangifteWinst?.mkbWinstvrijstellingBedrag !== undefined
        ? Number(aangifteWinst.mkbWinstvrijstellingBedrag)
        : (currentHistData?.winstberekening?.mkbWinstvrijstellingBedrag ?? Math.round(winstNaOndernemersaftrek * rates.mkbWinstvrijstelling));

    const belastbareWinst = aangifteWinst?.belastbareWinst !== undefined
        ? Number(aangifteWinst.belastbareWinst)
        : (currentHistData?.winstberekening?.belastbareWinst ?? (winstNaOndernemersaftrek - mkbWinstvrijstellingBedrag));

    // 5. Balans Activa
    const debiteuren = aangifteActiva?.debiteuren !== undefined
        ? Number(aangifteActiva.debiteuren)
        : (parseFloat(state.balans?.debiteuren) || currentHistData?.balans?.activa?.debiteuren || 0);

    const overlopendeActiva = aangifteActiva?.overlopend !== undefined
        ? Number(aangifteActiva.overlopend)
        : (parseFloat(state.balans?.overlopendeActiva) || currentHistData?.balans?.activa?.overlopend || 0);

    const borgMobility = year <= 2022 ? (currentHistData?.balans?.activa?.borgMobility || 0) : 0;

    const bankEind = aangifteActiva?.bank !== undefined
        ? Number(aangifteActiva.bank)
        : (parseFloat(state.bank?.eindSaldo) || currentHistData?.balans?.activa?.bank || 0);

    const totaalVorderingen = debiteuren + overlopendeActiva + borgMobility;
    const aangifteTotaalActiva = aangifteActiva?.totaalActiva ?? aangifteActiva?.totaal;
    const totaalActiva = aangifteTotaalActiva !== undefined
        ? Number(aangifteTotaalActiva)
        : (totaleBoekwaarde + totaalVorderingen + bankEind);

    // 6. Balans Passiva (Eigen vermogen is sluitstuk)
    const aangifteFOR = aangiftePassiva?.forStand ?? aangiftePassiva?.for;
    const forStand = aangifteFOR !== undefined
        ? Number(aangifteFOR)
        : (parseFloat(state.balans?.forStand ?? (currentHistData?.balans?.passiva?.for ?? BFE_COMPANY_INFO.forStandVast)) || 0);

    const btwSchuld = aangiftePassiva?.btwSchuld !== undefined
        ? Number(aangiftePassiva.btwSchuld)
        : (parseFloat(state.balans?.omzetbelastingSchuld || state.balans?.kortlopendeSchulden) || currentHistData?.balans?.passiva?.btwSchuld || 0);

    const overigeSchulden = aangiftePassiva?.overigeSchulden !== undefined
        ? Number(aangiftePassiva.overigeSchulden)
        : (parseFloat(state.balans?.overigeSchulden) || currentHistData?.balans?.passiva?.overigeSchulden || 0);

    const aangifteSchulden = aangiftePassiva?.totaalSchulden ?? (
        (aangiftePassiva?.btwSchuld !== undefined || aangiftePassiva?.overigeSchulden !== undefined)
            ? (Number(aangiftePassiva?.btwSchuld || 0) + Number(aangiftePassiva?.overigeSchulden || 0))
            : undefined
    );
    const totaalKortlopendeSchulden = aangifteSchulden !== undefined
        ? Number(aangifteSchulden)
        : (btwSchuld + overigeSchulden);

    const eigenVermogenEind = aangiftePassiva?.eigenVermogen !== undefined
        ? Number(aangiftePassiva.eigenVermogen)
        : (totaalActiva - forStand - totaalKortlopendeSchulden);

    const totaalOndernemingsvermogen = aangiftePassiva?.totaalVermogen !== undefined
        ? Number(aangiftePassiva.totaalVermogen)
        : (forStand + eigenVermogenEind);

    const aangifteTotaalPassiva = aangiftePassiva?.totaalPassiva ?? aangiftePassiva?.totaal;
    const totaalPassiva = aangifteTotaalPassiva !== undefined
        ? Number(aangifteTotaalPassiva)
        : (totaalOndernemingsvermogen + totaalKortlopendeSchulden);

    // 7. Kapitaalsvergelijking
    const vermogenBegin = aangifte?.kapitaal?.beginVermogen !== undefined
        ? Number(aangifte.kapitaal.beginVermogen)
        : (prevData?.balans?.passiva?.totaalVermogen ?? currentHistData?.kapitaal?.beginVermogen ?? (calculatedData.balans?.eigenVermogenBegin || 0));

    const pGeld = parseFloat(state.prive?.onttrekkingenInGeld) || 0;
    const pNatura = parseFloat(state.prive?.onttrekkingenInNatura) || 0;
    const pStortGeld = parseFloat(state.prive?.stortingenInGeld) || 0;
    const pStortNatura = parseFloat(state.prive?.stortingenInNatura) || 0;
    const hasUserPrive = Boolean(pGeld || pNatura || pStortGeld || pStortNatura);

    const totaleStortingen = aangifte?.kapitaal?.totaleStortingen !== undefined
        ? Number(aangifte.kapitaal.totaleStortingen)
        : (hasUserPrive ? (pStortGeld + pStortNatura) : (currentHistData?.kapitaal?.totaleStortingen || 0));

    const totaleOnttrekkingen = aangifte?.kapitaal?.totaleOnttrekkingen !== undefined
        ? Number(aangifte.kapitaal.totaleOnttrekkingen)
        : (hasUserPrive ? (pGeld + pNatura + Math.round(bijtelling)) : (currentHistData?.kapitaal?.totaleOnttrekkingen ?? Math.max(0, vermogenBegin - totaalOndernemingsvermogen + fiscaleWinst)));

    const vermogenEind = aangifte?.kapitaal?.eindVermogen !== undefined
        ? Number(aangifte.kapitaal.eindVermogen)
        : totaalOndernemingsvermogen;

    return {
        year,
        prevYear,
        prevData,
        currentHistData,
        aangifte,
        isSynchronized: Boolean(aangifte),
        forStand,
        activaData: {
            inventaris: totaleBoekwaarde,
            debiteuren,
            overlopend: overlopendeActiva,
            borgMobility,
            bank: bankEind,
            totaalVorderingen,
            totaalActiva
        },
        passivaData: {
            forStand,
            eigenVermogen: eigenVermogenEind,
            totaalVermogen: totaalOndernemingsvermogen,
            btwSchuld,
            overigeSchulden,
            totaalSchulden: totaalKortlopendeSchulden,
            totaalPassiva
        },
        omzetData: {
            muziek9: omzetMuziek9,
            onderwijs0: omzetOnderwijs0,
            overig21: omzetOverig21,
            totaal: omzetTotaal
        },
        kostenData: {
            uitbesteedWerk,
            afschrijving: totaleAfschrijving,
            autokosten,
            huisvesting,
            andereKosten,
            financieleLasten,
            totaal: kostenTotaal
        },
        winstData: {
            bijtelling,
            fiscaleWinst,
            ondernemersaftrek,
            mkbWinstvrijstellingBedrag,
            belastbareWinst
        },
        inventarisData: {
            items: inventarisItems,
            totaleAanschaf,
            totaleAfschrijving,
            totaleBoekwaarde
        },
        kapitaalData: {
            vermogenBegin,
            fiscaleWinst,
            totaleStortingen,
            totaleOnttrekkingen,
            vermogenEind
        }
    };
}

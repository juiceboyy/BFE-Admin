/**
 * js/ui/templates/annual-report-template.js
 * Hoofdtemplate voor het Jaarverslag van Big Fish Entertainment.
 */

import { BFE_COMPANY_INFO, HISTORICAL_ANNUAL_DATA, GOLDEN_INVENTARIS_2025, categorizeKosten } from '../../utils/annual-report-data.js';
import { getRatesForYear } from '../../utils/tax-calculator.js';
import { getBalansHTML } from './annual-report-balans.js';
import { getResultatenrekeningHTML, getToelichtingHTML } from './annual-report-sections.js';

export function getAnnualReportHTML(state, calculatedData) {
    const year = parseInt(state.year || new Date().getFullYear(), 10);
    const prevYear = year - 1;
    const prevData = HISTORICAL_ANNUAL_DATA[prevYear] || null;
    const currentHistData = HISTORICAL_ANNUAL_DATA[year] || null;

    // 1. Omzetverdeling
    const hasSheetOmzet = Boolean(state.sheetData?.omzet && state.sheetData.omzet.totaal > 0);
    const omzetMuziek9 = hasSheetOmzet ? (state.sheetData.omzet.laag9 || 0) : (currentHistData?.omzet?.muziek9 || 0);
    const omzetOnderwijs0 = hasSheetOmzet ? (state.sheetData.omzet.nul0 || 0) : (currentHistData?.omzet?.onderwijs0 || 0);
    const omzetOverig21 = hasSheetOmzet ? (state.sheetData.omzet.hoog21 || 0) : (currentHistData?.omzet?.overig21 || 0);
    const omzetTotaal = hasSheetOmzet
        ? (calculatedData.omzet || (omzetMuziek9 + omzetOnderwijs0 + omzetOverig21))
        : (currentHistData?.omzet?.totaal || (omzetMuziek9 + omzetOnderwijs0 + omzetOverig21));

    // 2. Kostenverdeling
    const hasSheetKosten = Boolean(state.sheetData?.kosten && state.sheetData.kosten.totaal > 0);
    const perLev = state.sheetData?.kosten?.perLeverancier || {};
    const categorized = categorizeKosten(perLev, calculatedData.kosten || 0);

    const uitbesteedWerk = hasSheetKosten && categorized.uitbesteedWerk > 0 ? categorized.uitbesteedWerk : (currentHistData?.kosten?.uitbesteedWerk || 0);
    const autokosten = hasSheetKosten && categorized.autokosten > 0 ? categorized.autokosten : (currentHistData?.kosten?.autokosten || 0);
    const huisvesting = hasSheetKosten && categorized.huisvesting > 0 ? categorized.huisvesting : (currentHistData?.kosten?.huisvesting || 0);
    const financieleLasten = hasSheetKosten && categorized.financieleLasten > 0 ? categorized.financieleLasten : (currentHistData?.kosten?.financieleLasten || 0);
    const andereKosten = hasSheetKosten && categorized.andereKosten > 0 ? categorized.andereKosten : (currentHistData?.kosten?.andereKosten || 0);

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
    } else if (year === 2025) {
        inventarisItems = GOLDEN_INVENTARIS_2025;
        totaleAanschaf = GOLDEN_INVENTARIS_2025.reduce((s, i) => s + i.aankoopBedrag, 0);
        totaleAfschrijving = 841;
        totaleBoekwaarde = 1289;
    } else if (currentHistData?.balans?.activa?.inventaris) {
        totaleAfschrijving = currentHistData.kosten.afschrijving;
        totaleBoekwaarde = currentHistData.balans.activa.inventaris;
        totaleAanschaf = totaleBoekwaarde + totaleAfschrijving;
    }

    const kostenTotaal = hasSheetKosten
        ? ((calculatedData.kosten || 0) + totaleAfschrijving)
        : (currentHistData?.kosten?.totaal || (uitbesteedWerk + autokosten + huisvesting + financieleLasten + andereKosten + totaleAfschrijving));

    // 4. Winstberekening
    const saldo = omzetTotaal - kostenTotaal;
    const bijtelling = (state.auto && state.auto.zakelijkGebruik === false)
        ? 0
        : (calculatedData.bijtelling || currentHistData?.winstberekening?.bijtelling || 0);

    const fiscaleWinst = (hasSheetOmzet || hasSheetKosten)
        ? (saldo + bijtelling)
        : (currentHistData?.winstberekening?.fiscaleWinst ?? (saldo + bijtelling));

    const rates = getRatesForYear(year);
    const ondernemersaftrek = (state.ondernemer?.urencriteriumGehaald !== false && fiscaleWinst > 0)
        ? (currentHistData?.winstberekening?.ondernemersaftrek ?? Math.min(rates.zelfstandigenaftrek, fiscaleWinst))
        : 0;
    const winstNaOndernemersaftrek = Math.max(0, fiscaleWinst - ondernemersaftrek);
    const mkbWinstvrijstellingBedrag = currentHistData?.winstberekening?.mkbWinstvrijstellingBedrag
        ?? Math.round(winstNaOndernemersaftrek * rates.mkbWinstvrijstelling);
    const belastbareWinst = currentHistData?.winstberekening?.belastbareWinst
        ?? (winstNaOndernemersaftrek - mkbWinstvrijstellingBedrag);

    // 5. Balans Activa
    const debiteuren = parseFloat(state.balans?.debiteuren) || currentHistData?.balans?.activa?.debiteuren || 0;
    const overlopendeActiva = parseFloat(state.balans?.overlopendeActiva) || currentHistData?.balans?.activa?.overlopend || 0;
    const borgMobility = year <= 2022 ? (currentHistData?.balans?.activa?.borgMobility || 0) : 0;
    const bankEind = parseFloat(state.bank?.eindSaldo) || currentHistData?.balans?.activa?.bank || 0;
    const totaalVorderingen = debiteuren + overlopendeActiva + borgMobility;
    const totaalActiva = totaleBoekwaarde + totaalVorderingen + bankEind;

    // 6. Balans Passiva (Boekhoudregel 2: Eigen vermogen is het sluitstuk)
    const forStand = parseFloat(state.balans?.forStand ?? (currentHistData?.balans?.passiva?.for ?? BFE_COMPANY_INFO.forStandVast)) || 0;
    const btwSchuld = parseFloat(state.balans?.omzetbelastingSchuld || state.balans?.kortlopendeSchulden) || currentHistData?.balans?.passiva?.btwSchuld || 0;
    const overigeSchulden = parseFloat(state.balans?.overigeSchulden) || currentHistData?.balans?.passiva?.overigeSchulden || 0;
    const totaalKortlopendeSchulden = btwSchuld + overigeSchulden;

    const eigenVermogenEind = totaalActiva - forStand - totaalKortlopendeSchulden;
    const totaalOndernemingsvermogen = forStand + eigenVermogenEind;
    const totaalPassiva = totaalOndernemingsvermogen + totaalKortlopendeSchulden;

    // 7. Kapitaalsvergelijking (Boekhoudregel 3: aansluiting vermogensmutatie op fiscale winst)
    const vermogenBegin = prevData?.balans?.passiva?.totaalVermogen
        ?? currentHistData?.kapitaal?.beginVermogen
        ?? (calculatedData.balans?.eigenVermogenBegin || 0);

    const hasUserPrive = Boolean(
        parseFloat(state.prive?.onttrekkingenInGeld) ||
        parseFloat(state.prive?.onttrekkingenInNatura) ||
        parseFloat(state.prive?.stortingenInGeld) ||
        parseFloat(state.prive?.stortingenInNatura)
    );

    const totaleStortingen = hasUserPrive
        ? (parseFloat(state.prive?.stortingenInGeld || 0) + parseFloat(state.prive?.stortingenInNatura || 0))
        : (currentHistData?.kapitaal?.totaleStortingen || 0);

    const totaleOnttrekkingen = hasUserPrive
        ? (parseFloat(state.prive?.onttrekkingenInGeld || 0) + parseFloat(state.prive?.onttrekkingenInNatura || 0) + Math.round(bijtelling))
        : (currentHistData?.kapitaal?.totaleOnttrekkingen ?? (Math.max(0, vermogenBegin - totaalOndernemingsvermogen + fiscaleWinst)));

    const vermogenEind = totaalOndernemingsvermogen;

    const activaData = {
        inventaris: totaleBoekwaarde,
        debiteuren,
        overlopend: overlopendeActiva,
        borgMobility,
        bank: bankEind,
        totaalVorderingen,
        totaalActiva
    };

    const passivaData = {
        forStand,
        eigenVermogen: eigenVermogenEind,
        totaalVermogen: totaalOndernemingsvermogen,
        btwSchuld,
        overigeSchulden,
        totaalSchulden: totaalKortlopendeSchulden,
        totaalPassiva
    };

    const omzetData = {
        muziek9: omzetMuziek9,
        onderwijs0: omzetOnderwijs0,
        overig21: omzetOverig21,
        totaal: omzetTotaal
    };

    const kostenData = {
        uitbesteedWerk,
        afschrijving: totaleAfschrijving,
        autokosten,
        huisvesting,
        andereKosten,
        financieleLasten,
        totaal: kostenTotaal
    };

    const winstData = {
        bijtelling,
        fiscaleWinst,
        ondernemersaftrek,
        mkbWinstvrijstellingBedrag,
        belastbareWinst
    };

    const inventarisData = {
        items: inventarisItems,
        totaleAanschaf,
        totaleAfschrijving,
        totaleBoekwaarde
    };

    const kapitaalData = {
        vermogenBegin,
        fiscaleWinst,
        totaleStortingen,
        totaleOnttrekkingen,
        vermogenEind
    };

    return `
        <div class="max-w-4xl mx-auto pb-16">
            <!-- Bovenbalk met actieknoppen (onzichtbaar bij print) -->
            <div class="no-print flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8 bg-white p-4 rounded-2xl border border-gray-100 shadow-xs">
                <div class="flex items-center gap-3">
                    <label class="text-xs font-semibold uppercase text-gray-500 tracking-wider">Boekjaar:</label>
                    <select id="report-year-select" class="bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 text-sm font-medium outline-none focus:ring-2 focus:ring-black">
                        <option value="2026" ${year === 2026 ? 'selected' : ''}>2026</option>
                        <option value="2025" ${year === 2025 ? 'selected' : ''}>2025</option>
                        <option value="2024" ${year === 2024 ? 'selected' : ''}>2024</option>
                        <option value="2023" ${year === 2023 ? 'selected' : ''}>2023</option>
                    </select>
                </div>
                <div class="flex items-center gap-2.5">
                    <button id="btn-goto-intake" class="px-4 py-2 border border-gray-200 rounded-xl text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-1.5 shadow-2xs">
                        <i data-lucide="edit-3" class="w-3.5 h-3.5"></i> Gegevens Aanvullen in Intake
                    </button>
                    <button id="btn-print-report" class="px-5 py-2 bg-black text-white rounded-xl text-xs font-medium hover:bg-gray-800 transition-colors flex items-center gap-1.5 shadow-xs">
                        <i data-lucide="printer" class="w-3.5 h-3.5"></i> Dossier Afdrukken / Opslaan als PDF
                    </button>
                </div>
            </div>

            <!-- Printbaar Dossier -->
            <article id="annual-report-dossier" class="bg-white rounded-2xl border border-gray-200 p-8 sm:p-12 shadow-sm print:border-none print:shadow-none print:p-0">
                
                <!-- 1. Algemene Informatie / Colofon -->
                <header class="border-b border-gray-200 pb-8 mb-10">
                    <div class="flex justify-between items-start">
                        <div>
                            <span class="text-xs font-semibold uppercase tracking-widest text-gray-400">Financieel Jaarverslag</span>
                            <h1 class="text-3xl font-bold text-gray-950 mt-1 tracking-tight">Jaarrekening ${year}</h1>
                            <p class="text-base text-gray-600 mt-1 font-medium">${BFE_COMPANY_INFO.tradeName} – ${BFE_COMPANY_INFO.legalName}</p>
                        </div>
                        <div class="text-right text-xs text-gray-500 leading-relaxed font-mono">
                            <p class="font-semibold text-gray-800">${BFE_COMPANY_INFO.tradeName}</p>
                            <p>KvK: ${BFE_COMPANY_INFO.kvk}</p>
                            <p>BTW: ${BFE_COMPANY_INFO.btwId}</p>
                            <p>BSN: ${BFE_COMPANY_INFO.bsn}</p>
                            <p>${BFE_COMPANY_INFO.address}, ${BFE_COMPANY_INFO.postalCodeCity}</p>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 pt-6 border-t border-gray-100 text-xs">
                        <div><span class="text-gray-400 block">Onderneming:</span> <strong class="text-gray-900">${BFE_COMPANY_INFO.tradeName}</strong></div>
                        <div><span class="text-gray-400 block">Burgerservicenummer:</span> <strong class="text-gray-900">${BFE_COMPANY_INFO.bsn}</strong></div>
                        <div><span class="text-gray-400 block">Boekjaar:</span> <strong class="text-gray-900">01/01/${year} t/m 31/12/${year}</strong></div>
                    </div>
                </header>

                ${getBalansHTML(year, prevYear, prevData, activaData, passivaData)}

                <div class="page-break"></div>

                ${getResultatenrekeningHTML(year, prevYear, prevData, omzetData, kostenData, winstData)}

                <div class="page-break"></div>

                ${getToelichtingHTML(year, inventarisData, kapitaalData, forStand)}

                <!-- 4. Slotverklaring & Ondertekening -->
                <footer class="report-section border-t border-gray-300 pt-8 mt-12 text-xs text-gray-600">
                    <p class="italic mb-6">
                        Deze jaarrekening is een getrouwe weergave van de financiële positie van de onderneming per 31 december ${year}, in overeenstemming met de ingediende belastingaangifte.
                    </p>
                    <div class="flex justify-between items-end pt-4">
                        <div>
                            <p class="font-semibold text-gray-900">${BFE_COMPANY_INFO.tradeName}</p>
                            <p>${BFE_COMPANY_INFO.legalName}</p>
                            <p class="text-gray-400 mt-1">Zoetermeer, ${new Date().toLocaleDateString('nl-NL')}</p>
                        </div>
                        <div class="text-right">
                            <div class="w-48 border-b border-gray-400 mb-1"></div>
                            <span class="text-[10px] text-gray-400">Handtekening ondernemer</span>
                        </div>
                    </div>
                </footer>

            </article>
        </div>
    `;
}

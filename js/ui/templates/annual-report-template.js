/**
 * js/ui/templates/annual-report-template.js
 * Redactionele HTML-template voor het officiële Jaarverslag van Big Fish Entertainment.
 * Vormgegeven volgens de standaarden van Ster Boekhouding en de Jaarrekening 2024.
 */

import { BFE_COMPANY_INFO, HISTORICAL_ANNUAL_DATA, categorizeKosten } from '../../utils/annual-report-data.js';

const formatEur = (num) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(num || 0);
const formatEurInt = (num) => {
    if (num === null || num === undefined || isNaN(num)) return '€ 0';
    return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Math.round(num));
};

export function getAnnualReportHTML(state, calculatedData) {
    const year = parseInt(state.year || new Date().getFullYear(), 10);
    const prevYear = year - 1;
    const prevData = HISTORICAL_ANNUAL_DATA[prevYear] || null;

    // Omzetverdeling
    const omzetMuziek9 = state.sheetData?.omzet?.laag9 || 0;
    const omzetOnderwijs0 = state.sheetData?.omzet?.nul0 || 0;
    const omzetOverig21 = state.sheetData?.omzet?.hoog21 || 0;
    const omzetTotaal = calculatedData.omzet || (omzetMuziek9 + omzetOnderwijs0 + omzetOverig21);

    // Kostenverdeling
    const perLev = state.sheetData?.kosten?.perLeverancier || {};
    const categorized = categorizeKosten(perLev, calculatedData.kosten || 0);

    // Balans Activa
    const boekwaardeInventarisEind = calculatedData.afschrijvingenLog?.reduce((s, i) => s + (i.boekwaardeEind || 0), 0) || 0;
    const debiteuren = parseFloat(state.balans?.debiteuren) || 0;
    const overlopendeActiva = parseFloat(state.balans?.overlopendeActiva) || 0;
    const borgMobility = BFE_COMPANY_INFO.borgMobilityService;
    const bankEind = parseFloat(state.bank?.eindSaldo) || 0;
    const totaalVorderingen = debiteuren + overlopendeActiva + borgMobility;
    const totaalActiva = boekwaardeInventarisEind + totaalVorderingen + bankEind;

    // Balans Passiva
    const forStand = parseFloat(state.balans?.forStand ?? BFE_COMPANY_INFO.forStandVast) || 0;
    const eigenVermogenEind = calculatedData.balans?.eigenVermogenEind || 0;
    const totaalOndernemingsvermogen = forStand + eigenVermogenEind;
    const btwSchuld = parseFloat(state.balans?.omzetbelastingSchuld || state.balans?.kortlopendeSchulden) || 0;
    const overigeSchulden = parseFloat(state.balans?.overigeSchulden) || 0;
    const totaalKortlopendeSchulden = btwSchuld + overigeSchulden;
    const totaalPassiva = totaalOndernemingsvermogen + totaalKortlopendeSchulden;

    const diffBalans = Math.round((totaalActiva - totaalPassiva) * 100) / 100;

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

                <!-- 2. Balans -->
                <section class="report-section mb-12">
                    <h2 class="text-xl font-bold text-gray-900 mb-2">1. Balans per 31 december ${year}</h2>
                    <p class="text-xs text-gray-500 mb-6">${prevData ? `Inclusief vergelijkende cijfers over boekjaar ${prevYear}` : `Boekjaar ${year}`}</p>

                    <!-- Activa -->
                    <div class="mb-6">
                        <table class="w-full text-xs border-collapse font-sans">
                            <thead>
                                <tr class="border-b border-gray-900 text-left font-bold text-gray-900">
                                    <th class="py-2">Activa</th>
                                    <th class="py-2 text-right w-32">31-12-${year}</th>
                                    ${prevData ? `<th class="py-2 text-right w-32 text-gray-500">31-12-${prevYear}</th>` : ''}
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-100">
                                <tr class="font-semibold text-gray-700 bg-gray-50/50"><td colspan="${prevData ? 3 : 2}" class="py-1.5">Materiële vaste activa</td></tr>
                                <tr>
                                    <td class="py-1.5 pl-4 text-gray-600">Inventaris (apparatuur &amp; instrumenten)</td>
                                    <td class="py-1.5 text-right font-medium">${formatEurInt(boekwaardeInventarisEind)}</td>
                                    ${prevData ? `<td class="py-1.5 text-right text-gray-500 font-mono">${formatEurInt(prevData.balans.activa.inventaris)}</td>` : ''}
                                </tr>
                                <tr class="border-t border-gray-200 font-medium">
                                    <td class="py-1.5 pl-4">Totaal materiële vaste activa</td>
                                    <td class="py-1.5 text-right font-bold">${formatEurInt(boekwaardeInventarisEind)}</td>
                                    ${prevData ? `<td class="py-1.5 text-right text-gray-500 font-mono">${formatEurInt(prevData.balans.activa.inventaris)}</td>` : ''}
                                </tr>

                                <tr class="font-semibold text-gray-700 bg-gray-50/50"><td colspan="${prevData ? 3 : 2}" class="py-1.5">Vorderingen en overlopende activa</td></tr>
                                <tr>
                                    <td class="py-1.5 pl-4 text-gray-600">Vorderingen op handelsdebiteuren</td>
                                    <td class="py-1.5 text-right font-medium">${formatEurInt(debiteuren)}</td>
                                    ${prevData ? `<td class="py-1.5 text-right text-gray-500 font-mono">${formatEurInt(prevData.balans.activa.debiteuren)}</td>` : ''}
                                </tr>
                                <tr>
                                    <td class="py-1.5 pl-4 text-gray-600">Overlopende activa</td>
                                    <td class="py-1.5 text-right font-medium">${formatEurInt(overlopendeActiva)}</td>
                                    ${prevData ? `<td class="py-1.5 text-right text-gray-500 font-mono">${formatEurInt(prevData.balans.activa.overlopend)}</td>` : ''}
                                </tr>
                                <tr>
                                    <td class="py-1.5 pl-4 text-gray-600">Overige vorderingen (Borg Mobility Service)</td>
                                    <td class="py-1.5 text-right font-medium">${formatEurInt(borgMobility)}</td>
                                    ${prevData ? `<td class="py-1.5 text-right text-gray-500 font-mono">${formatEurInt(prevData.balans.activa.borgMobility)}</td>` : ''}
                                </tr>
                                <tr class="border-t border-gray-200 font-medium">
                                    <td class="py-1.5 pl-4">Totaal vorderingen</td>
                                    <td class="py-1.5 text-right font-bold">${formatEurInt(totaalVorderingen)}</td>
                                    ${prevData ? `<td class="py-1.5 text-right text-gray-500 font-mono">${formatEurInt(prevData.balans.activa.debiteuren + prevData.balans.activa.overlopend + prevData.balans.activa.borgMobility)}</td>` : ''}
                                </tr>

                                <tr class="font-semibold text-gray-700 bg-gray-50/50"><td colspan="${prevData ? 3 : 2}" class="py-1.5">Effecten en liquide middelen</td></tr>
                                <tr>
                                    <td class="py-1.5 pl-4 text-gray-600">Banktegoeden (zakelijke ING rekening)</td>
                                    <td class="py-1.5 text-right font-medium">${formatEurInt(bankEind)}</td>
                                    ${prevData ? `<td class="py-1.5 text-right text-gray-500 font-mono">${formatEurInt(prevData.balans.activa.bank)}</td>` : ''}
                                </tr>

                                <tr class="border-t-2 border-b-2 border-gray-900 font-bold text-gray-900">
                                    <td class="py-2.5">Totaal activa</td>
                                    <td class="py-2.5 text-right font-bold text-sm">${formatEurInt(totaalActiva)}</td>
                                    ${prevData ? `<td class="py-2.5 text-right text-gray-500 font-mono text-sm">${formatEurInt(prevData.balans.activa.totaal)}</td>` : ''}
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <!-- Passiva -->
                    <div>
                        <table class="w-full text-xs border-collapse font-sans">
                            <thead>
                                <tr class="border-b border-gray-900 text-left font-bold text-gray-900">
                                    <th class="py-2">Passiva</th>
                                    <th class="py-2 text-right w-32">31-12-${year}</th>
                                    ${prevData ? `<th class="py-2 text-right w-32 text-gray-500">31-12-${prevYear}</th>` : ''}
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-100">
                                <tr class="font-semibold text-gray-700 bg-gray-50/50"><td colspan="${prevData ? 3 : 2}" class="py-1.5">Ondernemingsvermogen</td></tr>
                                <tr>
                                    <td class="py-1.5 pl-4 text-gray-600">Fiscale oudedagsreserve (FOR)</td>
                                    <td class="py-1.5 text-right font-medium">${formatEurInt(forStand)}</td>
                                    ${prevData ? `<td class="py-1.5 text-right text-gray-500 font-mono">${formatEurInt(prevData.balans.passiva.for)}</td>` : ''}
                                </tr>
                                <tr>
                                    <td class="py-1.5 pl-4 text-gray-600">Eigen vermogen</td>
                                    <td class="py-1.5 text-right font-medium">${formatEurInt(eigenVermogenEind)}</td>
                                    ${prevData ? `<td class="py-1.5 text-right text-gray-500 font-mono">${formatEurInt(prevData.balans.passiva.eigenVermogen)}</td>` : ''}
                                </tr>
                                <tr class="border-t border-gray-200 font-medium">
                                    <td class="py-1.5 pl-4">Totaal ondernemingsvermogen</td>
                                    <td class="py-1.5 text-right font-bold">${formatEurInt(totaalOndernemingsvermogen)}</td>
                                    ${prevData ? `<td class="py-1.5 text-right text-gray-500 font-mono">${formatEurInt(prevData.balans.passiva.totaalVermogen)}</td>` : ''}
                                </tr>

                                <tr class="font-semibold text-gray-700 bg-gray-50/50"><td colspan="${prevData ? 3 : 2}" class="py-1.5">Kortlopende schulden</td></tr>
                                <tr>
                                    <td class="py-1.5 pl-4 text-gray-600">Verschuldigde omzetbelasting (schuld)</td>
                                    <td class="py-1.5 text-right font-medium">${formatEurInt(btwSchuld)}</td>
                                    ${prevData ? `<td class="py-1.5 text-right text-gray-500 font-mono">${formatEurInt(prevData.balans.passiva.btwSchuld)}</td>` : ''}
                                </tr>
                                <tr>
                                    <td class="py-1.5 pl-4 text-gray-600">Overige schulden / overlopende passiva</td>
                                    <td class="py-1.5 text-right font-medium">${formatEurInt(overigeSchulden)}</td>
                                    ${prevData ? `<td class="py-1.5 text-right text-gray-500 font-mono">${formatEurInt(prevData.balans.passiva.overigeSchulden)}</td>` : ''}
                                </tr>
                                <tr class="border-t border-gray-200 font-medium">
                                    <td class="py-1.5 pl-4">Totaal kortlopende schulden</td>
                                    <td class="py-1.5 text-right font-bold">${formatEurInt(totaalKortlopendeSchulden)}</td>
                                    ${prevData ? `<td class="py-1.5 text-right text-gray-500 font-mono">${formatEurInt(prevData.balans.passiva.btwSchuld + prevData.balans.passiva.overigeSchulden)}</td>` : ''}
                                </tr>

                                <tr class="border-t-2 border-b-2 border-gray-900 font-bold text-gray-900">
                                    <td class="py-2.5">Totaal passiva</td>
                                    <td class="py-2.5 text-right font-bold text-sm">${formatEurInt(totaalPassiva)}</td>
                                    ${prevData ? `<td class="py-2.5 text-right text-gray-500 font-mono text-sm">${formatEurInt(prevData.balans.passiva.totaal)}</td>` : ''}
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </section>

                <div class="page-break"></div>

                <!-- 3. Resultatenrekening -->
                <section class="report-section mb-12">
                    <h2 class="text-xl font-bold text-gray-900 mb-2">2. Resultatenrekening over ${year}</h2>
                    <p class="text-xs text-gray-500 mb-6">${prevData ? `Inclusief vergelijking met boekjaar ${prevYear}` : `Boekjaar ${year}`}</p>

                    <table class="w-full text-xs border-collapse font-sans mb-6">
                        <thead>
                            <tr class="border-b border-gray-900 text-left font-bold text-gray-900">
                                <th class="py-2">Omschrijving</th>
                                <th class="py-2 text-right w-32">${year}</th>
                                ${prevData ? `<th class="py-2 text-right w-32 text-gray-500">${prevYear}</th>` : ''}
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-100">
                            <tr class="font-semibold text-gray-700 bg-gray-50/50"><td colspan="${prevData ? 3 : 2}" class="py-1.5">Netto-omzet</td></tr>
                            <tr>
                                <td class="py-1.5 pl-4 text-gray-600">Omzet muziek / optredens (9% btw)</td>
                                <td class="py-1.5 text-right font-medium">${formatEurInt(omzetMuziek9)}</td>
                                ${prevData ? `<td class="py-1.5 text-right text-gray-500 font-mono">${formatEurInt(prevData.omzet.muziek9)}</td>` : ''}
                            </tr>
                            <tr>
                                <td class="py-1.5 pl-4 text-gray-600">Omzet onderwijs / muzieklessen (0% btw / vrijgesteld)</td>
                                <td class="py-1.5 text-right font-medium">${formatEurInt(omzetOnderwijs0)}</td>
                                ${prevData ? `<td class="py-1.5 text-right text-gray-500 font-mono">${formatEurInt(prevData.omzet.onderwijs0)}</td>` : ''}
                            </tr>
                            <tr>
                                <td class="py-1.5 pl-4 text-gray-600">Overige opbrengsten &amp; rechten</td>
                                <td class="py-1.5 text-right font-medium">${formatEurInt(omzetOverig21)}</td>
                                ${prevData ? `<td class="py-1.5 text-right text-gray-500 font-mono">${formatEurInt(prevData.omzet.overig21)}</td>` : ''}
                            </tr>
                            <tr class="border-t border-gray-300 font-bold bg-gray-50/30">
                                <td class="py-2">Som van de bedrijfsopbrengsten</td>
                                <td class="py-2 text-right text-sm">${formatEurInt(omzetTotaal)}</td>
                                ${prevData ? `<td class="py-2 text-right text-gray-500 font-mono text-sm">${formatEurInt(prevData.omzet.totaal)}</td>` : ''}
                            </tr>

                            <tr class="font-semibold text-gray-700 bg-gray-50/50"><td colspan="${prevData ? 3 : 2}" class="py-1.5">Bedrijfskosten</td></tr>
                            <tr>
                                <td class="py-1.5 pl-4 text-gray-600">Kosten uitbesteed werk en externe kosten</td>
                                <td class="py-1.5 text-right font-medium">${formatEurInt(categorized.uitbesteedWerk)}</td>
                                ${prevData ? `<td class="py-1.5 text-right text-gray-500 font-mono">${formatEurInt(prevData.kosten.uitbesteedWerk)}</td>` : ''}
                            </tr>
                            <tr>
                                <td class="py-1.5 pl-4 text-gray-600">Afschrijving inventaris</td>
                                <td class="py-1.5 text-right font-medium">${formatEurInt(calculatedData.totaleAfschrijving)}</td>
                                ${prevData ? `<td class="py-1.5 text-right text-gray-500 font-mono">${formatEurInt(prevData.kosten.afschrijving)}</td>` : ''}
                            </tr>
                            <tr>
                                <td class="py-1.5 pl-4 text-gray-600">Autokosten en transportkosten</td>
                                <td class="py-1.5 text-right font-medium">${formatEurInt(categorized.autokosten)}</td>
                                ${prevData ? `<td class="py-1.5 text-right text-gray-500 font-mono">${formatEurInt(prevData.kosten.autokosten)}</td>` : ''}
                            </tr>
                            <tr>
                                <td class="py-1.5 pl-4 text-gray-600">Huisvestingskosten (studiohuur)</td>
                                <td class="py-1.5 text-right font-medium">${formatEurInt(categorized.huisvesting)}</td>
                                ${prevData ? `<td class="py-1.5 text-right text-gray-500 font-mono">${formatEurInt(prevData.kosten.huisvesting)}</td>` : ''}
                            </tr>
                            <tr>
                                <td class="py-1.5 pl-4 text-gray-600">Andere bedrijfskosten (administratie, software, klein materiaal)</td>
                                <td class="py-1.5 text-right font-medium">${formatEurInt(categorized.andereKosten)}</td>
                                ${prevData ? `<td class="py-1.5 text-right text-gray-500 font-mono">${formatEurInt(prevData.kosten.andereKosten)}</td>` : ''}
                            </tr>
                            <tr class="border-t border-gray-300 font-bold bg-gray-50/30">
                                <td class="py-2">Totale bedrijfskosten</td>
                                <td class="py-2 text-right text-sm">${formatEurInt((calculatedData.kosten || 0) + calculatedData.totaleAfschrijving)}</td>
                                ${prevData ? `<td class="py-2 text-right text-gray-500 font-mono text-sm">${formatEurInt(prevData.kosten.totaal)}</td>` : ''}
                            </tr>
                        </tbody>
                    </table>

                    <!-- 4. Winstberekening -->
                    <div class="mt-8 border border-gray-200 rounded-xl p-5 bg-gray-50/30">
                        <h3 class="text-sm font-bold text-gray-900 mb-3">Winstberekening</h3>
                        <div class="space-y-2 text-xs">
                            <div class="flex justify-between"><span>Opbrengsten</span><span class="font-medium">${formatEur(omzetTotaal)}</span></div>
                            <div class="flex justify-between text-rose-600"><span>Kosten (incl. afschrijvingen)</span><span>- ${formatEur((calculatedData.kosten || 0) + calculatedData.totaleAfschrijving)}</span></div>
                            <div class="flex justify-between font-bold border-t border-gray-200 pt-1.5">
                                <span>Saldo winstberekening</span>
                                <span>${formatEur(omzetTotaal - ((calculatedData.kosten || 0) + calculatedData.totaleAfschrijving))}</span>
                            </div>
                            <div class="flex justify-between text-emerald-700">
                                <span>Fiscale bijtelling auto van de zaak</span>
                                <span>+ ${formatEur(calculatedData.bijtelling)}</span>
                            </div>
                            <div class="flex justify-between font-bold text-sm border-t-2 border-gray-900 pt-2 text-gray-950">
                                <span>Fiscale winst uit onderneming</span>
                                <span>${formatEur(calculatedData.fiscaleWinst)}</span>
                            </div>
                            ${calculatedData.ondernemersaftrek > 0 ? `<div class="flex justify-between text-gray-600 pt-1"><span>Zelfstandigenaftrek</span><span>- ${formatEur(calculatedData.ondernemersaftrek)}</span></div>` : ''}
                            ${calculatedData.mkbWinstvrijstellingBedrag > 0 ? `<div class="flex justify-between text-gray-600"><span>MKB-winstvrijstelling</span><span>- ${formatEur(calculatedData.mkbWinstvrijstellingBedrag)}</span></div>` : ''}
                            <div class="flex justify-between font-bold text-sm border-t border-dashed border-gray-300 pt-2 text-emerald-800">
                                <span>Belastbare winst (Box 1)</span>
                                <span>${formatEur(calculatedData.belastbareWinst)}</span>
                            </div>
                        </div>
                    </div>
                </section>

                <div class="page-break"></div>

                <!-- 5. Toelichting op de Balans & Materiële Vaste Activa -->
                <section class="report-section mb-12">
                    <h2 class="text-xl font-bold text-gray-900 mb-2">3. Toelichting op de balans</h2>

                    <!-- Afschrijvingsstaat inventaris -->
                    <div class="mb-8">
                        <h3 class="text-sm font-bold text-gray-800 mb-3">Materiële vaste activa: Inventaris</h3>
                        <table class="w-full text-xs border-collapse">
                            <thead>
                                <tr class="border-b border-gray-300 text-left text-gray-500 font-semibold">
                                    <th class="py-2">Omschrijving</th>
                                    <th class="py-2 text-center w-20">Aankoop</th>
                                    <th class="py-2 text-right w-24">Aanschaf</th>
                                    <th class="py-2 text-right w-24">Afschrijving ${year}</th>
                                    <th class="py-2 text-right w-24">Boekwaarde 31-12</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-100">
                                ${(calculatedData.afschrijvingenLog && calculatedData.afschrijvingenLog.length > 0)
                                    ? calculatedData.afschrijvingenLog.map(item => {
                                        const orig = state.inventaris.find(i => i.id === item.id) || {};
                                        return `
                                            <tr>
                                                <td class="py-1.5 font-medium text-gray-800">${item.omschrijving}</td>
                                                <td class="py-1.5 text-center text-gray-500">${orig.aankoopJaar || '-'}</td>
                                                <td class="py-1.5 text-right text-gray-600">${formatEurInt(orig.aankoopBedrag)}</td>
                                                <td class="py-1.5 text-right text-gray-600">${formatEurInt(item.afschrijvingDitJaar)}</td>
                                                <td class="py-1.5 text-right font-bold text-gray-900">${formatEurInt(item.boekwaardeEind)}</td>
                                            </tr>
                                        `;
                                    }).join('')
                                    : '<tr><td colspan="5" class="py-3 text-center text-gray-400 italic">Geen inventaris geregistreerd.</td></tr>'
                                }
                                <tr class="border-t-2 border-gray-900 font-bold">
                                    <td colspan="3" class="py-2">Totaal inventaris</td>
                                    <td class="py-2 text-right">${formatEurInt(calculatedData.totaleAfschrijving)}</td>
                                    <td class="py-2 text-right text-sm">${formatEurInt(boekwaardeInventarisEind)}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <!-- Kapitaalsvergelijking -->
                    <div class="mb-8 border border-gray-200 rounded-xl p-5 bg-gray-50/20">
                        <h3 class="text-sm font-bold text-gray-900 mb-3">Kapitaalsvergelijking (Ondernemingsvermogen)</h3>
                        <div class="space-y-2 text-xs">
                            <div class="flex justify-between">
                                <span>Stand ondernemingsvermogen per 1 januari ${year}</span>
                                <span class="font-medium">${formatEur(calculatedData.balans.eigenVermogenBegin)}</span>
                            </div>
                            <div class="flex justify-between text-emerald-700">
                                <span>Fiscale winst uit onderneming</span>
                                <span>+ ${formatEur(calculatedData.fiscaleWinst)}</span>
                            </div>
                            <div class="flex justify-between text-emerald-700">
                                <span>Privéstortingen (in geld en natura)</span>
                                <span>+ ${formatEur(calculatedData.balans.totaleStortingen)}</span>
                            </div>
                            <div class="flex justify-between text-rose-600">
                                <span>Privé-onttrekkingen (in geld en natura)</span>
                                <span>- ${formatEur(calculatedData.balans.totaleOnttrekkingen)}</span>
                            </div>
                            <div class="flex justify-between font-bold border-t-2 border-gray-900 pt-2 text-sm text-gray-950">
                                <span>Stand ondernemingsvermogen per 31 december ${year}</span>
                                <span>${formatEur(calculatedData.balans.eigenVermogenEind)}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Fiscale Oudedagsreserve -->
                    <div class="border border-gray-200 rounded-xl p-4 bg-gray-50/20 text-xs">
                        <h3 class="font-bold text-gray-900 mb-1.5">Fiscale Oudedagsreserve (FOR)</h3>
                        <p class="text-gray-500 leading-relaxed">
                            De opbouw van de FOR is vanaf 2023 wettelijk afgeschaft. De bestaande stand per eind 2022 van <strong>${formatEur(forStand)}</strong> blijft op de balans gehandhaafd totdat deze wordt afgewikkeld conform de fiscale bepalingen.
                        </p>
                    </div>
                </section>

                <!-- 6. Slotverklaring & Ondertekening -->
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

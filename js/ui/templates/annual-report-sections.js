/**
 * js/ui/templates/annual-report-sections.js
 * Resultatenrekening en Toelichtingen secties voor het Jaarverslag.
 */

import { formatEur, formatEurInt } from './annual-report-balans.js';

export function getResultatenrekeningHTML(year, prevYear, prevData, omzet, kosten, winst) {
    return `
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
                        <td class="py-1.5 text-right font-medium">${formatEurInt(omzet.muziek9)}</td>
                        ${prevData ? `<td class="py-1.5 text-right text-gray-500 font-mono">${formatEurInt(prevData.omzet.muziek9)}</td>` : ''}
                    </tr>
                    <tr>
                        <td class="py-1.5 pl-4 text-gray-600">Omzet onderwijs / muzieklessen (0% btw / vrijgesteld)</td>
                        <td class="py-1.5 text-right font-medium">${formatEurInt(omzet.onderwijs0)}</td>
                        ${prevData ? `<td class="py-1.5 text-right text-gray-500 font-mono">${formatEurInt(prevData.omzet.onderwijs0)}</td>` : ''}
                    </tr>
                    <tr>
                        <td class="py-1.5 pl-4 text-gray-600">Overige opbrengsten &amp; rechten</td>
                        <td class="py-1.5 text-right font-medium">${formatEurInt(omzet.overig21)}</td>
                        ${prevData ? `<td class="py-1.5 text-right text-gray-500 font-mono">${formatEurInt(prevData.omzet.overig21)}</td>` : ''}
                    </tr>
                    <tr class="border-t border-gray-300 font-bold bg-gray-50/30">
                        <td class="py-2">Som van de bedrijfsopbrengsten</td>
                        <td class="py-2 text-right text-sm">${formatEurInt(omzet.totaal)}</td>
                        ${prevData ? `<td class="py-2 text-right text-gray-500 font-mono text-sm">${formatEurInt(prevData.omzet.totaal)}</td>` : ''}
                    </tr>

                    <tr class="font-semibold text-gray-700 bg-gray-50/50"><td colspan="${prevData ? 3 : 2}" class="py-1.5">Bedrijfskosten</td></tr>
                    <tr>
                        <td class="py-1.5 pl-4 text-gray-600">Kosten uitbesteed werk en externe kosten</td>
                        <td class="py-1.5 text-right font-medium">${formatEurInt(kosten.uitbesteedWerk)}</td>
                        ${prevData ? `<td class="py-1.5 text-right text-gray-500 font-mono">${formatEurInt(prevData.kosten.uitbesteedWerk)}</td>` : ''}
                    </tr>
                    <tr>
                        <td class="py-1.5 pl-4 text-gray-600">Afschrijving inventaris</td>
                        <td class="py-1.5 text-right font-medium">${formatEurInt(kosten.afschrijving)}</td>
                        ${prevData ? `<td class="py-1.5 text-right text-gray-500 font-mono">${formatEurInt(prevData.kosten.afschrijving)}</td>` : ''}
                    </tr>
                    <tr>
                        <td class="py-1.5 pl-4 text-gray-600">Autokosten en transportkosten</td>
                        <td class="py-1.5 text-right font-medium">${formatEurInt(kosten.autokosten)}</td>
                        ${prevData ? `<td class="py-1.5 text-right text-gray-500 font-mono">${formatEurInt(prevData.kosten.autokosten)}</td>` : ''}
                    </tr>
                    <tr>
                        <td class="py-1.5 pl-4 text-gray-600">Huisvestingskosten (studiohuur)</td>
                        <td class="py-1.5 text-right font-medium">${formatEurInt(kosten.huisvesting)}</td>
                        ${prevData ? `<td class="py-1.5 text-right text-gray-500 font-mono">${formatEurInt(prevData.kosten.huisvesting)}</td>` : ''}
                    </tr>
                    <tr>
                        <td class="py-1.5 pl-4 text-gray-600">Andere bedrijfskosten (administratie, software, klein materiaal)</td>
                        <td class="py-1.5 text-right font-medium">${formatEurInt(kosten.andereKosten)}</td>
                        ${prevData ? `<td class="py-1.5 text-right text-gray-500 font-mono">${formatEurInt(prevData.kosten.andereKosten)}</td>` : ''}
                    </tr>
                    <tr class="border-t border-gray-300 font-bold bg-gray-50/30">
                        <td class="py-2">Totale bedrijfskosten</td>
                        <td class="py-2 text-right text-sm">${formatEurInt(kosten.totaal)}</td>
                        ${prevData ? `<td class="py-2 text-right text-gray-500 font-mono text-sm">${formatEurInt(prevData.kosten.totaal)}</td>` : ''}
                    </tr>
                </tbody>
            </table>

            <!-- Winstberekening -->
            <div class="mt-8 border border-gray-200 rounded-xl p-5 bg-gray-50/30">
                <h3 class="text-sm font-bold text-gray-900 mb-3">Winstberekening</h3>
                <div class="space-y-2 text-xs">
                    <div class="flex justify-between"><span>Opbrengsten</span><span class="font-medium">${formatEur(omzet.totaal)}</span></div>
                    <div class="flex justify-between text-rose-600"><span>Kosten (incl. afschrijvingen)</span><span>- ${formatEur(kosten.totaal)}</span></div>
                    <div class="flex justify-between font-bold border-t border-gray-200 pt-1.5">
                        <span>Saldo winstberekening</span>
                        <span>${formatEur(omzet.totaal - kosten.totaal)}</span>
                    </div>
                    <div class="flex justify-between text-emerald-700">
                        <span>Fiscale bijtelling auto van de zaak</span>
                        <span>+ ${formatEur(winst.bijtelling)}</span>
                    </div>
                    <div class="flex justify-between font-bold text-sm border-t-2 border-gray-900 pt-2 text-gray-950">
                        <span>Fiscale winst uit onderneming</span>
                        <span>${formatEur(winst.fiscaleWinst)}</span>
                    </div>
                    ${winst.ondernemersaftrek > 0 ? `<div class="flex justify-between text-gray-600 pt-1"><span>Zelfstandigenaftrek</span><span>- ${formatEur(winst.ondernemersaftrek)}</span></div>` : ''}
                    ${winst.mkbWinstvrijstellingBedrag > 0 ? `<div class="flex justify-between text-gray-600"><span>MKB-winstvrijstelling</span><span>- ${formatEur(winst.mkbWinstvrijstellingBedrag)}</span></div>` : ''}
                    <div class="flex justify-between font-bold text-sm border-t border-dashed border-gray-300 pt-2 text-emerald-800">
                        <span>Belastbare winst (Box 1)</span>
                        <span>${formatEur(winst.belastbareWinst)}</span>
                    </div>
                </div>
            </div>
        </section>
    `;
}

export function getToelichtingHTML(year, state, calculatedData, boekwaardeInventarisEind, forStand) {
    const inventarisList = Array.isArray(state.inventaris) ? state.inventaris : [];

    return `
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
                                const orig = inventarisList.find(i => i.id === item.id) || {};
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
    `;
}

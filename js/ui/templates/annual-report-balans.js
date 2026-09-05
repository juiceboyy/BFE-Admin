/**
 * js/ui/templates/annual-report-balans.js
 * Balans sectie HTML voor het Jaarverslag van Big Fish Entertainment.
 */

export const formatEur = (num) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(num || 0);
export const formatEurInt = (num) => {
    if (num === null || num === undefined || isNaN(num)) return '€ 0';
    return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Math.round(num));
};

export function getBalansHTML(year, prevYear, prevData, activa, passiva) {
    const { inventaris, debiteuren, overlopend, borgMobility, bank, totaalVorderingen, totaalActiva } = activa;
    const { forStand, eigenVermogen, totaalVermogen, btwSchuld, overigeSchulden, totaalSchulden, totaalPassiva } = passiva;

    return `
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
                            <td class="py-1.5 text-right font-medium">${formatEurInt(inventaris)}</td>
                            ${prevData ? `<td class="py-1.5 text-right text-gray-500 font-mono">${formatEurInt(prevData.balans.activa.inventaris)}</td>` : ''}
                        </tr>
                        <tr class="border-t border-gray-200 font-medium">
                            <td class="py-1.5 pl-4">Totaal materiële vaste activa</td>
                            <td class="py-1.5 text-right font-bold">${formatEurInt(inventaris)}</td>
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
                            <td class="py-1.5 text-right font-medium">${formatEurInt(overlopend)}</td>
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
                            <td class="py-1.5 text-right font-medium">${formatEurInt(bank)}</td>
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
                            <td class="py-1.5 text-right font-medium">${formatEurInt(eigenVermogen)}</td>
                            ${prevData ? `<td class="py-1.5 text-right text-gray-500 font-mono">${formatEurInt(prevData.balans.passiva.eigenVermogen)}</td>` : ''}
                        </tr>
                        <tr class="border-t border-gray-200 font-medium">
                            <td class="py-1.5 pl-4">Totaal ondernemingsvermogen</td>
                            <td class="py-1.5 text-right font-bold">${formatEurInt(totaalVermogen)}</td>
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
                            <td class="py-1.5 text-right font-bold">${formatEurInt(totaalSchulden)}</td>
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
    `;
}

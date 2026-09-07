/**
 * js/ui/templates/annual-report-template.js
 * Hoofdtemplate voor het Jaarverslag van Big Fish Entertainment.
 */

import { BFE_COMPANY_INFO } from '../../utils/annual-report-data.js';
import { resolveAnnualReportModel } from '../../utils/annual-report-resolver.js';
import { getBalansHTML } from './annual-report-balans.js';
import { getResultatenrekeningHTML, getToelichtingHTML } from './annual-report-sections.js';

export function getAnnualReportHTML(state, calculatedData) {
    const model = resolveAnnualReportModel(state, calculatedData);
    const {
        year,
        prevYear,
        prevData,
        isSynchronized,
        forStand,
        activaData,
        passivaData,
        omzetData,
        kostenData,
        winstData,
        inventarisData,
        kapitaalData
    } = model;

    const availableYears = Array.from(new Set([2026, 2025, 2024, 2023, year])).sort((a, b) => b - a);

    return `
        <div class="max-w-4xl mx-auto pb-16">
            <!-- Bovenbalk met actieknoppen (onzichtbaar bij print) -->
            <div class="no-print flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8 bg-white p-4 rounded-2xl border border-gray-100 shadow-xs">
                <div class="flex items-center gap-3">
                    <label class="text-xs font-semibold uppercase text-gray-500 tracking-wider">Boekjaar:</label>
                    <select id="report-year-select" class="bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 text-sm font-medium outline-none focus:ring-2 focus:ring-black">
                        ${availableYears.map(y => `<option value="${y}" ${year === y ? 'selected' : ''}>${y}</option>`).join('')}
                    </select>
                </div>
                <div class="flex flex-wrap items-center gap-2.5">
                    ${isSynchronized ? `
                        <div class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <i data-lucide="check-circle" class="w-3.5 h-3.5 text-emerald-600"></i>
                            <span>Aangifte IB ${year} actief</span>
                        </div>
                    ` : ''}
                    <input type="file" id="input-import-aangifte" accept="application/pdf" class="hidden" />
                    <button id="btn-import-aangifte" class="px-4 py-2 border border-gray-200 rounded-xl text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-1.5 shadow-2xs">
                        <i data-lucide="file-up" class="w-3.5 h-3.5"></i> Aangifte IB Importeren
                    </button>
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

import { fiscalState } from '../store/fiscal-state.js';

/**
 * Renders the final Fiscal Report and Cheat Sheet into the provided container.
 * @param {Object} calculatedData - Result from calculateTaxes()
 * @param {Array} aiAdvice - Result from getFiscalAdvice()
 * @param {HTMLElement} containerElement - DOM node to render into
 */
export function renderFiscalReport(calculatedData, aiAdvice, containerElement) {
    const state = fiscalState.getState();
    
    // Currency Formatter Helper
    const formatEur = (num) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(num || 0);

    // Calculate total ending book value of inventory for the Balance Sheet
    const boekwaardeInventarisEind = calculatedData.afschrijvingenLog.reduce((sum, item) => sum + item.boekwaardeEind, 0);

    // Helper to generate AI Advice Cards based on type
    const getAdviceCard = (advice) => {
        let colorClass = "bg-blue-50 text-blue-800 border-blue-200";
        let icon = "info";
        
        if (advice.type === 'warning') {
            colorClass = "bg-orange-50 text-orange-900 border-orange-200";
            icon = "alert-triangle";
        } else if (advice.type === 'tip') {
            colorClass = "bg-emerald-50 text-emerald-900 border-emerald-200";
            icon = "lightbulb";
        }
        
        return `
            <div class="p-4 rounded-xl border ${colorClass} flex gap-3 shadow-sm">
                <i data-lucide="${icon}" class="w-5 h-5 shrink-0 mt-0.5"></i>
                <div>
                    <h4 class="font-semibold text-sm mb-1">${advice.title}</h4>
                    <p class="text-sm opacity-90">${advice.description}</p>
                </div>
            </div>
        `;
    };

    const html = `
        <!-- Header & Back Button -->
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
            <div>
                <h2 class="text-3xl font-bold text-gray-900 tracking-tight">Fiscaal Jaarrapport ${calculatedData.year}</h2>
                <p class="text-gray-500 text-sm mt-1">Gegenereerd door Big Fish AI</p>
            </div>
            <button id="btn-back-to-intake" class="px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 shadow-sm transition-colors flex items-center gap-2">
                <i data-lucide="arrow-left" class="w-4 h-4"></i> Terug naar formulier
            </button>
        </div>

        <!-- 1. AI Adviseur -->
        <div class="mb-10">
            <h3 class="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <i data-lucide="bot" class="w-5 h-5 text-blue-500"></i> AI Fiscaal Adviseur
            </h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                ${(aiAdvice && aiAdvice.length > 0) ? aiAdvice.map(getAdviceCard).join('') : '<p class="text-sm text-gray-500 italic">Geen specifiek advies gegenereerd.</p>'}
            </div>
        </div>

        <!-- 2. Financieel Jaarverslag -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
            <!-- 2a. Winst- en Verliesrekening -->
            <div class="bg-white shadow-sm rounded-xl p-6 border border-gray-100">
                <h3 class="text-lg font-semibold text-gray-800 mb-4 border-b border-gray-100 pb-3">Winst- en Verliesrekening</h3>
                <div class="space-y-3 text-sm">
                    <div class="flex justify-between"><span>Omzet (excl. BTW)</span><span class="font-medium">${formatEur(calculatedData.omzet)}</span></div>
                    <div class="flex justify-between text-rose-600"><span>Kosten (excl. afschrijvingen)</span><span>- ${formatEur(calculatedData.kosten)}</span></div>
                    <div class="flex justify-between text-rose-600"><span>Afschrijvingen inventaris</span><span>- ${formatEur(calculatedData.totaleAfschrijving)}</span></div>
                    ${calculatedData.bijtelling > 0 ? `<div class="flex justify-between text-emerald-600"><span>Bijtelling Auto</span><span>+ ${formatEur(calculatedData.bijtelling)}</span></div>` : ''}
                    <div class="flex justify-between font-bold text-base pt-3 border-t border-gray-100 mt-2">
                        <span>Fiscale Winst</span>
                        <span>${formatEur(calculatedData.fiscaleWinst)}</span>
                    </div>
                </div>
            </div>

            <!-- 2b. Balans -->
            <div class="bg-white shadow-sm rounded-xl p-6 border border-gray-100">
                <h3 class="text-lg font-semibold text-gray-800 mb-4 border-b border-gray-100 pb-3">Balans (31 december)</h3>
                <div class="space-y-5 text-sm">
                    <div>
                        <h4 class="font-medium text-gray-400 uppercase text-xs tracking-wider mb-2">Activa (Bezit)</h4>
                        <div class="flex justify-between mb-1.5"><span>Liquide Middelen (Bank eindsaldo)</span><span class="font-medium">${formatEur(state.bank.eindSaldo)}</span></div>
                        <div class="flex justify-between"><span>Materiële Vaste Activa (Boekwaarde)</span><span class="font-medium">${formatEur(boekwaardeInventarisEind)}</span></div>
                    </div>
                    <div class="border-t border-gray-100 pt-3">
                        <h4 class="font-medium text-gray-400 uppercase text-xs tracking-wider mb-2">Passiva (Schuld & Vermogen)</h4>
                        <div class="flex justify-between font-bold text-base"><span>Eigen Vermogen</span><span>${formatEur(calculatedData.balans.eigenVermogenEind)}</span></div>
                    </div>
                </div>
            </div>
        </div>

        <!-- 3. IB-Aangifte Spiekbriefje -->
        <div class="bg-gradient-to-br from-blue-50 to-indigo-50/30 shadow-sm rounded-2xl p-8 border border-blue-100">
            <div class="flex items-center gap-3 mb-3">
                <div class="p-2 bg-blue-100 text-blue-600 rounded-lg"><i data-lucide="clipboard-copy" class="w-5 h-5"></i></div>
                <h3 class="text-xl font-bold text-blue-900">IB-Aangifte Spiekbriefje</h3>
            </div>
            <p class="text-sm text-blue-700/80 mb-8">Neem deze exact berekende bedragen letterlijk over in het portaal van de Belastingdienst.</p>
            
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 text-sm">
                <div class="flex justify-between items-center p-3.5 bg-white/80 rounded-xl shadow-sm"><span class="font-medium text-gray-600">Winst uit onderneming</span><span class="font-mono text-base font-bold text-gray-900">${formatEur(calculatedData.fiscaleWinst)}</span></div>
                <div class="flex justify-between items-center p-3.5 bg-white/80 rounded-xl shadow-sm"><span class="font-medium text-gray-600">Privé-onttrekkingen</span><span class="font-mono text-base font-bold text-gray-900">${formatEur(state.prive.onttrekkingenInGeld)}</span></div>
                <div class="flex justify-between items-center p-3.5 bg-white/80 rounded-xl shadow-sm"><span class="font-medium text-gray-600">Zelfstandigenaftrek</span><span class="font-mono text-base font-bold text-gray-900">${formatEur(calculatedData.ondernemersaftrek)}</span></div>
                <div class="flex justify-between items-center p-3.5 bg-white/80 rounded-xl shadow-sm"><span class="font-medium text-gray-600">Privé-stortingen</span><span class="font-mono text-base font-bold text-gray-900">${formatEur(state.prive.stortingen)}</span></div>
                <div class="flex justify-between items-center p-3.5 bg-white/80 rounded-xl shadow-sm"><span class="font-medium text-gray-600">MKB-Winstvrijstelling</span><span class="font-mono text-base font-bold text-gray-900">${formatEur(calculatedData.mkbWinstvrijstellingBedrag)}</span></div>
                <div class="flex justify-between items-center p-4 bg-emerald-100/50 rounded-xl shadow-sm border border-emerald-200/60 mt-2 sm:mt-0 sm:col-span-2"><span class="font-bold text-emerald-900 text-base">Belastbare Winst (Box 1)</span><span class="font-mono text-xl font-black text-emerald-700">${formatEur(calculatedData.belastbareWinst)}</span></div>
            </div>
        </div>
    `;

    containerElement.innerHTML = html;
    if (window.lucide) window.lucide.createIcons();
}
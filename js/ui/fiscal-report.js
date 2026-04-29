import { fiscalState } from '../store/fiscal-state.js';
import { appendToTrendSheet } from '../api/storage-queries.js';

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
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                ${(aiAdvice && aiAdvice.length > 0) ? aiAdvice.map(getAdviceCard).join('') : '<p class="text-sm text-gray-500 italic">Geen specifiek advies gegenereerd.</p>'}
            </div>
            <div class="flex justify-end">
                <button id="btn-copy-ai-prompt"
                        class="px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 shadow-sm transition-colors flex items-center gap-2">
                    📋 Kopieer data voor externe AI (Gemini / ChatGPT)
                </button>
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
                <div class="space-y-4 text-sm">
                    <div>
                        <h4 class="font-medium text-gray-400 uppercase text-xs tracking-wider mb-2">Activa</h4>
                        <div class="flex justify-between mb-1.5"><span class="text-gray-600">Liquide middelen (bank eindsaldo)</span><span class="font-medium">${formatEur(state.bank.eindSaldo)}</span></div>
                        <div class="flex justify-between mb-1.5"><span class="text-gray-600">Materiële vaste activa (boekwaarde)</span><span class="font-medium">${formatEur(boekwaardeInventarisEind)}</span></div>
                        <div class="flex justify-between font-semibold pt-2 border-t border-gray-100"><span>Totaal activa</span><span>${formatEur((state.bank.eindSaldo || 0) + boekwaardeInventarisEind)}</span></div>
                    </div>
                    <div class="border-t border-gray-100 pt-3">
                        <h4 class="font-medium text-gray-400 uppercase text-xs tracking-wider mb-2">Passiva</h4>
                        <div class="flex justify-between mb-1.5"><span class="text-gray-600">Eigen vermogen</span><span class="font-medium">${formatEur(calculatedData.balans.eigenVermogenEind)}</span></div>
                        ${calculatedData.balans.forStand > 0 ? `<div class="flex justify-between mb-1.5 text-gray-400 text-xs ml-3"><span>↳ w.v. FOR-stand (geen nieuwe opbouw)</span><span>${formatEur(calculatedData.balans.forStand)}</span></div>` : ''}
                        ${calculatedData.balans.kortlopendeSchulden > 0 ? `<div class="flex justify-between mb-1.5"><span class="text-gray-600">Kortlopende schulden</span><span class="font-medium text-rose-600">${formatEur(calculatedData.balans.kortlopendeSchulden)}</span></div>` : ''}
                        <div class="flex justify-between font-semibold pt-2 border-t border-gray-100"><span>Totaal passiva</span><span>${formatEur(calculatedData.balans.eigenVermogenEind + calculatedData.balans.kortlopendeSchulden)}</span></div>
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
                <div class="flex justify-between items-center p-3.5 bg-white/80 rounded-xl shadow-sm"><span class="font-medium text-gray-600">Privé-onttrekkingen (totaal)</span><span class="font-mono text-base font-bold text-gray-900">${formatEur(calculatedData.balans.totaleOnttrekkingen)}</span></div>
                <div class="flex justify-between items-center p-3.5 bg-white/80 rounded-xl shadow-sm"><span class="font-medium text-gray-600">Zelfstandigenaftrek</span><span class="font-mono text-base font-bold text-gray-900">${formatEur(calculatedData.ondernemersaftrek)}</span></div>
                <div class="flex justify-between items-center p-3.5 bg-white/80 rounded-xl shadow-sm"><span class="font-medium text-gray-600">Privé-stortingen (totaal)</span><span class="font-mono text-base font-bold text-gray-900">${formatEur(calculatedData.balans.totaleStortingen)}</span></div>
                <div class="flex justify-between items-center p-3.5 bg-white/80 rounded-xl shadow-sm"><span class="font-medium text-gray-600">MKB-Winstvrijstelling</span><span class="font-mono text-base font-bold text-gray-900">${formatEur(calculatedData.mkbWinstvrijstellingBedrag)}</span></div>
                <div class="flex justify-between items-center p-4 bg-emerald-100/50 rounded-xl shadow-sm border border-emerald-200/60 mt-2 sm:mt-0 sm:col-span-2"><span class="font-bold text-emerald-900 text-base">Belastbare Winst (Box 1)</span><span class="font-mono text-xl font-black text-emerald-700">${formatEur(calculatedData.belastbareWinst)}</span></div>
            </div>
        </div>

        <!-- 4. Export naar Trend-archief -->
        <div class="mt-8 flex justify-center">
            <button id="btn-export-trends"
                    class="px-6 py-3 bg-black text-white rounded-xl text-sm font-semibold hover:bg-gray-800 active:scale-95 transition-all flex items-center gap-2 shadow-sm">
                <i data-lucide="archive" class="w-4 h-4"></i>
                <span>💾 Sla definitief op in Trend-archief</span>
            </button>
        </div>
    `;

    containerElement.innerHTML = html;
    if (window.lucide) window.lucide.createIcons();

    _initCopyPromptButton(containerElement, calculatedData, aiAdvice);
    _initExportButton(containerElement, calculatedData);
}


function _copyPromptToClipboard(calculatedData, aiAdvice) {
    const fmt = (num) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(num || 0);

    const adviceSection = (aiAdvice && aiAdvice.length > 0)
        ? `\n\nMijn AI-adviseur heeft de volgende adviespunten gegenereerd:\n` +
          aiAdvice.map((a, i) => `${i + 1}. [${a.type.toUpperCase()}] ${a.title}: ${a.description}`).join('\n')
        : '';

    return `Acteer als de fiscaal adviseur voor mijn eenmanszaak (Big Fish Entertainment).
Hier zijn mijn definitieve berekende cijfers voor het jaar ${calculatedData.year}:

- Omzet (excl. BTW): ${fmt(calculatedData.omzet)}
- Zakelijke Kosten (excl. afschrijvingen): ${fmt(calculatedData.kosten)}
- Afschrijvingen: ${fmt(calculatedData.totaleAfschrijving)}
- Bijtelling Auto (VW ID.3): ${fmt(calculatedData.bijtelling)}
- Fiscale Winst (Box 1): ${fmt(calculatedData.fiscaleWinst)}
- Privé-onttrekkingen: ${fmt(calculatedData.balans.totaleOnttrekkingen)}${adviceSection}

Houd deze cijfers in je geheugen. Ik ga je hier nu een aantal vragen over stellen met betrekking tot mijn belastingen en bedrijfsstrategie.`;
}

function _initCopyPromptButton(containerElement, calculatedData, aiAdvice) {
    const btn = containerElement.querySelector('#btn-copy-ai-prompt');
    if (!btn) return;

    const originalLabel = btn.textContent;

    btn.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(_copyPromptToClipboard(calculatedData, aiAdvice));
            btn.textContent = '✅ Prompt gekopieerd! Plak dit in je AI.';
            setTimeout(() => { btn.textContent = originalLabel; }, 3000);
        } catch {
            alert('Klembord niet toegankelijk. Controleer de browsermachtigingen.');
        }
    });
}

function _initExportButton(containerElement, calculatedData) {
    const btn = containerElement.querySelector('#btn-export-trends');
    if (!btn) return;

    btn.addEventListener('click', async () => {
        btn.disabled = true;
        const spanEl = btn.querySelector('span');
        spanEl.textContent = 'Bezig met opslaan...';

        const winstmarge = calculatedData.omzet > 0
            ? ((calculatedData.fiscaleWinst / calculatedData.omzet) * 100).toFixed(1).replace('.', ',') + '%'
            : '0,0%';

        const trendData = {
            omzet:               calculatedData.omzet,
            kosten:              calculatedData.kosten,
            afschrijvingen:      calculatedData.totaleAfschrijving,
            bijtelling:          calculatedData.bijtelling,
            fiscaleWinst:        calculatedData.fiscaleWinst,
            winstmarge,
            priveOnttrekkingen:  calculatedData.balans.totaleOnttrekkingen
        };

        try {
            await appendToTrendSheet(calculatedData.year, trendData);
            btn.innerHTML = `<i data-lucide="check-circle" class="w-4 h-4"></i><span>✅ Opgeslagen in BFEadmin!</span>`;
            btn.classList.replace('bg-black', 'bg-emerald-700');
            btn.classList.replace('hover:bg-gray-800', 'hover:bg-emerald-700');
            if (window.lucide) window.lucide.createIcons();
        } catch (err) {
            console.error('Export naar Trend-archief mislukt:', err);
            btn.disabled = false;
            spanEl.textContent = `❌ Fout: ${err.message}`;
            btn.classList.replace('bg-black', 'bg-rose-600');
            btn.classList.replace('hover:bg-gray-800', 'hover:bg-rose-700');
            // Reset na 5 seconden zodat gebruiker opnieuw kan proberen
            setTimeout(() => {
                btn.disabled = false;
                btn.classList.replace('bg-rose-600', 'bg-black');
                btn.classList.replace('hover:bg-rose-700', 'hover:bg-gray-800');
                btn.innerHTML = `<i data-lucide="archive" class="w-4 h-4"></i><span>💾 Sla definitief op in Trend-archief</span>`;
                if (window.lucide) window.lucide.createIcons();
            }, 5000);
        }
    });
}
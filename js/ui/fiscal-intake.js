import { fiscalState } from '../store/fiscal-state.js';
import { collectYearData } from '../api/tax-collector.js';
import { getYearlyTotals, fetchInventarisFromSheet, addInventarisItemToSheet, deleteInventarisItemFromSheet } from '../api/storage-queries-fiscal.js';
import { calculateTaxes } from '../utils/tax-calculator.js';
import { getFiscalAdvice, clearChatHistory } from '../api/tax-advisor.js';
import { renderFiscalReport } from './fiscal-report.js';
import { getInventarisKandidaten } from '../api/inventaris-kandidaten.js';
import { parsePriveStortingenCSV } from '../utils/csv-parser.js';
import { getFiscalIntakeHTML } from './templates/fiscal-intake-template.js';
import { renderInventarisTable, handleInventarisClick, updateInventarisRijBerekening } from './fiscal-inventaris.js';

export const SPREADSHEET_IDS = {
    2023: '1wMnw3BTyNvvl9CCCKt78PGhl6PBQyLFnNe2XKCO16Wg',
    2024: '1OFzhw4r6eDkKcOxXuzJ6MoKO1O5CiKmmZR83e33QEsM',
    2025: '1WIY9la9KpdRuRItTi2qfjRmmmkNeoxQf7VMihRjw0TI',
    2026: '119dQIOSLFpKDqWUQUMWTU9miIKP3MOR1VHFB5yzmBrg',
};



export function initFiscalIntake() {
    const container = document.getElementById('view-fiscal');
    if (!container) return;

    renderStructure(container);
    setupEventListeners(container);
    renderInventarisTable();
}

export async function loadInventarisAfterAuth() {
    const tbody = document.getElementById('inventaris-tbody');
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="8" class="px-4 py-6 text-center text-gray-400 text-sm">
                <div class="flex items-center justify-center gap-2">
                    <i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i>
                    Inventaris inladen vanuit BFEadmin...
                </div>
            </td>
        </tr>`;
    if (window.lucide) window.lucide.createIcons();

    try {
        const items = await fetchInventarisFromSheet();
        // Vertaal sheet-velden naar lokale state-velden
        const mapped = items.map((item, idx) => ({
            id:               parseInt(item.id, 10) || (idx + 1),
            omschrijving:     item.omschrijving,
            aankoopJaar:      item.datum,
            aankoopBedrag:    item.aanschafwaarde,
            afschrijvingsDuur: item.afschrijvingsJaren,
            restwaarde:       item.restwaarde,
        }));
        fiscalState.setTopLevel('inventaris', mapped);
    } catch (err) {
        console.error('Kon inventaris niet laden vanuit sheet:', err);
    }
    renderInventarisTable();
}

function renderStructure(container) {
    const state = fiscalState.getState();
    
    // Tailwind Design System helpers
    const classes = {
        inputClass: "w-full bg-white/60 border border-gray-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 transition-all text-sm",
        labelClass: "block text-xs font-medium text-gray-500 mb-1.5",
        sectionClass: "bg-white shadow-sm rounded-xl p-6 border border-gray-100 mb-6",
        headerClass: "text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2"
    };
    
    container.innerHTML = getFiscalIntakeHTML(state, classes);
    
    if (window.lucide) window.lucide.createIcons();
}



function setupEventListeners(container) {
    // Two-way Data Binding via Event Delegation (inclusief bank upload)
    container.addEventListener('change', async (e) => {
        const target = e.target;

        // Bank statement upload — delegated zodat het na renderStructure blijft werken
        if (target.id === 'bank-statement-upload') {
            const file = target.files?.[0];
            if (!file) return;

            const idle    = document.getElementById('bank-upload-idle');
            const loading = document.getElementById('bank-upload-loading');
            const result  = document.getElementById('bank-scan-result');

            idle.classList.add('hidden');
            loading.classList.remove('hidden');
            loading.classList.add('flex');
            result.classList.add('hidden');

            try {
                const base64Data = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.readAsDataURL(file);
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = reject;
                });

                // Gebruik fetch direct (geen retry) zodat de response body leesbaar blijft bij errors
                const response = await fetch('/.netlify/functions/scanBankStatement', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        base64Data,
                        mimeType: file.type,
                        year: fiscalState.getState().year
                    })
                });

                if (!response.ok) {
                    const err = await response.json().catch(() => ({}));
                    throw new Error(err.error || `Server error ${response.status}`);
                }

                const { beginSaldo, eindSaldo } = await response.json();

                if (beginSaldo != null) {
                    fiscalState.setNested('bank', 'beginSaldo', beginSaldo);
                    container.querySelector('[data-bind="beginSaldo"]').value = beginSaldo;
                }
                if (eindSaldo != null) {
                    fiscalState.setNested('bank', 'eindSaldo', eindSaldo);
                    container.querySelector('[data-bind="eindSaldo"]').value = eindSaldo;
                }

                result.classList.remove('hidden');
                result.querySelector('span').textContent =
                    `Ingelezen: beginsaldo €${(beginSaldo ?? '?').toLocaleString('nl-NL', { minimumFractionDigits: 2 })}, eindsaldo €${(eindSaldo ?? '?').toLocaleString('nl-NL', { minimumFractionDigits: 2 })}. Controleer en pas aan indien nodig.`;
                if (window.lucide) window.lucide.createIcons();

            } catch (err) {
                alert(`Kon bankafschrift niet inlezen: ${err.message}`);
            } finally {
                idle.classList.remove('hidden');
                loading.classList.add('hidden');
                loading.classList.remove('flex');
                target.value = '';
            }
            return;
        }

        // Privé IBAN opslaan (jaar-onafhankelijk)
        if (target.id === 'prive-iban-input') {
            localStorage.setItem('bfe_private_iban', target.value.trim());
            return;
        }

        // CSV stortingen parser
        if (target.id === 'csv-stortingen-upload') {
            const file = target.files?.[0];
            if (!file) return;

            const resultEl = document.getElementById('csv-stortingen-result');
            resultEl.className = 'text-xs font-medium text-gray-400';
            resultEl.textContent = 'Bezig met analyseren...';
            resultEl.classList.remove('hidden');

            try {
                const csvText = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.readAsText(file, 'UTF-8');
                    reader.onload  = () => resolve(reader.result);
                    reader.onerror = reject;
                });

                const iban = (document.getElementById('prive-iban-input')?.value || '').trim();
                if (!iban) {
                    resultEl.className = 'text-xs font-medium text-amber-600';
                    resultEl.textContent = 'Vul eerst je privé IBAN in hierboven.';
                    target.value = '';
                    return;
                }

                const parsed = parsePriveStortingenCSV(csvText, iban);

                if (!parsed) {
                    resultEl.className = 'text-xs font-medium text-red-500';
                    resultEl.textContent = 'CSV kon niet worden ingelezen. Controleer het formaat.';
                    target.value = '';
                    return;
                }

                if (parsed.count === 0) {
                    resultEl.className = 'text-xs font-medium text-amber-600';
                    resultEl.textContent = `Geen bijschrijvingen gevonden van ${iban}. Controleer het IBAN.`;
                    target.value = '';
                    return;
                }

                // State + DOM bijwerken
                fiscalState.setNested('prive', 'stortingenInGeld', parsed.totaal);
                const amountInput = container.querySelector('[data-section="prive"][data-bind="stortingenInGeld"]');
                if (amountInput) amountInput.value = parsed.totaal;

                const fmt = (n) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n);
                resultEl.className = 'text-xs font-medium text-emerald-600';
                resultEl.textContent = `${fmt(parsed.totaal)} gevonden uit ${parsed.count} transactie${parsed.count !== 1 ? 's' : ''} ↳ ingevuld`;

            } catch (err) {
                resultEl.className = 'text-xs font-medium text-red-500';
                resultEl.textContent = `Fout: ${err.message}`;
            } finally {
                target.value = '';
            }
            return;
        }

        // Global State Inputs
        if (target.dataset.bind) {
            const section = target.dataset.section;
            const key = target.dataset.bind;
            let val = target.type === 'checkbox' ? target.checked : target.value;
            if (target.type === 'number') val = parseFloat(val) || 0;

            if (section) {
                fiscalState.setNested(section, key, val);
            } else {
                if (key === 'year') clearChatHistory();
                fiscalState.setTopLevel(key, val);
            }
        }

        // Dynamic Inventaris Table
        if (target.dataset.invKey) {
            const id = parseInt(target.dataset.invId, 10);
            const key = target.dataset.invKey;
            let val = target.type === 'number' ? parseFloat(target.value) || 0 : target.value;
            fiscalState.updateInventarisItem(id, key, val);
            // Herbereken alleen de berekende kolommen voor deze rij (geen volledige re-render)
            updateInventarisRijBerekening(id);
        }
    });

    container.addEventListener('click', async (e) => {
        const target = e.target;
        const handled = await handleInventarisClick(e);
        if (handled) return;

        const resetBtn = target.closest('#btn-reset-state');
        if (resetBtn) {
            const year = fiscalState.getState().year;
            if (confirm(`Alle opgeslagen gegevens voor boekjaar ${year} wissen? Dit kan niet ongedaan worden gemaakt.`)) {
                fiscalState.reset();
                renderStructure(container);
                renderInventarisTable();
            }
        }

        const syncBtn = target.closest('#btn-sync-sheets');
        if (syncBtn) {
            const year = fiscalState.getState().year;
            if (!year) return alert("Vul eerst een boekjaar in.");

            const originalHtml = syncBtn.innerHTML;
            const setSpinner = (label) => {
                syncBtn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> ${label}`;
                if (window.lucide) window.lucide.createIcons();
            };
            syncBtn.disabled = true;
            setSpinner('Ophalen jaarafsluiting...');

            try {
                const spreadsheetId = SPREADSHEET_IDS[parseInt(year)];
                if (!spreadsheetId) return alert(`Geen spreadsheet geconfigureerd voor ${year}.`);

                // Stap 1: geaggregeerde jaar-totalen (12 × 2 maandtabs)
                setSpinner('Maandtabs ophalen (1/2)...');
                const totals = await getYearlyTotals(year);

                // Stap 2: jaar-niveau data voor de fiscale berekening
                setSpinner('Jaarrekening ophalen (2/2)...');
                const data = await collectYearData(year, spreadsheetId);

                // State bijwerken
                fiscalState.setTopLevel('sheetData', data);
                fiscalState.setNested('prive', 'onttrekkingenInGeld', totals.priveOnttrekkingenGeld);
                fiscalState.setNested('prive', 'stortingenInNatura',  totals.priveStortingenNatura);

                // DOM inputs bijwerken (data-section / data-bind, geen vaste IDs)
                const setInput = (section, bind, value) => {
                    const el = container.querySelector(`[data-section="${section}"][data-bind="${bind}"]`);
                    if (el) el.value = value;
                };
                setInput('prive', 'onttrekkingenInGeld', totals.priveOnttrekkingenGeld);
                setInput('prive', 'stortingenInNatura',  totals.priveStortingenNatura);

                // Samenvatting tonen
                const summary = document.getElementById('sync-summary');
                const fmt = (num) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(num);

                summary.innerHTML = `
                    <div class="font-medium flex items-center gap-2 mb-2">
                        <i data-lucide="check-circle" class="w-4 h-4 text-emerald-600"></i> Data gesynchroniseerd voor ${year}
                    </div>
                    <ul class="list-disc list-inside space-y-1 ml-1 text-emerald-700">
                        <li>Netto-omzet: <span class="font-semibold">${fmt(totals.omzetEx)}</span></li>
                        <li>Kosten excl. BTW: <span class="font-semibold">${fmt(totals.inkoopEx)}</span></li>
                        <li>Winst (bruto): <span class="font-semibold">${fmt(totals.winst)}</span></li>
                        <li>BTW-balans (te betalen): <span class="font-semibold">${fmt(totals.btwBalans)}</span></li>
                        <li>Privé-onttrekkingen in geld: <span class="font-semibold">${fmt(totals.priveOnttrekkingenGeld)}</span> <span class="text-xs text-emerald-600">↳ ingevuld bij sectie 5</span></li>
                        <li>Privé-stortingen in natura: <span class="font-semibold">${fmt(totals.priveStortingenNatura)}</span> <span class="text-xs text-emerald-600">↳ ingevuld bij sectie 5</span></li>
                    </ul>
                `;
                summary.classList.remove('hidden');
                if (window.lucide) window.lucide.createIcons();

            } catch (error) {
                alert(`Fout bij ophalen van data: ${error.message}`);
                console.error(error);
            } finally {
                syncBtn.innerHTML = originalHtml;
                syncBtn.disabled = false;
                if (window.lucide) window.lucide.createIcons();
            }
        }

        const generateBtn = target.closest('#btn-generate-report');
        if (generateBtn) {
            const originalHtml = generateBtn.innerHTML;
            generateBtn.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> Berekenen & AI Analyseren...';
            generateBtn.disabled = true;
            if (window.lucide) window.lucide.createIcons();

            try {
                const state = fiscalState.getState();
                const calculatedData = calculateTaxes(state);
                const aiAdvice = await getFiscalAdvice(calculatedData, state);
                
                const intakeWrapper = document.getElementById('intake-form-wrapper');
                const reportWrapper = document.getElementById('report-wrapper');
                
                intakeWrapper.classList.add('hidden');
                reportWrapper.classList.remove('hidden');
                
                renderFiscalReport(calculatedData, aiAdvice, reportWrapper);
            } catch (error) {
                alert(`Fout bij genereren rapport: ${error.message}`);
                console.error(error);
            } finally {
                generateBtn.innerHTML = originalHtml;
                generateBtn.disabled = false;
            }
        }

        const backBtn = target.closest('#btn-back-to-intake');
        if (backBtn) {
            document.getElementById('report-wrapper').classList.add('hidden');
            document.getElementById('intake-form-wrapper').classList.remove('hidden');
        }
    });
}
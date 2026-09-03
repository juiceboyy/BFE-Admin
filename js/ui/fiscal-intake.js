import { fiscalState } from '../store/fiscal-state.js';
import { fetchInventarisFromSheet } from '../api/storage-queries-fiscal.js';
import { calculateTaxes } from '../utils/tax-calculator.js';
import { getFiscalAdvice, clearChatHistory } from '../api/tax-advisor.js';
import { renderFiscalReport } from './fiscal-report.js';
import { parsePriveStortingenCSV } from '../utils/csv-parser.js';
import { getFiscalIntakeHTML } from './templates/fiscal-intake-template.js';
import { renderInventarisTable, handleInventarisClick, updateInventarisRijBerekening } from './fiscal-inventaris.js';
import { handleSyncSheets, restoreSyncSummary } from './fiscal-sync.js';
import { handleBankStatementUpload } from './fiscal-bank.js';

export const SPREADSHEET_IDS = {
    2023: '1wMnw3BTyNvvl9CCCKt78PGhl6PBQyLFnNe2XKCO16Wg',
    2024: '1OFzhw4r6eDkKcOxXuzJ6MoKO1O5CiKmmZR83e33QEsM',
    2025: '1WIY9la9KpdRuRItTi2qfjRmmmkNeoxQf7VMihRjw0TI',
    2026: '119dQIOSLFpKDqWUQUMWTU9miIKP3MOR1VHFB5yzmBrg',
};

export const DEFAULT_PRIVATE_IBAN = 'NL47INGB0005023386';

export function initFiscalIntake() {
    const container = document.getElementById('view-fiscal');
    if (!container) return;

    if (!localStorage.getItem('bfe_private_iban')) {
        localStorage.setItem('bfe_private_iban', DEFAULT_PRIVATE_IBAN);
    }

    renderStructure(container);
    setupEventListeners(container);
    renderInventarisTable();
    restoreSyncSummary(container);
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
    container.addEventListener('change', async (e) => {
        const target = e.target;

        // Bank statement upload
        if (target.id === 'bank-statement-upload') {
            const file = target.files?.[0];
            if (file) handleBankStatementUpload(file, container);
            return;
        }

        // Privé IBAN opslaan
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

                const iban = (document.getElementById('prive-iban-input')?.value || localStorage.getItem('bfe_private_iban') || DEFAULT_PRIVATE_IBAN).trim();
                if (!iban) {
                    resultEl.className = 'text-xs font-medium text-amber-600';
                    resultEl.textContent = 'Vul eerst je privé IBAN in hierboven.';
                    target.value = '';
                    return;
                }

                const parsed = parsePriveStortingenCSV(csvText, iban);

                if (!parsed) {
                    resultEl.className = 'text-xs font-medium text-red-500';
                    resultEl.textContent = 'CSV kon niet worden ingelezen. Controleer of het een geldig CSV-bestand is.';
                    target.value = '';
                    return;
                }

                if (parsed.count === 0) {
                    resultEl.className = 'text-xs font-medium text-amber-600';
                    resultEl.textContent = `Geen overboekingen gevonden vanaf tegenrekening ${iban}. Controleer of dit het CSV-bestand van de zakelijke ING-rekening is.`;
                    target.value = '';
                    return;
                }

                fiscalState.setNested('prive', 'stortingenInGeld', parsed.totaal);
                const amountInput = container.querySelector('[data-section="prive"][data-bind="stortingenInGeld"]');
                if (amountInput) amountInput.value = parsed.totaal;

                const fmtCurr = (n) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n);
                resultEl.className = 'text-xs font-medium text-emerald-600';
                resultEl.textContent = `${parsed.count} overboeking(en) vanaf ${iban} gevonden (totaal ${fmtCurr(parsed.totaal)}) en automatisch ingevuld.`;

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
                if (key === 'year') {
                    clearChatHistory();
                    fiscalState.setTopLevel(key, val);
                    renderStructure(container);
                    renderInventarisTable();
                    restoreSyncSummary(container);
                    return;
                }
                fiscalState.setTopLevel(key, val);
        }

        // Dynamic Inventaris Table
        if (target.dataset.invKey) {
            const id = parseInt(target.dataset.invId, 10);
            const key = target.dataset.invKey;
            let val = target.type === 'number' ? parseFloat(target.value) || 0 : target.value;
            fiscalState.updateInventarisItem(id, key, val);
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
            const originalHtml = syncBtn.innerHTML;
            const setSpinner = (label) => {
                syncBtn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> ${label}`;
                if (window.lucide) window.lucide.createIcons();
            };
            syncBtn.disabled = true;

            try {
                await handleSyncSheets(container, setSpinner);
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
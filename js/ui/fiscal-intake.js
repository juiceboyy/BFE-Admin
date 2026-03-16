import { fiscalState } from '../store/fiscal-state.js';
import { collectYearData } from '../api/tax-collector.js';
import { calculateTaxes } from '../utils/tax-calculator.js';
import { getFiscalAdvice } from '../api/tax-advisor.js';
import { renderFiscalReport } from './fiscal-report.js';

// Zelfde ID als gebruikt wordt in storage.js
const SPREADSHEET_ID = '119dQIOSLFpKDqWUQUMWTU9miIKP3MOR1VHFB5yzmBrg';

export function initFiscalIntake() {
    const container = document.getElementById('view-fiscal');
    if (!container) return;

    renderStructure(container);
    setupEventListeners(container);
    renderInventarisTable();
}

function renderStructure(container) {
    const state = fiscalState.getState();
    
    // Tailwind Design System helpers
    const inputClass = "w-full bg-white/60 border border-gray-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 transition-all text-sm";
    const labelClass = "block text-xs font-medium text-gray-500 mb-1.5";
    const sectionClass = "bg-white shadow-sm rounded-xl p-6 border border-gray-100 mb-6";
    const headerClass = "text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2";
    
    container.innerHTML = `
        <div id="intake-form-wrapper" class="max-w-4xl mx-auto pb-12">
            <div class="mb-8">
                <h2 class="text-2xl font-bold text-gray-900">Fiscale Jaarafsluiting & Intake</h2>
                <p class="text-gray-500 text-sm mt-1">Vul de ontbrekende gegevens in voor de inkomstenbelasting-aangifte.</p>
            </div>

            <!-- 1. Data Synchronisatie -->
            <section class="${sectionClass}">
                <h3 class="${headerClass}">
                    <i data-lucide="refresh-cw" class="w-5 h-5 text-blue-500"></i> 1. Data Synchronisatie
                </h3>
                <div class="flex flex-col sm:flex-row items-end gap-4">
                    <div class="w-full sm:w-48">
                        <label class="${labelClass}">Boekjaar</label>
                        <input type="number" id="sync-year" data-bind="year" class="${inputClass}" value="${state.year}">
                    </div>
                    <button id="btn-sync-sheets" class="w-full sm:w-auto bg-black text-white px-6 py-2.5 rounded-xl text-sm font-medium shadow-sm hover:bg-gray-800 transition-colors flex items-center justify-center gap-2">
                        <i data-lucide="cloud-download" class="w-4 h-4"></i> Haal data op uit Sheets
                    </button>
                </div>
                <div id="sync-summary" class="hidden mt-6 p-4 bg-emerald-50 border border-emerald-100 rounded-xl text-sm text-emerald-800">
                    <!-- Wordt dynamisch gevuld -->
                </div>
            </section>

            <!-- 2. Bank -->
            <section class="${sectionClass}">
                <h3 class="${headerClass}">
                    <i data-lucide="landmark" class="w-5 h-5 text-blue-500"></i> 2. Bank (Zakelijke Rekening)
                </h3>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                        <label class="${labelClass}">Beginsaldo (1 jan)</label>
                        <div class="relative">
                            <span class="absolute left-4 top-2.5 text-gray-500 text-sm">€</span>
                            <input type="number" step="0.01" data-section="bank" data-bind="beginSaldo" class="${inputClass} pl-8" value="${state.bank.beginSaldo}">
                        </div>
                    </div>
                    <div>
                        <label class="${labelClass}">Eindsaldo (31 dec)</label>
                         <div class="relative">
                            <span class="absolute left-4 top-2.5 text-gray-500 text-sm">€</span>
                            <input type="number" step="0.01" data-section="bank" data-bind="eindSaldo" class="${inputClass} pl-8" value="${state.bank.eindSaldo}">
                        </div>
                    </div>
                </div>
            </section>

            <!-- 3. Auto & Bijtelling -->
            <section class="${sectionClass}">
                <h3 class="${headerClass}">
                    <i data-lucide="car" class="w-5 h-5 text-blue-500"></i> 3. Auto & Bijtelling
                </h3>
                <div class="space-y-4">
                    <label class="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200 cursor-pointer">
                        <input type="checkbox" data-section="auto" data-bind="zakelijkGebruik" class="w-4 h-4 text-blue-600 rounded" ${state.auto.zakelijkGebruik ? 'checked' : ''}>
                        <span class="text-sm font-medium text-gray-700">Auto van de zaak (Bijtelling toepassen)</span>
                    </label>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div>
                            <label class="${labelClass}">Cataloguswaarde</label>
                            <div class="relative">
                                <span class="absolute left-4 top-2.5 text-gray-500 text-sm">€</span>
                                <input type="number" step="1" data-section="auto" data-bind="catalogusWaarde" class="${inputClass} pl-8" value="${state.auto.catalogusWaarde}">
                            </div>
                        </div>
                        <div>
                            <label class="${labelClass}">Bijtellingspercentage</label>
                            <select data-section="auto" data-bind="bijtellingsPercentage" class="${inputClass}">
                                ${[0, 4, 8, 16, 22].map(p => `<option value="${p}" ${state.auto.bijtellingsPercentage === p ? 'selected' : ''}>${p}%</option>`).join('')}
                            </select>
                        </div>
                    </div>
                </div>
            </section>

            <!-- 4. Inventaris & Afschrijvingen -->
            <section class="${sectionClass} overflow-x-auto">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="${headerClass} !mb-0">
                        <i data-lucide="monitor" class="w-5 h-5 text-blue-500"></i> 4. Inventaris & Afschrijvingen
                    </h3>
                    <button id="btn-add-inventaris" class="text-sm bg-gray-100 hover:bg-gray-200 text-gray-800 py-1.5 px-3 rounded-lg font-medium transition-colors">
                        + Voeg item toe
                    </button>
                </div>
                <table class="w-full text-sm text-left border-collapse min-w-[600px]">
                    <thead class="text-xs text-gray-500 uppercase bg-gray-50 border-y border-gray-200">
                        <tr>
                            <th class="px-4 py-3 font-medium">Omschrijving</th>
                            <th class="px-4 py-3 font-medium w-24">Aanschaf(J)</th>
                            <th class="px-4 py-3 font-medium w-32">Bedrag (€)</th>
                            <th class="px-4 py-3 font-medium w-24">Jaren</th>
                            <th class="px-4 py-3 font-medium w-32">Boekwaarde (€)</th>
                            <th class="px-4 py-3 font-medium w-12 text-center">Actie</th>
                        </tr>
                    </thead>
                    <tbody id="inventaris-tbody" class="divide-y divide-gray-100">
                        <!-- Geïnjecteerd via JS -->
                    </tbody>
                </table>
            </section>

            <!-- 5. Privé & Fiscaal -->
            <section class="${sectionClass}">
                <h3 class="${headerClass}">
                    <i data-lucide="user" class="w-5 h-5 text-blue-500"></i> 5. Privé & Fiscaal
                </h3>
                <div class="space-y-6">
                    <label class="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200 cursor-pointer">
                        <input type="checkbox" data-section="ondernemer" data-bind="urencriteriumGehaald" class="w-4 h-4 text-blue-600 rounded" ${state.ondernemer.urencriteriumGehaald ? 'checked' : ''}>
                        <span class="text-sm font-medium text-gray-700">Urencriterium gehaald (> 1225 uur)</span>
                    </label>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div>
                            <label class="${labelClass}">Privé-stortingen (Totaal)</label>
                             <div class="relative">
                                <span class="absolute left-4 top-2.5 text-gray-500 text-sm">€</span>
                                <input type="number" step="0.01" data-section="prive" data-bind="stortingen" class="${inputClass} pl-8" value="${state.prive.stortingen}">
                            </div>
                        </div>
                        <div>
                            <label class="${labelClass}">Privé-onttrekkingen (Totaal)</label>
                             <div class="relative">
                                <span class="absolute left-4 top-2.5 text-gray-500 text-sm">€</span>
                                <input type="number" step="0.01" data-section="prive" data-bind="onttrekkingenInGeld" class="${inputClass} pl-8" value="${state.prive.onttrekkingenInGeld}">
                            </div>
                        </div>
                    </div>
                </div>
            </section>
            
            <!-- Submit CTA -->
            <div class="mt-10 flex justify-end">
                <button id="btn-generate-report" class="bg-black text-white px-8 py-3.5 rounded-xl text-base font-medium shadow-md hover:bg-gray-800 transition-all flex items-center gap-2">
                    <i data-lucide="calculator" class="w-5 h-5"></i> Bereken Jaarafsluiting &amp; Vraag AI Advies
                </button>
            </div>
        </div>
        
        <div id="report-wrapper" class="hidden max-w-4xl mx-auto pb-12"></div>
    `;
    
    if (window.lucide) window.lucide.createIcons();
}

function renderInventarisTable() {
    const tbody = document.getElementById('inventaris-tbody');
    if (!tbody) return;
    
    const state = fiscalState.getState();
    const inputBase = "w-full bg-transparent border-b border-transparent focus:border-blue-500 outline-none text-sm py-1";

    if (state.inventaris.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-8 text-center text-gray-400">Geen inventaris items gevonden. Voeg een item toe.</td></tr>`;
        return;
    }

    tbody.innerHTML = state.inventaris.map(item => `
        <tr class="hover:bg-gray-50 group transition-colors">
            <td class="px-4 py-2">
                <input type="text" data-inv-id="${item.id}" data-inv-key="omschrijving" class="${inputBase}" value="${item.omschrijving}" placeholder="Bijv. MacBook Pro">
            </td>
            <td class="px-4 py-2">
                <input type="number" data-inv-id="${item.id}" data-inv-key="aankoopJaar" class="${inputBase}" value="${item.aankoopJaar}">
            </td>
            <td class="px-4 py-2">
                <input type="number" step="0.01" data-inv-id="${item.id}" data-inv-key="aankoopBedrag" class="${inputBase}" value="${item.aankoopBedrag}" placeholder="0.00">
            </td>
            <td class="px-4 py-2">
                <input type="number" data-inv-id="${item.id}" data-inv-key="afschrijvingsDuur" class="${inputBase}" value="${item.afschrijvingsDuur}">
            </td>
            <td class="px-4 py-2">
                <input type="number" step="0.01" data-inv-id="${item.id}" data-inv-key="boekwaardeVorigJaar" class="${inputBase}" value="${item.boekwaardeVorigJaar}" placeholder="0.00">
            </td>
            <td class="px-4 py-2 text-center">
                <button data-action="remove-inv" data-id="${item.id}" class="text-gray-300 hover:text-red-500 transition-colors" title="Verwijderen">
                    <i data-lucide="trash-2" class="w-4 h-4 pointer-events-none"></i>
                </button>
            </td>
        </tr>
    `).join('');

    if (window.lucide) window.lucide.createIcons();
}

function setupEventListeners(container) {
    // Two-way Data Binding via Event Delegation
    container.addEventListener('change', (e) => {
        const target = e.target;
        
        // Global State Inputs
        if (target.dataset.bind) {
            const section = target.dataset.section;
            const key = target.dataset.bind;
            let val = target.type === 'checkbox' ? target.checked : target.value;
            if (target.type === 'number') val = parseFloat(val) || 0;

            if (section) fiscalState.setNested(section, key, val);
            else fiscalState.setTopLevel(key, val);
        }

        // Dynamic Inventaris Table
        if (target.dataset.invKey) {
            const id = parseInt(target.dataset.invId, 10);
            const key = target.dataset.invKey;
            let val = target.type === 'number' ? parseFloat(target.value) || 0 : target.value;
            fiscalState.updateInventarisItem(id, key, val);
        }
    });

    container.addEventListener('click', async (e) => {
        const target = e.target;
        
        if (target.id === 'btn-add-inventaris') {
            fiscalState.addInventarisItem({});
            renderInventarisTable();
        }

        const removeBtn = target.closest('[data-action="remove-inv"]');
        if (removeBtn) {
            const id = parseInt(removeBtn.dataset.id, 10);
            fiscalState.removeInventarisItem(id);
            renderInventarisTable();
        }

        const syncBtn = target.closest('#btn-sync-sheets');
        if (syncBtn) {
            const year = fiscalState.getState().year;
            if (!year) return alert("Vul eerst een boekjaar in.");
            
            const originalHtml = syncBtn.innerHTML;
            syncBtn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Ophalen...';
            syncBtn.disabled = true;
            if (window.lucide) window.lucide.createIcons();

            try {
                const data = await collectYearData(year, SPREADSHEET_ID);
                fiscalState.setTopLevel('sheetData', data);
                
                const summary = document.getElementById('sync-summary');
                const formatEur = (num) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(num);
                
                summary.innerHTML = `
                    <div class="font-medium flex items-center gap-2 mb-2">
                        <i data-lucide="check-circle" class="w-4 h-4 text-emerald-600"></i> Data succesvol gesynchroniseerd voor ${year}
                    </div>
                    <ul class="list-disc list-inside space-y-1 ml-1 text-emerald-700">
                        <li>Totale Omzet: <span class="font-semibold">${formatEur(data.omzet.totaal)}</span></li>
                        <li>Totale Kosten (excl. BTW): <span class="font-semibold">${formatEur(data.kosten.totaal)}</span></li>
                        <li>BTW Afgedragen (Saldo): <span class="font-semibold">${formatEur(data.btwAfgedragen.totaal - data.voorbelasting.totaal)}</span></li>
                    </ul>
                `;
                summary.classList.remove('hidden');
                
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
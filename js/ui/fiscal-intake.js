import { fiscalState } from '../store/fiscal-state.js';
import { collectYearData } from '../api/tax-collector.js';
import { getYearlyTotals, fetchInventarisFromSheet, addInventarisItemToSheet } from '../api/storage-queries.js';
import { calculateTaxes } from '../utils/tax-calculator.js';
import { getFiscalAdvice, clearChatHistory } from '../api/tax-advisor.js';
import { renderFiscalReport } from './fiscal-report.js';
import { getInventarisKandidaten } from '../api/inventaris-kandidaten.js';

const SPREADSHEET_IDS = {
    2023: '1wMnw3BTyNvvl9CCCKt78PGhl6PBQyLFnNe2XKCO16Wg',
    2024: '1OFzhw4r6eDkKcOxXuzJ6MoKO1O5CiKmmZR83e33QEsM',
    2025: '1WIY9la9KpdRuRItTi2qfjRmmmkNeoxQf7VMihRjw0TI',
    2026: '119dQIOSLFpKDqWUQUMWTU9miIKP3MOR1VHFB5yzmBrg',
};

// ---------------------------------------------------------------------------
// CSV Parser — Privé-stortingen in geld
//
// Verwacht bankafschrift (zakelijke rekening) als CSV van ING, Rabobank, KNAB,
// of elk ander formaat dat voldoet aan:
//   • delimiter: ';' of ','
//   • een kolom die de tegenrekening (privé-IBAN) bevat
//     (kolomnaam bevat 'tegenrekening', 'tegenpartijrekening', 'contra' etc.)
//   • een bedrag-kolom ('bedrag', 'amount')
//   • optioneel een richting-kolom ('af bij', 'bij/af', 'creditdebet', 'd/c')
//     → alleen "Bij" / "C" / "Credit" telt als inkomend op de zakelijke rekening
//
// Bedragen zonder richting-kolom worden als positief (inkomend) beschouwd
// wanneer het contra-IBAN overeenkomt.
// ---------------------------------------------------------------------------

function _parseCsvRows(text, delimiter) {
    const rows = [];
    for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue;
        const cols = [];
        let cur = '';
        let inQ = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
                else inQ = !inQ;
            } else if (ch === delimiter && !inQ) {
                cols.push(cur.trim());
                cur = '';
            } else {
                cur += ch;
            }
        }
        cols.push(cur.trim());
        rows.push(cols);
    }
    return rows;
}

function _parseEuroAmount(val) {
    let s = String(val ?? '').trim().replace(/[€\s]/g, '');
    if (!s) return 0;
    const hasComma = s.includes(',');
    const hasDot   = s.includes('.');
    if (hasComma && hasDot) {
        // Dutch 1.234,56 vs English 1,234.56 — whichever separator comes last is the decimal
        s = s.lastIndexOf(',') > s.lastIndexOf('.')
            ? s.replace(/\./g, '').replace(',', '.')   // Dutch
            : s.replace(/,/g, '');                      // English
    } else if (hasComma) {
        const parts = s.split(',');
        // 1234,56 → decimal  |  1,234 → thousands
        s = (parts.length === 2 && parts[1].length <= 2) ? s.replace(',', '.') : s.replace(/,/g, '');
    }
    const n = parseFloat(s);
    return isNaN(n) ? 0 : Math.abs(n);
}

function parsePriveStortingenCSV(csvText, privateIban) {
    const normIban = privateIban.replace(/\s/g, '').toUpperCase();
    if (!normIban) return null;

    const firstLine = csvText.split('\n')[0] || '';
    const delimiter = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ';' : ',';

    const rows = _parseCsvRows(csvText, delimiter);
    if (rows.length < 2) return null;

    // Normalize header names to lowercase alphanumeric for matching
    const headers = rows[0].map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
    const findCol = (...kws) => headers.findIndex(h => kws.some(kw => h.includes(kw)));

    const idxContra = findCol('tegenrekening', 'tegenpartijrekening', 'contraaccount', 'contrarekeningnummer', 'rekeningnummertegenpartij');
    const idxBedrag = findCol('bedrag', 'amount');
    const idxDir    = findCol('afbij', 'bijaf', 'creditdebet', 'debitcredit');
    // Fallback: search description columns if no contra column found
    const idxOmschr = findCol('omschrijving', 'mededelingen', 'description', 'betalingskenmerk');

    let totaal = 0;
    let count  = 0;

    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length < 2) continue;

        // Match private IBAN in contra-account or description
        const contraRaw = idxContra >= 0 ? row[idxContra] || '' : '';
        const omschrRaw = idxOmschr >= 0 ? row[idxOmschr] || '' : '';
        const contraNorm = contraRaw.replace(/\s/g, '').toUpperCase();
        const omschrNorm = omschrRaw.replace(/\s/g, '').toUpperCase();

        if (!contraNorm.includes(normIban) && !omschrNorm.includes(normIban)) continue;

        // Verify direction: must be incoming on the business account
        if (idxDir >= 0) {
            const dir = (row[idxDir] || '').toLowerCase().replace(/\s/g, '');
            const isCredit = dir === 'bij' || dir === 'c' || dir === 'credit' || dir === 'cr';
            if (!isCredit) continue;
        }

        const amount = idxBedrag >= 0 ? _parseEuroAmount(row[idxBedrag]) : 0;
        if (amount > 0) { totaal += amount; count++; }
    }

    return { totaal: Math.round(totaal * 100) / 100, count };
}

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
        const mapped = items.map(item => ({
            id: item.id,
            omschrijving:       item.omschrijving,
            aankoopJaar:        item.datum,
            aankoopBedrag:      item.aanschafwaarde,
            afschrijvingsDuur:  item.afschrijvingsJaren,
            boekwaardeVorigJaar: item.restwaarde,
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
                    <button id="btn-reset-state" class="w-full sm:w-auto bg-white border border-red-200 text-red-500 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-red-50 transition-colors flex items-center justify-center gap-2" title="Wis alle opgeslagen data voor dit boekjaar">
                        <i data-lucide="trash-2" class="w-4 h-4"></i> Formulier wissen
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

                <!-- Upload zone -->
                <label id="bank-upload-label" class="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors mb-5">
                    <div id="bank-upload-idle" class="flex flex-col items-center gap-1 text-gray-400">
                        <i data-lucide="upload-cloud" class="w-6 h-6"></i>
                        <span class="text-sm font-medium">Upload jaaropgave zakelijke rekening</span>
                        <span class="text-xs">PDF of afbeelding — saldi worden automatisch ingevuld</span>
                    </div>
                    <div id="bank-upload-loading" class="hidden flex-col items-center gap-2 text-blue-500">
                        <i data-lucide="loader-2" class="w-6 h-6 animate-spin"></i>
                        <span class="text-sm font-medium">Bankafschrift analyseren...</span>
                    </div>
                    <input id="bank-statement-upload" type="file" accept=".pdf,image/*" class="hidden">
                </label>

                <!-- Saldi velden (altijd zichtbaar, ook handmatig invulbaar) -->
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
                <p id="bank-scan-result" class="hidden mt-3 text-xs text-emerald-600 flex items-center gap-1">
                    <i data-lucide="check-circle" class="w-3.5 h-3.5"></i> <span></span>
                </p>
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
                    <div class="flex gap-2">
                        <button id="btn-zoek-kandidaten" class="text-sm bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 py-1.5 px-3 rounded-lg font-medium transition-colors flex items-center gap-1.5">
                            <i data-lucide="sparkles" class="w-3.5 h-3.5"></i> Zoek nieuwe investeringen
                        </button>
                        <button id="btn-add-inventaris" class="text-sm bg-gray-100 hover:bg-gray-200 text-gray-800 py-1.5 px-3 rounded-lg font-medium transition-colors">
                            + Handmatig toevoegen
                        </button>
                    </div>
                </div>
                <table class="w-full text-sm text-left border-collapse min-w-[780px]">
                    <thead class="text-xs text-gray-500 uppercase bg-gray-50 border-y border-gray-200">
                        <tr>
                            <th class="px-4 py-3 font-medium">Omschrijving</th>
                            <th class="px-4 py-3 font-medium w-24">Aanschaf(J)</th>
                            <th class="px-4 py-3 font-medium w-28">Bedrag (€)</th>
                            <th class="px-4 py-3 font-medium w-20">Jaren</th>
                            <th class="px-4 py-3 font-medium w-28">Boekw. begin</th>
                            <th class="px-4 py-3 font-medium w-28 text-rose-400">Afschr. dit jaar</th>
                            <th class="px-4 py-3 font-medium w-28 text-emerald-600">Boekw. eind</th>
                            <th class="px-4 py-3 font-medium w-12 text-center">Actie</th>
                        </tr>
                    </thead>
                    <tbody id="inventaris-tbody" class="divide-y divide-gray-100">
                        <!-- Geïnjecteerd via JS -->
                    </tbody>
                </table>
                <!-- Inline toevoeg-formulier (verborgen tot "Handmatig toevoegen" wordt geklikt) -->
                <div id="inventaris-add-form" class="hidden mt-4 p-4 bg-blue-50 border border-blue-100 rounded-xl space-y-3">
                    <p class="text-xs font-semibold text-gray-600 uppercase tracking-wide">Nieuw item toevoegen</p>
                    <div class="grid grid-cols-2 sm:grid-cols-5 gap-3">
                        <div class="col-span-2 sm:col-span-2">
                            <label class="block text-xs font-medium text-gray-500 mb-1">Omschrijving</label>
                            <input type="text" id="inv-new-omschrijving" placeholder="Bijv. MacBook Pro" class="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400/20">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-500 mb-1">Aanschafjaar</label>
                            <input type="number" id="inv-new-datum" value="${state.year}" class="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400/20">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-500 mb-1">Bedrag excl. BTW (€)</label>
                            <input type="number" step="0.01" id="inv-new-aanschafwaarde" placeholder="0.00" class="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400/20">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-500 mb-1">Afschr. jaren</label>
                            <input type="number" id="inv-new-afschrijvingsjaren" value="5" class="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400/20">
                        </div>
                    </div>
                    <div class="flex gap-2 justify-end">
                        <button id="btn-cancel-inventaris" class="text-sm bg-white border border-gray-200 text-gray-600 px-4 py-2 rounded-lg font-medium hover:bg-gray-50 transition-colors">Annuleren</button>
                        <button id="btn-save-inventaris-item" class="text-sm bg-black text-white px-4 py-2 rounded-lg font-medium hover:bg-gray-800 transition-colors flex items-center gap-2">
                            <i data-lucide="save" class="w-3.5 h-3.5"></i> Opslaan in Sheet
                        </button>
                    </div>
                </div>

                <div id="inventaris-kandidaten" class="hidden mt-5 space-y-3">
                    <p class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Gevonden investeringen — klik om toe te voegen aan inventaris</p>
                    <div id="kandidaten-lijst" class="space-y-2"></div>
                </div>
            </section>

            <!-- 5. Privé & Fiscaal -->
            <section class="${sectionClass}">
                <h3 class="${headerClass}">
                    <i data-lucide="user" class="w-5 h-5 text-blue-500"></i> 5. Privé — Stortingen & Onttrekkingen
                </h3>
                <div class="space-y-6">
                    <label class="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200 cursor-pointer">
                        <input type="checkbox" data-section="ondernemer" data-bind="urencriteriumGehaald" class="w-4 h-4 text-blue-600 rounded" ${state.ondernemer.urencriteriumGehaald ? 'checked' : ''}>
                        <span class="text-sm font-medium text-gray-700">Urencriterium gehaald (> 1225 uur)</span>
                    </label>

                    <!-- Onttrekkingen -->
                    <div>
                        <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Onttrekkingen (uit onderneming naar privé)</p>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
                            <div>
                                <div class="flex items-center justify-between mb-1.5">
                                    <label class="${labelClass} !mb-0">Onttrekkingen in geld</label>
                                    <span class="text-xs bg-emerald-50 text-emerald-600 border border-emerald-100 px-2 py-0.5 rounded-full">auto-ingevuld</span>
                                </div>
                                <p class="text-xs text-gray-400 mb-1.5">Omzet incl. BTW op privérekening ontvangen</p>
                                <div class="relative">
                                    <span class="absolute left-4 top-2.5 text-gray-500 text-sm">€</span>
                                    <input type="number" step="0.01" data-section="prive" data-bind="onttrekkingenInGeld" class="${inputClass} pl-8" value="${state.prive.onttrekkingenInGeld}">
                                </div>
                            </div>
                            <div>
                                <label class="${labelClass}">Onttrekkingen in natura</label>
                                <p class="text-xs text-gray-400 mb-1.5">Privégebruik bedrijfsmiddelen (excl. auto — die staat bij bijtelling)</p>
                                <div class="relative">
                                    <span class="absolute left-4 top-2.5 text-gray-500 text-sm">€</span>
                                    <input type="number" step="0.01" data-section="prive" data-bind="onttrekkingenInNatura" class="${inputClass} pl-8" value="${state.prive.onttrekkingenInNatura || 0}">
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Stortingen -->
                    <div>
                        <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Stortingen (uit privé naar onderneming)</p>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
                            <div>
                                <label class="${labelClass}">Stortingen in geld</label>
                                <p class="text-xs text-gray-400 mb-1.5">Cash stortingen op zakelijke rekening (bijv. leasebetaling)</p>

                                <!-- CSV import tool -->
                                <div class="mb-3 p-3 bg-blue-50 border border-blue-100 rounded-xl space-y-2">
                                    <p class="text-xs font-semibold text-blue-700">Automatisch ophalen uit CSV</p>
                                    <input type="text" id="prive-iban-input"
                                           value="${localStorage.getItem('bfe_private_iban') || ''}"
                                           placeholder="NL12 INGB 0123 4567 89"
                                           class="w-full bg-white border border-blue-200 rounded-lg px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-400/20 tracking-wider placeholder-gray-300">
                                    <label class="flex items-center gap-2 cursor-pointer text-xs text-blue-600 hover:text-blue-800 font-medium">
                                        <i data-lucide="upload-cloud" class="w-3.5 h-3.5 shrink-0"></i>
                                        <span>Upload zakelijk bankafschrift (.csv)</span>
                                        <input type="file" id="csv-stortingen-upload" accept=".csv" class="hidden">
                                    </label>
                                    <p id="csv-stortingen-result" class="hidden text-xs font-medium"></p>
                                </div>

                                <div class="relative">
                                    <span class="absolute left-4 top-2.5 text-gray-500 text-sm">€</span>
                                    <input type="number" step="0.01" data-section="prive" data-bind="stortingenInGeld" class="${inputClass} pl-8" value="${state.prive.stortingenInGeld || 0}">
                                </div>
                            </div>
                            <div>
                                <div class="flex items-center justify-between mb-1.5">
                                    <label class="${labelClass} !mb-0">Stortingen in natura</label>
                                    <span class="text-xs bg-emerald-50 text-emerald-600 border border-emerald-100 px-2 py-0.5 rounded-full">auto-ingevuld</span>
                                </div>
                                <p class="text-xs text-gray-400 mb-1.5">Zakelijke kosten betaald via privérekening (inkoop incl. BTW)</p>
                                <div class="relative">
                                    <span class="absolute left-4 top-2.5 text-gray-500 text-sm">€</span>
                                    <input type="number" step="0.01" data-section="prive" data-bind="stortingenInNatura" class="${inputClass} pl-8" value="${state.prive.stortingenInNatura || 0}">
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
            
            <!-- 6. Balans — Kortlopende Schulden & FOR -->
            <section class="${sectionClass}">
                <h3 class="${headerClass}">
                    <i data-lucide="scale" class="w-5 h-5 text-blue-500"></i> 6. Balans — Schulden & FOR
                </h3>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                        <label class="${labelClass}">Kortlopende schulden (31 dec)</label>
                        <p class="text-xs text-gray-400 mb-1.5">Creditcardschuld of overige schulden per jaareinde</p>
                        <div class="relative">
                            <span class="absolute left-4 top-2.5 text-gray-500 text-sm">€</span>
                            <input type="number" step="0.01" data-section="balans" data-bind="kortlopendeSchulden" class="${inputClass} pl-8" value="${state.balans?.kortlopendeSchulden || 0}">
                        </div>
                    </div>
                    <div>
                        <label class="${labelClass}">FOR-stand op balans</label>
                        <p class="text-xs text-gray-400 mb-1.5">Fiscale Oudedagsreserve (afgeschaft 2023, bestaand saldo blijft staan)</p>
                        <div class="relative">
                            <span class="absolute left-4 top-2.5 text-gray-500 text-sm">€</span>
                            <input type="number" step="0.01" data-section="balans" data-bind="forStand" class="${inputClass} pl-8" value="${state.balans?.forStand ?? 2143}">
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

    const fmt = (n) => Number(n).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    if (state.inventaris.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="px-4 py-8 text-center text-gray-400">Geen inventaris items gevonden. Voeg een item toe.</td></tr>`;
        return;
    }

    tbody.innerHTML = state.inventaris.map(item => {
        const aankoopBedrag     = parseFloat(item.aankoopBedrag) || 0;
        const afschrijvingsDuur = parseFloat(item.afschrijvingsDuur) || 5;
        const boekwaardeBegin   = parseFloat(item.boekwaardeVorigJaar) || 0;
        const jaarlinkseAfschr  = aankoopBedrag / afschrijvingsDuur;
        const afschrDitJaar     = Math.min(jaarlinkseAfschr, Math.max(0, boekwaardeBegin));
        const boekwaardeEind    = Math.max(0, boekwaardeBegin - afschrDitJaar);

        return `
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
            <td class="px-4 py-2 text-rose-500 text-right pr-6">− ${fmt(afschrDitJaar)}</td>
            <td class="px-4 py-2 font-medium text-right pr-6 ${boekwaardeEind === 0 ? 'text-gray-300' : 'text-emerald-700'}">€ ${fmt(boekwaardeEind)}</td>
            <td class="px-4 py-2 text-center">
                <button data-action="remove-inv" data-id="${item.id}" class="text-gray-300 hover:text-red-500 transition-colors" title="Verwijderen">
                    <i data-lucide="trash-2" class="w-4 h-4 pointer-events-none"></i>
                </button>
            </td>
        </tr>`;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
}

function updateInventarisRijBerekening(id) {
    const item = fiscalState.getState().inventaris.find(i => i.id === id);
    if (!item) return;

    const aankoopBedrag     = parseFloat(item.aankoopBedrag) || 0;
    const afschrijvingsDuur = parseFloat(item.afschrijvingsDuur) || 5;
    const boekwaardeBegin   = parseFloat(item.boekwaardeVorigJaar) || 0;
    const jaarlinkseAfschr  = aankoopBedrag / afschrijvingsDuur;
    const afschrDitJaar     = Math.min(jaarlinkseAfschr, Math.max(0, boekwaardeBegin));
    const boekwaardeEind    = Math.max(0, boekwaardeBegin - afschrDitJaar);

    const fmt = (n) => Number(n).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // Vind de rij via een input met data-inv-id op dit id
    const anyInput = document.querySelector(`[data-inv-id="${id}"]`);
    if (!anyInput) return;
    const row = anyInput.closest('tr');
    if (!row) return;

    const cells = row.querySelectorAll('td');
    // Col 5 = Afschr. dit jaar, Col 6 = Boekw. eind
    if (cells[5]) cells[5].textContent = `− ${fmt(afschrDitJaar)}`;
    if (cells[6]) {
        cells[6].textContent = `€ ${fmt(boekwaardeEind)}`;
        cells[6].className = `px-4 py-2 font-medium text-right pr-6 ${boekwaardeEind === 0 ? 'text-gray-300' : 'text-emerald-700'}`;
    }
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
        
        if (target.id === 'btn-add-inventaris') {
            const form = document.getElementById('inventaris-add-form');
            if (form) {
                form.classList.toggle('hidden');
                if (!form.classList.contains('hidden')) {
                    document.getElementById('inv-new-omschrijving')?.focus();
                    if (window.lucide) window.lucide.createIcons();
                }
            }
        }

        if (target.id === 'btn-cancel-inventaris') {
            const form = document.getElementById('inventaris-add-form');
            if (form) {
                form.classList.add('hidden');
                document.getElementById('inv-new-omschrijving').value = '';
                document.getElementById('inv-new-aanschafwaarde').value = '';
                document.getElementById('inv-new-afschrijvingsjaren').value = '5';
            }
        }

        if (target.closest('#btn-save-inventaris-item')) {
            const saveBtn = document.getElementById('btn-save-inventaris-item');
            const omschrijving  = document.getElementById('inv-new-omschrijving')?.value.trim();
            const datum         = document.getElementById('inv-new-datum')?.value.trim();
            const aanschafwaarde = parseFloat(document.getElementById('inv-new-aanschafwaarde')?.value) || 0;
            const afschrijvingsJaren = parseInt(document.getElementById('inv-new-afschrijvingsjaren')?.value, 10) || 5;

            if (!omschrijving) {
                alert('Vul een omschrijving in.');
                return;
            }
            if (aanschafwaarde <= 0) {
                alert('Vul een geldig aanschafbedrag in.');
                return;
            }

            const newItem = { omschrijving, datum, aanschafwaarde, afschrijvingsJaren, restwaarde: aanschafwaarde };

            const originalHtml = saveBtn.innerHTML;
            saveBtn.innerHTML = '<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i> Bezig met opslaan...';
            saveBtn.disabled = true;
            if (window.lucide) window.lucide.createIcons();

            try {
                await addInventarisItemToSheet(newItem);

                // Lokale state bijwerken na succesvolle opslag
                fiscalState.addInventarisItem({
                    omschrijving,
                    aankoopJaar:        datum,
                    aankoopBedrag:      aanschafwaarde,
                    afschrijvingsDuur:  afschrijvingsJaren,
                    boekwaardeVorigJaar: aanschafwaarde,
                });
                renderInventarisTable();

                // Formulier sluiten en leegmaken
                document.getElementById('inventaris-add-form').classList.add('hidden');
                document.getElementById('inv-new-omschrijving').value = '';
                document.getElementById('inv-new-aanschafwaarde').value = '';
                document.getElementById('inv-new-afschrijvingsjaren').value = '5';

            } catch (err) {
                alert(`Fout bij opslaan in sheet: ${err.message}`);
            } finally {
                saveBtn.innerHTML = originalHtml;
                saveBtn.disabled = false;
                if (window.lucide) window.lucide.createIcons();
            }
        }

        const removeBtn = target.closest('[data-action="remove-inv"]');
        if (removeBtn) {
            const id = parseInt(removeBtn.dataset.id, 10);
            fiscalState.removeInventarisItem(id);
            renderInventarisTable();
        }

        // Kandidaat toevoegen aan inventaris
        const addKandidaatBtn = target.closest('[data-action="add-kandidaat"]');
        if (addKandidaatBtn) {
            const kaart = addKandidaatBtn.closest('[data-kandidaat]');
            const item = JSON.parse(decodeURIComponent(kaart.dataset.kandidaat));
            const year = parseInt(fiscalState.getState().year, 10);
            fiscalState.addInventarisItem({
                omschrijving:      item.omschrijving,
                aankoopJaar:       year,
                aankoopBedrag:     item.aankoopBedrag,
                afschrijvingsDuur: item.afschrijvingsDuur,
                boekwaardeVorigJaar: item.aankoopBedrag  // nieuw in dit jaar: beginwaarde = aankoopbedrag
            });
            renderInventarisTable();
            kaart.remove();
            // Verberg sectie als er geen kandidaten meer zijn
            if (!document.querySelector('#kandidaten-lijst [data-kandidaat]')) {
                document.getElementById('inventaris-kandidaten').classList.add('hidden');
            }
        }

        // Kandidaat afwijzen
        const skipKandidaatBtn = target.closest('[data-action="skip-kandidaat"]');
        if (skipKandidaatBtn) {
            skipKandidaatBtn.closest('[data-kandidaat]').remove();
            if (!document.querySelector('#kandidaten-lijst [data-kandidaat]')) {
                document.getElementById('inventaris-kandidaten').classList.add('hidden');
            }
        }

        // Zoek kandidaten in spreadsheet
        const zoekBtn = target.closest('#btn-zoek-kandidaten');
        if (zoekBtn) {
            const state = fiscalState.getState();
            const year = state.year;
            const spreadsheetId = SPREADSHEET_IDS[parseInt(year)];

            if (!spreadsheetId) return alert(`Geen spreadsheet geconfigureerd voor ${year}.`);

            const originalHtml = zoekBtn.innerHTML;
            zoekBtn.innerHTML = '<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i> Analyseren...';
            zoekBtn.disabled = true;
            if (window.lucide) window.lucide.createIcons();

            try {
                const kandidaten = await getInventarisKandidaten(year, spreadsheetId);

                const kandidatenWrapper = document.getElementById('inventaris-kandidaten');
                const kandidatenLijst   = document.getElementById('kandidaten-lijst');

                if (kandidaten.length === 0) {
                    kandidatenLijst.innerHTML = `<p class="text-sm text-gray-400 italic">Geen activeerbare investeringen gevonden boven €450 in ${year}.</p>`;
                    kandidatenWrapper.classList.remove('hidden');
                } else {
                    // Markeer items die al in de inventaris staan op basis van omschrijving + aankoopbedrag (±€1)
                    const bestaand = state.inventaris;
                    const beoordeeld = kandidaten.map(k => ({
                        ...k,
                        alBestaand: bestaand.some(b =>
                            b.omschrijving.toLowerCase() === k.omschrijving.toLowerCase() &&
                            Math.abs(b.aankoopBedrag - k.aankoopBedrag) < 1
                        )
                    }));

                    const fmt = (n) => Number(n).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    kandidatenLijst.innerHTML = beoordeeld.map(k => k.alBestaand
                        ? `<div class="flex items-center gap-3 px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl opacity-50">
                                <i data-lucide="check-circle" class="w-4 h-4 text-gray-400 shrink-0"></i>
                                <span class="text-sm text-gray-400 line-through">${k.omschrijving}</span>
                                <span class="text-xs text-gray-400 ml-auto">€${fmt(k.aankoopBedrag)} — al in inventaris</span>
                           </div>`
                        : `<div data-kandidaat="${encodeURIComponent(JSON.stringify(k))}"
                                 class="flex items-start justify-between gap-4 p-4 bg-blue-50 border border-blue-100 rounded-xl">
                                <div class="flex-1 min-w-0">
                                    <p class="font-semibold text-sm text-gray-800">${k.omschrijving}</p>
                                    <p class="text-xs text-gray-500 mt-0.5">${k.leverancier}${k.datum ? ' · ' + k.datum : ''} · €${fmt(k.aankoopBedrag)} · ${k.afschrijvingsDuur} jaar afschrijving</p>
                                    <p class="text-xs text-blue-600 mt-1 italic">${k.reden}</p>
                                </div>
                                <div class="flex gap-2 shrink-0">
                                    <button data-action="add-kandidaat" class="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg font-medium transition-colors">Toevoegen</button>
                                    <button data-action="skip-kandidaat" class="text-xs bg-white hover:bg-gray-100 text-gray-500 border border-gray-200 px-3 py-1.5 rounded-lg font-medium transition-colors">Overslaan</button>
                                </div>
                            </div>
                        `).join('');
                    kandidatenWrapper.classList.remove('hidden');
                }

            } catch (err) {
                alert(`Fout bij zoeken naar kandidaten: ${err.message}`);
            } finally {
                zoekBtn.innerHTML = originalHtml;
                zoekBtn.disabled = false;
                if (window.lucide) window.lucide.createIcons();
            }
        }

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
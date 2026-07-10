import { fiscalState } from '../store/fiscal-state.js';
import { collectYearData } from '../api/tax-collector.js';
import { getYearlyTotals, fetchInventarisFromSheet, addInventarisItemToSheet, deleteInventarisItemFromSheet } from '../api/storage-queries.js';
import { calculateTaxes } from '../utils/tax-calculator.js';
import { getFiscalAdvice, clearChatHistory } from '../api/tax-advisor.js';
import { renderFiscalReport } from './fiscal-report.js';
import { getInventarisKandidaten } from '../api/inventaris-kandidaten.js';
import { parsePriveStortingenCSV } from '../utils/csv-parser.js';
import { getFiscalIntakeHTML } from './templates/fiscal-intake-template.js';

const SPREADSHEET_IDS = {
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

    const huidigJaar = parseInt(fiscalState.getState().year, 10);
    let totaleAfschrijving = 0;


    tbody.innerHTML = state.inventaris.map(item => {
        const aanschafJaar = parseInt(item.aankoopJaar || item.datum, 10);
        const bedrag = parseFloat(item.aankoopBedrag || item.aanschafwaarde || 0);
        const jaren = parseInt(item.afschrijvingsDuur || item.afschrijvingsJaren || 5, 10);
        const restwaarde = parseFloat(item.restwaarde || 0);

        const afschrijvingPerJaar = jaren > 0 ? (bedrag - restwaarde) / jaren : 0;
        const jarenVooraf = Math.max(0, huidigJaar - aanschafJaar);

        let boekwaardeBegin = bedrag - (jarenVooraf * afschrijvingPerJaar);
        if (boekwaardeBegin < restwaarde) boekwaardeBegin = restwaarde;

        let afschrijvingDitJaar = 0;
        if (huidigJaar >= aanschafJaar && boekwaardeBegin > restwaarde) {
            afschrijvingDitJaar = Math.min(afschrijvingPerJaar, boekwaardeBegin - restwaarde);
        }

        totaleAfschrijving += afschrijvingDitJaar;

        let boekwaardeEind = boekwaardeBegin - afschrijvingDitJaar;

        const isNieuwDitJaar = (aanschafJaar === huidigJaar);
        // Only safe to delete if it entered the year already fully depreciated, generating 0 expenses this year.
        const isHistorischAfgeschreven = (boekwaardeBegin <= restwaarde && afschrijvingDitJaar === 0);
        const magVerwijderen = isNieuwDitJaar || isHistorischAfgeschreven;

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
            <td class="px-4 py-2 text-right pr-6 text-gray-700">€ ${fmt(boekwaardeBegin)}</td>
            <td class="px-4 py-2 text-rose-500 text-right pr-6">− ${fmt(afschrijvingDitJaar)}</td>
            <td class="px-4 py-2 font-medium text-right pr-6 ${boekwaardeEind <= restwaarde ? 'text-gray-300' : 'text-emerald-700'}">€ ${fmt(boekwaardeEind)}</td>
            <td class="px-4 py-2 text-center">
                <button data-action="remove-inv" data-id="${item.id}"
                    class="transition-colors ${magVerwijderen ? 'text-gray-300 hover:text-red-500' : 'text-gray-200 cursor-not-allowed opacity-40'}"
                    title="${magVerwijderen ? 'Verwijderen' : 'Kan niet worden verwijderd tijdens actieve afschrijvingsperiode'}"
                    ${magVerwijderen ? '' : 'disabled'}>
                    <i data-lucide="trash-2" class="w-4 h-4 pointer-events-none"></i>
                </button>
            </td>
        </tr>`;
    }).join('');

    fiscalState.setTopLevel('afschrijvingen', totaleAfschrijving);

    if (window.lucide) window.lucide.createIcons();
}

function updateInventarisRijBerekening(id) {
    const item = fiscalState.getState().inventaris.find(i => i.id === id);
    if (!item) return;

    const huidigJaar = parseInt(fiscalState.getState().year, 10);

    const aanschafJaar = parseInt(item.aankoopJaar || item.datum, 10);
    const bedrag = parseFloat(item.aankoopBedrag || item.aanschafwaarde || 0);
    const jaren = parseInt(item.afschrijvingsDuur || item.afschrijvingsJaren || 5, 10);
    const restwaarde = parseFloat(item.restwaarde || 0);

    const afschrijvingPerJaar = jaren > 0 ? (bedrag - restwaarde) / jaren : 0;
    const jarenVooraf = Math.max(0, huidigJaar - aanschafJaar);

    let boekwaardeBegin = bedrag - (jarenVooraf * afschrijvingPerJaar);
    if (boekwaardeBegin < restwaarde) boekwaardeBegin = restwaarde;

    let afschrijvingDitJaar = 0;
    if (huidigJaar >= aanschafJaar && boekwaardeBegin > restwaarde) {
        afschrijvingDitJaar = Math.min(afschrijvingPerJaar, boekwaardeBegin - restwaarde);
    }

    let boekwaardeEind = boekwaardeBegin - afschrijvingDitJaar;

    const fmt = (n) => Number(n).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const anyInput = document.querySelector(`[data-inv-id="${id}"]`);
    if (!anyInput) return;
    const row = anyInput.closest('tr');
    if (!row) return;

    const cells = row.querySelectorAll('td');
    // td[4] = Boekw. begin, td[5] = Afschr. dit jaar, td[6] = Boekw. eind
    if (cells[4]) cells[4].textContent = `€ ${fmt(boekwaardeBegin)}`;
    if (cells[5]) cells[5].textContent = `− ${fmt(afschrijvingDitJaar)}`;
    if (cells[6]) {
        cells[6].textContent = `€ ${fmt(boekwaardeEind)}`;
        cells[6].className = `px-4 py-2 font-medium text-right pr-6 ${boekwaardeEind <= restwaarde ? 'text-gray-300' : 'text-emerald-700'}`;
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
                    aankoopJaar:      datum,
                    aankoopBedrag:    aanschafwaarde,
                    afschrijvingsDuur: afschrijvingsJaren,
                    restwaarde:       0,
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
        if (removeBtn && !removeBtn.disabled) {
            const id = parseInt(removeBtn.dataset.id, 10);
            const row = removeBtn.closest('tr');

            removeBtn.disabled = true;
            removeBtn.innerHTML = `<span class="text-xs text-gray-400">...</span>`;
            if (row) row.style.opacity = '0.5';

            try {
                await deleteInventarisItemFromSheet(id);
                fiscalState.removeInventarisItem(id);
                renderInventarisTable();
            } catch (err) {
                console.error('Fout bij verwijderen inventaris item:', err);
                if (row) row.style.opacity = '';
                removeBtn.disabled = false;
                removeBtn.innerHTML = `<i data-lucide="trash-2" class="w-4 h-4 pointer-events-none"></i>`;
                if (window.lucide) window.lucide.createIcons();
                alert(`Verwijderen mislukt: ${err.message}`);
            }
        }

        // Kandidaat toevoegen aan inventaris
        const addKandidaatBtn = target.closest('[data-action="add-kandidaat"]');
        if (addKandidaatBtn && !addKandidaatBtn.disabled) {
            const kaart = addKandidaatBtn.closest('[data-kandidaat]');
            const kandidaat = JSON.parse(decodeURIComponent(kaart.dataset.kandidaat));
            const year = parseInt(fiscalState.getState().year, 10);

            const newItem = {
                id:               Date.now(),
                omschrijving:     kandidaat.omschrijving,
                aankoopJaar:      year,
                aankoopBedrag:    kandidaat.aankoopBedrag,
                afschrijvingsDuur: kandidaat.afschrijvingsDuur || 5,
                restwaarde:       0,
            };

            const originalHtml = addKandidaatBtn.innerHTML;
            addKandidaatBtn.textContent = 'Toevoegen...';
            addKandidaatBtn.disabled = true;

            try {
                await addInventarisItemToSheet(newItem);
                // Use setTopLevel to preserve the generated ID in local state
                const current = fiscalState.getState().inventaris;
                fiscalState.setTopLevel('inventaris', [...current, newItem]);
                renderInventarisTable();
                kaart.remove();
                if (!document.querySelector('#kandidaten-lijst [data-kandidaat]')) {
                    document.getElementById('inventaris-kandidaten').classList.add('hidden');
                }
            } catch (err) {
                console.error('Fout bij opslaan kandidaat in sheet:', err);
                alert(`Kon kandidaat niet toevoegen aan Google Sheets: ${err.message}`);
                addKandidaatBtn.innerHTML = originalHtml;
                addKandidaatBtn.disabled = false;
                if (window.lucide) window.lucide.createIcons();
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
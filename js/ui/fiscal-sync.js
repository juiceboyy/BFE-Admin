/**
 * js/ui/fiscal-sync.js
 * Beheert Google Sheet synchronisatie en interactieve maandelijkse controle-weergave.
 */

import { fiscalState } from '../store/fiscal-state.js';
import { collectYearData } from '../api/tax-collector.js';
import { SPREADSHEET_IDS } from './fiscal-intake.js';

const fmt = (num) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(num || 0);

/**
 * Voert de jaarsynchronisatie uit voor het geselecteerde boekjaar.
 */
export async function handleSyncSheets(container, setSpinner) {
    const year = fiscalState.getState().year;
    if (!year) {
        alert("Vul eerst een boekjaar in.");
        return;
    }

    const spreadsheetId = SPREADSHEET_IDS[parseInt(year, 10)];
    if (!spreadsheetId) {
        alert(`Geen spreadsheet geconfigureerd voor ${year}.`);
        return;
    }

    setSpinner(`Jaardata ophalen voor ${year}...`);

    try {
        const data = await collectYearData(year, spreadsheetId);

        // State bijwerken
        fiscalState.setTopLevel('sheetData', data);
        fiscalState.setNested('prive', 'onttrekkingenInGeld', data.totals.priveOnttrekkingenGeld);
        fiscalState.setNested('prive', 'stortingenInNatura',  data.totals.priveStortingenNatura);

        // DOM inputs bijwerken
        const setInput = (section, bind, value) => {
            const el = container.querySelector(`[data-section="${section}"][data-bind="${bind}"]`);
            if (el) el.value = value;
        };
        setInput('prive', 'onttrekkingenInGeld', data.totals.priveOnttrekkingenGeld);
        setInput('prive', 'stortingenInNatura',  data.totals.priveStortingenNatura);

        renderSyncSummary(container, year, spreadsheetId, data);

    } catch (error) {
        alert(`Fout bij ophalen van data voor ${year}: ${error.message}`);
        console.error(error);
    }
}

/**
 * Herstelt de synchronisatie-samenvatting als er al sheetData in de state aanwezig is.
 */
export function restoreSyncSummary(container) {
    const state = fiscalState.getState();
    const sheetData = state.sheetData;
    if (!sheetData || !sheetData.totals) return;

    const year = state.year;
    const spreadsheetId = sheetData.spreadsheetId || SPREADSHEET_IDS[parseInt(year, 10)];
    if (spreadsheetId) {
        renderSyncSummary(container, year, spreadsheetId, sheetData);
    }
}

/**
 * Rendert de samenvatting inclusief uitklapbare maand-tot-maand specificatie en externe link.
 */
export function renderSyncSummary(container, year, spreadsheetId, data) {
    const summary = container.querySelector('#sync-summary');
    if (!summary) return;

    const totals = data.totals;
    const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;

    summary.innerHTML = `
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-emerald-200/70">
            <div class="font-semibold text-emerald-950 flex items-center gap-2">
                <i data-lucide="check-circle-2" class="w-4 h-4 text-emerald-600"></i>
                Data gesynchroniseerd voor ${year}
            </div>
            <a href="${sheetUrl}" target="_blank" rel="noopener noreferrer"
               class="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-800 bg-white/80 hover:bg-white px-2.5 py-1 rounded-lg border border-emerald-200 shadow-2xs transition-colors self-start sm:self-auto"
               title="Open het spreadsheet van ${year} in Google Sheets">
                <span>Open ${year} Spreadsheet</span>
                <i data-lucide="external-link" class="w-3 h-3 text-emerald-600"></i>
            </a>
        </div>

        <ul class="grid grid-cols-1 sm:grid-cols-2 gap-y-1.5 gap-x-6 py-3 text-xs text-emerald-900">
            <li class="flex justify-between border-b border-emerald-100/60 pb-1">
                <span class="text-emerald-800">Netto-omzet (excl. BTW):</span>
                <span class="font-semibold">${fmt(totals.omzetEx)}</span>
            </li>
            <li class="flex justify-between border-b border-emerald-100/60 pb-1">
                <span class="text-emerald-800">Kosten (excl. BTW):</span>
                <span class="font-semibold">${fmt(totals.inkoopEx)}</span>
            </li>
            <li class="flex justify-between border-b border-emerald-100/60 pb-1">
                <span class="text-emerald-800">Winst (bruto):</span>
                <span class="font-semibold">${fmt(totals.winst)}</span>
            </li>
            <li class="flex justify-between border-b border-emerald-100/60 pb-1">
                <span class="text-emerald-800">BTW-balans (te betalen):</span>
                <span class="font-semibold">${fmt(totals.btwBalans)}</span>
            </li>
            <li class="flex justify-between border-b border-emerald-100/60 pb-1">
                <span class="text-emerald-800">Privé-onttrekkingen in geld:</span>
                <span class="font-semibold">${fmt(totals.priveOnttrekkingenGeld)} <span class="text-[10px] text-emerald-600 font-normal">↳ sectie 5</span></span>
            </li>
            <li class="flex justify-between border-b border-emerald-100/60 pb-1">
                <span class="text-emerald-800">Privé-stortingen in natura:</span>
                <span class="font-semibold">${fmt(totals.priveStortingenNatura)} <span class="text-[10px] text-emerald-600 font-normal">↳ sectie 5</span></span>
            </li>
        </ul>

        <div class="pt-2">
            <button id="btn-toggle-month-breakdown" type="button"
                    class="inline-flex items-center gap-2 text-xs font-medium text-emerald-900 hover:text-emerald-950 bg-white/70 hover:bg-white border border-emerald-200 rounded-lg px-3 py-1.5 transition-colors">
                <i data-lucide="table" class="w-3.5 h-3.5 text-emerald-700"></i>
                <span id="month-breakdown-toggle-text">Toon specificatie per maand (12 maanden)</span>
                <i id="month-breakdown-toggle-icon" data-lucide="chevron-down" class="w-3.5 h-3.5 text-emerald-600 transition-transform"></i>
            </button>
        </div>

        <div id="month-breakdown-wrapper" class="hidden mt-4 overflow-x-auto bg-white rounded-xl border border-emerald-100 shadow-2xs">
            ${renderMonthTableHTML(data.maanden || [], totals)}
        </div>
    `;

    summary.classList.remove('hidden');

    // Toggle event listener
    const toggleBtn = summary.querySelector('#btn-toggle-month-breakdown');
    const wrapper = summary.querySelector('#month-breakdown-wrapper');
    const toggleText = summary.querySelector('#month-breakdown-toggle-text');
    const toggleIcon = summary.querySelector('#month-breakdown-toggle-icon');

    if (toggleBtn && wrapper) {
        toggleBtn.addEventListener('click', () => {
            const isHidden = wrapper.classList.toggle('hidden');
            toggleText.textContent = isHidden ? 'Toon specificatie per maand (12 maanden)' : 'Verberg specificatie per maand';
            if (toggleIcon) {
                toggleIcon.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(180deg)';
            }
        });
    }

    if (window.lucide) window.lucide.createIcons();
}

function renderMonthTableHTML(maanden, totals) {
    const rowsHTML = maanden.map(m => {
        const hasWarning = m.verkoop.hasDiscrepancy || (!m.verkoopFound && !m.inkoopFound);
        
        let statusBadge = `<span class="inline-flex items-center gap-1 text-[11px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-normal">OK</span>`;
        if (m.verkoop.hasDiscrepancy) {
            statusBadge = `
                <span class="inline-flex items-center gap-1 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded font-medium cursor-help"
                      title="Sheet Totalen-rij geeft ${fmt(m.verkoop.omzetEx)}, maar de som van losse facturen is ${fmt(m.verkoop.calculatedSum)} (verschil ${fmt(m.verkoop.discrepancyDiff)}).">
                    <i data-lucide="alert-triangle" class="w-3 h-3 text-amber-600"></i>
                    Verschil ${fmt(m.verkoop.discrepancyDiff)}
                </span>`;
        } else if (!m.verkoopFound && !m.inkoopFound) {
            statusBadge = `<span class="text-[11px] text-gray-400 italic">Geen tabs</span>`;
        }

        return `
            <tr class="border-b border-gray-100 hover:bg-gray-50/50 text-xs">
                <td class="px-3 py-2.5 font-medium text-gray-900">${m.monthName}</td>
                <td class="px-3 py-2.5 text-right font-mono text-gray-800">${fmt(m.verkoop.omzetEx)}</td>
                <td class="px-3 py-2.5 text-right font-mono text-gray-500">${fmt(m.verkoop.btwTotal)}</td>
                <td class="px-3 py-2.5 text-center text-gray-500">${m.verkoop.count || '-'}</td>
                <td class="px-3 py-2.5 text-right font-mono text-gray-800">${fmt(m.inkoop.kostenEx)}</td>
                <td class="px-3 py-2.5 text-right font-mono text-gray-500">${fmt(m.inkoop.voorbelasting)}</td>
                <td class="px-3 py-2.5 text-center text-gray-500">${m.inkoop.count || '-'}</td>
                <td class="px-3 py-2.5 text-right font-mono font-medium ${m.winst >= 0 ? 'text-emerald-700' : 'text-rose-700'}">${fmt(m.winst)}</td>
                <td class="px-3 py-2.5 text-center">${statusBadge}</td>
            </tr>
        `;
    }).join('');

    return `
        <table class="w-full text-left border-collapse">
            <thead>
                <tr class="bg-gray-50 text-[11px] font-semibold text-gray-600 uppercase tracking-wider border-b border-gray-200">
                    <th class="px-3 py-2.5">Maand</th>
                    <th class="px-3 py-2.5 text-right">Omzet excl.</th>
                    <th class="px-3 py-2.5 text-right">BTW Verkoop</th>
                    <th class="px-3 py-2.5 text-center">Facturen</th>
                    <th class="px-3 py-2.5 text-right">Kosten excl.</th>
                    <th class="px-3 py-2.5 text-right">Voorbelasting</th>
                    <th class="px-3 py-2.5 text-center">Bonnen</th>
                    <th class="px-3 py-2.5 text-right">Winst</th>
                    <th class="px-3 py-2.5 text-center">Status</th>
                </tr>
            </thead>
            <tbody>
                ${rowsHTML}
            </tbody>
            <tfoot>
                <tr class="bg-emerald-50/70 font-semibold text-xs border-t-2 border-emerald-200">
                    <td class="px-3 py-2.5 text-emerald-950">Totaal ${totals.year || ''}</td>
                    <td class="px-3 py-2.5 text-right font-mono text-emerald-950">${fmt(totals.omzetEx)}</td>
                    <td class="px-3 py-2.5 text-right font-mono text-emerald-800">${fmt(totals.btwVerkoop)}</td>
                    <td class="px-3 py-2.5 text-center text-emerald-800">-</td>
                    <td class="px-3 py-2.5 text-right font-mono text-emerald-950">${fmt(totals.inkoopEx)}</td>
                    <td class="px-3 py-2.5 text-right font-mono text-emerald-800">${fmt(totals.btwInkoop)}</td>
                    <td class="px-3 py-2.5 text-center text-emerald-800">-</td>
                    <td class="px-3 py-2.5 text-right font-mono text-emerald-950">${fmt(totals.winst)}</td>
                    <td class="px-3 py-2.5 text-center text-[11px] text-emerald-700">Afgerond</td>
                </tr>
            </tfoot>
        </table>
    `;
}

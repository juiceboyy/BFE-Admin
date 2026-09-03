/**
 * js/ui/fiscal-inventaris-matcher.js
 * Beheert de AI Matcher flow voor duurzame activa kandidaten (> €450).
 */

import { fiscalState } from '../store/fiscal-state.js';
import { addInventarisItemToSheet } from '../api/storage-queries-fiscal.js';
import { getInventarisKandidaten } from '../api/inventaris-kandidaten.js';
import { SPREADSHEET_IDS } from './fiscal-intake.js';
import { renderInventarisTable } from './fiscal-inventaris.js';

const fmt = (n) => Number(n).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Handelt klik-interacties af binnen de AI Matcher (zoeken, toevoegen, overslaan, sluiten).
 * @param {Event} e - Click event
 * @returns {Promise<boolean>} true als het event door de matcher is afgehandeld
 */
export async function handleInventarisMatcherClick(e) {
    const target = e.target;

    // 1. Resultatenblok sluiten / inklappen
    const closeBtn = target.closest('#btn-close-kandidaten');
    if (closeBtn) {
        const kandidatenWrapper = document.getElementById('inventaris-kandidaten');
        if (kandidatenWrapper) kandidatenWrapper.classList.add('hidden');
        return true;
    }

    // 2. Uitgaven analyseren via Gemini
    const zoekBtn = target.closest('#btn-zoek-kandidaten');
    if (zoekBtn) {
        const state = fiscalState.getState();
        const year = state.year;
        const spreadsheetId = SPREADSHEET_IDS[parseInt(year, 10)];

        if (!spreadsheetId) {
            alert(`Geen spreadsheet geconfigureerd voor ${year}.`);
            return true;
        }

        const kandidatenWrapper = document.getElementById('inventaris-kandidaten');
        const kandidatenLijst = document.getElementById('kandidaten-lijst');

        const originalHtml = zoekBtn.innerHTML;
        zoekBtn.innerHTML = '<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i> Analyseren...';
        zoekBtn.disabled = true;

        if (kandidatenWrapper && kandidatenLijst) {
            kandidatenWrapper.classList.remove('hidden');
            kandidatenLijst.innerHTML = `
                <div class="col-span-full flex items-center justify-center gap-2 py-6 text-blue-700 text-sm">
                    <i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i>
                    <span>Inkoopfacturen analyseren op potentiële activa (&gt; €450) met Gemini...</span>
                </div>
            `;
        }
        if (window.lucide) window.lucide.createIcons();

        try {
            const kandidaten = await getInventarisKandidaten(year, spreadsheetId);

            if (!kandidatenWrapper || !kandidatenLijst) return true;

            if (kandidaten.length === 0) {
                kandidatenLijst.innerHTML = `
                    <div class="col-span-full p-4 bg-white/70 border border-blue-100 rounded-xl text-sm text-gray-500 italic">
                        Geen activeerbare investeringen gevonden boven € 450 in ${year}.
                    </div>
                `;
            } else {
                const bestaand = fiscalState.getState().inventaris || [];
                const beoordeeld = kandidaten.map(k => ({
                    ...k,
                    alBestaand: bestaand.some(b =>
                        b.omschrijving.toLowerCase().trim() === k.omschrijving.toLowerCase().trim() &&
                        Math.abs((b.aankoopBedrag || b.aanschafwaarde || 0) - k.aankoopBedrag) < 1
                    )
                }));

                kandidatenLijst.innerHTML = beoordeeld.map(k => k.alBestaand
                    ? `<div class="flex items-center gap-3 px-4 py-3 bg-white/60 border border-gray-200/80 rounded-xl opacity-60">
                            <i data-lucide="check-circle" class="w-4 h-4 text-emerald-600 shrink-0"></i>
                            <div class="flex-1 min-w-0">
                                <span class="text-sm font-medium text-gray-600 line-through">${k.omschrijving}</span>
                                <span class="text-xs text-gray-400 block">${k.leverancier || 'Leverancier'}${k.datum ? ' · ' + k.datum : ''}</span>
                            </div>
                            <span class="text-xs font-semibold text-gray-500 whitespace-nowrap">€ ${fmt(k.aankoopBedrag)} · Al in inventaris</span>
                       </div>`
                    : `<div data-kandidaat="${encodeURIComponent(JSON.stringify(k))}"
                             class="flex flex-col sm:flex-row sm:items-start justify-between gap-4 p-4 bg-white border border-blue-200 rounded-xl shadow-2xs hover:border-blue-300 transition-colors">
                            <div class="flex-1 min-w-0">
                                <div class="flex items-center gap-2">
                                    <span class="font-semibold text-sm text-gray-900">${k.omschrijving}</span>
                                    <span class="text-[11px] font-medium bg-blue-50 text-blue-700 px-2 py-0.5 rounded">€ ${fmt(k.aankoopBedrag)}</span>
                                </div>
                                <p class="text-xs text-gray-500 mt-1">${k.leverancier || 'Onbekend'}${k.datum ? ' · ' + k.datum : ''} · ${k.afschrijvingsDuur || 5} jaar afschrijving</p>
                                ${k.reden ? `<p class="text-xs text-blue-600 mt-1.5 font-sans">${k.reden}</p>` : ''}
                            </div>
                            <div class="flex items-center gap-2 shrink-0 self-end sm:self-start">
                                <button data-action="add-kandidaat" class="text-xs bg-black hover:bg-gray-800 text-white px-3.5 py-1.5 rounded-lg font-medium transition-colors shadow-2xs flex items-center gap-1">
                                    <i data-lucide="plus" class="w-3.5 h-3.5"></i> Toevoegen
                                </button>
                                <button data-action="skip-kandidaat" class="text-xs bg-white hover:bg-gray-100 text-gray-500 border border-gray-200 px-3 py-1.5 rounded-lg font-medium transition-colors">
                                    Overslaan
                                </button>
                            </div>
                        </div>
                    `).join('');
            }
        } catch (err) {
            console.error('Fout bij zoeken naar kandidaten:', err);
            if (kandidatenLijst) {
                kandidatenLijst.innerHTML = `
                    <div class="col-span-full p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                        Fout bij analyseren van kandidaten: ${err.message}
                    </div>
                `;
            }
        } finally {
            zoekBtn.innerHTML = originalHtml;
            zoekBtn.disabled = false;
            if (window.lucide) window.lucide.createIcons();
        }
        return true;
    }

    // 3. Kandidaat toevoegen aan inventaris
    const addKandidaatBtn = target.closest('[data-action="add-kandidaat"]');
    if (addKandidaatBtn && !addKandidaatBtn.disabled) {
        const kaart = addKandidaatBtn.closest('[data-kandidaat]');
        if (!kaart) return true;

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
        addKandidaatBtn.innerHTML = '<i data-lucide="loader-2" class="w-3 h-3 animate-spin"></i> Toevoegen...';
        addKandidaatBtn.disabled = true;
        if (window.lucide) window.lucide.createIcons();

        try {
            await addInventarisItemToSheet(newItem);
            const current = fiscalState.getState().inventaris || [];
            fiscalState.setTopLevel('inventaris', [...current, newItem]);
            renderInventarisTable();

            // Vervang de actieve kaart door een afgevinkte weergave
            const checkedCard = document.createElement('div');
            checkedCard.className = 'flex items-center gap-3 px-4 py-3 bg-white/60 border border-gray-200/80 rounded-xl opacity-60 transition-opacity';
            checkedCard.innerHTML = `
                <i data-lucide="check-circle" class="w-4 h-4 text-emerald-600 shrink-0"></i>
                <div class="flex-1 min-w-0">
                    <span class="text-sm font-medium text-gray-600 line-through">${kandidaat.omschrijving}</span>
                    <span class="text-xs text-gray-400 block">${kandidaat.leverancier || 'Leverancier'}${kandidaat.datum ? ' · ' + kandidaat.datum : ''}</span>
                </div>
                <span class="text-xs font-semibold text-emerald-600 whitespace-nowrap">€ ${fmt(kandidaat.aankoopBedrag)} · Toegevoegd</span>
            `;
            kaart.replaceWith(checkedCard);
            if (window.lucide) window.lucide.createIcons();

        } catch (err) {
            console.error('Fout bij opslaan kandidaat in sheet:', err);
            alert(`Kon kandidaat niet toevoegen aan Google Sheets: ${err.message}`);
            addKandidaatBtn.innerHTML = originalHtml;
            addKandidaatBtn.disabled = false;
            if (window.lucide) window.lucide.createIcons();
        }
        return true;
    }

    // 4. Kandidaat overslaan
    const skipKandidaatBtn = target.closest('[data-action="skip-kandidaat"]');
    if (skipKandidaatBtn) {
        const kaart = skipKandidaatBtn.closest('[data-kandidaat]');
        if (kaart) kaart.remove();
        if (!document.querySelector('#kandidaten-lijst [data-kandidaat]')) {
            const hasChecked = document.querySelector('#kandidaten-lijst .opacity-60');
            if (!hasChecked) {
                document.getElementById('inventaris-kandidaten')?.classList.add('hidden');
            }
        }
        return true;
    }

    return false;
}

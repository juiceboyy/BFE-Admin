import { fiscalState } from '../store/fiscal-state.js';
import { addInventarisItemToSheet, deleteInventarisItemFromSheet } from '../api/storage-queries-fiscal.js';
import { handleInventarisMatcherClick } from './fiscal-inventaris-matcher.js';

export function renderInventarisTable() {
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
                    title="${magVerwijderen ? 'Verwijderen' : 'Kan niet worden verwijderd tijdens active afschrijvingsperiode'}"
                    ${magVerwijderen ? '' : 'disabled'}>
                    <i data-lucide="trash-2" class="w-4 h-4 pointer-events-none"></i>
                </button>
            </td>
        </tr>`;
    }).join('');

    fiscalState.setTopLevel('afschrijvingen', totaleAfschrijving);

    if (window.lucide) window.lucide.createIcons();
}

export function updateInventarisRijBerekening(id) {
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
    if (cells[4]) cells[4].textContent = `€ ${fmt(boekwaardeBegin)}`;
    if (cells[5]) cells[5].textContent = `− ${fmt(afschrijvingDitJaar)}`;
    if (cells[6]) {
        cells[6].textContent = `€ ${fmt(boekwaardeEind)}`;
        cells[6].className = `px-4 py-2 font-medium text-right pr-6 ${boekwaardeEind <= restwaarde ? 'text-gray-300' : 'text-emerald-700'}`;
    }
}

export async function handleInventarisClick(e) {
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
        return true;
    }

    if (target.id === 'btn-cancel-inventaris') {
        const form = document.getElementById('inventaris-add-form');
        if (form) {
            form.classList.add('hidden');
            document.getElementById('inv-new-omschrijving').value = '';
            document.getElementById('inv-new-aanschafwaarde').value = '';
            document.getElementById('inv-new-afschrijvingsjaren').value = '5';
        }
        return true;
    }

    if (target.closest('#btn-save-inventaris-item')) {
        const saveBtn = document.getElementById('btn-save-inventaris-item');
        const omschrijving  = document.getElementById('inv-new-omschrijving')?.value.trim();
        const datum         = document.getElementById('inv-new-datum')?.value.trim();
        const aanschafwaarde = parseFloat(document.getElementById('inv-new-aanschafwaarde')?.value) || 0;
        const afschrijvingsJaren = parseInt(document.getElementById('inv-new-afschrijvingsjaren')?.value, 10) || 5;

        if (!omschrijving) {
            alert('Vul een omschrijving in.');
            return true;
        }
        if (aanschafwaarde <= 0) {
            alert('Vul een geldig aanschafbedrag in.');
            return true;
        }

        const newItem = { omschrijving, datum, aanschafwaarde, afschrijvingsJaren, restwaarde: aanschafwaarde };

        const originalHtml = saveBtn.innerHTML;
        saveBtn.innerHTML = '<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i> Bezig met opslaan...';
        saveBtn.disabled = true;
        if (window.lucide) window.lucide.createIcons();

        try {
            await addInventarisItemToSheet(newItem);

            fiscalState.addInventarisItem({
                omschrijving,
                aankoopJaar:      datum,
                aankoopBedrag:    aanschafwaarde,
                afschrijvingsDuur: afschrijvingsJaren,
                restwaarde:       0,
            });
            renderInventarisTable();

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
        return true;
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
        return true;
    }

    const handledMatcher = await handleInventarisMatcherClick(e);
    if (handledMatcher) return true;

    return false;
}

import { accessToken } from '../api/auth.js';
import {
    fetchSavedClientsFromSheet,
    saveClientToSheetApi,
    deleteClientFromSheetApi
} from '../api/storage-clients.js';

const DUTCH_MONTHS = [
    'januari', 'februari', 'maart', 'april', 'mei', 'juni',
    'juli', 'augustus', 'september', 'oktober', 'november', 'december'
];

const AMARE_OPEN_MIC_PREFIX = 'Optreden en organiseren van Haagse Open Mic in Open Amare';

/**
 * Formats an ISO date string (YYYY-MM-DD) into Dutch long date format (e.g. "13 november 2026").
 * Returns "<datum>" if empty or invalid.
 * @param {string} dateStr
 * @returns {string}
 */
export function formatAmareDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return '<datum>';
    const match = dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return '<datum>';

    const year = parseInt(match[1], 10);
    const monthIndex = parseInt(match[2], 10) - 1;
    const day = parseInt(match[3], 10);
    if (monthIndex < 0 || monthIndex > 11 || day < 1 || day > 31) return '<datum>';

    return `${day} ${DUTCH_MONTHS[monthIndex]} ${year}`;
}

/**
 * Builds the default multi-line description for Haagse Open Mic in Open Amare invoices.
 * @param {string} dateStr
 * @returns {string}
 */
export function buildAmareOpenMicDescription(dateStr) {
    return `${AMARE_OPEN_MIC_PREFIX}, op ${formatAmareDate(dateStr)}\nEvent ID 65516`;
}

/**
 * Checks whether a description matches the auto-filled Amare Open Mic template.
 * @param {string} desc
 * @returns {boolean}
 */
export function isAmareOpenMicDescription(desc) {
    return String(desc || '').trim().toLowerCase().startsWith(AMARE_OPEN_MIC_PREFIX.toLowerCase());
}

/**
 * Reads current client fields from the manual invoicing form.
 * @returns {{ name: string, attention: string, address: string, city: string }}
 */
export function getCurrentManualClientInfo() {
    return {
        name: document.getElementById('manual-client-name')?.value.trim() || '',
        attention: document.getElementById('manual-client-attention')?.value.trim() || '',
        address: document.getElementById('manual-client-address')?.value.trim() || '',
        city: document.getElementById('manual-client-city')?.value.trim() || ''
    };
}

/**
 * Recalculates and renders VAT and subtotal/total figures for manual invoice items.
 * @param {Array<{desc: string, amount: number, btwRate: number|string}>} manualItems
 */
export function recalculateManualTotals(manualItems) {
    let subtotal = 0;
    let btw21 = 0;
    let btw9 = 0;

    manualItems.forEach(item => {
        if (item.amount) {
            subtotal += item.amount;
            if (item.btwRate === 21) {
                btw21 += item.amount * 0.21;
            } else if (item.btwRate === 9) {
                btw9 += item.amount * 0.09;
            }
        }
    });

    const total = subtotal + btw21 + btw9;
    const formatEur = (num) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(num);

    const subtotalEl = document.getElementById('manual-summary-subtotal');
    if (subtotalEl) subtotalEl.innerText = formatEur(subtotal);

    const vat21Row = document.getElementById('manual-vat21-row');
    const vat21El = document.getElementById('manual-summary-vat21');
    if (vat21Row && vat21El) {
        if (btw21 > 0) {
            vat21Row.classList.remove('hidden');
            vat21El.innerText = formatEur(btw21);
        } else {
            vat21Row.classList.add('hidden');
            vat21El.innerText = formatEur(0);
        }
    }

    const vat9Row = document.getElementById('manual-vat9-row');
    const vat9El = document.getElementById('manual-summary-vat9');
    if (vat9Row && vat9El) {
        if (btw9 > 0) {
            vat9Row.classList.remove('hidden');
            vat9El.innerText = formatEur(btw9);
        } else {
            vat9Row.classList.add('hidden');
            vat9El.innerText = formatEur(0);
        }
    }

    const hasZeroOrExempt = manualItems.some(item => item.btwRate === 0 || item.btwRate === 'Vrijgesteld');
    const vatNulRow = document.getElementById('manual-vatnul-row');
    if (vatNulRow) {
        if (hasZeroOrExempt) {
            vatNulRow.classList.remove('hidden');
        } else {
            vatNulRow.classList.add('hidden');
        }
    }

    const totalEl = document.getElementById('manual-summary-total');
    if (totalEl) totalEl.innerText = formatEur(total);
}

/**
 * Saves or updates a client in the 'Klanten' Google Sheet from the manual invoice form.
 */
export async function saveManualClientFlow(getSavedClients, setSavedClients, getClientAutocomplete) {
    const client = getCurrentManualClientInfo();

    if (!client.name) {
        alert("Vul ten minste de klantnaam in om op te slaan.");
        return;
    }

    if (!accessToken) {
        alert("Niet ingelogd met Google. Klik eerst op \"Sync Drive\" bovenaan.");
        return;
    }

    const btn = document.getElementById('btn-manual-client-save');
    const setSaving = (saving) => {
        if (!btn) return;
        btn.disabled = saving;
        btn.innerHTML = saving ? '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Opslaan...' : 'Klant Opslaan in Sheet';
        if (window.lucide) window.lucide.createIcons();
    };

    setSaving(true);

    try {
        const existing = getSavedClients().find(c => c.name.toLowerCase().trim() === client.name.toLowerCase().trim());
        if (existing) {
            if (!confirm(`Klant '${client.name}' bestaat al in de sheet. Wil je de adresgegevens bijwerken?`)) {
                return;
            }
            await deleteClientFromSheetApi(client.name);
        }

        await saveClientToSheetApi(client);
        setSavedClients(await fetchSavedClientsFromSheet());
        getClientAutocomplete()?.refreshDeleteState();
        alert("Klant succesvol opgeslagen in Google Sheet 'Klanten'!");
    } catch (e) {
        console.error("Fout bij opslaan klant:", e);
        alert(`Fout bij opslaan klant: ${e.message}`);
    } finally {
        setSaving(false);
    }
}

/**
 * Deletes the selected client from the 'Klanten' Google Sheet and clears client fields.
 */
export async function deleteManualClientFlow(getSavedClients, setSavedClients, getClientAutocomplete, onAfterDelete) {
    const clientName = document.getElementById('manual-client-name')?.value.trim();
    if (!clientName) return;

    const existing = getSavedClients().find(c => c.name.toLowerCase().trim() === clientName.toLowerCase().trim());
    if (!existing) {
        alert(`Klant '${clientName}' staat niet als opgeslagen relatie in de sheet.`);
        return;
    }

    if (!confirm(`Weet je zeker dat je '${existing.name}' wilt verwijderen uit de Google Sheet?`)) {
        return;
    }

    const btn = document.getElementById('btn-manual-client-delete');
    const setDeleting = (deleting) => {
        if (!btn) return;
        btn.disabled = deleting;
        btn.innerHTML = deleting ? '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i>' : '<i data-lucide="trash-2" class="w-4 h-4"></i>';
        if (window.lucide) window.lucide.createIcons();
    };

    setDeleting(true);

    try {
        await deleteClientFromSheetApi(existing.name);

        document.getElementById('manual-client-name').value = '';
        document.getElementById('manual-client-attention').value = '';
        document.getElementById('manual-client-address').value = '';
        document.getElementById('manual-client-city').value = '';

        setSavedClients(await fetchSavedClientsFromSheet());
        getClientAutocomplete()?.refreshDeleteState();
        if (typeof onAfterDelete === 'function') onAfterDelete();
        alert("Klant verwijderd!");
    } catch (e) {
        console.error("Fout bij verwijderen klant:", e);
        alert(`Fout bij verwijderen klant: ${e.message}`);
    } finally {
        setDeleting(false);
    }
}

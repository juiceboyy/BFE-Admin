/**
 * UI controller for Peppol e-invoicing (NLCIUS / UBL 2.1) inside Manual Invoicing.
 * Handles toggle state, OpenPeppol Directory OIN lookup, OIN verification, and pre-booking validation.
 */

import { searchPeppolDirectory, verifyPeppolRecipient } from '../api/peppol.js';
import { normalizePeppolParticipant } from '../utils/ubl-generator.js';

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function setPeppolStatus(message, tone = 'neutral') {
    const el = document.getElementById('manual-peppol-status');
    if (!el) return;

    if (!message) {
        el.textContent = '';
        el.className = 'text-xs mt-1.5 hidden';
        return;
    }

    const toneClasses = {
        neutral: 'text-gray-600',
        success: 'text-emerald-700 font-medium',
        warning: 'text-amber-700 font-medium',
        error: 'text-red-600 font-medium'
    };

    el.textContent = message;
    el.className = `text-xs mt-1.5 ${toneClasses[tone] || toneClasses.neutral}`;
}

function togglePeppolPanelVisibility(show) {
    const panel = document.getElementById('manual-peppol-panel');
    if (!panel) return;
    panel.classList.toggle('hidden', !show);
}

function renderSearchResults(matches) {
    const container = document.getElementById('manual-peppol-search-results');
    if (!container) return;

    if (!matches || matches.length === 0) {
        container.innerHTML = `
            <div class="px-4 py-3 text-xs text-gray-500">
                Geen Nederlandse organisaties gevonden in de Peppol Directory. Probeer een bredere zoekterm (bijv. "Ministerie" of "Rijkswaterstaat").
            </div>
        `;
        container.classList.remove('hidden');
        return;
    }

    const limited = matches.slice(0, 25);
    container.innerHTML = limited.map((m, idx) => `
        <button type="button" data-peppol-idx="${idx}"
            class="peppol-search-match w-full text-left px-4 py-2.5 hover:bg-blue-50/80 transition-colors border-b border-gray-100 last:border-b-0">
            <div class="text-sm font-medium text-gray-900">${escapeHtml(m.name || 'Onbekende organisatie')}</div>
            <div class="text-xs text-gray-500 font-mono mt-0.5">${escapeHtml(m.peppolId)}</div>
            ${m.additionalInfo ? `<div class="text-xs text-gray-400 mt-0.5 truncate">${escapeHtml(m.additionalInfo)}</div>` : ''}
        </button>
    `).join('');

    container.classList.remove('hidden');

    container.querySelectorAll('.peppol-search-match').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.getAttribute('data-peppol-idx'), 10);
            const selected = limited[idx];
            if (!selected) return;

            const peppolInput = document.getElementById('manual-client-peppol-id');
            const nameInput = document.getElementById('manual-client-name');

            if (peppolInput) peppolInput.value = selected.peppolId;
            if (nameInput && !nameInput.value.trim() && selected.name) {
                nameInput.value = selected.name;
            }

            container.classList.add('hidden');
            setPeppolStatus(
                `Geselecteerd: ${selected.name || selected.peppolId} (${selected.peppolId})`,
                'success'
            );
        });
    });
}

async function handleDirectoryLookup() {
    const peppolInputVal = document.getElementById('manual-client-peppol-id')?.value.trim() || '';
    const nameInputVal = document.getElementById('manual-client-name')?.value.trim() || '';
    const lookupBtn = document.getElementById('btn-peppol-lookup');

    const peppolAlreadyValid = normalizePeppolParticipant(peppolInputVal).isValid;
    let query = '';
    if (peppolInputVal.length >= 2 && !peppolAlreadyValid) {
        query = peppolInputVal;
    } else if (nameInputVal.length >= 2) {
        query = nameInputVal;
    } else {
        const prompted = window.prompt('Zoek op naam van het ministerie of overheidsonderdeel:', '');
        if (!prompted || prompted.trim().length < 2) return;
        query = prompted.trim();
    }

    const originalHtml = lookupBtn?.innerHTML || '';
    if (lookupBtn) {
        lookupBtn.disabled = true;
        lookupBtn.textContent = 'Zoeken...';
    }
    setPeppolStatus('Zoeken in OpenPeppol Directory...', 'neutral');

    try {
        const matches = await searchPeppolDirectory(query);
        renderSearchResults(matches);
        setPeppolStatus(
            matches.length > 0
                ? `${matches.length} resultaat/resultaten gevonden in Peppol Directory.`
                : 'Geen resultaten gevonden in Peppol Directory.',
            matches.length > 0 ? 'neutral' : 'warning'
        );
    } catch (err) {
        setPeppolStatus(err.message || 'Zoeken in Peppol Directory mislukt.', 'error');
    } finally {
        if (lookupBtn) {
            lookupBtn.disabled = false;
            lookupBtn.innerHTML = originalHtml;
            if (window.lucide) window.lucide.createIcons();
        }
    }
}

async function handleVerifyRecipient() {
    const peppolInput = document.getElementById('manual-client-peppol-id');
    const verifyBtn = document.getElementById('btn-peppol-verify');
    const norm = normalizePeppolParticipant(peppolInput?.value || '');

    if (!norm.isValid) {
        setPeppolStatus(norm.reason, 'error');
        return;
    }

    if (peppolInput) peppolInput.value = norm.fullId;

    const originalHtml = verifyBtn?.innerHTML || '';
    if (verifyBtn) {
        verifyBtn.disabled = true;
        verifyBtn.textContent = 'Controleren...';
    }
    setPeppolStatus(`Controleren van ${norm.fullId} op het Peppol-netwerk...`, 'neutral');

    try {
        const res = await verifyPeppolRecipient(norm.fullId);
        if (res.verified) {
            const nameLabel = res.participantName ? ` - ${res.participantName}` : '';
            setPeppolStatus(`Actief op Peppol (${norm.fullId}${nameLabel})`, 'success');
        } else {
            setPeppolStatus(
                `Niet gevonden in publieke Peppol Directory (${norm.fullId}). Controleer het 20-cijferige OIN.`,
                'warning'
            );
        }
    } catch (err) {
        setPeppolStatus(err.message || 'Controle mislukt.', 'error');
    } finally {
        if (verifyBtn) {
            verifyBtn.disabled = false;
            verifyBtn.innerHTML = originalHtml;
            if (window.lucide) window.lucide.createIcons();
        }
    }
}

/**
 * Initializes event listeners for the Peppol manual invoicing controls.
 */
export function initPeppolManualUI() {
    const toggle = document.getElementById('manual-peppol-enabled');
    const btnLookup = document.getElementById('btn-peppol-lookup');
    const btnVerify = document.getElementById('btn-peppol-verify');
    const resultsEl = document.getElementById('manual-peppol-search-results');

    toggle?.addEventListener('change', (e) => {
        const active = Boolean(e.target.checked);
        togglePeppolPanelVisibility(active);
        if (!active) {
            resultsEl?.classList.add('hidden');
            setPeppolStatus('');
        }
    });

    btnLookup?.addEventListener('click', handleDirectoryLookup);
    btnVerify?.addEventListener('click', handleVerifyRecipient);

    document.addEventListener('click', (e) => {
        if (!resultsEl || resultsEl.classList.contains('hidden')) return;
        if (!resultsEl.contains(e.target) && e.target !== btnLookup && !btnLookup?.contains(e.target)) {
            resultsEl.classList.add('hidden');
        }
    });
}

/**
 * Syncs Peppol UI state when a saved client is chosen from autocomplete.
 * @param {Object} client
 */
export function syncPeppolFromSelectedClient(client) {
    const toggle = document.getElementById('manual-peppol-enabled');
    const peppolInput = document.getElementById('manual-client-peppol-id');
    const resultsEl = document.getElementById('manual-peppol-search-results');

    resultsEl?.classList.add('hidden');

    if (client?.peppolId && String(client.peppolId).trim() !== '') {
        if (peppolInput) peppolInput.value = String(client.peppolId).trim();
        if (toggle) toggle.checked = true;
        togglePeppolPanelVisibility(true);
        setPeppolStatus(`Opgeslagen OIN / Peppol-ID geladen: ${client.peppolId}`, 'neutral');
    } else {
        if (peppolInput) peppolInput.value = '';
        setPeppolStatus('');
    }
}

/**
 * Resets Peppol inputs and collapses the panel after invoice submission.
 */
export function resetPeppolManualUI() {
    const toggle = document.getElementById('manual-peppol-enabled');
    const peppolInput = document.getElementById('manual-client-peppol-id');
    const orderRefInput = document.getElementById('manual-peppol-order-ref');
    const resultsEl = document.getElementById('manual-peppol-search-results');

    if (toggle) toggle.checked = false;
    if (peppolInput) peppolInput.value = '';
    if (orderRefInput) orderRefInput.value = '';
    resultsEl?.classList.add('hidden');
    togglePeppolPanelVisibility(false);
    setPeppolStatus('');
}

/**
 * Validates Peppol inputs prior to assigning an invoice number or writing to Sheet/Drive.
 * @returns {{ enabled: boolean, participant?: Object, buyerReference?: string, mode?: 'api'|'xml_only' }}
 */
export function getValidatedPeppolConfig() {
    const enabled = Boolean(document.getElementById('manual-peppol-enabled')?.checked);
    if (!enabled) {
        return { enabled: false };
    }

    const rawPeppolId = document.getElementById('manual-client-peppol-id')?.value || '';
    const participant = normalizePeppolParticipant(rawPeppolId);
    if (!participant.isValid) {
        throw new Error(participant.reason || 'Ongeldig OIN / Peppol-ID.');
    }

    const buyerReference = document.getElementById('manual-peppol-order-ref')?.value.trim() || '';
    if (!buyerReference) {
        throw new Error('Vul een Inkoopordernummer / Referentie in (verplicht voor Peppol e-facturen aan de Rijksoverheid).');
    }

    const modeVal = document.getElementById('manual-peppol-mode')?.value || 'api';
    const mode = modeVal === 'xml_only' ? 'xml_only' : 'api';

    return {
        enabled: true,
        participant,
        buyerReference,
        mode
    };
}

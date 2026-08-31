/**
 * js/ui/scanner-save.js
 * Handelt het opslaan van batch items af en voert validaties en duplicaat-checks uit.
 */
import { getNextInvoiceNumberFromCloud } from '../api/storage-queries-invoices.js';
import { isDateValidForPeriod } from '../utils/date.js';
import { getFormDataFromDOM, processItemSave } from './scanner-helpers.js';
import { invalidateDashboardCache, updateRealBtwBalans } from './dashboard.js';
import { checkForDuplicate, clearDuplicateCheckerCache } from '../utils/duplicate-checker.js';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export async function saveBatchItem(id, batchQueue, currentMode, dateInfo, onUpdateTable) {
    const item = batchQueue.find(i => i.id === id);
    if (!item) return;

    const setBtnState = (loading, icon = 'save', isErr = false) => {
        const btn = document.getElementById(`btn-save-${id}`);
        if (!btn) return;
        btn.disabled = loading;
        btn.innerHTML = loading ? '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i>' : `<i data-lucide="${icon}" class="w-4 h-4"></i>`;
        btn.classList.toggle('text-red-500', isErr);
        if (window.lucide) window.lucide.createIcons();
    };

    const formData = getFormDataFromDOM(id);

    // --- Duplicate check alarm ---
    const dupCheck = await checkForDuplicate(item, batchQueue, dateInfo.targetSheet);
    if (dupCheck.isDuplicate || item.isDuplicate) {
        const reason = dupCheck.reason || item.duplicateReason || 'Er bestaat al een identieke boeking in de administratie.';
        const confirmed = confirm(
            `ALARM: Mogelijke dubbele boeking gedetecteerd!\n\n` +
            `Leverancier: ${formData.leverancier || item.file.name}\n` +
            `Datum: ${formData.datum}\n` +
            `Bedrag: €${formData.factuurBedrag.toFixed(2)}\n\n` +
            `Melding: ${reason}\n\n` +
            `Weet je zeker dat je deze factuur toch wilt opslaan?`
        );
        if (!confirmed) {
            return;
        }
    }

    // --- Amount validation (before spinner) ---
    if (currentMode === 'inkoop') {
        const vergoedingVal = formData.factuurBedrag - formData.btw;
        const calculatedTotal = vergoedingVal + formData.btw;
        const difference = Math.abs(calculatedTotal - formData.factuurBedrag);
        if (formData.factuurBedrag > 0 && (vergoedingVal < -0.02 || difference > 0.02)) {
            alert(
                `Fout in bedragen!\n\n` +
                `Vergoeding (${vergoedingVal.toFixed(2)}) + BTW (${formData.btw.toFixed(2)}) = ${calculatedTotal.toFixed(2)}.\n` +
                `Dit komt niet overeen met het ingevulde Factuurbedrag (${formData.factuurBedrag.toFixed(2)}).\n\n` +
                `Corrigeer de bedragen voordat je opslaat.`
            );
            return;
        }
    }

    setBtnState(true);

    try {
        if (!isDateValidForPeriod(formData.datum, dateInfo.targetYear, dateInfo.targetMonthNum)) {
            if (!confirm(`WAARSCHUWING: De datum (${formData.datum}) valt buiten de boekhoudperiode (${dateInfo.targetSheet}).\n\nDoorgaan?`)) return setBtnState(false);
        }

        const factuurnummer = await getNextInvoiceNumberFromCloud(dateInfo.targetSheet, dateInfo.prevSheet, dateInfo.targetYear);
        const factuurInput = document.getElementById(`factuurnummer-${id}`);
        if (factuurInput) factuurInput.value = factuurnummer;

        await processItemSave(item.file, formData, item.data || {}, currentMode, factuurnummer, dateInfo, item.driveFileId || null);

        item.status = 'saved';
        item.isDuplicate = false;
        clearDuplicateCheckerCache();
        invalidateDashboardCache();
        if (onUpdateTable) onUpdateTable();

        if (currentMode === 'inkoop') {
            updateRealBtwBalans();
        }
    } catch (error) {
        console.error("Fout bij opslaan:", error);
        setBtnState(false, 'alert-circle', true);
        const btn = document.getElementById(`btn-save-${id}`);
        if (btn) btn.title = error.message;
        alert(`Er ging iets mis: ${error.message}`);
    }
}

export async function saveAllBatchItems(batchQueue, currentMode, dateInfo, onUpdateTable, onFilterQueue) {
    const btn = document.getElementById('save-all-btn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Bezig...';
        if (window.lucide) window.lucide.createIcons();
    }

    const itemsToSave = batchQueue.filter(i => i.status === 'success' && i.selected !== false);
    for (const item of itemsToSave) {
        await saveBatchItem(item.id, batchQueue, currentMode, dateInfo, onUpdateTable);
        await delay(1000);
    }

    if (onFilterQueue) onFilterQueue();
    if (onUpdateTable) onUpdateTable();

    if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="save-all" class="w-4 h-4"></i> Alles Opslaan';
        if (window.lucide) window.lucide.createIcons();
    }
}

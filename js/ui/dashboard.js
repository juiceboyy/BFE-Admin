/**
 * js/ui/dashboard.js
 * Beheert de real-time updates van het Session Dashboard.
 */

import { getMonthlyTotals } from '../api/storage-queries-fiscal.js';
import { getTargetDateInfo } from '../utils/date.js';

export function invalidateDashboardCache() {
    // Wordt gehandhaafd als lege export zodat imports in andere bestanden niet crashen
}

export function updateDashboard(batchQueue, currentMode) {
    // Guard clause: this function should NOT update the Verkoop dashboard.
    if (currentMode === 'verkoop') return;

    const countEl = document.getElementById('dash-count');

    if (!countEl) return;

    let count = 0;

    batchQueue.forEach(item => {
        if (item.status !== 'error') {
            count++;
        }
    });

    countEl.innerText = count;
}

export async function updateRealBtwBalans() {
    const dashVat = document.getElementById('dash-vat');
    if (!dashVat) return;

    dashVat.innerText = 'Laden...';

    try {
        const dateInfoInkoop = getTargetDateInfo('inkoop');
        const dateInfoVerkoop = getTargetDateInfo('verkoop');

        const [inkoopTotals, verkoopTotals] = await Promise.all([
            getMonthlyTotals(dateInfoInkoop.targetSheet),
            getMonthlyTotals(dateInfoVerkoop.targetSheet)
        ]);

        const voorbelasting = inkoopTotals.totaalBtw;
        const afTeDragen = verkoopTotals.totaalBtw;
        const balans = afTeDragen - voorbelasting;

        const formatEur = (num) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(num || 0);
        dashVat.innerText = formatEur(balans);

        const totalEl = document.getElementById('dash-total');
        if (totalEl) {
            totalEl.innerText = formatEur(inkoopTotals.totaalOmzet || 0);
            const labelEl = document.getElementById('dash-total-label');
            if (labelEl) labelEl.innerText = 'Totaal Uitgaven (Opgeslagen)';
        }
    } catch (error) {
        console.error('Error updating BTW balans:', error);
        dashVat.innerText = 'Fout';
    }
}
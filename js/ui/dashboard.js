/**
 * js/ui/dashboard.js
 * Beheert de real-time updates van het Session Dashboard.
 */

import { getMonthlyTotals } from '../api/storage-queries.js';
import { getTargetDateInfo } from '../utils/date.js';

export function invalidateDashboardCache() {
    // Wordt gehandhaafd als lege export zodat imports in andere bestanden niet crashen
}

const parseEuro = (val) => {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    const cleaned = String(val).replace(/\./g, '').replace(',', '.');
    return parseFloat(cleaned) || 0;
};

export function updateDashboard(batchQueue, currentMode) {
    // Guard clause: this function should NOT update the Verkoop dashboard.
    if (currentMode === 'verkoop') return;

    const countEl = document.getElementById('dash-count');
    const totalEl = document.getElementById('dash-total');
    const totalLabelEl = document.getElementById('dash-total-label');

    if (!countEl || !totalEl) return;

    let totalUitgaven = 0;
    let count = 0;

    batchQueue.forEach(item => {
        if (item.status !== 'error') {
            count++;
            if (item.data && currentMode === 'inkoop') {
                const rawTotal = item.data.factuurBedrag || item.data.totaalBedrag || item.data.bedrag || 0;
                totalUitgaven += parseEuro(rawTotal);
            }
        }
    });

    const formatEur = (num) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(num);

    countEl.innerText = count;
    totalEl.innerText = formatEur(totalUitgaven);
    
    if (totalLabelEl) {
        totalLabelEl.innerText = 'Wachtrij Uitgaven';
    }
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
    } catch (error) {
        console.error('Error updating BTW balans:', error);
        dashVat.innerText = 'Fout';
    }
}
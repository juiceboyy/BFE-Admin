/**
 * js/ui/dashboard.js
 * Beheert de real-time updates van het Session Dashboard.
 */

import { getMonthlyTotals } from '../api/storage-queries.js';
import { getTargetDateInfo } from '../utils/date.js';

let cachedVerkoopBtw = 0;
let cachedInkoopBtw = 0;
let isFetchingTotals = false;
let hasFetchedTotals = false;

export function invalidateDashboardCache() {
    hasFetchedTotals = false;
}

export function updateDashboard(batchQueue, currentMode) {
    const countEl = document.getElementById('dash-count');
    const totalEl = document.getElementById('dash-total');
    const vatEl = document.getElementById('dash-vat');
    const totalLabelEl = document.getElementById('dash-total-label');
    const vatLabelEl = document.getElementById('dash-vat-label');

    if (!countEl || !totalEl || !vatEl) return;

    let totalUitgaven = 0;
    let queueVat = 0;
    let count = 0;

    batchQueue.forEach(item => {
        if (item.status !== 'error') {
            count++;
            if (item.data && currentMode === 'inkoop') {
                totalUitgaven += parseFloat(item.data.factuurBedrag) || 0;
                if (item.status !== 'saved') {
                    queueVat += parseFloat(item.data.btwBedrag) || 0;
                }
            }
        }
    });

    const formatEur = (num) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(num);

    countEl.innerText = count;
    totalEl.innerText = formatEur(totalUitgaven);
    
    if (totalLabelEl) {
        totalLabelEl.innerText = 'Wachtrij Uitgaven';
    }
    if (vatLabelEl) {
        vatLabelEl.innerText = 'BTW Balans';
    }

    if (currentMode === 'inkoop') {
        if (!hasFetchedTotals && !isFetchingTotals) {
            isFetchingTotals = true;
            vatEl.innerText = "Laden...";
            
            Promise.all([
                getMonthlyTotals(getTargetDateInfo('verkoop').targetSheet).catch(() => ({ totaalBtw: 0 })),
                getMonthlyTotals(getTargetDateInfo('inkoop').targetSheet).catch(() => ({ totaalBtw: 0 }))
            ]).then(([verkoopData, inkoopData]) => {
                cachedVerkoopBtw = verkoopData.totaalBtw || 0;
                cachedInkoopBtw = inkoopData.totaalBtw || 0;
                hasFetchedTotals = true;
                isFetchingTotals = false;
                updateDashboard(batchQueue, currentMode);
            });
            return;
        }

        if (hasFetchedTotals) {
            // BTW te betalen uit Verkoop minus Voorbelasting uit Inkoop én de huidige Wachtrij
            const balans = cachedVerkoopBtw - cachedInkoopBtw - queueVat;
            vatEl.innerText = formatEur(balans);
            vatEl.className = `text-2xl font-bold ${balans < 0 ? 'text-emerald-500' : 'text-gray-900'}`;
        }
    }
}
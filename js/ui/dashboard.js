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
    const vatEl = document.getElementById('dash-vat');
    const totalLabelEl = document.getElementById('dash-total-label');
    const vatLabelEl = document.getElementById('dash-vat-label');

    if (!countEl || !totalEl || !vatEl) return;

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
    if (vatLabelEl) {
        vatLabelEl.innerText = 'BTW Balans';
    }

    if (currentMode === 'inkoop') {
        if (!hasFetchedTotals && !isFetchingTotals) {
            isFetchingTotals = true;
            vatEl.classList.add('opacity-50');
            vatEl.innerText = "Laden...";
            
            Promise.all([
                getMonthlyTotals(getTargetDateInfo('verkoop').targetSheet).catch(() => null),
                getMonthlyTotals(getTargetDateInfo('inkoop').targetSheet).catch(() => null)
            ]).then(([verkoopData, inkoopData]) => {
                if (vatEl) vatEl.classList.remove('opacity-50');
                if (!verkoopData || !inkoopData) {
                    isFetchingTotals = false;
                    if (vatEl) vatEl.innerText = "Log in voor data";
                    if (vatEl) vatEl.className = "text-sm font-medium text-gray-400 transition-all";
                    return;
                }
                cachedVerkoopBtw = verkoopData.totaalBtw || 0;
                cachedInkoopBtw = inkoopData.totaalBtw || 0;
                hasFetchedTotals = true;
                isFetchingTotals = false;
                updateDashboard(batchQueue, currentMode);
            });
            return;
        }

        if (hasFetchedTotals) {
            // Toon de actuele balans uit de Google Sheets, los van de scan-wachtrij.
            const balans = cachedVerkoopBtw - cachedInkoopBtw;
            vatEl.innerText = formatEur(balans);
            vatEl.className = `text-2xl font-bold transition-all ${balans < 0 ? 'text-emerald-500' : 'text-gray-900'}`;
        }
    }
}
/**
 * js/ui/dashboard.js
 * Beheert de real-time updates van het Session Dashboard.
 */

export function updateDashboard(batchQueue, currentMode) {
    const countEl = document.getElementById('dash-count');
    const totalEl = document.getElementById('dash-total');
    const vatEl = document.getElementById('dash-vat');
    const totalLabelEl = document.getElementById('dash-total-label');

    if (!countEl || !totalEl || !vatEl) return;

    let total = 0;
    let vat = 0;
    let count = 0;

    batchQueue.forEach(item => {
        if (item.status !== 'error') {
            count++;
            if (item.data) {
                if (currentMode === 'inkoop') {
                    total += parseFloat(item.data.factuurBedrag) || 0;
                    vat += parseFloat(item.data.btwBedrag) || 0;
                } else if (currentMode === 'verkoop') {
                    total += parseFloat(item.data.totaalBedrag) || 0;
                    vat += (parseFloat(item.data.btwHoog) || 0) + (parseFloat(item.data.btwLaag) || 0);
                }
            }
        }
    });

    const formatEur = (num) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(num);

    countEl.innerText = count;
    totalEl.innerText = formatEur(total);
    vatEl.innerText = formatEur(vat);
    
    if (totalLabelEl) {
        totalLabelEl.innerText = currentMode === 'inkoop' ? 'Totaal Uitgaven' : 'Totaal Omzet';
    }
}
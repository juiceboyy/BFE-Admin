/**
 * js/ui/annual-report.js
 * Controller voor het interactieve Jaarverslag van Big Fish Entertainment.
 */

import { fiscalState } from '../store/fiscal-state.js';
import { calculateTaxes } from '../utils/tax-calculator.js';
import { getAnnualReportHTML } from './templates/annual-report-template.js';
import { setActiveTab } from './navigation.js';

let containerElement = null;

export function initAnnualReport() {
    containerElement = document.getElementById('view-annual-report');
    if (!containerElement) return;

    renderReport();

    // Abonneer op state updates zodat wijzigingen in de intake direct zichtbaar zijn
    fiscalState.subscribe(() => {
        if (containerElement && !containerElement.classList.contains('hidden')) {
            renderReport();
        }
    });
}

/**
 * Rendert het jaarverslag op basis van de huidige fiscalState.
 */
export function renderReport() {
    if (!containerElement) return;

    const state = fiscalState.getState();
    const calculatedData = calculateTaxes(state);

    containerElement.innerHTML = getAnnualReportHTML(state, calculatedData);

    if (window.lucide) {
        window.lucide.createIcons();
    }

    setupReportEventListeners();
}

function setupReportEventListeners() {
    if (!containerElement) return;

    // Boekjaar wisselaar
    const yearSelect = containerElement.querySelector('#report-year-select');
    if (yearSelect) {
        yearSelect.addEventListener('change', (e) => {
            const newYear = e.target.value;
            fiscalState.setTopLevel('year', newYear);
            renderReport();
        });
    }

    // Direct afdrukken / PDF
    const printBtn = containerElement.querySelector('#btn-print-report');
    if (printBtn) {
        printBtn.addEventListener('click', () => {
            window.print();
        });
    }

    // Navigeer naar intake formulier
    const gotoIntakeBtn = containerElement.querySelector('#btn-goto-intake');
    if (gotoIntakeBtn) {
        gotoIntakeBtn.addEventListener('click', () => {
            if (typeof setActiveTab === 'function') {
                setActiveTab('fiscal');
            }
        });
    }
}

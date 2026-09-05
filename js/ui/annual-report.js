/**
 * js/ui/annual-report.js
 * Controller voor het interactieve Jaarverslag van Big Fish Entertainment.
 */

import { fiscalState } from '../store/fiscal-state.js';
import { calculateTaxes } from '../utils/tax-calculator.js';
import { getAnnualReportHTML } from './templates/annual-report-template.js';

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
    if (!containerElement) {
        containerElement = document.getElementById('view-annual-report');
    }
    if (!containerElement) return;

    try {
        const state = fiscalState.getState();
        const calculatedData = calculateTaxes(state);

        containerElement.innerHTML = getAnnualReportHTML(state, calculatedData);

        if (window.lucide) {
            window.lucide.createIcons();
        }

        setupReportEventListeners();
    } catch (err) {
        console.error('Fout bij renderen jaarverslag:', err);
        containerElement.innerHTML = `
            <div class="max-w-4xl mx-auto p-8 my-8 text-center text-rose-700 bg-rose-50 rounded-2xl border border-rose-200">
                <h3 class="font-bold text-base mb-2">Er is een fout opgetreden bij het genereren van het jaarverslag</h3>
                <p class="font-mono text-xs text-rose-600 mb-4">${err.message}</p>
                <button onclick="location.reload()" class="px-4 py-2 bg-rose-600 text-white text-xs font-medium rounded-xl hover:bg-rose-700 transition-colors">
                    Pagina vernieuwen
                </button>
            </div>
        `;
    }
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
            const tabFiscal = document.getElementById('tab-fiscal');
            if (tabFiscal) tabFiscal.click();
        });
    }
}

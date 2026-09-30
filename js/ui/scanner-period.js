/**
 * js/ui/scanner-period.js
 * Beheert de periodeselector knop in de header en triggers voor periode-wijzigingen.
 */
import { getGlobalTargetDate, setGlobalTargetDate } from '../utils/date.js';

export function setupPeriodSelector(onPeriodChange) {
    const btnPeriod = document.getElementById('period-btn') || document.querySelectorAll('header button')[1];
    if (!btnPeriod) return;

    const updateBtnText = () => {
        const d = getGlobalTargetDate();
        const monthYear = d.toLocaleString('nl-NL', { month: 'long', year: 'numeric' });
        const formattedDate = monthYear.charAt(0).toUpperCase() + monthYear.slice(1);
        
        btnPeriod.innerHTML = `<i data-lucide="calendar" class="w-4 h-4"></i> Periode: ${formattedDate}`;
        if (window.lucide) window.lucide.createIcons();
    };
    
    updateBtnText();

    btnPeriod.addEventListener('click', () => {
        const currentD = getGlobalTargetDate();
        const currentStr = `${String(currentD.getMonth() + 1).padStart(2, '0')}-${currentD.getFullYear()}`;
        const userInput = prompt("Voor welke maand wil je de data bekijken/boeken? (Formaat: MM-YYYY)", currentStr);
        
        if (userInput) {
            const [month, year] = userInput.split('-');
            if (month && year) {
                const newDate = new Date(year, parseInt(month) - 1, 1);
                setGlobalTargetDate(newDate);
                updateBtnText();
                if (onPeriodChange) onPeriodChange();
            }
        }
    });
}

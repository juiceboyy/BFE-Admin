/**
 * js/ui/scanner-period.js
 * Beheert de periodeselector knop in de header en triggers voor periode-wijzigingen via een moderne popover.
 */
import { getGlobalTargetDate, setGlobalTargetDate } from '../utils/date.js';

const MONTH_SHORT_NAMES = ['Jan', 'Feb', 'Mrt', 'Apr', 'Mei', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];

export function setupPeriodSelector(onPeriodChange) {
    const btnPeriod = document.getElementById('period-btn') || document.querySelectorAll('header button')[1];
    const popover = document.getElementById('period-popover');
    if (!btnPeriod) return;

    let viewYear = getGlobalTargetDate().getFullYear();

    const updateBtnText = () => {
        const d = getGlobalTargetDate();
        const monthYear = d.toLocaleString('nl-NL', { month: 'long', year: 'numeric' });
        const formattedDate = monthYear.charAt(0).toUpperCase() + monthYear.slice(1);
        
        btnPeriod.innerHTML = `<i data-lucide="calendar" class="w-4 h-4"></i> Periode: ${formattedDate}`;
        if (window.lucide) window.lucide.createIcons();
    };
    
    updateBtnText();

    if (!popover) return;

    const renderPopoverContent = () => {
        const currentSelected = getGlobalTargetDate();
        const currentSelYear = currentSelected.getFullYear();
        const currentSelMonth = currentSelected.getMonth();

        popover.innerHTML = `
            <div class="flex items-center justify-between pb-3 mb-2 border-b border-gray-100">
                <button type="button" id="period-prev-year" 
                    class="p-1.5 text-gray-500 hover:text-black hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                    aria-label="Vorig jaar">
                    <i data-lucide="chevron-left" class="w-4 h-4"></i>
                </button>
                <span class="font-semibold text-gray-900 text-sm tracking-tight">${viewYear}</span>
                <button type="button" id="period-next-year" 
                    class="p-1.5 text-gray-500 hover:text-black hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                    aria-label="Volgend jaar">
                    <i data-lucide="chevron-right" class="w-4 h-4"></i>
                </button>
            </div>
            <div class="grid grid-cols-3 gap-1.5">
                ${MONTH_SHORT_NAMES.map((name, index) => {
                    const isSelected = (viewYear === currentSelYear && index === currentSelMonth);
                    const btnClass = isSelected
                        ? 'bg-black text-white font-medium shadow-sm'
                        : 'text-gray-700 hover:bg-gray-100 hover:text-black font-normal';
                    return `
                        <button type="button" data-month="${index}" 
                            class="period-month-btn py-2 text-xs rounded-xl text-center transition-all cursor-pointer ${btnClass}">
                            ${name}
                        </button>
                    `;
                }).join('')}
            </div>
        `;

        if (window.lucide) window.lucide.createIcons();

        // Event listeners voor jaar-navigatie
        const btnPrev = popover.querySelector('#period-prev-year');
        const btnNext = popover.querySelector('#period-next-year');

        btnPrev?.addEventListener('click', (e) => {
            e.stopPropagation();
            viewYear--;
            renderPopoverContent();
        });

        btnNext?.addEventListener('click', (e) => {
            e.stopPropagation();
            viewYear++;
            renderPopoverContent();
        });

        // Event listeners voor maandknoppen
        popover.querySelectorAll('.period-month-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const selectedMonth = parseInt(btn.getAttribute('data-month'), 10);
                const newDate = new Date(viewYear, selectedMonth, 1);
                setGlobalTargetDate(newDate);
                updateBtnText();
                closePopover();
                if (onPeriodChange) onPeriodChange();
            });
        });
    };

    const openPopover = () => {
        viewYear = getGlobalTargetDate().getFullYear();
        renderPopoverContent();
        popover.classList.remove('hidden');
    };

    const closePopover = () => {
        popover.classList.add('hidden');
    };

    btnPeriod.addEventListener('click', (e) => {
        e.stopPropagation();
        if (popover.classList.contains('hidden')) {
            openPopover();
        } else {
            closePopover();
        }
    });

    // Sluit bij klik buiten popover
    document.addEventListener('click', (e) => {
        if (!popover.classList.contains('hidden') && !popover.contains(e.target) && !btnPeriod.contains(e.target)) {
            closePopover();
        }
    });

    // Sluit bij Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !popover.classList.contains('hidden')) {
            closePopover();
        }
    });
}

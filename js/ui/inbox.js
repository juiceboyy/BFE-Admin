import { getInvoiceAttachment } from '../api/gmail.js';
import { extractAmountFromPDF } from '../api/extract.js';

export function renderFactuurSuggesties(facturen) {
    const container = document.getElementById('inbox-list');
    const badge = document.getElementById('inbox-badge');

    container.innerHTML = '';

    if (facturen.length > 0) {
        badge.innerText = facturen.length;
        badge.classList.remove('hidden');
    }

    facturen.forEach(f => {
        const el = document.createElement('div');
        el.className = 'p-4 bg-white/60 border border-gray-100 rounded-2xl cursor-pointer hover:border-blue-300 hover:shadow-md transition-all group';
        el.innerHTML = `
        <div class="flex justify-between items-start mb-1">
            <div class="text-sm font-semibold text-gray-900 truncate pr-2">${f.afzender.replace(/['"]/g, '')}</div>
            <div class="text-[10px] font-medium text-gray-400 whitespace-nowrap">${new Date(f.datum).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}</div>
        </div>
        <div class="text-xs text-gray-500 truncate group-hover:text-gray-700 transition-colors">${f.onderwerp}</div>
    `;

        // Auto-fill logic bij een klik
        el.onclick = async () => {
            document.getElementById('type').value = 'uitgaven';
            document.getElementById('datum').valueAsDate = new Date(f.datum);
            document.getElementById('omschrijving').value = f.afzender.replace(/['"]/g, '');
            document.getElementById('tarief').value = '21'; // Default voor de meeste NL kosten

            // Visuele feedback: Laden
            const subjectEl = el.querySelector('.text-xs');
            const originalText = subjectEl.innerText;
            subjectEl.innerText = 'PDF Scannen...';
            el.classList.add('opacity-50', 'grayscale', 'cursor-wait');

            const pdfData = await getInvoiceAttachment(f.id);
            if (pdfData) {
                const amount = await extractAmountFromPDF(pdfData);
                if (amount) document.getElementById('bedrag').value = amount;
            }

            // Herstel UI en focus
            subjectEl.innerText = originalText;
            el.classList.remove('cursor-wait');
            document.getElementById('bedrag').focus();
        };

        container.appendChild(el);
    });
}

export function setInboxPeriode() {
    const nu = new Date();
    const vorigeMaand = new Date(nu.getFullYear(), nu.getMonth() - 1, 1);

    // Gebruik de ingebouwde JS formatter voor een strakke Nederlandse datum (bijv. "januari 2026")
    const periodeNaam = new Intl.DateTimeFormat('nl-NL', { month: 'long', year: 'numeric' }).format(vorigeMaand);

    // Maak de eerste letter een hoofdletter voor die Apple-polish
    const periodeGekapitaliseerd = periodeNaam.charAt(0).toUpperCase() + periodeNaam.slice(1);

    const periodEl = document.getElementById('inbox-period');
    if (periodEl) periodEl.innerText = periodeGekapitaliseerd;
}
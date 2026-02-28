let transactions = [];

const formatCurrency = (amount) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(amount);

function updateDashboard() {
    let btw21 = 0, btw9 = 0, voorbelasting = 0;
    const listEl = document.getElementById('transactions-list');
    listEl.innerHTML = '';

    transactions.sort((a, b) => new Date(b.datum) - new Date(a.datum)).forEach(t => {
        // Bereken totalen
        if (t.type === 'inkomsten') {
            if (t.tarief === '21') btw21 += t.btwBedrag;
            if (t.tarief === '9') btw9 += t.btwBedrag;
        } else if (t.type === 'uitgaven') {
            // Check of btw aftrekbaar is (verlegd/0% heeft 0 voorbelasting)
            voorbelasting += t.btwBedrag;
        }

        // Render rij
        const isInkomst = t.type === 'inkomsten';
        const row = document.createElement('tr');
        row.className = 'hover:bg-white/40 transition-colors';
        row.innerHTML = `
        <td class="px-4 py-3 text-gray-500">${new Date(t.datum).toLocaleDateString('nl-NL', { day: '2-digit', month: 'short' })}</td>
        <td class="px-4 py-3 font-medium text-gray-800">${t.omschrijving}</td>
        <td class="px-4 py-3">
            <span class="px-2.5 py-1 text-[11px] font-medium rounded-md ${isInkomst ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-600 border border-rose-100'}">
                ${isInkomst ? 'Omzet' : 'Kosten'}
            </span>
        </td>
        <td class="px-4 py-3 text-gray-500">${t.tarief === 'verlegd' ? 'Verlegd' : t.tarief + '%'}</td>
        <td class="px-4 py-3 text-right text-gray-700">${formatCurrency(t.bedragExcl)}</td>
        <td class="px-4 py-3 text-right text-gray-500">${formatCurrency(t.btwBedrag)}</td>
    `;
        listEl.appendChild(row);
    });

    // Update UI Totalen
    document.getElementById('sum-btw-21').innerText = formatCurrency(btw21);
    document.getElementById('sum-btw-9').innerText = formatCurrency(btw9);
    document.getElementById('sum-voorbelasting').innerText = '- ' + formatCurrency(voorbelasting);

    const totaal = (btw21 + btw9) - voorbelasting;
    const totaalEl = document.getElementById('sum-totaal');
    totaalEl.innerText = formatCurrency(totaal);

    // Groen als je terugkrijgt, Zwart als je moet betalen
    totaalEl.className = `text-2xl font-semibold tracking-tight ${totaal < 0 ? 'text-emerald-500' : 'text-gray-900'}`;
}

export function initBtwModule() {
    const form = document.getElementById('btw-form');
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();

            const type = document.getElementById('type').value;
            const datum = document.getElementById('datum').value;
            const omschrijving = document.getElementById('omschrijving').value;
            const bedragExcl = parseFloat(document.getElementById('bedrag').value);
            const tarief = document.getElementById('tarief').value;

            let btwBedrag = 0;
            if (tarief === '21') btwBedrag = bedragExcl * 0.21;
            if (tarief === '9') btwBedrag = bedragExcl * 0.09;

            const transaction = { id: Date.now(), type, datum, omschrijving, bedragExcl, tarief, btwBedrag };
            transactions.push(transaction);

            e.target.reset();

            // Zet datum terug op vandaag voor gemak
            document.getElementById('datum').valueAsDate = new Date();
            updateDashboard();
        });
    }

    // Initialiseer datum veld op vandaag
    const datumVeld = document.getElementById('datum');
    if (datumVeld) {
        datumVeld.valueAsDate = new Date();
    }

    // Exporteer deze functie zodat sheets.js hem kan aanroepen
}

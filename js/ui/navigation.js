let _activeTabFn = null;

export function setActiveTab(tab) {
    if (typeof _activeTabFn === 'function') {
        _activeTabFn(tab);
    }
}

export function initNavigation() {
    const tabScanner = document.getElementById('tab-scanner');
    const tabFiscal = document.getElementById('tab-fiscal');
    const tabInvoices = document.getElementById('tab-invoices');
    const tabAnnualReport = document.getElementById('tab-annual-report');

    const viewScanner = document.getElementById('view-scanner');
    const viewFiscal = document.getElementById('view-fiscal');
    const viewInvoices = document.getElementById('view-invoices');
    const viewAnnualReport = document.getElementById('view-annual-report');

    if (!tabScanner || !tabFiscal || !tabInvoices || !viewScanner || !viewFiscal || !viewInvoices) return;

    function applyTab(tab) {
        // Show/hide views
        viewScanner.classList.toggle('hidden', tab !== 'scanner');
        viewFiscal.classList.toggle('hidden', tab !== 'fiscal');
        viewInvoices.classList.toggle('hidden', tab !== 'invoices');
        if (viewAnnualReport) {
            viewAnnualReport.classList.toggle('hidden', tab !== 'annual-report');
        }

        // Update Tab Stylings
        const tabs = [
            { id: 'scanner', el: tabScanner },
            { id: 'fiscal', el: tabFiscal },
            { id: 'invoices', el: tabInvoices },
            { id: 'annual-report', el: tabAnnualReport }
        ];

        tabs.forEach(t => {
            if (!t.el) return;
            if (t.id === tab) {
                t.el.classList.add('border-black', 'text-black');
                t.el.classList.remove('border-transparent', 'text-gray-500');
            } else {
                t.el.classList.remove('border-black', 'text-black');
                t.el.classList.add('border-transparent', 'text-gray-500');
            }
        });
    }

    _activeTabFn = applyTab;

    tabScanner.addEventListener('click', () => applyTab('scanner'));
    tabFiscal.addEventListener('click', () => applyTab('fiscal'));
    tabInvoices.addEventListener('click', () => applyTab('invoices'));
    if (tabAnnualReport) {
        tabAnnualReport.addEventListener('click', () => applyTab('annual-report'));
    }
}
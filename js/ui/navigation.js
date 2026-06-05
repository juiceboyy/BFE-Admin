export function initNavigation() {
    const tabScanner = document.getElementById('tab-scanner');
    const tabFiscal = document.getElementById('tab-fiscal');
    const tabInvoices = document.getElementById('tab-invoices');
    const viewScanner = document.getElementById('view-scanner');
    const viewFiscal = document.getElementById('view-fiscal');
    const viewInvoices = document.getElementById('view-invoices');

    if (!tabScanner || !tabFiscal || !tabInvoices || !viewScanner || !viewFiscal || !viewInvoices) return;

    function setActiveTab(tab) {
        // Show/hide views
        viewScanner.classList.toggle('hidden', tab !== 'scanner');
        viewFiscal.classList.toggle('hidden', tab !== 'fiscal');
        viewInvoices.classList.toggle('hidden', tab !== 'invoices');

        // Update Tab Stylings
        const tabs = [
            { id: 'scanner', el: tabScanner },
            { id: 'fiscal', el: tabFiscal },
            { id: 'invoices', el: tabInvoices }
        ];

        tabs.forEach(t => {
            if (t.id === tab) {
                t.el.classList.add('border-black', 'text-black');
                t.el.classList.remove('border-transparent', 'text-gray-500');
            } else {
                t.el.classList.remove('border-black', 'text-black');
                t.el.classList.add('border-transparent', 'text-gray-500');
            }
        });
    }

    tabScanner.addEventListener('click', () => setActiveTab('scanner'));
    tabFiscal.addEventListener('click', () => setActiveTab('fiscal'));
    tabInvoices.addEventListener('click', () => setActiveTab('invoices'));
}
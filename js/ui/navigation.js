export function initNavigation() {
    const tabScanner = document.getElementById('tab-scanner');
    const tabFiscal = document.getElementById('tab-fiscal');
    const viewScanner = document.getElementById('view-scanner');
    const viewFiscal = document.getElementById('view-fiscal');

    if (!tabScanner || !tabFiscal || !viewScanner || !viewFiscal) return;

    function setActiveTab(tab) {
        if (tab === 'scanner') {
            // Show Scanner, hide Fiscal
            viewScanner.classList.remove('hidden');
            viewFiscal.classList.add('hidden');
            
            // Update Tab Styling
            tabScanner.classList.add('border-black', 'text-black');
            tabScanner.classList.remove('border-transparent', 'text-gray-500');
            tabFiscal.classList.remove('border-black', 'text-black');
            tabFiscal.classList.add('border-transparent', 'text-gray-500');
        } else if (tab === 'fiscal') {
            // Show Fiscal, hide Scanner
            viewFiscal.classList.remove('hidden');
            viewScanner.classList.add('hidden');
            
            // Update Tab Styling
            tabFiscal.classList.add('border-black', 'text-black');
            tabFiscal.classList.remove('border-transparent', 'text-gray-500');
            tabScanner.classList.remove('border-black', 'text-black');
            tabScanner.classList.add('border-transparent', 'text-gray-500');
        }
    }

    tabScanner.addEventListener('click', () => setActiveTab('scanner'));
    tabFiscal.addEventListener('click', () => setActiveTab('fiscal'));
}
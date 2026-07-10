import { initAuth } from './api/auth.js';
import { initBtwModule } from './ui/btw.js';
import { initScanner } from './ui/scanner.js';
import { initFiscalIntake, loadInventarisAfterAuth } from './ui/fiscal-intake.js';
import { initInvoicesModule } from './ui/invoices.js';
import { invalidateDashboardCache } from './ui/dashboard.js';

function init() {
    // Initialiseer UI componenten
    if (window.lucide) window.lucide.createIcons();
    initBtwModule();
    initScanner();
    initFiscalIntake();
    initInvoicesModule();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Initialiseer Authenticatie en data fetching
// De callback wordt uitgevoerd zodra de gebruiker succesvol is ingelogd
initAuth(async () => {
    // Forceer een directe verversing van het dashboard na inloggen
    invalidateDashboardCache();
    loadInventarisAfterAuth();
    
    const inkoopBtn = document.getElementById('mode-inkoop');
    const verkoopBtn = document.getElementById('mode-verkoop');
    
    if (inkoopBtn && !inkoopBtn.classList.contains('text-gray-500')) inkoopBtn.click();
    else if (verkoopBtn) verkoopBtn.click();
});
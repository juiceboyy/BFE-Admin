import { initAuth } from './api/auth.js';
import { initBtwModule } from './ui/btw.js';
import { initScanner } from './ui/scanner.js';
import { initFiscalIntake, loadInventarisAfterAuth } from './ui/fiscal-intake.js';
import { initInvoicesModule } from './ui/invoices.js';
import { loadManualClientsAfterAuth } from './ui/invoices-manual.js';
import { invalidateDashboardCache } from './ui/dashboard.js';
import { initReconcileModal } from './ui/reconcile-modal.js';
import { initAnnualReport } from './ui/annual-report.js';

function init() {
    // Initialiseer UI componenten met isolatie zodat één module een andere niet blokkeert
    if (window.lucide) window.lucide.createIcons();
    try { initBtwModule(); } catch (e) { console.error('initBtwModule error:', e); }
    try { initScanner(); } catch (e) { console.error('initScanner error:', e); }
    try { initFiscalIntake(); } catch (e) { console.error('initFiscalIntake error:', e); }
    try { initInvoicesModule(); } catch (e) { console.error('initInvoicesModule error:', e); }
    try { initAnnualReport(); } catch (e) { console.error('initAnnualReport error:', e); }
    try { initReconcileModal(); } catch (e) { console.error('initReconcileModal error:', e); }
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
    loadManualClientsAfterAuth();
    
    const inkoopBtn = document.getElementById('mode-inkoop');
    const verkoopBtn = document.getElementById('mode-verkoop');
    
    if (inkoopBtn && !inkoopBtn.classList.contains('text-gray-500')) inkoopBtn.click();
    else if (verkoopBtn) verkoopBtn.click();
});
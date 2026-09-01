import { initAuth } from './api/auth.js';
import { initBtwModule } from './ui/btw.js';
import { initScanner } from './ui/scanner.js';
import { initFiscalIntake, loadInventarisAfterAuth } from './ui/fiscal-intake.js';
import { initInvoicesModule } from './ui/invoices.js';
import { loadManualClientsAfterAuth } from './ui/invoices-manual.js';
import { invalidateDashboardCache } from './ui/dashboard.js';
import { initReconcileModal } from './ui/reconcile-modal.js';

function init() {
    // Initialiseer UI componenten
    if (window.lucide) window.lucide.createIcons();
    initBtwModule();
    initScanner();
    initFiscalIntake();
    initInvoicesModule();
    initReconcileModal();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Initialiseer Authenticatie en data fetching
// De callback wordt uitgevoerd zodra de gebruiker succesvol is ingelogd
initAuth(async () => {
    // Toon de AI Reconciliatie knop zodra ingelogd
    const reconcileBtn = document.getElementById('btn-open-reconcile-modal');
    if (reconcileBtn) {
        reconcileBtn.classList.remove('hidden');
        reconcileBtn.classList.add('flex');
        if (window.lucide) window.lucide.createIcons();
    }

    // Forceer een directe verversing van het dashboard na inloggen
    invalidateDashboardCache();
    loadInventarisAfterAuth();
    loadManualClientsAfterAuth();
    
    const inkoopBtn = document.getElementById('mode-inkoop');
    const verkoopBtn = document.getElementById('mode-verkoop');
    
    if (inkoopBtn && !inkoopBtn.classList.contains('text-gray-500')) inkoopBtn.click();
    else if (verkoopBtn) verkoopBtn.click();
});
import { initAuth } from './api/auth.js';
import { initBtwModule } from './ui/btw.js';
import { initScanner } from './ui/scanner.js';
import { initFiscalIntake, loadInventarisAfterAuth } from './ui/fiscal-intake.js';
import { initInvoicesModule } from './ui/invoices.js';
import { loadManualClientsAfterAuth } from './ui/invoices-manual.js';
import { invalidateDashboardCache } from './ui/dashboard.js';
import { reconcileDriveWithSheets } from './utils/receipt-repair.js';

window.handleReconcileDrive = async function() {
    const btn = document.getElementById('repair-july-btn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i> Drive Synchroniseren...';
        if (window.lucide) window.lucide.createIcons();
    }

    try {
        const res = await reconcileDriveWithSheets(2026);
        if (res.status === 'succes') {
            const lines = res.renames.slice(0, 15).map(r => `• ${r.oldName} ➔ ${r.newName} (${r.sheet})`).join('\n');
            const moreText = res.renames.length > 15 ? `\n...en nog ${res.renames.length - 15} bestanden.` : '';
            alert(
                `Google Drive succesvol gesynchroniseerd met Google Sheets!\n\n` +
                `Totaal bestanden gecontroleerd: ${res.totalDriveFiles}\n` +
                `Aangepaste bestandsnamen: ${res.renamesCount}\n\n` +
                `${lines}${moreText}`
            );
            if (btn) btn.classList.add('hidden');
        } else {
            alert(res.message || "Synchronisatie voltooid.");
        }
    } catch (err) {
        console.error("Fout bij synchroniseren Drive:", err);
        alert(`Fout: ${err.message}`);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i> Sync Drive Bestandsnamen';
            if (window.lucide) window.lucide.createIcons();
        }
    }
};

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
    // Toon de herstelknop zodra ingelogd
    const repairBtn = document.getElementById('repair-july-btn');
    if (repairBtn) {
        repairBtn.classList.remove('hidden');
        repairBtn.classList.add('flex');
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
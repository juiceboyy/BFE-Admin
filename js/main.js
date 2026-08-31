import { initAuth } from './api/auth.js';
import { initBtwModule } from './ui/btw.js';
import { initScanner } from './ui/scanner.js';
import { initFiscalIntake, loadInventarisAfterAuth } from './ui/fiscal-intake.js';
import { initInvoicesModule } from './ui/invoices.js';
import { loadManualClientsAfterAuth } from './ui/invoices-manual.js';
import { invalidateDashboardCache } from './ui/dashboard.js';
import { autoRepairJulyReceipts } from './utils/receipt-repair.js';

window.handleRepairJuly = async function() {
    const btn = document.getElementById('repair-july-btn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i> Bezig...';
        if (window.lucide) window.lucide.createIcons();
    }

    try {
        const res = await autoRepairJulyReceipts(2026);
        if (res.status === 'succes') {
            const lines = res.corrections.map(c => `• ${c.oldNumber} ➔ ${c.newNumber} (${c.vendor || 'Leverancier'})`).join('\n');
            const driveMsg = res.driveRenames.length > 0 
                ? `\n\nGoogle Drive:\n${res.driveRenames.length} bestand(en) automatisch hernoemd in Drive.` 
                : '\n\nGoogle Drive:\nGeen hernoemingen vereist.';
            alert(`Juli bonnummers succesvol hersteld!\n\nHoogste nummer t/m juni: 2026.${String(res.maxSeqBeforeJuly).padStart(3, '0')}\n\nAangepaste rijen in '${res.julySheetTitle}':\n${lines}${driveMsg}`);
            if (btn) btn.classList.add('hidden');
            invalidateDashboardCache();
        } else {
            alert(res.message);
        }
    } catch (err) {
        console.error("Herstelfout:", err);
        alert(`Fout bij automatisch herstel: ${err.message}`);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="wrench" class="w-3.5 h-3.5"></i> Herstel Juli Bonnen';
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
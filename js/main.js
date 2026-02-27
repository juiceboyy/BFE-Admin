import { initAuth } from './api/auth.js';
import { initBtwModule } from './ui/btw.js';
import { initScanner } from './ui/scanner.js';

// Initialiseer UI componenten
lucide.createIcons();
initBtwModule();
initScanner();

// Initialiseer Authenticatie en data fetching
// De callback wordt uitgevoerd zodra de gebruiker succesvol is ingelogd
initAuth(async () => {
    // Authenticatie succesvol
});
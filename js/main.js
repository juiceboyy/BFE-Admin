import { initAuth } from './api/auth.js';
import { fetchFacturenUitGmail } from './api/gmail.js';
import { fetchBtwAdministratie } from './api/sheets.js';
import { renderFactuurSuggesties, setInboxPeriode } from './ui/inbox.js';
import { initBtwModule } from './ui/btw.js';

// Initialiseer UI componenten
lucide.createIcons();
setInboxPeriode();
initBtwModule();

// Initialiseer Authenticatie en data fetching
// De callback wordt uitgevoerd zodra de gebruiker succesvol is ingelogd
initAuth(async () => {
    const facturen = await fetchFacturenUitGmail();
    renderFactuurSuggesties(facturen);
    await fetchBtwAdministratie();
});
export let accessToken = null;

const CLIENT_ID = '876110380505-g169p7tcffqh73qt3ukghme8g31gvu7g.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/calendar.events';

let tokenClient;

/**
 * Initialiseert de Google Auth-client en stelt de aanmeldknop in.
 * @param {function} onSuccessCallback - De functie die wordt aangeroepen na succesvolle authenticatie.
 */
export function initAuth(onSuccessCallback) {
    const setupTokenClient = () => {
        if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
            return;
        }
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            callback: (response) => {
                if (response.error !== undefined) {
                    throw (response);
                }
                accessToken = response.access_token;

                const authBtn = document.getElementById('auth-btn');
                if (authBtn) {
                    authBtn.innerHTML = '<i data-lucide="check" class="w-4 h-4 text-green-500"></i> Gesynchroniseerd';
                    authBtn.classList.replace('text-gray-700', 'text-green-700');
                }
                if (window.lucide) window.lucide.createIcons();

                // Roep de meegegeven callback-functie aan.
                if (onSuccessCallback) {
                    onSuccessCallback();
                }
            },
        });
    };

    // Indien google al geladen is, direct initialiseren, anders wachten tot het geladen is
    if (typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
        setupTokenClient();
    } else {
        // Gebruik window load event of poll om te controleren of google gedefinieerd is
        const checkInterval = setInterval(() => {
            if (typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
                clearInterval(checkInterval);
                setupTokenClient();
            }
        }, 100);
        
        // Zorg dat we na 10 seconden stoppen met pollen als het echt niet laadt
        setTimeout(() => clearInterval(checkInterval), 10000);
    }

    // Stel de click-handler voor de knop in.
    const authBtn = document.getElementById('auth-btn');
    if (authBtn) {
        authBtn.onclick = () => {
            if (tokenClient && !accessToken) {
                // Activeer de OAuth-popup.
                tokenClient.requestAccessToken({ prompt: 'consent' });
            } else if (!tokenClient) {
                console.warn("Auth client is nog niet geïnitialiseerd. Probeer ter plekke te initialiseren...");
                setupTokenClient();
                if (tokenClient) {
                    tokenClient.requestAccessToken({ prompt: 'consent' });
                } else {
                    alert("Google accounts API is nog niet geladen. Probeer het over een moment opnieuw.");
                }
            }
        };
    }
}
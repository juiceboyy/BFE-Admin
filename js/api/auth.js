export let accessToken = null;

const CLIENT_ID = '876110380505-g169p7tcffqh73qt3ukghme8g31gvu7g.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/spreadsheets';

let tokenClient;

/**
 * Initialiseert de Google Auth-client en stelt de aanmeldknop in.
 * @param {function} onSuccessCallback - De functie die wordt aangeroepen na succesvolle authenticatie.
 */
export function initAuth(onSuccessCallback) {
    // Wacht tot de Google-bibliotheek is geladen (zoals in de oorspronkelijke code).
    window.onload = () => {
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            callback: (response) => {
                if (response.error !== undefined) {
                    throw (response);
                }
                accessToken = response.access_token;

                const authBtn = document.getElementById('auth-btn');
                authBtn.innerHTML = '<i data-lucide="check" class="w-4 h-4 text-green-500"></i> Gesynchroniseerd';
                authBtn.classList.replace('text-gray-700', 'text-green-700');
                lucide.createIcons();

                // Roep de meegegeven callback-functie aan.
                if (onSuccessCallback) {
                    onSuccessCallback();
                }
            },
        });
    };

    // Stel de click-handler voor de knop in.
    const authBtn = document.getElementById('auth-btn');
    if (authBtn) {
        authBtn.onclick = () => {
            if (tokenClient && !accessToken) {
                // Activeer de OAuth-popup.
                tokenClient.requestAccessToken({ prompt: 'consent' });
            } else if (!tokenClient) {
                console.warn("Auth client is nog niet geïnitialiseerd. Wacht tot de pagina volledig is geladen.");
            }
        };
    }
}
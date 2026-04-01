/**
 * Helper functie om netwerkverzoeken met een retry en backoff uit te voeren.
 * @param {string} url - De URL voor de fetch request
 * @param {Object} options - Fetch opties
 * @param {number} maxRetries - Maximaal aantal pogingen (default: 3)
 * @returns {Promise<Response>} Fetch response
 */
export async function fetchWithRetry(url, options, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(url, options);
            if (!response.ok && response.status >= 500) {
                throw new Error(`Server error: ${response.status}`);
            }
            return response;
        } catch (error) {
            if (i === maxRetries - 1) throw error;
            console.warn(`⚠️ Netwerk of server fout (${error.message}). Retrying in ${i + 1}s... (Poging ${i + 1}/${maxRetries})`);
            await new Promise(res => setTimeout(res, 1000 * (i + 1)));
        }
    }
}
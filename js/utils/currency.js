/**
 * js/utils/currency.js
 * Valutaconversie en wisselkoers lookup via officiële Europese Centrale Bank (ECB) data.
 */

const rateCache = new Map();

/**
 * Haalt de historische dagprijs (wisselkoers) op voor een valuta ten opzichte van EUR.
 * @param {string} currency - ISO code, bijv. 'USD', 'GBP' (standaard 'USD')
 * @param {string} dateStr - Factuurdatum in formaat 'YYYY-MM-DD'
 * @returns {Promise<{ rate: number, date: string } | null>}
 */
export async function fetchDailyExchangeRate(currency = 'USD', dateStr = '') {
    const cleanCurrency = (currency || 'USD').toUpperCase();
    const isValidDate = /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
    const datePath = isValidDate ? dateStr : 'latest';
    const cacheKey = `${cleanCurrency}_${datePath}`;

    if (rateCache.has(cacheKey)) {
        return rateCache.get(cacheKey);
    }

    const urls = [
        `https://api.frankfurter.dev/v1/${datePath}?base=${cleanCurrency}&symbols=EUR`,
        `https://api.frankfurter.app/${datePath}?base=${cleanCurrency}&symbols=EUR`
    ];

    for (const url of urls) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3500);
            const res = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (res.ok) {
                const data = await res.json();
                if (data && data.rates && data.rates.EUR) {
                    const result = { rate: data.rates.EUR, date: data.date || dateStr };
                    rateCache.set(cacheKey, result);
                    return result;
                }
            }
        } catch (_) {
            // Probeer de fallback URL
        }
    }

    // Als de datum niet direct gevonden werd (weekend, feestdag of heel recent), probeer 'latest'
    if (datePath !== 'latest') {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2500);
            const res = await fetch(`https://api.frankfurter.dev/v1/latest?base=${cleanCurrency}&symbols=EUR`, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (res.ok) {
                const data = await res.json();
                if (data && data.rates && data.rates.EUR) {
                    const result = { rate: data.rates.EUR, date: data.date };
                    rateCache.set(cacheKey, result);
                    return result;
                }
            }
        } catch (_) {}
    }

    return null;
}

/**
 * Converteert een bedrag van vreemde valuta naar EUR met de dagkoers van de factuurdatum.
 * @param {number} amount 
 * @param {string} currency 
 * @param {string} dateStr 
 * @returns {Promise<{ amountEUR: number, rate: number, date: string } | null>}
 */
export async function convertCurrencyToEUR(amount, currency = 'USD', dateStr = '') {
    const num = parseFloat(amount) || 0;
    if (num === 0) return { amountEUR: 0, rate: 1, date: dateStr };

    const rateInfo = await fetchDailyExchangeRate(currency, dateStr);
    if (!rateInfo || !rateInfo.rate) return null;

    const amountEUR = Math.round(num * rateInfo.rate * 100) / 100;
    return {
        amountEUR,
        rate: rateInfo.rate,
        date: rateInfo.date
    };
}

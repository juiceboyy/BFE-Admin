/**
 * js/utils/currency.js
 * Valutaconversie en wisselkoers lookup via officiële Europese Centrale Bank (ECB) data.
 */

const rateCache = new Map();

/**
 * Normaliseert valutatekens en aliassen (bijv. DEK -> DKK, £ -> GBP, etc.) naar een geldige 3-letterige ISO-code.
 * @param {string} valutaStr 
 * @param {string} textContext 
 * @returns {string}
 */
export function normalizeCurrency(valutaStr, textContext = '') {
    if (!valutaStr && !textContext) return 'EUR';
    let raw = String(valutaStr || '').trim().toUpperCase();
    
    // Specifieke aliassen en typefouten
    if (raw === 'DEK' || raw === 'DKK' || raw.includes('DEENSE') || raw.includes('DANISH')) return 'DKK';
    if (raw === 'SEK' || raw.includes('ZWEEDSE') || raw.includes('SWEDISH')) return 'SEK';
    if (raw === 'NOK' || raw.includes('NOORSE') || raw.includes('NORWEGIAN')) return 'NOK';
    if (raw === 'GBP' || raw === '£' || raw.includes('POUND') || raw.includes('POND')) return 'GBP';
    if (raw === 'CHF' || raw.includes('FRANK') || raw.includes('FRANC')) return 'CHF';
    if (raw === 'CAD' || raw.includes('C$') || raw.includes('CANADIAN')) return 'CAD';
    if (raw === 'AUD' || raw.includes('A$') || raw.includes('AUSTRALIAN')) return 'AUD';
    if (raw === 'JPY' || raw === '¥' || raw.includes('YEN')) return 'JPY';
    if (raw === 'PLN' || raw.includes('ZLOTY')) return 'PLN';
    if (raw === 'CZK' || raw.includes('KORUNA')) return 'CZK';
    if (raw === 'EUR' || raw === '€' || raw.includes('EURO')) return 'EUR';
    if (raw === 'USD' || raw === '$' || raw.includes('DOLLAR')) return 'USD';

    // Als raw al een geldige 3-letterige ISO-code is
    if (/^[A-Z]{3}$/.test(raw)) {
        return raw;
    }

    // Inspecteer eventuele context tekst
    const ctx = String(textContext || '').toUpperCase();
    if (ctx.includes('£') || ctx.includes('GBP')) return 'GBP';
    if (ctx.includes('DKK') || ctx.includes('DEK')) return 'DKK';
    if (ctx.includes('SEK')) return 'SEK';
    if (ctx.includes('NOK')) return 'NOK';
    if (ctx.includes('CHF')) return 'CHF';
    if (ctx.includes('$') || ctx.includes('USD')) return 'USD';

    return raw || 'USD';
}

/**
 * Retourneert het bijbehorende valutasymbool voor een 3-letterige valutacode.
 * @param {string} currency 
 * @returns {string}
 */
export function getCurrencySymbol(currency) {
    switch ((currency || '').toUpperCase()) {
        case 'USD': return '$';
        case 'GBP': return '£';
        case 'JPY': return '¥';
        case 'EUR': return '€';
        case 'DKK': return 'DKK';
        case 'SEK': return 'SEK';
        case 'NOK': return 'NOK';
        case 'CHF': return 'CHF';
        case 'CAD': return 'CA$';
        case 'AUD': return 'AU$';
        default: return currency || '';
    }
}

/**
 * Haalt de historische dagprijs (wisselkoers) op voor een valuta ten opzichte van EUR.
 * @param {string} currency - ISO code, bijv. 'USD', 'GBP', 'DKK', 'SEK', etc.
 * @param {string} dateStr - Factuurdatum in formaat 'YYYY-MM-DD'
 * @returns {Promise<{ rate: number, date: string } | null>}
 */
export async function fetchDailyExchangeRate(currency = 'USD', dateStr = '') {
    const cleanCurrency = normalizeCurrency(currency);
    if (cleanCurrency === 'EUR') {
        return { rate: 1, date: dateStr };
    }

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

    const cleanCurrency = normalizeCurrency(currency);
    if (cleanCurrency === 'EUR') {
        return { amountEUR: num, rate: 1, date: dateStr };
    }

    const rateInfo = await fetchDailyExchangeRate(cleanCurrency, dateStr);
    if (!rateInfo || !rateInfo.rate) return null;

    const amountEUR = Math.round(num * rateInfo.rate * 100) / 100;
    return {
        amountEUR,
        rate: rateInfo.rate,
        date: rateInfo.date
    };
}

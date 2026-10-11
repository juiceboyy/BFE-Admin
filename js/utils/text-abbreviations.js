/**
 * Verwijdert specifieke datums (zoals "11-10-2026", "11/10/26", "op 11 oktober 2026", "11 okt")
 * uit een omschrijving zodat deze niet in de boekhoudingsomschrijving belanden.
 */
export function stripDatesFromDescription(text) {
    if (!text || typeof text !== 'string') return '';
    let result = text;

    const weekdays = '(?:maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag|ma|di|wo|do|vr|za|zo)\\b\\.?';
    const months = '(?:januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december|jan|feb|mrt|apr|jun|jul|aug|sep|sept|okt|nov|dec)\\b\\.?';
    const dayNum = '(?:0?[1-9]|[12]\\d|3[01])(?:\\s*(?:e|ste|de)\\b)?';
    const dayRange = `${dayNum}(?:\\s*(?:-|t\\/m|tot|en|&)\\s*${dayNum})*`;
    const yearOpt = '(?:\\s+(?:20\\d{2}\\b|\'\\d{2}\\b|\\d{2}\\b))?';
    const prepositions = '(?:\\b(?:op|d\\.?d\\.?|datum\\s*:?)\\s+)?';
    const weekdayOpt = `(?:\\b${weekdays}\\s+)?`;

    const writtenDateRegex = new RegExp(`${prepositions}${weekdayOpt}\\b${dayRange}\\s+${months}${yearOpt}`, 'gi');
    const numericFullDateRegex = new RegExp(`${prepositions}${weekdayOpt}\\b(?:0?[1-9]|[12]\\d|3[01])[-/.](?:0?[1-9]|1[0-2])[-/.](?:20\\d{2}|'\\d{2}|\\d{2})\\b`, 'gi');
    const isoDateRegex = new RegExp(`${prepositions}${weekdayOpt}\\b20\\d{2}[-/.](?:0?[1-9]|1[0-2])[-/.](?:0?[1-9]|[12]\\d|3[01])\\b`, 'gi');
    const numericShortDateRegex = new RegExp(`${prepositions}${weekdayOpt}\\b(?:0?[1-9]|[12]\\d|3[01])[-/](?:0?[1-9]|1[0-2])\\b(?![-/.]\\d)`, 'gi');

    result = result
        .replace(writtenDateRegex, '')
        .replace(numericFullDateRegex, '')
        .replace(isoDateRegex, '')
        .replace(numericShortDateRegex, '');

    result = result.replace(/\(\s*\)|\[\s*\]/g, '');

    const prefixMatch = result.match(/^([a-zA-Z]+:\s*)(.*)$/);
    const prefix = prefixMatch ? prefixMatch[1] : '';
    const body = prefixMatch ? prefixMatch[2] : result;

    const cleanedParts = body
        .split(',')
        .map(part => part
            .replace(/\s+/g, ' ')
            .replace(/^[\s\-–—:/]+|[\s\-–—:/]+$/g, '')
            .trim()
        )
        .filter(part => part.length > 0);

    return prefix
        ? (cleanedParts.length > 0 ? `${prefix}${cleanedParts.join(', ')}` : '')
        : cleanedParts.join(', ');
}

/**
 * Abbreviates common Dutch bookkeeping words and user-specified entity names
 * to keep descriptions concise and readable without ellipsis truncation.
 */
export function abbreviateDescription(text) {
    if (!text) return '';
    let result = stripDatesFromDescription(text);
    
    const mappings = [
        [/\bwerkzaamheden\b/gi, 'werkzh'],
        [/\bwerkzk\b/gi, 'werkzh'],
        [/\bCome Again\b/gi, 'CA'],
        [/\bmanagement\b/gi, 'mgmt'],
        [/\badministratie\b/gi, 'adm'],
        [/\bdiversen\b/gi, 'div'],
        [/\bverhuur\b/gi, 'vh'],
        [/\blesgeven\b/gi, 'lessen'],
        [/\borganisatie\b/gi, 'org'],
        [/\bonderhoud\b/gi, 'ond'],
        [/\breiskosten\b/gi, 'reis'],
        [/\babonnement\b/gi, 'abo'],
        [/\blicentie\b/gi, 'lic'],
        [/\bbijeenkomst\b/gi, 'bijeenk'],
        [/\bvoorstelling\b/gi, 'voorst']
    ];
    
    for (const [regex, replacement] of mappings) {
        result = result.replace(regex, replacement);
    }
    return result;
}

/**
 * Detecteert of een omschrijving of onkostenpost betrekking heeft op kleding,
 * een zonnebril of een tas. Voor Big Fish Entertainment geldt de strikte regel
 * dat dergelijke uitgaven altijd als 'podiumkleding' moeten worden geboekt.
 *
 * @param {string} text
 * @returns {boolean}
 */
export function isPodiumkleding(text) {
    if (!text || typeof text !== 'string') return false;
    const lower = text.toLowerCase().trim();
    if (lower === 'podiumkleding') return true;

    const pattern = /\b([a-zA-Z]*(?:kleding|kleren|kledij|podiumkleding|zonnebril|zonnebrillen|sunglass|sunglasses|tas|tassen|rugzak|rugzakken|koffer|koffers|backpack|backpacks|broek|broeken|pantalon|pantalons|jeans|overhemd|overhemden|shirt|shirts|polo|blouse|trui|truien|sweater|sweaters|hoodie|hoodies|vest|vesten|cardigan|jas|jassen|jack|jacks|jacket|blazer|blazers|colbert|colberts|kostuum|kostuums|maatpak|smoking|tuxedo|schoen|schoenen|sneaker|sneakers|laars|laarzen|laarsjes|boots|stropdas|stropdassen|vlinderdas|hoed|hoeden|pet|petten))\b/i;

    return pattern.test(lower);
}

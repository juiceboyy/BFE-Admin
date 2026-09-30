/**
 * Abbreviates common Dutch bookkeeping words and user-specified entity names
 * to keep descriptions concise and readable without ellipsis truncation.
 */
export function abbreviateDescription(text) {
    if (!text) return '';
    let result = text;
    
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

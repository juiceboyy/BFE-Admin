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

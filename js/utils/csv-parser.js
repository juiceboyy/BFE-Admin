/**
 * CSV Parser — Privé-stortingen in geld
 * Splits CSV-tekst op in regels en kolommen, rekening houdend met aanhalingstekens.
 */
function _parseCsvRows(text, delimiter) {
    const rows = [];
    for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue;
        const cols = [];
        let cur = '';
        let inQ = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
                else inQ = !inQ;
            } else if (ch === delimiter && !inQ) {
                cols.push(cur.trim());
                cur = '';
            } else {
                cur += ch;
            }
        }
        cols.push(cur.trim());
        rows.push(cols);
    }
    return rows;
}

/**
 * Converteert Nederlandse en Engelse valuta-notaties naar een absolute float.
 */
function _parseEuroAmount(val) {
    let s = String(val ?? '').trim().replace(/[€\s]/g, '');
    if (!s) return 0;
    const hasComma = s.includes(',');
    const hasDot   = s.includes('.');
    if (hasComma && hasDot) {
        // Dutch 1.234,56 vs English 1,234.56 — whichever separator comes last is the decimal
        s = s.lastIndexOf(',') > s.lastIndexOf('.')
            ? s.replace(/\./g, '').replace(',', '.')   // Dutch
            : s.replace(/,/g, '');                      // English
    } else if (hasComma) {
        const parts = s.split(',');
        // 1234,56 → decimal  |  1,234 → thousands
        s = (parts.length === 2 && parts[1].length <= 2) ? s.replace(',', '.') : s.replace(/,/g, '');
    }
    const n = parseFloat(s);
    return isNaN(n) ? 0 : Math.abs(n);
}

/**
 * Parses raw bank CSV file to find private deposits (stortingen).
 * Matches contra IBAN or description against private IBAN.
 * @param {string} csvText 
 * @param {string} privateIban 
 * @returns {Object|null} { totaal, count }
 */
export function parsePriveStortingenCSV(csvText, privateIban) {
    const normIban = privateIban.replace(/\s/g, '').toUpperCase();
    if (!normIban) return null;

    const firstLine = csvText.split('\n')[0] || '';
    const delimiter = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ';' : ',';

    const rows = _parseCsvRows(csvText, delimiter);
    if (rows.length < 2) return null;

    // Normalize header names to lowercase alphanumeric for matching
    const headers = rows[0].map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
    const findCol = (...kws) => headers.findIndex(h => kws.some(kw => h.includes(kw)));

    const idxContra = findCol('tegenrekening', 'tegenpartijrekening', 'contraaccount', 'contrarekeningnummer', 'rekeningnummertegenpartij');
    const idxBedrag = findCol('bedrag', 'amount');
    const idxDir    = findCol('afbij', 'bijaf', 'creditdebet', 'debitcredit');
    // Fallback: search description columns if no contra column found
    const idxOmschr = findCol('omschrijving', 'mededelingen', 'description', 'betalingskenmerk');

    let totaal = 0;
    let count  = 0;

    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length < 2) continue;

        // Match private IBAN in contra-account or description
        const contraRaw = idxContra >= 0 ? row[idxContra] || '' : '';
        const omschrRaw = idxOmschr >= 0 ? row[idxOmschr] || '' : '';
        const contraNorm = contraRaw.replace(/\s/g, '').toUpperCase();
        const omschrNorm = omschrRaw.replace(/\s/g, '').toUpperCase();

        if (!contraNorm.includes(normIban) && !omschrNorm.includes(normIban)) continue;

        // Verify direction: must be incoming on the business account
        if (idxDir >= 0) {
            const dir = (row[idxDir] || '').toLowerCase().replace(/\s/g, '');
            const isCredit = dir === 'bij' || dir === 'c' || dir === 'credit' || dir === 'cr';
            if (!isCredit) continue;
        }

        const amount = idxBedrag >= 0 ? _parseEuroAmount(row[idxBedrag]) : 0;
        if (amount > 0) { totaal += amount; count++; }
    }

    return { totaal: Math.round(totaal * 100) / 100, count };
}

/**
 * js/utils/annual-report-data.js
 * Historische referentiecijfers en categorie-indelingen voor het Jaarverslag van Big Fish Entertainment.
 * Bronnen: Ster Boekhouding (Jaarstukken 2022) en Jaarrekening 2024.
 */

export const BFE_COMPANY_INFO = {
    tradeName: 'Big Fish Entertainment',
    legalName: 'Ronald van Holst',
    bsn: '1359 33 729',
    kvk: '34393338',
    btwId: 'NL1359.33.729.B.01',
    address: 'Kortlandpad 62',
    postalCodeCity: '2729DN Zoetermeer',
    phone: '06 2888 4143',
    borgMobilityService: 0.00,
    forStandVast: 2143.00
};

/**
 * Historische referentiecijfers voor vergelijkende kolommen in balans en W&V.
 */
export const HISTORICAL_ANNUAL_DATA = {
    2021: {
        omzet: { totaal: 26261, muziek9: 13571, onderwijs0: 12508, overig21: 182 },
        kosten: { totaal: 21784, uitbesteedWerk: 0, afschrijving: 385, autokosten: 13618, huisvesting: 2438, andereKosten: 5343, financieleLasten: 0 },
        winstberekening: { saldo: 4477, bijtelling: 0, fiscaleWinst: 4477 },
        balans: {
            activa: { inventaris: 990, debiteuren: 0, overlopend: 150, borgMobility: 2097, bank: 167, totaal: 3404 },
            passiva: { for: 6143, eigenVermogen: -6939, totaalVermogen: -796, btwSchuld: 0, overigeSchulden: 4200, totaal: 3404 }
        }
    },
    2022: {
        omzet: { totaal: 56166, muziek9: 37698, onderwijs0: 18325, overig21: 143 },
        kosten: { totaal: 25816, uitbesteedWerk: 1276, afschrijving: 816, autokosten: 14957, huisvesting: 2900, andereKosten: 5867, financieleLasten: 0 },
        winstberekening: { saldo: 30350, bijtelling: 3430.48, fiscaleWinst: 33780.48 },
        balans: {
            activa: { inventaris: 3193, debiteuren: 1800, overlopend: 3276, borgMobility: 2097, bank: 10, totaal: 10376 },
            passiva: { for: 2143, eigenVermogen: 3449, totaalVermogen: 5592, btwSchuld: 3938, overigeSchulden: 846, totaal: 10376 }
        }
    },
    2023: {
        omzet: { totaal: 60799, muziek9: 42500, onderwijs0: 17500, overig21: 799 },
        kosten: { totaal: 26536, uitbesteedWerk: 1207, afschrijving: 1039, autokosten: 13818, huisvesting: 5654, andereKosten: 4818, financieleLasten: 0 },
        winstberekening: { saldo: 34263, bijtelling: 3430.48, fiscaleWinst: 37693.48 },
        balans: {
            activa: { inventaris: 3665, debiteuren: 0, overlopend: 0, borgMobility: 0, bank: 233, totaal: 3898 },
            passiva: { for: 2143, eigenVermogen: -646, totaalVermogen: 1497, btwSchuld: 0, overigeSchulden: 2401, totaal: 3898 }
        }
    },
    2024: {
        omzet: { totaal: 54643, muziek9: 36200, onderwijs0: 17800, overig21: 643 },
        kosten: { totaal: 25188, uitbesteedWerk: 1284, afschrijving: 1016, autokosten: 13818, huisvesting: 5654, andereKosten: 3296, financieleLasten: 120 },
        winstberekening: { saldo: 29455, bijtelling: 3430.48, fiscaleWinst: 32885.48 },
        balans: {
            activa: { inventaris: 3231, debiteuren: 3145, overlopend: 0, borgMobility: 0, bank: 986, totaal: 7362 },
            passiva: { for: 2143, eigenVermogen: 5210, totaalVermogen: 7353, btwSchuld: 9, overigeSchulden: 0, totaal: 7362 }
        }
    },
    2025: {
        omzet: { totaal: 51746, muziek9: 36254, onderwijs0: 8791, overig21: 6701 },
        kosten: {
            totaal: 26221,
            uitbesteedWerk: 1661,
            afschrijving: 841,
            autokosten: 13918,
            huisvesting: 4364,
            andereKosten: 5317,
            financieleLasten: 120
        },
        winstberekening: {
            saldo: 25525,
            bijtelling: 4336,
            fiscaleWinst: 29861,
            ondernemersaftrek: 2470,
            mkbWinstvrijstellingBedrag: 3479,
            belastbareWinst: 23912
        },
        balans: {
            activa: { inventaris: 1289, debiteuren: 0, overlopend: 0, borgMobility: 0, bank: 1514, totaal: 2803 },
            passiva: { for: 2143, eigenVermogen: 660, totaalVermogen: 2803, btwSchuld: 0, overigeSchulden: 0, totaal: 2803 }
        },
        kapitaal: {
            beginVermogen: 7353,
            vermogensmutatie: -4550,
            onttrekkingenGeld: 30086,
            onttrekkingenNatura: 4325,
            totaleOnttrekkingen: 34411,
            totaleStortingen: 0,
            eindVermogen: 2803
        }
    }
};

/**
 * Officiële inventarisstaat 2025 (Golden Dataset 3.C)
 * 8 bedrijfsmiddelen, 5-jaars termijn, lineair, restwaarde € 0.
 */
export const GOLDEN_INVENTARIS_2025 = [
    { id: 'inv-1', omschrijving: 'Mac Mini', aankoopJaar: 2020, aankoopBedrag: 876, afschrijvingDitJaar: 0, boekwaardeEind: 0 },
    { id: 'inv-2', omschrijving: 'Elektrische Gitaar', aankoopJaar: 2022, aankoopBedrag: 512, afschrijvingDitJaar: 102, boekwaardeEind: 102 },
    { id: 'inv-3', omschrijving: 'MacBook Air', aankoopJaar: 2022, aankoopBedrag: 665, afschrijvingDitJaar: 133, boekwaardeEind: 133 },
    { id: 'inv-4', omschrijving: 'MacBook Air', aankoopJaar: 2022, aankoopBedrag: 636, afschrijvingDitJaar: 127, boekwaardeEind: 127 },
    { id: 'inv-5', omschrijving: 'iPhone 14', aankoopJaar: 2022, aankoopBedrag: 729, afschrijvingDitJaar: 146, boekwaardeEind: 146 },
    { id: 'inv-6', omschrijving: 'Mac Mini', aankoopJaar: 2023, aankoopBedrag: 602, afschrijvingDitJaar: 120, boekwaardeEind: 241 },
    { id: 'inv-7', omschrijving: 'Dyson Stofzuiger', aankoopJaar: 2023, aankoopBedrag: 477, afschrijvingDitJaar: 95, boekwaardeEind: 191 },
    { id: 'inv-8', omschrijving: 'iPad', aankoopJaar: 2024, aankoopBedrag: 582, afschrijvingDitJaar: 116, boekwaardeEind: 349 }
];

/**
 * Categoriseert leveranciers en kostenbedragen naar de officiële posten van de jaarrekening.
 * @param {Object} perLeverancier - Map van leverancier -> bedrag
 * @param {number} totalKosten - Totaal kostenbedrag uit de sheet
 * @returns {Object} Uitgesplitste kosten
 */
export function categorizeKosten(perLeverancier = {}, totalKosten = 0) {
    let uitbesteedWerk = 0;
    let autokosten = 0;
    let huisvesting = 0;
    let financieleLasten = 0;
    let andereKosten = 0;

    const autoKeywords = ['mobility', 'lease', 'fastned', 'shell', 'tesla', 'laad', 'tank', 'anwb', 'parkeer', 'ns', 'ov-chip'];
    const huisvestingKeywords = ['studio', 'huur', 'pand', 'huisvesting', 'opslag'];
    const uitbesteedKeywords = ['werk door derden', 'ingehuurd', 'gastdocent', 'vervanging', 'sessie', 'muzikant', 'vocal', 'bassist', 'drummer', 'pianist', 'gast'];
    const financieelKeywords = ['bank', 'ing', 'kosten betaalpas', 'rekeningkosten', 'koersverschil', 'rente', 'financieel'];

    for (const [name, amount] of Object.entries(perLeverancier)) {
        const lower = name.toLowerCase();
        const amt = parseFloat(amount) || 0;

        if (autoKeywords.some(k => lower.includes(k))) {
            autokosten += amt;
        } else if (huisvestingKeywords.some(k => lower.includes(k))) {
            huisvesting += amt;
        } else if (financieelKeywords.some(k => lower.includes(k))) {
            financieleLasten += amt;
        } else if (uitbesteedKeywords.some(k => lower.includes(k))) {
            uitbesteedWerk += amt;
        } else {
            andereKosten += amt;
        }
    }

    const calculatedSum = uitbesteedWerk + autokosten + huisvesting + financieleLasten + andereKosten;
    const diff = totalKosten - calculatedSum;

    // Sluit aan op totalKosten
    if (diff !== 0 && totalKosten > 0) {
        andereKosten += diff;
    }

    return {
        uitbesteedWerk: Math.round(uitbesteedWerk * 100) / 100,
        autokosten: Math.round(autokosten * 100) / 100,
        huisvesting: Math.round(huisvesting * 100) / 100,
        financieleLasten: Math.round(financieleLasten * 100) / 100,
        andereKosten: Math.round(andereKosten * 100) / 100
    };
}

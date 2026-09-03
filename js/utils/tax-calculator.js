/**
 * js/utils/tax-calculator.js
 * Pure logic module voor het berekenen van de inkomstenbelasting en fiscale winst.
 */

/**
 * Belastingtarieven per jaar.
 * Zelfstandigenaftrek en MKB-winstvrijstelling worden jaarlijks bijgesteld door de Belastingdienst.
 * box1 = progressieve schijven: [ { grens: bovenlimiet, tarief: fractie }, ... ]
 * Laatste schijf altijd met grens: Infinity.
 *
 * Bronnen: Belastingplan 2024/2025, Prinsjesdag-stukken.
 * Tarieven 2026 zijn indicatief — verifieer voor indiening bij belastingdienst.nl.
 */
const TAX_RATES_BY_YEAR = {
    2023: {
        zelfstandigenaftrek: 5030,
        mkbWinstvrijstelling: 0.14,
        kiaDrempel: 2801,
        box1: [
            { grens: 73031, tarief: 0.3693 },
            { grens: Infinity, tarief: 0.495 }
        ]
    },
    2024: {
        zelfstandigenaftrek: 3750,
        mkbWinstvrijstelling: 0.1331,
        kiaDrempel: 2801,
        box1: [
            { grens: 75518, tarief: 0.3697 },
            { grens: Infinity, tarief: 0.495 }
        ]
    },
    2025: {
        zelfstandigenaftrek: 2470,
        mkbWinstvrijstelling: 0.127,
        kiaDrempel: 2801,
        box1: [
            { grens: 38441, tarief: 0.3582 },
            { grens: 76817, tarief: 0.3748 },
            { grens: Infinity, tarief: 0.495 }
        ]
    },
    // 2026: indicatief — verifieer bij Belastingplan 2026
    2026: {
        zelfstandigenaftrek: 1200,
        mkbWinstvrijstelling: 0.127,
        kiaDrempel: 2801,
        box1: [
            { grens: 38441, tarief: 0.3582 },
            { grens: 76817, tarief: 0.3748 },
            { grens: Infinity, tarief: 0.495 }
        ]
    }
};

/**
 * Geeft de tarieven voor een specifiek jaar terug.
 * Valt terug op het meest recente bekende jaar als het gevraagde jaar niet bestaat.
 */
export function getRatesForYear(year) {
    const y = parseInt(year, 10);
    if (TAX_RATES_BY_YEAR[y]) return TAX_RATES_BY_YEAR[y];
    const known = Object.keys(TAX_RATES_BY_YEAR).map(Number).sort((a, b) => b - a);
    return TAX_RATES_BY_YEAR[known[0]];
}

/**
 * Berekent de geschatte IB op basis van belastbare winst en progressieve Box 1 schijven.
 */
export function schattingIB(belastbareWinst, year) {
    if (belastbareWinst <= 0) return 0;
    const rates = getRatesForYear(year);
    let ib = 0;
    let vorige = 0;
    for (const schijf of rates.box1) {
        const schijfInkomen = Math.min(belastbareWinst, schijf.grens) - vorige;
        if (schijfInkomen <= 0) break;
        ib += schijfInkomen * schijf.tarief;
        vorige = schijf.grens;
    }
    return ib;
}

/**
 * Berekent de standaard fiscale bijtelling voor de leaseauto per boekjaar.
 * 
 * Auto 1 (Oud): VW ID.3 (2021) - cat. €42.881, 8% vaste bijtelling = €3.430,48/jaar.
 * Ingeleverd op 19 september 2025 (in 2025 actief van 1 jan t/m 18 sep = 261 dagen).
 * 
 * Auto 2 (Nieuw): VW ID.3 (2025) - DET 18-09-2025, cat. €36.850.
 * Ingangsdatum lease: 19 september 2025 (in 2025 actief van 19 sep t/m 31 dec = 104 dagen).
 * EV Staffels 2025: 17% tot €30.000 (€5.100) + 22% boven €30.000 (€6.850 × 0.22 = €1.507) = €6.607,00/jaar.
 * 
 * Resultaten per boekjaar:
 * - <= 2024: € 3.430,48
 * - 2025: (261 / 365 × 3430.48) + (104 / 365 × 6607.00) = 2453.03 + 1882.54 = € 4.335,57
 * - >= 2026: € 6.607,00
 */
export function getDefaultCarBijtelling(year) {
    const y = parseInt(year, 10);
    const oldCarAnnual = 42881 * 0.08; // 3430.48
    const newCarAnnual = (30000 * 0.17) + ((36850 - 30000) * 0.22); // 5100 + 1507 = 6607.00

    if (y <= 2024) {
        return Math.round(oldCarAnnual * 100) / 100;
    }
    if (y === 2025) {
        const daysOld = 261;
        const daysNew = 104;
        const totalDays = 365;
        const partOld = (daysOld / totalDays) * oldCarAnnual;
        const partNew = (daysNew / totalDays) * newCarAnnual;
        return Math.round((partOld + partNew) * 100) / 100;
    }
    return Math.round(newCarAnnual * 100) / 100;
}

/**
 * Geeft een toelichtende tekst van de bijtellingsopbouw voor een specifiek boekjaar.
 */
export function getCarBijtellingDescription(year) {
    const y = parseInt(year, 10);
    if (y <= 2024) {
        return 'VW ID.3 (2021): 8% van € 42.881 = € 3.430,48/jr';
    }
    if (y === 2025) {
        return 'Wissel op 19-09-2025: 261 dgn oude ID.3 (€ 2.453,03) + 104 dgn nieuwe ID.3 (€ 1.882,54)';
    }
    return 'Nieuwe VW ID.3 (2025): € 36.850 (17% tot € 30k + 22% boven € 30k = € 6.607,00/jr)';
}

/**
 * Berekent alle fiscale tussenstappen en eindtotalen op basis van de applicatie state.
 * @param {Object} fiscalState - De centrale status van de applicatie.
 * @returns {Object} calculatedTaxData
 */
export function calculateTaxes(fiscalState) {
    const year = parseInt(fiscalState.year || new Date().getFullYear(), 10);
    const rates = getRatesForYear(year);

    // 1. Afschrijvingen (Depreciation)
    let totaleAfschrijving = 0;
    let investeringenDitJaar = 0;

    const afschrijvingenLog = fiscalState.inventaris.map(item => {
        const aankoopBedrag = parseFloat(item.aankoopBedrag) || 0;
        const aankoopJaar = parseInt(item.aankoopJaar, 10);
        const afschrijvingsDuur = parseFloat(item.afschrijvingsDuur) || 5;
        const restwaarde = parseFloat(item.restwaarde) || 0;

        // Lineaire afschrijving per jaar
        const lineaireAfschrijving = afschrijvingsDuur > 0 ? (aankoopBedrag - restwaarde) / afschrijvingsDuur : 0;

        // Time-based boekwaarde begin — mirrors renderInventarisTable logic so both stay in sync
        const jarenVooraf = Math.max(0, year - aankoopJaar);
        let boekwaardeBegin = aankoopBedrag - (jarenVooraf * lineaireAfschrijving);
        if (boekwaardeBegin < restwaarde) boekwaardeBegin = restwaarde;

        if (aankoopJaar === year) {
            investeringenDitJaar += aankoopBedrag;
        }

        // Zorg dat de boekwaarde nooit onder de restwaarde zakt
        const maxMogelijkeAfschrijving = Math.max(0, boekwaardeBegin - restwaarde);
        const afschrijvingDitJaar = year >= aankoopJaar
            ? Math.min(lineaireAfschrijving, maxMogelijkeAfschrijving)
            : 0;
        
        totaleAfschrijving += afschrijvingDitJaar;

        return {
            id: item.id,
            omschrijving: item.omschrijving,
            afschrijvingDitJaar,
            boekwaardeEind: boekwaardeBegin - afschrijvingDitJaar
        };
    });

    // 2. Bijtelling (Car Addition)
    // Prioriteit: 1. Handmatig ingevoerd bedrag in balans.bijtellingAuto (sectie 5)
    //             2. Expliciet vastgelegde waarde in fiscalState.auto.bijtelling
    //             3. Boekjaar-afhankelijke standaardspecificatie (wissel 2025, EV-staffels)
    let bijtelling = 0;
    const isZakelijk = fiscalState.auto ? fiscalState.auto.zakelijkGebruik !== false : true;
    if (isZakelijk) {
        if (fiscalState.balans?.bijtellingAuto !== undefined && fiscalState.balans?.bijtellingAuto !== null && fiscalState.balans?.bijtellingAuto !== '') {
            bijtelling = parseFloat(fiscalState.balans.bijtellingAuto) || 0;
        } else if (fiscalState.auto?.bijtelling !== undefined && fiscalState.auto?.bijtelling !== null && fiscalState.auto?.bijtelling !== '') {
            bijtelling = parseFloat(fiscalState.auto.bijtelling) || 0;
        } else {
            bijtelling = getDefaultCarBijtelling(year);
        }
    }

    // 3. Fiscale Winst (Fiscal Profit)
    const omzet = fiscalState.sheetData?.omzet?.totaal || 0;
    const kosten = fiscalState.sheetData?.kosten?.totaal || 0;
    
    const fiscaleWinst = omzet - kosten - totaleAfschrijving + bijtelling;

    // 4. Ondernemersaftrek
    let ondernemersaftrek = 0;
    if (fiscalState.ondernemer?.urencriteriumGehaald && fiscaleWinst > 0) {
        ondernemersaftrek = Math.min(rates.zelfstandigenaftrek, fiscaleWinst);
    }

    const winstNaOndernemersaftrek = fiscaleWinst - ondernemersaftrek;

    // 5. MKB-Winstvrijstelling
    let mkbWinstvrijstellingBedrag = 0;
    if (winstNaOndernemersaftrek > 0) {
        mkbWinstvrijstellingBedrag = winstNaOndernemersaftrek * rates.mkbWinstvrijstelling;
    }

    // 6. Belastbare Winst (Taxable Profit)
    const belastbareWinst = winstNaOndernemersaftrek - mkbWinstvrijstellingBedrag;

    // 7. Balans (Eigen Vermogen Eind)
    const bankBegin = parseFloat(fiscalState.bank?.beginSaldo) || 0;
    let boekwaardeInventarisBegin = 0;
    
    fiscalState.inventaris.forEach(item => {
        let bv = parseFloat(item.boekwaardeVorigJaar) || 0;
        if (parseInt(item.aankoopJaar, 10) === year) {
            bv = parseFloat(item.aankoopBedrag) || 0;
        }
        boekwaardeInventarisBegin += bv;
    });

    const eigenVermogenBegin = bankBegin + boekwaardeInventarisBegin;

    // Privé-mutaties — vier officiële Belastingdienst-categorieën
    const priveOnttrekkingenInGeld   = parseFloat(fiscalState.prive?.onttrekkingenInGeld)   || 0;
    const priveOnttrekkingenInNatura = parseFloat(fiscalState.prive?.onttrekkingenInNatura) || 0;
    const priveStortingenInGeld      = parseFloat(fiscalState.prive?.stortingenInGeld)      || 0;
    const priveStortingenInNatura    = parseFloat(fiscalState.prive?.stortingenInNatura)    || 0;

    // Bijtelling telt al mee in fiscaleWinst (+), maar is ook een onttrekking in natura (−)
    // Anders wordt het EV ten onrechte met het bijtelling-bedrag overschat
    const totaleOnttrekkingen = priveOnttrekkingenInGeld + priveOnttrekkingenInNatura + bijtelling;
    const totaleStortingen    = priveStortingenInGeld + priveStortingenInNatura;

    const kortlopendeSchulden = parseFloat(fiscalState.balans?.kortlopendeSchulden) || 0;
    const forStand            = parseFloat(fiscalState.balans?.forStand) || 0;

    const eigenVermogenEind = eigenVermogenBegin + fiscaleWinst - totaleOnttrekkingen + totaleStortingen;

    // Output Contract
    return {
        year,
        omzet,
        kosten,
        totaleAfschrijving,
        investeringenDitJaar,
        bijtelling,
        fiscaleWinst,
        ondernemersaftrek,
        winstNaOndernemersaftrek,
        mkbWinstvrijstellingBedrag,
        belastbareWinst,
        balans: {
            eigenVermogenBegin,
            eigenVermogenEind,
            kortlopendeSchulden,
            forStand,
            totaleOnttrekkingen,
            totaleStortingen
        },
        afschrijvingenLog
    };
}
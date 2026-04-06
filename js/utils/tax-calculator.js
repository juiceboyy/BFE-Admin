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
        let boekwaardeBegin = parseFloat(item.boekwaardeVorigJaar) || 0;
        const restwaarde = 0; // Default residual value

        // Als het item dit jaar is gekocht, is de beginwaarde gelijk aan het aankoopbedrag
        if (aankoopJaar === year) {
            boekwaardeBegin = aankoopBedrag;
            investeringenDitJaar += aankoopBedrag;
        }

        // Lineaire afschrijving berekenen
        const lineaireAfschrijving = (aankoopBedrag - restwaarde) / afschrijvingsDuur;
        
        // Zorg dat de boekwaarde nooit onder de restwaarde zakt
        const maxMogelijkeAfschrijving = Math.max(0, boekwaardeBegin - restwaarde);
        const afschrijvingDitJaar = Math.min(lineaireAfschrijving, maxMogelijkeAfschrijving);
        
        totaleAfschrijving += afschrijvingDitJaar;

        return {
            id: item.id,
            omschrijving: item.omschrijving,
            afschrijvingDitJaar,
            boekwaardeEind: boekwaardeBegin - afschrijvingDitJaar
        };
    });

    // 2. Bijtelling (Car Addition)
    let bijtelling = 0;
    if (fiscalState.auto && fiscalState.auto.zakelijkGebruik) {
        const catWaarde = parseFloat(fiscalState.auto.catalogusWaarde) || 0;
        const percentage = parseFloat(fiscalState.auto.bijtellingsPercentage) || 0;
        bijtelling = catWaarde * (percentage / 100);
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
    const priveStortingen = parseFloat(fiscalState.prive?.stortingen) || 0;
    const priveOnttrekkingen = parseFloat(fiscalState.prive?.onttrekkingenInGeld) || 0;

    const eigenVermogenEind = eigenVermogenBegin + fiscaleWinst - priveOnttrekkingen + priveStortingen;

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
            eigenVermogenEind
        },
        afschrijvingenLog
    };
}
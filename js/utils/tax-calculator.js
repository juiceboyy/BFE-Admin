/**
 * js/utils/tax-calculator.js
 * Pure logic module voor het berekenen van de inkomstenbelasting en fiscale winst.
 */

// Constanten voor het belastingjaar (bijv. 2024 configuratie)
const TAX_CONSTANTS = {
    zelfstandigenaftrek: 3750,
    mkbWinstvrijstelling: 0.1331, // 13.31%
    kiaDrempel: 2800 // Wordt gebruikt in de AI advies module
};

/**
 * Berekent alle fiscale tussenstappen en eindtotalen op basis van de applicatie state.
 * @param {Object} fiscalState - De centrale status van de applicatie.
 * @returns {Object} calculatedTaxData
 */
export function calculateTaxes(fiscalState) {
    const year = parseInt(fiscalState.year || new Date().getFullYear(), 10);

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
        ondernemersaftrek = Math.min(TAX_CONSTANTS.zelfstandigenaftrek, fiscaleWinst);
    }

    const winstNaOndernemersaftrek = fiscaleWinst - ondernemersaftrek;

    // 5. MKB-Winstvrijstelling
    let mkbWinstvrijstellingBedrag = 0;
    if (winstNaOndernemersaftrek > 0) {
        mkbWinstvrijstellingBedrag = winstNaOndernemersaftrek * TAX_CONSTANTS.mkbWinstvrijstelling;
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
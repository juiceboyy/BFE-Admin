/**
 * js/api/extract-aangifte.js
 * Client-side parser voor Aangifte Inkomstenbelasting PDF-bestanden.
 * Extraheert tekst via PDF.js en stuurt deze naar de Netlify AI-scanner.
 */

import { extractTextFromPDFFile } from './extract.js';
import { fiscalState } from '../store/fiscal-state.js';

/**
 * Normaliseert het JSON-resultaat van de AI-scanner zodat zowel alternatieve als canonieke
 * veldnamen (winst vs winstberekening, mva vs inventaris, for vs forStand) altijd aanwezig zijn.
 */
function normalizeAangifteData(raw = {}) {
    const year = parseInt(raw.year || 2025, 10);
    const winstRaw = raw.winst || raw.winstberekening || {};
    const activaRaw = raw.balans?.activa || {};
    const passivaRaw = raw.balans?.passiva || {};
    const kapitaalRaw = raw.kapitaal || {};

    const mvaVal = Number(activaRaw.mva ?? activaRaw.inventaris ?? 0);
    const forVal = Number(passivaRaw.forStand ?? passivaRaw.for ?? 2143);
    const btwVal = Number(passivaRaw.btwSchuld ?? 0);
    const overigeVal = Number(passivaRaw.overigeSchulden ?? 0);
    const totaalSchuldenVal = Number(passivaRaw.totaalSchulden ?? (btwVal + overigeVal));

    const totaalActivaVal = Number(activaRaw.totaalActiva ?? activaRaw.totaal ?? 0);
    const totaalPassivaVal = Number(passivaRaw.totaalPassiva ?? passivaRaw.totaal ?? 0);

    const winstObj = {
        saldo: Number(winstRaw.saldo ?? 0),
        bijtelling: Number(winstRaw.bijtelling ?? 0),
        fiscaleWinst: Number(winstRaw.fiscaleWinst ?? 0),
        ondernemersaftrek: Number(winstRaw.ondernemersaftrek ?? 0),
        mkbWinstvrijstellingBedrag: Number(winstRaw.mkbWinstvrijstellingBedrag ?? 0),
        belastbareWinst: Number(winstRaw.belastbareWinst ?? 0)
    };

    return {
        year,
        omzet: {
            totaal: Number(raw.omzet?.totaal ?? 0),
            muziek9: Number(raw.omzet?.muziek9 ?? 0),
            onderwijs0: Number(raw.omzet?.onderwijs0 ?? 0),
            overig21: Number(raw.omzet?.overig21 ?? 0)
        },
        kosten: {
            totaal: Number(raw.kosten?.totaal ?? 0),
            uitbesteedWerk: Number(raw.kosten?.uitbesteedWerk ?? 0),
            afschrijving: Number(raw.kosten?.afschrijving ?? 0),
            autokosten: Number(raw.kosten?.autokosten ?? 0),
            huisvesting: Number(raw.kosten?.huisvesting ?? 0),
            andereKosten: Number(raw.kosten?.andereKosten ?? 0),
            financieleLasten: Number(raw.kosten?.financieleLasten ?? 0)
        },
        winst: winstObj,
        winstberekening: winstObj,
        balans: {
            activa: {
                mva: mvaVal,
                inventaris: mvaVal,
                debiteuren: Number(activaRaw.debiteuren ?? 0),
                overlopend: Number(activaRaw.overlopend ?? 0),
                borgMobility: Number(activaRaw.borgMobility ?? 0),
                bank: Number(activaRaw.bank ?? 0),
                totaalActiva: totaalActivaVal,
                totaal: totaalActivaVal
            },
            passiva: {
                forStand: forVal,
                for: forVal,
                eigenVermogen: Number(passivaRaw.eigenVermogen ?? 0),
                totaalVermogen: Number(passivaRaw.totaalVermogen ?? 0),
                btwSchuld: btwVal,
                overigeSchulden: overigeVal,
                totaalSchulden: totaalSchuldenVal,
                totaalPassiva: totaalPassivaVal,
                totaal: totaalPassivaVal
            }
        },
        kapitaal: {
            beginVermogen: Number(kapitaalRaw.beginVermogen ?? 0),
            vermogensmutatie: Number(kapitaalRaw.vermogensmutatie ?? 0),
            onttrekkingenGeld: Number(kapitaalRaw.onttrekkingenGeld ?? 0),
            onttrekkingenNatura: Number(kapitaalRaw.onttrekkingenNatura ?? 0),
            totaleOnttrekkingen: Number(kapitaalRaw.totaleOnttrekkingen ?? 0),
            totaleStortingen: Number(kapitaalRaw.totaleStortingen ?? 0),
            eindVermogen: Number(kapitaalRaw.eindVermogen ?? 0)
        }
    };
}

/**
 * Verwerkt een geüploade Aangifte IB PDF en werkt de fiscalState atomair bij.
 * @param {File} file - Het geselecteerde PDF-bestand
 * @returns {Promise<Object>} De genormaliseerde aangiftegegevens
 */
export async function parseAndApplyAangiftePDF(file) {
    if (!file) throw new Error('Geen bestand geselecteerd.');
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        throw new Error('Alleen PDF-bestanden worden ondersteund.');
    }

    // 1. Extraheer tekst uit de eerste 15 pagina's (bevat alle zakelijke posten)
    const text = await extractTextFromPDFFile(file, 15);
    if (!text || text.trim().length < 50) {
        throw new Error('Kon geen leesbare tekst uit de PDF extraheren. Zorg voor een niet-beveiligde PDF.');
    }

    // 2. Verzend naar de AI-scanner
    const response = await fetch('/.netlify/functions/scanAangifte', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || `Fout bij analyseren aangifte (HTTP ${response.status})`);
    }

    const json = await response.json();
    if (!json.success || !json.data) {
        throw new Error('Onvolledige gegevens ontvangen van de AI-scanner.');
    }

    // 3. Normaliseer en pas atomair toe op fiscalState
    const data = normalizeAangifteData(json.data);
    const detectedYear = String(data.year);

    fiscalState.batchUpdate(state => {
        state.year = detectedYear;
        state.balans = state.balans || {};
        state.balans.aangifteData = data;
        state.balans.debiteuren = data.balans.activa.debiteuren;
        state.balans.overlopendeActiva = data.balans.activa.overlopend;
        state.balans.omzetbelastingSchuld = data.balans.passiva.btwSchuld;
        state.balans.overigeSchulden = data.balans.passiva.overigeSchulden;
        state.balans.forStand = data.balans.passiva.forStand;

        state.bank = state.bank || {};
        state.bank.eindSaldo = data.balans.activa.bank;

        state.prive = state.prive || {};
        state.prive.onttrekkingenInGeld = data.kapitaal.onttrekkingenGeld;
        state.prive.onttrekkingenInNatura = data.kapitaal.onttrekkingenNatura;
        state.prive.stortingenInGeld = data.kapitaal.totaleStortingen;
        state.prive.stortingenInNatura = 0;
    });

    return data;
}

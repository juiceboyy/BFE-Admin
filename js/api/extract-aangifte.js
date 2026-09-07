/**
 * js/api/extract-aangifte.js
 * Client-side parser voor Aangifte Inkomstenbelasting PDF-bestanden.
 * Extraheert tekst via PDF.js en stuurt deze naar de Netlify AI-scanner.
 */

import { extractTextFromPDFFile } from './extract.js';
import { fiscalState } from '../store/fiscal-state.js';

/**
 * Verwerkt een geüploade Aangifte IB PDF en werkt de fiscalState bij.
 * @param {File} file - Het geselecteerde PDF-bestand
 * @returns {Promise<Object>} De geëxtraheerde aangiftegegevens
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

    const data = json.data;

    // 3. Pas toe op fiscalState voor het gedetecteerde jaar
    const detectedYear = String(data.year || new Date().getFullYear());
    fiscalState.setTopLevel('year', detectedYear);

    // Koppel de geëxtraheerde aangiftedata aan de balans-sectie
    fiscalState.setNested('balans', 'aangifteData', data);
    fiscalState.setNested('balans', 'debiteuren', data.balans?.activa?.debiteuren || 0);
    fiscalState.setNested('balans', 'overlopendeActiva', data.balans?.activa?.overlopend || 0);
    fiscalState.setNested('balans', 'omzetbelastingSchuld', data.balans?.passiva?.btwSchuld || 0);
    fiscalState.setNested('balans', 'overigeSchulden', data.balans?.passiva?.overigeSchulden || 0);
    fiscalState.setNested('balans', 'forStand', data.balans?.passiva?.for || 2143);

    // Bank
    if (data.balans?.activa?.bank !== undefined) {
        fiscalState.setNested('bank', 'eindSaldo', data.balans.activa.bank);
    }

    // Privé-mutaties
    if (data.kapitaal) {
        fiscalState.setNested('prive', 'onttrekkingenInGeld', data.kapitaal.onttrekkingenGeld || 0);
        fiscalState.setNested('prive', 'onttrekkingenInNatura', data.kapitaal.onttrekkingenNatura || 0);
        fiscalState.setNested('prive', 'stortingenInGeld', data.kapitaal.totaleStortingen || 0);
    }

    return data;
}

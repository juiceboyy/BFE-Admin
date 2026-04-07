/**
 * js/api/inventaris-kandidaten.js
 * Haalt individuele Inkoop-rijen op uit de spreadsheet en filtert op activeringsdrempel (>€450).
 * Stuurt kandidaten naar Claude voor classificatie als duurzaam bedrijfsmiddel.
 */

import { accessToken } from './auth.js';
import { fetchWithRetry } from '../utils/network.js';

const ACTIVERINGS_DREMPEL = 450; // Conform CLAUDE.md: >€450 excl. BTW activeren

/**
 * Haalt alle Inkoop-rijen op voor het jaar en geeft rijen terug met bedrag > drempel.
 */
async function fetchInkoopKandidaten(year, spreadsheetId) {
    const metaResponse = await fetchWithRetry(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (metaResponse.status === 401) throw new Error('TOKEN_EXPIRED');
    if (!metaResponse.ok) throw new Error('Kan spreadsheet metadata niet ophalen.');

    const meta = await metaResponse.json();
    const inkoopSheets = meta.sheets
        .map(s => s.properties.title)
        .filter(t => t.toLowerCase().includes('inkoop'));

    if (inkoopSheets.length === 0) return [];

    const params = new URLSearchParams({ valueRenderOption: 'UNFORMATTED_VALUE' });
    inkoopSheets.forEach(s => params.append('ranges', `'${s}'!A:Z`));

    const batchResponse = await fetchWithRetry(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${params}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (batchResponse.status === 401) throw new Error('TOKEN_EXPIRED');
    if (!batchResponse.ok) throw new Error('Kan Inkoop-data niet ophalen.');

    const batchData = await batchResponse.json();

    const parseEuro = (val) => {
        if (typeof val === 'number') return isNaN(val) ? 0 : val;
        if (!val) return 0;
        const cleaned = String(val).replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.');
        return parseFloat(cleaned) || 0;
    };

    const kandidaten = [];

    for (const rangeData of batchData.valueRanges || []) {
        if (!rangeData.values || rangeData.values.length <= 1) continue;

        const headers = rangeData.values[0].map(h => String(h || '').toLowerCase());
        const getIdx = (kws) => headers.findIndex(h => kws.some(kw => h.includes(kw)));

        const idxDatum       = getIdx(['datum', 'date']);
        const idxLeverancier = getIdx(['leverancier', 'naam leverancier']);
        const idxOmschrijving = getIdx(['omschrijving', 'description']);
        const idxExcl        = getIdx(['vergoeding', 'excl', 'factuurbedrag excl']);

        for (let i = 1; i < rangeData.values.length; i++) {
            const row = rangeData.values[i];
            if (!row || row.length === 0) continue;
            const isTotaal = row.slice(0, 5).some(c => /^totaal/i.test(String(c || '').trim()));
            if (isTotaal) break;

            const bedrag = idxExcl !== -1 ? parseEuro(row[idxExcl]) : 0;
            if (bedrag <= ACTIVERINGS_DREMPEL) continue;

            kandidaten.push({
                datum:        idxDatum !== -1 ? String(row[idxDatum] || '') : '',
                leverancier:  idxLeverancier !== -1 ? String(row[idxLeverancier] || '').trim() : 'Onbekend',
                omschrijving: idxOmschrijving !== -1 ? String(row[idxOmschrijving] || '').trim() : '',
                bedragExcl:   bedrag
            });
        }
    }

    return kandidaten;
}

/**
 * Stuurt de kandidaten naar Claude voor classificatie.
 * Geeft een array van geclassificeerde items terug.
 */
export async function getInventarisKandidaten(year, spreadsheetId) {
    const rijen = await fetchInkoopKandidaten(year, spreadsheetId);
    if (rijen.length === 0) return [];

    const response = await fetchWithRetry('/.netlify/functions/classifyInventaris', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rijen, year })
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || `Server error ${response.status}`);
    }

    const data = await response.json();
    let jsonText = data.text || '';

    // Strip markdown code fences
    jsonText = jsonText.replace(/```json/gi, '').replace(/```/g, '').trim();

    // Extraheer de JSON-array — alles van eerste '[' t/m laatste ']'
    const start = jsonText.indexOf('[');
    const end   = jsonText.lastIndexOf(']');
    if (start === -1 || end === -1 || end < start) return [];
    jsonText = jsonText.slice(start, end + 1);

    return JSON.parse(jsonText);
}

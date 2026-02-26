// --- Google Sheets API Fetcher ---
import { accessToken } from './auth.js';

export async function fetchBtwAdministratie() {
    if (!accessToken) {
        console.warn("Geen toegangstoken. Log eerst in.");
        return;
    }

    const SPREADSHEET_ID = '119dQIOSLFpKDqWUQUMWTU9miIKP3MOR1VHFB5yzmBrg';
    const RANGE = "'Jan Inkoop'!A1:E100";
    try {
        console.log("📊 Google Sheet ophalen...");
        const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${RANGE}`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (!response.ok) throw new Error(await response.text());

        const data = await response.json();

        if (!data.values) {
            console.log("Geen data gevonden in de sheet.");
            return;
        }

        console.log("✅ Sheet Data binnen:", data.values);

        // data.values is een array van arrays. Bijv:
        // [
        //   ["Datum", "Omschrijving", "Bedrag", "Btw"],
        //   ["2026-01-15", "Factuur Apple", "100.00", "21"],
        // ]

        // TODO: Map deze data naar je 'transactions' array om ze in de UI te tonen
        // verwerkSheetData(data.values);

    } catch (error) {
        console.error("🚨 Fout bij ophalen Sheet:", error);
    }
}
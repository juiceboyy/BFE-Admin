import { accessToken } from './auth.js';

export async function fetchFacturenUitGmail() {
    console.log("🔍 Fetcher gestart. Token aanwezig?", !!accessToken);

    if (!accessToken) {
        console.warn("🚨 Geen toegangstoken gevonden.");
        return [];
    }

    try {
        // 1. Bereken de datums voor de vorige maand
        const nu = new Date();
        const eersteDagVorigeMaand = new Date(nu.getFullYear(), nu.getMonth() - 1, 1);
        const eersteDagHuidigeMaand = new Date(nu.getFullYear(), nu.getMonth(), 1);

        const formatDate = (date) => {
            return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
        };

        const afterDate = formatDate(eersteDagVorigeMaand);
        const beforeDate = formatDate(eersteDagHuidigeMaand); // 'before' in Gmail is exclusief

        // 2. Maak de specifieke zoekopdracht
        const baseQuery = 'subject:(factuur OR invoice OR bon)';
        const timeQuery = `after:${afterDate} before:${beforeDate}`;
        const searchQuery = encodeURIComponent(`${baseQuery} ${timeQuery}`);

        console.log(`🔍 Zoeken naar facturen van: ${afterDate} tot ${beforeDate}`);
        const listResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${searchQuery}&maxResults=5`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        // Vang HTTP errors af
        if (!listResponse.ok) {
            const errorText = await listResponse.text();
            console.error("🚨 API Error:", listResponse.status, errorText);
            return [];
        }

        const listData = await listResponse.json();

        if (!listData.messages || listData.messages.length === 0) {
            console.log("ℹ️ Fetch gelukt, maar 0 mails gevonden met deze zoektermen.");
            return [];
        }

        console.log(`📦 ${listData.messages.length} mails gevonden, details ophalen...`);

        const facturen = await Promise.all(listData.messages.map(async (msg) => {
            const msgResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            const msgData = await msgResponse.json();

            const headers = msgData.payload.headers;
            const subject = headers.find(h => h.name === 'Subject')?.value || 'Geen onderwerp';
            const from = headers.find(h => h.name === 'From')?.value || 'Onbekende afzender';
            const dateStr = headers.find(h => h.name === 'Date')?.value;

            return {
                id: msg.id,
                afzender: from.replace(/<.*>/, '').trim(),
                onderwerp: subject,
                datum: dateStr ? new Date(dateStr) : new Date()
            };
        }));

        return facturen;
    } catch (error) {
        console.error("🚨 Fatale fout in de fetcher:", error);
        return [];
    }
}

export async function getInvoiceAttachment(messageId) {
    if (!accessToken) return null;

    try {
        // 1. Haal de volledige message payload op (zonder format=metadata krijg je full)
        const msgResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        const msg = await msgResponse.json();

        // 2. Zoek in parts naar een PDF
        const parts = msg.payload.parts || [];
        const pdfPart = parts.find(p => p.filename && p.filename.toLowerCase().endsWith('.pdf') && p.body && p.body.attachmentId);

        if (!pdfPart) return null;

        // 3. Haal de attachment data op via de attachmentId
        const attachmentId = pdfPart.body.attachmentId;
        const attResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        const attData = await attResponse.json();

        return attData.data; // Dit is de base64url string
    } catch (error) {
        console.error("🚨 Fout bij ophalen bijlage:", error);
        return null;
    }
}
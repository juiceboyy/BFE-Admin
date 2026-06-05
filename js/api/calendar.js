import { accessToken } from './auth.js';
import { fetchWithRetry } from '../utils/network.js';

/**
 * Fetch calendar events from the primary calendar within a date range.
 * @param {string} timeMin - ISO String representing the start of the period (RFC3339)
 * @param {string} timeMax - ISO String representing the end of the period (RFC3339)
 * @returns {Promise<Array>} List of event resources
 */
export async function fetchCalendarEvents(timeMin, timeMax) {
    if (!accessToken) throw new Error('Niet ingelogd bij Google (agenda).');

    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?` + 
                `timeMin=${encodeURIComponent(timeMin)}&` + 
                `timeMax=${encodeURIComponent(timeMax)}&` + 
                `singleEvents=true&` + 
                `orderBy=startTime&` + 
                `maxResults=250`;

    const response = await fetchWithRetry(url, {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        }
    });

    if (response.status === 401) throw new Error('TOKEN_EXPIRED');
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.error?.message || `Fout bij ophalen agenda: HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.items || [];
}

/**
 * Parses events and extracts fields required for the invoice.
 * @param {Array} events - List of Google Calendar events
 * @param {string} searchKeyword - Keyword to filter events by
 * @returns {Array} List of parsed invoice rows
 */
export function parseEventsForInvoicing(events, searchKeyword) {
    const keyword = (searchKeyword || '').toLowerCase().trim();
    
    // Filter events containing the keyword in title or description
    const filteredEvents = events.filter(event => {
        const title = (event.summary || '').toLowerCase();
        const desc = (event.description || '').toLowerCase();
        return title.includes(keyword) || desc.includes(keyword);
    });

    return filteredEvents.map(event => {
        const startDate = event.start.dateTime ? new Date(event.start.dateTime) : new Date(event.start.date);
        
        // 1. Calculate week number (ISO-8601, Dutch standard)
        const week = getWeekNumber(startDate);
        
        // 2. Format Date (D/M/YY)
        const formattedDate = formatDateShort(startDate);
        
        // 3. Location (first segment of location string)
        const location = (event.location || '').split(',')[0].trim() || 'Lely'; // Default to Lely if empty

        // 4. Activity (clean the MZO keyword out of the title)
        let activity = event.summary || '';
        if (keyword) {
            // Strip the keyword and common separators
            const regex = new RegExp(searchKeyword, 'gi');
            activity = activity.replace(regex, '').replace(/^[\s\-_:/]+|[\s\-_:/]+$/g, '').trim();
        }
        if (!activity) activity = 'Lesgeven';

        // 5. Parse Instrument from description or title
        const instrument = detectInstrument(event.description, event.summary);

        // 6. Parse Hours
        const hours = parseHours(event);

        return {
            id: event.id,
            week,
            dateObj: startDate,
            datum: formattedDate,
            lokatie: location,
            activiteit: activity,
            instrument,
            uren: hours, // Can be null, will prompt user
            tarief: 50.00, // Default rate
            gefactureerd: checkAlreadyInvoiced(event.description)
        };
    });
}

/**
 * Checks if the event description indicates it has already been invoiced.
 * @param {string} description 
 * @returns {boolean}
 */
function checkAlreadyInvoiced(description) {
    if (!description) return false;
    return /gefactureerd\s+\d{4}\.\d{3}/i.test(description);
}

/**
 * Updates a calendar event's description to append invoicing details.
 * @param {string} eventId 
 * @param {string} factuurNummer 
 */
export async function updateCalendarEventInvoiceStatus(eventId, factuurNummer) {
    if (!accessToken) throw new Error('Niet ingelogd bij Google.');

    // 1. Fetch current event to preserve other fields
    const getUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`;
    const getResponse = await fetchWithRetry(getUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (getResponse.status === 401) throw new Error('TOKEN_EXPIRED');
    if (!getResponse.ok) {
        console.error(`Fout bij ophalen event ${eventId}:`, getResponse.status);
        return;
    }

    const event = await getResponse.json();
    let currentDesc = event.description || '';

    // Check if already contains this specific invoice number or general gefactureerd tag
    if (currentDesc.includes(`gefactureerd ${factuurNummer}`)) {
        return; // Already marked
    }

    // Append invoice info
    const label = `gefactureerd ${factuurNummer}`;
    const newDesc = currentDesc ? `${currentDesc}\n${label}` : label;

    // 2. PATCH the description
    const patchUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`;
    const patchResponse = await fetchWithRetry(patchUrl, {
        method: 'PATCH',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            description: newDesc
        })
    });

    if (patchResponse.status === 401) throw new Error('TOKEN_EXPIRED');
    if (!patchResponse.ok) {
        const err = await patchResponse.json().catch(() => ({}));
        console.error(`Fout bij markeren event ${eventId} als gefactureerd:`, err?.error?.message || patchResponse.status);
    }
}

/**
 * Calculate ISO 8601 week number.
 */
function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

/**
 * Formats a date to D/M/YY (e.g. 2/4/26)
 */
function formatDateShort(date) {
    const day = date.getDate();
    const month = date.getMonth() + 1;
    const year = String(date.getFullYear()).slice(-2);
    return `${day}/${month}/${year}`;
}

/**
 * Tries to parse the number of hours from description or summary.
 */
function parseHours(event) {
    const textToSearch = `${event.description || ''} ${event.summary || ''}`;
    // Look for numbers like 1.5, 2,25, 2 followed by 'u' or 'uur' or 'hour'
    const match = textToSearch.match(/(?:^|\s|\()([0-9]+(?:[.,][0-9]+)?)\s*(?:u|uur|uren|hrs|h|hour|hours)(?:\s|$|\))/i);
    if (match) {
        const val = match[1].replace(',', '.');
        const hours = parseFloat(val);
        if (!isNaN(hours)) return hours;
    }

    // Fallback: Event duration
    if (event.start && event.start.dateTime && event.end && event.end.dateTime) {
        const start = new Date(event.start.dateTime);
        const end = new Date(event.end.dateTime);
        const durationHours = (end - start) / (1000 * 60 * 60);
        if (durationHours > 0 && durationHours < 24) {
            return Math.round(durationHours * 100) / 100;
        }
    }

    return null;
}

/**
 * Helper to auto-detect instrument from title or description keywords
 */
function detectInstrument(description, summary) {
    const text = `${description || ''} ${summary || ''}`.toLowerCase();
    
    if (text.includes('slagwerk') || text.includes('drum') || text.includes('percussie')) {
        return 'slagwerk';
    }
    if (text.includes('gitaar') || text.includes('guitar')) {
        return 'gitaar';
    }
    if (text.includes('piano') || text.includes('toetsen') || text.includes('keyboard')) {
        return 'piano';
    }
    if (text.includes('zang') || text.includes('sing') || text.includes('vocal')) {
        return 'zang';
    }
    if (text.includes('basgitaar') || text.includes('bass')) {
        return 'basgitaar';
    }
    
    return 'diversen'; // Default
}

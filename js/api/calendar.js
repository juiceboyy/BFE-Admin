import { accessToken } from './auth.js';
import { fetchWithRetry } from '../utils/network.js';

/**
 * Fetch calendar events from the primary calendar within a date range (Google Calendar).
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
 * Fetches an iCloud iCal calendar via Netlify CORS proxy and parses it.
 * @param {string} webcalUrl - The webcal:// or https:// iCloud sharing URL
 * @param {string} timeMin - ISO string start date filter
 * @param {string} timeMax - ISO string end date filter
 * @returns {Promise<Array>} List of calendar events matching date filters
 */
export async function fetchAndParseIcsCalendar(webcalUrl, timeMin, timeMax) {
    const proxyUrl = `/.netlify/functions/fetchIcal?url=${encodeURIComponent(webcalUrl)}`;
    
    const response = await fetch(proxyUrl);
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.error || `Fout bij ophalen iCloud agenda (HTTP ${response.status})`);
    }

    const icsText = await response.text();
    const allEvents = parseIcs(icsText);
    
    // Filter events by date range
    const startBound = new Date(timeMin);
    const endBound = new Date(timeMax);

    const filtered = allEvents.filter(event => {
        const eventDateStr = event.start?.dateTime || event.start?.date;
        if (!eventDateStr) return false;
        
        const eventDate = new Date(eventDateStr);
        return eventDate >= startBound && eventDate <= endBound;
    });

    // Sort by start date ascending
    filtered.sort((a, b) => {
        const dateA = new Date(a.start?.dateTime || a.start?.date);
        const dateB = new Date(b.start?.dateTime || b.start?.date);
        return dateA - dateB;
    });

    return filtered;
}

/**
 * Parses events and extracts fields required for the invoice.
 * @param {Array} events - List of events (works with both Google Calendar and parsed iCal format)
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
 * Updates a calendar event's description to append invoicing details. (Google Calendar only)
 * @param {string} eventId 
 * @param {string} factuurNummer 
 */
export async function updateCalendarEventInvoiceStatus(eventId, factuurNummer) {
    if (!accessToken) throw new Error('Niet ingelogd bij Google.');

    // 1. Fetch current event to preserve other fields
    const getUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`;
    const getResponse = await fetchWithRetry(getUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (getResponse.status === 401) throw new Error('TOKEN_EXPIRED');
    if (!getResponse.ok) {
        const err = await getResponse.json().catch(() => ({}));
        throw new Error(`Ophalen Google Calendar afspraak ${eventId} mislukt: ${err?.error?.message || getResponse.status}`);
    }

    const event = await getResponse.json();
    let currentDesc = event.description || '';

    if (currentDesc.includes(`gefactureerd ${factuurNummer}`)) {
        return; 
    }

    const label = `gefactureerd ${factuurNummer}`;
    const newDesc = currentDesc ? `${currentDesc}\n${label}` : label;

    // 2. PATCH the description
    const patchUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`;
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
        throw new Error(`Bijwerken Google Calendar omschrijving mislukt: ${err?.error?.message || patchResponse.status}`);
    }
}

/**
 * Simple iCalendar (.ics) text file parser.
 * @param {string} icsText 
 * @returns {Array} List of parsed events in Google Calendar-like schema
 */
export function parseIcs(icsText) {
    const events = [];
    const lines = icsText.split(/\r?\n/);
    let currentEvent = null;

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];

        // Unfold lines: continuation lines start with whitespace
        while (i + 1 < lines.length && (lines[i + 1].startsWith(' ') || lines[i + 1].startsWith('\t'))) {
            line += lines[i + 1].slice(1);
            i++;
        }

        const colonIdx = line.indexOf(':');
        if (colonIdx === -1) continue;

        const key = line.slice(0, colonIdx);
        const value = line.slice(colonIdx + 1);

        const propName = key.split(';')[0].toUpperCase().trim();

        if (propName === 'BEGIN' && value.trim() === 'VEVENT') {
            currentEvent = {};
        } else if (propName === 'END' && value.trim() === 'VEVENT') {
            if (currentEvent) events.push(currentEvent);
            currentEvent = null;
        } else if (currentEvent) {
            if (propName === 'SUMMARY') {
                currentEvent.summary = unescapeIcsValue(value);
            } else if (propName === 'DESCRIPTION') {
                currentEvent.description = unescapeIcsValue(value);
            } else if (propName === 'LOCATION') {
                currentEvent.location = unescapeIcsValue(value);
            } else if (propName === 'DTSTART') {
                currentEvent.start = parseIcsDate(line, value);
            } else if (propName === 'DTEND') {
                currentEvent.end = parseIcsDate(line, value);
            } else if (propName === 'UID') {
                currentEvent.id = value.trim();
            }
        }
    }

    return events;
}

function unescapeIcsValue(val) {
    return val.replace(/\\,/g, ',')
              .replace(/\\;/g, ';')
              .replace(/\\n/gi, '\n')
              .replace(/\\\\/g, '\\')
              .trim();
}

function parseIcsDate(line, value) {
    const val = value.trim();
    
    // Check for TzID parameters in the key, but we default to parse as local date string
    // Format is YYYYMMDDTHHMMSSZ or YYYYMMDDTHHMMSS or YYYYMMDD
    const year = parseInt(val.slice(0, 4), 10);
    const month = parseInt(val.slice(4, 6), 10) - 1;
    const day = parseInt(val.slice(6, 8), 10);

    if (val.includes('T')) {
        const hour = parseInt(val.slice(9, 11), 10);
        const min = parseInt(val.slice(11, 13), 10);
        const sec = parseInt(val.slice(13, 15), 10);

        if (val.endsWith('Z')) {
            // UTC
            return { dateTime: new Date(Date.UTC(year, month, day, hour, min, sec)).toISOString() };
        } else {
            // Local time (parsed in current client timezone)
            return { dateTime: new Date(year, month, day, hour, min, sec).toISOString() };
        }
    } else {
        // Date only
        return { date: `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` };
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
    
    return 'diversen';
}

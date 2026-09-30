function isPodiumkleding(text) {
    if (!text || typeof text !== 'string') return false;
    const lower = text.toLowerCase().trim();
    if (lower === 'podiumkleding') return true;
    const pattern = /\b([a-zA-Z]*(?:kleding|kleren|kledij|podiumkleding|zonnebril|zonnebrillen|sunglass|sunglasses|tas|tassen|rugzak|rugzakken|koffer|koffers|backpack|backpacks|broek|broeken|pantalon|pantalons|jeans|overhemd|overhemden|shirt|shirts|polo|blouse|trui|truien|sweater|sweaters|hoodie|hoodies|vest|vesten|cardigan|jas|jassen|jack|jacks|jacket|blazer|blazers|colbert|colberts|kostuum|kostuums|maatpak|smoking|tuxedo|schoen|schoenen|sneaker|sneakers|laars|laarzen|laarsjes|boots|stropdas|stropdassen|vlinderdas|hoed|hoeden|pet|petten))\b/i;
    return pattern.test(lower);
}

function normalizeCurrency(valutaStr, textContext = '') {
    if (!valutaStr && !textContext) return 'EUR';
    let raw = String(valutaStr || '').trim().toUpperCase();
    
    if (raw === 'DEK' || raw === 'DKK' || raw.includes('DEENSE') || raw.includes('DANISH')) return 'DKK';
    if (raw === 'SEK' || raw.includes('ZWEEDSE') || raw.includes('SWEDISH')) return 'SEK';
    if (raw === 'NOK' || raw.includes('NOORSE') || raw.includes('NORWEGIAN')) return 'NOK';
    if (raw === 'GBP' || raw === '£' || raw.includes('POUND') || raw.includes('POND')) return 'GBP';
    if (raw === 'CHF' || raw.includes('FRANK') || raw.includes('FRANC')) return 'CHF';
    if (raw === 'CAD' || raw.includes('C$') || raw.includes('CANADIAN')) return 'CAD';
    if (raw === 'AUD' || raw.includes('A$') || raw.includes('AUSTRALIAN')) return 'AUD';
    if (raw === 'JPY' || raw === '¥' || raw.includes('YEN')) return 'JPY';
    if (raw === 'PLN' || raw.includes('ZLOTY')) return 'PLN';
    if (raw === 'CZK' || raw.includes('KORUNA')) return 'CZK';
    if (raw === 'EUR' || raw === '€' || raw.includes('EURO')) return 'EUR';
    if (raw === 'USD' || raw === '$' || raw.includes('DOLLAR')) return 'USD';

    if (/^[A-Z]{3}$/.test(raw)) {
        return raw;
    }

    const ctx = String(textContext || '').toUpperCase();
    if (ctx.includes('£') || ctx.includes('GBP')) return 'GBP';
    if (ctx.includes('DKK') || ctx.includes('DEK')) return 'DKK';
    if (ctx.includes('SEK')) return 'SEK';
    if (ctx.includes('NOK')) return 'NOK';
    if (ctx.includes('CHF')) return 'CHF';
    if (ctx.includes('$') || ctx.includes('USD')) return 'USD';

    return raw || 'USD';
}

async function fetchDailyExchangeRate(currency = 'USD', dateStr = '') {
    const cleanCurrency = normalizeCurrency(currency);
    if (cleanCurrency === 'EUR') {
        return { rate: 1, date: dateStr };
    }

    const isValidDate = /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
    const datePath = isValidDate ? dateStr : 'latest';

    const urls = [
        `https://api.frankfurter.dev/v1/${datePath}?base=${cleanCurrency}&symbols=EUR`,
        `https://api.frankfurter.app/${datePath}?base=${cleanCurrency}&symbols=EUR`
    ];

    for (const url of urls) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3500);
            const res = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (res.ok) {
                const data = await res.json();
                if (data && data.rates && data.rates.EUR) {
                    return { rate: data.rates.EUR, date: data.date || dateStr };
                }
            }
        } catch (_) {
            // Probeer fallback URL
        }
    }

    if (datePath !== 'latest') {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2500);
            const res = await fetch(`https://api.frankfurter.dev/v1/latest?base=${cleanCurrency}&symbols=EUR`, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (res.ok) {
                const data = await res.json();
                if (data && data.rates && data.rates.EUR) {
                    return { rate: data.rates.EUR, date: data.date };
                }
            }
        } catch (_) {}
    }

    return null;
}

export const handler = async (event, context) => {
    // Alleen POST requests toestaan
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method Not Allowed' })
        };
    }

    try {
        // Parse de inkomende data
        let { base64Data, mimeType, cloudMemory, mode = 'inkoop' } = JSON.parse(event.body);

        // Haal de API key veilig op en verwijder onzichtbare tekens
        const apiKey = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : '';
        
        if (!apiKey) {
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'Server configuratiefout: API Key ontbreekt.' })
            };
        }

        // Gebruik de stabiele URL voor Gemini 3.6 Flash
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`;

        // Zorg ervoor dat base64Data géén data prefix bevat
        if (base64Data.includes(',')) {
            base64Data = base64Data.split(',')[1];
        }

        // Bepaal de system prompt op basis van de modus (inkoop vs verkoop)
        let systemPrompt;
        if (mode === 'verkoop') {
            systemPrompt = `Je bent een accountant die een UITGAANDE verkoopfactuur analyseert. Jij (de afzender) bent Big Fish Entertainment of Ronald van Holst. Gebruik NOOIT deze namen als klant. De klantNaam is degene AAN WIE de factuur is gericht (vaak onder kopjes als "Factuur voor:" of "Aan:"). Voor de omschrijving: Omdat verkoopfacturen vaak meerdere regels hebben, bedenk zelf een korte, logische samenvatting (bijv. "Huur werkruimte en opslag"). Neem niet letterlijk alle regels over. CRUCIAAL: De omschrijving mag NOOIT worden afgekapt met puntjes (...). Gebruik in plaats daarvan gangbare afkortingen (zoals 'mgmt', 'werkzh', 'vh', 'div', 'adm', en voor bandnaam "Come Again" altijd 'CA') om de lengte binnen een acceptabele grens (maximaal 50-60 tekens) te houden. Gebruik nooit 'werkzk', maar altijd 'werkzh' voor werkzaamheden. De datum MOET ALTIJD in het format YYYY-MM-DD zijn (bijv. 2026-02-28). Gebruik NOOIT tekst zoals "feb" of "maart". Als je de datum niet exact weet, gebruik dan de laatste dag van de gevonden maand. BELANGRIJK: Je MOET uitsluitend een geldig JSON object returnen dat EXACT deze structuur volgt. Zorg dat de omschrijving altijd is ingevuld met een logische samenvatting van de factuurregels: { "factuurnummer": "...", "datum": "YYYY-MM-DD", "klantNaam": "...", "omschrijving": "Jouw samenvatting hier", "totaalBedrag": 0.00, "btwLaag": 0.00, "btwHoog": 0.00, "omzetLaag": 0.00, "omzetHoog": 0.00, "omzetNul": 0.00 }`;
        } else {
            systemPrompt = `Je bent een Nederlandse accountant die inkoopfacturen en bonnen analyseert.
Haal de volgende velden uit deze bon of factuur:
1. datum: De officiële FACTUURDATUM / UITGIFTEDATUM in het formaat YYYY-MM-DD (bijv. 2026-07-03).
   CRUCIAAL: Gebruik ALTIJD de factuurdatum / aankoopdatum en NOOIT de vervaldatum, uiterste betaaldatum, incassodatum of leverdatum.
2. naamLeverancier: De officiële handelsnaam van het bedrijf / de organisatie die de factuur heeft uitgereikt (de leverancier). Nooit de naam van de klant (Ronald van Holst / Big Fish Entertainment).
3. omschrijving: Een beknopte, duidelijke omschrijving van de gekochte goederen/diensten. De omschrijving mag NOOIT worden afgekapt met puntjes (...). Gebruik gangbare afkortingen (zoals 'mgmt', 'werkzh', 'vh', 'div', 'adm', en voor bandnaam "Come Again" altijd 'CA') om binnen 50-60 tekens te blijven. Gebruik nooit 'werkzk', maar 'werkzh' voor werkzaamheden.
   CRUCIALE REGEL VOOR KLEDING EN ACCESSOIRES:
   Als de uitgave of aankoop betrekking heeft op kleding (zoals overhemden, shirts, broeken, kostuums, jassen, schoenen, etc.), een zonnebril of een tas (zoals een laptoptas, rugzak, koffer, reistas, etc.), dan MOET de omschrijving ALTIJD exact 'podiumkleding' zijn. Deze regel heeft absolute voorrang boven merknamen of artikelen op de bon en boven het cloudMemory.
   Hier is het historische geheugen van de gebruiker: ${JSON.stringify(cloudMemory)}.
   Als de leverancier voorkomt in het geheugen, kies dan de best passende omschrijving voor deze specifieke aankoop (behalve wanneer het kleding, een zonnebril of een tas betreft: dan altijd 'podiumkleding').
4. valuta: Bepaal nauwkeurig de exacte officiële 3-letterige ISO valutacode van de factuur of bon.
   - Euro: "EUR" (bij €, EUR, Euro).
   - Britse Pond: "GBP" (bij £, GBP, Pound).
   - Deense Kroon: "DKK" (bij DKK, kr. uit Denemarken).
   - Zweedse Kroon: "SEK" (bij SEK, kr. uit Zweden).
   - Noorse Kroon: "NOK" (bij NOK, kr. uit Noorwegen).
   - Zwitserse Frank: "CHF" (bij CHF, Fr.).
   - Canadese Dollar: "CAD" (bij CAD, C$).
   - Australische Dollar: "AUD" (bij AUD, A$).
   - Japanse Yen: "JPY" (bij JPY, ¥).
   - US Dollar: "USD" (bij $, USD, US Dollar).
   - Overige valuta: geef altijd de specifieke 3-letterige ISO-code (bijv. PLN, CZK).
   BELANGRIJKE REGEL: Ga er NOOIT zomaar vanuit dat het altijd USD is! Kijk heel zorgvuldig naar valutatekens (£, $, kr, Fr, ¥), land/leverancier en valutacodes op de bon. Alleen wanneer het daadwerkelijk om dollars gaat of wanneer een niet-euro valuta niet nader te specificeren is buiten een dollaraanduiding, kies je "USD".
5. factuurBedrag: Het exacte TOTAALBEDRAG van de factuur inclusief btw/tax in de ORIGINELE valuta op de bon (het totale te betalen/voldane bedrag onderaan de bon). Return dit als getal (float).
6. btwBedrag: Het totale btw-bedrag op de factuur in de originele valuta. Let op: voor buitenlandse bonnen (zoals in USD, GBP, DKK) is er voor de Nederlandse boekhouding geen aftrekbare voorbelasting (buitenlandse tax telt als onderdeel van de kosten); vul 0.00 in tenzij er expliciet Nederlandse btw (met NL btw-nummer) op de bon staat. Return dit als getal (float).
7. factuurnummer: Het factuurnummer dat op de bon van de leverancier staat (indien aanwezig).

UITZONDERING VOOR ING BANKAFSCHRIFTEN:
Als je herkent dat het document een bankafschrift is (bijv. ING Af- en bijschrijvingen):
- Focus UITSLUITEND op de eerste pagina van het document.
- Vul "Tesla" in als naamLeverancier.
- Zoek naar het kopje "Totaal af (EUR)" voor het factuurBedrag (negeer mintekens).
- Bereken het btwBedrag als: (factuurBedrag * 21) / 121 (afgerond op 2 decimalen).
- Omschrijving: "Tesla Supercharging".
- Datum: Altijd de LAATSTE DAG VAN DE BETREFFENDE MAAND (YYYY-MM-DD).
- factuurnummer: Laat leeg ("").
- valuta: "EUR".

BELANGRIJK: Return UITSLUITEND een geldig JSON object met de structuur:
{
  "factuurnummer": "...",
  "datum": "YYYY-MM-DD",
  "naamLeverancier": "...",
  "omschrijving": "...",
  "valuta": "EUR",
  "factuurBedrag": 0.00,
  "btwBedrag": 0.00
}`;
        }

        // Fetch request body volgens Gemini v1beta specificatie
        const payload = {
            contents: [{
                parts: [
                    { text: systemPrompt },
                    {
                        inline_data: {
                            mime_type: mimeType,
                            data: base64Data
                        }
                    }
                ]
            }],
            generationConfig: {
                temperature: 0.0
            }
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        // Error handling: Google API fouten
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const errorMessage = errorData?.error?.message || (typeof errorData?.error === 'string' ? errorData.error : `Gemini API fout (${response.status})`);
            return {
                statusCode: 500,
                body: JSON.stringify({ error: errorMessage })
            };
        }

        // Succes handling: Data extractie en opschoning
        const data = await response.json();
        let text = data.candidates[0].content.parts[0].text;

        // Strip markdown formatting (```json en ```)
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();

        // Extra verwerking voor inkoop: podiumkleding & valutaconversie
        if (mode === 'inkoop') {
            try {
                const parsed = JSON.parse(text);

                // Podiumkleding garantie
                if (parsed.omschrijving && isPodiumkleding(parsed.omschrijving)) {
                    parsed.omschrijving = 'podiumkleding';
                }

                // Valuta inspectie en omrekening naar EUR met dagprijs
                const rawValuta = parsed.valuta || '';
                const rawBedragStr = String(parsed.factuurBedrag || '');
                const rawOmschr = String(parsed.omschrijving || '');
                const currency = normalizeCurrency(rawValuta, `${rawBedragStr} ${rawOmschr}`);
                const isEuro = currency === 'EUR';

                if (!isEuro) {
                    const rateInfo = await fetchDailyExchangeRate(currency, parsed.datum);
                    if (rateInfo && rateInfo.rate) {
                        const origBedrag = parseFloat(String(parsed.factuurBedrag || '').replace(/[^0-9.-]/g, '')) || 0;
                        const origBtw = parseFloat(String(parsed.btwBedrag || '').replace(/[^0-9.-]/g, '')) || 0;
                        parsed.origineelValuta = currency;
                        parsed.origineelBedrag = origBedrag;
                        parsed.origineelBtwBedrag = origBtw;
                        parsed.wisselkoers = rateInfo.rate;
                        parsed.koersDatum = rateInfo.date;
                        parsed.omgerekend = true;
                        parsed.factuurBedrag = Math.round(origBedrag * rateInfo.rate * 100) / 100;
                        parsed.btwBedrag = Math.round(origBtw * rateInfo.rate * 100) / 100;
                        parsed.valuta = 'EUR';
                    }
                }

                text = JSON.stringify(parsed);
            } catch (_) {
                // Laat text intact als JSON parse faalt, de client handelt het af
            }
        }

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: text
        };

    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};
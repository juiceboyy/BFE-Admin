# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

**BFE Admin** — an accounting/tax management dashboard for Big Fish Entertainment. Handles receipt scanning (OCR via Google Gemini), BTW (Dutch VAT) tracking, and fiscal year-end reporting. All data lives in a Google Sheet; files in Google Drive.

## Running the App

No build step. Open `index.html` in a browser directly, or use any static file server:

```bash
npx serve .
# or
python3 -m http.server 8080
```

**Netlify Functions** require the Netlify CLI for local testing:

```bash
npm install -g netlify-cli
netlify dev   # serves index.html + functions at localhost:8888
```

Serverless functions:
- `netlify/functions/scanReceipt.js` — proxies receipt images to the Gemini Vision API. Requires `GEMINI_API_KEY`.
- `netlify/functions/fiscalAdvisor.js` — proxies Dutch tax advice requests to the Anthropic Claude API. Requires `ANTHROPIC_API_KEY`. Injects Dutch finance domain rules as system prompt.

## Architecture

**Vanilla JS ES6 modules, no build toolchain.** CDN dependencies: Tailwind CSS, pdf.js, lucide icons, Google Identity Services.

### Module Layout

```
js/
├── main.js                 # Entry point — imports and wires all modules
├── api/
│   ├── auth.js             # Google OAuth token acquisition & scope management
│   ├── storage.js          # Google Drive file upload (2-step: create metadata, then upload)
│   ├── storage-queries.js  # Google Sheets read operations (invoice numbers, memory)
│   ├── gemini.js           # Gemini API wrapper (receipt OCR)
│   ├── tax-collector.js    # Aggregates year data across all Inkoop/Verkoop sheets
│   └── tax-advisor.js      # AI-powered tax advice via Claude (Anthropic)
├── ui/
│   ├── scanner.js          # Receipt/invoice upload & batch processing UI
│   ├── scanner-row.js      # Renders individual receipt rows in the review table
│   ├── scanner-helpers.js  # Extracts & validates form field values from scanner rows
│   ├── dashboard.js        # Real-time BTW balance display
│   ├── btw.js              # Manual BTW transaction entry form
│   ├── fiscal-intake.js    # Year-end intake form (sync from Sheets, enter assets, etc.)
│   ├── fiscal-report.js    # Tax calculation results & report rendering
│   └── navigation.js       # Tab switching
├── store/
│   └── fiscal-state.js     # Central state for fiscal year data (observer pattern)
└── utils/
    ├── date.js             # Period validation utilities
    ├── network.js          # fetch() wrapper with retry logic
    └── tax-calculator.js   # Core Dutch tax math: depreciation, MKB exemption, winst
```

### Data Flow

**Receipt scanning:**
1. User uploads file in `scanner.js`
2. File → base64 → POST to `netlify/functions/scanReceipt.js`
3. Netlify function calls Gemini Vision → returns structured JSON (factuurnummer, datum, bedragen, btw)
4. User reviews rows, edits if needed
5. Save → `storage.js` uploads PDF to Drive, updates Google Sheet row

**Fiscal year-end:**
1. `fiscal-intake.js` calls `tax-collector.js` → reads all Inkoop/Verkoop sheets for the year
2. User enters additional data (inventory, assets, private use)
3. `fiscal-state.js` holds the aggregated state (observer pattern notifies all listeners)
4. `fiscal-report.js` reads state → `tax-calculator.js` computes depreciation, winst, belastingdruk
5. `tax-advisor.js` sends summary to Claude (via `fiscalAdvisor` Netlify function) for AI recommendations

### Key Constants (in source files)

| Constant | Location | Value |
|---|---|---|
| `SPREADSHEET_ID` | `storage-queries.js`, `tax-collector.js` | `119dQIOSLFpKDqWUQUMWTU9miIKP3MOR1VHFB5yzmBrg` |
| `DRIVE_FOLDER_ID` | `storage.js` | `1NBCQ89t1soAvZ315_UA-p-lF340qkraH` |
| `CLIENT_ID` | `auth.js` | Google OAuth client ID |

### Google Sheets Schema

Sheets are named `Inkoop YYYY` (purchases) and `Verkoop YYYY` (sales). Columns follow a fixed order: datum, leverancier/klant, omschrijving, bedrag excl. BTW, btw21, btw9, bedrag incl. BTW, etc. The `tax-collector.js` reads these by column index — adding/reordering columns in the sheet will break data collection.

### Authentication

Google OAuth popup triggered on first action requiring Drive/Sheets access. Token stored in module-level variable in `auth.js` and passed to all API calls as `Authorization: Bearer ${accessToken}`. Scopes: Drive file upload, Sheets read/write, Gmail read.

## Dutch Tax Logic

`tax-calculator.js` implements Dutch IB (income tax) rules:
- **Zelfstandigenaftrek**: €3,750 fixed deduction
- **MKB-winstvrijstelling**: 13.31% exemption on remaining profit
- **Depreciation**: 20% per year on assets, applied over `leeftijd` years
- **Belastingdruk**: Progressive brackets for `belastbaarInkomen`

When modifying tax calculations, verify against the actual Dutch tax rules for the relevant year — the bracket percentages and deduction amounts change annually.

## Dutch Finance Domain Knowledge

This app handles Dutch accounting and tax logic. Apply the following rules consistently.

### Entity type
Big Fish Entertainment is a **eenmanszaak** (sole proprietor). IB (inkomstenbelasting) applies, not VPB. Tax is calculated outside the P&L.

### BTW (VAT) rules
- All amounts stored and displayed are **excl. BTW**
- BTW standard rate: **21%** (dienstverlening)
- BTW filing: quarterly, deadline = 1 month after quarter end
  - Q1 → 30 april | Q2 → 31 juli | Q3 → 31 oktober | Q4 → 31 januari
- B2B EU clients: 0% verlegd, ICP-opgaaf required
- Non-EU clients: 0% vrijgesteld (Wet OB art. 6 lid 2b)

### Dutch IB tax logic (fiscal year-end module)
Apply in this order:
1. Winst = Netto-omzet − Kosten (excl. BTW, excl. afschrijvingen)
2. Afschrijvingen aftrekken (lineaire methode)
3. Zelfstandigenaftrek (2024: €3.750; afbouw naar €900 in 2027)
4. MKB-winstvrijstelling: **13,31%** van winst na zelfstandigenaftrek (was 14% in 2023)
5. Belastbare winst = resultaat na stap 4
6. IB tarief box 1 (2024): 36,97% t/m €75.518 | 49,50% daarboven

### Depreciation reference (lineaire methode)
- Computers/hardware: 3–5 jaar
- Inventaris: 5–10 jaar
- Bedrijfsauto: 4–5 jaar

### Google Sheets data structure
- Tab `Inkoop YYYY` = purchase/expense rows
- Tab `Verkoop YYYY` = revenue rows
- Stop-condition on row loop: `if (String(row[0]).toLowerCase().includes('totaal')) break;`
- Always use specific `findIndex` for column mapping — no greedy search
- Declare accumulator variables locally within functions

### RGS account numbers (reference)
- 1100 Bank | 1200 Debiteuren | 1500 Te vorderen BTW
- 5300 Af te dragen BTW | 5500 Te betalen IB
- 8000 Netto-omzet | 9000 Inkoopkosten | 9200 Afschrijvingen

### BTW Reconciliation logic
When reconciling BTW in the app:
- Compare grootboek BTW balance to filed kwartaalaangiftes
- Rubrieken: 1a (21% omzet) | 1b (9% omzet) | 2a (BTW verlegd inkoop) | 4a (ICP) | 5b (voorbelasting)
- Flag any difference between boekhouding and aangifte as a reconciliation item
- Aging of open items: 0-30d monitor | 31-60d investigate | 61-90d escalate | 90+ management
- Retention rule: all reconciliations must be traceable for **7 jaar** (art. 52 AWR)

### Period close — task sequencing for fiscal-year module
Execute in this dependency order:
1. Bank/kas boekingen verwerken (no dependencies)
2. Afschrijvingen + amortisatie vooruitbetaalde kosten (no dependencies)
3. Bankafstemming (requires: step 1 + bank statement)
4. Omzet + overlopende posten (requires: facturatie finalized)
5. Debiteuren- en crediteurenafstemming (requires: steps 1-4)
6. BTW-afstemming (requires: full quarter close complete)
7. Conceptjaarrekening + variantieanalyse (requires: steps 1-6)

### Fiscal calendar deadlines (show in UI where relevant)
- BTW Q1 → 30 april | Q2 → 31 juli | Q3 → 31 oktober | Q4 → 31 januari
- IB-aangifte eenmanszaak → 1 mei volgend jaar
- KVK-deponering → 12 maanden na boekjaareinde
- BTW-correctie privégebruik → uiterlijk 31 december boekjaar

### Year-end close checklist items (fiscal-intake module)
- Privécorrectie BTW (auto, telefoon) verwerkt vóór 31-12
- Afschrijvingen volledig en conform vaste-activaregister
- IB-reservering geboekt (eenmanszaak)
- BTW-jaaroverzicht afgestemd op alle 4 kwartaalaangiftes
- Eigen vermogen mutaties (privéonttrekkingen) verwerkt als EV-mutatie, niet als kosten

## Business Profile — Big Fish Entertainment

### Entity & Structure
- **Owner:** Ronald van Holst
- **Form:** Eenmanszaak (sole proprietor — IB box 1, not VPB)
- **Activities:** Muziekoptredens, muziekproductie, muziekonderwijs
- **Tax years in scope:** 2023, 2024 en verder
- **Fiscal partner:** M.A. Stuger (gezamenlijke aangifte doorgaans voordeliger)
- **Urencriterium:** Streefnorm ≥ 1.225 uur/jaar voor zelfstandigenaftrek
- **Boekhouding:** Geen boekhoudprogramma — maandelijkse spreadsheets
- **Bankstructuur:** Alle omzet komt binnen op privérekening. Zakelijke rekening 
  (ING) wordt uitsluitend gebruikt voor leasebetalingen auto.

### BTW-categorieën
| Tarief | Toepassing |
|--------|-----------|
| 9% laag | Optredens als uitvoerend kunstenaar |
| 21% hoog | Commerciële opdrachten, lessen aan leerlingen > 21 jaar, merchandise |
| 0% | Diensten/leveringen buitenland, verleggingsregelingen |

### Privé vs. Zakelijk — Boekhoudconventie
Omdat alle inkomsten op de privérekening binnenkomen:
- Volledige omzet = privéonttrekking in geld
- Zakelijke kosten betaald via privérekening = overige privéstortingen (in natura)
- Privéstortingen op zakelijke rekening (bijv. voor lease) = privéstorting in geld
- Privéonttrekking netto = Omzet − zakelijke kosten via privé − privéstortingen 
  op zakelijke rekening + bijtelling auto

### Auto — Volkswagen ID.3
- Zakelijke leaseauto (Mobility Service Nederland)
- Kenteken: J-615-RT | Cataloguswaarde: **€42.881**
- Eerste toelating: 2021 → bijtellingspercentage: **8% over volledige cataloguswaarde**
- Jaarlijkse bijtelling: **€3.430,48** — telt als privéonttrekking in natura
- Boekt als correctie op de resultatenrekening (verhoogt fiscale winst)
- Alle autokosten (lease, laden, parkeren, onderhoud) zakelijk boeken

### Afschrijvingen — Algemeen
- Methode: **Lineair, 5 jaar**, drempel >€450 excl. BTW
- Bedrijfsmiddelen onder €450: direct ten laste van resultaat (kleine aanschaffingen)
- Geen willekeurige afschrijving toegepast
- Geen investeringsaftrek (KIA) van toepassing tenzij totaal >€2.601

### Inventarislijst — Boekwaardes per eind 2023
| Bedrijfsmiddel | Aanschafjaar | Aanschafbedrag | Boekwaarde 31-12-2023 |
|---------------|-------------|----------------|----------------------|
| iPhone XR | 2019 | €699 | €0 (volledig afgeschreven) |
| Mac Mini | 2020 | €876 | €303 |
| Elektrische Gitaar | 2022 | €512 | €410 |
| MacBook Air | 2022 | €665 | €532 |
| MacBook Air | 2022 | €636 | €509 |
| iPhone 14 | 2022 | €729 | €583 |
| Mac Mini | 2023 | €602 | €602 |
| Dyson Stofzuiger | 2023 | €477 | €477 |
| **Totaal** | | **€5.196** | **€3.416** |

### Kostenrubrieken (conform jaarrekening 2022-structuur)
Splits altijd uit naar deze categorieën in resultatenrekening:
- Uitbesteed werk (vervangende docenten, freelancers)
- Afschrijvingen inventaris
- Auto- en transportkosten
- Huisvestingskosten (atelier/studiohuur)
- Abonnementen/contributies
- Administratiekosten
- Kantoorkosten
- Kleine aanschaffingen (<€450)
- Muzieksoftware/licenties
- Niet-aftrekbare BTW
- Overnachtingen
- Podiumkleding
- Bankkosten
- Telefoon/internet
- Scholingskosten
- Verblijfkosten
- Muziekbenodigdheden

### Balans — Vaste Conventies
- Materiële vaste activa: boekwaarde na cumulatieve afschrijving
- Liquide middelen: saldo zakelijke rekening (privérekening telt NIET mee)
- Overige vorderingen: €0 (geen openstaande vorderingen)
- Kortlopende schulden: creditcardschuld indien aanwezig per 31-12
- Eigen vermogen = Activa − Schulden
- Verloopoverzicht eigen vermogen: beginstand + winst − privéonttrekkingen 
  + privéstortingen = eindstand

### Fiscale Oudedagsreserve (FOR)
- Afgeschaft per 1-1-2023 voor nieuwe opbouw
- Bestaande stand eind 2022: **€2.143** — blijft op balans, geen nieuwe dotatie
- Geen toevoeging of vrijval in 2023 of later, tenzij bewust afgewikkeld

### IB-Berekening Volgorde (eenmanszaak)
1. Brutowinst = Omzet (excl. BTW) − Kosten − Afschrijvingen
2. Bijtelling auto optellen: +€3.430,48
3. Zelfstandigenaftrek aftrekken (2024: €3.750; mits urencriterium gehaald)
4. MKB-winstvrijstelling: **14%** van winst na stap 3
5. Belastbare winst = resultaat na stap 4
6. IB box 1: **36,97%** t/m €75.518 | **49,50%** daarboven

### Vaste Antwoorden Aangiftevragen (eenmanszaak zonder bijzonderheden)
De volgende vragen worden standaard met **Nee / €0** beantwoord:
- Willekeurig afgeschreven: Nee
- Waarderingsstelsel gewijzigd: Nee
- Vrijgestelde winstbestanddelen: Nee
- Onroerende zaken onttrokken/ingebracht: Nee
- Herinvesteringsreserve: Nee
- Desinvesteringsbijtelling: Nee
- Investeringsaftrek (KIA): Nee (tenzij totaal >€2.601)
- Kwijtscheldingswinst: Nee
- Boekwinst/boekverlies op activa: Nee (tenzij bedrijfsmiddel verkocht)
- Geactiveerde productie eigen bedrijf: €0
- Overige buitengewone lasten: €0

### Niet-Aftrekbare Posten
- Privébestedingen (hypotheek, levensonderhoud) zijn privéonttrekkingen, 
  geen bedrijfskosten
- Broodfonds telt NIET als AOV en is niet aftrekbaar
- Gemengde kosten (representatie) slechts beperkt aftrekbaar
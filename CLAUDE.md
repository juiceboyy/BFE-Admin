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

The only serverless function is `netlify/functions/scanReceipt.js` — it proxies receipt images to the Gemini Vision API. It requires `GEMINI_API_KEY` in environment (set in Netlify UI or a `.env` file for local dev).

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
│   └── tax-advisor.js      # AI-powered tax advice via Gemini
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
5. `tax-advisor.js` sends summary to Gemini for AI recommendations

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

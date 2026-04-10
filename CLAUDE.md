# CLAUDE.md

## What This Is

**BFE Admin** — accounting/tax dashboard for Big Fish Entertainment. Receipt scanning (Gemini OCR), BTW tracking, fiscal year-end reporting. Data in Google Sheets; files in Google Drive.

## Running the App

No build step. Open `index.html` directly or:

```bash
npx serve .
```

Netlify Functions require CLI for local testing:

```bash
npm install -g netlify-cli
netlify dev   # localhost:8888
```

Required env vars:
- `GEMINI_API_KEY` — `netlify/functions/scanReceipt.js`
- `ANTHROPIC_API_KEY` — `netlify/functions/fiscalAdvisor.js`

## Architecture

Vanilla JS ES6 modules, no build toolchain. CDN: Tailwind CSS, pdf.js, lucide icons, Google Identity Services.

```
js/api/       # Google auth, Drive/Sheets I/O, Gemini, tax-collector, tax-advisor
js/ui/        # scanner, dashboard, btw form, fiscal-intake, fiscal-report, navigation
js/store/     # fiscal-state.js — central state, observer pattern
js/utils/     # date, network (fetch+retry), tax-calculator
netlify/functions/   # scanReceipt.js, fiscalAdvisor.js
```

Key constants hardcoded in source:

| Constant | File |
|---|---|
| `SPREADSHEET_ID` | `storage-queries.js`, `tax-collector.js` |
| `DRIVE_FOLDER_ID` | `storage.js` |
| `CLIENT_ID` | `auth.js` |

## Gotchas

### Google Sheets column order
`tax-collector.js` reads columns **by index**. Adding or reordering sheet columns silently breaks data collection. Always use `findIndex` for column mapping — never positional assumptions.

Row loop stop-condition: `if (String(row[0]).toLowerCase().includes('totaal')) break;`

### Auth token lifetime
OAuth token lives in a module-level variable in `auth.js`. No refresh logic — expires after ~1h. All API calls receive it as `Authorization: Bearer ${accessToken}`.

### Drive upload is two-step
`storage.js` first creates file metadata, then uploads content in a separate request. Breaking it into a single call will fail.

## Dutch Tax Domain

### Business facts used in code
- Entity: **eenmanszaak** (IB box 1, not VPB)
- All amounts stored/displayed **excl. BTW**
- BTW rates for this entity:
  - **9%** — optredens als uitvoerend kunstenaar
  - **21%** — lessen >21jr, commerciële opdrachten, merchandise
  - **0%** — buitenland/verleggingsregelingen
- Annual bijtelling auto (VW ID.3, cat. €42.881, 8%): **€3.430,48** — added to fiscal profit
- Afschrijving: linear, **5 jaar**, threshold >€450 excl. BTW; below €450 = direct expense
- FOR (Fiscale Oudedagsreserve) end-2022: **€2.143** — stays on balance sheet, no new dotation since 2023

### IB calculation order (implemented in `tax-calculator.js`)
1. Brutowinst = Omzet − Kosten − Afschrijvingen
2. + Bijtelling auto €3.430,48
3. − Zelfstandigenaftrek **€3.750** (2024; only if urencriterium ≥ 1.225h met)
4. − MKB-winstvrijstelling **14%** of result after step 3
5. IB box 1: **36,97%** ≤ €75.518 | **49,50%** above

When modifying tax calculations, verify bracket percentages and deduction amounts against actual Dutch tax rules for that year — they change annually.

### Privé/zakelijk bookkeeping convention
All revenue lands on the private bank account:
- Revenue → privéonttrekking in geld
- Business costs paid from private account → privéstorting in natura
- Private deposits to business account (e.g. lease) → privéstorting in geld
- Business account (ING) used exclusively for lease payments; private account is NOT included in liquide middelen on the balance sheet

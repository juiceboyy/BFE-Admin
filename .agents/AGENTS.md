# Project-specific Guidelines

## 1. Safe Initialization in Vanilla JS (ES Modules)
Because ES6 modules execute deferred, `DOMContentLoaded` or `window.onload` events might have already fired by the time the script executes. 
* **DOMContentLoaded Guard**: Never wrap initialization code solely in a `DOMContentLoaded` event listener. Always check the document's state:
  ```javascript
  function init() {
      // Initialization code here...
  }

  if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
  } else {
      init();
  }
  ```
* **Asynchronous CDNs**: Do not rely on `window.onload` to wait for asynchronous external scripts (like Google GIS Client or Lucide). Check for the global namespace immediately, and fall back to a polling interval if it's not yet loaded:
  ```javascript
  if (typeof google !== 'undefined') {
      setup();
  } else {
      const interval = setInterval(() => {
          if (typeof google !== 'undefined') {
              clearInterval(interval);
              setup();
          }
      }, 100);
      setTimeout(() => clearInterval(interval), 10000); // 10s timeout guard
  }
  ```

## 2. Refactoring & Initialization Integrity
When splitting monolithic modules into smaller focused files (like separating Studio Rent from MZO Invoicing):
* **Bootstrap Check**: Always ensure the new module's initialization function (e.g. `initStudioInvoices()`) is called from the main module's bootstrap routine.
* **Relative Import Paths**: Verify that relative import paths (e.g. `../api/` vs `./`) are adjusted correctly relative to the new file's directory location.

## 3. Import Integrity during Refactoring
* **Verify Unused Imports Strategically**: When optimizing imports in a refactored file (e.g., removing functions that have been outsourced to another module), never assume that because a function or variable is no longer called in the modified code, it is safe to remove its import.
* **Scope Scan**: Always do a full text search in the file for the imported symbol to ensure it is not used in other unmodified functions (e.g. settings, API helpers, or default constants) before deleting the import.

## 4. Mandatory Syntax Verification Before Commit
Because this codebase runs pure vanilla ES modules without a bundler or compiler, a syntax error (like a misplaced or missing bracket) stops the entire application from bootstrapping at runtime.
* **Always run syntax lint prior to commit**:
  ```bash
  find js netlify -name "*.js" -exec node -c {} +
  ```
  Never commit or push code without this command passing cleanly with return code 0.

# CLAUDE.md

## What This Is

**BFE Admin** - accounting and tax dashboard for Big Fish Entertainment (Ronald van Holst). Persists data in Google Sheets and stores incoming receipts and generated invoices in Google Drive. All serverless AI endpoints are unified under Google's **Gemini 3.6 Flash** model (`gemini-3.6-flash:generateContent`) with greedy decoding (`temperature: 0.0`) for fast sub-3s processing.

The application is structured into four main workflows:
1. **🧾 Bonnen & Facturen (Receipt & Invoice Scanner)**: Inkoop and Verkoop OCR extraction using Gemini, foreign currency conversion via European Central Bank (ECB) daily reference rates, automated duplicate verification against existing Sheet records, historical cloud memory vendor matching, and sequential batch insertion into Google Sheets with Drive file renaming.
2. **⚖️ Fiscale Jaarafsluiting (Fiscal Intake)**: Year-end closing workflow covering ING bank statement balance extraction, private deposits CSV matching against Ronald's private IBAN, durable assets classification (>€450 threshold, 5-year linear depreciation) and ledger reconciliation, quarterly BTW checks, and interactive AI tax advisory (`fiscalAdvisor.js`).
3. **📄 Facturen Maken (Invoice Generation)**: Generates compliant sales invoice PDFs across three streams: MZO music tuition invoicing (synced via iCal feeds through `fetchIcal.js`), monthly studio rent invoicing, and manual custom invoicing backed by the `Klanten` sheet with customer management. Appends legal riders such as "Verklaring geen artiestenregeling" for Stichting Amare.
4. **Jaarverslag (Annual Report & Aangifte IB Reconciliatie)**: Dynamic Belastingdienst Aangifte Inkomstenbelasting PDF parser (`scanAangifte.js`, `extract-aangifte.js`), automated reconciliation between declared tax figures and actual Google Sheets ledger totals (Balance Sheet balance, P&L breakdown, and fiscal capital equity comparison / vermogensvergelijking), and an interactive AI audit modal (`reconcile-modal.js`, `ai-reconciler.js`) to audit and rename Drive files against Sheet rows.

---

## Running the App

No build step or bundler. Open `index.html` directly in a browser (requires Google OAuth redirect setup on localhost/domain) or serve locally:

```bash
# Serve static files locally (typically http://localhost:5000 or similar)
npx serve .
```

Netlify Functions handle AI APIs and require the Netlify CLI for local serverless function testing:

```bash
# Install Netlify CLI globally
npm install -g netlify-cli

# Start dev server (defaults to http://localhost:8888)
netlify dev
```

### Syntax Verification (Linting)
Because this codebase runs pure vanilla ES modules without a bundler or compiler, a syntax error stops the entire application from bootstrapping at runtime. Always run syntax validation across all JS files prior to committing:
```bash
find js netlify -name "*.js" -exec node -c {} +
```
Never commit or push code without this command passing cleanly with return code 0.

### Required Environment Variables (.env)
- `GEMINI_API_KEY` - Loaded by all backend AI functions (`netlify/functions/scanReceipt.js`, `scanBankStatement.js`, `fiscalAdvisor.js`, `classifyInventaris.js`, and `scanAangifte.js`).

---

## Architecture

Vanilla JS ES6 modules without a build toolchain. Tailwind CSS, PDF.js, Lucide Icons, and Google Identity Services (GIS) are loaded via CDNs in `index.html`.

```
css/
  └── style.css                     # Custom visual adjustments (glassmorphism, custom scrollbars)
js/
  ├── main.js                       # Core bootstrap entry point; initializes modules with isolated try/catch guards
  ├── api/
  │   ├── auth.js                   # Handles Google GIS Client authentication and OAuth token lifetime
  │   ├── calendar.js               # Fetches and parses iCal feeds via fetchIcal for lesson invoicing
  │   ├── extract-aangifte.js       # Client-side text extraction for Belastingdienst Aangifte Inkomstenbelasting PDFs
  │   ├── extract.js                # Client-side PDF text extraction using PDF.js & regex parsing for fast matches
  │   ├── gemini.js                 # Client-side proxy to scanReceipt Netlify function
  │   ├── inventaris-kandidaten.js   # Extracts purchase transactions >€450 and proxies to Gemini for classification
  │   ├── storage-drive.js          # Google Drive operations (scan unprocessed, download blob, rename, 2-step upload)
  │   ├── storage-queries-fiscal.js # Google Sheet queries for monthly/yearly totals, trends, and fiscal metrics
  │   ├── storage-queries-inventaris.js # Google Sheet queries and persistence for durable inventory on Trend sheet
  │   ├── storage-queries-invoices.js # Google Sheet queries for invoice target row, seq numbering, and cloud memory
  │   ├── storage.js                # Low-level Google Sheet I/O and central re-export of storage-drive.js
  │   ├── tax-advisor.js            # Client-side proxy for interactive Gemini fiscal advice
  │   ├── tax-collector-helpers.js  # Normalization and extraction helpers for spreadsheet rows
  │   └── tax-collector.js          # Fetches and aggregates Sheet rows, utilizing the SUM-formula Totalen row
  ├── store/
  │   └── fiscal-state.js           # Central state store (observer pattern) for the fiscal year-end intake process
  ├── ui/
  │   ├── templates/
  │   │   ├── annual-report-balans.js   # HTML template for the annual balance sheet view
  │   │   ├── annual-report-sections.js # HTML templates for P&L, cost breakdown, and fiscal equity comparison
  │   │   ├── annual-report-template.js # Shell HTML template for the Annual Report view
  │   │   └── fiscal-intake-template.js # HTML structure for the fiscal year-end intake tabs
  │   ├── annual-report.js          # Controller for Jaarverslag; reconciles Sheet bookkeeping with Aangifte IB
  │   ├── btw.js                    # Form and ledger table for manual quarterly BTW filing simulation
  │   ├── dashboard.js              # Real-time state metrics for monthly sales, expenses, and pending scanning queue
  │   ├── fiscal-bank.js            # Controller for bank statement balance OCR and private deposit reconciliation
  │   ├── fiscal-intake.js          # Main coordinator for fiscal intake flow and year-specific spreadsheet mapping
  │   ├── fiscal-inventaris-matcher.js # Matches active ledger expenses >€450 against durable inventory records
  │   ├── fiscal-inventaris.js      # Controller for durable asset management and manual additions
  │   ├── fiscal-report.js          # Renders P&L, balance sheets, dynamic Tax Spiekbriefje, and Trend exporter
  │   ├── fiscal-sync.js            # Sync controller aggregating all monthly tabs for the selected fiscal year
  │   ├── invoices-lessons.js       # Music tuition invoice generator with iCal integration and calendar sync
  │   ├── invoices-manual.js        # Controller for custom manual invoice creation and customer management (Klanten sheet)
  │   ├── invoices-studio.js        # Controls rent invoicing, default rent templates, and rent table rendering
  │   ├── invoices.js               # Orchestrator initializing lessons, studio, and manual invoicing modules
  │   ├── navigation.js             # Client-side tab switcher (Scanner, Fiscal Intake, Invoices, Annual Report)
  │   ├── reconcile-modal.js        # Interactive modal auditing Drive files against Sheet records with AI assistance
  │   ├── scanner-helpers.js        # UI data formatting, sheet row construction mapping, and save-execution pipelines
  │   ├── scanner-period.js         # Month popover and year selector UI with 12-month navigation grid
  │   ├── scanner-row.js            # Template generator for scanner batch queue rows (including date validations)
  │   ├── scanner-save.js           # Batch saving pipeline writing approved items to Sheet with duplicate checks
  │   └── scanner.js                # Controls scanner queues, Drive scanning, file uploads, and sequential Sheet saving
  └── utils/
      ├── ai-reconciler.js          # AI audit matching Drive files with Sheet rows and identifying renames/gaps
      ├── annual-report-data.js     # Data aggregation for annual report comparison
      ├── annual-report-resolver.js # Resolver for capital equity comparison and discrepancies
      ├── csv-parser.js             # Bank transaction CSV parser matching private IBAN deposits
      ├── currency.js               # Foreign currency detection and conversion via ECB daily rates (Frankfurter API)
      ├── date.js                   # Date parsing, active bookkeeping period validations, global active month state
      ├── duplicate-checker.js      # Checks Google Sheets for duplicate invoice numbers and amounts before booking
      ├── invoice-layouts.js        # Invoice styling, typography, and page structure definitions for generated PDFs
      ├── invoice-sections.js       # HTML builder for invoice header, line items, VAT summary table, and legal riders
      ├── network.js                # Fetch wrapper with exponential backoff & retries for Google API requests
      ├── pdf-generator.js          # Generates A4 invoice HTML DOM elements and compiles/uploads sandboxed PDFs
      ├── tax-calculator.js         # Tax math, linear asset depreciation, and Dutch tax rate sheets (2023-2026)
      └── text-abbreviations.js     # Strips dates from descriptions, enforces podiumkleding, abbreviates words
netlify/functions/
  ├── classifyInventaris.js         # Serverless function to classify durable assets using Gemini 3.6 Flash
  ├── fetchIcal.js                  # Serverless CORS proxy for retrieving external calendar iCal feeds
  ├── fiscalAdvisor.js              # Serverless function injecting tax context to Gemini 3.6 Flash for Dutch tax advice
  ├── scanAangifte.js               # Serverless function extracting official Aangifte IB data using Gemini 3.6 Flash
  ├── scanBankStatement.js          # Serverless function extracting begin/end bank balance from PDF using Gemini 3.6 Flash
  └── scanReceipt.js                # Serverless function extracting metadata from receipts using Gemini 3.6 Flash
```

---

### Key Constants Hardcoded in Source

| Constant | Value / Location | Description |
|---|---|---|
| `SPREADSHEET_ID` | `js/api/storage.js` | Google Sheet containing active monthly transaction records (`119dQIOSLFpKDqWUQUMWTU9miIKP3MOR1VHFB5yzmBrg`) |
| `DRIVE_FOLDER_ID` | `js/api/storage-drive.js` | Target Google Drive folder where incoming receipts/scans are stored (`1NBCQ89t1soAvZ315_UA-p-lF340qkraH`) |
| `DRIVE_FACTUREN_FOLDER_ID` | `js/api/storage-drive.js` | Target Google Drive folder where generated sales invoices are stored (`145y8NI0LhwytJ-i22xwxRkKxTMGyy5pR`) |
| `TREND_SPREADSHEET_ID` | `js/api/storage-queries-inventaris.js` | Trend & Inventory archive Google Sheet (`1nWQOkMInrHgo5c1l-FdjM4EoCbPlv86YwEft1OEROfI`) |
| `CLIENT_ID` | `js/api/auth.js` | Google Identity Services OAuth Client ID for authenticating BFE Admin |
| `SPREADSHEET_IDS` | `js/ui/fiscal-intake.js` | Year-specific spreadsheet mappings: 2023 (`1wMnw3BTyNvvl9CCCKt78PGhl6PBQyLFnNe2XKCO16Wg`), 2024 (`1OFzhw4r6eDkKcOxXuzJ6MoKO1O5CiKmmZR83e33QEsM`), 2025 (`1WIY9la9KpdRuRItTi2qfjRmmmkNeoxQf7VMihRjw0TI`), 2026 (`119dQIOSLFpKDqWUQUMWTU9miIKP3MOR1VHFB5yzmBrg`) |
| `DEFAULT_PRIVATE_IBAN` | `js/ui/fiscal-intake.js` | Default private IBAN (`NL47INGB0005023386`) stored in `localStorage` under `bfe_private_iban` for private deposit matching |

---

## Gotchas & API Integration Rules

### 1. Google Sheets Column Order Mapping
Never assume positional row indexes (e.g. `row[4]`) when reading or writing transaction sheets. Always fetch headers first (`getSheetHeaders(sheetName)`) and map columns dynamically via keywords or names (e.g., searching for "vergoeding", "excl", "btw", "voorbelasting", "leverancier") using `headers.findIndex()`. Adding or reordering columns will otherwise silently corrupt inputs.

### 2. Sheet Row Termination Condition
When iterating through Google Sheet transaction rows, always look for the Dutch word **"totaal"** or **"totalen"** in the first cell (Column A). Stop loop execution immediately upon match to avoid aggregating sheet summation formulas into the item data:
```javascript
const colA = String(row[0] || '').toLowerCase().trim();
if (colA.includes('totaal') || colA.includes('totalen')) break;
```

### 3. Google Drive Multipart File Uploads
Drive uploads are performed in **two separate steps** in `storage-drive.js` to ensure stability:
1. `POST` request to create the file metadata envelope inside the parent folder.
2. `PATCH` media upload to populate the raw file content bytes (`?uploadType=media`).
Rebuilding this into a unified single-request multipart upload will fail.

### 4. Auth Token Lifetime & GIS Auth
The OAuth 2.0 access token lives in a module-level variable in `auth.js`. There is **no automatic token-refresh logic** implemented in this SPA. Tokens expire after 1 hour, throwing `401 TOKEN_EXPIRED` exceptions. The application handles this by alerting the user or forcing a re-authorization callback.

### 5. Drive Processed File Naming Convention
Files saved or renamed by this app in Google Drive start with `YYYY-###`, `YYYY.###`, or `BFE26FR...` (sales invoices). The scanner regex `PROCESSED_NAME_RE = /^(\d{4}[.-]\d{3}|BFE\d{2}FR)/` prevents already processed items from re-appearing in the unhandled scan queue.

### 6. Podiumkleding Rule
Any expense related to clothing, suits, pants, shirts, jackets, shoes, sneakers, sunglasses, bags, backpacks, or luggage is used for stage appearances and presentations. It must ALWAYS be booked with the exact description `'podiumkleding'`. It must never be activated as durable inventory (*inventaris*) and is charged directly against profit and loss.

### 7. Description Formatting & Date Stripping
- Descriptions must never include invoice dates or execution dates (e.g., "11-10-2026", "op 11 okt"). `stripDatesFromDescription()` cleans them automatically.
- Descriptions must never be truncated with ellipsis (`...`).
- Standard business abbreviations are applied to keep sheet entries compact: `werkzaamheden`/`werkzk` -> `werkzh`, `Come Again` -> `CA`, `management` -> `mgmt`, `administratie` -> `adm`, `verhuur` -> `vh`, `diversen` -> `div`.

### 8. Foreign Currency Conversion (ECB Reference Rates)
Receipts in foreign currencies (USD, GBP, DKK, SEK, NOK, CHF, CAD, AUD, JPY, PLN, CZK) are converted to EUR using official European Central Bank (ECB) daily reference rates via the Frankfurter API (`api.frankfurter.dev` with fallback to `api.frankfurter.app`) matching the invoice date.

### 9. Duplicate Booking Prevention
Before writing items to Google Sheets, `duplicate-checker.js` verifies existing sheet entries for matching invoice numbers or matching vendor/amount/date combinations.

---

## Dutch Tax Domain (Eenmanszaak)

### Core Bookkeeping Facts
- **Entity Form**: **eenmanszaak** (Self-employed sole proprietorship subject to Income Tax / *Inkomstenbelasting* Box 1, not *Vennootschapsbelasting* / VPB).
- **Amount Base**: All ledger records and calculations are stored and displayed **excl. BTW (VAT)**.
- **BTW Rates**:
  - **9% (Low)**: Performance fees as a performing artist (*optredens als uitvoerend kunstenaar*).
  - **21% (High)**: Music tuition for students >21 years, commercial production services, merchandise, general expenses.
  - **0% (Zero / Exempt / Reversed)**: Music tuition for students <21 years (exempt under Art. 11 Wet OB), foreign transactions, and reverse-charge VAT (*verleggingsregelingen*).
- **Auto van de Zaak (VW ID.3)**:
  - **Operational Lease**: Mobility Service Nederland. Invoices paid from ING business account funded by private transfers.
  - **Voertuig 1 (tot 19-09-2025)**: Catalog Value €42.881, first admission 2021 (kenteken J-615-RT) -> addition rate: 8% (€3.430,48/yr). Handed in on 19 September 2025.
  - **Voertuig 2 (vanaf 19-09-2025)**: Catalog Value €36.850, first admission (Deel 1) 18-09-2025, start lease 19-09-2025. Addition rate: 17% up to €30.000 (€5.100) + 22% above €30.000 (€1.507) = €6.607,00/yr.
  - **Fiscale bijtelling per boekjaar**:
    - **<= 2024**: €3.430,48
    - **2025 (Wisseljaar)**: 261 days old (€2.453,03) + 104 days new (€1.882,54) = **€4.335,57**
    - **>= 2026**: **€6.607,00**
  - Added directly to fiscal profit and treated as a private withdrawal in-kind on the balance sheet.
- **Durable Assets Depreciation (*Afschrijving*)**:
  - Threshold: Invoices **> €450 excl. BTW** representing assets with a lifetime > 1 year must be activated as durable inventory (*inventaris*) rather than expensed directly.
  - Method: Linear depreciation over **5 years** to residual value (0 by default).
- **Podiumkleding**: Onkosten met betrekking tot kleding, zonnebril of tas worden gebruikt voor optredens en presentaties en moeten ALTIJD met de omschrijving 'podiumkleding' worden geboekt (niet activeren als inventaris, direct ten laste van het resultaat).
- **Fiscale Oudedagsreserve (FOR)**:
  - Final standing at end of 2022: **€2.143**. Stays on the balance sheet liabilities (*passiva*). New contributions are outlawed from 2023 onward.
- **Amare Artiestenregeling Exemption**: Invoices to Stichting Amare include a formal "Verklaring geen artiestenregeling" note stating that payment is made to the enterprise rather than subject to wage tax deduction.

### Yearly Deduction Rates (from `tax-calculator.js`)

| Tax Year | Zelfstandigenaftrek (€) | MKB-winstvrijstelling | KIA Threshold (€) | Box 1 Brackets |
|---|---|---|---|---|
| **2023** | € 5.030 | 14.00% | € 2.801 | 36.93% up to €73.031 \| 49.50% above |
| **2024** | € 3.750 | 13.31% | € 2.801 | 36.97% up to €75.518 \| 49.50% above |
| **2025** | € 2.470 | 12.70% | € 2.801 | 35.82% up to €38.441 \| 37.48% up to €76.817 \| 49.50% above |
| **2026** | € 1.200 | 12.70% | € 2.801 | 35.82% up to €38.441 \| 37.48% up to €76.817 \| 49.50% above |

*Note: Zelfstandigenaftrek is only deductible if the entrepreneur meets the annual hour criterion (urencriterium >= 1225 hours).*

### Bookkeeping & Bank Statement Ingestion Conventions
All revenues of Big Fish Entertainment are received directly onto Ronald's **private bank account**:
- **Revenue Influx**: Booked as a **private withdrawal in cash** (*privéonttrekking in geld*).
- **Business Costs Paid Privately**: Booked as a **private deposit in-kind** (*privéstorting in natura*).
- **Business Account (ING)**: Used exclusively for the car lease payments. Funded via private transfers.
- **Private Cash Transfers to ING**: Booked as a **private deposit in cash** (*privéstorting in geld*).
- **Private Deposit CSV Ingestion Tool**: Matches counterparty IBANs (Contra account) on uploaded CSV bank statements against Ronald's private IBAN (saved in `localStorage` under `bfe_private_iban`) to automatically calculate private cash deposits.
- **Liquide Middelen (Balance Sheet)**: Determined *only* by the ending balance of the business bank account. The private bank account balance is never included in the company's liquid assets on the balance sheet.

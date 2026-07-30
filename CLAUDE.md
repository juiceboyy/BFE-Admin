# CLAUDE.md

## What This Is

**BFE Admin** — accounting and tax dashboard for Big Fish Entertainment (Ronald van Holst). Features receipt and bank statement scanning (Gemini OCR), automatic durable asset classification, quarterly BTW (VAT) tracking, and fiscal year-end reporting. All AI logic is unified under Google's **Gemini 3.6 Flash** model. Data is persisted in Google Sheets; uploaded receipts and documents are stored in Google Drive.

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

### Required Environment Variables (.env)
- `GEMINI_API_KEY` — Loaded by all backend functions (`netlify/functions/scanReceipt.js`, `scanBankStatement.js`, `fiscalAdvisor.js`, and `classifyInventaris.js`)

---

## Architecture

Vanilla JS ES6 modules without a build toolchain. Tailwind CSS, PDF.js, Lucide Icons, and Google Identity Services (GIS) are loaded via CDNs in `index.html`.

```
css/
  └── style.css              # Custom visual adjustments (dark glassmorphism elements, custom scrollbars)
js/
  ├── main.js                # Core entry point; bootstraps UI components and starts Google auth listener
  ├── api/
  │   ├── auth.js            # Handles Google GIS Client authentication and OAuth token lifetime
  │   ├── extract.js         # Client-side PDF text extraction using PDF.js & regex parsing for fast matches
  │   ├── gemini.js          # Client-side proxy to scanReceipt Netlify function
  │   ├── inventaris-kandidaten.js # Extracts purchase transactions >€450 and proxies to Gemini for classification
  │   ├── storage-queries-fiscal.js # Google Sheet queries for monthly/yearly totals, trends, and inventory
  │   ├── storage-queries-invoices.js # Google Sheet queries for invoice target row, seq numbering, and cloud memory
  │   ├── storage.js         # Low-level Google Drive (scan/upload/rename) and Sheet (insert/dynamic headers) I/O
  │   ├── tax-advisor.js     # Client-side proxy for interactive Gemini fiscal advice
  │   └── tax-collector.js   # Fetches and aggregates Sheet rows, utilizing the SUM-formula Totalen row
  ├── store/
  │   └── fiscal-state.js    # Central state store (observer pattern) for the fiscal year-end intake process
  ├── ui/
  │   ├── templates/
  │   │   └── fiscal-intake-template.js # HTML structure for the fiscal year-end intake tabs
  │   ├── btw.js             # Form & ledger table for manual quarterly BTW filing simulation
  │   ├── dashboard.js       # Real-time state metrics for monthly sales, expenses, and pending scanning queue
  │   ├── fiscal-intake.js   # Controller for intake flow: synchronisation, bank statements OCR, private deposits CSV matching
  │   ├── fiscal-inventaris.js # Controller for durable asset management, manual additions, and matcher candidate actions
  │   ├── fiscal-report.js   # Renders P&L, balance sheets, dynamic Tax Spiekbriefje, and Trend exporter
  │   ├── invoices-studio.js # Controls rent invoicing, default rent templates, and rent table rendering
  │   ├── invoices.js        # Controls MZO lesson invoicing, calendar sync, and invoicing queues
  │   ├── navigation.js      # Simple client-side tab switcher (Scanner vs Fiscal Intake)
  │   ├── scanner-helpers.js # UI data formatting, sheet row construction mapping, and save-execution pipelines
  │   ├── scanner-row.js     # Template generator for scanner batch queue rows (including date validations)
  │   └── scanner.js         # Controls scanner queues, Drive scanning, file uploads, and sequential Sheet saving
  └── utils/
      ├── csv-parser.js      # Bank transaction CSV parser matching private IBAN deposits
      ├── date.js            # Date parsing, active bookkeeping period validations, global active month state
      ├── network.js         # Fetch wrapper with exponential backoff & retries for Google API requests
      ├── pdf-generator.js   # Generates A4 invoice HTML DOM elements and compiles/uploads sandboxed PDFs
      └── tax-calculator.js  # Tax math, linear asset depreciation, and Dutch tax rate sheets (2023–2026)
netlify/functions/
  ├── classifyInventaris.js  # Serverless function to classify durable assets using Gemini 3.6 Flash
  ├── fiscalAdvisor.js       # Serverless function injecting tax context to Gemini 3.6 Flash for Dutch tax advice
  ├── scanBankStatement.js   # Serverless function extracting begin/end bank balance from PDF using Gemini 3.6 Flash
  └── scanReceipt.js         # Serverless function extracting metadata from receipts using Gemini 3.6 Flash
```

### Key Constants Hardcoded in Source

| Constant | Value / Location | Description |
|---|---|---|
| `SPREADSHEET_ID` | `js/api/storage.js` | Google Sheet containing monthly transaction records (`119dQIOSLFpKDqWUQUMWTU9miIKP3MOR1VHFB5yzmBrg`) |
| `DRIVE_FOLDER_ID` | `js/api/storage.js` | Target Google Drive folder where processed receipt PDFs/images are stored (`1NBCQ89t1soAvZ315_UA-p-lF340qkraH`) |
| `TREND_SPREADSHEET_ID` | `js/api/storage-queries-fiscal.js` | Trend & Inventory archive Google Sheet (`1nWQOkMInrHgo5c1l-FdjM4EoCbPlv86YwEft1OEROfI`) |
| `CLIENT_ID` | `js/api/auth.js` | Google Identity Services OAuth Client ID for authenticating BFE Admin |
| `SPREADSHEET_IDS` | `js/ui/fiscal-intake.js` | Year-specific spreadsheet template mappings (2023, 2024, 2025, 2026) |

---

## Gotchas & API Integration Rules

### 1. Google Sheets Column Order Mapping
Never assume positional row indexes (e.g. `row[4]`) when reading or writing transaction sheets. Always fetch headers first (`getSheetHeaders(sheetName)`) and map columns dynamically via keywords or names (e.g., searching for "vergoeding", "excl", "btw", "voorbelasting", "leverancier") using `headers.findIndex()`. Adding/reordering columns will otherwise silently corrupt inputs.

### 2. Sheet Row Termination Condition
When iterating through Google Sheet transaction rows, always look for the Dutch word **"totaal"** or **"totalen"** in the first cell (Column A). Stop loop execution immediately upon match to avoid aggregating sheet summation formulas into the item data.
```javascript
const colA = String(row[0] || '').toLowerCase().trim();
if (colA.includes('totaal') || colA.includes('totalen')) break;
```

### 3. Google Drive Multipart File Uploads
Drive uploads are performed in **two separate steps** in `storage.js` to ensure stability:
1. `POST` request to create the file metadata envelope inside the parent folder.
2. `PATCH` media upload to populate the raw file content bytes (`?uploadType=media`).
Rebuilding this into a unified single-request multipart upload will fail.

### 4. Auth Token Lifetime & GIS Auth
The OAuth 2.0 access token lives in a module-level variable in `auth.js`. There is **no automatic token-refresh logic** implemented in this SPA. Tokens expire after 1 hour, throwing `401 TOKEN_EXPIRED` exceptions. The application handles this by alerting the user or forcing a re-authorization callback.

---

## Dutch Tax Domain (Eenmanszaak)

### Core Bookkeeping Facts
- **Entity Form**: **eenmanszaak** (Self-employed sole proprietorship subject to Income Tax / *Inkomstenbelasting* Box 1, not *Vennootschapsbelasting* / VPB).
- **Amount Base**: All ledger records and calculations are stored and displayed **excl. BTW (VAT)**.
- **BTW Rates**:
  - **9% (Low)** — Performance fees as a performing artist (*optredens als uitvoerend kunstenaar*).
  - **21% (High)** — Music tuition for students >21 years, commercial production services, merchandise, general expenses.
  - **0% (Zero / Reversed)** — Foreign transactions and VAT reverse charges (*verleggingsregelingen*).
- **Auto van de Zaak (VW ID.3)**:
  - Catalog Value: **€42.881**
  - First admission: 2021 → Addition rate: **8%**
  - **Fixed annual addition (bijtelling): €3.430,48** added directly to fiscal profit (and treated as a private withdrawal in-kind on the balance sheet).
- **Durable Assets Depreciation (*Afschrijving*)**:
  - Threshold: Invoices **> €450 excl. BTW** representing assets with a lifetime > 1 year must be activated as durable inventory (*inventaris*) rather than expensed directly.
  - Method: Linear depreciation over **5 years** to residual value (0 by default).
- **Fiscale Oudedagsreserve (FOR)**:
  - Final standing at end of 2022: **€2.143**. Stays on the balance sheet liabilities (*passiva*). New contributions are outlawed from 2023 onward.

### Yearly Deduction Rates (from `tax-calculator.js`)

| Tax Year | Zelfstandigenaftrek (€) | MKB-winstvrijstelling | KIA Threshold (€) | Box 1 Brackets |
|---|---|---|---|---|
| **2023** | € 5.030 | 14.00% | € 2.801 | 36.93% up to €73.031 \| 49.50% above |
| **2024** | € 3.750 | 13.31% | € 2.801 | 36.97% up to €75.518 \| 49.50% above |
| **2025** | € 2.470 | 12.70% | € 2.801 | 35.82% up to €38.441 \| 37.48% up to €76.817 \| 49.50% above |
| **2026** | € 1.200 | 12.70% | € 2.801 | 35.82% up to €38.441 \| 37.48% up to €76.817 \| 49.50% above |

*Note: Zelfstandigenaftrek is only deductible if the entrepreneur meets the annual hour criterion (urencriterium ≥ 1225 hours).*

### Bookkeeping & Bank Statement Ingestion Conventions
All revenues of Big Fish Entertainment are received directly onto Ronald's **private bank account**:
- **Revenue Influx** → Booked as a **private withdrawal in cash** (*privéonttrekking in geld*).
- **Business Costs Paid Privately** → Booked as a **private deposit in-kind** (*privéstorting in natura*).
- **Business Account (ING)** → Used exclusively for the car lease payments. Funded via private transfers.
- **Private Cash Transfers to ING** → Booked as a **private deposit in cash** (*privéstorting in geld*).
- **Private Deposit CSV Ingestion Tool**: Matches counterparty IBANs (Contra account) on uploaded CSV bank statements against Ronald's private IBAN (saved in `localStorage` under `bfe_private_iban`) to automatically calculate private cash deposits.
- **Liquide Middelen (Balance Sheet)**: Determined *only* by the ending balance of the business bank account. The private bank account balance is never included in the company's liquid assets on the balance sheet.

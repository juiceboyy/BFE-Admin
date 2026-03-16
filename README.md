Hier is een beknopt verslag over de functionaliteit en architectuur van de "Big Fish Admin" applicatie, speciaal geschreven voor de Software Architect:

Verslag Functionaliteit & Architectuur: Big Fish Admin
Doel van de applicatie De Big Fish Admin app is een op maat gemaakte, web-gebaseerde administratie- en boekhoudtool voor "Big Fish Entertainment". De kernfocus ligt op het stroomlijnen van de factuurverwerking (zowel inkoop als verkoop) door middel van AI-gedreven data-extractie en naadloze integratie met het Google Workspace ecosysteem (Drive en Sheets).

Kernfunctionaliteiten
1. AI-Gedreven Bonnen & Facturen Scanner (OCR & Extractie) De applicatie stelt gebruikers in staat om facturen en bonnen (PDF's en afbeeldingen) individueel of in bulk (inclusief hele mappen) te uploaden.

Gemini 2.5 Flash Integratie: Via een serverless Netlify functie (scanReceipt.js) worden documenten naar de Google Gemini API gestuurd. Een geavanceerde prompt extraheert gestructureerde JSON-data (factuurnummer, datum, leverancier/klant, omschrijving, bedragen en btw).
Lokale Fallback/Aanvulling: Voor PDF's bevat de app ook een lokale parser (pdf.js in extract.js) die middels reguliere expressies specifieke totaalbedragen kan valideren of extraheren zonder de AI aan te roepen.
Context-Aware Extractie: De applicatie kan onderscheid maken tussen inkoop- en verkoopfacturen, en heeft specifieke uitzonderingsregels (zoals het herkennen en parsen van ING-bankafschriften voor automatische Tesla-afschrijvingen).
2. Naadloze Google Cloud Integratie (Database & Opslag) In plaats van een traditionele database of backend (zoals SQL of MongoDB), gebruikt de applicatie Google Workspace als de "single source of truth":

Google Drive: Gescande en goedgekeurde bestanden worden via de Google Drive API (storage.js) direct geüpload naar een specifieke map. Er is een twee-staps upload geïmplementeerd (metadata + media) om bestanden de juiste factuurnamen te geven.
Google Sheets als Database: Financiële boekingen (datum, omschrijving, bedragen) worden weggeschreven naar specifieke tabbladen (bijv. "Jan Inkoop") in een centraal Google Spreadsheet.
Auto-nummering: De app leest de Google Sheet dynamisch uit om het eerstvolgende logische factuurnummer (bijv. 2026.002) te berekenen op basis van de laatst ingevoerde rij in de actuele of voorgaande maand.
3. "Cloud Memory" (Zelflerend Systeem) De app laadt bij het opstarten een lijst van bekende leveranciers uit de Google Sheet (loadCloudMemory). Bij het scannen van een nieuwe factuur controleert het systeem of de leverancier bekend is. Zo ja, dan worden automatisch de meest logische omschrijving en het historische btw-tarief gesuggereerd. Als de Gemini AI een factuur analyseert, krijgt het deze historische data mee als context om de accuraatheid van de output te verbeteren.

4. Batch Processing Dashboard (UI/UX) Nadat bestanden zijn geüpload, verschijnen ze in een overzichtelijke tabel.

Gebruikers zien direct de status van het AI-scanproces (Wachtend, Scannen, Klaar, Fout).
De door AI ingevulde velden (datum, bedragen, leverancier) worden in de tabel gepresenteerd als invoervelden. De gebruiker kan deze data eenvoudig controleren en handmatig corrigeren voordat de rij definitief naar de cloud wordt opgeslagen.
Datums die buiten de geselecteerde verwerkingsperiode vallen, krijgen automatisch een visuele waarschuwing in de UI.
5. Handmatige Invoer Voor transacties zonder fysiek document of bijbehorende factuur biedt de interface bovenaan een handmatig invoerformulier voor inkomsten en uitgaven, die direct in de juiste kolommen van de Sheet worden geplaatst.

Architecturale Kenmerken
Frontend: Vanilla JavaScript met ES6 modules, gestyled met Tailwind CSS. Modern, lichtgewicht en afhankelijkheidsarm.
Backend/Proxy: Netlify Serverless Functions worden gebruikt om de Google Gemini API-key af te schermen, zodat deze niet blootligt in de client-side code.
Authenticatie: Google Identity Services (GSI) verzorgt de authenticatie, zodat de app namens de ingelogde gebruiker met de Google Drive en Sheets API's mag praten via OAuth access_tokens.

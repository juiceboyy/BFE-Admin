/**
 * Returns the HTML template literal for the fiscal intake UI.
 * @param {Object} state - The current fiscalState state.
 * @param {Object} classes - Tailwind CSS layout class helpers.
 * @returns {string} HTML string
 */
export function getFiscalIntakeHTML(state, classes) {
    const { inputClass, labelClass, sectionClass, headerClass } = classes;

    return `
        <div id="intake-form-wrapper" class="max-w-4xl mx-auto pb-12">
            <div class="mb-8">
                <h2 class="text-2xl font-bold text-gray-900">Fiscale Jaarafsluiting & Intake</h2>
                <p class="text-gray-500 text-sm mt-1">Vul de ontbrekende gegevens in voor de inkomstenbelasting-aangifte.</p>
            </div>

            <!-- 1. Data Synchronisatie -->
            <section class="${sectionClass}">
                <h3 class="${headerClass}">
                    <i data-lucide="refresh-cw" class="w-5 h-5 text-blue-500"></i> 1. Data Synchronisatie
                </h3>
                <div class="flex flex-col sm:flex-row items-end gap-4">
                    <div class="w-full sm:w-48">
                        <label class="${labelClass}">Boekjaar</label>
                        <input type="number" id="sync-year" data-bind="year" class="${inputClass}" value="${state.year}">
                    </div>
                    <button id="btn-sync-sheets" class="w-full sm:w-auto bg-black text-white px-6 py-2.5 rounded-xl text-sm font-medium shadow-sm hover:bg-gray-800 transition-colors flex items-center justify-center gap-2">
                        <i data-lucide="cloud-download" class="w-4 h-4"></i> Haal data op uit Sheets
                    </button>
                    <button id="btn-reset-state" class="w-full sm:w-auto bg-white border border-red-200 text-red-500 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-red-50 transition-colors flex items-center justify-center gap-2" title="Wis alle opgeslagen data voor dit boekjaar">
                        <i data-lucide="trash-2" class="w-4 h-4"></i> Formulier wissen
                    </button>
                </div>
                <div id="sync-summary" class="hidden mt-6 p-4 bg-emerald-50 border border-emerald-100 rounded-xl text-sm text-emerald-800">
                    <!-- Wordt dynamisch gevuld -->
                </div>
            </section>

            <!-- 2. Bank -->
            <section class="${sectionClass}">
                <h3 class="${headerClass}">
                    <i data-lucide="landmark" class="w-5 h-5 text-blue-500"></i> 2. Bank (Zakelijke Rekening)
                </h3>

                <!-- Upload zone -->
                <label id="bank-upload-label" class="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors mb-5">
                    <div id="bank-upload-idle" class="flex flex-col items-center gap-1 text-gray-400">
                        <i data-lucide="upload-cloud" class="w-6 h-6"></i>
                        <span class="text-sm font-medium">Upload jaaropgave zakelijke rekening</span>
                        <span class="text-xs">PDF of afbeelding — saldi worden automatisch ingevuld</span>
                    </div>
                    <div id="bank-upload-loading" class="hidden flex-col items-center gap-2 text-blue-500">
                        <i data-lucide="loader-2" class="w-6 h-6 animate-spin"></i>
                        <span class="text-sm font-medium">Bankafschrift analyseren...</span>
                    </div>
                    <input id="bank-statement-upload" type="file" accept=".pdf,image/*" class="hidden">
                </label>

                <!-- Saldi velden (altijd zichtbaar, ook handmatig invulbaar) -->
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                        <label class="${labelClass}">Beginsaldo (1 jan)</label>
                        <div class="relative">
                            <span class="absolute left-4 top-2.5 text-gray-500 text-sm">€</span>
                            <input type="number" step="0.01" data-section="bank" data-bind="beginSaldo" class="${inputClass} pl-8" value="${state.bank.beginSaldo}">
                        </div>
                    </div>
                    <div>
                        <label class="${labelClass}">Eindsaldo (31 dec)</label>
                        <div class="relative">
                            <span class="absolute left-4 top-2.5 text-gray-500 text-sm">€</span>
                            <input type="number" step="0.01" data-section="bank" data-bind="eindSaldo" class="${inputClass} pl-8" value="${state.bank.eindSaldo}">
                        </div>
                    </div>
                </div>
            </section>

            <!-- 3. Privé stortingen & onttrekkingen -->
            <section class="${sectionClass}">
                <h3 class="${headerClass}">
                    <i data-lucide="user-minus" class="w-5 h-5 text-blue-500"></i> 3. Privéstortingen &amp; Onttrekkingen
                </h3>
                <p class="text-xs text-gray-500 mb-5">
                    Als eenmanszaak worden alle inkomsten rechtstreeks op je privé-rekening ontvangen (onttrekking in geld). Zakelijke kosten die privé zijn betaald, zijn stortingen in natura.
                </p>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                        <label class="${labelClass}">Privé IBAN (voor automatische CSV-scan)</label>
                        <input type="text" id="prive-iban-input" class="${inputClass} mb-4" placeholder="NL99 INGB 0000 0000 00" value="${localStorage.getItem('bfe_private_iban') || ''}">
                        
                        <label class="${labelClass}">CSV Bankafschrift upload (Matchen met privé IBAN)</label>
                        <label class="flex flex-col items-center justify-center w-full h-24 border border-dashed border-gray-200 rounded-xl cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
                            <div class="flex flex-col items-center gap-1 text-gray-400">
                                <i data-lucide="file-spreadsheet" class="w-5 h-5"></i>
                                <span class="text-xs font-medium">Selecteer CSV bestand</span>
                            </div>
                            <input id="csv-stortingen-upload" type="file" accept=".csv" class="hidden">
                        </label>
                        <div id="csv-stortingen-result" class="hidden mt-2"></div>
                    </div>

                    <div class="space-y-4">
                        <div>
                            <label class="${labelClass}">Privéstortingen in geld (automatisch berekend of handmatig)</label>
                            <div class="relative">
                                <span class="absolute left-4 top-2.5 text-gray-500 text-sm">€</span>
                                <input type="number" step="0.01" data-section="prive" data-bind="stortingenInGeld" class="${inputClass} pl-8" value="${state.prive.stortingenInGeld}">
                            </div>
                        </div>
                        <div>
                            <label class="${labelClass}">Privé-onttrekkingen in geld (omzet ontvangen op privé-rekening)</label>
                            <div class="relative">
                                <span class="absolute left-4 top-2.5 text-gray-500 text-sm">€</span>
                                <input type="number" step="0.01" data-section="prive" data-bind="onttrekkingenInGeld" class="${inputClass} pl-8" value="${state.prive.onttrekkingenInGeld}">
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <!-- 4. Duurzame Activa (Inventaris) -->
            <section class="${sectionClass}">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-lg font-semibold text-gray-800 flex items-center gap-2">
                        <i data-lucide="package" class="w-5 h-5 text-blue-500"></i> 4. Duurzame Activa &amp; Afschrijvingen
                    </h3>
                    <button id="btn-add-inventaris" class="bg-black text-white px-4 py-1.5 rounded-lg text-xs font-medium hover:bg-gray-800 transition-colors flex items-center gap-1">
                        <i data-lucide="plus" class="w-3.5 h-3.5"></i> Item toevoegen
                    </button>
                </div>
                
                <p class="text-xs text-gray-500 mb-5">
                    Bedrijfsmiddelen &gt; €450 excl. BTW met een levensduur &gt; 1 jaar moeten worden geactiveerd op de balans en lineair worden afgeschreven (meestal in 5 jaar naar restwaarde).
                </p>

                <!-- AI Kandidaten Sectie -->
                <div id="inventaris-kandidaten" class="hidden mb-6 p-5 bg-gradient-to-r from-blue-500/5 to-indigo-500/5 border border-blue-100 rounded-xl">
                    <div class="flex items-center justify-between mb-4">
                        <h4 class="text-sm font-semibold text-blue-900 flex items-center gap-1.5">
                            <i data-lucide="sparkles" class="w-4 h-4 text-blue-500"></i> AI Matcher: Mogelijke inventaris-kandidaten gevonden
                        </h4>
                        <button id="btn-zoek-kandidaten" class="bg-blue-600 text-white px-3 py-1 rounded-lg text-xs hover:bg-blue-700 transition-colors">
                            Zoek in Sheets
                        </button>
                    </div>
                    <div id="kandidaten-lijst" class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <!-- Wordt gevuld via scanner query -->
                    </div>
                </div>

                <!-- Handmatig toevoegen formulier -->
                <div id="inventaris-add-form" class="hidden mb-6 p-4 bg-gray-50 border border-gray-200 rounded-xl grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
                    <div class="sm:col-span-2">
                        <label class="${labelClass}">Omschrijving</label>
                        <input type="text" id="inv-new-omschrijving" class="${inputClass}" placeholder="Bijv. Apple iMac 24\"">
                    </div>
                    <div>
                        <label class="${labelClass}">Aankoopdatum / Jaar</label>
                        <input type="number" id="inv-new-datum" class="${inputClass}" value="${state.year}">
                    </div>
                    <div>
                        <label class="${labelClass}">Aanschafwaarde (excl. BTW)</label>
                        <input type="number" step="0.01" id="inv-new-aanschafwaarde" class="${inputClass}" placeholder="0.00">
                    </div>
                    <div>
                        <label class="${labelClass}">Afschrijvingsduur (in jaren)</label>
                        <input type="number" id="inv-new-afschrijvingsjaren" class="${inputClass}" value="5">
                    </div>
                    <div class="sm:col-span-4 flex justify-end gap-2 mt-2">
                        <button id="btn-cancel-inventaris" class="px-4 py-2 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-100 transition-colors">Annuleren</button>
                        <button id="btn-save-inventaris-item" class="bg-black text-white px-4 py-2 rounded-lg text-xs font-medium hover:bg-gray-800 transition-colors">Opslaan</button>
                    </div>
                </div>

                <!-- Inventaris tabel -->
                <div class="overflow-x-auto border border-gray-100 rounded-xl">
                    <table class="w-full text-left border-collapse font-sans">
                        <thead>
                            <tr class="bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                <th class="px-4 py-3">Omschrijving</th>
                                <th class="px-4 py-3 w-20">Aankoopjaar</th>
                                <th class="px-4 py-3 w-28">Aanschafwaarde</th>
                                <th class="px-4 py-3 w-16">Duur</th>
                                <th class="px-4 py-3 w-28 text-right pr-6">Boekwaarde (1 jan)</th>
                                <th class="px-4 py-3 w-28 text-right pr-6">Afschrijving</th>
                                <th class="px-4 py-3 w-28 text-right pr-6">Boekwaarde (31 dec)</th>
                                <th class="px-4 py-3 w-14 text-center"></th>
                            </tr>
                        </thead>
                        <tbody id="inventaris-tbody" class="divide-y divide-gray-100">
                            <!-- Wordt gevuld door renderInventarisTable() -->
                        </tbody>
                    </table>
                </div>
            </section>

            <!-- 5. Balans extra gegevens -->
            <section class="${sectionClass}">
                <h3 class="${headerClass}">
                    <i data-lucide="scale" class="w-5 h-5 text-blue-500"></i> 5. Fiscale Correcties &amp; Balansposten
                </h3>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                        <label class="${labelClass}">Fiscale bijtelling auto van de zaak (in geld)</label>
                        <p class="text-xs text-gray-400 mb-1.5">Bijv. bijtelling lease-auto VW ID.3 (€3.430,48)</p>
                        <div class="relative">
                            <span class="absolute left-4 top-2.5 text-gray-500 text-sm">€</span>
                            <input type="number" step="0.01" data-section="balans" data-bind="bijtellingAuto" class="${inputClass} pl-8" value="${state.balans?.bijtellingAuto ?? 3430.48}">
                        </div>
                    </div>
                    <div>
                        <label class="${labelClass}">FOR-stand op balans</label>
                        <p class="text-xs text-gray-400 mb-1.5">Fiscale Oudedagsreserve (afgeschaft 2023, bestaand saldo blijft staan)</p>
                        <div class="relative">
                            <span class="absolute left-4 top-2.5 text-gray-500 text-sm">€</span>
                            <input type="number" step="0.01" data-section="balans" data-bind="forStand" class="${inputClass} pl-8" value="${state.balans?.forStand ?? 2143}">
                        </div>
                    </div>
                </div>
            </section>

            <!-- Submit CTA -->
            <div class="mt-10 flex justify-end">
                <button id="btn-generate-report" class="bg-black text-white px-8 py-3.5 rounded-xl text-base font-medium shadow-md hover:bg-gray-800 transition-all flex items-center gap-2">
                    <i data-lucide="calculator" class="w-5 h-5"></i> Bereken Jaarafsluiting &amp; Vraag AI Advies
                </button>
            </div>
        </div>
        
        <div id="report-wrapper" class="hidden max-w-4xl mx-auto pb-12"></div>
    `;
}

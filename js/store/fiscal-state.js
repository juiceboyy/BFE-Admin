const STORAGE_PREFIX = 'bfe_fiscal_';
const ACTIVE_YEAR_KEY = 'bfe_active_year';

const initialState = {
    year: new Date().getFullYear().toString(),
    sheetData: null,
    bank: { beginSaldo: 0, eindSaldo: 0 },
    // VW ID.3 — kenteken J-615-RT, eerste toelating 2021 (bron: CLAUDE.md)
    auto: {
        zakelijkGebruik: true,
        catalogusWaarde: 42881,
        bijtellingsPercentage: 8
    },
    // Inventaris wordt uitsluitend geladen vanuit Google Sheets (SSOT). Nooit opslaan in localStorage.
    inventaris: [],
    prive: {
        onttrekkingenInGeld:   0,
        onttrekkingenInNatura: 0,
        stortingenInGeld:      0,
        stortingenInNatura:    0
    },
    ondernemer: {
        urencriteriumGehaald: true
    },
    balans: {
        kortlopendeSchulden: 0,
        forStand: 2143  // FOR afgeschaft 2023; bestaande stand Big Fish eind 2022
    }
};

class FiscalState {
    constructor(defaultState) {
        this.listeners = [];
        this._defaultState = defaultState;
        const activeYear = localStorage.getItem(ACTIVE_YEAR_KEY) || defaultState.year;

        // Eenmalige opruiming: verwijder inventaris-data uit alle eerder opgeslagen localStorage-states.
        if (!localStorage.getItem('bfe_inventaris_ssot_migrated')) {
            try {
                for (let i = 0; i < localStorage.length; i++) {
                    const k = localStorage.key(i);
                    if (k && k.startsWith(STORAGE_PREFIX)) {
                        const raw = localStorage.getItem(k);
                        if (raw) {
                            const parsed = JSON.parse(raw);
                            if (parsed && 'inventaris' in parsed) {
                                delete parsed.inventaris;
                                localStorage.setItem(k, JSON.stringify(parsed));
                            }
                        }
                    }
                }
            } catch { /* ignore */ }
            localStorage.setItem('bfe_inventaris_ssot_migrated', '1');
        }

        const saved = this._load(activeYear);
        this.state = saved ?? { ...JSON.parse(JSON.stringify(defaultState)), year: activeYear };

        // Inventaris komt altijd leeg binnen — fetchInventarisFromSheet() vult het in na authenticatie.
        this.state.inventaris = [];

        // Migratie: catalogusWaarde van auto als die nog op 0 staat
        if (this.state.auto.catalogusWaarde === 0 && defaultState.auto.catalogusWaarde > 0) {
            this.state.auto.catalogusWaarde = defaultState.auto.catalogusWaarde;
        }
        // Migratie: prive.stortingen → prive.stortingenInGeld (hernoemd)
        if (this.state.prive && 'stortingen' in this.state.prive) {
            this.state.prive.stortingenInGeld = this.state.prive.stortingen;
            delete this.state.prive.stortingen;
        }
        // Migratie: ontbrekende privé-velden aanvullen
        if (!('onttrekkingenInNatura' in (this.state.prive ?? {}))) this.state.prive.onttrekkingenInNatura = 0;
        if (!('stortingenInGeld'      in (this.state.prive ?? {}))) this.state.prive.stortingenInGeld      = 0;
        if (!('stortingenInNatura'    in (this.state.prive ?? {}))) this.state.prive.stortingenInNatura    = 0;
    }

    _storageKey(year) {
        return `${STORAGE_PREFIX}${year}`;
    }

    _load(year) {
        try {
            const saved = localStorage.getItem(this._storageKey(year));
            return saved ? JSON.parse(saved) : null;
        } catch {
            return null;
        }
    }

    _save() {
        try {
            localStorage.setItem(ACTIVE_YEAR_KEY, this.state.year);
            // Sla inventaris NOOIT op in localStorage — Google Sheets is de SSOT.
            const { inventaris: _omit, ...persistable } = this.state;
            localStorage.setItem(this._storageKey(this.state.year), JSON.stringify(persistable));
        } catch (e) {
            console.warn('[FiscalState] Opslaan mislukt:', e);
        }
    }

    getState() {
        return this.state;
    }

    setTopLevel(key, value) {
        if (key === 'year' && value !== this.state.year) {
            // Sla huidig jaar op en laad het nieuwe jaar (of start vers)
            this._save();
            this.state = this._load(value) ?? {
                ...JSON.parse(JSON.stringify(this._defaultState)),
                year: String(value)
            };
        } else {
            this.state[key] = value;
        }
        this.notify();
    }

    setNested(section, key, value) {
        if (this.state[section]) {
            this.state[section][key] = value;
            this.notify();
        }
    }

    addInventarisItem(item) {
        this.state.inventaris.push({
            id: item.id || Date.now(),
            omschrijving: item.omschrijving || '',
            aankoopJaar: item.aankoopJaar || new Date().getFullYear(),
            aankoopBedrag: item.aankoopBedrag || 0,
            afschrijvingsDuur: item.afschrijvingsDuur || 5,
            restwaarde: item.restwaarde ?? 0,
            boekwaardeVorigJaar: item.boekwaardeVorigJaar || 0
        });
        this.notify();
    }

    updateInventarisItem(id, key, value) {
        const item = this.state.inventaris.find(i => i.id === id);
        if (item) {
            item[key] = value;
            this.notify();
        }
    }

    removeInventarisItem(id) {
        this.state.inventaris = this.state.inventaris.filter(i => i.id !== id);
        this.notify();
    }

    /** Wist opgeslagen data voor het huidige jaar en reset naar beginwaarden. */
    reset() {
        localStorage.removeItem(this._storageKey(this.state.year));
        this.state = {
            ...JSON.parse(JSON.stringify(this._defaultState)),
            year: this.state.year
        };
        this.notify();
    }

    subscribe(callback) {
        this.listeners.push(callback);
    }

    notify() {
        this._save();
        const stateCopy = this.getState();
        this.listeners.forEach(cb => cb(stateCopy));
        window.dispatchEvent(new CustomEvent('fiscalStateChanged', { detail: stateCopy }));
    }
}

export const fiscalState = new FiscalState(initialState);

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
    // Inventaris per eind 2023 (bron: CLAUDE.md — boekwaardes zijn boekwaardeVorigJaar voor 2024-aangifte)
    // iPhone XR (2019) weggelaten — volledig afgeschreven per 2023
    inventaris: [
        { id: 1, omschrijving: 'Mac Mini',          aankoopJaar: 2020, aankoopBedrag: 876,  afschrijvingsDuur: 5, boekwaardeVorigJaar: 303  },
        { id: 2, omschrijving: 'Elektrische Gitaar', aankoopJaar: 2022, aankoopBedrag: 512,  afschrijvingsDuur: 5, boekwaardeVorigJaar: 410  },
        { id: 3, omschrijving: 'MacBook Air',        aankoopJaar: 2022, aankoopBedrag: 665,  afschrijvingsDuur: 5, boekwaardeVorigJaar: 532  },
        { id: 4, omschrijving: 'MacBook Air',        aankoopJaar: 2022, aankoopBedrag: 636,  afschrijvingsDuur: 5, boekwaardeVorigJaar: 509  },
        { id: 5, omschrijving: 'iPhone 14',          aankoopJaar: 2022, aankoopBedrag: 729,  afschrijvingsDuur: 5, boekwaardeVorigJaar: 583  },
        { id: 6, omschrijving: 'Mac Mini',           aankoopJaar: 2023, aankoopBedrag: 602,  afschrijvingsDuur: 5, boekwaardeVorigJaar: 602  },
        { id: 7, omschrijving: 'Dyson Stofzuiger',   aankoopJaar: 2023, aankoopBedrag: 477,  afschrijvingsDuur: 5, boekwaardeVorigJaar: 477  },
    ],
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
        const saved = this._load(activeYear);
        this.state = saved ?? { ...JSON.parse(JSON.stringify(defaultState)), year: activeYear };

        // Migratie: als inventaris leeg is maar er zijn defaults, vul dan in
        if (this.state.inventaris.length === 0 && defaultState.inventaris.length > 0) {
            this.state.inventaris = JSON.parse(JSON.stringify(defaultState.inventaris));
        }
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
            localStorage.setItem(this._storageKey(this.state.year), JSON.stringify(this.state));
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
            id: Date.now(),
            omschrijving: item.omschrijving || '',
            aankoopJaar: item.aankoopJaar || new Date().getFullYear(),
            aankoopBedrag: item.aankoopBedrag || 0,
            afschrijvingsDuur: item.afschrijvingsDuur || 5,
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

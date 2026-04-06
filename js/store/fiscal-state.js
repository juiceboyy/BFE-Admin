const STORAGE_PREFIX = 'bfe_fiscal_';

const initialState = {
    year: new Date().getFullYear().toString(),
    sheetData: null,
    bank: { beginSaldo: 0, eindSaldo: 0 },
    auto: {
        zakelijkGebruik: true,
        catalogusWaarde: 0,
        bijtellingsPercentage: 8
    },
    inventaris: [],
    prive: {
        stortingen: 0,
        stortingenInNatura: 0,
        onttrekkingenInGeld: 0
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
        this.state = this._load(defaultState.year) ?? JSON.parse(JSON.stringify(defaultState));
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

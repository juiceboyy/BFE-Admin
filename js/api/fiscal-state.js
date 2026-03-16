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
        onttrekkingenInGeld: 0
    },
    ondernemer: {
        urencriteriumGehaald: true
    }
};

class FiscalState {
    constructor(state) {
        this.state = JSON.parse(JSON.stringify(state));
        this.listeners = [];
    }

    getState() {
        return this.state;
    }

    setTopLevel(key, value) {
        this.state[key] = value;
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

    subscribe(callback) {
        this.listeners.push(callback);
    }

    notify() {
        const stateCopy = this.getState();
        this.listeners.forEach(cb => cb(stateCopy));
        window.dispatchEvent(new CustomEvent('fiscalStateChanged', { detail: stateCopy }));
    }
}

export const fiscalState = new FiscalState(initialState);
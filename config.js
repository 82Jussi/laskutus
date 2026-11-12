/* config.js – asetusten oletukset ja tallennus (localStorage) */

const CFG_KEY = 'laskutus.cfg.v1';

const DEFAULT_CFG = {
  clientId: '',                       // Azure-sovelluksen (client) ID
  tenant: 'common',                   // common | organizations | tenant-id
  regFolder: 'Dokumentit/Laskutus',   // kansio jossa rekisteri-Excel sijaitsee
  regFile: '',                        // valittu rekisteritiedosto
  outFolder: 'Dokumentit/Laskutus/Laskut',
  yearFolders: true,
  filePattern: 'Lasku_{nro}_{asiakas}.pdf',
  nextNumber: 1001,
  sharedCounter: true,                // laskunumero OneDriveen (laskutus-tila.json)
  terms: 14,
  interest: '8 %',
  vat: 25.5,
  mailSubject: 'Lasku {nro} / {lahettaja}',
  mailBody:
    'Hei,\n\nohessa lasku {nro}. Eräpäivä on {erapaiva} ja loppusumma {summa}.\n' +
    'Käytäthän maksaessasi viitenumeroa {viite}.\n\nYstävällisin terveisin\n{lahettaja}',
  mailCc: '',
  mailDraft: false,
  sender: {
    name:'', bid:'', addr:'', zip:'', city:'',
    email:'', phone:'', iban:'', bic:'', bank:'', country:'Suomi'
  }
};

const CFG = {
  data: structuredClone(DEFAULT_CFG),

  load() {
    try {
      const raw = localStorage.getItem(CFG_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        this.data = Object.assign(structuredClone(DEFAULT_CFG), saved);
        this.data.sender = Object.assign(structuredClone(DEFAULT_CFG.sender), saved.sender || {});
      }
    } catch (e) { console.warn('Asetusten luku epäonnistui', e); }
    return this.data;
  },

  save() {
    localStorage.setItem(CFG_KEY, JSON.stringify(this.data));
  },

  reset() {
    this.data = structuredClone(DEFAULT_CFG);
    this.save();
  }
};

CFG.load();

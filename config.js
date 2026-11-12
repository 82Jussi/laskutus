/* config.js – asetusten oletukset ja tallennus (localStorage, laitekohtainen) */

const CFG_KEY = 'laskutus.cfg.v3';

const DEFAULT_CFG = {
  regFile: 'Laskutus-rekisteri.xlsx',      // rekisteri Laskutus-kansiossa
  outFolder: 'Laskut',                     // laskujen alikansio Laskutus-kansiossa
  yearFolders: true,                       // Laskut/2026/...
  filePattern: 'Lasku_{nro}_{asiakas}.pdf',
  pdfStyle: 'bw',                          // 'bw' = mustavalkoinen, 'color' = korostusväri
  pdfColor: '#2e7d32',
  barcode: true,                           // pankkiviivakoodi + virtuaaliviivakoodi
  mailSubject: 'Lasku {nro} / {laskuttaja}',
  mailBody:
    'Hei,\n\nohessa lasku {nro}. Eräpäivä on {erapaiva} ja maksettava summa {summa}.\n' +
    'Käytäthän maksaessasi viitenumeroa {viite}.\n\nYstävällisin terveisin\n{laskuttaja}',
  lastBiller: ''
};

const CFG = {
  data: { ...DEFAULT_CFG },

  load() {
    try {
      const saved = JSON.parse(localStorage.getItem(CFG_KEY) || '{}');
      Object.assign(this.data, DEFAULT_CFG, saved);
    } catch (e) { console.warn('Asetusten luku epäonnistui', e); }
    return this.data;
  },

  save() { localStorage.setItem(CFG_KEY, JSON.stringify(this.data)); },

  reset() {
    Object.keys(this.data).forEach(k => delete this.data[k]);
    Object.assign(this.data, DEFAULT_CFG);
    this.save();
  }
};

CFG.load();

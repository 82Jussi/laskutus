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
    'Hei,\n\nOhessa lasku {nro}. Eräpäivä on {erapaiva} ja maksettava summa {summa}.\n' +
    'Käytäthän maksaessasi viitenumeroa {viite}.\n\nYstävällisin terveisin\n{laskuttaja}',
  vatRates: '25,5; 13,5; 10; 0',          // laskurivien ALV-valikko
  lastBiller: ''
};

const CFG = {
  data: { ...DEFAULT_CFG },

  load() {
    try {
      const saved = JSON.parse(localStorage.getItem(CFG_KEY) || '{}');
      // aiempi oletusviesti päivittyy uuteen, jos sitä ei ole muokattu
      const OLD_BODY = 'Hei,\n\nohessa lasku {nro}. Eräpäivä on {erapaiva} ja maksettava summa {summa}.\n' +
        'Käytäthän maksaessasi viitenumeroa {viite}.\n\nYstävällisin terveisin\n{laskuttaja}';
      if (saved.mailBody === OLD_BODY) delete saved.mailBody;
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

/* ALV-valikon kannat numeroina, esim. [25.5, 13.5, 10, 0] */
function vatList() {
  const out = [];
  String(CFG.data.vatRates || '').split(/[;\s]+/).forEach(x => {
    const v = Number(String(x).replace('%', '').replace(',', '.'));
    if (x !== '' && Number.isFinite(v) && v >= 0 && v <= 100 && !out.includes(v)) out.push(v);
  });
  return out.length ? out : [25.5, 13.5, 10, 0];
}

CFG.load();

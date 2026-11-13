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
    'Käytäthän maksaessasi viitenumeroa {viite}.\n\n' +
    'Virtuaaliviivakoodi: {virtuaaliviivakoodi}\n\nYstävällisin terveisin\n{laskuttaja}',
  vatRates: '25,5; 13,5; 10; 0',           // laskurivien ALV-valikko
  /* erityisominaisuudet – näkyvät vain, kun ne on otettu käyttöön */
  featSelf: false,                         // itselaskutus
  featRoad: false,                         // tiekuntalaskutus
  selfMailSubject: 'Itselaskutus {nro} / {laskuttaja}',
  selfMailBody:
    'Hei,\n\nOhessa itselaskutus {nro}: {selite}.\nMaksamme {summa} tilillesi {tilinumero} viimeistään {erapaiva}.\n\n' +
    'Ystävällisin terveisin\n{laskuttaja}',
  lastBiller: ''
};

const CFG = {
  data: { ...DEFAULT_CFG },

  load() {
    try {
      const saved = JSON.parse(localStorage.getItem(CFG_KEY) || '{}');
      // aiemmat oletustekstit päivittyvät uusiin, jos niitä ei ole muokattu
      const base = ' lasku {nro}. Eräpäivä on {erapaiva} ja maksettava summa {summa}.\n' +
        'Käytäthän maksaessasi viitenumeroa {viite}.\n\nYstävällisin terveisin\n{laskuttaja}';
      if (['ohessa', 'Ohessa'].map(o => 'Hei,\n\n' + o + base).includes(saved.mailBody)) delete saved.mailBody;
      if (saved.selfMailSubject === 'Itselasku {nro} / {laskuttaja}') delete saved.selfMailSubject;
      if (saved.selfMailBody === 'Hei,\n\nOhessa itselasku {nro}: {selite}.\nMaksamme {summa} tilillesi {tilinumero} viimeistään {erapaiva}.\n\n' +
        'Ystävällisin terveisin\n{laskuttaja}') delete saved.selfMailBody;
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

/* app.js – Laskutus, käyttöliittymä (rekisteröinnitön OneDrive-malli) */
const $ = (id) => document.getElementById(id);
const cfg = CFG.data;
const REG_CACHE = 'laskutus.reg.v5';
const STATE_LOCAL = 'laskutus.state.v1';
const LOGO_KEY = 'laskutus.logo.v1';
const STATE_FILE = 'laskutus-tila.json';
let REG = { customers: [], products: [], billers: [], self: [], road: null, drain: null, letters: [], source: '', loaded: '' };
let ROWS = [];
let STATE = { next: {}, log: [] };
let LAST = null;
let READY = false;

/* ===== Apurit ===== */
function status(msg, kind = '') { const el = $('status'); el.className = 'status ' + kind; el.textContent = msg || ''; }
const norm = (s) => String(s ?? '').toLowerCase().trim()
  .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/å/g, 'a').replace(/[\s_.\-:,()%/€]/g, '');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const str = (v) => String(v ?? '').trim();
function pick(row, name) {
  for (const k of Object.keys(row)) if (norm(k) === norm(name)) return row[k];
  return '';
}
function num(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  return Number(String(v).replace(/\s|€|%/g, '').replace(/[\u2212\u2013]/g, '-').replace(',', '.')) || 0;
}
/* luku kenttään pilkulla: 85.5 -> "85,5" */
const fmtIn = (v) => (v === '' || v === null || v === undefined) ? '' : String(v).replace('.', ',');
function splitEmails(v) { return String(v || '').split(/[;,]/).map(s => s.trim()).filter(Boolean); }
function safeName(s) { return String(s || '').replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim(); }
function zipFi(v, country) {
  const s = str(v);
  if (/^\d{1,4}$/.test(s) && (!country || /suomi|finland/i.test(country))) return s.padStart(5, '0');
  return s;
}
function yes(v, dflt = true) {
  const s = norm(v);
  if (!s) return dflt;
  return ['kylla', 'k', 'x', 'yes', 'y', '1', 'true', 'tosi'].includes(s);
}
function nowFi() { return new Date().toLocaleString('fi-FI', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }); }
const isTouch = () => matchMedia('(pointer:coarse)').matches;
function pdfOpts() { return { style: cfg.pdfStyle, color: cfg.pdfColor, barcode: cfg.barcode !== false }; }

/* ===== Päivämäärät ===== */
const DATE_IDS = ['laskupvm', 'erapvm', 'toimituspvm'];
const DATE_HOOKS = {};
function getD(id) { return INV.parseFi($(id).value) || ''; }
function setD(id, iso) {
  $(id).value = iso ? INV.dateFi(iso) : '';
  $(id).classList.remove('invalid');
  const p = document.querySelector(`.dpick[data-for="${id}"]`);
  if (p) p.value = iso || '';
}
function normalizeD(id) {
  const el = $(id);
  const v = INV.parseFi(el.value);
  if (v === null) { el.classList.add('invalid'); return null; }
  setD(id, v);
  return v;
}
function onDateChanged(id) {
  if (id === 'laskupvm') updateDue();
  if (id === 'erapvm') {
    const a = getD('laskupvm'), b = getD('erapvm');
    if (a && b) $('maksuehto').value = Math.max(0, INV.daysBetween(a, b));
  }
  if (DATE_HOOKS[id]) DATE_HOOKS[id]();
}
/* Oma kalenteri: viikko alkaa aina maanantaista (selaimen oma kalenteri seuraa
   laitteen kieliasetusta, eikä sen ensimmäistä viikonpäivää voi valita). */
const CAL = {
  el: null, id: '', y: 0, m: 0,
  MONTHS: ['tammikuu', 'helmikuu', 'maaliskuu', 'huhtikuu', 'toukokuu', 'kesäkuu', 'heinäkuu', 'elokuu', 'syyskuu', 'lokakuu', 'marraskuu', 'joulukuu'],
  open(id, anchor) {
    if (this.el && this.id === id) { this.close(); return; }
    this.close();
    this.id = id;
    const cur = getD(id) || INV.today();
    this.y = Number(cur.slice(0, 4)); this.m = Number(cur.slice(5, 7)) - 1;
    const el = document.createElement('div');
    el.className = 'cal';
    el.setAttribute('role', 'dialog');
    el.addEventListener('click', (e) => this.onClick(e));
    document.body.appendChild(el);
    this.el = el;
    this.render();
    const r = anchor.closest('.datebox').getBoundingClientRect();
    const w = el.offsetWidth, h = el.offsetHeight;
    let left = r.right - w + window.scrollX;
    left = Math.max(window.scrollX + 6, Math.min(left, window.scrollX + document.documentElement.clientWidth - w - 6));
    let top = r.bottom + 4 + window.scrollY;
    if (r.bottom + h + 8 > window.innerHeight && r.top - h - 4 > 0) top = r.top - h - 4 + window.scrollY;
    el.style.left = left + 'px'; el.style.top = top + 'px';
    setTimeout(() => {
      this._out = (e) => { if (this.el && !this.el.contains(e.target) && !e.target.closest('.dpick')) this.close(); };
      this._key = (e) => { if (e.key === 'Escape') this.close(); };
      document.addEventListener('pointerdown', this._out);
      document.addEventListener('keydown', this._key);
    }, 0);
  },
  close() {
    if (!this.el) return;
    this.el.remove(); this.el = null; this.id = '';
    document.removeEventListener('pointerdown', this._out);
    document.removeEventListener('keydown', this._key);
  },
  render() {
    const sel = getD(this.id), today = INV.today();
    const first = new Date(this.y, this.m, 1);
    const offset = (first.getDay() + 6) % 7;          // ma = 0 … su = 6
    const start = new Date(this.y, this.m, 1 - offset);
    let cells = '';
    for (let i = 0; i < 42; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const iso = INV.iso(d);
      const cls = [d.getMonth() !== this.m ? 'out' : '', iso === today ? 'today' : '', iso === sel ? 'sel' : ''].filter(Boolean).join(' ');
      cells += `<button type="button" data-d="${iso}"${cls ? ` class="${cls}"` : ''}>${d.getDate()}</button>`;
    }
    const wd = ['ma', 'ti', 'ke', 'to', 'pe', 'la', 'su'].map((x, i) => `<span class="wd${i === 6 ? ' we' : ''}">${x}</span>`).join('');
    this.el.innerHTML = `<div class="cal-h"><button type="button" data-nav="-1" aria-label="Edellinen kuukausi">‹</button>
      <b>${this.MONTHS[this.m].replace(/^./, c => c.toUpperCase())} ${this.y}</b><button type="button" data-nav="1" aria-label="Seuraava kuukausi">›</button></div>
      <div class="cal-g">${wd}${cells}</div>
      <div class="cal-f"><button type="button" data-d="${today}">Tänään</button><button type="button" data-close="1">Sulje</button></div>`;
  },
  onClick(e) {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.nav) {
      this.m += Number(b.dataset.nav);
      if (this.m < 0) { this.m = 11; this.y--; } else if (this.m > 11) { this.m = 0; this.y++; }
      this.render(); return;
    }
    if (b.dataset.close) { this.close(); return; }
    if (b.dataset.d) {
      const id = this.id;
      setD(id, b.dataset.d);
      this.close();
      status('');
      onDateChanged(id);
    }
  }
};

function initDateFields() {
  document.querySelectorAll('.dfield').forEach(el => {
    const id = el.id;
    el.addEventListener('change', () => {
      if (normalizeD(id) === null) status('Tarkista päivämäärä – muoto pp.kk.vvvv.', 'err');
      else { status(''); onDateChanged(id); }
    });
    el.addEventListener('input', () => el.classList.remove('invalid'));
  });
    document.querySelectorAll('.dpick').forEach(p => {
      p.addEventListener('click', (e) => { e.preventDefault(); CAL.open(p.dataset.for, p); });
    });
}

/* ===== Rekisterin luku ===== */
function findSheet(wb, name) {
  return wb.SheetNames.find(n => norm(n) === norm(name));
}
function sheetRows(wb, name) {
  const n = findSheet(wb, name);
  return n ? XLSX.utils.sheet_to_json(wb.Sheets[n], { defval: '', raw: true }) : [];
}

function parseBillers(wb) {
  const sn = findSheet(wb, 'Laskuttajarekisteri');
  if (!sn) return [];
  const a = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '', raw: true });
  if (a.length < 2) return [];
  const rowOf = {};
  for (let r = 1; r < a.length; r++) rowOf[norm(a[r][0])] = a[r];
  const g = (c, name) => { const r = rowOf[norm(name)]; return r ? str(r[c]) : ''; };
  const width = Math.max(...a.map(r => r.length));
  const out = [];
  for (let c = 1; c < width; c++) {
    const name = g(c, 'Saaja');
    if (!name) continue;
    const interest = g(c, 'Viivästyskorko (%)');
    const vat = g(c, 'Oletus-ALV (%)');
    out.push({
      label: str(a[0][c]) || `Laskuttaja ${c}`, name,
      sellerNo: g(c, 'Myyjänro'),
      addr: g(c, 'Lähiosoite'),
      zip: zipFi(g(c, 'Postinumero'), g(c, 'Maa')),
      city: g(c, 'Postitoimipaikka'),
      country: g(c, 'Maa'),
      phone: g(c, 'Puhelin 1'),
      phone2: g(c, 'Puhelin 2'),
      email: g(c, 'Sähköposti'),
      web: g(c, 'Internet'),
      bank: g(c, 'Pankki 1'),
      iban: g(c, 'IBAN 1'),
      bic: g(c, 'BIC 1'),
      bank2: g(c, 'Pankki 2'),
      iban2: g(c, 'IBAN 2'),
      bic2: g(c, 'BIC 2'),
      bid: g(c, 'Y-tunnus'),
      vatId: g(c, 'ALV-numero'),
      tradeNo: g(c, 'Kaupparek. nro'),
      terms: num(g(c, 'Maksuehto (pv)')),
      interest: interest ? (/%/.test(interest) ? interest : interest.replace('.', ',') + ' %') : '',
      nextNumber: num(g(c, 'Seuraava laskunumero')),
      prefix: g(c, 'Laskunumeron etuliite'),
      currency: g(c, 'Oletusvaluutta') || 'EUR',
      vat: vat === '' ? 25.5 : num(vat),
      note: g(c, 'Laskun vakioteksti'),
      logo: g(c, 'Logo tiedostonimi')
    });
  }
  return out;
}

/* Tiekunta-välilehti: yläosassa tiekunnan tiedot (A = nimike, B = arvo), sen alla
   tieyksikköluettelo, jonka otsikkorivillä on sarakkeet Kiinteistö ja Maksaja.
   Yksi rivi = yksi tienkäyttöyksikkö; maksajan tiedot toistetaan jokaisella rivillä. */
function parseRoad(wb) {
  const sn = findSheet(wb, 'Tiekunta');
  if (!sn) return null;
  const a = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '', raw: true });
  const h = a.findIndex(r => r.some(c => norm(c) === 'kiinteisto') && r.some(c => norm(c) === 'maksaja'));
  if (h < 0) return null;
  const set = {};
  for (let i = 0; i < h; i++) { const k = norm(a[i][0]); if (k && set[k] === undefined) set[k] = a[i][1]; }
  const g = (name) => { const v = set[norm(name)]; return v === undefined ? '' : v; };
  const settings = {
    name: str(g('Tiekunta')),
    roadNo: str(g('Tie / selitelmä')),
    year: str(g('Laskutusvuosi')),
    method: norm(g('Laskentatapa')).startsWith('yksikko') ? 'unit' : 'budget',
    budget: num(g('Ositeltava summa (€)')),
    unitPrice: num(g('Yksikköhinta (€/tieyks.)')),
    baseFee: num(g('Perusmaksu (€ / maksaja)')),
    baseText: str(g('Perusmaksun teksti')),
    lineText: str(g('Ylläpitomaksun teksti')),
    vat: num(g('ALV %')),
    note: str(g('Laskun lisäteksti')),
    confirmed: str(g('Vahvistettu'))
  };
  const head = a[h].map(norm);
  const col = (name) => head.indexOf(norm(name));
  const C = {
    act: col('Käytössä'), estate: col('Kiinteistö'), name: col('Maksaja'), addr: col('Osoite'),
    zip: col('Postinumero'), city: col('Postitoimipaikka'), email: col('Sähköposti'),
    unit: col('Tienkäyttöyksikkö'), cnt: col('Yksiköiden lkm'), w: col('Painoluku'), km: col('Matka (km)'),
    km2: col('Matkan korjauskerroin'), w2: col('Painoluvun korjauskerroin'), info: col('Lisätieto')
  };
  const v = (r, i) => i >= 0 ? r[i] : '';
  const f1 = (x) => str(x) === '' ? 1 : num(x);
  const rows = [];
  for (let i = h + 1; i < a.length; i++) {
    const r = a[i];
    if (!r.some(c => str(c) !== '')) continue;
    const estate = str(v(r, C.estate)), name = str(v(r, C.name));
    if (!estate && !name) continue;
    /* tieyksiköt = lkm × painoluku × matka × korjauskertoimet (tyhjä kerroin = 1) */
    const units = Math.round(num(v(r, C.cnt)) * num(v(r, C.w)) * num(v(r, C.km)) * f1(v(r, C.km2)) * f1(v(r, C.w2)) * 1000) / 1000;
    rows.push({
      row: i + 1, active: yes(v(r, C.act)), estate, name,
      addr: str(v(r, C.addr)), zip: zipFi(v(r, C.zip)), city: str(v(r, C.city)),
      email: str(v(r, C.email)),
      unit: str(v(r, C.unit)), units, info: str(v(r, C.info))
    });
  }
  return { settings, rows };
}

/* Ojitusyhteisö-välilehti (yksi ojitusyhteisö per rekisteri):
   1) yläosa: yhteisön tiedot (A = nimike, B = arvo)
   2) kuivatusalueet: Kuivatusalue | Laskutettava summa (€) | Selite
   3) osittelulaskelma: rivi per osittelukuvio; maksajan tiedot toistetaan jokaisella rivillä.
   Kuviorivit kootaan tiloiksi (kuivatusalue + kiinteistötunnus + tilan nimi).
   Kuvion mha = pinta-ala × maanarvojyvä × kuivatusjyvä (2 des.), 0 jos hyöty vastaa haittaa, + mha-korjaus.
   Tilakohtaiset arvot (kiinteä osuus, osuuden korjaus, vahvistettu osuus) luetaan siltä riviltä, jolle ne on täytetty.
   Laskutus tehdään aina vahvistetun osuuden mukaan; kuvioista laskettu osuus on tarkistus. */
function parseDrain(wb) {
  const sn = findSheet(wb, 'Ojitusyhteisö');
  if (!sn) return null;
  const a = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '', raw: true });
  const ah = a.findIndex(r => norm(r[0]) === 'kuivatusalue' && r.some(c => norm(c) === norm('Laskutettava summa (€)')));
  const mh = a.findIndex(r => r.some(c => norm(c) === 'kiinteistotunnus') && r.some(c => norm(c) === 'maksaja'));
  if (mh < 0) return null;
  const set = {};
  for (let i = 0; i < (ah >= 0 ? ah : mh); i++) { const k = norm(a[i][0]); if (k && set[k] === undefined) set[k] = a[i][1]; }
  const g = (name) => { const v = set[norm(name)]; return v === undefined ? '' : v; };
  const settings = {
    name: str(g('Ojitusyhteisö')),
    project: str(g('Hanke')),
    year: str(g('Laskutusvuosi')),
    lineText: str(g('Laskurivin teksti')),
    vat: num(g('ALV %')),
    note: str(g('Laskun lisäteksti'))
  };
  const areas = [];
  if (ah >= 0) {
    const hh = a[ah].map(norm);
    const ci = hh.indexOf(norm('Laskutettava summa (€)')), ti = hh.indexOf(norm('Selite'));
    for (let i = ah + 1; i < mh; i++) {
      const name = str(a[i][0]);
      if (!name || norm(name).startsWith('yhteensa')) { if (!name && areas.length) break; continue; }
      areas.push({ name, amount: num(a[i][ci]), text: ti >= 0 ? str(a[i][ti]) : '' });
    }
  }
  const head = a[mh].map(norm);
  const col = (name) => head.indexOf(norm(name));
  const C = { act: col('Käytössä'), area: col('Kuivatusalue'), estate: col('Kiinteistötunnus'), en: col('Tilan nimi'),
    name: col('Maksaja'), rec: col('Laskutusvastaanottaja'), addr: col('Osoite'), zip: col('Postinumero'),
    city: col('Postitoimipaikka'), email: col('Sähköposti'),
    ha: col('Osittelukuvion pinta-ala (ha)'), mj: col('Maanarvojyvä'), kj: col('Kuivatusjyvä'),
    hvh: col('Hyöty vastaa haittaa'), corr: col('mha-korjaus'), fixed: col('Kiinteä osuus %'), pcorr: col('Osuuden korjaus %'),
    ver: col('Vahvistettu osuus %'), info: col('Lisätieto') };
  const v = (r, i) => i >= 0 ? r[i] : '';
  const tilas = new Map(), rows = [];
  const label = { pct: 'Vahvistettu osuus', fixed: 'Kiinteä osuus', pcorr: 'Osuuden korjaus' };
  const tval = (t, f, raw, r) => {
    if (str(raw) === '') return;
    const x = num(raw);
    if (t[f] === null) t[f] = x;
    else if (Math.abs(t[f] - x) > 1e-9) t.conflicts.push(`${label[f]} täytetty useammalle riville eri arvoin (rivi ${r})`);
  };
  for (let i = mh + 1; i < a.length; i++) {
    const r = a[i];
    if (!r.some(c => str(c) !== '')) continue;
    const area = str(v(r, C.area)), estate = str(v(r, C.estate)), estateName = str(v(r, C.en)), name = str(v(r, C.name));
    if (!estate && !name && !estateName) continue;
    const k = area + '|' + estate + '|' + SEARCH.fold(estateName);
    let t = tilas.get(k);
    if (!t) {
      t = { row: i + 1, active: false, area, estate: estate === '-' ? '' : estate, estateName, name,
        recipient: str(v(r, C.rec)), addr: str(v(r, C.addr)), zip: zipFi(v(r, C.zip)), city: str(v(r, C.city)),
        email: str(v(r, C.email)), mha: 0, pct: null, fixed: null, pcorr: null, info: str(v(r, C.info)), conflicts: [] };
      tilas.set(k, t); rows.push(t);
    }
    const act = yes(v(r, C.act));
    if (act) {
      t.active = true;
      const ha = num(v(r, C.ha)), hy = num(v(r, C.mj)) * num(v(r, C.kj));
      t.mha += (yes(v(r, C.hvh), false) ? 0 : Math.round(ha * hy * 100 + 1e-9) / 100) + num(v(r, C.corr));
    }
    tval(t, 'pct', v(r, C.ver), i + 1);
    tval(t, 'fixed', v(r, C.fixed), i + 1);
    tval(t, 'pcorr', v(r, C.pcorr), i + 1);
  }
  rows.forEach(t => { t.mha = Math.round(t.mha * 1000) / 1000; });
  const byArea = {};
  rows.filter(t => t.active).forEach(t => {
    const g = byArea[t.area] = byArea[t.area] || { mha: 0, fixed: 0 };
    if (t.fixed) g.fixed += t.fixed; else g.mha += t.mha;
  });
  rows.forEach(t => {
    const g = byArea[t.area] || { mha: 0, fixed: 0 };
    const base = t.fixed ? t.fixed : (g.mha ? Math.round(t.mha / g.mha * (100 - g.fixed) * 100 + 1e-9) / 100 : 0);
    t.calcPct = Math.round((base + (t.pcorr || 0)) * 100) / 100;
  });
  return { settings, areas, rows };
}

function parseWorkbook(buf, source) {
  const wb = XLSX.read(buf, { type: 'array' });
  const customers = sheetRows(wb, 'Asiakasrekisteri').map(r => {
    const country = str(pick(r, 'Maa'));
    return {
      id: str(pick(r, 'Asiakasnumero')),
      name: str(pick(r, 'Nimi')),
      addr: str(pick(r, 'Osoite')),
      zip: zipFi(pick(r, 'Postinumero'), country),
      city: str(pick(r, 'Postitoimipaikka')),
      country,
      bid: str(pick(r, 'Y-tunnus')),
      email: str(pick(r, 'Sähköposti')),
      terms: num(pick(r, 'Maksuehto')),
      recipient: str(pick(r, 'Laskutusvastaanottaja')),
      mails: splitEmails(pick(r, 'Laskutussähköposti')),
      einv: str(pick(r, 'Verkkolaskuosoite')),
      operator: str(pick(r, 'Välittäjä'))
    };
  }).filter(c => c.name);
  const products = sheetRows(wb, 'Tuoterekisteri').map(r => ({
    code: str(pick(r, 'Tuotekoodi')),
    name: str(pick(r, 'Tuote')),
    unit: str(pick(r, 'Yksikkö')),
    price: num(pick(r, 'Hinta, alv 0%')),
    vat: str(pick(r, 'ALV')) === '' ? null : num(pick(r, 'ALV'))
  })).filter(p => p.name);
  const self = sheetRows(wb, 'Itselaskutus').map((r, i) => {
    const qtyRaw = pick(r, 'Määrä');
    const vatRaw = pick(r, 'ALV');
    const priceRaw = pick(r, 'Hinta, alv 0%');
    return {
      row: i + 2,
      active: yes(pick(r, 'Käytössä')),
      name: str(pick(r, 'Nimi')),
      addr: str(pick(r, 'Osoite')),
      zip: zipFi(pick(r, 'Postinumero')),
      city: str(pick(r, 'Postitoimipaikka')),
      email: str(pick(r, 'Sähköposti')),
      iban: str(pick(r, 'Tilinumero')).toUpperCase(),
      desc: str(pick(r, 'Selite')),
      qty: str(qtyRaw) === '' ? 1 : num(qtyRaw),
      unit: str(pick(r, 'Yksikkö')),
      price: num(priceRaw),
      vat: str(vatRaw) === '' ? null : num(vatRaw),
      priceEmpty: str(priceRaw) === ''
    };
  }).filter(x => x.name || x.desc || !x.priceEmpty);
  /* Massakirjeen vastaanottajat */
  const letters = sheetRows(wb, 'Kirjeen vastaanottajat').map((r, i) => {
    const country = str(pick(r, 'Maa'));
    return {
      row: i + 2, active: yes(pick(r, 'Käytössä')),
      name: str(pick(r, 'Nimi')),
      recipient: str(pick(r, 'Laskutusvastaanottaja / c/o')),
      addr: str(pick(r, 'Osoite')),
      zip: zipFi(pick(r, 'Postinumero'), country),
      city: str(pick(r, 'Postitoimipaikka')),
      country,
      email: str(pick(r, 'Sähköposti')),
      info: str(pick(r, 'Lisätieto'))
    };
  }).filter(r => r.name);
  const road = parseRoad(wb);
  const drain = parseDrain(wb);
  const billers = parseBillers(wb);
  if (!customers.length && !products.length && !billers.length) {
    throw new Error('Rekisteri on tyhjä. Täytä vähintään Laskuttajarekisterin Saaja-rivi (tai asiakas/tuote) ja valitse rekisteri uudelleen.');
  }
  return { customers, products, billers, self, road, drain, letters, source, loaded: nowFi() };
}

function setRegistry(reg) {
  REG = reg;
  if (ST.mode === 'file') { try { localStorage.setItem(REG_CACHE, JSON.stringify(reg)); } catch (_) {} }
  fillRegistry();
}
async function reloadRegistry() {
  if (ST.mode === 'folder' && READY) { await loadRegistryFromFolder(); return true; }
  return false;
}

/* ===== Laskunumerot ===== */
async function loadState() {
  if (ST.mode === 'folder') STATE = (await ST.readJson(STATE_FILE)) || { next: {}, log: [] };
  else {
    try { STATE = JSON.parse(localStorage.getItem(STATE_LOCAL) || 'null') || { next: {}, log: [] }; }
    catch (_) { STATE = { next: {}, log: [] }; }
  }
  STATE.next = STATE.next || {};
  STATE.log = STATE.log || [];
}
async function saveState() {
  STATE.updated = new Date().toISOString();
  if (STATE.log.length > 2000) STATE.log = STATE.log.slice(-2000);
  if (ST.mode === 'folder') await ST.writeJson(STATE_FILE, STATE);
  else localStorage.setItem(STATE_LOCAL, JSON.stringify(STATE));
}
function currentBiller() { return REG.billers[Number($('laskuttaja').value) || 0] || null; }
const billerKey = (b) => b ? (b.sellerNo || b.name) : '';
function patternRegex(prefix) {
  const p = (cfg.filePattern || 'Lasku_{nro}_{asiakas}.pdf').replace(/\.pdf$/i, '') + '.pdf';
  const parts = p.split(/(\{nro\}|\{asiakas\}|\{pvm\}|\{vuosi\}|\{summa\})/);
  const rx = parts.map(x => {
    if (x === '{nro}') return prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\d+)';
    if (/^\{\w+\}$/.test(x)) return '.*?';
    return x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }).join('');
  return new RegExp('^' + rx + '$', 'i');
}
function selfFileToNormal(name) {
  if (!/^Itselaskutus/i.test(name)) return null;
  const pat = cfg.filePattern || 'Lasku_{nro}_{asiakas}.pdf';
  return /^Lasku/i.test(pat) ? name.replace(/^Itselaskutus/i, 'Lasku') : name.replace(/^Itselaskutus_/i, '');
}
async function scanMaxNumber(b) {
  if (ST.mode !== 'folder' || !READY) return 0;
  if (REG.billers.filter(x => (x.prefix || '') === (b.prefix || '')).length > 1) return 0;
  const rx = patternRegex(b.prefix || '');
  const y = new Date().getFullYear();
  const roots = cfg.yearFolders ? [`${cfg.outFolder}/${y}`, `${cfg.outFolder}/${y - 1}`] : [cfg.outFolder];
  let max = 0;
  const walk = async (f, depth) => {
    for (const e of await ST.list(f)) {
      if (e.kind === 'directory' && depth < 2) await walk(f + '/' + e.name, depth + 1);
      if (e.kind !== 'file') continue;
      const m = e.name.match(rx) || (selfFileToNormal(e.name) || '').match(rx);
      if (m) max = Math.max(max, Number(m[1]));
    }
  };
  for (const f of roots) await walk(f, 0);
  return max;
}
async function nextNumberFor(b) {
  if (!b) return 1;
  const fromState = Number(STATE.next[billerKey(b)]) || 0;
  const scanned = await scanMaxNumber(b);
  return Math.max(b.nextNumber || 1, fromState, scanned + 1);
}
async function suggestNumber() {
  const b = currentBiller();
  if (!b) return;
  $('laskunro').value = (b.prefix || '') + await nextNumberFor(b);
  updateRef();
  $('numberHint').textContent = ST.mode === 'file'
    ? 'Puhelin ehdottaa numeroa tällä laitteella tehtyjen laskujen perusteella – tarkista, jos olet laskuttanut myös tietokoneella.' : '';
}
function numberPart(nro, b) {
  let s = String(nro || '');
  if (b && b.prefix && s.startsWith(b.prefix)) s = s.slice(b.prefix.length);
  const m = s.match(/(\d+)\s*$/);
  return m ? Number(m[1]) : 0;
}

/* ===== Rekisterin näyttö ===== */
function billerOptions() {
  return REG.billers.map((b, i) => `<option value="${i}">${esc(b.name)}${b.sellerNo ? ' (' + esc(b.sellerNo) + ')' : ''}</option>`).join('');
}
function fillRegistry() {
  const bs = $('laskuttaja');
  bs.innerHTML = billerOptions();
  const lastIdx = REG.billers.findIndex(b => billerKey(b) === cfg.lastBiller);
  bs.value = String(lastIdx >= 0 ? lastIdx : 0);
  $('billerWrap').hidden = REG.billers.length <= 1;
  const prev = $('asiakasHaku').dataset.key || '';
  const idx = prev ? REG.customers.findIndex(c => custKey(c) === prev) : -1;
  if (isOneOff()) { /* kertalaskun asiakas säilyy */ }
  else if (idx >= 0) selectCustomer(idx, false); else clearCustomer();
  $('asiakasHaku').placeholder = REG.customers.length
    ? `Kirjoita nimi tai asiakasnumero (${REG.customers.length} asiakasta)` : 'Lataa ensin rekisteri';
  const has = REG.customers.length || REG.products.length || REG.billers.length;
  const extra = [];
  if (cfg.featSelf) extra.push(`<span class="pill">${(REG.self || []).length} itselaskutusriviä</span>`);
  if (cfg.featRoad) extra.push(REG.road
    ? `<span class="pill">${esc(REG.road.settings.name || 'Tiekunta')} · ${REG.road.rows.length} tieyksikköriviä</span>`
    : '<span class="pill warn">Tiekunta-välilehti puuttuu</span>');
  if (cfg.featDrain) extra.push(REG.drain
    ? `<span class="pill">${esc(REG.drain.settings.name || 'Ojitusyhteisö')} · ${REG.drain.areas.length} kuivatusaluetta · ${REG.drain.rows.length} tilariviä</span>`
    : '<span class="pill warn">Ojitusyhteisö-välilehti puuttuu</span>');
  if (cfg.featLetter) extra.push((REG.letters || []).length
    ? `<span class="pill">${REG.letters.length} kirjeen vastaanottajaa</span>`
    : '<span class="pill warn">Kirjeen vastaanottajat -välilehti puuttuu</span>');
  $('regSummary').innerHTML = has
    ? `<span class="pill">${REG.customers.length} asiakasta</span>` +
      `<span class="pill">${REG.products.length} tuotetta</span>` +
      `<span class="pill">${REG.billers.length} laskuttaja${REG.billers.length === 1 ? '' : 'a'}</span>` +
      extra.join('') +
      `<div class="muted">${esc(REG.source)} · luettu ${esc(REG.loaded)}</div>` +
      (REG.billers.length ? '' : '<div class="status err">Laskuttajarekisteri puuttuu tai on tyhjä.</div>')
    : 'Rekisteriä ei ole ladattu.';
  $('headState').textContent = has ? `Rekisteri luettu ${REG.loaded}` : 'Rekisteriä ei ole ladattu';
  // tyhjät rivit saavat laskuttajan oletus-ALV:n (ensimmäinen rivi luodaan ennen rekisterin latausta)
  ROWS.forEach(r => { if (r.product === '' && !str(r.desc) && !Number(r.price)) r.vat = defaultVat(); });
  renderRows();
  applyBiller();
  if (typeof BATCH !== 'undefined') BATCH.refresh();
  if (typeof LETTER !== 'undefined' && cfg.featLetter) LETTER.refresh();
}
async function applyBiller() {
  const b = currentBiller();
  if (!b) return;
  cfg.lastBiller = billerKey(b); CFG.save();
  const c = currentCustomer();
  $('maksuehto').value = (c && c.terms) || b.terms || 14;
  updateDue();
  await suggestNumber();
  calc();
}
/* Kertalaskun asiakas: ei rekisterissä eikä asiakasnumeroa → Asiakasnumero-kenttä jää laskulta pois */
const isOneOff = () => $('oneOff').checked;
function oneOffCustomer() {
  const v = (id) => $(id).value.trim();
  const name = v('ooName');
  if (!name) return null;
  return { id: '', name, recipient: v('ooRecipient'), addr: v('ooAddr'), zip: zipFi(v('ooZip')), city: v('ooCity'),
    country: '', bid: v('ooBid'), email: '', terms: 0, mails: [], einv: '', operator: '' };
}
function currentCustomer() {
  if (isOneOff()) return oneOffCustomer();
  const v = $('asiakas').value; return v === '' ? null : REG.customers[Number(v)] || null;
}
function setOneOff(on) {
  $('oneOff').checked = on;
  $('custWrap').hidden = on;
  $('oneOffFields').hidden = !on;
  if (on) {
    $('asiakas').value = ''; $('asiakasHaku').value = ''; $('asiakasHaku').dataset.key = '';
    $('asiakasTiedot').textContent = 'Kertalaskun asiakas – ei tallenneta rekisteriin.';
    $('ooName').focus();
  } else {
    ['ooName', 'ooRecipient', 'ooAddr', 'ooZip', 'ooCity', 'ooBid'].forEach(id => { $(id).value = ''; });
    onCustomerChange();
  }
}
$('oneOff').addEventListener('change', () => setOneOff($('oneOff').checked));
const custKey = (c) => (c.id || '') + '|' + c.name;
function custEntries() {
  return REG.customers.map((c, i) => ({ index: i, code: c.id, name: c.name, extra: [c.city, c.bid, c.recipient, c.addr].filter(Boolean).join(' ') }));
}
function selectCustomer(i, notify = true) {
  const c = REG.customers[i];
  $('asiakas').value = String(i);
  $('asiakasHaku').value = c.name;
  $('asiakasHaku').dataset.key = custKey(c);
  $('asiakasHaku').classList.remove('invalid');
  if (notify) onCustomerChange();
}
function clearCustomer() {
  $('asiakas').value = '';
  $('asiakasHaku').value = '';
  $('asiakasHaku').dataset.key = '';
  onCustomerChange();
}
SEARCH.attach($('asiakasHaku'), {
  entries: custEntries,
  render: (e) => { const c = REG.customers[e.index]; return { title: c.name, sub: [c.id && 'nro ' + c.id, c.city, c.bid].filter(Boolean).join(' · ') }; },
  onPick: (e) => { selectCustomer(e.index); },
  onType: () => { $('asiakas').value = ''; $('asiakasHaku').dataset.key = ''; },
  onNoMatch: () => { $('asiakasHaku').classList.add('invalid'); status('Asiakasta ei löytynyt rekisteristä.', 'err'); },
  isPicked: () => $('asiakas').value !== '',
  pickOnBlur: true, showAllOnFocus: true, selectOnFocus: true,
  emptyText: 'Ei osumia asiakasrekisterissä'
});
function onCustomerChange() {
  if (isOneOff()) return;
  const c = currentCustomer(), b = currentBiller();
  if (!c) { $('asiakasTiedot').textContent = ''; $('emails').value = ''; return; }
  $('emails').value = (c.mails.length ? c.mails : splitEmails(c.email)).join('; ');
  $('asiakasTiedot').textContent = [c.recipient, c.addr, [c.zip, c.city].filter(Boolean).join(' '),
    c.bid ? 'Y-tunnus ' + c.bid : '', c.einv ? 'Verkkolasku ' + c.einv : ''].filter(Boolean).join(' · ');
  $('maksuehto').value = c.terms || (b && b.terms) || 14;
  updateDue();
}

/* ===== Laskurivit ===== */
function defaultVat() { const b = currentBiller(), list = vatList(); return b && list.includes(b.vat) ? b.vat : list[0]; }
const fmtVat = (v) => String(v).replace('.', ',') + ' %';
function vatOptions(cur) {
  const list = vatList().slice();
  if (cur !== '' && cur !== null && cur !== undefined && !list.includes(Number(cur))) list.push(Number(cur));
  return list.map(v => `<option value="${v}"${Number(cur) === v ? ' selected' : ''}>${fmtVat(v)}</option>`).join('');
}
function addRow(data = {}) { ROWS.push({ product: '', desc: '', qty: 1, unit: 'kpl', price: 0, vat: defaultVat(), ...data }); renderRows(); }
function prodEntries() { return REG.products.map((p, i) => ({ index: i, code: p.code, name: p.name, extra: p.unit })); }
function pickProduct(i, pi) {
  const p = REG.products[pi];
  Object.assign(ROWS[i], { product: pi, desc: p.name, unit: p.unit || 'kpl', price: p.price, vat: p.vat === null ? defaultVat() : p.vat });
  renderRows();
  const q = $('rivit').querySelector(`[data-f="qty"][data-i="${i}"]`);
  if (q) { q.focus(); try { q.select(); } catch (_) {} }
}
function renderRows() {
  const wrap = $('rivit');
  const ph = REG.products.length ? 'Hae tuote tai kirjoita vapaa rivi' : 'Tuote / kuvaus laskulle';
  wrap.innerHTML = ROWS.map((r, i) => `
    <div class="lrow" data-i="${i}">
      <div class="lrow-top">
        <div class="lcol"><input data-f="desc" data-i="${i}" value="${esc(r.desc)}" placeholder="${ph}" enterkeyhint="next" aria-label="Tuote"></div>
        <button type="button" class="del" data-del="${i}" aria-label="Poista rivi" title="Poista rivi">×</button>
      </div>
      <div class="lrow-nums">
        <label>Määrä<input type="text" inputmode="decimal" autocomplete="off" data-f="qty" data-i="${i}" value="${fmtIn(r.qty)}"></label>
        <label>Yks.<input data-f="unit" data-i="${i}" value="${esc(r.unit)}"></label>
        <label>Hinta, alv 0%<span class="pricebox"><input type="text" inputmode="decimal" autocomplete="off" data-f="price" data-i="${i}" value="${fmtIn(r.price)}"><button type="button" class="sign" data-sign="${i}" title="Vaihda etumerkki (hyvitys)" aria-label="Vaihda etumerkki">±</button></span></label>
        <label>ALV<select data-f="vat" data-i="${i}">${vatOptions(r.vat)}</select></label>
        <div class="ltot" data-tot="${i}">${INV.money(INV.lineTotal(r))}</div>
      </div>
    </div>`).join('');
  if (REG.products.length) {
    wrap.querySelectorAll('input[data-f="desc"]').forEach(inp => {
      const i = Number(inp.dataset.i);
      SEARCH.attach(inp, {
        entries: prodEntries,
        render: (e) => {
          const p = REG.products[e.index];
          return { title: p.name, sub: [p.code, INV.money(p.price) + (p.unit ? ' / ' + p.unit : ''), p.vat === null ? '' : 'ALV ' + fmtVat(p.vat)].filter(Boolean).join(' · ') };
        },
        onPick: (e) => pickProduct(i, e.index),
        onType: () => { ROWS[i].product = ''; },
        /* kenttää napauttamalla koko tuotelista; kirjoitettu haku suodattaa; vapaa teksti säilyy */
        isPicked: () => ROWS[i].product !== '' || !str(ROWS[i].desc),
        showAllOnFocus: true,
        selectOnFocus: () => ROWS[i].product !== ''
      });
    });
  }
  calc();
}
$('rivit').addEventListener('input', (e) => {
  const i = e.target.dataset.i, f = e.target.dataset.f;
  if (i === undefined || !f) return;
  ROWS[i][f] = (f === 'desc' || f === 'unit') ? e.target.value : num(e.target.value);
  const tot = $('rivit').querySelector(`[data-tot="${i}"]`);
  if (tot) tot.textContent = INV.money(INV.lineTotal(ROWS[i]));
  calc();
});
$('rivit').addEventListener('change', (e) => { if (e.target.dataset.f === 'vat') { ROWS[e.target.dataset.i].vat = num(e.target.value); calc(); } });
$('rivit').addEventListener('click', (e) => {
  const sg = e.target.dataset.sign;
  if (sg !== undefined) {
    const r = ROWS[sg];
    r.price = -(Number(r.price) || 0);
    const inp = $('rivit').querySelector(`[data-f="price"][data-i="${sg}"]`);
    if (inp) inp.value = fmtIn(r.price);
    const tot = $('rivit').querySelector(`[data-tot="${sg}"]`);
    if (tot) tot.textContent = INV.money(INV.lineTotal(r));
    calc();
    return;
  }
  const d = e.target.dataset.del;
  if (d === undefined) return;
  ROWS.splice(Number(d), 1);
  if (!ROWS.length) addRow(); else renderRows();
});
function calc() {
  const b = currentBiller(), cur = b && b.currency, t = INV.totals(ROWS);
  $('tNetto').textContent = INV.money(t.net, cur);
  $('tAlv').textContent = INV.money(t.vat, cur);
  $('tBrutto').textContent = INV.money(t.gross, cur);
}

/* ===== Laskun tiedot ===== */
function updateDue() { setD('erapvm', INV.addDays(getD('laskupvm') || INV.today(), num($('maksuehto').value))); }
function updateRef() { $('viite').value = INV.reference($('laskunro').value || '1'); }
async function logoFor(b) {
  const own = localStorage.getItem(LOGO_KEY);
  if (own) return own;
  if (ST.mode === 'folder' && READY && b && b.logo) {
    try {
      const f = await ST.readFile(b.logo);
      return await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(f); });
    } catch (_) { console.warn('Logoa ei löytynyt kansiosta:', b.logo); }
  }
  return '';
}
function buildInvoice(logoData = '') {
  const b = currentBiller() || {};
  return {
    number: $('laskunro').value.trim(), date: getD('laskupvm') || INV.today(), due: getD('erapvm'),
    terms: num($('maksuehto').value), reference: $('viite').value, deliveryDate: getD('toimituspvm'),
    note: $('vapaateksti').value.trim(), sender: { ...b, logoData }, customer: currentCustomer() || {},
    emails: splitEmails($('emails').value), lines: ROWS.filter(r => str(r.desc) || INV.lineTotal(r))
  };
}
function validate(inv) {
  for (const id of DATE_IDS) if (normalizeD(id) === null) return 'Tarkista päivämäärä (muoto pp.kk.vvvv).';
  if (!REG.billers.length) return 'Lataa ensin rekisteri (Laskuttajarekisteri puuttuu).';
  if (!inv.customer.name) return isOneOff() ? 'Kirjoita kertalaskun asiakkaan nimi.' : 'Valitse asiakas – kirjoita nimi ja valitse listasta.';
  if (!inv.lines.length) return 'Lisää vähintään yksi laskurivi.';
  if (!inv.number) return 'Laskunumero puuttuu.';
  if (!inv.due) return 'Eräpäivä puuttuu.';
  return '';
}
function fileNameFor(inv) {
  const t = INV.totals(inv.lines);
  const pat = cfg.filePattern || 'Lasku_{nro}_{asiakas}.pdf';
  const base = safeName(pat.replace(/\{nro\}/g, inv.number).replace(/\{asiakas\}/g, inv.customer.name)
    .replace(/\{pvm\}/g, inv.date).replace(/\{vuosi\}/g, inv.date.slice(0, 4)).replace(/\{summa\}/g, t.gross.toFixed(2))
  ).replace(/\.pdf$/i, '') + '.pdf';
  if (inv.kind !== 'self') return base;
  return /^Lasku/i.test(base) ? base.replace(/^Lasku/i, 'Itselaskutus') : 'Itselaskutus_' + base;
}
function outFolderFor(inv) { return (cfg.outFolder || 'Laskut') + (cfg.yearFolders ? '/' + inv.date.slice(0, 4) : ''); }
function mailTexts(inv) {
  const t = INV.totals(inv.lines);
  if (inv.kind === 'self') {
    const rep = (s) => String(s || '').replace(/\{nro\}/g, inv.number).replace(/\{laskuttaja\}/g, inv.sender.name || '')
      .replace(/\{selite\}/g, inv.lines.map(l => l.desc).filter(Boolean).join(', ')).replace(/\{erapaiva\}/g, INV.dateFi(inv.due))
      .replace(/\{summa\}/g, INV.money(t.gross, inv.sender.currency)).replace(/\{tilinumero\}/g, inv.customer.iban || '');
    return { subject: rep(cfg.selfMailSubject), body: rep(cfg.selfMailBody) };
  }
  const vcode = INV.virtualBarcode(inv.sender.iban, t.gross, inv.reference, inv.due, inv.sender.currency);
  const strip = (s) => vcode ? String(s || '') : String(s || '').split('\n').filter(l => !l.includes('{virtuaaliviivakoodi}')).join('\n').replace(/\n{3,}/g, '\n\n');
  const rep = (s) => strip(s).replace(/\{nro\}/g, inv.number).replace(/\{laskuttaja\}/g, inv.sender.name || '')
    .replace(/\{asiakas\}/g, inv.customer.name || '').replace(/\{erapaiva\}/g, INV.dateFi(inv.due))
    .replace(/\{summa\}/g, INV.money(t.gross, inv.sender.currency)).replace(/\{viite\}/g, inv.reference)
    .replace(/\{virtuaaliviivakoodi\}/g, vcode);
  return { subject: rep(cfg.mailSubject), body: rep(cfg.mailBody) };
}
function mailtoHref(inv) {
  const [to, ...cc] = inv.emails || [];
  const { subject, body } = mailTexts(inv);
  const q = [];
  if (cc.length) q.push('cc=' + encodeURIComponent(cc.join(',')));
  q.push('subject=' + encodeURIComponent(subject));
  q.push('body=' + encodeURIComponent(body));
  return 'mailto:' + encodeURIComponent(to || '') + '?' + q.join('&');
}

/* ===== Esikatselu ja tallennus ===== */
async function makePdf() {
  const b = currentBiller();
  if (DATE_IDS.map(normalizeD).includes(null)) { status('Tarkista päivämäärä (muoto pp.kk.vvvv).', 'err'); return null; }
  const inv = buildInvoice(b ? await logoFor(b) : '');
  const err = validate(inv);
  if (err) { status(err, 'err'); return null; }
  const doc = INV.buildPdf(inv, pdfOpts());
  return { inv, doc, blob: doc.output('blob'), name: fileNameFor(inv) };
}
function openBlob(blob) {
  const url = URL.createObjectURL(blob);
  if (isTouch()) window.open(url, '_blank');
  else { $('previewFrame').src = url; if (!$('previewDialog').open) $('previewDialog').showModal(); }
  setTimeout(() => URL.revokeObjectURL(url), 120000);
}
$('btnPreview').onclick = async () => {
  try { const r = await makePdf(); if (r) { openBlob(r.blob); status(''); } }
  catch (e) { status('PDF:n luonti epäonnistui: ' + e.message, 'err'); }
};
$('btnClosePreview').onclick = () => { $('previewDialog').close(); $('previewFrame').src = 'about:blank'; };
$('btnSave').onclick = async () => {
  let r;
  try { r = await makePdf(); } catch (e) { status('PDF:n luonti epäonnistui: ' + e.message, 'err'); return; }
  if (!r) return;
  const b = currentBiller(), n = numberPart(r.inv.number, b);
  if (ST.mode === 'folder') {
    if (!READY) { status('Valitse ensin Laskutus-kansio (Rekisteri-välilehti).', 'err'); return; }
    try {
      if ((await ST.permission(true)) !== 'granted') { status('Kansioon ei annettu kirjoitusoikeutta.', 'err'); return; }
      const path = outFolderFor(r.inv) + '/' + r.name;
      if (await ST.exists(path) && !confirm(`Tiedosto ${r.name} on jo olemassa. Korvataanko?`)) return;
      status('Tallennetaan…', 'work');
      await ST.writeFile(path, r.blob);
      await recordInvoice(r, b, n, path);
      LAST = { ...r, path };
      showDone(`Lasku ${r.inv.number} tallennettu`, `${ST.folderName()}/${path} – OneDrive synkronoi sen automaattisesti.`);
      status('');
    } catch (e) { status('Tallennus epäonnistui: ' + e.message, 'err'); }
    return;
  }
  LAST = { ...r, path: '' };
  const file = new File([r.blob], r.name, { type: 'application/pdf' });
  const folder = outFolderFor(r.inv);
  let shared = false;
  if (ST.canShareFile(file)) {
    try { await ST.share(file, r.name, ''); shared = true; }
    catch (e) { if (e.name === 'AbortError') { status('Tallennus peruttiin.', ''); return; } ST.download(r.blob, r.name); }
  } else ST.download(r.blob, r.name);
  await recordInvoice(r, b, n, '');
  showDone(`Lasku ${r.inv.number} luotu`, shared ? `Jos valitsit OneDriven, tallenna kansioon Laskutus/${folder}.`
    : `PDF ladattiin laitteelle. Siirrä se OneDriveen kansioon Laskutus/${folder}.`);
  status('');
};
async function recordInvoice(r, b, n, path, save = true) {
  const key = billerKey(b);
  if (n) STATE.next[key] = Math.max(Number(STATE.next[key]) || 0, n + 1);
  STATE.log.push({ nro: r.inv.number, pvm: r.inv.date, erapaiva: r.inv.due, asiakas: r.inv.customer.name,
    summa: INV.totals(r.inv.lines).gross, laskuttaja: b ? b.name : '', tyyppi: r.inv.kind || 'normal', tiedosto: path || r.name });
  if (!save) return;
  try { await saveState(); } catch (e) { console.warn('Tilan tallennus epäonnistui', e); }
  if (ST.mode === 'folder') refreshArchive().catch(() => {}); else renderLocalArchive();
}

/* ===== Valmis lasku ===== */
function showDone(title, text) {
  $('doneTitle').textContent = '✓ ' + title;
  $('doneText').textContent = text;
  const f = LAST ? new File([LAST.blob], LAST.name, { type: 'application/pdf' }) : null;
  $('btnShare').hidden = !(f && ST.canShareFile(f));
  $('doneCard').hidden = false;
  $('doneCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function copyText(t) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(t);
  const ta = document.createElement('textarea');
  ta.value = t; document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); } finally { ta.remove(); }
  return Promise.resolve();
}
async function sharePdf(item, statusFn = status) {
  const addr = (item.inv.emails || []).join('; ');
  if (addr) copyText(addr).catch(() => {});
  const { subject, body } = mailTexts(item.inv);
  const file = new File([item.blob], item.name, { type: 'application/pdf' });
  try { await ST.share(file, subject, body); statusFn(addr ? `Vastaanottajat kopioitu leikepöydälle: ${addr}` : '', 'ok'); }
  catch (e) { if (e.name !== 'AbortError') statusFn('Jako epäonnistui: ' + e.message, 'err'); }
}
$('btnShare').onclick = () => { if (LAST) sharePdf(LAST); };
$('btnMail').onclick = () => {
  if (!LAST) return;
  location.href = mailtoHref(LAST.inv);
  status(LAST.path ? `Liitä viestiin tiedosto ${LAST.name} (OneDrive › ${ST.folderName()}/${LAST.path.split('/').slice(0, -1).join('/')}).`
    : `Liitä viestiin tiedosto ${LAST.name}.`, 'ok');
};
$('btnCopyAddr').onclick = async () => {
  if (!LAST) return;
  const addr = LAST.inv.emails.join('; ');
  if (!addr) { status('Laskulla ei ole sähköpostiosoitteita.', 'err'); return; }
  await copyText(addr).catch(() => {});
  status('Kopioitu: ' + addr, 'ok');
};
$('btnOpenPdf').onclick = () => { if (LAST) openBlob(LAST.blob); };
$('btnNew').onclick = async () => {
  LAST = null;
  $('doneCard').hidden = true;
  if (isOneOff()) setOneOff(false);
  clearCustomer();
  setD('toimituspvm', '');
  setD('laskupvm', INV.today());
  $('vapaateksti').value = '';
  ROWS = [];
  addRow();
  await applyBiller();
  status('');
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

/* ===== Kansio (tietokone) ===== */
async function connectFolder() {
  READY = false;
  if (!ST.dir) { showSetup('pick'); return; }
  if ((await ST.permission(false)) !== 'granted') { showSetup('reconnect'); return; }
  READY = true;
  $('folderName').textContent = ST.folderName();
  await listRegistryFiles();
  await loadState();
  await loadRegistryFromFolder();
  refreshArchive().catch(() => {});
}
async function listRegistryFiles() {
  const files = (await ST.list('')).filter(e => e.kind === 'file' && /\.xls[xm]$/i.test(e.name) && !e.name.startsWith('~$'));
  const sel = $('regFile');
  sel.innerHTML = files.length ? files.map(f => `<option>${esc(f.name)}</option>`).join('') : '<option value="">– kansiossa ei ole Excel-tiedostoja –</option>';
  if (files.some(f => f.name === cfg.regFile)) sel.value = cfg.regFile;
  else if (files.length) sel.value = files[0].name;
  return files;
}
async function loadRegistryFromFolder() {
  const name = $('regFile').value;
  if (!name) { showSetup('noreg'); return; }
  try {
    const f = await ST.readFile(name);
    setRegistry(parseWorkbook(await f.arrayBuffer(), `${ST.folderName()}/${name}`));
    if (cfg.regFile !== name) { cfg.regFile = name; CFG.save(); }
    hideSetup();
    status('Rekisteri luettu.', 'ok');
  } catch (e) {
    status(e.name === 'NotReadableError' ? 'Rekisteri on auki toisessa ohjelmassa tai OneDrive synkronoi sitä – yritä hetken päästä.'
      : 'Rekisterin luku epäonnistui: ' + e.message, 'err');
  }
}
$('btnPickFolder').onclick = async () => {
  try { await ST.pickFolder(); await connectFolder(); }
  catch (e) { if (e.name !== 'AbortError') status('Kansion valinta epäonnistui: ' + e.message, 'err'); }
};
$('btnReloadReg').onclick = async () => { if (!READY) { await reconnect(); return; } await loadRegistryFromFolder(); await suggestNumber(); };
$('regFile').onchange = () => loadRegistryFromFolder();
async function reconnect() {
  try { if ((await ST.permission(true)) === 'granted') await connectFolder(); else status('Kansion käyttöoikeutta ei annettu.', 'err'); }
  catch (e) { status(e.message, 'err'); }
}

/* ===== Rekisteri tiedostona (puhelin) ===== */
$('regInput').onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    setRegistry(parseWorkbook(await f.arrayBuffer(), f.name));
    $('fileName').textContent = f.name;
    hideSetup();
    status('Rekisteri luettu ja tallennettu tälle laitteelle.', 'ok');
  } catch (err) { status('Rekisterin luku epäonnistui: ' + err.message, 'err'); }
  e.target.value = '';
};

/* ===== Käyttöönottokortti ===== */
function showSetup(kind) {
  const t = $('setupText'), b = $('setupBtns');
  const go = '<button type="button" class="btn ghost" data-go="rekisteriView">Rekisteri-välilehdelle</button>';
  if (kind === 'pick') {
    t.innerHTML = '<b>Aloitus:</b> valitse tietokoneen OneDrive-kansiosta <b>Laskutus</b>-kansio, jossa rekisteri-Excel on.';
    b.innerHTML = '<button type="button" class="btn" data-act="pick">Valitse Laskutus-kansio</button>';
  } else if (kind === 'reconnect') {
    t.innerHTML = `Selain pyytää vahvistuksen kansion <b>${esc(ST.folderName())}</b> käyttöön.`;
    b.innerHTML = '<button type="button" class="btn" data-act="reconnect">Salli kansion käyttö</button>';
  } else if (kind === 'noreg') {
    t.innerHTML = 'Valitusta kansiosta ei löytynyt rekisteri-Exceliä. Valitse kansio, jossa <b>Laskutus-rekisteri.xlsx</b> on.';
    b.innerHTML = '<button type="button" class="btn" data-act="pick">Valitse toinen kansio</button>';
  } else if (kind === 'file') {
    t.innerHTML = '<b>Aloitus:</b> valitse rekisteri-Excel OneDrivesta. Rekisteri muistetaan tällä laitteella.';
    b.innerHTML = '<label class="btn file-btn">Valitse rekisteri-Excel<input type="file" accept=".xlsx,.xlsm" data-act="file" hidden></label>' + go;
  }
  $('setupCard').hidden = false;
  $('headState').textContent = kind === 'reconnect' ? 'Kansion käyttö odottaa vahvistusta' : 'Rekisteriä ei ole ladattu';
}
function hideSetup() { $('setupCard').hidden = true; }
$('setupCard').addEventListener('click', async (e) => {
  const act = e.target.dataset.act, go = e.target.dataset.go;
  if (act === 'pick') $('btnPickFolder').click();
  if (act === 'reconnect') await reconnect();
  if (go) showView(go);
});
$('setupCard').addEventListener('change', (e) => { if (e.target.dataset.act === 'file') $('regInput').onchange(e); });

/* ===== Arkisto ===== */
async function refreshArchive() {
  const ul = $('archiveList'), ys = $('archiveYear');
  if (ST.mode !== 'folder') { renderLocalArchive(); return; }
  if (!READY) { ul.innerHTML = '<li class="muted">Valitse ensin Laskutus-kansio.</li>'; return; }
  let folder = cfg.outFolder || 'Laskut';
  if (cfg.yearFolders) {
    const years = (await ST.list(folder)).filter(e => e.kind === 'directory' && /^\d{4}$/.test(e.name)).map(e => e.name).sort().reverse();
    const cur = String(new Date().getFullYear());
    if (!years.includes(cur)) years.unshift(cur);
    const keep = ys.value && years.includes(ys.value) ? ys.value : years[0];
    ys.innerHTML = years.map(y => `<option>${y}</option>`).join('');
    ys.value = keep; ys.hidden = false;
    folder += '/' + keep;
  } else ys.hidden = true;
  const files = [];
  const walk = async (f, prefix, depth) => {
    for (const e of await ST.list(f)) {
      if (e.kind === 'directory' && depth < 2) { await walk(f + '/' + e.name, prefix + e.name + ' / ', depth + 1); continue; }
      if (e.kind !== 'file' || !/\.pdf$/i.test(e.name)) continue;
      const fl = await e.handle.getFile();
      files.push({ name: prefix + e.name, handle: e.handle, mod: fl.lastModified });
    }
  };
  await walk(folder, '', 0);
  files.sort((a, b) => b.mod - a.mod);
  ul.innerHTML = files.length
    ? files.map((f, i) => `<li><button type="button" data-f="${i}">${esc(f.name)}</button><span class="muted small">${INV.dateFi(INV.iso(new Date(f.mod)))}</span></li>`).join('')
    : `<li class="muted">Kansiossa ${esc(folder)} ei ole laskuja.</li>`;
  ul.onclick = async (e) => { const i = e.target.dataset.f; if (i !== undefined) openBlob(await files[i].handle.getFile()); };
}
$('archiveYear').onchange = () => refreshArchive();
function renderLocalArchive() {
  const ul = $('archiveList');
  $('archiveYear').hidden = true;
  const log = (STATE.log || []).slice().reverse();
  ul.innerHTML = '<li class="muted small">Puhelimella tehdyt laskut löytyvät OneDrivesta. Alla tällä laitteella luodut:</li>' +
    (log.length ? log.map(l => `<li><span>${l.tyyppi === 'self' ? 'Itselaskutus ' : ''}${esc(l.nro)} · ${esc(l.asiakas)}</span>
      <span class="muted small">${INV.dateFi(l.pvm)} · ${INV.money(l.summa)}</span></li>`).join('') : '<li class="muted">Ei laskuja.</li>');
}

/* ===== Asetukset ===== */
const SET_MAP = {
  cfgRegFile: 'regFile', cfgOutFolder: 'outFolder', cfgYearFolders: 'yearFolders', cfgFilePattern: 'filePattern',
  cfgMailSubject: 'mailSubject', cfgMailBody: 'mailBody', cfgPdfColor: 'pdfColor', cfgBarcode: 'barcode', cfgVatRates: 'vatRates',
  cfgFeatSelf: 'featSelf', cfgFeatRoad: 'featRoad', cfgFeatDrain: 'featDrain', cfgFeatLetter: 'featLetter', cfgSelfMailSubject: 'selfMailSubject', cfgSelfMailBody: 'selfMailBody'
};
function syncStyleUi() { $('cfgPdfColor').disabled = !$('cfgStyleColor').checked; $('selfMailSettings').hidden = !$('cfgFeatSelf').checked; }
function fillSettings() {
  for (const [id, key] of Object.entries(SET_MAP)) {
    const el = $(id);
    if (el.type === 'checkbox') el.checked = cfg[key] !== false && !!cfg[key]; else el.value = cfg[key] ?? '';
  }
  $('cfgStyleBw').checked = cfg.pdfStyle !== 'color';
  $('cfgStyleColor').checked = cfg.pdfStyle === 'color';
  syncStyleUi();
  $('cfgRegFile').closest('label').hidden = ST.mode !== 'folder';
  const own = !!localStorage.getItem(LOGO_KEY);
  $('logoInfo').textContent = own ? 'Laskuilla käytetään tällä laitteella valittua logoa.'
    : (ST.mode === 'folder' ? 'Logo luetaan Laskutus-kansiosta Laskuttajarekisterin kohdasta "Logo tiedostonimi". Voit myös valita logon tälle laitteelle.'
      : 'Valitse logo tälle laitteelle (PNG tai JPG). Ilman logoa laskuttajan nimi näkyy otsikkona.');
  $('btnLogoClear').hidden = !own;
}
function readSettings() {
  for (const [id, key] of Object.entries(SET_MAP)) { const el = $(id); cfg[key] = el.type === 'checkbox' ? el.checked : el.value.trim(); }
  cfg.pdfStyle = $('cfgStyleColor').checked ? 'color' : 'bw';
  cfg.outFolder = (cfg.outFolder || 'Laskut').replace(/^\/+|\/+$/g, '');
  if (!cfg.filePattern.includes('{nro}')) cfg.filePattern = 'Lasku_{nro}_' + cfg.filePattern;
  cfg.vatRates = vatList().map(v => String(v).replace('.', ',')).join('; ');
  CFG.save();
}
function applyFeatures() {
  $('tabSelf').hidden = !cfg.featSelf;
  $('tabRoad').hidden = !cfg.featRoad;
  $('tabDrain').hidden = !cfg.featDrain;
  $('tabLetter').hidden = !cfg.featLetter;
  const act = document.querySelector('.view.active');
  if (act && ((act.id === 'selfView' && !cfg.featSelf) || (act.id === 'roadView' && !cfg.featRoad) || (act.id === 'drainView' && !cfg.featDrain) || (act.id === 'letterView' && !cfg.featLetter))) showView('laskuView');
}
$('cfgStyleBw').onchange = syncStyleUi;
$('cfgStyleColor').onchange = syncStyleUi;
$('cfgFeatSelf').onchange = syncStyleUi;
$('btnSettings').onclick = () => { fillSettings(); $('settingsDialog').showModal(); };
$('btnCloseSettings').onclick = () => $('settingsDialog').close();
$('btnSaveCfg').onclick = async () => {
  const oldReg = cfg.regFile;
  readSettings();
  $('settingsDialog').close();
  applyFeatures();
  renderRows();
  fillRegistry();
  status('Asetukset tallennettu.', 'ok');
  if (ST.mode === 'folder' && READY) {
    if (oldReg !== cfg.regFile) { await listRegistryFiles(); await loadRegistryFromFolder(); }
    await suggestNumber();
    refreshArchive().catch(() => {});
  }
};
$('btnResetCfg').onclick = () => { if (!confirm('Palautetaanko oletusasetukset?')) return; CFG.reset(); fillSettings(); };
$('logoInput').onchange = (e) => {
  const f = e.target.files[0];
  if (!f) return;
  if (f.size > 600 * 1024) { alert('Logo on liian suuri (max 600 kt). Pienennä kuvaa.'); return; }
  const r = new FileReader();
  r.onload = () => { try { localStorage.setItem(LOGO_KEY, r.result); fillSettings(); } catch (_) { alert('Logon tallennus epäonnistui (tila täynnä).'); } };
  r.readAsDataURL(f);
  e.target.value = '';
};
$('btnLogoClear').onclick = () => { localStorage.removeItem(LOGO_KEY); fillSettings(); };

/* ===== Välilehdet ja käynnistys ===== */
function showView(id) {
  document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x.dataset.view === id));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === id));
  if (id === 'arkistoView') refreshArchive().catch(() => {});
  if ((id === 'selfView' || id === 'roadView' || id === 'drainView') && typeof BATCH !== 'undefined') BATCH.refresh();
  if (id === 'letterView' && typeof LETTER !== 'undefined') LETTER.refresh();
}
document.querySelectorAll('.tab').forEach(t => { t.onclick = () => showView(t.dataset.view); });
$('btnAddRow').onclick = () => { addRow(); const ins = $('rivit').querySelectorAll('input[data-f="desc"]'); if (ins.length) ins[ins.length - 1].focus(); };
$('laskuttaja').onchange = () => { ROWS.forEach(r => { if (r.product === '') r.vat = defaultVat(); }); renderRows(); applyBiller(); };
$('maksuehto').oninput = updateDue;
$('laskunro').oninput = updateRef;
async function startApp() {
  if (typeof XLSX === 'undefined' || !window.jspdf) status('Ohjelmakirjastoja ei saatu ladattua. Tarkista verkkoyhteys ja päivitä sivu.', 'err');
  initDateFields();
  setD('laskupvm', INV.today());
  $('maksuehto').value = 14;
  updateDue();
  addRow();
  applyFeatures();
  $('folderMode').hidden = ST.mode !== 'folder';
  $('fileMode').hidden = ST.mode !== 'file';
  if (ST.mode === 'folder') {
    await ST.restore();
    if (ST.dir) $('folderName').textContent = ST.folderName();
    await connectFolder();
  } else {
    await loadState();
    try {
      const cached = JSON.parse(localStorage.getItem(REG_CACHE) || 'null');
      if (cached && (cached.customers || cached.billers)) {
        REG = { self: [], road: null, drain: null, letters: [], ...cached };
        $('fileName').textContent = cached.source;
        fillRegistry();
      } else showSetup('file');
    } catch (_) { showSetup('file'); }
    renderLocalArchive();
  }
}
window.addEventListener('DOMContentLoaded', () => startApp());

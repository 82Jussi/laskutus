/* app.js – Laskutus, käyttöliittymä (rekisteröinnitön OneDrive-malli) */

const $ = (id) => document.getElementById(id);
const cfg = CFG.data;

const REG_CACHE = 'laskutus.reg.v1';       // puhelimen välimuisti rekisteristä
const STATE_LOCAL = 'laskutus.state.v1';   // puhelimen laskunumerot
const LOGO_KEY = 'laskutus.logo.v1';       // asetuksista valittu logo (dataURL)
const STATE_FILE = 'laskutus-tila.json';   // tietokoneella Laskutus-kansiossa

let REG = { customers: [], products: [], billers: [], source: '', loaded: '' };
let ROWS = [];
let STATE = { next: {}, log: [] };
let LAST = null;           // viimeksi tallennettu lasku {inv, blob, name, path}
let READY = false;         // kansio + rekisteri käytettävissä

/* ===================================================================== */
/* Apurit                                                                */
/* ===================================================================== */
function status(msg, kind = '') {
  const el = $('status');
  el.className = 'status ' + kind;
  el.textContent = msg || '';
}
const norm = (s) => String(s ?? '').toLowerCase().trim()
  .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/å/g, 'a').replace(/[\s_.\-:,()%]/g, '');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const str = (v) => String(v ?? '').trim();

function pick(row, names) {
  for (const n of names) for (const k of Object.keys(row)) if (norm(k) === norm(n)) return row[k];
  return '';
}
function num(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  return Number(String(v).replace(/\s|€|%/g, '').replace(',', '.')) || 0;
}
function splitEmails(v) {
  return String(v || '').split(/[;,]/).map(s => s.trim()).filter(Boolean);
}
function safeName(s) {
  return String(s || '').replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
}
function zipFi(v, country) {
  const s = str(v);
  if (/^\d{1,4}$/.test(s) && (!country || /suomi|finland/i.test(country))) return s.padStart(5, '0');
  return s;
}
function nowFi() {
  return new Date().toLocaleString('fi-FI', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
}
const isTouch = () => matchMedia('(pointer:coarse)').matches;
function pdfOpts() {
  return { style: cfg.pdfStyle, color: cfg.pdfColor, barcode: cfg.barcode !== false };
}

/* ===================================================================== */
/* Päivämäärät: kentät muodossa pp.kk.vvvv, sisäisesti ISO               */
/* ===================================================================== */
const DATE_IDS = ['laskupvm', 'erapvm', 'toimituspvm'];

/* ISO tai '' (tyhjä tai virheellinen) */
function getD(id) {
  const v = INV.parseFi($(id).value);
  return v || '';
}
function setD(id, iso) {
  $(id).value = iso ? INV.dateFi(iso) : '';
  $(id).classList.remove('invalid');
  const p = document.querySelector(`.dpick[data-for="${id}"]`);
  if (p) p.value = iso || '';
}
/* Tarkistaa ja muotoilee kentän; palauttaa ISO, '' tai null (virhe) */
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
}
function initDateFields() {
  DATE_IDS.forEach(id => {
    const el = $(id);
    el.addEventListener('change', () => {
      if (normalizeD(id) === null) status('Tarkista päivämäärä – muoto pp.kk.vvvv.', 'err');
      else { status(''); onDateChanged(id); }
    });
    el.addEventListener('input', () => el.classList.remove('invalid'));
  });
  document.querySelectorAll('.dpick').forEach(p => {
    p.addEventListener('click', () => {
      p.value = getD(p.dataset.for) || '';
      try { if (p.showPicker) p.showPicker(); } catch (_) { /* puhelin avaa valitsimen itse */ }
    });
    p.addEventListener('change', () => {
      if (!p.value) return;
      setD(p.dataset.for, p.value);
      onDateChanged(p.dataset.for);
    });
  });
}

/* ===================================================================== */
/* Rekisterin luku                                                       */
/* ===================================================================== */
function findSheet(wb, names) {
  return wb.SheetNames.find(n => names.some(m => norm(n).includes(norm(m))));
}
function sheetRows(wb, names) {
  const n = findSheet(wb, names);
  return n ? XLSX.utils.sheet_to_json(wb.Sheets[n], { defval: '', raw: true }) : [];
}

function parseBillers(wb) {
  const sn = findSheet(wb, ['laskuttajarekisteri', 'laskuttaja', 'lahettaja']);
  if (!sn) return [];
  const a = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '', raw: true });
  if (a.length < 2) return [];
  const rowOf = {};
  for (let r = 1; r < a.length; r++) rowOf[norm(a[r][0])] = a[r];
  const g = (c, ...names) => {
    for (const n of names) { const r = rowOf[norm(n)]; if (r && str(r[c]) !== '') return str(r[c]); }
    return '';
  };
  const width = Math.max(...a.map(r => r.length));
  const out = [];
  for (let c = 1; c < width; c++) {
    const name = g(c, 'Saaja', 'Nimi');
    if (!name) continue;
    const interest = g(c, 'Viivästyskorko (%)', 'Viivästyskorko');
    out.push({
      label: str(a[0][c]) || `Laskuttaja ${c}`,
      name,
      sellerNo: g(c, 'Myyjänro'),
      addr: g(c, 'Lähiosoite', 'Osoite'),
      zip: zipFi(g(c, 'Postinumero'), g(c, 'Maa')),
      city: g(c, 'Postitoimipaikka'),
      country: g(c, 'Maa'),
      phone: g(c, 'Puhelin 1', 'GSM 1', 'Puhelin'),
      phone2: g(c, 'Puhelin 2', 'GSM 2'),
      email: g(c, 'Sähköposti'),
      web: g(c, 'Internet', 'Verkkosivu'),
      bank: g(c, 'Pankki 1', 'Pankki'),
      iban: g(c, 'IBAN 1', 'IBAN'),
      bic: g(c, 'BIC 1', 'BIC'),
      bank2: g(c, 'Pankki 2'),
      iban2: g(c, 'IBAN 2'),
      bic2: g(c, 'BIC 2'),
      bid: g(c, 'Y-tunnus'),
      vatId: g(c, 'ALV-numero', 'ALV-tunniste'),
      tradeNo: g(c, 'Kaupparek. nro', 'Kaupparekisterinumero'),
      terms: num(g(c, 'Maksuehto (pv)', 'Maksuehto')),
      interest: interest ? (/%/.test(interest) ? interest : interest.replace('.', ',') + ' %') : '',
      nextNumber: num(g(c, 'Seuraava laskunumero', 'Laskunumero')),
      prefix: g(c, 'Laskunumeron etuliite'),
      currency: g(c, 'Oletusvaluutta') || 'EUR',
      vat: g(c, 'Oletus-ALV (%)') === '' ? 25.5 : num(g(c, 'Oletus-ALV (%)')),
      note: g(c, 'Laskun vakioteksti'),
      logo: g(c, 'Logo tiedostonimi')
    });
  }
  return out;
}

function parseWorkbook(buf, source) {
  const wb = XLSX.read(buf, { type: 'array' });

  const customers = sheetRows(wb, ['asiakasrekisteri', 'asiakkaat']).map(r => {
    const country = str(pick(r, ['Maa']));
    const mails = splitEmails(pick(r, ['Laskutussähköposti']));
    return {
      id: str(pick(r, ['Asiakasnumero', 'Asiakasnro'])),
      name: str(pick(r, ['Nimi'])),
      addr: str(pick(r, ['Osoite', 'Lähiosoite'])),
      zip: zipFi(pick(r, ['Postinumero']), country),
      city: str(pick(r, ['Postitoimipaikka'])),
      country,
      bid: str(pick(r, ['Y-tunnus'])),
      email: str(pick(r, ['Sähköposti'])),
      terms: num(pick(r, ['Maksuehto', 'Maksuehto (pv)'])),
      recipient: str(pick(r, ['Laskutusvastaanottaja'])),
      mails,
      einv: str(pick(r, ['Verkkolaskuosoite'])),
      operator: str(pick(r, ['Välittäjä']))
    };
  }).filter(c => c.name);

  const products = sheetRows(wb, ['tuoterekisteri', 'tuotteet']).map(r => ({
    code: str(pick(r, ['Tuotekoodi', 'Koodi'])),
    name: str(pick(r, ['Tuote', 'Nimi'])),
    unit: str(pick(r, ['Yksikkö'])),
    price: num(pick(r, ['Hinta, alv 0%', 'Hinta alv 0%', 'Hinta'])),
    vat: pick(r, ['ALV', 'ALV %']) === '' ? null : num(pick(r, ['ALV', 'ALV %']))
  })).filter(p => p.name);

  const billers = parseBillers(wb);
  if (!customers.length && !products.length && !billers.length) {
    throw new Error('Tiedostosta ei löytynyt Asiakas-, Tuote- tai Laskuttajarekisteriä.');
  }
  return { customers, products, billers, source, loaded: nowFi() };
}

function setRegistry(reg) {
  REG = reg;
  if (ST.mode === 'file') {
    try { localStorage.setItem(REG_CACHE, JSON.stringify(reg)); } catch (_) {}
  }
  fillRegistry();
}

/* ===================================================================== */
/* Laskunumerot                                                          */
/* ===================================================================== */
async function loadState() {
  if (ST.mode === 'folder') {
    STATE = (await ST.readJson(STATE_FILE)) || { next: {}, log: [] };
  } else {
    try { STATE = JSON.parse(localStorage.getItem(STATE_LOCAL) || 'null') || { next: {}, log: [] }; }
    catch (_) { STATE = { next: {}, log: [] }; }
  }
  STATE.next = STATE.next || {};
  STATE.log = STATE.log || [];
}

async function saveState() {
  STATE.updated = new Date().toISOString();
  if (STATE.log.length > 500) STATE.log = STATE.log.slice(-500);
  if (ST.mode === 'folder') await ST.writeJson(STATE_FILE, STATE);
  else localStorage.setItem(STATE_LOCAL, JSON.stringify(STATE));
}

function currentBiller() {
  return REG.billers[Number($('laskuttaja').value) || 0] || null;
}
const billerKey = (b) => b ? (b.sellerNo || b.name) : '';

/* Muuttaa tiedostonimimallin säännölliseksi lausekkeeksi, josta saadaan laskunumero */
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

/* Tietokoneella: suurin olemassa oleva laskunumero laskukansiosta (myös puhelimella tehdyt) */
async function scanMaxNumber(b) {
  if (ST.mode !== 'folder' || !READY) return 0;
  // jos usealla laskuttajalla on sama etuliite, laskuja ei voi erottaa tiedostonimestä
  if (REG.billers.filter(x => (x.prefix || '') === (b.prefix || '')).length > 1) return 0;
  const rx = patternRegex(b.prefix || '');
  const y = new Date().getFullYear();
  const folders = cfg.yearFolders ? [`${cfg.outFolder}/${y}`, `${cfg.outFolder}/${y - 1}`] : [cfg.outFolder];
  let max = 0;
  for (const f of folders) {
    for (const e of await ST.list(f)) {
      if (e.kind !== 'file') continue;
      const m = e.name.match(rx);
      if (m) max = Math.max(max, Number(m[1]));
    }
  }
  return max;
}

async function suggestNumber() {
  const b = currentBiller();
  if (!b) return;
  const fromState = Number(STATE.next[billerKey(b)]) || 0;
  const scanned = await scanMaxNumber(b);
  const n = Math.max(b.nextNumber || 1, fromState, scanned + 1);
  $('laskunro').value = (b.prefix || '') + n;
  updateRef();
  $('numberHint').textContent = ST.mode === 'file'
    ? 'Puhelin ehdottaa numeroa tällä laitteella tehtyjen laskujen perusteella – tarkista, jos olet laskuttanut myös tietokoneella.'
    : '';
}

function numberPart(nro, b) {
  let s = String(nro || '');
  if (b && b.prefix && s.startsWith(b.prefix)) s = s.slice(b.prefix.length);
  const m = s.match(/(\d+)\s*$/);
  return m ? Number(m[1]) : 0;
}

/* ===================================================================== */
/* Rekisterin näyttö                                                     */
/* ===================================================================== */
function fillRegistry() {
  // laskuttajat
  const bs = $('laskuttaja');
  bs.innerHTML = REG.billers.map((b, i) =>
    `<option value="${i}">${esc(b.name)}${b.sellerNo ? ' (' + esc(b.sellerNo) + ')' : ''}</option>`).join('');
  const lastIdx = REG.billers.findIndex(b => billerKey(b) === cfg.lastBiller);
  bs.value = String(lastIdx >= 0 ? lastIdx : 0);
  $('billerWrap').hidden = REG.billers.length <= 1;

  // asiakkaat
  const cs = $('asiakas');
  const prev = cs.value;
  cs.innerHTML = '<option value="">– valitse asiakas –</option>' + REG.customers.map((c, i) =>
    `<option value="${i}">${c.id ? esc(c.id) + ' · ' : ''}${esc(c.name)}</option>`).join('');
  if (prev && REG.customers[prev]) cs.value = prev;

  // yhteenveto
  const has = REG.customers.length || REG.products.length || REG.billers.length;
  $('regSummary').innerHTML = has
    ? `<span class="pill">${REG.customers.length} asiakasta</span>` +
      `<span class="pill">${REG.products.length} tuotetta</span>` +
      `<span class="pill">${REG.billers.length} laskuttaja${REG.billers.length === 1 ? '' : 'a'}</span>` +
      `<div class="muted">${esc(REG.source)} · luettu ${esc(REG.loaded)}</div>` +
      (REG.billers.length ? '' : '<div class="status err">Laskuttajarekisteri puuttuu tai on tyhjä.</div>')
    : 'Rekisteriä ei ole ladattu.';
  $('headState').textContent = has ? `Rekisteri luettu ${REG.loaded}` : 'Rekisteriä ei ole ladattu';

  renderRows();
  applyBiller();
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

function currentCustomer() {
  const v = $('asiakas').value;
  return v === '' ? null : REG.customers[Number(v)];
}

function onCustomerChange() {
  const c = currentCustomer();
  const b = currentBiller();
  if (!c) { $('asiakasTiedot').textContent = ''; $('emails').value = ''; return; }
  const mails = c.mails.length ? c.mails : splitEmails(c.email);
  $('emails').value = mails.join('; ');
  $('asiakasTiedot').textContent = [
    c.recipient, c.addr, [c.zip, c.city].filter(Boolean).join(' '),
    c.bid ? 'Y-tunnus ' + c.bid : '', c.einv ? 'Verkkolasku ' + c.einv : ''
  ].filter(Boolean).join(' · ');
  $('maksuehto').value = c.terms || (b && b.terms) || 14;
  updateDue();
}

/* ===================================================================== */
/* Laskurivit                                                            */
/* ===================================================================== */
function defaultVat() {
  const b = currentBiller(), list = vatList();
  return b && list.includes(b.vat) ? b.vat : list[0];
}
const fmtVat = (v) => String(v).replace('.', ',') + ' %';
function vatOptions(cur) {
  const list = vatList().slice();
  if (cur !== '' && cur !== null && cur !== undefined && !list.includes(Number(cur))) list.push(Number(cur));
  return list.map(v => `<option value="${v}"${Number(cur) === v ? ' selected' : ''}>${fmtVat(v)}</option>`).join('');
}

function addRow(data = {}) {
  ROWS.push({ product: '', desc: '', qty: 1, unit: 'kpl', price: 0, vat: defaultVat(), ...data });
  renderRows();
}

function renderRows() {
  const wrap = $('rivit');
  const prodOpts = REG.products.map((p, j) =>
    `<option value="${j}">${p.code ? esc(p.code) + ' · ' : ''}${esc(p.name)}</option>`).join('');
  wrap.innerHTML = ROWS.map((r, i) => `
    <div class="lrow" data-i="${i}">
      <div class="lrow-top">
        <div class="lcol">
          <select class="psel" data-i="${i}" aria-label="Tuote rekisteristä">
            <option value="">– valitse tuote tai kirjoita vapaa rivi –</option>${prodOpts}
          </select>
          <input data-f="desc" data-i="${i}" value="${esc(r.desc)}" placeholder="Tuote / kuvaus laskulle">
        </div>
        <button type="button" class="del" data-del="${i}" aria-label="Poista rivi" title="Poista rivi">×</button>
      </div>
      <div class="lrow-nums">
        <label>Määrä<input type="number" step="any" inputmode="decimal" data-f="qty" data-i="${i}" value="${r.qty}"></label>
        <label>Yks.<input data-f="unit" data-i="${i}" value="${esc(r.unit)}"></label>
        <label>Hinta, alv 0%<input type="number" step="any" inputmode="decimal" data-f="price" data-i="${i}" value="${r.price}"></label>
        <label>ALV<select data-f="vat" data-i="${i}">${vatOptions(r.vat)}</select></label>
        <div class="ltot" data-tot="${i}">${INV.money(INV.lineTotal(r))}</div>
      </div>
    </div>`).join('');
  ROWS.forEach((r, i) => {
    const sel = wrap.querySelector(`select.psel[data-i="${i}"]`);
    if (sel && r.product !== '' && REG.products[r.product]) sel.value = r.product;
  });
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

$('rivit').addEventListener('change', (e) => {
  if (!e.target.classList.contains('psel')) return;
  const i = Number(e.target.dataset.i), v = e.target.value;
  ROWS[i].product = v;
  if (v !== '') {
    const p = REG.products[Number(v)];
    Object.assign(ROWS[i], {
      desc: p.name, unit: p.unit || 'kpl', price: p.price,
      vat: p.vat === null ? defaultVat() : p.vat
    });
  }
  renderRows();
});

$('rivit').addEventListener('click', (e) => {
  const d = e.target.dataset.del;
  if (d === undefined) return;
  ROWS.splice(Number(d), 1);
  if (!ROWS.length) addRow(); else renderRows();
});

function calc() {
  const b = currentBiller();
  const cur = b && b.currency;
  const t = INV.totals(ROWS);
  $('tNetto').textContent = INV.money(t.net, cur);
  $('tAlv').textContent = INV.money(t.vat, cur);
  $('tBrutto').textContent = INV.money(t.gross, cur);
}

/* ===================================================================== */
/* Laskun tiedot                                                         */
/* ===================================================================== */
function updateDue() {
  setD('erapvm', INV.addDays(getD('laskupvm') || INV.today(), num($('maksuehto').value)));
}
function updateRef() {
  $('viite').value = INV.reference($('laskunro').value || '1');
}

async function logoFor(b) {
  const own = localStorage.getItem(LOGO_KEY);
  if (own) return own;
  if (ST.mode === 'folder' && READY && b.logo) {
    try {
      const f = await ST.readFile(b.logo);
      return await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result); r.onerror = () => rej(r.error);
        r.readAsDataURL(f);
      });
    } catch (_) { console.warn('Logoa ei löytynyt kansiosta:', b.logo); }
  }
  return '';
}

function buildInvoice(logoData = '') {
  const b = currentBiller() || {};
  return {
    number: $('laskunro').value.trim(),
    date: getD('laskupvm') || INV.today(),
    due: getD('erapvm'),
    terms: num($('maksuehto').value),
    reference: $('viite').value,
    deliveryDate: getD('toimituspvm'),
    note: $('vapaateksti').value.trim(),
    sender: { ...b, logoData },
    customer: currentCustomer() || {},
    emails: splitEmails($('emails').value),
    lines: ROWS.filter(r => str(r.desc) || INV.lineTotal(r))
  };
}

function validate(inv) {
  for (const id of DATE_IDS) {
    if (normalizeD(id) === null) return 'Tarkista päivämäärä (muoto pp.kk.vvvv).';
  }
  if (!REG.billers.length) return 'Lataa ensin rekisteri (Laskuttajarekisteri puuttuu).';
  if (!inv.customer.name) return 'Valitse asiakas.';
  if (!inv.lines.length) return 'Lisää vähintään yksi laskurivi.';
  if (!inv.number) return 'Laskunumero puuttuu.';
  if (!inv.due) return 'Eräpäivä puuttuu.';
  return '';
}

function fileNameFor(inv) {
  const t = INV.totals(inv.lines);
  return safeName(
    (cfg.filePattern || 'Lasku_{nro}_{asiakas}.pdf')
      .replace(/\{nro\}/g, inv.number)
      .replace(/\{asiakas\}/g, inv.customer.name)
      .replace(/\{pvm\}/g, inv.date)
      .replace(/\{vuosi\}/g, inv.date.slice(0, 4))
      .replace(/\{summa\}/g, t.gross.toFixed(2))
  ).replace(/\.pdf$/i, '') + '.pdf';
}

function outFolderFor(inv) {
  return (cfg.outFolder || 'Laskut') + (cfg.yearFolders ? '/' + inv.date.slice(0, 4) : '');
}

function mailTexts(inv) {
  const t = INV.totals(inv.lines);
  const vcode = INV.virtualBarcode(inv.sender.iban, t.gross, inv.reference, inv.due, inv.sender.currency);
  const rep = (s) => String(s || '')
    .replace(/\{nro\}/g, inv.number)
    .replace(/\{laskuttaja\}/g, inv.sender.name || '')
    .replace(/\{asiakas\}/g, inv.customer.name || '')
    .replace(/\{erapaiva\}/g, INV.dateFi(inv.due))
    .replace(/\{summa\}/g, INV.money(t.gross, inv.sender.currency))
    .replace(/\{viite\}/g, inv.reference)
    .replace(/\{virtuaaliviivakoodi\}/g, vcode);
  return { subject: rep(cfg.mailSubject), body: rep(cfg.mailBody) };
}

/* ===================================================================== */
/* Esikatselu ja tallennus                                               */
/* ===================================================================== */
async function makePdf() {
  const b = currentBiller();
  const err0 = DATE_IDS.map(normalizeD).includes(null);
  if (err0) { status('Tarkista päivämäärä (muoto pp.kk.vvvv).', 'err'); return null; }
  const inv = buildInvoice(b ? await logoFor(b) : '');
  const err = validate(inv);
  if (err) { status(err, 'err'); return null; }
  const doc = INV.buildPdf(inv, pdfOpts());
  return { inv, doc, blob: doc.output('blob'), name: fileNameFor(inv) };
}

function openBlob(blob) {
  const url = URL.createObjectURL(blob);
  if (isTouch()) {
    window.open(url, '_blank');
  } else {
    $('previewFrame').src = url;
    $('previewDialog').showModal();
  }
  setTimeout(() => URL.revokeObjectURL(url), 120000);
}

$('btnPreview').onclick = async () => {
  try {
    const r = await makePdf();
    if (r) { openBlob(r.blob); status(''); }
  } catch (e) { status('PDF:n luonti epäonnistui: ' + e.message, 'err'); }
};
$('btnClosePreview').onclick = () => { $('previewDialog').close(); $('previewFrame').src = 'about:blank'; };

/* Tallenna lasku:
 *  - tietokone: PDF suoraan OneDriven Laskutus/Laskut/vuosi -kansioon
 *  - puhelin:   jakovalikko (OneDrive / sähköposti); varalla lataus laitteelle */
$('btnSave').onclick = async () => {
  let r;
  try { r = await makePdf(); } catch (e) { status('PDF:n luonti epäonnistui: ' + e.message, 'err'); return; }
  if (!r) return;
  const b = currentBiller();
  const n = numberPart(r.inv.number, b);

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
      showDone(`Lasku ${r.inv.number} tallennettu`,
        `${ST.folderName()}/${path} – OneDrive synkronoi sen automaattisesti.`);
      status('');
    } catch (e) { status('Tallennus epäonnistui: ' + e.message, 'err'); }
    return;
  }

  // puhelin: jako heti (vaatii käyttäjän napautuksen, joten ei odotuksia ennen jakoa)
  LAST = { ...r, path: '' };
  const file = new File([r.blob], r.name, { type: 'application/pdf' });
  const folder = outFolderFor(r.inv);
  let shared = false;
  if (ST.canShareFile(file)) {
    try {
      await ST.share(file, r.name, '');
      shared = true;
    } catch (e) {
      if (e.name === 'AbortError') { status('Tallennus peruttiin.', ''); return; }
      ST.download(r.blob, r.name);
    }
  } else {
    ST.download(r.blob, r.name);
  }
  await recordInvoice(r, b, n, '');
  showDone(`Lasku ${r.inv.number} luotu`,
    shared ? `Jos valitsit OneDriven, tallenna kansioon Laskutus/${folder}.`
           : `PDF ladattiin laitteelle. Siirrä se OneDriveen kansioon Laskutus/${folder}.`);
  status('');
};

async function recordInvoice(r, b, n, path) {
  const key = billerKey(b);
  if (n) STATE.next[key] = Math.max(Number(STATE.next[key]) || 0, n + 1);
  STATE.log.push({
    nro: r.inv.number, pvm: r.inv.date, erapaiva: r.inv.due,
    asiakas: r.inv.customer.name, summa: INV.totals(r.inv.lines).gross,
    laskuttaja: b ? b.name : '', tiedosto: path || r.name
  });
  try { await saveState(); } catch (e) { console.warn('Tilan tallennus epäonnistui', e); }
  if (ST.mode === 'folder') refreshArchive().catch(() => {});
  else renderLocalArchive();
}

/* ===================================================================== */
/* Valmis lasku: jako ja sähköposti                                      */
/* ===================================================================== */
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

/* Jaa PDF: sähköpostiohjelma saa laskun liitteenä. Osoitteet kopioidaan leikepöydälle,
   koska jakovalikko ei välitä vastaanottajia. */
$('btnShare').onclick = async () => {
  if (!LAST) return;
  const addr = LAST.inv.emails.join('; ');
  if (addr) copyText(addr).catch(() => {});
  const { subject, body } = mailTexts(LAST.inv);
  const file = new File([LAST.blob], LAST.name, { type: 'application/pdf' });
  try {
    await ST.share(file, subject, body);
    status(addr ? `Vastaanottajat kopioitu leikepöydälle: ${addr}` : '', 'ok');
  } catch (e) {
    if (e.name !== 'AbortError') status('Jako epäonnistui: ' + e.message, 'err');
  }
};

/* Avaa sähköposti: vastaanottajat, otsikko ja viesti valmiina; PDF liitetään itse */
$('btnMail').onclick = () => {
  if (!LAST) return;
  const [to, ...cc] = LAST.inv.emails;
  const { subject, body } = mailTexts(LAST.inv);
  const q = [];
  if (cc.length) q.push('cc=' + encodeURIComponent(cc.join(',')));
  q.push('subject=' + encodeURIComponent(subject));
  q.push('body=' + encodeURIComponent(body));
  location.href = 'mailto:' + encodeURIComponent(to || '') + '?' + q.join('&');
  status(LAST.path
    ? `Liitä viestiin tiedosto ${LAST.name} (OneDrive › ${ST.folderName()}/${LAST.path.split('/').slice(0, -1).join('/')}).`
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
  $('asiakas').value = '';
  onCustomerChange();
  setD('toimituspvm', '');
  setD('laskupvm', INV.today());
  $('vapaateksti').value = '';
  ROWS = [];
  addRow();
  await applyBiller();
  status('');
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

/* ===================================================================== */
/* Kansio (tietokone)                                                    */
/* ===================================================================== */
async function connectFolder() {
  READY = false;
  if (!ST.dir) { showSetup('pick'); return; }
  const p = await ST.permission(false);
  if (p !== 'granted') { showSetup('reconnect'); return; }
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
  sel.innerHTML = files.length
    ? files.map(f => `<option>${esc(f.name)}</option>`).join('')
    : '<option value="">– kansiossa ei ole Excel-tiedostoja –</option>';
  if (files.some(f => f.name === cfg.regFile)) sel.value = cfg.regFile;
  else if (files.length) { sel.value = files[0].name; }
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
    status(e.name === 'NotReadableError'
      ? 'Rekisteri on auki toisessa ohjelmassa tai OneDrive synkronoi sitä – yritä hetken päästä.'
      : 'Rekisterin luku epäonnistui: ' + e.message, 'err');
  }
}

$('btnPickFolder').onclick = async () => {
  try {
    await ST.pickFolder();
    await connectFolder();
  } catch (e) {
    if (e.name !== 'AbortError') status('Kansion valinta epäonnistui: ' + e.message, 'err');
  }
};
$('btnReloadReg').onclick = async () => {
  if (!READY) { await reconnect(); return; }
  await loadRegistryFromFolder();
  await suggestNumber();
};
$('regFile').onchange = () => loadRegistryFromFolder();

async function reconnect() {
  try {
    if ((await ST.permission(true)) === 'granted') await connectFolder();
    else status('Kansion käyttöoikeutta ei annettu.', 'err');
  } catch (e) { status(e.message, 'err'); }
}

/* ===================================================================== */
/* Rekisteri tiedostona (puhelin)                                        */
/* ===================================================================== */
$('regInput').onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    setRegistry(parseWorkbook(await f.arrayBuffer(), f.name));
    $('fileName').textContent = f.name;
    hideSetup();
    status('Rekisteri luettu ja tallennettu tälle laitteelle.', 'ok');
  } catch (err) {
    status('Rekisterin luku epäonnistui: ' + err.message, 'err');
  }
  e.target.value = '';
};

/* ===================================================================== */
/* Käyttöönottokortti                                                    */
/* ===================================================================== */
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
$('setupCard').addEventListener('change', (e) => {
  if (e.target.dataset.act === 'file') $('regInput').onchange(e);
});

/* ===================================================================== */
/* Arkisto                                                               */
/* ===================================================================== */
async function refreshArchive() {
  const ul = $('archiveList'), ys = $('archiveYear');
  if (ST.mode !== 'folder') { renderLocalArchive(); return; }
  if (!READY) { ul.innerHTML = '<li class="muted">Valitse ensin Laskutus-kansio.</li>'; return; }

  let folder = cfg.outFolder || 'Laskut';
  if (cfg.yearFolders) {
    const years = (await ST.list(folder)).filter(e => e.kind === 'directory' && /^\d{4}$/.test(e.name))
      .map(e => e.name).sort().reverse();
    const cur = String(new Date().getFullYear());
    if (!years.includes(cur)) years.unshift(cur);
    const keep = ys.value && years.includes(ys.value) ? ys.value : years[0];
    ys.innerHTML = years.map(y => `<option>${y}</option>`).join('');
    ys.value = keep;
    ys.hidden = false;
    folder += '/' + keep;
  } else ys.hidden = true;

  const files = [];
  for (const e of await ST.list(folder)) {
    if (e.kind !== 'file' || !/\.pdf$/i.test(e.name)) continue;
    const f = await e.handle.getFile();
    files.push({ name: e.name, handle: e.handle, mod: f.lastModified });
  }
  files.sort((a, b) => b.mod - a.mod);
  ul.innerHTML = files.length
    ? files.map((f, i) => `<li><button type="button" data-f="${i}">${esc(f.name)}</button>
        <span class="muted small">${INV.dateFi(INV.iso(new Date(f.mod)))}</span></li>`).join('')
    : `<li class="muted">Kansiossa ${esc(folder)} ei ole laskuja.</li>`;
  ul.onclick = async (e) => {
    const i = e.target.dataset.f;
    if (i !== undefined) openBlob(await files[i].handle.getFile());
  };
}
$('archiveYear').onchange = () => refreshArchive();

function renderLocalArchive() {
  const ul = $('archiveList');
  $('archiveYear').hidden = true;
  const log = (STATE.log || []).slice().reverse();
  ul.innerHTML = '<li class="muted small">Puhelimella tehdyt laskut löytyvät OneDrivesta. Alla tällä laitteella luodut:</li>' +
    (log.length
      ? log.map(l => `<li><span>${esc(l.nro)} · ${esc(l.asiakas)}</span>
          <span class="muted small">${INV.dateFi(l.pvm)} · ${INV.money(l.summa)}</span></li>`).join('')
      : '<li class="muted">Ei laskuja.</li>');
}

/* ===================================================================== */
/* Asetukset                                                             */
/* ===================================================================== */
const SET_MAP = {
  cfgRegFile: 'regFile', cfgOutFolder: 'outFolder', cfgYearFolders: 'yearFolders',
  cfgFilePattern: 'filePattern', cfgMailSubject: 'mailSubject', cfgMailBody: 'mailBody',
  cfgPdfColor: 'pdfColor', cfgBarcode: 'barcode', cfgVatRates: 'vatRates'
};

function syncStyleUi() {
  $('cfgPdfColor').disabled = !$('cfgStyleColor').checked;
}

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
  $('logoInfo').textContent = own
    ? 'Laskuilla käytetään tällä laitteella valittua logoa.'
    : (ST.mode === 'folder'
      ? 'Logo luetaan Laskutus-kansiosta Laskuttajarekisterin kohdasta "Logo tiedostonimi". Voit myös valita logon tälle laitteelle.'
      : 'Valitse logo tälle laitteelle (PNG tai JPG). Ilman logoa laskuttajan nimi näkyy otsikkona.');
  $('btnLogoClear').hidden = !own;
}

function readSettings() {
  for (const [id, key] of Object.entries(SET_MAP)) {
    const el = $(id);
    cfg[key] = el.type === 'checkbox' ? el.checked : el.value.trim();
  }
  cfg.pdfStyle = $('cfgStyleColor').checked ? 'color' : 'bw';
  cfg.outFolder = (cfg.outFolder || 'Laskut').replace(/^\/+|\/+$/g, '');
  if (!cfg.filePattern.includes('{nro}')) cfg.filePattern = 'Lasku_{nro}_' + cfg.filePattern;
  cfg.vatRates = vatList().map(v => String(v).replace('.', ',')).join('; ');
  CFG.save();
}

$('cfgStyleBw').onchange = syncStyleUi;
$('cfgStyleColor').onchange = syncStyleUi;
$('btnSettings').onclick = () => { fillSettings(); $('settingsDialog').showModal(); };
$('btnCloseSettings').onclick = () => $('settingsDialog').close();
$('btnSaveCfg').onclick = async () => {
  const oldReg = cfg.regFile;
  readSettings();
  $('settingsDialog').close();
  renderRows();
  status('Asetukset tallennettu.', 'ok');
  if (ST.mode === 'folder' && READY) {
    if (oldReg !== cfg.regFile) { await listRegistryFiles(); await loadRegistryFromFolder(); }
    await suggestNumber();
    refreshArchive().catch(() => {});
  }
};
$('btnResetCfg').onclick = () => {
  if (!confirm('Palautetaanko oletusasetukset?')) return;
  CFG.reset();
  fillSettings();
};

$('logoInput').onchange = (e) => {
  const f = e.target.files[0];
  if (!f) return;
  if (f.size > 600 * 1024) { alert('Logo on liian suuri (max 600 kt). Pienennä kuvaa.'); return; }
  const r = new FileReader();
  r.onload = () => {
    try { localStorage.setItem(LOGO_KEY, r.result); fillSettings(); }
    catch (_) { alert('Logon tallennus epäonnistui (tila täynnä).'); }
  };
  r.readAsDataURL(f);
  e.target.value = '';
};
$('btnLogoClear').onclick = () => { localStorage.removeItem(LOGO_KEY); fillSettings(); };

/* ===================================================================== */
/* Välilehdet ja käynnistys                                              */
/* ===================================================================== */
function showView(id) {
  document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x.dataset.view === id));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === id));
  if (id === 'arkistoView') refreshArchive().catch(() => {});
}
document.querySelectorAll('.tab').forEach(t => { t.onclick = () => showView(t.dataset.view); });

$('btnAddRow').onclick = () => addRow();
$('asiakas').onchange = onCustomerChange;
$('laskuttaja').onchange = () => { ROWS.forEach(r => { if (r.product === '') r.vat = defaultVat(); }); renderRows(); applyBiller(); };
$('maksuehto').oninput = updateDue;
$('laskunro').oninput = updateRef;

(async function start() {
  if (typeof XLSX === 'undefined' || !window.jspdf) {
    status('Ohjelmakirjastoja ei saatu ladattua. Tarkista verkkoyhteys ja päivitä sivu.', 'err');
  }
  initDateFields();
  setD('laskupvm', INV.today());
  $('maksuehto').value = 14;
  updateDue();
  addRow();

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
        REG = cached;
        $('fileName').textContent = cached.source;
        fillRegistry();
      } else showSetup('file');
    } catch (_) { showSetup('file'); }
    renderLocalArchive();
  }
})();

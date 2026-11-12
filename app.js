/* app.js – käyttöliittymän logiikka */

const $ = (id) => document.getElementById(id);
const cfg = CFG.data;

let REG = { customers: [], recipients: [], products: [], sender: {}, source: '' };
let ROWS = [];
let STATE_PATH = '';          // jaetun laskunumeron tilatiedosto OneDrivessa

/* ===================================================================== */
/* Apurit                                                                */
/* ===================================================================== */
function status(msg, kind = '') {
  const el = $('status');
  el.className = 'status ' + kind;
  el.textContent = msg || '';
}
function conn(msg, ok = false) {
  const el = $('connState');
  el.textContent = msg;
  el.className = 'sub' + (ok ? ' ok' : '');
}
const norm = (s) => String(s ?? '').toLowerCase().trim().replace(/[\s_.\-:]/g, '');

function pick(obj, aliases) {
  for (const a of aliases) {
    for (const k of Object.keys(obj)) {
      if (norm(k) === norm(a)) return obj[k];
    }
  }
  for (const a of aliases) {
    for (const k of Object.keys(obj)) {
      if (norm(k).startsWith(norm(a))) return obj[k];
    }
  }
  return '';
}
function numVal(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  return Number(String(v).replace(/\s|€|%/g, '').replace(',', '.')) || 0;
}
function safeName(s) {
  return String(s || '').replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
}

/* ===================================================================== */
/* Rekisterin luku                                                       */
/* ===================================================================== */
function sheetRows(wb, match) {
  const name = wb.SheetNames.find(n => match.some(m => norm(n).includes(norm(m))));
  if (!name) return null;
  return XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '', raw: true });
}

function parseWorkbook(buf, source) {
  const wb = XLSX.read(buf, { type: 'array' });

  const cust = (sheetRows(wb, ['asiakk', 'asiakas', 'customer']) || []).map(r => ({
    id:      String(pick(r, ['asiakasnumero', 'asiakasnro', 'asiakas nro', 'nro', 'id', 'numero']) || '').trim(),
    name:    String(pick(r, ['nimi', 'asiakas', 'yritys', 'name']) || '').trim(),
    bid:     String(pick(r, ['y-tunnus', 'ytunnus', 'businessid', 'vat']) || '').trim(),
    addr:    String(pick(r, ['osoite', 'katuosoite', 'lähiosoite', 'address']) || '').trim(),
    zip:     String(pick(r, ['postinumero', 'postinro', 'zip']) || '').trim(),
    city:    String(pick(r, ['postitoimipaikka', 'toimipaikka', 'kaupunki', 'city']) || '').trim(),
    country: String(pick(r, ['maa', 'country']) || '').trim(),
    email:   String(pick(r, ['sähköposti', 'sahkoposti', 'email', 'laskutussähköposti']) || '').trim(),
    terms:   numVal(pick(r, ['maksuehto', 'maksuaika', 'terms'])),
    einv:    String(pick(r, ['verkkolaskuosoite', 'ovt', 'verkkolasku']) || '').trim(),
    oper:    String(pick(r, ['välittäjä', 'valittaja', 'operaattori']) || '').trim()
  })).filter(c => c.name);

  const rcpt = (sheetRows(wb, ['vastaanott', 'yhteysh', 'recipient', 'contact']) || []).map(r => ({
    cust:  String(pick(r, ['asiakasnumero', 'asiakasnro', 'asiakas', 'customer']) || '').trim(),
    name:  String(pick(r, ['nimi', 'yhteyshenkilö', 'name']) || '').trim(),
    email: String(pick(r, ['sähköposti', 'sahkoposti', 'email']) || '').trim(),
    role:  String(pick(r, ['rooli', 'tehtävä', 'role']) || '').trim()
  })).filter(r => r.email);

  const prod = (sheetRows(wb, ['tuot', 'nimike', 'product', 'palvelu']) || []).map(r => ({
    code: String(pick(r, ['koodi', 'tuotekoodi', 'nro', 'id']) || '').trim(),
    name: String(pick(r, ['nimi', 'tuote', 'nimike', 'name']) || '').trim(),
    desc: String(pick(r, ['kuvaus', 'selite', 'lisätieto', 'description']) || '').trim(),
    unit: String(pick(r, ['yksikkö', 'yksikko', 'yks', 'unit']) || '').trim(),
    price: numVal(pick(r, ['hinta', 'à-hinta', 'ahinta', 'yksikköhinta', 'veroton', 'price'])),
    vat:  numVal(pick(r, ['alv', 'alv%', 'alv-%', 'vat']))
  })).filter(p => p.name);

  // Lähettäjä: Kenttä / Arvo -parit
  const sender = {};
  const sName = wb.SheetNames.find(n => ['lähett', 'lahett', 'yritys', 'asetu', 'oma', 'sender']
    .some(m => norm(n).includes(norm(m))));
  if (sName) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sName], { header: 1, defval: '' });
    const map = {
      name: ['nimi', 'yritys', 'yrityksennimi'], bid: ['y-tunnus', 'ytunnus'],
      addr: ['osoite', 'katuosoite'], zip: ['postinumero'], city: ['postitoimipaikka', 'kaupunki'],
      email: ['sähköposti', 'sahkoposti', 'email'], phone: ['puhelin', 'phone'],
      iban: ['iban', 'tilinumero'], bic: ['bic', 'swift'], bank: ['pankki'],
      terms: ['maksuehto'], interest: ['viivästyskorko', 'viivastyskorko'],
      nextNumber: ['laskunumero', 'seuraavalaskunumero'], country: ['maa']
    };
    for (const row of rows) {
      const k = norm(row[0]); const v = row[1];
      if (!k || v === '' || v === undefined) continue;
      for (const [field, aliases] of Object.entries(map)) {
        if (aliases.some(a => k === norm(a) || k.startsWith(norm(a)))) sender[field] = v;
      }
    }
  }

  REG = { customers: cust, recipients: rcpt, products: prod, sender, source };

  // lähettäjän tiedot asetuksiin, ellei käsin ylikirjoitettu
  for (const [k, v] of Object.entries(sender)) {
    if (k === 'terms') { if (!cfg.terms) cfg.terms = numVal(v); continue; }
    if (k === 'interest') { if (!cfg.interest) cfg.interest = String(v); continue; }
    if (k === 'nextNumber') { if (!cfg.nextNumber) cfg.nextNumber = numVal(v); continue; }
    if (!cfg.sender[k]) cfg.sender[k] = String(v);
  }
  CFG.save();
  fillSettings();
  fillCustomers();
  fillProductSelects();
  showRegSummary();
}

function showRegSummary() {
  const el = $('regSummary');
  if (!REG.customers.length && !REG.products.length) {
    el.textContent = 'Rekisteriä ei ole ladattu.';
    return;
  }
  el.innerHTML =
    `<span class="pill">${REG.customers.length} asiakasta</span>` +
    `<span class="pill">${REG.recipients.length} vastaanottajaa</span>` +
    `<span class="pill">${REG.products.length} tuotetta</span>` +
    `<span class="pill">${REG.sender.name || cfg.sender.name || 'lähettäjä puuttuu'}</span>` +
    `<div class="muted small" style="margin-top:6px">Lähde: ${REG.source}</div>`;
}

/* ===================================================================== */
/* Asiakkaat ja tuotteet                                                 */
/* ===================================================================== */
function fillCustomers() {
  const sel = $('asiakas');
  sel.innerHTML = '<option value="">– valitse asiakas –</option>';
  REG.customers.forEach((c, i) => {
    const o = document.createElement('option');
    o.value = i;
    o.textContent = (c.id ? c.id + ' · ' : '') + c.name;
    sel.appendChild(o);
  });
}

function currentCustomer() {
  const i = $('asiakas').value;
  return i === '' ? null : REG.customers[Number(i)];
}

function onCustomerChange() {
  const c = currentCustomer();
  if (!c) { $('asiakasTiedot').textContent = ''; $('emails').value = ''; return; }
  const mails = new Set();
  if (c.email) c.email.split(/[;,]/).forEach(e => e.trim() && mails.add(e.trim()));
  REG.recipients.filter(r => r.cust && (r.cust === c.id || norm(r.cust) === norm(c.name)))
    .forEach(r => mails.add(r.email));
  $('emails').value = [...mails].join(', ');
  $('asiakasTiedot').textContent =
    [c.addr, [c.zip, c.city].filter(Boolean).join(' '), c.bid ? 'Y-tunnus ' + c.bid : '',
     c.einv ? 'Verkkolasku ' + c.einv : ''].filter(Boolean).join(' · ');
  if (c.terms) { $('maksuehto').value = c.terms; updateDue(); }
}

function fillProductSelects() {
  document.querySelectorAll('select.psel').forEach(sel => {
    const v = sel.value;
    sel.innerHTML = '<option value="">– vapaa rivi –</option>' +
      REG.products.map((p, i) => `<option value="${i}">${(p.code ? p.code + ' · ' : '') + p.name}</option>`).join('');
    sel.value = v;
  });
}

/* ===================================================================== */
/* Laskurivit                                                            */
/* ===================================================================== */
function addRow(data = {}) {
  ROWS.push(Object.assign({ desc: '', qty: 1, unit: 'kpl', price: 0, vat: cfg.vat }, data));
  renderRows();
}

function renderRows() {
  const tb = $('rivit').querySelector('tbody');
  tb.innerHTML = '';
  ROWS.forEach((r, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div class="rowline">
          <select class="psel" data-i="${i}"></select>
          <input class="free" data-f="desc" data-i="${i}" value="${(r.desc || '').replace(/"/g, '&quot;')}" placeholder="Kuvaus laskulle">
        </div>
      </td>
      <td><input type="number" step="any" data-f="qty" data-i="${i}" value="${r.qty}" style="width:70px"></td>
      <td><input data-f="unit" data-i="${i}" value="${r.unit || ''}" style="width:60px"></td>
      <td><input type="number" step="any" data-f="price" data-i="${i}" value="${r.price}" style="width:85px"></td>
      <td><input type="number" step="any" data-f="vat" data-i="${i}" value="${r.vat}" style="width:65px"></td>
      <td class="num"><b>${INV.num(INV.lineTotal(r))}</b></td>
      <td><button class="del" data-del="${i}" title="Poista">&times;</button></td>`;
    tb.appendChild(tr);
  });
  fillProductSelects();
  calc();
}

$('rivit').addEventListener('input', (e) => {
  const i = e.target.dataset.i, f = e.target.dataset.f;
  if (i === undefined) return;
  if (f) {
    ROWS[i][f] = (f === 'desc' || f === 'unit') ? e.target.value : numVal(e.target.value);
    const row = e.target.closest('tr');
    row.querySelector('td.num b').textContent = INV.num(INV.lineTotal(ROWS[i]));
    calc();
  }
});

$('rivit').addEventListener('change', (e) => {
  if (e.target.classList.contains('psel')) {
    const i = Number(e.target.dataset.i);
    const pi = e.target.value;
    if (pi !== '') {
      const p = REG.products[Number(pi)];
      ROWS[i].desc = p.desc ? `${p.name} – ${p.desc}` : p.name;
      ROWS[i].unit = p.unit || 'kpl';
      ROWS[i].price = p.price;
      ROWS[i].vat = p.vat || cfg.vat;
      renderRows();
      const sel = document.querySelector(`select.psel[data-i="${i}"]`);
      if (sel) sel.value = pi;
    }
  }
});

$('rivit').addEventListener('click', (e) => {
  const d = e.target.dataset.del;
  if (d !== undefined) { ROWS.splice(Number(d), 1); if (!ROWS.length) addRow(); else renderRows(); }
});

function calc() {
  const t = INV.totals(ROWS);
  $('tNetto').textContent = INV.money(t.net);
  $('tAlv').textContent = INV.money(t.vat);
  $('tBrutto').textContent = INV.money(t.gross);
}

/* ===================================================================== */
/* Laskun tiedot                                                         */
/* ===================================================================== */
function updateDue() {
  const d = $('laskupvm').value || INV.today();
  $('erapvm').value = INV.addDays(d, numVal($('maksuehto').value));
}
function updateRef() {
  $('viite').value = INV.reference($('laskunro').value || '1');
}

function buildInvoiceObject() {
  const c = currentCustomer();
  return {
    number: $('laskunro').value.trim(),
    date: $('laskupvm').value || INV.today(),
    due: $('erapvm').value,
    terms: numVal($('maksuehto').value),
    reference: $('viite').value,
    deliveryDate: $('toimituspvm').value,
    interest: cfg.interest,
    note: $('vapaateksti').value.trim(),
    sender: Object.assign({}, REG.sender, cfg.sender),
    customer: c || { name: '', addr: '', zip: '', city: '' },
    lines: ROWS.filter(r => (r.desc || '').trim() || INV.lineTotal(r))
  };
}

function validate(inv) {
  if (!inv.customer.name) return 'Valitse asiakas.';
  if (!inv.lines.length) return 'Lisää vähintään yksi laskurivi.';
  if (!inv.number) return 'Laskunumero puuttuu.';
  if (!inv.sender.name) return 'Lähettäjän tiedot puuttuvat (Asetukset tai rekisterin Lähettäjä-välilehti).';
  return '';
}

function fileNameFor(inv) {
  const t = INV.totals(inv.lines);
  return safeName(
    (cfg.filePattern || 'Lasku_{nro}_{asiakas}.pdf')
      .replace('{nro}', inv.number)
      .replace('{asiakas}', inv.customer.name)
      .replace('{pvm}', inv.date)
      .replace('{vuosi}', inv.date.slice(0, 4))
      .replace('{summa}', t.gross.toFixed(2))
  ).replace(/\.pdf$/i, '') + '.pdf';
}

function outFolderFor(inv) {
  let f = cfg.outFolder || 'Dokumentit/Laskutus/Laskut';
  if (cfg.yearFolders) f += '/' + inv.date.slice(0, 4);
  return f;
}

function mailTexts(inv) {
  const t = INV.totals(inv.lines);
  const rep = (s) => String(s || '')
    .replace(/{nro}/g, inv.number)
    .replace(/{lahettaja}/g, inv.sender.name || '')
    .replace(/{asiakas}/g, inv.customer.name || '')
    .replace(/{erapaiva}/g, INV.dateFi(inv.due))
    .replace(/{summa}/g, INV.money(t.gross))
    .replace(/{viite}/g, inv.reference);
  return { subject: rep(cfg.mailSubject), body: rep(cfg.mailBody) };
}

/* ===================================================================== */
/* Laskunumeron hallinta                                                 */
/* ===================================================================== */
function statePath() {
  const folder = (cfg.regFolder || '').replace(/\/+$/, '');
  return (folder ? folder + '/' : '') + 'laskutus-tila.json';
}

async function loadCounter() {
  if (!cfg.sharedCounter || !G.signedIn()) return;
  try {
    STATE_PATH = statePath();
    const st = await G.readJson(STATE_PATH);
    if (st && st.nextNumber) { cfg.nextNumber = Number(st.nextNumber); CFG.save(); }
  } catch (e) { console.warn('Laskunumeron luku epäonnistui', e); }
}

async function bumpCounter(used) {
  const next = Math.max(Number(cfg.nextNumber) || 0, Number(used) || 0) + 1;
  cfg.nextNumber = next; CFG.save(); fillSettings();
  if (cfg.sharedCounter && G.signedIn()) {
    try {
      await G.writeJson(statePath(), {
        nextNumber: next, lastInvoice: used,
        updated: new Date().toISOString(),
        by: (G.account && G.account.username) || ''
      });
    } catch (e) { console.warn('Laskunumeron tallennus epäonnistui', e); }
  }
}

function newInvoiceNumber() {
  $('laskunro').value = String(cfg.nextNumber || 1001);
  updateRef();
}

/* ===================================================================== */
/* Toiminnot: esikatselu, lataus, tallennus, lähetys                     */
/* ===================================================================== */
function makePdf() {
  const inv = buildInvoiceObject();
  const err = validate(inv);
  if (err) { status(err, 'err'); return null; }
  return { inv, doc: INV.buildPdf(inv) };
}

$('btnPreview').onclick = () => {
  const r = makePdf(); if (!r) return;
  $('previewFrame').src = r.doc.output('bloburl');
  $('previewModal').hidden = false;
  status('');
};
$('btnClosePreview').onclick = () => { $('previewModal').hidden = true; $('previewFrame').src = ''; };

$('btnDownload').onclick = () => {
  const r = makePdf(); if (!r) return;
  r.doc.save(fileNameFor(r.inv));
  status('PDF ladattu laitteelle.', 'ok');
};

async function saveToOneDrive(r) {
  const name = fileNameFor(r.inv);
  const path = outFolderFor(r.inv) + '/' + name;
  const blob = r.doc.output('blob');
  status('Tallennetaan OneDriveen…', 'work');
  const item = await G.uploadFile(path, blob, 'application/pdf');
  return { name, path, item };
}

$('btnSave').onclick = async () => {
  const r = makePdf(); if (!r) return;
  try {
    if (!G.signedIn()) { status('Kirjaudu ensin Microsoft-tilille asetuksissa.', 'err'); return; }
    const s = await saveToOneDrive(r);
    await bumpCounter(r.inv.number);
    status(`Tallennettu: ${s.path}`, 'ok');
    refreshArchive().catch(() => {});
  } catch (e) { status('Virhe: ' + e.message, 'err'); }
};

$('btnSend').onclick = async () => {
  const r = makePdf(); if (!r) return;
  const to = $('emails').value.split(/[;,]/).map(s => s.trim()).filter(Boolean);
  if (!to.length) { status('Sähköpostiosoite puuttuu.', 'err'); return; }
  try {
    if (!G.signedIn()) { status('Kirjaudu ensin Microsoft-tilille asetuksissa.', 'err'); return; }
    const s = await saveToOneDrive(r);
    const b64 = r.doc.output('datauristring').split(',')[1];
    const { subject, body } = mailTexts(r.inv);
    const payload = {
      to, cc: (cfg.mailCc || '').split(/[;,]/), subject, body,
      fileName: s.name, base64: b64
    };
    status(cfg.mailDraft ? 'Luodaan luonnos…' : 'Lähetetään sähköpostia…', 'work');
    if (cfg.mailDraft) await G.createDraft(payload); else await G.sendMail(payload);
    await bumpCounter(r.inv.number);
    status(cfg.mailDraft
      ? `Tallennettu (${s.path}) ja luonnos luotu Outlookiin.`
      : `Tallennettu (${s.path}) ja lähetetty: ${to.join(', ')}`, 'ok');
    refreshArchive().catch(() => {});
  } catch (e) { status('Virhe: ' + e.message, 'err'); }
};

/* ===================================================================== */
/* Rekisterin lataus                                                     */
/* ===================================================================== */
$('btnListFiles').onclick = async () => {
  const folder = $('regFolder').value.trim();
  cfg.regFolder = folder; CFG.save();
  try {
    status('Haetaan kansiota…', 'work');
    const items = await G.listChildren(folder);
    const xls = items.filter(i => i.file && /\.xlsx?$|\.xlsm$/i.test(i.name));
    const sel = $('regFile');
    sel.innerHTML = '<option value="">– valitse tiedosto –</option>' +
      xls.map(f => `<option value="${f.name}">${f.name}</option>`).join('');
    if (cfg.regFile && xls.some(f => f.name === cfg.regFile)) sel.value = cfg.regFile;
    status(xls.length ? `${xls.length} Excel-tiedostoa löytyi.` : 'Kansiosta ei löytynyt Excel-tiedostoja.', xls.length ? 'ok' : 'err');
  } catch (e) { status('Virhe: ' + e.message, 'err'); }
};

$('btnLoadReg').onclick = async () => {
  const folder = $('regFolder').value.trim();
  const file = $('regFile').value;
  if (!file) { status('Valitse rekisteritiedosto.', 'err'); return; }
  cfg.regFolder = folder; cfg.regFile = file; CFG.save();
  try {
    status('Ladataan rekisteriä…', 'work');
    const buf = await G.downloadFile((folder ? folder + '/' : '') + file);
    parseWorkbook(buf, 'OneDrive: ' + folder + '/' + file);
    await loadCounter();
    newInvoiceNumber();
    status('Rekisteri ladattu.', 'ok');
  } catch (e) { status('Virhe: ' + e.message, 'err'); }
};

$('localXlsx').onchange = async (e) => {
  const f = e.target.files[0]; if (!f) return;
  const buf = await f.arrayBuffer();
  parseWorkbook(buf, 'Paikallinen tiedosto: ' + f.name);
  newInvoiceNumber();
  status('Rekisteri ladattu paikallisesti.', 'ok');
};

/* ===================================================================== */
/* Arkisto                                                               */
/* ===================================================================== */
async function refreshArchive() {
  const ul = $('archiveList');
  if (!G.signedIn()) { ul.innerHTML = '<li class="muted">Kirjaudu nähdäksesi tallennetut laskut.</li>'; return; }
  let folder = cfg.outFolder || '';
  if (cfg.yearFolders) folder += '/' + new Date().getFullYear();
  try {
    const items = await G.listChildren(folder);
    const pdfs = items.filter(i => i.file && /\.pdf$/i.test(i.name))
      .sort((a, b) => (b.lastModifiedDateTime || '').localeCompare(a.lastModifiedDateTime || ''));
    ul.innerHTML = pdfs.length
      ? pdfs.map(f => `<li><a href="${f.webUrl}" target="_blank" rel="noopener">${f.name}</a>
          <span class="muted small">${(f.lastModifiedDateTime || '').slice(0, 10)}</span></li>`).join('')
      : '<li class="muted">Kansiossa ei ole laskuja.</li>';
  } catch (e) {
    ul.innerHTML = `<li class="muted">Kansiota ei löytynyt (${folder}).</li>`;
  }
}
$('btnRefreshArchive').onclick = () => refreshArchive();

/* ===================================================================== */
/* Asetukset                                                             */
/* ===================================================================== */
const SET_MAP = {
  cfgClientId: 'clientId', cfgTenant: 'tenant', cfgRegFolder: 'regFolder', cfgOutFolder: 'outFolder',
  cfgYearFolders: 'yearFolders', cfgFilePattern: 'filePattern', cfgNextNumber: 'nextNumber',
  cfgSharedCounter: 'sharedCounter', cfgTerms: 'terms', cfgInterest: 'interest', cfgVat: 'vat',
  cfgMailSubject: 'mailSubject', cfgMailBody: 'mailBody', cfgMailCc: 'mailCc', cfgMailDraft: 'mailDraft'
};
const SENDER_MAP = {
  cfgSenderName: 'name', cfgSenderBid: 'bid', cfgSenderAddr: 'addr', cfgSenderZip: 'zip', cfgSenderCity: 'city',
  cfgSenderEmail: 'email', cfgSenderPhone: 'phone', cfgIban: 'iban', cfgBic: 'bic'
};

function fillSettings() {
  for (const [id, key] of Object.entries(SET_MAP)) {
    const el = $(id); if (!el) continue;
    if (el.type === 'checkbox') el.checked = !!cfg[key]; else el.value = cfg[key] ?? '';
  }
  for (const [id, key] of Object.entries(SENDER_MAP)) {
    const el = $(id); if (el) el.value = cfg.sender[key] ?? '';
  }
  $('regFolder').value = cfg.regFolder || '';
  if (cfg.regFile && $('regFile').options.length <= 1) {
    $('regFile').innerHTML = `<option value="${cfg.regFile}">${cfg.regFile}</option>`;
    $('regFile').value = cfg.regFile;
  }
}

function readSettings() {
  for (const [id, key] of Object.entries(SET_MAP)) {
    const el = $(id); if (!el) continue;
    cfg[key] = el.type === 'checkbox' ? el.checked : (el.type === 'number' ? numVal(el.value) : el.value.trim());
  }
  for (const [id, key] of Object.entries(SENDER_MAP)) {
    const el = $(id); if (el) cfg.sender[key] = el.value.trim();
  }
  CFG.save();
}

function openSettings(open) {
  $('settingsPanel').hidden = !open;
  $('settingsBackdrop').hidden = !open;
  if (open) fillSettings();
}
$('btnSettings').onclick = () => openSettings(true);
$('btnCloseSettings').onclick = () => openSettings(false);
$('settingsBackdrop').onclick = () => openSettings(false);

$('btnSaveCfg').onclick = async () => {
  readSettings();
  $('maksuehto').value = cfg.terms || 14;
  updateDue();
  openSettings(false);
  status('Asetukset tallennettu.', 'ok');
  if (cfg.clientId) { try { await initGraph(); } catch (e) { status(e.message, 'err'); } }
};

$('btnResetCfg').onclick = () => {
  if (!confirm('Palautetaanko oletusasetukset?')) return;
  CFG.reset();
  Object.assign(cfg, CFG.data);
  fillSettings();
};

/* ===================================================================== */
/* Kirjautuminen                                                         */
/* ===================================================================== */
async function initGraph() {
  if (!cfg.clientId) { conn('Anna Client ID asetuksissa'); return; }
  await G.init(cfg.clientId, cfg.tenant);
  await G.handleRedirect();
  if (G.signedIn()) await afterLogin();
  else conn('Ei kirjautunut');
}

async function afterLogin() {
  try {
    const me = await G.me();
    conn('Yhdistetty: ' + (me.displayName || me.userPrincipalName), true);
    $('userInfo').textContent = (me.mail || me.userPrincipalName || '');
    await loadCounter();
    if (!$('laskunro').value) newInvoiceNumber();
    if (cfg.regFolder && cfg.regFile) {
      try {
        const buf = await G.downloadFile(cfg.regFolder + '/' + cfg.regFile);
        parseWorkbook(buf, 'OneDrive: ' + cfg.regFolder + '/' + cfg.regFile);
        newInvoiceNumber();
      } catch (e) { console.warn('Rekisterin automaattilataus:', e.message); }
    }
    refreshArchive().catch(() => {});
  } catch (e) {
    conn('Kirjautunut (Graph-virhe: ' + e.message + ')');
  }
}

$('btnLogin').onclick = async () => {
  try {
    readSettings();
    if (!cfg.clientId) { alert('Anna ensin sovelluksen Client ID.'); return; }
    if (!G.msal) await G.init(cfg.clientId, cfg.tenant);
    await G.login();
    if (G.signedIn()) { await afterLogin(); openSettings(false); status('Kirjautuminen onnistui.', 'ok'); }
  } catch (e) { alert('Kirjautuminen epäonnistui: ' + e.message); }
};

$('btnLogout').onclick = async () => {
  await G.logout();
  conn('Ei yhteyttä OneDriveen');
  $('userInfo').textContent = 'Ei kirjautunut.';
};

/* ===================================================================== */
/* Välilehdet ja käynnistys                                              */
/* ===================================================================== */
document.querySelectorAll('.tab').forEach(t => {
  t.onclick = () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    t.classList.add('active');
    $(t.dataset.view).classList.add('active');
    if (t.dataset.view === 'arkistoView') refreshArchive().catch(() => {});
  };
});

$('btnAddRow').onclick = () => addRow();
$('asiakas').onchange = onCustomerChange;
$('laskupvm').onchange = updateDue;
$('maksuehto').oninput = updateDue;
$('laskunro').oninput = updateRef;

(function start() {
  fillSettings();
  $('laskupvm').value = INV.today();
  $('maksuehto').value = cfg.terms || 14;
  updateDue();
  newInvoiceNumber();
  addRow();
  initGraph().catch(e => conn('Yhteysvirhe: ' + e.message));
})();

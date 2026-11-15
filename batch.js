/* batch.js – erityisominaisuudet: itselaskutus ja tiekunnan laskutus
 *   - Itselaskutus: saman saajan (Nimi + Tilinumero) rivit yhdelle itselaskutukselle.
 *   - Tiekunta: yksi tiekunta per rekisteri. Tieyksikköluettelon rivit ryhmitellään maksajittain:
 *     jokainen maksaja saa yhden laskun, jossa on perusmaksu kerran ja ylläpitomaksu kiinteistöittäin.
 * "Ensimmäinen laskunumero" on aina määräävä ja säilyy Päivitä-painikkeen yli. */
function ibanValid(iban) {
  const s = String(iban || '').replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/.test(s)) return false;
  if (s.startsWith('FI') && s.length !== 18) return false;
  const r = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, c => String(c.charCodeAt(0) - 55));
  let m = 0;
  for (const ch of r) m = (m * 10 + Number(ch)) % 97;
  return m === 1;
}
const fmtIban = (s) => String(s || '').replace(/\s/g, '').toUpperCase().replace(/(.{4})(?=.)/g, '$1 ');

const BATCH = {
  done: { self: {}, road: {}, drain: {} },
  plan: { self: [], road: [], drain: [] },
  manual: { self: '', road: '', drain: '' },
  noteEdited: false,
  roadKey: '',
  drainKey: '',
  drainNoteEdited: false,
  drainAmt: {},          // käyttäjän muokkaamat alueiden summat (alue -> teksti)

  noField(kind) { return $(kind + 'FirstNo'); },
  biller(kind) { return REG.billers[Number($(kind + 'Biller').value) || 0] || null; },

  fillBillers() {
    ['selfBiller', 'roadBiller', 'drainBiller'].forEach(id => {
      const sel = $(id), prev = sel.value;
      sel.innerHTML = billerOptions();
      let keep = prev !== '' && REG.billers[prev] ? prev : '';
      // tiekunnalle / ojitusyhteisölle oletuksena laskuttaja, jonka nimi on sama kuin yhteisön nimi
      const own = id === 'roadBiller' ? REG.road : id === 'drainBiller' ? REG.drain : null;
      const kk = id === 'roadBiller' ? 'roadKey' : 'drainKey';
      if (own) {
        const key = own.settings.name;
        if (key !== this[kk]) {
          const i = REG.billers.findIndex(b => SEARCH.fold(b.name).trim() === SEARCH.fold(key).trim());
          if (i >= 0) keep = String(i);
          this[kk] = key;
        }
      }
      if (keep === '') keep = String(Math.max(0, REG.billers.findIndex(b => billerKey(b) === cfg.lastBiller)));
      sel.value = keep;
    });
  },

  async firstNumber(kind) {
    const el = this.noField(kind);
    if (this.manual[kind]) { el.value = this.manual[kind]; return; }
    const b = this.biller(kind);
    el.value = b ? (b.prefix || '') + await nextNumberFor(b) : '';
  },
  numberAt(kind, k) {
    const b = this.biller(kind);
    const n = numberPart(this.noField(kind).value.trim(), b) || 1;
    return (b && b.prefix ? b.prefix : '') + (n + k);
  },
  setStatus(kind, msg, cls = '') {
    const el = $(kind + 'Status');
    el.className = 'status ' + cls;
    el.textContent = msg || '';
  },
  count(kind, n) { return kind === 'self' ? `${n} itselaskutus${n === 1 ? '' : 'ta'}` : `${n} lasku${n === 1 ? '' : 'a'}`; },
  render(kind) { if (kind === 'self') this.renderSelf(); else if (kind === 'road') this.renderRoad(); else this.renderDrain(); },

  async refresh() {
    this.fillBillers();
    if (cfg.featSelf) { await this.firstNumber('self'); this.renderSelf(); }
    if (cfg.featRoad) {
      if (!this.noteEdited) $('roadNote').value = REG.road ? REG.road.settings.note : '';
      $('roadTitle').textContent = REG.road && REG.road.settings.name ? REG.road.settings.name : 'Tiekunnan laskutus';
      await this.firstNumber('road');
      this.renderRoad();
    }
    if (cfg.featDrain) {
      if (!this.drainNoteEdited) $('drainNote').value = REG.drain ? REG.drain.settings.note : '';
      $('drainTitle').textContent = REG.drain && REG.drain.settings.name ? REG.drain.settings.name : 'Ojitusyhteisön laskutus';
      this.renderAreaInputs();
      await this.firstNumber('drain');
      this.renderDrain();
    }
  },
  numberPill(ok) {
    if (!ok.length) return '';
    const a = ok[0].inv.number, b = ok[ok.length - 1].inv.number;
    return `<span class="pill">nro ${esc(a)}${ok.length > 1 ? '–' + esc(b) : ''}</span>`;
  },
  conflicts(rows, fields, errs) {
    for (const [fld, label] of fields) {
      const vals = [...new Set(rows.map(r => r[fld]))];
      if (vals.length > 1) errs.push(`Ristiriita: ${label} eroaa riveillä ${rows.map(r => r.row).join(', ')} (${vals.map(v => v || 'tyhjä').join(' / ')})`);
    }
  },

  /* ===== Itselaskutus ===== */
  buildSelf() {
    const rows = REG.self || [];
    const groups = new Map();
    let skipped = 0;
    rows.forEach(r => {
      if (!r.active) { skipped++; return; }
      const key = SEARCH.fold(r.name).replace(/\s+/g, ' ').trim() + '|' + r.iban.replace(/\s/g, '');
      if (!groups.has(key)) groups.set(key, { key, rows: [] });
      groups.get(key).rows.push(r);
    });
    const b = this.biller('self');
    const plan = [];
    groups.forEach(g => {
      const f = g.rows[0], errs = [], warns = [];
      this.conflicts(g.rows, [['addr', 'osoite'], ['zip', 'postinumero'], ['city', 'postitoimipaikka'], ['email', 'sähköposti']], errs);
      if (!f.name) errs.push(`Nimi puuttuu (rivi ${f.row})`);
      if (!f.iban) errs.push('Tilinumero puuttuu');
      else if (!ibanValid(f.iban)) errs.push(`Tilinumero ${f.iban} ei ole kelvollinen IBAN`);
      if (!f.addr || !f.zip || !f.city) warns.push('Osoite puutteellinen – ei voi postittaa');
      if (!f.email) warns.push('Ei sähköpostiosoitetta');
      const lines = g.rows.map(r => {
        if (!r.desc) errs.push(`Selite puuttuu (rivi ${r.row})`);
        if (r.priceEmpty) errs.push(`Hinta puuttuu (rivi ${r.row})`);
        if (r.vat === null) errs.push(`ALV puuttuu (rivi ${r.row})`);
        return { desc: r.desc, qty: r.qty, unit: r.unit, price: r.price, vat: r.vat === null ? 0 : r.vat };
      });
      plan.push({ key: g.key, errs, warns, inv: { kind: 'self',
        customer: { name: f.name, addr: f.addr, zip: f.zip, city: f.city, email: f.email, iban: fmtIban(f.iban) },
        emails: f.email ? [f.email] : [], sender: b || {}, lines } });
    });
    return { plan, skipped, rows: rows.length };
  },
  renderSelf() {
    const { plan, skipped, rows } = this.buildSelf();
    this.plan.self = plan;
    const ok = plan.filter(p => !p.errs.length);
    ok.forEach((p, k) => { p.inv.number = this.numberAt('self', k); });
    plan.filter(p => p.errs.length).forEach(p => { p.inv.number = ''; });
    const total = ok.reduce((s, p) => s + INV.totals(p.inv.lines).gross, 0);
    const bad = plan.length - ok.length;
    $('selfSummary').innerHTML = !rows ? '<p class="muted">Rekisterin Itselaskutus-välilehti puuttuu tai on tyhjä.</p>'
      : `<div class="bsum"><span class="pill">${this.count('self', ok.length)}</span>` + this.numberPill(ok) +
        `<span class="pill">yhteensä ${INV.money(total)}</span>` +
        (bad ? `<span class="pill warn">${bad} virheellistä – ohitetaan</span>` : '') +
        (skipped ? `<span class="pill">${skipped} riviä ei käytössä</span>` : '') + '</div>';
    $('selfList').innerHTML = plan.map((p, k) => this.cardHtml('self', p, k)).join('');
    $('btnSelfAll').disabled = !ok.length;
  },

  /* ===== Tiekunta ===== */
  buildRoad() {
    const rd = REG.road;
    if (!rd) return { plan: [], road: null, global: [] };
    const S = rd.settings;
    const act = rd.rows.filter(r => r.active);
    const totalUnits = Math.round(act.reduce((s, r) => s + r.units, 0) * 1000) / 1000;
    const global = [];
    if (S.method === 'budget') {
      if (!S.budget) global.push('Ositeltava summa puuttuu Tiekunta-välilehdeltä.');
      if (!totalUnits) global.push('Tieyksiköitä ei ole.');
    } else if (!S.unitPrice) global.push('Yksikköhinta puuttuu Tiekunta-välilehdeltä.');
    const share = (u) => S.method === 'budget'
      ? (totalUnits ? Math.round(u / totalUnits * S.budget * 100) / 100 : 0)
      : Math.round(u * S.unitPrice * 100) / 100;
    const y = S.year || String(new Date().getFullYear());
    const tx = (s) => String(s || '').replace(/\{vuosi\}/g, y);
    const groups = new Map();
    act.forEach(r => {
      const key = SEARCH.fold(r.name).replace(/\s+/g, ' ').trim() || ('#' + r.row);
      if (!groups.has(key)) groups.set(key, { key, rows: [] });
      groups.get(key).rows.push(r);
    });
    const b = this.biller('road');
    const plan = [];
    groups.forEach(g => {
      const f = g.rows[0], errs = [], warns = [];
      this.conflicts(g.rows, [['addr', 'osoite'], ['zip', 'postinumero'], ['city', 'postitoimipaikka'], ['email', 'sähköposti']], errs);
      if (!f.name) errs.push(`Maksaja puuttuu (rivi ${f.row})`);
      if (!f.addr || !f.zip || !f.city) warns.push('Osoite puutteellinen – ei voi postittaa');
      const mails = splitEmails(f.email);
      if (!mails.length) warns.push('Ei sähköpostiosoitetta');
      const props = new Map();
      g.rows.forEach(r => {
        if (!r.estate) errs.push(`Kiinteistö puuttuu (rivi ${r.row})`);
        if (!r.units) warns.push(`Tieyksiköt 0 (rivi ${r.row})`);
        const k = r.estate || ('rivi ' + r.row);
        props.set(k, (props.get(k) || 0) + r.units);
      });
      const lines = [];
      if (S.baseFee) lines.push({ desc: tx(S.baseText) || `Perusmaksu ${y}`, qty: 1, unit: 'kpl', price: S.baseFee, vat: S.vat });
      props.forEach((u, k) => {
        u = Math.round(u * 1000) / 1000;
        lines.push({ desc: `${tx(S.lineText) || 'Tien ylläpitomaksu ' + y}, ${k} (${INV.num(u, 3)} tieyks.)`, qty: 1, unit: 'kpl', price: share(u), vat: S.vat });
      });
      if (global.length) errs.push(...global);
      const units = Math.round([...props.values()].reduce((a, c) => a + c, 0) * 1000) / 1000;
      plan.push({
        key: g.key, errs, warns, units, estates: [...props.keys()],
        info: [...props.keys()].join(', ') + ' · ' + INV.num(units, 3) + ' tieyks.',
        inv: { kind: 'road', customer: { name: f.name, addr: f.addr, zip: f.zip, city: f.city }, emails: mails, sender: b || {}, lines,
          extraMeta: [['Tiekunta', S.name], ['Tieyksiköt', INV.num(units, 3)]] }
      });
    });
    return { plan, road: S, global, totalUnits, skipped: rd.rows.length - act.length };
  },
  renderRoad() {
    const r = this.buildRoad();
    this.plan.road = r.plan;
    if (!r.road) {
      $('roadSummary').innerHTML = '<p class="muted">Rekisterin Tiekunta-välilehti puuttuu.</p>';
      $('roadList').innerHTML = '';
      $('btnRoadAll').disabled = true;
      return;
    }
    const S = r.road;
    const ok = r.plan.filter(p => !p.errs.length);
    ok.forEach((p, k) => { p.inv.number = this.numberAt('road', k); });
    r.plan.filter(p => p.errs.length).forEach(p => { p.inv.number = ''; });
    const total = ok.reduce((s, p) => s + INV.totals(p.inv.lines).gross, 0);
    const maint = r.plan.reduce((s, p) => s + p.inv.lines.filter(l => /tieyks\.\)$/.test(l.desc)).reduce((a, l) => a + INV.lineTotal(l), 0), 0);
    const diff = S.method === 'budget' ? Math.round((maint - S.budget) * 100) / 100 : 0;
    $('roadSummary').innerHTML =
      `<div class="bsum"><span class="pill">${this.count('road', ok.length)}</span>` + this.numberPill(ok) +
      `<span class="pill">${INV.num(r.totalUnits, 3)} tieyksikköä</span>` +
      (S.method === 'budget' ? `<span class="pill">ositeltava ${INV.money(S.budget)}${diff ? ` (pyöristysero ${INV.money(diff)})` : ''}</span>`
        : `<span class="pill">${INV.price(S.unitPrice)} € / tieyks.</span>`) +
      (S.baseFee ? `<span class="pill">perusmaksu ${INV.money(S.baseFee)} / maksaja</span>` : '') +
      `<span class="pill">yhteensä ${INV.money(total)}</span>` +
      (r.plan.length - ok.length ? `<span class="pill warn">${r.plan.length - ok.length} virheellistä – ohitetaan</span>` : '') +
      (r.skipped ? `<span class="pill">${r.skipped} riviä ei käytössä</span>` : '') + '</div>' +
      (r.global.length ? `<div class="status err">${r.global.map(esc).join('<br>')}</div>` : '');
    $('roadList').innerHTML = r.plan.map((p, k) => this.cardHtml('road', p, k)).join('');
    $('btnRoadAll').disabled = !ok.length;
  },

  /* ===== Ojitusyhteisö =====
   * Yksi ojitusyhteisö per rekisteri. Jokaiselle kuivatusalueelle oma laskutettava summa
   * (0 tai tyhjä = aluetta ei laskuteta). Tilan osuus = alueen summa × tilan osuus-% / 100.
   * Saman maksajan kaikki tilat ja alueet kootaan yhdelle laskulle. */
  areaAmount(a) {
    const v = this.drainAmt[a.name];
    return v === undefined ? a.amount : num(v);
  },
  renderAreaInputs() {
    const box = $('drainAreas');
    const areas = REG.drain ? REG.drain.areas : [];
    box.innerHTML = areas.length ? areas.map(a => {
      const v = this.drainAmt[a.name] !== undefined ? this.drainAmt[a.name] : (a.amount ? String(a.amount).replace('.', ',') : '');
      return `<label>${esc(a.name)}${a.text ? ` <span class="hint">${esc(a.text)}</span>` : ''}
        <input type="text" inputmode="decimal" data-area="${esc(a.name)}" value="${esc(v)}" placeholder="0,00 € – ei laskuteta"></label>`;
    }).join('') : '<p class="muted small">Rekisterissä ei ole kuivatusalueita.</p>';
  },
  buildDrain() {
    const dr = REG.drain;
    if (!dr) return { plan: [], drain: null, areaInfo: [] };
    const S = dr.settings;
    const y = S.year || String(new Date().getFullYear());
    const tx = (s) => String(s || '').replace(/\{vuosi\}/g, y);
    const amt = {}; dr.areas.forEach(a => { amt[a.name] = this.areaAmount(a); });
    // osuuksien tarkistus alueittain (käytössä olevat rivit)
    const areaInfo = dr.areas.map(a => {
      const rows = dr.rows.filter(r => r.active && r.area === a.name);
      const pct = Math.round(rows.reduce((s, r) => s + (r.pct || 0), 0) * 1000) / 1000;
      const billed = rows.reduce((s, r) => s + Math.round(amt[a.name] * (r.pct || 0)) / 100, 0);
      return { name: a.name, amount: amt[a.name], pct, billed: Math.round(billed * 100) / 100, rows: rows.length };
    });
    const groups = new Map();
    dr.rows.filter(r => r.active).forEach(r => {
      const key = SEARCH.fold(r.name).replace(/[\s,]+/g, ' ').trim() || ('#' + r.row);
      if (!groups.has(key)) groups.set(key, { key, rows: [] });
      groups.get(key).rows.push(r);
    });
    const b = this.biller('drain');
    const plan = [];
    groups.forEach(g => {
      const f = g.rows[0], errs = [], warns = [];
      this.conflicts(g.rows, [['addr', 'osoite'], ['zip', 'postinumero'], ['city', 'postitoimipaikka'], ['email', 'sähköposti']], errs);
      if (!f.name) errs.push(`Maksaja puuttuu (rivi ${f.row})`);
      const lines = [], billedRows = [];
      g.rows.forEach(r => {
        if (!dr.areas.some(a => a.name === r.area)) errs.push(`Kuivatusalue "${r.area}" puuttuu alueiden summataulukosta (rivi ${r.row})`);
        const a = amt[r.area] || 0;
        if (!a) return;
        r.conflicts.forEach(c => errs.push(`${r.estateName || r.estate}: ${c}`));
        if (r.pct === null) {
          if (r.calcPct) errs.push(`${r.estateName || r.estate} (${r.area}): vahvistettu osuus puuttuu (laskettu ${INV.num(r.calcPct, 2)} %)`);
          return;
        }
        if (Math.abs(r.calcPct - r.pct) > 0.005)
          warns.push(`${r.estateName || r.estate} (${r.area}): kuvioista laskettu osuus ${INV.num(r.calcPct, 2)} % poikkeaa vahvistetusta ${INV.num(r.pct, 2)} % – laskutetaan vahvistetun mukaan`);
        if (!r.pct) return;
        billedRows.push(r);
        const label = [r.area, r.estateName, r.estate].filter(Boolean).join(' ');
        lines.push({ desc: `${tx(S.lineText) || 'Kunnossapitomaksu ' + y}, ${label} (${INV.num(r.pct, 3)} %)`,
          qty: 1, unit: 'kpl', price: Math.round(a * r.pct) / 100, vat: S.vat });
      });
      const estates = [...new Set(billedRows.map(r => [r.estateName, r.estate].filter(Boolean).join(' ')))];
      if (!lines.length && !errs.length) return;          // ei laskutettavaa tällä kertaa
      if (!f.addr || !f.zip || !f.city) warns.push('Osoite puutteellinen – ei voi postittaa');
      const mails = splitEmails(f.email);
      if (!mails.length) warns.push('Ei sähköpostiosoitetta');
      plan.push({
        key: g.key, errs, warns, estates,
        info: estates.join(', '),
        inv: { kind: 'drain', customer: { name: f.name, recipient: f.recipient, addr: f.addr, zip: f.zip, city: f.city },
          emails: mails, sender: b || {}, lines, extraMeta: [['Ojitusyhteisö', S.name]] }
      });
    });
    return { plan, drain: S, areaInfo, skipped: dr.rows.filter(r => !r.active).length };
  },
  renderDrain() {
    const r = this.buildDrain();
    this.plan.drain = r.plan;
    if (!r.drain) {
      $('drainSummary').innerHTML = '<p class="muted">Rekisterin Ojitusyhteisö-välilehti puuttuu.</p>';
      $('drainList').innerHTML = '';
      $('btnDrainAll').disabled = true;
      return;
    }
    const ok = r.plan.filter(p => !p.errs.length);
    ok.forEach((p, k) => { p.inv.number = this.numberAt('drain', k); });
    r.plan.filter(p => p.errs.length).forEach(p => { p.inv.number = ''; });
    const total = ok.reduce((s, p) => s + INV.totals(p.inv.lines).gross, 0);
    const areaPills = r.areaInfo.filter(a => a.amount).map(a => {
      const pctWarn = Math.abs(a.pct - 100) > 0.05;
      const diff = Math.round((a.billed - a.amount) * 100) / 100;
      return `<span class="pill${pctWarn ? ' warn' : ''}">${esc(a.name)}: ${INV.money(a.amount)}` +
        (pctWarn ? ` – osuudet yht. ${INV.num(a.pct, 3)} %` : '') + (diff ? ` (pyöristysero ${INV.money(diff)})` : '') + '</span>';
    }).join('');
    const noAmt = r.areaInfo.filter(a => !a.amount).map(a => a.name);
    $('drainSummary').innerHTML =
      `<div class="bsum"><span class="pill">${this.count('drain', ok.length)}</span>` + this.numberPill(ok) +
      `<span class="pill">yhteensä ${INV.money(total)}</span>` + areaPills +
      (r.plan.length - ok.length ? `<span class="pill warn">${r.plan.length - ok.length} virheellistä – ohitetaan</span>` : '') +
      (r.skipped ? `<span class="pill">${r.skipped} tilaa ei käytössä</span>` : '') + '</div>' +
      (noAmt.length ? `<div class="small muted">Ei laskuteta tällä kertaa: ${noAmt.map(esc).join(', ')}</div>` : '') +
      (!r.areaInfo.some(a => a.amount) ? '<div class="small muted">Anna vähintään yhdelle kuivatusalueelle laskutettava summa.</div>' : '');
    $('drainList').innerHTML = r.plan.map((p, k) => this.cardHtml('drain', p, k)).join('');
    $('btnDrainAll').disabled = !ok.length;
  },
  /* ===== Kortit ===== */
  cardHtml(kind, p, k) {
    const c = p.inv.customer, t = INV.totals(p.inv.lines);
    const done = this.done[kind][p.key];
    const addr = [c.addr, [c.zip, c.city].filter(Boolean).join(' '), p.inv.emails.join(', '), kind === 'self' ? c.iban : p.info].filter(Boolean).join(' · ');
    const lines = p.inv.lines.map(l => `<li><span>${esc(l.desc)}${(l.qty !== 1 && kind !== 'drain') || kind === 'self' ? ` · ${INV.num(l.qty, 3)} ${esc(l.unit)} × ${INV.price(l.price)}` : ''} · ALV ${fmtVat(l.vat)}</span>` +
      `<span>${INV.money(INV.lineTotal(l))}</span></li>`).join('');
    const msgs = [...p.errs, ...p.warns.map(w => '⚠ ' + w)];
    const nro = done ? done.inv.number : p.inv.number;
    let btns = `<button type="button" class="btn ghost sm" data-act="preview" data-k="${k}"${p.errs.length ? ' disabled' : ''}>Esikatsele</button>`;
    if (done) {
      btns = `<button type="button" class="btn ghost sm" data-act="open" data-k="${k}">Avaa PDF</button>` +
        (ST.canShareFile(new File([done.blob], done.name, { type: 'application/pdf' })) ? `<button type="button" class="btn sm" data-act="share" data-k="${k}">Jaa PDF</button>` : '') +
        (p.inv.emails.length ? `<button type="button" class="btn ghost sm" data-act="mail" data-k="${k}">Sähköposti</button>` : '');
    }
    return `<div class="bcard${p.errs.length ? ' err' : ''}${done ? ' done' : ''}">
      <div class="bcard-h"><b>${done ? '✓ ' : ''}${esc(c.name || '(nimi puuttuu)')}${nro ? ` <span class="nro">· nro ${esc(nro)}</span>` : ''}</b>
        <span class="sum">${INV.money(t.gross)}</span></div>
      <div class="addr">${esc(addr)}</div>
      <ul>${lines}</ul>
      ${msgs.length ? `<div class="errs">${msgs.map(esc).join('<br>')}</div>` : ''}
      <div class="row-btns">${btns}</div>
    </div>`;
  },
  async complete(kind, p, number) {
    const b = this.biller(kind);
    const inv = { ...p.inv, number, sender: { ...(b || {}), logoData: await logoFor(b) } };
    if (kind === 'self') {
      inv.date = getD('selfDate') || INV.today();
      inv.due = getD('selfDue');
      inv.note = $('selfNote').value.trim();
      inv.reference = '';
    } else {
      inv.date = getD(kind + 'Date') || INV.today();
      inv.due = getD(kind + 'Due');
      inv.terms = num($(kind + 'Terms').value);
      inv.note = $(kind + 'Note').value.trim();
      inv.reference = INV.reference(number);
    }
    return inv;
  },
  checkCommon(kind) {
    const ids = [kind + 'Date', kind + 'Due'];
    if (ids.map(normalizeD).includes(null)) return 'Tarkista päivämäärä (muoto pp.kk.vvvv).';
    if (!this.biller(kind)) return 'Laskuttajarekisteri puuttuu.';
    if (!getD(ids[1])) return kind === 'self' ? 'Maksupäivä puuttuu.' : 'Eräpäivä puuttuu.';
    if (kind === 'self' && !$('selfBatch').value.trim()) return 'Anna erälle nimi.';
    if (!numberPart(this.noField(kind).value, this.biller(kind))) return 'Ensimmäinen laskunumero puuttuu tai ei sisällä numeroa.';
    return '';
  },
  folder(kind, inv) {
    const sub = kind === 'self' ? 'Itselaskutus/' + safeName($('selfBatch').value)
      : kind === 'road' ? 'Tiekunnat/' + safeName((REG.road && REG.road.settings.name) || 'Tiekunta')
      : 'Ojitusyhteisöt/' + safeName((REG.drain && REG.drain.settings.name) || 'Ojitusyhteisö');
    return outFolderFor(inv) + '/' + sub;
  },
  async preview(kind, k) {
    const err = this.checkCommon(kind);
    if (err) { this.setStatus(kind, err, 'err'); return; }
    this.render(kind);
    const p = this.plan[kind][k];
    if (!p) return;
    const inv = await this.complete(kind, p, p.inv.number || 'LUONNOS');
    openBlob(INV.buildPdf(inv, pdfOpts()).output('blob'));
  },
  async generateAll(kind) {
    const err = this.checkCommon(kind);
    if (err) { this.setStatus(kind, err, 'err'); return; }
    this.render(kind);
    const ok = this.plan[kind].filter(p => !p.errs.length);
    const bad = this.plan[kind].length - ok.length;
    if (!ok.length) { this.setStatus(kind, 'Ei muodostettavia laskuja.', 'err'); return; }
    const total = ok.reduce((s, p) => s + INV.totals(p.inv.lines).gross, 0);
    const already = ok.filter(p => this.done[kind][p.key]).length;
    if (!confirm(`Muodostetaanko ${this.count(kind, ok.length)}, yhteensä ${INV.money(total)}?` +
      (bad ? `\n${bad} virheellistä ohitetaan.` : '') +
      (already ? `\n\nHuom: ${already} näistä on jo muodostettu tässä istunnossa – niistä tulee uudet laskut uusilla numeroilla.` : '') +
      `\n\nLaskunumerot ${ok[0].inv.number}–${ok[ok.length - 1].inv.number}.`)) return;
    const folderMode = ST.mode === 'folder';
    if (folderMode) {
      if (!READY) { this.setStatus(kind, 'Valitse ensin Laskutus-kansio (Rekisteri-välilehti).', 'err'); return; }
      if ((await ST.permission(true)) !== 'granted') { this.setStatus(kind, 'Kansioon ei annettu kirjoitusoikeutta.', 'err'); return; }
    }
    const b = this.biller(kind);
    const made = [];
    try {
      for (let k = 0; k < ok.length; k++) {
        const p = ok[k];
        this.setStatus(kind, `Muodostetaan ${k + 1}/${ok.length}…`, 'work');
        const inv = await this.complete(kind, p, p.inv.number);
        const doc = INV.buildPdf(inv, pdfOpts());
        const item = { inv, blob: doc.output('blob'), name: fileNameFor(inv), path: '', estates: p.estates, units: p.units };
        if (folderMode) {
          item.path = this.folder(kind, inv) + '/' + item.name;
          if (k === 0 && await ST.exists(item.path) && !confirm(`Kansiossa on jo tiedosto ${item.name}. Korvataanko samannimiset tiedostot?`)) {
            this.setStatus(kind, 'Peruttu.', ''); return;
          }
          await ST.writeFile(item.path, item.blob);
        }
        await recordInvoice(item, b, numberPart(inv.number, b), item.path, false);
        this.done[kind][p.key] = item;
        made.push(item);
      }
      await saveState();
    } catch (e) {
      await saveState().catch(() => {});
      this.setStatus(kind, `Virhe laskun ${made.length + 1} kohdalla: ${e.message}. ${made.length} laskua ehdittiin muodostaa.`, 'err');
      this.afterGenerate(kind);
      return;
    }
    const what = this.count(kind, made.length);
    const folder = made.length ? this.folder(kind, made[0].inv) : '';
    if (folderMode) {
      await ST.writeFile(folder + '/yhteenveto.csv', this.summaryCsv(kind, made)).catch(() => {});
      this.setStatus(kind, `✓ ${what} tallennettu kansioon ${ST.folderName()}/${folder} (+ yhteenveto.csv). Lähetä ne korttien Sähköposti-painikkeilla.`, 'ok');
      refreshArchive().catch(() => {});
    } else {
      renderLocalArchive();
      const files = made.map(m => new File([m.blob], m.name, { type: 'application/pdf' }));
      files.push(new File([this.summaryCsv(kind, made)], 'yhteenveto.csv', { type: 'text/csv' }));
      if (ST.canShareFile(files)) {
        try { await ST.share(files, what, ''); this.setStatus(kind, `✓ ${what} muodostettu. Jos valitsit OneDriven, tallenna kansioon Laskutus/${folder}.`, 'ok'); }
        catch (e) { this.setStatus(kind, `✓ ${what} muodostettu. Jaa ne korttien Jaa PDF -painikkeilla.`, 'ok'); }
      } else {
        made.forEach((m, i) => setTimeout(() => ST.download(m.blob, m.name), i * 400));
        this.setStatus(kind, `✓ ${what} ladattu laitteelle. Siirrä ne OneDriveen kansioon Laskutus/${folder}.`, 'ok');
      }
    }
    this.afterGenerate(kind);
  },
  async afterGenerate(kind) {
    this.manual[kind] = '';
    await this.firstNumber(kind);
    this.render(kind);
    suggestNumber();
  },
  summaryCsv(kind, made) {
    const q = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const head = kind === 'self'
      ? ['Laskunumero', 'Laskun päivä', 'Maksupäivä', 'Saaja', 'Tilinumero', 'Sähköposti', 'Veroton', 'ALV', 'Yhteensä', 'Tiedosto']
      : kind === 'road'
      ? ['Laskunumero', 'Laskun päivä', 'Eräpäivä', 'Viitenumero', 'Maksaja', 'Kiinteistöt', 'Tieyksiköt', 'Sähköposti', 'Veroton', 'ALV', 'Yhteensä', 'Tiedosto']
      : ['Laskunumero', 'Laskun päivä', 'Eräpäivä', 'Viitenumero', 'Maksaja', 'Tilat', 'Sähköposti', 'Veroton', 'ALV', 'Yhteensä', 'Tiedosto'];
    const money = (n) => (Math.round(n * 100) / 100).toFixed(2).replace('.', ',');
    const rows = made.map(m => {
      const i = m.inv, t = INV.totals(i.lines);
      return kind === 'self'
        ? [i.number, INV.dateFi(i.date), INV.dateFi(i.due), i.customer.name, i.customer.iban, i.emails.join('; '), money(t.net), money(t.vat), money(t.gross), m.name]
        : kind === 'road'
        ? [i.number, INV.dateFi(i.date), INV.dateFi(i.due), i.reference, i.customer.name, (m.estates || []).join(', '),
           String(m.units ?? '').replace('.', ','), i.emails.join('; '), money(t.net), money(t.vat), money(t.gross), m.name]
        : [i.number, INV.dateFi(i.date), INV.dateFi(i.due), i.reference, i.customer.name, (m.estates || []).join(', '),
           i.emails.join('; '), money(t.net), money(t.vat), money(t.gross), m.name];
    });
    const sum = made.reduce((a, m) => { const t = INV.totals(m.inv.lines); return [a[0] + t.net, a[1] + t.vat, a[2] + t.gross]; }, [0, 0, 0]);
    const totalRow = head.map(() => '');
    totalRow[0] = 'YHTEENSÄ';
    totalRow[head.length - 4] = money(sum[0]); totalRow[head.length - 3] = money(sum[1]); totalRow[head.length - 2] = money(sum[2]);
    return new Blob(['\ufeff' + [head, ...rows, totalRow].map(r => r.map(q).join(';')).join('\r\n')], { type: 'text/csv' });
  },
  onCard(kind, e) {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const p = this.plan[kind][Number(btn.dataset.k)];
    const done = p && this.done[kind][p.key];
    const st = (m, c) => this.setStatus(kind, m, c);
    if (btn.dataset.act === 'preview') this.preview(kind, Number(btn.dataset.k));
    if (!done) return;
    if (btn.dataset.act === 'open') openBlob(done.blob);
    if (btn.dataset.act === 'share') sharePdf(done, st);
    if (btn.dataset.act === 'mail') {
      location.href = mailtoHref(done.inv);
      st(`Liitä viestiin tiedosto ${done.name}${done.path ? ` (OneDrive › ${ST.folderName()}/${done.path.split('/').slice(0, -1).join('/')})` : ''}.`, 'ok');
    }
  },
  async reload(kind) {
    this.done[kind] = {};
    this.setStatus(kind, 'Päivitetään…', 'work');
    const reread = await reloadRegistry();
    if (!reread) await this.refresh();
    this.setStatus(kind, reread ? 'Rekisteri luettu uudelleen.' : 'Päivitetty. (Puhelimessa muuttunut rekisteri valitaan uudelleen Rekisteri-välilehdeltä.)', 'ok');
  },
  init() {
    const today = INV.today();
    setD('selfDate', today);
    setD('selfDue', INV.addDays(today, 14));
    const d = new Date();
    $('selfBatch').value = `Itselaskutus ${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
    setD('roadDate', today);
    $('roadTerms').value = 14;
    setD('roadDue', INV.addDays(today, 14));
    DATE_HOOKS.roadDate = () => setD('roadDue', INV.addDays(getD('roadDate') || INV.today(), num($('roadTerms').value)));
    DATE_HOOKS.roadDue = () => { const a = getD('roadDate'), b = getD('roadDue'); if (a && b) $('roadTerms').value = Math.max(0, INV.daysBetween(a, b)); };
    $('roadTerms').oninput = DATE_HOOKS.roadDate;
    setD('drainDate', today);
    $('drainTerms').value = 21;
    setD('drainDue', INV.addDays(today, 21));
    DATE_HOOKS.drainDate = () => setD('drainDue', INV.addDays(getD('drainDate') || INV.today(), num($('drainTerms').value)));
    DATE_HOOKS.drainDue = () => { const a = getD('drainDate'), b = getD('drainDue'); if (a && b) $('drainTerms').value = Math.max(0, INV.daysBetween(a, b)); };
    $('drainTerms').oninput = DATE_HOOKS.drainDate;
    $('drainNote').addEventListener('input', () => { this.drainNoteEdited = true; });
    $('drainAreas').addEventListener('input', (e) => {
      const a = e.target.dataset.area;
      if (a === undefined) return;
      this.drainAmt[a] = e.target.value;
      this.renderDrain();
    });
    $('drainBiller').onchange = async () => {
      this.manual.drain = '';
      const b = this.biller('drain');
      if (b && b.terms) { $('drainTerms').value = b.terms; DATE_HOOKS.drainDate(); }
      await this.firstNumber('drain'); this.renderDrain();
    };
    $('btnDrainReload').onclick = () => this.reload('drain');
    $('btnDrainAll').onclick = () => this.generateAll('drain');
    $('drainList').addEventListener('click', (e) => this.onCard('drain', e));
    ['self', 'road', 'drain'].forEach(kind => {
      const el = this.noField(kind);
      const onEdit = () => { this.manual[kind] = el.value.trim(); this.render(kind); };
      el.addEventListener('input', onEdit);
      el.addEventListener('change', onEdit);
    });
    $('roadNote').addEventListener('input', () => { this.noteEdited = true; });
    $('selfBiller').onchange = async () => {
      this.manual.self = '';
      const b = this.biller('self');
      if (b && b.terms) setD('selfDue', INV.addDays(getD('selfDate') || INV.today(), b.terms));
      await this.firstNumber('self'); this.renderSelf();
    };
    $('roadBiller').onchange = async () => {
      this.manual.road = '';
      const b = this.biller('road');
      if (b && b.terms) { $('roadTerms').value = b.terms; DATE_HOOKS.roadDate(); }
      await this.firstNumber('road'); this.renderRoad();
    };
    $('btnSelfReload').onclick = () => this.reload('self');
    $('btnRoadReload').onclick = () => this.reload('road');
    $('btnSelfAll').onclick = () => this.generateAll('self');
    $('btnRoadAll').onclick = () => this.generateAll('road');
    $('selfList').addEventListener('click', (e) => this.onCard('self', e));
    $('roadList').addEventListener('click', (e) => this.onCard('road', e));
  }
};
BATCH.init();

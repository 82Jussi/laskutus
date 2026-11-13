/* batch.js – erityisominaisuudet: itselaskutus ja tiekunnan laskutus
 *
 * Molemmat muodostavat erän laskuja rekisterin omalta välilehdeltä:
 *   - Itselaskutus: jokainen rivi on täydellinen (saajan tiedot toistetaan). Saman saajan
 *     (Nimi + Tilinumero) rivit yhdistetään yhdeksi itselaskutukseksi. Laskuttaja (ostaja,
 *     laskun laatija) valitaan ohjelmassa koko erälle.
 *   - Tiekunta: jokaiselle käytössä olevalle osakkaalle oma lasku tieyksiköiden mukaan.
 * Tietokoneella laskut tallennetaan kansioon Laskut/vuosi/Itselaskutus/erä tai
 * Laskut/vuosi/Tiekunnat/tiekunta yhdessä yhteenveto.csv:n kanssa.
 */

/* IBAN-tarkiste (mod 97) */
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
  done: { self: {}, road: {} },     // muodostetut laskut avaimittain
  plan: { self: [], road: [] },     // muodostettavat laskut

  /* ---------- yhteiset ---------- */
  biller(kind) {
    return REG.billers[Number($(kind === 'self' ? 'selfBiller' : 'roadBiller').value) || 0] || null;
  },

  fillBillers() {
    ['selfBiller', 'roadBiller'].forEach(id => {
      const sel = $(id), prev = sel.value;
      sel.innerHTML = billerOptions();
      const keep = prev !== '' && REG.billers[prev] ? prev
        : String(Math.max(0, REG.billers.findIndex(b => billerKey(b) === cfg.lastBiller)));
      sel.value = keep;
    });
  },

  async firstNumber(kind) {
    const el = $(kind === 'self' ? 'selfFirstNo' : 'roadFirstNo');
    if (el.dataset.manual === '1' && el.value.trim()) return;
    const b = this.biller(kind);
    el.value = b ? (b.prefix || '') + await nextNumberFor(b) : '';
    el.dataset.manual = '';
  },

  /* Laskunumerot: ensimmäinen kentästä, seuraavat juoksevasti */
  numberAt(kind, k) {
    const b = this.biller(kind);
    const v = $(kind === 'self' ? 'selfFirstNo' : 'roadFirstNo').value.trim();
    const n = numberPart(v, b) || 1;
    return (b && b.prefix ? b.prefix : '') + (n + k);
  },

  setStatus(kind, msg, cls = '') {
    const el = $(kind === 'self' ? 'selfStatus' : 'roadStatus');
    el.className = 'status ' + cls;
    el.textContent = msg || '';
  },

  /* "1 itselaskutus" / "3 itselaskutusta", "1 lasku" / "3 laskua" */
  count(kind, n) {
    return kind === 'self' ? `${n} itselaskutus${n === 1 ? '' : 'ta'}` : `${n} lasku${n === 1 ? '' : 'a'}`;
  },

  async refresh() {
    this.fillBillers();
    if (cfg.featSelf) { await this.firstNumber('self'); this.renderSelf(); }
    if (cfg.featRoad) { this.fillRoads(); await this.firstNumber('road'); this.renderRoad(); }
  },

  /* ===================================================================== */
  /* Itselaskutus                                                          */
  /* ===================================================================== */
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
      // saman saajan tietojen pitää olla samat kaikilla riveillä
      for (const [fld, label] of [['addr', 'osoite'], ['zip', 'postinumero'], ['city', 'postitoimipaikka'], ['email', 'sähköposti']]) {
        const vals = [...new Set(g.rows.map(r => r[fld]))];
        if (vals.length > 1) errs.push(`Ristiriita: ${label} eroaa riveillä ${g.rows.map(r => r.row).join(', ')} (${vals.map(v => v || 'tyhjä').join(' / ')})`);
      }
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
      plan.push({
        key: g.key, errs, warns,
        inv: {
          kind: 'self',
          customer: { name: f.name, addr: f.addr, zip: f.zip, city: f.city, email: f.email, iban: fmtIban(f.iban) },
          emails: f.email ? [f.email] : [],
          sender: b || {},
          lines
        }
      });
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
    $('selfSummary').innerHTML = !rows
      ? '<p class="muted">Rekisterin Itselaskutus-välilehti puuttuu tai on tyhjä.</p>'
      : `<div class="bsum"><span class="pill">${this.count('self', ok.length)}</span>` +
        `<span class="pill">yhteensä ${INV.money(total)}</span>` +
        (bad ? `<span class="pill warn">${bad} virheellistä – ohitetaan</span>` : '') +
        (skipped ? `<span class="pill">${skipped} riviä ei käytössä</span>` : '') + '</div>';
    $('selfList').innerHTML = plan.map((p, k) => this.cardHtml('self', p, k)).join('');
    $('btnSelfAll').disabled = !ok.length;
  },

  /* ===================================================================== */
  /* Tiekunta                                                              */
  /* ===================================================================== */
  fillRoads() {
    const sel = $('roadSel'), prev = sel.value;
    const roads = REG.roads || [];
    sel.innerHTML = roads.length
      ? roads.map((r, i) => `<option value="${i}">${esc(r.name)}${r.active ? '' : ' (ei käytössä)'}</option>`).join('')
      : '<option value="">– rekisterissä ei ole tiekuntia –</option>';
    if (prev !== '' && roads[prev]) sel.value = prev;
    else { const a = roads.findIndex(r => r.active); if (a >= 0) sel.value = String(a); }
  },

  road() { return (REG.roads || [])[Number($('roadSel').value)] || null; },

  buildRoad() {
    const road = this.road();
    if (!road) return { plan: [], road: null, global: [] };
    const members = (REG.roadMembers || []).filter(m => m.roadId === road.id);
    const act = members.filter(m => m.active);
    const totalUnits = act.reduce((s, m) => s + (m.units || 0), 0);
    const global = [];
    if (!road.active) global.push('Tiekunta on merkitty rekisterissä "ei käytössä".');
    let perUnit = 0;
    if (road.method === 'budget') {
      if (!road.budget) global.push('Kokonaisbudjetti puuttuu Tiekunnat-välilehdeltä.');
      if (!totalUnits) global.push('Osakkaiden tieyksiköitä ei ole.');
      perUnit = totalUnits ? Math.round(road.budget / totalUnits * 10000) / 10000 : 0;
    } else {
      if (!road.unitPrice) global.push('Yksikköhinta puuttuu Tiekunnat-välilehdeltä.');
      perUnit = road.unitPrice;
    }
    const year = road.year || String(new Date().getFullYear());
    const b = this.biller('road');
    const plan = act.map(m => {
      const errs = [], warns = [];
      const c = m.custId ? REG.customers.find(x => x.id === m.custId) : null;
      if (m.custId && !c) warns.push(`Asiakasnumeroa ${m.custId} ei löydy asiakasrekisteristä`);
      const cust = {
        name: m.name || (c && c.name) || '',
        recipient: c && !m.name ? c.recipient : '',
        addr: m.addr || (c && c.addr) || '',
        zip: m.zip || (c && c.zip) || '',
        city: m.city || (c && c.city) || '',
        country: m.country || (c && c.country) || '',
        id: m.custId
      };
      const mails = m.email ? splitEmails(m.email) : c ? (c.mails.length ? c.mails : splitEmails(c.email)) : [];
      if (!cust.name) errs.push(`Nimi puuttuu (rivi ${m.row})`);
      if (!cust.addr || !cust.zip || !cust.city) warns.push('Osoite puutteellinen – ei voi postittaa');
      if (!mails.length) warns.push('Ei sähköpostiosoitetta');
      const lines = [];
      if (m.units > 0) {
        lines.push({ desc: road.text || `Tieyksikkömaksu ${year}`, qty: m.units, unit: 'tieyks.', price: perUnit, vat: road.vat });
      }
      if (road.baseFee) lines.push({ desc: 'Perusmaksu', qty: 1, unit: 'kpl', price: road.baseFee, vat: road.vat });
      if (m.other) lines.push({ desc: m.info || 'Muu maksu', qty: 1, unit: 'kpl', price: m.other, vat: road.vat });
      if (!lines.length) errs.push('Ei laskutettavaa (tieyksiköt ja maksut puuttuvat)');
      if (global.length) errs.push(...global);
      return {
        key: road.id + '|' + (m.memberNo || m.row), errs, warns,
        info: [m.memberNo && 'osakas ' + m.memberNo, m.estate, INV.num(m.units, 3) + ' tieyks.'].filter(Boolean).join(' · '),
        inv: {
          kind: 'road',
          customer: cust, emails: mails, sender: b || {}, lines,
          extraMeta: [['Tiekunta', road.name], ['Kiinteistötunnus', m.estate],
            ['Tieyksiköt', m.units ? INV.num(m.units, 3) : ''], ['Osakasnumero', m.memberNo]]
        }
      };
    });
    return { plan, road, global, totalUnits, perUnit, skipped: members.length - act.length };
  },

  renderRoad() {
    const r = this.buildRoad();
    this.plan.road = r.plan;
    if (!r.road) {
      $('roadSummary').innerHTML = '<p class="muted">Rekisterin Tiekunnat-välilehti puuttuu tai on tyhjä.</p>';
      $('roadList').innerHTML = '';
      $('btnRoadAll').disabled = true;
      return;
    }
    const ok = r.plan.filter(p => !p.errs.length);
    ok.forEach((p, k) => { p.inv.number = this.numberAt('road', k); });
    r.plan.filter(p => p.errs.length).forEach(p => { p.inv.number = ''; });
    const total = ok.reduce((s, p) => s + INV.totals(p.inv.lines).gross, 0);
    const net = ok.reduce((s, p) => s + INV.totals(p.inv.lines.filter(l => l.unit === 'tieyks.')).net, 0);
    const diff = r.road.method === 'budget' ? Math.round((net - r.road.budget) * 100) / 100 : 0;
    $('roadSummary').innerHTML =
      `<div class="bsum"><span class="pill">${this.count('road', ok.length)}</span>` +
      `<span class="pill">${INV.num(r.totalUnits, 3)} tieyksikköä</span>` +
      `<span class="pill">${INV.price(r.perUnit)} € / tieyks.</span>` +
      `<span class="pill">yhteensä ${INV.money(total)}</span>` +
      (r.road.method === 'budget' && r.road.budget
        ? `<span class="pill">budjetti ${INV.money(r.road.budget)}${diff ? ` (pyöristysero ${INV.money(diff)})` : ''}</span>` : '') +
      (r.plan.length - ok.length ? `<span class="pill warn">${r.plan.length - ok.length} virheellistä – ohitetaan</span>` : '') +
      (r.skipped ? `<span class="pill">${r.skipped} osakasta ei käytössä</span>` : '') + '</div>' +
      (r.global.length ? `<div class="status err">${r.global.map(esc).join('<br>')}</div>` : '');
    $('roadList').innerHTML = r.plan.map((p, k) => this.cardHtml('road', p, k)).join('');
    $('btnRoadAll').disabled = !ok.length;
  },

  /* ===================================================================== */
  /* Kortit                                                                */
  /* ===================================================================== */
  cardHtml(kind, p, k) {
    const c = p.inv.customer, t = INV.totals(p.inv.lines);
    const done = this.done[kind][p.key];
    const addr = [c.addr, [c.zip, c.city].filter(Boolean).join(' '), p.inv.emails.join(', '),
      kind === 'self' ? c.iban : p.info].filter(Boolean).join(' · ');
    const lines = p.inv.lines.map(l =>
      `<li><span>${esc(l.desc)} · ${INV.num(l.qty, 3)} ${esc(l.unit)} × ${INV.price(l.price)} · ALV ${fmtVat(l.vat)}</span>` +
      `<span>${INV.money(INV.lineTotal(l))}</span></li>`).join('');
    const msgs = [...p.errs, ...p.warns.map(w => '⚠ ' + w)];
    const nro = done ? done.inv.number : p.inv.number;
    let btns = `<button type="button" class="btn ghost sm" data-act="preview" data-k="${k}"${p.errs.length ? ' disabled' : ''}>Esikatsele</button>`;
    if (done) {
      btns = `<button type="button" class="btn ghost sm" data-act="open" data-k="${k}">Avaa PDF</button>` +
        (ST.canShareFile(new File([done.blob], done.name, { type: 'application/pdf' }))
          ? `<button type="button" class="btn sm" data-act="share" data-k="${k}">Jaa PDF</button>` : '') +
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

  /* Täydentää laskun yhteiset tiedot (päivät, käyttäjän lisäteksti, laskuttaja, numero, viite) */
  async complete(kind, p, number) {
    const b = this.biller(kind);
    const inv = { ...p.inv, number, sender: { ...(b || {}), logoData: await logoFor(b) } };
    if (kind === 'self') {
      inv.date = getD('selfDate') || INV.today();
      inv.due = getD('selfDue');
      inv.note = $('selfNote').value.trim();
      inv.reference = '';
    } else {
      inv.date = getD('roadDate') || INV.today();
      inv.due = getD('roadDue');
      inv.terms = num($('roadTerms').value);
      inv.note = $('roadNote').value.trim();
      inv.reference = INV.reference(number);
    }
    return inv;
  },

  checkCommon(kind) {
    const ids = kind === 'self' ? ['selfDate', 'selfDue'] : ['roadDate', 'roadDue'];
    if (ids.map(normalizeD).includes(null)) return 'Tarkista päivämäärä (muoto pp.kk.vvvv).';
    if (!this.biller(kind)) return 'Laskuttajarekisteri puuttuu.';
    if (!getD(ids[1])) return kind === 'self' ? 'Maksupäivä puuttuu.' : 'Eräpäivä puuttuu.';
    if (kind === 'self' && !$('selfBatch').value.trim()) return 'Anna erälle nimi.';
    return '';
  },

  folder(kind, inv) {
    const sub = kind === 'self' ? 'Itselaskutus/' + safeName($('selfBatch').value) : 'Tiekunnat/' + safeName(this.road().name);
    return outFolderFor(inv) + '/' + sub;
  },

  async preview(kind, k) {
    const err = this.checkCommon(kind);
    if (err) { this.setStatus(kind, err, 'err'); return; }
    const p = this.plan[kind][k];
    const inv = await this.complete(kind, p, p.inv.number || 'LUONNOS');
    openBlob(INV.buildPdf(inv, pdfOpts()).output('blob'));
  },

  async generateAll(kind) {
    const err = this.checkCommon(kind);
    if (err) { this.setStatus(kind, err, 'err'); return; }
    if (kind === 'self') this.renderSelf(); else this.renderRoad();
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
        const item = { inv, blob: doc.output('blob'), name: fileNameFor(inv), path: '' };
        if (folderMode) {
          item.path = this.folder(kind, inv) + '/' + item.name;
          if (k === 0 && await ST.exists(item.path) &&
              !confirm(`Kansiossa on jo tiedosto ${item.name}. Korvataanko samannimiset tiedostot?`)) {
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
        try {
          await ST.share(files, what, '');
          this.setStatus(kind, `✓ ${what} muodostettu. Jos valitsit OneDriven, tallenna kansioon Laskutus/${folder}.`, 'ok');
        } catch (e) {
          this.setStatus(kind, `✓ ${what} muodostettu. Jaa ne korttien Jaa PDF -painikkeilla.`, 'ok');
        }
      } else {
        made.forEach((m, i) => setTimeout(() => ST.download(m.blob, m.name), i * 400));
        this.setStatus(kind, `✓ ${what} ladattu laitteelle. Siirrä ne OneDriveen kansioon Laskutus/${folder}.`, 'ok');
      }
    }
    this.afterGenerate(kind);
  },

  async afterGenerate(kind) {
    const el = $(kind === 'self' ? 'selfFirstNo' : 'roadFirstNo');
    el.dataset.manual = '';
    await this.firstNumber(kind);
    if (kind === 'self') this.renderSelf(); else this.renderRoad();
    suggestNumber();
  },

  summaryCsv(kind, made) {
    const q = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const head = kind === 'self'
      ? ['Laskunumero', 'Laskun päivä', 'Maksupäivä', 'Saaja', 'Tilinumero', 'Sähköposti', 'Veroton', 'ALV', 'Yhteensä', 'Tiedosto']
      : ['Laskunumero', 'Laskun päivä', 'Eräpäivä', 'Viitenumero', 'Osakas', 'Kiinteistötunnus', 'Tieyksiköt', 'Sähköposti', 'Veroton', 'ALV', 'Yhteensä', 'Tiedosto'];
    const money = (n) => (Math.round(n * 100) / 100).toFixed(2).replace('.', ',');
    const rows = made.map(m => {
      const i = m.inv, t = INV.totals(i.lines);
      const meta = Object.fromEntries((i.extraMeta || []).map(x => x));
      return kind === 'self'
        ? [i.number, INV.dateFi(i.date), INV.dateFi(i.due), i.customer.name, i.customer.iban, i.emails.join('; '),
           money(t.net), money(t.vat), money(t.gross), m.name]
        : [i.number, INV.dateFi(i.date), INV.dateFi(i.due), i.reference, i.customer.name, meta['Kiinteistötunnus'] || '',
           String(meta['Tieyksiköt'] || '').replace(/\s/g, ''), i.emails.join('; '), money(t.net), money(t.vat), money(t.gross), m.name];
    });
    const sum = made.reduce((a, m) => { const t = INV.totals(m.inv.lines); return [a[0] + t.net, a[1] + t.vat, a[2] + t.gross]; }, [0, 0, 0]);
    const totalRow = head.map(() => '');
    totalRow[0] = 'YHTEENSÄ';
    totalRow[head.length - 4] = money(sum[0]); totalRow[head.length - 3] = money(sum[1]); totalRow[head.length - 2] = money(sum[2]);
    return new Blob(['\ufeff' + [head, ...rows, totalRow].map(r => r.map(q).join(';')).join('\r\n')], { type: 'text/csv' });
  },

  /* ---------- tapahtumat ---------- */
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
    DATE_HOOKS.roadDue = () => {
      const a = getD('roadDate'), b = getD('roadDue');
      if (a && b) $('roadTerms').value = Math.max(0, INV.daysBetween(a, b));
    };
    $('roadTerms').oninput = DATE_HOOKS.roadDate;

    ['selfFirstNo', 'roadFirstNo'].forEach(id => $(id).addEventListener('input', () => {
      $(id).dataset.manual = '1';
      if (id === 'selfFirstNo') this.renderSelf(); else this.renderRoad();
    }));
    $('selfBiller').onchange = async () => {
      $('selfFirstNo').dataset.manual = '';
      const b = this.biller('self');
      if (b && b.terms) setD('selfDue', INV.addDays(getD('selfDate') || INV.today(), b.terms));
      await this.firstNumber('self'); this.renderSelf();
    };
    $('roadBiller').onchange = async () => {
      $('roadFirstNo').dataset.manual = '';
      const b = this.biller('road');
      if (b && b.terms) { $('roadTerms').value = b.terms; DATE_HOOKS.roadDate(); }
      await this.firstNumber('road'); this.renderRoad();
    };
    $('roadSel').onchange = () => this.renderRoad();
    $('btnSelfReload').onclick = () => { this.done.self = {}; this.setStatus('self', ''); this.refresh(); };
    $('btnRoadReload').onclick = () => { this.done.road = {}; this.setStatus('road', ''); this.refresh(); };
    $('btnSelfAll').onclick = () => this.generateAll('self');
    $('btnRoadAll').onclick = () => this.generateAll('road');
    $('selfList').addEventListener('click', (e) => this.onCard('self', e));
    $('roadList').addEventListener('click', (e) => this.onCard('road', e));
  }
};

BATCH.init();

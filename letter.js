/* letter.js – Massakirje (erityisominaisuus)
 *
 * Kirje muotoillaan liitteen "Osuuden palautus osakkaille" -kirjepohjan tyyliin:
 *   - ylhäällä lähettäjän nimi lihavoituna vasemmalla ja päiväys oikealla
 *   - vastaanottajan osoite E5-ikkunakuoren (156 × 220 mm) pienen ikkunan 30 × 90 mm kohdalla,
 *     samassa paikassa kuin laskuissa
 *   - otsikko, tervehdys (lihavoitu), viesti ja allekirjoitus
 * Viestissä: **lihavoitu**, rivin loppuun ___ = täyttöviiva, tyhjä rivi = kappaleväli.
 * Muuttujat: {nimi} {pvm} {lahettaja} {allekirjoittaja} {asema} {puhelin} {sahkoposti} {osoite} {lisatieto}
 * Vastaanottajat luetaan rekisterin välilehdeltä "Kirjeen vastaanottajat".
 */

const LETTER_KEY = 'laskutus.letter.v1';
const LETTER_DEFAULT = {
  title: '',
  greeting: 'Hyvä vastaanottaja,',
  body: '',
  signer: '',
  role: '',
  closing: 'Ystävällisin terveisin,\n**{lahettaja}**\n{allekirjoittaja}\n{asema}\n{puhelin}\n{sahkoposti}',
  duplex: false
};

/* ---------- PDF ---------- */
const LETTERPDF = {
  /* yksi kirje dokumenttiin doc (lisätään uusille sivuille, jos doc ei ole tyhjä) */
  draw(doc, L, opts = {}) {
    const PT = 0.3528;
    const XL = 18, XR = 192, W = XR - XL, BOTTOM = 282;
    const T = INV.theme(opts.style, opts.color);
    const has = (v) => v !== undefined && v !== null && String(v).trim() !== '';
    const font = (size, bold = false, color = T.ink) => { doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(...color); };
    const tw = (s) => doc.getTextWidth(String(s));
    const cut = (s, w) => { let x = String(s); while (tw(x) > w && x.length > 1) x = x.slice(0, -2) + '…'; return x; };
    const startPage = doc.getNumberOfPages();
    if (opts.newPage) doc.addPage();
    const first = doc.getNumberOfPages();
    const s = L.sender, r = L.recipient;

    /* ylätunniste */
    const header = (cont) => {
      font(10, true);
      doc.text(cut(s.name || '', 120), XL, 17);
      font(10);
      doc.text(cont ? `${INV.dateFi(L.date)} (jatkuu)` : INV.dateFi(L.date), XR, 17, { align: 'right' });
    };
    header(false);

    /* osoite E5-ikkunaan (sama alue kuin laskuissa) */
    const foreign = (cn) => has(cn) && !/^(suomi|finland|fi)$/i.test(cn.trim());
    const cLines = [r.name, r.recipient, r.addr, [r.zip, r.city].filter(has).join(' '), foreign(r.country) ? r.country : ''].filter(has);
    const AX = 22, AW = 70, AMAX = 60.5;
    let asz = 11, AY = 44.5, aLines = [];
    const wrapA = (str, size) => { font(size); return doc.splitTextToSize(String(str), AW); };
    for (;;) {
      aLines = [];
      cLines.forEach(l => wrapA(l, asz).forEach(x => aLines.push(x)));
      AY = aLines.length > 4 ? 43.6 : 44.5;
      if (AY + (aLines.length - 1) * asz * PT * 1.3 <= AMAX || asz <= 6.5) break;
      asz -= 0.25;
    }
    const alh = asz * PT * 1.3;
    aLines.forEach((x, k) => { font(asz); doc.text(cut(x, AW), AX, AY + k * alh); });

    /* runko: rivit → sanat (lihavointi **...**) → rivitys */
    let y = 80;
    const SZ = 11, LH = SZ * PT * 1.3, PARA = 2.6;
    const newPage = () => { doc.addPage(); header(true); y = 28; };
    const need = (h) => { if (y + h > BOTTOM) newPage(); };
    const tokens = (line, baseBold) => {
      const out = [];
      String(line).split(/(\*\*[^*]+\*\*)/).forEach(part => {
        if (!part) return;
        const b = /^\*\*[^*]+\*\*$/.test(part);
        const txt = b ? part.slice(2, -2) : part;
        txt.split(/(\s+)/).forEach(w => { if (w) out.push({ w, b: b || baseBold }); });
      });
      return out;
    };
    const measure = (t) => { font(SZ, t.b); return tw(t.w); };
    /* kirjoittaa yhden kappaleen; palauttaa viimeisen rivin loppukohdan x */
    const paragraph = (line, baseBold = false, maxW = W) => {
      const tk = tokens(line, baseBold);
      let rows = [[]], wcur = 0;
      tk.forEach(t => {
        const isSp = /^\s+$/.test(t.w);
        const w = measure(t);
        if (!isSp && wcur + w > maxW && rows[rows.length - 1].length) { rows.push([]); wcur = 0; }
        if (isSp && !rows[rows.length - 1].length) return;
        rows[rows.length - 1].push(t); wcur += w;
      });
      let endX = XL;
      rows.forEach(row => {
        while (row.length && /^\s+$/.test(row[row.length - 1].w)) row.pop();
        need(LH);
        let x = XL;
        row.forEach(t => { font(SZ, t.b); doc.text(t.w, x, y); x += tw(t.w); });
        endX = x;
        y += LH;
      });
      return endX;
    };
    const fill = (txt) => String(txt || '')
      .replace(/\{nimi\}/g, r.name || '')
      .replace(/\{lisatieto\}/g, r.info || '')
      .replace(/\{pvm\}/g, INV.dateFi(L.date))
      .replace(/\{lahettaja\}/g, s.name || '')
      .replace(/\{allekirjoittaja\}/g, L.signer || '')
      .replace(/\{asema\}/g, L.role || '')
      .replace(/\{puhelin\}/g, s.phone || '')
      .replace(/\{sahkoposti\}/g, s.email || '')
      .replace(/\{osoite\}/g, [s.addr, [s.zip, s.city].filter(has).join(' ')].filter(has).join(', '));

    if (has(L.title)) { need(8); font(13, true); doc.splitTextToSize(fill(L.title), W).forEach(l => { doc.text(l, XL, y); y += 13 * PT * 1.3; }); y += PARA + 1; }
    if (has(L.greeting)) { paragraph(fill(L.greeting), true); y += PARA; }

    const bodyLines = fill(L.body).replace(/\r/g, '').split('\n');
    bodyLines.forEach((ln, i) => {
      if (!ln.trim()) { y += PARA; return; }
      const m = ln.match(/^(.*?)\s*_{3,}\s*$/);
      if (m) {                                   // täyttöviiva
        need(LH + 3);
        const endX = paragraph(m[1], false, 95);
        const yy = y - LH + 1.2;
        doc.setDrawColor(120, 120, 120); doc.setLineWidth(0.25);
        doc.line(Math.max(endX + 3, XL + 98), yy, XR, yy);
        y += 2.6;
        return;
      }
      paragraph(ln);
      const next = bodyLines[i + 1];
      if (next !== undefined && next.trim() && !/_{3,}\s*$/.test(ln)) y += 0.6;
    });

    /* allekirjoitus: tyhjäksi jäävät muuttujarivit pudotetaan pois */
    const closing = String(L.closing || '').replace(/\r/g, '').split('\n')
      .filter(l => !/^\s*(\*\*)?\{(allekirjoittaja|asema|puhelin|sahkoposti|osoite|lisatieto)\}(\*\*)?\s*$/.test(l) || has(fill(l).replace(/\*/g, '')));
    if (closing.some(l => l.trim())) {
      y += PARA + 2;
      need(Math.min(closing.length * LH, 40));
      closing.forEach(l => { if (!l.trim()) { y += PARA; return; } paragraph(fill(l)); });
    }

    /* sivunumerot monisivuisille kirjeille */
    const last = doc.getNumberOfPages(), n = last - first + 1;
    if (n > 1) for (let p = first; p <= last; p++) { doc.setPage(p); font(8, false, T.grey); doc.text(`${p - first + 1}/${n}`, XR, 290, { align: 'right' }); }
    doc.setPage(last);
    /* kaksipuolinen tulostus: jokainen kirje alkaa parittomalta sivulta */
    if (opts.duplex && n % 2 === 1 && opts.padForNext) doc.addPage();
    return n;
  },

  build(letters, opts = {}) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    letters.forEach((L, i) => this.draw(doc, L, { ...opts, newPage: i > 0, padForNext: i < letters.length - 1 }));
    return doc;
  }
};

/* ---------- Käyttöliittymä ---------- */
const LETTER = {
  draft: { ...LETTER_DEFAULT },
  done: {},          // vastaanottaja-avain -> { blob, name, path, L }
  combined: null,
  biller() { return REG.billers[Number($('letBiller').value) || 0] || null; },
  setStatus(msg, cls = '') { const el = $('letStatus'); el.className = 'status ' + cls; el.textContent = msg || ''; },

  load() {
    try { this.draft = { ...LETTER_DEFAULT, ...(JSON.parse(localStorage.getItem(LETTER_KEY) || '{}')) }; } catch (_) {}
    $('letTitle').value = this.draft.title;
    $('letGreeting').value = this.draft.greeting;
    $('letBody').value = this.draft.body;
    $('letSigner').value = this.draft.signer;
    $('letRole').value = this.draft.role;
    $('letClosing').value = this.draft.closing;
    $('letDuplex').checked = !!this.draft.duplex;
  },
  save() {
    this.draft = {
      title: $('letTitle').value, greeting: $('letGreeting').value, body: $('letBody').value,
      signer: $('letSigner').value, role: $('letRole').value, closing: $('letClosing').value,
      duplex: $('letDuplex').checked, biller: billerKey(this.biller())
    };
    try { localStorage.setItem(LETTER_KEY, JSON.stringify(this.draft)); } catch (_) {}
  },
  fillBillers() {
    const sel = $('letBiller'), prev = sel.value;
    sel.innerHTML = billerOptions();
    let keep = prev !== '' && REG.billers[prev] ? prev : '';
    if (keep === '' && this.draft.biller) { const i = REG.billers.findIndex(b => billerKey(b) === this.draft.biller); if (i >= 0) keep = String(i); }
    if (keep === '') keep = String(Math.max(0, REG.billers.findIndex(b => billerKey(b) === cfg.lastBiller)));
    sel.value = keep;
  },
  recipients() { return (REG.letters || []).filter(r => r.active); },
  key(r) { return SEARCH.fold(r.name + '|' + r.addr + '|' + r.zip).replace(/\s+/g, ' '); },
  build(r) {
    const b = this.biller() || {};
    return { sender: b, recipient: r, date: getD('letDate') || INV.today(), title: $('letTitle').value.trim(),
      greeting: $('letGreeting').value.trim(), body: $('letBody').value, signer: $('letSigner').value.trim(),
      role: $('letRole').value.trim(), closing: $('letClosing').value };
  },
  check() {
    if (normalizeD('letDate') === null) return 'Tarkista päiväys (muoto pp.kk.vvvv).';
    if (!REG.billers.length) return 'Laskuttajarekisteri puuttuu (lähettäjän tiedot).';
    if (!$('letBody').value.trim()) return 'Kirjoita kirjeen viesti.';
    return '';
  },
  refresh() {
    this.fillBillers();
    this.render();
  },
  render() {
    const all = REG.letters || [];
    const list = this.recipients();
    const off = all.length - list.length;
    const keys = new Map();
    list.forEach(r => { const k = this.key(r); keys.set(k, (keys.get(k) || 0) + 1); });
    const noAddr = list.filter(r => !r.addr || !r.zip || !r.city).length;
    $('letSummary').innerHTML = !all.length
      ? '<p class="muted">Rekisterin välilehti "Kirjeen vastaanottajat" puuttuu tai on tyhjä.</p>'
      : `<div class="bsum"><span class="pill">${list.length} vastaanottaja${list.length === 1 ? '' : 'a'}</span>` +
        (noAddr ? `<span class="pill warn">${noAddr} ilman täydellistä osoitetta</span>` : '') +
        (off ? `<span class="pill">${off} ei käytössä</span>` : '') + '</div>';
    $('letList').innerHTML = list.map((r, k) => {
      const d = this.done[this.key(r)];
      const warns = [];
      if (!r.addr || !r.zip || !r.city) warns.push('Osoite puutteellinen – ei voi postittaa');
      if (keys.get(this.key(r)) > 1) warns.push('Sama nimi ja osoite useammalla rivillä');
      const btns = d
        ? `<button type="button" class="btn ghost sm" data-act="open" data-k="${k}">Avaa PDF</button>` +
          (ST.canShareFile(new File([d.blob], d.name, { type: 'application/pdf' })) ? `<button type="button" class="btn sm" data-act="share" data-k="${k}">Jaa PDF</button>` : '') +
          (r.email ? `<button type="button" class="btn ghost sm" data-act="mail" data-k="${k}">Sähköposti</button>` : '')
        : `<button type="button" class="btn ghost sm" data-act="preview" data-k="${k}">Esikatsele</button>`;
      return `<div class="bcard${d ? ' done' : ''}"><div class="bcard-h"><b>${d ? '✓ ' : ''}${esc(r.name)}</b></div>
        <div class="addr">${esc([r.recipient, r.addr, [r.zip, r.city].filter(Boolean).join(' '), r.email, r.info].filter(Boolean).join(' · '))}</div>
        ${warns.length ? `<div class="errs">${warns.map(w => '⚠ ' + esc(w)).join('<br>')}</div>` : ''}
        <div class="row-btns">${btns}</div></div>`;
    }).join('');
    $('btnLetAll').disabled = !list.length;
  },
  fileBase() { return safeName($('letTitle').value.trim() || 'Kirje').slice(0, 60); },
  folder() { return outFolderFor({ date: getD('letDate') || INV.today() }) + '/Kirjeet/' + this.fileBase(); },
  pdfOpts() { return { style: cfg.pdfStyle, color: cfg.pdfColor, duplex: $('letDuplex').checked }; },

  previewOne(k) {
    const err = this.check(); if (err) { this.setStatus(err, 'err'); return; }
    const r = this.recipients()[k]; if (!r) return;
    openBlob(LETTERPDF.build([this.build(r)], this.pdfOpts()).output('blob'));
  },
  async generateAll() {
    const err = this.check(); if (err) { this.setStatus(err, 'err'); return; }
    const list = this.recipients();
    if (!list.length) { this.setStatus('Ei vastaanottajia.', 'err'); return; }
    if (!confirm(`Muodostetaanko kirje ${list.length} vastaanottajalle?\n\nTuloksena yksi tulostettava PDF, jossa kaikki kirjeet, sekä erilliset PDF:t sähköpostia varten.`)) return;
    this.save();
    const folderMode = ST.mode === 'folder';
    if (folderMode) {
      if (!READY) { this.setStatus('Valitse ensin Laskutus-kansio (Rekisteri-välilehti).', 'err'); return; }
      if ((await ST.permission(true)) !== 'granted') { this.setStatus('Kansioon ei annettu kirjoitusoikeutta.', 'err'); return; }
    }
    const letters = list.map(r => this.build(r));
    const base = this.fileBase(), folder = this.folder();
    try {
      this.setStatus('Muodostetaan…', 'work');
      const all = LETTERPDF.build(letters, this.pdfOpts()).output('blob');
      this.combined = { blob: all, name: `Kirjeet_${base}.pdf` };
      this.done = {};
      const used = {};
      for (let i = 0; i < letters.length; i++) {
        const L = letters[i], r = L.recipient;
        let nm = `Kirje_${base}_${safeName(r.name).slice(0, 50)}`;
        used[nm] = (used[nm] || 0) + 1; if (used[nm] > 1) nm += '_' + used[nm];
        const item = { L, blob: LETTERPDF.build([L], { ...this.pdfOpts(), duplex: false }).output('blob'), name: nm + '.pdf', path: '' };
        if (folderMode) { item.path = folder + '/' + item.name; await ST.writeFile(item.path, item.blob); }
        this.done[this.key(r)] = item;
      }
      if (folderMode) {
        await ST.writeFile(folder + '/' + this.combined.name, all);
        await ST.writeFile(folder + '/vastaanottajat.csv', this.csv(list));
        this.setStatus(`✓ ${list.length} kirjettä tallennettu kansioon ${ST.folderName()}/${folder}. Tulosta tiedosto ${this.combined.name}.`, 'ok');
        refreshArchive().catch(() => {});
      } else {
        const f = new File([all], this.combined.name, { type: 'application/pdf' });
        if (ST.canShareFile(f)) {
          try { await ST.share(f, this.combined.name, ''); this.setStatus(`✓ ${list.length} kirjettä muodostettu. Jos valitsit OneDriven, tallenna kansioon Laskutus/${folder}.`, 'ok'); }
          catch (_) { this.setStatus(`✓ ${list.length} kirjettä muodostettu. Avaa tulostettava PDF painikkeesta.`, 'ok'); }
        } else { ST.download(all, this.combined.name); this.setStatus(`✓ ${list.length} kirjettä ladattu laitteelle.`, 'ok'); }
      }
      $('btnLetOpenAll').hidden = false;
    } catch (e) { this.setStatus('Kirjeiden muodostus epäonnistui: ' + e.message, 'err'); }
    this.render();
  },
  csv(list) {
    const q = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const rows = [['Nimi', 'Laskutusvastaanottaja', 'Osoite', 'Postinumero', 'Postitoimipaikka', 'Sähköposti', 'Lisätieto']]
      .concat(list.map(r => [r.name, r.recipient, r.addr, r.zip, r.city, r.email, r.info]));
    return new Blob(['\ufeff' + rows.map(r => r.map(q).join(';')).join('\r\n')], { type: 'text/csv' });
  },
  onCard(e) {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    const k = Number(b.dataset.k), r = this.recipients()[k]; if (!r) return;
    if (b.dataset.act === 'preview') { this.previewOne(k); return; }
    const d = this.done[this.key(r)]; if (!d) return;
    const title = $('letTitle').value.trim() || 'Kirje';
    if (b.dataset.act === 'open') openBlob(d.blob);
    if (b.dataset.act === 'share') {
      ST.share(new File([d.blob], d.name, { type: 'application/pdf' }), title, '').catch(e => { if (e.name !== 'AbortError') this.setStatus('Jako epäonnistui: ' + e.message, 'err'); });
      if (r.email) copyText(r.email).catch(() => {});
    }
    if (b.dataset.act === 'mail') {
      const s = this.biller() || {};
      const body = `Hei,\n\nohessa kirje: ${title}.\n\nYstävällisin terveisin\n${$('letSigner').value.trim() || s.name || ''}`;
      location.href = 'mailto:' + encodeURIComponent(r.email) + '?subject=' + encodeURIComponent(title) + '&body=' + encodeURIComponent(body);
      this.setStatus(`Liitä viestiin tiedosto ${d.name}${d.path ? ` (OneDrive › ${ST.folderName()}/${d.path.split('/').slice(0, -1).join('/')})` : ''}.`, 'ok');
    }
  },
  init() {
    setD('letDate', INV.today());
    this.load();
    ['letTitle', 'letGreeting', 'letBody', 'letSigner', 'letRole', 'letClosing', 'letDuplex'].forEach(id =>
      $(id).addEventListener('input', () => { this.save(); this.done = {}; $('btnLetOpenAll').hidden = true; }));
    $('letDuplex').addEventListener('change', () => this.save());
    $('letBiller').addEventListener('change', () => this.save());
    $('btnLetPreview').onclick = () => { if (this.recipients().length) this.previewOne(0); else this.setStatus('Ei vastaanottajia.', 'err'); };
    $('btnLetAll').onclick = () => this.generateAll();
    $('btnLetOpenAll').onclick = () => { if (this.combined) openBlob(this.combined.blob); };
    $('btnLetReload').onclick = async () => { this.done = {}; const rr = await reloadRegistry(); if (!rr) this.refresh(); this.setStatus(rr ? 'Rekisteri luettu uudelleen.' : 'Päivitetty.', 'ok'); };
    $('btnLetReset').onclick = () => { if (!confirm('Tyhjennetäänkö kirjepohja oletuksiin?')) return; localStorage.removeItem(LETTER_KEY); this.load(); };
    $('letList').addEventListener('click', (e) => this.onCard(e));
  }
};
LETTER.init();

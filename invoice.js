/* invoice.js – laskun laskenta, viitenumero, pankkiviivakoodi ja PDF (jsPDF)
 *
 * Asettelu: jokainen teksti piirretään mitatun leveyden mukaan. Pitkät arvot
 * rivitetään tai fonttia pienennetään, joten tekstit eivät mene päällekkäin.
 * Puuttuvat tiedot jätetään kokonaan pois (otsikko ja kenttä).
 * Myyjänro on sisäinen tieto, eikä sitä tulosteta laskulle.
 *
 * Laskutyypit (inv.kind): 'normal' (oletus), 'self' (itselaskutus), 'road' (tiekunta).
 */

const C128 = [
    '212222','222122','222221','121223','121322','131222','122213','122312','132212','221213','221312','231212',
    '112232','122132','122231','113222','123122','123221','223211','221132','221231','213212','223112','312131',
    '311222','321122','321221','312212','322112','322211','212123','212321','232121','111323','131123','131321',
    '112313','132113','132311','211313','231113','231311','112133','112331','132131','113123','113321','133121',
    '313121','211331','231131','213113','213311','213131','311123','311321','331121','312113','312311','332111',
    '314111','221411','431111','111224','111422','121124','121421','141122','141221','112214','112412','122114',
    '122411','142112','142211','241211','221114','413111','241112','134111','111242','121142','121241','114212',
    '124112','124211','411212','421112','421211','212141','214121','412121','111143','111341','131141','114113',
    '114311','411113','411311','113141','114131','311141','411131','211412','211214','211232','2331112'
];

const INV = {

  money(n, cur) {
    const s = (Number(n) || 0).toLocaleString('fi-FI', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return s + (cur && cur.toUpperCase() !== 'EUR' ? ' ' + cur.toUpperCase() : ' €');
  },
  num(n, d = 2) {
    return (Number(n) || 0).toLocaleString('fi-FI', { minimumFractionDigits: 0, maximumFractionDigits: d });
  },
  price(n) {
    return (Number(n) || 0).toLocaleString('fi-FI', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  },
  dateFi(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d.padStart(2, '0')}.${m.padStart(2, '0')}.${y}`;
  },
  parseFi(s) {
    s = String(s || '').trim();
    if (!s) return '';
    let d, m, y;
    if (/^\d{6}$|^\d{8}$/.test(s)) { d = s.slice(0, 2); m = s.slice(2, 4); y = s.slice(4); }
    else {
      const p = s.split(/[.,/\-\s]+/).filter(Boolean);
      if (p.length < 2 || p.length > 3 || p.some(x => !/^\d+$/.test(x))) return null;
      [d, m, y] = p;
    }
    d = Number(d); m = Number(m);
    y = y === undefined || y === '' ? new Date().getFullYear() : Number(y);
    if (String(y).length <= 2) y += 2000;
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d || y < 2000 || y > 2099) return null;
    return this.iso(dt);
  },
  addDays(iso, days) {
    const d = new Date((iso || this.today()) + 'T12:00:00');
    d.setDate(d.getDate() + Number(days || 0));
    return this.iso(d);
  },
  daysBetween(a, b) {
    return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);
  },
  iso(d) {
    const p = (x) => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  },
  today() { return this.iso(new Date()); },

  reference(base) {
    const digits = String(base).replace(/\D/g, '').replace(/^0+/, '');
    const body = (digits.length < 3 ? '100' + digits : digits).slice(-19);
    const w = [7, 3, 1];
    let sum = 0;
    for (let i = 0; i < body.length; i++) sum += Number(body[body.length - 1 - i]) * w[i % 3];
    const full = body + ((10 - (sum % 10)) % 10);
    return full.replace(/\B(?=(\d{5})+(?!\d))/g, ' ');
  },

  lineTotal(l) {
    return Math.round((Number(l.qty) || 0) * (Number(l.price) || 0) * 100) / 100;
  },

  totals(lines) {
    let net = 0, vat = 0;
    const byRate = {};
    for (const l of lines) {
      const n = this.lineTotal(l);
      const r = Number(l.vat) || 0;
      byRate[r] = byRate[r] || { net: 0, vat: 0 };
      byRate[r].net += n;
      net += n;
    }
    for (const r of Object.keys(byRate)) {
      byRate[r].vat = Math.round(byRate[r].net * Number(r)) / 100;
      vat += byRate[r].vat;
    }
    net = Math.round(net * 100) / 100;
    vat = Math.round(vat * 100) / 100;
    return { net, vat, gross: Math.round((net + vat) * 100) / 100, byRate };
  },

  /* pankkiviivakoodi, versio 4 */
  virtualBarcode(iban, amount, reference, due, currency) {
    const acc = String(iban || '').replace(/\s/g, '').toUpperCase();
    if (!/^FI\d{16}$/.test(acc)) return '';
    if (currency && currency.toUpperCase() !== 'EUR') return '';
    const ref = String(reference || '').replace(/\s/g, '');
    if (!/^\d{4,20}$/.test(ref)) return '';
    const cents = Math.round((Number(amount) || 0) * 100);
    const amt = cents > 0 && cents <= 99999999 ? String(cents).padStart(8, '0') : '00000000';
    const dd = due ? due.slice(2, 4) + due.slice(5, 7) + due.slice(8, 10) : '000000';
    const code = '4' + acc.slice(2) + amt + '000' + ref.padStart(20, '0') + dd;
    return code.length === 54 ? code : '';
  },

  code128C(digits) {
    const vals = [105];
    for (let i = 0; i < digits.length; i += 2) vals.push(Number(digits.substr(i, 2)));
    let sum = 105;
    for (let i = 1; i < vals.length; i++) sum += vals[i] * i;
    vals.push(sum % 103, 106);
    const widths = [];
    vals.forEach(v => C128[v].split('').forEach(c => widths.push(Number(c))));
    return widths;
  },

  theme(style, hex) {
    if (style !== 'color') {
      return { accent: [0, 0, 0], strong: [0, 0, 0], tint: [240, 240, 240], ink: [0, 0, 0], grey: [90, 90, 90], rule: [200, 200, 200] };
    }
    const h = String(hex || '#2e7d32').replace('#', '');
    const c = [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16) || 0);
    const mix = (t, to) => c.map(v => Math.round(v + (to - v) * t));
    return { accent: c, strong: mix(0.25, 0), tint: mix(0.9, 255), ink: [33, 33, 33], grey: [100, 100, 100], rule: [215, 215, 215] };
  },

  buildPdf(inv, opts = {}) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const T = this.theme(opts.style, opts.color);
    const L = 16, R = 194, W = R - L;
    const FOOT_Y = 279;
    const s = inv.sender, c = inv.customer, cur = s.currency;
    const SELF = inv.kind === 'self';
    const t = this.totals(inv.lines);
    const PT = 0.3528;

    const font = (size, style = 'normal', color = T.ink) => {
      doc.setFont('helvetica', style); doc.setFontSize(size); doc.setTextColor(...color);
    };
    const tw = (str) => doc.getTextWidth(String(str));
    const line = (str, x, y, maxW, size, style = 'normal', color = T.ink, align = 'left') => {
      str = String(str ?? '');
      if (!str) return;
      let sz = size;
      font(sz, style, color);
      while (tw(str) > maxW && sz > 6) { sz -= 0.25; font(sz, style, color); }
      while (tw(str) > maxW && str.length > 1) str = str.slice(0, -2) + '…';
      doc.text(str, x, y, align === 'right' ? { align: 'right' } : undefined);
    };
    const wrap = (str, maxW, size, style = 'normal') => {
      font(size, style);
      const out = [];
      String(str ?? '').split('\n').forEach(p => {
        const ls = doc.splitTextToSize(p, maxW);
        (ls.length ? ls : ['']).forEach(l => out.push(l));
      });
      return out.map(l => {
        let x = l;
        while (tw(x) > maxW && x.length > 1) x = x.slice(0, -2) + '…';
        return x;
      });
    };
    const LBL = 7, VAL = 9.5;
    const grid = (fields, x0, y0, cols, colW, draw = true) => {
      let y = y0;
      for (let i = 0; i < fields.length; i += cols) {
        const row = fields.slice(i, i + cols);
        const cells = row.map(f => {
          const size = (f[2] && f[2].size) || VAL;
          const style = (f[2] && f[2].bold) ? 'bold' : 'normal';
          const single = f[2] && f[2].single;
          const ls = single ? [String(f[1])] : wrap(f[1], colW - 4, size, style);
          return { f, size, style, single, ls, h: 3.6 + ls.length * (size * PT * 1.25) };
        });
        const h = Math.max(...cells.map(cl => cl.h));
        if (draw) cells.forEach((cl, k) => {
          const x = x0 + k * colW;
          line(cl.f[0].toUpperCase(), x, y, colW - 4, LBL, 'bold', T.grey);
          cl.ls.forEach((l, j) => {
            const yy = y + 4.2 + j * (cl.size * PT * 1.25);
            if (cl.single) line(l, x, yy, colW - 4, cl.size, cl.style, T.ink);
            else { font(cl.size, cl.style, T.ink); doc.text(l, x, yy); }
          });
        });
        y += h + 2.2;
      }
      return y - y0;
    };
    const has = (v) => v !== undefined && v !== null && String(v).trim() !== '';
    const pick = (arr) => arr.filter(f => has(f[1]));

    /* ===== maksuosa ===== */
    const payFields = [];
    let vcode = '';
    if (SELF) {
      payFields.push(['Maksun saaja (myyjä)', c.name]);
      payFields.push(['Saajan tilinumero', c.iban, { single: true }]);
      payFields.push(['Maksupäivä', this.dateFi(inv.due), { single: true }]);
      payFields.push(['Maksetaan', this.money(t.gross, cur), { single: true, bold: true, size: 11 }]);
    } else {
      const accounts = [[s.iban, s.bic, s.bank], [s.iban2, s.bic2, s.bank2]].filter(a => has(a[0]));
      payFields.push(['Saaja', s.name]);
      payFields.push(['Viitenumero', inv.reference, { single: true }]);
      payFields.push(['Eräpäivä', this.dateFi(inv.due), { single: true }]);
      accounts.forEach((a, i) => {
        payFields.push([`Tilinumero${a[2] ? ' – ' + a[2] : ''}`, a[0], { single: true }]);
        payFields.push(['BIC', a[1], { single: true }]);
        if (i === 0) payFields.push(['Maksettava', this.money(t.gross, cur), { single: true, bold: true, size: 11 }]);
      });
      if (!accounts.length) payFields.push(['Maksettava', this.money(t.gross, cur), { single: true, bold: true, size: 11 }]);
      vcode = opts.barcode === false ? '' : this.virtualBarcode(s.iban, t.gross, inv.reference, inv.due, cur);
    }
    const payList = pick(payFields);
    const PAY_COLW = W / 3;
    const BAR_H = 14, MOD = 0.32;
    const payGridH = grid(payList, L, 0, 3, PAY_COLW, false);
    const payH = 9 + payGridH + (vcode ? 2 + BAR_H + 5.2 : -2.2);
    const PAY_TOP = FOOT_Y - 4 - payH;
    const CONTENT_MAX_LAST = PAY_TOP - 5;
    const CONTENT_MAX = FOOT_Y - 8;

    let y;

    /* ===== ylätunniste ===== */
    let logoW = 0;
    if (s.logoData) {
      try {
        const p = doc.getImageProperties(s.logoData);
        const k = Math.min(60 / p.width, 18 / p.height);
        doc.addImage(s.logoData, L, 10, p.width * k, p.height * k);
        logoW = p.width * k;
      } catch (e) { console.warn('Logoa ei voitu lisätä', e); }
    }
    if (!logoW) line(s.name, L, 20, 100, 16, 'bold', T.strong);
    line(SELF ? 'ITSELASKUTUS' : 'LASKU', R, 17, 70, 20, 'bold', T.accent, 'right');
    line(inv.number, R, 24, 60, 11, 'normal', T.ink, 'right');
    doc.setDrawColor(...T.accent); doc.setLineWidth(0.7); doc.line(L, 30, R, 30); doc.setLineWidth(0.2);

    /* ===== osoitteet: E5-kuoren ikkuna 30 × 90 mm (40 mm ylhäältä, 18 mm vasemmalta) ===== */
    const foreign = (cn) => has(cn) && !/^(suomi|finland|fi)$/i.test(cn.trim());
    const sLines = [s.name, s.addr, [s.zip, s.city].filter(has).join(' '), foreign(s.country) ? s.country : ''].filter(has);
    const cLines = [c.name, c.recipient, c.addr, [c.zip, c.city].filter(has).join(' '), foreign(c.country) ? c.country : ''].filter(has);
    const AX = 22, AW = 70, AMAX = 60.5;
    let asz = 10, aLines, AY = 44.5;
    const fits = () => AY + (aLines.length - 1) * asz * PT * 1.3 <= AMAX;
    const cut = (str, w) => { let x = str; while (tw(x) > w && x.length > 1) x = x.slice(0, -2) + '…'; return x; };
    for (;;) {
      aLines = [];
      cLines.forEach((l, i) => wrap(l, AW, asz, i === 0 ? 'bold' : 'normal').forEach(x => aLines.push([x, i === 0])));
      AY = aLines.length > 4 ? 43.6 : 44.5;
      if (fits() || asz <= 6.5) break;
      asz -= 0.25;
    }
    if (!fits()) {
      for (asz = 10; ; asz -= 0.25) {
        aLines = cLines.map((l, i) => { font(asz, i === 0 ? 'bold' : 'normal'); return [cut(l, AW), i === 0]; });
        AY = aLines.length > 4 ? 43.6 : 44.5;
        if (fits() || asz <= 6.5) break;
      }
    }
    const alh = asz * PT * 1.3;
    aLines.forEach(([x, b], k) => { font(asz, b ? 'bold' : 'normal'); doc.text(x, AX, AY + k * alh); });
    const cy = AY + aLines.length * alh;

    line(SELF ? 'OSTAJA – LASKUN LAATIJA' : 'LASKUTTAJA', 118, 38, 76, LBL, 'bold', T.grey);
    let sy = 43;
    sLines.forEach(l => wrap(l, R - 118, 10).forEach(x => { font(10, 'normal'); doc.text(x, 118, sy); sy += 4.6; }));
    if (SELF && has(s.bid)) { line('Y-tunnus ' + s.bid, 118, sy, R - 118, 9, 'normal', T.grey); sy += 4.6; }

    /* ===== laskun perustiedot (Myyjänro ei näy laskulla) ===== */
    y = Math.max(sy, cy, 66) + 4;
    const meta = pick(SELF ? [
      ['Laskun päivä', this.dateFi(inv.date), { single: true }],
      ['Maksupäivä', this.dateFi(inv.due), { single: true }],
      ['Toimituspäivä', this.dateFi(inv.deliveryDate), { single: true }],
      ['Myyjän Y-tunnus', c.bid, { single: true }],
      ['Myyjän ALV-numero', c.vatId, { single: true }],
      ...(inv.extraMeta || []).map(m => [m[0], m[1], { single: true }])
    ] : [
      ['Laskun päivä', this.dateFi(inv.date), { single: true }],
      ['Eräpäivä', this.dateFi(inv.due), { single: true }],
      ['Maksuehto', has(inv.terms) ? inv.terms + ' pv netto' : '', { single: true }],
      ['Viitenumero', inv.reference, { single: true }],
      ['Viivästyskorko', s.interest, { single: true }],
      ['Toimituspäivä', this.dateFi(inv.deliveryDate), { single: true }],
      ['Asiakasnumero', c.id, { single: true }],
      ['Asiakkaan Y-tunnus', c.bid, { single: true }],
      ['Verkkolaskuosoite', c.einv, { single: true }],
      ['Välittäjä', c.operator, { single: true }],
      ...(inv.extraMeta || []).map(m => [m[0], m[1], { single: true }])
    ]);
    const META_COLW = W / 3;
    const metaH = grid(meta, L + 2, 0, 3, META_COLW - 0.7, false);
    doc.setFillColor(...T.tint);
    doc.rect(L - 1, y - 1, W + 2, metaH + 1.5, 'F');
    grid(meta, L + 2, y + 3, 3, META_COLW - 0.7, true);
    y += metaH + 8;

    /* ===== laskurivit ===== */
    const X = { desc: L, descW: 84, qty: 113, qtyW: 11, unit: 116, unitW: 12, price: 152, priceW: 21, vat: 166, vatW: 11, tot: R, totW: 25 };
    const header = () => {
      line(SELF ? 'SELITE' : 'TUOTE', X.desc, y, X.descW, LBL, 'bold', T.strong);
      line('MÄÄRÄ', X.qty, y, X.qtyW + 1, LBL, 'bold', T.strong, 'right');
      line('YKS.', X.unit, y, X.unitW, LBL, 'bold', T.strong);
      line('HINTA ALV 0 %', X.price, y, X.priceW, LBL, 'bold', T.strong, 'right');
      line('ALV %', X.vat, y, X.vatW, LBL, 'bold', T.strong, 'right');
      line('YHTEENSÄ', X.tot, y, X.totW, LBL, 'bold', T.strong, 'right');
      doc.setDrawColor(...T.accent); doc.line(L, y + 1.8, R, y + 1.8);
      y += 6.8;
    };
    const contHeader = () => {
      line(`${s.name || ''} · ${SELF ? 'Itselaskutus' : 'Lasku'} ${inv.number} (jatkuu)`, L, 14, W, 8, 'normal', T.grey);
      y = 24;
    };
    header();
    const RLH = 4.5;
    for (const l of inv.lines) {
      const desc = wrap(l.desc || '', X.descW, 10);
      const need = desc.length * RLH + 2.5;
      if (y + need > CONTENT_MAX) { doc.addPage(); contHeader(); header(); }
      font(10);
      desc.forEach((d, i) => doc.text(d, X.desc, y + i * RLH));
      line(this.num(l.qty, 3), X.qty, y, X.qtyW, 10, 'normal', T.ink, 'right');
      line(l.unit || '', X.unit, y, X.unitW, 10);
      line(this.price(l.price), X.price, y, X.priceW, 10, 'normal', T.ink, 'right');
      line(this.num(l.vat, 1), X.vat, y, X.vatW, 10, 'normal', T.ink, 'right');
      line(this.money(this.lineTotal(l), cur).replace(/ (€|[A-Z]{3})$/, ''), X.tot, y, X.totW, 10, 'bold', T.ink, 'right');
      y += (desc.length - 1) * RLH + 2.2;
      doc.setDrawColor(...T.rule); doc.line(L, y, R, y);
      y += 4.8;
    }

    /* ===== yhteenveto + käyttäjän lisäteksti ===== */
    const rates = Object.keys(t.byRate).sort((a, b) => a - b);
    const noteLines = has(inv.note) ? wrap(inv.note, W, 10) : [];
    const sumH = 1 + (1 + rates.length) * 5.4 + 9 + (noteLines.length ? 4 + noteLines.length * 4.6 : 0);
    if (y + sumH > CONTENT_MAX_LAST) { doc.addPage(); contHeader(); }
    y += 1;
    const sumRow = (label, val) => {
      line(label, 150, y, 62, 9.5, 'normal', T.grey, 'right');
      line(val, R, y, 40, 9.5, 'normal', T.ink, 'right');
      y += 5.4;
    };
    sumRow('Veroton yhteensä', this.money(t.net, cur));
    rates.forEach(r => sumRow(`ALV ${this.num(r, 1)} % (${this.money(t.byRate[r].net, cur)})`, this.money(t.byRate[r].vat, cur)));
    doc.setDrawColor(...T.accent); doc.setLineWidth(0.5); doc.line(112, y - 2.6, R, y - 2.6); doc.setLineWidth(0.2);
    y += 3;
    line(SELF ? 'YHTEENSÄ' : 'MAKSETTAVA', 150, y, 50, 12, 'bold', T.strong, 'right');
    line(this.money(t.gross, cur), R, y, 42, 12, 'bold', T.strong, 'right');
    y += 6;
    if (noteLines.length) {
      y += 4;
      font(10);
      noteLines.forEach(l => { doc.text(l, L, y); y += 4.6; });
    }

    /* ===== maksutiedot + pankkiviivakoodi ===== */
    let py = PAY_TOP;
    doc.setDrawColor(...T.accent); doc.setLineWidth(0.5); doc.line(L, py, R, py); doc.setLineWidth(0.2);
    line(SELF ? 'MAKSU MYYJÄLLE' : 'MAKSUTIEDOT', L, py + 4.5, 80, 8, 'bold', T.strong);
    py += 9;
    grid(payList, L, py, 3, PAY_COLW, true);
    py += payGridH;
    if (vcode) {
      py += 2;
      const bars = this.code128C(vcode);
      const bx0 = L + 4;
      let bx = bx0;
      doc.setFillColor(0, 0, 0);
      bars.forEach((wd, i) => { if (i % 2 === 0) doc.rect(bx, py, wd * MOD, BAR_H, 'F'); bx += wd * MOD; });
      font(8.5, 'normal', [0, 0, 0]);
      const vw = tw(vcode), cx = (bx0 + bx) / 2;
      line(vcode, Math.max(L, cx - vw / 2), py + BAR_H + 3.8, W, 8.5, 'normal', [0, 0, 0]);
    }

    /* ===== alatunniste ===== */
    const pre = (label, v) => has(v) ? label + v : '';
    const col1 = [s.name, s.addr, [s.zip, s.city].filter(has).join(' ')].filter(has);
    const col2 = [pre('Puh. ', s.phone), pre('Puh. ', s.phone2), s.email, s.web].filter(has);
    const col3 = [pre('Y-tunnus ', s.bid), pre('ALV-nro ', s.vatId), pre('Kaupparek. ', s.tradeNo)].filter(has);
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setDrawColor(...T.rule); doc.line(L, FOOT_Y, R, FOOT_Y);
      col1.forEach((l, k) => line(l, L, FOOT_Y + 4 + k * 3.3, 60, 7.5, 'normal', T.grey));
      col2.forEach((l, k) => line(l, 80, FOOT_Y + 4 + k * 3.3, 56, 7.5, 'normal', T.grey));
      col3.forEach((l, k) => line(l, 140, FOOT_Y + 4 + k * 3.3, 54, 7.5, 'normal', T.grey));
      if (pages > 1) line(`Sivu ${i}/${pages}`, R, FOOT_Y - 1.5, 30, 7.5, 'normal', T.grey, 'right');
    }
    return doc;
  }
};

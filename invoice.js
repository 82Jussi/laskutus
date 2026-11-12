/* invoice.js – laskun laskenta, viitenumero ja PDF-tuotto (jsPDF) */

const INV = {

  /* ---------- muotoilut ---------- */
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
    return `${Number(d)}.${Number(m)}.${y}`;
  },
  addDays(iso, days) {
    const d = new Date((iso || this.today()) + 'T12:00:00');
    d.setDate(d.getDate() + Number(days || 0));
    return this.iso(d);
  },
  iso(d) {
    const p = (x) => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  },
  today() { return this.iso(new Date()); },

  /* ---------- suomalainen viitenumero (7-3-1) ---------- */
  reference(base) {
    const digits = String(base).replace(/\D/g, '').replace(/^0+/, '');
    const body = (digits.length < 3 ? '100' + digits : digits).slice(-19);   // vähintään 3 numeroa
    const w = [7, 3, 1];
    let sum = 0;
    for (let i = 0; i < body.length; i++) sum += Number(body[body.length - 1 - i]) * w[i % 3];
    const full = body + ((10 - (sum % 10)) % 10);
    return full.replace(/\B(?=(\d{5})+(?!\d))/g, ' ');
  },

  /* ---------- summat ---------- */
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

  /* ---------- PDF ---------- */
  buildPdf(inv) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const L = 16, R = 194;
    const green = [46, 125, 50], greenD = [27, 94, 32], ink = [33, 33, 33], grey = [110, 110, 110];
    const s = inv.sender, c = inv.customer, cur = s.currency;
    const t = this.totals(inv.lines);
    let y;

    const text = (str, x, yy, o = {}) => doc.text(String(str ?? ''), x, yy, o);
    const font = (size, style = 'normal', color = ink) => {
      doc.setFont('helvetica', style); doc.setFontSize(size); doc.setTextColor(...color);
    };

    /* --- ylätunniste --- */
    let logoOk = false;
    if (s.logoData) {
      try {
        const p = doc.getImageProperties(s.logoData);
        const maxW = 50, maxH = 18;
        const k = Math.min(maxW / p.width, maxH / p.height);
        doc.addImage(s.logoData, L, 10, p.width * k, p.height * k);
        logoOk = true;
      } catch (e) { console.warn('Logoa ei voitu lisätä', e); }
    }
    if (!logoOk) {
      font(16, 'bold', greenD);
      text(s.name || '', L, 20);
    }
    font(20, 'bold', green);
    text('LASKU', R, 17, { align: 'right' });
    font(11, 'normal', ink);
    text(inv.number, R, 24, { align: 'right' });
    doc.setDrawColor(...green); doc.setLineWidth(0.8);
    doc.line(L, 31, R, 31);
    doc.setLineWidth(0.2);

    /* --- osoitteet --- */
    y = 40;
    font(7.5, 'bold', grey); text('LASKUTTAJA', L, y); text('VASTAANOTTAJA', 110, y);
    font(10, 'normal', ink);
    const foreign = (cn) => cn && !/^(suomi|finland|fi)$/i.test(cn.trim());
    const sLines = [s.name, s.addr, [s.zip, s.city].filter(Boolean).join(' '), foreign(s.country) ? s.country : ''].filter(Boolean);
    const cLines = [c.name, c.recipient, c.addr, [c.zip, c.city].filter(Boolean).join(' '), foreign(c.country) ? c.country : ''].filter(Boolean);
    let sy = y + 5.5, cy = y + 5.5;
    sLines.forEach(l => { text(l, L, sy); sy += 4.8; });
    cLines.forEach((l, i) => { font(10, i === 0 ? 'bold' : 'normal', ink); text(l, 110, cy); cy += 4.8; });

    /* --- perustiedot --- */
    y = Math.max(sy, cy) + 5;
    doc.setFillColor(232, 245, 233);
    const meta = [
      ['Laskun päivä', this.dateFi(inv.date)],
      ['Eräpäivä', this.dateFi(inv.due)],
      ['Maksuehto', (inv.terms || 0) + ' pv netto'],
      ['Viitenumero', inv.reference],
      ['Viivästyskorko', s.interest],
      ['Toimituspäivä', this.dateFi(inv.deliveryDate)],
      ['Asiakasnumero', c.id],
      ['Asiakkaan Y-tunnus', c.bid],
      ['Myyjänro', s.sellerNo],
      ['Verkkolaskuosoite', c.einv],
      ['Välittäjä', c.operator]
    ].filter(r => r[1]);
    const rowsN = Math.ceil(meta.length / 3);
    doc.rect(L - 2, y - 4, R - L + 4, rowsN * 10 + 3, 'F');
    meta.forEach((m, i) => {
      const x = L + (i % 3) * 61, ry = y + Math.floor(i / 3) * 10;
      font(7, 'bold', grey); text(m[0].toUpperCase(), x, ry);
      font(10, 'normal', ink); text(m[1], x, ry + 4.5);
    });
    y += rowsN * 10 + 8;

    /* --- laskurivit --- */
    const X = { desc: L, qty: 116, unit: 119, price: 152, vat: 167, tot: R };
    const header = () => {
      font(7.5, 'bold', greenD);
      text('TUOTE', X.desc, y);
      text('MÄÄRÄ', X.qty, y, { align: 'right' });
      text('YKS.', X.unit, y);
      text('HINTA, ALV 0 %', X.price, y, { align: 'right' });
      text('ALV %', X.vat, y, { align: 'right' });
      text('YHTEENSÄ', X.tot, y, { align: 'right' });
      doc.setDrawColor(...green); doc.line(L, y + 2, R, y + 2);
      y += 7.5;
    };
    header();
    for (const l of inv.lines) {
      const desc = doc.splitTextToSize(String(l.desc || ''), 95);
      const need = desc.length * 4.6 + 3;
      if (y + need > 240) { doc.addPage(); y = 22; header(); }
      font(10, 'normal', ink);
      desc.forEach((d, i) => text(d, X.desc, y + i * 4.6));
      text(this.num(l.qty, 3), X.qty, y, { align: 'right' });
      text(l.unit || '', X.unit, y);
      text(this.price(l.price), X.price, y, { align: 'right' });
      text(this.num(l.vat, 1), X.vat, y, { align: 'right' });
      font(10, 'bold', ink);
      text(this.money(this.lineTotal(l), cur).replace(/ (€|[A-Z]{3})$/, ''), X.tot, y, { align: 'right' });
      y += desc.length * 4.6;
      doc.setDrawColor(224, 224, 224); doc.line(L, y - 1.8, R, y - 1.8);
      y += 2.4;
    }

    /* --- yhteenveto --- */
    const rates = Object.keys(t.byRate).sort((a, b) => a - b);
    const sumH = 10 + rates.length * 5.5 + 12 + (inv.note ? 14 : 0);
    if (y + sumH > 240) { doc.addPage(); y = 22; }
    y += 4;
    const sumRow = (label, val) => {
      font(10, 'normal', grey); text(label, 152, y, { align: 'right' });
      font(10, 'normal', ink); text(val, R, y, { align: 'right' });
      y += 5.5;
    };
    sumRow('Veroton yhteensä', this.money(t.net, cur));
    rates.forEach(r => sumRow(`ALV ${this.num(r, 1)} % (${this.money(t.byRate[r].net, cur)})`, this.money(t.byRate[r].vat, cur)));
    doc.setDrawColor(...green); doc.setLineWidth(0.6); doc.line(110, y - 2, R, y - 2); doc.setLineWidth(0.2);
    y += 4;
    font(13, 'bold', greenD);
    text('MAKSETTAVA', 152, y, { align: 'right' });
    text(this.money(t.gross, cur), R, y, { align: 'right' });
    y += 10;
    if (inv.note) {
      font(10, 'normal', ink);
      doc.splitTextToSize(inv.note, R - L).slice(0, 3).forEach(l => { text(l, L, y); y += 4.8; });
    }

    /* --- maksutiedot (viimeinen sivu) --- */
    const py = 247;
    doc.setFillColor(232, 245, 233);
    doc.rect(0, py - 6, 210, 31, 'F');
    const accounts = [[s.iban, s.bic, s.bank], [s.iban2, s.bic2, s.bank2]].filter(a => a[0]);
    const pay = [
      ['Saaja', s.name],
      ['Viitenumero', inv.reference],
      ['Eräpäivä', this.dateFi(inv.due)],
      ...accounts.map((a, i) => [`Tilinumero${accounts.length > 1 ? ' ' + (i + 1) : ''}${a[2] ? ' – ' + a[2] : ''}`,
        a[0] + (a[1] ? '  BIC ' + a[1] : '')]),
      ['Maksettava', this.money(t.gross, cur)]
    ];
    pay.forEach((p, i) => {
      const x = L + (i % 3) * 61, ry = py + Math.floor(i / 3) * 11;
      font(7, 'bold', grey); text(p[0].toUpperCase(), x, ry);
      font(i === pay.length - 1 ? 11 : 10, i === pay.length - 1 ? 'bold' : 'normal', ink);
      text(p[1] || '–', x, ry + 4.6);
    });

    /* --- alatunniste kaikille sivuille --- */
    const col1 = [s.name, s.addr, [s.zip, s.city].filter(Boolean).join(' ')].filter(Boolean);
    const col2 = [s.phone && 'Puh. ' + s.phone, s.phone2 && 'Puh. ' + s.phone2, s.email, s.web].filter(Boolean);
    const col3 = [s.bid && 'Y-tunnus ' + s.bid, s.vatId && 'ALV-nro ' + s.vatId, s.tradeNo && 'Kaupparek. ' + s.tradeNo].filter(Boolean);
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setDrawColor(...green); doc.line(L, 280, R, 280);
      font(7.5, 'normal', grey);
      col1.forEach((l, k) => text(l, L, 284 + k * 3.4));
      col2.forEach((l, k) => text(l, 80, 284 + k * 3.4));
      col3.forEach((l, k) => text(l, 140, 284 + k * 3.4));
      if (pages > 1) text(`${i}/${pages}`, R, 276, { align: 'right' });
    }
    return doc;
  }
};

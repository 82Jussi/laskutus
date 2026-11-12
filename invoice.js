/* invoice.js – laskun laskenta, viitenumero ja PDF-tuotto (jsPDF) */

const INV = {

  /* ---------- muotoilut ---------- */
  money(n) {
    return (Number(n) || 0).toLocaleString('fi-FI', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  },
  num(n, d = 2) {
    return (Number(n) || 0).toLocaleString('fi-FI', { minimumFractionDigits: 0, maximumFractionDigits: d });
  },
  dateFi(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${Number(d)}.${Number(m)}.${y}`;
  },
  addDays(iso, days) {
    const d = new Date(iso + 'T12:00:00');
    d.setDate(d.getDate() + Number(days || 0));
    return d.toISOString().slice(0, 10);
  },
  today() { return new Date().toISOString().slice(0, 10); },

  /* ---------- suomalainen viitenumero ---------- */
  reference(base) {
    const digits = String(base).replace(/\D/g, '').replace(/^0+/, '') || '1';
    const body = digits.slice(-19);
    const w = [7, 3, 1];
    let sum = 0;
    for (let i = 0; i < body.length; i++) {
      sum += Number(body[body.length - 1 - i]) * w[i % 3];
    }
    const check = (10 - (sum % 10)) % 10;
    const full = body + check;
    return full.replace(/\B(?=(\d{5})+(?!\d))/g, ' ');
  },

  /* ---------- summat ---------- */
  totals(lines) {
    let net = 0, vat = 0;
    const byRate = {};
    for (const l of lines) {
      const q = Number(l.qty) || 0, p = Number(l.price) || 0, r = Number(l.vat) || 0;
      const n = Math.round(q * p * 100) / 100;
      const v = Math.round(n * r) / 100;
      net += n; vat += v;
      byRate[r] = byRate[r] || { net: 0, vat: 0 };
      byRate[r].net += n; byRate[r].vat += v;
    }
    net = Math.round(net * 100) / 100;
    vat = Math.round(vat * 100) / 100;
    return { net, vat, gross: Math.round((net + vat) * 100) / 100, byRate };
  },

  lineTotal(l) {
    const n = (Number(l.qty) || 0) * (Number(l.price) || 0);
    return Math.round(n * 100) / 100;
  },

  /* ---------- PDF ---------- */
  buildPdf(inv) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const L = 16, R = 194, brand = [15, 118, 110], ink = [20, 35, 32], grey = [110, 130, 126];
    const t = this.totals(inv.lines);
    let y = 0;

    const text = (s, x, yy, o = {}) => doc.text(String(s ?? ''), x, yy, o);
    const setF = (size, style = 'normal', color = ink) => {
      doc.setFont('helvetica', style); doc.setFontSize(size); doc.setTextColor(...color);
    };

    /* --- ylätunniste --- */
    doc.setFillColor(...brand);
    doc.rect(0, 0, 210, 26, 'F');
    setF(17, 'bold', [255, 255, 255]);
    text(inv.sender.name || 'Lasku', L, 15);
    setF(9, 'normal', [255, 255, 255]);
    text('LASKU', R, 11, { align: 'right' });
    setF(13, 'bold', [255, 255, 255]);
    text(inv.number, R, 18, { align: 'right' });

    /* --- osoitelohkot --- */
    y = 40;
    setF(8, 'bold', grey); text('LASKUTTAJA', L, y);
    setF(9.5, 'normal', ink);
    const s = inv.sender;
    const senderLines = [
      s.name, s.addr, [s.zip, s.city].filter(Boolean).join(' '),
      s.bid ? 'Y-tunnus ' + s.bid : '', s.email, s.phone
    ].filter(Boolean);
    let sy = y + 5;
    senderLines.forEach(l => { text(l, L, sy); sy += 4.4; });

    setF(8, 'bold', grey); text('VASTAANOTTAJA', 110, y);
    setF(9.5, 'normal', ink);
    const c = inv.customer;
    const custLines = [
      c.name, c.addr, [c.zip, c.city].filter(Boolean).join(' '),
      c.country && c.country.toLowerCase() !== 'suomi' ? c.country : '',
      c.bid ? 'Y-tunnus ' + c.bid : ''
    ].filter(Boolean);
    let cy = y + 5;
    custLines.forEach(l => { text(l, 110, cy); cy += 4.4; });

    /* --- laskun perustiedot --- */
    y = Math.max(sy, cy) + 6;
    doc.setDrawColor(219, 232, 229); doc.line(L, y, R, y);
    y += 6;
    const meta = [
      ['Laskun päivä', this.dateFi(inv.date)],
      ['Eräpäivä', this.dateFi(inv.due)],
      ['Maksuehto', (inv.terms || 0) + ' pv netto'],
      ['Viitenumero', inv.reference],
      ['Viivästyskorko', inv.interest || ''],
      ['Toimituspäivä', this.dateFi(inv.deliveryDate)],
      ['Asiakasnumero', c.id || '']
    ].filter(r => r[1] !== '' && r[1] !== undefined);

    const colX = [L, 75, 140];
    meta.forEach((m, i) => {
      const x = colX[i % 3], ry = y + Math.floor(i / 3) * 10;
      setF(7.5, 'bold', grey); text(m[0].toUpperCase(), x, ry);
      setF(10, 'normal', ink); text(m[1], x, ry + 4.6);
    });
    y += Math.ceil(meta.length / 3) * 10 + 4;

    /* --- rivitaulukko --- */
    const cx = { desc: L, qty: 118, unit: 121, price: 152, vat: 168, tot: R };
    const header = () => {
      doc.setFillColor(230, 243, 241);
      doc.rect(L - 2, y - 5, R - L + 4, 7.5, 'F');
      setF(7.5, 'bold', [11, 90, 84]);
      text('KUVAUS', cx.desc, y);
      text('MÄÄRÄ', cx.qty, y, { align: 'right' });
      text('YKS.', cx.unit, y);
      text('À-HINTA', cx.price, y, { align: 'right' });
      text('ALV%', cx.vat, y, { align: 'right' });
      text('YHTEENSÄ', cx.tot, y, { align: 'right' });
      y += 7;
    };
    y += 5; header();

    setF(9.5, 'normal', ink);
    for (const l of inv.lines) {
      if (y > 245) { doc.addPage(); y = 25; header(); setF(9.5, 'normal', ink); }
      const descLines = doc.splitTextToSize(l.desc || '', 96);
      setF(9.5, 'normal', ink);
      text(descLines[0] || '', cx.desc, y);
      text(this.num(l.qty, 3), cx.qty, y, { align: 'right' });
      text(l.unit || '', cx.unit, y);
      text(this.num(l.price), cx.price, y, { align: 'right' });
      text(this.num(l.vat, 1), cx.vat, y, { align: 'right' });
      setF(9.5, 'bold', ink);
      text(this.num(this.lineTotal(l)), cx.tot, y, { align: 'right' });
      let ly = y;
      if (descLines.length > 1) {
        setF(8.5, 'normal', grey);
        for (let i = 1; i < descLines.length; i++) { ly += 4; text(descLines[i], cx.desc, ly); }
      }
      y = ly + 4;
      doc.setDrawColor(240, 245, 244); doc.line(L, y - 2.2, R, y - 2.2);
      y += 2;
    }

    /* --- summat --- */
    if (y > 225) { doc.addPage(); y = 25; }
    y += 4;
    const sumRow = (label, val, bold = false, size = 10) => {
      setF(size, bold ? 'bold' : 'normal', bold ? ink : grey);
      text(label, 140, y, { align: 'right' });
      setF(size, bold ? 'bold' : 'normal', ink);
      text(val, R, y, { align: 'right' });
      y += size * 0.62;
    };
    sumRow('Veroton yhteensä', this.money(t.net));
    Object.keys(t.byRate).sort((a, b) => a - b).forEach(r => {
      sumRow(`ALV ${this.num(r, 1)} %`, this.money(t.byRate[r].vat));
    });
    y += 2;
    doc.setDrawColor(...brand); doc.setLineWidth(0.5); doc.line(118, y - 4, R, y - 4);
    doc.setLineWidth(0.2);
    y += 2;
    setF(12, 'bold', brand);
    text('MAKSETTAVA', 140, y, { align: 'right' });
    text(this.money(t.gross), R, y, { align: 'right' });
    y += 10;

    /* --- vapaa teksti --- */
    if (inv.note) {
      setF(9.5, 'normal', ink);
      const nl = doc.splitTextToSize(inv.note, R - L);
      nl.forEach(l => { text(l, L, y); y += 4.6; });
      y += 4;
    }

    /* --- maksutiedot alareunaan --- */
    const py = 262;
    doc.setFillColor(243, 247, 246);
    doc.rect(0, py - 8, 210, 42, 'F');
    setF(8, 'bold', grey); text('MAKSUTIEDOT', L, py - 2);
    setF(9.5, 'normal', ink);
    const pay = [
      ['Saaja', s.name],
      ['IBAN', s.iban],
      ['BIC', s.bic],
      ['Viitenumero', inv.reference],
      ['Eräpäivä', this.dateFi(inv.due)],
      ['Summa', this.money(t.gross)]
    ];
    pay.forEach((p, i) => {
      const x = L + (i % 3) * 62, ry = py + 5 + Math.floor(i / 3) * 10;
      setF(7.5, 'bold', grey); text(p[0].toUpperCase(), x, ry);
      setF(10, 'normal', ink); text(p[1] || '-', x, ry + 4.6);
    });

    /* --- sivunumerot --- */
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      setF(7.5, 'normal', grey);
      text(`${s.name || ''}${s.bid ? ' · Y-tunnus ' + s.bid : ''}`, L, 290);
      text(`Sivu ${i}/${pages}`, R, 290, { align: 'right' });
    }

    return doc;
  }
};

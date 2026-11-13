/* search.js – hakukenttä (combobox) asiakkaille ja tuotteille */
const SEARCH = {
  fold(s) {
    return String(s ?? '').toLowerCase()
      .replace(/[äå]/g, 'a').replace(/ö/g, 'o').replace(/é/g, 'e').replace(/ü/g, 'u');
  },
  bigrams(s) {
    const t = ' ' + s + ' ', out = new Map();
    for (let i = 0; i < t.length - 1; i++) { const g = t.substr(i, 2); out.set(g, (out.get(g) || 0) + 1); }
    return out;
  },
  similarity(a, b) {
    if (!a || !b) return 0;
    const A = this.bigrams(a), B = this.bigrams(b);
    let inter = 0, na = 0, nb = 0;
    A.forEach((v, k) => { na += v; if (B.has(k)) inter += Math.min(v, B.get(k)); });
    B.forEach(v => { nb += v; });
    return (2 * inter) / (na + nb);
  },
  find(query, entries, limit = 50) {
    const q = this.fold(query).trim();
    if (!q) return entries.slice(0, limit).map(e => ({ entry: e, score: 9, fuzzy: false }));
    const tokens = q.split(/\s+/).filter(Boolean);
    const hits = [];
    const split = (x) => x.split(/[\s\-–/,.()]+/).filter(Boolean);
    entries.forEach((e, order) => {
      const code = this.fold(e.code), name = this.fold(e.name);
      const hay = code + ' ' + name + ' ' + this.fold(e.extra);
      if (!tokens.every(t => hay.includes(t))) return;
      const words = split(name);
      let score = tokens.reduce((sum, t) =>
        sum + (words.some(w => w.startsWith(t)) ? 0 : name.includes(t) || code.startsWith(t) ? 1 : 2), 0);
      if (code && code === q) score -= 20;
      else if (name.startsWith(q)) score -= 10;
      else if (code && code.startsWith(q)) score -= 8;
      hits.push({ entry: e, score, order, fuzzy: false });
    });
    if (hits.length) return hits.sort((a, b) => a.score - b.score || a.order - b.order).slice(0, limit);
    if (q.length < 3) return [];
    const near = entries.map(e => {
      const name = this.fold(e.name);
      const words = split(name);
      let best = this.similarity(q, name);
      for (let i = 0; i < words.length; i++) {
        for (let n = 1; n <= Math.min(tokens.length + 1, words.length - i); n++) {
          best = Math.max(best, this.similarity(q, words.slice(i, i + n).join(' ')));
        }
      }
      if (e.code) best = Math.max(best, this.similarity(q, this.fold(e.code)));
      return { entry: e, score: 1 - best, fuzzy: true };
    }).filter(h => h.score <= 0.6);
    return near.sort((a, b) => a.score - b.score).slice(0, 6);
  },
  attach(input, opts) {
    if (input._combo) return input._combo;
    const wrap = document.createElement('span');
    wrap.className = 'combo';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    const list = document.createElement('ul');
    list.className = 'combo-list';
    list.setAttribute('role', 'listbox');
    list.hidden = true;
    wrap.appendChild(list);
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    let results = [], active = -1, picked = false;
    const items = () => [...list.querySelectorAll('li[data-k]')];
    const self = this;
    function close() { list.hidden = true; active = -1; input.setAttribute('aria-expanded', 'false'); }
    function highlightItem(i) {
      active = i;
      items().forEach((li, k) => li.classList.toggle('active', k === i));
      const li = items()[i];
      if (li && li.scrollIntoView) li.scrollIntoView({ block: 'nearest' });
    }
    function open(showAll, ignoreQuery) {
      const q = ignoreQuery ? '' : input.value;
      if (!q.trim() && !showAll) { close(); return; }
      results = self.find(q, opts.entries());
      if (!results.length) {
        list.innerHTML = q.trim() ? `<li class="combo-empty">${opts.emptyText || 'Ei osumia'}</li>` : '';
        list.hidden = !q.trim() || !opts.emptyText;
        active = -1;
        return;
      }
      const fuzzy = results[0].fuzzy;
      list.innerHTML = (fuzzy ? '<li class="combo-note">Ei tarkkaa osumaa – lähimmät:</li>' : '') +
        results.map((r, k) => {
          const v = opts.render(r.entry);
          return `<li role="option" data-k="${k}"><b>${esc(v.title)}</b>${v.sub ? `<span>${esc(v.sub)}</span>` : ''}</li>`;
        }).join('');
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      highlightItem(q.trim() ? 0 : -1);
    }
    function pick(k) {
      const r = results[k];
      if (!r) return;
      picked = true;
      close();
      opts.onPick(r.entry);
    }
    input.addEventListener('input', () => { picked = false; if (opts.onType) opts.onType(); open(false); });
    input.addEventListener('focus', () => {
      picked = !!opts.isPicked && opts.isPicked();
      if (opts.selectOnFocus) setTimeout(() => { try { input.select(); } catch (_) {} }, 0);
      if (opts.showAllOnFocus) { open(true, picked); highlightItem(-1); }
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (list.hidden) open(true, picked);
        highlightItem(Math.min(items().length - 1, active + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault(); highlightItem(Math.max(0, active - 1));
      } else if (e.key === 'Enter') {
        if (!list.hidden && active >= 0) { e.preventDefault(); pick(active); }
      } else if (e.key === 'Escape') {
        if (!list.hidden) { e.preventDefault(); close(); }
      }
    });
    list.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const li = e.target.closest('li[data-k]');
      if (li) pick(Number(li.dataset.k));
    });
    input.addEventListener('blur', () => {
      setTimeout(() => {
        const q = input.value.trim();
        if (picked) { close(); return; }
        if (opts.pickOnBlur && q) {
          const r = self.find(q, opts.entries(), 1)[0];
          close();
          if (r) { picked = true; opts.onPick(r.entry); }
          else if (opts.onNoMatch) opts.onNoMatch();
          return;
        }
        close();
      }, 0);
    });
    input._combo = { close, open };
    return input._combo;
  }
};

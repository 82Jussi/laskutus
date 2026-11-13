/* storage.js – rekisteröinnitön OneDrive-malli */
const IDB = {
  _db: null,
  open() {
    if (this._db) return Promise.resolve(this._db);
    return new Promise((res, rej) => {
      const r = indexedDB.open('laskutus', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => { this._db = r.result; res(this._db); };
      r.onerror = () => rej(r.error);
    });
  },
  async get(key) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const q = db.transaction('kv').objectStore('kv').get(key);
      q.onsuccess = () => res(q.result);
      q.onerror = () => rej(q.error);
    });
  },
  async set(key, val) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const t = db.transaction('kv', 'readwrite');
      t.objectStore('kv').put(val, key);
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
    });
  },
  async del(key) {
    const db = await this.open();
    return new Promise((res) => {
      const t = db.transaction('kv', 'readwrite');
      t.objectStore('kv').delete(key);
      t.oncomplete = () => res();
    });
  }
};
const ST = {
  mode: (typeof window.showDirectoryPicker === 'function') ? 'folder' : 'file',
  dir: null,
  async restore() {
    if (this.mode !== 'folder') return null;
    try { this.dir = (await IDB.get('dir')) || null; } catch (_) { this.dir = null; }
    return this.dir;
  },
  async pickFolder() {
    this.dir = await window.showDirectoryPicker({ id: 'laskutus', mode: 'readwrite' });
    await IDB.set('dir', this.dir);
    return this.dir;
  },
  async forget() { this.dir = null; await IDB.del('dir'); },
  async permission(ask = false) {
    if (!this.dir) return 'none';
    const opts = { mode: 'readwrite' };
    let p = await this.dir.queryPermission(opts);
    if (p !== 'granted' && ask) p = await this.dir.requestPermission(opts);
    return p;
  },
  folderName() { return this.dir ? this.dir.name : ''; },
  parts(path) { return String(path || '').split('/').map(s => s.trim()).filter(Boolean); },
  async subdir(path, create = false) {
    let d = this.dir;
    for (const p of this.parts(path)) d = await d.getDirectoryHandle(p, { create });
    return d;
  },
  async fileHandle(path, create = false) {
    const ps = this.parts(path);
    const name = ps.pop();
    const d = await this.subdir(ps.join('/'), create);
    return d.getFileHandle(name, { create });
  },
  async readFile(path) { return (await this.fileHandle(path)).getFile(); },
  async exists(path) { try { await this.fileHandle(path); return true; } catch (_) { return false; } },
  async writeFile(path, blob) {
    const fh = await this.fileHandle(path, true);
    const w = await fh.createWritable();
    await w.write(blob);
    await w.close();
  },
  async list(path = '') {
    const out = [];
    let d;
    try { d = await this.subdir(path); } catch (_) { return out; }
    for await (const [name, handle] of d.entries()) out.push({ name, kind: handle.kind, handle });
    return out.sort((a, b) => a.name.localeCompare(b.name, 'fi'));
  },
  async readJson(path) {
    try { return JSON.parse(await (await this.readFile(path)).text()); } catch (_) { return null; }
  },
  async writeJson(path, obj) {
    await this.writeFile(path, new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }));
  },
  canShareFile(file) {
    const files = Array.isArray(file) ? file : [file];
    try { return !!(navigator.canShare && navigator.canShare({ files })); } catch (_) { return false; }
  },
  async share(file, title, text) {
    const files = Array.isArray(file) ? file : [file];
    await navigator.share({ files, title, text });
  },
  download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
};

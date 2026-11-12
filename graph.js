/* graph.js – Microsoft-kirjautuminen (MSAL) ja OneDrive/Outlook-kutsut (Graph) */

const GRAPH = 'https://graph.microsoft.com/v1.0';
const SCOPES = ['User.Read', 'Files.ReadWrite', 'Mail.Send', 'Mail.ReadWrite'];

const G = {
  msal: null,
  account: null,

  /* ---------- kirjautuminen ---------- */
  init(clientId, tenant) {
    if (!clientId) throw new Error('Client ID puuttuu asetuksista.');
    const redirect = location.origin + location.pathname;
    this.msal = new msal.PublicClientApplication({
      auth: {
        clientId,
        authority: 'https://login.microsoftonline.com/' + (tenant || 'common'),
        redirectUri: redirect,
        navigateToLoginRequestUrl: true
      },
      cache: { cacheLocation: 'localStorage', storeAuthStateInCookie: false }
    });
    return this.msal.initialize();
  },

  async handleRedirect() {
    if (!this.msal) return null;
    const res = await this.msal.handleRedirectPromise();
    if (res && res.account) this.account = res.account;
    if (!this.account) {
      const all = this.msal.getAllAccounts();
      if (all.length) this.account = all[0];
    }
    return this.account;
  },

  async login() {
    try {
      const res = await this.msal.loginPopup({ scopes: SCOPES, prompt: 'select_account' });
      this.account = res.account;
    } catch (e) {
      // popup estetty (tyypillistä mobiilissa) -> redirect
      if (String(e).match(/popup|blocked|window/i)) {
        await this.msal.loginRedirect({ scopes: SCOPES });
        return null;
      }
      throw e;
    }
    return this.account;
  },

  async logout() {
    if (!this.msal) return;
    await this.msal.logoutPopup().catch(() => {});
    this.account = null;
  },

  async token() {
    if (!this.msal) throw new Error('Yhteyttä ei ole alustettu. Anna Client ID asetuksissa.');
    if (!this.account) {
      const all = this.msal.getAllAccounts();
      if (all.length) this.account = all[0]; else await this.login();
    }
    if (!this.account) throw new Error('Kirjautuminen kesken.');
    try {
      const r = await this.msal.acquireTokenSilent({ scopes: SCOPES, account: this.account });
      return r.accessToken;
    } catch (e) {
      const r = await this.msal.acquireTokenPopup({ scopes: SCOPES, account: this.account });
      return r.accessToken;
    }
  },

  signedIn() { return !!this.account; },

  /* ---------- apurit ---------- */
  encPath(p) {
    return (p || '').split('/').filter(Boolean).map(encodeURIComponent).join('/');
  },

  async api(path, opts = {}) {
    const tok = await this.token();
    const headers = Object.assign({ Authorization: 'Bearer ' + tok }, opts.headers || {});
    if (opts.json !== undefined) {
      headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.json);
    }
    const res = await fetch(GRAPH + path, { ...opts, headers });
    if (!res.ok) {
      let msg = res.status + ' ' + res.statusText;
      try { const j = await res.json(); if (j.error) msg = j.error.message || msg; } catch (_) {}
      const err = new Error(msg); err.status = res.status; throw err;
    }
    return res;
  },

  /* ---------- OneDrive ---------- */
  async listChildren(folder) {
    const p = this.encPath(folder);
    const url = p ? `/me/drive/root:/${p}:/children?$top=200&$select=name,id,size,webUrl,folder,file,lastModifiedDateTime`
                  : `/me/drive/root/children?$top=200`;
    const r = await this.api(url);
    const j = await r.json();
    return j.value || [];
  },

  async downloadFile(fullPath) {
    const r = await this.api(`/me/drive/root:/${this.encPath(fullPath)}:/content`);
    return await r.arrayBuffer();
  },

  async getItem(fullPath) {
    const r = await this.api(`/me/drive/root:/${this.encPath(fullPath)}`);
    return await r.json();
  },

  async ensureFolder(folderPath) {
    const parts = (folderPath || '').split('/').filter(Boolean);
    let cur = '';
    for (const part of parts) {
      const parent = cur;
      cur = cur ? cur + '/' + part : part;
      try {
        await this.getItem(cur);
      } catch (e) {
        if (e.status !== 404) throw e;
        const url = parent ? `/me/drive/root:/${this.encPath(parent)}:/children` : `/me/drive/root/children`;
        await this.api(url, {
          method: 'POST',
          json: { name: part, folder: {}, '@microsoft.graph.conflictBehavior': 'replace' }
        });
      }
    }
  },

  async uploadFile(fullPath, data, mime = 'application/octet-stream') {
    const folder = fullPath.split('/').slice(0, -1).join('/');
    if (folder) await this.ensureFolder(folder);
    const tok = await this.token();
    const res = await fetch(
      `${GRAPH}/me/drive/root:/${this.encPath(fullPath)}:/content?@microsoft.graph.conflictBehavior=replace`,
      { method: 'PUT', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': mime }, body: data }
    );
    if (!res.ok) {
      let msg = res.status + ' ' + res.statusText;
      try { const j = await res.json(); if (j.error) msg = j.error.message || msg; } catch (_) {}
      throw new Error('Tallennus epäonnistui: ' + msg);
    }
    return await res.json();
  },

  async readJson(fullPath) {
    try {
      const buf = await this.downloadFile(fullPath);
      return JSON.parse(new TextDecoder().decode(buf));
    } catch (e) {
      if (e.status === 404) return null;
      throw e;
    }
  },

  async writeJson(fullPath, obj) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    return this.uploadFile(fullPath, blob, 'application/json');
  },

  /* ---------- sähköposti ---------- */
  buildMessage({ to, cc, subject, body, fileName, base64 }) {
    const rec = (list) => (list || [])
      .map(s => s.trim()).filter(Boolean)
      .map(a => ({ emailAddress: { address: a } }));
    const msgObj = {
      subject,
      body: { contentType: 'Text', content: body },
      toRecipients: rec(to),
      ccRecipients: rec(cc)
    };
    if (base64) {
      msgObj.attachments = [{
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: fileName,
        contentType: 'application/pdf',
        contentBytes: base64
      }];
    }
    return msgObj;
  },

  async sendMail(opts) {
    await this.api('/me/sendMail', {
      method: 'POST',
      json: { message: this.buildMessage(opts), saveToSentItems: true }
    });
  },

  async createDraft(opts) {
    const r = await this.api('/me/messages', { method: 'POST', json: this.buildMessage(opts) });
    return await r.json();
  },

  async me() {
    const r = await this.api('/me?$select=displayName,mail,userPrincipalName');
    return await r.json();
  }
};

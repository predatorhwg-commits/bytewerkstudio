/* ============================================================
   BYTEWERK STUDIO — AUTH (v1, 03.11.2026)
   ------------------------------------------------------------
   Zwei Backends, eine API:
     BW_AUTH_CONFIG.mode === 'local'     Konten im Browser (PBKDF2)
     BW_AUTH_CONFIG.mode === 'supabase'  echte Konten via Supabase

   Oeffentliche API (alle relevanten Aufrufe sind async):
     BWAuth.register({name, email, password, marketing})
     BWAuth.login(email, password, remember)
     BWAuth.logout()
     BWAuth.getUser()            synchron, aus der Session
     BWAuth.refresh()            Session pruefen/erneuern
     BWAuth.updateProfile({name, marketing})
     BWAuth.changePassword(current, next)
     BWAuth.deleteAccount(password)
     BWAuth.requestReset(email)
     BWAuth.exportData()
     BWAuth.toggleLibrary(productId, on)
     BWAuth.requireAuth()        leitet auf login.html um
     BWAuth.toast(message, type)
     BWAuth.mountAccount()       fuellt [data-account-slot]
     BWAuth.validateEmail / passwordScore / passwordOk

   Hinweis: Im local-Modus liegen Konten im Browser. Das ist eine
   funktionierende Vorschau, aber kein Server-Login. Fuer echte
   Konten mode auf 'supabase' stellen (siehe docs/KONTO.md).
   ============================================================ */

(function (global) {
  'use strict';

  const CFG = Object.assign({
    mode: 'local',
    supabaseUrl: '',
    supabaseAnonKey: '',
    siteUrl: location.origin,
    supportEmail: 'Haqmalh@icloud.com',
    sessionDays: 30
  }, global.BW_AUTH_CONFIG || {});

  const K = {
    accounts: 'bw.accounts.v1',
    session: 'bw.session.v1',
    sbSession: 'bw.sb.session.v1'
  };
  const ITERATIONS = 310000;
  const MAX_FAILS = 5;
  const LOCK_MS = 60000;

  const useSupabase = CFG.mode === 'supabase' && CFG.supabaseUrl && CFG.supabaseAnonKey;
  if (CFG.mode === 'supabase' && !useSupabase) {
    console.warn('[BWAuth] Supabase ist nicht konfiguriert — local-Modus aktiv.');
  }

  /* ---------------- Helpers ---------------- */
  const enc = new TextEncoder();
  const now = () => Date.now();
  const lang = () => (document.documentElement.lang === 'en' ? 'en' : 'de');
  const t = (de, en) => (lang() === 'en' ? en : de);

  function readJSON(storage, key, fallback) {
    try {
      const raw = storage.getItem(key);
      if (!raw) return fallback;
      const val = JSON.parse(raw);
      return val == null ? fallback : val;
    } catch (e) { return fallback; }
  }
  function writeJSON(storage, key, value) {
    try { storage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { console.warn('[BWAuth] Speichern fehlgeschlagen', e); return false; }
  }

  function b64(buf) {
    const bytes = new Uint8Array(buf);
    let out = '';
    for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
    return btoa(out);
  }
  function unb64(str) {
    const bin = atob(str);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function randomB64(bytes) {
    const buf = new Uint8Array(bytes);
    crypto.getRandomValues(buf);
    return b64(buf);
  }
  function uid() {
    if (global.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'u_' + randomB64(16).replace(/[^a-zA-Z0-9]/g, '').slice(0, 22);
  }
  function normalizeEmail(email) { return String(email || '').trim().toLowerCase(); }
  function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(normalizeEmail(email));
  }
  function passwordScore(pw) {
    let s = 0;
    if (pw.length >= 10) s++;
    if (pw.length >= 14) s++;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
    if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
    return Math.min(4, s);
  }
  function passwordOk(pw) {
    return typeof pw === 'string' && pw.length >= 10 &&
      /[a-z]/.test(pw) && /[A-Z]/.test(pw) &&
      (/\d/.test(pw) || /[^A-Za-z0-9]/.test(pw));
  }
  function safeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  }
  async function derive(password, saltB64, iterations) {
    if (!global.crypto || !crypto.subtle) {
      throw new Error(t('Sichere Kryptografie ist nur ueber HTTPS oder localhost verfuegbar.',
        'Secure cryptography is only available over HTTPS or localhost.'));
    }
    const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: unb64(saltB64), iterations: iterations, hash: 'SHA-256' }, key, 256
    );
    return b64(bits);
  }
  function prettyDate(isoOrMs) {
    const d = new Date(isoOrMs);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString(lang() === 'en' ? 'en-GB' : 'de-DE', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  /* ---------------- Local backend ---------------- */
  const Local = {
    accounts() { return readJSON(localStorage, K.accounts, []); },
    save(list) { return writeJSON(localStorage, K.accounts, list); },

    publicUser(acc) {
      return {
        id: acc.id, email: acc.email, name: acc.name,
        createdAt: acc.createdAt, marketing: !!acc.marketing,
        plan: acc.plan || 'free',
        library: Array.isArray(acc.library) ? acc.library.slice() : [],
        orders: Array.isArray(acc.orders) ? acc.orders.slice() : [],
        activity: Array.isArray(acc.activity) ? acc.activity.slice(0, 12) : []
      };
    },

    readSession() {
      const raw = readJSON(localStorage, K.session, null) || readJSON(sessionStorage, K.session, null);
      if (!raw || !raw.uid || !raw.expires) return null;
      if (raw.expires < now()) { this.clearSession(); return null; }
      return raw;
    },
    writeSession(acc, remember) {
      const session = {
        uid: acc.id,
        token: randomB64(24),
        created: now(),
        expires: now() + (CFG.sessionDays || 30) * 86400000
      };
      if (remember) {
        writeJSON(localStorage, K.session, session);
        try { sessionStorage.removeItem(K.session); } catch (e) {}
      } else {
        writeJSON(sessionStorage, K.session, session);
        try { localStorage.removeItem(K.session); } catch (e) {}
      }
      return session;
    },
    clearSession() {
      try { localStorage.removeItem(K.session); } catch (e) {}
      try { sessionStorage.removeItem(K.session); } catch (e) {}
    },

    async register(data) {
      const email = normalizeEmail(data.email);
      const list = this.accounts();
      if (list.some(a => a.email === email)) {
        throw new Error(t('Diese E-Mail ist bereits registriert. Melde dich an.',
          'This email is already registered. Please sign in.'));
      }
      const salt = randomB64(16);
      const hash = await derive(data.password, salt, ITERATIONS);
      const acc = {
        id: uid(), email: email, name: String(data.name || '').trim(),
        salt: salt, hash: hash, iterations: ITERATIONS,
        createdAt: new Date().toISOString(),
        marketing: !!data.marketing,
        plan: 'free', library: [], orders: [],
        fails: 0, lockUntil: 0,
        activity: [{ t: 'account.created', at: new Date().toISOString() }]
      };
      list.push(acc);
      if (!this.save(list)) throw new Error(t('Der Browser-Speicher ist voll oder blockiert.',
        'Browser storage is full or blocked.'));
      this.writeSession(acc, data.remember !== false);
      return { user: this.publicUser(acc), needsConfirmation: false };
    },

    async login(emailRaw, password, remember) {
      const email = normalizeEmail(emailRaw);
      const list = this.accounts();
      const acc = list.find(a => a.email === email);
      if (!acc) throw new Error(t('E-Mail oder Passwort ist falsch.', 'Email or password is incorrect.'));
      if (acc.lockUntil && acc.lockUntil > now()) {
        const secs = Math.ceil((acc.lockUntil - now()) / 1000);
        throw new Error(t('Zu viele Versuche. Bitte in ' + secs + ' Sekunden erneut probieren.',
          'Too many attempts. Please try again in ' + secs + ' seconds.'));
      }
      const hash = await derive(password, acc.salt, acc.iterations || ITERATIONS);
      if (!safeEqual(hash, acc.hash)) {
        acc.fails = (acc.fails || 0) + 1;
        if (acc.fails >= MAX_FAILS) { acc.lockUntil = now() + LOCK_MS; acc.fails = 0; }
        this.save(list);
        throw new Error(t('E-Mail oder Passwort ist falsch.', 'Email or password is incorrect.'));
      }
      acc.fails = 0; acc.lockUntil = 0;
      acc.lastLogin = new Date().toISOString();
      this.pushActivity(acc, 'account.login');
      this.save(list);
      this.writeSession(acc, remember !== false);
      return this.publicUser(acc);
    },

    async logout() { this.clearSession(); return true; },

    async getUser() {
      const session = this.readSession();
      if (!session) return null;
      const acc = this.accounts().find(a => a.id === session.uid);
      if (!acc) { this.clearSession(); return null; }
      return this.publicUser(acc);
    },

    async refresh() { return this.getUser(); },

    async mutate(fn) {
      const session = this.readSession();
      if (!session) throw new Error(t('Bitte melde dich an.', 'Please sign in.'));
      const list = this.accounts();
      const acc = list.find(a => a.id === session.uid);
      if (!acc) throw new Error(t('Konto nicht gefunden.', 'Account not found.'));
      const result = await fn(acc, list);
      this.save(list);
      return result;
    },

    async updateProfile(patch) {
      return this.mutate(acc => {
        if (typeof patch.name === 'string') {
          const name = patch.name.trim();
          if (name.length < 2) throw new Error(t('Bitte gib einen Namen mit mindestens 2 Zeichen ein.', 'Please enter a name with at least 2 characters.'));
          acc.name = name.slice(0, 60);
        }
        if (typeof patch.marketing === 'boolean') acc.marketing = patch.marketing;
        this.pushActivity(acc, 'profile.updated');
        return this.publicUser(acc);
      });
    },

    async changePassword(current, next) {
      if (!passwordOk(next)) throw new Error(t('Das neue Passwort erfuellt die Regeln nicht.', 'The new password does not meet the rules.'));
      return this.mutate(async acc => {
        const hash = await derive(current, acc.salt, acc.iterations || ITERATIONS);
        if (!safeEqual(hash, acc.hash)) throw new Error(t('Das aktuelle Passwort ist falsch.', 'The current password is incorrect.'));
        acc.salt = randomB64(16);
        acc.hash = await derive(next, acc.salt, ITERATIONS);
        acc.iterations = ITERATIONS;
        acc.passwordChangedAt = new Date().toISOString();
        this.pushActivity(acc, 'password.changed');
        return true;
      });
    },

    async deleteAccount(password) {
      const session = this.readSession();
      if (!session) throw new Error(t('Bitte melde dich an.', 'Please sign in.'));
      const list = this.accounts();
      const idx = list.findIndex(a => a.id === session.uid);
      if (idx < 0) throw new Error(t('Konto nicht gefunden.', 'Account not found.'));
      const hash = await derive(password, list[idx].salt, list[idx].iterations || ITERATIONS);
      if (!safeEqual(hash, list[idx].hash)) throw new Error(t('Das Passwort ist falsch.', 'The password is incorrect.'));
      list.splice(idx, 1);
      this.save(list);
      this.clearSession();
      return true;
    },

    async requestReset(email) {
      return { sent: true, local: true, exists: this.accounts().some(a => a.email === normalizeEmail(email)) };
    },

    async toggleLibrary(productId, on) {
      return this.mutate(acc => {
        const lib = Array.isArray(acc.library) ? acc.library : [];
        const set = new Set(lib);
        if (on) set.add(productId); else set.delete(productId);
        acc.library = Array.from(set);
        this.pushActivity(acc, on ? 'library.added' : 'library.removed');
        return this.publicUser(acc);
      });
    },

    pushActivity(acc, type) {
      acc.activity = Array.isArray(acc.activity) ? acc.activity : [];
      acc.activity.unshift({ t: type, at: new Date().toISOString() });
      acc.activity = acc.activity.slice(0, 20);
    }
  };

  /* ---------------- Supabase backend ---------------- */
  const SB = {
    base() { return CFG.supabaseUrl.replace(/\/+$/, ''); },
    headers(token) {
      const h = { 'apikey': CFG.supabaseAnonKey, 'Content-Type': 'application/json' };
      if (token) h['Authorization'] = 'Bearer ' + token;
      return h;
    },
    async call(path, opts) {
      opts = opts || {};
      let res;
      try {
        res = await fetch(this.base() + path, {
          method: opts.method || 'GET',
          headers: this.headers(opts.token),
          body: opts.body ? JSON.stringify(opts.body) : undefined
        });
      } catch (e) {
        throw new Error(t('Keine Verbindung zum Konto-Server.', 'Cannot reach the account server.'));
      }
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const raw = (data && (data.msg || data.error_description || data.error || data.message)) || '';
        if (/invalid login credentials/i.test(raw)) throw new Error(t('E-Mail oder Passwort ist falsch.', 'Email or password is incorrect.'));
        if (/already registered|already exists/i.test(raw)) throw new Error(t('Diese E-Mail ist bereits registriert.', 'This email is already registered.'));
        if (/email not confirmed/i.test(raw)) throw new Error(t('Bitte bestaetige zuerst deine E-Mail-Adresse.', 'Please confirm your email address first.'));
        if (res.status === 429) throw new Error(t('Zu viele Anfragen. Bitte kurz warten.', 'Too many requests. Please wait a moment.'));
        throw new Error(raw || t('Konto-Fehler (' + res.status + ').', 'Account error (' + res.status + ').'));
      }
      return data;
    },
    session() { return readJSON(localStorage, K.sbSession, null); },
    saveSession(data) {
      if (!data || !data.access_token) return null;
      const s = {
        access_token: data.access_token,
        refresh_token: data.refresh_token || '',
        expires_at: data.expires_at || Math.floor(now() / 1000) + (data.expires_in || 3600),
        user: data.user || null
      };
      writeJSON(localStorage, K.sbSession, s);
      return s;
    },
    clear() { try { localStorage.removeItem(K.sbSession); } catch (e) {} },
    normalize(u) {
      if (!u) return null;
      const meta = u.user_metadata || {};
      return {
        id: u.id, email: u.email,
        name: meta.name || String(u.email || '').split('@')[0],
        createdAt: u.created_at, marketing: !!meta.marketing,
        plan: meta.plan || 'free',
        library: Array.isArray(meta.library) ? meta.library : [],
        orders: [],
        activity: []
      };
    },
    async register(data) {
      const out = await this.call('/auth/v1/signup', {
        method: 'POST',
        body: { email: normalizeEmail(data.email), password: data.password, data: { name: String(data.name || '').trim(), marketing: !!data.marketing } }
      });
      if (out && out.access_token) {
        this.saveSession(out);
        return { user: this.normalize(out.user), needsConfirmation: false };
      }
      return { user: this.normalize(out && (out.user || out)), needsConfirmation: true };
    },
    async login(email, password) {
      const out = await this.call('/auth/v1/token?grant_type=password', {
        method: 'POST', body: { email: normalizeEmail(email), password: password }
      });
      this.saveSession(out);
      return this.normalize(out.user);
    },
    async refresh() {
      let s = this.session();
      if (!s) return null;
      if (s.expires_at && s.expires_at * 1000 - 60000 < now() && s.refresh_token) {
        try {
          const out = await this.call('/auth/v1/token?grant_type=refresh_token', {
            method: 'POST', body: { refresh_token: s.refresh_token }
          });
          s = this.saveSession(out) || s;
        } catch (e) { this.clear(); return null; }
      }
      if (!s.access_token) return null;
      try {
        const u = await this.call('/auth/v1/user', { token: s.access_token });
        s.user = u; writeJSON(localStorage, K.sbSession, s);
        return this.normalize(u);
      } catch (e) {
        this.clear();
        return null;
      }
    },
    async getUser() {
      const s = this.session();
      return s && s.user ? this.normalize(s.user) : null;
    },
    async logout() {
      const s = this.session();
      if (s && s.access_token) {
        try { await this.call('/auth/v1/logout', { method: 'POST', token: s.access_token }); } catch (e) {}
      }
      this.clear();
      return true;
    },
    async updateProfile(patch) {
      const s = this.session();
      if (!s) throw new Error(t('Bitte melde dich an.', 'Please sign in.'));
      const meta = (s.user && s.user.user_metadata) || {};
      const data = { ...meta };
      if (typeof patch.name === 'string') data.name = patch.name.trim().slice(0, 60);
      if (typeof patch.marketing === 'boolean') data.marketing = patch.marketing;
      const u = await this.call('/auth/v1/user', { method: 'PUT', token: s.access_token, body: { data: data } });
      s.user = u; writeJSON(localStorage, K.sbSession, s);
      return this.normalize(u);
    },
    async changePassword(current, next) {
      if (!passwordOk(next)) throw new Error(t('Das neue Passwort erfuellt die Regeln nicht.', 'The new password does not meet the rules.'));
      const s = this.session();
      if (!s) throw new Error(t('Bitte melde dich an.', 'Please sign in.'));
      await this.call('/auth/v1/user', { method: 'PUT', token: s.access_token, body: { password: next } });
      return true;
    },
    async deleteAccount() {
      throw new Error(t('Bitte loesche dein Konto per E-Mail an ' + CFG.supportEmail + '.',
        'Please delete your account by emailing ' + CFG.supportEmail + '.'));
    },
    async requestReset(email) {
      await this.call('/auth/v1/recover', {
        method: 'POST',
        body: { email: normalizeEmail(email), redirect_to: CFG.siteUrl + '/login.html?reset=1' }
      });
      return { sent: true, local: false };
    },
    async toggleLibrary(productId, on) {
      const s = this.session();
      if (!s) throw new Error(t('Bitte melde dich an.', 'Please sign in.'));
      const meta = (s.user && s.user.user_metadata) || {};
      const lib = new Set(Array.isArray(meta.library) ? meta.library : []);
      if (on) lib.add(productId); else lib.delete(productId);
      const data = { ...meta, library: Array.from(lib) };
      const u = await this.call('/auth/v1/user', { method: 'PUT', token: s.access_token, body: { data: data } });
      s.user = u; writeJSON(localStorage, K.sbSession, s);
      return this.normalize(u);
    }
  };

  const backend = useSupabase ? SB : Local;

  /* ---------------- Public API ---------------- */
  const API = {
    backend: useSupabase ? 'supabase' : 'local',
    config: CFG,

    validateEmail,
    passwordScore,
    passwordOk,
    prettyDate,

    async register(data) {
      return backend.register(data);
    },
    async login(email, password, remember) {
      return backend.login(email, password, remember);
    },
    async logout() {
      await backend.logout();
      emit(null);
      return true;
    },
    getUser() {
      /* Synchron aus der gespeicherten Session, ohne Netzwerk. */
      if (useSupabase) {
        const s = SB.session();
        return s && s.user ? SB.normalize(s.user) : null;
      }
      const session = Local.readSession();
      if (!session) return null;
      const acc = Local.accounts().find(a => a.id === session.uid);
      return acc ? Local.publicUser(acc) : null;
    },
    async refresh() {
      const u = await backend.refresh();
      if (u) cached = u;
      emit(u);
      return u;
    },
    async updateProfile(patch) {
      const u = await backend.updateProfile(patch);
      cached = u; emit(u);
      return u;
    },
    async changePassword(current, next) {
      return backend.changePassword(current, next);
    },
    async deleteAccount(password) {
      const r = await backend.deleteAccount(password);
      cached = null; emit(null);
      return r;
    },
    async requestReset(email) {
      return backend.requestReset(email);
    },
    async toggleLibrary(id, on) {
      const u = await backend.toggleLibrary(id, on);
      cached = u; emit(u);
      return u;
    },
    exportData() {
      if (useSupabase) {
        return { backend: 'supabase', user: API.getUser() };
      }
      const session = Local.readSession();
      const acc = session ? Local.accounts().find(a => a.id === session.uid) : null;
      if (!acc) return null;
      const copy = { ...acc };
      delete copy.hash; delete copy.salt;
      return { backend: 'local', exportedAt: new Date().toISOString(), account: copy };
    },

    requireAuth() {
      const user = API.getUser();
      if (user) return user;
      const here = location.pathname.split('/').pop() + location.search;
      location.replace('login.html?next=' + encodeURIComponent(here || 'konto.html'));
      return null;
    },

    toast(message, type, ms) {
      const el = document.createElement('div');
      el.className = 'bw-toast ' + (type || 'ok');
      el.setAttribute('role', 'status');
      el.innerHTML = '<span class="bt-dot"></span><span></span>';
      el.lastChild.textContent = message;
      document.body.appendChild(el);
      requestAnimationFrame(() => el.classList.add('show'));
      setTimeout(() => {
        el.classList.remove('show');
        setTimeout(() => el.remove(), 350);
      }, ms || 4200);
    },

    mountAccount,
    onAuthChange(cb) {
      document.addEventListener('bw:auth', e => cb(e.detail.user));
    }
  };

  let cached = null;

  function emit(user) {
    document.dispatchEvent(new CustomEvent('bw:auth', { detail: { user: user } }));
  }

  /* ---------------- Header account UI ---------------- */
  const ICON = {
    user: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c.6-3.6 3.6-5.6 7.5-5.6s6.9 2 7.5 5.6"/></svg>',
    chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
    account: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.4"/><path d="M5 20c.6-3.4 3.4-5.4 7-5.4s6.4 2 7 5.4"/></svg>',
    library: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h5v14H4zM10.5 3.5h4v16h-4zM16 7h4v12.5h-4z"/></svg>',
    settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4v-.2a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></svg>',
    logout: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M10 8l-4 4 4 4M6 12h9"/></svg>'
  };

  function initials(name, email) {
    const base = String(name || email || '?').trim();
    const parts = base.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return base.slice(0, 2).toUpperCase();
  }

  function renderSlot(slot, user) {
    if (!user) {
      if (/^(login|register|passwort-vergessen)$/.test(pageName())) {
        slot.innerHTML = '';
        return;
      }
      slot.innerHTML =
        '<div class="acct-wrap"><a class="acct-btn acct-guest" href="login.html">' +
        '<span class="acct-avatar">' + ICON.user + '</span>' +
        '<span class="acct-label">' + t('Anmelden', 'Sign in') + '</span></a></div>';
      return;
    }
    const label = user.name || user.email.split('@')[0];
    slot.innerHTML =
      '<div class="acct-wrap">' +
        '<button type="button" class="acct-btn" aria-haspopup="true" aria-expanded="false" aria-label="' + t('Konto-Menü', 'Account menu') + '">' +
          '<span class="acct-avatar">' + escapeHTML(initials(user.name, user.email)) + '</span>' +
          '<span class="acct-label">' + escapeHTML(label) + '</span>' +
          '<span class="acct-chev">' + ICON.chevron + '</span>' +
        '</button>' +
        '<div class="account-menu" role="menu">' +
          '<div class="am-head"><div class="am-name">' + escapeHTML(label) + '</div><div class="am-mail">' + escapeHTML(user.email) + '</div></div>' +
          '<a role="menuitem" href="konto.html">' + ICON.account + t('Mein Konto', 'My account') + '</a>' +
          '<a role="menuitem" href="konto.html#bibliothek">' + ICON.library + t('Bibliothek', 'Library') + '</a>' +
          '<a role="menuitem" href="konto.html#profil">' + ICON.settings + t('Profil &amp; Sicherheit', 'Profile &amp; security') + '</a>' +
          '<div class="am-sep"></div>' +
          '<button type="button" role="menuitem" class="am-logout" data-logout>' + ICON.logout + t('Abmelden', 'Sign out') + '</button>' +
        '</div>' +
      '</div>';

    const btn = slot.querySelector('.acct-btn');
    const menu = slot.querySelector('.account-menu');
    const close = () => { menu.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); };
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = menu.classList.toggle('open');
      btn.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', close);
    slot.addEventListener('keydown', (e) => { if (e.key === 'Escape') { close(); btn.focus(); } });
    slot.querySelector('[data-logout]').addEventListener('click', async () => {
      close();
      await API.logout();
      API.toast(t('Du bist abgemeldet.', 'You are signed out.'));
      if (/^konto$/.test(pageName())) location.replace('index.html');
    });
  }

  function escapeHTML(str) {
    return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function pageName() {
    return (location.pathname.split('/').pop() || 'index.html').replace(/\.html$/, '');
  }

  function mountAccount() {
    const slots = document.querySelectorAll('[data-account-slot]');
    if (!slots.length) return;
    const user = API.getUser();
    slots.forEach(s => renderSlot(s, user));
  }

  /* ---------------- Boot ---------------- */
  function boot() {
    if (useSupabase) {
      SB.refresh().then(u => { if (u) { cached = u; emit(u); } }).catch(() => {});
    }
    mountAccount();
    document.addEventListener('bw:lang', mountAccount);
    window.addEventListener('storage', (e) => {
      if (!e.key || e.key === K.session || e.key === K.sbSession) {
        cached = null;
        mountAccount();
        emit(API.getUser());
      }
    });
    window.addEventListener('pageshow', mountAccount);
  }

  global.BWAuth = API;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);

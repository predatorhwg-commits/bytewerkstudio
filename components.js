/* ============================================================
   BYTEWERK STUDIO — components.js
   Shared header + footer (single source of truth) and the
   DE/EN i18n engine. Loaded BEFORE main.js on every page.
   ============================================================ */

(function () {
  const LOGO = `
    <svg viewBox="0 0 28 28" class="bw-logo" aria-hidden="true">
      <rect x="1.5" y="1.5" width="11.5" height="11.5" rx="3" class="sq"/>
      <rect x="15" y="1.5" width="11.5" height="11.5" rx="3" class="sq"/>
      <rect x="1.5" y="15" width="11.5" height="11.5" rx="3" class="sq"/>
      <circle cx="20.75" cy="20.75" r="5.95" class="dot"/>
    </svg>`;

  const NAV_LINKS = [
    { href: 'index.html#leistungen', de: 'Leistungen', en: 'Services', es: 'Servicios', match: null },
    { href: 'arbeiten.html',           de: 'Arbeiten',   en: 'Work',     es: 'Proyectos', match: 'arbeiten' },
    { href: 'bauplan.html',            de: 'Bauplan',    en: 'Blueprint', es: 'Plano', match: 'bauplan' },
    { href: 'showroom.html',           de: 'Showroom',   en: 'Showroom', es: 'Showroom', match: 'showroom' },
    { href: 'community.html',          de: 'Community',  en: 'Community', es: 'Comunidad', match: 'community' },
    { href: 'index.html#preise',     de: 'Preise',     en: 'Pricing',  es: 'Precios', match: null },
    { href: 'shop.html',             de: 'Shop',       en: 'Shop',     es: 'Tienda', match: 'shop' },
    { href: 'studio.html',           de: 'Studio',     en: 'Studio',   es: 'Estudio', match: 'studio' },
    { href: 'entwickler.html',       de: 'Entwickler', en: 'Developers', es: 'Devs', match: 'entwickler' },
    { href: 'kontakt.html',          de: 'Kontakt',    en: 'Contact',  es: 'Contacto', match: 'kontakt' },
  ];

  const page = (location.pathname.split('/').pop() || 'index.html').replace('.html', '');

  const LANGS = ['de', 'en', 'es'];

  const langToggle = `
    <div class="lang-toggle" role="group" aria-label="Sprache / Language / Idioma">
      <button data-lang-btn="de" aria-label="Deutsch" lang="de">DE</button>
      <span class="lang-sep">/</span>
      <button data-lang-btn="en" aria-label="English" lang="en">EN</button>
      <span class="lang-sep">/</span>
      <button data-lang-btn="es" aria-label="Español" lang="es">ES</button>
    </div>`;

  const linksHTML = (mobile) => NAV_LINKS.map(l => {
    const active = l.match && page === l.match ? ' class="active" aria-current="page"' : '';
    return `<a href="${l.href}"${active} data-en="${l.en}" data-es="${l.es || l.en}">${l.de}</a>`;
  }).join('');

  const HEADER = `
    <header class="nav">
      <div class="wrap nav-inner">
        <a class="brand" href="index.html" aria-label="Bytewerk Studio — Startseite" data-en-aria="Bytewerk Studio — Home">
          ${LOGO}
          <span class="brand-name">Bytewerk<i> Studio</i></span>
        </a>
        <nav class="nav-links" aria-label="Hauptnavigation">
          ${linksHTML(false)}
        </nav>
        <div class="nav-right">
          <button class="nav-search" type="button" data-search-open aria-label="Suche öffnen (Strg+K)" data-en-aria="Open search (Ctrl+K)">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m16.5 16.5 4 4"/></svg>
            <kbd>Ctrl K</kbd>
          </button>
          ${langToggle}
          <div class="acct-slot" data-account-slot></div>
          <a class="btn btn-primary" href="kontakt.html" data-en="Start a project <span class=&quot;arr&quot;>→</span>">Projekt starten <span class="arr">→</span></a>
          <button class="nav-toggle" aria-label="Menü öffnen" aria-expanded="false" data-en-aria="Open menu">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="4" y1="8" x2="20" y2="8"/><line x1="4" y1="16" x2="20" y2="16"/></svg>
          </button>
        </div>
      </div>
    </header>
    <div class="mobile-menu">
      ${linksHTML(true)}
      <button class="nav-search" type="button" data-search-open aria-label="Suche öffnen" data-en-aria="Open search">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m16.5 16.5 4 4"/></svg>
        <kbd>Ctrl K</kbd>
      </button>
      <div class="acct-slot" data-account-slot></div>
      <a class="btn btn-primary" href="kontakt.html" data-en="Start a project <span class=&quot;arr&quot;>→</span>">Projekt starten →</a>
      ${langToggle}
    </div>`;

  const FOOTER = `
    <footer class="footer">
      <div class="wrap">
        <div class="footer-top">
          <div class="footer-col">
            <a class="brand" href="index.html" aria-label="Bytewerk Studio">
              ${LOGO}
              <span class="brand-name">Bytewerk<i> Studio</i></span>
            </a>
            <p class="footer-blurb" data-en="Software, web and app development, IT services and digital products from Ludwigshafen am Rhein." data-es="Software, desarrollo web y de apps, servicios IT y productos digitales desde Ludwigshafen am Rhein.">Software, Web- &amp; App-Entwicklung, IT-Dienstleistungen und digitale Produkte aus Ludwigshafen am Rhein.</p>
          </div>
          <div class="footer-col">
            <h4 data-en="Services" data-es="Servicios">Leistungen</h4>
            <a href="softwareentwicklung-ludwigshafen.html" data-en="Software development" data-es="Desarrollo de software">Softwareentwicklung</a>
            <a href="softwareentwicklung-ludwigshafen.html#webentwicklung" data-en="Web development" data-es="Desarrollo web">Web-Entwicklung</a>
            <a href="softwareentwicklung-ludwigshafen.html#app-entwicklung" data-en="App development" data-es="Desarrollo de apps">App-Entwicklung</a>
            <a href="softwareentwicklung-ludwigshafen.html" data-en="IT services" data-es="Servicios IT">IT-Dienstleistungen</a>
          </div>
          <div class="footer-col">
            <h4 data-en="Studio" data-es="Estudio">Studio</h4>
            <a href="studio.html" data-en="About us" data-es="Nosotros">Über uns</a>
            <a href="arbeiten.html" data-en="Work" data-es="Proyectos">Arbeiten</a>
            <a href="bauplan.html" data-en="Blueprint" data-es="Plano">Bauplan</a>
            <a href="showroom.html" data-en="3D showroom" data-es="Showroom 3D">3D-Showroom</a>
            <a href="zeichenwerk.html" data-en="Zeichenwerk" data-es="Zeichenwerk">Zeichenwerk</a>
            <a href="index.html#preise" data-en="Pricing" data-es="Precios">Preise</a>
            <a href="shop.html" data-en="Shop" data-es="Tienda">Shop</a>
            <a href="vergleich.html" data-en="Product comparison" data-es="Comparativa">Produktvergleich</a>
            <a href="entwickler.html" data-en="Developers" data-es="Desarrolladores">Entwickler</a>
            <a href="community.html#forum" data-en="Community forum" data-es="Foro de la comunidad">Community-Forum</a>
            <a href="community.html#abo" data-en="Developer subscription" data-es="Suscripción dev">Entwickler-Abo</a>
            <a href="marke.html" data-en="The mark" data-es="La marca">Die Marke</a>
            <a href="konto.html" data-en="My account" data-es="Mi cuenta">Mein Konto</a>
            <a href="login.html" data-en="Sign in" data-es="Iniciar sesión">Anmelden</a>
            <a href="kontakt.html" data-en="Contact" data-es="Contacto">Kontakt</a>
          </div>
          <div class="footer-col">
            <h4 data-en="Legal" data-es="Legal">Rechtliches</h4>
            <a href="impressum.html" data-en="Imprint" data-es="Aviso legal">Impressum</a>
            <a href="datenschutz.html" data-en="Privacy" data-es="Privacidad">Datenschutz</a>
            <a href="agb.html" data-en="Terms" data-es="Términos">AGB</a>
          </div>
        </div>
        <div class="footer-bottom">
          <span class="small">© <span data-year>2026</span> Bytewerk Studio · bytewerkstudio.com</span>
          <div class="footer-social">
            <a href="https://github.com/bytewerkstudio/bytewerkstudio" aria-label="GitHub" target="_blank" rel="noopener">
              <svg viewBox="0 0 24 24" stroke="none"><path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49v-1.7c-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.55-1.14-4.55-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.27 2.75 1.05A9.4 9.4 0 0 1 12 6.84c.85 0 1.71.12 2.51.34 1.91-1.32 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.81-4.57 5.06.36.32.68.94.68 1.9v2.82c0 .27.18.6.69.49A10.26 10.26 0 0 0 22 12.25C22 6.58 17.52 2 12 2Z"/></svg>
            </a>
            <a href="mailto:Haqmalh@icloud.com" aria-label="E-Mail">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></svg>
            </a>
          </div>
        </div>
      </div>
    </footer>`;

  /* ---- Inject ---- */
  const hSlot = document.querySelector('[data-include="header"]');
  if (hSlot) hSlot.outerHTML = HEADER;
  const fSlot = document.querySelector('[data-include="footer"]');
  if (fSlot) fSlot.outerHTML = FOOTER;

  /* ---- i18n: DE (markup) / EN (data-en) / ES (data-es) ---- */
  const LANG_KEY = 'bw-lang';

  function normalizeLang(value) {
    const v = String(value || '').toLowerCase().slice(0, 2);
    return LANGS.indexOf(v) === -1 ? null : v;
  }

  function currentLang() {
    try {
      return normalizeLang(localStorage.getItem(LANG_KEY)) || normalizeLang(navigator.language) || 'de';
    } catch (_) {
      return normalizeLang(navigator.language) || 'de';
    }
  }

  /* Fallback chain ES -> EN -> DE. Everything is snapshotted once, so
     switching back and forth never stacks translations. */
  function applyLang(lang) {
    lang = normalizeLang(lang) || 'de';
    document.documentElement.lang = lang;
    try { localStorage.setItem(LANG_KEY, lang); } catch (_) {}

    document.querySelectorAll('[data-en], [data-es]').forEach(el => {
      if (el.dataset.i18nDe === undefined) {
        el.dataset.i18nDe = el.innerHTML;
        el.dataset.i18nEn = el.dataset.en !== undefined ? el.dataset.en : el.innerHTML;
        el.dataset.i18nEs = el.dataset.es !== undefined ? el.dataset.es : el.dataset.i18nEn;
      }
      const next = lang === 'de' ? el.dataset.i18nDe : (lang === 'es' ? el.dataset.i18nEs : el.dataset.i18nEn);
      if (next !== undefined) el.innerHTML = next;
    });
    document.querySelectorAll('[data-en-ph], [data-es-ph]').forEach(el => {
      if (el.dataset.i18nDePh === undefined) {
        el.dataset.i18nDePh = el.getAttribute('placeholder') || '';
        el.dataset.i18nEnPh = el.dataset.enPh !== undefined ? el.dataset.enPh : el.dataset.i18nDePh;
        el.dataset.i18nEsPh = el.dataset.esPh !== undefined ? el.dataset.esPh : el.dataset.i18nEnPh;
      }
      const next = lang === 'de' ? el.dataset.i18nDePh : (lang === 'es' ? el.dataset.i18nEsPh : el.dataset.i18nEnPh);
      el.setAttribute('placeholder', next);
    });
    document.querySelectorAll('[data-en-aria], [data-es-aria]').forEach(el => {
      if (el.dataset.i18nDeAria === undefined) {
        el.dataset.i18nDeAria = el.getAttribute('aria-label') || '';
        el.dataset.i18nEnAria = el.dataset.enAria !== undefined ? el.dataset.enAria : el.dataset.i18nDeAria;
        el.dataset.i18nEsAria = el.dataset.esAria !== undefined ? el.dataset.esAria : el.dataset.i18nEnAria;
      }
      const next = lang === 'de' ? el.dataset.i18nDeAria : (lang === 'es' ? el.dataset.i18nEsAria : el.dataset.i18nEnAria);
      el.setAttribute('aria-label', next);
    });
    document.querySelectorAll('[data-lang-btn]').forEach(b => {
      const active = b.dataset.langBtn === lang;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', String(active));
    });
    document.dispatchEvent(new CustomEvent('bw:lang', { detail: { lang } }));
  }

  document.querySelectorAll('[data-lang-btn]').forEach(b => {
    b.addEventListener('click', () => applyLang(b.dataset.langBtn));
  });

  applyLang(currentLang());

  // expose for other scripts / pages added later
  window.bwApplyLang = applyLang;
  /* Page scripts that build their own strings must ask here instead of
     reading documentElement.lang by hand — 'es' is a real value now. */
  window.bwLang = () => normalizeLang(document.documentElement.lang) || 'de';

  /* ---- Werkkorb: only where something can be bought ---- */
  (function () {
    const BUY_PAGES = [
      'index.html', 'shop.html',
      'lernreich-pro.html', 'keyforge-vault.html', 'updatepilot.html',
      'bytewerk-pdf-text-pro.html', 'neon-dominion.html'
    ];
    const file = (location.pathname.split('/').pop() || 'index.html');
    if (BUY_PAGES.indexOf(file) === -1) return;

    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'styles-werkkorb.css';
    document.head.appendChild(css);

    const js = document.createElement('script');
    js.src = 'werkkorb.js';
    js.defer = true;
    document.body.appendChild(js);
  })();
})();

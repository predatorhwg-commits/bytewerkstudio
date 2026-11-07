/* ============================================================
   BYTEWERK STUDIO — forum.js
   ------------------------------------------------------------
   A forum for developers that works without a build step.

   Security is the design constraint, not an afterthought:
   - user content never reaches innerHTML; every node is built
     with createElement/textContent
   - markdown is parsed into a small, closed set of elements
   - links pass a protocol allowlist (http, https, mailto)
   - posts are length-capped, rate-limited and honeypot-checked
   - storage failures (quota, private mode) degrade to a message

   Data lives in localStorage for the preview and is shaped so a
   Supabase adapter can replace the store without touching the UI.
   See docs/FORUM.md and supabase/forum-schema.sql.
   ============================================================ */

(function () {
  'use strict';

  /* ---------------------------------------------------------- */
  /* 1. Configuration                                            */
  /* ---------------------------------------------------------- */

  const CFG = {
    storeKey: 'bw-forum-v1',
    draftKey: 'bw-forum-draft-v1',
    rateKey: 'bw-forum-rate-v1',
    subsKey: 'bw-forum-subs-v1',
    proPreviewKey: 'bw-forum-pro-preview',
    reportsKey: 'bw-forum-reports-v1',
    pageSize: 10,
    maxTitle: 110,
    maxBody: 8000,
    maxTags: 3,
    maxPostsPerMinute: 5,
    minSecondsBetween: 20,
    minFillMs: 3500,
    maxThreadsLocal: 200,
    maxPostsPerThread: 200
  };

  const CATS = [
    { id: 'frontend', de: 'Frontend & UI',      en: 'Frontend & UI',      pro: false },
    { id: 'three',    de: 'three.js & 3D',      en: 'three.js & 3D',      pro: false },
    { id: 'backend',  de: 'Backend & APIs',     en: 'Backend & APIs',     pro: false },
    { id: 'tools',    de: 'Werkzeuge & Ablauf', en: 'Tooling & workflow', pro: false },
    { id: 'studio',   de: 'Studio & Aufträge',  en: 'Studio & client work', pro: true },
    { id: 'feedback', de: 'Produkt-Feedback',   en: 'Product feedback',   pro: true }
  ];

  const CAT_ICONS = {
    frontend: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 4v5"/>',
    three: '<path d="m12 3 8 4.6v8.8L12 21l-8-4.6V7.6z"/><path d="m4 7.6 8 4.7 8-4.7M12 12.3V21"/>',
    backend: '<ellipse cx="12" cy="6" rx="7.5" ry="3"/><path d="M4.5 6v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6M4.5 12v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-6"/>',
    tools: '<path d="M14.5 6.5a4 4 0 0 0 5 5l-8 8a2.8 2.8 0 1 1-4-4l8-8z"/><path d="m5 5 5 5"/>',
    studio: '<path d="M3 20h18M5 20V9l7-5 7 5v11"/><path d="M9 20v-5h6v5"/>',
    feedback: '<path d="M20 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z"/><path d="M8 8h8M8 12h5"/>'
  };

  /* ---------------------------------------------------------- */
  /* 2. Language                                                 */
  /* ---------------------------------------------------------- */

  // The site speaks DE and EN; the developer pages add ES. This page is
  // written in DE/EN, so an ES reader gets English — never German by
  // accident, which is what "not en means de" used to do.
  function lang() {
    let raw = '';
    try {
      raw = (window.bwLang && window.bwLang()) || document.documentElement.lang || 'de';
    } catch (e) {
      raw = document.documentElement.lang || 'de';
    }
    raw = String(raw).toLowerCase().slice(0, 2);
    return raw === 'en' ? 'en' : raw === 'es' ? 'es' : 'de';
  }

  function t(de, en, es) {
    const l = lang();
    if (l === 'es') return es || en;
    return l === 'en' ? en : de;
  }

  /** Official content is bilingual; user content stays as written. */
  function txt(value) {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    return value[lang()] || value.en || value.de || '';
  }

  /* ---------------------------------------------------------- */
  /* 3. Safe DOM helpers                                         */
  /* ---------------------------------------------------------- */

  function el(tag, attrs) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const key in attrs) {
        const value = attrs[key];
        if (value == null || value === false) continue;
        if (key === 'class') node.className = value;
        else if (key === 'text') node.textContent = value;
        else if (key === 'html') node.innerHTML = value; // static strings only
        else if (key === 'dataset') Object.assign(node.dataset, value);
        else if (key === 'aria') {
          for (const a in value) node.setAttribute('aria-' + a, value[a]);
        } else if (key in node && key !== 'list' && key !== 'form' && key !== 'type') {
          node[key] = value;
        } else {
          node.setAttribute(key, value);
        }
      }
    }
    for (let i = 2; i < arguments.length; i++) append(node, arguments[i]);
    return node;
  }

  function append(parent, child) {
    if (child == null) return;
    if (Array.isArray(child)) { child.forEach(c => append(parent, c)); return; }
    parent.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }

  function icon(paths, cls) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    if (cls) svg.setAttribute('class', cls);
    svg.innerHTML = paths; // constant strings from CAT_ICONS / ICONS, never user input
    return svg;
  }

  const ICONS = {
    pin: '<path d="M9 4h6l-1 6 3 3v2H7v-2l3-3z"/><path d="M12 15v5"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
    arrow: '<path d="M4 12h15M13 6l6 6-6 6"/>',
    reply: '<path d="M20 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    flag: '<path d="M5 21V4M5 4h11l-1.5 3.5L16 11H5"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    share: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="m8.2 10.8 7.6-3.6M8.2 13.2l7.6 3.6"/>',
    bell: '<path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10 19a2 2 0 0 0 4 0"/>',
    lock: '<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7.5a4 4 0 0 1 8 0V10"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m14 6 4 4"/>'
  };

  /* ---------------------------------------------------------- */
  /* 4. Markdown (closed element set, no raw HTML)               */
  /* ---------------------------------------------------------- */

  const SAFE_PROTOCOLS = { 'http:': true, 'https:': true, 'mailto:': true };

  function safeUrl(raw) {
    try {
      const url = new URL(String(raw), location.href);
      return SAFE_PROTOCOLS[url.protocol] ? url.href : null;
    } catch (e) {
      return null;
    }
  }

  function inline(parent, text) {
    const re = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*|\[[^\]\n]+\]\([^)\s]+\)|https?:\/\/[^\s<>"']+)/g;
    let last = 0;
    let m;
    while ((m = re.exec(text))) {
      if (m.index > last) parent.appendChild(document.createTextNode(text.slice(last, m.index)));
      const token = m[0];
      if (token[0] === '`') {
        parent.appendChild(el('code', { text: token.slice(1, -1) }));
      } else if (token.startsWith('**')) {
        parent.appendChild(el('strong', { text: token.slice(2, -2) }));
      } else if (token[0] === '*' && token.length > 2) {
        parent.appendChild(el('em', { text: token.slice(1, -1) }));
      } else if (token[0] === '[') {
        const close = token.indexOf('](');
        const label = token.slice(1, close);
        const href = safeUrl(token.slice(close + 2, -1));
        if (href) parent.appendChild(link(href, label));
        else parent.appendChild(document.createTextNode(label));
      } else {
        const href = safeUrl(token);
        if (href) parent.appendChild(link(href, token));
        else parent.appendChild(document.createTextNode(token));
      }
      last = m.index + token.length;
    }
    if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
  }

  function link(href, label) {
    const a = el('a', { href: href, text: label });
    if (/^https?:/i.test(href) && href.indexOf(location.origin) !== 0) {
      a.target = '_blank';
      a.rel = 'noopener noreferrer nofollow ugc';
    }
    return a;
  }

  function renderMarkdown(source, mount) {
    const lines = String(source || '').replace(/\r\n?/g, '\n').split('\n');
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      if (!line.trim()) { i++; continue; }

      // fenced code
      if (/^\s*```/.test(line)) {
        const langName = line.replace(/^\s*```/, '').trim().slice(0, 20);
        const code = [];
        i++;
        while (i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i++]);
        i++; // closing fence (or EOF)
        const pre = el('pre', { class: 'fm-code' });
        if (langName) pre.dataset.lang = langName;
        pre.appendChild(el('code', { text: code.join('\n') }));
        mount.appendChild(pre);
        continue;
      }

      // heading
      const h = /^(#{2,4})\s+(.*)$/.exec(line);
      if (h) {
        const node = el('h' + (h[1].length + 1));
        inline(node, h[2]);
        mount.appendChild(node);
        i++;
        continue;
      }

      // quote
      if (/^\s*>\s?/.test(line)) {
        const quote = el('blockquote');
        while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
          inline(quote, lines[i].replace(/^\s*>\s?/, ''));
          if (i + 1 < lines.length && /^\s*>\s?/.test(lines[i + 1])) quote.appendChild(document.createTextNode(' '));
          i++;
        }
        mount.appendChild(quote);
        continue;
      }

      // lists
      if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
        const ordered = /^\s*\d+\./.test(line);
        const list = el(ordered ? 'ol' : 'ul');
        while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
          const item = el('li');
          inline(item, lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ''));
          list.appendChild(item);
          i++;
        }
        mount.appendChild(list);
        continue;
      }

      // paragraph
      const para = el('p');
      while (i < lines.length && lines[i].trim() &&
             !/^\s*(```|#{2,4}\s|>|[-*]\s|\d+\.\s)/.test(lines[i])) {
        if (para.childNodes.length) para.appendChild(document.createTextNode(' '));
        inline(para, lines[i]);
        i++;
      }
      mount.appendChild(para);
    }
    return mount;
  }

  /* ---------------------------------------------------------- */
  /* 5. Store                                                    */
  /* ---------------------------------------------------------- */

  let db = null;
  let storageOk = true;

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  /* A key can hold anything; only arrays are lists. */
  function readArray(key) {
    const value = readJSON(key, []);
    return Array.isArray(value) ? value : [];
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      storageOk = false;
      toast(t('Der Browser-Speicher ist voll. Lösche alte Themen oder erlaube Speicher für diese Seite.',
              'Browser storage is full. Remove old threads or allow storage for this site.'), 'err');
      return false;
    }
  }

  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function nowISO() { return new Date().toISOString(); }

  function slugify(title) {
    return String(title)
      .toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'thema';
  }

  function uniqueSlug(base, ignoreId) {
    let slug = base;
    let n = 2;
    while (db.threads.some(t => t.slug === slug && t.id !== ignoreId)) {
      slug = base.slice(0, 55) + '-' + n++;
    }
    return slug;
  }

  function seed() {
    const at = (days, hours) => new Date(Date.now() - days * 86400000 - hours * 3600000).toISOString();
    const team = { id: 'team-bytewerk', name: 'Bytewerk Studio', role: 'team', plan: 'pro' };

    return {
      version: 1,
      threads: [
        {
          id: 'th-three-budget', slug: 'three-webgl-budget', cat: 'three', type: 'question',
          title: { de: 'Wie haltet ihr three.js-Szenen unter 60 kB?', en: 'How do you keep three.js scenes under 60 kB?' },
          body: {
            de: 'Wir liefern eine statische Seite aus, die CSP erlaubt nur `script-src \'self\'`. Der three-Build liegt lokal, trotzdem sind wir bei 148 kB gzip für eine einzige Bühne.\n\nWas ich bisher gemacht habe:\n\n- nur `WebGLRenderer`, `PerspectiveCamera`, `Scene` importiert\n- Schatten aus, danach wieder an (sieht ohne zu flach aus)\n- Texturen auf 512 px begrenzt\n\nDie Bühne zeigt 40 Papierkarten, die sich drehen. Ab 30 Karten bricht die Bildrate auf einem iPad Air ein. Wo würdet ihr zuerst ansetzen?',
            en: 'We ship a static site; the CSP only allows `script-src \'self\'`. The three build is local, yet we are at 148 kB gzip for a single stage.\n\nWhat I tried:\n\n- imported only `WebGLRenderer`, `PerspectiveCamera`, `Scene`\n- shadows off, then on again (too flat without)\n- textures capped at 512 px\n\nThe stage shows 40 paper cards rotating. Above 30 cards the frame rate drops on an iPad Air. Where would you start?'
          },
          tags: ['three.js', 'performance', 'bundle'],
          author: team, createdAt: at(6, 2), updatedAt: at(5, 4), pinned: true, solved: true,
          solvedPost: 'po-three-budget-1', views: 214, votes: ['team-bytewerk'], official: true,
          posts: [{
            id: 'po-three-budget-1', author: team, createdAt: at(5, 4), editedAt: null, votes: ['team-bytewerk'],
            body: {
              de: 'Drei Hebel, in dieser Reihenfolge:\n\n1. **Instancing statt 40 Meshes.** `InstancedMesh` mit einer Geometrie und einem Material. Bei uns sanken die Draw Calls von 41 auf 2.\n2. **Pixelratio deckeln.** `renderer.setPixelRatio(Math.min(devicePixelRatio, 2))` — auf dem iPad war 3 der eigentliche Kostentreiber.\n3. **Schatten nur einmal backen.** Ein `CanvasTexture` mit weichem Verlauf unter den Karten kostet nichts pro Frame.\n\n```js\nconst geo = new THREE.PlaneGeometry(1.4, 1.9);\nconst mat = new THREE.MeshStandardMaterial({ color: 0xf6f2ea, roughness: 0.9 });\nconst cards = new THREE.InstancedMesh(geo, mat, 40);\ncards.instanceMatrix.setUsage(THREE.DynamicDrawUsage);\n```\n\nDer Bundle-Größenunterschied zwischen dem vollen Build und einem tree-shaken Build ist real, aber kleiner als erwartet: rund 30 kB gzip. Der Frame-Gewinn kam fast vollständig aus Instancing und Pixelratio.'
              , en: 'Three levers, in this order:\n\n1. **Instancing instead of 40 meshes.** `InstancedMesh` with one geometry and one material. Draw calls went from 41 to 2 for us.\n2. **Cap the pixel ratio.** `renderer.setPixelRatio(Math.min(devicePixelRatio, 2))` — 3 was the real cost driver on iPad.\n3. **Bake shadows once.** A `CanvasTexture` with a soft gradient under the cards costs nothing per frame.\n\n```js\nconst geo = new THREE.PlaneGeometry(1.4, 1.9);\nconst mat = new THREE.MeshStandardMaterial({ color: 0xf6f2ea, roughness: 0.9 });\nconst cards = new THREE.InstancedMesh(geo, mat, 40);\ncards.instanceMatrix.setUsage(THREE.DynamicDrawUsage);\n```\n\nThe bundle difference between the full build and a tree-shaken one is real but smaller than expected: around 30 kB gzip. The frame gain came almost entirely from instancing and pixel ratio.'
            }
          }]
        },
        {
          id: 'th-csp', slug: 'csp-ohne-inline', cat: 'backend', type: 'discussion',
          title: { de: 'CSP ohne unsafe-inline: Wie macht ihr Styles?', en: 'CSP without unsafe-inline: how do you do styles?' },
          body: {
            de: 'Wir wollen `style-src` von `\'unsafe-inline\'` befreien. Im Moment scheitert das an drei Stellen: Fortschrittsbalken mit `style.width`, ein Canvas-Overlay und ein Dialog, der `display` setzt.\n\nMein Plan wäre, alles auf CSS-Variablen und Klassen umzustellen. Übersehe ich etwas?',
            en: 'We want to remove `\'unsafe-inline\'` from `style-src`. Right now three things block it: progress bars using `style.width`, a canvas overlay, and a dialog that sets `display`.\n\nMy plan is to move everything to CSS variables and classes. Am I missing anything?'
          },
          tags: ['security', 'csp'],
          author: team, createdAt: at(11, 6), updatedAt: at(9, 1), pinned: false, solved: false,
          solvedPost: null, views: 118, votes: [], official: true,
          posts: [{
            id: 'po-csp-1', author: team, createdAt: at(9, 1), editedAt: null, votes: [],
            body: {
              de: 'Zwei Fallstricke aus eigener Erfahrung:\n\n- **`element.style.setProperty()` ist kein Inline-Style im CSP-Sinn.** Erlaubt bleibt es trotzdem nur, wenn du keine `style`-Attribute im Markup hast. Alles über `setProperty` auf ein bestehendes Element ist sauber.\n- **`<dialog>` braucht kein `display`.** `showModal()` und `close()` erledigen das; eigene Klassen nur für Animationen.\n\nFür den Canvas: Pointer-Events über Klassen, nicht über `style.pointerEvents`. Dann bleibt `style-src \'self\'` ohne Ausnahme.',
              en: 'Two traps from our own work:\n\n- **`element.style.setProperty()` is not an inline style in the CSP sense.** It still only works if you have no `style` attributes in the markup. Setting properties on an existing element is fine.\n- **`<dialog>` does not need `display`.** `showModal()` and `close()` handle it; use classes only for animation.\n\nFor the canvas: toggle pointer events with a class, not `style.pointerEvents`. Then `style-src \'self\'` needs no exception.'
            }
          }]
        },
        {
          id: 'th-rls', slug: 'supabase-rls', cat: 'backend', type: 'question',
          title: { de: 'Supabase RLS: Muster für mehrstufige Rollen', en: 'Supabase RLS: a pattern for multi-level roles' },
          body: {
            de: 'Ich habe drei Rollen — `member`, `pro`, `moderator` — und möchte, dass `pro`-Beiträge nur von `pro` und `moderator` geschrieben werden. Lesen darf jeder Angemeldete.\n\nReicht eine Policy auf `insert` mit `exists (select 1 from profiles where id = auth.uid() and plan in (\'pro\',\'mod\'))`, oder brauche ich zusätzlich eine Spaltenprüfung?',
            en: 'I have three roles — `member`, `pro`, `moderator` — and want `pro` posts to be writable only by `pro` and `moderator`. Any signed-in user may read.\n\nIs an `insert` policy with `exists (select 1 from profiles where id = auth.uid() and plan in (\'pro\',\'mod\'))` enough, or do I also need a column check?'
          },
          tags: ['supabase', 'postgres', 'rls'],
          author: team, createdAt: at(3, 8), updatedAt: at(3, 3), pinned: false, solved: true,
          solvedPost: 'po-rls-1', views: 96, votes: [], official: true,
          posts: [{
            id: 'po-rls-1', author: team, createdAt: at(3, 3), editedAt: null, votes: [],
            body: {
              de: 'Die Policy reicht für die Zeile, aber sie prüft nicht, **welche Spalte** geschrieben wird. Zwei Regeln, die zusammen greifen:\n\n```sql\n-- plan comes from profiles, never from the client\nalter table public.threads enable row level security;\n\ncreate policy "read for members"\non public.threads for select\nto authenticated using (true);\n\ncreate policy "insert with plan"\non public.threads for insert\nto authenticated\nwith check (\n  author_id = auth.uid()\n  and exists (\n    select 1 from public.profiles p\n    where p.id = auth.uid()\n      and (not public.is_pro_category(category) or p.plan in (\'pro\',\'mod\'))\n  )\n);\n```\n\nWichtig: `plan` niemals aus dem Request übernehmen. Ein Trigger, der `author_id` auf `auth.uid()` zwingt, ist die zweite Sicherung — auch wenn die Policy es schon prüft.',
              en: 'The policy covers the row, but it does not check **which column** is written. Two rules that work together:\n\n```sql\n-- plan comes from profiles, never from the client\nalter table public.threads enable row level security;\n\ncreate policy "read for members"\non public.threads for select\nto authenticated using (true);\n\ncreate policy "insert with plan"\non public.threads for insert\nto authenticated\nwith check (\n  author_id = auth.uid()\n  and exists (\n    select 1 from public.profiles p\n    where p.id = auth.uid()\n      and (not public.is_pro_category(category) or p.plan in (\'pro\',\'mod\'))\n  )\n);\n```\n\nImportant: never take `plan` from the request. A trigger forcing `author_id` to `auth.uid()` is the second lock — even though the policy already checks it.'
            }
          }]
        },
        {
          id: 'th-build', slug: 'statisch-ohne-build', cat: 'tools', type: 'discussion',
          title: { de: 'Statische Seite, kein Build: Was ist euer Werkzeugkasten?', en: 'Static site, no build: what is in your toolbox?' },
          body: {
            de: 'GitHub Pages, direkt aus `main`, kein Bundler. Ich möchte trotzdem nicht auf Module, Tests und lokale Vorschau verzichten.\n\nAktuell: ES-Module direkt im Browser, `python3 -m http.server`, Playwright für die Messung. Fehlt euch etwas?',
            en: 'GitHub Pages straight from `main`, no bundler. I still do not want to give up modules, tests and a local preview.\n\nCurrently: ES modules in the browser, `python3 -m http.server`, Playwright for measurements. What is missing?'
          },
          tags: ['tooling', 'github-pages'],
          author: team, createdAt: at(8, 5), updatedAt: at(8, 5), pinned: false, solved: false,
          solvedPost: null, views: 74, votes: [], official: true,
          posts: []
        },
        {
          id: 'th-fixed', slug: 'festpreis-nachträge', cat: 'studio', type: 'discussion',
          title: { de: 'Festpreis: Wie kalkuliert ihr Nachträge?', en: 'Fixed price: how do you price change requests?' },
          body: {
            de: 'Ein Projekt mit 24 Personentagen, Festpreis, drei Feedbackschleifen inklusive. Die vierte Schleife kommt, der Umfang wächst um zwei Ansichten.\n\nSchreibt ihr Nachträge als eigenes Angebot, oder rechnet ihr in Stunden ab? Und wie kommuniziert ihr das, ohne das Verhältnis zu belasten?',
            en: 'A project at 24 person-days, fixed price, three rounds of feedback included. Round four arrives and the scope grows by two views.\n\nDo you write change requests as a separate quote, or bill by the hour? And how do you communicate it without straining the relationship?'
          },
          tags: ['studio', 'kalkulation'],
          author: team, createdAt: at(2, 2), updatedAt: at(1, 6), pinned: false, solved: false,
          solvedPost: null, views: 52, votes: [], official: true, pro: true,
          posts: [{
            id: 'po-fixed-1', author: team, createdAt: at(1, 6), editedAt: null, votes: [],
            body: {
              de: 'Immer als eigenes Angebot, nie als Überraschung auf der Rechnung. Der Satz, der bei uns funktioniert:\n\n> Die drei Schleifen sind im Festpreis enthalten. Zwei zusätzliche Ansichten sind neue Arbeit — ich habe sie separat kalkuliert, damit der ursprüngliche Preis nachvollziehbar bleibt.\n\nWichtig ist die Reihenfolge: erst Umfang und Preis zeigen, dann fragen, ob es ins Budget passt. Nicht andersherum.',
              en: 'Always as a separate quote, never as a surprise on the invoice. The sentence that works for us:\n\n> The three rounds are included in the fixed price. Two more views are new work — I priced them separately so the original number stays traceable.\n\nOrder matters: show scope and price first, then ask whether it fits the budget. Not the other way around.'
            }
          }]
        },
        {
          id: 'th-resize', slug: 'canvas-flackert-resize', cat: 'frontend', type: 'question',
          title: { de: 'Canvas flackert beim Resize auf dem Tablet', en: 'Canvas flickers on resize on tablet' },
          body: {
            de: 'Beim Drehen des iPads springt die Zeichnung für einen Frame auf die alte Größe zurück, dann sitzt sie. Ich setze `canvas.width` und `canvas.height` im `resize`-Handler und rufe danach neu.\n\nWas fehlt, ist offensichtlich der Kontext-Reset — aber warum nur ein Frame?',
            en: 'When the iPad rotates, the drawing snaps back to the old size for one frame, then settles. I set `canvas.width` and `canvas.height` in the `resize` handler and redraw.\n\nObviously the context reset is missing — but why only one frame?'
          },
          tags: ['canvas', 'resize', 'mobile'],
          author: team, createdAt: at(9, 4), updatedAt: at(8, 7), pinned: false, solved: true,
          solvedPost: 'po-resize-1', views: 143, votes: [], official: true,
          posts: [{
            id: 'po-resize-1', author: team, createdAt: at(8, 7), editedAt: null, votes: [],
            body: {
              de: 'Der eine Frame kommt von der Reihenfolge: `resize` feuert **vor** dem Layout-Durchlauf, also ist `clientWidth` im Handler noch der alte Wert. Du schreibst die alte Größe zurück, der Browser layoutet neu, und erst der nächste Frame zeichnet richtig.\n\nZwei Zeilen lösen es:\n\n```js\nconst ro = new ResizeObserver(entries => {\n  const box = entries[0].contentBoxSize[0];\n  canvas.width  = Math.round(box.inlineSize * dpr);\n  canvas.height = Math.round(box.blockSize * dpr);\n  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);\n  draw();\n});\nro.observe(canvas);\n```\n\n`ResizeObserver` läuft nach dem Layout, und `setTransform` muss nach jeder Größenänderung neu gesetzt werden — sonst zeichnet der Kontext mit dem alten Maßstab.',
              en: 'The single frame comes from ordering: `resize` fires **before** the layout pass, so `clientWidth` still holds the old value in the handler. You write the old size back, the browser lays out again, and only the next frame draws correctly.\n\nTwo lines fix it:\n\n```js\nconst ro = new ResizeObserver(entries => {\n  const box = entries[0].contentBoxSize[0];\n  canvas.width  = Math.round(box.inlineSize * dpr);\n  canvas.height = Math.round(box.blockSize * dpr);\n  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);\n  draw();\n});\nro.observe(canvas);\n```\n\n`ResizeObserver` runs after layout, and `setTransform` has to be set again after every size change — otherwise the context draws with the old scale.'
            }
          }]
        },
        {
          id: 'th-fonts', slug: 'webfonts-selbst-hosten', cat: 'tools', type: 'question',
          title: { de: 'Webfonts selbst hosten: welche Dateien reichen wirklich?', en: 'Self-hosting webfonts: which files are actually enough?' },
          body: {
            de: 'Wir laden Newsreader und Inter über Google Fonts. Datenschutz und die CSP sprechen dagegen, außerdem kostet der externe Request einen Roundtrip.\n\nReicht `woff2` allein, oder brauche ich `woff` als Fallback? Und wie schneide ich die Datei auf die Zeichen, die wir wirklich nutzen?',
            en: 'We load Newsreader and Inter from Google Fonts. Privacy and the CSP argue against it, and the external request costs a round trip.\n\nIs `woff2` alone enough, or do I need `woff` as a fallback? And how do I subset to the characters we actually use?'
          },
          tags: ['fonts', 'performance', 'dsgvo'],
          author: team, createdAt: at(14, 3), updatedAt: at(13, 5), pinned: false, solved: true,
          solvedPost: 'po-fonts-1', views: 187, votes: [], official: true,
          posts: [{
            id: 'po-fonts-1', author: team, createdAt: at(13, 5), editedAt: null, votes: [],
            body: {
              de: '`woff2` allein reicht. Alle Browser, die deine three.js-Seite ohnehin voraussetzt, können es; `woff` ist nur für IE11 und sehr alte Android-Versionen nötig.\n\nZum Subset: `glyphhanger` oder `pyftsubset` mit dem Zeichensatz, den die Seite wirklich braucht. Für Deutsch plus Englisch sind das rund 120 Glyphen statt 900 — bei Newsreader etwa 38 kB statt 210 kB.\n\n```css\n@font-face {\n  font-family: \'Newsreader\';\n  src: url(\'fonts/newsreader-latin.woff2\') format(\'woff2\');\n  font-display: swap;\n  unicode-range: U+0000-00FF, U+2013-2014, U+2018-201D;\n}\n```\n\n`font-display: swap` ist wichtig, sonst blockiert der Text, bis die Datei da ist — und genau das war der Grund für den externen Request.',
              en: '`woff2` alone is enough. Every browser your three.js page already requires supports it; `woff` is only needed for IE11 and very old Android.\n\nFor subsetting: `glyphhanger` or `pyftsubset` with the character set the page actually uses. German plus English is around 120 glyphs instead of 900 — about 38 kB instead of 210 kB for Newsreader.\n\n```css\n@font-face {\n  font-family: \'Newsreader\';\n  src: url(\'fonts/newsreader-latin.woff2\') format(\'woff2\');\n  font-display: swap;\n  unicode-range: U+0000-00FF, U+2013-2014, U+2018-201D;\n}\n```\n\n`font-display: swap` matters, otherwise text blocks until the file arrives — which was the reason for the external request in the first place.'
            }
          }]
        },
        {
          id: 'th-licence', slug: 'lizenz-ohne-login', cat: 'backend', type: 'discussion',
          title: { de: 'Lizenzschlüssel ohne Login prüfen — geht das sicher?', en: 'Verify a licence key without login — can that be secure?' },
          body: {
            de: 'Unsere Windows-Apps sind offline. Ein Schlüssel wird beim Start geprüft, ohne Server. Jetzt soll es eine Web-Seite geben, auf der man den Schlüssel prüfen kann.\n\nOhne Backend ist das trivial fälschbar. Wie macht ihr das, ohne gleich ein Konto zu verlangen?',
            en: 'Our Windows apps are offline. A key is checked at start, without a server. Now there should be a web page where people can check their key.\n\nWithout a backend that is trivially forgeable. How do you do it without requiring an account?'
          },
          tags: ['lizenz', 'security'],
          author: team, createdAt: at(5, 9), updatedAt: at(4, 2), pinned: false, solved: false,
          solvedPost: null, views: 88, votes: [], official: true,
          posts: []
        },
        {
          id: 'th-werkkorb', slug: 'werkkorb-feedback', cat: 'feedback', type: 'discussion',
          title: { de: 'Werkkorb: Was fehlt euch beim Bündeln?', en: 'Gift basket: what is missing when bundling products?' },
          body: {
            de: 'Der Werkkorb bündelt mehrere Apps in eine Kaufanfrage. Was fehlt euch: Rabattstaffel, Lizenzverwaltung, Rechnungsadresse je Position?\n\nSagt es hier — wir bauen die nächste Version danach.',
            en: 'The basket bundles several apps into one purchase request. What is missing: tiered discounts, licence management, an invoice address per line?\n\nTell us here — the next version is built from this thread.'
          },
          tags: ['werkkorb', 'feedback'],
          author: team, createdAt: at(1, 3), updatedAt: at(0, 5), pinned: false, solved: false,
          solvedPost: null, views: 31, votes: [], official: true, pro: true,
          posts: []
        }
      ]
    };
  }

  /* Stored data can be old, half-written or edited by hand. Repair it
     instead of trusting it: one broken entry must not blank the forum. */
  const ROLES = ['team', 'pro', 'member', 'free', 'guest'];

  function cleanText(value, max) {
    if (typeof value === 'string') return value.slice(0, max);
    if (value && typeof value === 'object') {
      const out = {};
      ['de', 'en'].forEach(k => { if (typeof value[k] === 'string') out[k] = value[k].slice(0, max); });
      return out;
    }
    return '';
  }

  function cleanDate(value, fallback) {
    const d = new Date(value);
    return isNaN(d.getTime()) ? fallback : d.toISOString();
  }

  /* Keep an existing slug as it is; only strip what would break a fragment. */
  function cleanSlug(value, fallback) {
    const raw = typeof value === 'string' && value.trim() ? value : fallback;
    const slug = String(raw)
      .toLowerCase()
      .trim()
      .slice(0, 80)
      .replace(/[^a-z0-9äöüß-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return slug || slugify(fallback);
  }

  function cleanAuthor(value, fallbackName) {
    const src = value && typeof value === 'object' ? value : {};
    const name = typeof src.name === 'string' && src.name.trim()
      ? src.name.trim().slice(0, 60)
      : fallbackName;
    return {
      id: typeof src.id === 'string' && src.id ? src.id.slice(0, 80) : 'u-' + slugify(name),
      name: name,
      role: ROLES.indexOf(src.role) !== -1 ? src.role : 'member',
      plan: src.plan === 'pro' ? 'pro' : 'free'
    };
  }

  function cleanPost(value, threadId, index, fallbackTime, fallbackName) {
    if (!value || typeof value !== 'object') return null;
    const body = cleanText(value.body, CFG.maxBody);
    if (!txt(body).trim()) return null;
    return {
      id: typeof value.id === 'string' && value.id ? value.id.slice(0, 80) : threadId + '-p' + index,
      author: cleanAuthor(value.author, fallbackName),
      createdAt: cleanDate(value.createdAt, fallbackTime),
      editedAt: value.editedAt ? cleanDate(value.editedAt, null) : null,
      votes: Array.isArray(value.votes) ? value.votes.filter(v => typeof v === 'string').slice(0, 500) : [],
      body: body,
      replyTo: typeof value.replyTo === 'string' ? value.replyTo.slice(0, 80) : null
    };
  }

  function cleanThread(value, index, fallbackTime) {
    if (!value || typeof value !== 'object') return null;
    const title = cleanText(value.title, CFG.maxTitle);
    const body = cleanText(value.body, CFG.maxBody);
    if (!txt(title).trim() || !txt(body).trim()) return null;

    const fallbackName = t('Unbekannt', 'Unknown');
    const id = typeof value.id === 'string' && value.id ? value.id.slice(0, 80) : 'th-' + index + '-' + uid();
    const created = cleanDate(value.createdAt, fallbackTime);
    const posts = (Array.isArray(value.posts) ? value.posts : [])
      .map((p, i) => cleanPost(p, id, i, created, fallbackName))
      .filter(Boolean)
      .slice(0, CFG.maxPostsPerThread);

    return {
      id: id,
      slug: cleanSlug(value.slug, txt(title)),
      cat: CATS.some(c => c.id === value.cat) ? value.cat : 'frontend',
      type: ['question', 'bug', 'discussion'].indexOf(value.type) !== -1 ? value.type : 'question',
      title: title,
      body: body,
      tags: (Array.isArray(value.tags) ? value.tags : [])
        .filter(v => typeof v === 'string' && v.trim())
        .slice(0, CFG.maxTags)
        .map(v => v.slice(0, 24)),
      author: cleanAuthor(value.author, fallbackName),
      createdAt: created,
      updatedAt: cleanDate(value.updatedAt, created),
      pinned: value.pinned === true,
      solved: value.solved === true,
      solvedPost: typeof value.solvedPost === 'string' ? value.solvedPost.slice(0, 80) : null,
      views: Math.max(0, Math.min(1e9, Math.floor(Number(value.views) || 0))),
      votes: Array.isArray(value.votes) ? value.votes.filter(v => typeof v === 'string').slice(0, 500) : [],
      official: value.official === true,
      posts: posts
    };
  }

  function normalizeDb(data) {
    const raw = data && typeof data === 'object' && Array.isArray(data.threads) ? data.threads : [];
    const now = nowISO();
    const usedSlug = Object.create(null);
    const usedId = Object.create(null);
    const threads = [];

    raw.slice(0, CFG.maxThreadsLocal * 2).forEach((value, i) => {
      const th = cleanThread(value, i, now);
      if (!th) return;
      if (usedId[th.id]) th.id = th.id + '-' + i;
      let slug = th.slug;
      let n = 2;
      while (usedSlug[slug]) slug = th.slug.slice(0, 55) + '-' + n++;
      th.slug = slug;
      usedSlug[slug] = true;
      usedId[th.id] = true;
      threads.push(th);
    });

    return { version: 1, threads: threads.slice(0, CFG.maxThreadsLocal) };
  }

  function load() {
    const stored = readJSON(CFG.storeKey, null);
    const data = normalizeDb(stored);
    if (!data.threads.length) {
      const fresh = seed();
      writeJSON(CFG.storeKey, fresh);
      return fresh;
    }
    // Write back only when the repair changed something.
    if (stored && JSON.stringify(data) !== JSON.stringify(stored)) writeJSON(CFG.storeKey, data);
    return data;
  }

  function save() { return writeJSON(CFG.storeKey, db); }

  function findThread(slugOrId) {
    return db.threads.find(t => t.slug === slugOrId || t.id === slugOrId) || null;
  }

  function catOf(id) {
    return CATS.find(c => c.id === id) || { id: id, de: id, en: id, pro: false };
  }

  /* ---------------------------------------------------------- */
  /* 6. Account, plan and access                                 */
  /* ---------------------------------------------------------- */

  function user() {
    return (window.BWAuth && BWAuth.getUser && BWAuth.getUser()) || null;
  }

  function proPreview() {
    try { return localStorage.getItem(CFG.proPreviewKey) === '1'; } catch (e) { return false; }
  }

  function isPro() {
    const u = user();
    if (u && u.plan === 'pro') return true;
    return proPreview();
  }

  function planLabel() {
    if (!user()) return t('Gast', 'Guest');
    if (proPreview() && (!user() || user().plan !== 'pro')) return t('Pro (Vorschau)', 'Pro (preview)');
    return isPro() ? 'Pro' : 'Community';
  }

  function authorName(u) {
    if (!u) return t('Gast', 'Guest');
    return (u.name || (u.email ? u.email.split('@')[0] : t('Mitglied', 'Member'))).slice(0, 60);
  }

  function authorOf(u) {
    return {
      id: u ? u.id : 'guest',
      name: authorName(u),
      role: u && u.plan === 'pro' ? 'pro' : 'member',
      plan: u ? (u.plan || 'free') : 'guest'
    };
  }

  function currentAuthor() {
    const u = user();
    if (!u) return null;
    const a = authorOf(u);
    if (proPreview() && a.plan !== 'pro') { a.role = 'pro'; a.plan = 'pro'; }
    return a;
  }

  function canWrite(catId) {
    const u = user();
    if (!u) return false;
    const cat = catOf(catId);
    if (cat.pro && !isPro()) return false;
    return true;
  }

  /* ---------------------------------------------------------- */
  /* 7. Rate limit and moderation                                */
  /* ---------------------------------------------------------- */

  function rateCheck() {
    const stamps = readArray(CFG.rateKey).filter(s => typeof s === 'number' && Date.now() - s < 60000);
    if (stamps.length >= CFG.maxPostsPerMinute) {
      return { ok: false, message: t('Zu viele Beiträge in einer Minute. Bitte kurz warten.',
                                    'Too many posts in one minute. Please wait a moment.') };
    }
    const last = stamps[stamps.length - 1] || 0;
    const wait = Math.ceil((CFG.minSecondsBetween * 1000 - (Date.now() - last)) / 1000);
    if (last && wait > 0) {
      return { ok: false, message: t('Noch ' + wait + ' Sekunden bis zum nächsten Beitrag.',
                                    'Another ' + wait + ' seconds before your next post.') };
    }
    return { ok: true };
  }

  function rateMark() {
    const stamps = readArray(CFG.rateKey).filter(s => typeof s === 'number' && Date.now() - s < 60000);
    stamps.push(Date.now());
    writeJSON(CFG.rateKey, stamps);
  }

  function report(itemId, kind) {
    const list = readArray(CFG.reportsKey);
    list.push({ id: itemId, kind: kind, at: nowISO(), by: (user() && user().id) || 'guest' });
    writeJSON(CFG.reportsKey, list.slice(-100));
  }

  /* ---------------------------------------------------------- */
  /* 8. Subscriptions                                            */
  /* ---------------------------------------------------------- */

  function subscriptions() { return readArray(CFG.subsKey).filter(s => typeof s === 'string'); }

  function isSubscribed(slug) { return subscriptions().indexOf(slug) !== -1; }

  function toggleSubscription(slug) {
    const list = subscriptions();
    const i = list.indexOf(slug);
    if (i === -1) list.push(slug); else list.splice(i, 1);
    writeJSON(CFG.subsKey, list);
    return i === -1;
  }

  /* ---------------------------------------------------------- */
  /* 9. Toasts                                                   */
  /* ---------------------------------------------------------- */

  function toast(message, type) {
    const host = document.getElementById('fm-toasts');
    if (!host) return;
    const node = el('div', { class: 'fm-toast ' + (type || 'ok'), role: 'status' });
    node.appendChild(icon(type === 'err' ? ICONS.flag : ICONS.check, 'fm-toast-icon'));
    node.appendChild(el('span', { text: message }));
    host.appendChild(node);
    requestAnimationFrame(() => node.classList.add('is-in'));
    setTimeout(() => {
      node.classList.remove('is-in');
      setTimeout(() => node.remove(), 300);
    }, 4200);
  }

  /* ---------------------------------------------------------- */
  /* 10. Formatting                                              */
  /* ---------------------------------------------------------- */

  function fmtTime(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '—';
    const diff = Date.now() - d.getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return t('gerade eben', 'just now');
    if (min < 60) return t('vor ' + min + ' Min.', min + ' min ago');
    const hours = Math.floor(min / 60);
    if (hours < 24) return t('vor ' + hours + ' Std.', hours + ' h ago');
    const days = Math.floor(hours / 24);
    if (days < 7) return t('vor ' + days + (days === 1 ? ' Tag' : ' Tagen'),
                           days + (days === 1 ? ' day' : ' days') + ' ago');
    return d.toLocaleDateString(lang() === 'de' ? 'de-DE' : 'en-GB',
                                { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function fullDate(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleString(lang() === 'de' ? 'de-DE' : 'en-GB',
                            { dateStyle: 'medium', timeStyle: 'short' });
  }

  function initials(name) {
    const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
    if (parts.length > 1) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return String(name || '?').slice(0, 2).toUpperCase();
  }

  function avatarClass(name) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 6;
    return 'fm-av fm-av-' + (h + 1);
  }

  function avatar(author, size) {
    const name = author && author.name ? author.name : '?';
    return el('span', { class: avatarClass(name) + (size ? ' fm-av-' + size : ''), text: initials(name), aria: { hidden: 'true' } });
  }

  function excerpt(text, max) {
    return String(text || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/[#>*_`\[\]]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max || 160);
  }

  /* Mark search hits with <mark> nodes — never by building HTML. */
  function withHits(node, text, query) {
    const source = String(text || '');
    const parts = String(query || '').toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
    if (!parts.length) { node.textContent = source; return node; }

    const hay = source.toLowerCase();
    let at = 0;
    let marks = 0;
    while (marks < 24) {
      let best = -1;
      let len = 0;
      parts.forEach(part => {
        const i = hay.indexOf(part, at);
        if (i !== -1 && (best === -1 || i < best)) { best = i; len = part.length; }
      });
      if (best === -1) break;
      if (best > at) node.appendChild(document.createTextNode(source.slice(at, best)));
      const mark = el('mark', { class: 'fm-hit' });
      mark.textContent = source.slice(best, best + len);
      node.appendChild(mark);
      at = best + len;
      marks++;
    }
    node.appendChild(document.createTextNode(source.slice(at)));
    return node;
  }

  function typeLabel(type) {
    if (type === 'bug') return t('Fehler', 'Bug');
    if (type === 'discussion') return t('Diskussion', 'Discussion');
    return t('Frage', 'Question');
  }

  function plural(n, one, many) { return n === 1 ? one : many; }

  /* ---------------------------------------------------------- */
  /* 11. Routing                                                 */
  /* ---------------------------------------------------------- */

  const route = { view: 'list', cat: null, slug: null };
  let missingSlug = null;

  function parseRoute() {
    const hash = (location.hash || '').replace(/^#\/?/, '');
    const parts = hash.split('/').filter(Boolean);
    route.view = 'list'; route.cat = null; route.slug = null;
    if (parts[0] === 't' && parts[1]) { route.view = 'thread'; route.slug = decodeURIComponent(parts[1]); }
    else if (parts[0] === 'c' && parts[1]) { route.cat = decodeURIComponent(parts[1]); }
    else if (parts[0] === 'neu' || parts[0] === 'new') { route.view = 'new'; }

    // ?t=slug makes a thread link shareable before the hash is read
    if (route.view === 'list') {
      const param = new URLSearchParams(location.search).get('t');
      if (param) { route.view = 'thread'; route.slug = param; }
    }
  }

  function go(hash) {
    // a ?t= deep link must not survive navigation, otherwise a reload
    // would reopen the thread the reader just left
    if (location.search.indexOf('t=') !== -1) {
      const params = new URLSearchParams(location.search);
      params.delete('t');
      const rest = params.toString();
      try { history.replaceState(null, '', location.pathname + (rest ? '?' + rest : '')); } catch (e) {}
    }
    if (location.hash === hash) { render(); return; }
    location.hash = hash;
  }

  /* ---------------------------------------------------------- */
  /* 12. Rendering: list                                         */
  /* ---------------------------------------------------------- */

  const state = { q: '', sort: 'latest', limit: CFG.pageSize, scope: 'all' };

  function filtered() {
    const q = state.q.trim().toLowerCase();
    let list = db.threads.slice();

    if (route.cat) list = list.filter(t => t.cat === route.cat);

    if (state.scope === 'mine') {
      const uid_ = user() && user().id;
      list = uid_ ? list.filter(t => t.author.id === uid_) : [];
    } else if (state.scope === 'watching') {
      const subs = subscriptions();
      list = list.filter(t => subs.indexOf(t.slug) !== -1);
    }

    if (state.sort === 'unanswered') list = list.filter(t => t.posts.length === 0);

    if (q) {
      list = list.filter(t => {
        const hay = [
          txt(t.title), txt(t.body), (t.tags || []).join(' '), catOf(t.cat).de, catOf(t.cat).en,
          t.posts.map(p => txt(p.body)).join(' ')
        ].join(' ').toLowerCase();
        return q.split(/\s+/).every(part => hay.indexOf(part) !== -1);
      });
    }

    list.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (state.sort === 'active') return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    return list;
  }

  function renderList() {
    const host = document.getElementById('fm-list');
    const empty = document.getElementById('fm-empty');
    if (!host) return;

    const list = filtered();
    const shown = list.slice(0, state.limit);

    host.replaceChildren();

    shown.forEach(th => host.appendChild(threadRow(th)));

    // load more
    const old = document.getElementById('fm-more');
    if (old) old.remove();
    if (list.length > state.limit) {
      const more = el('button', { class: 'fm-more', id: 'fm-more', type: 'button' });
      more.appendChild(el('span', { text: t('Weitere Themen laden', 'Load more threads') }));
      more.appendChild(icon(ICONS.arrow, 'fm-more-icon'));
      more.addEventListener('click', () => { state.limit += CFG.pageSize; renderList(); });
      host.appendChild(more);
    }

    empty.hidden = list.length !== 0;
    if (!list.length) {
      const text = document.getElementById('fm-empty-text');
      if (text) {
        if (state.q) {
          text.textContent = t('Kein Thema passt zu „' + state.q + '“. Andere Schreibweise oder weniger Wörter probieren.',
                               'No thread matches “' + state.q + '”. Try another spelling or fewer words.');
        } else if (state.scope === 'mine') {
          text.textContent = t('Du hast noch kein Thema eröffnet. Das erste dauert eine Minute.',
                               'You have not started a thread yet. The first one takes a minute.');
        } else if (state.scope === 'watching') {
          text.textContent = t('Du beobachtest noch nichts. Öffne ein Thema und drücke „Beobachten“.',
                               'You are not watching anything yet. Open a thread and press “Watch”.');
        } else {
          text.textContent = t('In dieser Kategorie ist noch nichts. Eröffne das erste Thema.',
                               'Nothing in this category yet. Start the first thread.');
        }
      }
    }

    const result = document.getElementById('fm-result');
    if (result) result.textContent = t(
      list.length + (list.length === 1 ? ' Thema' : ' Themen'),
      list.length + (list.length === 1 ? ' thread' : ' threads')
    );

    renderLegend(list.length);
    renderStats();
    renderCats();
  }

  function threadRow(th) {
    const cat = catOf(th.cat);
    const last = th.posts.length ? th.posts[th.posts.length - 1].createdAt : th.createdAt;
    const row = el('article', { class: 'fm-item' + (th.solved ? ' is-solved' : '') + (th.pinned ? ' is-pinned' : '') });

    const main = el('a', { class: 'fm-item-main', href: '#/t/' + encodeURIComponent(th.slug) });
    main.addEventListener('click', e => { e.preventDefault(); go('#/t/' + encodeURIComponent(th.slug)); });

    const top = el('div', { class: 'fm-item-top' });
    if (th.pinned) top.appendChild(el('span', { class: 'fm-chip fm-chip-pin', text: t('Angepinnt', 'Pinned') }));
    const catChip = el('span', { class: 'fm-chip fm-cat-chip' });
    catChip.appendChild(icon(CAT_ICONS[cat.id] || CAT_ICONS.frontend));
    catChip.appendChild(el('span', { text: txt(cat) }));
    top.appendChild(catChip);
    top.appendChild(el('span', { class: 'fm-chip fm-type', text: typeLabel(th.type) }));
    if (cat.pro) top.appendChild(el('span', { class: 'fm-chip fm-chip-pro', text: 'Pro' }));
    if (th.solved) {
      const solved = el('span', { class: 'fm-chip fm-chip-solved' });
      solved.appendChild(icon(ICONS.check));
      solved.appendChild(el('span', { text: t('Gelöst', 'Solved') }));
      top.appendChild(solved);
    }

    main.appendChild(top);
    main.appendChild(withHits(el('h3', { class: 'fm-item-title' }), txt(th.title), state.q));
    main.appendChild(withHits(el('p', { class: 'fm-item-excerpt' }), excerpt(txt(th.body)), state.q));

    if (th.tags && th.tags.length) {
      const tags = el('div', { class: 'fm-item-tags' });
      th.tags.slice(0, 3).forEach(tag => tags.appendChild(el('span', { class: 'fm-tag', text: '#' + tag })));
      main.appendChild(tags);
    }

    const meta = el('div', { class: 'fm-item-meta' });
    meta.appendChild(avatar(th.author, 'sm'));
    meta.appendChild(el('span', { class: 'fm-item-author', text: th.author.name }));
    if (th.author.role === 'team') meta.appendChild(el('span', { class: 'fm-role fm-role-team', text: 'Team' }));
    meta.appendChild(el('span', { class: 'fm-dot', text: '·' }));
    meta.appendChild(el('span', { class: 'fm-time', title: fullDate(th.createdAt), text: fmtTime(th.createdAt) }));
    main.appendChild(meta);

    row.appendChild(main);

    const side = el('div', { class: 'fm-item-side' });
    const replies = el('div', { class: 'fm-count-block' });
    replies.appendChild(el('b', { text: String(th.posts.length) }));
    replies.appendChild(el('span', { text: t('Antworten', 'replies') }));
    side.appendChild(replies);

    const views = el('div', { class: 'fm-views' });
    views.appendChild(icon(ICONS.eye));
    views.appendChild(el('span', { text: String(th.views || 0) }));
    side.appendChild(views);

    side.appendChild(el('span', { class: 'fm-last', title: fullDate(last), text: fmtTime(last) }));
    row.appendChild(side);

    return row;
  }

  function renderLegend(count) {
    const box = document.getElementById('fm-legend');
    const value = document.getElementById('fm-legend-v');
    if (!box || !value) return;
    const bits = [];
    if (state.q) bits.push('„' + state.q + '“');
    if (route.cat) bits.push(txt(catOf(route.cat)));
    if (state.sort === 'unanswered') bits.push(t('nur offene', 'unanswered only'));
    if (state.scope === 'mine') bits.push(t('meine Themen', 'my threads'));
    if (state.scope === 'watching') bits.push(t('beobachtet', 'watching'));
    const on = bits.length > 0;
    box.hidden = !on;
    if (on) value.textContent = bits.join(' · ') + ' — ' + count;
  }

  function renderStats() {
    const posts = db.threads.reduce((n, t) => n + t.posts.length, 0);
    const solved = db.threads.filter(t => t.solved).length;
    const set = (key, value) => {
      const node = document.querySelector('[data-fm-stat="' + key + '"]');
      if (node) node.textContent = String(value);
    };
    set('threads', db.threads.length);
    set('posts', posts);
    set('solved', solved);
    set('cats', CATS.length);
  }

  function renderCats() {
    const host = document.getElementById('fm-cats');
    if (!host) return;
    host.replaceChildren();

    const all = el('button', { type: 'button', class: 'fm-cat' + (!route.cat ? ' is-on' : '') });
    all.appendChild(el('span', { class: 'fm-cat-name', text: t('Alle Themen', 'All threads') }));
    all.appendChild(el('span', { class: 'fm-cat-n', text: String(db.threads.length) }));
    all.addEventListener('click', () => { state.limit = CFG.pageSize; go('#/'); });
    host.appendChild(all);

    CATS.forEach(cat => {
      const count = db.threads.filter(t => t.cat === cat.id).length;
      const btn = el('button', {
        type: 'button',
        class: 'fm-cat' + (route.cat === cat.id ? ' is-on' : '') + (cat.pro ? ' is-pro' : '')
      });
      const left = el('span', { class: 'fm-cat-left' });
      left.appendChild(icon(CAT_ICONS[cat.id] || CAT_ICONS.frontend, 'fm-cat-icon'));
      left.appendChild(el('span', { class: 'fm-cat-name', text: txt(cat) }));
      btn.appendChild(left);
      if (cat.pro) btn.appendChild(el('span', { class: 'fm-cat-pro', text: 'Pro' }));
      btn.appendChild(el('span', { class: 'fm-cat-n', text: String(count) }));
      btn.addEventListener('click', () => {
        state.limit = CFG.pageSize;
        go('#/c/' + cat.id);
      });
      host.appendChild(btn);
    });
  }

  /* ---------------------------------------------------------- */
  /* 13. Rendering: thread                                       */
  /* ---------------------------------------------------------- */

  let replyTo = null;

  function renderThread() {
    const host = document.getElementById('fm-thread');
    const listWrap = document.getElementById('themen');
    if (!host) return;

    const th = findThread(route.slug);
    if (!th) {
      listWrap.hidden = false;
      host.hidden = true;
      return;
    }

    listWrap.hidden = true;
    host.hidden = false;
    host.replaceChildren();

    th.views = (th.views || 0) + 1;
    save();

    const cat = catOf(th.cat);
    const locked = cat.pro && !isPro();

    /* --- head --- */
    const head = el('div', { class: 'fm-th-head' });

    const back = el('button', { type: 'button', class: 'fm-back' });
    back.appendChild(icon(ICONS.arrow, 'fm-back-icon'));
    back.appendChild(el('span', { text: t('Alle Themen', 'All threads') }));
    back.addEventListener('click', () => go(route.cat ? '#/c/' + route.cat : '#/'));
    head.appendChild(back);

    const chips = el('div', { class: 'fm-th-chips' });
    const catChip = el('span', { class: 'fm-chip fm-cat-chip' });
    catChip.appendChild(icon(CAT_ICONS[cat.id] || CAT_ICONS.frontend));
    catChip.appendChild(el('span', { text: txt(cat) }));
    chips.appendChild(catChip);
    chips.appendChild(el('span', { class: 'fm-chip fm-type', text: typeLabel(th.type) }));
    if (th.solved) {
      const s = el('span', { class: 'fm-chip fm-chip-solved' });
      s.appendChild(icon(ICONS.check));
      s.appendChild(el('span', { text: t('Gelöst', 'Solved') }));
      chips.appendChild(s);
    }
    if (cat.pro) chips.appendChild(el('span', { class: 'fm-chip fm-chip-pro', text: 'Pro' }));
    head.appendChild(chips);

    // Seiten-<h1> bleibt der Hero; der Thementitel ist eine Abschnittsueberschrift.
    head.appendChild(el('h2', { class: 'fm-th-title', text: txt(th.title) }));

    const meta = el('div', { class: 'fm-th-meta' });
    meta.appendChild(avatar(th.author, 'sm'));
    meta.appendChild(el('span', { text: th.author.name }));
    if (th.author.role === 'team') meta.appendChild(el('span', { class: 'fm-role fm-role-team', text: 'Team' }));
    meta.appendChild(el('span', { class: 'fm-dot', text: '·' }));
    meta.appendChild(el('span', { text: fullDate(th.createdAt) }));
    meta.appendChild(el('span', { class: 'fm-dot', text: '·' }));
    meta.appendChild(el('span', { text: String(th.views || 0) + ' ' + t('Aufrufe', 'views') }));
    head.appendChild(meta);

    const actions = el('div', { class: 'fm-th-actions' });

    const vote = el('button', { type: 'button', class: 'fm-act' + (hasVoted(th) ? ' is-on' : '') });
    vote.appendChild(icon(ICONS.up));
    vote.appendChild(el('span', { text: String((th.votes || []).length) }));
    vote.title = t('Thema hochstimmen', 'Upvote thread');
    vote.addEventListener('click', () => {
      if (!requireAccount()) return;
      toggleVote(th, 'thread');
      vote.classList.toggle('is-on', hasVoted(th));
      vote.querySelector('span').textContent = String(th.votes.length);
    });
    actions.appendChild(vote);

    const sub = el('button', { type: 'button', class: 'fm-act' + (isSubscribed(th.slug) ? ' is-on' : '') });
    sub.appendChild(icon(ICONS.bell));
    sub.appendChild(el('span', { text: isSubscribed(th.slug) ? t('Beobachtet', 'Watching') : t('Beobachten', 'Watch') }));
    sub.addEventListener('click', () => {
      const on = toggleSubscription(th.slug);
      sub.classList.toggle('is-on', on);
      sub.querySelector('span').textContent = on ? t('Beobachtet', 'Watching') : t('Beobachten', 'Watch');
      toast(on ? t('Du beobachtest dieses Thema.', 'You are watching this thread.')
               : t('Beobachtung beendet.', 'Stopped watching.'));
    });
    actions.appendChild(sub);

    const share = el('button', { type: 'button', class: 'fm-act', aria: { label: t('Link kopieren', 'Copy link') } });
    share.appendChild(icon(ICONS.share));
    share.addEventListener('click', () => copyLink(th));
    actions.appendChild(share);

    if (canModerate(th)) {
      const pin = el('button', { type: 'button', class: 'fm-act', aria: { label: t('Anpinnen', 'Pin') } });
      pin.appendChild(icon(ICONS.pin));
      pin.addEventListener('click', () => { th.pinned = !th.pinned; save(); renderThread(); toast(th.pinned ? t('Angepinnt.', 'Pinned.') : t('Gelöst von oben.', 'Unpinned.')); });
      actions.appendChild(pin);
    }

    head.appendChild(actions);
    host.appendChild(head);

    /* --- locked pro thread --- */
    if (locked) {
      host.appendChild(proWall(cat));
      return;
    }

    /* --- first post body --- */
    host.appendChild(postCard(th, {
      id: th.id, author: th.author, createdAt: th.createdAt, body: th.body,
      votes: th.votes, editedAt: th.editedAt, official: th.official, isFirst: true
    }));

    /* --- replies --- */
    if (th.posts.length) {
      const box = el('section', { class: 'fm-replies', aria: { label: t('Antworten', 'Replies') } });
      const h = el('h2', { class: 'fm-replies-title' });
      h.appendChild(el('span', { text: t('Antworten', 'Replies') }));
      h.appendChild(el('span', { class: 'fm-replies-n', text: String(th.posts.length) }));
      box.appendChild(h);

      th.posts.forEach(p => box.appendChild(postCard(th, p)));

      if (th.solved && th.solvedPost) {
        const note = el('p', { class: 'fm-solved-note' });
        note.appendChild(icon(ICONS.check));
        note.appendChild(el('span', { text: t('Dieses Thema ist gelöst.', 'This thread is solved.') }));
        box.appendChild(note);
      }
      host.appendChild(box);
    }

    /* --- reply form --- */
    host.appendChild(replyBlock(th));
  }

  function hasVoted(th) {
    const u = user();
    return !!(u && th.votes && th.votes.indexOf(u.id) !== -1);
  }

  function toggleVote(th, kind) {
    const u = user();
    if (!u) return;
    if (!Array.isArray(th.votes)) th.votes = [];
    const i = th.votes.indexOf(u.id);
    if (i === -1) th.votes.push(u.id); else th.votes.splice(i, 1);
    save();
  }

  function canModerate(th) {
    const u = user();
    if (!u) return false;
    return th.author.id === u.id || u.email === 'Haqmalh@icloud.com';
  }

  function copyLink(th) {
    const url = location.origin + location.pathname + '#/t/' + encodeURIComponent(th.slug);
    const done = () => toast(t('Link kopiert.', 'Link copied.'));
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, () => fallbackCopy(url, done));
    } else fallbackCopy(url, done);
  }

  function fallbackCopy(text, done) {
    const ta = el('textarea', { value: text });
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { toast(t('Kopieren nicht möglich.', 'Copy failed.'), 'err'); }
    ta.remove();
  }

  function postCard(th, post) {
    const card = el('article', { class: 'fm-post' + (post.official ? ' is-official' : '') + (th.solvedPost === post.id ? ' is-solution' : '') });
    card.id = 'post-' + post.id;

    const side = el('div', { class: 'fm-post-side' });
    side.appendChild(avatar(post.author, 'lg'));

    const voteBtn = el('button', { type: 'button', class: 'fm-vote' + (hasVoted(post) ? ' is-on' : '') });
    voteBtn.appendChild(icon(ICONS.up));
    voteBtn.appendChild(el('b', { text: String((post.votes || []).length) }));
    voteBtn.title = t('Hilfreich', 'Helpful');
    voteBtn.addEventListener('click', () => {
      if (!requireAccount()) return;
      if (!Array.isArray(post.votes)) post.votes = [];
      const uid_ = user().id;
      const i = post.votes.indexOf(uid_);
      if (i === -1) post.votes.push(uid_); else post.votes.splice(i, 1);
      save();
      voteBtn.classList.toggle('is-on', i === -1);
      voteBtn.querySelector('b').textContent = String(post.votes.length);
    });
    side.appendChild(voteBtn);
    card.appendChild(side);

    const main = el('div', { class: 'fm-post-main' });

    const head = el('header', { class: 'fm-post-head' });
    const name = el('span', { class: 'fm-post-name', text: post.author.name });
    head.appendChild(name);
    if (post.author.role === 'team') head.appendChild(el('span', { class: 'fm-role fm-role-team', text: 'Team' }));
    else if (post.author.role === 'pro' || post.author.plan === 'pro') head.appendChild(el('span', { class: 'fm-role fm-role-pro', text: 'Pro' }));
    head.appendChild(el('span', { class: 'fm-dot', text: '·' }));
    head.appendChild(el('span', { class: 'fm-post-time', title: fullDate(post.createdAt), text: fmtTime(post.createdAt) }));
    if (post.editedAt) head.appendChild(el('span', { class: 'fm-post-edited', text: t('bearbeitet', 'edited') }));

    if (th.solvedPost === post.id) {
      const badge = el('span', { class: 'fm-solution-badge' });
      badge.appendChild(icon(ICONS.check));
      badge.appendChild(el('span', { text: t('Lösung', 'Solution') }));
      head.appendChild(badge);
    }
    main.appendChild(head);

    const body = el('div', { class: 'fm-post-body' });
    renderMarkdown(txt(post.body), body);
    main.appendChild(body);

    const foot = el('footer', { class: 'fm-post-foot' });

    const reply = el('button', { type: 'button', class: 'fm-link-btn' });
    reply.appendChild(icon(ICONS.reply));
    reply.appendChild(el('span', { text: t('Antworten', 'Reply') }));
    reply.addEventListener('click', () => {
      replyTo = post.id;
      const form = document.getElementById('fm-reply-form');
      if (form) {
        const ta = form.querySelector('textarea');
        const label = form.querySelector('.fm-reply-to');
        if (label) label.textContent = t('Antwort an ' + post.author.name, 'Replying to ' + post.author.name);
        if (ta) { ta.focus(); ta.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
      }
    });
    foot.appendChild(reply);

    if (!post.isFirst && canModerate(th) && !th.solved) {
      const mark = el('button', { type: 'button', class: 'fm-link-btn fm-link-solve' });
      mark.appendChild(icon(ICONS.check));
      mark.appendChild(el('span', { text: t('Als Lösung markieren', 'Mark as solution') }));
      mark.addEventListener('click', () => {
        th.solved = true;
        th.solvedPost = post.id;
        th.updatedAt = nowISO();
        save();
        renderThread();
        toast(t('Als Lösung markiert.', 'Marked as solution.'));
      });
      foot.appendChild(mark);
    }

    const flag = el('button', { type: 'button', class: 'fm-link-btn fm-link-quiet', aria: { label: t('Melden', 'Report') } });
    flag.appendChild(icon(ICONS.flag));
    flag.addEventListener('click', () => {
      report(post.id, 'post');
      toast(t('Danke, zur Prüfung vorgemerkt.', 'Thanks, queued for review.'));
    });
    foot.appendChild(flag);

    if (canEdit(post)) {
      const edit = el('button', { type: 'button', class: 'fm-link-btn', aria: { label: t('Bearbeiten', 'Edit') } });
      edit.appendChild(icon(ICONS.edit));
      edit.appendChild(el('span', { text: t('Bearbeiten', 'Edit') }));
      edit.addEventListener('click', () => startEdit(th, post, body));
      foot.appendChild(edit);
    }

    if (post.author.id === (user() && user().id) && !post.isFirst) {
      const del = el('button', { type: 'button', class: 'fm-link-btn fm-link-quiet', aria: { label: t('Löschen', 'Delete') } });
      del.appendChild(icon(ICONS.trash));
      del.addEventListener('click', () => {
        if (!confirm(t('Antwort wirklich löschen?', 'Delete this reply?'))) return;
        const i = th.posts.findIndex(p => p.id === post.id);
        if (i !== -1) th.posts.splice(i, 1);
        save();
        renderThread();
        toast(t('Antwort gelöscht.', 'Reply deleted.'));
      });
      foot.appendChild(del);
    }

    main.appendChild(foot);
    card.appendChild(main);

    // deep link
    const anchor = el('a', {
      class: 'fm-post-anchor', href: '#/t/' + encodeURIComponent(th.slug),
      text: '#' + String(th.posts.findIndex(p => p.id === post.id) + 2), aria: { label: t('Link zu diesem Beitrag', 'Link to this post') }
    });
    anchor.addEventListener('click', e => { e.preventDefault(); copyLink(th); });
    main.appendChild(anchor);

    return card;
  }

  function canEdit(post) {
    const u = user();
    return !!(u && post.author && post.author.id === u.id);
  }

  /* Editing happens in place: the card keeps its place, only the body
     becomes a textarea. The title can be fixed on the first post, the
     slug stays — links that were shared must keep working. */
  function startEdit(th, post, bodyNode) {
    if (bodyNode.dataset.editing === '1') return;
    bodyNode.dataset.editing = '1';

    const editor = el('div', { class: 'fm-edit' });

    let titleInput = null;
    const titleId = 'fm-edit-title-' + post.id;
    const bodyId = 'fm-edit-body-' + post.id;
    if (post.isFirst) {
      editor.appendChild(el('label', { class: 'fm-edit-label', htmlFor: titleId, text: t('Titel', 'Title') }));
      titleInput = el('input', { type: 'text', id: titleId, class: 'fm-edit-title', maxlength: CFG.maxTitle, value: txt(th.title) });
      editor.appendChild(titleInput);
    }

    editor.appendChild(el('label', { class: 'fm-edit-label', htmlFor: bodyId, text: post.isFirst ? t('Beitrag', 'Post') : t('Antwort', 'Reply') }));
    const ta = el('textarea', { id: bodyId, class: 'fm-edit-area', rows: 8, maxlength: CFG.maxBody });
    ta.value = txt(post.body);
    editor.appendChild(ta);

    const err = el('p', { class: 'fm-form-error', role: 'alert' });
    err.hidden = true;
    editor.appendChild(err);

    const bar = el('div', { class: 'fm-edit-bar' });
    const cancel = el('button', { type: 'button', class: 'btn btn-ghost', text: t('Abbrechen', 'Cancel') });
    const commit = el('button', { type: 'button', class: 'btn btn-primary', text: t('Änderung speichern', 'Save change') });
    bar.appendChild(el('span', { class: 'fm-edit-hint', text: t('Esc bricht ab', 'Esc cancels') }));
    bar.appendChild(cancel);
    bar.appendChild(commit);
    editor.appendChild(bar);

    function fail(message) {
      err.textContent = message;
      err.hidden = false;
      return false;
    }

    let done = false;

    function unbind() {
      if (done) return false;
      done = true;
      document.removeEventListener('keydown', onKey, true);
      return true;
    }

    function stop() {
      if (!unbind()) return;
      delete bodyNode.dataset.editing;
      bodyNode.replaceChildren();
      renderMarkdown(txt(post.body), bodyNode);
    }

    // Bound to the document, not the textarea: after clicking "Save change"
    // the focus sits on the button, and Escape must still cancel from there
    // (or from the title field, or from any link inside the editor).
    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        stop();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        commit.click();
      }
    }
    document.addEventListener('keydown', onKey, true);

    cancel.addEventListener('click', stop);

    commit.addEventListener('click', () => {
      const value = ta.value.trim();
      const min = post.isFirst ? 20 : 8;
      if (value.length < min) {
        return fail(post.isFirst
          ? t('Bitte beschreibe das Problem in mindestens 20 Zeichen.', 'Please describe the problem in at least 20 characters.')
          : t('Bitte mindestens 8 Zeichen schreiben.', 'Please write at least 8 characters.'));
      }

      let nextTitle = null;
      if (titleInput) {
        nextTitle = titleInput.value.trim();
        if (nextTitle.length < 8) return fail(t('Der Titel braucht mindestens 8 Zeichen.', 'The title needs at least 8 characters.'));
      }

      if (post.isFirst) {
        th.body = value;
        if (nextTitle) th.title = nextTitle;
        th.editedAt = nowISO();
      } else {
        const target = th.posts.find(p => p.id === post.id);
        if (!target) return fail(t('Der Beitrag wurde nicht gefunden.', 'The post could not be found.'));
        target.body = value;
        target.editedAt = nowISO();
      }
      th.updatedAt = nowISO();
      unbind();
      save();
      render();
      toast(t('Änderung gespeichert.', 'Change saved.'));
    });

    bodyNode.replaceChildren(editor);
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }

  function proWall(cat) {
    const box = el('div', { class: 'fm-wall' });
    const mark = el('div', { class: 'fm-wall-mark', aria: { hidden: 'true' } });
    mark.appendChild(icon(ICONS.lock));
    box.appendChild(mark);
    box.appendChild(el('h2', { text: t('Dieses Thema liegt im Studio-Bereich', 'This thread sits in the studio area') }));
    box.appendChild(el('p', {
      text: t('Studio- und Feedback-Themen sind Teil von Studio Pro. Lesen kostet nichts — zum Mitlesen brauchst du den Pro-Zugang.',
              'Studio and feedback threads are part of Studio Pro. Reading is free — you need Pro access to read along.')
    }));
    const actions = el('div', { class: 'fm-wall-actions' });
    const ask = el('button', { type: 'button', class: 'btn btn-primary' });
    ask.appendChild(el('span', { text: t('Pro-Zugang anfragen', 'Request Pro access') }));
    ask.addEventListener('click', requestPro);
    actions.appendChild(ask);
    actions.appendChild(el('a', { class: 'btn btn-ghost', href: 'konto.html', text: t('Zum Konto', 'Open account') }));
    box.appendChild(actions);
    box.appendChild(el('p', { class: 'fm-wall-fine', text: t('Im Vorschau-Modus schaltet die Anfrage den Zugang sofort für dieses Gerät frei.',
                                                              'In preview mode the request unlocks access on this device immediately.') }));
    return box;
  }

  /* ---------------------------------------------------------- */
  /* 14. Reply form                                              */
  /* ---------------------------------------------------------- */

  function replyBlock(th) {
    const wrap = el('section', { class: 'fm-reply-box' });

    if (!user()) {
      const gate = el('div', { class: 'fm-gate' });
      gate.appendChild(el('h2', { text: t('Antworten mit Konto', 'Reply with an account') }));
      gate.appendChild(el('p', { text: t('Ein kostenloses Konto genügt, um in den offenen Kategorien zu antworten. Deine E-Mail wird nie öffentlich.',
                                          'A free account is enough to reply in the open categories. Your email is never shown publicly.') }));
      const row = el('div', { class: 'fm-gate-actions' });
      row.appendChild(el('a', { class: 'btn btn-primary', href: 'register.html?next=' + encodeURIComponent(location.pathname + '#/t/' + th.slug), text: t('Konto erstellen', 'Create account') }));
      row.appendChild(el('a', { class: 'btn btn-ghost', href: 'login.html?next=' + encodeURIComponent(location.pathname + '#/t/' + th.slug), text: t('Anmelden', 'Sign in') }));
      gate.appendChild(row);
      wrap.appendChild(gate);
      return wrap;
    }

    const cat = catOf(th.cat);
    if (cat.pro && !isPro()) {
      wrap.appendChild(proWall(cat));
      return wrap;
    }

    wrap.appendChild(el('h2', { class: 'fm-reply-title', text: t('Deine Antwort', 'Your reply') }));

    const form = el('form', { class: 'fm-reply-form', id: 'fm-reply-form', novalidate: true });

    const to = el('p', { class: 'fm-reply-to' });
    if (replyTo) {
      const target = th.posts.find(p => p.id === replyTo);
      if (target) to.textContent = t('Antwort an ' + target.author.name, 'Replying to ' + target.author.name);
    }
    if (!to.textContent) to.hidden = true;
    form.appendChild(to);

    const ta = el('textarea', { name: 'body', rows: 5, maxlength: CFG.maxBody, required: true,
      placeholder: t('Antwort schreiben …', 'Write a reply …') });
    form.appendChild(ta);

    const bar = el('div', { class: 'fm-reply-bar' });
    const hint = el('span', { class: 'fm-reply-hint' });
    hint.appendChild(el('kbd', { text: 'Strg' }));
    hint.appendChild(el('span', { text: ' + ' }));
    hint.appendChild(el('kbd', { text: '↵' }));
    hint.appendChild(el('span', { text: ' ' + t('zum Senden', 'to send') }));
    bar.appendChild(hint);

    const errEl = el('p', { class: 'fm-form-error', role: 'alert' });
    errEl.hidden = true;
    form.appendChild(errEl);

    const send = el('button', { type: 'submit', class: 'btn btn-primary' });
    send.appendChild(el('span', { text: t('Antwort senden', 'Send reply') }));
    send.appendChild(el('span', { class: 'arr', text: '→' }));
    bar.appendChild(send);
    form.appendChild(bar);

    form.addEventListener('submit', e => {
      e.preventDefault();
      const value = ta.value.trim();
      errEl.hidden = true;
      if (value.length < 8) {
        errEl.textContent = t('Bitte mindestens 8 Zeichen schreiben.', 'Please write at least 8 characters.');
        errEl.hidden = false;
        ta.focus();
        return;
      }
      const rate = rateCheck();
      if (!rate.ok) {
        errEl.textContent = rate.message;
        errEl.hidden = false;
        return;
      }
      th.posts.push({
        id: uid(), author: currentAuthor(), createdAt: nowISO(), editedAt: null,
        votes: [], body: value, replyTo: replyTo || null
      });
      th.updatedAt = nowISO();
      if (th.posts.length > CFG.maxPostsPerThread) th.posts.splice(0, th.posts.length - CFG.maxPostsPerThread);
      rateMark();
      save();
      replyTo = null;
      ta.value = '';
      renderThread();
      toast(t('Antwort veröffentlicht.', 'Reply published.'));
      const last = document.getElementById('fm-reply-form');
      if (last) last.scrollIntoView({ block: 'center' });
    });

    ta.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        form.requestSubmit();
      }
    });

    wrap.appendChild(form);
    return wrap;
  }

  /* ---------------------------------------------------------- */
  /* 15. Composer                                                */
  /* ---------------------------------------------------------- */

  const composer = {
    dialog: null, form: null, cat: null, type: null,
    title: null, body: null, tags: null, err: null, opener: null
  };

  function openComposer(presetCat) {
    if (!requireAccount()) return;
    const d = composer.dialog;
    if (!d) return;
    composer.opener = document.activeElement;

    composer.cat.replaceChildren();
    CATS.forEach(cat => {
      const locked = cat.pro && !isPro();
      const opt = el('option', {
        value: cat.id,
        text: txt(cat) + (locked ? ' ' + t('(Pro)', '(Pro)') : '')
      });
      opt.disabled = locked;
      composer.cat.appendChild(opt);
    });

    const wanted = presetCat || route.cat || (CATS.find(c => !c.pro) || CATS[0]).id;
    composer.cat.value = wanted;
    updateComposerNote();

    const draft = readJSON(CFG.draftKey, null);
    if (draft && !composer.title.value) {
      composer.title.value = draft.title || '';
      composer.body.value = draft.body || '';
      composer.tags.value = draft.tags || '';
    }
    updateCounts();

    if (typeof d.showModal === 'function') d.showModal();
    else d.setAttribute('open', '');
    composer.title.focus();
  }

  function closeComposer() {
    const d = composer.dialog;
    if (!d) return;
    if (typeof d.close === 'function' && d.open) d.close();
    else d.removeAttribute('open');
    restoreComposerFocus();
  }

  /* A dialog that closes should put the cursor back where it came from —
     otherwise Esc drops the reader at the top of the document. */
  function restoreComposerFocus() {
    const back = composer.opener;
    composer.opener = null;
    if (back && back !== document.body && document.contains(back) && typeof back.focus === 'function') {
      back.focus();
    }
  }

  function updateComposerNote() {
    const note = document.getElementById('fm-composer-note');
    if (!note) return;
    const cat = catOf(composer.cat.value);
    note.textContent = cat.pro
      ? t('Studio-Bereich · nur für Pro', 'Studio area · Pro only')
      : t('Für alle mit Konto sichtbar', 'Visible to everyone with an account');
  }

  function updateCounts() {
    const tc = document.getElementById('fm-title-count');
    const bc = document.getElementById('fm-body-count');
    if (tc) tc.textContent = String(composer.title.value.length);
    if (bc) bc.textContent = String(composer.body.value.length);
  }

  function saveDraft() {
    writeJSON(CFG.draftKey, {
      title: composer.title.value.slice(0, CFG.maxTitle),
      body: composer.body.value.slice(0, CFG.maxBody),
      tags: composer.tags.value.slice(0, 80),
      cat: composer.cat.value
    });
  }

  function parseTags(raw) {
    return String(raw || '')
      .split(/[,;]/)
      .map(s => s.trim().replace(/^#/, '').replace(/[^\wäöüÄÖÜß.+\-]/g, ''))
      .filter(Boolean)
      .slice(0, CFG.maxTags)
      .map(s => s.slice(0, 24));
  }

  function submitThread(e) {
    e.preventDefault();
    const err = composer.err;
    err.hidden = true;

    const title = composer.title.value.trim();
    const body = composer.body.value.trim();
    const tags = parseTags(composer.tags.value);

    if (title.length < 8) return fail(t('Der Titel braucht mindestens 8 Zeichen.', 'The title needs at least 8 characters.'));
    if (title.length > CFG.maxTitle) return fail(t('Der Titel ist zu lang.', 'The title is too long.'));
    if (body.length < 20) return fail(t('Bitte beschreibe das Problem in mindestens 20 Zeichen.', 'Please describe the problem in at least 20 characters.'));

    // honeypot
    const hp = composer.form.querySelector('input[name="website"]');
    if (hp && hp.value) return fail(t('Der Beitrag konnte nicht geprüft werden.', 'The post could not be verified.'));

    const cat = catOf(composer.cat.value);
    if (cat.pro && !isPro()) return fail(t('Diese Kategorie gehört zu Studio Pro.', 'This category is part of Studio Pro.'));

    const rate = rateCheck();
    if (!rate.ok) return fail(rate.message);

    if (db.threads.filter(t => t.author.id === (user() && user().id)).length >= CFG.maxThreadsLocal) {
      return fail(t('Du hast das Limit für Vorschau-Themen erreicht.', 'You reached the preview thread limit.'));
    }

    const base = slugify(title);
    const th = {
      id: uid(),
      slug: uniqueSlug(base),
      cat: cat.id,
      type: composer.type.value,
      title: title,
      body: body,
      tags: tags,
      author: currentAuthor(),
      createdAt: nowISO(),
      updatedAt: nowISO(),
      pinned: false,
      solved: false,
      solvedPost: null,
      views: 0,
      votes: [],
      official: false,
      posts: []
    };

    db.threads.unshift(th);
    rateMark();
    if (!save()) return fail(t('Speichern fehlgeschlagen. Bitte Speicher erlauben.', 'Saving failed. Please allow storage.'));
    try { localStorage.removeItem(CFG.draftKey); } catch (e2) {}

    composer.title.value = '';
    composer.body.value = '';
    composer.tags.value = '';
    updateCounts();
    closeComposer();

    go('#/t/' + encodeURIComponent(th.slug));
    toast(t('Thema veröffentlicht.', 'Thread published.'));

    function fail(message) {
      err.textContent = message;
      err.hidden = false;
      err.scrollIntoView({ block: 'nearest' });
      return false;
    }
  }

  /* ---------------------------------------------------------- */
  /* 16. Account gates                                           */
  /* ---------------------------------------------------------- */

  function requireAccount() {
    if (user()) return true;
    toast(t('Bitte melde dich an — ein kostenloses Konto genügt.', 'Please sign in — a free account is enough.'), 'err');
    setTimeout(() => {
      location.href = 'login.html?next=' + encodeURIComponent(location.pathname + location.hash);
    }, 900);
    return false;
  }

  function requirePro() {
    if (!user()) return requireAccount();
    if (isPro()) return true;
    toast(t('Dieser Bereich gehört zu Studio Pro.', 'This area is part of Studio Pro.'), 'err');
    requestPro();
    return false;
  }

  function requestPro() {
    if (!user()) { requireAccount(); return; }
    try { localStorage.setItem(CFG.proPreviewKey, '1'); } catch (e) {}
    toast(t('Pro-Zugang für dieses Gerät freigeschaltet (Vorschau).', 'Pro access unlocked on this device (preview).'));
    renderAccess();
    if (route.view === 'thread') renderThread();
    else renderList();
  }

  function renderAccess() {
    const host = document.getElementById('fm-access');
    if (!host) return;
    host.replaceChildren();

    if (!storageOk) {
      const warn = el('div', { class: 'fm-access-card fm-access-warn' });
      warn.appendChild(el('p', { class: 'fm-access-name', text: t('Speicher blockiert', 'Storage blocked') }));
      warn.appendChild(el('p', { class: 'fm-access-sub', text: t('Themen lassen sich gerade nicht dauerhaft speichern. Erlaube Speicher für diese Seite oder verlasse den privaten Modus.',
                                                               'Threads cannot be saved right now. Allow storage for this site or leave private mode.') }));
      host.appendChild(warn);
    }

    const u = user();
    const box = el('div', { class: 'fm-access-card' });
    if (!u) {
      box.appendChild(el('p', { class: 'fm-access-name', text: t('Nicht angemeldet', 'Not signed in') }));
      box.appendChild(el('p', { class: 'fm-access-sub', text: t('Lesen ist frei. Zum Schreiben brauchst du ein Konto.',
                                                               'Reading is free. An account is needed to write.') }));
      box.appendChild(el('a', { class: 'btn btn-primary fm-access-btn', href: 'login.html?next=' + encodeURIComponent(location.pathname + location.hash), text: t('Anmelden', 'Sign in') }));
      box.appendChild(el('a', { class: 'fm-access-link', href: 'register.html', text: t('Konto erstellen', 'Create account') }));
      host.appendChild(box);
      return;
    }

    const head = el('div', { class: 'fm-access-head' });
    head.appendChild(avatar(currentAuthor(), 'md'));
    const id = el('div', { class: 'fm-access-id' });
    id.appendChild(el('span', { class: 'fm-access-name', text: authorName(u) }));
    const plan = el('span', { class: 'fm-role ' + (isPro() ? 'fm-role-pro' : 'fm-role-free'), text: planLabel() });
    id.appendChild(plan);
    head.appendChild(id);
    box.appendChild(head);

    if (isPro()) {
      box.appendChild(el('p', { class: 'fm-access-sub', text: t('Alle Kategorien offen, inklusive Studio und Feedback.',
                                                               'All categories open, including studio and feedback.') }));
    } else {
      box.appendChild(el('p', { class: 'fm-access-sub', text: t('Vier offene Kategorien. Studio und Feedback sind Pro.',
                                                               'Four open categories. Studio and feedback are Pro.') }));
      const up = el('button', { type: 'button', class: 'btn btn-primary fm-access-btn', text: t('Pro anfragen', 'Request Pro') });
      up.addEventListener('click', requestPro);
      box.appendChild(up);
    }

    const subCount = subscriptions().length;
    if (subCount) {
      const subs = el('button', { type: 'button', class: 'fm-access-link', text: t(subCount + ' beobachtete Themen', subCount + ' watched threads') });
      subs.addEventListener('click', () => {
        const list = subscriptions();
        const first = db.threads.find(t => list.indexOf(t.slug) !== -1);
        if (first) go('#/t/' + encodeURIComponent(first.slug));
      });
      box.appendChild(subs);
    }
    host.appendChild(box);
  }

  /* ---------------------------------------------------------- */
  /* 16b. Solved archive ("Werkstattwissen")                     */
  /* ---------------------------------------------------------- */

  function renderKnowledge() {
    const host = document.getElementById('fm-know-grid');
    const section = document.getElementById('wissen');
    if (!host || !section) return;

    const solved = db.threads
      .filter(t => t.solved)
      .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));

    section.hidden = solved.length === 0;
    host.replaceChildren();

    solved.slice(0, 6).forEach(th => {
      const cat = catOf(th.cat);
      const answer = th.posts.find(p => p.id === th.solvedPost) || th.posts[0];
      const card = el('article', { class: 'fm-know-card' });

      const top = el('div', { class: 'fm-know-top' });
      const chip = el('span', { class: 'fm-chip fm-cat-chip' });
      chip.appendChild(icon(CAT_ICONS[cat.id] || CAT_ICONS.frontend));
      chip.appendChild(el('span', { text: txt(cat) }));
      top.appendChild(chip);
      const solvedChip = el('span', { class: 'fm-chip fm-chip-solved' });
      solvedChip.appendChild(icon(ICONS.check));
      solvedChip.appendChild(el('span', { text: t('Gelöst', 'Solved') }));
      top.appendChild(solvedChip);
      card.appendChild(top);

      const title = el('h3', { class: 'fm-know-title' });
      const link = el('a', { href: '#/t/' + encodeURIComponent(th.slug), text: txt(th.title) });
      link.addEventListener('click', e => { e.preventDefault(); go('#/t/' + encodeURIComponent(th.slug)); });
      title.appendChild(link);
      card.appendChild(title);

      if (answer) {
        const quote = el('p', { class: 'fm-know-answer' });
        renderMarkdown(excerpt(txt(answer.body), 190), quote);
        card.appendChild(quote);
        const by = el('p', { class: 'fm-know-by' });
        by.appendChild(el('span', { text: answer.author.role === 'team' ? t('Antwort des Studios', 'Studio answer') : t('Antwort von ', 'Answer by ') + answer.author.name }));
        card.appendChild(by);
      }

      card.appendChild(el('span', { class: 'fm-know-count', text: th.posts.length + ' ' + t('Antworten', 'replies') }));
      host.appendChild(card);
    });
  }

  /* ---------------------------------------------------------- */
  /* 17. Render dispatch + wiring                                */
  /* ---------------------------------------------------------- */

  function render() {
    if (route.view === 'thread') {
      renderThread();
      if (route.slug) {
        const th = findThread(route.slug);
        document.title = th
          ? txt(th.title) + ' — Bytewerk Forum'
          : t('Thema nicht gefunden — Bytewerk Forum', 'Thread not found — Bytewerk Forum');
        updateMeta(th);
        if (th) {
          missingSlug = null;
        } else if (missingSlug !== route.slug) {
          missingSlug = route.slug;
          toast(t('Dieses Thema gibt es nicht oder nicht mehr. Hier ist die Übersicht.',
                  'This thread does not exist or is gone. Here is the overview.'), 'err');
        }
      }
    } else {
      const listWrap = document.getElementById('themen');
      const threadWrap = document.getElementById('fm-thread');
      if (listWrap) listWrap.hidden = false;
      if (threadWrap) { threadWrap.hidden = true; threadWrap.replaceChildren(); }
      renderList();
      document.title = t('Forum — Fragen, Antworten und Werkstattwissen | Bytewerk Studio',
                         'Forum — questions, answers and workshop knowledge | Bytewerk Studio');
      updateMeta(null);
    }
    renderAccess();
    renderKnowledge();
    document.body.classList.toggle('fm-is-thread', route.view === 'thread');
    scheduleProgress();
  }

  /* ---- reading progress on a thread ---- */
  const progressBar = document.getElementById('fm-progress');
  let progressFrame = 0;

  function updateProgress() {
    progressFrame = 0;
    const span = progressBar && progressBar.firstElementChild;
    const thread = document.getElementById('fm-thread');
    if (!span || !thread || route.view !== 'thread') return;
    const start = thread.getBoundingClientRect().top + window.scrollY;
    const range = document.documentElement.scrollHeight - window.innerHeight - start;
    const ratio = range < 120 ? 1 : Math.min(1, Math.max(0, (window.scrollY - start) / range));
    span.style.transform = 'scaleX(' + ratio.toFixed(4) + ')';
  }

  function scheduleProgress() {
    if (progressFrame) return;
    progressFrame = requestAnimationFrame(updateProgress);
  }

  window.addEventListener('scroll', scheduleProgress, { passive: true });
  window.addEventListener('resize', scheduleProgress);

  /* ---- shareable metadata ---- */
  const META_DEFAULT = {
    title: 'Forum — Fragen, Antworten und Werkstattwissen | Bytewerk Studio',
    description: 'Das Bytewerk-Forum für Entwickler: three.js, Frontend, Backend, Werkzeuge. Fragen stellen, Antworten finden, gelöste Probleme im Archiv.',
    url: 'https://bytewerkstudio.com/forum.html'
  };

  function setMeta(selector, attr, key, value) {
    let node = document.head.querySelector(selector);
    if (!node) {
      node = document.createElement('meta');
      node.setAttribute(attr, key);
      document.head.appendChild(node);
    }
    node.setAttribute('content', value);
  }

  function updateMeta(th) {
    // Thread content is user text. It goes into attributes only, never into
    // JSON-LD: a script block would need escaping rules this page cannot
    // guarantee for every future edit.
    const title = th ? txt(th.title) + ' — Bytewerk Forum' : META_DEFAULT.title;
    const description = th
      ? excerpt(txt(th.body), 155) || META_DEFAULT.description
      : META_DEFAULT.description;
    const url = th
      ? 'https://bytewerkstudio.com/forum.html?t=' + encodeURIComponent(th.slug)
      : META_DEFAULT.url;

    setMeta('meta[name="description"]', 'name', 'description', description);
    setMeta('meta[property="og:title"]', 'property', 'og:title', title);
    setMeta('meta[property="og:description"]', 'property', 'og:description', description);
    setMeta('meta[property="og:url"]', 'property', 'og:url', url);
    setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', title);
    setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', description);

    let canonical = document.head.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = url;
  }

  function wire() {
    composer.dialog = document.getElementById('fm-composer');
    composer.form = document.getElementById('fm-composer-form');
    if (composer.form) {
      composer.cat = document.getElementById('fm-f-cat');
      composer.type = document.getElementById('fm-f-type');
      composer.title = document.getElementById('fm-f-title');
      composer.body = document.getElementById('fm-f-body');
      composer.tags = document.getElementById('fm-f-tags');
      composer.err = document.getElementById('fm-form-error');
      composer.form.addEventListener('submit', submitThread);
      composer.cat.addEventListener('change', updateComposerNote);
      [composer.title, composer.body].forEach(f => f.addEventListener('input', () => { updateCounts(); saveDraft(); }));
      composer.tags.addEventListener('input', saveDraft);

      // markdown buttons
      composer.form.querySelectorAll('[data-fm-md]').forEach(btn => {
        btn.addEventListener('click', () => wrapSelection(btn.dataset.fmMd));
      });
    }

    document.querySelectorAll('[data-fm-new]').forEach(btn => {
      btn.addEventListener('click', () => openComposer());
    });
    document.querySelectorAll('[data-fm-close]').forEach(btn => {
      btn.addEventListener('click', closeComposer);
    });

    if (composer.dialog) {
      composer.dialog.addEventListener('click', e => {
        if (e.target === composer.dialog) closeComposer();
      });
      // Native Escape closes a <dialog> without calling closeComposer().
      composer.dialog.addEventListener('close', restoreComposerFocus);
    }

    document.querySelectorAll('[data-fm-scope]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.scope = btn.dataset.fmScope;
        state.limit = CFG.pageSize;
        document.querySelectorAll('[data-fm-scope]').forEach(b => b.classList.toggle('is-on', b === btn));
        if (route.view !== 'list') go('#/'); else renderList();
      });
    });

    document.querySelectorAll('[data-fm-sort]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.sort = btn.dataset.fmSort;
        state.limit = CFG.pageSize;
        document.querySelectorAll('[data-fm-sort]').forEach(b => b.classList.toggle('is-on', b === btn));
        if (route.view !== 'list') go('#/'); else renderList();
      });
    });

    const search = document.querySelector('[data-fm-search]');
    if (search) {
      let timer = null;
      search.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          state.q = search.value;
          state.limit = CFG.pageSize;
          if (route.view !== 'list') go('#/');
          renderList();
        }, 140);
      });
      search.addEventListener('keydown', e => {
        if (e.key === 'Escape') { search.value = ''; state.q = ''; renderList(); search.blur(); }
      });
    }

    document.querySelectorAll('[data-fm-reset]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.q = '';
        state.sort = 'latest';
        state.scope = 'all';
        state.limit = CFG.pageSize;
        document.querySelectorAll('[data-fm-scope]').forEach(b => b.classList.toggle('is-on', b.dataset.fmScope === 'all'));
        const s = document.querySelector('[data-fm-search]');
        if (s) s.value = '';
        document.querySelectorAll('[data-fm-sort]').forEach(b => b.classList.toggle('is-on', b.dataset.fmSort === 'latest'));
        go('#/');
        renderList();
      });
    });

    document.querySelectorAll('[data-fm-upgrade]').forEach(btn => {
      btn.addEventListener('click', requestPro);
    });

    document.querySelectorAll('[data-fm-goto]').forEach(btn => {
      btn.addEventListener('click', () => {
        const slug = btn.dataset.fmGoto;
        if (findThread(slug)) go('#/t/' + slug);
      });
    });

    // Keyboard: "/" focuses the forum search, "n" opens the composer.
    // Both keys also exist site-wide (ui-v4.js binds "/" to the header
    // search overlay). On this page the forum search is the primary one,
    // so the handler runs in the capture phase and stops there — the
    // header search keeps Cmd/Ctrl+K and its button.
    document.addEventListener('keydown', e => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;

      if (e.key === '/') {
        const s = document.querySelector('[data-fm-search]');
        if (!s) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        s.focus();
        s.select();
        return;
      }

      if (e.key === 'n' || e.key === 'N') {
        if (composer.dialog && composer.dialog.open) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        openComposer();
      }
    }, true);

    window.addEventListener('hashchange', () => {
      parseRoute();
      render();
      const main = document.getElementById('forum');
      if (route.view === 'thread' && main) {
        const top = main.getBoundingClientRect().top + window.scrollY - 84;
        window.scrollTo({ top: top, behavior: 'smooth' });
      }
    });

    document.addEventListener('bw:auth', () => {
      render();
    });

    document.addEventListener('bw:lang', () => {
      // Text nodes built in JS are re-rendered; static markup is handled by components.js.
      // Keep whatever the reader already typed in the reply box.
      const draftReply = document.querySelector('#fm-reply-form textarea');
      const keep = draftReply ? draftReply.value : '';
      if (composer.dialog && composer.dialog.open) updateComposerNote();
      render();
      if (keep) {
        const again = document.querySelector('#fm-reply-form textarea');
        if (again) { again.value = keep; again.focus(); }
      }
    });
  }

  function wrapSelection(kind) {
    const ta = composer.body;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const value = ta.value;
    const picked = value.slice(start, end);
    let before = '';
    let after = '';
    let fallback = '';

    if (kind === 'code') { before = '```js\n'; after = '\n```'; fallback = 'const value = 1;'; }
    else if (kind === 'bold') { before = '**'; after = '**'; fallback = t('fett', 'bold'); }
    else if (kind === 'italic') { before = '*'; after = '*'; fallback = t('kursiv', 'italic'); }
    else if (kind === 'link') { before = '['; after = '](https://)'; fallback = t('Text', 'text'); }
    else if (kind === 'list') { before = '- '; after = ''; fallback = t('Punkt', 'item'); }

    const insert = picked || fallback;
    ta.value = value.slice(0, start) + before + insert + after + value.slice(end);
    const caret = start + before.length;
    ta.focus();
    ta.setSelectionRange(caret, caret + insert.length);
    updateCounts();
    saveDraft();
  }

  /* ---------------------------------------------------------- */
  /* 18. Boot                                                    */
  /* ---------------------------------------------------------- */

  /* The plan prices live on the developer page. That page ships with its
     own change set. Because the header is built from the same navigation
     list, its link is a reliable, network-free signal: no link there, no
     page in this build — then a sentence beats a dead link. */
  function checkPlansLink() {
    const link = document.querySelector('[data-fm-plans-link]');
    if (!link) return;
    if (document.querySelector('header a[href="entwickler.html"]')) return;
    const p = document.createElement('span');
    p.textContent = t('Preise folgen mit der Entwickler-Seite.', 'Pricing follows with the developer page.');
    link.replaceWith(p);
  }

  function boot() {
    db = load();
    parseRoute();
    wire();
    render();

    // deep-linked post: scroll once layout is ready
    if (route.view === 'thread') {
      const target = location.hash.split('~')[1];
      if (target) {
        const node = document.getElementById('post-' + target);
        if (node) setTimeout(() => node.scrollIntoView({ block: 'center' }), 60);
      }
    }

    document.documentElement.classList.add('fm-ready');
    checkPlansLink();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // small surface for tests and for the 3D scene
  window.bwForum = {
    threads: () => db.threads.map(t => ({ slug: t.slug, cat: t.cat, title: txt(t.title), solved: t.solved })),
    open: slug => go('#/t/' + encodeURIComponent(slug)),
    openComposer: openComposer,
    state: () => ({ route: Object.assign({}, route), q: state.q, sort: state.sort, pro: isPro(), user: !!user() }),
    _renderMarkdown: renderMarkdown,
    _knowledgeCount: () => document.querySelectorAll('#fm-know-grid .fm-know-card').length,
    _safeUrl: safeUrl
  };
})();

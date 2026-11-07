/* ============================================================
   BYTEWERK STUDIO — WERKSTATT
   ------------------------------------------------------------
   Abo-Umschalter, Forum (lokal), Code-Tabs und Kopieren.
   Grundsatz: Nutzertext geht ausschliesslich ueber textContent.
   ============================================================ */

(function () {
  'use strict';

  /* DE/EN/ES wie in components.js: gleiche Texte im Markup, hier nur
     die Stellen, die JavaScript selbst schreibt. */
  var LANGS = ['de', 'en', 'es'];
  var LANG = function () {
    var lang = (document.documentElement.lang || 'de').slice(0, 2).toLowerCase();
    return LANGS.indexOf(lang) === -1 ? 'de' : lang;
  };
  var T = function (de, en, es) {
    var lang = LANG();
    if (lang === 'es') return es || en || de;
    return lang === 'en' ? en : de;
  };

  var INT = { de: 'de-DE', en: 'en-GB', es: 'es-ES' };
  var euro = function (value) {
    try {
      return new Intl.NumberFormat(INT[LANG()], {
        style: 'currency', currency: 'EUR', maximumFractionDigits: 0
      }).format(value);
    } catch (e) {
      return value + ' €';
    }
  };

  var store = {
    get: function (key, fallback) {
      try {
        var raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (e) { return fallback; }
    },
    set: function (key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); return true; }
      catch (e) { return false; }
    }
  };

  /* ------------------------------------------------------------
     1. Abo
     ------------------------------------------------------------ */
  var PLANS = {
    studio: { month: 19, year: 190 },
    team: { month: 49, year: 490 }
  };
  var billing = 'month';
  var MAIL = 'Haqmalh@icloud.com';
  var PLAN_LABEL = { studio: 'Studio', team: 'Team' };

  /* Die Abo-Knoepfe oeffnen eine vorbereitete Mail: Tarif, Zeitraum und
     Preis stehen schon drin. kontakt.html kennt den ?plan=-Parameter
     nicht, deshalb waere der Klick dort ein Formular ohne Kontext. */
  function planMailto(key) {
    var plan = PLANS[key];
    if (!plan) return '';
    var period = billing === 'month'
      ? T('monatlich', 'monthly', 'mensual')
      : T('jährlich', 'yearly', 'anual');
    var price = billing === 'month' ? plan.month : plan.year;
    var subject = T('Abo-Anfrage: ', 'Membership request: ', 'Solicitud de suscripción: ')
      + PLAN_LABEL[key] + ' (' + period + ')';
    var body = [
      T('Tarif: ', 'Plan: ', 'Plan: ') + PLAN_LABEL[key],
      T('Zeitraum: ', 'Billing period: ', 'Periodo: ') + period,
      T('Preis: ', 'Price: ', 'Precio: ') + euro(price) + T(' inkl. 19 % MwSt.', ' incl. 19 % VAT', ' IVA incluido'),
      '',
      T('Name: ', 'Name: ', 'Nombre: '),
      T('Rechnung an: ', 'Invoice to: ', 'Factura a: '),
      '',
      T('Kurzbeschreibung, was du bauen willst:', 'One line on what you want to build:', 'Una línea sobre lo que quieres construir:')
    ].join('\n');
    return 'mailto:' + MAIL
      + '?subject=' + encodeURIComponent(subject)
      + '&body=' + encodeURIComponent(body);
  }

  function renderPlanLinks() {
    document.querySelectorAll('[data-plan-cta]').forEach(function (link) {
      var href = planMailto(link.getAttribute('data-plan-cta'));
      if (href) link.setAttribute('href', href);
    });
  }

  function renderBilling() {
    renderPlanLinks();
    document.querySelectorAll('[data-price]').forEach(function (el) {
      var base = Number(el.getAttribute('data-price'));
      if (!base) { el.textContent = euro(0); return; }
      var plan = base === 19 ? PLANS.studio : PLANS.team;
      /* yearly shows the invoice total, not a rounded monthly rate */
      el.textContent = euro(billing === 'month' ? plan.month : plan.year);
    });

    document.querySelectorAll('.wk-plan').forEach(function (card) {
      var price = card.querySelector('[data-price]');
      if (!price) return;
      var base = Number(price.getAttribute('data-price'));
      var unit = card.querySelector('.wk-plan-price .u');
      if (unit) {
        if (!base) unit.textContent = T('/ für immer', '/ forever', '/ para siempre');
        else if (billing === 'month') unit.textContent = T('/ Monat', '/ month', '/ mes');
        else unit.textContent = T('/ Jahr', '/ year', '/ año');
      }

      var monthly = card.querySelector('[data-note-month]');
      var yearly = card.querySelector('[data-note-year]');
      if (!monthly || !yearly) return;

      if (!base) {
        monthly.hidden = true;
        yearly.hidden = true;
        return;
      }
      var plan = base === 19 ? PLANS.studio : PLANS.team;
      var full = plan.month * 12;
      if (billing === 'month') {
        monthly.hidden = false;
        yearly.hidden = true;
        monthly.textContent = T('Monatlich, jederzeit kündbar.', 'Billed monthly, cancellable anytime.', 'Mensual, cancelable en cualquier momento.');
      } else {
        monthly.hidden = true;
        yearly.hidden = false;
        yearly.textContent = T(
          'Jährlich ' + euro(plan.year) + ' statt ' + euro(full) + ' — zwei Monate gratis.',
          euro(plan.year) + ' a year instead of ' + euro(full) + ' — two months free.',
          euro(plan.year) + ' al año en vez de ' + euro(full) + ' — dos meses gratis.'
        );
      }
    });
  }

  document.querySelectorAll('[data-billing]').forEach(function (button) {
    button.addEventListener('click', function () {
      billing = button.getAttribute('data-billing');
      document.querySelectorAll('[data-billing]').forEach(function (b) {
        b.setAttribute('aria-pressed', String(b === button));
      });
      renderBilling();
    });
  });

  renderBilling();

  /* ------------------------------------------------------------
     2. Forum — Daten
     ------------------------------------------------------------ */
  var THREADS_KEY = 'bw.forum.threads.v1';
  var REPLIES_KEY = 'bw.forum.replies.v1';
  var VOTES_KEY = 'bw.forum.votes.v1';

  var TAG_LABEL = {
    architektur: { de: 'Architektur', en: 'Architecture', es: 'Arquitectura' },
    threejs: { de: 'Three.js', en: 'Three.js', es: 'Three.js' },
    sicherheit: { de: 'Sicherheit', en: 'Security', es: 'Seguridad' },
    barrierefreiheit: { de: 'Barrierefreiheit', en: 'Accessibility', es: 'Accesibilidad' },
    abo: { de: 'Abo', en: 'Membership', es: 'Suscripción' }
  };

  var SEEDS = [
    {
      id: 's1',
      tag: 'threejs',
      author: 'Bytewerk',
      created: '2026-11-06T09:10:00+01:00',
      votes: 14,
      solved: true,
      title: {
        de: 'Warum ist die Kontur im Seitenkopf zuerst weiß?',
        en: 'Why does the page-head contour render white first?',
        es: '¿Por qué el contorno de la cabecera sale blanco al principio?'
      },
      body: {
        de: 'Beleuchtete Materialien kippten auf dem Papierhintergrund ins Weiße. Wir zeichnen die Flächen jetzt mit MeshBasicMaterial und einer festen Palette; Licht gibt es nur als weiche Kante.',
        en: 'Lit materials washed out to white against the paper background. We now draw the faces with MeshBasicMaterial and a fixed palette; light only survives as a soft edge.',
        es: 'Los materiales con luz se quemaban a blanco sobre el fondo de papel. Ahora dibujamos las caras con MeshBasicMaterial y una paleta fija; la luz solo sobrevive como borde suave.'
      },
      replies: [
        {
          id: 's1r1', author: 'A. Reiter', created: '2026-11-06T10:02:00+01:00',
          body: {
            de: 'Dazu kommt: `toneMapping` auf ACES hebt die hellen Töne zusätzlich an. Ohne Tone-Mapping bleibt das Papier papieren.',
            en: 'On top of that, ACES tone mapping lifts the light tones further. With tone mapping off, paper stays paper.',
            es: 'Además, el tone mapping ACES levanta aún más los tonos claros. Sin tone mapping, el papel sigue siendo papel.'
          }
        }
      ]
    },
    {
      id: 's2',
      tag: 'sicherheit',
      author: 'M. Kaya',
      created: '2026-11-05T18:40:00+01:00',
      votes: 9,
      solved: true,
      title: {
        de: 'CSP blockt three.js aus dem CDN — was ist der saubere Weg?',
        en: 'CSP blocks three.js from the CDN — what is the clean way?',
        es: 'La CSP bloquea three.js desde el CDN: ¿cuál es la forma limpia?'
      },
      body: {
        de: 'script-src \'self\' lässt keinen Fremdhost zu. Ich habe den Build nach vendor/ gelegt und lade ihn per dynamischem import() erst, wenn die Szene in Sicht kommt.',
        en: 'script-src \'self\' allows no foreign host. I put the build in vendor/ and load it with a dynamic import() only when the scene comes into view.',
        es: 'script-src \'self\' no permite ningún host externo. Puse el build en vendor/ y lo cargo con un import() dinámico solo cuando la escena entra en pantalla.'
      },
      replies: []
    },
    {
      id: 's3',
      tag: 'barrierefreiheit',
      author: 'L. Sommer',
      created: '2026-11-05T11:15:00+01:00',
      votes: 7,
      solved: false,
      title: {
        de: 'Ziehen zum Drehen: Wie bedient man das ohne Maus?',
        en: 'Drag to rotate: how do you operate that without a mouse?',
        es: 'Arrastrar para girar: ¿cómo se usa eso sin ratón?'
      },
      body: {
        de: 'Der Canvas hat tabIndex 0, Pfeiltasten drehen, Home setzt zurück. Wichtig ist eine Beschriftung, die die Geste nennt, und ein Stillbild bei reduzierter Bewegung.',
        en: 'The canvas has tabIndex 0, arrow keys rotate, Home resets. What matters is a label that names the gesture and a still frame under reduced motion.',
        es: 'El canvas tiene tabIndex 0, las flechas giran, Home reinicia. Lo importante es una etiqueta que nombre el gesto y un fotograma fijo con movimiento reducido.'
      },
      replies: [
        {
          id: 's3r1', author: 'Bytewerk', created: '2026-11-05T12:30:00+01:00',
          body: {
            de: 'Zusätzlich: role="img" plus aria-label, damit Screenreader nicht einen leeren Canvas vorlesen.',
            en: 'Also: role="img" plus aria-label so screen readers do not announce an empty canvas.',
            es: 'Además: role="img" y aria-label para que los lectores de pantalla no anuncien un canvas vacío.'
          }
        }
      ]
    },
    {
      id: 's4',
      tag: 'architektur',
      author: 'Bytewerk',
      created: '2026-11-04T16:05:00+01:00',
      votes: 11,
      solved: false,
      title: {
        de: 'Eine Szene, ein Build — oder eine Datei pro Seite?',
        en: 'One scene, one build — or one file per page?',
        es: 'Una escena, un build, ¿o un archivo por página?'
      },
      body: {
        de: 'Wir haben acht Hero-Varianten gebaut und wieder verworfen. Jetzt gibt es scene3d.js mit zwei Typen und einer gemeinsamen Palette. Weniger Dateien, weniger Drift.',
        en: 'We built eight hero variants and threw them away. Now scene3d.js holds two types and one shared palette. Fewer files, less drift.',
        es: 'Construimos ocho variantes de hero y las tiramos. Ahora scene3d.js tiene dos tipos y una paleta común. Menos archivos, menos deriva.'
      },
      replies: []
    },
    {
      id: 's5',
      tag: 'abo',
      author: 'S. Brandt',
      created: '2026-11-04T09:25:00+01:00',
      votes: 5,
      solved: false,
      title: {
        de: 'Was ist im Studio-Abo enthalten — und was nicht?',
        en: 'What is included in the Studio plan — and what is not?',
        es: '¿Qué incluye el plan Studio y qué no?'
      },
      body: {
        de: 'Enthalten sind Schreibrechte, alle Code-Bausteine und die monatliche Sprechstunde. Nicht enthalten sind Stundenkontingente für Kundenprojekte; die laufen über ein eigenes Angebot.',
        en: 'Included are writing rights, all code blocks and the monthly session. Not included are hourly quotas for client work; those run through a separate quote.',
        es: 'Incluye permiso de escritura, todos los bloques de código y la sesión mensual. No incluye horas para proyectos de cliente; eso va por presupuesto aparte.'
      },
      replies: []
    },
    {
      id: 's6',
      tag: 'threejs',
      author: 'Bytewerk',
      created: '2026-11-03T14:50:00+01:00',
      votes: 6,
      solved: true,
      title: {
        de: 'NaN-Vertices bei Löchern mit bevelSize größer als der Radius',
        en: 'NaN vertices when bevelSize exceeds the hole radius',
        es: 'Vértices NaN cuando bevelSize supera el radio del agujero'
      },
      body: {
        de: 'Ein Loch mit einem Bevel, das größer ist als der Radius, erzeugt NaN-Vertices und damit ein unsichtbares Mesh. Bevel kleiner halten oder das Loch als Array statt als String übergeben.',
        en: 'A hole with a bevel larger than its radius produces NaN vertices and an invisible mesh. Keep the bevel smaller, or pass the hole as an array rather than a string.',
        es: 'Un agujero con un bisel mayor que su radio genera vértices NaN y una malla invisible. Mantén el bisel pequeño o pasa el agujero como array en vez de string.'
      },
      replies: []
    }
  ];

  /* ------------------------------------------------------------
     3. Forum — Zustand
     ------------------------------------------------------------ */
  var userThreads = store.get(THREADS_KEY, []);
  var storedReplies = store.get(REPLIES_KEY, {});
  var votes = store.get(VOTES_KEY, {});
  var open = {};
  var filter = { q: '', tag: 'all', sort: 'new' };

  var listEl = document.querySelector('[data-threads]');
  var emptyEl = document.querySelector('[data-empty]');
  var liveEl = document.querySelector('[data-live]');
  var searchEl = document.querySelector('#wk-search');
  var sortEl = document.querySelector('#wk-sort');
  var formEl = document.querySelector('[data-thread-form]');
  var composeEl = document.querySelector('#wk-compose');
  var composeBtn = document.querySelector('[data-compose-toggle]');
  var signinEl = document.querySelector('[data-signin]');

  function currentUser() {
    return (window.BWAuth && window.BWAuth.getUser) ? window.BWAuth.getUser() : null;
  }

  function displayName(user) {
    if (!user) return 'Gast';
    return user.name || (user.email ? user.email.split('@')[0] : 'Mitglied');
  }

  function allThreads() {
    return SEEDS.concat(userThreads).map(function (thread) {
      var extra = storedReplies[thread.id] || [];
      var replies = (thread.replies || []).concat(extra);
      return Object.assign({}, thread, { replies: replies });
    });
  }

  function pick(value) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      var lang = LANG();
      if (lang === 'es') return value.es || value.en || value.de || '';
      return value[lang] || value.de || value.en || '';
    }
    return value || '';
  }

  function formatDate(iso) {
    try {
      return new Intl.DateTimeFormat(INT[LANG()], {
        day: '2-digit', month: 'short'
      }).format(new Date(iso));
    } catch (e) { return ''; }
  }

  function matches(thread, needle) {
    if (!needle) return true;
    var haystack = [
      pick(thread.title), pick(thread.body), thread.author,
      TAG_LABEL[thread.tag] ? TAG_LABEL[thread.tag][LANG()] : thread.tag
    ].join(' ').toLowerCase();
    return haystack.indexOf(needle) !== -1;
  }

  function visibleThreads() {
    var needle = filter.q.trim().toLowerCase();
    var rows = allThreads().filter(function (thread) {
      if (filter.tag !== 'all' && thread.tag !== filter.tag) return false;
      return matches(thread, needle);
    });
    rows.sort(function (a, b) {
      if (filter.sort === 'votes') return (b.votes || 0) - (a.votes || 0);
      if (filter.sort === 'active') {
        if (b.replies.length !== a.replies.length) return b.replies.length - a.replies.length;
      }
      return new Date(b.created) - new Date(a.created);
    });
    return rows;
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function icon(name) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    if (name === 'chevron') {
      var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'm6 9 6 6 6-6');
      svg.appendChild(path);
    } else {
      var up = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      up.setAttribute('d', 'M12 19V5M6 11l6-6 6 6');
      svg.appendChild(up);
    }
    return svg;
  }

  function renderReplies(thread) {
    var wrap = el('div', 'wk-replies');
    wrap.hidden = !open[thread.id];
    if (!open[thread.id]) return wrap;

    thread.replies.forEach(function (reply) {
      var item = el('div', 'wk-reply');
      item.appendChild(el('span', 'wk-reply-meta',
        reply.author + ' · ' + formatDate(reply.created)));
      item.appendChild(document.createTextNode(pick(reply.body)));
      wrap.appendChild(item);
    });

    if (!thread.replies.length) {
      wrap.appendChild(el('p', 'wk-empty', T('Noch keine Antwort.', 'No answer yet.', 'Todavía sin respuesta.')));
    }

    var user = currentUser();
    if (!user) {
      var hint = el('p', 'wk-plan-fine', T('Zum Antworten anmelden.', 'Sign in to reply.', 'Inicia sesión para responder.'));
      wrap.appendChild(hint);
      return wrap;
    }

    var form = el('form', 'wk-reply-form');
    var label = el('label', 'sr-only', T('Antwort', 'Reply', 'Respuesta'));
    var area = document.createElement('textarea');
    area.required = true;
    area.maxLength = 1200;
    area.placeholder = T('Deine Antwort …', 'Your reply …', 'Tu respuesta …');
    area.setAttribute('aria-label', label.textContent);
    var submit = el('button', 'btn btn-primary', T('Antwort senden', 'Send reply', 'Enviar respuesta'));
    submit.type = 'submit';
    form.appendChild(area);
    form.appendChild(submit);

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var text = area.value.trim();
      if (!text) { area.focus(); return; }
      var bucket = storedReplies[thread.id] || [];
      bucket.push({
        id: 'u' + Date.now(),
        author: displayName(user),
        created: new Date().toISOString(),
        body: text
      });
      storedReplies[thread.id] = bucket;
      store.set(REPLIES_KEY, storedReplies);
      open[thread.id] = true;
      render();
      announce(T('Antwort veröffentlicht.', 'Reply published.', 'Respuesta publicada.'));
      var focusTarget = listEl.querySelector('[data-id="' + thread.id + '"] .wk-thread-open');
      if (focusTarget) focusTarget.focus();
    });

    wrap.appendChild(form);
    return wrap;
  }

  function hashThread() {
    var match = /^#thread-(.+)$/.exec(location.hash || '');
    return match ? decodeURIComponent(match[1]) : '';
  }

  /* Deep link: #thread-<id> oeffnet genau diesen Beitrag. Wird beim
     Zeichnen gelesen, damit auch ein Reload oder ein geteilter Link
     direkt beim richtigen Thema landet. */
  function syncHash(id) {
    var next = id ? '#thread-' + id : '#forum';
    if (location.hash === next) return;
    try { history.replaceState(null, '', next); } catch (e) { location.hash = next; }
  }

  function render() {
    var linked = hashThread();
    if (linked) open[linked] = true;
    var rows = visibleThreads();
    listEl.textContent = '';

    rows.forEach(function (thread) {
      var item = el('li', 'wk-thread');
      item.setAttribute('data-id', thread.id);

      var row = el('div', 'wk-thread-row');

      var voted = !!votes[thread.id];
      var vote = el('button', 'wk-vote' + (voted ? ' is-voted' : ''));
      vote.type = 'button';
      vote.setAttribute('aria-pressed', String(voted));
      vote.setAttribute('aria-label', T('Beitrag hochstimmen', 'Upvote thread', 'Votar el hilo'));
      vote.appendChild(icon('up'));
      vote.appendChild(el('span', '', String((thread.votes || 0) + (voted ? 1 : 0))));
      vote.addEventListener('click', function () {
        votes[thread.id] = !votes[thread.id];
        store.set(VOTES_KEY, votes);
        render();
        announce(T('Stimme gezählt.', 'Vote counted.', 'Voto contado.'));
      });
      row.appendChild(vote);

      var toggle = el('button', 'wk-thread-open');
      toggle.type = 'button';
      toggle.setAttribute('aria-expanded', String(!!open[thread.id]));
      toggle.setAttribute('aria-controls', 'replies-' + thread.id);

      var main = el('span', 'wk-thread-main');
      var title = el('span', 'wk-thread-title');
      title.appendChild(document.createTextNode(pick(thread.title)));
      if (thread.solved) {
        title.appendChild(el('span', 'wk-badge is-solved', T('gelöst', 'solved', 'resuelto')));
      }
      main.appendChild(title);
      main.appendChild(el('span', 'wk-thread-excerpt', pick(thread.body)));

      var meta = el('span', 'wk-thread-meta');
      var tagLabel = TAG_LABEL[thread.tag];
      meta.appendChild(el('span', '', tagLabel ? tagLabel[LANG()] : thread.tag));
      meta.appendChild(el('span', '', thread.author));
      meta.appendChild(el('span', '', formatDate(thread.created)));
      main.appendChild(meta);
      toggle.appendChild(main);

      var side = el('span', 'wk-thread-side');
      side.appendChild(el('span', '', thread.replies.length + ' ' + T('Antworten', 'replies', 'respuestas')));
      if (!thread.solved) side.appendChild(el('span', 'wk-badge is-plan', T('offen', 'open', 'abierto')));
      toggle.appendChild(side);

      toggle.addEventListener('click', function () {
        open[thread.id] = !open[thread.id];
        syncHash(open[thread.id] ? thread.id : '');
        render();
        var again = listEl.querySelector('[data-id="' + thread.id + '"] .wk-thread-open');
        if (again) again.focus();
      });

      row.appendChild(toggle);
      item.appendChild(row);

      var replies = renderReplies(thread);
      replies.id = 'replies-' + thread.id;
      item.appendChild(replies);
      listEl.appendChild(item);
    });

    emptyEl.hidden = rows.length > 0;
  }

  function announce(message) {
    if (!liveEl) return;
    liveEl.textContent = '';
    window.setTimeout(function () { liveEl.textContent = message; }, 40);
  }

  /* Filter */
  if (searchEl) {
    searchEl.addEventListener('input', function () {
      filter.q = searchEl.value;
      render();
    });
  }

  if (sortEl) {
    sortEl.addEventListener('change', function () {
      filter.sort = sortEl.value;
      render();
    });
  }

  document.querySelectorAll('[data-tag]').forEach(function (button) {
    button.addEventListener('click', function () {
      filter.tag = button.getAttribute('data-tag');
      document.querySelectorAll('[data-tag]').forEach(function (b) {
        b.setAttribute('aria-pressed', String(b === button));
      });
      render();
    });
  });

  /* Composer */
  function syncComposer() {
    var user = currentUser();
    if (!composeEl) return;
    var form = composeEl.querySelector('form');
    if (form) form.hidden = !user;
    if (signinEl) signinEl.hidden = !!user;
    if (composeBtn) {
      composeBtn.textContent = T('Neuer Beitrag', 'New thread', 'Nuevo hilo');
    }
  }

  if (composeBtn) {
    composeBtn.addEventListener('click', function () {
      var isOpen = composeBtn.getAttribute('aria-expanded') === 'true';
      composeBtn.setAttribute('aria-expanded', String(!isOpen));
      composeEl.hidden = isOpen;
      if (!isOpen) {
        syncComposer();
        var first = composeEl.querySelector('input, textarea, a, button');
        if (first) first.focus();
      }
    });
  }

  if (formEl) {
    formEl.addEventListener('submit', function (event) {
      event.preventDefault();
      var user = currentUser();
      if (!user) {
        syncComposer();
        announce(T('Bitte zuerst anmelden.', 'Please sign in first.', 'Inicia sesión primero.'));
        return;
      }
      var title = formEl.querySelector('#wk-title');
      var body = formEl.querySelector('#wk-body');
      var tag = formEl.querySelector('#wk-topic');
      var titleText = title.value.trim();
      var bodyText = body.value.trim();
      if (titleText.length < 6) {
        title.focus();
        announce(T('Der Titel braucht mindestens sechs Zeichen.', 'The title needs at least six characters.', 'El título necesita al menos seis caracteres.'));
        return;
      }
      if (bodyText.length < 12) {
        body.focus();
        announce(T('Der Beitrag braucht mindestens zwölf Zeichen.', 'The post needs at least twelve characters.', 'La publicación necesita al menos doce caracteres.'));
        return;
      }
      userThreads.unshift({
        id: 'u' + Date.now(),
        tag: tag.value,
        author: displayName(user),
        created: new Date().toISOString(),
        votes: 0,
        solved: false,
        title: titleText,
        body: bodyText
      });
      var saved = store.set(THREADS_KEY, userThreads);
      formEl.reset();
      filter.q = '';
      filter.tag = 'all';
      filter.sort = 'new';
      if (searchEl) searchEl.value = '';
      document.querySelectorAll('[data-tag]').forEach(function (b) {
        b.setAttribute('aria-pressed', String(b.getAttribute('data-tag') === 'all'));
      });
      render();
      announce(saved
        ? T('Beitrag veröffentlicht.', 'Thread published.', 'Hilo publicado.')
        : T('Beitrag nur für diese Sitzung angelegt — der Speicher ist voll.', 'Thread created for this session only — storage is full.', 'Hilo creado solo para esta sesión: el almacenamiento está lleno.'));
      var first = listEl.querySelector('.wk-thread-open');
      if (first) first.focus();
    });
  }

  document.addEventListener('bw:auth', function () { syncComposer(); });
  /* auth.js feuert beim register() kein Event; nach Rueckkehr aus einem
     anderen Tab oder von login.html hier nachziehen. */
  window.addEventListener('pageshow', syncComposer);
  window.addEventListener('focus', syncComposer);
  window.addEventListener('storage', function (event) {
    if (!event.key || event.key.indexOf('bw.session') === 0) syncComposer();
  });
  document.addEventListener('bw:lang', function () {
    renderBilling();
    syncComposer();
    render();
  });

  syncComposer();
  render();

  /* Deep-Link beim Laden: zum Thema scrollen, ohne den Fokus zu stehlen. */
  (function () {
    var linked = hashThread();
    if (!linked) return;
    var target = listEl.querySelector('[data-id="' + linked + '"]');
    if (target) target.scrollIntoView({ block: 'center' });
  })();

  window.addEventListener('hashchange', function () {
    var linked = hashThread();
    if (!linked) return;
    open[linked] = true;
    render();
    var target = listEl.querySelector('[data-id="' + linked + '"]');
    if (target) target.scrollIntoView({ block: 'center' });
  });

  /* Das offene Forum liegt in forum.html. Ob es die Seite schon gibt,
     steht in sitemap.xml — ein HEAD auf forum.html wuerde bei jeder
     Ansicht einen 404 in die Konsole schreiben. */
  (function () {
    var link = document.querySelector('[data-full-forum]');
    if (!link || !window.fetch) return;
    fetch('sitemap.xml')
      .then(function (response) { return response.ok ? response.text() : ''; })
      .then(function (xml) {
        if (xml && xml.indexOf('forum.html') !== -1) link.hidden = false;
      })
      .catch(function () {});
  })();

  /* ------------------------------------------------------------
     4. Code-Tabs
     ------------------------------------------------------------ */
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.wk-tab'));

  function selectTab(tab) {
    tabs.forEach(function (other) {
      var selected = other === tab;
      other.setAttribute('aria-selected', String(selected));
      other.tabIndex = selected ? 0 : -1;
      var panel = document.getElementById(other.getAttribute('aria-controls'));
      if (panel) panel.hidden = !selected;
    });
  }

  tabs.forEach(function (tab, index) {
    tab.addEventListener('click', function () { selectTab(tab); });
    tab.addEventListener('keydown', function (event) {
      var next = null;
      if (event.key === 'ArrowRight') next = tabs[(index + 1) % tabs.length];
      if (event.key === 'ArrowLeft') next = tabs[(index - 1 + tabs.length) % tabs.length];
      if (event.key === 'Home') next = tabs[0];
      if (event.key === 'End') next = tabs[tabs.length - 1];
      if (!next) return;
      event.preventDefault();
      selectTab(next);
      next.focus();
    });
  });

  /* ------------------------------------------------------------
     5. Kopieren
     ------------------------------------------------------------ */
  document.querySelectorAll('[data-copy]').forEach(function (button) {
    button.addEventListener('click', function () {
      var wrap = button.closest('.wk-code-wrap');
      var code = wrap ? wrap.querySelector('code') : null;
      if (!code) return;
      var text = code.textContent;
      var done = function () {
        var previous = button.textContent;
        button.textContent = T('Kopiert', 'Copied', 'Copiado');
        window.setTimeout(function () { button.textContent = previous; }, 1600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () { fallback(text, done); });
      } else {
        fallback(text, done);
      }
    });
  });

  function fallback(text, done) {
    var area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    try { document.execCommand('copy'); done(); } catch (e) { /* nothing else to do */ }
    document.body.removeChild(area);
  }
})();

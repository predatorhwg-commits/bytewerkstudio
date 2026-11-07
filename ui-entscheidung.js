/* ============================================================
   BYTEWERK STUDIO — ui-entscheidung.js (06.11.2026)
   ------------------------------------------------------------
   Progressive enhancement for the decision path:
   package numerals, a real package comparison, and the
   isometric studio plate. No dependencies, no build step.

   Without this file the page stays fully usable: the package
   cards, the code card and the FAQ keep their previous state.
   ============================================================ */

(function () {
  'use strict';

  var doc = document;
  var reduceMotion = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

  function lang() {
    return (doc.documentElement.lang || 'de').toLowerCase().indexOf('en') === 0 ? 'en' : 'de';
  }

  function T(de, en) {
    return lang() === 'en' ? en : de;
  }

  function el(tag, className, text) {
    var node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  /* ---------- 1. Package sheet: number + label ---------- */

  function enhancePackages() {
    var names = doc.querySelectorAll('#preise .package .pk-name');
    Array.prototype.forEach.call(names, function (name) {
      if (name.querySelector('.ent-num')) return;
      var text = (name.textContent || '').replace(/\s+/g, ' ').trim();
      var parts = text.split(/\s*\/\s*/);
      if (parts.length < 2) return;
      name.textContent = '';
      name.appendChild(el('span', 'ent-num', parts[0]));
      name.appendChild(el('span', 'ent-label', parts.slice(1).join(' / ')));
    });
  }

  /* ---------- 2. Package comparison ---------- */

  var ROWS = [
    {
      label: ['Ideal für', 'Best for'],
      cells: [
        ['Ein Auftritt, der erklärt und Anfragen bringt', 'A presence that explains and brings inquiries'],
        ['Ein Produkt mit Konten, Daten und Logik', 'A product with accounts, data and logic'],
        ['Bestehende Software, die weiterlaufen soll', 'Existing software that must keep running']
      ]
    },
    {
      label: ['Typischer Zeitrahmen', 'Typical timeline'],
      cells: [
        ['2–4 Wochen', '2–4 weeks'],
        ['6–12 Wochen', '6–12 weeks'],
        ['Monatlich vereinbart', 'Agreed monthly']
      ]
    },
    {
      label: ['Umfang', 'Scope'],
      cells: [
        ['1–5 Seiten', '1–5 pages'],
        ['Individuell', 'Custom'],
        ['Nach Vereinbarung', 'As agreed']
      ]
    },
    {
      label: ['Responsives Design', 'Responsive design'],
      cells: [true, true, false]
    },
    {
      label: ['SEO-Grundlagen', 'SEO basics'],
      cells: [true, true, false]
    },
    {
      label: ['Konten & Rollen', 'Accounts & roles'],
      cells: [false, true, 'part']
    },
    {
      label: ['Datenbank & APIs', 'Database & APIs'],
      cells: [false, true, 'part']
    },
    {
      label: ['Deployment & Übergabe', 'Deployment & handover'],
      cells: [false, true, false]
    },
    {
      label: ['Updates, Backups, Monitoring', 'Updates, backups, monitoring'],
      cells: [false, false, true]
    },
    {
      label: ['Support nach dem Launch', 'Support after launch'],
      cells: [
        ['Support-Fenster', 'Support window'],
        ['Support-Fenster', 'Support window'],
        ['Laufend', 'Ongoing']
      ]
    }
  ];

  var compare = { bar: null, panel: null, button: null, label: null, table: null };

  function cellValue(value) {
    if (value === true) {
      return '<span class="ent-yes"><span class="sr-only">' + T('Enthalten', 'Included') + '</span></span>';
    }
    if (value === false) {
      return '<span class="ent-no"><span class="sr-only">' + T('Nicht enthalten', 'Not included') + '</span></span>';
    }
    if (value === 'part') {
      return '<span class="ent-part">' + T('Im Bestand', 'Existing') + '</span>';
    }
    return value[lang() === 'en' ? 1 : 0];
  }

  function packageTitles() {
    return Array.prototype.map.call(
      doc.querySelectorAll('#preise .package'),
      function (card) {
        var h3 = card.querySelector('h3');
        var num = card.querySelector('.ent-num');
        return {
          title: h3 ? (h3.textContent || '').trim() : '',
          num: num ? (num.textContent || '').trim() : '',
          featured: card.classList.contains('featured')
        };
      }
    );
  }

  function buildTable() {
    var packages = packageTitles();
    var table = el('table', 'ent-table');

    table.setAttribute('aria-label', T(
      'Paketvergleich: Starter, Studio und Individuell im direkten Vergleich.',
      'Package comparison: Starter, Studio and Custom side by side.'
    ));

    var thead = doc.createElement('thead');
    var headRow = doc.createElement('tr');
    var corner = el('th');
    corner.scope = 'col';
    corner.appendChild(el('span', 'sr-only', T('Merkmal', 'Criterion')));
    headRow.appendChild(corner);
    packages.forEach(function (pkg) {
      var th = el('th', pkg.featured ? 'is-featured' : null);
      th.scope = 'col';
      var small = el('small', null, pkg.num ? pkg.num + ' ' : '');
      th.appendChild(small);
      th.appendChild(doc.createTextNode(pkg.title));
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    var tbody = doc.createElement('tbody');
    ROWS.forEach(function (row) {
      var tr = doc.createElement('tr');
      var th = el('th', null, row.label[lang() === 'en' ? 1 : 0]);
      th.scope = 'row';
      tr.appendChild(th);
      row.cells.forEach(function (value, index) {
        var td = el('td', packages[index] && packages[index].featured ? 'is-featured' : null);
        td.innerHTML = cellValue(value);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    return table;
  }

  function renderTable() {
    if (!compare.panel) return;
    var scroll = compare.panel.querySelector('.ent-compare-scroll');
    if (!scroll) return;
    var next = buildTable();
    var old = scroll.querySelector('.ent-table');
    if (old) scroll.replaceChild(next, old);
    else scroll.appendChild(next);
  }

  function updateLabels() {
    if (!compare.button) return;
    var open = compare.button.getAttribute('aria-expanded') === 'true';
    compare.button.querySelector('.ent-toggle-label').textContent = open
      ? T('Vergleich schließen', 'Close comparison')
      : T('Pakete vergleichen', 'Compare packages');
    compare.bar.querySelector('.ent-compare-hint').textContent = T(
      '10 Merkmale im Vergleich',
      '10 criteria compared'
    );
    compare.bar.querySelector('.ent-compare-hint').setAttribute('aria-hidden', 'true');
  }

  function setOpen(open) {
    if (!compare.panel) return;
    compare.panel.hidden = !open;
    compare.button.setAttribute('aria-expanded', open ? 'true' : 'false');
    updateLabels();
    if (open) {
      renderTable();
      if (window.history && history.replaceState) {
        history.replaceState(null, '', '#paketvergleich');
      }
    } else if (window.history && history.replaceState && location.hash === '#paketvergleich') {
      history.replaceState(null, '', location.pathname + location.search);
    }
  }

  function buildCompare() {
    var packages = doc.querySelector('#preise .packages');
    if (!packages || !packages.parentNode) return;

    var bar = el('div', 'ent-compare-bar');
    var button = el('button', 'ent-toggle');
    button.type = 'button';
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', 'ent-compare');
    button.appendChild(el('span', 'ent-plus'));
    button.lastChild.setAttribute('aria-hidden', 'true');
    button.appendChild(el('span', 'ent-toggle-label', T('Pakete vergleichen', 'Compare packages')));

    var hint = el('span', 'ent-compare-hint');
    bar.appendChild(button);
    bar.appendChild(hint);

    var panel = el('div', 'ent-compare');
    panel.id = 'ent-compare';
    panel.hidden = true;

    var scroll = el('div', 'ent-compare-scroll');
    scroll.tabIndex = 0;
    scroll.setAttribute('role', 'region');
    scroll.setAttribute('aria-label', T('Paketvergleich, horizontal scrollbar', 'Package comparison, scrollable horizontally'));
    panel.appendChild(scroll);

    packages.parentNode.insertBefore(bar, packages.nextSibling);
    bar.parentNode.insertBefore(panel, bar.nextSibling);

    compare.bar = bar;
    compare.panel = panel;
    compare.button = button;
    compare.table = scroll;

    button.addEventListener('click', function () {
      setOpen(panel.hidden);
    });

    renderTable();
    updateLabels();

    if (location.hash === '#paketvergleich') {
      setOpen(true);
      window.setTimeout(function () {
        bar.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
      }, 120);
    }
  }

  /* ---------- 3. Isometric studio plate ---------- */

  var ISO_SVG = `<svg class="ent-iso" viewBox="0 0 661 466" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg"><defs><filter id="entSoft" x="-20%" y="-60%" width="140%" height="220%"><feGaussianBlur stdDeviation="14"/></filter></defs><ellipse cx="332" cy="300" rx="278" ry="34" fill="#1f1e1d" opacity="0.06" filter="url(#entSoft)"/><g class="ent-plate" ><polygon points="298.6,136.0 96.0,253.0 96.0,244.2 298.6,127.2" fill="#e3dccd" stroke="#1f1e1d" stroke-width="1" stroke-linejoin="round"/><polygon points="96.0,253.0 366.2,409.0 366.2,400.2 96.0,244.2" fill="#eae4d7" stroke="#1f1e1d" stroke-width="1" stroke-linejoin="round"/><polygon points="298.6,127.2 568.8,283.2 366.2,400.2 96.0,244.2" fill="#f0ebdf" stroke="#1f1e1d" stroke-width="1" stroke-linejoin="round"/></g><g class="ent-vol ent-vol-0"><polygon points="290.8,161.7 230.0,196.8 230.0,169.4 290.8,134.3" fill="#ece5d8" stroke="#1f1e1d" stroke-width="0.9" stroke-linejoin="round"/><polygon points="230.0,196.8 308.8,242.2 308.8,214.9 230.0,169.4" fill="#f4eee2" stroke="#1f1e1d" stroke-width="0.9" stroke-linejoin="round"/><polygon points="290.8,134.3 369.6,179.8 308.8,214.9 230.0,169.4" fill="#fdfbf6" stroke="#1f1e1d" stroke-width="0.9" stroke-linejoin="round"/></g><g class="ent-vol ent-vol-0"><polygon points="288.5,143.4 285.4,145.3 285.4,120.6 288.5,118.8" fill="#d9d0c1" stroke="#1f1e1d" stroke-width="0.9" stroke-linejoin="round"/><polygon points="285.4,145.3 331.5,171.9 331.5,147.2 285.4,120.6" fill="#e9e1d3" stroke="#1f1e1d" stroke-width="0.9" stroke-linejoin="round"/><polygon points="288.5,118.8 334.7,145.4 331.5,147.2 285.4,120.6" fill="#f8f3e9" stroke="#1f1e1d" stroke-width="0.9" stroke-linejoin="round"/></g><g class="ent-vol ent-vol-1"><polygon points="394.3,188.9 339.2,220.8 339.2,215.6 394.3,183.8" fill="#e4c8b9" stroke="#1f1e1d" stroke-width="0.9" stroke-linejoin="round"/><polygon points="339.2,220.8 404.5,258.5 404.5,253.3 339.2,215.6" fill="#f1dacd" stroke="#1f1e1d" stroke-width="0.9" stroke-linejoin="round"/><polygon points="394.3,183.8 459.6,221.4 404.5,253.3 339.2,215.6" fill="#fcf2eb" stroke="#1f1e1d" stroke-width="0.9" stroke-linejoin="round"/></g><g class="ent-vol ent-vol-2"><polygon points="394.3,168.1 339.2,200.0 339.2,194.8 394.3,162.9" fill="#e4c8b9" stroke="#1f1e1d" stroke-width="0.9" stroke-linejoin="round"/><polygon points="339.2,200.0 404.5,237.7 404.5,232.5 339.2,194.8" fill="#f1dacd" stroke="#1f1e1d" stroke-width="0.9" stroke-linejoin="round"/><polygon points="394.3,162.9 459.6,200.6 404.5,232.5 339.2,194.8" fill="#fcf2eb" stroke="#1f1e1d" stroke-width="0.9" stroke-linejoin="round"/></g><g class="ent-vol ent-vol-3"><polygon points="394.3,147.3 339.2,179.2 339.2,174.0 394.3,142.1" fill="#e4c8b9" stroke="#1f1e1d" stroke-width="0.9" stroke-linejoin="round"/><polygon points="339.2,179.2 404.5,216.9 404.5,211.7 339.2,174.0" fill="#f1dacd" stroke="#1f1e1d" stroke-width="0.9" stroke-linejoin="round"/><polygon points="394.3,142.1 459.6,179.8 404.5,211.7 339.2,174.0" fill="#fcf2eb" stroke="#1f1e1d" stroke-width="0.9" stroke-linejoin="round"/></g><g class="ent-vol ent-vol-4"><polygon points="400.0,304.0 363.9,324.8 363.9,253.3 400.0,232.5" fill="#dbe5dc" stroke="#1f1e1d" stroke-width="0.9" stroke-linejoin="round"/><polygon points="363.9,324.8 400.0,345.6 400.0,274.1 363.9,253.3" fill="#e7efe8" stroke="#1f1e1d" stroke-width="0.9" stroke-linejoin="round"/><polygon points="400.0,232.5 436.0,253.3 400.0,274.1 363.9,253.3" fill="#f2f6f1" stroke="#1f1e1d" stroke-width="0.9" stroke-linejoin="round"/></g><g class="ent-vol ent-vol-5"><path d="M 203.3 222.1 L 203.3 233.5 A 0.8 0.4 0 0 0 204.9 233.5 L 204.9 222.1" fill="#e4ebe4" stroke="#1f1e1d" stroke-width="0.9"/><ellipse cx="204.1" cy="222.1" rx="0.8" ry="0.4" fill="#f5f8f3" stroke="#1f1e1d" stroke-width="0.9"/><ellipse cx="204.1" cy="219.1" rx="0.3" ry="0.2" fill="none" stroke="#b04f31" stroke-width="1"/></g><path class="ent-thread" d="M 322.3 165.3 L 322.6 168.4 L 322.9 171.4 L 323.1 174.5 L 323.4 177.5 L 323.7 180.6 L 324.0 183.7 L 324.3 186.7 L 324.5 189.8 L 324.8 192.8 L 325.1 195.9 L 325.4 199.0 L 325.7 202.0 L 326.0 205.1 L 326.2 208.2 L 326.5 211.2 L 326.8 214.3 L 327.1 217.3 L 327.4 220.4 L 327.6 223.5 L 327.9 226.5 L 328.7 225.8 L 329.5 225.2 L 330.3 224.5 L 331.1 223.8 L 331.9 223.1 L 332.7 222.5 L 333.4 221.8 L 334.2 221.1 L 335.0 220.4 L 335.8 219.8 L 336.6 219.1 L 337.4 218.4 L 338.2 217.7 L 339.0 217.1 L 339.7 216.4 L 340.5 215.7 L 341.3 215.0 L 342.1 214.4 L 342.9 213.7 L 343.7 213.0 L 344.8 215.7 L 345.9 218.4 L 347.1 221.1 L 348.2 223.8 L 349.3 226.5 L 350.4 229.1 L 351.6 231.8 L 352.7 234.5 L 353.8 237.2 L 354.9 239.9 L 356.1 242.6 L 357.2 245.3 L 358.3 248.0 L 359.4 250.7 L 360.6 253.4 L 361.7 256.1 L 362.8 258.7 L 363.9 261.4 L 365.1 264.1 L 366.2 266.8 L 367.9 267.8 L 369.6 268.7 L 371.3 269.7 L 373.0 270.6 L 374.6 271.6 L 376.3 272.5 L 378.0 273.5 L 379.7 274.4 L 381.4 275.4 L 383.1 276.3 L 384.8 277.3 L 386.5 278.2 L 388.2 279.2 L 389.8 280.1 L 391.5 281.1 L 393.2 282.0 L 394.9 283.0 L 396.6 283.9 L 398.3 284.9 L 400.0 285.8" fill="none" stroke="#b04f31" stroke-width="1.5" stroke-linecap="round" pathLength="1" opacity="0.8"/><g class="ent-note"><path d="M 300.9 170.1 L 26.0 92.0" stroke="#1f1e1d" stroke-width="0.7" opacity="0.3"/><circle cx="300.9" cy="170.1" r="2" fill="#b04f31"/><text x="31.0" y="95.0" text-anchor="start" font-family="Inter, system-ui, sans-serif" font-size="9" letter-spacing="1.6" fill="#6b665c">SOFTWARE</text></g><g class="ent-note"><path d="M 398.8 175.9 L 300.0 48.0" stroke="#1f1e1d" stroke-width="0.7" opacity="0.3"/><circle cx="398.8" cy="175.9" r="2" fill="#b04f31"/><text x="305.0" y="51.0" text-anchor="start" font-family="Inter, system-ui, sans-serif" font-size="9" letter-spacing="1.6" fill="#6b665c">WEB</text></g><g class="ent-note"><path d="M 397.7 250.7 L 586.8 132.0" stroke="#1f1e1d" stroke-width="0.7" opacity="0.3"/><circle cx="397.7" cy="250.7" r="2" fill="#b04f31"/><text x="591.8" y="135.0" text-anchor="start" font-family="Inter, system-ui, sans-serif" font-size="9" letter-spacing="1.6" fill="#6b665c">APPS</text></g><g class="ent-note"><path d="M 204.1 214.3 L 40.0 316.0" stroke="#1f1e1d" stroke-width="0.7" opacity="0.3"/><circle cx="204.1" cy="214.3" r="2" fill="#b04f31"/><text x="45.0" y="319.0" text-anchor="start" font-family="Inter, system-ui, sans-serif" font-size="9" letter-spacing="1.6" fill="#6b665c">PRODUKTE</text></g><g class="ent-dim"><path d="M 96.0 278.2 L 366.2 434.2" stroke="#1f1e1d" stroke-width="0.7" stroke-dasharray="4 5" opacity="0.35"/><path d="M 96.0 273.2 L 96.0 283.2 M 366.2 429.2 L 366.2 439.2" stroke="#1f1e1d" stroke-width="0.9" opacity="0.5"/><text x="231.1" y="296.2" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, monospace" font-size="8" letter-spacing="2" fill="#6b665c" opacity="0.8">ATELIER 12 &#215; 9</text></g><g class="ent-titleblock" font-family="ui-monospace, SFMono-Regular, monospace" fill="#6b665c"><text x="26" y="416" font-size="8.4" letter-spacing="2.2" fill="#1f1e1d">BYTEWERK STUDIO</text><text x="26" y="429" font-size="7.6" letter-spacing="1.6">ATELIER / BLATT 01</text><text x="26" y="442" font-size="7.6" letter-spacing="1.6">LUDWIGSHAFEN AM RHEIN</text></g></svg>`;

  function mountStudio() {
    var visual = doc.querySelector('#studio-teaser .studio-visual');
    if (!visual || visual.querySelector('.ent-iso')) return;

    var wrap = el('div', 'ent-iso-wrap');
    wrap.innerHTML = ISO_SVG;
    visual.appendChild(wrap);
    visual.classList.add('ent-has-iso');

    var svg = wrap.querySelector('.ent-iso');
    if (!svg) return;

    if (reduceMotion || !('IntersectionObserver' in window)) {
      svg.classList.add('is-in');
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        svg.classList.add('is-in');
        observer.disconnect();
      });
    }, { threshold: 0.2, rootMargin: '0px 0px -8% 0px' });

    observer.observe(svg);
  }

  function initTilt() {
    if (reduceMotion) return;
    if (!window.matchMedia || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    var visual = doc.querySelector('#studio-teaser .studio-visual');
    var wrap = visual && visual.querySelector('.ent-iso-wrap');
    if (!wrap) return;

    var frame = 0;
    var x = 0;
    var y = 0;

    function apply() {
      frame = 0;
      wrap.style.transform = 'translate3d(' + (-x).toFixed(2) + 'px,' + (-y).toFixed(2) + 'px,0)';
    }

    visual.addEventListener('pointermove', function (event) {
      var box = visual.getBoundingClientRect();
      if (!box.width || !box.height) return;
      x = ((event.clientX - box.left) / box.width - 0.5) * 9;
      y = ((event.clientY - box.top) / box.height - 0.5) * 7;
      if (!frame) frame = window.requestAnimationFrame(apply);
    });

    visual.addEventListener('pointerleave', function () {
      x = 0;
      y = 0;
      if (!frame) frame = window.requestAnimationFrame(apply);
    });
  }

  /* ---------- 4. Boot ---------- */

  function boot() {
    enhancePackages();
    buildCompare();
    mountStudio();
    initTilt();
  }

  doc.addEventListener('bw:lang', function () {
    renderTable();
    updateLabels();
  });

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

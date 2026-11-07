/* ============================================================
   BYTEWERK STUDIO — work-gallery.js
   ------------------------------------------------------------
   Turns the "Ausgewaehlte Arbeiten" bento into a case gallery:
   one large stage on the left, a numbered index on the right.

   Why: the bento showed a white dashboard screenshot inside a
   white card (the arrow chip disappeared on it), and the two
   right-column images were cropped into a shallow strip. The
   gallery gives every case the same stage and keeps the whole
   list readable at any width.

   Progressive enhancement — this file builds OVER the existing
   markup and never replaces it:

   - The five <a class="work-card"> nodes stay in the document.
     They remain the single source of truth for link target,
     image, category, title and description, including the
     live DE/EN switch: components.js rewrites them, we re-read
     them on every `bw:lang` event.
   - Fewer than two usable cards, or missing markup: return
     immediately and leave the bento exactly as it is.
   - The static bento is only hidden after the gallery has been
     built and inserted (class `wg-active` on the section), so a
     JS failure can never leave an empty section.
   - Rows are real links. Hover and focus only change the
     preview; the click is a normal navigation. No tilt, no
     parallax: the only motion is the frame crossfade, which
     styles-work.css turns off under prefers-reduced-motion.
   ============================================================ */

(function () {
  'use strict';

  var section = document.getElementById('arbeiten');
  if (!section) return;

  var bento = section.querySelector('.work-bento');
  if (!bento) return;

  var cards = Array.prototype.slice.call(bento.querySelectorAll('.work-card'));

  /* Read what the markup already says. Cards without a link
     target cannot become gallery rows, so they drop out. */
  var cases = [];
  cards.forEach(function (card) {
    var href = (card.getAttribute('href') || '').trim();
    if (!href || href.charAt(0) === '#' || /^javascript:/i.test(href)) return;
    var img = card.querySelector('img');
    cases.push({
      href: href,
      img: img ? {
        src: img.getAttribute('src') || '',
        alt: img.getAttribute('alt') || '',
        /* Maße mitnehmen: ohne sie springt das Layout, sobald das Bild
           geladen ist (CLS). Das CSS darf sie weiterhin überschreiben. */
        width: img.getAttribute('width') || '',
        height: img.getAttribute('height') || ''
      } : null,
      catEl: card.querySelector('.wc-cat'),
      titleEl: card.querySelector('h3'),
      descEl: card.querySelector('.wc-body p')
    });
  });

  if (cases.length < 2) return;

  var LABEL = {
    open: { de: 'Fall öffnen', en: 'Open case' },
    index: { de: 'Faelle', en: 'Cases' },
    stage: { de: 'Fall', en: 'Case' }
  };

  var doc = document;

  function pad(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function el(tag, cls, text) {
    var node = doc.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function text(node) {
    return node ? (node.textContent || '').replace(/\s+/g, ' ').trim() : '';
  }

  function lang() {
    return (doc.documentElement.lang || 'de').slice(0, 2).toLowerCase() === 'en' ? 'en' : 'de';
  }

  /* ---------- shell ---------- */

  var root = el('div', 'wg');
  root.setAttribute('hidden', '');

  /* ---------- stage: the large preview, itself a link ---------- */

  var stage = el('a', 'wg-stage');
  stage.href = cases[0].href;

  var frames = el('div', 'wg-frames');
  frames.setAttribute('aria-hidden', 'true');

  cases.forEach(function (item, i) {
    var frame = el('div', i === 0 ? 'wg-frame is-on' : 'wg-frame');

    if (item.img && item.img.src) {
      var img = doc.createElement('img');
      img.src = item.img.src;
      img.alt = item.img.alt;
      if (item.img.width) img.setAttribute('width', item.img.width);
      if (item.img.height) img.setAttribute('height', item.img.height);
      img.decoding = 'async';
      img.loading = i === 0 ? 'eager' : 'lazy';
      frame.appendChild(img);
    } else {
      /* No screenshot: a typographic plate instead of a hole. */
      var plate = el('div', 'wg-plate');
      plate.appendChild(el('span', 'wg-plate-n', pad(i + 1) + ' / ' + pad(cases.length)));
      plate.appendChild(el('p', 'wg-plate-t', text(item.titleEl)));
      plate.appendChild(el('p', 'wg-plate-d', text(item.descEl)));
      frame.appendChild(plate);
    }

    frames.appendChild(frame);
  });

  var counter = el('span', 'wg-count');
  counter.setAttribute('aria-hidden', 'true');
  var counterNow = el('b', null, pad(1));
  counter.appendChild(counterNow);
  counter.appendChild(doc.createTextNode(' / ' + pad(cases.length)));

  var openChip = el('span', 'wg-open');
  openChip.setAttribute('aria-hidden', 'true');
  var openText = el('span', 'wg-open-t', LABEL.open[lang()]);
  openChip.appendChild(openText);
  openChip.appendChild(el('span', 'wg-open-a', '→'));

  stage.appendChild(frames);
  stage.appendChild(counter);
  stage.appendChild(openChip);

  /* ---------- index: one addressable row per case ---------- */

  var index = el('nav', 'wg-index');

  function caseTitle(i) {
    return text(cases[i].titleEl) || LABEL.stage[lang()] + ' ' + pad(i + 1);
  }

  function stageLabel(i) {
    return LABEL.open[lang()] + ': ' + caseTitle(i);
  }

  var rows = cases.map(function (item, i) {
    var row = el('a', 'wg-row');
    row.href = item.href;
    row.appendChild(el('span', 'wg-n', pad(i + 1)));

    var meta = el('span', 'wg-meta');
    meta.appendChild(el('span', 'wg-cat', text(item.catEl)));
    meta.appendChild(el('span', 'wg-title', text(item.titleEl)));
    row.appendChild(meta);

    var arrow = el('span', 'wg-ar', '→');
    arrow.setAttribute('aria-hidden', 'true');
    row.appendChild(arrow);

    row.addEventListener('mouseenter', function () { setActive(i); });
    row.addEventListener('focus', function () { setActive(i); });
    row.addEventListener('keydown', function (e) {
      var dir = 0;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') dir = 1;
      else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') dir = -1;
      if (!dir) return;
      e.preventDefault();
      rows[(i + dir + rows.length) % rows.length].focus();
    });

    index.appendChild(row);
    return row;
  });

  /* ---------- state ---------- */

  var active = -1;

  function setActive(i) {
    if (i === active || !rows[i]) return;
    active = i;

    var kids = frames.children;
    for (var k = 0; k < kids.length; k++) {
      kids[k].classList.toggle('is-on', k === i);
    }

    rows.forEach(function (row, n) {
      row.classList.toggle('is-on', n === i);
      if (n === i) row.setAttribute('aria-current', 'true');
      else row.removeAttribute('aria-current');
    });

    counterNow.textContent = pad(i + 1);
    stage.href = cases[i].href;
    stage.setAttribute('aria-label', stageLabel(i));
    /* A typographic plate carries its own title block down to the
       bottom edge, where the open chip would sit on its border. */
    stage.classList.toggle('is-plate', !cases[i].img);
  }

  /* ---------- DE/EN ----------
     The bento is hidden but still the source of truth: it holds
     the [data-en] attributes that components.js rewrites. Copy
     from it on every language change instead of storing strings. */

  function refresh() {
    var L = lang();

    cases.forEach(function (item, i) {
      var row = rows[i];
      var frame = frames.children[i];
      if (!row || !frame) return;

      var cat = row.querySelector('.wg-cat');
      if (cat) cat.textContent = text(item.catEl);

      var title = row.querySelector('.wg-title');
      var titleText = text(item.titleEl);
      if (title) title.textContent = titleText;

      var plateTitle = frame.querySelector('.wg-plate-t');
      if (plateTitle) plateTitle.textContent = titleText;

      var plateDesc = frame.querySelector('.wg-plate-d');
      if (plateDesc) plateDesc.textContent = text(item.descEl);

      var img = frame.querySelector('img');
      if (img && item.img) img.alt = item.img.alt;
    });

    openText.textContent = LABEL.open[L];
    index.setAttribute('aria-label', LABEL.index[L]);
    if (active >= 0) stage.setAttribute('aria-label', stageLabel(active));
  }

  doc.addEventListener('bw:lang', refresh);

  /* ---------- insert ---------- */

  root.appendChild(stage);
  root.appendChild(index);
  setActive(0);

  if (bento.parentNode) bento.parentNode.insertBefore(root, bento.nextSibling);
  else return;

  section.classList.add('wg-active');
  root.removeAttribute('hidden');

  /* Warm the images that the first hover will need, without
     competing with the hero paint. */
  function preload() {
    cases.forEach(function (item) {
      if (item.img && item.img.src) {
        var probe = new Image();
        probe.src = item.img.src;
      }
    });
  }

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(preload, { timeout: 2500 });
  } else {
    window.setTimeout(preload, 400);
  }
})();

// Prueft im geladenen Dokument die Punkte, die sich nur im Browser
// beantworten lassen: benannte Bedienelemente, Sprungziel, Fokusreihenfolge.
// Wird von tools/a11y-audit.mjs je Seite einmal ausgefuehrt.
(() => {
  const nameOf = (el) => {
    const aria = el.getAttribute('aria-label');
    if (aria && aria.trim()) return aria.trim();
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const text = labelledBy.split(/\s+/)
        .map((id) => (document.getElementById(id) || {}).textContent || '')
        .join(' ')
        .trim();
      if (text) return text;
    }
    if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') {
      const id = el.id;
      if (id) {
        const label = document.querySelector('label[for="' + id + '"]');
        if (label && label.textContent.trim()) return label.textContent.trim();
      }
      const wrapping = el.closest('label');
      if (wrapping && wrapping.textContent.trim()) return wrapping.textContent.trim();
      if (el.getAttribute('title')) return el.getAttribute('title');
      if (el.getAttribute('placeholder')) return el.getAttribute('placeholder');
      const alt = el.getAttribute('alt');
      if (alt) return alt;
    }
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (text) return text;
    const img = el.querySelector('img[alt]');
    if (img && img.getAttribute('alt').trim()) return img.getAttribute('alt').trim();
    return '';
  };

  // Unsichtbare Elemente stehen nicht im Bedienbaum: weder fuer die
  // Tastatur noch fuer die Vorlesehilfe. Ein leerer Name ist dort kein Fehler.
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (!(r.width > 0) && !(r.height > 0)) return false;
    for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
      const cs = getComputedStyle(node);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    }
    return true;
  };

  const problems = [];

  // 1. Sprunglink zeigt auf ein vorhandenes Ziel und ist das erste Element.
  const skip = document.querySelector('a.skip-link');
  if (!skip) {
    problems.push(['Sprunglink fehlt', '']);
  } else {
    const href = skip.getAttribute('href') || '';
    if (!href.startsWith('#')) problems.push(['Sprunglink zeigt nicht auf ein Sprungziel', href]);
    else if (!document.getElementById(href.slice(1))) problems.push(['Sprungziel fehlt', href]);
    const first = document.querySelector('a[href], button, input, select, textarea, [tabindex]');
    if (first && !skip.contains(first) && first !== skip) {
      problems.push(['Sprunglink ist nicht das erste Bedienelement', nameOf(first).slice(0, 40)]);
    }
  }

  // 2. Genau eine main-Landmarke.
  const mains = document.querySelectorAll('main');
  if (mains.length !== 1) problems.push(['main-Landmarken', String(mains.length)]);

  // 3. Benannte Links und Buttons.
  for (const el of document.querySelectorAll('a[href], button')) {
    if (!visible(el) && el.tagName === 'BUTTON' && el.hasAttribute('data-cm-close')) {
      // Schliessen-Knoepfe in geschlossenen Dialogen sind absichtlich unsichtbar.
    }
    if (!visible(el) || el.closest('[hidden]') || el.closest('dialog:not([open])')) continue;
    if (!nameOf(el)) {
      problems.push(['ohne Namen', el.tagName.toLowerCase() + '.' + String(el.className || '').slice(0, 30)]);
    }
  }

  // 4. Formularfelder mit Namen.
  for (const el of document.querySelectorAll('input:not([type=hidden]), select, textarea')) {
    if (!visible(el) || el.closest('[hidden]') || el.closest('dialog:not([open])')) continue;
    if (!nameOf(el)) problems.push(['Feld ohne Namen', el.tagName.toLowerCase() + '#' + (el.id || '')]);
  }

  // 5. Keine positive Tab-Reihenfolge (zerreisst die Lesereihenfolge).
  const positive = [...document.querySelectorAll('[tabindex]')]
    .filter((el) => Number(el.getAttribute('tabindex')) > 0)
    .map((el) => el.tagName.toLowerCase() + '.' + String(el.className || '').slice(0, 24));
  if (positive.length) problems.push(['tabindex > 0', positive.slice(0, 3).join(', ')]);

  // 6. Bilder mit alt, dekorative ausdruecklich leer.
  const noAlt = [...document.querySelectorAll('img:not([alt])')].map((i) => i.getAttribute('src') || '');
  if (noAlt.length) problems.push(['Bild ohne alt', noAlt.slice(0, 3).join(', ')]);

  // 7. Sprachauszeichnung.
  if (!document.documentElement.lang) problems.push(['html lang fehlt', '']);

  return JSON.stringify({
    url: location.pathname,
    problems,
    counts: {
      skip: !!skip,
      main: mains.length,
      links: document.querySelectorAll('a[href]').length,
      buttons: document.querySelectorAll('button').length,
      fields: document.querySelectorAll('input:not([type=hidden]), select, textarea').length,
      headings: document.querySelectorAll('h1,h2,h3,h4,h5,h6').length,
      h1: document.querySelectorAll('h1').length,
    },
  });
})()

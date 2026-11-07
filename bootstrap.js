/* ============================================================
   BYTEWERK STUDIO — SPRACHSTART
   ------------------------------------------------------------
   Läuft synchron und vor dem ersten Paint direkt nach <meta charset>.
   Setzt die js-Klasse und die Startsprache, damit die Seite ohne
   Flackern in der richtigen Sprache beginnt.

   Reihenfolge: ?lang= in der Adresse schlägt die gespeicherte Wahl,
   diese schlägt die Browsersprache. So ist jede Sprachfassung
   verlinkbar und teilbar (DE/EN/ES).

   Warum als eigene Datei: die CSP erlaubt nur `script-src 'self'`.
   Ein Inline-Block im <head> würde `'unsafe-inline'` erzwingen und
   damit die wichtigste Schutzschicht der Seite aushebeln.
   ============================================================ */

(function () {
  'use strict';

  document.documentElement.classList.add('js');

  var lang = null;

  try {
    var fromUrl = /[?&]lang=(de|en|es)(?:&|#|$)/.exec(location.search);
    if (fromUrl) lang = fromUrl[1];
  } catch (err) { /* keine Adressdaten: weiter unten */ }

  if (!lang) {
    try {
      var stored = localStorage.getItem('bw-lang');
      if (stored === 'de' || stored === 'en' || stored === 'es') lang = stored;
    } catch (err) { /* Speicher gesperrt */ }
  }

  if (!lang) {
    var nav = (navigator.language || 'de').toLowerCase().slice(0, 2);
    lang = (nav === 'en' || nav === 'es') ? nav : 'de';
  }

  document.documentElement.lang = lang;

  /* Das Forum und andere Module lesen die Sprache beim Start. */
  try { window.bwBootLang = lang; } catch (err) { /* egal */ }
})();

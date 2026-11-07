/* ============================================================
   BYTEWERK STUDIO — SPRACHSTART (07.11.2026)
   ------------------------------------------------------------
   Drei Zeilen, die auf jeder Seite inline im <head> stehen:
   js-Klasse setzen, gespeicherte Sprache anwenden. Inline heißt
   aber, dass die CSP `script-src 'unsafe-inline'` braucht — die
   größte Schwäche der Policy.

   Diese Datei macht daraus eine externe Datei. Damit kommt
   sicherheit.html mit `script-src 'self'` aus, ohne Ausnahme.
   Muster zum Nachziehen für andere Seiten: bootstrap.js einbinden,
   Inline-Block löschen, CSP straffen.

   Muss synchron und vor dem ersten Paint laufen, deshalb ohne
   defer/async direkt nach <meta charset>.
   ============================================================ */

(function () {
  'use strict';

  document.documentElement.classList.add('js');

  try {
    var lang = localStorage.getItem('bw-lang');
    if (lang === 'en' || lang === 'de') document.documentElement.lang = lang;
  } catch (err) {
    /* Speicher gesperrt: Deutsch bleibt die Vorgabe. */
  }

  /* ------------------------------------------------------------
     Clickjacking-Schutz
     ------------------------------------------------------------
     GitHub Pages liefert keine Antwort-Header. `frame-ancestors`
     ist in einer <meta>-CSP wirkungslos, X-Frame-Options lässt
     sich dort gar nicht setzen. Ohne aktive Prüfung könnte eine
     fremde Seite diese Seite unsichtbar einbetten und Klicks
     abgreifen (Konto, Login, Formulare).

     Zwei Schritte: aus einem fremden Rahmen ausbrechen; gelingt
     das nicht (anderer Origin, Zugriff gesperrt), den Inhalt
     ausblenden statt ihn als Klickfläche anzubieten.

     Steht im <head> vor dem ersten Paint, damit nichts aufblitzt.
     ------------------------------------------------------------ */
  if (window.self !== window.top) {
    var framed = true;
    try {
      if (window.top.location.href) window.top.location = window.self.location.href;
      framed = false;
    } catch (err) {
      framed = true;
    }
    if (framed) document.documentElement.style.display = 'none';
  }
})();

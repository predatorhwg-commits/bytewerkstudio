/* ============================================================
   BYTEWERK STUDIO — scene-system-lazy.js
   ------------------------------------------------------------
   Laedt das interaktive Systemmodell erst, wenn seine Buehne in
   die Naehe des Viewports kommt.

   Warum: scene-system.js importiert three.js statisch. Ein
   <script type="module"> laedt damit sofort beim Seitenaufbau,
   auch wenn die Buehne weit unten liegt — auf dem Handy sind das
   rund 700 KB, bevor ueberhaupt jemand dorthin scrollt.

   Der Wrapper beobachtet den Platzhalter und reicht das Modul
   nach. Bleibt der Platzhalter ausserhalb des Blickfelds, wird
   three.js nie geladen; die Beschreibungsliste im HTML steht
   ohnehin vollstaendig da.
   ============================================================ */

(function () {
  'use strict';

  var stage = document.querySelector('[data-system-stage]');
  if (!stage) return;

  /* Die Buehne selbst ist bis data-ready auf display:none — ein
     IntersectionObserver auf ihr wuerde nie ausloesen. Beobachtet
     wird deshalb der sichtbare Abschnitt drumherum. */
  var anker = stage.closest('.sys') || stage.parentElement || stage;

  var gestartet = false;

  function laden() {
    if (gestartet) return;
    gestartet = true;
    import('./scene-system.js').catch(function (err) {
      if (window.console && console.warn) {
        console.warn('Systemmodell konnte nicht geladen werden:', err && err.message);
      }
    });
  }

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) {
          io.disconnect();
          laden();
          return;
        }
      }
    }, { rootMargin: '400px 0px' });
    io.observe(anker);
  } else {
    laden();
  }
})();

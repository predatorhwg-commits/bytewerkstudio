/* ============================================================
   BYTEWERK STUDIO — Startseite
   Kleine, gezielte Interaktionen. Keine Abhängigkeiten.
   ============================================================ */
(function () {
  'use strict';

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* FAQ: immer nur eine Antwort offen — ruhiger beim Lesen. */
  var faq = document.querySelectorAll('.st-faq-list details');
  faq.forEach(function (item) {
    item.addEventListener('toggle', function () {
      if (!item.open) return;
      faq.forEach(function (other) {
        if (other !== item) other.open = false;
      });
    });
  });

  /* Hero-Stapel: leichte Zeiger-Parallaxe, nur auf großen Zeigern. */
  var visual = document.querySelector('.st-hero-visual');
  if (!visual || reduce || !window.matchMedia('(pointer: fine)').matches) return;
  var sheets = visual.querySelectorAll('.st-sheet');
  var raf = 0;
  var target = { x: 0, y: 0 };

  function apply() {
    raf = 0;
    sheets.forEach(function (sheet, i) {
      var depth = (i + 1) * 1.6;
      sheet.style.transform =
        'translate3d(' + (target.x * depth).toFixed(2) + 'px,' +
        (target.y * depth).toFixed(2) + 'px,0)';
    });
  }

  visual.addEventListener('pointermove', function (event) {
    var r = visual.getBoundingClientRect();
    target.x = ((event.clientX - r.left) / r.width - 0.5) * 14;
    target.y = ((event.clientY - r.top) / r.height - 0.5) * 10;
    if (!raf) raf = requestAnimationFrame(apply);
  });

  visual.addEventListener('pointerleave', function () {
    target.x = 0;
    target.y = 0;
    if (!raf) raf = requestAnimationFrame(apply);
  });
})();

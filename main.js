/* ============================================================
   BYTEWERK STUDIO — main.js
   Hero canvas (flowing dot grid), scroll reveals, nav
   ============================================================ */

/* ---------- Sticky nav state ---------- */
(function () {
  const nav = document.querySelector('.nav');
  if (!nav) return;
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 12);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
})();

/* ---------- Mobile menu ---------- */
(function () {
  const toggle = document.querySelector('.nav-toggle');
  const menu = document.querySelector('.mobile-menu');
  if (!toggle || !menu) return;
  /* Der Knopf sagt an, was er als Nächstes tut — „Menü öffnen“ auch im
     geöffneten Zustand wäre für Screenreader schlicht falsch. */
  const setOpen = (open) => {
    menu.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
    const en = (document.documentElement.lang || 'de').slice(0, 2) === 'en';
    const label = open
      ? (en ? 'Close menu' : 'Menü schließen')
      : (en ? 'Open menu' : 'Menü öffnen');
    toggle.setAttribute('aria-label', label);
    toggle.setAttribute('data-en-aria', open ? 'Close menu' : 'Open menu');
  };
  toggle.addEventListener('click', () => setOpen(!menu.classList.contains('open')));
  menu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setOpen(false)));
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !menu.classList.contains('open')) return;
    setOpen(false);
    toggle.focus();
  });
  /* Beim Wechsel auf Desktop-Breite bleibt kein unsichtbares Menü offen. */
  const wide = window.matchMedia('(min-width: 901px)');
  const closeOnWide = () => { if (wide.matches && menu.classList.contains('open')) setOpen(false); };
  if (wide.addEventListener) wide.addEventListener('change', closeOnWide);
})();

/* ---------- Scroll reveal ----------
   Reveal by setting inline styles directly (always win the cascade,
   still animate via the transition declared on .reveal). */
(function () {
  const els = document.querySelectorAll('.reveal');
  if (!els.length) return;

  const show = (el) => {
    if (el.dataset.shown) return;
    el.dataset.shown = '1';
    el.classList.add('in');
  };

  if (!('IntersectionObserver' in window)) {
    els.forEach(show);
    return;
  }

  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) { show(e.target); io.unobserve(e.target); }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -6% 0px' });
  els.forEach(el => io.observe(el));

  // Fallback: reveal anything already within the viewport
  // (IntersectionObserver can miss above-the-fold content on first paint).
  const revealVisible = () => {
    const vh = window.innerHeight || document.documentElement.clientHeight;
    els.forEach(el => {
      if (el.dataset.shown) return;
      const r = el.getBoundingClientRect();
      if (r.top < vh * 0.96 && r.bottom > 0) { show(el); io.unobserve(el); }
    });
  };
  requestAnimationFrame(revealVisible);
  window.addEventListener('load', revealVisible);
  setTimeout(revealVisible, 350);
})();

/* ---------- Hero canvas: flowing dot grid ---------- */
(function () {
  const canvas = document.getElementById('hero-canvas');
  if (!canvas) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ctx = canvas.getContext('2d');
  let w, h, dpr, dots = [], raf, t = 0;

  const GAP = 34;            // grid spacing
  const parseRGB = (s, fb) => {
    if (!s) return fb;
    const m = s.split(',').map(n => parseInt(n.trim(), 10));
    return (m.length === 3 && m.every(n => !isNaN(n))) ? m : fb;
  };
  const accent = parseRGB(canvas.dataset.accent, [232, 164, 92]);  // amber default (dark)
  const ink = parseRGB(canvas.dataset.dot, [228, 231, 240]);       // light dots (dark)
  const intensity = parseFloat(canvas.dataset.intensity) || 1;

  const mouse = { x: -9999, y: -9999 };

  function build() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    w = rect.width; h = rect.height;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dots = [];
    const cols = Math.ceil(w / GAP) + 1;
    const rows = Math.ceil(h / GAP) + 1;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        dots.push({ x: i * GAP, y: j * GAP, ix: i, iy: j });
      }
    }
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    t += reduce ? 0 : 0.014;
    for (const d of dots) {
      // wave field
      const wave = Math.sin(d.ix * 0.32 + t) + Math.cos(d.iy * 0.32 - t * 0.8);
      const z = (wave + 2) / 4; // 0..1

      // mouse proximity
      const mdx = d.x - mouse.x, mdy = d.y - mouse.y;
      const md = Math.sqrt(mdx * mdx + mdy * mdy);
      const near = Math.max(0, 1 - md / 150);

      const r = 0.7 + z * 1.5 + near * 2.4;
      const a = (0.12 + z * 0.34 + near * 0.5) * intensity;
      const mix = Math.min(1, z * 0.5 + near);
      const cr = Math.round(ink[0] + (accent[0] - ink[0]) * mix);
      const cg = Math.round(ink[1] + (accent[1] - ink[1]) * mix);
      const cb = Math.round(ink[2] + (accent[2] - ink[2]) * mix);

      const ox = Math.sin(t + d.iy * 0.5) * z * 2;
      const oy = Math.cos(t + d.ix * 0.5) * z * 2;

      ctx.beginPath();
      ctx.arc(d.x + ox, d.y + oy, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${cr},${cg},${cb},${a})`;
      ctx.fill();
    }
    raf = requestAnimationFrame(draw);
  }

  function start() { cancelAnimationFrame(raf); build(); draw(); }

  window.addEventListener('resize', start);
  window.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
  });
  window.addEventListener('mouseleave', () => { mouse.x = -9999; mouse.y = -9999; });

  start();
  if (reduce) { cancelAnimationFrame(raf); ctx.clearRect(0,0,w,h); draw(); cancelAnimationFrame(raf); }
})();

/* ---------- Year in footer ---------- */
(function () {
  document.querySelectorAll('[data-year]').forEach(el => el.textContent = new Date().getFullYear());
})();

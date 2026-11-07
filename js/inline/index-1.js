/* CTA band subtle grid canvas */
(function () {
  const c = document.getElementById('cta-canvas');
  if (!c) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ctx = c.getContext('2d');
  let w, h, dpr, t = 0, raf;
  function size() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = c.getBoundingClientRect(); w = r.width; h = r.height;
    c.width = w * dpr; c.height = h * dpr; ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  function draw() {
    ctx.clearRect(0,0,w,h);
    t += reduce ? 0 : 0.01;
    const gap = 30;
    for (let x = 0; x < w + gap; x += gap) {
      for (let y = 0; y < h + gap; y += gap) {
        const wv = Math.sin(x*0.02 + t) + Math.cos(y*0.02 - t);
        const a = 0.06 + ((wv+2)/4)*0.16;
        ctx.beginPath(); ctx.arc(x, y, 1.1, 0, Math.PI*2);
        ctx.fillStyle = `rgba(232,164,92,${a})`; ctx.fill();
      }
    }
    if (!reduce) raf = requestAnimationFrame(draw);
  }
  function start(){ cancelAnimationFrame(raf); size(); draw(); }
  window.addEventListener('resize', start);
  requestAnimationFrame(start);
})();

/* ============================================================
   BYTEWERK STUDIO — community-scene.js
   ------------------------------------------------------------
   "Ideenregal": a physical shelf of five cardboard index cards,
   one per forum category, floating on a paper stage. The active
   card steps forward, the others tilt back. Drag to turn the
   whole shelf, click a card to jump to its category.

   Rules from AGENTS.md
   - Local three.js build only (CSP: script-src 'self')
   - DPR <= 2, <= 2.6 M px, start in viewport, pause off-screen
     and in background tabs, prefers-reduced-motion -> still image
   - No bloom, no particles, paper and terracotta only
   ============================================================ */

import * as THREE from './vendor/three.module.min.js';

const stage = document.getElementById('community-stage');

/* Card faces are drawn with the 2D canvas, so no image requests
   and no font surprises: the labels come from the page itself. */
const CARDS = [
  { id: 'fragen',    color: '#b04f31', ink: '#fffaf6', de: 'Fragen', en: 'Questions', index: '01' },
  { id: 'code',      color: '#4f7a63', ink: '#f7fbf7', de: 'Code',   en: 'Code',      index: '02' },
  { id: 'produkte',  color: '#8a6a3f', ink: '#fffaf2', de: 'Produkte', en: 'Products', index: '03' },
  { id: 'werkstatt', color: '#5b6b8a', ink: '#f8faff', de: 'Werkstatt', en: 'Workshop', index: '04' },
  { id: 'meta',      color: '#7a5c6a', ink: '#fdf7fa', de: 'Studio', en: 'Studio',    index: '05' }
];

const PAPER = 0xf6f1e6;
const INK = 0x2a2825;

if (stage) boot();

function boot() {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const label = () => (document.documentElement.lang === 'en' ? 'en' : 'de');

  let canvas;
  let renderer;
  try {
    canvas = stage.querySelector('canvas');
    if (!canvas) throw new Error('no canvas');
    if (!(canvas.getContext('webgl2') || canvas.getContext('webgl'))) throw new Error('no webgl');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch (err) {
    return; // CSS fallback cards stay visible
  }

  renderer.setClearAlpha(0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(PAPER, 9, 22);

  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 60);
  camera.position.set(0, 1.35, 11.2);
  camera.lookAt(0, 0.18, 0);

  /* ---- Light: one soft key from the left, a warm fill, a cool rim.
     Physical units since r155: paper needs ~1.0 total, not 3.0, or the
     card faces clip to white and the index print disappears. ---- */
  scene.add(new THREE.HemisphereLight(0xfffdf6, 0xe8dfcc, 0.62));
  scene.add(new THREE.AmbientLight(0xfff8ee, 0.28));
  const key = new THREE.DirectionalLight(0xfff3e2, 0.72);
  key.position.set(-5, 8, 7);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xdfe9ef, 0.22);
  rim.position.set(6, 3, -6);
  scene.add(rim);

  const shelf = new THREE.Group();
  shelf.position.y = 0.1;
  scene.add(shelf);

  /* ---- Paper backdrop: two large sheets, slightly bent ---- */
  const backdropGeo = new THREE.PlaneGeometry(30, 16, 1, 1);
  const backdrop = new THREE.Mesh(backdropGeo, new THREE.MeshBasicMaterial({ color: 0xf3eee1, transparent: true, opacity: 0.55 }));
  backdrop.position.set(0, 2.4, -7.5);
  scene.add(backdrop);

  /* ---- Floor: subtle grid of hairlines, drawn once ---- */
  const floor = new THREE.Group();
  const lineMat = new THREE.LineBasicMaterial({ color: 0xd9d1be, transparent: true, opacity: 0.55 });
  for (let i = -8; i <= 8; i++) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(i * 0.9, 0, -2.2),
      new THREE.Vector3(i * 0.9, 0, -7.4)
    ]);
    floor.add(new THREE.Line(geo, lineMat));
  }
  for (let i = 0; i < 7; i++) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-7.2, 0, -2.2 - i * 0.86),
      new THREE.Vector3(7.2, 0, -2.2 - i * 0.86)
    ]);
    floor.add(new THREE.Line(geo, lineMat));
  }
  floor.position.y = -1.55;
  scene.add(floor);

  /* ---- Card texture: paper, band, index, name ---- */
  function cardTexture(card) {
    const W = 512;
    const H = 716;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');

    // Paper
    g.fillStyle = '#fbf7ec';
    g.fillRect(0, 0, W, H);

    // Fine grain, deterministic so the card does not shimmer
    g.fillStyle = 'rgba(43, 40, 37, 0.045)';
    for (let i = 0; i < 2600; i++) {
      const x = (i * 97.13) % W;
      const y = (i * 193.71) % H;
      g.fillRect(x, y, 1, 1);
    }

    // Colour head
    g.fillStyle = card.color;
    g.fillRect(0, 0, W, 150);

    // Index number
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.font = '600 34px ui-monospace, SFMono-Regular, Menlo, monospace';
    g.textBaseline = 'top';
    g.fillText(card.index, 42, 46);

    // Hairline rules, like an index card
    g.strokeStyle = 'rgba(43, 40, 37, 0.16)';
    g.lineWidth = 1;
    for (let y = 220; y < H - 90; y += 34) {
      g.beginPath();
      g.moveTo(42, y);
      g.lineTo(W - 42, y);
      g.stroke();
    }

    // Title
    g.fillStyle = '#26241f';
    g.font = '500 62px Georgia, "Times New Roman", serif';
    g.textBaseline = 'alphabetic';
    g.fillText(label() === 'en' ? card.en : card.de, 42, 625);

    // Small caption
    g.fillStyle = 'rgba(43, 40, 37, 0.52)';
    g.font = '500 22px ui-monospace, SFMono-Regular, Menlo, monospace';
    g.fillText('BYTEWERK · FORUM', 42, 666);

    // Punch hole, top centre
    g.fillStyle = 'rgba(43, 40, 37, 0.12)';
    g.beginPath();
    g.arc(W / 2, 30, 9, 0, Math.PI * 2);
    g.fill();

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    return tex;
  }

  /* ---- Cards ---- */
  const CARD_W = 1.62;
  const CARD_H = 2.26;
  const cards = [];
  const geo = new THREE.BoxGeometry(CARD_W, CARD_H, 0.075, 1, 1, 1);

  CARDS.forEach((card, i) => {
    const face = new THREE.MeshStandardMaterial({ map: cardTexture(card), roughness: 1.0, metalness: 0.0 });
    const edge = new THREE.MeshStandardMaterial({ color: 0xe9e1d2, roughness: 1.0 });
    const filled = new THREE.Mesh(geo, [edge, edge, edge, edge, face, edge]);

    const pivot = new THREE.Group();
    const spread = (i - (CARDS.length - 1) / 2);
    pivot.position.set(spread * 1.3, 0.12, -Math.abs(spread) * 0.14);
    pivot.rotation.y = spread * -0.055;
    pivot.rotation.z = spread * 0.012;
    pivot.add(filled);

    // Soft shadow card, offset behind
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(CARD_W * 1.04, CARD_H * 1.04),
      new THREE.MeshBasicMaterial({ color: 0x2a2825, transparent: true, opacity: 0.08 })
    );
    shadow.position.set(0.07, -0.08, -0.06);
    pivot.add(shadow);

    // Thin stand line
    const stand = new THREE.Mesh(
      new THREE.PlaneGeometry(CARD_W * 0.55, 0.012),
      new THREE.MeshBasicMaterial({ color: 0x2a2825, transparent: true, opacity: 0.16 })
    );
    stand.position.set(0, -CARD_H / 2 - 0.16, 0.04);
    pivot.add(stand);

    cards.push({
      pivot,
      mesh: filled,
      card,
      baseY: pivot.position.y,
      baseZ: pivot.position.z,
      baseRotY: pivot.rotation.y,
      active: false
    });
    shelf.add(pivot);
  });

  /* ---- Active state ---- */
  let activeId = null;

  function setActive(id) {
    activeId = id;
    for (const item of cards) {
      item.active = item.card.id === id;
    }
  }

  // Follow the forum filter chips if they exist
  const chips = [...document.querySelectorAll('[data-cm-cat]')];
  chips.forEach((chip) => {
    chip.addEventListener('click', () => setActive(chip.dataset.cmCat));
  });

  /* ---- Pointer: drag turns the shelf, click picks a card ---- */
  const pointer = { down: false, x: 0, y: 0, dx: 0, dy: 0, id: null, moved: 0 };
  let spin = 0;
  let spinTarget = 0;
  let tilt = 0;
  let tiltTarget = 0;

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  function pick(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(cards.map((item) => item.mesh), false);
    if (!hits.length) return null;
    const hit = hits[0].object;
    return cards.find((item) => item.mesh === hit) || null;
  }

  canvas.addEventListener('pointerdown', (event) => {
    pointer.down = true;
    pointer.id = event.pointerId;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.dx = 0;
    pointer.dy = 0;
    pointer.moved = 0;
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!pointer.down || event.pointerId !== pointer.id) {
      const hovered = pick(event.clientX, event.clientY);
      canvas.style.cursor = hovered ? 'pointer' : 'grab';
      return;
    }
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.moved += Math.abs(dx) + Math.abs(dy);
    spinTarget += dx * 0.0042;
    tiltTarget = Math.max(-0.22, Math.min(0.22, tiltTarget + dy * 0.0016));
  });

  function release(event) {
    if (!pointer.down) return;
    pointer.down = false;
    canvas.style.cursor = 'grab';
    if (pointer.moved < 8) {
      const hit = pick(event.clientX, event.clientY);
      if (hit) {
        setActive(hit.card.id);
        const chip = document.querySelector(`[data-cm-cat="${hit.card.id}"]`);
        if (chip) chip.click();
        const target = document.getElementById('forum');
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
    pointer.id = null;
  }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  // Keep vertical page scrolling usable on touch
  canvas.style.touchAction = 'pan-y';

  /* ---- Size / budget ---- */
  let visible = true;
  let running = false;
  let W = 0;
  let H = 0;

  function resize() {
    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    W = rect.width;
    H = rect.height;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.fov = camera.aspect > 1.35 ? 32 : 40;
    camera.updateProjectionMatrix();
    if (reduceMotion) draw();
  }

  /* ---- Animation ---- */
  const clock = new THREE.Clock();

  function pose(dt) {
    const ease = 1 - Math.pow(0.0001, Math.max(dt, 0.001));
    spin += (spinTarget - spin) * ease;
    tilt += (tiltTarget - tilt) * ease;
    shelf.rotation.y = spin;
    shelf.rotation.x = tilt * 0.6;

    const time = reduceMotion ? 0 : clock.getElapsedTime();
    cards.forEach((item, i) => {
      const lift = item.active ? 0.34 : 0;
      const push = item.active ? 0.62 : 0;
      const sway = reduceMotion ? 0 : Math.sin(time * 0.7 + i * 1.4) * 0.012;

      item.pivot.position.y += (item.baseY + lift + sway - item.pivot.position.y) * 0.09;
      item.pivot.position.z += (item.baseZ + push - item.pivot.position.z) * 0.09;
      const targetRot = item.baseRotY + (item.active ? -0.06 : 0);
      item.pivot.rotation.y += (targetRot - item.pivot.rotation.y) * 0.09;
      const targetZ = item.active ? 0.015 : 0;
      item.pivot.rotation.z += (targetZ - item.pivot.rotation.z) * 0.09;
    });
  }

  function draw() {
    pose(1 / 60);
    renderer.render(scene, camera);
  }

  function loop() {
    if (!running) return;
    requestAnimationFrame(loop);
    if (!visible || document.hidden) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    pose(dt);
    renderer.render(scene, camera);
  }

  function start() {
    if (running) return;
    running = true;
    stage.classList.add('is-live');
    resize();
    if (reduceMotion) { draw(); return; }
    clock.start();
    requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
  }

  /* ---- Observers ---- */
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        visible = entry.isIntersecting;
        if (visible && entry.intersectionRatio > 0.2) start();
      });
    }, { threshold: [0, 0.2, 0.6] });
    io.observe(stage);
  } else {
    start();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else if (visible) start();
  });

  if ('ResizeObserver' in window) {
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (reduceMotion) resize();
        else resize();
      });
    });
    ro.observe(stage);
  } else {
    window.addEventListener('resize', resize);
  }

  // Language switch rebuilds the card faces
  document.addEventListener('bw:lang', () => {
    for (const item of cards) {
      const material = item.mesh.material;
      const face = Array.isArray(material) ? material[4] : material;
      if (face.map) face.map.dispose();
      face.map = cardTexture(item.card);
      face.needsUpdate = true;
    }
    if (reduceMotion) draw();
  });

  // Keyboard on the stage: arrows walk the categories, Enter jumps to the list
  function choose(id) {
    const chip = document.querySelector(`.cm-stage-chip[data-cm-cat="${id}"]`);
    if (chip) chip.click();
    else setActive(id);
  }

  document.addEventListener('keydown', (event) => {
    // target can be document when a key event is dispatched programmatically
    const target = event.target instanceof Element ? event.target : null;
    if (!target || !target.closest('.cm-stage')) return;
    const index = cards.findIndex((item) => item.active);
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      choose(cards[(index + 1 + cards.length) % cards.length].card.id);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      choose(cards[(index - 1 + cards.length) % cards.length].card.id);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const target = document.getElementById('forum');
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  // Debug hook used by the local render tests (harmless in production)
  window.__cmScene = { scene, camera, renderer, cards, shelf };

  // Start with the first card raised
  setActive('fragen');
  canvas.style.cursor = 'grab';

  // Keep the stage from drawing before fonts settle
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      for (const item of cards) {
        const material = item.mesh.material;
        const face = Array.isArray(material) ? material[4] : material;
        if (face.map) face.map.dispose();
        face.map = cardTexture(item.card);
        face.needsUpdate = true;
      }
      if (reduceMotion) draw();
    });
  }
}

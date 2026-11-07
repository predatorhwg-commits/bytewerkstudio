/* ============================================================
   BYTEWERK STUDIO — forum-scene.js
   ------------------------------------------------------------
   The pinboard in the forum header: a paper board with pinned
   thread cards, built with three.js in the studio palette.

   - Local three.js build (CSP: script-src 'self')
   - Drag to turn, hover lifts a card, click opens the thread
   - Without WebGL the .is-flat card grid in the markup takes over
   - Pauses off-screen, respects prefers-reduced-motion
   - Cards are data, not decoration: each one maps to a real thread
   ============================================================ */

import * as THREE from './vendor/three.module.min.js';

const frame = document.getElementById('fm-stage-frame');
const canvasHost = document.getElementById('fm-stage');

const CARDS = [
  { slug: 'three-webgl-budget', tab: 0xb04f31, w: 1.42, h: 1.02, solve: true },
  { slug: 'csp-ohne-inline',    tab: 0x4f7a63, w: 1.34, h: 0.94, solve: false },
  { slug: 'supabase-rls',       tab: 0x4f7a63, w: 1.30, h: 0.90, solve: true },
  { slug: 'statisch-ohne-build', tab: 0x7a6a4f, w: 1.24, h: 0.86, solve: false },
  { slug: 'werkkorb-feedback',  tab: 0xb04f31, w: 1.18, h: 0.80, solve: false },
  { slug: 'festpreis-nachträge', tab: 0x5b6b8a, w: 1.10, h: 0.74, solve: false }
];

if (frame && canvasHost) boot();

function boot() {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let renderer;
  try {
    const probe = document.createElement('canvas');
    if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) throw new Error('no webgl');
    renderer = new THREE.WebGLRenderer({
      canvas: canvasHost,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
  } catch (err) {
    frame.classList.add('is-flat');
    return;
  }

  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  frame.classList.add('is-live');

  /* ---------- scene ---------- */
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 40);

  const board = new THREE.Group();
  scene.add(board);

  scene.add(new THREE.HemisphereLight(0xfff9ee, 0xd8cfbc, 1.0));

  const key = new THREE.DirectionalLight(0xfff3e2, 2.0);
  key.position.set(3.4, 5.6, 4.2);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 22;
  key.shadow.camera.left = -5;
  key.shadow.camera.right = 5;
  key.shadow.camera.top = 5;
  key.shadow.camera.bottom = -5;
  key.shadow.bias = -0.0008;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 3;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xe8efff, 0.55);
  fill.position.set(-4.5, 2.6, -3.4);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xffffff, 0.4);
  rim.position.set(-1.8, 1.4, 6);
  scene.add(rim);

  /* ---------- materials ---------- */
  const mat = (color, roughness, metalness = 0) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });

  const M = {
    board: mat(0xefe7d7, 0.97),
    boardEdge: mat(0xdcd0ba, 0.95),
    paper: mat(0xfdfbf5, 0.94),
    paperBack: mat(0xf1ebdd, 0.96),
    ink: mat(0x2b2822, 0.62, 0.08),
    rule: mat(0xc9bfa9, 0.9),
    brass: mat(0xb08d57, 0.3, 0.65)
  };

  const shadowFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 30),
    new THREE.ShadowMaterial({ color: 0x2b2822, opacity: 0.16 })
  );
  shadowFloor.rotation.x = -Math.PI / 2;
  shadowFloor.position.y = -2.2;
  shadowFloor.receiveShadow = true;
  scene.add(shadowFloor);

  /* ---------- geometry helpers ---------- */
  function roundedRect(w, h, r) {
    const shape = new THREE.Shape();
    const x = -w / 2;
    const y = -h / 2;
    const rr = Math.max(0.001, Math.min(r, Math.min(w, h) / 2));
    shape.moveTo(x + rr, y);
    shape.lineTo(x + w - rr, y);
    shape.quadraticCurveTo(x + w, y, x + w, y + rr);
    shape.lineTo(x + w, y + h - rr);
    shape.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    shape.lineTo(x + rr, y + h);
    shape.quadraticCurveTo(x, y + h, x, y + h - rr);
    shape.lineTo(x, y + rr);
    shape.quadraticCurveTo(x, y, x + rr, y);
    return shape;
  }

  function slab(w, h, d, radius, material) {
    const geo = new THREE.ExtrudeGeometry(roundedRect(w, h, radius), {
      depth: Math.max(0.01, d),
      bevelEnabled: true,
      bevelThickness: 0.012,
      bevelSize: 0.012,
      bevelSegments: 2,
      curveSegments: 8
    });
    geo.center();
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  /* ---------- the board ---------- */
  const boardMesh = slab(4.6, 3.5, 0.16, 0.12, M.board);
  boardMesh.position.set(0, 1.05, -0.24);
  board.add(boardMesh);

  // thin inner rule, like a printed margin
  const margin = new THREE.Mesh(
    new THREE.PlaneGeometry(4.18, 3.08),
    new THREE.MeshBasicMaterial({ color: 0xd9cfba, transparent: true, opacity: 0.55 })
  );
  margin.position.set(0, 1.05, -0.148);
  board.add(margin);

  const marginInner = new THREE.Mesh(
    new THREE.PlaneGeometry(4.12, 3.02),
    new THREE.MeshBasicMaterial({ color: 0xf7f2e7 })
  );
  marginInner.position.set(0, 1.05, -0.144);
  board.add(marginInner);

  // pins holding the board to the wall
  [-1.95, 1.95].forEach(x => {
    [2.72, -0.62].forEach(y => {
      const pin = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 12), M.brass);
      pin.position.set(x, y, -0.12);
      pin.castShadow = true;
      board.add(pin);
    });
  });

  /* ---------- cards ---------- */
  const cards = [];
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2(-10, -10);

  // hand-composed layout: deliberately not a grid
  const LAYOUT = [
    { x: -1.42, y: 1.72, z: 0.04, rz: 0.035, tone: 0.0 },
    { x: 0.62,  y: 1.86, z: 0.16, rz: -0.028, tone: 0.06 },
    { x: -1.30, y: 0.48, z: 0.22, rz: -0.045, tone: 0.02 },
    { x: 0.86,  y: 0.62, z: 0.06, rz: 0.02, tone: 0.0 },
    { x: -0.42, y: -0.42, z: 0.18, rz: 0.05, tone: 0.04 },
    { x: 1.44,  y: -0.34, z: 0.02, rz: -0.035, tone: 0.03 }
  ];

  CARDS.forEach((spec, i) => {
    const place = LAYOUT[i] || LAYOUT[0];
    const card = new THREE.Group();
    card.position.set(place.x, place.y, place.z);
    card.rotation.z = place.rz;
    card.userData = { slug: spec.slug, base: place, hover: 0, index: i };

    const paper = slab(spec.w, spec.h, 0.02, 0.05,
      mat(new THREE.Color(0xfdfbf5).offsetHSL(0, 0, -place.tone).getHex(), 0.94));
    paper.position.z = 0;
    card.add(paper);

    // coloured tab at the top edge
    const tab = new THREE.Mesh(
      new THREE.BoxGeometry(spec.w * 0.42, 0.05, 0.012),
      mat(spec.tab, 0.6)
    );
    tab.position.set(-spec.w * 0.22, spec.h / 2 - 0.075, 0.028);
    tab.castShadow = true;
    card.add(tab);

    // text lines: three for the title, two short ones for the body
    const lineMat = mat(0xd6ccb8, 0.95);
    const titleLine = new THREE.Mesh(
      new THREE.BoxGeometry(spec.w * 0.62, 0.038, 0.008),
      mat(0x4a453d, 0.9)
    );
    titleLine.position.set(-spec.w * 0.16, spec.h / 2 - 0.19, 0.026);
    card.add(titleLine);

    const bodyLines = 2 + (i % 2);
    for (let l = 0; l < bodyLines; l++) {
      const width = spec.w * (l === bodyLines - 1 ? 0.38 : 0.66);
      const line = new THREE.Mesh(new THREE.BoxGeometry(width, 0.024, 0.006), lineMat);
      line.position.set(-spec.w / 2 + width / 2 + 0.12, spec.h * 0.13 - l * 0.10, 0.026);
      card.add(line);
    }

    // solved mark: a small olive dot with a ring
    if (spec.solve) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.05, 0.014, 8, 20),
        mat(0x4f7a63, 0.5)
      );
      ring.position.set(spec.w / 2 - 0.17, -spec.h / 2 + 0.16, 0.028);
      card.add(ring);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), mat(0x4f7a63, 0.5));
      dot.position.copy(ring.position);
      dot.position.z += 0.008;
      card.add(dot);
    }

    // the pin
    const pinHead = new THREE.Mesh(new THREE.SphereGeometry(0.052, 18, 14), mat(spec.tab, 0.32, 0.35));
    pinHead.position.set(0, spec.h / 2 - 0.03, 0.075);
    pinHead.castShadow = true;
    card.add(pinHead);
    const pinStem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.09, 8), mat(0x8b8578, 0.4, 0.5));
    pinStem.rotation.x = Math.PI / 2;
    pinStem.position.set(0, spec.h / 2 - 0.03, 0.035);
    card.add(pinStem);

    board.add(card);
    cards.push(card);
  });

  /* ---------- annotation: a piece of tape ---------- */
  const tape = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 0.22),
    new THREE.MeshStandardMaterial({
      color: 0xe8dcc0, roughness: 0.9, transparent: true, opacity: 0.85,
      side: THREE.DoubleSide
    })
  );
  tape.position.set(1.62, -1.22, 0.12);
  tape.rotation.z = -0.18;
  board.add(tape);

  /* ---------- interaction ---------- */
  let dragging = false;
  let moved = 0;
  let startX = 0;
  let startY = 0;
  let targetRotY = 0.06;
  let targetRotX = -0.03;
  let rotY = 0.06;
  let rotX = -0.03;
  let hovered = null;
  let pointerDown = false;

  function setPointer(e) {
    const rect = frame.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  frame.addEventListener('pointerdown', e => {
    pointerDown = true;
    dragging = true;
    moved = 0;
    startX = e.clientX;
    startY = e.clientY;
    frame.setPointerCapture && frame.setPointerCapture(e.pointerId);
  });

  frame.addEventListener('pointermove', e => {
    setPointer(e);
    if (dragging) {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      moved += Math.abs(dx) + Math.abs(dy);
      targetRotY += dx * 0.004;
      targetRotX = Math.max(-0.28, Math.min(0.28, targetRotX + dy * 0.003));
      startX = e.clientX;
      startY = e.clientY;
    }
  });

  function endDrag(e) {
    if (!pointerDown) return;
    pointerDown = false;
    dragging = false;
    if (moved < 7 && e) {
      // a click, not a drag: open the card under the pointer
      setPointer(e);
      const hit = pick();
      if (hit && window.bwForum) window.bwForum.open(hit.userData.slug);
    }
  }

  frame.addEventListener('pointerup', endDrag);
  frame.addEventListener('pointercancel', () => { pointerDown = false; dragging = false; });
  frame.addEventListener('pointerleave', () => { pointer.set(-10, -10); hovered = null; });

  frame.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') { targetRotY -= 0.12; e.preventDefault(); }
    if (e.key === 'ArrowRight') { targetRotY += 0.12; e.preventDefault(); }
    if (e.key === 'ArrowUp') { targetRotX = Math.max(-0.28, targetRotX - 0.08); e.preventDefault(); }
    if (e.key === 'ArrowDown') { targetRotX = Math.min(0.28, targetRotX + 0.08); e.preventDefault(); }
  });

  function pick() {
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(cards, true);
    if (!hits.length) return null;
    let node = hits[0].object;
    while (node && !node.userData.slug) node = node.parent;
    return node || null;
  }

  /* ---------- camera framing ---------- */
  function resize() {
    const w = frame.clientWidth || 1;
    const h = frame.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // on narrow frames pull back so the whole board stays visible
    const scale = w < 420 ? 1.28 : w < 620 ? 1.14 : 1;
    camera.position.set(0.55 * scale, 1.35, 6.15 * scale);
    camera.lookAt(0, 1.0, 0);
    camera.updateProjectionMatrix();
  }

  resize();
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(resize).observe(frame);
  } else {
    window.addEventListener('resize', resize);
  }

  /* ---------- loop ---------- */
  const clock = new THREE.Clock();
  let running = true;
  let raf = 0;

  function frameLoop() {
    raf = requestAnimationFrame(frameLoop);
    if (!running) return;

    const dt = Math.min(clock.getDelta(), 0.05);
    const time = clock.elapsedTime;

    rotY += (targetRotY - rotY) * Math.min(1, dt * 7);
    rotX += (targetRotX - rotX) * Math.min(1, dt * 7);
    board.rotation.y = rotY + (reduceMotion ? 0 : Math.sin(time * 0.32) * 0.022);
    board.rotation.x = rotX;

    // hover detection only while not dragging
    if (!dragging) {
      const hit = pick();
      if (hit !== hovered) hovered = hit;
    } else {
      hovered = null;
    }
    frame.style.cursor = hovered ? 'pointer' : (dragging ? 'grabbing' : 'grab');

    cards.forEach(card => {
      const want = card === hovered ? 1 : 0;
      card.userData.hover += (want - card.userData.hover) * Math.min(1, dt * 9);
      const h = card.userData.hover;
      card.position.z = card.userData.base.z + h * 0.16;
      card.rotation.x = -h * 0.09;
      card.rotation.y = h * 0.05;
      card.position.y = card.userData.base.y + h * 0.04;
    });

    // gentle light drift, off for reduced motion
    if (!reduceMotion) {
      key.position.x = 3.4 + Math.sin(time * 0.25) * 0.5;
      key.position.y = 5.6 + Math.cos(time * 0.21) * 0.35;
    }

    renderer.render(scene, camera);
  }

  /* ---------- pause off-screen and in hidden tabs ---------- */
  if (typeof IntersectionObserver !== 'undefined') {
    new IntersectionObserver(entries => {
      running = entries[0].isIntersecting && !document.hidden;
    }, { threshold: 0.05 }).observe(frame);
  }
  document.addEventListener('visibilitychange', () => {
    running = !document.hidden;
    if (running) clock.getDelta();
  });

  // static first frame for reduced motion, then stop the loop
  renderer.render(scene, camera);
  if (reduceMotion) {
    board.rotation.y = 0.06;
    renderer.render(scene, camera);
    running = false;
    return;
  }

  frameLoop();
}

/* ============================================================
   BYTEWERK STUDIO — SZENE „PAPIER-SCHLOSS" (07.11.2026)
   ------------------------------------------------------------
   three.js r180 aus vendor/ (CSP: script-src 'self').
   Ein Schloss aus Papier: Korpus, Bügel, drei Richtlinien-Blätter.
   Ziehen dreht, Klick oder Knopf öffnet.

   Budget: DPR <= 2 und <= 2,6 Mio. Pixel, Start im Viewport,
   Pause außerhalb des Viewports und im Hintergrund-Tab,
   prefers-reduced-motion -> ruhiges Bild ohne Eigenbewegung.
   ============================================================ */

(function () {
  'use strict';

  const stage = document.querySelector('[data-sich-stage]');
  const canvas = document.getElementById('sich-canvas');
  if (!stage || !canvas) return;

  const fallback = stage.querySelector('.sich-fallback');
  const liveLabel = document.querySelector('[data-sich-live]');
  const openButton = stage.querySelector('[data-sich-open]');

  const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  let THREE = null;
  let renderer = null;
  let scene = null;
  let camera = null;
  let rig = null;
  let shackle = null;
  let sheets = [];

  let running = false;
  let visible = true;
  let raf = 0;
  let reduced = reduceQuery.matches;

  let yaw = -0.42;
  let tilt = 0.06;
  let yawVel = 0;
  let dragging = false;
  let pointerId = null;
  let lastX = 0;
  let lastY = 0;
  let downX = 0;
  let downY = 0;
  let downAt = 0;
  let moved = false;

  let openT = 0;
  let openTarget = 0;
  let lastTime = 0;

  function applyLangLabel() {
    if (!liveLabel) return;
    const en = document.documentElement.lang === 'en';
    liveLabel.textContent = stage.dataset.engine === 'fallback'
      ? (en ? 'SVG active' : 'SVG aktiv')
      : (en ? 'WebGL ready' : 'WebGL bereit');
  }

  function useFallback(reason) {
    stage.dataset.engine = 'fallback';
    applyLangLabel();
    if (fallback) fallback.hidden = false;
    if (reason) {
      try { console.info('[Sicherheit] 3D-Fallback:', reason); } catch (err) { /* ignore */ }
    }
  }

  function hasWebGL() {
    try {
      const probe = document.createElement('canvas');
      const gl = probe.getContext('webgl2') || probe.getContext('webgl');
      if (!gl) return false;
      const lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
      return true;
    } catch (err) {
      return false;
    }
  }

  if (!hasWebGL()) {
    useFallback('kein WebGL');
    return;
  }

  /* ---------- helpers ---------- */

  function grainTexture() {
    const size = 128;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(size, size);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 120 + Math.round(Math.random() * 30);
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 3);
    tex.anisotropy = 4;
    return tex;
  }

  function edges(geometry, color, opacity) {
    const geo = new THREE.EdgesGeometry(geometry, 30);
    return new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({
        color: color,
        transparent: true,
        opacity: opacity,
        depthWrite: false
      })
    );
  }

  function box(parent, w, h, d, material, x, y, z, edgeColor, edgeOpacity) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (edgeColor != null) mesh.add(edges(geo, edgeColor, edgeOpacity));
    parent.add(mesh);
    return mesh;
  }

  /* ---------- build ---------- */

  async function init() {
    try {
      THREE = await import('./vendor/three.module.min.js');
    } catch (err) {
      useFallback('three.js nicht geladen');
      return;
    }

    try {
      const w = stage.clientWidth || 560;
      const h = stage.clientHeight || 560;

      renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance'
      });
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.0;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(30, w / h, 0.1, 60);

      const grain = grainTexture();

      // Four paper tones, deliberately apart in value.
      const kraft = new THREE.MeshStandardMaterial({
        color: 0xbf9c6b, roughness: 0.9, metalness: 0,
        bumpMap: grain, bumpScale: 0.02
      });
      const kraftDeep = new THREE.MeshStandardMaterial({
        color: 0xa98756, roughness: 0.92, metalness: 0
      });
      const cream = new THREE.MeshStandardMaterial({
        color: 0xfaf2e0, roughness: 0.93, metalness: 0,
        bumpMap: grain, bumpScale: 0.012
      });
      const sheet = new THREE.MeshStandardMaterial({
        color: 0xdcc9a4, roughness: 0.94, metalness: 0
      });
      const sheetDeep = new THREE.MeshStandardMaterial({
        color: 0xd2bd94, roughness: 0.95, metalness: 0
      });
      const ink = new THREE.MeshStandardMaterial({
        color: 0x2f2318, roughness: 0.7, metalness: 0
      });
      const accent = new THREE.MeshStandardMaterial({
        color: 0xb04f31, roughness: 0.62, metalness: 0,
        emissive: 0xb04f31, emissiveIntensity: 0.05
      });

      rig = new THREE.Group();
      rig.rotation.set(tilt, yaw, 0);
      scene.add(rig);

      /* --- three policy sheets, fanned to the left and back --- */
      const sheetSpecs = [
        { w: 2.5, h: 1.86, x: -0.2, y: 0.12, z: -0.62, rot: -0.07, mat: sheetDeep },
        { w: 2.42, h: 1.8, x: -0.12, y: 0.08, z: -0.5, rot: -0.035, mat: sheet },
        { w: 2.34, h: 1.74, x: -0.04, y: 0.04, z: -0.38, rot: 0, mat: sheet }
      ];

      sheetSpecs.forEach(function (spec, i) {
        const geo = new THREE.BoxGeometry(spec.w, spec.h, 0.026);
        const mesh = new THREE.Mesh(geo, spec.mat);
        mesh.position.set(spec.x, spec.y, spec.z);
        mesh.rotation.y = spec.rot;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.add(edges(geo, 0x8e7a58, 0.3));
        rig.add(mesh);
        sheets.push({
          mesh: mesh,
          x: spec.x, y: spec.y, z: spec.z,
          dir: i - 1
        });
      });

      /* --- lock body --- */
      const bodyW = 1.52;
      const bodyH = 1.06;
      const bodyD = 0.52;

      box(rig, bodyW, bodyH, bodyD, kraft, 0, 0, 0, 0x6d5836, 0.5);

      // front face panel, inset so the body reads as a block
      box(rig, 0.86, 0.54, 0.05, cream, 0, 0.16, bodyD / 2 + 0.02, 0x6d5836, 0.7);

      // terracotta hairline at the lower edge of the panel
      box(rig, bodyW - 0.18, 0.028, 0.016, accent, 0, -bodyH / 2 + 0.11, bodyD / 2 + 0.03, null);

      /* --- keyhole --- */
      const keyRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.082, 0.011, 10, 44),
        accent
      );
      keyRing.position.set(0, 0.24, bodyD / 2 + 0.05);
      rig.add(keyRing);

      const pin = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 0.024, 26),
        ink
      );
      pin.rotation.x = Math.PI / 2;
      pin.position.set(0, 0.24, bodyD / 2 + 0.054);
      rig.add(pin);

      const slotShape = new THREE.Shape();
      slotShape.moveTo(-0.038, 0);
      slotShape.lineTo(0.038, 0);
      slotShape.lineTo(0, -0.12);
      slotShape.closePath();
      const slot = new THREE.Mesh(
        new THREE.ExtrudeGeometry(slotShape, { depth: 0.02, bevelEnabled: false }),
        ink
      );
      slot.position.set(0, 0.21, bodyD / 2 + 0.05);
      rig.add(slot);

      /* --- three engraved rules under the keyhole --- */
      [0, 1, 2].forEach(function (i) {
        box(rig, 0.74 - i * 0.16, 0.014, 0.01, ink, 0, -0.1 - i * 0.07, bodyD / 2 + 0.012, null);
      });

      /* --- shackle: bow + two legs, kraft against cream --- */
      shackle = new THREE.Group();
      rig.add(shackle);

      const bowR = 0.38;
      const tube = 0.11;
      const topY = bodyH / 2;

      const bowGeo = new THREE.TorusGeometry(bowR, tube, 16, 64, Math.PI);
      const bow = new THREE.Mesh(bowGeo, kraftDeep);
      bow.position.set(0, topY, 0);
      bow.castShadow = true;
      bow.receiveShadow = true;
      bow.add(edges(bowGeo, 0x5c4a2c, 0.35));
      shackle.add(bow);

      [-bowR, bowR].forEach(function (x) {
        const legH = 0.42;
        const legGeo = new THREE.CylinderGeometry(tube, tube, legH, 16);
        const leg = new THREE.Mesh(legGeo, kraftDeep);
        leg.position.set(x, topY - legH / 2 + 0.06, 0);
        leg.castShadow = true;
        leg.receiveShadow = true;
        leg.add(edges(legGeo, 0x5c4a2c, 0.3));
        shackle.add(leg);
      });

      /* --- soft contact shadow --- */
      const shadowCanvas = document.createElement('canvas');
      shadowCanvas.width = 256;
      shadowCanvas.height = 256;
      const sctx = shadowCanvas.getContext('2d');
      const grad = sctx.createRadialGradient(128, 128, 8, 128, 128, 122);
      grad.addColorStop(0, 'rgba(58, 42, 28, 0.26)');
      grad.addColorStop(0.5, 'rgba(58, 42, 28, 0.11)');
      grad.addColorStop(1, 'rgba(58, 42, 28, 0)');
      sctx.fillStyle = grad;
      sctx.fillRect(0, 0, 256, 256);

      const shadowPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(5, 5),
        new THREE.MeshBasicMaterial({
          map: new THREE.CanvasTexture(shadowCanvas),
          transparent: true,
          depthWrite: false,
          opacity: 0.85
        })
      );
      shadowPlane.rotation.x = -Math.PI / 2;
      shadowPlane.position.set(0, -bodyH / 2 - 0.06, 0.1);
      scene.add(shadowPlane);

      /* --- lights, tuned for physically correct units --- */
      scene.add(new THREE.HemisphereLight(0xfff8ea, 0x9a8a6e, 0.85));

      const key = new THREE.DirectionalLight(0xfff2e0, 1.5);
      key.position.set(-4.2, 6.2, 5.4);
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      key.shadow.camera.near = 1;
      key.shadow.camera.far = 22;
      key.shadow.camera.left = -4;
      key.shadow.camera.right = 4;
      key.shadow.camera.top = 4;
      key.shadow.camera.bottom = -4;
      key.shadow.bias = -0.0008;
      key.shadow.normalBias = 0.035;
      scene.add(key);

      const fill = new THREE.DirectionalLight(0xe4ede6, 0.4);
      fill.position.set(5, 2.2, 3.4);
      scene.add(fill);

      const rim = new THREE.DirectionalLight(0xffe4c8, 0.5);
      rim.position.set(0.5, 3.4, -5);
      scene.add(rim);

      fit();
      renderer.render(scene, camera);

      stage.dataset.engine = 'live';
      applyLangLabel();

      window.requestAnimationFrame(function () {
        renderer.render(scene, camera);
        canvas.classList.add('is-live');
        if (fallback) {
          fallback.classList.add('is-out');
          window.setTimeout(function () { fallback.hidden = true; }, 520);
        }
        start();
      });

      bindControls();
      observe();
    } catch (err) {
      useFallback(err && err.message ? err.message : 'Aufbau fehlgeschlagen');
      dispose();
    }
  }

  function fit() {
    if (!camera || !renderer || !rig) return;

    const w = stage.clientWidth || 560;
    const h = stage.clientHeight || 560;
    const aspect = w / h;

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    const budget = 2600000;
    if (w * h * dpr * dpr > budget) dpr = Math.max(1, Math.sqrt(budget / (w * h)));

    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);

    camera.aspect = aspect;
    camera.fov = 30;

    // Fixed sphere around the model: the rig turns, so a measured box would
    // change size on every frame. A constant radius keeps the framing stable.
    const target = new THREE.Vector3(0, 0.16, -0.06);
    const radius = 1.78;

    const vFov = (camera.fov * Math.PI) / 180;
    const distV = radius / Math.tan(vFov / 2);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const distH = radius / Math.tan(hFov / 2);
    const dist = Math.max(distV, distH) * 1.30;

    const dir = new THREE.Vector3(0.6, 0.3, 0.86).normalize();
    camera.position.copy(target).add(dir.multiplyScalar(dist));
    camera.near = Math.max(0.1, dist - radius * 1.8);
    camera.far = dist + radius * 5;
    camera.lookAt(target);
    camera.updateProjectionMatrix();
  }

  function bindControls() {
    canvas.addEventListener('pointerdown', function (event) {
      if (event.button !== undefined && event.button !== 0) return;
      dragging = true;
      moved = false;
      pointerId = event.pointerId;
      lastX = event.clientX;
      lastY = event.clientY;
      downX = event.clientX;
      downY = event.clientY;
      downAt = performance.now();
      yawVel = 0;
      canvas.classList.add('is-dragging');
      try { canvas.setPointerCapture(event.pointerId); } catch (err) { /* ignore */ }
    });

    canvas.addEventListener('pointermove', function (event) {
      if (!dragging || event.pointerId !== pointerId) return;
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;

      if (Math.abs(event.clientX - downX) + Math.abs(event.clientY - downY) > 6) moved = true;

      yaw += dx * 0.0072;
      tilt = Math.min(0.34, Math.max(-0.22, tilt + dy * 0.0032));
      yawVel = dx * 0.22;
    });

    function end(event) {
      if (!dragging) return;
      dragging = false;
      canvas.classList.remove('is-dragging');
      if (pointerId !== null) {
        try { canvas.releasePointerCapture(pointerId); } catch (err) { /* ignore */ }
      }
      pointerId = null;

      const dist = Math.abs(event.clientX - downX) + Math.abs(event.clientY - downY);
      const dt = performance.now() - downAt;
      if (!moved && dist < 8 && dt < 560) toggleOpen();
    }

    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', function () {
      dragging = false;
      pointerId = null;
      canvas.classList.remove('is-dragging');
    });

    if (openButton) {
      openButton.addEventListener('click', toggleOpen);
    }
  }

  function toggleOpen() {
    openTarget = openTarget > 0.5 ? 0 : 1;
    const on = openTarget > 0.5;
    stage.dataset.open = on ? 'true' : 'false';
    if (openButton) openButton.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  function observe() {
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          visible = entry.isIntersecting;
          if (visible) start();
          else stop();
        });
      }, { threshold: 0.04 });
      io.observe(stage);
    }

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop();
      else if (visible) start();
    });

    if ('ResizeObserver' in window) {
      const ro = new ResizeObserver(function () {
        fit();
        if (!running) renderer.render(scene, camera);
      });
      ro.observe(stage);
    } else {
      window.addEventListener('resize', function () {
        fit();
        if (!running) renderer.render(scene, camera);
      });
    }

    window.addEventListener('pagehide', function () {
      stop();
      dispose();
    });

    reduceQuery.addEventListener('change', function (event) {
      reduced = event.matches;
      if (reduced) {
        yawVel = 0;
        openT = openTarget;
      }
      if (!running) renderer.render(scene, camera);
    });

    document.addEventListener('bw:lang', applyLangLabel);
  }

  function dispose() {
    if (renderer) {
      try { renderer.dispose(); } catch (err) { /* ignore */ }
    }
  }

  function start() {
    if (running || !renderer) return;
    running = true;
    lastTime = performance.now();
    raf = window.requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    window.cancelAnimationFrame(raf);
    raf = 0;
  }

  function loop(now) {
    if (!running) return;

    const dt = Math.min(0.05, (now - lastTime) / 1000 || 0.016);
    lastTime = now;

    if (!dragging) {
      yaw += yawVel * dt;
      yawVel *= 0.9;
      if (!reduced && Math.abs(yawVel) < 0.02) yaw += dt * 0.09;
    }

    openT += (openTarget - openT) * Math.min(1, dt * 7);
    if (reduced) openT = openTarget;

    rig.rotation.y = yaw;
    rig.rotation.x = tilt;
    rig.position.y = reduced ? 0 : Math.sin(now * 0.0006) * 0.02;

    // The bow lifts and tilts; the sheets fan out one after another.
    shackle.position.y = openT * 0.42;
    shackle.rotation.z = openT * -0.13;
    shackle.rotation.x = openT * -0.05;

    sheets.forEach(function (item, i) {
      const shift = openT * (0.1 + i * 0.05);
      item.mesh.position.z = item.z - shift;
      item.mesh.position.x = item.x - shift * 0.5;
      item.mesh.position.y = item.y + openT * 0.02 * i;
      item.mesh.rotation.z = openT * (i - 1) * 0.045;
    });

    renderer.render(scene, camera);
    raf = window.requestAnimationFrame(loop);
  }

  /* three.js wiegt 700 KB. Auf dem Telefon steht die Bühne unter dem Text,
     also erst laden, wenn sie wirklich zu sehen ist — sonst zahlt jeder
     Leser für eine Szene, die er nur als Streifen sieht. */
  function whenNear(fn) {
    if (!('IntersectionObserver' in window)) {
      fn();
      return;
    }
    const io = new IntersectionObserver(function (entries) {
      for (let i = 0; i < entries.length; i += 1) {
        if (entries[i].intersectionRatio >= 0.35) {
          io.disconnect();
          fn();
          return;
        }
      }
    }, { threshold: [0, 0.35, 0.6] });
    io.observe(stage);
  }

  whenNear(init);
})();

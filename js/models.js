// FlyHigh - detailed props for the world: boats, balloons, airport textures, buildings, vehicles, supply drops
(function () {
  const FH = window.FH, TAU = Math.PI * 2;
  const M = FH.Models = { aniso: 4 };
  const cache = {};
  function lam(hex, o) {
    const k = hex + JSON.stringify(o || {});
    return cache[k] || (cache[k] = new THREE.MeshLambertMaterial(Object.assign({ color: hex }, o || {})));
  }
  function mesh(geo, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; }
  function rod(x1, y1, z1, x2, y2, z2, r, mat, seg = 5) {
    const a = new THREE.Vector3(x1, y1, z1), b = new THREE.Vector3(x2, y2, z2);
    const m = mesh(new THREE.CylinderGeometry(r, r, a.distanceTo(b), seg), mat);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    return m;
  }
  function tex(w, h, draw, o = {}) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = o.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    if (o.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(o.repeat[0], o.repeat[1]); }
    t.anisotropy = M.aniso;
    return t;
  }
  M.tex = tex;
  // paints per-vertex colours on a geometry from a function of the vertex position
  function paintVerts(geo, fn) {
    const g = geo.index ? geo.toNonIndexed() : geo, p = g.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) { c.setHex(fn(p.getX(i), p.getY(i), p.getZ(i), i)); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  }
  // merges all meshes of a group that share a material: far fewer draw calls for static props
  M.bake = function (group) {
    group.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(group.matrixWorld).invert(), byMat = new Map();
    group.traverse(o => {
      if (!o.isMesh) return;
      const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(a)) g.deleteAttribute(a);
      if (!o.material.vertexColors && g.attributes.color) g.deleteAttribute('color');
      if (!byMat.has(o.material)) byMat.set(o.material, []);
      byMat.get(o.material).push(g);
    });
    const out = new THREE.Group();
    byMat.forEach((geos, mat) => out.add(new THREE.Mesh(FH.mergeGeometries(geos, false), mat)));
    return out;
  };

  // ======================= airport surfaces =======================
  // runway: 46 m x 920 m. Canvas x = across, canvas y = along (top = the end you land on for the second number)
  let runwayTex = null;
  M.runwayTexture = function () {
    if (runwayTex) return runwayTex;
    const W = 256, H = 2048, px = W / 46, py = H / 920, R = FH.mulberry32(99);
    runwayTex = tex(W, H, (x) => {
      x.fillStyle = '#3b3f45'; x.fillRect(0, 0, W, H);
      // repaired patches and fine grain
      for (let i = 0; i < 70; i++) { const v = 52 + R() * 16 | 0; x.fillStyle = `rgba(${v},${v + 2},${v + 6},0.55)`; x.fillRect(R() * W, R() * H, 10 + R() * 60, 20 + R() * 140); }
      for (let i = 0; i < 26000; i++) { const v = 45 + R() * 40 | 0; x.fillStyle = `rgba(${v},${v + 2},${v + 5},0.7)`; x.fillRect(R() * W, R() * H, 1.3, 1.3); }
      // rubber from thousands of landings in both touchdown zones
      const cx = W / 2;
      for (const end of [0, 1]) for (let i = 0; i < 900; i++) {
        const along = (60 + Math.pow(R(), 1.6) * 330) * py, y = end ? H - along : along, track = (R() < 0.5 ? -1 : 1) * (2 + R() * 3.5);
        x.strokeStyle = `rgba(14,15,17,${0.06 + R() * 0.16})`; x.lineWidth = 1 + R() * 2;
        x.beginPath(); x.moveTo(cx + track * px, y); x.lineTo(cx + (track + (R() - 0.5) * 1.2) * px, y + (end ? 1 : -1) * (6 + R() * 30) * py); x.stroke();
      }
      x.fillStyle = '#ecece6';
      // side stripes
      x.fillRect(1 * px, 0, 0.9 * px, H); x.fillRect(W - 1.9 * px, 0, 0.9 * px, H);
      const both = (y, h, fn) => { fn(y); fn(H - y - h); };
      // threshold "piano keys"
      for (let k = 0; k < 12; k++) {
        const off = (k < 6 ? -1 : 1) * (2.2 + (k % 6) * 3.4);
        both(3 * py, 30 * py, y => x.fillRect(cx + off * px - (k < 6 ? 1.8 * px : 0), y, 1.8 * px, 30 * py));
      }
      // touchdown zone bars and aiming points
      const bars = (along, n) => { for (let i = 0; i < n; i++) for (const s of [-1, 1]) both(along * py, 22 * py, y => x.fillRect(cx + s * (6 + i * 2.6) * px - (s < 0 ? 1.8 * px : 0), y, 1.8 * px, 22 * py)); };
      bars(150, 3); bars(380, 2);
      for (const s of [-1, 1]) both(245 * py, 45 * py, y => x.fillRect(cx + s * 6 * px - (s < 0 ? 6 * px : 0), y, 6 * px, 45 * py));
      // centreline dashes between the numbers
      for (let a = 110; a < 920 - 140; a += 50) x.fillRect(cx - 0.45 * px, a * py, 0.9 * px, 30 * py);
    });
    return runwayTex;
  };
  // runway number painted on its own small decal
  M.numberTexture = function (num) {
    const k = 'num' + num;
    return cache[k] || (cache[k] = tex(128, 160, (x, w, h) => {
      x.clearRect(0, 0, w, h); x.fillStyle = '#ecece6'; x.font = 'bold 150px "Arial Narrow", Arial, sans-serif';
      x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(num, w / 2, h / 2 + 6);
    }));
  };
  // concrete apron with slab joints, oil stains and yellow taxi lines (150 m x 340 m)
  M.apronTexture = function () {
    if (cache.apron) return cache.apron;
    const R = FH.mulberry32(5);
    return cache.apron = tex(256, 512, (x, W, H) => {
      const px = W / 150, pz = H / 340;
      x.fillStyle = '#9b9da0'; x.fillRect(0, 0, W, H);
      for (let i = 0; i < 20; i++) for (let j = 0; j < 46; j++) { const v = 151 + (R() * 7 | 0); x.fillStyle = `rgb(${v},${v + 1},${v + 3})`; x.fillRect(i * 7.5 * px, j * 7.5 * pz, 7.5 * px, 7.5 * pz); }
      x.fillStyle = 'rgba(90,92,96,0.28)';
      for (let i = 0; i <= 20; i++) x.fillRect(i * 7.5 * px, 0, 1, H);
      for (let j = 0; j <= 46; j++) x.fillRect(0, j * 7.5 * pz, W, 1);
      for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(40,38,34,${0.08 + R() * 0.15})`; x.beginPath(); x.ellipse((40 + R() * 70) * px, R() * H, 2 + R() * 6, 2 + R() * 6, 0, 0, TAU); x.fill(); }
      x.strokeStyle = '#e8b818'; x.lineWidth = 2;
      const X = wx => (wx - 45) * px, Z = wz => (wz + 170) * pz;
      x.beginPath(); x.moveTo(X(45), Z(0)); x.lineTo(X(65), Z(0)); x.stroke();
      x.beginPath(); x.moveTo(X(65), Z(-165)); x.lineTo(X(65), Z(165)); x.stroke();
      for (const sz of [-130, -70, -10, 50]) {
        x.beginPath(); x.moveTo(X(65), Z(sz - 14)); x.quadraticCurveTo(X(65), Z(sz), X(80), Z(sz)); x.lineTo(X(112), Z(sz)); x.stroke();
        x.fillStyle = '#e8b818'; x.fillRect(X(112), Z(sz - 4), 2, 8 * pz);
      }
    });
  };
  // taxiway with a yellow centreline and hold-short lines at "hold" (fraction along its length)
  M.taxiTexture = function (hold) {
    const k = 'taxi' + hold.toFixed(2);
    return cache[k] || (cache[k] = tex(256, 64, (x, W, H) => {
      x.fillStyle = '#44484e'; x.fillRect(0, 0, W, H);
      for (let i = 0; i < 1800; i++) { const v = 55 + Math.random() * 30 | 0; x.fillStyle = `rgb(${v},${v + 2},${v + 5})`; x.fillRect(Math.random() * W, Math.random() * H, 1.4, 1.4); }
      x.fillStyle = '#e8b818'; x.fillRect(hold * W, H / 2 - 1.5, W - hold * W, 3);
      const hx = hold * W;
      x.fillRect(hx - 2, 4, 2, H - 8); x.fillRect(hx - 6, 4, 2, H - 8);
      for (let y = 4; y < H - 8; y += 8) { x.fillRect(hx - 12, y, 2, 5); x.fillRect(hx - 16, y, 2, 5); }
      x.fillStyle = '#d8d8d2'; x.fillRect(0, 1, W, 1.5); x.fillRect(0, H - 2.5, W, 1.5);
    }));
  };

  // ======================= airport buildings =======================
  M.hangarShell = function (col) {
    const k = 'hshell' + col;
    if (cache[k]) return cache[k];
    const t = tex(16, 64, (x, W, H) => { for (let y = 0; y < H; y++) { const v = 205 + 50 * Math.sin(y / H * TAU * 4) | 0; x.fillStyle = `rgb(${v},${v},${v})`; x.fillRect(0, y, W, 1); } }, { repeat: [1, 10] });
    return cache[k] = new THREE.MeshLambertMaterial({ color: col, map: t });
  };
  M.hangarDoor = function (n) {
    const k = 'hdoor' + n;
    return cache[k] || (cache[k] = new THREE.MeshLambertMaterial({
      map: tex(256, 160, (x, W, H) => {
        x.fillStyle = '#5f6b78'; x.fillRect(0, 0, W, H);
        for (let i = 0; i < 6; i++) { x.fillStyle = i % 2 ? '#5a6572' : '#64707d'; x.fillRect(i * W / 6, 0, W / 6, H); x.fillStyle = '#3c444d'; x.fillRect(i * W / 6, 0, 2, H); }
        for (let i = 0; i < 18; i++) { x.fillStyle = '#9fc0d8'; x.fillRect(8 + i * 13.6, 14, 9, 10); }
        x.fillStyle = '#2b3138'; x.fillRect(0, H - 6, W, 6);
        x.fillStyle = '#f2f2ee'; x.font = 'bold 64px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(n), W / 2, H / 2 + 14);
      }),
    }));
  };
  // glass band: a map (frames + glass) and an emissive map so only the windows light up at night
  M.glassBand = function (rep, kind) {
    const k = 'glass' + kind + rep;
    if (cache[k]) return cache[k];
    const draw = (lit) => (x, W, H) => {
      x.fillStyle = lit ? '#000' : '#d8dde2'; x.fillRect(0, 0, W, H);
      const g = x.createLinearGradient(0, 0, 0, H);
      if (lit) { g.addColorStop(0, '#fff'); g.addColorStop(1, '#fff'); } else { g.addColorStop(0, '#6f97b8'); g.addColorStop(0.5, '#2c5576'); g.addColorStop(1, '#1d3c55'); }
      x.fillStyle = g;
      x.fillRect(3, kind === 'tower' ? 2 : 8, W - 6, H - (kind === 'tower' ? 4 : 16));
    };
    const map = tex(32, 32, draw(false), { repeat: [rep, 1] }), em = tex(32, 32, draw(true), { repeat: [rep, 1] });
    return cache[k] = { map, em };
  };
  M.sign = function (text) {
    const t = tex(512, 64, (x, W, H) => {
      x.fillStyle = '#1d4e89'; x.fillRect(0, 0, W, H); x.fillStyle = '#ffd23f'; x.fillRect(0, H - 6, W, 6);
      x.fillStyle = '#fff'; x.font = 'bold 40px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text.toUpperCase(), W / 2, H / 2 - 2);
    });
    return mesh(new THREE.PlaneGeometry(30, 3.75), new THREE.MeshLambertMaterial({ map: t, emissive: 0x222222, emissiveMap: t }));
  };
  // rotating radar antenna for the control tower roof
  M.radar = function () {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.25, 0.3, 2.4, 8), lam(0x8a8f96), 0, 1.2, 0));
    const head = new THREE.Group(); head.position.y = 2.5; g.add(head);
    const dish = new THREE.CylinderGeometry(3.2, 3.2, 1.0, 16, 1, true, -0.5, 1.0); dish.rotateZ(Math.PI / 2); dish.scale(0.25, 1, 1);
    head.add(mesh(dish, lam(0xeeeeee, { side: THREE.DoubleSide }), 0, 0, -0.6));
    head.add(mesh(new THREE.BoxGeometry(0.4, 0.5, 0.9), lam(0x777b82), 0, 0, 0));
    g.userData.head = head;
    return g;
  };
  M.fuelTruck = function () {
    const g = new THREE.Group(), body = lam(0xf2f2ee), red = lam(0xd23c3c), dark = lam(0x26282c), glass = lam(0x23394d);
    g.add(mesh(new THREE.BoxGeometry(2.4, 0.6, 8.4), dark, 0, 0.75, 0));
    g.add(mesh(new THREE.BoxGeometry(2.5, 2.1, 2.2), red, 0, 1.95, -3.0));
    g.add(mesh(new THREE.BoxGeometry(2.52, 0.8, 1.2), glass, 0, 2.45, -3.45));
    g.add(mesh(new THREE.BoxGeometry(2.3, 0.15, 1.8), dark, 0, 3.05, -3.0));
    const tank = new THREE.CylinderGeometry(1.15, 1.15, 5.6, 16); tank.rotateX(Math.PI / 2); tank.scale(1, 0.85, 1);
    g.add(mesh(tank, body, 0, 2.05, 1.1));
    g.add(mesh(new THREE.BoxGeometry(2.36, 0.25, 5.6), red, 0, 2.05, 1.1));
    g.add(mesh(new THREE.BoxGeometry(1.6, 0.9, 0.6), lam(0x8a8f96), 0, 1.4, 4.2));
    for (const z of [-3.0, 1.0, 2.6]) for (const s of [-1, 1]) { const w = new THREE.CylinderGeometry(0.5, 0.5, 0.4, 12); w.rotateZ(Math.PI / 2); g.add(mesh(w, dark, s * 1.1, 0.5, z)); }
    return M.bake(g);
  };
  M.windsock = function () {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.12, 0.16, 7, 6), lam(0xdddddd), 0, 3.5, 0));
    const pivot = new THREE.Group(); pivot.position.y = 6.6; g.add(pivot);
    const sg = new THREE.CylinderGeometry(0.45, 0.9, 5, 10, 5, true); sg.rotateZ(Math.PI / 2); sg.translate(2.5, 0, 0);
    const cg = paintVerts(sg, (x) => (Math.floor(x / 1.0) % 2 ? 0xffffff : 0xff6a10));
    pivot.add(mesh(cg, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));
    const ring = new THREE.TorusGeometry(0.9, 0.05, 4, 12); ring.rotateY(Math.PI / 2); pivot.add(mesh(ring, lam(0xdddddd)));
    return { group: g, sock: pivot };
  };

  // ======================= boats =======================
  // hull: deck outline (pointed bow, transom stern) extruded down and pinched into a V
  function hull(L, B, D, top, boot, bottom) {
    const s = new THREE.Shape();
    s.moveTo(0, L / 2); s.quadraticCurveTo(B / 2, L / 4, B / 2, -L / 6); s.lineTo(B * 0.42, -L / 2); s.lineTo(-B * 0.42, -L / 2); s.lineTo(-B / 2, -L / 6); s.quadraticCurveTo(-B / 2, L / 4, 0, L / 2);
    const g = new THREE.ExtrudeGeometry(s, { depth: D, steps: 6, bevelEnabled: false, curveSegments: 8 });
    g.rotateX(-Math.PI / 2); g.translate(0, -D * 0.55, 0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i), k = Math.min(1, Math.max(0, (D * 0.45 - (y + D * 0.55)) / (D * 0.45)));
      p.setX(i, p.getX(i) * (1 - 0.72 * k * k));
      if (p.getZ(i) < -L * 0.3) p.setY(i, y + (p.getZ(i) + L * 0.3) * -0.06); // bow sheer rises
    }
    const out = paintVerts(g, (x, y) => (y > D * 0.08 ? top : y > -D * 0.08 ? boot : bottom));
    out.computeVertexNormals();
    return { geo: out, deckY: D * 0.45 };
  }
  M.sailboat = function (sailCol, hullCol) {
    const g = new THREE.Group(), L = 9, B = 3.0;
    const h = hull(L, B, 1.5, hullCol, 0x1d3557, 0x9b2d2d);
    g.add(mesh(h.geo, new THREE.MeshLambertMaterial({ vertexColors: true })));
    const ds = new THREE.Shape(); ds.moveTo(0, L / 2 - 0.3); ds.quadraticCurveTo(B / 2 - 0.15, L / 4, B / 2 - 0.15, -L / 6); ds.lineTo(B * 0.4, -L / 2 + 0.15); ds.lineTo(-B * 0.4, -L / 2 + 0.15); ds.lineTo(-B / 2 + 0.15, -L / 6); ds.quadraticCurveTo(-B / 2 + 0.15, L / 4, 0, L / 2 - 0.3);
    const dg = new THREE.ShapeGeometry(ds); dg.rotateX(-Math.PI / 2);
    g.add(mesh(dg, lam(0xb98b5a), 0, h.deckY + 0.01, 0));
    g.add(mesh(new THREE.BoxGeometry(1.7, 0.6, 2.6), lam(0xf4f4f0), 0, h.deckY + 0.3, 0.4));
    g.add(mesh(new THREE.BoxGeometry(1.72, 0.2, 2.0), lam(0x22313f), 0, h.deckY + 0.38, 0.4));
    const mast = lam(0xb8bcc2);
    g.add(mesh(new THREE.CylinderGeometry(0.07, 0.1, 12, 6), mast, 0, h.deckY + 6, -0.6));
    g.add(rod(0, h.deckY + 1.3, -0.6, 0, h.deckY + 1.3, 3.4, 0.07, mast));
    g.add(rod(0, h.deckY + 11.8, -0.6, 0, h.deckY + 0.1, -L / 2 + 0.2, 0.02, lam(0x555555), 3));
    g.add(rod(0, h.deckY + 11.8, -0.6, 0, h.deckY + 0.2, L / 2 - 0.4, 0.02, lam(0x555555), 3));
    const sail = (pts) => { const s = new THREE.Shape(); pts.forEach(([z, y], i) => i ? s.lineTo(z, y) : s.moveTo(z, y)); const sg = new THREE.ShapeGeometry(s); sg.rotateY(-Math.PI / 2); return sg; };
    const sm = lam(sailCol, { side: THREE.DoubleSide });
    g.add(mesh(sail([[-0.55, h.deckY + 1.4], [-0.55, h.deckY + 11.6], [3.3, h.deckY + 1.4]]), sm, 0.08, 0, 0));
    g.add(mesh(sail([[-0.75, h.deckY + 10.8], [-4.2, h.deckY + 0.6], [-1.0, h.deckY + 0.9]]), lam(0xf6f6f2, { side: THREE.DoubleSide }), 0.12, 0, 0));
    const out = M.bake(g);
    out.add(wake(B, L));
    return out;
  };
  function wake(B, L) {
    const t = cache.wake || (cache.wake = tex(64, 128, (x, W, H) => {
      const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.beginPath(); x.moveTo(W * 0.38, 0); x.lineTo(W * 0.62, 0); x.lineTo(W, H); x.lineTo(0, H); x.closePath(); x.fill();
    }));
    const m = mesh(new THREE.PlaneGeometry(B * 3.5, L * 2.5), new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.55, depthWrite: false }), 0, 0.05, L * 1.65);
    m.rotation.x = -Math.PI / 2; m.renderOrder = 1;
    return m;
  }
  // a small fishing boat (used for the rescue missions)
  M.fishingBoat = function () {
    const g = new THREE.Group(), L = 12, B = 4.2;
    const h = hull(L, B, 2.2, 0xe8572a, 0xf4f4f0, 0x2b2d42);
    g.add(mesh(h.geo, new THREE.MeshLambertMaterial({ vertexColors: true })));
    g.add(mesh(new THREE.BoxGeometry(B - 0.5, 0.1, L - 2), lam(0x8d99a6), 0, h.deckY + 0.05, 0.2));
    g.add(mesh(new THREE.BoxGeometry(2.8, 2.2, 3.0), lam(0xf4f4f0), 0, h.deckY + 1.1, -1.2));
    g.add(mesh(new THREE.BoxGeometry(2.84, 0.8, 2.4), lam(0x22313f), 0, h.deckY + 1.55, -1.45));
    g.add(mesh(new THREE.BoxGeometry(3.1, 0.2, 3.3), lam(0xe8572a), 0, h.deckY + 2.3, -1.2));
    g.add(mesh(new THREE.CylinderGeometry(0.08, 0.1, 4.5, 6), lam(0xb8bcc2), 0, h.deckY + 4.3, -1.6));
    g.add(mesh(new THREE.BoxGeometry(1.8, 0.15, 0.25), lam(0x333333), 0, h.deckY + 5.0, -1.6));
    g.add(mesh(new THREE.SphereGeometry(0.22, 8, 6), lam(0xffd23f, { emissive: 0x806000 }), 0, h.deckY + 6.6, -1.6));
    for (const s of [-1, 1]) { const r = new THREE.TorusGeometry(0.35, 0.09, 6, 12); r.rotateY(Math.PI / 2); g.add(mesh(r, lam(0xff7a1a), s * 1.45, h.deckY + 1.2, -0.3)); }
    for (let i = 0; i < 3; i++) g.add(mesh(new THREE.BoxGeometry(0.9, 0.6, 0.9), lam([0x3a86ff, 0x2ec4b6, 0xffbe0b][i]), (i - 1) * 1.0, h.deckY + 0.4, 3.2));
    // crew member in a life jacket
    g.add(mesh(new THREE.CapsuleGeometry(0.25, 0.7, 4, 8), lam(0xff7a1a), 0.8, h.deckY + 0.7, 1.6));
    g.add(mesh(new THREE.SphereGeometry(0.17, 8, 6), lam(0xd6a07c), 0.8, h.deckY + 1.45, 1.6));
    g.add(rod(1.0, h.deckY + 1.1, 1.6, 1.4, h.deckY + 1.85, 1.6, 0.07, lam(0xff7a1a)));
    return M.bake(g);
  };

  // ======================= hot-air balloon =======================
  M.balloon = function (c1, c2) {
    const g = new THREE.Group(), pts = [];
    for (let i = 0; i <= 22; i++) {
      const t = i / 22, y = -11 + t * 23;
      const r = t < 0.62 ? 2.4 + 8.2 * Math.sin(Math.PI / 2 * Math.pow(t / 0.62, 0.8)) : 10.6 * Math.pow(Math.cos((t - 0.62) / 0.38 * Math.PI / 2), 0.65);
      pts.push(new THREE.Vector2(Math.max(0.01, r), y));
    }
    const env = new THREE.LatheGeometry(pts, 24).toNonIndexed(), p = env.attributes.position, col = new Float32Array(p.count * 3);
    const A = new THREE.Color(c1), B = new THREE.Color(c2), W = new THREE.Color(0xffffff);
    for (let f = 0; f < p.count; f += 3) {
      let x = 0, z = 0, y = 0; for (let k = 0; k < 3; k++) { x += p.getX(f + k); y += p.getY(f + k); z += p.getZ(f + k); }
      const gore = Math.floor((Math.atan2(z, x) + Math.PI) / TAU * 12) % 12, band = y / 3 > 1.2 && y / 3 < 1.8;
      const c = band ? W : gore % 2 ? A : B;
      for (let k = 0; k < 3; k++) { col[(f + k) * 3] = c.r; col[(f + k) * 3 + 1] = c.g; col[(f + k) * 3 + 2] = c.b; }
    }
    env.setAttribute('color', new THREE.BufferAttribute(col, 3)); env.computeVertexNormals();
    g.add(mesh(env, new THREE.MeshLambertMaterial({ vertexColors: true })));
    g.add(mesh(new THREE.CylinderGeometry(2.4, 1.6, 2.4, 14, 1, true), lam(c1, { side: THREE.DoubleSide }), 0, -12.2, 0));
    const wick = lam(0x9a6b38), rim = lam(0x5c3a1c);
    g.add(mesh(new THREE.BoxGeometry(1.7, 1.3, 1.7), wick, 0, -18, 0));
    g.add(mesh(new THREE.BoxGeometry(1.85, 0.2, 1.85), rim, 0, -17.3, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rod(sx * 0.8, -17.3, sz * 0.8, sx * 1.6, -13.4, sz * 1.6, 0.03, lam(0x333333), 3));
    g.add(mesh(new THREE.CylinderGeometry(0.3, 0.35, 0.6, 8), lam(0x55595f), 0, -15.2, 0));
    const out = M.bake(g);
    const fl = new THREE.ConeGeometry(0.35, 2.2, 8, 1, true); fl.translate(0, 1.1, 0);
    const flame = mesh(fl, new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }), 0, -14.9, 0);
    flame.visible = false; out.add(flame); out.userData.flame = flame;
    return out;
  };

  // ======================= supply crate under a parachute =======================
  M.supplyCrate = function (chuteCol) {
    const grp = new THREE.Group();
    const wood = cache.crateMat || (cache.crateMat = new THREE.MeshLambertMaterial({
      map: tex(128, 128, (x, W, H) => {
        x.fillStyle = '#a8763f'; x.fillRect(0, 0, W, H);
        for (let i = 0; i < 6; i++) { x.fillStyle = i % 2 ? '#9c6c38' : '#b07e47'; x.fillRect(0, i * H / 6, W, H / 6 - 2); x.fillStyle = '#6b4724'; x.fillRect(0, (i + 1) * H / 6 - 2, W, 2); }
        x.fillStyle = '#7d5429'; x.fillRect(0, 0, W, 12); x.fillRect(0, H - 12, W, 12); x.fillRect(0, 0, 12, H); x.fillRect(W - 12, 0, 12, H);
        x.save(); x.translate(W / 2, H / 2); x.rotate(Math.PI / 4); x.fillRect(-W * 0.7, -6, W * 1.4, 12); x.restore();
        x.fillStyle = '#d23c3c'; x.fillRect(W / 2 - 14, H / 2 - 5, 28, 10); x.fillRect(W / 2 - 5, H / 2 - 14, 10, 28);
      }),
    }));
    grp.add(mesh(new THREE.BoxGeometry(2.2, 2.2, 2.2), wood));
    const chute = new THREE.Group(); chute.position.y = 8; chute.visible = false; grp.add(chute);
    const pts = []; for (let i = 0; i <= 10; i++) { const a = i / 10 * Math.PI * 0.42; pts.push(new THREE.Vector2(Math.max(0.01, Math.sin(Math.PI * 0.42 - a) * 6), Math.cos(Math.PI * 0.42 - a) * 3.2 - 1.2)); }
    const dg = new THREE.LatheGeometry(pts, 16);
    const cg = paintVerts(dg, (x, y, z) => (Math.floor((Math.atan2(z, x) + Math.PI) / TAU * 8 + 0.0001) % 2 ? chuteCol : 0xf4f4f0));
    chute.add(mesh(cg, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));
    const lp = [];
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; lp.push(Math.cos(a) * 5.7, -0.4, Math.sin(a) * 5.7, Math.cos(a + 0.4) > 0 ? 0.9 : -0.9, -6.9, Math.sin(a + 0.4) > 0 ? 0.9 : -0.9); }
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    chute.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x444444 })));
    return { group: grp, chute };
  };
})();

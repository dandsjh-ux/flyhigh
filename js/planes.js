// FlyHigh - aircraft catalogue and procedural 3D models
(function () {
  const FH = window.FH, U = FH.util;

  FH.PAINTS = {
    red: 0xe63946, blue: 0x2a6fdb, yellow: 0xffc93c, green: 0x2ecc71, orange: 0xff8c42,
    purple: 0x8e5bd9, pink: 0xff6fae, teal: 0x1fb5ad, white: 0xf1f3f5, black: 0x2b2d42,
  };
  FH.PAINT_COST = 150;

  // ---- geometry helpers (plane forward = -Z, up = +Y, right = +X) ----
  function std(color, o) { return new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.5, metalness: 0.2 }, o || {})); }
  function glass() { return new THREE.MeshStandardMaterial({ color: 0x1d3a55, roughness: 0.1, metalness: 0.6, emissive: 0x0a1a2a }); }
  function mesh(geo, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; }

  function fuselage(L, R, o = {}) {
    const tail = o.tail ?? 0.16, noseStart = o.nose ?? 0.8, segs = 28, pts = [];
    pts.push(new THREE.Vector2(0.001, -L / 2));
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      let r;
      if (t < (o.body ?? 0.5)) r = tail + (1 - tail) * U.smoothstep(0, o.body ?? 0.5, t);
      else if (t < noseStart) r = 1;
      else { const k = (t - noseStart) / (1 - noseStart); r = Math.sqrt(Math.max(0, 1 - k * k)) * (1 - (o.pointy ?? 0) * k) ; }
      pts.push(new THREE.Vector2(Math.max(0.01, r * R), (t - 0.5) * L));
    }
    const g = new THREE.LatheGeometry(pts, 18);
    g.rotateX(-Math.PI / 2);
    if (o.squash) g.scale(1, o.squash, 1);
    return g;
  }
  function wing(span, root, tip, sweep, thick) {
    const s = new THREE.Shape();
    s.moveTo(0, root / 2); s.lineTo(span / 2, tip / 2 - sweep); s.lineTo(span / 2, -tip / 2 - sweep);
    s.lineTo(0, -root / 2); s.lineTo(-span / 2, -tip / 2 - sweep); s.lineTo(-span / 2, tip / 2 - sweep); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelThickness: thick * 0.35, bevelSize: thick * 0.35, bevelSegments: 1 });
    g.translate(0, 0, -thick / 2); g.rotateX(-Math.PI / 2);
    return g;
  }
  function fin(height, root, tip, sweep, thick) {
    const s = new THREE.Shape();
    s.moveTo(-root / 2, 0); s.lineTo(root / 2, 0); s.lineTo(tip / 2 - sweep, height); s.lineTo(-tip / 2 - sweep, height); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelThickness: thick * 0.3, bevelSize: thick * 0.3, bevelSegments: 1 });
    g.translate(0, 0, -thick / 2); g.rotateY(Math.PI / 2);
    return g;
  }
  function propeller(blades, len, chord, spinnerR, color = 0x2b2d33) {
    const p = new THREE.Group();
    const sp = new THREE.ConeGeometry(spinnerR, spinnerR * 2.2, 14); sp.rotateX(-Math.PI / 2);
    p.add(mesh(sp, std(0xdedede, { metalness: 0.6, roughness: 0.3 }), 0, 0, -spinnerR * 0.9));
    const bm = std(color, { roughness: 0.6 });
    for (let i = 0; i < blades; i++) {
      const b = new THREE.Group(); b.rotation.z = i * Math.PI * 2 / blades;
      const bl = mesh(new THREE.BoxGeometry(chord, len / 2, 0.06), bm, 0, len / 4, 0); bl.rotation.y = 0.35;
      b.add(bl);
      const tipM = mesh(new THREE.BoxGeometry(chord * 1.02, len * 0.06, 0.07), std(0xffc93c), 0, len / 2 - len * 0.03, 0); tipM.rotation.y = 0.35;
      b.add(tipM);
      p.add(b);
    }
    const disc = mesh(new THREE.CircleGeometry(len / 2, 24), new THREE.MeshBasicMaterial({ color: 0x9aa4ad, transparent: true, opacity: 0.0, depthWrite: false, side: THREE.DoubleSide }));
    p.userData.disc = disc;
    const root = new THREE.Group(); root.add(p); root.add(disc);
    root.userData.spinner = p;
    return root;
  }
  function wheel(r, w) { const g = new THREE.CylinderGeometry(r, r, w, 14); g.rotateZ(Math.PI / 2); return mesh(g, std(0x1e1e22, { roughness: 0.9, metalness: 0 })); }
  function strut(x1, y1, z1, x2, y2, z2, r, mat) {
    const a = new THREE.Vector3(x1, y1, z1), b = new THREE.Vector3(x2, y2, z2);
    const len = a.distanceTo(b);
    const m = mesh(new THREE.CylinderGeometry(r, r, len, 6), mat);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    return m;
  }
  function flame(r, len) {
    const g = new THREE.ConeGeometry(r, len, 12, 1, true); g.translate(0, len / 2, 0); g.rotateX(Math.PI / 2);
    // wide end at z=0 (nozzle), tip at z=+len (pointing backwards)
    const m = mesh(g, new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    const inner = mesh(g.clone().scale(0.55, 0.55, 0.7), new THREE.MeshBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    const grp = new THREE.Group(); grp.add(m); grp.add(inner);
    return grp;
  }

  // ---- model builders ----
  function buildSparrow(paint) {
    const g = new THREE.Group(), P = std(paint), W = std(0xf4f1ea), D = std(0x33363d);
    g.add(mesh(fuselage(7.6, 0.72, { nose: 0.86, tail: 0.14, squash: 1.12 }), P));
    g.add(mesh(wing(11, 1.6, 1.4, 0, 0.16), W, 0, 0.92, -0.9));
    g.add(mesh(new THREE.BoxGeometry(1.46, 0.55, 1.5), glass(), 0, 0.42, -1.0));
    g.add(mesh(new THREE.BoxGeometry(1.2, 0.5, 0.05), glass(), 0, 0.45, -1.85));
    g.add(mesh(wing(3.6, 1.0, 0.7, 0.2, 0.1), P, 0, 0.12, 3.2));
    g.add(mesh(fin(1.5, 1.4, 0.8, 0.4, 0.1), P, 0, 0.15, 3.15));
    [-1, 1].forEach(s => {
      g.add(strut(s * 0.6, -0.4, -0.8, s * 2.8, 0.85, -0.8, 0.05, D));
      g.add(strut(s * 0.5, -0.5, -1.6, s * 1.0, -1.05, -1.6, 0.06, D));
      const w = wheel(0.35, 0.22); w.position.set(s * 1.05, -1.05, -1.6); g.add(w);
    });
    const tw = wheel(0.16, 0.1); tw.position.set(0, -0.32, 3.4); g.add(tw);
    g.add(mesh(new THREE.BoxGeometry(0.05, 0.2, 2.2), std(0xffffff), 0.74, 0.1, 0.5));
    g.add(mesh(new THREE.BoxGeometry(0.05, 0.2, 2.2), std(0xffffff), -0.74, 0.1, 0.5));
    const prop = propeller(2, 2.0, 0.18, 0.24); prop.position.z = -3.85; g.add(prop);
    return { group: g, props: [prop], flames: [], paint: [P] };
  }

  function buildBluebird(paint) {
    const g = new THREE.Group(), P = std(paint), W = std(0xf4f6f8);
    g.add(mesh(fuselage(7.8, 0.68, { nose: 0.82, tail: 0.12 }), P));
    g.add(mesh(wing(9.6, 1.9, 1.0, 0.25, 0.18), W, 0, -0.35, -0.5));
    const can = mesh(new THREE.SphereGeometry(0.62, 16, 12), glass(), 0, 0.5, -0.6); can.scale.set(0.9, 0.85, 2.2); g.add(can);
    g.add(mesh(wing(3.4, 1.0, 0.6, 0.3, 0.1), W, 0, 0.0, 3.3));
    g.add(mesh(fin(1.4, 1.5, 0.6, 0.7, 0.1), P, 0, 0.1, 3.2));
    // wingtip stripes
    [-1, 1].forEach(s => g.add(mesh(new THREE.BoxGeometry(0.6, 0.24, 1.0), P, s * 4.5, -0.35, -0.4)));
    [-1, 1].forEach(s => {
      const w = wheel(0.32, 0.2); w.position.set(s * 1.3, -0.95, -0.3); g.add(w);
      g.add(mesh(new THREE.BoxGeometry(0.1, 0.6, 0.1), std(0x444444), s * 1.3, -0.65, -0.3));
    });
    const nw = wheel(0.26, 0.16); nw.position.set(0, -0.98, -2.7); g.add(nw);
    g.add(mesh(new THREE.BoxGeometry(0.08, 0.7, 0.08), std(0x444444), 0, -0.6, -2.7));
    const prop = propeller(3, 1.9, 0.18, 0.26); prop.position.z = -3.95; g.add(prop);
    return { group: g, props: [prop], flames: [], paint: [P] };
  }

  function buildPelican(paint) {
    const g = new THREE.Group(), P = std(paint), W = std(0xeef0f2), D = std(0x3a3d44);
    g.add(mesh(fuselage(12, 1.1, { nose: 0.86, tail: 0.18, squash: 1.1 }), W));
    g.add(mesh(new THREE.BoxGeometry(2.24, 0.5, 9), P, 0, -0.35, 0.3));
    g.add(mesh(wing(17, 2.0, 1.3, 0, 0.22), W, 0, 1.18, -0.8));
    g.add(mesh(new THREE.BoxGeometry(1.9, 0.45, 0.6), glass(), 0, 0.55, -4.75));
    for (let i = 0; i < 5; i++) [-1, 1].forEach(s => g.add(mesh(new THREE.BoxGeometry(0.05, 0.35, 0.4), glass(), s * 1.12, 0.35, -2.6 + i * 1.1)));
    g.add(mesh(wing(5.4, 1.4, 0.9, 0.2, 0.14), W, 0, 0.6, 5.5));
    g.add(mesh(fin(2.6, 2.2, 1.1, 0.9, 0.14), P, 0, 0.6, 5.4));
    const props = [];
    [-1, 1].forEach(s => {
      const nac = mesh(fuselage(3.6, 0.45, { nose: 0.8, tail: 0.3 }), W, s * 3.1, 0.85, -1.3); g.add(nac);
      const pr = propeller(3, 2.4, 0.22, 0.25); pr.position.set(s * 3.1, 0.85, -3.2); g.add(pr); props.push(pr);
      g.add(strut(s * 1.0, -0.6, -0.6, s * 2.2, -1.75, -0.6, 0.07, D));
      const w = wheel(0.45, 0.28); w.position.set(s * 2.2, -1.45, -0.6); g.add(w);
    });
    const nw = wheel(0.32, 0.2); nw.position.set(0, -1.57, -4.6); g.add(nw);
    g.add(mesh(new THREE.BoxGeometry(0.1, 0.8, 0.1), D, 0, -1.2, -4.6));
    return { group: g, props, flames: [], paint: [P] };
  }

  function buildKestrel(paint) {
    const g = new THREE.Group(), P = std(paint), W = std(0xf6f6f6);
    g.add(mesh(fuselage(10, 0.78, { nose: 0.72, tail: 0.12, pointy: 0.3 }), P));
    g.add(mesh(wing(11.4, 2.3, 1.0, 0.5, 0.2), P, 0, -0.42, 0.0));
    const can = mesh(new THREE.SphereGeometry(0.62, 16, 12), glass(), 0, 0.58, -0.3); can.scale.set(0.95, 0.9, 3.2); g.add(can);
    g.add(mesh(wing(4.2, 1.3, 0.6, 0.5, 0.12), P, 0, 0.1, 4.2));
    g.add(mesh(fin(1.9, 1.9, 0.7, 0.9, 0.12), P, 0, 0.2, 4.1));
    g.add(mesh(new THREE.BoxGeometry(0.06, 0.28, 6), W, 0.8, 0.0, 0.0));
    g.add(mesh(new THREE.BoxGeometry(0.06, 0.28, 6), W, -0.8, 0.0, 0.0));
    [-1, 1].forEach(s => {
      g.add(mesh(new THREE.BoxGeometry(0.9, 0.24, 0.9), W, s * 5.2, -0.42, 0.35));
      const w = wheel(0.34, 0.22); w.position.set(s * 1.6, -1.15, 0.1); g.add(w);
      g.add(mesh(new THREE.BoxGeometry(0.1, 0.8, 0.1), std(0x444444), s * 1.6, -0.75, 0.1));
    });
    const nw = wheel(0.26, 0.16); nw.position.set(0, -1.24, -3.2); g.add(nw);
    g.add(mesh(new THREE.BoxGeometry(0.1, 0.8, 0.1), std(0x444444), 0, -0.85, -3.2));
    [-1, 1].forEach(s => { const ex = mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.5, 8), std(0x555555, { metalness: 0.8 }), s * 0.7, 0.05, -3.2); ex.rotation.z = s * 1.2; g.add(ex); });
    const prop = propeller(4, 2.5, 0.2, 0.3); prop.position.z = -5.0; g.add(prop);
    return { group: g, props: [prop], flames: [], paint: [P] };
  }

  function buildSwift(paint) {
    const g = new THREE.Group(), P = std(paint), W = std(0xf4f6f8, { metalness: 0.35, roughness: 0.35 });
    g.add(mesh(fuselage(14, 1.0, { nose: 0.8, tail: 0.18, pointy: 0.15 }), W));
    g.add(mesh(new THREE.BoxGeometry(2.04, 0.3, 11), P, 0, -0.1, 0.4));
    g.add(mesh(wing(14, 3.0, 1.0, 1.8, 0.24), W, 0, -0.55, 0.6));
    [-1, 1].forEach(s => { const wl = mesh(fin(1.0, 0.9, 0.4, 0.4, 0.08), P, s * 7.0, -0.45, 2.2); wl.rotation.z = -s * 0.2; g.add(wl); });
    g.add(mesh(new THREE.BoxGeometry(1.5, 0.5, 0.9), glass(), 0, 0.42, -5.2));
    for (let i = 0; i < 5; i++) [-1, 1].forEach(s => g.add(mesh(new THREE.SphereGeometry(0.14, 8, 6), glass(), s * 0.98, 0.25, -3 + i * 1.0)));
    g.add(mesh(fin(2.6, 2.6, 1.4, 1.5, 0.16), W, 0, 0.6, 5.5));
    g.add(mesh(wing(5.2, 1.4, 0.8, 0.8, 0.12), P, 0, 3.15, 6.6));
    const flames = [];
    [-1, 1].forEach(s => {
      const pod = new THREE.CylinderGeometry(0.55, 0.48, 3.2, 14); pod.rotateX(Math.PI / 2);
      g.add(mesh(pod, P, s * 1.65, 0.55, 3.7));
      g.add(mesh(new THREE.BoxGeometry(0.9, 0.2, 1.2), W, s * 1.1, 0.55, 3.7));
      const intake = new THREE.CircleGeometry(0.5, 14); intake.rotateY(Math.PI);
      g.add(mesh(intake, std(0x111111), s * 1.65, 0.55, 2.09));
      const f = flame(0.42, 2.5); f.position.set(s * 1.65, 0.55, 5.3); g.add(f); flames.push(f);
    });
    [-1, 1].forEach(s => {
      const w = wheel(0.38, 0.24); w.position.set(s * 1.8, -1.35, 0.9); g.add(w);
      g.add(mesh(new THREE.BoxGeometry(0.12, 1.0, 0.12), std(0x555555), s * 1.8, -0.9, 0.9));
    });
    const nw = wheel(0.3, 0.2); nw.position.set(0, -1.4, -4.8); g.add(nw);
    g.add(mesh(new THREE.BoxGeometry(0.12, 1.0, 0.12), std(0x555555), 0, -0.95, -4.8));
    return { group: g, props: [], flames, paint: [P] };
  }

  function buildThunder(paint) {
    const g = new THREE.Group(), P = std(paint, { metalness: 0.35, roughness: 0.4 }), G = std(0x8e959e, { metalness: 0.5, roughness: 0.4 });
    g.add(mesh(fuselage(15, 0.95, { nose: 0.62, tail: 0.45, pointy: 0.75, body: 0.3 }), P));
    g.add(mesh(wing(10.5, 7.5, 1.2, 4.0, 0.24), P, 0, -0.2, 1.8));
    const can = mesh(new THREE.SphereGeometry(0.6, 16, 12), std(0xffb340, { metalness: 0.9, roughness: 0.1, emissive: 0x3a2000 }), 0, 0.62, -3.0);
    can.scale.set(0.9, 0.85, 3.2); g.add(can);
    [-1, 1].forEach(s => {
      const f = mesh(fin(2.6, 2.8, 1.0, 1.8, 0.12), P, s * 1.4, 0.5, 5.0); f.rotation.z = -s * 0.32; g.add(f);
      g.add(mesh(new THREE.BoxGeometry(0.8, 1.0, 4.5), G, s * 1.15, -0.1, -0.6));
      g.add(mesh(new THREE.BoxGeometry(0.08, 0.08, 3), std(0xffffff), s * 5.25, -0.2, 3.2));
    });
    g.add(mesh(wing(6.4, 2.0, 0.8, 0.9, 0.1), P, 0, 0.0, 6.2));
    const noz = new THREE.CylinderGeometry(0.7, 0.62, 1.4, 14); noz.rotateX(Math.PI / 2);
    g.add(mesh(noz, G, 0, 0, 7.6));
    const f = flame(0.6, 4.5); f.position.set(0, 0, 8.3); g.add(f);
    [-1, 1].forEach(s => {
      const w = wheel(0.36, 0.24); w.position.set(s * 1.9, -1.25, 1.6); g.add(w);
      g.add(mesh(new THREE.BoxGeometry(0.12, 1.0, 0.12), std(0x555555), s * 1.9, -0.8, 1.6));
    });
    const nw = wheel(0.28, 0.18); nw.position.set(0, -1.32, -4.3); g.add(nw);
    g.add(mesh(new THREE.BoxGeometry(0.12, 1.0, 0.12), std(0x555555), 0, -0.85, -4.3));
    return { group: g, props: [], flames: [f], paint: [P] };
  }

  // stats: speeds in m/s
  FH.PLANES = [
    { id: 'sparrow', name: 'Sparrow', type: 'Light Prop', emoji: '🛩️', price: 0, maxSpeed: 52, stall: 19, accel: 5.2, pitch: 1.0, roll: 1.9, yaw: 0.45, turn: 0.55, fuelTime: 420, gear: 1.4, size: 1.0, ceiling: 3500, jet: false, build: buildSparrow, desc: 'A friendly little trainer plane. Slow, safe and easy to fly.', descR: 'A small, slow, easy plane. Great for learning!' },
    { id: 'bluebird', name: 'Bluebird', type: 'Sport Prop', emoji: '🛩️', price: 1500, maxSpeed: 68, stall: 22, accel: 6.5, pitch: 1.25, roll: 2.6, yaw: 0.5, turn: 0.62, fuelTime: 480, gear: 1.3, size: 1.0, ceiling: 4500, jet: false, build: buildBluebird, desc: 'A zippy sport plane with a bubble canopy and quick handling.', descR: 'Faster and turns quickly. Fun!' },
    { id: 'pelican', name: 'Pelican', type: 'Twin Prop Cargo', emoji: '✈️', price: 4000, maxSpeed: 82, stall: 26, accel: 7, pitch: 0.95, roll: 1.6, yaw: 0.4, turn: 0.5, fuelTime: 760, gear: 1.95, size: 1.5, ceiling: 6000, jet: false, cargo: 1.4, build: buildPelican, desc: 'Two engines and a big cargo hold. Earns +40% on delivery missions.', descR: 'A big plane with two engines. Gets extra FP for deliveries!' },
    { id: 'kestrel', name: 'Kestrel', type: 'Turboprop', emoji: '✈️', price: 8000, maxSpeed: 105, stall: 30, accel: 10, pitch: 1.45, roll: 3.2, yaw: 0.55, turn: 0.72, fuelTime: 620, gear: 1.6, size: 1.2, ceiling: 7500, jet: false, build: buildKestrel, desc: 'A powerful aerobatic turboprop. Very fast rolls and a strong climb.', descR: 'Very fast and can do tricks!' },
    { id: 'swift', name: 'Swift', type: 'Light Jet', emoji: '🛫', price: 14000, maxSpeed: 155, stall: 43, accel: 13, pitch: 1.15, roll: 2.3, yaw: 0.45, turn: 0.62, fuelTime: 700, gear: 1.75, size: 1.7, ceiling: 11000, jet: true, build: buildSwift, desc: 'Your first jet! Smooth, quick and able to fly very high.', descR: 'Your first JET! Very fast and high.' },
    { id: 'thunder', name: 'Thunderbird', type: 'Fast Jet', emoji: '🚀', price: 26000, maxSpeed: 225, stall: 54, accel: 21, pitch: 1.6, roll: 3.8, yaw: 0.5, turn: 0.82, fuelTime: 600, gear: 1.7, size: 1.8, ceiling: 13000, jet: true, build: buildThunder, desc: 'The ultimate jet. Blazing speed and razor-sharp handling.', descR: 'The fastest plane in the sky!' },
  ];
  FH.planeById = id => FH.PLANES.find(p => p.id === id);
  FH.planeIndex = id => FH.PLANES.findIndex(p => p.id === id);

  FH.UPGRADES = [
    { key: 'engine', name: 'Engine', icon: '⚙️', desc: 'More power and a higher top speed', descR: 'Go faster!' },
    { key: 'wings', name: 'Wings', icon: '🪽', desc: 'Sharper turns and a lower stall speed', descR: 'Turn faster!' },
    { key: 'fuel', name: 'Fuel Tank', icon: '⛽', desc: 'Fly much longer before refuelling', descR: 'Fly longer!' },
  ];
  FH.upgradeCost = (plane, level) => Math.round(Math.max(250, plane.price * 0.18) * level / 10) * 10;
})();

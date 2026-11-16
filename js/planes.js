// FlyHigh - aircraft catalogue and detailed procedural 3D models
// Each model has airfoil-shaped wings, moving control surfaces, a painted livery with
// Canadian-style registration markings, a spinning prop (with motion blur) or jet flames,
// and (on the faster planes) landing gear that folds away in flight.
(function () {
  const FH = window.FH, U = FH.util, TAU = Math.PI * 2, D2R = Math.PI / 180;

  FH.PAINTS = {
    red: 0xe63946, blue: 0x2a6fdb, yellow: 0xffc93c, green: 0x2ecc71, orange: 0xff8c42,
    purple: 0x8e5bd9, pink: 0xff6fae, teal: 0x1fb5ad, white: 0xf1f3f5, black: 0x2b2d42,
  };
  FH.PAINT_COST = 150;

  // ======================= colours (canvas side, sRGB) =======================
  const rgb = h => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
  const css = (h, a) => { const c = rgb(h); return a == null ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${a})`; };
  const mix = (h1, h2, t) => { const a = rgb(h1), b = rgb(h2); return (Math.round(a[0] + (b[0] - a[0]) * t) << 16) | (Math.round(a[1] + (b[1] - a[1]) * t) << 8) | Math.round(a[2] + (b[2] - a[2]) * t); };
  const lum = h => { const c = rgb(h); return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255; };
  const WHITE = 0xf4f3ef, INK = 0x1c2027, NAVY = 0x22304a, INTERIOR = 0x2a2e35, FLAG_RED = 0xd52b1e;
  // a second colour that always shows up against the paint
  const contrast = p => lum(p) > 0.72 ? NAVY : WHITE;

  // ======================= reflections =======================
  // A small sky/ground environment map gives paint, metal and glass believable reflections.
  FH.envLight = 1;
  function envMap() {
    if (FH.planeEnv !== undefined) return FH.planeEnv;
    if (!FH.renderer) return null;
    try {
      const pm = new THREE.PMREMGenerator(FH.renderer), sc = new THREE.Scene();
      const mat = new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false,
        vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `varying vec3 vP; void main(){
          vec3 d = normalize(vP); float h = d.y;
          vec3 top = vec3(0.12, 0.32, 0.78), hor = vec3(0.82, 0.88, 0.95), gnd = vec3(0.17, 0.19, 0.16);
          vec3 c = h > 0.0 ? mix(hor, top, pow(h, 0.5)) : mix(hor * 0.7, gnd, pow(min(1.0, -h * 4.0), 0.5));
          c += vec3(1.0, 0.96, 0.88) * pow(max(dot(d, normalize(vec3(0.5, 0.75, 0.4))), 0.0), 40.0) * 2.0;
          gl_FragColor = vec4(c, 1.0); }`,
      });
      sc.add(new THREE.Mesh(new THREE.SphereGeometry(10, 48, 24), mat));
      FH.planeEnv = pm.fromScene(sc, 0.0).texture;
      pm.dispose(); mat.dispose();
    } catch (e) { FH.planeEnv = null; }
    return FH.planeEnv;
  }

  // ======================= materials kit (one per model) =======================
  class Kit {
    constructor(paint) { this.paint = paint; this.mats = []; this.repaints = []; this.liveries = []; }
    reg(m) { m.userData.envBase = m.envMapIntensity; this.mats.push(m); return m; }
    std(color, o) { return this.reg(new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.55, metalness: 0.1, envMap: envMap(), envMapIntensity: 0.7 }, o || {}))); }
    // glossy clear-coated paint
    gloss(color, o) { return this.reg(new THREE.MeshPhysicalMaterial(Object.assign({ color, roughness: 0.42, metalness: 0.05, clearcoat: 0.85, clearcoatRoughness: 0.14, envMap: envMap(), envMapIntensity: 0.85 }, o || {}))); }
    metal(color, o) { return this.std(color, Object.assign({ roughness: 0.32, metalness: 0.85, envMapIntensity: 1 }, o || {})); }
    // see-through glass: reflections are added on top instead of being faded with the tint
    glass(tint, o) {
      return this.reg(new THREE.MeshPhysicalMaterial(Object.assign({
        color: tint == null ? 0x0b1520 : tint, roughness: 0.04, metalness: 0.0, clearcoat: 1, clearcoatRoughness: 0.03,
        envMap: envMap(), envMapIntensity: 1.6, transparent: true, opacity: 0.4, depthWrite: false,
        blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      }, o || {})));
    }
    get tire() { return this._tire || (this._tire = this.std(0x1b1c1f, { roughness: 0.92, metalness: 0, envMapIntensity: 0.2 })); }
    get dark() { return this._dark || (this._dark = this.std(0x2d3138, { roughness: 0.6 })); }
    get chrome() { return this._chrome || (this._chrome = this.metal(0xd9dde2, { roughness: 0.18 })); }
    get steel() { return this._steel || (this._steel = this.metal(0x8b9097, { roughness: 0.38 })); }
    get inner() { return this._inner || (this._inner = this.std(INTERIOR, { roughness: 0.9, envMapIntensity: 0.2, side: THREE.BackSide })); }
    // a material whose colour follows the paint
    paintMat(o, k = 0, toward = 0x000000) {
      const m = this.gloss(mix(this.paint, toward, k), o);
      this.repaints.push(p => m.color.setHex(mix(p, toward, k)));
      return m;
    }
    lens(color) { return this.std(color, { emissive: color, emissiveIntensity: 0.7, roughness: 0.15 }); }
    repaint(p) { this.paint = p; this.repaints.forEach(f => f(p)); this.liveries.forEach(l => l.redraw(p)); }
  }

  function mesh(geo, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; }
  function strut(x1, y1, z1, x2, y2, z2, r, mat, seg = 8) {
    const a = new THREE.Vector3(x1, y1, z1), b = new THREE.Vector3(x2, y2, z2);
    const m = mesh(new THREE.CylinderGeometry(r, r, a.distanceTo(b), seg), mat);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    return m;
  }
  function merge(geos) {
    if (geos.length === 1) return geos[0];
    const list = geos.map(g => g.index ? g.toNonIndexed() : g);
    return FH.mergeGeometries ? FH.mergeGeometries(list, false) : list[0];
  }

  // ======================= fuselage (body of revolution with tail upsweep) =======================
  // o: L length, R radius, squash (height/width), wide, box (superellipse power: 2 round, 3+ boxy),
  //    nose/body (where the nose starts / the tail cone ends, as fractions from the tail), tail (tip radius),
  //    pointy, blunt (radius left at the nose for a spinner), up (tail upsweep), droop (nose droop), z (centre)
  function makeBody(o) {
    const L = o.L, R = o.R, sq = o.squash || 1, wide = o.wide || 1, n = o.box || 2;
    const tail = o.tail ?? 0.16, noseStart = o.nose ?? 0.8, bodyEnd = o.body ?? 0.5, pointy = o.pointy || 0, blunt = o.blunt || 0;
    const up = o.up || 0, droop = o.droop || 0, z0 = o.z || 0, y0 = o.y || 0;
    const rf = t => {
      if (t < bodyEnd) return tail + (1 - tail) * U.smoothstep(0, bodyEnd, t);
      if (t <= noseStart) return 1;
      const k = (t - noseStart) / (1 - noseStart);
      return blunt + (1 - blunt) * Math.sqrt(Math.max(0, 1 - k * k)) * (1 - pointy * k);
    };
    const cy = t => y0 + (t < bodyEnd ? up * R * (1 - rf(t)) : t > noseStart ? -droop * R * (1 - rf(t)) : 0);
    const sec = phi => { const s = Math.sin(phi), c = Math.cos(phi); return [Math.sign(s) * Math.pow(Math.abs(s), 2 / n), Math.sign(c) * Math.pow(Math.abs(c), 2 / n)]; };
    const M = o.around || 32, NS = o.segs || 44;
    const ts = [0]; for (let i = 0; i <= NS; i++) ts.push(i / NS); ts.push(1);
    const pos = [], uv = [], idx = [];
    ts.forEach((t, i) => {
      const r = (i === 0 || i === ts.length - 1) ? 0.0005 : Math.max(0.004, rf(t) * R), c0 = cy(t), z = z0 + (0.5 - t) * L;
      for (let j = 0; j <= M; j++) {
        const phi = j / M * TAU, s = sec(phi);
        pos.push(s[0] * r * wide, c0 + s[1] * r * sq, z);
        uv.push(j / M, 1 - t);
      }
    });
    const W = M + 1;
    for (let i = 0; i < ts.length - 1; i++) for (let j = 0; j < M; j++) {
      const a = i * W + j, b = a + 1, c = a + W, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    const nr = geo.attributes.normal; // weld the seam normals
    for (let i = 0; i < ts.length; i++) {
      const a = i * W, b = a + M;
      const x = nr.getX(a) + nr.getX(b), y = nr.getY(a) + nr.getY(b), z = nr.getZ(a) + nr.getZ(b), l = Math.hypot(x, y, z) || 1;
      nr.setXYZ(a, x / l, y / l, z / l); nr.setXYZ(b, x / l, y / l, z / l);
    }
    const tOf = z => U.clamp(0.5 - (z - z0) / L, 0, 1);
    const B = {
      geo, L, R, z0, sq, wide, n,
      rAt: z => rf(tOf(z)) * R, cyAt: z => cy(tOf(z)),
      topAt: z => cy(tOf(z)) + rf(tOf(z)) * R * sq, botAt: z => cy(tOf(z)) - rf(tOf(z)) * R * sq,
      halfW: z => rf(tOf(z)) * R * wide,
      // angle around the body (0 = top, PI/2 = right side) for a height fraction h (-1 bottom .. 1 top)
      phiForH: h => { h = U.clamp(h, -1, 1); return Math.acos(Math.sign(h) * Math.pow(Math.abs(h), n / 2)); },
      // metres of surface per radian around the body at z and angle phi
      arc: (z, phi) => { const r = rf(tOf(z)) * R, a = sec(phi - 0.01), b = sec(phi + 0.01); return Math.max(0.02, Math.hypot((b[0] - a[0]) * r * wide, (b[1] - a[1]) * r * sq) / 0.02); },
      // point on the surface
      at: (z, side, h) => { const phi = side > 0 ? B.phiForH(h) : TAU - B.phiForH(h), s = sec(phi), r = rf(tOf(z)) * R; return new THREE.Vector3(s[0] * r * wide, cy(tOf(z)) + s[1] * r * sq, z); },
    };
    return B;
  }

  // ======================= livery painting =======================
  function canvasTex(W, H) {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const tex = new THREE.CanvasTexture(cv);
    tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    return { cv, ctx: cv.getContext('2d'), tex };
  }
  // draws text centred on (0,0) in the current transform
  function text(ctx, str, size, fill, stroke, font) {
    ctx.font = `${font || '700'} ${size}px "Arial Narrow", Arial, Helvetica, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (stroke) { ctx.lineJoin = 'round'; ctx.lineWidth = size * 0.16; ctx.strokeStyle = css(stroke); ctx.strokeText(str, 0, 0); }
    ctx.fillStyle = css(fill); ctx.fillText(str, 0, 0);
  }
  // stylised maple leaf, unit size, centred, y up
  const LEAF = [[0, 1], [0.14, 0.72], [0.28, 0.8], [0.22, 0.38], [0.47, 0.6], [0.52, 0.47], [0.8, 0.53], [0.69, 0.3], [0.84, 0.22], [0.45, -0.1], [0.52, -0.27], [0.1, -0.2], [0.05, -0.22], [0.06, -0.66], [0, -0.66]];
  function leaf(ctx, s, col) {
    ctx.beginPath();
    LEAF.forEach(([x, y], i) => i ? ctx.lineTo(x * s, -y * s) : ctx.moveTo(x * s, -y * s));
    for (let i = LEAF.length - 2; i > 0; i--) ctx.lineTo(-LEAF[i][0] * s, -LEAF[i][1] * s);
    ctx.closePath(); ctx.fillStyle = css(col); ctx.fill();
  }
  // Canadian flag, w wide (centred)
  function flag(ctx, w) {
    const h = w / 2;
    ctx.fillStyle = css(0xffffff); ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.fillStyle = css(FLAG_RED); ctx.fillRect(-w / 2, -h / 2, w / 4, h); ctx.fillRect(w / 4, -h / 2, w / 4, h);
    leaf(ctx, h * 0.43, FLAG_RED);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = w * 0.015; ctx.strokeRect(-w / 2, -h / 2, w, h);
  }
  function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }

  // Painter for a fuselage made by makeBody. Canvas x runs around the body (top, right, bottom, left),
  // canvas y runs from nose (top) to tail (bottom). Helpers take positions in metres.
  function bodyLivery(K, B, mat, draw, W = 512) {
    const H = B.L > 10 ? 2048 : 1024, T = canvasTex(W, H), ctx = T.ctx;
    const zTop = B.z0 - B.L / 2;
    const A = {
      ctx, W, H, B,
      X: phi => phi / TAU * W,
      Y: z => (z - zTop) / B.L * H,
      phi: (side, h) => side > 0 ? B.phiForH(h) : TAU - B.phiForH(h),
      fill(col) { ctx.fillStyle = css(col); ctx.fillRect(0, 0, W, H); },
      _f: v => typeof v === 'function' ? v : () => v,
      band(side, z0, z1, hTop, hBot, col) {
        const ft = A._f(hTop), fb = A._f(hBot), n = 40; ctx.beginPath();
        for (let i = 0; i <= n; i++) { const z = z0 + (z1 - z0) * i / n; const x = A.X(A.phi(side, ft(z))), y = A.Y(z); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        for (let i = n; i >= 0; i--) { const z = z0 + (z1 - z0) * i / n; ctx.lineTo(A.X(A.phi(side, fb(z))), A.Y(z)); }
        ctx.closePath(); ctx.fillStyle = css(col); ctx.fill();
      },
      bands(z0, z1, hTop, hBot, col) { A.band(1, z0, z1, hTop, hBot, col); A.band(-1, z0, z1, hTop, hBot, col); },
      belly(z0, z1, h, col) { A.bands(z0, z1, h, -1, col); },
      top(z0, z1, h, col) { A.bands(z0, z1, 1, h, col); },
      ring(z0, z1, col) { ctx.fillStyle = css(col); ctx.fillRect(0, A.Y(z0), W, A.Y(z1) - A.Y(z0)); },
      line(z, col = 0x000000, a = 0.22, w = 1.5) { ctx.fillStyle = css(col, a); ctx.fillRect(0, A.Y(z) - w / 2, W, w); },
      // draw on a side in centimetres: +x toward the viewer's right, +y down, upright for someone looking at that side
      side(side, z, h, fn) {
        const phi = A.phi(side, h), sA = H / B.L / 100, sV = (W / TAU) / B.arc(z, phi) / 100;
        ctx.save();
        if (side > 0) ctx.setTransform(0, -sA, sV, 0, A.X(phi), A.Y(z));
        else ctx.setTransform(0, sA, -sV, 0, A.X(phi), A.Y(z));
        fn(ctx); ctx.restore();
      },
      both(z, h, fn) { A.side(1, z, h, fn); A.side(-1, z, h, fn); },
      text(z, h, str, sizeM, fill, stroke, font) { A.both(z, h, c => text(c, str, sizeM * 100, fill, stroke, font)); },
      flag(z, h, wM) { A.both(z, h, c => flag(c, wM * 100)); },
      // rounded windows along both sides
      windows(zs, h, wM, hM, col = 0x16202b) {
        A.both(0, 0, () => { });
        for (const z of zs) A.both(z, h, c => {
          const w = wM * 100, hh = hM * 100;
          const g = c.createLinearGradient(0, -hh / 2, 0, hh / 2); g.addColorStop(0, css(mix(col, 0x9fb7cc, 0.35))); g.addColorStop(0.5, css(col)); g.addColorStop(1, css(mix(col, 0x000000, 0.3)));
          roundRect(c, -w / 2, -hh / 2, w, hh, Math.min(w, hh) * 0.45); c.fillStyle = g; c.fill();
          c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,0.35)'; c.stroke();
        });
      },
      soot(side, z0, z1, h, hM) {
        A.side(side, (z0 + z1) / 2, h, c => {
          const l = Math.abs(z1 - z0) * 100, hh = hM * 100, g = c.createLinearGradient(side > 0 ? -l / 2 : l / 2, 0, side > 0 ? l / 2 : -l / 2, 0);
          g.addColorStop(0, 'rgba(30,30,30,0.55)'); g.addColorStop(1, 'rgba(30,30,30,0)');
          c.fillStyle = g; c.beginPath(); c.ellipse(0, 0, l / 2, hh / 2, 0, 0, TAU); c.fill();
        });
      },
      redraw(p) { ctx.setTransform(1, 0, 0, 1, 0, 0); draw(A, p); T.tex.needsUpdate = true; },
    };
    mat.map = T.tex; mat.color.setHex(0xffffff);
    A.redraw(K.paint); K.liveries.push(A);
    return A;
  }

  // ======================= lifting surfaces (wings, tails, fins, prop blades) =======================
  function airfoil(x, t) { return 5 * t * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x * x * x - 0.1036 * x * x * x * x); }
  // P: span (tip-to-tip if mirror, else height), root, tip, sweep (tip chord-centre offset, + = aft), t (thickness/chord),
  //    tipT, dih (degrees), camber, mirror; or pf(e) returning a custom station
  function planform(P) {
    if (P.pf) return P.pf;
    const semi = P.mirror ? P.span / 2 : P.span, dih = Math.tan((P.dih || 0) * D2R);
    return e => { const c = P.root + (P.tip - P.root) * e; return { a: e * semi, c, le: P.sweep * e - c / 2, off: e * semi * dih, t: P.t + ((P.tipT ?? P.t) - P.t) * e, rot: 0 }; };
  }
  // local frame: A = span axis, T = thickness axis, Z = chord axis (aft). map: wing | wingL | fin | blade
  function mapPt(A, T, Z, map) {
    if (map === 'wingL') return [-A, T, Z];
    if (map === 'fin') return [T, A, Z];
    if (map === 'blade') return [Z, A, T];
    return [A, T, Z];
  }
  function stationPt(st, x, upper, cam) {
    const yt = airfoil(x, st.t) * st.c, yc = cam * 4 * x * (1 - x) * st.c;
    let T = st.off + yc + (upper ? yt : -yt), Z = st.le + x * st.c;
    if (st.rot) { const pz = st.le + 0.35 * st.c, dz = Z - pz, dt = T - st.off, c = Math.cos(st.rot), s = Math.sin(st.rot); T = st.off + dt * c - dz * s; Z = pz + dt * s + dz * c; }
    return [st.a, T, Z];
  }
  // one piece of a surface: span range e0..e1 (0 root, 1 tip) and chord range c0..c1 (0 leading edge, 1 trailing edge)
  function loftPiece(P, o) {
    const pf = planform(P), map = o.map || 'wing', left = map === 'wingL';
    const e0 = o.e0 ?? 0, e1 = o.e1 ?? 1, c0 = o.c0 ?? 0, c1 = o.c1 ?? 1, n = o.n || 9, ns = o.ns || (P.pf ? 10 : 1), cam = P.camber || 0;
    const es = []; for (let i = 0; i <= ns; i++) es.push(e0 + (e1 - e0) * i / ns);
    const cs = k => c0 + (c1 - c0) * (1 - Math.cos(Math.PI * k / n)) / 2;
    const strips = [], ring = [];
    if (c0 < 1e-4) {
      const s = []; for (let k = n; k >= 1; k--) s.push([cs(k), false]); s.push([0, true]); for (let k = 1; k <= n; k++) s.push([cs(k), true]);
      strips.push(s); ring.push(...s);
    } else {
      const lo = [], hi = []; for (let k = n; k >= 0; k--) lo.push([cs(k), false]); for (let k = 0; k <= n; k++) hi.push([cs(k), true]);
      strips.push(lo, [[c0, false], [c0, true]], hi); ring.push(...lo, ...hi);
    }
    if (c1 < 0.9999) strips.push([[c1, true], [c1, false]]);
    const uvOf = (e, x, up) => { const s = P.mirror ? (left ? 0.5 - 0.5 * e : 0.5 + 0.5 * e) : e; return [(up ? 0 : 0.5) + 0.5 * s, x]; };
    const pos = [], uv = [], idx = [];
    for (const s of strips) {
      const base = pos.length / 3, m = s.length;
      for (const e of es) { const st = pf(e); for (const [x, up] of s) { pos.push(...stationPt(st, x, up, cam)); uv.push(...uvOf(e, x, up)); } }
      for (let i = 0; i < es.length - 1; i++) for (let j = 0; j < m - 1; j++) {
        const a = base + i * m + j, b = a + 1, c = a + m, d = c + 1;
        idx.push(a, b, c, c, b, d);
      }
    }
    const cap = (e, out, round) => {
      const st = pf(e), base = pos.length / 3, pts = ring.map(([x, up]) => stationPt(st, x, up, cam));
      const cc = [0, 0, 0]; pts.forEach(p => { cc[0] += p[0]; cc[1] += p[1]; cc[2] += p[2]; });
      pos.push(cc[0] / pts.length + out * round, cc[1] / pts.length, cc[2] / pts.length); uv.push(...uvOf(e, 0.4, true));
      pts.forEach((p, k) => { pos.push(...p); uv.push(...uvOf(e, ring[k][0], ring[k][1])); });
      const l = pts.length;
      for (let k = 0; k < l - 1; k++) out > 0 ? idx.push(base, base + 1 + k, base + 2 + k) : idx.push(base, base + 2 + k, base + 1 + k);
      out > 0 ? idx.push(base, base + l, base + 1) : idx.push(base, base + 1, base + l);
    };
    cap(e0, -1, 0); cap(e1, 1, o.round || 0);
    const out = new Float32Array(pos.length);
    for (let i = 0; i < pos.length; i += 3) { const p = mapPt(pos[i], pos[i + 1], pos[i + 2], map); out[i] = p[0]; out[i + 1] = p[1]; out[i + 2] = p[2]; }
    if (map === 'wingL' || map === 'fin') for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(out, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  // A complete surface. cuts: control surfaces [{e0, e1, c0, kind, max}] (hinged pieces), the rest is fixed.
  // Returns { group, surfaces:[...] } in the surface's own frame (add the group where it belongs).
  function surface(K, P, mat, cuts, o = {}) {
    const group = new THREE.Group(), surfaces = [], maps = P.mirror ? ['wing', 'wingL'] : [o.map || 'fin'];
    cuts = cuts || [];
    const pf = planform(P);
    for (const map of maps) {
      // split the span at every cut boundary and build fixed pieces in between
      const bounds = new Set([0, 1]); cuts.forEach(c => { bounds.add(c.e0); bounds.add(c.e1); });
      const bs = [...bounds].sort((a, b) => a - b), fixed = [];
      for (let i = 0; i < bs.length - 1; i++) {
        const e0 = bs[i], e1 = bs[i + 1], cut = cuts.find(c => c.e0 <= e0 + 1e-6 && c.e1 >= e1 - 1e-6);
        fixed.push(loftPiece(P, { e0, e1, c0: 0, c1: cut ? cut.c0 : 1, map, round: e1 === 1 ? (o.round || 0) : 0, n: o.n }));
      }
      group.add(mesh(merge(fixed), mat));
      for (const c of cuts) {
        const geo = loftPiece(P, { e0: c.e0, e1: c.e1, c0: c.c0, c1: 1, map, n: 6 });
        const h0 = stationPt(pf(c.e0), c.c0, true, P.camber || 0), h1 = stationPt(pf(c.e1), c.c0, true, P.camber || 0);
        const s0 = pf(c.e0), s1 = pf(c.e1);
        h0[1] = s0.off; h1[1] = s1.off; // hinge on the chord line
        const a = new THREE.Vector3(...mapPt(...h0, map)), b = new THREE.Vector3(...mapPt(...h1, map));
        geo.translate(-a.x, -a.y, -a.z);
        const pivot = new THREE.Group(); pivot.position.copy(a); pivot.add(mesh(geo, c.mat || mat));
        const axis = b.sub(a).normalize();
        if (map === 'wingL') axis.negate(); // positive angle always moves the trailing edge down (or right on a fin)
        let kind = c.kind;
        if (kind === 'ail') kind = map === 'wingL' ? 'ailL' : 'ailR';
        if (kind === 'elevon') kind = map === 'wingL' ? 'elevonL' : 'elevonR';
        group.add(pivot); surfaces.push({ pivot, axis, kind, max: c.max || 0.35 });
      }
    }
    return { group, surfaces };
  }
  // painter for a surface: canvas x = span position (upper half / lower half), canvas y = chord (leading edge at top)
  function surfLivery(K, mat, span, chordAt, kind, draw, W = 1024, H = 256) {
    const T = canvasTex(W, H), ctx = T.ctx;
    const A = {
      ctx, W, H,
      X: (s, upper) => ((upper ? 0 : 0.5) + 0.5 * s) * W, Y: c => c * H,
      fill(col) { ctx.fillStyle = css(col); ctx.fillRect(0, 0, W, H); },
      rect(s0, s1, c0, c1, col, which = 'both', a) {
        ctx.fillStyle = css(col, a);
        for (const up of which === 'both' ? [true, false] : [which === 'top']) ctx.fillRect(A.X(s0, up), A.Y(c0), A.X(s1, up) - A.X(s0, up), A.Y(c1) - A.Y(c0));
      },
      poly(pts, col, which = 'both') {
        ctx.fillStyle = css(col);
        for (const up of which === 'both' ? [true, false] : [which === 'top']) { ctx.beginPath(); pts.forEach(([s, c], i) => i ? ctx.lineTo(A.X(s, up), A.Y(c)) : ctx.moveTo(A.X(s, up), A.Y(c))); ctx.closePath(); ctx.fill(); }
      },
      // outline of a panel (control surface, flap, hatch)
      panel(s0, s1, c0, c1, which = 'both', a = 0.3) {
        ctx.strokeStyle = `rgba(0,0,0,${a})`; ctx.lineWidth = 1.5;
        for (const up of which === 'both' ? [true, false] : [which === 'top']) ctx.strokeRect(A.X(s0, up), A.Y(c0), A.X(s1, up) - A.X(s0, up), A.Y(c1) - A.Y(c0));
      },
      // draw upright in centimetres centred at span s, chord c
      at(s, c, upper, fn) {
        const sS = (W / 2) / span / 100, sC = H / chordAt(s) / 100, x = A.X(s, upper), y = A.Y(c);
        ctx.save();
        if (kind === 'fin') { if (upper) ctx.setTransform(0, -sC, -sS, 0, x, y); else ctx.setTransform(0, sC, -sS, 0, x, y); }
        else { if (upper) ctx.setTransform(sS, 0, 0, sC, x, y); else ctx.setTransform(-sS, 0, 0, sC, x, y); }
        fn(ctx); ctx.restore();
      },
      redraw(p) { ctx.setTransform(1, 0, 0, 1, 0, 0); draw(A, p); T.tex.needsUpdate = true; },
    };
    mat.map = T.tex; mat.color.setHex(0xffffff);
    A.redraw(K.paint); K.liveries.push(A);
    return A;
  }
  const chordFn = P => s => { const e = P.mirror ? Math.abs(s - 0.5) * 2 : s; return P.root + (P.tip - P.root) * e; };
  const spanM = P => P.span;

  // ======================= parts =======================
  let bladeTex = null, discTex = null;
  function bladeTexture() {
    if (bladeTex) return bladeTex;
    const T = canvasTex(64, 8), c = T.ctx;
    c.fillStyle = '#26282c'; c.fillRect(0, 0, 64, 8);
    c.fillStyle = '#f2c230'; c.fillRect(29, 0, 3, 8); c.fillRect(61, 0, 3, 8);
    c.fillStyle = '#e8e8e8'; c.fillRect(27, 0, 2, 8); c.fillRect(59, 0, 2, 8);
    return bladeTex = T.tex;
  }
  function discTexture() {
    if (discTex) return discTex;
    const T = canvasTex(256, 256), c = T.ctx, g = c.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(60,62,66,0)'); g.addColorStop(0.2, 'rgba(60,62,66,0.0)'); g.addColorStop(0.3, 'rgba(60,62,66,0.32)');
    g.addColorStop(0.8, 'rgba(70,72,76,0.22)'); g.addColorStop(0.9, 'rgba(240,200,60,0.42)'); g.addColorStop(0.97, 'rgba(240,200,60,0.35)'); g.addColorStop(1, 'rgba(240,200,60,0)');
    c.fillStyle = g; c.fillRect(0, 0, 256, 256);
    T.tex.flipY = true;
    return discTex = T.tex;
  }
  // propeller: blades, diameter, spinner radius; spinner material can follow the paint
  function propeller(K, blades, dia, spR, o = {}) {
    const root = new THREE.Group(), spin = new THREE.Group(), bladesG = new THREE.Group();
    root.add(spin); spin.add(bladesG);
    const sl = spR * (o.spinLen || 2.1), pts = [];
    for (let i = 0; i <= 14; i++) { const k = i / 14; pts.push(new THREE.Vector2(Math.max(0.002, spR * Math.pow(Math.cos(k * Math.PI / 2), 0.7)), k * sl)); }
    const sg = new THREE.LatheGeometry(pts, 24); sg.rotateX(-Math.PI / 2);
    spin.add(mesh(sg, o.spinnerMat || K.chrome, 0, 0, 0));
    const R = dia / 2, rh = spR * 0.75, cMax = o.chord || dia * 0.085;
    const P = {
      camber: 0.05,
      pf: e => {
        let c = cMax * (0.5 + 1.8 * e - 1.65 * e * e);
        if (e > 0.82) c *= Math.sqrt(Math.max(0.02, 1 - Math.pow((e - 0.82) / 0.18, 2)));
        return { a: rh + e * (R - rh), c, le: -c * 0.4, off: 0, t: 0.22 - 0.14 * e, rot: (o.pitch || 0.32) + (1 - e) * 0.45 };
      },
    };
    const bg = loftPiece(P, { map: 'blade', ns: 10, n: 6 });
    const bm = K.std(0xffffff, { map: bladeTexture(), roughness: 0.55, metalness: 0.2 });
    for (let i = 0; i < blades; i++) { const b = mesh(bg, bm); b.rotation.z = i * TAU / blades; bladesG.add(b); }
    const disc = mesh(new THREE.CircleGeometry(R, 48), new THREE.MeshBasicMaterial({ map: discTexture(), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    disc.renderOrder = 2; disc.visible = false;
    root.add(disc);
    root.userData = { spinner: spin, blades: bladesG, disc };
    return root;
  }
  function wheel(K, r, w, hubMat) {
    const g = new THREE.Group();
    const tg = new THREE.TorusGeometry(r - w * 0.5, w * 0.5, 10, 28); tg.scale(1, 1, 0.82); tg.rotateY(Math.PI / 2);
    g.add(mesh(tg, K.tire));
    const hg = new THREE.CylinderGeometry(r - w * 0.78, r - w * 0.78, w * 0.7, 18); hg.rotateZ(Math.PI / 2);
    g.add(mesh(hg, hubMat || K.chrome));
    const cg = new THREE.CylinderGeometry(r * 0.16, r * 0.16, w * 0.8, 10); cg.rotateZ(Math.PI / 2);
    g.add(mesh(cg, K.steel));
    return g;
  }
  // a wheel fairing ("spat") around the top of a fixed-gear wheel
  function spat(K, r, mat, w) {
    // teardrop: round at the front, tapering to a point at the back; the bottom of the tyre shows below it
    const pts = [];
    for (let i = 0; i <= 16; i++) { const t = i / 16; pts.push(new THREE.Vector2(Math.max(0.002, Math.sin(Math.PI * Math.pow(t, 0.75)) * (1 - 0.55 * t)), (t - 0.38) * 2)); }
    const sg = new THREE.LatheGeometry(pts, 20); sg.rotateX(Math.PI / 2);
    sg.scale(Math.max(w * 0.85, r * 0.42), r * 0.9, r * 1.45);
    return mesh(sg, mat, 0, r * 0.14, r * 0.1);
  }
  function pilot(K, helmet, suit) {
    const g = new THREE.Group();
    const sm = K.std(suit || 0x405060, { roughness: 0.9, envMapIntensity: 0.3 });
    const tor = mesh(new THREE.CapsuleGeometry(0.17, 0.32, 4, 10), sm, 0, -0.38, 0.05); tor.scale.set(1.15, 1, 0.8); g.add(tor);
    g.add(mesh(new THREE.SphereGeometry(0.105, 14, 10), K.std(0xd6a07c, { roughness: 0.8 }), 0, 0, 0));
    if (helmet) {
      g.add(mesh(new THREE.SphereGeometry(0.13, 16, 10, 0, TAU, 0, Math.PI * 0.62), K.gloss(helmet), 0, 0.015, 0.01));
      const v = mesh(new THREE.SphereGeometry(0.133, 16, 8, Math.PI * 0.62, Math.PI * 0.76, Math.PI * 0.3, Math.PI * 0.3), K.std(0x1a1305, { roughness: 0.1, metalness: 0.8 }), 0, 0.015, 0.01);
      g.add(v);
    } else {
      g.add(mesh(new THREE.SphereGeometry(0.11, 14, 8, 0, TAU, 0, Math.PI * 0.5), K.std(0x3a2a1e, { roughness: 0.95 }), 0, 0.012, 0.012));
      const hs = mesh(new THREE.TorusGeometry(0.118, 0.014, 6, 16, Math.PI), K.dark, 0, 0.01, 0); hs.rotation.y = Math.PI / 2; g.add(hs);
      [-1, 1].forEach(s => { const cup = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.04, 10), K.dark, s * 0.11, -0.01, 0); cup.rotation.z = Math.PI / 2; g.add(cup); });
    }
    return g;
  }
  function flame(r, len, diamonds) {
    const g = new THREE.ConeGeometry(r, len, 14, 1, true); g.translate(0, len / 2, 0); g.rotateX(Math.PI / 2);
    // wide end at z=0 (nozzle), tip at z=+len (pointing backwards)
    const add = c => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const grp = new THREE.Group();
    grp.add(mesh(g, add(0xff9a3a)));
    const inner = mesh(g.clone().scale(0.55, 0.55, 0.7), add(0xbfe6ff)); grp.add(inner);
    if (diamonds) for (let i = 0; i < 3; i++) {
      const d = mesh(new THREE.SphereGeometry(r * 0.42, 10, 8), add(0xffe0a0), 0, 0, len * (0.18 + i * 0.2));
      d.scale.set(1, 1, 1.8); d.material.opacity = 0.55 - i * 0.12; grp.add(d);
    }
    return grp;
  }
  function nozzle(K, r, len) {
    const g = new THREE.Group();
    const og = new THREE.CylinderGeometry(r, r * 1.08, len, 24, 1, true); og.rotateX(Math.PI / 2);
    g.add(mesh(og, K.metal(0x6d7178, { roughness: 0.45, side: THREE.DoubleSide })));
    const ig = new THREE.CylinderGeometry(r * 0.94, r * 0.94, len * 0.95, 24, 1, true); ig.rotateX(Math.PI / 2);
    g.add(mesh(ig, K.std(0x14161a, { side: THREE.BackSide, roughness: 0.8 })));
    const back = mesh(new THREE.CircleGeometry(r * 0.94, 24), K.std(0x0b0b0d, { emissive: 0x401800, emissiveIntensity: 0.6 }), 0, 0, -len * 0.3);
    g.add(back);
    return g;
  }
  // a bubble canopy: tinted glass shell + frame
  function canopy(K, w, h, l, tint, frameMat) {
    const g = new THREE.Group();
    const geo = new THREE.SphereGeometry(1, 28, 14, 0, TAU, 0, Math.PI / 2); geo.scale(w / 2, h, l / 2);
    const gl = mesh(geo, K.glass(tint)); gl.renderOrder = 3; g.add(gl);
    if (frameMat) {
      const rim = new THREE.TorusGeometry(1, 0.035 / Math.max(w, l) * 2, 6, 40); rim.rotateX(Math.PI / 2); rim.scale(w / 2, 1, l / 2);
      g.add(mesh(rim, frameMat));
    }
    return g;
  }
  function antenna(K, h, sweep, mat) {
    const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(h * 0.55, 0); s.lineTo(h * 0.25 + sweep, h); s.lineTo(sweep, h); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: false }); g.translate(0, 0, -0.01); g.rotateY(-Math.PI / 2);
    return mesh(g, mat || K.dark);
  }
  // a fixed-gear wheel assembly
  function fixedWheel(K, x, y, z, r, w, spatMat) {
    const g = new THREE.Group(); g.position.set(x, y, z);
    g.add(wheel(K, r, w));
    if (spatMat) g.add(spat(K, r, spatMat, w));
    return g;
  }
  // a retractable gear leg hanging from (x, y, z); returns { pivot, axis, angle }
  function gearLeg(K, x, y, z, wheelY, r, w, axis, angle, o = {}) {
    const pivot = new THREE.Group(); pivot.position.set(x, y, z);
    const len = y - wheelY;
    pivot.add(strut(0, 0, 0, 0, -len + r * 0.3, 0, o.strutR || 0.07, K.steel));
    pivot.add(strut(0, -len * 0.25, 0, 0, -len * 0.55, 0, (o.strutR || 0.07) * 1.45, K.chrome));
    const wx = o.twin ? [-w * 0.65, w * 0.65] : [o.offset || 0];
    wx.forEach(dx => { const wh = wheel(K, r, w); wh.position.set(dx, -len, 0); pivot.add(wh); });
    if (o.twin || o.offset) pivot.add(strut(Math.min(...wx), -len, 0, Math.max(...wx, 0), -len, 0, 0.04, K.steel));
    if (o.door) { const d = mesh(new THREE.BoxGeometry(0.03, len * 0.75, r * 2.1), o.door, (o.doorSide || 1) * (w * 0.7 + 0.05), -len * 0.42, 0); pivot.add(d); }
    return { pivot, axis: new THREE.Vector3(...axis).normalize(), angle };
  }
  function setLights(g, l) { g.userData.lights = l; }

  // ======================= the six aircraft =======================

  // ---- Sparrow: high-wing two-seat trainer with fixed tricycle gear ----
  function buildSparrow(paint) {
    const K = new Kit(paint), g = new THREE.Group(), surfaces = [];
    const B = makeBody({ L: 7.4, R: 0.6, squash: 1.12, box: 2.6, nose: 0.84, tail: 0.09, body: 0.45, up: 0.5, droop: 0.06, blunt: 0.42, z: 0.05 });
    const bodyMat = K.gloss(0xffffff);
    g.add(mesh(B.geo, bodyMat));
    bodyLivery(K, B, bodyMat, (A, p) => {
      const acc = contrast(p), cl = z => U.lerp(-0.18, 0.3, U.smoothstep(-2.6, 3.8, z));
      A.fill(WHITE);
      A.top(-4, 4, z => cl(z) + 0.05, p);
      A.bands(-2.6, 4, z => cl(z) - 0.03, z => cl(z) - 0.13, p);
      A.bands(-2.6, 4, z => cl(z) + 0.05, z => cl(z) - 0.01, lum(p) > 0.72 ? NAVY : mix(p, 0x000000, 0.45));
      A.ring(-4, -2.5, p);
      A.top(-1.95, 1.05, 0.55, INTERIOR);
      A.both(-3.48, -0.05, c => { c.fillStyle = css(0x111317); roundRect(c, -14, -6, 28, 12, 6); c.fill(); });
      A.line(-2.5); A.line(1.05); A.line(2.4, 0x000000, 0.15);
      A.both(-0.9, -0.25, c => { c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 2; roundRect(c, -52, -14, 104, 42, 8); c.stroke(); });
      A.text(2.15, -0.14, 'C-FLYH', 0.34, INK, acc === NAVY ? WHITE : WHITE);
      A.soot(1, -2.2, -0.9, -0.62, 0.22);
      A.text(-3.05, 0.25, 'FlyHigh', 0.16, acc, null, 'italic 800');
    });
    // cabin greenhouse with door frames and an interior
    const cs = new THREE.Shape();
    [[-1.95, 0.55], [-1.12, 1.13], [0.62, 1.13], [1.05, 0.64], [1.05, 0.28], [-1.95, 0.28]].forEach(([z, y], i) => i ? cs.lineTo(-z, y) : cs.moveTo(-z, y));
    const cg = new THREE.ExtrudeGeometry(cs, { depth: 1.04, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2 });
    cg.rotateY(Math.PI / 2); cg.translate(-0.52, 0, 0);
    const cab = mesh(cg, K.glass(0x0d1822, { opacity: 0.45 })); cab.renderOrder = 3; g.add(cab);
    const ci = cg.clone(); ci.scale(0.96, 0.98, 0.98); g.add(mesh(ci, K.inner));
    const frame = K.paintMat();
    [-1, 1].forEach(s => {
      const x = s * 0.545;
      g.add(strut(x, 0.55, -1.95, x, 1.13, -1.12, 0.035, frame));
      g.add(strut(x, 0.42, -0.32, x, 1.13, -0.32, 0.03, frame));
      g.add(strut(x, 1.13, -1.12, x, 1.13, 0.62, 0.03, frame));
      g.add(strut(x, 1.13, 0.62, x, 0.6, 1.05, 0.035, frame));
    });
    g.add(strut(0, 0.55, -1.95, 0, 1.13, -1.12, 0.02, K.dark));
    const pl = pilot(K, null, 0x3d5a80); pl.position.set(-0.25, 0.86, -0.55); g.add(pl);
    g.add(mesh(new THREE.BoxGeometry(1.0, 0.18, 0.12), K.std(0x1c1f24), 0, 0.62, -1.5)); // instrument panel coaming
    // wing (high) with struts
    const WP = { span: 11, root: 1.6, tip: 1.3, sweep: -0.15, t: 0.13, dih: 1.5, camber: 0.02, mirror: true };
    const wingMat = K.gloss(0xffffff);
    const wing = surface(K, WP, wingMat, [{ e0: 0.55, e1: 0.95, c0: 0.74, kind: 'ail', max: 0.3 }], { round: 0.06 });
    wing.group.position.set(0, 1.2, -0.55); g.add(wing.group); surfaces.push(...wing.surfaces);
    surfLivery(K, wingMat, spanM(WP), chordFn(WP), 'wing', (A, p) => {
      A.fill(WHITE);
      A.rect(0, 0.055, 0, 1, p); A.rect(0.945, 1, 0, 1, p);
      A.rect(0.062, 0.072, 0, 1, p); A.rect(0.928, 0.938, 0, 1, p);
      A.panel(0.225, 0.46, 0.74, 0.995); A.panel(0.54, 0.775, 0.74, 0.995);
      [0.33, 0.67].forEach(s => A.at(s, 0.3, true, c => { c.fillStyle = '#9aa0a6'; c.beginPath(); c.arc(0, 0, 6, 0, TAU); c.fill(); }));
      A.rect(0.33, 0.345, 0, 0.03, 0xe9eef2, 'both');
      A.at(0.25, 0.45, false, c => text(c, 'C-FLYH', 62, INK));
    });
    [-1, 1].forEach(s => g.add(strut(s * 0.5, -0.3, -0.5, s * 2.9, 1.2, -0.5, 0.04, frame)));
    // tail
    const TP = { span: 3.5, root: 0.95, tip: 0.7, sweep: 0.12, t: 0.1, mirror: true };
    const tailMat = K.gloss(0xffffff);
    const tail = surface(K, TP, tailMat, [{ e0: 0.1, e1: 1, c0: 0.6, kind: 'elev', max: 0.35 }], { round: 0.03 });
    tail.group.position.set(0, 0.25, 3.18); g.add(tail.group); surfaces.push(...tail.surfaces);
    surfLivery(K, tailMat, spanM(TP), chordFn(TP), 'wing', (A, p) => { A.fill(WHITE); A.rect(0, 0.07, 0, 1, p); A.rect(0.93, 1, 0, 1, p); }, 512, 128);
    const FP = { span: 1.5, root: 1.3, tip: 0.75, sweep: 0.5, t: 0.1 };
    const finMat = K.gloss(0xffffff);
    const fin = surface(K, FP, finMat, [{ e0: 0.06, e1: 1, c0: 0.62, kind: 'rud', max: 0.4 }], { round: 0.03 });
    fin.group.position.set(0, 0.3, 3.2); g.add(fin.group); surfaces.push(...fin.surfaces);
    surfLivery(K, finMat, spanM(FP), chordFn(FP), 'fin', (A, p) => {
      A.fill(p);
      A.poly([[0.3, 0], [0.42, 0], [0.62, 1], [0.5, 1]], WHITE); A.poly([[0.46, 0], [0.5, 0], [0.7, 1], [0.66, 1]], contrast(p) === NAVY ? NAVY : WHITE);
      A.at(0.8, 0.35, true, c => flag(c, 34)); A.at(0.8, 0.35, false, c => flag(c, 34));
    }, 512, 256);
    const dorsal = new THREE.Shape(); dorsal.moveTo(-1.7, 0.3); dorsal.lineTo(-2.65, 0.3); dorsal.lineTo(-2.65, 0.68); dorsal.closePath();
    const dg = new THREE.ExtrudeGeometry(dorsal, { depth: 0.08, bevelEnabled: false }); dg.rotateY(Math.PI / 2); dg.translate(-0.04, 0, 0);
    g.add(mesh(dg, K.paintMat()));
    // fixed tricycle gear with wheel fairings
    const spatMat = K.paintMat();
    [-1, 1].forEach(s => {
      g.add(strut(s * 0.38, -0.55, 0.15, s * 1.12, -1.08, 0.15, 0.045, K.std(0xe8e8e8, { metalness: 0.3 })));
      g.add(fixedWheel(K, s * 1.2, -1.08, 0.15, 0.32, 0.17, spatMat));
    });
    g.add(strut(0, -0.42, -2.85, 0, -1.14, -2.85, 0.05, K.steel));
    g.add(fixedWheel(K, 0, -1.14, -2.85, 0.26, 0.14, spatMat));
    // details
    const prop = propeller(K, 2, 1.9, 0.24, { spinnerMat: K.paintMat() }); prop.position.z = -3.64; g.add(prop);
    const ex = strut(0.22, -0.48, -2.7, 0.24, -0.72, -2.45, 0.045, K.steel); g.add(ex);
    const ant = antenna(K, 0.35, 0.18); ant.position.set(0, B.topAt(1.6) - 0.02, 1.6); g.add(ant);
    const ant2 = antenna(K, 0.2, 0.1); ant2.position.set(0, -B.botAt(0) * -1 - 0.15, 0.4); ant2.rotation.z = Math.PI; g.add(ant2);
    g.add(strut(-3.2, 1.09, -1.0, -3.2, 1.09, -1.55, 0.015, K.steel));
    const tipY = 1.2 + 5.5 * Math.tan(1.5 * D2R);
    g.add(mesh(new THREE.SphereGeometry(0.05, 8, 6), K.lens(0xff2020), -5.52, tipY, -1.25));
    g.add(mesh(new THREE.SphereGeometry(0.05, 8, 6), K.lens(0x20ff40), 5.52, tipY, -1.25));
    g.add(mesh(new THREE.SphereGeometry(0.05, 8, 6), K.lens(0xff2010), 0, 1.82, 3.62));
    setLights(g, { l: [-5.6, tipY, -1.25], r: [5.6, tipY, -1.25], tail: [0, B.cyAt(3.7), 3.85], beacons: [[0, 1.86, 3.62], [0, B.botAt(0.4) - 0.05, 0.4]] });
    return finish(K, g, [prop], [], surfaces, null);
  }

  // ---- Bluebird: low-wing two-seat sport plane with a bubble canopy ----
  function buildBluebird(paint) {
    const K = new Kit(paint), g = new THREE.Group(), surfaces = [];
    const B = makeBody({ L: 7.6, R: 0.6, squash: 1.12, box: 2.3, nose: 0.8, tail: 0.09, body: 0.47, up: 0.45, droop: 0.04, blunt: 0.42, z: 0.0 });
    const bodyMat = K.gloss(0xffffff);
    g.add(mesh(B.geo, bodyMat));
    bodyLivery(K, B, bodyMat, (A, p) => {
      const acc = contrast(p), dk = mix(p, 0x000000, 0.4);
      A.fill(p);
      A.belly(-3.8, 3.9, z => U.lerp(-0.55, -0.1, U.smoothstep(-3.5, 3.8, z)), WHITE);
      // speed swooshes
      A.bands(-3.2, 3.9, z => U.lerp(0.05, 0.62, U.smoothstep(-3.2, 3.9, z)), z => U.lerp(-0.08, 0.5, U.smoothstep(-3.2, 3.9, z)), acc);
      A.bands(-2.6, 3.9, z => U.lerp(-0.14, 0.42, U.smoothstep(-2.6, 3.9, z)), z => U.lerp(-0.22, 0.34, U.smoothstep(-2.6, 3.9, z)), dk);
      A.top(-1.35, 0.45, 0.62, INTERIOR);
      A.top(-2.55, -1.3, 0.75, 0x22252b);
      A.line(-2.55); A.line(2.2, 0x000000, 0.15);
      A.text(2.0, -0.42, 'C-GBLU', 0.3, INK, WHITE);
      A.flag(2.0, 0.42, 0.34);
      A.soot(-1, -2.3, -1.0, -0.55, 0.2); A.soot(1, -2.3, -1.0, -0.55, 0.2);
    });
    const cnp = canopy(K, 1.04, 0.56, 2.25, 0x0c1a28, K.std(0x30343b)); cnp.position.set(0, B.topAt(-0.45) - 0.08, -0.45); g.add(cnp);
    [-0.24, 0.24].forEach((x, i) => { const pl = pilot(K, null, i ? 0x6a4c93 : 0x3d5a80); pl.position.set(x, 0.86, -0.45); g.add(pl); });
    g.add(mesh(new THREE.BoxGeometry(0.95, 0.12, 0.1), K.std(0x1c1f24), 0, 0.62, -1.42));
    const WP = { span: 8.4, root: 1.6, tip: 1.0, sweep: 0.18, t: 0.14, dih: 4.5, camber: 0.015, mirror: true };
    const wingMat = K.gloss(0xffffff);
    const wing = surface(K, WP, wingMat, [{ e0: 0.5, e1: 0.94, c0: 0.74, kind: 'ail', max: 0.35 }], { round: 0.05 });
    wing.group.position.set(0, -0.36, -0.35); g.add(wing.group); surfaces.push(...wing.surfaces);
    surfLivery(K, wingMat, spanM(WP), chordFn(WP), 'wing', (A, p) => {
      const acc = contrast(p);
      A.fill(p);
      A.poly([[0.02, 0], [0.12, 0], [0.24, 1], [0.14, 1]], acc, 'top'); A.poly([[0.98, 0], [0.88, 0], [0.76, 1], [0.86, 1]], acc, 'top');
      A.rect(0, 0.04, 0, 1, mix(p, 0, 0.4)); A.rect(0.96, 1, 0, 1, mix(p, 0, 0.4));
      A.rect(0, 1, 0, 1, WHITE, 'bot');
      A.rect(0, 0.06, 0, 1, p, 'bot'); A.rect(0.94, 1, 0, 1, p, 'bot');
      A.panel(0.26, 0.46, 0.74, 0.995); A.panel(0.54, 0.74, 0.74, 0.995);
      A.rect(0.445, 0.475, 0.1, 0.55, 0x22252b, 'top', 0.85); // walkway
    });
    const TP = { span: 3.0, root: 0.9, tip: 0.55, sweep: 0.2, t: 0.1, mirror: true };
    const tailMat = K.gloss(0xffffff);
    const tail = surface(K, TP, tailMat, [{ e0: 0.12, e1: 1, c0: 0.58, kind: 'elev', max: 0.4 }], { round: 0.03 });
    tail.group.position.set(0, 0.22, 3.25); g.add(tail.group); surfaces.push(...tail.surfaces);
    surfLivery(K, tailMat, spanM(TP), chordFn(TP), 'wing', (A, p) => { A.fill(p); A.rect(0, 0.1, 0, 1, contrast(p)); A.rect(0.9, 1, 0, 1, contrast(p)); }, 512, 128);
    const FP = { span: 1.3, root: 1.3, tip: 0.55, sweep: 0.62, t: 0.1 };
    const finMat = K.gloss(0xffffff);
    const fin = surface(K, FP, finMat, [{ e0: 0.08, e1: 1, c0: 0.6, kind: 'rud', max: 0.45 }], { round: 0.03 });
    fin.group.position.set(0, 0.28, 3.15); g.add(fin.group); surfaces.push(...fin.surfaces);
    surfLivery(K, finMat, spanM(FP), chordFn(FP), 'fin', (A, p) => {
      A.fill(p); const acc = contrast(p);
      A.poly([[0, 0.7], [1, 0.74], [1, 0.86], [0, 0.82]], acc);
      A.at(0.42, 0.36, true, c => text(c, 'FlyHigh', 15, acc, null, 'italic 800')); A.at(0.42, 0.36, false, c => text(c, 'FlyHigh', 15, acc, null, 'italic 800'));
    }, 512, 256);
    const spatMat = K.paintMat();
    [-1, 1].forEach(s => {
      g.add(strut(s * 0.9, -0.4, -0.25, s * 1.35, -0.98, -0.25, 0.045, K.std(0xe8e8e8, { metalness: 0.3 })));
      g.add(fixedWheel(K, s * 1.4, -0.98, -0.25, 0.32, 0.17, spatMat));
    });
    g.add(strut(0, -0.38, -2.7, 0, -1.04, -2.7, 0.05, K.steel));
    g.add(fixedWheel(K, 0, -1.04, -2.7, 0.26, 0.14, spatMat));
    const prop = propeller(K, 3, 1.85, 0.25, { spinnerMat: K.paintMat() }); prop.position.z = -3.8; g.add(prop);
    const ant = antenna(K, 0.3, 0.15); ant.position.set(0, B.topAt(1.5) - 0.02, 1.5); g.add(ant);
    const tip = 4.2 * Math.tan(4.5 * D2R) - 0.36;
    g.add(mesh(new THREE.SphereGeometry(0.05, 8, 6), K.lens(0xff2020), -4.22, tip, -0.6));
    g.add(mesh(new THREE.SphereGeometry(0.05, 8, 6), K.lens(0x20ff40), 4.22, tip, -0.6));
    setLights(g, { l: [-4.3, tip, -0.6], r: [4.3, tip, -0.6], tail: [0, B.cyAt(3.75), 3.85], beacons: [[0, 1.6, 3.62], [0, B.botAt(0) - 0.05, 0]] });
    return finish(K, g, [prop], [], surfaces, null);
  }

  // ---- Pelican: high-wing twin turboprop utility / cargo plane ----
  function buildPelican(paint) {
    const K = new Kit(paint), g = new THREE.Group(), surfaces = [];
    const B = makeBody({ L: 12.2, R: 1.0, squash: 1.12, box: 3.2, nose: 0.86, tail: 0.13, body: 0.42, up: 0.62, droop: 0.12, pointy: 0.25, z: 0.2 });
    const bodyMat = K.gloss(0xffffff);
    g.add(mesh(B.geo, bodyMat));
    const winZ = [-3.15, -2.25, -1.35, -0.45, 0.45, 1.35];
    bodyLivery(K, B, bodyMat, (A, p) => {
      const acc = contrast(p);
      A.fill(WHITE);
      A.belly(-6.2, 6.4, z => U.lerp(-0.05, 0.25, U.smoothstep(2.0, 6.3, z)), p);
      A.bands(-6.2, 6.4, z => U.lerp(0.06, 0.38, U.smoothstep(2.0, 6.3, z)), z => U.lerp(-0.02, 0.3, U.smoothstep(2.0, 6.3, z)), lum(p) > 0.72 ? NAVY : mix(p, 0, 0.35));
      A.top(-5.25, -4.6, 0.52, 0x16202b);
      A.both(-4.92, 0.62, c => { c.fillStyle = css(0x9aa3ad); c.fillRect(-2, -30, 4, 60); });
      A.both(-4.85, 0.35, c => { c.fillStyle = css(0x16202b); c.beginPath(); c.moveTo(-50, -26); c.lineTo(40, -26); c.lineTo(52, 20); c.lineTo(-62, 20); c.closePath(); c.fill(); });
      A.windows(winZ, 0.32, 0.42, 0.46);
      A.both(2.75, 0.02, c => { c.strokeStyle = 'rgba(0,0,0,0.4)'; c.lineWidth = 3; roundRect(c, -60, -70, 120, 140, 10); c.stroke(); });
      A.text(-1.3, -0.45, 'FLYHIGH AIR CARGO', 0.32, acc === NAVY ? NAVY : WHITE, null, '800');
      A.text(3.5, 0.12, 'C-FPLC', 0.5, INK, WHITE);
      A.line(-4.3); A.line(-3.7, 0, 0.12); A.line(4.0, 0, 0.12);
    });
    // high wing on a short pylon
    const WP = { span: 17, root: 2.0, tip: 1.6, sweep: -0.2, t: 0.13, dih: 1.5, camber: 0.02, mirror: true };
    const wingMat = K.gloss(0xffffff);
    const wing = surface(K, WP, wingMat, [{ e0: 0.56, e1: 0.95, c0: 0.74, kind: 'ail', max: 0.3 }], { round: 0.07 });
    wing.group.position.set(0, 1.28, -0.9); g.add(wing.group); surfaces.push(...wing.surfaces);
    surfLivery(K, wingMat, spanM(WP), chordFn(WP), 'wing', (A, p) => {
      A.fill(WHITE); A.rect(0, 0.04, 0, 1, p); A.rect(0.96, 1, 0, 1, p);
      A.panel(0.22, 0.45, 0.74, 0.995); A.panel(0.55, 0.78, 0.74, 0.995);
      A.rect(0, 1, 0, 0.035, 0x55595f, 'both', 0.6); // de-icing boots
      A.at(0.25, 0.45, false, c => text(c, 'C-FPLC', 120, INK));
    });
    g.add(mesh(new THREE.BoxGeometry(1.4, 0.3, 2.1), K.gloss(WHITE), 0, 1.12, -0.9));
    // engines in nacelles under the wing
    const props = [];
    [-1, 1].forEach(s => {
      const N = makeBody({ L: 4.0, R: 0.4, squash: 1.25, nose: 0.8, tail: 0.25, body: 0.35, blunt: 0.45, up: 0.3, z: -1.25 });
      const nm = K.paintMat(); const nac = mesh(N.geo, nm, s * 3.15, 1.0, 0); g.add(nac);
      const pr = propeller(K, 3, 2.6, 0.24, { spinnerMat: K.chrome, chord: 0.24 }); pr.position.set(s * 3.15, 1.0, -3.25); g.add(pr); props.push(pr);
      g.add(strut(s * 3.15 + s * 0.38, 0.86, -1.6, s * 3.15 + s * 0.6, 0.86, -1.1, 0.08, K.dark));
      g.add(mesh(new THREE.TorusGeometry(0.16, 0.05, 6, 12), K.dark, s * 3.15, 0.62, -2.85)).rotation.y = 0;
      g.add(strut(s * 1.0, -0.55, -0.6, s * 4.6, 1.2, -0.75, 0.06, K.gloss(WHITE)));
    });
    // tail
    const TP = { span: 6.2, root: 1.45, tip: 1.0, sweep: 0.1, t: 0.11, mirror: true, dih: 2 };
    const tailMat = K.gloss(0xffffff);
    const tail = surface(K, TP, tailMat, [{ e0: 0.08, e1: 1, c0: 0.6, kind: 'elev', max: 0.3 }], { round: 0.04 });
    tail.group.position.set(0, 1.25, 5.6); g.add(tail.group); surfaces.push(...tail.surfaces);
    surfLivery(K, tailMat, spanM(TP), chordFn(TP), 'wing', (A, p) => { A.fill(WHITE); A.rect(0, 0.05, 0, 1, p); A.rect(0.95, 1, 0, 1, p); }, 512, 128);
    const FP = { span: 2.7, root: 2.3, tip: 1.2, sweep: 0.75, t: 0.11 };
    const finMat = K.gloss(0xffffff);
    const fin = surface(K, FP, finMat, [{ e0: 0.05, e1: 1, c0: 0.6, kind: 'rud', max: 0.35 }], { round: 0.04 });
    fin.group.position.set(0, 0.8, 5.35); g.add(fin.group); surfaces.push(...fin.surfaces);
    surfLivery(K, finMat, spanM(FP), chordFn(FP), 'fin', (A, p) => {
      A.fill(p); const acc = contrast(p);
      A.rect(0, 0.18, 0, 1, WHITE);
      A.at(0.6, 0.42, true, c => { c.fillStyle = css(acc); c.beginPath(); c.arc(0, 0, 42, 0, TAU); c.fill(); text(c, 'FH', 44, p, null, '900'); });
      A.at(0.6, 0.42, false, c => { c.fillStyle = css(acc); c.beginPath(); c.arc(0, 0, 42, 0, TAU); c.fill(); text(c, 'FH', 44, p, null, '900'); });
      A.at(0.92, 0.35, true, c => flag(c, 50)); A.at(0.92, 0.35, false, c => flag(c, 50));
    }, 512, 256);
    // fixed gear on sponsons, nose gear
    [-1, 1].forEach(s => {
      g.add(mesh(new THREE.BoxGeometry(0.9, 0.35, 1.4), K.paintMat(), s * 1.05, -0.75, -0.6));
      g.add(strut(s * 1.3, -0.8, -0.6, s * 2.1, -1.5, -0.6, 0.08, K.steel));
      g.add(fixedWheel(K, s * 2.2, -1.5, -0.6, 0.45, 0.26, null));
    });
    g.add(strut(0, -0.7, -4.6, 0, -1.63, -4.6, 0.07, K.steel));
    g.add(fixedWheel(K, 0, -1.63, -4.6, 0.32, 0.2, null));
    const ant = antenna(K, 0.4, 0.2); ant.position.set(0, B.topAt(2.2) - 0.02, 2.2); g.add(ant);
    const tipY = 1.28 + 8.5 * Math.tan(1.5 * D2R);
    g.add(mesh(new THREE.SphereGeometry(0.07, 8, 6), K.lens(0xff2020), -8.52, tipY, -1.6));
    g.add(mesh(new THREE.SphereGeometry(0.07, 8, 6), K.lens(0x20ff40), 8.52, tipY, -1.6));
    setLights(g, { l: [-8.6, tipY, -1.6], r: [8.6, tipY, -1.6], tail: [0, B.cyAt(6.2), 6.35], beacons: [[0, 3.55, 6.2], [0, B.botAt(0) - 0.05, 0]] });
    return finish(K, g, props, [], surfaces, null);
  }

  // ---- Kestrel: tandem-seat aerobatic turboprop with retractable gear ----
  function buildKestrel(paint) {
    const K = new Kit(paint), g = new THREE.Group(), surfaces = [];
    const B = makeBody({ L: 9.8, R: 0.72, squash: 1.1, box: 2.3, nose: 0.72, tail: 0.08, body: 0.44, up: 0.42, droop: 0.06, pointy: 0.25, blunt: 0.36, z: 0.0 });
    const bodyMat = K.gloss(0xffffff);
    g.add(mesh(B.geo, bodyMat));
    bodyLivery(K, B, bodyMat, (A, p) => {
      const acc = contrast(p), dk = mix(p, 0, 0.45);
      A.fill(p);
      A.belly(-4.9, 4.9, -0.35, dk);
      A.bands(-4.9, 4.9, z => U.lerp(-0.2, 0.35, U.smoothstep(-4.9, 4.9, z)), z => U.lerp(-0.32, 0.22, U.smoothstep(-4.9, 4.9, z)), acc);
      A.top(-4.9, -2.05, 0.82, 0x1a1c20);
      A.top(-1.95, 1.15, 0.6, INTERIOR);
      A.text(2.7, 0.0, 'C-GKST', 0.36, acc === NAVY ? NAVY : WHITE, INK);
      A.both(-0.4, -0.15, c => { c.fillStyle = css(WHITE); c.beginPath(); c.arc(0, 0, 32, 0, TAU); c.fill(); text(c, '27', 40, INK, null, '900'); });
      A.flag(3.95, 0.35, 0.3);
      A.soot(1, -3.2, -1.4, -0.05, 0.3); A.soot(-1, -3.2, -1.4, -0.05, 0.3);
      A.line(-3.3); A.line(1.4, 0, 0.15);
    });
    const cnp = canopy(K, 1.0, 0.6, 3.2, 0x0c1a28, K.std(0x30343b)); cnp.position.set(0, B.topAt(-0.4) - 0.1, -0.4); g.add(cnp);
    g.add(mesh(new THREE.TorusGeometry(0.47, 0.035, 6, 20, Math.PI), K.std(0x30343b), 0, B.topAt(-0.4) - 0.1, -0.35));
    [[-1.0, 0x2b3a55], [0.3, 0x2b3a55]].forEach(([z, s]) => { const pl = pilot(K, 0xf2f2f2, s); pl.position.set(0, 0.95 + (z < 0 ? 0 : 0.1), z); g.add(pl); });
    const WP = { span: 10.4, root: 2.2, tip: 1.0, sweep: 0.45, t: 0.15, dih: 5, camber: 0.0, mirror: true };
    const wingMat = K.gloss(0xffffff);
    const wing = surface(K, WP, wingMat, [{ e0: 0.5, e1: 0.93, c0: 0.72, kind: 'ail', max: 0.4 }], { round: 0.05 });
    wing.group.position.set(0, -0.42, 0.05); g.add(wing.group); surfaces.push(...wing.surfaces);
    surfLivery(K, wingMat, spanM(WP), chordFn(WP), 'wing', (A, p) => {
      const acc = contrast(p);
      A.fill(p);
      // chevrons on top, sunburst underneath (looks great inverted)
      A.poly([[0.1, 0], [0.2, 0], [0.3, 1], [0.2, 1]], acc, 'top'); A.poly([[0.9, 0], [0.8, 0], [0.7, 1], [0.8, 1]], acc, 'top');
      for (let k = 0; k < 6; k++) { const s0 = 0.05 + k * 0.155; A.poly([[0.5, 1], [s0, 0], [s0 + 0.07, 0]], acc, 'bot'); }
      A.rect(0, 0.035, 0, 1, mix(p, 0, 0.45)); A.rect(0.965, 1, 0, 1, mix(p, 0, 0.45));
      A.panel(0.25, 0.46, 0.72, 0.995); A.panel(0.54, 0.75, 0.72, 0.995);
    });
    const TP = { span: 4.0, root: 1.25, tip: 0.65, sweep: 0.35, t: 0.1, mirror: true };
    const tailMat = K.gloss(0xffffff);
    const tail = surface(K, TP, tailMat, [{ e0: 0.1, e1: 1, c0: 0.6, kind: 'elev', max: 0.45 }], { round: 0.03 });
    tail.group.position.set(0, 0.25, 4.1); g.add(tail.group); surfaces.push(...tail.surfaces);
    surfLivery(K, tailMat, spanM(TP), chordFn(TP), 'wing', (A, p) => { A.fill(p); A.rect(0.05, 0.13, 0, 1, contrast(p)); A.rect(0.87, 0.95, 0, 1, contrast(p)); }, 512, 128);
    const FP = { span: 1.9, root: 1.8, tip: 0.75, sweep: 0.85, t: 0.1 };
    const finMat = K.gloss(0xffffff);
    const fin = surface(K, FP, finMat, [{ e0: 0.08, e1: 1, c0: 0.6, kind: 'rud', max: 0.45 }], { round: 0.03 });
    fin.group.position.set(0, 0.32, 4.0); g.add(fin.group); surfaces.push(...fin.surfaces);
    surfLivery(K, finMat, spanM(FP), chordFn(FP), 'fin', (A, p) => {
      A.fill(p); const acc = contrast(p);
      for (let k = 0; k < 3; k++) A.poly([[0.15 + k * 0.25, 0], [0.25 + k * 0.25, 0], [0.37 + k * 0.25, 1], [0.27 + k * 0.25, 1]], k === 1 ? acc : mix(p, 0, 0.4));
    }, 512, 256);
    const dorsal = new THREE.Shape(); dorsal.moveTo(-2.0, 0.4); dorsal.lineTo(-3.25, 0.4); dorsal.lineTo(-3.25, 0.85); dorsal.closePath();
    const dg = new THREE.ExtrudeGeometry(dorsal, { depth: 0.08, bevelEnabled: false }); dg.rotateY(Math.PI / 2); dg.translate(-0.04, 0, 0);
    g.add(mesh(dg, K.paintMat()));
    // retractable gear: mains fold inward into the wing, nose gear folds back
    const gear = [], door = K.paintMat();
    [-1, 1].forEach(s => gear.push(gearLeg(K, s * 1.65, -0.42 + 1.65 * Math.tan(5 * D2R), 0.15, -1.26, 0.34, 0.2, [0, 0, 1], -s * Math.PI / 2, { door, doorSide: s })));
    gear.push(gearLeg(K, 0, -0.45, -3.25, -1.34, 0.26, 0.15, [1, 0, 0], -Math.PI / 2));
    gear.forEach(l => g.add(l.pivot));
    const prop = propeller(K, 4, 2.5, 0.3, { spinnerMat: K.paintMat(), spinLen: 2.4, chord: 0.2 }); prop.position.z = -4.85; g.add(prop);
    g.add(mesh(new THREE.TorusGeometry(0.2, 0.06, 6, 14), K.dark, 0, -0.52, -4.2));
    [-1, 1].forEach(s => { const ex = strut(s * 0.62, 0.0, -3.35, s * 0.85, -0.1, -3.0, 0.11, K.steel, 10); g.add(ex); });
    const ant = antenna(K, 0.3, 0.15); ant.position.set(0, B.topAt(1.9) - 0.02, 1.9); g.add(ant);
    const tipY = -0.42 + 5.2 * Math.tan(5 * D2R);
    g.add(mesh(new THREE.SphereGeometry(0.06, 8, 6), K.lens(0xff2020), -5.22, tipY, 0.0));
    g.add(mesh(new THREE.SphereGeometry(0.06, 8, 6), K.lens(0x20ff40), 5.22, tipY, 0.0));
    setLights(g, { l: [-5.3, tipY, 0.0], r: [5.3, tipY, 0.0], tail: [0, B.cyAt(4.85), 4.95], beacons: [[0, 2.25, 4.9], [0, B.botAt(0) - 0.05, 0.6]] });
    return finish(K, g, [prop], [], surfaces, gear);
  }

  // ---- Swift: light business jet with a T-tail and rear-mounted engines ----
  function buildSwift(paint) {
    const K = new Kit(paint), g = new THREE.Group(), surfaces = [];
    const B = makeBody({ L: 13.8, R: 0.98, squash: 1.04, box: 2.1, nose: 0.8, tail: 0.15, body: 0.42, up: 0.4, droop: 0.1, pointy: 0.3, z: 0.1 });
    const bodyMat = K.gloss(0xffffff);
    g.add(mesh(B.geo, bodyMat));
    bodyLivery(K, B, bodyMat, (A, p) => {
      const acc = lum(p) > 0.72 ? NAVY : p, dk = lum(p) > 0.72 ? 0x8a93a3 : mix(p, 0, 0.45);
      A.fill(WHITE);
      A.belly(-7, 7, -0.55, 0xd7dbe0);
      A.bands(-6.2, 7, z => U.lerp(0.02, 0.85, U.smoothstep(1.5, 6.9, z)), z => U.lerp(-0.18, 0.62, U.smoothstep(1.5, 6.9, z)), acc);
      A.bands(-6.2, 7, z => U.lerp(-0.24, 0.55, U.smoothstep(1.5, 6.9, z)), z => U.lerp(-0.31, 0.47, U.smoothstep(1.5, 6.9, z)), dk);
      // windscreen and cockpit side windows
      A.top(-5.75, -5.0, 0.42, 0x111a24);
      A.both(-5.05, 0.32, c => { c.fillStyle = css(0x111a24); c.beginPath(); c.moveTo(-34, -18); c.lineTo(30, -18); c.lineTo(38, 18); c.lineTo(-40, 18); c.closePath(); c.fill(); });
      A.windows([-3.6, -2.75, -1.9, -1.05, -0.2, 0.65], 0.3, 0.34, 0.44);
      A.both(-4.2, -0.05, c => { c.strokeStyle = 'rgba(0,0,0,0.38)'; c.lineWidth = 3; roundRect(c, -38, -72, 76, 132, 12); c.stroke(); });
      A.text(-2.0, -0.28, 'FLYHIGH', 0.26, acc, null, 'italic 800');
      A.flag(-4.3, 0.55, 0.28);
      A.line(-4.5, 0, 0.12); A.line(1.6, 0, 0.12);
    });
    const WP = { span: 13.6, root: 3.0, tip: 1.05, sweep: 1.75, t: 0.12, dih: 3.5, camber: 0.015, mirror: true };
    const wingMat = K.gloss(0xffffff);
    const wing = surface(K, WP, wingMat, [{ e0: 0.58, e1: 0.92, c0: 0.72, kind: 'ail', max: 0.3 }], { round: 0.04 });
    wing.group.position.set(0, -0.62, 0.55); g.add(wing.group); surfaces.push(...wing.surfaces);
    surfLivery(K, wingMat, spanM(WP), chordFn(WP), 'wing', (A, p) => {
      A.fill(0xe9ecef); A.rect(0, 1, 0, 0.05, 0xb9c0c8, 'both');
      A.panel(0.22, 0.43, 0.72, 0.995); A.panel(0.57, 0.78, 0.72, 0.995);
      A.rect(0.43, 0.57, 0.15, 0.85, 0xd0d5da, 'bot');
    });
    // winglets
    const WLP = { span: 1.05, root: 0.95, tip: 0.45, sweep: 0.55, t: 0.09 };
    const wlm = K.paintMat();
    [-1, 1].forEach(s => {
      const wl = mesh(loftPiece(WLP, { map: 'fin', round: 0.02 }), wlm);
      wl.position.set(s * 6.78, -0.62 + 6.8 * Math.tan(3.5 * D2R), 0.55 + 1.75 + 0.05); wl.rotation.z = -s * 0.22; g.add(wl);
    });
    // T-tail
    const FP = { span: 2.7, root: 2.7, tip: 1.6, sweep: 1.45, t: 0.1 };
    const finMat = K.gloss(0xffffff);
    const fin = surface(K, FP, finMat, [{ e0: 0.06, e1: 0.88, c0: 0.65, kind: 'rud', max: 0.35 }], { round: 0 });
    fin.group.position.set(0, 0.55, 5.45); g.add(fin.group); surfaces.push(...fin.surfaces);
    surfLivery(K, finMat, spanM(FP), chordFn(FP), 'fin', (A, p) => {
      A.fill(lum(p) > 0.72 ? NAVY : p); const acc = WHITE;
      A.poly([[0, 0.35], [1, 0.1], [1, 0.22], [0, 0.47]], acc);
      A.at(0.55, 0.55, true, c => text(c, 'FH', 52, acc, null, 'italic 900')); A.at(0.55, 0.55, false, c => text(c, 'FH', 52, acc, null, 'italic 900'));
    }, 512, 256);
    const TP = { span: 5.2, root: 1.45, tip: 0.8, sweep: 0.75, t: 0.1, mirror: true, dih: -2 };
    const tailMat = K.gloss(0xffffff);
    const tail = surface(K, TP, tailMat, [{ e0: 0.08, e1: 1, c0: 0.62, kind: 'elev', max: 0.3 }], { round: 0.03 });
    tail.group.position.set(0, 3.2, 5.45 + 1.45 * 0.95); g.add(tail.group); surfaces.push(...tail.surfaces);
    surfLivery(K, tailMat, spanM(TP), chordFn(TP), 'wing', (A, p) => { A.fill(0xe9ecef); A.rect(0, 1, 0, 0.06, lum(p) > 0.72 ? NAVY : p); }, 512, 128);
    // rear engines on pylons
    const flames = [];
    [-1, 1].forEach(s => {
      const N = makeBody({ L: 3.3, R: 0.56, squash: 1, nose: 0.92, tail: 0.6, body: 0.3, blunt: 0.86, z: 0 });
      const nm = K.gloss(0xffffff); const nac = mesh(N.geo, nm, s * 1.72, 0.62, 3.75); g.add(nac);
      bodyLivery(K, N, nm, (A, p) => {
        A.fill(WHITE); A.ring(-1.66, -1.45, 0xc4cad0);
        A.bands(-1.2, 1.7, 0.18, -0.12, lum(p) > 0.72 ? NAVY : p);
        A.text(0.2, 0.03, 'C-FSWF', 0.24, WHITE, null);
      }, 256);
      const lip = new THREE.TorusGeometry(0.5, 0.07, 8, 24); g.add(mesh(lip, K.chrome, s * 1.72, 0.62, 2.12));
      const fan = mesh(new THREE.CircleGeometry(0.48, 24), K.std(0x2a2d33, { metalness: 0.6, roughness: 0.4, side: THREE.DoubleSide }), s * 1.72, 0.62, 2.3); g.add(fan);
      const cone = new THREE.ConeGeometry(0.16, 0.3, 12); cone.rotateX(-Math.PI / 2); g.add(mesh(cone, K.steel, s * 1.72, 0.62, 2.18));
      const nz = nozzle(K, 0.36, 0.5); nz.position.set(s * 1.72, 0.62, 5.5); g.add(nz);
      g.add(mesh(new THREE.BoxGeometry(0.9, 0.18, 1.3), K.gloss(WHITE), s * 1.12, 0.6, 3.8));
      const f = flame(0.32, 2.4); f.position.set(s * 1.72, 0.62, 5.62); g.add(f); flames.push(f);
    });
    // retractable gear
    const gear = [];
    [-1, 1].forEach(s => gear.push(gearLeg(K, s * 1.85, -0.62 + 1.85 * Math.tan(3.5 * D2R), 0.95, -1.37, 0.38, 0.24, [0, 0, 1], -s * Math.PI / 2, { strutR: 0.08 })));
    gear.push(gearLeg(K, 0, -0.75, -4.8, -1.45, 0.3, 0.18, [1, 0, 0], Math.PI / 2, { twin: true, strutR: 0.07 }));
    gear.forEach(l => g.add(l.pivot));
    const ant = antenna(K, 0.32, 0.18); ant.position.set(0, B.topAt(-1.5) - 0.02, -1.5); g.add(ant);
    g.add(strut(-0.55, 0.1, -5.8, -0.55, 0.1, -6.25, 0.018, K.chrome));
    const tipY = -0.62 + 6.8 * Math.tan(3.5 * D2R) + 0.95;
    g.add(mesh(new THREE.SphereGeometry(0.06, 8, 6), K.lens(0xff2020), -6.98, tipY, 2.55));
    g.add(mesh(new THREE.SphereGeometry(0.06, 8, 6), K.lens(0x20ff40), 6.98, tipY, 2.55));
    setLights(g, { l: [-7.05, tipY, 2.6], r: [7.05, tipY, 2.6], tail: [0, B.cyAt(6.9) + 0.1, 7.05], beacons: [[0, 3.42, 7.3], [0, B.botAt(0) - 0.05, 0]] });
    return finish(K, g, [], flames, surfaces, gear);
  }

  // ---- Thunderbird: twin-engine, twin-tail display-team fast jet ----
  function buildThunder(paint) {
    const K = new Kit(paint), g = new THREE.Group(), surfaces = [];
    const B = makeBody({ L: 15.4, R: 0.92, squash: 0.9, wide: 1.12, box: 2.4, nose: 0.6, tail: 0.62, body: 0.22, pointy: 0.8, droop: 0.15, z: 0.0 });
    const bodyMat = K.gloss(0xffffff, { metalness: 0.15 });
    g.add(mesh(B.geo, bodyMat));
    bodyLivery(K, B, bodyMat, (A, p) => {
      const acc = contrast(p), dk = mix(p, 0, 0.5);
      A.fill(p);
      A.belly(-8, 8, -0.2, dk);
      // lightning flash along the sides
      A.bands(-6.5, 7.7, z => 0.12 + 0.18 * Math.sin((z + 6.5) * 0.9) * (z < 2 ? 1 : 0.2), z => 0.0 + 0.18 * Math.sin((z + 6.5) * 0.9) * (z < 2 ? 1 : 0.2), acc);
      A.top(-6.6, -3.0, 0.78, 0x15171b);
      A.top(-7.7, -6.0, 0.5, mix(p, 0x000000, 0.25));
      A.ring(-7.7, -7.25, 0x3a3e45);
      A.both(-5.4, -0.05, c => text(c, '07', 72, acc === NAVY ? NAVY : WHITE, INK, '900'));
      A.both(1.6, -0.08, c => text(c, 'FLYHIGH', 34, acc === NAVY ? NAVY : WHITE, null, 'italic 900'));
      A.line(-2.5, 0, 0.15); A.line(4.0, 0, 0.15); A.line(6.0, 0, 0.15);
    });
    // canopy (gold tint) with pilot and ejection seat
    const cnp = canopy(K, 0.98, 0.58, 3.0, 0x2a1a02, K.std(0x24272c)); cnp.position.set(0, B.topAt(-3.9) - 0.12, -3.9); g.add(cnp);
    const pl = pilot(K, 0xf3f3f3, 0x4d5a3b); pl.position.set(0, 0.68, -3.75); g.add(pl);
    g.add(mesh(new THREE.BoxGeometry(0.55, 0.9, 0.2), K.std(0x2a2e33), 0, 0.45, -3.35));
    // intakes + LERX
    [-1, 1].forEach(s => {
      const ib = makeBody({ L: 4.6, R: 0.46, squash: 1.2, box: 3.4, nose: 0.97, tail: 0.85, body: 0.2, blunt: 0.95, z: 0 });
      const im = K.paintMat({}, 0.3);
      g.add(mesh(ib.geo, im, s * 1.12, -0.28, -0.2));
      const mouth = mesh(new THREE.PlaneGeometry(0.72, 0.9), K.std(0x0b0c0e, { side: THREE.DoubleSide }), s * 1.12, -0.28, -2.52); mouth.rotation.y = Math.PI; g.add(mouth);
      const lx = new THREE.Shape(); lx.moveTo(0, -5.2); lx.lineTo(0.95, -1.0); lx.lineTo(0, -0.6); lx.closePath();
      const lg = new THREE.ExtrudeGeometry(lx, { depth: 0.08, bevelEnabled: false }); lg.rotateX(Math.PI / 2); lg.scale(s, 1, 1);
      g.add(mesh(lg, K.paintMat(), s * 0.8, 0.12, 0));
    });
    // wing with ailerons
    const WP = { span: 11.4, root: 4.6, tip: 1.5, sweep: 2.5, t: 0.05, dih: -2, mirror: true };
    const wingMat = K.gloss(0xffffff, { metalness: 0.15 });
    const wing = surface(K, WP, wingMat, [{ e0: 0.55, e1: 0.96, c0: 0.74, kind: 'ail', max: 0.35 }], { round: 0.02 });
    wing.group.position.set(0, -0.12, 1.3); g.add(wing.group); surfaces.push(...wing.surfaces);
    surfLivery(K, wingMat, spanM(WP), chordFn(WP), 'wing', (A, p) => {
      const acc = contrast(p);
      A.fill(p);
      A.poly([[0.5, 0.05], [0.02, 0.85], [0.02, 0.97], [0.5, 0.25], [0.98, 0.97], [0.98, 0.85]], acc, 'top');
      A.rect(0, 1, 0, 1, mix(p, 0, 0.5), 'bot');
      const roundel = c => { c.fillStyle = css(WHITE); c.beginPath(); c.arc(0, 0, 70, 0, TAU); c.fill(); c.fillStyle = css(NAVY); c.beginPath(); c.arc(0, 0, 58, 0, TAU); c.fill(); c.fillStyle = '#ffc93c'; star(c, 46); };
      A.at(0.2, 0.55, false, roundel); A.at(0.8, 0.55, false, roundel);
      A.panel(0.03, 0.22, 0.74, 0.995); A.panel(0.78, 0.97, 0.74, 0.995);
    });
    // wingtip rails
    [-1, 1].forEach(s => {
      const rail = new THREE.CylinderGeometry(0.06, 0.06, 2.6, 8); rail.rotateX(Math.PI / 2);
      g.add(mesh(rail, K.std(0xd8dbe0), s * 5.75, -0.12 - 5.7 * Math.tan(2 * D2R), 3.6));
      const pod = makeBody({ L: 2.4, R: 0.09, nose: 0.75, tail: 0.6, pointy: 0.6 });
      g.add(mesh(pod.geo, K.gloss(0xffffff), s * 5.75, -0.02 - 5.7 * Math.tan(2 * D2R), 3.4));
    });
    // twin canted fins with rudders
    const FP = { span: 2.7, root: 2.9, tip: 1.0, sweep: 1.7, t: 0.06 };
    [-1, 1].forEach(s => {
      const finMat = K.gloss(0xffffff, { metalness: 0.15 });
      const fin = surface(K, FP, finMat, [{ e0: 0.05, e1: 0.6, c0: 0.68, kind: 'rud', max: 0.3 }], { round: 0.02 });
      fin.group.position.set(s * 1.3, 0.4, 4.7); fin.group.rotation.z = -s * 0.36; g.add(fin.group); surfaces.push(...fin.surfaces);
      surfLivery(K, finMat, spanM(FP), chordFn(FP), 'fin', (A, p) => {
        A.fill(p); const acc = contrast(p);
        A.poly([[0.2, 0], [0.32, 0], [1, 0.62], [1, 0.8]], acc); A.poly([[0.36, 0], [0.42, 0], [1, 0.52], [1, 0.58]], acc);
        A.at(0.55, 0.35, s > 0, c => flag(c, 46));
        A.at(0.3, 0.55, s < 0, c => text(c, 'FH-07', 26, acc === NAVY ? NAVY : WHITE, null, '800'));
      }, 512, 256);
    });
    // all-moving tailplanes (stabilators)
    const SP = { span: 6.6, root: 2.3, tip: 0.9, sweep: 1.1, t: 0.05, dih: -4, mirror: true };
    const stabMat = K.gloss(0xffffff, { metalness: 0.15 });
    surfLivery(K, stabMat, spanM(SP), chordFn(SP), 'wing', (A, p) => { A.fill(p); A.rect(0, 1, 0.85, 1, mix(p, 0, 0.4)); }, 512, 128);
    [-1, 1].forEach(s => {
      const piv = new THREE.Group(); piv.position.set(s * 0.8, -0.05, 6.1);
      const geo = loftPiece(SP, { e0: 0.18, e1: 1, map: s > 0 ? 'wing' : 'wingL', round: 0.02 }); geo.translate(0, 0, 0.2);
      piv.add(mesh(geo, stabMat)); g.add(piv);
      surfaces.push({ pivot: piv, axis: new THREE.Vector3(1, 0, 0), kind: 'stab', max: 0.3 });
    });
    // twin nozzles with afterburner flames
    const flames = [];
    [-1, 1].forEach(s => {
      const nz = nozzle(K, 0.5, 1.2); nz.position.set(s * 0.58, -0.05, 7.6); g.add(nz);
      const f = flame(0.42, 4.2, true); f.position.set(s * 0.58, -0.05, 8.1); g.add(f); flames.push(f);
    });
    g.add(mesh(new THREE.BoxGeometry(0.3, 0.5, 2.2), K.paintMat({}, 0.3), 0, 0.15, 6.6));
    // retractable gear
    const gear = [];
    [-1, 1].forEach(s => gear.push(gearLeg(K, s * 1.75, -0.4, 1.5, -1.34, 0.36, 0.24, [1, 0, 0], Math.PI / 2, { strutR: 0.08 })));
    gear.push(gearLeg(K, 0, -0.65, -4.4, -1.42, 0.28, 0.16, [1, 0, 0], -Math.PI / 2, { twin: true }));
    gear.forEach(l => g.add(l.pivot));
    g.add(strut(0, -0.1, -7.6, 0, -0.1, -8.4, 0.03, K.chrome));
    const ant = antenna(K, 0.26, 0.15); ant.position.set(0, B.topAt(-1) - 0.03, -1.0); g.add(ant);
    const tipY = -0.12 - 5.7 * Math.tan(2 * D2R);
    setLights(g, { l: [-5.85, tipY, 2.3], r: [5.85, tipY, 2.3], tail: [0, 0.2, 7.9], beacons: [[0, B.topAt(0.5) + 0.04, 0.5], [0, B.botAt(0) - 0.05, 0]] });
    return finish(K, g, [], flames, surfaces, gear);
  }
  function star(c, r) {
    c.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.4 : r; i ? c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    c.closePath(); c.fill();
  }

  // bundles everything the game needs from a model
  function finish(K, g, props, flames, surfaces, gear) {
    const rig = {
      group: g, props, flames, paint: [], surfaces, gear: gear || null, mats: K.mats, kit: K,
      repaint: p => K.repaint(p), propAngle: 0, gearF: 1, ctl: { p: 0, r: 0, y: 0 }, envK: -1,
    };
    if (gear) rig.setGear = f => gear.forEach(l => { l.pivot.quaternion.setFromAxisAngle(l.axis, (1 - f) * l.angle); l.pivot.visible = f > 0.03; });
    return rig;
  }

  // Per-frame animation for a model: prop spin and blur, jet flames, control surfaces, gear, reflections.
  // s: { spin (rad/s), eff (0..1 power), fuel (bool), ctl {p, r, y}, gear (1 down, 0 up) }
  FH.animateRig = function (rig, dt, s) {
    rig.propAngle += (s.spin || 0) * dt;
    const blur = U.smoothstep(26, 46, s.spin || 0);
    for (const p of rig.props) {
      const u = p.userData;
      u.spinner.rotation.z = rig.propAngle;
      u.blades.visible = blur < 0.85;
      u.disc.visible = blur > 0.02; u.disc.material.opacity = blur;
    }
    for (const f of rig.flames) {
      const k = s.fuel !== false ? 0.25 + (s.eff || 0) * 0.9 : 0, e = s.eff || 0;
      f.scale.set(0.6 + e * 0.5, 0.6 + e * 0.5, k + Math.random() * 0.08 * e);
      f.visible = k > 0.01;
    }
    if (rig.surfaces.length && s.ctl) {
      const c = rig.ctl, a = Math.min(1, dt * 10);
      c.p += (s.ctl.p - c.p) * a; c.r += (s.ctl.r - c.r) * a; c.y += (s.ctl.y - c.y) * a;
      for (const sf of rig.surfaces) {
        let ang = 0;
        switch (sf.kind) {
          case 'ailR': ang = -c.r; break;
          case 'ailL': ang = c.r; break;
          case 'elev': case 'stab': ang = -c.p; break;
          case 'rud': ang = c.y; break;
          case 'elevonR': ang = U.clamp(-c.r - c.p, -1, 1); break;
          case 'elevonL': ang = U.clamp(c.r - c.p, -1, 1); break;
        }
        sf.pivot.quaternion.setFromAxisAngle(sf.axis, ang * sf.max);
      }
    }
    if (rig.setGear && s.gear != null) {
      const ng = s.instant ? s.gear : U.approach(rig.gearF, s.gear, dt * 0.55);
      if (ng !== rig.gearF || rig._gearInit !== true) { rig.gearF = ng; rig.setGear(ng); rig._gearInit = true; }
    }
    const env = FH.envLight;
    if (Math.abs(env - rig.envK) > 0.01) { rig.envK = env; for (const m of rig.mats) m.envMapIntensity = m.userData.envBase * env; }
  };

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

  // A static, merged copy of a plane for parking on aprons (few draw calls, no animation).
  FH.buildStaticPlane = function (id, paint) {
    const def = FH.planeById(id), rig = def.build(paint), src = rig.group;
    if (rig.setGear) rig.setGear(1);
    rig.props.forEach(p => { p.userData.disc.visible = false; p.userData.blades.visible = true; });
    rig.flames.forEach(f => { f.visible = false; });
    src.updateMatrixWorld(true);
    const byMat = new Map();
    src.traverse(o => {
      if (!o.isMesh || !o.visible) return;
      let v = o, vis = true; while (v) { if (!v.visible) vis = false; v = v.parent; }
      if (!vis || o.material.transparent) return;
      const geo = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(o.matrixWorld);
      ['uv1', 'uv2', 'color'].forEach(a => geo.deleteAttribute(a));
      if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
      if (!byMat.has(o.material)) byMat.set(o.material, []);
      byMat.get(o.material).push(geo);
    });
    const out = new THREE.Group();
    byMat.forEach((geos, mat) => { const m = new THREE.Mesh(FH.mergeGeometries(geos, false), mat); m.castShadow = true; out.add(m); });
    out.planeMats = rig.mats; // kept off userData so clone() stays cheap
    return out;
  };

  FH.UPGRADES = [
    { key: 'engine', name: 'Engine', icon: '⚙️', desc: 'More power and a higher top speed', descR: 'Go faster!' },
    { key: 'wings', name: 'Wings', icon: '🪽', desc: 'Sharper turns and a lower stall speed', descR: 'Turn faster!' },
    { key: 'fuel', name: 'Fuel Tank', icon: '⛽', desc: 'Fly much longer before refuelling', descR: 'Fly longer!' },
  ];
  FH.upgradeCost = (plane, level) => Math.round(Math.max(250, plane.price * 0.18) * level / 10) * 10;
})();

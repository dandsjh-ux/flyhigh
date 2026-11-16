// FlyHigh - procedural island world: terrain, ocean, sky, forests, clouds, airports, landmarks
(function () {
  const FH = window.FH, U = FH.util;
  const SIZE = 20000, HALF = SIZE / 2, N = 641, SP = SIZE / (N - 1), CH = 64, NCH = (N - 1) / CH, D2R = Math.PI / 180;

  const LANDMARK_INFO = {
    lighthouse: { name: 'Lighthouse', emoji: '🗼', factR: 'A lighthouse has a bright light. It helps ships at night.', factN: 'Lighthouses warn ships about dangerous rocks and help sailors navigate in the dark.' },
    windmill: { name: 'Windmill', emoji: '🌬️', factR: 'A windmill uses the wind to turn its big arms.', factN: 'A windmill converts the energy of the wind into power to grind grain or make electricity.' },
    castle: { name: 'Castle', emoji: '🏰', factR: 'Kings and queens lived in castles long ago.', factN: 'Ancient castles were constructed with thick stone walls to protect the people inside.' },
    tower: { name: 'Radio Tower', emoji: '📡', factR: 'The tall tower sends radio messages to pilots.', factN: 'Radio towers transmit signals so that pilots can communicate with air traffic control.' },
    bigtree: { name: 'Giant Tree', emoji: '🌳', factR: 'This tree is very, very old and very tall.', factN: 'This ancient tree is a habitat for hundreds of species of insects and birds.' },
    wreck: { name: 'Shipwreck', emoji: '⚓', factR: 'This old ship sank a long time ago.', factN: 'The ship was abandoned after a fierce storm. Now the wreck is a habitat for fish.' },
    volcano: { name: 'Volcano', emoji: '🌋', factR: 'A volcano is a mountain with hot lava inside.', factN: 'During an eruption, a volcano releases lava, ash and gas into the atmosphere.' },
  };
  FH.LANDMARK_INFO = LANDMARK_INFO;

  const matCache = {};
  function lam(hex, opts) {
    const key = hex + (opts ? JSON.stringify(opts) : '');
    if (!matCache[key]) matCache[key] = new THREE.MeshLambertMaterial(Object.assign({ color: hex }, opts || {}));
    return matCache[key];
  }
  FH.lam = lam;
  function mesh(geo, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; }

  function colored(geo, hex) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const c = new THREE.Color(hex);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return g;
  }

  // ---------- shaders ----------
  const SKY_VS = `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
  const SKY_FS = `
    uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uBottom; uniform vec3 uSunDir; uniform vec3 uSunColor;
    varying vec3 vDir;
    void main(){
      vec3 d = normalize(vDir); float y = d.y;
      vec3 col = mix(uHorizon, uTop, pow(clamp(y,0.0,1.0), 0.5));
      col = mix(col, uBottom, smoothstep(0.0, 0.2, -y));
      float sd = max(dot(d, uSunDir), 0.0);
      col += uSunColor * (pow(sd, 1200.0) * 8.0 + pow(sd, 60.0) * 0.3 + pow(sd, 6.0) * 0.12);
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`;
  const WATER_VS = `varying vec3 vWorld; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
  const WATER_FS = `
    uniform float uTime; uniform sampler2D uDepth; uniform float uSize;
    uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uSkyTop; uniform vec3 uSkyHorizon;
    uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar; uniform vec3 uAmb;
    varying vec3 vWorld;
    void main(){
      vec2 uv = vWorld.xz / uSize + 0.5;
      float depth = 1.0;
      if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) depth = texture2D(uDepth, uv).r;
      vec3 toCam = cameraPosition - vWorld; float dist = length(toCam); vec3 V = toCam / dist;
      float detail = 1.0 - smoothstep(600.0, 5000.0, dist);
      vec2 p = vWorld.xz; float t = uTime;
      vec3 n = vec3(0.0, 1.0, 0.0);
      n.x += 0.05*cos(p.x*0.021 + p.y*0.006 + t*1.1) + 0.035*cos((p.x+p.y)*0.037 + t*1.6) + 0.03*cos(p.x*0.12 - p.y*0.07 + t*2.4)*detail + 0.02*cos(p.x*0.31 + p.y*0.17 + t*3.1)*detail;
      n.z += 0.05*cos(p.y*0.024 - p.x*0.005 + t*0.9) + 0.035*cos((p.x-p.y)*0.041 + t*1.35) + 0.03*cos(p.y*0.13 + p.x*0.05 + t*2.2)*detail + 0.02*cos(p.y*0.29 - p.x*0.21 + t*2.8)*detail;
      n = normalize(n);
      float fres = 0.03 + 0.97 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
      vec3 R = reflect(-V, n);
      vec3 sky = mix(uSkyHorizon, uSkyTop, clamp(R.y * 1.6, 0.0, 1.0));
      vec3 base = mix(uShallow, uDeep, smoothstep(0.0, 0.65, depth)) * uAmb;
      vec3 col = mix(base, sky, fres * 0.8);
      float spec = pow(max(dot(R, uSunDir), 0.0), 220.0);
      col += uSunColor * spec * 3.0;
      float shore = 1.0 - smoothstep(0.0, 0.08, depth);
      float wave = 0.5 + 0.5 * sin(depth * 110.0 - t * 1.7 + sin(p.x * 0.013 + p.y * 0.011) * 3.0);
      col = mix(col, vec3(0.92, 0.96, 1.0) * uAmb, shore * smoothstep(0.35, 1.0, wave) * 0.85);
      float f = smoothstep(uFogNear, uFogFar, dist);
      col = mix(col, uFogColor, f);
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`;

  const World = FH.World = function (scene, renderer, opts) {
    this.scene = scene; this.renderer = renderer; this.Q = opts.quality; this.seed = opts.seed | 0;
    this.SIZE = SIZE; this.HALF = HALF; this.time = 0;
    this.airports = []; this.landmarks = []; this.islands = []; this.treasures = [];
    this.anims = []; this.labels = []; this.chunks = []; this.treeCells = []; this.smokeEmitters = [];
    this.fogColor = new THREE.Color(0xc4dcf0);
    this.sunDir = new THREE.Vector3(0.55, 0.62, 0.48).normalize();
    this.hour = 9; this.night = 0; this.lightsOn = 0; this.nightHooks = []; this.lightList = [];
    this.wx = { dark: 0, rain: 0, flash: 0, fog: 0, deck: 0 };
  };
  const P = World.prototype;
  const yieldFrame = () => new Promise(r => setTimeout(r, 0));

  P.build = async function (progress) {
    const R = FH.mulberry32(this.seed * 9973 + 17);
    this.S = FH.makeSimplex(R); this.S2 = FH.makeSimplex(R); this.S3 = FH.makeSimplex(R);
    this.makeIslands(R);
    progress(0.03, 'Shaping the islands…'); await yieldFrame();
    this.placeAirports(R);
    progress(0.08, 'Building runways…'); await yieldFrame();
    const H = this.H = new Float32Array(N * N);
    for (let j = 0; j < N; j++) {
      const z = -HALF + j * SP;
      for (let i = 0; i < N; i++) { const x = -HALF + i * SP; H[j * N + i] = this.flatten(x, z, this.baseHeight(x, z)); }
      if (j % 32 === 0) { progress(0.08 + 0.5 * j / N, 'Raising mountains…'); await yieldFrame(); }
    }
    this.computeNormals();
    progress(0.6, 'Painting the land…'); await yieldFrame();
    this.placeLandmarks(R);
    this.buildLights(); this.buildSky();
    this.buildTerrain();
    progress(0.7, 'Filling the ocean…'); await yieldFrame();
    this.buildWater();
    progress(0.75, 'Planting forests…'); await yieldFrame();
    this.buildTrees(R);
    progress(0.85, 'Making clouds…'); await yieldFrame();
    this.buildClouds(R);
    this.airports.forEach(a => this.buildAirport(a));
    this.landmarks.forEach(l => this.buildLandmark(l));
    this.buildLightPoints(); this.buildStars(); this.buildCloudDeck();
    this.buildAmbient(R);
    this.placeTreasures(R);
    progress(0.93, 'Drawing maps…'); await yieldFrame();
    this.buildMapImage();
    progress(1, 'Ready for take-off!');
  };

  // ---------- height field ----------
  P.makeIslands = function (R) {
    const isl = this.islands;
    isl.push({ name: 'Sunny Island', x: 0, z: 0, r: 4400, mtn: 1 });
    const names = ['Coral Island', 'Palm Island', 'Fire Island', 'Seagull Island', 'Turtle Island', 'Rainbow Island'];
    const a0 = R() * Math.PI * 2;
    for (let i = 0; i < 6; i++) {
      const a = a0 + i * Math.PI / 3 + (R() - 0.5) * 0.4;
      const fire = i === 2;
      const d = fire ? 7250 : 7000 + R() * 600;
      const r = fire ? 2200 : 1250 + R() * 500;
      isl.push({ name: names[i], x: Math.sin(a) * d, z: -Math.cos(a) * d, r, mtn: fire ? 0.25 : 0.3 + R() * 0.4, ang: a });
    }
    const f = isl[3];
    this.volcano = { x: f.x + Math.sin(f.ang) * f.r * 0.18, z: f.z - Math.cos(f.ang) * f.r * 0.18, r: f.r * 0.6, island: f };
  };

  P.fbm = function (S, x, z, oct) {
    let a = 1, f = 1, s = 0, n = 0;
    for (let i = 0; i < oct; i++) { s += a * S(x * f, z * f); n += a; a *= 0.5; f *= 2.03; }
    return s / n;
  };
  P.ridge = function (x, z) {
    let a = 1, f = 1, s = 0, n = 0;
    for (let i = 0; i < 4; i++) { let r = 1 - Math.abs(this.S3(x * f, z * f)); r *= r; s += a * r; n += a; a *= 0.42; f *= 2.1; }
    return s / n;
  };

  P.baseHeight = function (x, z) {
    const S = this.S, S2 = this.S2;
    const wx = x + 650 * S(x * 0.00028 + 11.3, z * 0.00028 - 4.1);
    const wz = z + 650 * S(x * 0.00028 - 7.7, z * 0.00028 + 9.2);
    let m = -99, best = this.islands[0];
    for (const is of this.islands) {
      const dx = wx - is.x, dz = wz - is.z;
      const v = 1 - Math.sqrt(dx * dx + dz * dz) / is.r;
      if (v > m) { m = v; best = is; }
    }
    const n = this.fbm(S, x * 0.0006, z * 0.0006, 4);
    const e = m + n * 0.17;
    let h;
    if (e < 0) h = -230 * (1 - Math.exp(e * 3.0));
    else {
      const hills = this.fbm(S2, x * 0.0016 + 3, z * 0.0016 - 8, 3);
      h = e * 150 + hills * 50 * Math.min(1, e * 5);
      const mm = U.smoothstep(0.2, 0.7, e) * (0.55 + 0.45 * S2(x * 0.00035 + 20, z * 0.00035));
      if (mm > 0.001) h += this.ridge(x * 0.00055, z * 0.00055) * 900 * mm * best.mtn;
    }
    const v = this.volcano;
    if (v) {
      const dx = x - v.x, dz = z - v.z;
      const d = Math.sqrt(dx * dx + dz * dz) / v.r;
      if (d < 1) {
        let c = Math.pow(1 - d, 1.7) * 820;
        if (d < 0.12) c -= (0.12 - d) / 0.12 * 190;
        c += S(x * 0.004, z * 0.004) * 10 * (1 - d);
        h = Math.max(h, -5) + c;
      }
    }
    return h;
  };

  P.flatten = function (x, z, h) {
    for (const a of this.airports) {
      const dx = x - a.x, dz = z - a.z;
      if (Math.abs(dx) > 1300 || Math.abs(dz) > 1300) continue;
      const u = dx * a.fx + dz * a.fz, v = dx * a.rx + dz * a.rz;
      const du = Math.max(Math.abs(u) - a.halfL, 0), dv = Math.max(Math.abs(v) - a.halfW, 0);
      const dd = Math.sqrt(du * du + dv * dv);
      if (dd < a.blend) { const t = U.smoothstep(0, a.blend, dd); h = a.elev + (h - a.elev) * t; }
    }
    return h;
  };

  P.findAirportSite = function (R, island, placed) {
    let best = null, bestScore = 1e9;
    const pts = [[-560, 0], [-280, 0], [0, 0], [280, 0], [560, 0], [0, -200], [0, 200], [-500, 180], [500, 180], [-500, -180], [500, -180]];
    const v = this.volcano;
    for (let k = 0; k < 170; k++) {
      const a = R() * Math.PI * 2, rr = island.r * (0.05 + R() * 0.55);
      const cx = island.x + Math.sin(a) * rr, cz = island.z - Math.cos(a) * rr;
      if (placed.some(p => Math.hypot(p.x - cx, p.z - cz) < 3800)) continue;
      if (v && Math.hypot(cx - v.x, cz - v.z) < v.r * 1.15) continue;
      for (let hd = 0; hd < 180; hd += 15) {
        const fx = Math.sin(hd * D2R), fz = -Math.cos(hd * D2R), rx = Math.cos(hd * D2R), rz = Math.sin(hd * D2R);
        let sum = 0, sum2 = 0, ok = true;
        for (const [u, w] of pts) {
          const h = this.baseHeight(cx + fx * u + rx * w, cz + fz * u + rz * w);
          if (h < 3) { ok = false; break; }
          sum += h; sum2 += h * h;
        }
        if (!ok) continue;
        const mean = sum / pts.length, sd = Math.sqrt(Math.max(0, sum2 / pts.length - mean * mean));
        const score = sd + Math.max(0, mean - 110) * 0.5 + Math.max(0, 12 - mean) * 0.6;
        if (score < bestScore) { bestScore = score; best = { x: cx, z: cz, hdg: hd, elev: Math.max(mean, 8) }; }
      }
    }
    return best;
  };

  P.placeAirports = function (R) {
    const plan = [[0, 'Sunny Field'], [0, 'Pine Valley'], [1, 'Coral Bay'], [2, 'Palm Beach'], [3, 'Fire Mountain'], [4, 'Seagull Point'], [5, 'Turtle Cove'], [6, 'Rainbow Field']];
    const placed = [];
    for (const [idx, name] of plan) {
      const isl = this.islands[idx];
      let site = this.findAirportSite(R, isl, placed);
      if (!site && placed.length === 0) site = { x: 0, z: 0, hdg: 90, elev: 30 };
      if (!site) continue;
      if (R() < 0.5) site.hdg += 180;
      const h = site.hdg * D2R;
      const num = d => { let n = Math.round(U.norm360(d) / 10); if (n === 0) n = 36; return String(n).padStart(2, '0'); };
      Object.assign(site, {
        name, island: isl.name, fx: Math.sin(h), fz: -Math.cos(h), rx: Math.cos(h), rz: Math.sin(h),
        halfL: 560, halfW: 210, blend: 320, rwy: [num(site.hdg), num(site.hdg + 180)], id: this.airports.length,
      });
      placed.push(site);
      this.airports.push(site);
    }
  };

  P.computeNormals = function () {
    const H = this.H;
    this.NX = new Float32Array(N * N); this.NY = new Float32Array(N * N); this.NZ = new Float32Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const hl = H[j * N + Math.max(i - 1, 0)], hr = H[j * N + Math.min(i + 1, N - 1)];
      const hd = H[Math.max(j - 1, 0) * N + i], hu = H[Math.min(j + 1, N - 1) * N + i];
      let nx = (hl - hr) / (2 * SP), nz = (hd - hu) / (2 * SP), ny = 1;
      const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
      const k = j * N + i;
      this.NX[k] = nx / l; this.NY[k] = ny / l; this.NZ[k] = nz / l;
    }
  };

  P.heightAt = function (x, z) {
    const fx = (x + HALF) / SP, fz = (z + HALF) / SP;
    if (fx < 0 || fz < 0 || fx >= N - 1 || fz >= N - 1) return -230;
    const i = fx | 0, j = fz | 0, tx = fx - i, tz = fz - j, H = this.H, k = j * N + i;
    if (tx + tz <= 1) return H[k] + (H[k + 1] - H[k]) * tx + (H[k + N] - H[k]) * tz;
    return H[k + N + 1] + (H[k + N] - H[k + N + 1]) * (1 - tx) + (H[k + 1] - H[k + N + 1]) * (1 - tz);
  };
  P.normalYAt = function (x, z) {
    const i = Math.round((x + HALF) / SP), j = Math.round((z + HALF) / SP);
    if (i < 0 || j < 0 || i >= N || j >= N) return 1;
    return this.NY[j * N + i];
  };
  P.forestMask = function (x, z) { return this.fbm(this.S2, x * 0.0011 + 50, z * 0.0011 + 50, 3) + 0.06; };
  P.volcanoInfluence = function (x, z) {
    const v = this.volcano; if (!v) return 0;
    const d = Math.hypot(x - v.x, z - v.z) / v.r;
    return 1 - U.smoothstep(0.55, 1.0, d);
  };
  P.maxHeightAround = function (x, z, radius) {
    let m = Math.max(0, this.heightAt(x, z));
    for (let r = radius / 3; r <= radius; r += radius / 3) for (let a = 0; a < 12; a++) {
      const h = this.heightAt(x + Math.cos(a * Math.PI / 6) * r, z + Math.sin(a * Math.PI / 6) * r);
      if (h > m) m = h;
    }
    return m;
  };
  P.airportAt = function (x, z, margin = 0) {
    for (const a of this.airports) {
      const dx = x - a.x, dz = z - a.z;
      const u = dx * a.fx + dz * a.fz, v = dx * a.rx + dz * a.rz;
      if (Math.abs(u) <= a.halfL + margin && Math.abs(v) <= a.halfW + margin) {
        return { airport: a, onRunway: Math.abs(u) <= 470 && Math.abs(v) <= 30, u, v };
      }
    }
    return null;
  };
  P.nearestAirport = function (x, z) {
    let best = null, bd = 1e12;
    for (const a of this.airports) { const d = (a.x - x) ** 2 + (a.z - z) ** 2; if (d < bd) { bd = d; best = a; } }
    return best;
  };
  P.islandName = function (x, z) {
    let best = this.islands[0], bd = 1e12;
    for (const is of this.islands) { const d = Math.hypot(is.x - x, is.z - z) / is.r; if (d < bd) { bd = d; best = is; } }
    return best.name;
  };

  // ---------- landmarks ----------
  P.placeLandmarks = function (R) {
    const L = this.landmarks;
    const near = (x, z, d) => this.airports.some(a => Math.hypot(a.x - x, a.z - z) < d + 500) || L.some(l => Math.hypot(l.x - x, l.z - z) < d);
    const rnd = r => [(R() * 2 - 1) * r, (R() * 2 - 1) * r];
    const add = (key, x, z, y) => { const info = LANDMARK_INFO[key]; L.push(Object.assign({ key, x, z, y: y !== undefined ? y : this.heightAt(x, z) }, info)); };
    // lighthouse: on the coast of the main island
    for (let t = 0; t < 6000; t++) {
      const [x, z] = rnd(5600); const h = this.heightAt(x, z);
      if (h < 4 || h > 16) continue;
      let water = false;
      for (let k = 0; k < 8; k++) { if (this.heightAt(x + Math.cos(k * 0.785) * 140, z + Math.sin(k * 0.785) * 140) < -3) { water = true; break; } }
      if (!water || near(x, z, 1200)) continue;
      add('lighthouse', x, z); break;
    }
    // windmill: grassy lowland
    for (let t = 0; t < 6000; t++) {
      const [x, z] = rnd(4200); const h = this.heightAt(x, z);
      if (h < 20 || h > 100 || this.normalYAt(x, z) < 0.97 || this.forestMask(x, z) > 0 || near(x, z, 1200)) continue;
      add('windmill', x, z); break;
    }
    // castle: on a hill
    for (let t = 0; t < 8000; t++) {
      const [x, z] = rnd(4000); const h = this.heightAt(x, z);
      if (h < 140 || h > 360 || this.normalYAt(x, z) < 0.9 || near(x, z, 1200)) continue;
      add('castle', x, z); break;
    }
    // radio tower: highest point on main island
    let bx = 0, bz = 0, bh = -1;
    for (let t = 0; t < 4000; t++) { const [x, z] = rnd(4000); const h = this.heightAt(x, z); if (h > bh && !near(x, z, 600)) { bh = h; bx = x; bz = z; } }
    if (bh > 0) add('tower', bx, bz);
    // giant tree: in a forest
    for (let t = 0; t < 8000; t++) {
      const [x, z] = rnd(4200); const h = this.heightAt(x, z);
      if (h < 30 || h > 280 || this.forestMask(x, z) < 0.25 || this.normalYAt(x, z) < 0.9 || near(x, z, 1200)) continue;
      add('bigtree', x, z); break;
    }
    // shipwreck: shallow water near an island
    for (let t = 0; t < 8000; t++) {
      const [x, z] = rnd(8500); const h = this.heightAt(x, z);
      if (h < -10 || h > -3 || near(x, z, 1500)) continue;
      add('wreck', x, z, 0); break;
    }
    // volcano
    const v = this.volcano;
    if (v) {
      let rim = 0;
      for (let a = 0; a < 16; a++) rim = Math.max(rim, this.heightAt(v.x + Math.cos(a * 0.39) * v.r * 0.12, v.z + Math.sin(a * 0.39) * v.r * 0.12));
      add('volcano', v.x, v.z, rim);
      v.rim = rim; v.floor = this.heightAt(v.x, v.z);
    }
  };

  // ---------- lights / sky ----------
  P.buildLights = function () {
    const s = this.scene;
    this.hemi = new THREE.HemisphereLight(0xdcefff, 0x7f8c66, 1.75); s.add(this.hemi);
    const sun = this.sun = new THREE.DirectionalLight(0xfff1dc, 2.3);
    sun.position.copy(this.sunDir).multiplyScalar(1000);
    s.add(sun); s.add(sun.target);
    if (this.Q.shadows) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(this.Q.shadowSize, this.Q.shadowSize);
      const c = sun.shadow.camera; c.left = -70; c.right = 70; c.top = 70; c.bottom = -70; c.near = 10; c.far = 2000;
      sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.4;
    }
    s.fog = new THREE.Fog(this.fogColor, this.Q.view * 0.22, this.Q.view);
  };
  P.followSun = function (p) {
    this.sun.target.position.copy(p);
    this.sun.position.copy(p).addScaledVector(this.sunDir, 1000);
    this.sun.target.updateMatrixWorld();
  };

  P.buildSky = function () {
    const geo = new THREE.SphereGeometry(20000, 32, 16);
    const mat = new THREE.ShaderMaterial({
      vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        uTop: { value: new THREE.Color(0x2f74d0) }, uHorizon: { value: this.fogColor.clone() }, uBottom: { value: new THREE.Color(0x9fc3e0) },
        uSunDir: { value: this.sunDir }, uSunColor: { value: new THREE.Color(0xfff0d0) },
      },
    });
    this.sky = new THREE.Mesh(geo, mat); this.sky.frustumCulled = false; this.sky.renderOrder = -10;
    this.scene.add(this.sky);
  };

  // ---------- terrain ----------
  P.buildTerrain = function () {
    const C = h => new THREE.Color(h);
    const col = {
      wet: C(0xc2ad7c), sand: C(0xe6d5a2), grassL: C(0x8cc068), grass: C(0x5f9e47), dry: C(0xa7b45c),
      forest: C(0x2c5e2f), rock: C(0x7d7468), rockL: C(0x958b7c), snow: C(0xf3f6f9), volc: C(0x3a3331), mown: C(0x86bf5e),
    };
    const tmp = new THREE.Color();
    const S = this.S, S2 = this.S2;
    const colorAt = (x, z, h, ny) => {
      const n1 = S(x * 0.004, z * 0.004) * 0.5 + 0.5;
      const n2 = S2(x * 0.0007 + 9, z * 0.0007 - 3);
      if (h < 1.2) tmp.copy(col.wet);
      else if (h < 4.5 + n1 * 4) tmp.copy(col.sand);
      else {
        tmp.copy(col.grassL).lerp(col.grass, n1);
        if (n2 > 0.25) tmp.lerp(col.dry, Math.min(1, (n2 - 0.25) * 1.6));
        const f = this.forestMask(x, z);
        tmp.lerp(col.forest, U.smoothstep(0.0, 0.3, f) * (1 - U.smoothstep(560, 680, h)) * 0.85);
        tmp.lerp(col.rockL, U.smoothstep(380, 640, h) * 0.75);
        tmp.lerp(col.rock, U.smoothstep(0.86, 0.68, ny));
        tmp.lerp(col.snow, U.smoothstep(760, 860, h + n1 * 90) * U.smoothstep(0.62, 0.8, ny));
      }
      const vi = this.volcanoInfluence(x, z);
      if (vi > 0) tmp.lerp(col.volc, vi * U.smoothstep(10, 90, h) * 0.9);
      const ap = this.airportAt(x, z, 60);
      if (ap && h > 3) tmp.lerp(col.mown, 0.7);
      tmp.multiplyScalar(0.9 + n1 * 0.18);
      return tmp;
    };
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.terrainMat = mat;
    const H = this.H;
    for (let cj = 0; cj < NCH; cj++) for (let ci = 0; ci < NCH; ci++) {
      let maxH = -1e9;
      for (let jj = 0; jj <= CH; jj++) for (let ii = 0; ii <= CH; ii++) maxH = Math.max(maxH, H[(cj * CH + jj) * N + ci * CH + ii]);
      if (maxH < -4) continue;
      const vc = (CH + 1) * (CH + 1);
      const pos = new Float32Array(vc * 3), nor = new Float32Array(vc * 3), cols = new Float32Array(vc * 3);
      let p = 0;
      for (let jj = 0; jj <= CH; jj++) for (let ii = 0; ii <= CH; ii++) {
        const gi = ci * CH + ii, gj = cj * CH + jj, k = gj * N + gi;
        const x = -HALF + gi * SP, z = -HALF + gj * SP, h = H[k];
        pos[p] = x; pos[p + 1] = h; pos[p + 2] = z;
        nor[p] = this.NX[k]; nor[p + 1] = this.NY[k]; nor[p + 2] = this.NZ[k];
        const c = colorAt(x, z, h, this.NY[k]);
        cols[p] = c.r; cols[p + 1] = c.g; cols[p + 2] = c.b;
        p += 3;
      }
      const idx = new Uint16Array(CH * CH * 6);
      let q = 0;
      for (let jj = 0; jj < CH; jj++) for (let ii = 0; ii < CH; ii++) {
        const a = jj * (CH + 1) + ii, b = a + 1, c = a + (CH + 1), d = c + 1;
        idx[q++] = a; idx[q++] = c; idx[q++] = b;
        idx[q++] = b; idx[q++] = c; idx[q++] = d;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      g.setIndex(new THREE.BufferAttribute(idx, 1));
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mat);
      m.receiveShadow = !!this.Q.shadows;
      m.matrixAutoUpdate = false; m.updateMatrix();
      this.scene.add(m);
      this.chunks.push({ mesh: m, cx: -HALF + (ci + 0.5) * CH * SP, cz: -HALF + (cj + 0.5) * CH * SP });
    }
  };

  // ---------- water ----------
  P.buildWater = function () {
    const R = 512, data = new Uint8Array(R * R * 4);
    for (let r = 0; r < R; r++) for (let c = 0; c < R; c++) {
      const x = -HALF + (c + 0.5) / R * SIZE, z = -HALF + (r + 0.5) / R * SIZE;
      const h = this.heightAt(x, z);
      const d = h >= 0 ? 0 : Math.min(1, -h / 45);
      const k = (r * R + c) * 4;
      data[k] = Math.round(d * 255); data[k + 1] = 0; data[k + 2] = 0; data[k + 3] = 255;
    }
    const tex = new THREE.DataTexture(data, R, R, THREE.RGBAFormat);
    tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
    const mat = new THREE.ShaderMaterial({
      vertexShader: WATER_VS, fragmentShader: WATER_FS,
      uniforms: {
        uTime: { value: 0 }, uDepth: { value: tex }, uSize: { value: SIZE },
        uSunDir: { value: this.sunDir }, uSunColor: { value: new THREE.Color(0xfff2d6) },
        uDeep: { value: new THREE.Color(0x0b4f86) }, uShallow: { value: new THREE.Color(0x3fd3cc) },
        uSkyTop: { value: new THREE.Color(0x5b93d8) }, uSkyHorizon: { value: this.fogColor.clone() },
        uFogColor: { value: this.fogColor.clone() }, uFogNear: { value: this.Q.view * 0.22 }, uFogFar: { value: this.Q.view },
        uAmb: { value: new THREE.Color(1, 1, 1) },
      },
    });
    const geo = new THREE.PlaneGeometry(70000, 70000, 1, 1); geo.rotateX(-Math.PI / 2);
    this.water = new THREE.Mesh(geo, mat); this.water.frustumCulled = false;
    this.scene.add(this.water);
  };

  // ---------- trees ----------
  P.treeGeometries = function () {
    const M = FH.mergeGeometries;
    const T = (g, x, y, z) => { g.translate(x, y, z); return g; };
    const pine = M([
      colored(T(new THREE.CylinderGeometry(0.5, 0.7, 4, 5), 0, 2, 0), 0x6b4a2b),
      colored(T(new THREE.ConeGeometry(4.6, 7, 7), 0, 6.5, 0), 0x2b6534),
      colored(T(new THREE.ConeGeometry(3.6, 6, 7), 0, 10, 0), 0x32743b),
      colored(T(new THREE.ConeGeometry(2.3, 4.6, 7), 0, 13.2, 0), 0x3a8443),
    ]);
    const broad = M([
      colored(T(new THREE.CylinderGeometry(0.6, 0.9, 5, 5), 0, 2.5, 0), 0x6e4b2c),
      colored(T(new THREE.IcosahedronGeometry(4.8, 0), 0, 8, 0), 0x4b9438),
      colored(T(new THREE.IcosahedronGeometry(3.4, 0), 1.8, 10.2, 0.8), 0x5aa543),
      colored(T(new THREE.IcosahedronGeometry(3.0, 0), -1.7, 9.6, -1.0), 0x468c34),
    ]);
    const trunk = new THREE.CylinderGeometry(0.32, 0.5, 10, 5); trunk.rotateZ(0.12); trunk.translate(0.6, 5, 0);
    const crown = new THREE.ConeGeometry(4.8, 2.2, 7); crown.translate(1.2, 10.6, 0);
    const crown2 = new THREE.ConeGeometry(3.4, 1.8, 7); crown2.rotateY(0.4); crown2.translate(1.2, 11.4, 0);
    const palm = M([colored(trunk, 0x8a6a45), colored(crown, 0x4f9a35), colored(crown2, 0x5fae40)]);
    [pine, broad, palm].forEach(g => g.computeVertexNormals());
    return [pine, broad, palm];
  };

  P.buildTrees = function (R) {
    const geos = this.treeGeometries();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const CELLS = 5, cellSize = SIZE / CELLS;
    const buckets = [];
    for (let i = 0; i < CELLS * CELLS * 3; i++) buckets.push([]);
    const target = this.Q.trees;
    let placed = 0;
    const lms = this.landmarks;
    for (let t = 0; t < target * 12 && placed < target; t++) {
      const x = (R() * 2 - 1) * (HALF - 200), z = (R() * 2 - 1) * (HALF - 200);
      const h = this.heightAt(x, z);
      if (h < 3 || h > 640) continue;
      const ny = this.normalYAt(x, z);
      if (ny < 0.84) continue;
      if (this.airportAt(x, z, 90)) continue;
      let type = -1;
      if (h < 14) { if (R() < 0.3) type = 2; }
      else {
        const f = this.forestMask(x, z);
        if (f > 0.03 && R() < U.smoothstep(0.03, 0.3, f)) type = (h > 230 || R() < (f > 0.4 ? 0.5 : 0.25)) ? 0 : 1;
        else if (R() < 0.04) type = 1;
      }
      if (type < 0) continue;
      if (lms.some(l => Math.abs(l.x - x) < 70 && Math.abs(l.z - z) < 70)) continue;
      const ci = Math.min(CELLS - 1, Math.floor((x + HALF) / cellSize)), cj = Math.min(CELLS - 1, Math.floor((z + HALF) / cellSize));
      buckets[(cj * CELLS + ci) * 3 + type].push([x, h - 0.4, z, R() * Math.PI * 2, 0.75 + R() * 0.75, R()]);
      placed++;
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const c = new THREE.Color();
    for (let b = 0; b < buckets.length; b++) {
      const list = buckets[b];
      if (!list.length) continue;
      const type = b % 3;
      const im = new THREE.InstancedMesh(geos[type], mat, list.length);
      list.forEach((t, i) => {
        p.set(t[0], t[1], t[2]); q.setFromAxisAngle(up, t[3]); s.setScalar(t[4] * (type === 1 ? 1.15 : 1));
        if (type === 0) s.y *= 1.1 + t[5] * 0.4;
        m4.compose(p, q, s); im.setMatrixAt(i, m4);
        c.setHSL(0, 0, 0.85 + t[5] * 0.3); im.setColorAt(i, c);
      });
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      im.matrixAutoUpdate = false;
      this.scene.add(im);
      const cell = Math.floor(b / 3), ci = cell % CELLS, cj = Math.floor(cell / CELLS);
      this.treeCells.push({ mesh: im, cx: -HALF + (ci + 0.5) * cellSize, cz: -HALF + (cj + 0.5) * cellSize, r: cellSize * 0.72 });
    }
    this.treeCount = placed;
  };

  // ---------- clouds ----------
  P.buildClouds = function (R) {
    const parts = [];
    const lo = new THREE.Color(0xb9c6d6), hi = new THREE.Color(0xffffff);
    for (let i = 0; i < this.Q.clouds; i++) {
      const cx = (R() * 2 - 1) * 12000, cz = (R() * 2 - 1) * 12000, cy = 1250 + R() * 1100;
      const n = 5 + Math.floor(R() * 6), size = 60 + R() * 90;
      for (let k = 0; k < n; k++) {
        const g = new THREE.IcosahedronGeometry(1, 1);
        const r = size * (0.55 + R() * 0.6);
        g.scale(r * 1.3, r * 0.6, r);
        g.translate(cx + (R() - 0.5) * size * 3.2, cy + (R() - 0.3) * size * 0.5, cz + (R() - 0.5) * size * 2);
        const pos = g.attributes.position, arr = new Float32Array(pos.count * 3), tc = new THREE.Color();
        for (let v = 0; v < pos.count; v++) {
          const t = U.clamp((pos.getY(v) - cy + size * 0.3) / (size * 0.9), 0, 1);
          tc.copy(lo).lerp(hi, t); arr[v * 3] = tc.r; arr[v * 3 + 1] = tc.g; arr[v * 3 + 2] = tc.b;
        }
        g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
        parts.push(g);
      }
    }
    const geo = FH.mergeGeometries(parts);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x7a8aa0, emissiveIntensity: 0.55 });
    this.clouds = new THREE.Mesh(geo, mat);
    this.scene.add(this.clouds);
  };

  // ---------- labels ----------
  P.makeLabel = function (text, color = '#ffffff', bg = 'rgba(10,30,60,0.72)', h = 0.03) {
    const c = document.createElement('canvas'); const ctx = c.getContext('2d'); const fs = 44;
    const font = `600 ${fs}px Fredoka, Nunito, sans-serif`;
    ctx.font = font;
    c.width = Math.ceil(ctx.measureText(text).width) + 44; c.height = fs + 26;
    ctx.font = font;
    ctx.fillStyle = bg;
    const r = 18; ctx.beginPath(); ctx.moveTo(r, 0); ctx.arcTo(c.width, 0, c.width, c.height, r); ctx.arcTo(c.width, c.height, 0, c.height, r); ctx.arcTo(0, c.height, 0, 0, r); ctx.arcTo(0, 0, c.width, 0, r); ctx.fill();
    ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, c.width / 2, c.height / 2 + 2);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, sizeAttenuation: false, transparent: true, fog: false });
    const s = new THREE.Sprite(m); s.scale.set(h * c.width / c.height, h, 1); s.renderOrder = 30;
    return s;
  };
  P.addLabel = function (text, x, y, z, maxD, color) {
    const s = this.makeLabel(text, color); s.position.set(x, y, z); this.scene.add(s);
    const l = { sprite: s, x, z, maxD: maxD || 9000, minD: 250 }; this.labels.push(l); return l;
  };

  // ---------- airports ----------
  P.runwayTexture = function (nums) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 1024; const x = c.getContext('2d');
    x.fillStyle = '#3a3e44'; x.fillRect(0, 0, 128, 1024);
    for (let i = 0; i < 2500; i++) { const v = 50 + Math.random() * 25 | 0; x.fillStyle = `rgb(${v},${v + 2},${v + 5})`; x.fillRect(Math.random() * 128, Math.random() * 1024, 2, 2); }
    x.fillStyle = '#e9e9e4';
    x.fillRect(5, 0, 3, 1024); x.fillRect(120, 0, 3, 1024);
    for (let y = 150; y < 874; y += 44) x.fillRect(62, y, 4, 24);
    for (let k = 0; k < 8; k++) { if (k === 3 || k === 4) continue; x.fillRect(14 + k * 13.5, 8, 7, 52); x.fillRect(14 + k * 13.5, 1024 - 60, 7, 52); }
    x.fillRect(26, 220, 22, 40); x.fillRect(80, 220, 22, 40); x.fillRect(26, 1024 - 260, 22, 40); x.fillRect(80, 1024 - 260, 22, 40);
    x.font = 'bold 48px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(nums[0], 64, 1024 - 100);
    x.save(); x.translate(64, 100); x.rotate(Math.PI); x.fillText(nums[1], 0, 0); x.restore();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    return t;
  };

  P.buildAirport = function (a) {
    const g = new THREE.Group(); g.position.set(a.x, a.elev, a.z); g.rotation.y = -a.hdg * D2R;
    const shadow = !!this.Q.shadows;
    const flat = (w, l, mat, x, y, z) => { const m = mesh(new THREE.PlaneGeometry(w, l), mat, x, y, z); m.rotation.x = -Math.PI / 2; m.receiveShadow = shadow; g.add(m); return m; };
    const rwMat = new THREE.MeshLambertMaterial({ map: this.runwayTexture(a.rwy), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    flat(46, 920, rwMat, 0, 0.2, 0);
    const concrete = new THREE.MeshLambertMaterial({ color: 0x8d8f93, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    flat(150, 340, concrete, 120, 0.15, 0);
    flat(80, 24, concrete, 62, 0.15, 0);
    flat(70, 20, concrete, 45, 0.15, -400);
    // runway end lights (green/red bars)
    const lg = new THREE.MeshBasicMaterial({ color: 0x46ff7a }), lr = new THREE.MeshBasicMaterial({ color: 0xff4040 });
    [[460, lg], [-460, lg]].forEach(([z]) => {
      for (let i = -3; i <= 3; i++) { g.add(mesh(new THREE.BoxGeometry(1.2, 0.6, 1.2), z > 0 ? lg : lr, i * 6.5, 0.4, z + (z > 0 ? 4 : -4))); }
    });
    // hangars
    const hgGeo = new THREE.CylinderGeometry(16, 16, 34, 16, 1, false, 0, Math.PI); hgGeo.rotateZ(Math.PI / 2); hgGeo.rotateY(Math.PI / 2);
    [[-110, 0xd9473f], [-50, 0x3f78d9], [10, 0xe8e2d4]].forEach(([z, col], i) => {
      if (i === 2 && a.id % 2) return;
      const h = mesh(hgGeo, lam(col), 170, 0, z);
      h.rotation.y = Math.PI / 2; h.castShadow = shadow; g.add(h);
      const door = mesh(new THREE.PlaneGeometry(22, 13), lam(0x2c3036), 153.8, 6.5, z); door.rotation.y = -Math.PI / 2; g.add(door);
    });
    // control tower
    const tw = new THREE.Group(); tw.position.set(110, 0, 120);
    tw.add(mesh(new THREE.CylinderGeometry(3, 3.6, 20, 10), lam(0xeeeae0), 0, 10, 0));
    tw.add(mesh(new THREE.CylinderGeometry(5.5, 4.2, 5, 10), new THREE.MeshLambertMaterial({ color: 0x2c5f8a, emissive: 0x18324a }), 0, 22.5, 0));
    tw.add(mesh(new THREE.CylinderGeometry(6.2, 6.2, 1, 10), lam(0x55595f), 0, 25.5, 0));
    const bcn = mesh(new THREE.SphereGeometry(0.8, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3030 }), 0, 27, 0); tw.add(bcn);
    g.add(tw);
    this.glowAtNight(tw.children[1].material, 0x18324a, 0xffd98a, 0.9);
    // terminal
    const term = mesh(new THREE.BoxGeometry(18, 9, 48), lam(0xf2efe6), 175, 4.5, 110); term.castShadow = shadow; g.add(term);
    const win = mesh(new THREE.BoxGeometry(18.6, 2.4, 48.6), new THREE.MeshLambertMaterial({ color: 0x2c5f8a, emissive: 0x10283c }), 175, 6, 110); g.add(win);
    this.glowAtNight(win.material, 0x10283c, 0xffcf7a, 0.85);
    this.airportLights(a);
    // windsock
    g.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 7, 5), lam(0xdddddd), -40, 3.5, -380));
    const sockGeo = new THREE.ConeGeometry(0.9, 5, 8, 1, true); sockGeo.rotateZ(Math.PI / 2); sockGeo.translate(2.5, 0, 0);
    const sock = mesh(sockGeo, lam(0xff7a1a, { side: THREE.DoubleSide }), -40, 6.6, -380); g.add(sock);
    // small parked plane silhouettes (fuel truck box)
    g.add(mesh(new THREE.BoxGeometry(3, 3, 7), lam(0xf2c12e), 120, 1.5, 40));
    this.scene.add(g);
    a.group = g;
    let blink = 0;
    this.anims.push((dt, t) => { sock.rotation.y = Math.sin(t * 0.3 + a.id) * 0.4 + 0.8; blink = (t + a.id * 0.3) % 1.4; bcn.visible = blink < 0.7; });
    a.label = this.addLabel('✈ ' + a.name, a.x, a.elev + 90, a.z, 12000);
  };

  // ---------- landmarks ----------
  P.buildLandmark = function (l) {
    const g = new THREE.Group(); g.position.set(l.x, l.y - 0.5, l.z);
    const sh = !!this.Q.shadows;
    const add = (m) => { m.castShadow = sh; g.add(m); return m; };
    if (l.key === 'lighthouse') {
      const white = lam(0xf4f1ea), red = lam(0xd23c3c);
      for (let i = 0; i < 6; i++) add(mesh(new THREE.CylinderGeometry(4.2 - (i + 1) * 0.25, 4.2 - i * 0.25, 5.5, 14), i % 2 ? red : white, 0, 2.75 + i * 5.5, 0));
      add(mesh(new THREE.CylinderGeometry(4.3, 4.3, 0.8, 14), lam(0x333a40), 0, 33.4, 0));
      add(mesh(new THREE.CylinderGeometry(2.4, 2.4, 4, 12), new THREE.MeshBasicMaterial({ color: 0xfff2a8 }), 0, 35.8, 0));
      add(mesh(new THREE.ConeGeometry(3.2, 3, 12), red, 0, 39.3, 0));
      add(mesh(new THREE.BoxGeometry(9, 5, 7), white, 10, 2.5, 0));
      const piv = new THREE.Group(); piv.position.y = 35.8; g.add(piv);
      const bg = new THREE.ConeGeometry(18, 170, 16, 1, true); bg.translate(0, -85, 0); bg.rotateZ(Math.PI / 2);
      const bm = new THREE.MeshBasicMaterial({ color: 0xfff1a0, transparent: true, opacity: 0.13, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: true });
      const b1 = mesh(bg, bm); const b2 = mesh(bg, bm); b2.rotation.y = Math.PI; piv.add(b1, b2);
      this.nightHooks.push(n => { bm.opacity = 0.13 + 0.3 * n; });
      this.anims.push(dt => { piv.rotation.y += dt * 1.2; });
    } else if (l.key === 'windmill') {
      add(mesh(new THREE.CylinderGeometry(3.2, 5, 20, 8), lam(0xe9dfc8), 0, 10, 0));
      add(mesh(new THREE.ConeGeometry(4.4, 5.5, 8), lam(0x7a4b2e), 0, 22.7, 0));
      const piv = new THREE.Group(); piv.position.set(0, 19.5, -4.6); g.add(piv);
      piv.add(mesh(new THREE.CylinderGeometry(0.8, 0.8, 1.5, 8).rotateX(Math.PI / 2), lam(0x5a3a22)));
      for (let k = 0; k < 4; k++) {
        const arm = new THREE.Group(); arm.rotation.z = k * Math.PI / 2;
        arm.add(mesh(new THREE.BoxGeometry(2.6, 14, 0.25), lam(0xf5f0e6), 1.0, 8, 0));
        arm.add(mesh(new THREE.BoxGeometry(0.4, 15, 0.4), lam(0x6b4a2b), 0, 7.5, 0.2));
        piv.add(arm);
      }
      g.rotation.y = Math.random() * 6;
      this.anims.push(dt => { piv.rotation.z += dt * 1.0; });
    } else if (l.key === 'castle') {
      const stone = lam(0xa59d8f), dark = lam(0x8b8376), roof = lam(0x3b5fa8);
      add(mesh(new THREE.BoxGeometry(50, 10, 3), stone, 0, 5, 25)); add(mesh(new THREE.BoxGeometry(50, 10, 3), stone, 0, 5, -25));
      add(mesh(new THREE.BoxGeometry(3, 10, 50), stone, 25, 5, 0)); add(mesh(new THREE.BoxGeometry(3, 10, 50), stone, -25, 5, 0));
      for (const sx of [-25, 25]) for (const sz of [-25, 25]) {
        add(mesh(new THREE.CylinderGeometry(5, 5.6, 18, 10), dark, sx, 9, sz));
        add(mesh(new THREE.ConeGeometry(6.4, 9, 10), roof, sx, 22.5, sz));
      }
      add(mesh(new THREE.BoxGeometry(18, 24, 18), stone, 0, 12, 0));
      add(mesh(new THREE.CylinderGeometry(4, 4, 10, 10), dark, 0, 29, 0));
      add(mesh(new THREE.ConeGeometry(5.2, 8, 10), roof, 0, 38, 0));
      add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 8, 4), lam(0x333333), 0, 45, 0));
      const flag = mesh(new THREE.PlaneGeometry(5, 3), lam(0xe0392b, { side: THREE.DoubleSide }), 2.5, 47.5, 0); g.add(flag);
      this.anims.push((dt, t) => { flag.rotation.y = Math.sin(t * 2) * 0.3; });
    } else if (l.key === 'tower') {
      const red = lam(0xd8352a), white = lam(0xf0f0f0);
      for (let i = 0; i < 6; i++) { const r0 = 3.6 - i * 0.5, r1 = 3.6 - (i + 1) * 0.5; add(mesh(new THREE.CylinderGeometry(r1, r0, 20, 4), i % 2 ? white : red, 0, 10 + i * 20, 0)); }
      add(mesh(new THREE.BoxGeometry(10, 5, 8), lam(0xcfcac0), 8, 2.5, 6));
      const lightM = new THREE.MeshBasicMaterial({ color: 0xff2020 });
      const light = mesh(new THREE.SphereGeometry(1.5, 8, 6), lightM, 0, 121, 0); g.add(light);
      this.anims.push((dt, t) => { light.visible = (t % 1.2) < 0.6; });
    } else if (l.key === 'bigtree') {
      add(mesh(new THREE.CylinderGeometry(4, 7, 46, 8), lam(0x5e3f24), 0, 23, 0));
      const greens = [0x3f8a32, 0x4b9a3a, 0x367a2c, 0x56a844];
      const pts = [[0, 52, 0, 22], [14, 46, -4, 15], [-13, 47, 6, 16], [4, 44, 15, 14], [-5, 45, -14, 15], [6, 62, 3, 14], [-6, 58, -4, 13]];
      pts.forEach((p, i) => add(mesh(new THREE.IcosahedronGeometry(p[3], 0), lam(greens[i % 4], { flatShading: true }), p[0], p[1], p[2])));
    } else if (l.key === 'wreck') {
      g.position.y = 0;
      const hull = new THREE.Group(); hull.rotation.set(0.08, Math.random() * 6, 0.32); hull.position.y = -1.8; g.add(hull);
      hull.add(mesh(new THREE.BoxGeometry(11, 8, 36), lam(0x6b4a2f), 0, 0, 0));
      const bow = new THREE.ConeGeometry(5.5, 10, 4); bow.rotateX(-Math.PI / 2); bow.rotateZ(Math.PI / 4); bow.scale(1, 0.72, 1);
      hull.add(mesh(bow, lam(0x5d3f27), 0, 0, -23));
      hull.add(mesh(new THREE.BoxGeometry(10, 0.6, 30), lam(0x8a6a45), 0, 4.2, 0));
      hull.add(mesh(new THREE.CylinderGeometry(0.5, 0.6, 22, 6), lam(0x4a3420), 0, 15, -5));
      const m2 = mesh(new THREE.CylinderGeometry(0.5, 0.6, 12, 6), lam(0x4a3420), 0, 10, 8); m2.rotation.x = 0.5; hull.add(m2);
    } else if (l.key === 'volcano') {
      const v = this.volcano;
      g.position.set(v.x, v.floor + 4, v.z);
      const glow = mesh(new THREE.CircleGeometry(v.r * 0.075, 20), new THREE.MeshBasicMaterial({ color: 0xff5a1a, fog: true }), 0, 0, 0);
      glow.rotation.x = -Math.PI / 2; g.add(glow);
      this.smokeEmitters.push({ x: v.x, y: v.floor + 20, z: v.z, rate: 0.12, t: 0, kind: 'volcano' });
      this.anims.push((dt, t) => { glow.material.color.setRGB(1, 0.32 + Math.sin(t * 3) * 0.06, 0.08); });
    }
    this.scene.add(g);
    l.group = g;
    l.label = this.addLabel(l.emoji + ' ' + l.name, l.x, Math.max(l.y, 0) + (l.key === 'volcano' ? 120 : l.key === 'tower' ? 150 : 90), l.z, 6500, '#ffe9a8');
  };

  // ---------- ambient life ----------
  P.buildAmbient = function (R) {
    // sailboats
    const sailShape = new THREE.Shape(); sailShape.moveTo(0, 0); sailShape.lineTo(0, 11); sailShape.lineTo(5.5, 0); sailShape.closePath();
    const sailGeo = new THREE.ShapeGeometry(sailShape);
    for (let b = 0, tries = 0; b < 9 && tries < 3000; tries++) {
      const cx = (R() * 2 - 1) * 9000, cz = (R() * 2 - 1) * 9000, rad = 200 + R() * 400;
      let ok = true;
      for (let k = 0; k < 10 && ok; k++) if (this.heightAt(cx + Math.cos(k * 0.628) * rad, cz + Math.sin(k * 0.628) * rad) > -6) ok = false;
      if (!ok || this.heightAt(cx, cz) > -6) continue;
      // only near islands (not deep empty ocean)
      if (this.heightAt(cx, cz) < -150) continue;
      const g = new THREE.Group();
      const hull = mesh(new THREE.BoxGeometry(3.2, 1.6, 9), lam(R() < 0.5 ? 0xffffff : 0x2f5d8a), 0, 0.4, 0); g.add(hull);
      g.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 12, 4), lam(0x666666), 0, 6.5, 0));
      const sail = mesh(sailGeo, lam([0xffffff, 0xff6b6b, 0xffd23f, 0x6bc4ff][b % 4], { side: THREE.DoubleSide }), 0, 1.2, 0.2); sail.rotation.y = Math.PI / 2; g.add(sail);
      this.scene.add(g);
      const st = { a: R() * 6.28, sp: (4 + R() * 4) / rad * (R() < 0.5 ? 1 : -1) };
      this.anims.push((dt, t) => {
        st.a += st.sp * dt;
        g.position.set(cx + Math.cos(st.a) * rad, Math.sin(t * 1.3 + b) * 0.3, cz + Math.sin(st.a) * rad);
        g.rotation.y = -st.a + (st.sp > 0 ? Math.PI : 0);
        g.rotation.z = Math.sin(t * 0.9 + b) * 0.05;
      });
      b++;
    }
    // hot-air balloons
    const cols = [[0xff5a5a, 0xffd23f], [0x4aa3ff, 0xffffff], [0x7c4dff, 0x3ddc84], [0xff8c42, 0x2b2d42], [0xff6fae, 0xffffff]];
    for (let i = 0; i < 6; i++) {
      const cx = (R() * 2 - 1) * 3500, cz = (R() * 2 - 1) * 3500;
      const base = Math.max(this.maxHeightAround(cx, cz, 700), 0) + 220 + R() * 300;
      const g = new THREE.Group();
      const env = new THREE.SphereGeometry(10, 16, 12);
      const pos = env.attributes.position, carr = new Float32Array(pos.count * 3), c1 = new THREE.Color(cols[i % 5][0]), c2 = new THREE.Color(cols[i % 5][1]);
      for (let v = 0; v < pos.count; v++) { const ang = Math.atan2(pos.getZ(v), pos.getX(v)); const c = (Math.floor((ang + Math.PI) / (Math.PI / 4)) % 2) ? c1 : c2; carr[v * 3] = c.r; carr[v * 3 + 1] = c.g; carr[v * 3 + 2] = c.b; }
      env.setAttribute('color', new THREE.BufferAttribute(carr, 3)); env.scale(1, 1.18, 1);
      g.add(mesh(env, new THREE.MeshLambertMaterial({ vertexColors: true })));
      g.add(mesh(new THREE.ConeGeometry(5, 6, 12, 1, true).rotateX(Math.PI), lam(cols[i % 5][0], { side: THREE.DoubleSide }), 0, -12.5, 0));
      g.add(mesh(new THREE.BoxGeometry(3, 2.4, 3), lam(0x8a5a2b), 0, -18, 0));
      this.scene.add(g);
      const st = { a: R() * 6.28, r: 400 + R() * 500 };
      this.anims.push((dt, t) => {
        st.a += dt * 0.004;
        g.position.set(cx + Math.cos(st.a) * st.r, base + Math.sin(t * 0.25 + i) * 12, cz + Math.sin(st.a) * st.r);
      });
    }
  };

  P.placeTreasures = function (R) {
    const pts = [];
    this.landmarks.forEach(l => {
      const a = R() * 6.28, d = 250 + R() * 300;
      pts.push([l.x + Math.cos(a) * d, l.z + Math.sin(a) * d]);
    });
    let tries = 0;
    while (pts.length < 15 && tries++ < 5000) {
      const x = (R() * 2 - 1) * 9000, z = (R() * 2 - 1) * 9000;
      const h = this.heightAt(x, z);
      if (h < -60) continue;
      if (pts.some(p => Math.hypot(p[0] - x, p[1] - z) < 1800)) continue;
      pts.push([x, z]);
    }
    const geo = new THREE.OctahedronGeometry(6, 0);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffd23f, emissive: 0xc08000, emissiveIntensity: 0.8 });
    pts.slice(0, 15).forEach(([x, z], i) => {
      const y = Math.max(this.maxHeightAround(x, z, 120), 0) + 50 + R() * 160;
      const m = mesh(geo, mat, x, y, z); m.scale.set(1, 1.5, 1);
      this.scene.add(m);
      this.treasures.push({ id: i, x, y, z, mesh: m });
    });
    this.anims.push((dt, t) => { this.treasures.forEach(tr => { if (tr.mesh.visible) { tr.mesh.rotation.y = t * 2 + tr.id; tr.mesh.position.y = tr.y + Math.sin(t * 2 + tr.id) * 2; } }); });
  };

  // ---------- 2D map image ----------
  P.buildMapImage = function () {
    const R = 640, c = document.createElement('canvas'); c.width = R; c.height = R;
    const ctx = c.getContext('2d'), img = ctx.createImageData(R, R), d = img.data;
    const L = [-0.5, 0.75, -0.45]; const ll = Math.hypot(...L); L[0] /= ll; L[1] /= ll; L[2] /= ll;
    for (let py = 0; py < R; py++) for (let px = 0; px < R; px++) {
      const x = -HALF + (px + 0.5) / R * SIZE, z = -HALF + (py + 0.5) / R * SIZE;
      const h = this.heightAt(x, z);
      let r, g, b;
      if (h < 0) {
        const t = Math.min(1, -h / 60);
        r = 70 + (20 - 70) * t; g = 205 + (95 - 205) * t; b = 205 + (160 - 205) * t;
      } else {
        const i = Math.round((x + HALF) / SP), j = Math.round((z + HALF) / SP), k = Math.min(N * N - 1, j * N + i);
        const ny = this.NY[k];
        if (h < 5) { r = 232; g = 214; b = 160; }
        else {
          const f = U.smoothstep(0, 0.3, this.forestMask(x, z));
          r = 120 - 70 * f; g = 180 - 70 * f; b = 90 - 45 * f;
          const rock = Math.max(U.smoothstep(380, 640, h) * 0.8, U.smoothstep(0.86, 0.68, ny));
          r += (135 - r) * rock; g += (125 - g) * rock; b += (112 - b) * rock;
          const snow = U.smoothstep(760, 860, h);
          r += (245 - r) * snow; g += (247 - g) * snow; b += (250 - b) * snow;
          const vi = this.volcanoInfluence(x, z) * U.smoothstep(10, 90, h);
          r += (70 - r) * vi; g += (60 - g) * vi; b += (58 - b) * vi;
        }
        const sh = U.clamp(0.55 + (this.NX[k] * L[0] + ny * L[1] + this.NZ[k] * L[2]) * 0.55, 0.45, 1.25);
        r *= sh; g *= sh; b *= sh;
      }
      const o = (py * R + px) * 4;
      d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    this.mapCanvas = c;
  };

  // ---------- day / night ----------
  // keyframes: hour, sky top, horizon, ground haze, sun/moon disc, light colour, light power, ambient power, ambient sky, ambient ground, sea brightness, cloud colour, cloud glow, night amount
  const TOD = [
    [0, 0x050b1f, 0x17223f, 0x0a1022, 0x9fb0d8, 0x9fb4f0, 0.5, 0.62, 0x6a80b8, 0x1c2230, 0.2, 0x343d56, 0.06, 1],
    [4.9, 0x081129, 0x1f2b4c, 0x0c1428, 0x9fb0d8, 0x9fb4f0, 0.5, 0.62, 0x6a80b8, 0x1c2230, 0.22, 0x343d56, 0.06, 1],
    [6.1, 0x3a5894, 0xf0a070, 0x7a6a78, 0xffa060, 0xffaa6a, 0.95, 1.0, 0xc8b8c8, 0x5a5048, 0.62, 0xf2b49a, 0.3, 0.3],
    [7.6, 0x2f74d0, 0xc4dcf0, 0x9fc3e0, 0xfff0d0, 0xfff1dc, 2.3, 1.75, 0xdcefff, 0x7f8c66, 1, 0xffffff, 0.55, 0],
    [16.9, 0x2f74d0, 0xc4dcf0, 0x9fc3e0, 0xfff0d0, 0xfff1dc, 2.3, 1.75, 0xdcefff, 0x7f8c66, 1, 0xffffff, 0.55, 0],
    [18.3, 0x34508c, 0xff9452, 0x8a6a70, 0xff7a3a, 0xff9a5a, 1.05, 1.05, 0xd0b0b8, 0x5a4a40, 0.62, 0xffa27a, 0.3, 0.3],
    [19.5, 0x0d1938, 0x343a62, 0x141a32, 0x9fb0d8, 0x9fb4f0, 0.5, 0.66, 0x6a80b8, 0x1c2230, 0.24, 0x3a4260, 0.08, 0.92],
    [24, 0x050b1f, 0x17223f, 0x0a1022, 0x9fb0d8, 0x9fb4f0, 0.5, 0.62, 0x6a80b8, 0x1c2230, 0.2, 0x343d56, 0.06, 1],
  ];
  let TODC = null; // converted to THREE.Color on first use (three.js loads after this file)

  // hours of game time per real second: days pass in ~12 minutes, nights in ~3
  P.advanceTime = function (dt) {
    const h = this.hour, nightTime = h >= 19.5 || h < 5;
    this.hour = (h + dt * (nightTime ? 9 / 180 : 14.5 / 720)) % 24;
  };
  P.clock = function () {
    const h = Math.floor(this.hour), m = Math.floor((this.hour - h) * 60 / 10) * 10;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  P.timeOfDay = function (h) {
    if (!this._tod) this._tod = { c: [1, 2, 3, 4, 5, 8, 9, 11].reduce((o, i) => (o[i] = new THREE.Color(), o), {}), n: [] };
    if (!TODC) TODC = TOD.map(k => k.map((v, i) => [1, 2, 3, 4, 5, 8, 9, 11].includes(i) ? new THREE.Color(v) : v));
    let i = 0; while (i < TODC.length - 2 && h >= TODC[i + 1][0]) i++;
    const A = TODC[i], B = TODC[i + 1], t = U.smoothstep(0, 1, (h - A[0]) / (B[0] - A[0])), o = this._tod;
    for (let k = 1; k < 14; k++) {
      if (o.c[k]) o.c[k].copy(A[k]).lerp(B[k], t); else o.n[k] = A[k] + (B[k] - A[k]) * t;
    }
    return o;
  };

  P.glowAtNight = function (mat, day, night, k) {
    const cd = new THREE.Color(day), cn = new THREE.Color(night);
    this.nightHooks.push(n => { mat.emissive.copy(cd).lerp(cn, n * k); });
  };

  // ---------- environment: time of day + weather ----------
  // wx.dark: storminess, wx.rain: rain amount, wx.flash: lightning, wx.fog: thick fog, wx.deck: low cloud layer
  P.applyEnv = function (cam) {
    const sky = this.sky.material.uniforms, wat = this.water.material.uniforms, cm = this.clouds.material, wx = this.wx;
    if (!this.envTmp) this.envTmp = { a: new THREE.Color(), b: new THREE.Color(), storm: new THREE.Color(0x707c88), stormTop: new THREE.Color(0x3c4856), fogGrey: new THREE.Color(0xb4bec8), cloudIn: new THREE.Color(0xd5dbe2), stormCloud: new THREE.Color(0x8a939e), moonDir: new THREE.Vector3() };
    const T = this.envTmp, tod = this.timeOfDay(this.hour), C = tod.c, N = tod.n;
    const d = wx.dark, fog = wx.fog;
    this.night = N[13];
    const lum = U.clamp(N[7] / 1.75, 0.3, 1); // overall daylight
    // sun and moon positions (sun rises in the east (+x), sets in the west)
    const th = (this.hour - 6) / 12 * Math.PI, el = Math.sin(th);
    const sunUp = el > 0;
    if (sunUp) this.sunDir.set(Math.cos(th), el * 0.82, el * 0.42 + 0.12).normalize();
    else this.sunDir.set(-Math.cos(th), -el * 0.8, 0.3).normalize();
    const bodyEl = Math.abs(el);
    // fog colour and visibility
    const fogC = this.scene.fog.color;
    T.a.copy(T.storm).multiplyScalar(Math.max(lum, 0.3));
    fogC.copy(C[2]).lerp(T.a, d);
    T.b.copy(T.fogGrey).multiplyScalar(Math.max(lum, 0.22));
    fogC.lerp(T.b, fog * 0.9);
    // inside the low cloud layer
    let inCloud = 0;
    if (this.deck && wx.deck > 0.01) {
      const y = cam.position.y, D = this.deck;
      inCloud = wx.deck * U.smoothstep(D.base - 25, D.base + 25, y) * (1 - U.smoothstep(D.top - 25, D.top + 25, y));
      T.b.copy(T.cloudIn).multiplyScalar(Math.max(lum, 0.2));
      fogC.lerp(T.b, inCloud);
    }
    this.inCloud = inCloud;
    sky.uHorizon.value.copy(fogC);
    T.a.copy(T.stormTop).multiplyScalar(Math.max(lum, 0.3));
    sky.uTop.value.copy(C[1]).lerp(T.a, d).lerp(fogC, Math.max(fog, inCloud));
    sky.uBottom.value.copy(C[3]).lerp(fogC, Math.max(d, fog, inCloud));
    const veil = Math.max(d * 0.9, fog, inCloud, wx.deck * (cam.position.y < (this.deck ? this.deck.base : 0) ? 0.8 : 0));
    sky.uSunColor.value.copy(C[4]).multiplyScalar((1 - veil) * (sunUp ? 1 : 0.5) * U.smoothstep(-0.03, 0.05, bodyEl));
    // lights
    const hide = U.smoothstep(0, 0.12, bodyEl);
    this.hemi.intensity = N[7] * (1 - 0.3 * d) + wx.flash * 3;
    this.hemi.color.copy(C[8]); this.hemi.groundColor.copy(C[9]);
    this.sun.color.copy(C[5]);
    this.sun.intensity = N[6] * hide * (1 - 0.7 * Math.max(d, fog * 0.6, wx.deck * 0.5));
    // sea
    wat.uFogColor.value.copy(fogC); wat.uSkyHorizon.value.copy(fogC);
    wat.uSkyTop.value.copy(sky.uTop.value);
    wat.uSunColor.value.copy(C[4]).multiplyScalar((1 - 0.85 * veil) * hide * (sunUp ? 1 : 0.35));
    wat.uAmb.value.setScalar(N[10] * (1 - 0.3 * d));
    // clouds
    cm.color.copy(C[11]).lerp(T.stormCloud, d * 0.8);
    cm.emissiveIntensity = N[12] * (1 - 0.6 * d) + wx.flash * 0.8;
    // visibility
    let far = this.Q.view * (1 - 0.5 * wx.rain - 0.12 * d);
    const fogVis = Math.min(far, 650 + Math.max(0, cam.position.y - 120) * 1.4);
    far = U.lerp(far, fogVis, fog);
    far = U.lerp(far, 130, inCloud);
    const near = far * (0.2 - 0.17 * Math.max(fog, inCloud));
    this.scene.fog.near = near; this.scene.fog.far = far;
    wat.uFogNear.value = near; wat.uFogFar.value = far;
    this.visibility = far;
    // night extras
    this.lightsOn = U.clamp(Math.max(this.night * 1.25, fog, wx.deck * 0.7, wx.rain * 0.8, d * 0.8), 0, 1);
    for (const f of this.nightHooks) f(this.night);
    if (this.stars) this.stars.material.opacity = U.smoothstep(0.4, 1, this.night) * (1 - veil);
    if (this.lightMat) {
      const u = this.lightMat.uniforms;
      u.uOn.value = this.lightsOn; u.uFar.value = far; u.uTime.value = this.time; u.uPix.value = this.renderer.getPixelRatio();
    }
    if (this.deck) {
      const u = this.deck.mat.uniforms;
      u.uCover.value = wx.deck * 0.86;
      u.uCol.value.copy(T.cloudIn).multiplyScalar(Math.max(lum * (1 - 0.45 * d), 0.16));
      u.uFogColor.value.copy(fogC); u.uFogNear.value = near; u.uFogFar.value = far;
      this.deck.group.visible = wx.deck > 0.01;
    }
  };

  // ---------- night lights: runways, approach strobes, PAPI, aprons ----------
  const LIGHT_VS = `
    attribute vec3 color; attribute float aSize; attribute float aPhase; attribute float aPapi;
    uniform float uOn; uniform float uTime; uniform float uFar; uniform float uPix;
    varying vec3 vCol; varying float vA;
    void main(){
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vec4 mv = viewMatrix * wp;
      float d = -mv.z;
      float blink = aPhase < 0.0 ? 1.0 : step(fract(uTime * 0.9 - aPhase), 0.07);
      vCol = color;
      if (aPapi > 0.0) {
        vec3 tc = cameraPosition - wp.xyz;
        float ang = degrees(atan(tc.y, length(tc.xz)));
        vCol = ang > aPapi ? vec3(1.0, 0.97, 0.9) : vec3(1.0, 0.12, 0.08);
      }
      gl_PointSize = clamp(aSize * 1100.0 / max(d, 1.0), 4.0, 30.0) * uPix * (aPhase < 0.0 ? 1.0 : 1.6);
      vA = uOn * blink * (1.0 - smoothstep(uFar * 1.15, uFar * 2.2 + 600.0, d));
      gl_Position = projectionMatrix * mv;
    }`;
  const LIGHT_FS = `
    varying vec3 vCol; varying float vA;
    void main(){
      float r = length(gl_PointCoord - 0.5) * 2.0;
      float a = 1.0 - smoothstep(0.15, 1.0, r);
      float core = 1.0 - smoothstep(0.0, 0.45, r);
      if (vA * a < 0.01) discard;
      gl_FragColor = vec4(vCol * (0.7 + core * 1.3), a * vA);
    }`;
  P.lightMaterial = function () {
    if (!this.lightMat) {
      this.lightMat = new THREE.ShaderMaterial({
        vertexShader: LIGHT_VS, fragmentShader: LIGHT_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uOn: { value: 0 }, uTime: { value: 0 }, uFar: { value: 10000 }, uPix: { value: 1 } },
      });
    }
    return this.lightMat;
  };
  // builds a Points object from [x, y, z, hex, size, phase, papi] entries
  P.makeLightPoints = function (list) {
    const n = list.length, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), ph = new Float32Array(n), papi = new Float32Array(n), c = new THREE.Color();
    list.forEach((l, i) => {
      pos[i * 3] = l[0]; pos[i * 3 + 1] = l[1]; pos[i * 3 + 2] = l[2];
      c.setHex(l[3]); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      size[i] = l[4]; ph[i] = l[5] == null ? -1 : l[5]; papi[i] = l[6] || 0;
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1)); g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1)); g.setAttribute('aPapi', new THREE.BufferAttribute(papi, 1));
    const p = new THREE.Points(g, this.lightMaterial()); p.frustumCulled = false; p.renderOrder = 6;
    return p;
  };
  P.airportLights = function (a) {
    const L = this.lightList, v = new THREE.Vector3(), rot = -a.hdg * D2R, y = a.elev + 0.8;
    const add = (x, z, hex, size, phase, papi, yy) => { v.set(x, 0, z).applyAxisAngle(FH.UP, rot); L.push([a.x + v.x, yy == null ? y : a.elev + yy, a.z + v.z, hex, size, phase, papi]); };
    for (let z = -450; z <= 450; z += 50) { const amber = Math.abs(z) > 330 ? 0xffc65a : 0xfff4dc; add(-25, z, amber, 3, null); add(25, z, amber, 3, null); }
    for (let z = -420; z <= 420; z += 40) add(0, z, 0xeef4ff, 1.6, null);
    for (const e of [1, -1]) {
      for (let x = -21; x <= 21; x += 3.5) add(x, e * 466, 0x3dff74, 3, null);
      for (let x = -21; x <= -11; x += 3.5) add(x, e * 457, 0xff3a30, 2.4, null);
      for (let x = 11; x <= 21; x += 3.5) add(x, e * 457, 0xff3a30, 2.4, null);
      // approach lights with the "rabbit" strobe running toward the runway
      for (let i = 0; i < 9; i++) {
        const z = e * (495 + i * 34);
        for (let x = -8; x <= 8; x += 4) add(x, z, 0xfff6e0, 2.4, null, 0, 1.2);
        add(0, z, 0xffffff, 4, (8 - i) * 0.035, 0, 1.6);
      }
      // PAPI: two white + two red = on the glide path
      const side = -e;
      [3.1, 3.5, 3.9, 4.3].forEach((ang, k) => add(side * (36 + k * 7), e * 360, 0xffffff, 3.4, null, ang, 1.2));
    }
    // apron edge lights (blue)
    for (let z = -170; z <= 170; z += 34) { add(45, z, 0x4a7dff, 2, null); add(195, z, 0x4a7dff, 2, null); }
    for (let x = 45; x <= 195; x += 30) { add(x, -170, 0x4a7dff, 2, null); add(x, 170, 0x4a7dff, 2, null); }
    add(110, 120, 0xffffff, 3, (a.id % 4) * 0.25, 0, 28.5); // tower beacon flash
  };
  P.buildLightPoints = function () {
    this.runwayLights = this.makeLightPoints(this.lightList);
    this.scene.add(this.runwayLights);
  };
  // navigation lights for an aircraft model: red left tip, green right tip, white tail and strobes
  P.addNavLights = function (model) {
    let minX = null, maxX = null, maxZ = null;
    const v = new THREE.Vector3();
    model.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(model.matrixWorld).invert();
    model.traverse(o => {
      if (!o.isMesh || !o.geometry.attributes.position) return;
      const p = o.geometry.attributes.position, m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(m);
        if (!minX || v.x < minX.x) minX = v.clone();
        if (!maxX || v.x > maxX.x) maxX = v.clone();
        if (!maxZ || v.z > maxZ.z) maxZ = v.clone();
      }
    });
    if (!minX) return null;
    const pts = this.makeLightPoints([
      [minX.x - 0.15, minX.y, minX.z, 0xff2a2a, 0.5, null], [maxX.x + 0.15, maxX.y, maxX.z, 0x2aff5a, 0.5, null],
      [maxZ.x, maxZ.y + 0.1, maxZ.z + 0.1, 0xffffff, 0.45, null],
      [minX.x - 0.15, minX.y, minX.z, 0xffffff, 0.7, 0.0], [maxX.x + 0.15, maxX.y, maxX.z, 0xffffff, 0.7, 0.0],
    ]);
    model.add(pts);
    return pts;
  };

  P.buildStars = function () {
    const R = FH.mulberry32(4242), n = 1400, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = R() * 2 - 1, a = R() * Math.PI * 2, y = Math.abs(u) * 0.95 + 0.05, r = Math.sqrt(1 - y * y);
      pos[i * 3] = Math.cos(a) * r * 15000; pos[i * 3 + 1] = y * 15000; pos[i * 3 + 2] = Math.sin(a) * r * 15000;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xdfe8ff, size: 1.7, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    this.stars.frustumCulled = false; this.stars.renderOrder = -9;
    this.scene.add(this.stars);
  };

  // ---------- low cloud layer (weather) ----------
  const DECK_VS = `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
  const DECK_FS = `
    uniform sampler2D uTex; uniform vec3 uCol; uniform float uCover; uniform vec2 uOff; uniform float uLayer;
    uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar;
    varying vec3 vW;
    void main(){
      vec2 uv = vW.xz / 2400.0 + uOff + uLayer * 0.37;
      float n = texture2D(uTex, uv).r * 0.62 + texture2D(uTex, uv * 3.3 + 0.21).r * 0.38;
      float a = smoothstep(1.05 - uCover * 0.85, 1.25 - uCover * 0.85, n + uLayer * 0.05);
      float dist = length(cameraPosition - vW);
      a *= 1.0 - smoothstep(11000.0, 15000.0, dist);
      if (a < 0.01) discard;
      float under = cameraPosition.y < vW.y ? 0.7 : 1.0;
      vec3 col = uCol * (0.82 + 0.25 * n) * under;
      col = mix(col, uFogColor, smoothstep(uFogNear, uFogFar, dist) * 0.85);
      gl_FragColor = vec4(col, a * 0.92);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`;
  P.buildCloudDeck = function () {
    // tileable value noise texture
    const S = 256, data = new Uint8Array(S * S * 4), R = FH.mulberry32(this.seed * 31 + 5);
    const grids = [8, 16, 32, 64].map(p => { const g = new Float32Array(p * p); for (let i = 0; i < g.length; i++) g[i] = R(); return [p, g]; });
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let v = 0, amp = 0.5, tot = 0;
      for (const [p, g] of grids) {
        const fx = x / S * p, fy = y / S * p, ix = Math.floor(fx), iy = Math.floor(fy), tx = U.smoothstep(0, 1, fx - ix), ty = U.smoothstep(0, 1, fy - iy);
        const at = (i, j) => g[((j % p) * p) + (i % p)];
        v += amp * U.lerp(U.lerp(at(ix, iy), at(ix + 1, iy), tx), U.lerp(at(ix, iy + 1), at(ix + 1, iy + 1), tx), ty);
        tot += amp; amp *= 0.55;
      }
      const k = (y * S + x) * 4; data[k] = data[k + 1] = data[k + 2] = Math.round(v / tot * 255); data[k + 3] = 255;
    }
    const tex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
    const base = Math.max(480, ...this.airports.map(a => a.elev + 380)), top = base + 190;
    const group = new THREE.Group(); group.visible = false;
    const mat = new THREE.ShaderMaterial({
      vertexShader: DECK_VS, fragmentShader: DECK_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uTex: { value: tex }, uCol: { value: new THREE.Color(0xd5dbe2) }, uCover: { value: 0 }, uOff: { value: new THREE.Vector2() }, uLayer: { value: 0 },
        uFogColor: { value: new THREE.Color() }, uFogNear: { value: 100 }, uFogFar: { value: 10000 } },
    });
    const geo = new THREE.PlaneGeometry(32000, 32000, 1, 1); geo.rotateX(-Math.PI / 2);
    const layers = [];
    for (let i = 0; i < 4; i++) {
      const m = mat.clone(); m.uniforms = THREE.UniformsUtils.clone(mat.uniforms); m.uniforms.uTex.value = tex; m.uniforms.uLayer.value = i;
      const l = new THREE.Mesh(geo, m); l.position.y = base + i * (top - base) / 3; l.frustumCulled = false; l.renderOrder = 4;
      group.add(l); layers.push(l);
    }
    this.scene.add(group);
    // all layers share uniforms from the first one, except the layer index
    const shared = layers[0].material.uniforms;
    layers.forEach(l => { const u = l.material.uniforms; ['uCol', 'uCover', 'uOff', 'uFogColor', 'uFogNear', 'uFogFar'].forEach(k => u[k] = shared[k]); });
    this.deck = { base, top, group, layers, mat: layers[0].material };
  };

  // ---------- per-frame ----------
  P.setView = function (view) {
    this.Q.view = view;
    this.scene.fog.near = view * 0.22; this.scene.fog.far = view;
    const u = this.water.material.uniforms; u.uFogNear.value = view * 0.22; u.uFogFar.value = view;
  };

  P.update = function (dt, cam) {
    this.time += dt;
    const cp = cam.position;
    this.water.material.uniforms.uTime.value = this.time;
    this.water.position.set(cp.x, 0, cp.z);
    this.sky.position.copy(cp);
    if (this.stars) this.stars.position.copy(cp);
    if (this.deck) { this.deck.group.position.set(cp.x, 0, cp.z); const o = this.deck.mat.uniforms.uOff.value; o.x = this.time * 0.004; o.y = this.time * 0.0025; }
    this.applyEnv(cam);
    const view = this.Q.view + 1500, v2 = view * view;
    const hFactor = Math.max(0, cp.y) * 1.5;
    for (const c of this.chunks) {
      const dx = c.cx - cp.x, dz = c.cz - cp.z;
      const d = Math.max(0, Math.sqrt(dx * dx + dz * dz) - 1400);
      c.mesh.visible = d * d < v2 + hFactor * hFactor;
    }
    const tv = this.Q.view * 0.75;
    for (const c of this.treeCells) {
      const d = Math.max(0, Math.hypot(c.cx - cp.x, c.cz - cp.z) - c.r);
      c.mesh.visible = d < tv;
    }
    for (const a of this.anims) a(dt, this.time);
    for (const l of this.labels) {
      const d = Math.hypot(l.x - cp.x, l.z - cp.z);
      l.sprite.visible = !this.hideLabels && d < l.maxD && d > l.minD;
    }
  };
})();

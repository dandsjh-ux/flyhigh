// FlyHigh - dynamic weather: wind, gusts, rain, thunderstorm cells, lightning, radar and ATC weather reports.
// Weather only starts once the pilot has cleared the starting rank (Cadet -> Junior Pilot).
(function () {
  const FH = window.FH, U = FH.util, D2R = Math.PI / 180;

  const KINDS = {
    clear: { icon: '☀️', name: 'Clear', nameR: 'Sunny', wind: [1, 4], rain: 0, dark: 0, fog: 0, deck: 0 },
    windy: { icon: '💨', name: 'Strong wind', nameR: 'Windy', wind: [11, 17], rain: 0, dark: 0.12, fog: 0, deck: 0 },
    rain: { icon: '🌧️', name: 'Rain', nameR: 'Rainy', wind: [5, 9], rain: 0.85, dark: 0.45, fog: 0, deck: 0 },
    storm: { icon: '⛈️', name: 'Thunderstorms', nameR: 'Stormy', wind: [8, 13], rain: 0.45, dark: 0.5, fog: 0, deck: 0 },
    fog: { icon: '🌫️', name: 'Thick fog', nameR: 'Foggy', wind: [0, 3], rain: 0, dark: 0.08, fog: 1, deck: 0 },
    cloud: { icon: '☁️', name: 'Low cloud', nameR: 'Cloudy', wind: [4, 8], rain: 0.12, dark: 0.28, fog: 0, deck: 1 },
  };
  const CARD8 = ['North', 'North-East', 'East', 'South-East', 'South', 'South-West', 'West', 'North-West'];
  const card8 = h => CARD8[Math.round(U.norm360(h) / 45) % 8];
  const pad3 = n => String(Math.round(n) % 360 || 360).padStart(3, '0');
  const DIG = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'niner'];
  const digits = n => pad3(n).split('').map(d => DIG[+d]).join(' ');

  const W = FH.Weather = {
    KINDS, kind: 'clear', t: 0, dur: 9999, time: 0,
    windDir: 270, windSpd: 0, windTarget: 2, gustMul: 1, rain: 0, dark: 0, flash: 0, fog: 0, deck: 0,
    cells: [], forceNext: null,

    init(game) {
      this.g = game; this.scene = game.scene; this.world = game.world;
      this.windVec = new THREE.Vector3();
      const N = { low: 500, medium: 1000, high: 1600 }[FH.Settings.data.quality] || 1000;
      this.rainN = N;
      this.drops = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) { this.drops[i * 3] = (Math.random() - 0.5) * 120; this.drops[i * 3 + 1] = (Math.random() - 0.5) * 80; this.drops[i * 3 + 2] = (Math.random() - 0.5) * 120; }
      const g = new THREE.BufferGeometry();
      this.rainPos = new Float32Array(N * 6);
      g.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3).setUsage(THREE.DynamicDrawUsage));
      this.rainMesh = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xc3d2e2, transparent: true, opacity: 0, depthWrite: false }));
      this.rainMesh.frustumCulled = false; this.rainMesh.visible = false;
      this.scene.add(this.rainMesh);
      this.flashEl = document.getElementById('flash');
      this._q = new THREE.Quaternion(); this._e = new THREE.Euler();
    },

    enabled() { const g = this.g; return !!(g.profile && g.rankIdx(g.profile.total) >= 1); },
    info() { return KINDS[this.kind]; },

    reset() {
      this.cells.forEach(c => this.scene.remove(c.group));
      this.cells = [];
      this.kind = 'clear'; this.t = 0; this.dur = 9999; this.windSpd = 0; this.windTarget = 2;
      this.rain = 0; this.dark = 0; this.flash = 0; this.fog = 0; this.deck = 0; this.forceNext = null;
      this.rainMesh.visible = false;
      Object.assign(this.world.wx, { dark: 0, rain: 0, flash: 0, fog: 0, deck: 0 });
      FH.Audio.setRain(0);
      if (this.flashEl) this.flashEl.style.opacity = 0;
    },

    // ---------- weather changes ----------
    intro() {
      const g = this.g;
      this.forceNext = 'windy'; this.t = 0; this.dur = 25;
      FH.UI.banner('🌦️ Weather unlocked!', g.rookie ? 'Wind, rain and storms are coming. Check your radar!' : 'Live weather is now active: wind, rain and thunderstorms.', 4200, 'gold');
      setTimeout(() => g.radio(g.rookie
        ? `${g.callsign()}, well done! You are a Junior Pilot now. From now on the weather can change. Listen to me for weather news, and look at the radar on your map!`
        : `${g.callsign()}, congratulations on your promotion. Live weather is now active. Monitor ATC weather reports and the weather radar on your map.`), 1500);
    },
    next() {
      let k = this.forceNext;
      this.forceNext = null;
      if (!k) {
        const rk = this.g.rookie;
        k = this.kind === 'clear'
          ? U.weighted([['windy', 28], ['rain', 18], ['storm', rk ? 20 : 28], ['fog', 16], ['cloud', 18], ['clear', 10]])
          : U.weighted([['clear', 45], ['windy', 15], ['rain', 12], ['storm', rk ? 9 : 15], ['fog', 10], ['cloud', 12]].filter(x => x[0] !== this.kind));
      }
      this.setKind(k);
    },
    setKind(k, silent) {
      const K = KINDS[k];
      const changed = k !== this.kind;
      this.kind = k; this.t = 0;
      this.dur = k === 'clear' ? 70 + Math.random() * 60 : 80 + Math.random() * 70;
      this.windTarget = K.wind[0] + Math.random() * (K.wind[1] - K.wind[0]);
      this.windDir = U.norm360(this.windDir + (Math.random() - 0.5) * 120);
      this.cells.forEach(c => c.dying = true);
      if (k === 'storm') this.spawnCells();
      if (changed && !silent) this.announce();
    },
    announce() {
      const g = this.g, rk = g.rookie, cs = g.callsign();
      const kts = Math.round(this.windTarget * 1.944), gust = Math.round(kts * 1.4 / 5) * 5;
      let text, speak;
      if (this.kind === 'windy') {
        text = rk ? `Weather news: it is very windy! The wind is blowing from the ${card8(this.windDir)}. Your plane will move and bump. Hold on tight!`
          : `All stations, weather update: strong winds from ${pad3(this.windDir)} at ${kts} knots, gusting ${gust}. Expect moderate turbulence and crosswinds on landing.`;
        speak = rk ? text : `All stations, weather update: strong winds from ${digits(this.windDir)} at ${kts} knots, gusting ${gust}. Expect moderate turbulence and crosswinds on landing.`;
      } else if (this.kind === 'rain') {
        text = rk ? 'Weather news: it is raining now. It is hard to see far away. Fly carefully and use your map!'
          : 'All stations, weather update: moderate rain, visibility reduced. Use your instruments and moving map.';
      } else if (this.kind === 'storm') {
        const c = this.cells[0];
        const dir = c ? card8(Math.atan2(c.x - g.ac.pos.x, -(c.z - g.ac.pos.z)) / D2R) : 'north';
        text = rk ? `Storm warning! There are thunderstorms to the ${dir}. Look for the red circles on your radar and fly around them!`
          : `All stations, SIGMET: thunderstorms developing ${dir.toLowerCase()} of your position. Avoid red cells on weather radar. Severe turbulence and lightning.`;
        FH.Audio.sfx('alert');
      } else if (this.kind === 'fog') {
        text = rk ? 'Weather news: thick fog! It is very hard to see. The runway lights are on. Use your map, fly higher than the hills, and follow the green rings to land.'
          : 'All stations, weather update: dense fog, visibility less than one kilometre. Low visibility procedures in force, runway and approach lights on. Watch your terrain clearance.';
      } else if (this.kind === 'cloud') {
        const D = this.world.deck, b = D ? Math.round(D.base * 3.281 / 100) * 100 : 2000, t = D ? Math.round(D.top * 3.281 / 100) * 100 : 2600;
        text = rk ? `Weather news: low clouds! The clouds start at ${U.fmt(b)} feet. Inside a cloud everything is white. Fly under the clouds to see the ground, or climb above them!`
          : `All stations, weather update: overcast, cloud base ${U.fmt(b)} feet, tops ${U.fmt(t)} feet. Expect zero visibility in cloud. Remain clear of cloud near high terrain.`;
      } else {
        text = rk ? 'Good news! The weather is sunny and calm again.' : 'All stations, weather update: conditions improving, winds light and variable.';
      }
      g.radio(text, true, speak || text);
      FH.UI.toast(`${KINDS[this.kind].icon} ${rk ? KINDS[this.kind].nameR : KINDS[this.kind].name}`, 'info', 3500);
    },

    // ---------- thunderstorm cells ----------
    spawnCells() {
      const g = this.g, ac = g.ac, rk = g.rookie;
      const n = rk ? 2 : 3, avoid = g.mission && g.mission.airport;
      for (let i = 0, tries = 0; i < n && tries < 200; tries++) {
        const a = (ac.hdg + (Math.random() - 0.5) * 140) * D2R, d = 3500 + Math.random() * 4000;
        const x = ac.pos.x + Math.sin(a) * d, z = ac.pos.z - Math.cos(a) * d;
        if (Math.abs(x) > 8800 || Math.abs(z) > 8800) continue;
        if (this.cells.some(c => !c.dying && Math.hypot(c.x - x, c.z - z) < 3000)) continue;
        if (avoid && Math.hypot(avoid.x - x, avoid.z - z) < 2200) continue;
        if (g.world.airports.some(ap => Math.hypot(ap.x - x, ap.z - z) < 1200)) continue;
        this.addCell(x, z, (rk ? 800 : 950) + Math.random() * 450);
        i++;
      }
    },
    addCell(x, z, r) {
      const group = new THREE.Group();
      const mat = new THREE.MeshLambertMaterial({ color: 0x4a525c, emissive: 0x000000 });
      const parts = [];
      for (let k = 0; k < 11; k++) {
        const geo = new THREE.IcosahedronGeometry(1, 1);
        const pr = r * (0.3 + Math.random() * 0.25);
        geo.scale(pr, pr * 0.85, pr);
        const a = Math.random() * 6.28, dd = Math.random() * r * 0.5;
        geo.translate(Math.cos(a) * dd, 1300 + Math.random() * 1400, Math.sin(a) * dd);
        parts.push(geo);
      }
      const anvil = new THREE.IcosahedronGeometry(1, 1); anvil.scale(r * 1.15, r * 0.22, r * 1.0); anvil.translate(r * 0.15, 3000, 0); parts.push(anvil);
      const body = new THREE.Mesh(FH.mergeGeometries(parts), mat);
      group.add(body);
      const shaftMat = new THREE.MeshBasicMaterial({ color: 0x5b6774, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.75, 1400, 24, 1, true), shaftMat);
      shaft.position.y = 650; group.add(shaft);
      const boltGeo = new THREE.BufferGeometry(); boltGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(14 * 3), 3));
      const bolt = new THREE.Line(boltGeo, new THREE.LineBasicMaterial({ color: 0xf2f6ff }));
      bolt.visible = false; bolt.frustumCulled = false; group.add(bolt);
      group.position.set(x, 0, z); group.scale.set(1, 0.05, 1);
      this.scene.add(group);
      this.cells.push({ x, z, r, intensity: 0, dying: false, group, mat, shaftMat, bolt, strikeT: 2 + Math.random() * 4, boltT: 0 });
    },
    distToCell(c, x, z) { return Math.hypot(c.x - x, c.z - z) - c.r; },
    stormProximity(pos) {
      let m = 0;
      for (const c of this.cells) { const d = Math.hypot(c.x - pos.x, c.z - pos.z) / c.r; m = Math.max(m, c.intensity * (1 - U.smoothstep(0.6, 1.9, d))); }
      return m;
    },
    turbulenceAt(pos) {
      let t = Math.min(1, this.windSpd / 16) * 0.55 * this.gustMul;
      for (const c of this.cells) { const d = Math.hypot(c.x - pos.x, c.z - pos.z) / c.r; t = Math.max(t, c.intensity * (1 - U.smoothstep(0.4, 1.35, d)) * 1.4); }
      return t;
    },
    // nearest storm cell in front of the plane
    threatAhead(ac) {
      let best = null;
      for (const c of this.cells) {
        if (c.dying || c.intensity < 0.5) continue;
        const dist = this.distToCell(c, ac.pos.x, ac.pos.z);
        const brg = U.norm360(Math.atan2(c.x - ac.pos.x, -(c.z - ac.pos.z)) / D2R);
        const rel = U.angDiff(ac.hdg, brg);
        const inside = dist < 0;
        if ((inside || (dist < 4500 && Math.abs(rel) < 55)) && (!best || dist < best.dist)) best = { cell: c, dist, rel, brg, inside };
      }
      return best;
    },
    isStormy(x, z, margin = 300) { return this.cells.some(c => !c.dying && this.distToCell(c, x, z) < margin); },

    strike(c) {
      const g = this.g, ac = g.ac;
      // aim near the plane if it is inside the storm core
      const dp = Math.hypot(c.x - ac.pos.x, c.z - ac.pos.z) / c.r;
      let sx, sz;
      if (dp < 0.55 && !ac.onGround && Math.random() < (this.g.rookie ? 0.3 : 0.45)) { sx = ac.pos.x + (Math.random() - 0.5) * 300; sz = ac.pos.z + (Math.random() - 0.5) * 300; }
      else { const a = Math.random() * 6.28, d = Math.random() * c.r * 0.6; sx = c.x + Math.cos(a) * d; sz = c.z + Math.sin(a) * d; }
      const ground = Math.max(0, g.world.heightAt(sx, sz));
      const pa = c.bolt.geometry.attributes.position, n = pa.count;
      let x = sx - c.x, z = sz - c.z;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1), y = 1300 + (ground - 1300) * t;
        pa.setXYZ(i, x, y, z);
        x += (Math.random() - 0.5) * 140; z += (Math.random() - 0.5) * 140;
      }
      pa.setXYZ(n - 1, sx - c.x, ground, sz - c.z);
      pa.needsUpdate = true;
      c.bolt.visible = true; c.boltT = 0.18;
      const dist = Math.hypot(sx - g.camera.position.x, sz - g.camera.position.z);
      this.flash = Math.max(this.flash, U.clamp(1.1 - dist / 6000, 0.08, 1));
      FH.Audio.thunder(U.clamp(1.2 - dist / 9000, 0.15, 1), Math.min(3.5, dist / 343));
      // did it hit the plane?
      if (!ac.onGround && !ac.crashed && Math.hypot(sx - ac.pos.x, sz - ac.pos.z) < 380 && ac.pos.y < 3200) {
        ac.powerLoss = g.rookie ? 1.5 : 3;
        this.flash = 1;
        g.combo = 0;
        FH.UI.toast(g.rookie ? '⚡ Lightning hit your plane! The engine stopped for a moment.' : '⚡ Lightning strike! Temporary engine power loss.', 'bad', 4000);
        g.profile.stats.strikes = (g.profile.stats.strikes || 0) + 1;
      }
    },

    // ---------- per frame ----------
    update(dt) {
      const g = this.g, ac = g.ac;
      if (!g.profile || !ac) return;
      this.time += dt;
      const on = this.enabled();
      if (on && !g.profile.wxIntro) { g.profile.wxIntro = true; g.saveProfile(); this.intro(); }
      if (on) { this.t += dt; if (this.t > this.dur) this.next(); }
      else if (this.kind !== 'clear') this.setKind('clear', true);

      const K = KINDS[this.kind];
      const local = this.stormProximity(ac.pos);
      this.windSpd = U.approach(this.windSpd, this.windTarget, dt * 0.8);
      this.gustMul = 1 + 0.45 * Math.max(0, Math.sin(this.time * 0.63) * Math.sin(this.time * 1.71 + 1.3));
      const ws = this.windSpd * this.gustMul;
      this.windVec.set(-Math.sin(this.windDir * D2R) * ws, 0, Math.cos(this.windDir * D2R) * ws);
      this.rain = U.approach(this.rain, Math.max(K.rain, local * 0.9), dt * 0.12);
      this.dark = U.approach(this.dark, Math.max(K.dark, local * 0.75), dt * 0.1);
      this.fog = U.approach(this.fog, K.fog, dt * 0.07);
      this.deck = U.approach(this.deck, K.deck, dt * 0.06);

      // storm cells
      for (let i = this.cells.length - 1; i >= 0; i--) {
        const c = this.cells[i];
        c.intensity = U.approach(c.intensity, c.dying ? 0 : 1, dt / 12);
        c.x += this.windVec.x * 0.25 * dt; c.z += this.windVec.z * 0.25 * dt;
        c.group.position.set(c.x, 0, c.z);
        c.group.scale.y = 0.05 + 0.95 * U.smoothstep(0, 1, c.intensity);
        c.shaftMat.opacity = 0.32 * c.intensity;
        if (c.dying && c.intensity <= 0) { this.scene.remove(c.group); c.group.traverse(o => { if (o.geometry) o.geometry.dispose(); }); this.cells.splice(i, 1); continue; }
        if (c.intensity > 0.6) {
          c.strikeT -= dt;
          if (c.strikeT <= 0) { this.strike(c); const dp = Math.hypot(c.x - ac.pos.x, c.z - ac.pos.z) / c.r; c.strikeT = dp < 0.6 ? 2.5 + Math.random() * 3 : 3 + Math.random() * 6; }
        }
        if (c.boltT > 0) { c.boltT -= dt; c.mat.emissive.setRGB(0.5, 0.55, 0.7); if (c.boltT <= 0) { c.bolt.visible = false; c.mat.emissive.setRGB(0, 0, 0); } }
      }

      // rain streaks around the camera
      this.updateRain(dt);
      this.flash = Math.max(0, this.flash - dt * 4);
      if (this.flashEl) this.flashEl.style.opacity = (this.flash * 0.55).toFixed(3);
      Object.assign(this.world.wx, { dark: this.dark, rain: this.rain, flash: this.flash, fog: this.fog, deck: this.deck });
      FH.Audio.setRain(this.rain);
    },

    updateRain(dt) {
      const show = this.rain > 0.02;
      this.rainMesh.visible = show;
      if (!show) return;
      this.rainMesh.material.opacity = this.rain * 0.55;
      const cp = this.g.camera.position, d = this.drops, p = this.rainPos, w = this.windVec, v = this.g.ac;
      const fall = 32, len = 3.2;
      const vx = v ? v._f.x * v.speed : 0, vy = v ? v._f.y * v.speed : 0, vz = v ? v._f.z * v.speed : 0;
      const sx = (w.x - vx) * 0.04, sy = (-fall - vy) * 0.04, sz = (w.z - vz) * 0.04;
      for (let i = 0; i < this.rainN; i++) {
        let x = d[i * 3] + (w.x - vx) * dt, y = d[i * 3 + 1] + (-fall - vy) * dt, z = d[i * 3 + 2] + (w.z - vz) * dt;
        if (x > 60) x -= 120; else if (x < -60) x += 120;
        if (y > 40) y -= 80; else if (y < -40) y += 80;
        if (z > 60) z -= 120; else if (z < -60) z += 120;
        d[i * 3] = x; d[i * 3 + 1] = y; d[i * 3 + 2] = z;
        const o = i * 6, s = len / Math.max(1, Math.hypot(sx, sy, sz));
        p[o] = cp.x + x; p[o + 1] = cp.y + y; p[o + 2] = cp.z + z;
        p[o + 3] = cp.x + x - sx * s; p[o + 4] = cp.y + y - sy * s; p[o + 5] = cp.z + z - sz * s;
      }
      this.rainMesh.geometry.attributes.position.needsUpdate = true;
    },

    // pushes, bumps and downdrafts on the aircraft (airborne only)
    applyToAircraft(ac, dt, rookie, rig) {
      if (ac.onGround || ac.crashed) { rig.shake = 0; return; }
      const k = rookie ? 0.5 : 1;
      ac.pos.x += this.windVec.x * dt * 0.85 * k;
      ac.pos.z += this.windVec.z * dt * 0.85 * k;
      const tb = this.turbulenceAt(ac.pos) * k;
      rig.shake = tb;
      if (tb > 0.02) {
        const t = this.time;
        const roll = (Math.sin(t * 3.1) + 0.6 * Math.sin(t * 5.7 + 1) + 0.3 * Math.sin(t * 11.3)) * 0.45 * tb;
        const pitch = (Math.sin(t * 2.3 + 2) + 0.5 * Math.sin(t * 7.1)) * 0.22 * tb;
        this._q.setFromEuler(this._e.set(pitch * dt, 0, -roll * dt));
        ac.quat.multiply(this._q);
        ac.pos.y += (Math.sin(t * 1.7) + 0.7 * Math.sin(t * 4.3 + 3)) * 4 * tb * dt;
      }
      for (const c of this.cells) {
        const d = Math.hypot(c.x - ac.pos.x, c.z - ac.pos.z) / c.r;
        if (d < 0.8) ac.pos.y -= 7 * c.intensity * (0.8 - d) / 0.8 * dt * k;
      }
    },
  };
})();

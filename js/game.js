// FlyHigh - gameplay: word gates, ATC, missions, treasures, progression, saving
(function () {
  const FH = window.FH, U = FH.util, D2R = Math.PI / 180;

  const RANKS = [[0, 'Cadet', '🎓'], [800, 'Junior Pilot', '🛩️'], [2500, 'Pilot', '✈️'], [6000, 'Senior Pilot', '🧭'], [12000, 'Captain', '👨‍✈️'], [22000, 'Ace', '⭐'], [40000, 'Sky Legend', '🏆']];
  FH.RANKS = RANKS;
  const CARGO_R = [['apples', '🍎'], ['bananas', '🍌'], ['bread', '🍞'], ['milk', '🥛'], ['books', '📚'], ['medicine', '💊'], ['letters', '✉️'], ['toys', '🧸'], ['flowers', '💐'], ['fish', '🐟'], ['pizzas', '🍕']];
  const CARGO_N = [['medical supplies', '💊'], ['fresh produce', '🥬'], ['scientific equipment', '🔬'], ['the island mail', '✉️'], ['spare engine parts', '⚙️'], ['emergency blankets', '🧣'], ['camera equipment', '📷'], ['tropical fruit', '🍍'], ['school textbooks', '📚']];
  const GATE_COLORS = [0x36c5ff, 0xff7ad9, 0xffb13b, 0x9d7bff];

  function textCanvas(text, color = '#ffffff') {
    const c = document.createElement('canvas'), x = c.getContext('2d');
    const fs = 64, font = `700 ${fs}px Fredoka, Nunito, sans-serif`;
    x.font = font; const w = Math.max(160, Math.ceil(x.measureText(text).width) + 50);
    c.width = w; c.height = fs + 40; x.font = font;
    x.fillStyle = 'rgba(8,24,48,0.78)';
    const r = 26; x.beginPath(); x.moveTo(r, 0); x.arcTo(w, 0, w, c.height, r); x.arcTo(w, c.height, 0, c.height, r); x.arcTo(0, c.height, 0, 0, r); x.arcTo(0, 0, w, 0, r); x.fill();
    x.fillStyle = color; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, w / 2, c.height / 2 + 3);
    return c;
  }

  const G = FH.Game = {
    state: 'title', rookie: true, profile: null, ac: null, gate: null, atc: null, mission: null,
    eventT: 18, time: 0, combo: 0, smoke: false, crashT: 0, saveT: 0, board: null, boardAirport: null,

    init(ctx) {
      Object.assign(this, ctx);
      this.rig = new FH.CameraRig(this.camera);
      this.fx = new FH.Particles(this.scene, 2500);
      this.ev = { crash: t => this.onCrash(t), touchdown: v => this.onTouchdown(v), liftoff: () => this.onLiftoff() };
      // mission beacon
      const bg = new THREE.CylinderGeometry(14, 14, 2400, 16, 1, true); bg.translate(0, 1200, 0);
      this.beacon = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      this.beacon.visible = false; this.scene.add(this.beacon);
      // approach rings
      this.aprRings = [];
      const rg = new THREE.TorusGeometry(1, 0.06, 8, 40);
      for (let i = 0; i < 4; i++) {
        const m = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0x4dff88, transparent: true, opacity: 0.75 }));
        m.visible = false; this.scene.add(m); this.aprRings.push(m);
      }
      this.apr = null;
      this.attractA = 0;
      FH.Weather.init(this);
    },

    // ---------- profiles ----------
    newProfile(mode, name) {
      return {
        v: 1, mode, name, fp: 0, total: 0, rank: 0,
        planes: { sparrow: { engine: 0, wings: 0, fuel: 0 } }, current: 'sparrow', paint: { sparrow: 'red' }, paints: ['red'],
        words: {}, treasures: [], tut: 0, lastAirport: 0,
        stats: { gates: 0, gatesRight: 0, atc: 0, atcDone: 0, readbacks: 0, missions: 0, landings: 0, butter: 0, quiz: 0, quizRight: 0, flightTime: 0, crashes: 0 },
      };
    },
    key(mode) { return 'flyhigh_save_' + mode; },
    loadProfile(mode) {
      try { const s = localStorage.getItem(this.key(mode)); return s ? JSON.parse(s) : null; } catch (e) { return null; }
    },
    saveProfile() {
      if (!this.profile) return;
      try { localStorage.setItem(this.key(this.profile.mode), JSON.stringify(this.profile)); } catch (e) { }
    },
    resetProfile(mode) { try { localStorage.removeItem(this.key(mode)); } catch (e) { } },
    callsign() { const n = (this.profile && this.profile.name) || 'FlyHigh'; return U.cap(n); },
    rankIdx(total) { let r = 0; RANKS.forEach((k, i) => { if (total >= k[0]) r = i; }); return r; },

    // ---------- start / spawn ----------
    startMode(mode) {
      FH.Audio.init();
      const p = this.loadProfile(mode);
      if (!p) {
        FH.UI.askName(mode, name => { this.profile = this.newProfile(mode, name); this.saveProfile(); this.begin(); });
      } else { this.profile = p; this.begin(); }
    },
    begin() {
      const p = this.profile;
      this.rookie = p.mode === 'rookie';
      FH.Audio.speechRate = this.rookie ? 0.88 : 1;
      FH.Vocab.init(p.mode, p.words);
      this.world.treasures.forEach(t => { t.mesh.visible = !p.treasures.includes(t.id); });
      this.spawnPlane();
      const ap = this.world.airports[p.lastAirport] || this.world.airports[0];
      this.placeOnRunway(ap);
      this.gate = null; this.atc = null; this.clearMission(); this.combo = 0; this.eventT = 25; this.board = null; this.avoidCd = 0;
      FH.Weather.reset(); this.cruise = null; this.rig.cinematic = false; FH.UI.cruise(false); this.radioLog = {}; this.clearedAt = {};
      if (FH.Weather.enabled() && p.wxIntro) { FH.Weather.t = 0; FH.Weather.dur = 40; }
      if (p.tut < 6 || p.total < 300) this.world.hour = 9;
      this.wasNight = this.world.night > 0.6;
      this.state = 'flying';
      this.world.hideLabels = false;
      FH.UI.enterGame(this);
      this.radio(this.rookie
        ? `Hello ${this.callsign()}! This is ${ap.name} tower. You can take off on runway ${ap.rwy[0]}. Have fun!`
        : `${this.callsign()}, ${ap.name} tower, runway ${ap.rwy[0]}, cleared for take-off.`);
      this.tutT = 0;
      if (p.tut < 6) this.tutorial(true);
    },
    spawnPlane() {
      const p = this.profile;
      if (this.ac) this.scene.remove(this.ac.model);
      const def = FH.planeById(p.current);
      const paint = FH.PAINTS[p.paint[def.id] || 'red'];
      this.ac = new FH.Aircraft(def, p.planes[def.id], paint, { assist: this.rookie, fuelMult: this.rookie ? 0.5 : 1, shadows: this.world.Q.shadows });
      this.scene.add(this.ac.model);
      this.world.addNavLights(this.ac.model);
      this.rig.reset();
    },
    placeOnRunway(ap) {
      this.ac.place(ap.x - ap.fx * 430, ap.z - ap.fz * 430, ap.hdg, this.world);
      this.ac.fuel = 1;
      this.rig.reset();
      this.apr = null;
    },

    // ---------- money / rank ----------
    earn(n, label) {
      n = Math.round(n);
      if (n <= 0) return;
      const p = this.profile; p.fp += n; p.total += n;
      FH.UI.fpGain(n, label);
      FH.Audio.sfx('coin');
      const r = this.rankIdx(p.total);
      if (r > p.rank) {
        p.rank = r;
        setTimeout(() => {
          FH.Audio.sfx('levelup');
          FH.UI.banner(`${RANKS[r][2]} Rank up!`, `You are now a ${RANKS[r][1]}!`, 3500, 'gold');
          FH.Audio.speak(`Congratulations! You are now a ${RANKS[r][1]}!`);
        }, 900);
      }
      this.saveProfile();
    },
    spend(n) {
      if (this.profile.fp < n) return false;
      this.profile.fp -= n; this.saveProfile(); return true;
    },
    comboMult() { return this.combo >= 5 ? 2 : this.combo >= 3 ? 1.5 : 1; },

    // ---------- main loop ----------
    frame(dt) {
      this.time += dt;
      FH.Input.poll(dt);
      const w = this.world;
      if (FH.Settings.data.daynight === false) w.hour = 11;
      else if (this.state === 'title' || this.state === 'flying') w.advanceTime(dt * (this.cruise ? this.cruise.speedup : 1));
      if (this.state === 'title') {
        this.attract(dt);
        w.update(dt, this.camera);
        this.emitters(dt); this.fx.update(dt);
        return;
      }
      const active = this.state === 'flying';
      if (active) this.updateFlight(dt);
      if (this.state !== 'paused' && this.state !== 'map') this.rig.update(dt, this.ac, w);
      w.followSun(this.ac.pos);
      w.update(dt, this.camera);
      this.emitters(dt);
      this.fx.update(dt);
      FH.Audio.updateEngine(this.ac.def.jet ? 'jet' : 'prop', this.ac.eff, this.ac.speed / this.ac.st.maxSpeed, this.ac.fuel > 0 && !this.ac.crashed, active || this.state === 'hangar');
      if (active) FH.UI.hud(this, dt);
    },

    attract(dt) {
      const ap = this.world.airports[0];
      this.attractA += dt * 0.035;
      const r = 900;
      this.camera.position.set(ap.x + Math.cos(this.attractA) * r, ap.elev + 260 + Math.sin(this.attractA * 0.7) * 60, ap.z + Math.sin(this.attractA) * r);
      this.camera.up.set(0, 1, 0);
      this.camera.lookAt(ap.x, ap.elev + 40, ap.z);
      this.world.followSun(this.camera.position);
    },

    emitters(dt) {
      const cp = this.camera.position;
      for (const e of this.world.smokeEmitters) {
        if (Math.hypot(e.x - cp.x, e.z - cp.z) > 11000) continue;
        e.t -= dt;
        while (e.t <= 0) {
          e.t += e.rate;
          this.fx.emit(e.x + (Math.random() - 0.5) * 40, e.y, e.z + (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 3 + 2, 7 + Math.random() * 4, (Math.random() - 0.5) * 3, 22, 40, 220, Math.random() < 0.5 ? 0x8a8580 : 0x6d6864, 0.45, 0.03, 0);
        }
      }
      if (this.rescueBoat && this.mission && this.mission.type === 'rescue') {
        const b = this.mission.boat;
        if (Math.hypot(b.x - cp.x, b.z - cp.z) < 9000) {
          this.flareT = (this.flareT || 0) - dt;
          while (this.flareT <= 0) { this.flareT += 0.12; this.fx.emit(b.x, 4, b.z, (Math.random() - 0.5) * 2 + 1.5, 6 + Math.random() * 2, (Math.random() - 0.5) * 2, 14, 6, 60, 0xff7a1a, 0.7, 0.05, 0.2); }
        }
      }
    },

    updateFlight(dt) {
      const ac = this.ac, w = this.world, p = this.profile;
      FH.Weather.update(dt);
      if (ac.crashed) {
        this.crashT -= dt;
        if (this.crashT <= 0) this.respawn();
        return;
      }
      if (this.cruise) {
        this.updateCruise(dt);
        if (this.cruise) {
          p.stats.flightTime += dt;
          if (this.mission) this.updateMission(dt);
          this.updateApproach();
          this.saveT += dt;
          return;
        }
      }
      ac.update(dt, FH.Input, w, this.ev);
      if (ac.crashed) return;
      // weather: wind drift, turbulence, downdrafts, and ATC storm deviations
      const wx = FH.Weather;
      wx.applyToAircraft(ac, dt, this.rookie, this.rig);
      this.avoidCd = (this.avoidCd || 0) - dt;
      if (!ac.onGround && wx.cells.length && this.avoidCd <= 0 && !(this.atc && this.atc.kind === 'avoid' && !this.atc.done)) {
        const th = wx.threatAhead(ac);
        if (th && !(th.inside ? th.cell.warnedIn : th.cell.warned)) {
          th.cell.warned = true; if (th.inside) th.cell.warnedIn = true;
          if (this.atc) this.cancelATC();
          const cmd = FH.ATC.avoid(this, th);
          this.atc = cmd; this.profile.stats.atc++;
          FH.UI.atcShow(cmd, this.rookie);
          FH.Audio.sfx('alert');
          setTimeout(() => FH.Audio.speak(cmd.speak, { rate: this.rookie ? 0.88 : 1.05 }), 700);
          this.avoidCd = 35;
        }
      }
      p.stats.flightTime += dt;
      this.dayNightCalls();
      // boundary
      const dC = Math.hypot(ac.pos.x, ac.pos.z);
      this.outOfBounds = dC > 9300;
      if (dC > 10500 && !ac.onGround) {
        const toC = U.norm360(Math.atan2(-ac.pos.x, ac.pos.z) / D2R);
        const d = U.angDiff(ac.hdg, toC);
        const q = new THREE.Quaternion().setFromAxisAngle(FH.UP, -Math.sign(d) * 0.6 * dt);
        ac.quat.premultiply(q);
      }
      // on the ground at an airport
      const at = ac.onGround ? w.airportAt(ac.pos.x, ac.pos.z) : null;
      this.atAirport = at ? at.airport : null;
      if (at && ac.speed < 6) {
        if (ac.fuel < 1) { ac.fuel = Math.min(1, ac.fuel + dt * 0.25); }
        if (this.mission && this.mission.landAt && this.mission.landAt === at.airport && !this.mission.completing) {
          this.mission.completing = true;
          this.completeMission();
        }
      }
      // smoke trail
      if (this.smoke && !ac.onGround) {
        this.smokeT = (this.smokeT || 0) - dt;
        while (this.smokeT <= 0) {
          this.smokeT += 0.035;
          const f = ac._f, back = 3.5 * ac.st.size;
          const c = FH.PAINTS[p.paint[ac.def.id] || 'red'];
          this.fx.emit(ac.pos.x - f.x * back, ac.pos.y - f.y * back, ac.pos.z - f.z * back, (Math.random() - 0.5), (Math.random() - 0.5) + 0.3, (Math.random() - 0.5), 6, 1.2, 6, c === 0x2b2d42 ? 0x666666 : c, 0.55, 0.3, 0.3);
        }
      }
      this.checkTreasures();
      if (this.gate) this.updateGate(dt);
      if (this.atc) this.updateATC(dt);
      if (this.mission) this.updateMission(dt);
      this.updateApproach();
      // event scheduler
      if (!this.gate && !this.atc && !ac.onGround && ac.agl > 45 && !this.nearLanding()) {
        this.eventT -= dt;
        if (this.eventT <= 0) {
          const first = this.lastEvent === 'gate' ? 'atc' : 'gate';
          const order = [first, first === 'gate' ? 'atc' : 'gate'];
          let done = null;
          for (const k of order) { if (k === 'gate' ? this.spawnGate() : this.issueATC()) { done = k; break; } }
          if (done) { this.lastEvent = done; this.eventT = (this.rookie ? 20 : 15) + Math.random() * 10; }
          else this.eventT = 4;
        }
      }
      this.cruiseCheck(dt);
      if (p.tut < 6) this.tutorial(false, dt);
      this.saveT += dt;
      if (this.saveT > 20) { this.saveT = 0; this.saveProfile(); }
    },

    dayNightCalls() {
      const n = this.world.night, cs = this.callsign();
      if (!this.wasNight && n > 0.6) {
        this.wasNight = true;
        this.radio(this.rookie ? `${cs}, the sun is going down. It will be dark soon! Look for the bright runway lights at the airports. Night landings give bonus FlightPoints!`
          : `All stations, official sunset. Airport lighting is on. Night landings and night missions earn a bonus.`);
      } else if (this.wasNight && n < 0.2) {
        this.wasNight = false;
        this.radio(this.rookie ? `Good morning, ${cs}! The sun is coming up. It is a new day!` : `All stations, good morning. Sunrise, daylight conditions.`);
      }
    },

    nearLanding() {
      const ac = this.ac, m = this.mission;
      if (m && m.airport && Math.hypot(m.airport.x - ac.pos.x, m.airport.z - ac.pos.z) < 3500) return true;
      const a = this.world.nearestAirport(ac.pos.x, ac.pos.z);
      return a && ac.agl < 200 && Math.hypot(a.x - ac.pos.x, a.z - ac.pos.z) < 2500;
    },

    safeAltFt() {
      const ac = this.ac;
      const h = this.world.maxHeightAround(ac.pos.x, ac.pos.z, 3500);
      return Math.ceil((h * 3.281 + 700) / 500) * 500;
    },

    // ---------- crash / landing ----------
    onCrash(type) {
      const ac = this.ac;
      ac.crashed = true; ac.model.visible = false; ac.speed = 0;
      const p = ac.pos;
      if (type === 'water') {
        this.fx.burst(p.x, 1, p.z, 70, 18, 2.2, 6, [0xffffff, 0xd8f2ff, 0x9fd8ff], 0.9);
      } else {
        this.fx.burst(p.x, p.y, p.z, 80, 22, 2.8, 9, [0xffb030, 0xff6a20, 0x555555, 0x333333], 0.95);
      }
      FH.Audio.sfx('crash');
      this.combo = 0;
      this.profile.stats.crashes++;
      this.cancelGate(); this.cancelATC();
      this.crashT = 3.2;
      FH.UI.banner('Oops! 💥', type === 'water' ? (this.rookie ? 'Splash! You flew into the water.' : 'You ditched in the ocean!') : (this.rookie ? 'Bump! You hit the ground.' : 'You crashed into the terrain!'), 3000, 'bad');
    },
    respawn() {
      const ap = this.world.nearestAirport(this.ac.pos.x, this.ac.pos.z);
      this.ac.model.visible = true;
      this.placeOnRunway(ap);
      FH.UI.banner(this.rookie ? "Let's try again! 🛩️" : 'Back on the runway', ap.name, 2200);
      this.radio(this.rookie ? `${this.callsign()}, you are safe at ${ap.name}. Take off when you are ready!` : `${this.callsign()}, ${ap.name} tower, runway ${ap.rwy[0]}, cleared for take-off.`);
    },
    onTouchdown(vs) {
      const at = this.world.airportAt(this.ac.pos.x, this.ac.pos.z);
      FH.Audio.sfx('touch');
      this.cancelGate();
      if (this.atc && !this.atc.done) this.cancelATC();
      if (at && at.onRunway) {
        this.profile.stats.landings++;
        if (vs < 1.3) { this.profile.stats.butter++; FH.UI.toast('🧈 Butter landing! Super smooth!', 'good'); this.earn(50, 'Landing'); }
        else if (vs < 2.6) { FH.UI.toast('👍 Smooth landing!', 'good'); this.earn(25, 'Landing'); }
        else { FH.UI.toast('😬 Firm landing!', ''); this.earn(10, 'Landing'); }
        const lowVis = this.world.night > 0.5 || FH.Weather.fog > 0.5 || this.world.inCloud > 0.5;
        if (lowVis) setTimeout(() => { FH.UI.toast(this.world.night > 0.5 ? (this.rookie ? '🌙 Night landing! Brilliant!' : '🌙 Night landing bonus!') : (this.rookie ? '🌫️ You landed in the fog! Amazing!' : '🌫️ Low-visibility landing bonus!'), 'good'); this.earn(30, this.world.night > 0.5 ? 'Night landing' : 'Low-vis landing'); }, 1600);
        if (FH.Weather.windSpd > 8) { setTimeout(() => { FH.UI.toast(this.rookie ? '💨 You landed in strong wind! Great job!' : '💨 Crosswind landing bonus!', 'good'); this.earn(35, 'Crosswind'); }, 900); }
        this.radio(this.rookie ? `Welcome to ${at.airport.name}! Slow down and stop on the runway.` : `${this.callsign()}, welcome to ${at.airport.name}. Vacate the runway when able.`);
      } else FH.UI.toast(this.rookie ? 'You landed on the grass!' : 'Off-airport landing!', '');
    },
    onLiftoff() {
      FH.Audio.sfx('whoosh');
      if (this.profile.tut === 1) { this.profile.tut = 2; this.tutT = 0; }
    },

    // ---------- radio ----------
    // every radio call is shown and spoken once; the same call within 3 minutes is ignored
    radio(text, speak = true, speakText = null) {
      this.radioLog = this.radioLog || {};
      const last = this.radioLog[text];
      if (last !== undefined && this.time - last < 180) return;
      this.radioLog[text] = this.time;
      FH.UI.radioInfo(text);
      FH.Audio.sfx('radio');
      if (speak) setTimeout(() => FH.Audio.speak(speakText || text, { rate: this.rookie ? 0.88 : 1.02 }), 250);
    },

    // ---------- word gates ----------
    spawnGate() {
      const ac = this.ac, w = this.world;
      const q = FH.Vocab.question({ gate: true });
      if (!q) return false;
      const h = ac.hdg * D2R, fx = Math.sin(h), fz = -Math.cos(h), rx = Math.cos(h), rz = Math.sin(h);
      const dist = U.clamp(ac.speed * 13, 550, 2400);
      const cx = ac.pos.x + fx * dist, cz = ac.pos.z + fz * dist;
      if (Math.hypot(cx, cz) > 9300) return false;
      if (FH.Weather.isStormy(cx, cz, 700)) return false;
      const R = 15 + ac.st.size * 6 + ac.speed * 0.07;
      const spacing = R * 2.8;
      let tmax = 0;
      for (let i = 0; i <= 8; i++) { const t = i / 8; tmax = Math.max(tmax, w.heightAt(ac.pos.x + fx * dist * t, ac.pos.z + fz * dist * t)); }
      for (let k = -1; k <= 1; k++) tmax = Math.max(tmax, w.heightAt(cx + rx * spacing * k, cz + rz * spacing * k));
      const y = Math.max(ac.pos.y, tmax + R + 60);
      if (y - ac.pos.y > 220) return false;
      const group = new THREE.Group();
      const items = q.options.map((opt, i) => {
        const pos = new THREE.Vector3(cx + rx * spacing * (i - 1), y, cz + rz * spacing * (i - 1));
        const color = GATE_COLORS[i % GATE_COLORS.length];
        const ring = new THREE.Mesh(new THREE.TorusGeometry(R, R * 0.085, 10, 48), new THREE.MeshBasicMaterial({ color }));
        ring.position.copy(pos); ring.rotation.y = Math.atan2(fx, fz);
        const cnv = textCanvas(opt);
        const tex = new THREE.CanvasTexture(cnv); tex.colorSpace = THREE.SRGBColorSpace;
        const lw = R * 1.75, lh = lw * cnv.height / cnv.width;
        const label = new THREE.Mesh(new THREE.PlaneGeometry(lw, lh), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false }));
        label.position.copy(pos); label.renderOrder = 6;
        group.add(ring); group.add(label);
        return { text: opt, correct: opt === q.answer, pos, ring, label, color };
      });
      this.scene.add(group);
      this.gate = { q, items, group, center: new THREE.Vector3(cx, y, cz), fx, fz, R, t: 0, life: dist / Math.max(ac.speed, 15) + 14, prevS: -dist, done: false };
      FH.UI.showQuestion(q, this.rookie);
      FH.Audio.sfx('whoosh');
      if (this.rookie) FH.Audio.speak(q.speak, { rate: 0.85 });
      return true;
    },
    updateGate(dt) {
      const g = this.gate, ac = this.ac;
      g.t += dt;
      const cp = this.camera.position;
      g.items.forEach(it => it.label.lookAt(cp));
      if (g.done) {
        g.doneT -= dt;
        const pulse = 1 + Math.sin(this.time * 12) * 0.06;
        g.items.forEach(it => { if (it.correct) it.ring.scale.setScalar(pulse); });
        if (g.doneT <= 0) this.removeGate();
        return;
      }
      g.items.forEach((it, i) => { it.ring.scale.setScalar(1 + Math.sin(this.time * 3 + i) * 0.03); });
      const s = (ac.pos.x - g.center.x) * g.fx + (ac.pos.z - g.center.z) * g.fz;
      if (g.prevS < 0 && s >= 0) {
        let hit = null, best = 1e9;
        for (const it of g.items) { const d = ac.pos.distanceTo(it.pos); if (d < g.R * 1.3 && d < best) { best = d; hit = it; } }
        this.resolveGate(hit, hit ? 'hit' : 'miss');
      } else if (g.t > g.life) this.resolveGate(null, 'timeout');
      g.prevS = s;
      if (this.gate && !this.gate.done) FH.UI.questionTimer(1 - g.t / g.life);
    },
    resolveGate(hit, why) {
      const g = this.gate, p = this.profile;
      g.done = true; g.doneT = 2.6;
      p.stats.gates++;
      const right = g.items.find(it => it.correct);
      right.ring.material.color.setHex(0x3ddc84);
      if (hit && hit.correct) {
        FH.Vocab.record(g.q.word, true);
        this.combo++; p.stats.gatesRight++;
        const base = this.rookie ? 35 : 40;
        const m = this.comboMult();
        this.fx.burst(hit.pos.x, hit.pos.y, hit.pos.z, 40, 30, 1.4, 4, [0xffe066, 0xffffff, 0x7dffb0], 1);
        FH.Audio.sfx('correct');
        this.earn(base * m, m > 1 ? `Correct! x${m}` : 'Correct!');
        FH.UI.questionResult(true, g.q, this.combo);
      } else if (hit) {
        FH.Vocab.record(g.q.word, false);
        this.combo = 0;
        hit.ring.material.color.setHex(0xff4d5e);
        FH.Audio.sfx('wrong');
        FH.UI.questionResult(false, g.q, 0);
        if (this.rookie) setTimeout(() => FH.Audio.speak(`The answer is ${g.q.answer}.`, { rate: 0.85 }), 500);
      } else {
        FH.UI.questionResult(null, g.q, this.combo);
      }
      this.saveProfile();
      if (p.tut === 3) { p.tut = 4; this.tutT = 0; }
    },
    cancelGate() { if (this.gate) { this.removeGate(); } },
    removeGate() {
      const g = this.gate; if (!g) return;
      this.scene.remove(g.group);
      g.group.traverse(o => { if (o.isMesh) { o.geometry.dispose(); if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
      this.gate = null;
      FH.UI.hideQuestion();
    },

    // ---------- ATC ----------
    issueATC() {
      const cmd = FH.ATC.make(this);
      if (!cmd) return false;
      this.atc = cmd;
      this.profile.stats.atc++;
      FH.UI.atcShow(cmd, this.rookie);
      FH.Audio.sfx('radio');
      setTimeout(() => FH.Audio.speak(cmd.speak, { rate: this.rookie ? 0.85 : 1.02 }), 300);
      return true;
    },
    updateATC(dt) {
      const c = this.atc, ac = this.ac;
      if (c.done) { c.doneT -= dt; if (c.doneT <= 0) { this.atc = null; FH.UI.atcHide(); } return; }
      c.t += dt;
      const s = { hdg: ac.hdg, alt: ac.altFt, kts: ac.kts, x: ac.pos.x, z: ac.pos.z };
      const ok = c.checks.every(f => f(s));
      c.holdT = ok ? c.holdT + dt : 0;
      FH.UI.atcLive(c.live(s), ok, Math.min(1, c.holdT / c.hold), 1 - c.t / c.time);
      if (c.holdT >= c.hold) {
        c.done = true; c.doneT = 3.5;
        this.profile.stats.atcDone++;
        FH.Audio.sfx('correct');
        this.earn(c.reward, 'ATC');
        const msg = c.kind === 'avoid'
          ? (this.rookie ? `Great job, ${this.callsign()}! You flew around the storm safely.` : `${this.callsign()}, clear of weather, thank you. Resume own navigation when able.`)
          : this.rookie ? U.pick(['Good job, ' + this.callsign() + '!', 'Well done!', 'Great flying!', 'Perfect, thank you!']) : U.pick([`${this.callsign()}, thank you.`, `${this.callsign()}, good job.`, `Thanks ${this.callsign()}, resume own navigation.`]);
        FH.UI.atcResult(true, msg);
        FH.Audio.speak(msg, { rate: this.rookie ? 0.9 : 1.05 });
        if (this.profile.tut === 4) { this.profile.tut = 5; this.tutT = 0; }
      } else if (c.t > c.time) {
        c.done = true; c.doneT = 3;
        FH.UI.atcResult(false, this.rookie ? "Time is up. That's OK — try the next one!" : 'Instruction expired. Stand by for further instructions.');
        if (this.profile.tut === 4) { this.profile.tut = 5; this.tutT = 0; }
      }
    },
    answerReadback(i) {
      const c = this.atc;
      if (!c || c.answered >= 0 || !c.rb || i >= c.rb.options.length) return;
      c.answered = i;
      const ok = i === c.rb.correct;
      FH.UI.readbackResult(i, c.rb.correct);
      if (ok) { this.profile.stats.readbacks++; FH.Audio.sfx('correct'); this.earn(this.rookie ? 15 : 20, 'Readback'); }
      else FH.Audio.sfx('wrong');
    },
    cancelATC() { if (this.atc) { this.atc = null; FH.UI.atcHide(); } },

    // ---------- missions ----------
    genMissions(n = 3) {
      const ac = this.ac;
      const here = this.world.airportAt(ac.pos.x, ac.pos.z, 300);
      const from = here ? here.airport : null;
      const types = U.shuffle(['ferry', 'delivery', 'sight', 'rescue', 'rings', 'medevac', 'drop', 'fire', 'tour', 'escort']);
      const out = [], used = new Set();
      for (const t of types) {
        if (used.has(t)) continue;
        const m = this.makeMission(t, from);
        if (m) { out.push(m); used.add(t); }
        if (out.length >= n) break;
      }
      return out;
    },
    makeMission(type, from) {
      const w = this.world, ac = this.ac, px = ac.pos.x, pz = ac.pos.z, rk = this.rookie;
      const tier = 1 + FH.planeIndex(this.profile.current) * 0.3, mm = rk ? 1 : 1.15;
      const R10 = x => Math.round(x / 10) * 10;
      const MT = FH.MissionTypes[type];
      if (MT) return MT.make(this, from, tier, mm, R10);
      const night = w.night > 0.5;
      if (type === 'ferry' || type === 'delivery') {
        const cands = w.airports.filter(a => a !== from && Math.hypot(a.x - px, a.z - pz) > 2500);
        if (!cands.length) return null;
        const a = U.pick(cands), km = Math.hypot(a.x - px, a.z - pz) / 1000;
        if (type === 'ferry' && night) return {
          type, airport: a, landAt: a, emoji: '🌙', km, reward: R10((200 + km * 50) * tier * mm),
          title: rk ? `Night mail to ${a.name}` : `Night mail run: ${a.name}`,
          desc: rk ? `Take the night letters ✉️ to ${a.name}. Follow the runway lights and land!` : `Fly the overnight mail to ${a.name}. Use the approach lights and PAPI (two red, two white) to land.`,
        };
        if (type === 'ferry') return {
          type, airport: a, landAt: a, emoji: '🛬', km, reward: R10((160 + km * 40) * tier * mm),
          title: rk ? `Fly to ${a.name}` : `Reposition to ${a.name}`,
          desc: rk ? `Fly to ${a.name} and land on the runway. Stop the plane to finish.` : `Ferry the aircraft to ${a.name} on ${a.island} and make a safe landing.`,
        };
        const cargo = U.pick(rk ? CARGO_R : CARGO_N), bonus = FH.planeById(this.profile.current).cargo || 1;
        return {
          type, airport: a, landAt: a, cargo, emoji: cargo[1], km, reward: R10((210 + km * 45) * tier * mm * bonus),
          title: rk ? `Deliver the ${cargo[0]}` : `Cargo run to ${a.name}`,
          desc: rk ? `Take the ${cargo[0]} ${cargo[1]} to ${a.name}. Land, stop, then answer the cargo check!` : `Transport ${cargo[0]} ${cargo[1]} to ${a.name}. Pass the vocabulary cargo check to unload.`,
        };
      }
      if (type === 'sight') {
        const cands = w.landmarks.filter(l => Math.hypot(l.x - px, l.z - pz) > 1200);
        if (!cands.length) return null;
        const l = U.pick(cands), km = Math.hypot(l.x - px, l.z - pz) / 1000, n = l.name.toLowerCase();
        return {
          type, landmark: l, emoji: l.emoji, km, reward: R10((140 + km * 40) * tier * mm),
          title: rk ? `Visit the ${n}` : `Aerial survey: ${l.name}`,
          desc: rk ? `Find the ${n} ${l.emoji} and fly over it. Stay low — under 2,000 feet!` : `Locate the ${n} and make a low pass overhead (below 2,000 ft above the ground) to photograph it.`,
        };
      }
      if (type === 'rescue') {
        for (let t = 0; t < 400; t++) {
          const is = U.pick(w.islands), a = Math.random() * Math.PI * 2, d = is.r * (1.05 + Math.random() * 0.5);
          const x = is.x + Math.cos(a) * d, z = is.z + Math.sin(a) * d;
          const h = w.heightAt(x, z), dist = Math.hypot(x - px, z - pz);
          if (h > -8 || h < -120 || dist < 2500 || dist > 9500 || Math.hypot(x, z) > 9200) continue;
          const oa = Math.random() * 6.28, od = Math.random() * 550;
          const km = dist / 1000;
          return {
            type, boat: { x, z }, area: { x: x + Math.cos(oa) * od, z: z + Math.sin(oa) * od, r: 900 }, island: is.name, emoji: '🛟', km,
            reward: R10((290 + km * 40) * tier * mm),
            title: rk ? 'Find the lost boat' : 'Search and rescue',
            desc: rk ? `A boat is lost near ${is.name}. Look for orange smoke! Fly low over the boat.` : `A fishing vessel has reported an emergency near ${is.name}. Search the area, locate the vessel and fly low overhead.`,
          };
        }
        return null;
      }
      if (type === 'rings') {
        const n = rk ? 5 : 7;
        return {
          type, n, emoji: '⭕', km: 0, reward: R10((260 + n * 35) * tier * mm),
          title: rk ? 'Ring Race' : 'Precision course',
          desc: rk ? `Fly through all ${n} gold rings, in order. Be quick for a bonus!` : `Navigate through ${n} rings in sequence. Faster times earn a bonus.`,
        };
      }
      return null;
    },
    acceptMission(m) {
      this.clearMission();
      this.mission = m; m.t = 0;
      const w = this.world, MT = FH.MissionTypes[m.type];
      this.beacon.material.color.setHex(0xffd23f);
      if (MT) MT.accept(this, m);
      else if (m.airport) { this.beacon.position.set(m.airport.x, m.airport.elev, m.airport.z); this.beacon.visible = true; }
      else if (m.landmark) { this.beacon.position.set(m.landmark.x, Math.max(0, m.landmark.y), m.landmark.z); this.beacon.visible = true; }
      else if (m.type === 'rescue') {
        const g = new THREE.Group();
        g.add(new THREE.Mesh(new THREE.BoxGeometry(4, 2, 11), FH.lam(0xe8572a)));
        const cab = new THREE.Mesh(new THREE.BoxGeometry(3, 2.5, 3.5), FH.lam(0xffffff)); cab.position.set(0, 2.1, 1); g.add(cab);
        g.position.set(m.boat.x, 0.5, m.boat.z); g.rotation.y = Math.random() * 6;
        this.scene.add(g); this.rescueBoat = g;
        if (this.rookie) { this.beacon.position.set(m.area.x, 0, m.area.z); this.beacon.visible = true; }
      } else if (m.type === 'rings') this.buildRings(m);
      FH.UI.missionShow(m);
      this.radio(this.rookie ? `New mission: ${m.title}. ${m.desc}` : `${this.callsign()}, mission assigned: ${m.title}.`, true);
    },
    buildRings(m) {
      const ac = this.ac, w = this.world;
      let hdg = ac.hdg, x = ac.pos.x, z = ac.pos.z, y = ac.pos.y;
      if (ac.onGround) {
        x += Math.sin(hdg * D2R) * 1500; z += -Math.cos(hdg * D2R) * 1500; y = ac.pos.y + 150;
      } else { x += Math.sin(hdg * D2R) * 900; z += -Math.cos(hdg * D2R) * 900; }
      const spacing = 650 + ac.st.maxSpeed * 6;
      const R = 20 + ac.st.size * 8 + ac.st.maxSpeed * 0.05;
      m.rings = []; m.ringIdx = 0; m.R = R;
      const group = new THREE.Group();
      const geo = new THREE.TorusGeometry(R, R * 0.08, 10, 48);
      let prevX = ac.pos.x, prevZ = ac.pos.z;
      for (let i = 0; i < m.n; i++) {
        if (i > 0) {
          hdg += (Math.random() - 0.5) * 70;
          const toC = U.norm360(Math.atan2(-x, z) / D2R);
          if (Math.hypot(x, z) > 7000) hdg += U.clamp(U.angDiff(hdg, toC), -40, 40);
          prevX = x; prevZ = z;
          x += Math.sin(hdg * D2R) * spacing; z += -Math.cos(hdg * D2R) * spacing;
          y += (Math.random() - 0.4) * 80;
        }
        const ground = Math.max(0, w.maxHeightAround(x, z, R * 2));
        y = Math.max(y, ground + R + 70);
        const nx = x - prevX, nz = z - prevZ, nl = Math.hypot(nx, nz) || 1;
        const ring = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.9 }));
        ring.position.set(x, y, z); ring.rotation.y = Math.atan2(nx / nl, nz / nl);
        group.add(ring);
        m.rings.push({ pos: new THREE.Vector3(x, y, z), nx: nx / nl, nz: nz / nl, mesh: ring, prevS: -1 });
      }
      this.scene.add(group); m.group = group;
      m.par = (spacing * m.n + 1500) / (ac.st.maxSpeed * 0.85);
      this.updateRingLook(m);
    },
    updateRingLook(m) {
      m.rings.forEach((r, i) => {
        r.mesh.visible = i >= m.ringIdx;
        r.mesh.material.color.setHex(i === m.ringIdx ? 0xffd23f : 0xffffff);
        r.mesh.material.opacity = i === m.ringIdx ? 0.95 : 0.35;
      });
    },
    targetOf(m) {
      if (!m) return null;
      if (FH.MissionTypes[m.type]) return FH.MissionTypes[m.type].target(this, m);
      if (m.airport) return { x: m.airport.x, y: m.airport.elev + 30, z: m.airport.z, label: m.airport.name };
      if (m.landmark) return { x: m.landmark.x, y: Math.max(0, m.landmark.y) + 40, z: m.landmark.z, label: m.landmark.name };
      if (m.type === 'rescue') return this.rookie || m.found ? { x: m.area.x, y: 30, z: m.area.z, label: 'Search area' } : { x: m.area.x, y: 30, z: m.area.z, label: 'Search area' };
      if (m.type === 'rings' && m.rings && m.rings[m.ringIdx]) { const r = m.rings[m.ringIdx]; return { x: r.pos.x, y: r.pos.y, z: r.pos.z, label: `Ring ${m.ringIdx + 1}/${m.n}` }; }
      return null;
    },
    updateMission(dt) {
      const m = this.mission, ac = this.ac;
      m.t += dt;
      this.beacon.material.opacity = 0.16 + Math.sin(this.time * 3) * 0.06;
      if (m.completing) return;
      if (FH.MissionTypes[m.type]) { FH.MissionTypes[m.type].update(this, m, dt); return; }
      if (m.type === 'sight') {
        const l = m.landmark, d = Math.hypot(l.x - ac.pos.x, l.z - ac.pos.z);
        if (d < 450) {
          if (ac.pos.y - Math.max(0, l.y) < 610) { m.completing = true; this.completeMission(); }
          else FH.UI.warn(this.rookie ? '⬇ Fly lower to see it!' : '⬇ Descend below 2,000 ft above the ground', 1);
        }
      } else if (m.type === 'rescue') {
        const b = m.boat, d = Math.hypot(b.x - ac.pos.x, b.z - ac.pos.z);
        if (d < 380) {
          if (ac.agl < 460) { m.completing = true; this.completeMission(); }
          else FH.UI.warn(this.rookie ? '⬇ Fly lower over the boat!' : '⬇ Descend below 1,500 ft to confirm', 1);
        }
      } else if (m.type === 'rings') {
        const r = m.rings[m.ringIdx];
        if (!r) return;
        const s = (ac.pos.x - r.pos.x) * r.nx + (ac.pos.z - r.pos.z) * r.nz;
        if (r.prevS < 0 && s >= 0 && ac.pos.distanceTo(r.pos) < m.R * 1.25) {
          FH.Audio.sfx('coin');
          this.fx.burst(r.pos.x, r.pos.y, r.pos.z, 25, 25, 1.2, 4, [0xffe066, 0xffffff], 1);
          m.ringIdx++;
          FH.UI.toast(`⭕ Ring ${m.ringIdx} / ${m.n}`, 'good');
          if (m.ringIdx >= m.n) { m.completing = true; this.completeMission(); }
          else { this.updateRingLook(m); m.rings[m.ringIdx].prevS = (ac.pos.x - m.rings[m.ringIdx].pos.x) * m.rings[m.ringIdx].nx + (ac.pos.z - m.rings[m.ringIdx].pos.z) * m.rings[m.ringIdx].nz; }
          FH.UI.missionShow(m);
          return;
        }
        r.prevS = s;
      }
    },
    completeMission() {
      const m = this.mission;
      let reward = m.reward, extra = '';
      const MT = FH.MissionTypes[m.type];
      if (MT && MT.finishBonus) { const [b, n] = MT.finishBonus(this, m); reward += b; extra += n; }
      if (m.bonus) { reward += m.bonus; extra += m.bonusNote || ''; }
      if (m.type === 'rings') {
        const bonus = Math.max(0, Math.round((m.par - m.t) / m.par * m.reward * 0.6 / 10) * 10);
        if (bonus > 0) { reward += bonus; extra = ` (+${bonus} speed bonus!)`; }
      }
      const finish = (bonusFp, note) => {
        let total = reward + (bonusFp || 0);
        if (FH.Weather.enabled() && FH.Weather.kind !== 'clear') { const wb = Math.round(total * 0.25 / 10) * 10; total += wb; note = (note || '') + ` (+${wb} bad-weather bonus)`; }
        if (this.world.night > 0.5) { const nb = Math.round(total * 0.2 / 10) * 10; total += nb; note = (note || '') + ` (+${nb} night flight)`; }
        this.earn(total, 'Mission');
        this.profile.stats.missions++;
        FH.Audio.sfx('mission');
        let sub = `${m.title} · +${U.fmt(total)} FP${extra}${note || ''}`;
        FH.UI.banner('Mission complete! 🎉', sub, 3800, 'gold');
        if (m.type === 'sight') {
          const fact = this.rookie ? m.landmark.factR : m.landmark.factN;
          setTimeout(() => { FH.UI.toast(`📸 ${fact}`, 'info', 7000); FH.Audio.speak(fact, { rate: this.rookie ? 0.85 : 1 }); }, 1200);
        }
        if (m.type === 'rescue') setTimeout(() => this.radio(this.rookie ? 'Thank you! The rescue boat is coming. Everyone is safe!' : 'Rescue coordination: vessel located, rescue team en route. Well done.'), 1500);
        this.clearMission();
        this.board = null;
        const landed = this.ac.onGround;
        setTimeout(() => {
          if (this.state !== 'flying') return;
          if (landed) FH.UI.toast(this.rookie ? 'Press H to open the hangar and pick a new mission!' : 'Open the hangar (H) to choose your next mission.', 'info', 5000);
          else this.openMissionPick();
        }, landed ? 2500 : 4200);
      };
      if (m.type === 'delivery') {
        const qs = []; const n = this.rookie ? 1 : 2;
        for (let i = 0; i < n; i++) { const q = FH.Vocab.question({}); if (q) qs.push(q); }
        this.state = 'quiz';
        FH.UI.quiz({
          title: `📦 Cargo check — ${m.cargo[1]} ${m.cargo[0]}`, sub: this.rookie ? 'Answer to unload the cargo!' : 'Answer correctly to unload the cargo.', questions: qs,
          onAnswer: (q, ok) => { FH.Vocab.record(q.word, ok); },
          onDone: (correct) => {
            this.state = 'flying';
            const b = Math.round(reward * 0.25 * correct / 10) * 10;
            finish(b, correct ? ` (cargo check +${b})` : '');
          },
        });
      } else finish(0, '');
    },
    clearMission() {
      const m = this.mission;
      if (m && m.group) { this.scene.remove(m.group); }
      if (m && FH.MissionTypes[m.type] && FH.MissionTypes[m.type].clear) FH.MissionTypes[m.type].clear(this, m);
      this.beacon.material.color.setHex(0xffd23f);
      if (this.rescueBoat) { this.scene.remove(this.rescueBoat); this.rescueBoat = null; }
      this.mission = null; this.beacon.visible = false;
      FH.UI.missionHide();
    },
    openMissionPick() {
      const list = this.genMissions(3);
      this.state = 'pick';
      FH.UI.missionPick(list, m => {
        this.state = 'flying';
        if (m) this.acceptMission(m);
      });
    },

    // ---------- cruise mode (autopilot + fast forward + cinematic camera) ----------
    cruiseTarget() {
      const m = this.mission;
      if (!m || m.type === 'rings' || m.completing || (FH.MissionTypes[m.type] && FH.MissionTypes[m.type].cruise === false)) return null;
      return this.targetOf(m);
    },
    cruiseCheck(dt) {
      const ac = this.ac;
      this.cruiseCd = Math.max(0, (this.cruiseCd || 0) - dt);
      this.airT = ac.onGround ? 0 : (this.airT || 0) + dt;
      this.cruiseHint = null;
      const t = this.cruiseTarget();
      if (!t || ac.onGround || this.airT < 8 || ac.agl < 100 || this.cruiseCd > 0) { this.alignT = 0; return; }
      const d = Math.hypot(t.x - ac.pos.x, t.z - ac.pos.z);
      if (d < 4500) { this.alignT = 0; return; }
      const brg = U.norm360(Math.atan2(t.x - ac.pos.x, -(t.z - ac.pos.z)) / D2R);
      const off = Math.abs(U.angDiff(ac.hdg, brg));
      const busy = (this.gate && !this.gate.done) || (this.atc && !this.atc.done) || FH.Weather.threatAhead(ac) || ac.stalled || ac.fuel < 0.12;
      if (busy) { this.alignT = 0; return; }
      if (off < 12) { this.alignT = (this.alignT || 0) + dt; this.cruiseHint = 'lock'; if (this.alignT > 2.5) this.startCruise(t); }
      else { this.alignT = 0; this.cruiseHint = 'point'; }
    },
    startCruise(t) {
      const ac = this.ac, w = this.world;
      if (!t || this.cruise) return;
      // cruise altitude: clear every hill on the way by 250 m
      let maxH = 0;
      const d = Math.hypot(t.x - ac.pos.x, t.z - ac.pos.z);
      for (let s = 0; s <= d; s += 300) { const k = s / d; maxH = Math.max(maxH, w.maxHeightAround(ac.pos.x + (t.x - ac.pos.x) * k, ac.pos.z + (t.z - ac.pos.z) * k, 400)); }
      const alt = U.clamp(Math.max(ac.pos.y, maxH + 250, ac.def.jet ? 1500 : 450), 0, ac.st.ceiling * 0.85);
      this.cruise = { t: 0, speedup: 4, label: t.label, alt, spd: ac.st.maxSpeed * 0.85, e: new THREE.Euler() };
      this.alignT = 0;
      if (this.gate) this.cancelGate();
      this.rig.cinematic = true; this.rig.reset();
      FH.UI.cruise(true);
      FH.Audio.sfx('whoosh');
      const cs = this.callsign(), ft = U.fmt(Math.round(alt * 3.281 / 100) * 100);
      this.radio(this.rookie ? `${cs}, cruise mode on. Sit back and enjoy the view! I will tell you when you are close to ${t.label}.`
        : `${cs}, cruise approved, climb and maintain ${ft} feet, proceed direct ${t.label}.`);
    },
    updateCruise(dt) {
      const c = this.cruise, ac = this.ac, w = this.world, I = FH.Input;
      const t = this.cruiseTarget();
      if (!t) return this.stopCruise('lost');
      if (Math.abs(I.pitch) > 0.25 || Math.abs(I.roll) > 0.25 || Math.abs(I.yaw) > 0.25 || I.throttle !== 0 || I.brake) return this.stopCruise('player');
      if (ac.fuel < 0.1) return this.stopCruise('fuel');
      if (FH.Weather.threatAhead(ac)) return this.stopCruise('weather');
      let dy = 0;
      for (let i = 0; i < c.speedup; i++) {
        const d = Math.hypot(t.x - ac.pos.x, t.z - ac.pos.z);
        if (d <= 2000) return this.stopCruise('arrived', t);
        const brg = U.norm360(Math.atan2(t.x - ac.pos.x, -(t.z - ac.pos.z)) / D2R);
        const err = U.angDiff(ac.hdg, brg);
        const hd = U.norm360(ac.hdg + U.clamp(err, -8 * dt, 8 * dt));
        const fx = Math.sin(hd * D2R), fz = -Math.cos(hd * D2R);
        const ahead = Math.max(w.heightAt(ac.pos.x + fx * 800, ac.pos.z + fz * 800), w.heightAt(ac.pos.x + fx * 1600, ac.pos.z + fz * 1600));
        if (ahead + 230 > c.alt) c.alt = Math.min(ahead + 230, ac.st.ceiling);
        // start descending near the destination so the pilot is set up for the approach at 2 km
        const want = Math.max(Math.min(c.alt, Math.max(0, t.y) + 170 + (d - 2000) * 0.09), ahead + 180);
        dy = U.clamp(want - ac.pos.y, -6 * dt, 10 * dt);
        ac.speed += (c.spd - ac.speed) * Math.min(1, dt * 0.5);
        ac.pos.x += fx * ac.speed * dt; ac.pos.z += fz * ac.speed * dt; ac.pos.y += dy;
        const bank = U.clamp(err * 0.04, -0.45, 0.45), pitch = Math.atan2(dy / dt, ac.speed);
        ac.quat.setFromEuler(c.e.set(pitch, -hd * D2R, -bank, 'YXZ'));
        ac.updateAngles();
        this.checkTreasures();
      }
      c.t += dt;
      ac.throttle = 0.85; ac.eff = 0.85; ac.vs = dy / dt; ac.sink = 0; ac.stalled = false; ac.onGround = false;
      ac.agl = ac.pos.y - Math.max(0, w.heightAt(ac.pos.x, ac.pos.z)) - ac.st.gear;
      ac.fuel = Math.max(0, ac.fuel - (0.25 + 0.75 * 0.85) * dt / ac.st.fuelTime * ac.fuelMult); // fuel burns at normal speed
      ac.animate(dt);
      this.rig.shake = 0;
    },
    stopCruise(reason) {
      const c = this.cruise; if (!c) return;
      const ac = this.ac, cs = this.callsign();
      this.cruise = null;
      this.rig.cinematic = false; this.rig.reset();
      FH.UI.cruise(false);
      ac.throttle = 0.7; ac.gHdg = ac.hdg * D2R;
      this.cruiseCd = reason === 'player' ? 25 : 12; this.alignT = 0;
      this.eventT = Math.max(this.eventT, 10);
      if (reason === 'arrived') this.radio(this.rookie ? `${cs}, you are 2 kilometres from ${c.label}. Cruise mode off. You have control!` : `${cs}, two kilometres from ${c.label}, autopilot disconnected, you have control.`);
      else if (reason === 'player') FH.UI.toast(this.rookie ? '✋ Cruise mode off. You are flying!' : '✋ Autopilot disconnected — you have control', 'info', 2500);
      else if (reason === 'fuel') FH.UI.toast('⛽ Cruise stopped: fuel is low!', 'bad', 3500);
      else if (reason === 'weather') FH.UI.toast(this.rookie ? '⛈ Cruise stopped: storm ahead!' : '⛈ Autopilot disconnected: weather ahead', 'bad', 3500);
    },
    toggleCruise() {
      if (this.cruise) { this.stopCruise('player'); return; }
      const ac = this.ac, t = this.cruiseTarget();
      if (!t) { FH.UI.toast(this.rookie ? 'Choose a mission first, then you can cruise to it!' : 'Cruise needs a mission destination.', ''); return; }
      if (ac.onGround || ac.agl < 80) { FH.UI.toast(this.rookie ? 'Take off first!' : 'Cruise is available once airborne.', ''); return; }
      if (Math.hypot(t.x - ac.pos.x, t.z - ac.pos.z) < 4500) { FH.UI.toast(this.rookie ? 'You are already close. Fly there yourself!' : 'Destination is too close for cruise.', ''); return; }
      if ((this.gate && !this.gate.done) || (this.atc && !this.atc.done)) { FH.UI.toast(this.rookie ? 'Finish the gate or ATC task first.' : 'Complete the current task first.', ''); return; }
      if (FH.Weather.threatAhead(ac)) { FH.UI.toast('⛈ Not now — storm ahead!', ''); return; }
      this.startCruise(t);
    },

    // ---------- approach guidance ----------
    updateApproach() {
      const ac = this.ac, w = this.world, m = this.mission;
      let ap = null;
      if (m && m.airport && Math.hypot(m.airport.x - ac.pos.x, m.airport.z - ac.pos.z) < 7000) ap = m.airport;
      else if (this.apr && !ac.onGround && Math.hypot(this.apr.ap.x - ac.pos.x, this.apr.ap.z - ac.pos.z) < 6000) ap = this.apr.ap; // keep the same approach
      else if (!ac.onGround && ac.agl < 400 && ac.vs < -0.5) {
        const a = w.nearestAirport(ac.pos.x, ac.pos.z);
        if (a && Math.hypot(a.x - ac.pos.x, a.z - ac.pos.z) < 4000) ap = a;
      }
      if (this.apr && this.apr.ap === ap && !ac.onGround) {
        // keep rings; announce landing clearance once
        this.clearedAt = this.clearedAt || {};
        const lastClr = this.clearedAt[ap.id];
        if (!this.apr.cleared && Math.hypot(ap.x - ac.pos.x, ap.z - ac.pos.z) < 4500 && (lastClr === undefined || this.time - lastClr > 240)) {
          this.apr.cleared = true; this.clearedAt[ap.id] = this.time;
          const rw = this.apr.dir > 0 ? ap.rwy[0] : ap.rwy[1];
          this.radio(this.rookie ? `${this.callsign()}, you can land on runway ${rw}. Fly through the green rings and go down slowly!` : `${this.callsign()}, ${ap.name} tower, runway ${rw}, cleared to land.`);
        }
        this.apr.rings.forEach((r, i) => {
          const mesh = this.aprRings[i];
          const s = (ac.pos.x - r.x) * r.nx + (ac.pos.z - r.z) * r.nz;
          if (r.prevS < 0 && s >= 0 && Math.hypot(ac.pos.x - r.x, ac.pos.y - r.y, ac.pos.z - r.z) < r.R * 1.3 && !r.passed) {
            r.passed = true; mesh.material.color.setHex(0xffffff); FH.Audio.sfx('click');
            if (this.rookie) this.earn(8, 'Approach');
          }
          r.prevS = s;
        });
        return;
      }
      if (!ap || ac.onGround) {
        if (this.apr) { this.aprRings.forEach(r => r.visible = false); this.apr = null; }
        return;
      }
      const u = (ac.pos.x - ap.x) * ap.fx + (ac.pos.z - ap.z) * ap.fz;
      const dir = u < 0 ? 1 : -1;
      const fx = ap.fx * dir, fz = ap.fz * dir;
      const thx = ap.x - fx * 440, thz = ap.z - fz * 440;
      const R = 18 + ac.st.size * 9;
      const rings = [500, 1000, 1600, 2300].map((d, i) => {
        const x = thx - fx * d, z = thz - fz * d, y = ap.elev + 14 + d * 0.065;
        const mesh = this.aprRings[i];
        mesh.position.set(x, y, z); mesh.scale.setScalar(R); mesh.rotation.set(0, Math.atan2(fx, fz), 0);
        mesh.material.color.setHex(0x4dff88); mesh.visible = true;
        return { x, y, z, nx: fx, nz: fz, R, prevS: -1, passed: false };
      });
      this.apr = { ap, dir, rings, cleared: false };
    },

    // ---------- treasures ----------
    checkTreasures() {
      const ac = this.ac, p = this.profile;
      for (const t of this.world.treasures) {
        if (!t.mesh.visible) continue;
        const d = Math.hypot(t.x - ac.pos.x, t.mesh.position.y - ac.pos.y, t.z - ac.pos.z);
        if (d < 20 + ac.st.size * 8) {
          t.mesh.visible = false; p.treasures.push(t.id);
          this.fx.burst(t.x, t.mesh.position.y, t.z, 50, 30, 1.6, 5, [0xffd23f, 0xffffff, 0xffa500], 1);
          FH.Audio.sfx('treasure');
          const n = p.treasures.length, total = this.world.treasures.length;
          this.earn(100, 'Treasure');
          FH.UI.banner('⭐ Treasure star!', `${n} of ${total} found`, 2500, 'gold');
          if (n >= total) setTimeout(() => { this.earn(1000, 'All treasures!'); FH.UI.banner('🏆 All treasure stars found!', '+1,000 FP bonus', 4000, 'gold'); }, 2600);
        }
      }
    },

    // ---------- hangar ----------
    canOpenHangar() { return this.state === 'flying' && this.ac.onGround && this.ac.speed < 6 && this.atAirport; },
    openHangar() {
      if (!this.canOpenHangar()) return;
      const ap = this.atAirport;
      this.state = 'hangar';
      this.profile.lastAirport = ap.id;
      this.ac.fuel = 1;
      this.cancelGate(); this.cancelATC();
      if (!this.board || this.boardAirport !== ap) { this.board = this.genMissions(3); this.boardAirport = ap; }
      this.saveProfile();
      FH.UI.openHangar(this, ap);
    },
    takeOff() {
      const ap = this.boardAirport || this.atAirport || this.world.airports[0];
      FH.UI.closeHangar();
      this.state = 'flying';
      this.placeOnRunway(ap);
      this.eventT = 20;
      this.radio(this.rookie ? `${this.callsign()}, runway ${ap.rwy[0]}. You can take off now. Have a great flight!` : `${this.callsign()}, wind calm, runway ${ap.rwy[0]}, cleared for take-off.`);
    },
    buyPlane(id) {
      const def = FH.planeById(id), p = this.profile;
      if (p.planes[id] || !this.spend(def.price)) return false;
      p.planes[id] = { engine: 0, wings: 0, fuel: 0 }; p.paint[id] = p.paint[id] || 'red';
      FH.Audio.sfx('levelup');
      this.selectPlane(id);
      return true;
    },
    selectPlane(id) {
      const p = this.profile;
      if (!p.planes[id]) return;
      p.current = id; this.saveProfile();
      this.spawnPlane();
      this.placeOnRunway(this.boardAirport || this.world.airports[p.lastAirport] || this.world.airports[0]);
      this.board = this.genMissions(3);
    },
    buyUpgrade(key) {
      const p = this.profile, def = FH.planeById(p.current), u = p.planes[def.id];
      if (u[key] >= 3) return false;
      const cost = FH.upgradeCost(def, u[key] + 1);
      if (!this.spend(cost)) return false;
      u[key]++; this.ac.upg = u; this.ac.computeStats();
      FH.Audio.sfx('levelup'); this.saveProfile();
      return true;
    },
    setPaint(name) {
      const p = this.profile;
      if (!p.paints.includes(name)) { if (!this.spend(FH.PAINT_COST)) return false; p.paints.push(name); }
      p.paint[p.current] = name; this.ac.setPaint(FH.PAINTS[name]); FH.Audio.sfx('click'); this.saveProfile();
      return true;
    },
    groundSchool(done) {
      const qs = [];
      for (let i = 0; i < 5; i++) { const q = FH.Vocab.question({}); if (q) qs.push(q); }
      const per = this.rookie ? 20 : 25;
      FH.UI.quiz({
        title: '🎓 Ground School', sub: this.rookie ? `Answer 5 questions. +${per} FP for each right answer!` : `5 questions · +${per} FP per correct answer · +75 FP for a perfect score`, questions: qs,
        onAnswer: (q, ok) => { FH.Vocab.record(q.word, ok); this.profile.stats.quiz++; if (ok) { this.profile.stats.quizRight++; this.earn(per, 'Ground School'); } },
        onDone: (correct, total) => { if (correct === total) { this.earn(75, 'Perfect!'); FH.UI.toast('🌟 Perfect score! +75 FP', 'good'); } this.saveProfile(); done && done(); },
      });
    },

    // ---------- tutorial ----------
    tutorial(start, dt = 0) {
      const p = this.profile, ac = this.ac, rk = this.rookie;
      this.tutT = (this.tutT || 0) + dt;
      const tk = Math.round(ac.st.takeoff * 1.944);
      let tip = null;
      switch (p.tut) {
        case 0: tip = rk ? '⚡ Hold SHIFT (or R) to give the engine more power!' : '⚡ Hold SHIFT / R to advance the throttle. Z / F reduces power.'; if (ac.throttle > 0.75 || !ac.onGround) { p.tut = ac.onGround ? 1 : 2; this.tutT = 0; } break;
        case 1: tip = rk ? `🛫 When your speed is ${tk} knots, hold ↑ (or W) to fly up!` : `🛫 Rotate at ${tk} knots: hold ↑ / W to lift off.`; break;
        case 2: tip = rk ? '✈️ Use ← → (A D) to turn and ↑ ↓ (W S) to go up and down.' : '✈️ ← → / A D to bank and turn, ↑ ↓ / W S to pitch, Q E for rudder.'; if (this.tutT > 9) { p.tut = 3; this.tutT = 0; } break;
        case 3: tip = this.gate ? (rk ? '🎯 WORD GATES! Read the question and fly through the right word!' : '🎯 Word Gates: fly through the ring with the correct answer.') : null; break;
        case 4: tip = this.atc ? (rk ? '📻 Air Traffic Control is talking to you! Do what they say. Press 1, 2 or 3 to answer.' : '📻 Follow the ATC instruction, then press 1–3 to choose the correct readback.') : null; break;
        case 5: tip = rk ? '🗺️ Press M for the map. Land at any airport and press H for the Hangar!' : '🗺️ M opens the map. Land and stop at an airport, then press H for the Hangar: missions, planes and upgrades.'; if (this.tutT > 12) { p.tut = 6; this.saveProfile(); } break;
      }
      FH.UI.tip(p.tut < 6 ? tip : null);
    },

    // ---------- input ----------
    onKey(e) {
      const st = this.state;
      if (FH.UI.quizOpen) { FH.UI.quizKey(e); return; }
      if (st === 'title' || st === 'hangar' || st === 'pick') return;
      const k = e.code;
      if (k === 'Escape' || k === 'KeyP') {
        if (st === 'flying') this.pause(); else if (st === 'paused') this.resume(); else if (st === 'map') this.closeMap();
        return;
      }
      if (k === 'KeyM') { if (st === 'flying') this.openMap(); else if (st === 'map') this.closeMap(); return; }
      if (st !== 'flying') return;
      if (k === 'KeyH') { if (this.canOpenHangar()) this.openHangar(); else if (this.ac.onGround && this.atAirport) FH.UI.toast('Stop the plane first (SPACE = brakes)', ''); else FH.UI.toast(this.rookie ? 'Land at an airport and stop to open the hangar.' : 'Hangar is available when stopped at an airport.', ''); }
      else if (k === 'KeyC') { this.rig.mode = (this.rig.mode + 1) % 3; this.rig.reset(); FH.UI.toast(['📷 Chase view', '📷 Cockpit view', '📷 Far view'][this.rig.mode], 'info', 1200); }
      else if (k === 'KeyK') this.toggleCruise();
      else if (k === 'KeyX' || k === 'KeyG') this.dropPayload();
      else if (k === 'KeyT') { this.smoke = !this.smoke; FH.UI.toast(this.smoke ? '💨 Smoke ON' : '💨 Smoke OFF', 'info', 1200); }
      else if (k === 'KeyV') { if (this.atc && !this.atc.done) FH.Audio.speak(this.atc.speak, { rate: this.rookie ? 0.85 : 1 }); else if (this.gate && !this.gate.done) FH.Audio.speak(this.gate.q.speak, { rate: 0.85 }); }
      else if (k === 'Digit1' || k === 'Numpad1') this.answerReadback(0);
      else if (k === 'Digit2' || k === 'Numpad2') this.answerReadback(1);
      else if (k === 'Digit3' || k === 'Numpad3') this.answerReadback(2);
    },
    pause() { if (this.state !== 'flying') return; this.state = 'paused'; FH.Audio.stopSpeech(); FH.UI.showPause(this); this.saveProfile(); },
    resume() { this.state = 'flying'; FH.UI.hidePause(); },
    openMap() { this.state = 'map'; FH.UI.showMap(this); },
    closeMap() { this.state = 'flying'; FH.UI.hideMap(); },
    dropPayload() {
      const m = this.mission, MT = m && FH.MissionTypes[m.type];
      if (MT && MT.drop && !m.completing) MT.drop(this, m);
      else FH.UI.toast(this.rookie ? 'Nothing to drop. Drop missions use the X key.' : 'No payload on board.', '', 1500);
    },
    abandonMission() { this.clearMission(); FH.UI.toast('Mission cancelled', ''); },
    quitToTitle() {
      this.saveProfile();
      this.cancelGate(); this.cancelATC(); this.clearMission();
      this.aprRings.forEach(r => r.visible = false); this.apr = null;
      FH.Weather.reset(); this.rig.shake = 0; this.cruise = null; this.rig.cinematic = false; FH.UI.cruise(false);
      if (this.ac) { this.scene.remove(this.ac.model); this.ac = null; }
      this.state = 'title';
      FH.Audio.updateEngine('prop', 0, 0, false, false);
      FH.Audio.stopSpeech();
      FH.UI.showTitle();
    },
  };
})();

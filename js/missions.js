// FlyHigh - extra mission types: hospital flight (timed), supply drop, water bomber, sightseeing tour, follow the leader.
// Each type has make / accept / target / update / clear, and optionally drop (X key) and cruise (false = no cruise mode).
(function () {
  const FH = window.FH, U = FH.util, D2R = Math.PI / 180;
  const mmss = s => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;

  // a random point on land, reasonably flat, away from airports
  function landSpot(w, px, pz, minD, maxD, test) {
    for (let t = 0; t < 600; t++) {
      const a = Math.random() * Math.PI * 2, d = minD + Math.random() * (maxD - minD);
      const x = px + Math.cos(a) * d, z = pz + Math.sin(a) * d;
      if (Math.hypot(x, z) > 8800) continue;
      const h = w.heightAt(x, z);
      if (h < 6 || h > 420 || w.normalYAt(x, z) < 0.96) continue;
      if (w.airports.some(ap => Math.hypot(ap.x - x, ap.z - z) < 900)) continue;
      if (test && !test(x, z, h)) continue;
      return { x, z, h };
    }
    return null;
  }
  function beaconAt(g, x, y, z, hex) {
    g.beacon.position.set(x, y, z); g.beacon.visible = true;
    g.beacon.material.color.setHex(hex || 0xffd23f);
  }

  // ---------------------------------------------------------------- hospital flight (race against the clock)
  const medevac = {
    make(g, from, tier, mm, R10) {
      const w = g.world, ac = g.ac;
      const cands = w.airports.filter(a => a !== from && Math.hypot(a.x - ac.pos.x, a.z - ac.pos.z) > 3000);
      if (!cands.length) return null;
      const a = U.pick(cands), dist = Math.hypot(a.x - ac.pos.x, a.z - ac.pos.z), km = dist / 1000;
      const limit = Math.round((dist / (ac.st.maxSpeed * 0.72) + (g.rookie ? 170 : 110)) / 10) * 10;
      const rk = g.rookie;
      return {
        type: 'medevac', airport: a, landAt: a, km, limit, emoji: '🚑', reward: R10((230 + km * 50) * tier * mm),
        title: rk ? `Hospital flight to ${a.name}` : `Medevac to ${a.name}`,
        desc: rk ? `A sick person needs a doctor! Fly to ${a.name} and land in ${mmss(limit)} minutes. Be quick but careful!`
          : `Urgent medical evacuation: deliver the patient to ${a.name} within ${mmss(limit)}. Early arrival earns a bonus.`,
      };
    },
    accept(g, m) { beaconAt(g, m.airport.x, m.airport.elev, m.airport.z, 0xff5a5a); },
    target(g, m) { return { x: m.airport.x, y: m.airport.elev + 30, z: m.airport.z, label: m.airport.name }; },
    update(g, m) {
      const left = m.limit - m.t;
      m.status = left > 0 ? `⏱ ${mmss(left)} left` : (g.rookie ? '⏱ Late! Land soon' : '⏱ Overdue');
      m.urgent = left < 30;
      if (left < 0 && !m.lateTold) { m.lateTold = true; FH.UI.toast(g.rookie ? '⏱ Time is up, but the patient still needs you. Land as soon as you can!' : '⏱ Time limit passed — reduced reward on arrival.', 'bad', 4000); }
    },
    finishBonus(g, m) {
      const left = m.limit - m.t;
      if (left >= 0) { const b = Math.round(m.reward * 0.4 * left / m.limit / 10) * 10; return [b, b > 0 ? ` (+${b} fast arrival)` : '']; }
      return [-Math.round(m.reward * 0.4 / 10) * 10, ' (late arrival)'];
    },
  };

  // ---------------------------------------------------------------- supply drop (parachute crates)
  const drop = {
    make(g, from, tier, mm, R10) {
      const w = g.world, ac = g.ac, rk = g.rookie;
      const s = landSpot(w, ac.pos.x, ac.pos.z, 2600, 8000);
      if (!s) return null;
      const km = Math.hypot(s.x - ac.pos.x, s.z - ac.pos.z) / 1000, isl = w.islandName(s.x, s.z);
      const crate = U.pick(rk ? [['food boxes', '🍱'], ['blankets', '🧣'], ['water bottles', '💧'], ['tents', '⛺']] : [['emergency rations', '🥫'], ['a satellite phone', '📡'], ['first-aid kits', '🩹'], ['camping equipment', '⛺']]);
      return {
        type: 'drop', spot: s, km, island: isl, crate, crates: 3, emoji: '🪂', reward: R10((240 + km * 45) * tier * mm),
        title: rk ? `Parachute drop on ${isl}` : `Supply drop: ${isl}`,
        desc: rk ? `Campers on ${isl} need ${crate[0]} ${crate[1]}. Fly low over the red target and press X to drop a parachute box!`
          : `Hikers on ${isl} need ${crate[0]} ${crate[1]}. Overfly the drop zone below 1,000 ft and press X to release. Accuracy pays.`,
      };
    },
    accept(g, m) {
      const s = m.spot, grp = new THREE.Group();
      const ringMat = c => new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
      [[60, 48, 0xffffff], [48, 34, 0xe63946], [34, 20, 0xffffff], [20, 0, 0xe63946]].forEach(([r0, r1, c]) => {
        const geo = new THREE.RingGeometry(r1, r0, 40); geo.rotateX(-Math.PI / 2);
        const msh = new THREE.Mesh(geo, ringMat(c)); grp.add(msh);
      });
      grp.position.set(s.x, s.h + 1.2, s.z);
      // tilt the target to the slope
      const e = 6, hx = g.world.heightAt(s.x + e, s.z) - g.world.heightAt(s.x - e, s.z), hz = g.world.heightAt(s.x, s.z + e) - g.world.heightAt(s.x, s.z - e);
      grp.rotation.set(Math.atan2(hz, 2 * e), 0, -Math.atan2(hx, 2 * e));
      g.scene.add(grp); m.group = grp; m.boxes = [];
      // predicted landing marker
      const pm = new THREE.Mesh(new THREE.TorusGeometry(9, 1.2, 6, 24), new THREE.MeshBasicMaterial({ color: 0x4dff88, transparent: true, opacity: 0.85, depthTest: false }));
      pm.rotation.x = Math.PI / 2; pm.visible = false; pm.renderOrder = 8; g.scene.add(pm); m.pred = pm;
      beaconAt(g, s.x, s.h, s.z, 0xff5a5a);
    },
    target(g, m) { return { x: m.spot.x, y: m.spot.h + 20, z: m.spot.z, label: 'Drop zone' }; },
    // simple crate physics: free fall, then parachute
    step(b, dt, w) {
      b.t += dt;
      if (b.t < 0.9) { b.v.y -= 9.8 * dt; b.v.multiplyScalar(Math.exp(-0.05 * dt)); }
      else {
        b.v.y += (-7 - b.v.y) * Math.min(1, dt * 1.6);
        const k = Math.exp(-0.55 * dt); b.v.x *= k; b.v.z *= k;
        const wv = FH.Weather.windVec; b.v.x += wv.x * 0.5 * dt; b.v.z += wv.z * 0.5 * dt;
      }
      b.p.addScaledVector(b.v, dt);
      const gh = Math.max(0, w.heightAt(b.p.x, b.p.z));
      if (b.p.y <= gh + 0.8) { b.p.y = gh + 0.8; return true; }
      return false;
    },
    predict(g, m) {
      const ac = g.ac, b = { p: ac.pos.clone(), v: ac._f.clone().multiplyScalar(ac.speed), t: 0 };
      b.p.y -= 2;
      for (let i = 0; i < 500; i++) if (this.step(b, 0.06, g.world)) return b.p;
      return null;
    },
    drop(g, m) {
      const ac = g.ac;
      if (ac.onGround) { FH.UI.toast(g.rookie ? 'Take off first!' : 'Airborne drops only.', ''); return; }
      if (m.crates <= 0) return;
      if (ac.agl > (g.rookie ? 460 : 400)) { FH.UI.toast(g.rookie ? '⬇ Too high! Fly lower than 1,500 feet.' : '⬇ Too high — descend below 1,000 ft AGL (1,300 ft max).', 'bad'); return; }
      m.crates--;
      const crate = FH.Models.supplyCrate([0xff5a5a, 0xffd23f, 0x4aa3ff][m.crates % 3]), grp = crate.group, chute = crate.chute;
      grp.position.copy(ac.pos); g.scene.add(grp);
      m.boxes.push({ p: ac.pos.clone().add(new THREE.Vector3(0, -2, 0)), v: ac._f.clone().multiplyScalar(ac.speed), t: 0, grp, chute, landed: false });
      FH.Audio.sfx('whoosh');
      FH.UI.toast(`🪂 ${g.rookie ? 'Box away!' : 'Load released!'} (${m.crates} left)`, 'info', 1800);
    },
    update(g, m, dt) {
      const ac = g.ac, s = m.spot, w = g.world;
      const d = Math.hypot(s.x - ac.pos.x, s.z - ac.pos.z);
      m.status = `🪂 ${m.crates} ${g.rookie ? 'boxes' : 'loads'} left`;
      // predicted impact (green ring) when close
      if (m.pred) {
        const show = !ac.onGround && d < 1500 && m.crates > 0;
        let p = show ? this.predict(g, m) : null;
        m.pred.visible = !!p;
        if (p) { m.pred.position.set(p.x, p.y + 1, p.z); const pd = Math.hypot(p.x - s.x, p.z - s.z); m.pred.material.color.setHex(pd < 60 ? 0x4dff88 : 0xffd23f); }
        if (show && ac.agl > 400 && d < 900) FH.UI.warn(g.rookie ? '⬇ Fly lower to drop the box!' : '⬇ Descend below 1,000 ft for the drop', 0.3);
        else if (show && d < 900) FH.UI.warn(g.rookie ? '🪂 Press X when the green ring is on the target!' : '🪂 X = release when the ring is on the target', 0.3);
      }
      for (const b of m.boxes) {
        if (b.landed) continue;
        if (this.step(b, dt, w)) {
          b.landed = true;
          const off = Math.hypot(b.p.x - s.x, b.p.z - s.z);
          g.fx.burst(b.p.x, b.p.y, b.p.z, 18, 8, 1.2, 3, [0xc8b58a, 0xffffff], 0.8);
          b.chute.visible = false;
          if (!m.completing) {
            if (off < 60) {
              m.completing = true; m.acc = off;
              const k = off < 20 ? 1.5 : off < 40 ? 1.2 : 1;
              m.bonus = Math.round(m.reward * (k - 1) / 10) * 10;
              m.bonusNote = off < 20 ? ` (🎯 bullseye +${m.bonus}!)` : m.bonus ? ` (accuracy +${m.bonus})` : '';
              FH.UI.toast(`🎯 ${Math.round(off)} m from the centre!`, 'good');
              g.completeMission();
            } else {
              FH.UI.toast(g.rookie ? `Missed by ${Math.round(off)} m. Try again!` : `Off target: ${Math.round(off)} m.`, 'bad');
              if (m.crates <= 0) { m.crates = 3; m.reward = Math.max(Math.round(m.reward * 0.7 / 10) * 10, 60); FH.UI.toast(g.rookie ? 'No boxes left! The base gives you 3 more. 📦' : 'Out of loads — 3 more issued (reduced reward).', 'info', 3500); }
            }
          }
        }
        b.grp.position.copy(b.p);
        b.chute.visible = !b.landed && b.t > 0.9;
      }
    },
    clear(g, m) {
      if (m.pred) g.scene.remove(m.pred);
      (m.boxes || []).forEach(b => setTimeout(() => g.scene.remove(b.grp), 8000));
      g.beacon.material.color.setHex(0xffd23f);
    },
  };

  // ---------------------------------------------------------------- water bomber
  const fire = {
    make(g, from, tier, mm, R10) {
      const w = g.world, ac = g.ac, rk = g.rookie;
      const s = landSpot(w, ac.pos.x, ac.pos.z, 2800, 8500, (x, z, h) => w.forestMask(x, z) > 0.05 && h < 300);
      if (!s) return null;
      // nearest sea to scoop from
      let water = null;
      for (let r = 300; r < 4000 && !water; r += 150) for (let k = 0; k < 24; k++) {
        const a = k / 24 * Math.PI * 2, x = s.x + Math.cos(a) * r, z = s.z + Math.sin(a) * r;
        if (w.heightAt(x, z) < -12 && w.maxHeightAround(x, z, 300) < 1) { water = { x, z }; break; }
      }
      if (!water) return null;
      const km = Math.hypot(s.x - ac.pos.x, s.z - ac.pos.z) / 1000, isl = w.islandName(s.x, s.z), drops = rk ? 1 : 2;
      return {
        type: 'fire', spot: s, water, km, island: isl, drops, hits: 0, tank: 0, emoji: '🔥', reward: R10((300 + km * 45 + drops * 60) * tier * mm),
        title: rk ? `Put out the fire on ${isl}` : `Water bomber: ${isl}`,
        desc: rk ? `The forest is on fire! 1) Fly very low over the sea to fill your tank. 2) Fly low over the fire and press X to drop the water.`
          : `Wildfire reported on ${isl}. Skim the sea below 100 ft to scoop water, then drop it on the fire (X) below 800 ft. ${drops} drops needed.`,
      };
    },
    accept(g, m) {
      m.emitter = { x: m.spot.x, y: m.spot.h + 10, z: m.spot.z, rate: 0.09, t: 0, kind: 'fire' };
      g.world.smokeEmitters.push(m.emitter);
      m.flameT = 0;
      beaconAt(g, m.water.x, 0, m.water.z, 0x4aa3ff);
    },
    target(g, m) {
      return m.tank < 1 ? { x: m.water.x, y: 20, z: m.water.z, label: g.rookie ? 'Sea: fill tank' : 'Scoop area' } : { x: m.spot.x, y: m.spot.h + 40, z: m.spot.z, label: 'Fire' };
    },
    drop(g, m) {
      const ac = g.ac, s = m.spot;
      if (m.tank < 1) { FH.UI.toast(g.rookie ? '💧 Your tank is empty! Fly very low over the sea first.' : '💧 Tank empty — scoop water first.', ''); return; }
      m.tank = 0;
      for (let i = 0; i < 70; i++) g.fx.emit(ac.pos.x + (Math.random() - 0.5) * 6, ac.pos.y - 2, ac.pos.z + (Math.random() - 0.5) * 6, ac._f.x * ac.speed * 0.6 + (Math.random() - 0.5) * 6, -8 - Math.random() * 10, ac._f.z * ac.speed * 0.6 + (Math.random() - 0.5) * 6, 2.5 + Math.random(), 3, 14, i % 2 ? 0xd8f2ff : 0x9fd8ff, 0.8, 0.6, -3);
      FH.Audio.sfx('whoosh');
      const d = Math.hypot(s.x - ac.pos.x, s.z - ac.pos.z);
      const ok = d < (g.rookie ? 260 : 190) && ac.agl < (g.rookie ? 330 : 250);
      if (ok) {
        m.hits++;
        g.fx.burst(s.x, s.h + 5, s.z, 40, 20, 2, 10, [0xffffff, 0xd8f2ff, 0xaaaaaa], 0.8);
        if (m.hits >= m.drops) { m.completing = true; FH.UI.toast(g.rookie ? '🚒 The fire is out! Hooray!' : '🚒 Fire extinguished!', 'good'); g.completeMission(); }
        else { FH.UI.toast(g.rookie ? '💦 Good drop! The fire is smaller. Get more water!' : `💦 Direct hit! ${m.drops - m.hits} more drop needed.`, 'good'); beaconAt(g, m.water.x, 0, m.water.z, 0x4aa3ff); FH.UI.missionShow(m); }
      } else FH.UI.toast(g.rookie ? 'Missed! Get more water and drop it right over the fire.' : (ac.agl >= 250 ? 'Too high — the water spread out. Refill and try again.' : 'Missed the fire. Refill and try again.'), 'bad');
      if (!m.completing && m.hits < m.drops) beaconAt(g, m.water.x, 0, m.water.z, 0x4aa3ff);
    },
    update(g, m, dt) {
      const ac = g.ac, w = g.world, s = m.spot;
      const k = 1 - m.hits / (m.drops + 1);
      m.emitter.rate = 0.09 / Math.max(0.25, k);
      // flames, visible when close
      if (Math.hypot(s.x - g.camera.position.x, s.z - g.camera.position.z) < 8000) {
        m.flameT -= dt;
        while (m.flameT <= 0) {
          m.flameT += 0.05 / k;
          const a = Math.random() * 6.28, r = Math.random() * 60 * k;
          const x = s.x + Math.cos(a) * r, z = s.z + Math.sin(a) * r;
          g.fx.emit(x, Math.max(0, w.heightAt(x, z)) + 2, z, (Math.random() - 0.5) * 2, 6 + Math.random() * 6, (Math.random() - 0.5) * 2, 1.4, 8, 3, Math.random() < 0.5 ? 0xff7a1a : 0xffc23a, 0.9, 0.4, 2);
        }
      }
      // scooping: very low over open water
      if (m.tank < 1 && !ac.onGround) {
        const overSea = w.heightAt(ac.pos.x, ac.pos.z) < -3 && ac.pos.y < (g.rookie ? 32 : 28);
        if (overSea) {
          m.tank = Math.min(1, m.tank + dt / 2.5);
          if (Math.random() < 0.6) g.fx.emit(ac.pos.x, 0.5, ac.pos.z, (Math.random() - 0.5) * 4, 4 + Math.random() * 3, (Math.random() - 0.5) * 4, 1.2, 2, 8, 0xffffff, 0.8, 1, 0);
          if (m.tank >= 1) { FH.UI.toast(g.rookie ? '💧 Tank full! Now fly to the fire 🔥' : '💧 Tank full — proceed to the fire', 'good'); FH.Audio.sfx('coin'); beaconAt(g, s.x, s.h, s.z, 0xff7a1a); }
        } else if (Math.hypot(m.water.x - ac.pos.x, m.water.z - ac.pos.z) < 1500 && w.heightAt(ac.pos.x, ac.pos.z) < -3) {
          FH.UI.warn(g.rookie ? '⬇ Fly very low over the water (under 100 feet) to fill up!' : '⬇ Descend below 100 ft over the water to scoop', 0.3);
        }
      }
      m.status = m.tank >= 1 ? (g.rookie ? '💧 Tank full → fire!' : '💧 Tank full') : `💧 Tank ${Math.round(m.tank * 100)}%`;
      m.status += `  ·  🔥 ${m.hits}/${m.drops}`;
    },
    clear(g, m) {
      const i = g.world.smokeEmitters.indexOf(m.emitter); if (i >= 0) g.world.smokeEmitters.splice(i, 1);
      g.beacon.material.color.setHex(0xffd23f);
    },
  };

  // ---------------------------------------------------------------- sightseeing tour
  const tour = {
    make(g, from, tier, mm, R10) {
      const w = g.world, ac = g.ac, rk = g.rookie, n = rk ? 2 : 3;
      if (w.landmarks.length < n) return null;
      const stops = [];
      let x = ac.pos.x, z = ac.pos.z, path = 0;
      const pool = w.landmarks.slice();
      for (let i = 0; i < n; i++) {
        pool.sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
        const opts = pool.filter(l => Math.hypot(l.x - x, l.z - z) > 900).slice(0, 3);
        if (!opts.length) return null;
        const l = U.pick(opts); pool.splice(pool.indexOf(l), 1);
        path += Math.hypot(l.x - x, l.z - z); x = l.x; z = l.z; stops.push(l);
      }
      const end = w.nearestAirport(x, z); path += Math.hypot(end.x - x, end.z - z);
      const km = path / 1000, names = stops.map(l => l.name.toLowerCase());
      return {
        type: 'tour', stops, stage: 0, end, landAt: null, km, emoji: '📸', reward: R10((200 + km * 40) * tier * mm),
        title: rk ? 'Sightseeing tour' : 'Scenic passenger flight',
        desc: rk ? `Your passengers want to see the ${names.join(' and the ')}. Fly low over each one, then land at ${end.name}.`
          : `Show your passengers the ${names.slice(0, -1).join(', the ')} and the ${names[names.length - 1]} (below 2,000 ft AGL), then land at ${end.name}.`,
      };
    },
    accept(g, m) { this.mark(g, m); },
    mark(g, m) {
      if (m.stage < m.stops.length) { const l = m.stops[m.stage]; beaconAt(g, l.x, Math.max(0, l.y), l.z); }
      else { beaconAt(g, m.end.x, m.end.elev, m.end.z); m.airport = m.end; m.landAt = m.end; }
    },
    target(g, m) {
      if (m.stage < m.stops.length) { const l = m.stops[m.stage]; return { x: l.x, y: Math.max(0, l.y) + 40, z: l.z, label: l.name }; }
      return { x: m.end.x, y: m.end.elev + 30, z: m.end.z, label: m.end.name };
    },
    update(g, m) {
      const ac = g.ac;
      m.status = m.stage < m.stops.length ? `📸 ${m.stage}/${m.stops.length} sights` : (g.rookie ? '🛬 Now land!' : '🛬 Land to finish');
      if (m.stage >= m.stops.length) return;
      const l = m.stops[m.stage], d = Math.hypot(l.x - ac.pos.x, l.z - ac.pos.z);
      if (d < 450) {
        if (ac.pos.y - Math.max(0, l.y) < 610) {
          m.stage++;
          FH.Audio.sfx('coin');
          const fact = g.rookie ? l.factR : l.factN;
          FH.UI.toast(`📸 ${l.emoji} ${fact}`, 'info', 6000);
          FH.Audio.speak((g.rookie ? 'Passengers: wow! ' : '') + fact, { rate: g.rookie ? 0.88 : 1 });
          this.mark(g, m); FH.UI.missionShow(m);
        } else FH.UI.warn(g.rookie ? '⬇ Fly lower so the passengers can see!' : '⬇ Descend below 2,000 ft AGL for the passengers', 1);
      }
    },
  };

  // ---------------------------------------------------------------- follow the leader (formation flight)
  const escort = {
    cruise: false,
    make(g, from, tier, mm, R10) {
      const rk = g.rookie, goal = rk ? 45 : 60;
      return {
        type: 'escort', goal, inT: 0, km: 0, emoji: '🛩️', reward: R10((330 + goal * 3) * tier * mm),
        title: rk ? 'Follow the leader' : 'Formation flight',
        desc: rk ? `A yellow plane will fly around the islands. Stay close behind it (the bar fills up) for ${goal} seconds!`
          : `Join up with the lead aircraft and hold formation within 450 m for ${goal} seconds in total.`,
      };
    },
    accept(g, m) {
      const ac = g.ac, w = g.world, def = FH.planeById(ac.st.maxSpeed > 120 ? 'swift' : 'bluebird');
      const b = def.build(0xffc93c);
      m.lead = { model: b.group, rig: b, props: b.props, pos: new THREE.Vector3(), hdg: ac.hdg, spd: Math.min(ac.st.maxSpeed * 0.68, 95), alt: 0, wp: null, orbit: true, e: new THREE.Euler(), bank: 0, smokeT: 0 };
      const L = m.lead;
      if (b.setGear) { b.gearF = 0; b.setGear(0); }
      L.cx = ac.pos.x; L.cz = ac.pos.z; L.oa = 0;
      L.alt = Math.max(w.maxHeightAround(ac.pos.x, ac.pos.z, 900), 0) + 280;
      L.pos.set(ac.pos.x + 700, L.alt, ac.pos.z);
      g.scene.add(L.model);
      m.label = w.makeLabel(g.rookie ? '⭐ Leader' : 'LEAD', '#ffe066'); g.scene.add(m.label);
      w.addNavLights && w.addNavLights(L.model);
      g.radio(g.rookie ? `${g.callsign()}, the yellow leader plane is waiting above you. Take off and fly behind it!` : `${g.callsign()}, lead aircraft is orbiting overhead. Join up when airborne.`);
    },
    target(g, m) { const p = m.lead.pos; return { x: p.x, y: p.y, z: p.z, label: 'Leader' }; },
    nextWp(g, L) {
      const w = g.world;
      for (let t = 0; t < 50; t++) {
        const a = (L.hdg + (Math.random() - 0.5) * 120) * D2R, d = 1800 + Math.random() * 1800;
        let x = L.pos.x + Math.sin(a) * d, z = L.pos.z - Math.cos(a) * d;
        if (Math.hypot(x, z) > 7500) { x *= 0.6; z *= 0.6; }
        L.wp = { x, z, alt: Math.max(w.maxHeightAround(x, z, 1200), 0) + 260 + Math.random() * 150 };
        return;
      }
    },
    update(g, m, dt) {
      const L = m.lead, ac = g.ac, w = g.world;
      const d = ac.pos.distanceTo(L.pos);
      let tx, tz, talt = L.alt;
      if (L.orbit) {
        // circle above the start until the player joins
        L.oa += dt * L.spd / 700;
        tx = L.cx + Math.cos(L.oa) * 700; tz = L.cz + Math.sin(L.oa) * 700;
        if (!ac.onGround && d < 900) { L.orbit = false; this.nextWp(g, L); FH.Audio.sfx('radio'); FH.UI.toast(g.rookie ? '🛩️ Follow me!' : '🛩️ Lead: "Joining up — follow me."', 'info', 2500); }
      } else {
        if (Math.hypot(L.wp.x - L.pos.x, L.wp.z - L.pos.z) < 400) this.nextWp(g, L);
        tx = L.wp.x; tz = L.wp.z; talt = L.wp.alt;
      }
      // wait for the player if they fall behind
      const spd = L.orbit ? L.spd * 0.8 : L.spd * (d > 1200 ? 0.6 : d > 700 ? 0.8 : 1);
      const brg = U.norm360(Math.atan2(tx - L.pos.x, -(tz - L.pos.z)) / D2R);
      const err = U.angDiff(L.hdg, brg), turn = U.clamp(err, -9 * dt, 9 * dt);
      L.hdg = U.norm360(L.hdg + turn);
      const ahead = Math.max(w.heightAt(L.pos.x + Math.sin(L.hdg * D2R) * 700, L.pos.z - Math.cos(L.hdg * D2R) * 700), 0);
      if (FH.Weather.deck > 0.3 && w.deck) talt = Math.min(talt, w.deck.base - 70); // stay below low cloud
      talt = Math.max(talt, ahead + 200);
      const dy = U.clamp(talt - L.pos.y, -5 * dt, 7 * dt);
      L.pos.x += Math.sin(L.hdg * D2R) * spd * dt; L.pos.z += -Math.cos(L.hdg * D2R) * spd * dt; L.pos.y += dy;
      L.bank += (U.clamp(turn / dt * 0.06, -0.6, 0.6) - L.bank) * Math.min(1, dt * 2);
      L.model.position.copy(L.pos);
      L.model.quaternion.setFromEuler(L.e.set(Math.atan2(dy / dt, spd), -L.hdg * D2R, -L.bank, 'YXZ'));
      FH.animateRig(L.rig, dt, { spin: 60, eff: 0.75, fuel: true, ctl: { p: 0, r: U.clamp(turn / dt * 0.1, -0.6, 0.6), y: 0 }, gear: 0 });
      m.label.position.set(L.pos.x, L.pos.y + 14, L.pos.z);
      // coloured smoke so it is easy to follow
      if (!L.orbit) {
        L.smokeT -= dt;
        while (L.smokeT <= 0) { L.smokeT += 0.05; const f = Math.sin(L.hdg * D2R), b = -Math.cos(L.hdg * D2R); g.fx.emit(L.pos.x - f * 5, L.pos.y, L.pos.z - b * 5, 0, 0.3, 0, 5, 1.2, 5, 0xffd23f, 0.5, 0.3, 0.2); }
      }
      const near = g.rookie ? 600 : 450, close = g.rookie ? 50 : 70;
      const inRange = !L.orbit && !ac.onGround && d < near && d > close;
      if (inRange) m.inT += dt;
      m.status = L.orbit ? (g.rookie ? 'Fly to the leader ⭐' : 'Join up with lead') : `${inRange ? '✅' : '⚠'} ${Math.round(d)} m · ${Math.floor(m.inT)}/${m.goal}s`;
      if (!L.orbit && d <= close) FH.UI.warn(g.rookie ? '⚠ Too close! Slow down a little.' : '⚠ Too close — open the gap', 0.3);
      if (m.inT >= m.goal && !m.completing) { m.completing = true; g.completeMission(); }
    },
    clear(g, m) {
      if (m.lead) g.scene.remove(m.lead.model);
      if (m.label) g.scene.remove(m.label);
    },
  };

  FH.MissionTypes = { medevac, drop, fire, tour, escort };
})();

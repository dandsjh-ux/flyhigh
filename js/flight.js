// FlyHigh - arcade flight model and chase camera
(function () {
  const FH = window.FH, U = FH.util, D2R = Math.PI / 180;

  class Aircraft {
    constructor(def, upg, paintHex, opts) {
      this.def = def; this.upg = upg; this.assist = !!opts.assist; this.fuelMult = opts.fuelMult || 1;
      this.computeStats();
      const b = def.build(paintHex);
      this.model = b.group; this.props = b.props; this.flames = b.flames; this.paintMats = b.paint;
      this.model.traverse(o => { if (o.isMesh) { o.castShadow = !!opts.shadows; } });
      this.pos = new THREE.Vector3(); this.quat = new THREE.Quaternion();
      this.speed = 0; this.sink = 0; this.throttle = 0; this.eff = 0; this.onGround = true; this.fuel = 1;
      this.vs = 0; this.agl = 0; this.crashed = false; this.gHdg = 0; this.stalled = false;
      this.hdg = 0; this.pitchA = 0; this.bankA = 0; this.propAngle = 0;
      this._f = new THREE.Vector3(); this._u = new THREE.Vector3(); this._r = new THREE.Vector3();
      this._q = new THREE.Quaternion(); this._e = new THREE.Euler();
    }
    computeStats() {
      const d = this.def, u = this.upg;
      this.st = {
        maxSpeed: d.maxSpeed * (1 + 0.07 * u.engine), accel: d.accel * (1 + 0.12 * u.engine),
        pitch: d.pitch * (1 + 0.1 * u.wings), roll: d.roll * (1 + 0.1 * u.wings), yaw: d.yaw, turn: d.turn * (1 + 0.08 * u.wings),
        stall: d.stall * (1 - 0.05 * u.wings), fuelTime: d.fuelTime * (1 + 0.35 * u.fuel), gear: d.gear, size: d.size, ceiling: d.ceiling,
      };
      this.st.takeoff = this.st.stall * 1.12;
    }
    setPaint(hex) { this.paintMats.forEach(m => m.color.setHex(hex)); }
    place(x, z, hdgDeg, world) {
      const h = Math.max(world.heightAt(x, z), 0);
      this.pos.set(x, h + this.st.gear, z);
      this.gHdg = hdgDeg * D2R;
      this.quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -this.gHdg);
      this.speed = 0; this.sink = 0; this.throttle = 0; this.onGround = true; this.crashed = false; this.vs = 0; this.powerLoss = 0;
      this.updateAngles(); this.sync();
    }
    placeAir(x, y, z, hdgDeg, speed) {
      this.pos.set(x, y, z); this.gHdg = hdgDeg * D2R;
      this.quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -this.gHdg);
      this.speed = speed; this.throttle = 0.7; this.onGround = false; this.crashed = false; this.sink = 0;
      this.updateAngles(); this.sync();
    }
    updateAngles() {
      const q = this.quat;
      const f = this._f.set(0, 0, -1).applyQuaternion(q), up = this._u.set(0, 1, 0).applyQuaternion(q), r = this._r.set(1, 0, 0).applyQuaternion(q);
      this.pitchA = Math.asin(U.clamp(f.y, -1, 1));
      this.bankA = Math.atan2(-r.y, up.y);
      this.hdg = U.norm360(Math.atan2(f.x, -f.z) / D2R);
      this.upY = up.y;
    }
    get kts() { return this.speed * 1.944; }
    get altFt() { return this.pos.y * 3.281; }

    update(dt, inp, world, ev) {
      if (this.crashed) return;
      const st = this.st;
      this.throttle = U.clamp(this.throttle + inp.throttle * dt * 0.6, 0, 1);
      if (inp.throttleAbs != null) this.throttle = inp.throttleAbs;
      const running = this.fuel > 0;
      if (this.powerLoss > 0) this.powerLoss -= dt;
      const eff = this.eff = running && !(this.powerLoss > 0) ? this.throttle : 0;
      if (running) this.fuel = Math.max(0, this.fuel - (0.25 + 0.75 * eff) * dt / st.fuelTime * this.fuelMult);
      this.updateAngles();
      if (this.onGround) this.groundUpdate(dt, inp, world, ev, eff);
      else this.airUpdate(dt, inp, world, ev, eff);
      this.updateAngles();
      this.animate(dt);
    }

    airUpdate(dt, inp, world, ev, eff) {
      const st = this.st, q = this.quat;
      const auth = U.clamp((this.speed - st.stall * 0.4) / (st.stall * 0.9), 0.12, 1);
      let pIn = inp.pitch, rIn = inp.roll, yIn = inp.yaw;
      if (this.assist) {
        if (Math.abs(rIn) < 0.1) rIn = U.clamp(-this.bankA * 1.6, -0.8, 0.8);
        if (this.bankA > 1.05 && rIn > 0) rIn = 0;
        if (this.bankA < -1.05 && rIn < 0) rIn = 0;
        if (this.pitchA > 0.6 && pIn > 0) pIn = 0;
        if (this.pitchA < -0.5 && pIn < 0) pIn = 0;
        if (Math.abs(pIn) < 0.1 && Math.abs(this.bankA) < 0.5) pIn += U.clamp(-this.pitchA * 0.8, -0.35, 0.35);
        // gentle automatic flare just above the ground so young pilots land softly
        if (this.agl < 14 && this.vs < -1.5 && this.pitchA < 0.12) pIn = Math.max(pIn, 0.5);
      }
      if (this.upY < 0) pIn = pIn; // inverted: controls stay the same (no assist)
      this._e.set(pIn * st.pitch * auth * dt, -yIn * st.yaw * auth * dt, -rIn * st.roll * auth * dt, 'XYZ');
      this._q.setFromEuler(this._e); q.multiply(this._q);
      // coordinated turn from bank
      const turn = Math.sin(this.bankA) * st.turn * auth * (this.upY > 0 ? 1 : 0.3);
      this._q.setFromAxisAngle(FH.UP, -turn * dt); q.premultiply(this._q);
      // stall behaviour
      const lift = U.clamp((this.speed - st.stall * 0.8) / (st.stall * 0.25), 0, 1);
      this.stalled = lift < 0.999;
      this.sink += ((1 - lift) * 20 - this.sink) * Math.min(1, dt * 1.2);
      if (lift < 1 && this.pitchA > -0.6) { this._q.setFromAxisAngle(FH.XAX, -(1 - lift) * 0.8 * dt); q.multiply(this._q); }
      q.normalize();
      const f = this._f.set(0, 0, -1).applyQuaternion(q);
      const drag = st.accel * Math.pow(this.speed / st.maxSpeed, 2);
      const grav = 9.81 * f.y * 0.6;
      const turnDrag = Math.abs(Math.sin(this.bankA)) * st.accel * 0.12 * (this.speed / st.maxSpeed);
      this.speed = U.clamp(this.speed + (eff * st.accel - drag - grav - turnDrag) * dt, 0, st.maxSpeed * 1.7);
      const prevY = this.pos.y;
      this.pos.addScaledVector(f, this.speed * dt);
      this.pos.y -= this.sink * dt;
      if (this.pos.y > st.ceiling) { this.pos.y = st.ceiling; if (this.pitchA > 0) { this._q.setFromAxisAngle(FH.XAX, -0.4 * dt); q.multiply(this._q); } }
      this.vs = (this.pos.y - prevY) / Math.max(dt, 1e-4);
      // ground contact
      const th = world.heightAt(this.pos.x, this.pos.z);
      const water = th < 0, surf = water ? 0 : th;
      this.agl = this.pos.y - st.gear - surf;
      if (this.agl <= 0) {
        if (water) { ev.crash('water'); return; }
        const lim = this.assist ? 7 : 4.5;
        const flat = world.normalYAt(this.pos.x, this.pos.z) > 0.94;
        if (-this.vs < lim && Math.abs(this.bankA) < (this.assist ? 0.55 : 0.45) && this.pitchA > (this.assist ? -0.35 : -0.2) && this.pitchA < 0.5 && flat && this.upY > 0) {
          const tdVs = -this.vs;
          this.onGround = true; this.pos.y = surf + st.gear; this.sink = 0;
          this.gHdg = this.hdg * D2R;
          this._e.set(0, -this.gHdg, 0, 'YXZ'); q.setFromEuler(this._e);
          ev.touchdown(tdVs);
        } else ev.crash('ground');
      }
    }

    groundUpdate(dt, inp, world, ev, eff) {
      const st = this.st;
      const steer = U.clamp(inp.roll + inp.yaw, -1, 1);
      const steerRate = steer * 0.75 * U.clamp(1.3 - this.speed / (st.takeoff * 1.4), 0.2, 1);
      if (this.speed > 0.3 || Math.abs(eff) > 0.05) this.gHdg += steerRate * dt;
      const drag = st.accel * Math.pow(this.speed / st.maxSpeed, 2);
      const friction = this.speed > 0.05 ? 0.4 : 0;
      const brake = inp.brake ? 8 : 0;
      this.speed = Math.max(0, this.speed + (eff * st.accel * 1.05 - drag - friction - brake) * dt);
      const rotating = this.speed > st.takeoff * 0.8 && inp.pitch > 0.2;
      const pitch = rotating ? 0.1 : 0;
      this._e.set(pitch, -this.gHdg, 0, 'YXZ'); this.quat.setFromEuler(this._e);
      this.pos.x += Math.sin(this.gHdg) * this.speed * dt;
      this.pos.z += -Math.cos(this.gHdg) * this.speed * dt;
      const th = world.heightAt(this.pos.x, this.pos.z);
      if (th < 0) { ev.crash('water'); return; }
      this.pos.y = th + st.gear; this.vs = 0; this.agl = 0; this.sink = 0; this.stalled = false;
      if (rotating && this.speed >= st.takeoff) {
        this.onGround = false; this.pos.y += 0.4;
        this._e.set(0.12, -this.gHdg, 0, 'YXZ'); this.quat.setFromEuler(this._e);
        ev.liftoff();
      }
    }

    animate(dt) {
      const spin = this.fuel > 0 ? 18 + this.eff * 70 : Math.max(0, this.speed * 0.3);
      this.propAngle += spin * dt;
      for (const p of this.props) {
        p.userData.spinner.rotation.z = this.propAngle;
        const d = p.children[1];
        if (d) d.material.opacity = spin > 30 ? 0.18 : 0;
      }
      for (const f of this.flames) {
        const s = this.fuel > 0 ? 0.25 + this.eff * 0.9 : 0;
        f.scale.set(0.6 + this.eff * 0.5, 0.6 + this.eff * 0.5, s + Math.random() * 0.08 * this.eff);
        f.visible = s > 0.01;
      }
      this.sync();
    }
    sync() { this.model.position.copy(this.pos); this.model.quaternion.copy(this.quat); }
  }
  FH.Aircraft = Aircraft;

  class CameraRig {
    constructor(camera) {
      this.cam = camera; this.mode = 0; this.init = false;
      this.smoothQ = new THREE.Quaternion(); this.pos = new THREE.Vector3();
      this.orbitYaw = 0; this.orbitPitch = 0; this.dragging = false; this.shake = 0;
      this._tq = new THREE.Quaternion(); this._o = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._t = new THREE.Vector3();
      this._up = new THREE.Vector3(); this._e = new THREE.Euler();
    }
    reset() { this.init = false; this.cineInit = false; this.cineT = 0; }
    update(dt, ac, world) {
      const cam = this.cam, s = ac.st.size;
      if (this.cinematic) { this.cinematicShot(dt, ac, world); return; }
      if (this.mode === 1) {
        this._v.set(0, 0.85 * s, -0.4 * s).applyQuaternion(ac.quat);
        cam.position.copy(ac.pos).add(this._v);
        this._o.setFromEuler(this._e.set(this.orbitPitch, this.orbitYaw, 0, 'YXZ'));
        cam.quaternion.copy(ac.quat).multiply(this._o);
        cam.up.set(0, 1, 0);
        ac.model.visible = false;
        this.setFov(cam, 68);
        this.init = false;
        return;
      }
      ac.model.visible = true;
      this._tq.setFromEuler(this._e.set(ac.pitchA * 0.6, -ac.hdg * D2R, 0, 'YXZ'));
      if (!this.init) this.smoothQ.copy(this._tq);
      else this.smoothQ.slerp(this._tq, 1 - Math.exp(-dt * 3.2));
      if (!this.dragging) { this.orbitYaw *= Math.exp(-dt * 2); this.orbitPitch *= Math.exp(-dt * 2); }
      const far = this.mode === 2;
      const dist = (far ? 34 : 14) * s + ac.speed * 0.035;
      this._v.set(0, (far ? 9 : 3.6) * s, dist);
      this._o.setFromEuler(this._e.set(-this.orbitPitch, this.orbitYaw, 0, 'YXZ'));
      this._v.applyQuaternion(this._o).applyQuaternion(this.smoothQ);
      const want = this._t.copy(ac.pos).add(this._v);
      if (!this.init) { this.pos.copy(want); this.init = true; }
      else this.pos.lerp(want, 1 - Math.exp(-dt * 9));
      cam.position.copy(this.pos);
      if (this.shake > 0.03) { const k = Math.min(1, this.shake) * 0.35 * s; cam.position.x += (Math.random() - 0.5) * k; cam.position.y += (Math.random() - 0.5) * k; cam.position.z += (Math.random() - 0.5) * k; }
      const ground = Math.max(world.heightAt(cam.position.x, cam.position.z), 0) + 1.5;
      if (cam.position.y < ground) cam.position.y = ground;
      this._up.set(0, 1, 0).applyQuaternion(ac.quat);
      cam.up.set(0, 1, 0).lerp(this._up, ac.onGround ? 0 : 0.3).normalize();
      // look a little ahead of the plane so the horizon (and word gates) sit near screen centre
      this._v.set(0, 0, -1).applyQuaternion(this.smoothQ);
      this._t.copy(ac.pos).addScaledVector(this._v, far ? 10 * s : 26 * s); this._t.y += (far ? 1.5 : 2.2) * s;
      cam.lookAt(this._t);
      this.setFov(cam, 60 + U.clamp(ac.speed / ac.st.maxSpeed, 0, 1.3) * 12);
    }
    // slow, film-style shots that change every few seconds while cruising
    cinematicShot(dt, ac, world) {
      const cam = this.cam, s = ac.st.size;
      this.cineT = (this.cineT || 0) + dt;
      const SHOTS = [[24, 4, 10], [-20, 2, -34], [0, 30, 60], [60, 14, -18], [-34, -3, 16], [8, 70, 8]];
      const sh = SHOTS[Math.floor(this.cineT / 7) % SHOTS.length];
      this._v.set(sh[0] * s, sh[1] * s, sh[2] * s).applyAxisAngle(FH.UP, Math.sin(this.cineT * 0.12) * 0.35);
      this._o.setFromAxisAngle(FH.UP, -ac.hdg * D2R);
      this._v.applyQuaternion(this._o);
      if (!this.cineInit) { this.cineOff = this._v.clone(); this.cineInit = true; }
      else this.cineOff.lerp(this._v, 1 - Math.exp(-dt * 0.8));
      cam.position.copy(ac.pos).add(this.cineOff);
      const ground = Math.max(world.heightAt(cam.position.x, cam.position.z), 0) + 4;
      if (cam.position.y < ground) cam.position.y = ground;
      cam.up.set(0, 1, 0);
      cam.lookAt(ac.pos);
      ac.model.visible = true;
      this.setFov(cam, 48);
      this.init = false;
    }
    setFov(cam, f) {
      if (Math.abs(cam.fov - f) > 0.05) { cam.fov += (f - cam.fov) * 0.1; cam.updateProjectionMatrix(); }
    }
  }
  FH.CameraRig = CameraRig;
})();

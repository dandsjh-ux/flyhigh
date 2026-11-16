// FlyHigh - boot, settings, input and the render loop
(function () {
  const FH = window.FH, U = FH.util;

  FH.QUALITY = {
    low: { pr: 1.0, aa: false, shadows: false, shadowSize: 0, trees: 7000, clouds: 40, view: 7500 },
    medium: { pr: 1.25, aa: true, shadows: true, shadowSize: 1024, trees: 15000, clouds: 70, view: 10000 },
    high: { pr: 1.75, aa: true, shadows: true, shadowSize: 2048, trees: 26000, clouds: 100, view: 14000 },
  };

  FH.Settings = {
    data: { quality: 'medium', planeVol: 0.7, voiceVol: 0.9, voice: true, invert: false, daynight: true, seed: 7 },
    load() {
      let saved = {};
      try { saved = JSON.parse(localStorage.getItem('flyhigh_settings') || '{}'); } catch (e) { }
      if (saved.volume != null && saved.planeVol == null) saved.planeVol = saved.volume; // older saves had one volume slider
      delete saved.volume;
      Object.assign(this.data, saved);
      if (!FH.QUALITY[this.data.quality]) this.data.quality = 'medium';
    },
    save() { try { localStorage.setItem('flyhigh_settings', JSON.stringify(this.data)); } catch (e) { } },
    apply() { FH.Audio.setVolumes(this.data.planeVol, this.data.voiceVol); FH.Audio.voiceOn = this.data.voice; if (!this.data.voice) FH.Audio.stopSpeech(); },
  };

  FH.Input = {
    keys: {}, pitch: 0, roll: 0, yaw: 0, throttle: 0, throttleAbs: null, brake: false,
    init(canvas) {
      const GAME_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'];
      addEventListener('keydown', e => {
        if (e.target && e.target.tagName === 'INPUT') return;
        if (GAME_KEYS.includes(e.code)) e.preventDefault();
        const first = !this.keys[e.code];
        this.keys[e.code] = true;
        if (first) FH.Game.onKey(e);
      });
      addEventListener('keyup', e => { this.keys[e.code] = false; });
      addEventListener('blur', () => { this.keys = {}; });
      // mouse drag to look around
      let lx = 0, ly = 0;
      canvas.addEventListener('pointerdown', e => { if (!FH.Game.rig) return; FH.Game.rig.dragging = true; lx = e.clientX; ly = e.clientY; canvas.setPointerCapture(e.pointerId); });
      canvas.addEventListener('pointermove', e => {
        const r = FH.Game.rig; if (!r || !r.dragging) return;
        r.orbitYaw -= (e.clientX - lx) * 0.006; r.orbitPitch = U.clamp(r.orbitPitch + (e.clientY - ly) * 0.004, -0.6, 1.0);
        lx = e.clientX; ly = e.clientY;
      });
      const up = () => { if (FH.Game.rig) FH.Game.rig.dragging = false; };
      canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    },
    poll(dt) {
      const k = this.keys;
      let tp = (k.ArrowUp || k.KeyW ? 1 : 0) - (k.ArrowDown || k.KeyS ? 1 : 0);
      if (FH.Settings.data.invert) tp = -tp;
      const tr = (k.ArrowRight || k.KeyD ? 1 : 0) - (k.ArrowLeft || k.KeyA ? 1 : 0);
      const ty = (k.KeyE ? 1 : 0) - (k.KeyQ ? 1 : 0);
      this.throttle = (k.ShiftLeft || k.ShiftRight || k.KeyR ? 1 : 0) - (k.KeyZ || k.KeyF ? 1 : 0);
      this.brake = !!(k.Space || k.KeyB);
      this.throttleAbs = null;
      // gamepad
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const gp = pads && Array.from(pads).find(p => p && p.connected);
      if (gp) {
        const dz = v => Math.abs(v) < 0.12 ? 0 : v;
        const ax = dz(gp.axes[0] || 0), ay = dz(gp.axes[1] || 0);
        if (ax) this.roll = ax;
        if (ay) this.pitch = FH.Settings.data.invert ? ay : -ay;
        const rt = gp.buttons[7] ? gp.buttons[7].value : 0, lt = gp.buttons[6] ? gp.buttons[6].value : 0;
        if (rt > 0.05 || lt > 0.05) this.throttle = rt - lt;
        if (gp.buttons[4] && gp.buttons[4].pressed) this.yaw = -1; else if (gp.buttons[5] && gp.buttons[5].pressed) this.yaw = 1;
        if (gp.buttons[0] && gp.buttons[0].pressed) this.brake = true;
        const pressed = i => gp.buttons[i] && gp.buttons[i].pressed;
        const map = { 1: 'KeyX', 3: 'KeyC', 9: 'Escape', 8: 'KeyM', 2: 'KeyH', 12: 'Digit1', 13: 'Digit2', 14: 'Digit3' };
        this.padPrev = this.padPrev || {};
        for (const i in map) { const p = pressed(+i); if (p && !this.padPrev[i]) FH.Game.onKey({ code: map[i], preventDefault() { } }); this.padPrev[i] = p; }
        if (ax || ay) { this.yaw = this.yaw || 0; return; }
      }
      this.pitch = U.approach(this.pitch, tp, dt * 3.2);
      this.roll = U.approach(this.roll, tr, dt * 4);
      this.yaw = U.approach(this.yaw, ty, dt * 3);
    },
  };

  FH.boot = async function () {
    FH.UP = new THREE.Vector3(0, 1, 0); FH.XAX = new THREE.Vector3(1, 0, 0);
    FH.Settings.load();
    const S = FH.Settings.data, Q = Object.assign({}, FH.QUALITY[S.quality]);
    FH.Audio.planeVol = S.planeVol; FH.Audio.voiceVol = S.voiceVol; FH.Audio.voiceOn = S.voice;
    try { await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 2500))]); } catch (e) { }

    const canvas = document.getElementById('gl');
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: Q.aa, powerPreference: 'high-performance', stencil: false });
    } catch (e) {
      document.getElementById('loadText').textContent = 'Sorry — WebGL is not available in this browser.';
      return;
    }
    const maxPR = Math.min(window.devicePixelRatio || 1, Q.pr);
    let pr = maxPR;
    renderer.setPixelRatio(pr);
    renderer.setSize(innerWidth, innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = !!Q.shadows;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(62, Math.max(1, innerWidth) / Math.max(1, innerHeight), 2.5, 40000);

    FH.UI.init();
    FH.Input.init(canvas);

    const world = new FH.World(scene, renderer, { quality: Q, seed: S.seed });
    await world.build((p, t) => FH.UI.setLoad(p, t));
    FH.Game.init({ renderer, scene, camera, world });
    FH.Settings.apply();

    let lastW = 0, lastH = 0;
    const onResize = () => {
      const w = Math.max(1, innerWidth), h = Math.max(1, innerHeight);
      if (w === lastW && h === lastH) return;
      lastW = w; lastH = h;
      renderer.setSize(w, h);
      camera.aspect = w / h; camera.updateProjectionMatrix();
    };
    addEventListener('resize', onResize);
    onResize();
    document.addEventListener('visibilitychange', () => { if (document.hidden && FH.Game.state === 'flying') FH.Game.pause(); });
    addEventListener('beforeunload', () => FH.Game.saveProfile());

    // warm-up render so shaders compile before the player starts
    FH.Game.attract(0);
    renderer.compile(scene, camera);
    FH.UI.titleReady();

    // adaptive resolution: keep the frame rate smooth on integrated GPUs
    let last = performance.now(), fpsAcc = 0, fpsN = 0, fpsT = 0;
    const loop = (now) => {
      requestAnimationFrame(loop);
      let dt = (now - last) / 1000; last = now;
      if (dt > 0.1) dt = 0.1;
      if (dt <= 0) return;
      onResize();
      FH.Game.frame(dt);
      FH.Game.fx.setScale(renderer.domElement.height, camera.fov);
      renderer.render(scene, camera);
      fpsAcc += dt; fpsN++; fpsT += dt;
      if (fpsT > 2.5) {
        const fps = fpsN / fpsAcc;
        let np = pr;
        if (fps < 42 && pr > 0.6) np = Math.max(0.6, pr - 0.15);
        else if (fps > 57 && pr < maxPR) np = Math.min(maxPR, pr + 0.1);
        if (np !== pr) { pr = np; renderer.setPixelRatio(pr); renderer.setSize(Math.max(1, innerWidth), Math.max(1, innerHeight)); }
        fpsAcc = 0; fpsN = 0; fpsT = 0;
        FH.fps = fps;
      }
    };
    requestAnimationFrame(loop);
  };
})();

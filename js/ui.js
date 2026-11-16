// FlyHigh - HUD, menus, hangar, quiz and map UI
(function () {
  const FH = window.FH, U = FH.util, D2R = Math.PI / 180;
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const GATE_CSS = ['#36c5ff', '#ff7ad9', '#ffb13b', '#9d7bff'];

  const UI = FH.UI = {
    quizOpen: false, warnT: 0, warnText: '', tipText: null, lastFp: -1, tab: 'missions',

    init() {
      document.querySelectorAll('.modeCard').forEach(card => {
        const mode = card.dataset.mode;
        card.querySelector('.play').onclick = () => { FH.Audio.init(); FH.Audio.sfx('click'); FH.Game.startMode(mode); };
        card.querySelector('.reset').onclick = () => {
          if (confirm(`Start a brand new ${mode === 'rookie' ? 'Rookie' : 'Normal'} pilot? Your saved progress for this mode will be deleted.`)) { FH.Game.resetProfile(mode); this.refreshSaveInfo(); }
        };
      });
      $('btnSettings').onclick = () => this.showSettings();
      $('btnControls').onclick = () => this.show('controls');
      $('cClose').onclick = () => this.hide('controls');
      $('sClose').onclick = () => this.closeSettings();
      $('sNewWorld').onclick = () => {
        if (confirm('Create a brand new world? The page will reload. Your FlightPoints and planes are kept.')) { FH.Settings.data.seed = Math.floor(Math.random() * 99999) + 1; FH.Settings.save(); location.reload(); }
      };
      $('pResume').onclick = () => FH.Game.resume();
      $('pMap').onclick = () => { this.hidePause(); FH.Game.state = 'flying'; FH.Game.openMap(); };
      $('pSettings').onclick = () => this.showSettings();
      $('pControls').onclick = () => this.show('controls');
      $('pAbandon').onclick = () => { FH.Game.abandonMission(); this.showPause(FH.Game); };
      $('pQuit').onclick = () => { this.hidePause(); FH.Game.quitToTitle(); };
      $('mapClose').onclick = () => FH.Game.closeMap();
      $('hgTakeoff').onclick = () => { FH.Audio.sfx('click'); FH.Game.takeOff(); };
      document.querySelectorAll('#hangar .tab').forEach(t => t.onclick = () => { FH.Audio.sfx('click'); this.renderTab(t.dataset.tab); });
      $('hgBody').onclick = e => this.hangarClick(e);
      $('atcRb').onclick = e => { const b = e.target.closest('[data-rb]'); if (b) FH.Game.answerReadback(+b.dataset.rb); };
      $('atcRepeat').onclick = () => { const a = FH.Game.atc; if (a) FH.Audio.speak(a.speak, { rate: FH.Game.rookie ? 0.85 : 1 }); };
      $('quizSpeak').onclick = () => { if (this.qz) FH.Audio.speak(this.qz.questions[this.qz.i].speak, { rate: 0.85 }); };
      $('quizNext').onclick = () => this.quizNext();
      $('quizOpts').onclick = e => { const b = e.target.closest('[data-opt]'); if (b) this.quizAnswer(+b.dataset.opt); };
      $('nameInput').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') $('nameOk').click(); });
      this.compassCtx = $('compass').getContext('2d');
      this.miniCtx = $('minimap').getContext('2d');
    },
    show(id) { $(id).classList.remove('hidden'); },
    hide(id) { $(id).classList.add('hidden'); },

    // ---------- title ----------
    setLoad(p, text) { $('loadFill').style.width = Math.round(p * 100) + '%'; if (text) $('loadText').textContent = text; },
    titleReady() {
      $('loadWrap').classList.add('done');
      document.querySelectorAll('.modeCard .play').forEach(b => b.disabled = false);
      this.refreshSaveInfo();
    },
    refreshSaveInfo() {
      document.querySelectorAll('.modeCard').forEach(card => {
        const p = FH.Game.loadProfile(card.dataset.mode);
        const info = card.querySelector('.saveInfo'), play = card.querySelector('.play'), reset = card.querySelector('.reset');
        if (p) {
          const r = FH.RANKS[FH.Game.rankIdx(p.total)];
          info.innerHTML = `<b>${esc(U.cap(p.name))}</b> · ${r[2]} ${r[1]}<br>🪙 ${U.fmt(p.fp)} FP · ${FH.planeById(p.current).name}`;
          play.textContent = `Continue ${card.dataset.mode === 'rookie' ? 'Rookie' : 'Normal'}`; reset.classList.remove('hidden');
        } else {
          info.textContent = 'No pilot yet — start your adventure!';
          play.textContent = `Play ${card.dataset.mode === 'rookie' ? 'Rookie' : 'Normal'}`; reset.classList.add('hidden');
        }
      });
    },
    showTitle() {
      ['hud', 'pause', 'hangar', 'mapDlg', 'pickDlg', 'quiz'].forEach(id => this.hide(id));
      this.show('title'); this.refreshSaveInfo();
    },
    askName(mode, cb) {
      this.show('nameDlg');
      $('nameTitle').textContent = mode === 'rookie' ? 'What is your name, pilot?' : 'Enter your pilot callsign';
      const inp = $('nameInput'); inp.value = ''; setTimeout(() => inp.focus(), 50);
      $('nameOk').onclick = () => {
        let n = inp.value.trim().replace(/[^A-Za-z0-9 \-']/g, '').slice(0, 12);
        if (!n) n = 'Pilot';
        this.hide('nameDlg'); cb(n);
      };
      $('nameCancel').onclick = () => this.hide('nameDlg');
    },
    enterGame(g) {
      this.hide('title'); this.show('hud');
      this.lastFp = -1; this.tipText = undefined; this.tip(null);
      this.missionHide(); this.hideQuestion(); this.atcHide();
      document.body.classList.toggle('rookie', g.rookie);
    },

    // ---------- HUD ----------
    hud(g, dt) {
      const ac = g.ac, p = g.profile;
      if (p.fp !== this.lastFp) {
        this.lastFp = p.fp; $('fpVal').textContent = U.fmt(p.fp);
        const ri = g.rankIdx(p.total), r = FH.RANKS[ri], nx = FH.RANKS[ri + 1];
        $('rankIcon').textContent = r[2]; $('rankName').textContent = r[1];
        $('rankFill').style.width = (nx ? U.clamp((p.total - r[0]) / (nx[0] - r[0]), 0, 1) * 100 : 100) + '%';
      }
      const ct = $('comboTag');
      if (g.combo >= 2) { ct.classList.remove('hidden'); ct.textContent = `🔥 ${g.combo} in a row${g.comboMult() > 1 ? ` · x${g.comboMult()}` : ''}`; } else ct.classList.add('hidden');
      $('spdVal').textContent = Math.round(ac.kts);
      $('altVal').textContent = U.fmt(Math.round(ac.altFt / 10) * 10);
      const vsf = ac.vs * 196.85;
      $('vsVal').textContent = ac.onGround ? 'on ground' : (Math.abs(vsf) < 50 ? 'level' : `${vsf > 0 ? '▲' : '▼'} ${U.fmt(Math.abs(Math.round(vsf / 10) * 10))} ft/min`);
      $('thrFill').style.width = (ac.throttle * 100) + '%';
      const ff = $('fuelFill'); ff.style.width = (ac.fuel * 100) + '%'; ff.style.background = ac.fuel < 0.2 ? '#ff5c6c' : ac.fuel < 0.4 ? '#ffb13b' : '#3ddc84';
      $('planeTag').textContent = `${ac.def.emoji} ${ac.def.name}${g.smoke ? ' · 💨' : ''}`;
      const W = g.world, tt = `${W.night > 0.5 ? '🌙' : W.hour < 8 ? '🌅' : W.hour > 17 ? '🌇' : '☀️'} ${W.clock()}${W.lightsOn > 0.5 ? (g.rookie ? ' · lights on' : ' · airport lights on') : ''}`;
      if ($('timeTag').textContent !== tt) $('timeTag').textContent = tt;
      $('cross').classList.toggle('hidden', g.rig.mode !== 1);
      this.drawCompass(g);
      this.miniT = (this.miniT || 0) + dt;
      if (this.miniT > 0.05) { this.miniT = 0; this.drawMinimap(g); }
      this.updateMissionBox(g);
      this.updateMarker(g);
      if (g.cruise) this.cruiseHud(g);
      // warnings
      let w = null;
      const stallK = Math.round(ac.st.stall * 1.944);
      if (ac.crashed) w = null;
      else if (!ac.onGround && ac.stalled) { w = g.rookie ? `⚠ TOO SLOW! Add power (SHIFT) and point the nose down` : `⚠ STALL — lower the nose and add power (stall ${stallK} kn)`; this.beepT = (this.beepT || 0) - dt; if (this.beepT <= 0) { this.beepT = 0.8; FH.Audio.sfx('stall'); } }
      else if (!ac.onGround && ac.agl < 70 && ac.vs < -9 && !g.nearLanding()) w = '⚠ PULL UP!';
      else if (!ac.onGround && !g.cruise && ac.speed > 15 && !g.nearLanding() && this.terrainAhead(g)) w = g.rookie ? '⛰ MOUNTAIN AHEAD! Climb up (↓) or turn!' : '⛰ TERRAIN AHEAD — CLIMB';
      else if (ac.fuel <= 0) w = g.rookie ? '⛽ No fuel! Glide down and land carefully.' : '⛽ Fuel exhausted — glide to a safe landing.';
      else if (g.outOfBounds) w = g.rookie ? '↩ Turn back! You are leaving the map.' : '↩ Leaving the operating area — turn back.';
      else if (ac.fuel < 0.18 && !ac.onGround) w = g.rookie ? '⛽ Fuel is low! Land at an airport to fill up.' : '⛽ Low fuel — land at an airport to refuel.';
      if (this.warnT > 0) { this.warnT -= dt; if (!w) w = this.warnText; }
      const wb = $('warnBox');
      if (w) { if (wb.textContent !== w) wb.textContent = w; wb.classList.remove('hidden'); } else wb.classList.add('hidden');
      // prompt
      let pr = null;
      if (g.canOpenHangar()) pr = g.rookie ? '🔧 Press H to open the Hangar (missions, planes, upgrades)' : '🔧 H — Hangar  ·  Refuelling…';
      else if (ac.onGround && g.atAirport && ac.speed >= 6 && ac.throttle < 0.2) pr = 'Hold SPACE to brake';
      const pb = $('promptBox');
      if (pr) { if (pb.textContent !== pr) pb.textContent = pr; pb.classList.remove('hidden'); } else pb.classList.add('hidden');
      this.weatherHud(g);
    },
    weatherHud(g) {
      const wx = FH.Weather, ac = g.ac, on = wx.enabled();
      const row = $('wxRow');
      if (!on) { row.classList.add('hidden'); $('radarBox').classList.add('hidden'); return; }
      row.classList.remove('hidden');
      const K = wx.info(), kts = Math.round(wx.windSpd * wx.gustMul * 1.944);
      $('wxIcon').textContent = K.icon;
      const txt = `${g.rookie ? K.nameR : K.name} · Wind ${g.rookie ? 'from ' + FH.cardOf(wx.windDir) : String(Math.round(wx.windDir) % 360 || 360).padStart(3, '0') + '°'} ${kts} kn`;
      if ($('wxText').textContent !== txt) $('wxText').textContent = txt;
      // arrow shows where the wind is pushing you, relative to the nose
      $('wxArrow').style.transform = `rotate(${U.angDiff(ac.hdg, wx.windDir + 180)}deg)`;
      $('wxArrow').style.visibility = kts > 3 ? 'visible' : 'hidden';
      // radar warning
      const rb = $('radarBox');
      let msg = null, cls = '';
      if (!ac.onGround && wx.cells.length) {
        const th = wx.threatAhead(ac);
        if (th && th.inside) msg = g.rookie ? '⛈ YOU ARE IN THE STORM! Turn out!' : '⛈ IN THUNDERSTORM CELL — EXIT NOW';
        else if (th) { msg = `⛈ RADAR: storm ahead ${(th.dist / 1000).toFixed(1)} km`; if (th.dist > 2500) cls = 'warn'; }
      }
      if (!msg && !ac.onGround && wx.kind === 'windy' && wx.gustMul > 1.3) { msg = g.rookie ? '💨 Strong gust! Hold on!' : '💨 Gusts — expect turbulence'; cls = 'warn'; }
      if (msg) { if (rb.textContent !== msg) rb.textContent = msg; rb.className = cls; } else rb.className = 'hidden';
    },
    drawStorms(c, P, scale, time) {
      for (const s of FH.Weather.cells) {
        if (s.intensity < 0.05) continue;
        const [x, y] = P(s.x, s.z), r = s.r * scale;
        const grd = c.createRadialGradient(x, y, 0, x, y, r * 1.35);
        const a = s.intensity;
        grd.addColorStop(0, `rgba(220,20,40,${0.85 * a})`); grd.addColorStop(0.45, `rgba(255,120,0,${0.7 * a})`);
        grd.addColorStop(0.75, `rgba(255,230,0,${0.55 * a})`); grd.addColorStop(1, 'rgba(40,200,60,0)');
        c.fillStyle = grd; c.beginPath(); c.arc(x, y, r * 1.35, 0, 7); c.fill();
        if (s.boltT > 0) { c.fillStyle = '#ffffff'; c.font = '16px sans-serif'; c.fillText('⚡', x, y); }
      }
    },
    terrainAhead(g) {
      const ac = g.ac, W = g.world, f = ac._f;
      for (const t of [3, 6]) {
        const x = ac.pos.x + f.x * ac.speed * t, z = ac.pos.z + f.z * ac.speed * t, y = ac.pos.y + f.y * ac.speed * t;
        if (W.heightAt(x, z) + 15 > y && W.heightAt(x, z) > 2) return true;
      }
      return false;
    },
    warn(text, secs) { this.warnText = text; this.warnT = secs; },

    drawCompass(g) {
      const c = this.compassCtx, W = 460, H = 52, hdg = g.ac.hdg, ppd = W / 110;
      c.clearRect(0, 0, W, H);
      const grd = c.createLinearGradient(0, 0, W, 0);
      grd.addColorStop(0, 'rgba(10,28,52,0)'); grd.addColorStop(0.15, 'rgba(10,28,52,0.7)'); grd.addColorStop(0.85, 'rgba(10,28,52,0.7)'); grd.addColorStop(1, 'rgba(10,28,52,0)');
      c.fillStyle = grd; c.fillRect(0, 0, W, H);
      c.textAlign = 'center'; c.textBaseline = 'middle';
      const start = Math.floor((hdg - 60) / 5) * 5;
      for (let d = start; d <= hdg + 60; d += 5) {
        const x = W / 2 + (d - hdg) * ppd, dd = U.norm360(d);
        if (x < 0 || x > W) continue;
        const major = dd % 30 === 0;
        c.fillStyle = 'rgba(255,255,255,0.8)';
        c.fillRect(x - 0.75, H - (major ? 16 : 9), 1.5, major ? 16 : 9);
        if (major) {
          const card = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[dd];
          c.font = card ? '700 20px Fredoka, sans-serif' : '600 14px Nunito, sans-serif';
          c.fillStyle = card ? (card === 'N' ? '#ff6b6b' : '#ffe08a') : '#dfe9ff';
          c.fillText(card || String(dd / 10 | 0).padStart(2, '0'), x, 17);
        }
      }
      const bug = (deg, col, shape) => {
        let d = U.angDiff(hdg, deg); const clamped = Math.abs(d) > 55;
        d = U.clamp(d, -55, 55);
        const x = W / 2 + d * ppd;
        c.fillStyle = col; c.beginPath();
        if (shape === 'tri') { c.moveTo(x, H - 18); c.lineTo(x - 8, H - 30); c.lineTo(x + 8, H - 30); }
        else { c.moveTo(x, H - 30); c.lineTo(x - 7, H - 22); c.lineTo(x, H - 14); c.lineTo(x + 7, H - 22); }
        c.fill();
        if (clamped) { c.font = '700 14px Nunito'; c.fillText(d < 0 ? '◀' : '▶', x + (d < 0 ? 14 : -14), H - 22); }
      };
      const tgt = g.targetOf(g.mission);
      if (tgt) bug(U.norm360(Math.atan2(tgt.x - g.ac.pos.x, -(tgt.z - g.ac.pos.z)) / D2R), '#ffd23f', 'dia');
      if (g.atc && !g.atc.done) {
        if (g.atc.tgtHdg != null) bug(g.atc.tgtHdg, '#4dff88', 'tri');
        if (g.atc.tgtPos) bug(U.norm360(Math.atan2(g.atc.tgtPos.x - g.ac.pos.x, -(g.atc.tgtPos.z - g.ac.pos.z)) / D2R), '#4dff88', 'tri');
      }
      // centre readout box
      c.fillStyle = 'rgba(5,16,32,0.92)'; c.strokeStyle = '#ffffff'; c.lineWidth = 1.5;
      c.beginPath(); c.rect(W / 2 - 28, 2, 56, 24); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(W / 2 - 6, 26); c.lineTo(W / 2 + 6, 26); c.lineTo(W / 2, 33); c.closePath(); c.fillStyle = '#ffffff'; c.fill();
      c.fillRect(W / 2 - 1, 33, 2, H - 33);
      c.font = '800 16px Nunito, sans-serif'; c.fillStyle = '#fff';
      c.fillText(String(Math.round(hdg) % 360).padStart(3, '0') + '°', W / 2, 15);
    },

    drawMinimap(g) {
      const c = this.miniCtx, S = 220, w = g.world, ac = g.ac;
      const range = g.ac.def.jet ? 14000 : 9000, mpp = range / S;
      const k = w.mapCanvas.width / w.SIZE;
      c.save();
      c.clearRect(0, 0, S, S);
      c.beginPath(); c.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2); c.clip();
      c.fillStyle = '#0f5a8f'; c.fillRect(0, 0, S, S);
      const src = range * k;
      c.drawImage(w.mapCanvas, (ac.pos.x + w.HALF) * k - src / 2, (ac.pos.z + w.HALF) * k - src / 2, src, src, 0, 0, S, S);
      const P = (x, z) => [S / 2 + (x - ac.pos.x) / mpp, S / 2 + (z - ac.pos.z) / mpp];
      c.textAlign = 'center'; c.textBaseline = 'middle';
      this.drawStorms(c, P, 1 / mpp, g.time);
      // rescue area
      const m = g.mission;
      if (m && m.type === 'rescue') { const [x, y] = P(m.area.x, m.area.z); c.strokeStyle = 'rgba(255,210,63,0.9)'; c.setLineDash([5, 4]); c.lineWidth = 2; c.beginPath(); c.arc(x, y, m.area.r / mpp, 0, Math.PI * 2); c.stroke(); c.setLineDash([]); }
      if (m && m.type === 'rings' && m.rings) m.rings.forEach((r, i) => { if (i < m.ringIdx) return; const [x, y] = P(r.pos.x, r.pos.z); c.fillStyle = i === m.ringIdx ? '#ffd23f' : 'rgba(255,255,255,0.6)'; c.beginPath(); c.arc(x, y, i === m.ringIdx ? 5 : 3, 0, 7); c.fill(); });
      c.font = '13px sans-serif';
      w.landmarks.forEach(l => { const [x, y] = P(l.x, l.z); if (x > -10 && x < S + 10 && y > -10 && y < S + 10) c.fillText(l.emoji, x, y); });
      w.airports.forEach(a => {
        const [x, y] = P(a.x, a.z);
        c.save(); c.translate(x, y); c.rotate(a.hdg * D2R);
        c.fillStyle = (m && m.airport === a) ? '#ffd23f' : '#ffffff'; c.fillRect(-2, -9, 4, 18); c.restore();
      });
      // treasure sparkle hints
      w.treasures.forEach(t => { if (!t.mesh.visible) return; const d = Math.hypot(t.x - ac.pos.x, t.z - ac.pos.z); if (d < 1500) { const [x, y] = P(t.x, t.z); c.fillStyle = `rgba(255,220,80,${0.5 + Math.sin(g.time * 6) * 0.4})`; c.font = '12px sans-serif'; c.fillText('✦', x, y); } });
      if (g.gate && !g.gate.done) g.gate.items.forEach((it, i) => { const [x, y] = P(it.pos.x, it.pos.z); c.fillStyle = GATE_CSS[i]; c.beginPath(); c.arc(x, y, 3.5, 0, 7); c.fill(); });
      const drawTarget = (t, col) => {
        let [x, y] = P(t.x, t.z); const dx = x - S / 2, dy = y - S / 2, dl = Math.hypot(dx, dy), max = S / 2 - 12;
        if (dl > max) { x = S / 2 + dx / dl * max; y = S / 2 + dy / dl * max; }
        c.fillStyle = col; c.strokeStyle = '#000'; c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(x, y - 8); c.lineTo(x + 7, y); c.lineTo(x, y + 8); c.lineTo(x - 7, y); c.closePath(); c.fill(); c.stroke();
      };
      const tgt = g.targetOf(m); if (tgt) drawTarget(tgt, '#ffd23f');
      if (g.atc && !g.atc.done && g.atc.tgtPos) drawTarget(g.atc.tgtPos, '#4dff88');
      // player arrow
      c.save(); c.translate(S / 2, S / 2); c.rotate(ac.hdg * D2R);
      c.fillStyle = '#ff4d5e'; c.strokeStyle = '#fff'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(0, -10); c.lineTo(7, 8); c.lineTo(0, 4); c.lineTo(-7, 8); c.closePath(); c.fill(); c.stroke();
      c.restore();
      c.restore();
      c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 3; c.beginPath(); c.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2); c.stroke();
      c.fillStyle = '#ff6b6b'; c.font = '700 15px Fredoka, sans-serif'; c.fillText('N', S / 2, 13);
    },

    updateMissionBox(g) {
      const m = g.mission; if (!m) return;
      const t = g.targetOf(m); if (!t) return;
      const ac = g.ac, d = Math.hypot(t.x - ac.pos.x, t.z - ac.pos.z);
      const brg = Math.atan2(t.x - ac.pos.x, -(t.z - ac.pos.z)) / D2R;
      const rel = U.angDiff(ac.hdg, brg);
      $('mArrow').style.transform = `rotate(${rel}deg)`;
      let txt = d > 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d)} m`;
      if (m.type === 'rings') txt += `  ·  ⏱ ${Math.floor(m.t)}s`;
      if (m.status) txt += `  ·  ${m.status}`;
      if ($('mDist').textContent !== txt) $('mDist').textContent = txt;
      $('mDist').classList.toggle('urgent', !!m.urgent);
      const mc = $('mCruise');
      const hint = g.cruiseHint === 'lock' ? (g.rookie ? '⏩ Cruise mode is starting… keep pointing at the marker!' : '⏩ Target locked — cruise engaging…')
        : g.cruiseHint === 'point' ? (g.rookie ? '⏩ Point your plane at the yellow marker to start Cruise Mode (or press K)' : '⏩ Point at the destination to engage cruise (K)') : '';
      if (mc.textContent !== hint) mc.textContent = hint;
    },
    cruise(on) {
      document.body.classList.toggle('cruise', !!on);
      $('cruiseBox').classList.toggle('hidden', !on);
    },
    cruiseHud(g) {
      const c = g.cruise, t = g.cruiseTarget(); if (!c || !t) return;
      const ac = g.ac, d = Math.hypot(t.x - ac.pos.x, t.z - ac.pos.z);
      const eta = Math.max(0, (d - 2000) / Math.max(1, ac.speed * c.speedup));
      const txt = `✈ ${t.label} · ${(d / 1000).toFixed(1)} km · ${U.fmt(Math.round(ac.altFt / 100) * 100)} ft · arriving in ${Math.floor(eta / 60)}:${String(Math.floor(eta % 60)).padStart(2, '0')}`;
      if ($('cruiseInfo').textContent !== txt) $('cruiseInfo').textContent = txt;
    },

    updateMarker(g) {
      let t = null, col = 'gold';
      if (g.atc && !g.atc.done && g.atc.tgtPos) { t = g.atc.tgtPos; col = 'green'; }
      else t = g.targetOf(g.mission);
      const el = $('tgtMarker');
      if (!t || g.ac.crashed) { el.classList.add('hidden'); return; }
      const cam = g.camera;
      this._v = this._v || new THREE.Vector3();
      const v = this._v.set(t.x, t.y, t.z);
      const camSpace = v.clone().applyMatrix4(cam.matrixWorldInverse);
      v.project(cam);
      const W = innerWidth, H = innerHeight;
      let x = v.x, y = v.y; const behind = camSpace.z > 0;
      if (behind) { x = -x; y = -y; }
      const on = !behind && Math.abs(x) < 0.92 && Math.abs(y) < 0.88;
      const d = Math.hypot(t.x - g.ac.pos.x, t.z - g.ac.pos.z);
      el.classList.remove('hidden'); el.className = 'tm ' + col + (on ? '' : ' edge');
      if (!on) { const m = Math.max(Math.abs(x) / 0.92, Math.abs(y) / 0.85); x /= m; y /= m; }
      el.style.left = ((x + 1) / 2 * W) + 'px'; el.style.top = ((1 - y) / 2 * H) + 'px';
      $('tgtArrow').style.transform = on ? '' : `rotate(${Math.atan2(x, y)}rad)`;
      $('tgtLabel').textContent = `${t.label} · ${d > 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d) + ' m'}`;
    },

    fpGain(n, label) {
      const f = document.createElement('div'); f.className = 'fpPop';
      f.innerHTML = `+${U.fmt(n)} <small>${esc(label || '')}</small>`;
      $('fpFloat').appendChild(f); setTimeout(() => f.remove(), 1900);
      const box = $('hudTL'); box.classList.remove('pulse'); void box.offsetWidth; box.classList.add('pulse');
      if (!$('hangar').classList.contains('hidden')) $('hgFp').textContent = U.fmt(FH.Game.profile.fp);
    },
    toast(text, cls = '', ms = 3200) {
      const t = document.createElement('div'); t.className = 'toast ' + cls; t.textContent = text;
      const box = $('toasts'); box.appendChild(t);
      while (box.children.length > 4) box.firstChild.remove();
      setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, ms);
    },
    banner(title, sub, ms = 3000, cls = '') {
      const b = $('banner'); b.className = cls; $('bTitle').textContent = title; $('bSub').textContent = sub || '';
      clearTimeout(this.bannerTO); this.bannerTO = setTimeout(() => b.classList.add('hidden'), ms);
    },
    tip(text) {
      if (text === this.tipText) return;
      this.tipText = text;
      const t = $('tipBox');
      if (text) { t.textContent = text; t.classList.remove('hidden'); } else t.classList.add('hidden');
    },

    // ---------- word gates ----------
    showQuestion(q, rookie) {
      $('qBox').className = '';
      $('qEmoji').textContent = q.emoji || '';
      $('qText').textContent = q.prompt;
      $('qOpts').innerHTML = q.options.map((o, i) => `<span class="qChip" style="--c:${GATE_CSS[i]}">${esc(o)}</span>`).join('');
      $('qResult').textContent = '';
      $('qTimerFill').style.width = '100%';
    },
    questionTimer(f) { $('qTimerFill').style.width = (U.clamp(f, 0, 1) * 100) + '%'; },
    questionResult(ok, q, combo) {
      const box = $('qBox');
      box.className = ok === true ? 'good' : ok === false ? 'bad' : 'miss';
      const r = $('qResult');
      if (ok === true) r.textContent = `✅ Correct! ${q.answer}${combo >= 3 ? `  🔥 ${combo} in a row!` : ''}`;
      else if (ok === false) r.textContent = `❌ Not quite. The answer is: ${q.answer}`;
      else r.textContent = `⏭ Missed! The answer was: ${q.answer}`;
      if (ok !== true) this.toast(`📘 ${q.explain}  “${q.example}”`, 'info', 7000);
      else this.toast(`📘 “${q.example}”`, 'info', 3500);
    },
    hideQuestion() { $('qBox').className = 'hidden'; },

    // ---------- ATC ----------
    atcShow(cmd, rookie) {
      const b = $('atcBox'); b.className = 'cmd';
      $('atcMsg').textContent = cmd.text;
      $('atcHint').textContent = rookie && cmd.hint ? '💡 ' + cmd.hint : '';
      $('atcLive').textContent = '';
      $('atcHold').style.width = '0%';
      $('atcTimerFill').style.width = '100%';
      $('atcRbWrap').classList.remove('hidden');
      $('atcRb').innerHTML = cmd.rb.options.map((o, i) => `<button class="rb" data-rb="${i}"><b>${i + 1}</b> ${esc(o)}</button>`).join('');
      clearTimeout(this.radioTO);
    },
    atcLive(text, ok, hold, time) {
      const l = $('atcLive'); l.textContent = (ok ? '✅ ' : '▶ ') + text; l.classList.toggle('ok', ok);
      $('atcHold').style.width = (hold * 100) + '%';
      $('atcTimerFill').style.width = (U.clamp(time, 0, 1) * 100) + '%';
    },
    atcResult(ok, msg) {
      const b = $('atcBox'); b.className = ok ? 'cmd good' : 'cmd bad';
      $('atcMsg').textContent = (ok ? '✅ ' : '⌛ ') + msg;
      $('atcHint').textContent = '';
    },
    readbackResult(i, correct) {
      document.querySelectorAll('#atcRb .rb').forEach((b, k) => {
        b.disabled = true;
        if (k === correct) b.classList.add('right'); else if (k === i) b.classList.add('wrong');
      });
    },
    atcHide() { $('atcBox').className = 'hidden'; },
    radioInfo(text) {
      const b = $('atcBox');
      if (FH.Game.atc && !FH.Game.atc.done) { this.toast('📻 ' + text, 'info', 6000); return; }
      b.className = 'info';
      $('atcMsg').textContent = text; $('atcHint').textContent = ''; $('atcLive').textContent = '';
      $('atcRbWrap').classList.add('hidden');
      clearTimeout(this.radioTO);
      this.radioTO = setTimeout(() => { if (!FH.Game.atc) this.atcHide(); }, 9000);
    },

    // ---------- mission panel ----------
    missionShow(m) {
      const b = $('missionBox'); b.classList.remove('hidden');
      $('mTitle').textContent = `${m.emoji} ${m.title}`;
      $('mObj').textContent = m.type === 'rings' ? `${m.desc}  (${m.ringIdx || 0}/${m.n})` : m.desc;
    },
    missionHide() { $('missionBox').classList.add('hidden'); },

    // ---------- pause / settings / map ----------
    showPause(g) {
      this.show('pause');
      const s = g.profile.stats;
      const mins = Math.floor(s.flightTime / 60);
      $('pauseStats').innerHTML = `✈ ${mins} min flown · 🎯 ${s.gatesRight}/${s.gates} gates · 📻 ${s.atcDone} ATC · 🗺 ${s.missions} missions`;
      $('pAbandon').classList.toggle('hidden', !g.mission);
    },
    hidePause() { this.hide('pause'); },
    showSettings() {
      const d = FH.Settings.data;
      $('sQuality').value = d.quality; $('sPlaneVol').value = Math.round(d.planeVol * 100); $('sVoiceVol').value = Math.round(d.voiceVol * 100);
      $('sVoice').checked = d.voice; $('sInvert').checked = d.invert; $('sDayNight').checked = d.daynight !== false;
      $('sNote').textContent = '';
      this._q0 = d.quality;
      $('sQuality').onchange = () => { $('sNote').textContent = $('sQuality').value !== this._q0 ? 'Graphics quality will change after the page reloads (your progress is saved).' : ''; };
      const live = () => FH.Audio.setVolumes($('sPlaneVol').value / 100, $('sVoiceVol').value / 100);
      $('sPlaneVol').oninput = live; $('sVoiceVol').oninput = live;
      $('sVoiceVol').onchange = () => FH.Audio.speak('Radio check. Loud and clear.');
      this.show('settings');
    },
    closeSettings() {
      const d = FH.Settings.data;
      d.planeVol = $('sPlaneVol').value / 100; d.voiceVol = $('sVoiceVol').value / 100; d.voice = $('sVoice').checked; d.invert = $('sInvert').checked; d.daynight = $('sDayNight').checked;
      const q = $('sQuality').value, changed = q !== d.quality;
      d.quality = q;
      FH.Settings.save(); FH.Settings.apply();
      this.hide('settings');
      if (changed) { FH.Game.saveProfile(); location.reload(); }
    },
    showMap(g) {
      this.show('mapDlg');
      const cv = $('bigmap'), c = cv.getContext('2d'), S = cv.width, w = g.world, k = S / w.SIZE;
      c.drawImage(w.mapCanvas, 0, 0, S, S);
      const P = (x, z) => [(x + w.HALF) * k, (z + w.HALF) * k];
      c.textAlign = 'center'; c.textBaseline = 'middle';
      w.islands.forEach(is => { const [x, y] = P(is.x, is.z + is.r * 0.85); c.font = 'italic 600 13px Nunito'; c.fillStyle = 'rgba(255,255,255,0.75)'; c.fillText(is.name, x, y); });
      const m = g.mission;
      this.drawStorms(c, P, k, g.time);
      w.airports.forEach(a => {
        const [x, y] = P(a.x, a.z);
        c.save(); c.translate(x, y); c.rotate(a.hdg * D2R); c.fillStyle = (m && m.airport === a) ? '#ffd23f' : '#fff'; c.fillRect(-2.5, -11, 5, 22); c.restore();
        c.font = '700 13px Fredoka, sans-serif'; c.lineWidth = 3; c.strokeStyle = 'rgba(0,20,40,0.8)'; c.strokeText('✈ ' + a.name, x, y - 18); c.fillStyle = '#fff'; c.fillText('✈ ' + a.name, x, y - 18);
      });
      c.font = '18px sans-serif';
      w.landmarks.forEach(l => { const [x, y] = P(l.x, l.z); c.fillText(l.emoji, x, y); });
      w.treasures.forEach(t => { if (!t.mesh.visible) { const [x, y] = P(t.x, t.z); c.fillStyle = '#ffd23f'; c.font = '14px sans-serif'; c.fillText('★', x, y); } });
      if (m && m.type === 'rescue') { const [x, y] = P(m.area.x, m.area.z); c.strokeStyle = '#ffd23f'; c.setLineDash([6, 5]); c.lineWidth = 2; c.beginPath(); c.arc(x, y, m.area.r * k, 0, 7); c.stroke(); c.setLineDash([]); }
      const t = g.targetOf(m);
      if (t) { const [x, y] = P(t.x, t.z); c.fillStyle = '#ffd23f'; c.strokeStyle = '#000'; c.lineWidth = 2; c.beginPath(); c.moveTo(x, y - 11); c.lineTo(x + 9, y); c.lineTo(x, y + 11); c.lineTo(x - 9, y); c.closePath(); c.fill(); c.stroke(); }
      const [px, py] = P(g.ac.pos.x, g.ac.pos.z);
      c.save(); c.translate(px, py); c.rotate(g.ac.hdg * D2R); c.fillStyle = '#ff4d5e'; c.strokeStyle = '#fff'; c.lineWidth = 2.5;
      c.beginPath(); c.moveTo(0, -13); c.lineTo(9, 10); c.lineTo(0, 5); c.lineTo(-9, 10); c.closePath(); c.fill(); c.stroke(); c.restore();
      const found = g.profile.treasures.length;
      const wxi = FH.Weather.enabled() ? FH.Weather.info() : null;
      $('mapLegend').innerHTML = (wxi ? `<span><b>${wxi.icon} ${g.rookie ? wxi.nameR : wxi.name}</b></span>${FH.Weather.cells.length ? '<span>🟥 Storm (radar)</span>' : ''}` : '') + `<span>🔴 You</span><span>✈ Airports</span><span>◆ Mission target</span><span>★ Treasures: ${found}/${w.treasures.length}</span>` +
        w.landmarks.map(l => `<span>${l.emoji} ${l.name}</span>`).join('');
    },
    hideMap() { this.hide('mapDlg'); },

    missionPick(list, cb) {
      this.show('pickDlg');
      $('pickCards').innerHTML = list.map((m, i) => this.missionCard(m, `<button class="btn go" data-pick="${i}">Accept</button>`)).join('');
      $('pickCards').onclick = e => { const b = e.target.closest('[data-pick]'); if (b) { FH.Audio.sfx('click'); this.hide('pickDlg'); cb(list[+b.dataset.pick]); } };
      $('pickFree').onclick = () => { this.hide('pickDlg'); cb(null); };
    },
    missionCard(m, btn) {
      const dist = m.km ? `${m.km.toFixed(1)} km` : 'Nearby';
      return `<div class="mCard"><div class="mcEmoji">${m.emoji}</div><div class="mcBody"><div class="mcTitle">${esc(m.title)}</div><div class="mcDesc">${esc(m.desc)}</div>
        <div class="mcMeta"><span>📍 ${dist}</span><span class="mcReward">🪙 ${U.fmt(m.reward)} FP</span></div></div><div class="mcBtn">${btn}</div></div>`;
    },

    // ---------- hangar ----------
    openHangar(g, ap) {
      this.show('hangar');
      $('hgAirport').textContent = ap.name; $('hgIsland').textContent = `${ap.island} · Runway ${ap.rwy[0]}/${ap.rwy[1]}`;
      $('hgFp').textContent = U.fmt(g.profile.fp);
      this.renderTab(this.tab || 'missions');
    },
    closeHangar() { this.hide('hangar'); },
    renderTab(tab) {
      this.tab = tab;
      document.querySelectorAll('#hangar .tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
      const g = FH.Game, p = g.profile, rk = g.rookie, body = $('hgBody');
      $('hgFp').textContent = U.fmt(p.fp);
      let h = '';
      if (tab === 'missions') {
        if (g.mission) h += `<h3>Current mission</h3>` + this.missionCard(g.mission, `<button class="btn ghost" data-act="cancelMission">Cancel</button>`);
        h += `<h3>${rk ? 'Choose a mission' : 'Mission board'}</h3>`;
        h += (g.board || []).map((m, i) => this.missionCard(m, g.mission === m ? '<span class="tag">Active ✓</span>' : `<button class="btn go" data-act="accept" data-i="${i}">Accept</button>`)).join('');
        h += `<div class="row"><button class="btn ghost" data-act="refresh">🔄 New missions</button><span class="note">${rk ? 'Missions give lots of FP! Accept one, then press Take off.' : 'Accept a mission, then take off. Rewards grow with faster planes.'}</span></div>`;
      } else if (tab === 'planes') {
        h += `<div class="planeGrid">` + FH.PLANES.map(d => {
          const owned = !!p.planes[d.id], cur = p.current === d.id, can = p.fp >= d.price;
          const bars = [['Speed', d.maxSpeed / 225], ['Handling', d.roll / 3.8], ['Range', d.fuelTime / 760]].map(([n, v]) => `<div class="stat"><span>${n}</span><div class="sbar"><div style="width:${Math.round(U.clamp(v, 0.08, 1) * 100)}%"></div></div></div>`).join('');
          const btn = cur ? '<span class="tag">Flying ✓</span>' : owned ? `<button class="btn" data-act="select" data-id="${d.id}">Fly this</button>` :
            `<button class="btn gold" data-act="buy" data-id="${d.id}" ${can ? '' : 'disabled'}>Buy 🪙 ${U.fmt(d.price)}</button>`;
          return `<div class="pCard ${cur ? 'cur' : ''} ${owned ? '' : 'locked'}"><div class="pEmoji">${d.emoji}</div><div class="pName">${d.name}</div><div class="pType">${d.type}${d.jet ? ' · JET' : ''}</div>
            <div class="pDesc">${esc(rk ? d.descR : d.desc)}</div>${bars}<div class="pBtn">${btn}</div></div>`;
        }).join('') + `</div>`;
      } else if (tab === 'upgrades') {
        const def = FH.planeById(p.current), u = p.planes[def.id];
        h += `<h3>${def.emoji} ${def.name} upgrades</h3>`;
        h += FH.UPGRADES.map(up => {
          const lvl = u[up.key], cost = lvl < 3 ? FH.upgradeCost(def, lvl + 1) : 0;
          const pips = [0, 1, 2].map(i => `<span class="pip ${i < lvl ? 'on' : ''}"></span>`).join('');
          const btn = lvl >= 3 ? '<span class="tag">MAX ✓</span>' : `<button class="btn gold" data-act="upgrade" data-k="${up.key}" ${p.fp >= cost ? '' : 'disabled'}>Upgrade 🪙 ${U.fmt(cost)}</button>`;
          return `<div class="upRow"><div class="upIcon">${up.icon}</div><div class="upBody"><div class="upName">${up.name}</div><div class="upDesc">${rk ? up.descR : up.desc}</div><div class="pips">${pips}</div></div>${btn}</div>`;
        }).join('');
        h += `<h3>🎨 Paint colour <span class="note">(new colours cost ${FH.PAINT_COST} FP, then they are yours for every plane)</span></h3><div class="paints">` +
          Object.keys(FH.PAINTS).map(n => {
            const hex = '#' + FH.PAINTS[n].toString(16).padStart(6, '0'), own = p.paints.includes(n), sel = p.paint[p.current] === n;
            return `<button class="swatch ${sel ? 'sel' : ''} ${own ? '' : 'buy'}" data-act="paint" data-n="${n}" style="--c:${hex}" title="${n}">${own ? '' : '🪙'}</button>`;
          }).join('') + `</div>`;
      } else if (tab === 'school') {
        const s = p.stats;
        h += `<div class="school"><div class="schoolIcon">🎓</div><h2>Ground School</h2>
          <p>${rk ? 'Answer 5 word questions. Get FP for every right answer!' : 'Five vocabulary questions. Earn FP for each correct answer and a bonus for a perfect score.'}</p>
          <button class="btn big go" data-act="school">Start lesson ▶</button>
          <p class="note">Lessons taken: ${Math.floor(s.quiz / 5)} · Correct answers: ${s.quizRight}/${s.quiz}</p></div>`;
      } else if (tab === 'logbook') {
        const s = p.stats, ri = g.rankIdx(p.total), r = FH.RANKS[ri], nx = FH.RANKS[ri + 1];
        const list = FH.Vocab.list.slice().sort((a, b) => a.w.localeCompare(b.w));
        const learned = list.filter(e => FH.Vocab.stars(e.w) >= 1).length, mastered = list.filter(e => FH.Vocab.stars(e.w) >= 3).length;
        h += `<div class="logTop"><div class="logRank">${r[2]}<div><b>${esc(U.cap(p.name))}</b><br>${r[1]}${nx ? `<br><small>${U.fmt(nx[0] - p.total)} FP to ${nx[1]}</small>` : ''}</div></div>
          <div class="logStats">
            <div><b>${U.fmt(p.total)}</b>total FP</div><div><b>${Math.floor(s.flightTime / 60)}</b>minutes flown</div>
            <div><b>${s.gatesRight}/${s.gates}</b>word gates</div><div><b>${s.atcDone}/${s.atc}</b>ATC commands</div>
            <div><b>${s.readbacks}</b>good readbacks</div><div><b>${s.missions}</b>missions</div>
            <div><b>${s.landings}</b>landings (🧈 ${s.butter})</div><div><b>${p.treasures.length}/${g.world.treasures.length}</b>treasure stars</div>
          </div></div>
          <h3>📖 Word logbook <span class="note">${learned} learned · ${mastered} mastered · click a word to hear it</span></h3>
          <div class="words">` + list.map(e => {
            const st = FH.Vocab.stars(e.w), seen = !!p.words[e.w];
            return `<div class="word ${seen ? '' : 'unseen'}" data-act="say" data-w="${esc(e.w)}" title="${esc(e.d)}">${e.e ? e.e + ' ' : ''}${esc(e.w)}<span class="stars">${'★'.repeat(st)}${'☆'.repeat(3 - st)}</span></div>`;
          }).join('') + `</div>`;
      }
      body.innerHTML = h;
    },
    hangarClick(e) {
      const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
      const g = FH.Game, act = b.dataset.act;
      FH.Audio.sfx('click');
      if (act === 'accept') { g.acceptMission(g.board[+b.dataset.i]); this.toast('Mission accepted! Press Take off.', 'good'); }
      else if (act === 'cancelMission') g.abandonMission();
      else if (act === 'refresh') { g.board = g.genMissions(3); }
      else if (act === 'buy') { if (g.buyPlane(b.dataset.id)) this.toast(`🎉 You bought the ${FH.planeById(b.dataset.id).name}!`, 'good'); }
      else if (act === 'select') g.selectPlane(b.dataset.id);
      else if (act === 'upgrade') { if (g.buyUpgrade(b.dataset.k)) this.toast('🔧 Upgrade installed!', 'good'); }
      else if (act === 'paint') g.setPaint(b.dataset.n);
      else if (act === 'school') { g.groundSchool(() => this.renderTab('school')); return; }
      else if (act === 'say') { const w = b.dataset.w, en = FH.Vocab.entry(w); FH.Audio.speak(`${w}. ${en ? en.d : ''}`, { rate: 0.85 }); return; }
      this.renderTab(this.tab);
    },

    // ---------- quiz modal ----------
    quiz(opts) {
      if (!opts.questions.length) { opts.onDone(0, 0); return; }
      this.qz = Object.assign({ i: 0, correct: 0, answered: false }, opts);
      this.quizOpen = true;
      this.show('quiz');
      $('quizTitle').textContent = opts.title; $('quizSub').textContent = opts.sub || '';
      this.quizRender();
    },
    quizRender() {
      const z = this.qz, q = z.questions[z.i];
      z.answered = false;
      $('quizProg').innerHTML = z.questions.map((_, i) => `<span class="dot ${i < z.i ? (z.results[i] ? 'ok' : 'no') : i === z.i ? 'cur' : ''}"></span>`).join('');
      $('quizEmoji').textContent = q.emoji || '';
      $('quizPrompt').textContent = q.prompt;
      $('quizOpts').className = q.long ? 'long' : '';
      $('quizOpts').innerHTML = q.options.map((o, i) => `<button class="qOpt" data-opt="${i}"><b>${i + 1}</b>${esc(o)}</button>`).join('');
      $('quizFb').textContent = ''; $('quizFb').className = '';
      $('quizNext').classList.add('hidden');
      if (FH.Game.rookie) FH.Audio.speak(q.speak, { rate: 0.85 });
    },
    quizAnswer(i) {
      const z = this.qz; if (!z || z.answered) return;
      const q = z.questions[z.i]; if (i >= q.options.length) return;
      z.answered = true;
      const ok = q.options[i] === q.answer;
      z.results = z.results || []; z.results[z.i] = ok;
      if (ok) z.correct++;
      document.querySelectorAll('#quizOpts .qOpt').forEach((b, k) => {
        b.disabled = true;
        if (q.options[k] === q.answer) b.classList.add('right'); else if (k === i) b.classList.add('wrong');
      });
      const fb = $('quizFb');
      fb.className = ok ? 'good' : 'bad';
      fb.innerHTML = `${ok ? '✅ Correct!' : `❌ The answer is <b>${esc(q.answer)}</b>.`}<br><span>${esc(q.explain)}</span><br><i>“${esc(q.example)}”</i>`;
      FH.Audio.sfx(ok ? 'correct' : 'wrong');
      if (FH.Game.rookie) FH.Audio.speak(ok ? `Correct! ${q.example}` : `The answer is ${q.answer}. ${q.example}`, { rate: 0.85 });
      z.onAnswer && z.onAnswer(q, ok);
      $('quizNext').classList.remove('hidden');
      $('quizNext').textContent = z.i < z.questions.length - 1 ? 'Next ▶' : 'Finish ✓';
    },
    quizNext() {
      const z = this.qz; if (!z || !z.answered) return;
      if (z.i < z.questions.length - 1) { z.i++; this.quizRender(); return; }
      this.hide('quiz'); this.quizOpen = false; this.qz = null;
      FH.Audio.stopSpeech();
      this.toast(`🎓 You got ${z.correct} out of ${z.questions.length}!`, z.correct === z.questions.length ? 'good' : 'info');
      z.onDone && z.onDone(z.correct, z.questions.length);
    },
    quizKey(e) {
      const m = e.code.match(/^(?:Digit|Numpad)([1-4])$/);
      if (m) this.quizAnswer(+m[1] - 1);
      else if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); this.quizNext(); }
    },
  };
})();

// FlyHigh - synthesized audio (engine, wind, effects) and speech
(function () {
  const FH = window.FH;

  const A = FH.Audio = {
    ctx: null, ready: false, planeVol: 0.7, voiceVol: 0.9, voiceOn: true, voice: null, speechRate: 1,

    init() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
      const c = this.ctx;
      this.master = c.createGain(); this.master.gain.value = 1; this.master.connect(c.destination);
      // plane bus: engine, wind, rain, thunder and sound effects. atc bus: radio clicks and beeps.
      this.planeBus = c.createGain(); this.planeBus.gain.value = this.planeVol; this.planeBus.connect(this.master);
      this.atcBus = c.createGain(); this.atcBus.gain.value = this.voiceVol; this.atcBus.connect(this.master);
      this.sfxBus = c.createGain(); this.sfxBus.gain.value = 0.8; this.sfxBus.connect(this.planeBus);

      const len = c.sampleRate * 2;
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
      const noise = () => { const s = c.createBufferSource(); s.buffer = buf; s.loop = true; return s; };

      this.engBus = c.createGain(); this.engBus.gain.value = 0; this.engBus.connect(this.planeBus);

      // Propeller engine: sawtooth + square through lowpass, with "chop" modulation
      this.propOsc = c.createOscillator(); this.propOsc.type = 'sawtooth'; this.propOsc.frequency.value = 45;
      this.propOsc2 = c.createOscillator(); this.propOsc2.type = 'square'; this.propOsc2.frequency.value = 90;
      const o2g = c.createGain(); o2g.gain.value = 0.25;
      this.propFilter = c.createBiquadFilter(); this.propFilter.type = 'lowpass'; this.propFilter.frequency.value = 500; this.propFilter.Q.value = 2;
      this.chop = c.createGain(); this.chop.gain.value = 0.7;
      this.chopLfo = c.createOscillator(); this.chopLfo.frequency.value = 20;
      const lfoAmt = c.createGain(); lfoAmt.gain.value = 0.3;
      this.chopLfo.connect(lfoAmt); lfoAmt.connect(this.chop.gain);
      this.propGain = c.createGain(); this.propGain.gain.value = 0;
      this.propOsc.connect(this.propFilter); this.propOsc2.connect(o2g); o2g.connect(this.propFilter);
      this.propFilter.connect(this.chop); this.chop.connect(this.propGain); this.propGain.connect(this.engBus);

      // Jet engine: filtered noise roar + whine
      this.jetNoise = noise();
      this.jetFilter = c.createBiquadFilter(); this.jetFilter.type = 'bandpass'; this.jetFilter.frequency.value = 900; this.jetFilter.Q.value = 0.7;
      this.jetGain = c.createGain(); this.jetGain.gain.value = 0;
      this.jetNoise.connect(this.jetFilter); this.jetFilter.connect(this.jetGain); this.jetGain.connect(this.engBus);
      this.whine = c.createOscillator(); this.whine.type = 'sine'; this.whine.frequency.value = 2000;
      this.whineGain = c.createGain(); this.whineGain.gain.value = 0;
      this.whine.connect(this.whineGain); this.whineGain.connect(this.engBus);

      // Wind
      this.windNoise = noise();
      this.windFilter = c.createBiquadFilter(); this.windFilter.type = 'lowpass'; this.windFilter.frequency.value = 400;
      this.windGain = c.createGain(); this.windGain.gain.value = 0;
      this.windNoise.connect(this.windFilter); this.windFilter.connect(this.windGain); this.windGain.connect(this.planeBus);

      // Rain on the canopy
      this.rainNoise = noise();
      const rhp = c.createBiquadFilter(); rhp.type = 'highpass'; rhp.frequency.value = 1400;
      const rlp = c.createBiquadFilter(); rlp.type = 'lowpass'; rlp.frequency.value = 7000;
      this.rainGain = c.createGain(); this.rainGain.gain.value = 0;
      this.rainNoise.connect(rhp); rhp.connect(rlp); rlp.connect(this.rainGain); this.rainGain.connect(this.planeBus);
      this.rainNoise.start();

      [this.propOsc, this.propOsc2, this.chopLfo, this.jetNoise, this.whine, this.windNoise].forEach(n => n.start());
      this.ready = true;
    },

    setVolumes(plane, voice) {
      this.planeVol = plane; this.voiceVol = voice;
      if (this.ready) {
        this.planeBus.gain.setTargetAtTime(plane, this.ctx.currentTime, 0.05);
        this.atcBus.gain.setTargetAtTime(voice, this.ctx.currentTime, 0.05);
      }
    },
    setRain(amount) {
      if (this.ready) this.rainGain.gain.setTargetAtTime(amount * 0.09, this.ctx.currentTime, 0.3);
    },
    thunder(vol, delay) {
      if (!this.ready) return;
      this.noiseBurst(2.8, 160, 0.6 * vol, delay);
      this.noiseBurst(1.2, 900, 0.25 * vol, delay);
      this.tone(48, 1.8, 'sawtooth', 0.12 * vol, delay, 30);
    },

    // kind: 'prop' | 'jet'
    updateEngine(kind, throttle, speedRatio, running, active) {
      if (!this.ready) return;
      const t = this.ctx.currentTime, k = 0.08;
      const on = active ? 1 : 0;
      this.engBus.gain.setTargetAtTime(on * 0.9, t, 0.2);
      const rpm = running ? 0.25 + 0.75 * throttle : 0.02;
      if (kind === 'prop') {
        this.propOsc.frequency.setTargetAtTime(38 + rpm * 70, t, k);
        this.propOsc2.frequency.setTargetAtTime(76 + rpm * 140, t, k);
        this.propFilter.frequency.setTargetAtTime(300 + rpm * 1300, t, k);
        this.chopLfo.frequency.setTargetAtTime(12 + rpm * 40, t, k);
        this.propGain.gain.setTargetAtTime(running ? 0.12 + rpm * 0.1 : 0, t, 0.15);
        this.jetGain.gain.setTargetAtTime(0, t, k); this.whineGain.gain.setTargetAtTime(0, t, k);
      } else {
        this.jetFilter.frequency.setTargetAtTime(500 + rpm * 2600, t, k);
        this.jetGain.gain.setTargetAtTime(running ? 0.18 + rpm * 0.3 : 0, t, 0.15);
        this.whine.frequency.setTargetAtTime(1400 + rpm * 2800, t, k);
        this.whineGain.gain.setTargetAtTime(running ? 0.012 + rpm * 0.02 : 0, t, 0.15);
        this.propGain.gain.setTargetAtTime(0, t, k);
      }
      const w = Math.min(1.4, speedRatio);
      this.windFilter.frequency.setTargetAtTime(300 + w * 1400, t, k);
      this.windGain.gain.setTargetAtTime(on * w * w * 0.12, t, 0.2);
    },

    tone(freq, dur, type = 'sine', vol = 0.2, when = 0, slideTo = null, bus = null) {
      if (!this.ready) return;
      const c = this.ctx, t = c.currentTime + when;
      const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(bus || this.sfxBus); o.start(t); o.stop(t + dur + 0.05);
    },

    noiseBurst(dur, freq, vol, when = 0, type = 'lowpass', bus = null) {
      if (!this.ready) return;
      const c = this.ctx, t = c.currentTime + when;
      const s = c.createBufferSource(); s.buffer = this.noiseBuf;
      const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq;
      const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(bus || this.sfxBus); s.start(t); s.stop(t + dur + 0.05);
    },

    sfx(name) {
      if (!this.ready) return;
      switch (name) {
        case 'correct': this.tone(784, 0.12, 'triangle', 0.25); this.tone(988, 0.12, 'triangle', 0.25, 0.09); this.tone(1319, 0.25, 'triangle', 0.25, 0.18); break;
        case 'wrong': this.tone(220, 0.25, 'square', 0.08, 0, 140); this.tone(160, 0.3, 'square', 0.07, 0.15, 110); break;
        case 'coin': this.tone(1568, 0.08, 'square', 0.06); this.tone(2093, 0.18, 'square', 0.06, 0.07); break;
        case 'radio': this.noiseBurst(0.12, 3000, 0.1, 0, 'bandpass', this.atcBus); this.tone(1200, 0.08, 'sine', 0.08, 0.1, null, this.atcBus); break;
        case 'alert': [880, 660, 880, 660].forEach((f, i) => this.tone(f, 0.14, 'square', 0.07, i * 0.16, null, this.atcBus)); break;
        case 'beep': this.tone(880, 0.12, 'square', 0.06); this.tone(880, 0.12, 'square', 0.06, 0.2); break;
        case 'stall': this.tone(600, 0.1, 'sawtooth', 0.05); break;
        case 'crash': this.noiseBurst(1.6, 600, 0.5); this.tone(90, 0.8, 'sawtooth', 0.15, 0, 40); break;
        case 'whoosh': this.noiseBurst(0.5, 1200, 0.15, 0, 'bandpass'); break;
        case 'levelup': [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.2, i * 0.1)); break;
        case 'mission': [392, 523, 659, 784, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.2, 'triangle', 0.18, i * 0.09)); break;
        case 'click': this.tone(1000, 0.04, 'square', 0.04); break;
        case 'treasure': [1047, 1319, 1568, 2093].forEach((f, i) => this.tone(f, 0.15, 'sine', 0.2, i * 0.06)); break;
        case 'touch': this.noiseBurst(0.25, 400, 0.25); break;
      }
    },

    pickVoice() {
      if (!window.speechSynthesis) return;
      const vs = speechSynthesis.getVoices();
      if (!vs.length) return;
      const prefs = ['en-AU', 'en-GB', 'en-NZ', 'en-US', 'en'];
      for (const p of prefs) {
        const m = vs.filter(v => v.lang.replace('_', '-').startsWith(p));
        if (m.length) { this.voice = m.find(v => /natural|online/i.test(v.name)) || m[0]; return; }
      }
    },

    speak(text, opt = {}) {
      if (!this.voiceOn || !window.speechSynthesis || !text) return;
      try {
        const s = window.speechSynthesis;
        if (!this.voice) this.pickVoice();
        s.cancel();
        const u = new SpeechSynthesisUtterance(text.replace(/[“”]/g, ''));
        if (this.voice) { u.voice = this.voice; u.lang = this.voice.lang; } else u.lang = 'en-AU';
        u.rate = (opt.rate || 1) * this.speechRate;
        u.pitch = opt.pitch || 1;
        u.volume = Math.max(0, Math.min(1, this.voiceVol));
        s.speak(u);
      } catch (e) { /* speech not available */ }
    },
    stopSpeech() { try { window.speechSynthesis && speechSynthesis.cancel(); } catch (e) { } },
  };

  if (window.speechSynthesis) {
    speechSynthesis.onvoiceschanged = () => A.pickVoice();
    A.pickVoice();
  }
})();

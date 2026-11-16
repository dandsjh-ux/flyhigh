// FlyHigh - Air Traffic Control command generator (Rookie and Normal phraseology)
(function () {
  const FH = window.FH, U = FH.util;
  const CARD = [['North', 0], ['East', 90], ['South', 180], ['West', 270]];
  const DIG = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'niner'];
  const NUMW = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen'];
  const pad3 = n => String(n).padStart(3, '0');
  const digits = n => pad3(n).split('').map(d => DIG[+d]).join(' ');
  const altSpeak = ft => { const th = Math.floor(ft / 1000), h = Math.round((ft % 1000) / 100); let s = ''; if (th) s += NUMW[th] + ' thousand'; if (h) s += (s ? ' ' : '') + NUMW[h] + ' hundred'; return s + ' feet'; };
  const fmt = U.fmt;
  const cardOf = h => CARD[Math.round(U.norm360(h) / 90) % 4][0];
  const r10 = x => Math.round(x / 10) * 10;
  FH.cardOf = cardOf;

  function readback(correct, wrongs) {
    const opts = U.shuffle([correct, ...wrongs.slice(0, 2)]);
    return { options: opts, correct: opts.indexOf(correct) };
  }

  FH.ATC = {
    // g: Game instance. Returns a command object or null.
    make(g) {
      const ac = g.ac, rk = g.rookie, cs = g.callsign();
      const st = { hdg: ac.hdg, alt: ac.altFt, kts: ac.kts, x: ac.pos.x, z: ac.pos.z };
      const minAlt = g.safeAltFt();
      const maxAlt = Math.min(Math.floor(ac.st.ceiling * 3.281 * 0.85 / 500) * 500, rk ? 4500 : (ac.def.jet ? 14000 : 8000));
      const kinds = rk ? [['turn', 4], ['alt', 3], ['speed', 2], ['fly', 2]] : [['turn', 3], ['alt', 3], ['speed', 2], ['combo', 3], ['fly', 2]];
      for (let tries = 0; tries < 6; tries++) {
        const k = U.weighted(kinds);
        const cmd = this[k] && this[k](g, st, cs, rk, minAlt, maxAlt);
        if (cmd) { cmd.kind = k; cmd.t = 0; cmd.holdT = 0; cmd.answered = -1; return cmd; }
      }
      return null;
    },

    headingTarget(g, st, rk) {
      const distC = Math.hypot(st.x, st.z);
      const toCenter = U.norm360(Math.atan2(-st.x, st.z) / (Math.PI / 180));
      if (rk) {
        let cands = CARD.filter(c => Math.abs(U.angDiff(st.hdg, c[1])) >= 60);
        if (distC > 6500) cands.sort((a, b) => Math.abs(U.angDiff(toCenter, a[1])) - Math.abs(U.angDiff(toCenter, b[1])));
        const c = distC > 6500 ? cands[0] : U.pick(cands);
        return { tgt: c[1], card: c[0] };
      }
      let delta = (40 + Math.floor(Math.random() * 10) * 10) * (Math.random() < 0.5 ? -1 : 1);
      if (distC > 6500) { const dc = U.angDiff(st.hdg, toCenter); delta = U.clamp(r10(dc), -130, 130); if (Math.abs(delta) < 40) delta = 40 * Math.sign(delta || 1); }
      let tgt = r10(U.norm360(st.hdg + delta)); if (tgt === 0) tgt = 360;
      return { tgt };
    },

    turn(g, st, cs, rk) {
      const h = this.headingTarget(g, st, rk);
      const d = U.angDiff(st.hdg, h.tgt), dir = d < 0 ? 'left' : 'right', opp = d < 0 ? 'right' : 'left';
      const tol = rk ? 20 : 10;
      const base = {
        tgtHdg: h.tgt % 360, time: rk ? 45 : 40, hold: rk ? 2 : 3, reward: rk ? 45 : 60,
        checks: [s => Math.abs(U.angDiff(s.hdg, h.tgt)) < tol],
        live: s => `Heading ${pad3(Math.round(s.hdg) % 360)}° ${cardOf(s.hdg)}  →  ${rk ? h.card : pad3(h.tgt)} ${dir === 'left' ? '⬅' : '➡'}`,
      };
      if (rk) {
        const others = CARD.filter(c => c[0] !== h.card);
        const rb = readback(`Turn ${dir}, fly ${h.card}.`, [`Turn ${opp}, fly ${U.pick(others)[0]}.`, `Go up, fly ${U.pick(others)[0]}.`]);
        return Object.assign(base, { text: `${cs}, turn ${dir}. Fly ${h.card}.`, speak: `${cs}, turn ${dir}. Fly ${h.card}.`, rb, hint: `Turn ${dir} until the compass shows ${h.card[0]}` });
      }
      const wrongH = r10(U.norm360(h.tgt + (Math.random() < 0.5 ? 90 : -90))) || 360;
      const rb = readback(`${U.cap(dir)} heading ${pad3(h.tgt)}, ${cs}.`, [`${U.cap(opp)} heading ${pad3(h.tgt)}, ${cs}.`, `${U.cap(dir)} heading ${pad3(wrongH)}, ${cs}.`]);
      return Object.assign(base, { text: `${cs}, turn ${dir} heading ${pad3(h.tgt)}.`, speak: `${cs}, turn ${dir} heading ${digits(h.tgt)}.`, rb });
    },

    altTarget(st, rk, minAlt, maxAlt) {
      const levels = [];
      for (let a = 1000; a <= maxAlt; a += 500) levels.push(a);
      const cands = levels.filter(l => l >= minAlt && Math.abs(l - st.alt) >= 500 && Math.abs(l - st.alt) <= (rk ? 1500 : 3000));
      return cands.length ? U.pick(cands) : null;
    },

    alt(g, st, cs, rk, minAlt, maxAlt) {
      const tgt = this.altTarget(st, rk, minAlt, maxAlt);
      if (!tgt) return null;
      const up = tgt > st.alt, tol = rk ? 250 : 150;
      const diff = Math.abs(tgt - st.alt);
      const base = {
        tgtAlt: tgt, time: Math.round(30 + diff / (rk ? 25 : 35)), hold: rk ? 2 : 3, reward: rk ? 45 : 60,
        checks: [s => Math.abs(s.alt - tgt) < tol],
        live: s => `Altitude ${fmt(Math.round(s.alt / 10) * 10)} ft  →  ${fmt(tgt)} ft ${up ? '⬆' : '⬇'}`,
      };
      const wrongAlt = up ? tgt + 2000 : Math.max(500, tgt - 1000);
      if (rk) {
        const rb = readback(`Go ${up ? 'up' : 'down'} to ${fmt(tgt)} feet.`, [`Go ${up ? 'down' : 'up'} to ${fmt(tgt)} feet.`, `Go ${up ? 'up' : 'down'} to ${fmt(wrongAlt)} feet.`]);
        const t = `${cs}, fly ${up ? 'higher' : 'lower'}. Go ${up ? 'up' : 'down'} to ${fmt(tgt)} feet.`;
        return Object.assign(base, { text: t, speak: t, rb, hint: `${up ? 'Pull up (↑)' : 'Push down (↓)'} until the altitude shows ${fmt(tgt)}` });
      }
      const v = up ? 'climb' : 'descend', ov = up ? 'descend' : 'climb';
      const rb = readback(`${U.cap(v)} and maintain ${fmt(tgt)}, ${cs}.`, [`${U.cap(ov)} and maintain ${fmt(tgt)}, ${cs}.`, `${U.cap(v)} and maintain ${fmt(wrongAlt)}, ${cs}.`]);
      return Object.assign(base, { text: `${cs}, ${v} and maintain ${fmt(tgt)} feet.`, speak: `${cs}, ${v} and maintain ${altSpeak(tgt)}.`, rb });
    },

    speed(g, st, cs, rk) {
      const ac = g.ac, stallK = ac.st.stall * 1.944, maxK = ac.st.maxSpeed * 1.944, kts = st.kts;
      if (rk) {
        let slow = kts > stallK * 1.8 && Math.random() < 0.6;
        let X;
        if (!slow) { X = r10(Math.min(maxK * 0.92, kts * 1.15)); if (X <= kts + 5) slow = true; }
        if (slow) { X = r10(Math.max(stallK * 1.45, kts * 0.8)); if (X >= kts - 5) return null; }
        const t = slow ? `${cs}, slow down please. Fly slower than ${X} knots.` : `${cs}, speed up please. Fly faster than ${X} knots.`;
        const rb = readback(slow ? `Slow down, slower than ${X} knots.` : `Speed up, faster than ${X} knots.`,
          [slow ? `Speed up, faster than ${X} knots.` : `Slow down, slower than ${X} knots.`, `Go ${slow ? 'down' : 'up'} to ${X} feet.`]);
        return {
          text: t, speak: t, rb, time: 35, hold: 2, reward: 40,
          checks: [s => slow ? s.kts < X : s.kts > X],
          live: s => `Speed ${Math.round(s.kts)} kn  →  ${slow ? 'below' : 'above'} ${X} kn ${slow ? '🐢' : '🚀'}`,
          hint: slow ? 'Press Z or F to reduce power' : 'Hold SHIFT or R for more power',
        };
      }
      const lo = r10(stallK * 1.5), hi = r10(maxK * 0.9);
      const cands = []; for (let v = lo; v <= hi; v += 10) if (Math.abs(v - kts) >= 20 && Math.abs(v - kts) <= 80) cands.push(v);
      if (!cands.length) return null;
      const X = U.pick(cands), red = X < kts;
      const rb = readback(`${red ? 'Reduce' : 'Increase'} speed ${X} knots, ${cs}.`, [`${red ? 'Increase' : 'Reduce'} speed ${X} knots, ${cs}.`, `${red ? 'Reduce' : 'Increase'} speed ${X + 40} knots, ${cs}.`]);
      return {
        text: `${cs}, ${red ? 'reduce' : 'increase'} speed to ${X} knots.`, speak: `${cs}, ${red ? 'reduce' : 'increase'} speed to ${X} knots.`, rb,
        time: 40, hold: 3, reward: 55, checks: [s => Math.abs(s.kts - X) < 10],
        live: s => `Speed ${Math.round(s.kts)} kn  →  ${X} kn ±10`,
      };
    },

    combo(g, st, cs, rk, minAlt, maxAlt) {
      const tAlt = this.altTarget(st, false, minAlt, maxAlt);
      if (!tAlt) return null;
      const h = this.headingTarget(g, st, false);
      const d = U.angDiff(st.hdg, h.tgt), dir = d < 0 ? 'left' : 'right', opp = d < 0 ? 'right' : 'left';
      const up = tAlt > st.alt, v = up ? 'climb' : 'descend', ov = up ? 'descend' : 'climb';
      const diff = Math.abs(tAlt - st.alt);
      const rb = readback(`${U.cap(dir)} heading ${pad3(h.tgt)}, ${v} ${fmt(tAlt)}, ${cs}.`,
        [`${U.cap(opp)} heading ${pad3(h.tgt)}, ${v} ${fmt(tAlt)}, ${cs}.`, `${U.cap(dir)} heading ${pad3(h.tgt)}, ${ov} ${fmt(tAlt)}, ${cs}.`]);
      return {
        text: `${cs}, turn ${dir} heading ${pad3(h.tgt)}, ${v} and maintain ${fmt(tAlt)} feet.`,
        speak: `${cs}, turn ${dir} heading ${digits(h.tgt)}, ${v} and maintain ${altSpeak(tAlt)}.`, rb,
        tgtHdg: h.tgt % 360, tgtAlt: tAlt, time: Math.round(45 + diff / 35), hold: 3, reward: 100,
        checks: [s => Math.abs(U.angDiff(s.hdg, h.tgt)) < 10, s => Math.abs(s.alt - tAlt) < 150],
        live: s => `Hdg ${pad3(Math.round(s.hdg) % 360)} → ${pad3(h.tgt)}   ·   Alt ${fmt(Math.round(s.alt / 10) * 10)} → ${fmt(tAlt)}`,
      };
    },

    // weather deviation around a thunderstorm cell (issued straight away when a storm is ahead)
    avoid(g, th) {
      const ac = g.ac, rk = g.rookie, cs = g.callsign(), c = th.cell;
      const brg = th.brg;
      const cands = [U.norm360(brg + 85), U.norm360(brg - 85)];
      // prefer the side that needs less turning, but don't send the pilot off the map
      const toC = U.norm360(Math.atan2(-ac.pos.x, ac.pos.z) / (Math.PI / 180));
      const far = Math.hypot(ac.pos.x, ac.pos.z) > 6500;
      cands.sort((a, b) => (Math.abs(U.angDiff(ac.hdg, a)) + (far ? Math.abs(U.angDiff(toC, a)) * 0.7 : 0)) - (Math.abs(U.angDiff(ac.hdg, b)) + (far ? Math.abs(U.angDiff(toC, b)) * 0.7 : 0)));
      let tgt = cands[0], card = null;
      if (rk) {
        const ok = CARD.filter(k => Math.abs(U.angDiff(brg, k[1])) >= 60);
        ok.sort((a, b) => Math.abs(U.angDiff(tgt, a[1])) - Math.abs(U.angDiff(tgt, b[1])));
        card = ok[0]; tgt = card[1];
      } else { tgt = r10(tgt) || 360; }
      const d = U.angDiff(ac.hdg, tgt), dir = d < 0 ? 'left' : 'right', opp = d < 0 ? 'right' : 'left';
      const km = Math.max(0, th.dist / 1000).toFixed(1);
      const tol = rk ? 25 : 15;
      const base = {
        kind: 'avoid', t: 0, holdT: 0, answered: -1, tgtHdg: tgt % 360, time: 45, hold: rk ? 3 : 4, reward: rk ? 60 : 80, storm: c,
        checks: [s => Math.abs(U.angDiff(s.hdg, tgt)) < tol, s => FH.Weather.distToCell(c, s.x, s.z) > 0],
        live: s => { const dd = FH.Weather.distToCell(c, s.x, s.z); return `${dd < 0 ? '⛈ IN STORM' : `⛈ ${(dd / 1000).toFixed(1)} km`} · Heading ${pad3(Math.round(s.hdg) % 360)} → ${rk ? card[0] : pad3(tgt)}`; },
      };
      if (rk) {
        const t = th.inside ? `${cs}, you are inside the storm! Turn ${dir}. Fly ${card[0]} to get out!` : `${cs}, storm ahead! Turn ${dir}. Fly ${card[0]} to go around the storm.`;
        const other = CARD.filter(k => k[0] !== card[0]);
        const rb = readback(`Turn ${dir}, fly ${card[0]}, around the storm.`, ['Fly into the storm.', `Turn ${opp}, fly ${U.pick(other)[0]}.`]);
        return Object.assign(base, { text: t, speak: t, rb, hint: `Turn ${dir} until the compass shows ${card[0][0]}. Stay out of the red circle!` });
      }
      const t = th.inside ? `${cs}, you are in a thunderstorm cell. Turn ${dir} heading ${pad3(tgt)} immediately to exit the weather.`
        : `${cs}, radar shows a thunderstorm ${km} kilometres ahead. Deviation approved, turn ${dir} heading ${pad3(tgt)}.`;
      const sp = th.inside ? `${cs}, you are in a thunderstorm cell. Turn ${dir} heading ${digits(tgt)} immediately to exit the weather.`
        : `${cs}, radar shows a thunderstorm ${km} kilometres ahead. Deviation approved, turn ${dir} heading ${digits(tgt)}.`;
      const rb = readback(`${U.cap(dir)} heading ${pad3(tgt)}, deviating for weather, ${cs}.`,
        [`${U.cap(opp)} heading ${pad3(tgt)}, deviating for weather, ${cs}.`, `Continuing straight through the storm, ${cs}.`]);
      return Object.assign(base, { text: t, speak: sp, rb });
    },

    fly(g, st, cs, rk) {
      const lms = g.world.landmarks.filter(l => {
        const d = Math.hypot(l.x - st.x, l.z - st.z);
        return d > 900 && d < (rk ? 4500 : 6500) && !(g.mission && g.mission.landmark === l);
      });
      if (!lms.length) return null;
      const l = U.pick(lms);
      const others = g.world.landmarks.filter(o => o !== l);
      const dist = Math.hypot(l.x - st.x, l.z - st.z);
      const base = {
        tgtPos: { x: l.x, y: l.y, z: l.z, label: l.emoji + ' ' + l.name }, time: Math.round(dist / Math.max(g.ac.speed, 20) + 45), hold: 0.3, reward: rk ? 60 : 75,
        checks: [s => Math.hypot(l.x - s.x, l.z - s.z) < 450],
        live: s => `${l.emoji} ${l.name}: ${(Math.hypot(l.x - s.x, l.z - s.z) / 1000).toFixed(1)} km`,
      };
      const o1 = others.length ? U.pick(others).name : 'Castle', o2 = others.length > 1 ? U.pick(others.filter(o => o.name !== o1)).name : 'Windmill';
      const n = l.name.toLowerCase();
      if (rk) {
        const t = `${cs}, can you see the ${n}? Fly to the ${n}.`;
        const rb = readback(`Fly to the ${n}.`, [`Fly to the ${o1.toLowerCase()}.`, `Fly away from the ${n}.`]);
        return Object.assign(base, { text: t, speak: t, rb, hint: 'Follow the yellow marker on your screen and map' });
      }
      const rb = readback(`Direct to the ${n}, ${cs}.`, [`Direct to the ${o1.toLowerCase()}, ${cs}.`, `Direct to the ${o2.toLowerCase()}, ${cs}.`]);
      return Object.assign(base, { text: `${cs}, proceed direct to the ${n}, report overhead.`, speak: `${cs}, proceed direct to the ${n}, report overhead.`, rb });
    },
  };
})();

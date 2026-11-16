// FlyHigh - utilities, seeded random and simplex noise
window.FH = window.FH || {};
(function () {
  const FH = window.FH;

  FH.util = {
    clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
    lerp: (a, b, t) => a + (b - a) * t,
    smoothstep(a, b, x) {
      const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
      return t * t * (3 - 2 * t);
    },
    pick: (arr, r = Math.random) => arr[Math.floor(r() * arr.length)],
    shuffle(arr, r = Math.random) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
      return arr;
    },
    // signed shortest difference in degrees going from a to b (-180..180)
    angDiff(a, b) { return ((((b - a) % 360) + 540) % 360) - 180; },
    norm360(a) { return ((a % 360) + 360) % 360; },
    fmt(n) { return Math.round(n).toLocaleString('en-AU'); },
    approach(v, t, step) { return v < t ? Math.min(t, v + step) : Math.max(t, v - step); },
    weighted(items, r = Math.random) { // items: [[value, weight], ...]
      let tot = 0; for (const it of items) tot += it[1];
      let x = r() * tot;
      for (const it of items) { x -= it[1]; if (x <= 0) return it[0]; }
      return items[items.length - 1][0];
    },
    cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); },
  };

  FH.mulberry32 = function (a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  // 2D simplex noise, returns approx [-1, 1]
  FH.makeSimplex = function (rand) {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
    const perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
    const gx = new Float32Array([1, -1, 1, -1, 1, -1, 0, 0]);
    const gy = new Float32Array([1, 1, -1, -1, 0, 0, 1, -1]);
    const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
    return function (xin, yin) {
      let n0 = 0, n1 = 0, n2 = 0;
      const s = (xin + yin) * F2;
      const i = Math.floor(xin + s), j = Math.floor(yin + s);
      const t = (i + j) * G2;
      const x0 = xin - (i - t), y0 = yin - (j - t);
      let i1, j1;
      if (x0 > y0) { i1 = 1; j1 = 0; } else { i1 = 0; j1 = 1; }
      const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
      const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
      const ii = i & 255, jj = j & 255;
      let t0 = 0.5 - x0 * x0 - y0 * y0;
      if (t0 > 0) { t0 *= t0; const g = perm[ii + perm[jj]] & 7; n0 = t0 * t0 * (gx[g] * x0 + gy[g] * y0); }
      let t1 = 0.5 - x1 * x1 - y1 * y1;
      if (t1 > 0) { t1 *= t1; const g = perm[ii + i1 + perm[jj + j1]] & 7; n1 = t1 * t1 * (gx[g] * x1 + gy[g] * y1); }
      let t2 = 0.5 - x2 * x2 - y2 * y2;
      if (t2 > 0) { t2 *= t2; const g = perm[ii + 1 + perm[jj + 1]] & 7; n2 = t2 * t2 * (gx[g] * x2 + gy[g] * y2); }
      return 70 * (n0 + n1 + n2);
    };
  };
})();

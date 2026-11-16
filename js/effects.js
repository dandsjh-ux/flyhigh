// FlyHigh - lightweight GPU point particles (smoke trails, explosions, volcano smoke, sparkles)
(function () {
  const FH = window.FH;

  const VS = `
    attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
    uniform float uScale; uniform float uFogFar;
    varying float vAlpha; varying vec3 vColor;
    void main(){
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mv;
      float d = -mv.z;
      gl_PointSize = min(aSize * uScale / max(1.0, d), 512.0);
      vAlpha = aAlpha * (1.0 - smoothstep(uFogFar * 0.5, uFogFar, d));
      vColor = aColor;
    }`;
  const FS = `
    varying float vAlpha; varying vec3 vColor;
    void main(){
      vec2 c = gl_PointCoord - 0.5; float d = length(c);
      if (d > 0.5) discard;
      float a = (1.0 - smoothstep(0.1, 0.5, d)) * vAlpha;
      gl_FragColor = vec4(vColor, a);
      #include <colorspace_fragment>
    }`;

  class Particles {
    constructor(scene, max = 2500) {
      this.max = max; this.n = 0; this.cursor = 0;
      this.p = []; // particle data
      for (let i = 0; i < max; i++) this.p.push({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, s0: 1, s1: 1, a: 1, r: 1, g: 1, b: 1, drag: 0, rise: 0 });
      const g = new THREE.BufferGeometry();
      this.pos = new Float32Array(max * 3); this.size = new Float32Array(max); this.alpha = new Float32Array(max); this.col = new Float32Array(max * 3);
      g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
      this.geo = g;
      this.mat = new THREE.ShaderMaterial({
        vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false,
        uniforms: { uScale: { value: 600 }, uFogFar: { value: 10000 } },
      });
      this.points = new THREE.Points(g, this.mat);
      this.points.frustumCulled = false; this.points.renderOrder = 5;
      scene.add(this.points);
      this.tmpC = new THREE.Color();
    }
    setScale(heightPx, fovDeg) { this.mat.uniforms.uScale.value = heightPx / (2 * Math.tan(fovDeg * Math.PI / 360)); }
    emit(x, y, z, vx, vy, vz, life, s0, s1, hex, alpha = 1, drag = 0.5, rise = 0) {
      const q = this.p[this.cursor]; this.cursor = (this.cursor + 1) % this.max;
      q.alive = true; q.x = x; q.y = y; q.z = z; q.vx = vx; q.vy = vy; q.vz = vz;
      q.life = 0; q.max = life; q.s0 = s0; q.s1 = s1; q.a = alpha; q.drag = drag; q.rise = rise;
      this.tmpC.set(hex); q.r = this.tmpC.r; q.g = this.tmpC.g; q.b = this.tmpC.b;
    }
    burst(x, y, z, count, speed, life, size, colors, alpha = 1) {
      for (let i = 0; i < count; i++) {
        const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u), s = speed * (0.3 + Math.random() * 0.7);
        this.emit(x, y, z, r * Math.cos(th) * s, u * s, r * Math.sin(th) * s, life * (0.6 + Math.random() * 0.6), size * 0.5, size * (1 + Math.random()), colors[i % colors.length], alpha, 1.2, 0);
      }
    }
    update(dt) {
      let k = 0;
      for (let i = 0; i < this.max; i++) {
        const q = this.p[i];
        if (!q.alive) continue;
        q.life += dt;
        if (q.life >= q.max) { q.alive = false; continue; }
        const t = q.life / q.max;
        const dr = Math.max(0, 1 - q.drag * dt);
        q.vx *= dr; q.vy = q.vy * dr + q.rise * dt; q.vz *= dr;
        q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
        this.pos[k * 3] = q.x; this.pos[k * 3 + 1] = q.y; this.pos[k * 3 + 2] = q.z;
        this.size[k] = q.s0 + (q.s1 - q.s0) * t;
        this.alpha[k] = q.a * (t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9);
        this.col[k * 3] = q.r; this.col[k * 3 + 1] = q.g; this.col[k * 3 + 2] = q.b;
        k++;
      }
      this.geo.setDrawRange(0, k);
      const a = this.geo.attributes;
      a.position.needsUpdate = a.aSize.needsUpdate = a.aAlpha.needsUpdate = a.aColor.needsUpdate = true;
    }
  }
  FH.Particles = Particles;
})();

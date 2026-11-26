// Chapter 01: the Earth in space. A slow spin at rest; on scroll the globe grows and spins faster,
// turning until Kundapur (13.6391 N, 74.6923 E) faces the camera, ready for the descent.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { NOISE } from './glsl.js';

export const KUNDAPUR = { lat: 13.6391, lon: 74.6923 };

// Same lat/lon -> unit-vector convention as the existing site's globe (kept so the textured GLB lines up).
const vectorAt = (lat, lon) => {
  const phi = (90 - lat) * Math.PI / 180, theta = (lon + 180) * Math.PI / 180;
  return new THREE.Vector3(-Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
};

function glowTexture(stops) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'); const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  stops.forEach(([o, col]) => grad.addColorStop(o, col));
  g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class Space {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.01, 4000);
    this.camera.position.set(0, 0, 4.2);
    this.globe = new THREE.Group();
    this.scene.add(this.globe);

    const sunDir = new THREE.Vector3(-1, 0.35, 0.6).normalize();
    this.sunDir = sunDir;
    const sun = new THREE.DirectionalLight(0xfff4e6, 3.0);
    sun.position.copy(sunDir).multiplyScalar(10);
    this.scene.add(sun, new THREE.AmbientLight(0x1b2440, 0.55));

    // The sun: a hot core and a wide corona far away along the light direction.
    const sunPos = new THREE.Vector3(-0.36, 0.2, -1).normalize().multiplyScalar(900); // placed in view, upper left
    const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture([[0, 'rgba(255,255,250,1)'], [0.12, 'rgba(255,240,210,0.95)'], [0.35, 'rgba(255,190,120,0.25)'], [1, 'rgba(255,160,90,0)']]), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    core.position.copy(sunPos); core.scale.setScalar(260);
    const corona = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture([[0, 'rgba(255,220,170,0.35)'], [0.4, 'rgba(255,180,120,0.08)'], [1, 'rgba(255,160,90,0)']]), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    corona.position.copy(sunPos); corona.scale.setScalar(1100);
    this.scene.add(core, corona);
    this.sun = sun;
    this.sunSprites = [core, corona];
    // day and night light: at the end of the story the light swings behind the Earth, so the
    // face turned to the camera is in night with a lit edge, and the sun itself has set
    this.daySun = sunDir.clone();
    this.nightSun = new THREE.Vector3(-0.82, 0.3, -0.5).normalize();

    // A small grey moon on the far side.
    this.moon = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 8), new THREE.MeshStandardMaterial({ color: 0x9a9a98, roughness: 1, emissive: 0xc9d3dc, emissiveIntensity: 0 }));
    this.moon.position.set(5.5, 1.2, -7);
    this.scene.add(this.moon);
    // at night the moon is up where the sun was, with a faint halo
    this.moonHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture([[0, 'rgba(220,235,245,0.55)'], [0.25, 'rgba(170,205,225,0.16)'], [1, 'rgba(120,170,200,0)']]), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0 }));
    this.scene.add(this.moonHalo);
    this.moonNight = new THREE.Vector3(-2.6, 1.45, -5.5);
    this.moonDay = new THREE.Vector3();
    this.night = 0;

    this.stars = this.makeStars(5200);
    this.scene.add(this.stars);

    // Atmosphere: back-face fresnel shell, blue rim lit on the sun side.
    this.atmosphere = new THREE.Mesh(new THREE.SphereGeometry(1.045, 96, 96), new THREE.ShaderMaterial({
      uniforms: { uSun: { value: sunDir }, uStrength: { value: 1 } },
      vertexShader: `varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(mat3(modelMatrix)*normal); vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform vec3 uSun; uniform float uStrength; varying vec3 vN; varying vec3 vW;
        void main(){ vec3 V = normalize(cameraPosition - vW); float rim = pow(1.0 - clamp(abs(dot(normalize(vN), V)), 0.0, 1.0), 6.0);
          // soft and thin, and only where the sun reaches, so the shadowed edge has no dark band
          float lit = smoothstep(-0.25, 0.6, dot(vN, uSun));
          vec3 col = mix(vec3(0.30,0.55,1.0), vec3(0.62,0.84,1.0), rim);
          gl_FragColor = vec4(col * lit, rim * 0.5 * lit * uStrength); }`,
      side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.scene.add(this.atmosphere);

    // Halo: a soft glow around the Earth that makes it stand out against space. It is brightest
    // right at the Earth's edge and fades smoothly to nothing as it spreads outward (no ring at
    // its outer edge); stronger on the sunlit side, fainter but still present on the night side.
    // It rides with the atmosphere shell, so it follows the Earth's position and size.
    this.halo = new THREE.Mesh(new THREE.SphereGeometry(1.24 / 1.045, 96, 96), new THREE.ShaderMaterial({
      uniforms: { uSun: { value: sunDir }, uStrength: { value: 1 } },
      vertexShader: `varying vec3 vNv; varying vec3 vPv; varying vec3 vNw;
        void main(){ vNv = normalize(normalMatrix * normal); vNw = normalize(mat3(modelMatrix) * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0); vPv = mv.xyz; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 uSun; uniform float uStrength; varying vec3 vNv; varying vec3 vPv; varying vec3 vNw;
        void main(){
          // back faces of a larger sphere: 0 at the halo's outer edge, rising towards the Earth's edge
          float toward = clamp(-dot(normalize(vNv), normalize(-vPv)), 0.0, 1.0);
          float glow = pow(smoothstep(0.0, 0.62, toward), 2.4);
          float lit = 0.28 + 0.72 * smoothstep(-0.45, 0.7, dot(normalize(vNw), uSun));
          vec3 col = mix(vec3(0.32, 0.58, 1.0), vec3(0.62, 0.84, 1.0), glow);
          gl_FragColor = vec4(col * lit, glow * 0.66 * lit * uStrength); }`,
      side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.atmosphere.add(this.halo);

    // Cloud layer on the globe (procedural, drifts slowly).
    this.clouds = new THREE.Mesh(new THREE.SphereGeometry(1.012, 128, 128), new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uSun: { value: sunDir }, uOpacity: { value: 0.85 } },
      vertexShader: `varying vec3 vP; varying vec3 vN; void main(){ vP = position; vN = normalize(mat3(modelMatrix)*normal); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `${NOISE} uniform float uTime, uOpacity; uniform vec3 uSun; varying vec3 vP; varying vec3 vN;
        void main(){ float f = fbm(normalize(vP) * 3.2 + vec3(uTime*0.01, 0.0, uTime*0.006));
          float c = smoothstep(0.08, 0.5, f); float lit = 0.25 + 0.75*smoothstep(-0.2, 0.5, dot(vN, uSun));
          gl_FragColor = vec4(vec3(1.0)*lit, c * uOpacity * 0.85); }`,
      transparent: true, depthWrite: false,
    }));
    this.globe.add(this.clouds);

    // Orientation that puts Kundapur facing +z (towards the camera), north up.
    const n = vectorAt(KUNDAPUR.lat, KUNDAPUR.lon);
    const north = vectorAt(KUNDAPUR.lat + 0.01, KUNDAPUR.lon).sub(n.clone().multiplyScalar(vectorAt(KUNDAPUR.lat + 0.01, KUNDAPUR.lon).dot(n))).normalize();
    const east = new THREE.Vector3().crossVectors(north, n).normalize();
    this.target = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(east, north, n)).invert();
    this.tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), THREE.MathUtils.degToRad(-23.4));
    this.start = new THREE.Quaternion();
    this.spinQ = new THREE.Quaternion();
    this.restQ = new THREE.Quaternion();
    this.marker = this.makeMarker(n);
    this.globe.add(this.marker);
  }

  async load(url, onProgress) {
    const gltf = await new GLTFLoader().loadAsync(url, onProgress);
    const earth = gltf.scene;
    earth.scale.setScalar(1 / 1.1276455); // the GLB mesh node carries a 1.1276 scale
    this.globe.add(earth);
    this.earthLoaded = true;
  }

  makeStars(n) {
    const pos = new Float32Array(3 * n), size = new Float32Array(n), tint = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = 600 + Math.random() * 900, s = Math.sqrt(1 - u * u);
      pos.set([r * s * Math.cos(a), r * u, r * s * Math.sin(a)], 3 * i);
      size[i] = Math.pow(Math.random(), 6) * 3.2 + 0.6; tint[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.setAttribute('aTint', new THREE.BufferAttribute(tint, 1));
    return new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPR: { value: 1 }, uStreak: { value: 0 } },
      vertexShader: `attribute float aSize, aTint; uniform float uTime, uPR; varying float vT, vTw;
        void main(){ vT = aTint; vTw = 0.7 + 0.3*sin(uTime*1.5 + aTint*40.0); gl_PointSize = aSize * uPR * vTw; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `varying float vT, vTw; void main(){ float d = length(gl_PointCoord-0.5); if(d>0.5) discard;
        vec3 c = mix(vec3(0.75,0.82,1.0), vec3(1.0,0.92,0.8), vT); gl_FragColor = vec4(c, (1.0 - smoothstep(0.0,0.5,d))*vTw); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
  }

  makeMarker(normal) {
    // A small pulsing ring at the estuary, visible as the globe turns to it.
    const m = new THREE.Mesh(new THREE.RingGeometry(0.012, 0.016, 48), new THREE.MeshBasicMaterial({ color: 0x8fe3ff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    m.position.copy(normal).multiplyScalar(1.016);
    m.lookAt(normal.clone().multiplyScalar(2));
    return m;
  }

  setSize(aspect, pr) { this.camera.aspect = aspect; this.camera.updateProjectionMatrix(); this.stars.material.uniforms.uPR.value = pr; }

  /** n: 0 = day (the opening), 1 = night (the end of the story). Moves the light, the sun and the moon. */
  setNight(n, time) {
    this.night = n;
    this.sunDir.copy(this.daySun).lerp(this.nightSun, n).normalize();
    this.sun.position.copy(this.sunDir).multiplyScalar(10);
    this.sunSprites.forEach((sp) => { sp.material.opacity = 1 - 0.92 * n; });
    this.moonDay.set(6.5 * Math.cos(time * 0.02), 1.6, -12 + 2 * Math.sin(time * 0.02));
    this.moon.position.copy(this.moonDay).lerp(this.moonNight, n);
    this.moon.scale.setScalar(1 + 0.25 * n);
    this.moon.rotation.y = time * 0.01;
    this.moon.material.emissiveIntensity = 0.16 * n;
    this.moonHalo.position.copy(this.moon.position);
    this.moonHalo.scale.setScalar(1.6);
    this.moonHalo.material.opacity = 0.7 * n;
  }

  /** "Return to the start": from the night view, the Earth turns back to the opening view over a
   *  few seconds (blended in update), so only the text needs to change. */
  beginReturn() {
    this.ret = {
      t0: this.lastTime ?? 0, q: this.globe.quaternion.clone(), x: this.globe.position.x, s: this.globe.scale.x,
      z: this.camera.position.z, n: this.night,
    };
  }

  /** approach: 0 = resting in space, 1 = Kundapur filling the view. */
  update(time, approach, captured, away = 0) {
    this.lastTime = time;
    // before the Earth's model has arrived, only space is shown; then the Earth fades in
    this.earthIn = Math.min(1, (this.earthIn ?? 0) + (this.earthLoaded ? 0.02 : 0));
    this.globe.visible = this.atmosphere.visible = this.earthIn > 0.001;
    const a = THREE.MathUtils.clamp(approach, 0, 1);
    if (away > 0.0005) { this.ret = null; return this.updateAway(time, THREE.MathUtils.clamp(away, 0, 1), captured); }
    if (a < 0.0005) {
      this.restQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), time * 0.06).premultiply(this.tilt);
      this.globe.quaternion.copy(this.restQ);
      this.start.copy(this.restQ);
    } else {
      // Ease into a fast multi-turn spin that unwinds exactly onto the Kundapur orientation.
      const e = a * a * (3 - 2 * a);
      const q = this.start.clone().slerp(this.target, e);
      this.spinQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.pow(1 - e, 2) * Math.PI * 9);
      this.globe.quaternion.copy(this.spinQ).multiply(q);
    }
    const zoom = Math.pow(a, 1.6);
    this.camera.position.set(0, 0, THREE.MathUtils.lerp(4.2, 1.18, zoom));
    this.camera.lookAt(0, 0, 0);
    this.globe.scale.setScalar(THREE.MathUtils.lerp(0.82, 1.0, a));
    this.globe.position.x = THREE.MathUtils.lerp(0.62, 0, Math.min(1, a * 1.6));
    this.atmosphere.position.x = this.globe.position.x;
    this.atmosphere.scale.copy(this.globe.scale);
    this.clouds.material.uniforms.uTime.value = time;
    this.clouds.material.uniforms.uOpacity.value = THREE.MathUtils.lerp(0.85, 0.35, a);
    this.atmosphere.material.uniforms.uStrength.value = 1 - 0.4 * a;
    // the halo fades as the camera dives in towards Kundapur (it would surround the camera)
    this.halo.material.uniforms.uStrength.value = 1 - THREE.MathUtils.smoothstep(a, 0.25, 0.7);
    this.marker.material.opacity = THREE.MathUtils.smoothstep(a, 0.55, 0.85) * (0.6 + 0.4 * Math.sin(time * 4));
    this.stars.material.uniforms.uTime.value = time;
    let night = 0;
    if (this.ret) {
      // the turn back from the night view: a little more spin, then the opening at rest
      const k = THREE.MathUtils.clamp((time - this.ret.t0) / 2.8, 0, 1), e = k * k * (3 - 2 * k);
      const spin = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (1 - e) * 1.6);
      this.globe.quaternion.slerpQuaternions(this.ret.q, spin.multiply(this.globe.quaternion.clone()), e);
      this.globe.position.x = THREE.MathUtils.lerp(this.ret.x, this.globe.position.x, e);
      this.globe.scale.setScalar(THREE.MathUtils.lerp(this.ret.s, this.globe.scale.x, e));
      this.camera.position.z = THREE.MathUtils.lerp(this.ret.z, this.camera.position.z, e);
      this.atmosphere.position.x = this.globe.position.x;
      this.atmosphere.scale.copy(this.globe.scale);
      night = this.ret.n * (1 - e);
      if (k >= 1) this.ret = null;
    }
    this.setNight(night, time);
    this.captured = captured;
  }

  /** The way back (end of the story): from Kundapur, the Earth turns to another face as the
   *  camera draws back, and comes to rest on the right, as at the start but on a different side. */
  updateAway(time, w, captured) {
    const e = w * w * (3 - 2 * w);
    this.awayQ ??= new THREE.Quaternion();
    // half a turn and a little tilt: the far side of the Earth from the estuary
    const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI * 0.92 * e + time * 0.035 * e);
    const lean = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(-14) * e);
    this.awayQ.copy(lean).multiply(turn).multiply(this.target);
    this.globe.quaternion.copy(this.awayQ);
    this.camera.position.set(0, 0, THREE.MathUtils.lerp(1.18, 4.2, Math.pow(e, 0.8)));
    this.camera.lookAt(0, 0, 0);
    this.globe.scale.setScalar(THREE.MathUtils.lerp(1.0, 0.7, e));
    this.globe.position.x = THREE.MathUtils.lerp(0, 0.8, e);
    this.atmosphere.position.x = this.globe.position.x;
    this.atmosphere.scale.copy(this.globe.scale);
    this.clouds.material.uniforms.uTime.value = time;
    this.clouds.material.uniforms.uOpacity.value = THREE.MathUtils.lerp(0.35, 0.85, e);
    this.atmosphere.material.uniforms.uStrength.value = THREE.MathUtils.lerp(0.6, 1, e);
    this.halo.material.uniforms.uStrength.value = THREE.MathUtils.smoothstep(e, 0.3, 0.9);
    this.marker.material.opacity = 0;
    this.stars.material.uniforms.uTime.value = time;
    this.setNight(e, time);   // the day ends as the Earth turns away
    this.captured = captured;
  }
}

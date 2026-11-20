// Two transport sequences.
//  CloudTunnel  - the descent through a thick, deep layer of monsoon cloud, from the globe to the
//                 estuary. Hundreds of camera-facing cloud puffs (procedural fbm) fill a deep volume
//                 the camera flies through; the light turns from white to the blue of the water.
//  CurrentTunnel - after Blue Marine's "currents": a spiralling stream of particles the camera rides
//                 between the map chapters, carrying the visitor to the next part of the research.
import * as THREE from 'three';
import { NOISE } from './glsl.js';

const DEPTH = 520;

export class CloudTunnel {
  constructor(count = 420) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.5, 1200);
    const quad = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index; g.attributes.position = quad.attributes.position; g.attributes.uv = quad.attributes.uv;
    const centre = new Float32Array(3 * count), scale = new Float32Array(count), seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const z = -Math.random() * DEPTH;
      // dense everywhere, a little thinner on the axis so the camera can see a way through
      const r = Math.pow(Math.random(), 0.7) * 60 + (Math.random() < 0.25 ? 0 : 6);
      const a = Math.random() * Math.PI * 2;
      centre.set([Math.cos(a) * r, Math.sin(a) * r * 0.75, z], 3 * i);
      scale[i] = 26 + Math.random() * 46; seed[i] = Math.floor(Math.random() * 4) + Math.random() * 0.999; // atlas tile + rotation
    }
    g.setAttribute('aCentre', new THREE.InstancedBufferAttribute(centre, 3));
    g.setAttribute('aScale', new THREE.InstancedBufferAttribute(scale, 1));
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 1));
    g.instanceCount = count;
    this.material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uTint: { value: 0 }, uAtlas: { value: null } },
      vertexShader: /* glsl */ `
        attribute vec3 aCentre; attribute float aScale, aSeed;
        varying vec2 vUv; varying float vSeed, vFade;
        void main() {
          vUv = uv; vSeed = aSeed;
          vec4 mv = modelViewMatrix * vec4(aCentre, 1.0);
          mv.xy += position.xy * aScale;
          float d = -mv.z;
          vFade = smoothstep(2.0, 40.0, d) * (1.0 - smoothstep(380.0, 520.0, d));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime, uOpacity, uTint;
        uniform sampler2D uAtlas;   // four cloud puffs baked once on the GPU (see bake())
        varying vec2 vUv; varying float vSeed, vFade;
        void main() {
          float tileId = floor(vSeed);
          float ang = fract(vSeed) * 6.2831 + uTime * 0.01;
          vec2 q = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * (vUv - 0.5);
          if (max(abs(q.x), abs(q.y)) > 0.5) discard;
          vec2 tile = vec2(mod(tileId, 2.0), floor(tileId / 2.0));
          vec4 s = texture2D(uAtlas, (q + 0.5 + tile) * 0.5);
          float puff = s.g;
          if (puff < 0.02) discard;
          float shade = s.r;
          vec3 cloud = vec3(0.93, 0.95, 0.97) * shade;
          vec3 water = mix(vec3(0.10, 0.36, 0.48), vec3(0.42, 0.74, 0.84), shade);
          vec3 col = mix(cloud, water, uTint);
          gl_FragColor = vec4(col, puff * 0.55 * uOpacity * vFade);
        }`,
      transparent: true, depthWrite: false,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }
  /** Bake four procedural cloud puffs (fbm noise) into a 2x2 atlas once, so each cloud pixel is a
   *  texture lookup instead of five octaves of 3D noise (the layer is several screens of overdraw). */
  bake(renderer) {
    const rt = new THREE.WebGLRenderTarget(1024, 1024);
    const scene = new THREE.Scene();
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */ `
        ${NOISE}
        varying vec2 vUv;
        void main() {
          vec2 tile = floor(vUv * 2.0);
          vec2 p = fract(vUv * 2.0) - 0.5;
          float n = fbm(vec3(p * 2.6, (tile.x + tile.y * 2.0 + 1.0) * 7.3));
          float puff = 1.0 - smoothstep(0.05, 0.5, length(p) + n * 0.22);
          float shade = 0.72 + 0.28 * smoothstep(-0.3, 0.4, -p.y + n * 0.5);
          gl_FragColor = vec4(shade, puff, 0.0, 1.0);
        }`,
    })));
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(rt);
    renderer.render(scene, cam);
    renderer.setRenderTarget(prev);
    this.material.uniforms.uAtlas.value = rt.texture;
  }
  setSize(aspect) { this.camera.aspect = aspect; this.camera.updateProjectionMatrix(); }
  /** p: 0..1 through the layer; opacity: overall presence; tint: 0 white cloud, 1 blue water */
  update(time, p, opacity, tint) {
    const z = 30 - p * (DEPTH + 40);
    this.camera.position.set(Math.sin(p * 5.0) * 4, Math.cos(p * 3.0) * 3, z);
    this.camera.rotation.set(0, 0, p * 1.4 + Math.sin(time * 0.2) * 0.02);
    const u = this.material.uniforms;
    u.uTime.value = time; u.uOpacity.value = opacity; u.uTint.value = tint;
  }
}

export class CurrentTunnel {
  constructor(count = 9000) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(64, 1, 0.1, 600);
    const pos = new Float32Array(3 * count), seed = new Float32Array(4 * count);
    for (let i = 0; i < count; i++) {
      pos.set([0, 0, -Math.random() * 400], 3 * i);
      seed.set([Math.random(), Math.random(), Math.random(), Math.random()], 4 * i);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    this.material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uTravel: { value: 0 }, uOpacity: { value: 0 }, uPR: { value: 1 }, uHue: { value: new THREE.Color('#45B5D1') } },
      vertexShader: /* glsl */ `
        attribute vec4 aSeed; uniform float uTime, uTravel, uPR; varying float vA; varying float vS;
        void main() {
          float L = 400.0;
          float z = mod(position.z + uTravel + uTime * 6.0 * (0.6 + aSeed.w), L) - L;
          float ring = mix(2.6, 9.0, pow(aSeed.x, 0.6));
          float ang = aSeed.y * 6.2831 + z * 0.045 + uTime * 0.25;
          vec3 p = vec3(cos(ang) * ring, sin(ang) * ring, z);
          p.xy += vec2(sin(z * 0.03 + aSeed.z * 6.0), cos(z * 0.025)) * 3.0;  // the current bends
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          vA = smoothstep(-400.0, -260.0, z) * (1.0 - smoothstep(-6.0, 0.0, z));
          vS = aSeed.w;
          gl_PointSize = clamp((1.2 + 3.0 * aSeed.w) * uPR * (60.0 / -mv.z), 0.0, 64.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uOpacity; uniform vec3 uHue; varying float vA, vS;
        void main() { float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
          vec3 c = mix(uHue, vec3(0.92, 0.98, 1.0), vS * 0.7);
          gl_FragColor = vec4(c, (1.0 - smoothstep(0.0, 0.5, d)) * vA * uOpacity);
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
    this.camera.position.set(0, 0, 0);
  }
  setSize(aspect, pr) { this.camera.aspect = aspect; this.camera.updateProjectionMatrix(); this.material.uniforms.uPR.value = pr; }
  /** travel: scroll-driven distance along the current; opacity: presence */
  update(time, travel, opacity, hue) {
    const u = this.material.uniforms;
    u.uTime.value = time; u.uTravel.value = travel * 320; u.uOpacity.value = opacity;
    if (hue) u.uHue.value.set(hue);
    this.camera.rotation.z = travel * 2.2;
  }
}

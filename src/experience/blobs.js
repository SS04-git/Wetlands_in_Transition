// Class "specimens", after Blobmixer: a single high-resolution sphere whose noise displacement,
// twist, surface pattern and colours are all uniforms, so moving from one class to the next is a
// continuous transformation rather than a swap. Each class's settings refer to what it is:
// water ripples and gleams, muddy shallows slump slowly, bed ground is fine and grainy, mangrove
// canopy is a cluster of crowns, the land edge is a twisted banded line, buildings are faceted.
import * as THREE from 'three';
import { NOISE } from './glsl.js';

export const BLOB_PRESETS = {
  water:           { a: '#45B5D1', b: '#d4f1f8', freq: 1.0, amp: 0.16, speed: 0.38, twist: 0.0, stripe: 1.0, grain: 0, cells: 0, mottle: 0.15, bands: 0, facet: 0, gloss: 1.0 },
  muddy_shallows:  { a: '#6F858B', b: '#3c4d52', freq: 0.65, amp: 0.30, speed: 0.14, twist: 0.0, stripe: 0, grain: 0.15, cells: 0, mottle: 1.0, bands: 0, facet: 0, gloss: 0.45 },
  bed_ground:      { a: '#D8C29A', b: '#a8895a', freq: 2.4, amp: 0.07, speed: 0.08, twist: 0.0, stripe: 0, grain: 1.0, cells: 0, mottle: 0.25, bands: 0, facet: 0, gloss: 0.1 },
  mangrove_canopy: { a: '#39734D', b: '#173a25', freq: 2.9, amp: 0.30, speed: 0.22, twist: 0.0, stripe: 0, grain: 0, cells: 1.0, mottle: 0.2, bands: 0, facet: 0, gloss: 0.3 },
  land_edge:       { a: '#A67C3D', b: '#e8c27f', freq: 1.4, amp: 0.10, speed: 0.30, twist: 1.7, stripe: 0, grain: 0.2, cells: 0, mottle: 0, bands: 1.0, facet: 0, gloss: 0.5 },
  tree_cover:      { a: '#7FA650', b: '#43632a', freq: 3.6, amp: 0.22, speed: 0.30, twist: 0.0, stripe: 0, grain: 0, cells: 0.8, mottle: 0.1, bands: 0, facet: 0, gloss: 0.25 },
  track:           { a: '#B5654A', b: '#7a3b28', freq: 0.9, amp: 0.10, speed: 0.12, twist: 0.6, stripe: 0, grain: 0.7, cells: 0, mottle: 0.3, bands: 0.35, facet: 0, gloss: 0.15 },
  buildings:       { a: '#6B6F7A', b: '#b3b7c0', freq: 0.6, amp: 0.10, speed: 0.10, twist: 0.0, stripe: 0, grain: 0.1, cells: 0, mottle: 0, bands: 0, facet: 1.0, gloss: 0.4 },
  boats:           { a: '#E5A832', b: '#fff0c4', freq: 1.8, amp: 0.20, speed: 0.55, twist: 0.3, stripe: 0.35, grain: 0, cells: 0, mottle: 0, bands: 0, facet: 0, gloss: 0.85 },
  cage_farms:      { a: '#C62C2C', b: '#ff9a8c', freq: 1.2, amp: 0.14, speed: 0.20, twist: 0.0, stripe: 0, grain: 0, cells: 0.25, mottle: 0, bands: 0, facet: 0.8, gloss: 0.6 },
};
const NUMERIC = ['freq', 'amp', 'speed', 'twist', 'stripe', 'grain', 'cells', 'mottle', 'bands', 'facet', 'gloss'];

const vertex = /* glsl */ `
  uniform float uTime, uFreq, uAmp, uSpeed, uTwist, uFacet;
  varying vec3 vNormalW, vPos, vViewDir;
  varying float vDisp;
  ${NOISE}
  vec3 twist(vec3 p, float k) {
    float a = k * p.y;
    float c = cos(a), s = sin(a);
    return vec3(c * p.x - s * p.z, p.y, s * p.x + c * p.z);
  }
  float disp(vec3 p) {
    float d = snoise(p * uFreq + vec3(0.0, uTime * uSpeed, uTime * uSpeed * 0.6));
    d += 0.35 * snoise(p * uFreq * 2.3 - uTime * uSpeed * 0.7);
    // facets: quantise the displacement into flat steps (buildings, cage frames)
    d = mix(d, floor(d * 3.0 + 0.5) / 3.0, uFacet);
    return d * uAmp;
  }
  vec3 shape(vec3 p) {
    vec3 n = normalize(p);
    vec3 q = n * (1.0 + disp(n));
    return twist(q, uTwist * sin(uTime * 0.25 + q.y));
  }
  void main() {
    vec3 n = normalize(position);
    vec3 t = normalize(cross(n, abs(n.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
    vec3 b = cross(n, t);
    float e = 0.006;
    vec3 p0 = shape(n);
    vec3 p1 = shape(normalize(n + t * e));
    vec3 p2 = shape(normalize(n + b * e));
    vec3 nn = normalize(cross(p1 - p0, p2 - p0));
    if (dot(nn, p0) < 0.0) nn = -nn;
    vDisp = length(p0) - 1.0;
    vPos = n;
    vec4 world = modelMatrix * vec4(p0, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * nn);
    vViewDir = normalize(cameraPosition - world.xyz);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragment = /* glsl */ `
  uniform vec3 uColorA, uColorB;
  uniform float uTime, uStripe, uGrain, uCells, uMottle, uBands, uGloss, uOpacity;
  varying vec3 vNormalW, vPos, vViewDir;
  varying float vDisp;
  ${NOISE}
  float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float cellular(vec3 p) {
    vec3 i = floor(p), f = fract(p); float d = 1.0;
    for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec3 g = vec3(x, y, z);
      vec3 o = vec3(hash(i + g), hash(i + g + 3.1), hash(i + g + 7.7));
      d = min(d, length(g + o - f));
    }
    return d;
  }
  void main() {
    vec3 N = normalize(vNormalW), V = normalize(vViewDir);
    vec3 L1 = normalize(vec3(-0.5, 0.8, 0.6)), L2 = normalize(vec3(0.7, -0.2, 0.5));
    float pattern = 0.5 + vDisp * 1.6;
    pattern += uStripe * 0.25 * sin(vPos.y * 26.0 + snoise(vPos * 3.0 + uTime * 0.2) * 3.0 + uTime * 0.8);
    pattern += uGrain * 0.22 * (hash(floor(vPos * 140.0)) - 0.5);
    pattern += uCells * 0.55 * (0.5 - cellular(vPos * 6.0));
    pattern += uMottle * 0.35 * fbm(vPos * 2.2 + uTime * 0.03);
    pattern += uBands * 0.3 * sin(vPos.y * 40.0);
    vec3 base = mix(uColorB, uColorA, clamp(pattern, 0.0, 1.0));
    float diff = 0.35 + 0.55 * max(dot(N, L1), 0.0) + 0.2 * max(dot(N, L2), 0.0);
    vec3 H = normalize(L1 + V);
    float spec = pow(max(dot(N, H), 0.0), mix(8.0, 90.0, uGloss)) * mix(0.08, 0.9, uGloss);
    float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
    vec3 col = base * diff + spec + fres * mix(uColorB, vec3(1.0), 0.6) * 0.55;
    gl_FragColor = vec4(col, uOpacity);
    #include <colorspace_fragment>
  }
`;

export class Blob {
  constructor({ detail = 40, presetKey = 'water' } = {}) {
    const p = BLOB_PRESETS[presetKey];
    this.params = { ...Object.fromEntries(NUMERIC.map((k) => [k, p[k]])) };
    this.colorA = new THREE.Color(p.a);
    this.colorB = new THREE.Color(p.b);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uOpacity: { value: 1 },
        uColorA: { value: this.colorA }, uColorB: { value: this.colorB },
        ...Object.fromEntries(NUMERIC.map((k) => [`u${k[0].toUpperCase()}${k.slice(1)}`, { value: p[k] }])),
      },
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
    });
    this.mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, detail), this.material);
    this.mesh.frustumCulled = false;
    this.current = presetKey;
  }

  /** Continuous transformation towards another class (GSAP tween of every numeric setting and colour). */
  morphTo(key, gsap, duration = 1.1) {
    const p = BLOB_PRESETS[key];
    this.current = key;
    gsap.to(this.params, { ...Object.fromEntries(NUMERIC.map((k) => [k, p[k]])), duration, ease: 'power2.inOut', overwrite: true });
    const a = new THREE.Color(p.a), b = new THREE.Color(p.b);
    gsap.to(this.colorA, { r: a.r, g: a.g, b: a.b, duration, ease: 'power2.inOut', overwrite: true });
    gsap.to(this.colorB, { r: b.r, g: b.g, b: b.b, duration, ease: 'power2.inOut', overwrite: true });
  }

  update(time) {
    const u = this.material.uniforms;
    u.uTime.value = time;
    for (const k of NUMERIC) u[`u${k[0].toUpperCase()}${k.slice(1)}`].value = this.params[k];
  }
}

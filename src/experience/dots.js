// Clustered-dot rendering. Every dot is drawn as a small lit ball (a sphere impostor in a point
// sprite), coloured by its class from the exact research palette, or by a sampled image colour.
// Each class has its own height (uLevel) and visibility (uClassAlpha), so one cloud can separate
// into stacked layers and recombine while every dot keeps its plan position.
import * as THREE from 'three';

export const MAX_CLASSES = 10;

const vertex = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  attribute float aClass;
  attribute vec4 aRand;
  attribute vec3 aColor;
  attribute float aValue;       // per-dot value for threshold views (e.g. dates observed as water)
  uniform float uThreshold;     // 0 = off
  uniform float uLevel[${MAX_CLASSES}];
  uniform float uClassAlpha[${MAX_CLASSES}];
  uniform float uClassSize[${MAX_CLASSES}];
  uniform vec3 uPalette[${MAX_CLASSES}];
  uniform float uHighlight;      // class index, or -1
  uniform float uTime, uSize, uPixelRatio, uOpacity, uScatter, uBob, uUseRGB, uRise, uGain;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    int ci = int(aClass + 0.5);
    vec3 p = position;
    float lvl = ci < ${MAX_CLASSES} ? uLevel[ci] : 0.0;
    p.y += lvl * uRise;
    p.y += sin(uTime * 0.9 + aRand.x * 6.2831) * uBob * (0.4 + aRand.y);
    vec3 dir = normalize(vec3(aRand.y - 0.5, aRand.z * 0.8 + 0.2, aRand.w - 0.5));
    p += dir * uScatter * (0.35 + aRand.x);
    float classA = ci < ${MAX_CLASSES} ? uClassAlpha[ci] : 1.0;
    float hi = (uHighlight >= 0.0 && abs(aClass - uHighlight) < 0.5) ? 1.0 : 0.0;
    float dimOthers = (uHighlight >= 0.0 && hi < 0.5) ? 0.28 : 1.0;
    vAlpha = uOpacity * classA * dimOthers;
    vColor = uUseRGB > 0.5 ? aColor * uGain : uPalette[ci < ${MAX_CLASSES} ? ci : 0];
    vColor = mix(vColor, vec3(1.0), hi * 0.18);
    float pass = (uThreshold <= 0.0 || aValue >= uThreshold) ? 1.0 : 0.0;
    vAlpha *= mix(0.07, 1.0, pass);
    vColor = mix(vec3(dot(vColor, vec3(0.3, 0.59, 0.11))) * 0.8, vColor, pass);
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    float cs = ci < ${MAX_CLASSES} ? uClassSize[ci] : 1.0;
    float s = uSize * cs * (0.7 + 0.6 * aRand.w) * (1.0 + hi * 0.35);
    gl_PointSize = clamp(s * uPixelRatio * (900.0 / -mvPosition.z), 0.0, 64.0);
    if (vAlpha < 0.004) gl_PointSize = 0.0;
    #include <fog_vertex>
  }
`;

const fragment = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  uniform float uFlat;   // 1 = flat printed disc (halftone), 0 = lit ball
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 q = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(q, q);
    if (r2 > 1.0) discard;
    vec3 n = vec3(q.x, -q.y, sqrt(1.0 - r2));
    vec3 L = normalize(vec3(-0.45, 0.65, 0.62));
    float diff = 0.62 + 0.55 * max(dot(n, L), 0.0);
    float spec = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 22.0) * 0.32;
    vec3 col = mix(vColor * diff + spec, vColor, uFlat);
    float edge = 1.0 - smoothstep(0.78, 1.0, r2);
    gl_FragColor = vec4(col, vAlpha * edge);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

export function paletteUniform(classes) {
  const arr = Array.from({ length: MAX_CLASSES }, (_, i) => new THREE.Color(classes[i]?.color ?? '#ffffff'));
  return arr;
}

export function dotMaterial(palette, opts = {}) {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uLevel: { value: new Array(MAX_CLASSES).fill(0) },
      uClassAlpha: { value: new Array(MAX_CLASSES).fill(1) },
      uClassSize: { value: new Array(MAX_CLASSES).fill(1) },
      uPalette: { value: palette },
      uHighlight: { value: -1 },
      uTime: { value: 0 }, uSize: { value: opts.size ?? 1.6 }, uPixelRatio: { value: 1 },
      uOpacity: { value: 0 }, uScatter: { value: 0 }, uBob: { value: opts.bob ?? 0 },
      uUseRGB: { value: opts.rgb ? 1 : 0 }, uRise: { value: 1 }, uGain: { value: opts.gain ?? 1 }, uThreshold: { value: 0 }, uFlat: { value: opts.flat ? 1 : 0 },
    }]),
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
}

let seed = 1;
const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

/** Build a Points cloud from parsed dots { n, pos, cls, rgb }. */
export function makeDots({ n, pos, cls, rgb }, material, { yOffset = 0 } = {}) {
  const g = new THREE.BufferGeometry();
  const p = pos.slice();
  if (yOffset) for (let i = 0; i < n; i++) p[3 * i + 1] += yOffset;
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setAttribute('aClass', new THREE.BufferAttribute(Float32Array.from(cls), 1));
  const r = new Float32Array(4 * n);
  for (let i = 0; i < 4 * n; i++) r[i] = rand();
  g.setAttribute('aRand', new THREE.BufferAttribute(r, 4));
  const c = new Float32Array(3 * n);
  if (rgb) {
    const tmp = new THREE.Color();
    for (let i = 0; i < n; i++) {
      tmp.setRGB(rgb[3 * i] / 255, rgb[3 * i + 1] / 255, rgb[3 * i + 2] / 255, THREE.SRGBColorSpace);
      c[3 * i] = tmp.r; c[3 * i + 1] = tmp.g; c[3 * i + 2] = tmp.b;
    }
  }
  g.setAttribute('aColor', new THREE.BufferAttribute(c, 3));
  g.computeBoundingSphere();
  const pts = new THREE.Points(g, material);
  pts.frustumCulled = false;
  return pts;
}

/** Columns of balls: count[i] balls stacked over cell i (each ball = one counted item). */
export function makeColumns(pos, counts, { step = 1.0, cls = 0, filter = () => true } = {}) {
  let total = 0;
  for (let i = 0; i < counts.length; i++) if (filter(i)) total += counts[i];
  const p = new Float32Array(3 * total), c = new Float32Array(total), k = new Float32Array(total), owner = new Uint32Array(total);
  let j = 0;
  for (let i = 0; i < counts.length; i++) {
    if (!filter(i)) continue;
    for (let s = 0; s < counts[i]; s++, j++) {
      p[3 * j] = pos[3 * i]; p[3 * j + 1] = (s + 0.5) * step; p[3 * j + 2] = pos[3 * i + 2];
      c[j] = cls; k[j] = s + 1; owner[j] = i;
    }
  }
  return { n: total, pos: p, cls: c, order: k, owner };
}

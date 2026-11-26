// Clustered-dot rendering. Every dot is drawn as a small lit ball (a sphere impostor in a point
// sprite), coloured by its class from the exact research palette, or by a sampled image colour.
// Each class has its own height (uLevel) and visibility (uClassAlpha), so one cloud can separate
// into stacked layers and recombine while every dot keeps its plan position.
import * as THREE from 'three';
import { SURFACE_GLSL } from './classLook.js';

export const MAX_CLASSES = 11; // ten traced classes + 'land' (derived, model chapter only)

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
  uniform vec3 uShade[${MAX_CLASSES}];     // shared class look (classLook.js): texture shade
  uniform vec4 uTex[${MAX_CLASSES}];       // stripe, grain, cells, mottle
  uniform vec4 uLook[${MAX_CLASSES}];      // freq, bands, gloss, facet
  uniform float uClassLift[${MAX_CLASSES}]; // metres a class rises as a volume (tree canopy in Map 4)
  uniform float uTexAmt;         // strength of the class texture (0 = flat class colour)
  uniform float uRamp;           // 1 = colour by aValue / 17 (Map 2: pale = few dates, dark = every date)
  uniform float uHighlight;      // class index, or -1
  uniform float uDim;            // opacity of the other classes while one is highlighted
  uniform float uHiSize;         // size boost of the highlighted class
  uniform float uGrey;           // how far the other classes turn grey while one is highlighted
  uniform float uTime, uSize, uPixelRatio, uOpacity, uScatter, uBob, uUseRGB, uRise, uGain;
  uniform float uLeave;          // 0 while a tunnel carries this map away (estuary.js, update)
  uniform float uTraceOn, uTraceT;             // Map 1: classes drawn in one after another
  uniform float uTraceRank[${MAX_CLASSES}];    // the order each class is drawn in
  uniform float uClipY;          // Map 2: balls above this height are not counted yet
  uniform vec3 uSplit;           // model chapter: x = on, y = the line's position, z = which side shows (+1 east, -1 west)
  uniform float uClassWave[${MAX_CLASSES}];   // gentle swell on water-like classes
  uniform float uClassBob[${MAX_CLASSES}];    // boats bob, cage farms sway
  varying vec3 vColor;
  varying float vAlpha;
  varying float vGloss;
  ${SURFACE_GLSL}
  void main() {
    int ci = int(aClass + 0.5);
    int cj = ci < ${MAX_CLASSES} ? ci : 0;
    vec3 p = position;
    float lvl = ci < ${MAX_CLASSES} ? uLevel[ci] : 0.0;
    p.y += lvl * uRise;
    p.y += uClassLift[cj] * (0.3 + 0.7 * aRand.z);
    p.y += sin(uTime * 0.9 + aRand.x * 6.2831) * uBob * (0.4 + aRand.y);
    // the water breathes: long, slow swells travel across it (the traced positions do not move
    // sideways, only up and down by a little), and boats bob on it
    float wv = uClassWave[cj];
    if (wv > 0.0) p.y += wv * (0.6 * sin(position.x * 0.045 + uTime * 1.1) + 0.4 * sin(position.z * 0.06 - uTime * 0.8));
    float bb = uClassBob[cj];
    if (bb > 0.0) { p.y += bb * sin(uTime * 1.3 + aRand.x * 6.2831); p.x += bb * 0.35 * sin(uTime * 0.7 + aRand.y * 6.2831); }
    vec3 dir = normalize(vec3(aRand.y - 0.5, aRand.z * 0.8 + 0.2, aRand.w - 0.5));
    p += dir * uScatter * (0.35 + aRand.x);
    float classA = ci < ${MAX_CLASSES} ? uClassAlpha[ci] : 1.0;
    float hi = (uHighlight >= 0.0 && abs(aClass - uHighlight) < 0.5) ? 1.0 : 0.0;
    float dimOthers = (uHighlight >= 0.0 && hi < 0.5) ? uDim : 1.0;
    vAlpha = uOpacity * classA * dimOthers * uLeave;
    // Map 1, tracing: each class is drawn in turn, sweeping west to east like a pen across the image
    if (uTraceOn > 0.5) {
      float prog = clamp(uTraceT - uTraceRank[cj], 0.0, 1.0);
      float xn = (position.x + 125.0) / 250.0;
      vAlpha *= smoothstep(xn - 0.04, xn, prog * 1.04);
    }
    // Map 2, counting: a column shows only the balls counted so far
    if (position.y > uClipY) vAlpha = 0.0;
    if (uSplit.x > 0.5) vAlpha *= smoothstep(-0.6, 0.6, (position.x - uSplit.y) * uSplit.z);
    vColor = uPalette[cj];
    vGloss = uLook[cj].z;
    if (uUseRGB > 0.5) { vColor = aColor * uGain; vGloss = 0.3; }
    else if (uRamp > 0.5) {
      float k = clamp(aValue / 17.0, 0.0, 1.0);
      vColor = mix(mix(uPalette[cj], vec3(1.0), 0.32), mix(uPalette[cj], uShade[cj], 0.45), k);
    } else if (uTexAmt > 0.0) {
      vec3 w = (modelMatrix * vec4(position, 1.0)).xyz;
      float pat = classPattern(w, uTex[cj], uLook[cj], aRand.y, uTime);
      vColor = mix(uPalette[cj], mix(uShade[cj], uPalette[cj] * 1.12, pat), uTexAmt * 0.7);
    }
    vColor *= 1.0 + hi * 0.4; // the class in focus brightens within its own colour
    // while one class is singled out, the others turn grey as well as fading, so it stands out
    if (uHighlight >= 0.0 && hi < 0.5) vColor = mix(vColor, vec3(dot(vColor, vec3(0.3, 0.59, 0.11))), 0.75 * uGrey);
    float pass = (uThreshold <= 0.0 || aValue >= uThreshold) ? 1.0 : 0.0;
    vAlpha *= mix(0.07, 1.0, pass);
    vColor = mix(vec3(dot(vColor, vec3(0.3, 0.59, 0.11))) * 0.8, vColor, pass);
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    float cs = ci < ${MAX_CLASSES} ? uClassSize[ci] : 1.0;
    float s = uSize * cs * (0.7 + 0.6 * aRand.w) * (1.0 + hi * uHiSize * (0.85 + 0.15 * sin(uTime * 2.4)));
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
  varying float vGloss;
  void main() {
    vec2 q = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(q, q);
    if (r2 > 1.0) discard;
    vec3 n = vec3(q.x, -q.y, sqrt(1.0 - r2));
    vec3 L = normalize(vec3(-0.45, 0.65, 0.62));
    float diff = 0.62 + 0.55 * max(dot(n, L), 0.0);
    float spec = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), mix(8.0, 48.0, vGloss)) * mix(0.08, 0.55, vGloss);
    vec3 col = mix(vColor * diff + spec, vColor, uFlat);
    float edge = 1.0 - smoothstep(0.78, 1.0, r2);
    gl_FragColor = vec4(col, vAlpha * edge);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

/** Display palette: the shared class look (classLook.js), in manifest class order. */
export function paletteUniform(classes, look) {
  return Array.from({ length: MAX_CLASSES }, (_, i) => new THREE.Color(look?.[classes[i]?.key]?.a ?? classes[i]?.color ?? '#ffffff'));
}

const pad = (arr, make) => Array.from({ length: MAX_CLASSES }, (_, i) => arr?.[i] ?? make());

export function dotMaterial(palette, opts = {}) {
  const L = opts.look ?? {};
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uLevel: { value: new Array(MAX_CLASSES).fill(0) },
      uClassAlpha: { value: new Array(MAX_CLASSES).fill(1) },
      uClassSize: { value: new Array(MAX_CLASSES).fill(1) },
      uPalette: { value: palette },
      uShade: { value: pad(L.shade, () => new THREE.Color(0.2, 0.2, 0.2)) },
      uTex: { value: pad(L.tex, () => new THREE.Vector4()) },
      uLook: { value: pad(L.look, () => new THREE.Vector4(1, 0, 0.3, 0)) },
      uClassLift: { value: new Array(MAX_CLASSES).fill(0) },
      uClassWave: { value: new Array(MAX_CLASSES).fill(0) }, uClassBob: { value: new Array(MAX_CLASSES).fill(0) },
      uTexAmt: { value: opts.tex ?? 1 }, uRamp: { value: opts.ramp ? 1 : 0 },
      uHighlight: { value: -1 }, uDim: { value: 0.28 }, uHiSize: { value: 0.35 }, uGrey: { value: 1 },
      uTime: { value: 0 }, uSize: { value: opts.size ?? 1.6 }, uPixelRatio: { value: 1 },
      uOpacity: { value: 0 }, uLeave: { value: 1 }, uTraceOn: { value: 0 }, uTraceT: { value: 0 }, uTraceRank: { value: new Array(MAX_CLASSES).fill(0) }, uClipY: { value: 1e9 }, uSplit: { value: new THREE.Vector3(0, 0, 1) }, uScatter: { value: 0 }, uBob: { value: opts.bob ?? 0 },
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

// One visual identity per class, shared by every place the class appears: the Blobmixer
// specimen, the clustered dots of every map, the built structures of Map 4 and the legends.
//
// Colours stay inside each class's original family (manifest.json keeps the research palette
// untouched); they are pushed apart in lightness and saturation so that classes of the same
// family remain distinct once lit in 3D:
//   tree cover   brighter yellow-green   vs  mangrove canopy  deeper blue-green
//   boats        bright saturated yellow vs  land edge        darker ochre-brown
//   cage farms   crimson                 vs  track            terracotta
//   muddy        teal-grey, matte        vs  buildings        blue-slate, faceted
//
// a = main colour (legend swatch), b = shade used by the surface texture.
// freq: scale of the texture; stripe = moving ripples, grain = per-dot speckle, cells = crowns,
// mottle = slow cloudy patches, bands = banded line, facet = flat faces, gloss = shine.
import * as THREE from 'three';
import { NOISE } from './glsl.js';

export const CLASS_LOOK = {
  water:           { a: '#45B5D1', b: '#1f7891', freq: 1.0, amp: 0.16, speed: 0.38, twist: 0.0, stripe: 1.0, grain: 0.1, cells: 0, mottle: 0.15, bands: 0, facet: 0, gloss: 1.0 },
  muddy_shallows:  { a: '#66898C', b: '#344a4d', freq: 0.65, amp: 0.30, speed: 0.14, twist: 0.0, stripe: 0, grain: 0.15, cells: 0, mottle: 1.0, bands: 0, facet: 0, gloss: 0.45 },
  bed_ground:      { a: '#DCC598', b: '#a8895a', freq: 2.4, amp: 0.07, speed: 0.08, twist: 0.0, stripe: 0, grain: 1.0, cells: 0, mottle: 0.25, bands: 0, facet: 0, gloss: 0.1 },
  mangrove_canopy: { a: '#2F6E47', b: '#10301d', freq: 2.9, amp: 0.30, speed: 0.22, twist: 0.0, stripe: 0, grain: 0, cells: 1.0, mottle: 0.2, bands: 0, facet: 0, gloss: 0.3 },
  land_edge:       { a: '#9A6B2C', b: '#dcb06a', freq: 1.4, amp: 0.10, speed: 0.30, twist: 1.7, stripe: 0, grain: 0.2, cells: 0, mottle: 0, bands: 1.0, facet: 0, gloss: 0.5 },
  tree_cover:      { a: '#A2C957', b: '#5c8a2c', freq: 3.6, amp: 0.22, speed: 0.30, twist: 0.0, stripe: 0, grain: 0, cells: 0.8, mottle: 0.1, bands: 0, facet: 0, gloss: 0.25 },
  track:           { a: '#B85E40', b: '#7a3b28', freq: 0.9, amp: 0.10, speed: 0.12, twist: 0.6, stripe: 0, grain: 0.7, cells: 0, mottle: 0.3, bands: 0.35, facet: 0, gloss: 0.15 },
  buildings:       { a: '#5E6280', b: '#c3c6d4', freq: 0.6, amp: 0.10, speed: 0.10, twist: 0.0, stripe: 0, grain: 0.1, cells: 0, mottle: 0, bands: 0, facet: 1.0, gloss: 0.4 },
  boats:           { a: '#F7BC1E', b: '#fff1c2', freq: 1.8, amp: 0.20, speed: 0.55, twist: 0.3, stripe: 0.35, grain: 0, cells: 0, mottle: 0, bands: 0, facet: 0, gloss: 0.85 },
  cage_farms:      { a: '#D3222E', b: '#ff8f86', freq: 1.2, amp: 0.14, speed: 0.20, twist: 0.0, stripe: 0, grain: 0, cells: 0.25, mottle: 0, bands: 0, facet: 0.8, gloss: 0.6 },
};

export const LOOK_KEYS = Object.keys(CLASS_LOOK);
export const lookColor = (key) => CLASS_LOOK[key]?.a ?? '#ffffff';

// Rainfall (Map 6): the two blues of the printed rainfall key, set apart from the water class.
export const RAIN_LOOK = { monsoon: '#1E7F9A', prior30: '#E4F4F8' };

/** Publish the colours as CSS variables (--c-water ...) so HTML keys use exactly the 3D colours. */
export function publishCssColours(root = document.documentElement) {
  for (const k of LOOK_KEYS) root.style.setProperty(`--c-${k.replaceAll('_', '-')}`, CLASS_LOOK[k].a);
  root.style.setProperty('--c-monsoon', RAIN_LOOK.monsoon);
  root.style.setProperty('--c-prior30', RAIN_LOOK.prior30);
}

/** Per-class uniform arrays for the dot shader, in manifest class order. */
export function lookUniforms(classes) {
  const shade = [], tex = [], look = [];
  classes.forEach((c) => {
    const L = CLASS_LOOK[c.key];
    shade.push(new THREE.Color(L.b));
    tex.push(new THREE.Vector4(L.stripe, L.grain, L.cells, L.mottle));
    look.push(new THREE.Vector4(L.freq, L.bands, L.gloss, L.facet));
  });
  return { shade, tex, look };
}

// The surface texture, in world metres, shared by the dots and the meshes. It is the map-scale
// counterpart of the specimen's pattern (blobs.js): the same ripples, grain, crowns, mottle and bands.
export const SURFACE_GLSL = /* glsl */ `
  ${NOISE}
  float sHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float sCell(vec2 p) {
    vec2 i = floor(p), f = fract(p); float d = 1.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = vec2(sHash(vec3(i + g, 1.0)), sHash(vec3(i + g, 7.0)));
      d = min(d, length(g + o - f));
    }
    return d;
  }
  // tex = (stripe, grain, cells, mottle); look = (freq, bands, gloss, facet)
  float classPattern(vec3 w, vec4 tex, vec4 look, float seed, float t) {
    vec3 q = w * look.x * 0.06;
    float p = 0.62;
    p += tex.x * 0.30 * sin(q.z * 9.0 + snoise(q * 1.5 + t * 0.15) * 2.5 + t * 0.9);
    p += tex.y * 0.40 * (seed - 0.5);
    p += tex.z * 0.80 * (0.42 - sCell(q.xz * 3.0));
    p += tex.w * 0.55 * snoise(q * 0.7 + t * 0.02);
    p += look.y * 0.32 * sin((q.x + q.z) * 12.0);
    return clamp(p, 0.0, 1.0);
  }
`;

/**
 * Lit, textured material for built geometry (Map 4): the class's own colour, shade, texture and
 * gloss, with the same two-light shading as the specimens. Works on Mesh and InstancedMesh.
 */
export function surfaceMaterial(key, { opacity = 1 } = {}) {
  const L = CLASS_LOOK[key];
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uColorA: { value: new THREE.Color(L.a) }, uColorB: { value: new THREE.Color(L.b) },
      uTex: { value: new THREE.Vector4(L.stripe, L.grain, L.cells, L.mottle) },
      uLook: { value: new THREE.Vector4(L.freq, L.bands, L.gloss, L.facet) },
      uTime: { value: 0 }, uOpacity: { value: opacity }, uLeave: { value: 1 },
    }]),
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      varying vec3 vW, vN, vV;
      void main() {
        mat4 m = modelMatrix;
        #ifdef USE_INSTANCING
          m = modelMatrix * instanceMatrix;
        #endif
        vec4 w = m * vec4(position, 1.0);
        vW = w.xyz;
        vN = normalize(mat3(m) * normal);
        vV = normalize(cameraPosition - w.xyz);
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform vec3 uColorA, uColorB;
      uniform vec4 uTex, uLook;
      uniform float uTime, uOpacity, uLeave;
      varying vec3 vW, vN, vV;
      ${SURFACE_GLSL}
      void main() {
        vec3 N = normalize(vN), V = normalize(vV);
        float seed = sHash(floor(vW * 1.6));
        float pat = classPattern(vW, uTex, uLook, seed, uTime);
        // faceted classes read their faces: tops lighter than walls
        pat = mix(pat, 0.35 + 0.65 * clamp(N.y, 0.0, 1.0), uLook.w * 0.6);
        vec3 base = mix(uColorB, uColorA, pat);
        vec3 L1 = normalize(vec3(-0.5, 0.8, 0.6)), L2 = normalize(vec3(0.7, 0.3, -0.5));
        float diff = 0.42 + 0.5 * max(dot(N, L1), 0.0) + 0.18 * max(dot(N, L2), 0.0);
        vec3 H = normalize(L1 + V);
        float spec = pow(max(dot(N, H), 0.0), mix(8.0, 70.0, uLook.z)) * mix(0.06, 0.7, uLook.z);
        float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0) * 0.25;
        gl_FragColor = vec4(base * diff + spec + fres * uColorA, uOpacity * uLeave);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    transparent: true,
    fog: true,
  });
}

// Sheet material system.
//
// Each class is printed onto a clear acrylic carrier. The print is lit from the table below, so
// its shading is driven by a "glow" term (how much table light reaches the sheet, which falls off
// as the sheet is lifted) rather than by scene lights. Each class has a quiet surface pattern
// that refers to what it is (moving water, mottled mud, fine sediment grain, clustered canopy...)
// without changing its colour or outline. Colours are the exact research palette.
import * as THREE from 'three';

export const PATTERN = {
  water: 0, muddy_shallows: 1, bed_ground: 2, mangrove_canopy: 3, tree_cover: 4, track: 5,
};

const printVertex = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  varying vec2 vMap;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vMap = vec2(position.x, -position.z);   // east, north in metres (sheet space)
    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const printFragment = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uGlow;
  uniform float uHighlight;
  uniform float uTime;
  uniform int uPattern;
  varying vec2 vMap;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
  float cells(vec2 p) {
    vec2 i = floor(p), f = fract(p); float d = 1.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(x, y); vec2 o = vec2(hash(i + g), hash(i + g + 7.3));
      d = min(d, length(g + o - f));
    }
    return d;
  }

  void main() {
    vec2 p = vMap;
    float tone = 0.0;
    if (uPattern == 0) {          // water: slow, faint ripple bands
      float r = fbm(p * 0.05 + vec2(uTime * 0.02, -uTime * 0.014));
      tone = 0.035 * sin(r * 22.0 + uTime * 0.5) + 0.025 * (fbm(p * 0.3 - uTime * 0.03) - 0.5);
    } else if (uPattern == 1) {   // muddy shallows: soft mottling
      tone = 0.16 * (fbm(p * 0.12) - 0.5);
    } else if (uPattern == 2) {   // bed ground: fine sediment grain
      tone = 0.10 * (hash(floor(p * 3.0)) - 0.5) + 0.08 * (fbm(p * 0.2) - 0.5);
    } else if (uPattern == 3) {   // mangrove canopy: clustered crowns
      tone = 0.20 * (0.45 - cells(p * 0.45)) ;
    } else if (uPattern == 4) {   // tree cover: palm crowns, finer
      tone = 0.16 * (0.45 - cells(p * 0.7));
    } else if (uPattern == 5) {   // track: compacted strip, faint long grain
      tone = 0.06 * (fbm(vec2(p.x * 0.6, p.y * 0.08)) - 0.5);
    }
    vec3 lit = uColor * (0.80 + 0.32 * uGlow) + tone;
    lit = mix(lit, vec3(1.0), 0.18 * uHighlight);
    gl_FragColor = vec4(lit, uOpacity * (0.86 + 0.14 * uHighlight));
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

const srgb = (hex) => new THREE.Color(hex); // THREE.Color converts sRGB hex to linear working space

export function printMaterial(classKey, hex) {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uColor: { value: srgb(hex) },
        uOpacity: { value: 0 },
        uGlow: { value: 1 },
        uHighlight: { value: 0 },
        uTime: { value: 0 },
        uPattern: { value: PATTERN[classKey] ?? -1 },
      },
    ]),
    vertexShader: printVertex,
    fragmentShader: printFragment,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
  });
}

/** Crisp boundary of a printed class, slightly darker than its fill. */
export function outlineMaterial(hex) {
  const c = srgb(hex).multiplyScalar(0.62);
  return new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0, depthWrite: false, fog: true });
}

/** Clear acrylic carrier: low opacity, glossy, catches the environment on its surface. */
export function carrierMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: 0xf4f7f6,
    roughness: 0.16,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    envMapIntensity: 1.1,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

/** Acrylic edges read slightly green-grey, the way thick clear sheet does when seen edge-on. */
export function carrierEdgeMaterial() {
  return new THREE.LineBasicMaterial({ color: 0x6f8986, transparent: true, opacity: 0, depthWrite: false });
}

export function markerMaterial(hex) {
  return new THREE.MeshStandardMaterial({
    color: srgb(hex), emissive: srgb(hex), emissiveIntensity: 0.35, roughness: 0.45, metalness: 0,
    transparent: true, opacity: 0,
  });
}

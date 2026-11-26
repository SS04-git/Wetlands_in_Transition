// The estuary world: every map chapter is built here from the processed research data, in one
// scene and one coordinate frame (metres; x = east, y = up, z = -north).
//
//  ground        the 25 Feb 2025 screenshot resampled as coloured dots (arrival)
//  classes       the traced classes of 25 Feb 2025 (and 11 Apr 2011) as clustered dots, separable
//                into layers (the classes chapter and Map 1, which is drawn for 25 Feb 2025)
//  map1          (group name kept) the six dates compared in Map 3, as dotted landscapes on a ring
//  persistence   Map 2: per 1.5 m cell, one ball for every date the cell was traced as water,
//                mangrove canopy or exposed sediment - a count, never depth or elevation
//  stack         Map 3: all 17 dates stacked in date order, monsoon gaps as cloud between them
//  lived         Map 4: the shoreline elements of 2011 and 2025, one above the other
//  plan          Map 5: the Master Plan crop as a halftone dot sheet beside the traces, with
//                towers of the four planning shares (one ball = 1% of the planning area)
//  monsoon       Map 6: rainfall towers for the 17 observations around the estuary
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { dotMaterial, makeDots, makeColumns, paletteUniform, MAX_CLASSES } from './dots.js';
import { Blob } from './blobs.js';
import { CLASS_LOOK, lookUniforms, surfaceMaterial, RAIN_LOOK } from './classLook.js';
import { formatDate } from './data.js';
import { NOISE } from './glsl.js';

export const STACK_RANK = ['water', 'muddy_shallows', 'bed_ground', 'mangrove_canopy', 'land_edge',
  'tree_cover', 'track', 'buildings', 'cage_farms', 'boats'];
const LAYER_GAP = 16;
const MAP1_SCALE = 0.42, MAP1_RADIUS = 175;
const STACK_SCALE = 0.55, STACK_GAP = 34; // metres between observation layers when fully spread
const PLAN_OFFSET = -290; // the plan sits to the left of the ground, as in the printed Map 5
const TOWER_Z = 182;      // the plan's share towers stand in a row just south of the sheet
const WAFFLE_Z = 330;     // the 100-square grid of the plan's labels, south of the sheet
const RAIN_RADIUS = 175;
export const PLAN_COLOURS = ['#D98C7A', '#BFD58A', '#8FB8A8', '#8EC9E0']; // swatches from the Map 5 script

// The classes each printed map draws (from its legend and the KML layers it uses). A map shows only
// these; the classes chapter and the finale show all ten.
export const LAND_COLOUR = '#8E806C'; // derived 'land' category of the model chapter

export const MAP_CLASSES = {
  map1: ['water', 'muddy_shallows', 'bed_ground', 'mangrove_canopy', 'land_edge', 'boats', 'cage_farms'],
  map3: ['water', 'muddy_shallows', 'bed_ground', 'mangrove_canopy', 'land_edge', 'boats', 'cage_farms'],
  map4: ['water', 'muddy_shallows', 'bed_ground', 'tree_cover', 'track', 'buildings', 'boats', 'cage_farms'],
  map5: ['water', 'muddy_shallows', 'bed_ground', 'mangrove_canopy', 'land_edge', 'boats', 'cage_farms'],
  map6: ['water', 'muddy_shallows', 'bed_ground', 'mangrove_canopy', 'boats', 'cage_farms'],
};
// Map 4 layer order when its classes lift apart: the ground surfaces, then the track, the tree
// canopy, buildings, boats and cage farms.
const LIVED_RANK = { water: 0, muddy_shallows: 0, bed_ground: 0, track: 1, tree_cover: 2, buildings: 3, boats: 4, cage_farms: 5 };
const LIVED_GAP = 6, LIVED_DECK = 64, STRIP_NORTH = -5; // the shoreline strip of Map 4 (metres north)

export class Estuary {
  constructor(data) {
    this.data = data;
    const { manifest } = data;
    this.classes = manifest.classes;
    this.idx = Object.fromEntries(this.classes.map((c, i) => [c.key, i]));
    this.palette = paletteUniform(this.classes, CLASS_LOOK);
    this.palette[10] = new THREE.Color(LAND_COLOUR); // 'land' beyond the traced land edge (model chapter)
    this.look = lookUniforms(this.classes);
    this.classAlpha = new Array(MAX_CLASSES).fill(1); // eases towards the map's own classes
    this.surfaces = [];
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x0d2c3b, 0.0005);
    this.camera = new THREE.PerspectiveCamera(40, 1, 1, 8000);
    this.scene.add(this.camera);
    this.materials = [];
    this.groups = {};
    this.labels = [];

    this.buildDust();
    this.buildMotes();
    this.buildFlats();
    this.buildArrivalPulse();
    this.buildWaterlines();
    this.buildGround();
    this.buildClasses();
    this.buildMap1();
    this.buildPersistence();
    this.buildStack();
    this.buildLived();
    this.buildPlan();
    this.buildMonsoon();
    this.buildBlob();
    this.buildModel();
    this.buildTunnel();
    this.buildGroundShade();
  }

  mat(opts) { const m = dotMaterial(this.palette, { look: this.look, ...opts }); this.materials.push(m); return m; }
  surface(key, opts) { const m = surfaceMaterial(key, opts); this.surfaces.push(m); return m; }
  group(name) { const g = new THREE.Group(); g.name = name; this.scene.add(g); this.groups[name] = g; return g; }

  /** Levels so each class rises to its own layer when separated. */
  levels(sep, gap = LAYER_GAP) {
    const out = new Array(MAX_CLASSES).fill(0);
    STACK_RANK.forEach((k, r) => { out[this.idx[k]] = r * gap * sep; });
    return out;
  }

  /** The classes present on a traced date and shown by the current map, bottom to top. */
  shownKeys(setIndex, mapKey) {
    const own = MAP_CLASSES[mapKey];
    const present = this.classSets[setIndex].present;
    return STACK_RANK.filter((k) => present.has(this.idx[k]) && (!own || own.includes(k)));
  }
  /** Exploded layers: only the classes present and shown, evenly spaced (no empty gaps), each
   *  rising in turn from the bottom up as sep goes from 0 to 1. */
  compactLevels(keys, sep, gap = 24) {
    const out = new Array(MAX_CLASSES).fill(0);
    keys.forEach((k, r) => {
      const e = THREE.MathUtils.smoothstep(sep, r * 0.1, r * 0.1 + 0.55);
      out[this.idx[k]] = r * gap * e;
    });
    return out;
  }

  // Map 1's exploded view: a faint glass sheet with a glowing edge under each lifted layer, and
  // thin lines at the corners tying the sheets to the ground, like an architect's exploded drawing.
  buildSheets() {
    const g = this.groups.classes;
    const src = this.data.dots['2025_02_25'];
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let j = 0; j < src.n; j++) { const x = src.pos[3 * j], z = src.pos[3 * j + 2]; x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const pad = 5; x0 -= pad; x1 += pad; z0 -= pad; z1 += pad;
    this.sheetBox = { x0, x1, z0, z1 };
    const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const plane = new THREE.PlaneGeometry(w, d);
    const edges = new THREE.EdgesGeometry(plane);
    this.sheets = [];
    for (let r = 0; r < 8; r++) {
      const fillMat = new THREE.MeshBasicMaterial({ color: '#9fe3f2', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false });
      const edgeMat = new THREE.LineBasicMaterial({ color: '#c6f2fb', transparent: true, opacity: 0, depthWrite: false, fog: false });
      const fill = new THREE.Mesh(plane, fillMat), edge = new THREE.LineSegments(edges, edgeMat);
      fill.rotation.x = edge.rotation.x = -Math.PI / 2;
      const sheet = new THREE.Group();
      sheet.add(fill, edge);
      sheet.position.set(cx, 0, cz);
      sheet.visible = false;
      g.add(sheet);
      this.sheets.push({ sheet, fillMat, edgeMat });
    }
    // corner lines, from the ground to the top sheet
    const pts = [];
    for (const [x, z] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]) pts.push(x, 0, z, x, 1, z);
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.sheetPosts = new THREE.LineSegments(cg, new THREE.LineDashedMaterial({ color: '#c6f2fb', dashSize: 3, gapSize: 3, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    this.sheetPosts.computeLineDistances();
    this.sheetPosts.visible = false;
    g.add(this.sheetPosts);
  }
  /** World position for the name of sheet r: the middle of its west edge. */
  sheetAnchor(r, out = new THREE.Vector3()) {
    const s = this.sheets?.[r];
    if (!s || !this.sheetBox) return null;
    return out.set(this.sheetBox.x0, s.sheet.position.y, (this.sheetBox.z0 + this.sheetBox.z1) / 2).applyMatrix4(this.groups.classes.matrixWorld);
  }

  buildGround() {
    const g = this.group('ground');
    this.groundMat = this.mat({ rgb: true, size: 1.0, gain: 1.7 });
    g.add(makeDots(this.data.sat['2025_02_25'], this.groundMat));
  }

  buildClasses() {
    // Two traced dates: 25 Feb 2025 (the arrival date) and 11 Apr 2011, which is the only hero
    // date with bed ground and muddy shallows traced. The classes chapter shows whichever date
    // the class in focus was measured on.
    const g = this.group('classes');
    this.classSets = ['2025_02_25', '2011_04_11'].map((id) => {
      const m = this.mat({ size: 0.95, bob: 0.25 });
      const size = m.uniforms.uClassSize.value;
      size[this.idx.boats] = 3.4; size[this.idx.cage_farms] = 3.8; size[this.idx.buildings] = 3.6; size[this.idx.land_edge] = 1.2;
      const pts = makeDots(this.data.dots[id], m, { yOffset: 0.6 });
      // living water: the water and muddy shallows swell gently, boats bob, cage farms sway a little
      const wave = m.uniforms.uClassWave.value, bob = m.uniforms.uClassBob.value;
      wave[this.idx.water] = 0.9; wave[this.idx.muddy_shallows] = 0.35;
      bob[this.idx.boats] = 0.9; bob[this.idx.cage_farms] = 0.45;
      g.add(pts);
      const present = new Set(this.data.dots[id].cls);   // the classes traced on this date
      return { id, m, pts, present };
    });
    this.classMat = this.classSets[0].m;
    this.buildSheets();
  }

  buildDust() {
    // Faint star dust far beyond the estuary: the cosmic depth of the opening carried into the maps.
    const n = 2600, pos = new Float32Array(3 * n), seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = 1700 + Math.random() * 1600, s = Math.sqrt(1 - u * u);
      pos.set([r * s * Math.cos(a), r * Math.abs(u) * 0.9 - 200, r * s * Math.sin(a)], 3 * i);
      seed[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.dust = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uPR: { value: 1 } },
      vertexShader: `attribute float aSeed; uniform float uTime, uPR; varying float vA;
        void main(){ vA = 0.45 + 0.55 * sin(uTime * (0.6 + aSeed) + aSeed * 40.0);
          gl_PointSize = (0.8 + 2.2 * pow(aSeed, 5.0)) * uPR; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform float uOpacity; varying float vA;
        void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
          gl_FragColor = vec4(vec3(0.78, 0.88, 1.0), (1.0 - smoothstep(0.0, 0.5, d)) * vA * uOpacity); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    }));
    this.dust.frustumCulled = false;
    this.dust.renderOrder = -1;
    this.scene.add(this.dust);
  }

  // ---------- The flats around the maps: an imagined tide ----------
  // Below every map lies a wide estuary of sand and mud banks cut by channels, and a slow tide
  // rises and falls over it, so the line between water and land keeps creeping back and forth.
  // It is not data: it carries the project's point (the edge is not a fixed line) into the
  // surroundings. The banks are baked once into a height texture (bakeFlats); every frame only
  // the tide level moves. Dim and muted, darker under the maps, fading into the horizon haze.
  buildFlats() {
    const m = new THREE.ShaderMaterial({
      uniforms: { uH: { value: null }, uTime: { value: 0 }, uOpacity: { value: 0 }, uTide: { value: 0.5 } },
      vertexShader: `varying vec2 vUv; varying vec3 vW;
        void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform sampler2D uH; uniform float uTime, uOpacity, uTide; varying vec2 vUv; varying vec3 vW;
        void main(){
          float h = texture2D(uH, vUv).r;
          // the study area sits in open water: the banks fall away under the maps
          float r = length(vW.xz);
          h -= 0.28 * (1.0 - smoothstep(380.0, 1000.0, r));
          float tide = uTide;
          float wet = smoothstep(tide + 0.012, tide - 0.012, h);
          float deep = smoothstep(tide - 0.02, tide - 0.3, h);
          vec3 water = mix(vec3(0.07, 0.24, 0.30), vec3(0.02, 0.09, 0.13), deep);
          // the banks: low mud is olive, higher ground is marsh grass and, highest, a darker fringe
          // of mangrove, so the land around the maps reads green rather than grey
          float rise = smoothstep(tide, tide + 0.35, h);
          vec3 bank = mix(vec3(0.12, 0.27, 0.18), vec3(0.19, 0.38, 0.20), rise);
          float grove = smoothstep(tide + 0.16, tide + 0.3, h) * (0.7 + 0.3 * sin(vW.x * 0.045 + sin(vW.z * 0.03) * 2.0) * sin(vW.z * 0.052));
          bank = mix(bank, vec3(0.07, 0.24, 0.13), grove * 0.75);
          // just-uncovered ground stays darker and glossy for a while, like wet mud
          bank = mix(vec3(0.08, 0.18, 0.14), bank, smoothstep(tide, tide + 0.06, h));
          // the open water around the maps, drawn like a chart: faint depth contours following the
          // shape of the bed, and soft ripples of light moving over it
          float hc = h * 22.0;
          float gc = fract(hc);
          float contour = 1.0 - smoothstep(0.0, fwidth(hc) * 1.4, min(gc, 1.0 - gc));
          water += vec3(0.30, 0.62, 0.66) * contour * 0.1 * (0.4 + 0.6 * deep);
          vec2 p = vW.xz * 0.012;
          vec2 q = p;
          float cs = 1.0;
          float tt = uTime * 0.09;
          for (int n = 0; n < 3; n++) {
            float tn = tt * (1.0 - 3.5 / float(n + 1));
            q = p + vec2(cos(tn - q.x) + sin(tn + q.y), sin(tn - q.y) + cos(tn + q.x));
            cs += 1.0 / length(vec2(p.x / (sin(q.x + tn) / 0.006), p.y / (cos(q.y + tn) / 0.006)));
          }
          cs /= 3.0;
          float caus = pow(clamp(1.17 - pow(cs, 1.4), 0.0, 1.0), 7.0);
          water += vec3(0.45, 0.80, 0.82) * caus * 0.26 * (1.0 - 0.6 * deep);
          vec3 col = mix(bank, water, wet);
          // the waterline: a thin, pale, softly moving edge where the tide meets the banks
          float line = exp(-abs(h - tide) * 160.0) * (0.75 + 0.25 * sin(uTime * 0.8 + vW.x * 0.02 + vW.z * 0.017));
          col += vec3(0.62, 0.86, 0.9) * line * 0.38;
          // fade into the distance and the horizon haze
          float dist = length(vW.xz - cameraPosition.xz);
          float a = uOpacity * (1.0 - smoothstep(1300.0, 3400.0, dist));
          gl_FragColor = vec4(col, a);
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, fog: false,
    });
    this.flats = new THREE.Mesh(new THREE.PlaneGeometry(7000, 7000), m);
    this.flats.rotation.x = -Math.PI / 2;
    this.flats.position.y = -40;
    this.flats.renderOrder = -3;
    this.flats.frustumCulled = false;
    this.flats.visible = false;
    this.scene.add(this.flats);
  }
  /** Bake the banks and channels of the flats once, on the GPU (soft fractal noise). */
  bakeFlats(renderer) {
    const rt = new THREE.WebGLRenderTarget(1024, 1024);
    const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `${NOISE}
        varying vec2 vUv;
        void main(){
          vec2 p = vUv * 9.0;
          float n = fbm(vec3(p, 3.1));
          // channels: long winding grooves where the water drains
          float ch = abs(snoise(vec3(p * 0.55 + vec2(n * 0.6), 7.7)));
          float h = 0.5 + 0.42 * n - 0.18 * (1.0 - smoothstep(0.0, 0.12, ch));
          gl_FragColor = vec4(h, h, h, 1.0);
        }`,
    })));
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(rt);
    renderer.render(scene, cam);
    renderer.setRenderTarget(prev);
    this.flats.material.uniforms.uH.value = rt.texture;
  }

  // ---------- Arrival: a 'you are here' pulse on the ground ----------
  buildArrivalPulse() {
    this.pulses = [0, 1, 2].map(() => {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.965, 1, 128), new THREE.MeshBasicMaterial({ color: '#bff1fb', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false, blending: THREE.AdditiveBlending }));
      m.rotation.x = -Math.PI / 2; m.position.y = 1.5; m.visible = false;
      this.scene.add(m);
      return m;
    });
  }

  // ---------- Conclusion: the waterline of each of the 17 dates ----------
  // For every date, the edge of the traced water: the water dots that have a non-water neighbour
  // on the 1.5 m grid (the edge of the study frame is not counted). Drawn on one ground, from the
  // earliest date (warm) to the latest (blue), they never lie in the same place.
  buildWaterlines() {
    const dates = this.data.manifest.dates, wi = this.idx.water, step = 1.5;
    const warm = new THREE.Color('#e7b06a'), cool = new THREE.Color('#8fdcef'), col = new THREE.Color();
    const pos = [], rgb = [], ord = [];
    this.waterlineAt = [];
    dates.forEach((d, i) => {
      const src = this.data.dots[d.id];
      const all = new Set(), water = new Set();
      const key = (x, z) => `${Math.round(x / step)},${Math.round(z / step)}`;
      for (let j = 0; j < src.n; j++) { const k = key(src.pos[3 * j], src.pos[3 * j + 2]); all.add(k); if (src.cls[j] === wi) water.add(k); }
      col.copy(warm).lerp(cool, i / (dates.length - 1));
      let sx = 0, sz = 0, n = 0;
      for (const k of water) {
        const [gx, gz] = k.split(',').map(Number);
        const nb = [`${gx + 1},${gz}`, `${gx - 1},${gz}`, `${gx},${gz + 1}`, `${gx},${gz - 1}`];
        if (nb.some((q) => all.has(q) && !water.has(q))) {
          pos.push(gx * step, 2.2 + i * 0.12, gz * step);
          rgb.push(col.r, col.g, col.b); ord.push(i);
          sx += gx * step; sz += gz * step; n++;
        }
      }
      this.waterlineAt.push(n ? new THREE.Vector3(sx / n, 2.2, sz / n) : new THREE.Vector3());
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aCol', new THREE.Float32BufferAttribute(rgb, 3));
    g.setAttribute('aOrd', new THREE.Float32BufferAttribute(ord, 1));
    this.waterlines = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uOpacity: { value: 0 }, uPR: { value: 1 } },
      vertexShader: `attribute vec3 aCol; attribute float aOrd; uniform float uT, uPR; varying vec3 vC; varying float vA;
        void main(){ vC = aCol; float on = clamp(uT - aOrd, 0.0, 1.0); float newest = 1.0 - clamp(uT - aOrd - 1.0, 0.0, 1.0);
          vA = on * (0.3 + 0.7 * newest);
          vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
          gl_PointSize = on * clamp((3.4 + 2.4 * newest) * uPR * (700.0 / -mv.z), 1.6, 14.0); }`,
      fragmentShader: `uniform float uOpacity; varying vec3 vC; varying float vA;
        void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
          gl_FragColor = vec4(vC, (1.0 - smoothstep(0.2, 0.5, d)) * vA * uOpacity);
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
    }));
    this.waterlines.frustumCulled = false;
    this.waterlines.visible = false;
    this.scene.add(this.waterlines);
  }
  /** World position of the newest waterline drawn so far, for its label. */
  waterlineAnchor(S, out = new THREE.Vector3()) {
    const i = Math.min(this.waterlineAt.length - 1, Math.max(0, Math.ceil((S.edgesT ?? 0) - 1)));
    if ((S.edges ?? 0) < 0.5 || (S.edgesT ?? 0) < 0.3) return null;
    return out.copy(this.waterlineAt[i]);
  }

  buildMotes() {
    // Soft specks drifting slowly in the air around the estuary, like dust or spray caught in
    // light. They are kept in a wide ring well away from the maps, so they give depth and slow
    // movement to the surroundings without crossing what is being read.
    const n = 520, pos = new Float32Array(3 * n), seed = new Float32Array(4 * n);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = 420 + Math.pow(Math.random(), 0.7) * 900;
      pos.set([Math.cos(a) * r, -30 + Math.random() * 420, Math.sin(a) * r], 3 * i);
      seed.set([Math.random(), Math.random(), Math.random(), Math.random()], 4 * i);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    this.motes = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uPR: { value: 1 } },
      vertexShader: `attribute vec4 aSeed; uniform float uTime, uPR; varying float vA; varying float vWarm;
        void main(){
          vec3 p = position;
          p.x += sin(uTime * (0.05 + 0.05 * aSeed.x) + aSeed.y * 30.0) * 26.0;
          p.y += sin(uTime * (0.04 + 0.04 * aSeed.z) + aSeed.w * 30.0) * 14.0;
          p.z += cos(uTime * (0.05 + 0.04 * aSeed.y) + aSeed.x * 30.0) * 26.0;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vA = (0.35 + 0.65 * aSeed.z) * (0.6 + 0.4 * sin(uTime * (0.3 + aSeed.w) + aSeed.x * 20.0));
          vWarm = aSeed.w;
          gl_PointSize = clamp((2.0 + 5.0 * aSeed.y) * uPR * (700.0 / -mv.z), 1.0, 14.0);
          gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uOpacity; varying float vA; varying float vWarm;
        void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
          vec3 c = mix(vec3(0.72, 0.9, 0.96), vec3(0.95, 0.93, 0.84), step(0.8, vWarm));
          gl_FragColor = vec4(c, pow(1.0 - d * 2.0, 2.0) * vA * uOpacity); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    }));
    this.motes.frustumCulled = false;
    this.scene.add(this.motes);
  }

  buildMap1() {
    const g = this.group('map1');
    this.map1 = this.data.points.map1_dates.map((id, i) => {
      const plate = new THREE.Group();
      const m = this.mat({ size: 1.05, bob: 0.2 });
      const s = m.uniforms.uClassSize.value;
      s[this.idx.boats] = 3.2; s[this.idx.cage_farms] = 3.4; s[this.idx.buildings] = 3.2;
      plate.add(makeDots(this.data.dots[id], m));
      plate.scale.setScalar(MAP1_SCALE);
      const a = (i / 6) * Math.PI * 2;
      plate.position.set(Math.sin(a) * MAP1_RADIUS, 0, Math.cos(a) * MAP1_RADIUS);
      plate.userData = { id, angle: a, material: m };
      g.add(plate);
      this.addLabel(plate, id, 'map1');
      return plate;
    });
  }

  buildPersistence() {
    const g = this.group('persistence');
    const P = this.data.persistence;
    const mk = (counts, cls) => {
      const col = makeColumns(P.pos, counts, { step: 1.15, cls });
      const m = this.mat({ size: 0.85, ramp: true });
      const pts = makeDots({ n: col.n, pos: col.pos, cls: col.cls }, m);
      // aValue = how many dates the whole column counts (for the threshold view)
      const v = new Float32Array(col.n);
      for (let i = 0; i < col.n; i++) v[i] = counts[col.owner[i]];
      pts.geometry.setAttribute('aValue', new THREE.BufferAttribute(v, 1));
      pts.scale.y = 1;
      g.add(pts);
      return { pts, m, col };
    };
    this.persWater = mk(P.water, this.idx.water);
    this.persMangrove = mk(P.mangrove, this.idx.mangrove_canopy);
    this.persBed = mk(P.bed, this.idx.bed_ground); // Map 2's third panel: exposed sediment frequency
    // where the mangrove canopy was traced most often (count-weighted centre), for the camera
    let sx = 0, sz = 0, sw = 0;
    for (let i = 0; i < P.n; i++) { const w = P.mangrove[i]; sx += P.pos[3 * i] * w; sz += P.pos[3 * i + 2] * w; sw += w; }
    this.mangroveCentre = sw ? { x: sx / sw, z: sz / sw } : { x: 0, z: 0 };
    // area for each threshold k (cells with water count >= k) x 2.25 m2, from the actual grid
    this.waterAreaByK = this.data.points.persistence.water_area_by_threshold_m2;
  }

  buildStack() {
    // Seventeen observations, evenly spaced (so each one can be read) and in date order. The
    // calendar gap is shown instead by cloud: where a June-September monsoon falls between two
    // observations, a band of cloud dots sits in the space between those two layers.
    const g = this.group('stack');
    const dates = this.data.manifest.dates;
    this.stackLayers = dates.map((d, i) => {
      const m = this.mat({ size: 0.8 });
      const s = m.uniforms.uClassSize.value; s[this.idx.boats] = 2.4; s[this.idx.cage_farms] = 2.6; s[this.idx.buildings] = 2.4;
      const src = this.data.dots[d.id];
      const pts = makeDots(src, m);
      // label anchor: just beyond the eastern edge of this date's traces
      let maxX = -Infinity;
      for (let j = 0; j < src.n; j++) maxX = Math.max(maxX, src.pos[3 * j]);
      const layer = new THREE.Group();
      layer.add(pts);
      layer.scale.setScalar(STACK_SCALE);
      layer.position.y = i * STACK_GAP;
      layer.userData = { id: d.id, iso: d.iso, material: m, baseY: i * STACK_GAP, anchor: new THREE.Vector3(maxX + 10, 0, 0) };
      // the slide: a faint pane under the layer and a lit outline, shown only on the date in focus
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (let j = 0; j < src.n; j++) { const x = src.pos[3 * j], z = src.pos[3 * j + 2]; x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      const pad = 6, w = x1 - x0 + 2 * pad, h = z1 - z0 + 2 * pad;
      const paneMat = new THREE.MeshBasicMaterial({ color: '#9fe3f2', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false });
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), paneMat);
      pane.rotation.x = -Math.PI / 2; pane.position.set((x0 + x1) / 2, -1.5, (z0 + z1) / 2);
      const edgeMat = new THREE.LineBasicMaterial({ color: '#bff1fb', transparent: true, opacity: 0, depthWrite: false, fog: false });
      const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(w, h)), edgeMat);
      edge.rotation.x = -Math.PI / 2; edge.position.copy(pane.position);
      layer.add(pane, edge);
      Object.assign(layer.userData, { paneMat, edgeMat });
      g.add(layer);
      this.addLabel(layer, d.id, 'stack');
      // the six dates the printed Map 3 compares are marked on their labels
      if (this.data.points.map1_dates.includes(d.id)) this.labels.at(-1).el.classList.add('is-key');
      return layer;
    });
    this.stackHeight = (dates.length - 1) * STACK_GAP;
    const cloud = [];
    this.monsoonGaps = [];
    for (let i = 0; i < dates.length - 1; i++) {
      const a = new Date(`${dates[i].iso}T00:00:00Z`), b = new Date(`${dates[i + 1].iso}T00:00:00Z`);
      let monsoons = 0;
      for (let yr = a.getUTCFullYear(); yr <= b.getUTCFullYear(); yr++) {
        const start = Date.UTC(yr, 5, 1), end = Date.UTC(yr, 8, 30);
        if (start > a.getTime() && end < b.getTime()) monsoons++;
      }
      if (!monsoons) continue;
      this.monsoonGaps.push({ after: i, monsoons });
      const y0 = i * STACK_GAP + STACK_GAP * 0.28, y1 = i * STACK_GAP + STACK_GAP * 0.72;
      for (let k = 0; k < 900 * monsoons; k++) {
        const r = Math.sqrt(Math.random()) * 70, t = Math.random() * Math.PI * 2;
        cloud.push(Math.cos(t) * r, y0 + Math.random() * (y1 - y0), Math.sin(t) * r * 0.78);
      }
    }
    const n = cloud.length / 3;
    const cm = this.mat({ rgb: true, size: 1.5 });
    const rgb = new Uint8Array(3 * n).fill(226);
    this.stackCloud = new THREE.Group();
    this.stackCloud.add(makeDots({ n, pos: Float32Array.from(cloud), cls: new Uint8Array(n), rgb }, cm));
    g.add(this.stackCloud);
    this.monsoonCloudMat = cm;
  }

  buildLived() {
    // Map 4 as a lived landscape. Each year is a shoreline strip: the Google Earth image of that
    // date lies underneath at reduced strength (approximately registered, see manifest imagery),
    // the water, muddy shallows and bed ground are dots, and the human and vegetated elements are
    // built: the track as a raised slab from its traced polygon, tree cover as a canopy of crowns,
    // and buildings, boats and cage farms as recognisable forms at their traced points.
    // Buildings, boats and cage farms were traced as points, so their forms are symbols at an
    // indicative size and orientation, not measured outlines.
    const g = this.group('lived');
    const loader = new THREE.TextureLoader();
    const base = `${import.meta.env.BASE_URL}data/`;
    this.lived = ['2011_04_11', '2025_02_25'].map((id, i) => {
      const deck = new THREE.Group();
      deck.position.y = i * LIVED_DECK;
      const layers = {}; // class key -> Group that rises when the classes separate
      const layer = (key) => {
        if (!layers[key]) { const l = new THREE.Group(); l.userData.key = key; deck.add(l); layers[key] = l; }
        return layers[key];
      };

      // satellite reference underneath
      const meta = this.data.manifest.dates.find((d) => d.id === id).imagery;
      const sat = this.satellitePlane(loader.load(base + meta.file), meta.corners);
      deck.add(sat);

      // surfaces and tree canopy as dots, cropped to the shoreline strip
      const src = this.data.dots[id];
      const keep = new Set(['water', 'muddy_shallows', 'bed_ground', 'tree_cover'].map((k) => this.idx[k]));
      const sel = [];
      for (let j = 0; j < src.n; j++) if (keep.has(src.cls[j]) && -src.pos[3 * j + 2] <= STRIP_NORTH) sel.push(j);
      const pos = new Float32Array(3 * sel.length), cls = new Uint8Array(sel.length);
      sel.forEach((j, k) => { pos.set(src.pos.subarray(3 * j, 3 * j + 3), 3 * k); cls[k] = src.cls[j]; });
      const m = this.mat({ size: 0.75, bob: 0.08 });
      m.uniforms.uClassSize.value[this.idx.tree_cover] = 2.3;   // crowns read as a canopy, not a flat patch
      m.uniforms.uClassLift.value[this.idx.tree_cover] = 7.5;
      deck.add(makeDots({ n: sel.length, pos, cls }, m));

      // the track: a raised slab extruded from its traced polygon(s)
      const F = this.data.features[id].classes;
      const trackGeo = this.extrudeRings(F.track ?? [], 0.9);
      if (trackGeo) layer('track').add(new THREE.Mesh(trackGeo, this.surface('track')));

      // point classes as forms (orientation of the boats is indicative; only their positions were traced)
      const pts = (k) => (F[k] ?? []).map((f) => f.coord);
      layer('buildings').add(this.instanced(this.houseGeometry(), this.surface('buildings'), pts('buildings')));
      layer('boats').add(this.instanced(this.boatGeometry(), this.surface('boats'), pts('boats'), { y: 0.1, yaw: 0.65 }));
      layer('cage_farms').add(this.instanced(this.cageGeometry(), this.surface('cage_farms'), pts('cage_farms')));

      deck.userData = { id, material: m, layers, sat };
      g.add(deck);
      this.addLabel({ getWorldPosition: (v) => deck.localToWorld(v.set(78, 12, 62)) }, id, 'lived');
      return deck;
    });
  }

  /** Map 4 dot levels: ground surfaces stay down, the tree canopy rises to its own layer. */
  livedLevelsFor(sep) {
    const out = new Array(MAX_CLASSES).fill(0);
    for (const [k, r] of Object.entries(LIVED_RANK)) out[this.idx[k]] = r * LIVED_GAP * sep;
    return out;
  }

  satellitePlane(tex, corners) {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    // corners: [east, north] metres of the image's top-left, top-right, bottom-right, bottom-left
    const P = corners.map(([e, n]) => [e, -0.6, -n]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([...P[3], ...P[2], ...P[1], ...P[0]], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uMap: { value: null }, uOpacity: { value: 0 }, uNorth: { value: STRIP_NORTH }, uLeave: { value: 1 } }]),
      vertexShader: /* glsl */ `
        #include <common>
        #include <fog_pars_vertex>
        varying vec2 vUv; varying float vNorth;
        void main() {
          vUv = uv; vNorth = -position.z;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        #include <common>
        #include <fog_pars_fragment>
        uniform sampler2D uMap; uniform float uOpacity, uNorth, uLeave;
        varying vec2 vUv; varying float vNorth;
        void main() {
          if (vNorth > uNorth) discard;
          vec3 c = texture2D(uMap, vUv).rgb;
          float l = dot(c, vec3(0.3, 0.59, 0.11));
          c = mix(vec3(l), c, 0.75) * 0.85;                       // a reference, quieter than the traces
          float edge = smoothstep(uNorth, uNorth - 10.0, vNorth);  // soft northern edge of the strip
          gl_FragColor = vec4(c, uOpacity * edge * uLeave);
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
      transparent: true, depthWrite: false, fog: true,
    });
    mat.uniforms.uMap.value = tex;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = -1;
    return mesh;
  }

  /** Extrude traced polygon rings ([east, north]; first ring outer, the rest holes) into a slab. */
  extrudeRings(features, depth) {
    const geos = [];
    for (const f of features) {
      const [outer, ...holes] = f.rings;
      const shape = new THREE.Shape(outer.map(([e, n]) => new THREE.Vector2(e, n)));
      holes.forEach((h) => shape.holes.push(new THREE.Path(h.map(([e, n]) => new THREE.Vector2(e, n)))));
      const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.25, bevelSize: 0.25, bevelSegments: 1, curveSegments: 1 });
      geo.rotateX(-Math.PI / 2); // shape (east, north) -> scene (x, -z); extrusion -> up
      geos.push(geo);
    }
    if (!geos.length) return null;
    return geos.length === 1 ? geos[0] : mergeGeometries(geos);
  }

  instanced(geo, mat, coords, { yaw = 0, y = 0 } = {}) {
    const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, coords.length));
    const o = new THREE.Object3D();
    coords.forEach(([e, n], k) => { o.position.set(e, y, -n); o.rotation.set(0, yaw, 0); o.updateMatrix(); mesh.setMatrixAt(k, o.matrix); });
    mesh.count = coords.length;
    mesh.frustumCulled = false;
    return mesh;
  }

  houseGeometry() {
    // a small house: walls and a pitched roof (indicative size, about 5 x 5 m)
    const walls = new THREE.BoxGeometry(5, 3.2, 5).translate(0, 1.6, 0);
    const roof = new THREE.CylinderGeometry(0, 4.1, 2.2, 4, 1).rotateY(Math.PI / 4).translate(0, 4.3, 0);
    return mergeGeometries([walls.toNonIndexed(), roof.toNonIndexed()]);
  }

  boatGeometry() {
    // a beached fishing boat: a pointed hull lying across the shore, about 7.5 x 1.8 m
    const s = new THREE.Shape();
    s.moveTo(0, -3.8);
    s.quadraticCurveTo(1.25, -1.6, 1.1, 1.2); s.quadraticCurveTo(0.85, 3.0, 0, 3.7);
    s.quadraticCurveTo(-0.85, 3.0, -1.1, 1.2); s.quadraticCurveTo(-1.25, -1.6, 0, -3.8);
    const hull = new THREE.ExtrudeGeometry(s, { depth: 0.7, bevelEnabled: true, bevelThickness: 0.25, bevelSize: 0.15, bevelSegments: 2, curveSegments: 8 });
    hull.rotateX(-Math.PI / 2);
    // sheer: bow and stern rise above the middle of the hull, as on the beached fishing boats
    const P = hull.attributes.position;
    for (let i = 0; i < P.count; i++) {
      const y = P.getY(i), z = P.getZ(i);
      if (y > 0.3) P.setY(i, y + 0.35 * Math.pow(Math.abs(z) / 3.8, 3));
    }
    hull.computeVertexNormals();
    return hull;
  }

  cageGeometry() {
    // a cage-farm marker as the research describes it: long rods standing in the water around a
    // square of floats (thermocol), about 4 x 4 m
    const parts = [];
    for (const [x, z] of [[-2, -2], [2, -2], [2, 2], [-2, 2], [0, 0]]) {
      parts.push(new THREE.CylinderGeometry(0.09, 0.12, 6.0, 5).translate(x, 2.4, z).toNonIndexed());
    }
    for (const [x, z, w, d] of [[0, -2, 4.4, 0.7], [0, 2, 4.4, 0.7], [-2, 0, 0.7, 4.4], [2, 0, 0.7, 4.4]]) {
      parts.push(new THREE.BoxGeometry(w, 0.45, d).translate(x, 0.2, z).toNonIndexed());
    }
    return mergeGeometries(parts);
  }

  buildPlan() {
    const g = this.group('plan');
    const P = this.data.plan;
    const m = this.mat({ rgb: true, size: 1.1, flat: true });
    const sheet = makeDots(P, m);
    sheet.scale.set(5.5, 1, 5.5); // crop is ~433 x 538 px; stored /10 -> ~240 x 296 m on screen, NOT to map scale
    const holder = new THREE.Group();
    holder.add(sheet);
    holder.position.set(PLAN_OFFSET, 0, 0);
    g.add(holder);
    this.planSheet = holder;
    this.planMat = m;
    // The study area on the plan, as the printed Map 5 marks it: a red box. Measured on the same
    // Master Plan crop (kundapur_masterplan_crop_3.png): x 127-225 px, y 142-213 px of 433 x 538.
    // Sheet coordinates are (px - 216.5) / 10 and (py - 269) / 10, then the sheet's 5.5 scale.
    const px = (x) => ((x - 216.5) / 10) * 5.5, pz = (y) => ((y - 269) / 10) * 5.5;
    const bx0 = px(127), bx1 = px(225), bz0 = pz(142), bz1 = pz(213);
    const bw = bx1 - bx0, bd = bz1 - bz0, bcx = (bx0 + bx1) / 2, bcz = (bz0 + bz1) / 2;
    const fillMat = new THREE.MeshBasicMaterial({ color: '#f3cac4', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(bw, bd), fillMat);
    fill.rotation.x = -Math.PI / 2; fill.position.set(bcx, 0.8, bcz);
    const lineMat = new THREE.MeshBasicMaterial({ color: '#e8322b', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const frame = new THREE.Group();
    const T = 1.6; // frame thickness, metres on screen
    [[bw + T, T, 0, -bd / 2], [bw + T, T, 0, bd / 2], [T, bd + T, -bw / 2, 0], [T, bd + T, bw / 2, 0]].forEach(([w, d, x, z]) => {
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lineMat);
      bar.rotation.x = -Math.PI / 2; bar.position.set(bcx + x, 1.0, bcz + z);
      frame.add(bar);
    });
    holder.add(fill, frame);
    this.planBox = { fillMat, lineMat };
    this.planBoxCentre = { x: PLAN_OFFSET + bcx, z: bcz };
    // The plan's own dots inside the box, as a separate piece that can be lifted out, carried
    // along the arc and laid over the traced ground (Map 5, "Plan above, ground below").
    const inside = [];
    for (let j = 0; j < P.n; j++) {
      const qx = P.pos[3 * j] * 10 + 216.5, qy = P.pos[3 * j + 2] * 10 + 269;
      if (qx >= 127 && qx <= 225 && qy >= 142 && qy <= 213) inside.push(j);
    }
    const ux = bcx / 5.5, uz = bcz / 5.5; // box centre in sheet units
    const ppos = new Float32Array(3 * inside.length), prgb = new Uint8Array(3 * inside.length);
    inside.forEach((j, k) => {
      ppos.set([P.pos[3 * j] - ux, 0, P.pos[3 * j + 2] - uz], 3 * k);
      prgb.set(P.rgb.subarray(3 * j, 3 * j + 3), 3 * k);
    });
    this.patchMat = this.mat({ rgb: true, size: 1.1, flat: true });
    this.planPatch = new THREE.Group();
    this.planPatch.add(makeDots({ n: inside.length, pos: ppos, cls: new Uint8Array(inside.length), rgb: prgb }, this.patchMat));
    this.planPatch.visible = false;
    g.add(this.planPatch);
    this.patchSize = { w: bw / 5.5, d: bd / 5.5 };
    // A dotted arc from the box on the plan to the traced ground: the same place, drawn twice.
    const a = new THREE.Vector3(PLAN_OFFSET + bcx, 2, bcz), b = new THREE.Vector3(0, 2, 0);
    const mid = a.clone().lerp(b, 0.5).setY(95);
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    const linkGeo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(90));
    const linkMat = new THREE.LineDashedMaterial({ color: '#ff8a80', dashSize: 6, gapSize: 4, transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.planLink = new THREE.Line(linkGeo, linkMat);
    this.planCurve = curve;
    this.planLink.computeLineDistances();
    g.add(this.planLink);
    // Towers of the four planning shares: one ball = 1% of the planning area.
    const cats = this.data.points.plan_categories;
    const pos = [], rgb = [];
    cats.forEach((c, ci) => {
      const balls = Math.max(1, Math.round(c.share));
      const col = new THREE.Color(PLAN_COLOURS[ci]);
      for (let b = 0; b < balls; b++) {
        const ring = b % 4, lvl = Math.floor(b / 4);
        // in a row just in front of the plan's near edge, so they stand clear of the sheet
        pos.push(PLAN_OFFSET - 96 + ci * 64 + (ring % 2) * 7, 4 + lvl * 7, TOWER_Z + Math.floor(ring / 2) * 7);
        rgb.push(col.r * 255, col.g * 255, col.b * 255);
      }
      this.addLabel({ position: new THREE.Vector3(PLAN_OFFSET - 96 + ci * 64 + 3.5, 4 + Math.ceil(balls / 4) * 7 + 9, TOWER_Z + 3.5) }, `${c.share}%`, 'plan', true);
    });
    const tm = this.mat({ rgb: true, size: 5.4 });
    const towers = makeDots({ n: pos.length / 3, pos: Float32Array.from(pos), cls: new Uint8Array(pos.length / 3), rgb: Uint8Array.from(rgb.map((v) => {
      // rgb was linear from THREE.Color; convert back to sRGB bytes
      const c = v / 255; return Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055));
    })) }, tm);
    g.add(towers);
    this.planTowerMat = tm;

    // The plan's four labels as 100 squares: the whole planning area cut into 100 equal squares,
    // each 1% of it, coloured by its label (shares rounded to whole squares, adding up to 100).
    // Laid out as a small model landscape about the size of the maps, each label drawn as what it
    // means: Developed Area as blocks of buildings of different heights, Agriculture Area as
    // furrowed fields, Water Sheet as water moving in slow waves, and the two Marshy Area squares,
    // the plan's only in-between label, slowly shifting between the green of land and the blue of
    // water. The squares drop into place one after another.
    {
      const raw = cats.map((c) => c.share);
      const n = raw.map((v) => Math.floor(v));
      let left = 100 - n.reduce((a, b) => a + b, 0);
      raw.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left > 0) { n[i]++; left--; } });
      this.waffleCounts = n;
      const N = 100, size = 19, step = 22, cx = PLAN_OFFSET, cz = WAFFLE_Z;
      this.waffleStep = step;
      const geo = new THREE.BoxGeometry(size, 1, size);
      geo.translate(0, 0.5, 0);
      const mat = new THREE.ShaderMaterial({
        uniforms: { uShow: { value: 0 }, uOpacity: { value: 0 }, uTime: { value: 0 }, uCols: { value: PLAN_COLOURS.map((c) => new THREE.Color(c)) } },
        vertexShader: /* glsl */ `
          attribute float aK; attribute float aCat;
          uniform float uShow, uTime;
          varying vec3 vN; varying float vRise; varying float vCat; varying vec3 vL; varying vec3 vW; varying float vH; varying float vSeed;
          float hash(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
          void main() {
            float seed = hash(aK + 1.0);
            // each square drops in from above, in turn, with a small settle
            float t0 = aK / 100.0 * 0.78;
            float k = clamp((uShow - t0) / 0.22, 0.0, 1.0);
            float km = k - 1.0;
            float drop = 1.0 + 2.2 * km * km * km + 1.2 * km * km;   // eases in and settles with a slight overshoot
            vRise = smoothstep(0.0, 0.25, k);
            vec4 wc = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
            float h;
            if (aCat < 0.5) h = 6.0 + 22.0 * seed * seed;                                       // buildings
            else if (aCat < 1.5) h = 2.4;                                                        // fields
            else if (aCat < 2.5) h = 3.0 + 1.4 * sin(uTime * 0.9);                               // marsh: rises and sinks
            else h = 1.6 + 0.9 * sin(uTime * 1.3 - wc.x * 0.05 - wc.z * 0.04);                   // water: slow waves across it
            vec3 p = position;
            p.y *= h;
            // buildings are narrower than their square, the rest fill it
            if (aCat < 0.5) p.xz *= 0.62 + 0.25 * hash(aK + 7.0);
            p.y += (1.0 - drop) * 90.0;
            vH = h; vN = normal; vCat = aCat; vL = p; vSeed = seed;
            vec4 w = modelMatrix * instanceMatrix * vec4(p, 1.0);
            vW = w.xyz;
            gl_Position = projectionMatrix * viewMatrix * w;
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uCols[4]; uniform float uOpacity, uTime;
          varying vec3 vN; varying float vRise; varying float vCat; varying vec3 vL; varying vec3 vW; varying float vH; varying float vSeed;
          void main() {
            vec3 c = uCols[int(vCat + 0.5)];
            bool top = vN.y > 0.5;
            float shade = top ? 1.0 : 0.6 + 0.22 * abs(vN.x);
            vec3 col = c;
            if (vCat < 0.5) {
              // rows of lit windows on the walls
              if (!top) {
                float win = step(0.45, fract(vL.y * 0.42)) * step(0.35, fract((vL.x + vL.z) * 0.45));
                col = mix(col * 0.85, vec3(1.0, 0.93, 0.78), win * 0.35);
              }
            } else if (vCat < 1.5) {
              // furrows across the field, alternating direction from square to square
              float dir = vSeed > 0.5 ? vL.x : vL.z;
              float f = 0.5 + 0.5 * sin(dir * 1.9);
              if (top) col = mix(col * 0.78, col * 1.08, f);
            } else if (vCat < 2.5) {
              // land green and water blue in turn, with a glow: the label that is neither
              float m = 0.5 + 0.5 * sin(uTime * 0.9);
              col = mix(vec3(0.55, 0.78, 0.45), vec3(0.45, 0.78, 0.92), m);
              col += vec3(0.25, 0.3, 0.28) * (0.5 + 0.5 * sin(uTime * 2.2));
            } else {
              // light glinting on the water
              if (top) { float g = pow(0.5 + 0.5 * sin(vW.x * 0.35 + uTime * 1.6) * sin(vW.z * 0.3 - uTime * 1.1), 6.0); col = mix(col, vec3(1.0), g * 0.5); }
            }
            col *= shade;
            // a fine dark edge round the top of each square, so the grid reads as 100 squares
            if (top) { vec2 e = abs(vL.xz) / 9.5; col *= mix(1.0, 0.7, smoothstep(0.86, 1.0, max(e.x, e.y))); }
            gl_FragColor = vec4(col, uOpacity * vRise);
            #include <colorspace_fragment>
          }`,
        transparent: true, depthWrite: true, fog: false,
      });
      const mesh = new THREE.InstancedMesh(geo, mat, N);
      const ks = new Float32Array(N), catA = new Float32Array(N), m4 = new THREE.Matrix4();
      const centres = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]], counts = [0, 0, 0, 0];
      let k = 0;
      n.forEach((cnt, ci) => {
        for (let j = 0; j < cnt; j++, k++) {
          const col = k % 10, row = Math.floor(k / 10);
          const x = cx + (col - 4.5) * step, z = cz + (row - 4.5) * step;
          m4.makeTranslation(x, 0, z);
          mesh.setMatrixAt(k, m4);
          ks[k] = k; catA[k] = ci;
          centres[ci][0] += x; centres[ci][2] += z; counts[ci]++;
        }
      });
      geo.setAttribute('aK', new THREE.InstancedBufferAttribute(ks, 1));
      geo.setAttribute('aCat', new THREE.InstancedBufferAttribute(catA, 1));
      mesh.frustumCulled = false;
      mesh.visible = false;
      g.add(mesh);
      this.waffle = mesh;
      this.waffleCentres = centres.map((c, i) => new THREE.Vector3(c[0] / Math.max(1, counts[i]), 0, c[2] / Math.max(1, counts[i])));
    }
  }

  buildMonsoon() {
    const g = this.group('monsoon');
    const dates = this.data.manifest.dates;
    const pos = [], rgb = [], tw = [];
    const hex = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b].map((v) => Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055))); };
    const mon = hex(RAIN_LOOK.monsoon), d30 = hex(RAIN_LOOK.prior30); // the two blues of the printed rainfall key
    this.rainTowers = dates.map((d, i) => {
      const a = -Math.PI * 0.9 + (i / (dates.length - 1)) * Math.PI * 1.8;
      const cx = Math.sin(a) * RAIN_RADIUS, cz = Math.cos(a) * RAIN_RADIUS;
      const m = Math.round(d.rainfall.monsoon_mm / 100), p = Math.round(d.rainfall.prior30_mm / 5);
      for (let b = 0; b < m; b++) { pos.push(cx - 3.6, 2 + b * 3.6, cz); rgb.push(...mon); tw.push(i); }
      for (let b = 0; b < p; b++) { pos.push(cx + 3.6, 2 + b * 3.6, cz); rgb.push(...d30); tw.push(i); }
      const anchor = { position: new THREE.Vector3(cx, 2 + Math.max(m, p) * 3.6 + 8, cz) };
      this.addLabel(anchor, d.id, 'monsoon');
      return { id: d.id, angle: a, x: cx, z: cz, monsoonBalls: m, priorBalls: p };
    });
    const n = pos.length / 3;
    this.rainMat = this.mat({ rgb: true, size: 5.6 });
    g.add(makeDots({ n, pos: Float32Array.from(pos), cls: Uint8Array.from(tw), rgb: Uint8Array.from(rgb) }, this.rainMat));
    // Rain falling over the estuary all through Map 6: heavier for a wetter monsoon before the
    // date in focus (2,272 to 3,848 mm), so the season the images cannot show is felt.
    const rn = 12000, rp = new Float32Array(3 * rn);
    for (let i = 0; i < rn; i++) rp.set([(Math.random() - 0.5) * 380, Math.random() * 220, (Math.random() - 0.5) * 330], 3 * i);
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    this.rain = new THREE.Points(rg, new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uDensity: { value: 0 }, uPR: { value: 1 } },
      vertexShader: `uniform float uTime, uDensity, uPR; varying float vA;
        void main(){ vec3 p = position; p.y = mod(p.y - uTime * 90.0, 220.0);
          float keep = step(fract(sin(dot(position.xz, vec2(12.9898,78.233)))*43758.5453), uDensity);
          vA = keep; vec4 mv = modelViewMatrix*vec4(p,1.); gl_Position = projectionMatrix*mv;
          gl_PointSize = keep * clamp(7.0 * uPR * (900.0 / -mv.z), 2.0, 26.0); }`,
      fragmentShader: `varying float vA; void main(){ vec2 q = gl_PointCoord - 0.5; if (abs(q.x) > 0.07) discard;
          gl_FragColor = vec4(0.82, 0.92, 1.0, vA * 0.42 * (1.0 - abs(q.y) * 2.0)); }`,
      transparent: true, depthWrite: false,
    }));
    this.rain.frustumCulled = false;
    g.add(this.rain);
  }

  buildBlob() {
    this.blob = new Blob({ presetKey: 'water', detail: 26 });   // about a third of the triangles, still smooth at this size
    this.blob.mesh.position.set(0, 0, -9);
    this.blob.mesh.scale.setScalar(1.5);
    this.blob.material.uniforms.uOpacity.value = 0;
    this.camera.add(this.blob.mesh);
  }

  // ---------- Tunnels made of the maps' own elements ----------
  // A fixed pool of particles. When a tunnel starts, each particle takes the world position and
  // colour of a dot of the map being left (sampled from whatever is on screen); it then moves into
  // the tunnel walls, which are laid out around the camera's line of sight so the visitor travels
  // through them, and finally settles on a dot of the map that follows (sampled once that map is
  // in place). Positions are mixed in view space, so the tunnel stays around the camera whatever
  // the camera does.
  buildTunnel() {
    const N = 24000;   // enough elements for thick, full walls
    const g = new THREE.BufferGeometry();
    const rnd = new Float32Array(4 * N);
    for (let i = 0; i < 4 * N; i++) rnd[i] = Math.random();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * N), 3));
    g.setAttribute('aTo', new THREE.BufferAttribute(new Float32Array(3 * N), 3));
    g.setAttribute('aColA', new THREE.BufferAttribute(new Float32Array(3 * N), 3));
    g.setAttribute('aColB', new THREE.BufferAttribute(new Float32Array(3 * N), 3));
    g.setAttribute('aRand', new THREE.BufferAttribute(rnd, 4));
    const m = new THREE.ShaderMaterial({
      uniforms: { uP: { value: 0 }, uTravel: { value: 0 }, uPR: { value: 1 }, uOpacity: { value: 1 }, uVariant: { value: 0 }, uTime: { value: 0 }, uDir: { value: new THREE.Vector2(1, 0) },
        uSea: { value: new THREE.Color('#2f8fa6') }, uDeep: { value: new THREE.Color('#0a2c3c') } },
      vertexShader: /* glsl */ `
        attribute vec3 aTo; attribute vec3 aColA; attribute vec3 aColB; attribute vec4 aRand;
        uniform float uP, uTravel, uPR, uOpacity, uVariant, uTime;
        uniform vec3 uSea, uDeep;
        uniform vec2 uDir;   // the way across the screen this journey goes
        varying vec3 vCol; varying float vA; varying float vSnow;
        vec2 rot(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
        void main() {
          vec3 from = (viewMatrix * vec4(position, 1.0)).xyz;
          vec3 to = (viewMatrix * vec4(aTo, 1.0)).xyz;
          float V = uVariant, turn = mod(V, 2.0) * 2.0 - 1.0;
          // An ocean current carrying the visitor to another part of the estuary's story: one round
          // passage whose walls are the map's own elements, flowing past in a slow spiral, with
          // fine particles drifting in the water inside it, like marine snow. Far ahead the
          // passage dissolves into deep water, and it curves gently, so the way on is never fully seen.
          const float L = 1500.0;
          float snow = step(aRand.y, 0.3);
          float speed = mix(1.0, 0.55, snow);
          float z = -mod(aRand.z * L - uTravel * speed - uTime * 4.0 * snow, L) - 18.0;
          float s = -z;
          float ang = aRand.x * 6.2831853 + s * 0.0028 * turn + uTravel * 0.00025 * turn;
          // thick walls: elements spread through a deep band, not a thin shell
          float r = mix(26.0 + 72.0 * pow(aRand.w, 1.4), 5.0 + 24.0 * fract(aRand.w * 7.3), snow);
          r *= 1.0 + 0.12 * sin(s * 0.004 + V * 2.1);
          vec3 tube = vec3(cos(ang) * r * 1.25, sin(ang) * r, z);
          // the drifting particles also sway a little in the water
          tube.xy += snow * vec2(sin(uTime * 0.4 + aRand.x * 30.0), cos(uTime * 0.33 + aRand.z * 30.0)) * 2.5;
          // A journey across the screen: the passage opens on one side (where the map was left),
          // its far end curves away towards the other side, and as the visitor travels the whole
          // passage swings over, so they arrive somewhere else entirely.
          float go = smoothstep(0.12, 0.88, uP);
          vec2 across = uDir * mix(-52.0, 52.0, go);
          float ahead = (1.0 - go) * 0.00012 + 0.00002;
          // Like a water slide: the passage snakes left and right, up and down, and its bends come
          // towards the visitor as they travel, so the way ahead keeps swinging round. Close to
          // the camera the passage stays centred, so the ride is always inside it.
          float b1 = s * 0.0016 - uTravel * 0.0011 + V, b2 = s * 0.0012 - uTravel * 0.0008 + V * 1.7;
          vec2 bends = vec2(sin(b1), 0.7 * sin(b2)) * s * s * 0.00022;
          // the swing bends the passage ahead only: around the camera it stays centred, so the ride
          // never leaves the tunnel
          tube.xy += across * smoothstep(60.0, 520.0, s) + uDir * s * s * ahead + bends;
          // and it banks into each bend, tilting the whole passage
          float bank = -0.55 * sin(-uTravel * 0.0011 + V) * sin(3.14159 * uP);
          tube.xy = rot(tube.xy, bank);
          // leaving: the map lifts off from the centre of the view outwards and swirls into the walls
          float leadA = clamp(length(from.xy / max(1.0, -from.z)), 0.0, 1.2) / 1.2;
          float st1 = mix(aRand.w, leadA, 0.6);
          float k1 = smoothstep(0.02 + st1 * 0.16, 0.3 + st1 * 0.12, uP);
          vec3 a = mix(from, tube, k1);
          float lift = sin(3.14159 * k1);
          a.xy = rot(a.xy, turn * 1.8 * lift);
          a.y += 14.0 * lift * aRand.y;
          // arriving: the current slows and the elements settle, edges first, onto the next map
          float leadB = clamp(length(to.xy / max(1.0, -to.z)), 0.0, 1.2) / 1.2;
          float st2 = mix(aRand.w, 1.0 - leadB, 0.6);
          float k2 = smoothstep(0.6 + st2 * 0.14, 0.86 + st2 * 0.1, uP);
          vec3 v = mix(a, to, k2);
          float fall = sin(3.14159 * k2);
          v.xy = rot(v.xy, -turn * 1.3 * fall);
          v.y += 16.0 * fall * aRand.x;
          v.z = min(v.z, -2.0);
          float mid = k1 * (1.0 - k2);
          // colour: the map's own colours, taking on the water while inside the current, deeper
          // and darker with distance; light ripples over the walls as it would under the surface
          vec3 col = mix(aColA, aColB, smoothstep(0.36, 0.7, uP + (aRand.z - 0.5) * 0.2));
          col = mix(col, uSea, 0.32 * mid);
          float ripple = sin(ang * 5.0 + s * 0.026 - uTime * 1.1) * sin(ang * 3.0 - s * 0.017 + uTime * 0.7);
          col *= 1.0 + 0.45 * max(ripple, 0.0) * mid * (1.0 - snow);
          float depth = smoothstep(120.0, 1000.0, s) * mid;
          col = mix(col, uDeep, 0.75 * depth);
          col = mix(col, vec3(0.82, 0.93, 0.96), snow * mid * 0.6);
          // faint rings of light passing by, so the speed of the ride can be felt
          float ring = pow(0.5 + 0.5 * sin(s * 0.022 - uTravel * 0.03), 14.0);
          col *= 1.0 + 0.6 * ring * mid * (1.0 - snow);
          vCol = col; vSnow = snow * mid;
          vA = uOpacity * smoothstep(0.0, 0.05, uP) * (1.0 - smoothstep(0.95, 1.0, uP)) * (0.6 + 0.4 * aRand.y)
             * (1.0 - 0.8 * smoothstep(500.0, 1300.0, s) * mid) * (1.0 - 0.45 * snow * mid);
          gl_Position = projectionMatrix * vec4(v, 1.0);
          gl_PointSize = clamp(1.8 * uPR * (900.0 / -v.z) * (1.0 - 0.55 * vSnow), 1.0, 22.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vCol; varying float vA; varying float vSnow;
        void main() {
          vec2 q = gl_PointCoord * 2.0 - 1.0; float r2 = dot(q, q);
          if (r2 > 1.0) discard;
          vec3 n = vec3(q.x, -q.y, sqrt(1.0 - r2));
          float diff = 0.62 + 0.55 * max(dot(n, normalize(vec3(-0.45, 0.65, 0.62))), 0.0);
          // the drifting particles are soft specks of light; the elements of the map stay round and lit
          float edgeA = mix(1.0 - smoothstep(0.78, 1.0, r2), (1.0 - r2) * (1.0 - r2), vSnow);
          gl_FragColor = vec4(mix(vCol * diff, vCol, vSnow), vA * edgeA);
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, depthTest: false,
    });
    this.tunnel = new THREE.Points(g, m);
    this.tunnel.frustumCulled = false;
    this.tunnel.renderOrder = 10;
    // the light at the end of the tunnel: a soft glow far ahead, at the point the passage is heading
    // for (worked out with the same bends as the shader), so the course of the ride is always clear
    {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const x = c.getContext('2d'), gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(230,250,255,0.95)'); gr.addColorStop(0.25, 'rgba(160,225,240,0.45)'); gr.addColorStop(1, 'rgba(90,170,200,0)');
      x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      this.tunnelGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      this.tunnelGlow.renderOrder = 11;
      this.tunnelGlow.visible = false;
      this.camera.add(this.tunnelGlow);
    }
    this.tunnel.visible = false;
    this.scene.add(this.tunnel);
    this.tunnelCache = {};
    this.tunnelShown = '';
  }

  // A soft pool of shade on the ground under whatever is being looked at, so the maps rest on
  // the water below rather than floating in the air.
  buildGroundShade() {
    const m = new THREE.ShaderMaterial({
      uniforms: { uOpacity: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */ `
        uniform float uOpacity; varying vec2 vUv;
        void main() {
          float r = length(vUv - 0.5) * 2.0;
          float a = pow(1.0 - smoothstep(0.0, 1.0, r), 1.6);
          gl_FragColor = vec4(0.012, 0.05, 0.07, a * uOpacity);
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false,
    });
    this.groundShade = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m);
    this.groundShade.rotation.x = -Math.PI / 2;
    this.groundShade.scale.set(900, 760, 1);
    this.groundShade.renderOrder = -2;
    this.groundShade.frustumCulled = false;
    this.scene.add(this.groundShade);
  }

  // ---------- Anchors for the callouts (main.js) ----------
  /** The dot of class `key` nearest the middle of that class in a dot cloud, so a label pinned to
   *  it sits on the class itself and not in a gap between its patches (cloud coordinates). */
  classPoint(pts, key) {
    pts.userData.anchors ??= {};
    if (key in pts.userData.anchors) return pts.userData.anchors[key];
    const ci = this.idx[key], P = pts.geometry.attributes.position, C = pts.geometry.attributes.aClass;
    let x = 0, y = 0, z = 0, n = 0;
    for (let j = 0; j < P.count; j++) if (Math.round(C.array[j]) === ci) { x += P.getX(j); y += P.getY(j); z += P.getZ(j); n++; }
    let best = null;
    if (n) {
      x /= n; y /= n; z /= n;
      let bd = Infinity;
      for (let j = 0; j < P.count; j++) {
        if (Math.round(C.array[j]) !== ci) continue;
        const d = (P.getX(j) - x) ** 2 + (P.getZ(j) - z) ** 2;
        if (d < bd) { bd = d; best = new THREE.Vector3(P.getX(j), P.getY(j), P.getZ(j)); }
      }
    }
    return (pts.userData.anchors[key] = best);
  }
  /** World position of a class in a dot cloud, following its lifted layer. */
  classAnchor(pts, key, out = new THREE.Vector3()) {
    const p = this.classPoint(pts, key);
    if (!p) return null;
    const u = pts.material.uniforms, ci = this.idx[key];
    out.copy(p);
    out.y += (u.uLevel?.value[ci] ?? 0) * (u.uRise?.value ?? 1) + (u.uClassLift?.value[ci] ?? 0);
    return out.applyMatrix4(pts.matrixWorld);
  }
  /** Map 2: the top of one column whose count passes a test (the one nearest their middle). */
  columnAnchor(which, test, out = new THREE.Vector3(), frac = null) {
    const p = this[which], key = `col:${test}:${frac}`;
    p.anchors ??= {};
    if (!(key in p.anchors)) {
      const P = this.data.persistence, counts = which === 'persWater' ? P.water : which === 'persMangrove' ? P.mangrove : P.bed;
      const max = counts.reduce((a, b) => Math.max(a, b), 0);
      const ok = (c) => (test === 'max' ? c === max : test === 'some' ? c >= 3 && c <= 8 : c >= 1 && c <= 9);
      let x = 0, z = 0, n = 0;
      for (let i = 0; i < P.n; i++) if (ok(counts[i])) { x += P.pos[3 * i]; z += P.pos[3 * i + 2]; n++; }
      let best = -1, bd = Infinity;
      if (n) {
        x /= n; z /= n;
        // optionally pull the anchor west or east (a fraction across the matching cells)
        if (frac !== null) { let x0 = Infinity, x1 = -Infinity; for (let i = 0; i < P.n; i++) if (ok(counts[i])) { x0 = Math.min(x0, P.pos[3 * i]); x1 = Math.max(x1, P.pos[3 * i]); } x = x0 + frac * (x1 - x0); }
        for (let i = 0; i < P.n; i++) if (ok(counts[i])) { const d = (P.pos[3 * i] - x) ** 2 + (P.pos[3 * i + 2] - z) ** 2; if (d < bd) { bd = d; best = i; } }
      }
      p.anchors[key] = best < 0 ? null : { x: P.pos[3 * best], z: P.pos[3 * best + 2], h: counts[best] * 1.15, count: counts[best], max };
    }
    const a = p.anchors[key];
    if (!a) return null;
    return out.set(a.x, a.h, a.z).applyMatrix4(p.pts.matrixWorld);
  }
  /** Map 4: one element of a built layer (boats, cage farms, buildings, track) on a year's deck,
   *  taken at a fraction of the way along the shore, so labels for different classes spread out. */
  layerAnchor(deckIndex, key, frac = 0.5, out = new THREE.Vector3()) {
    const deck = this.lived[deckIndex], layer = deck.userData.layers[key];
    if (!layer) return null;
    deck.userData.anchors ??= {};
    const id = `${key}:${frac}`;
    if (!(id in deck.userData.anchors)) {
      deck.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(layer);
      let p = null;
      if (!box.isEmpty()) {
        const tx = box.min.x + frac * (box.max.x - box.min.x);
        const inst = layer.children.find((o) => o.isInstancedMesh);
        if (inst) {
          const m = new THREE.Matrix4(), q = new THREE.Vector3();
          let bd = Infinity;
          for (let i = 0; i < inst.count; i++) {
            inst.getMatrixAt(i, m); q.setFromMatrixPosition(m).applyMatrix4(inst.matrixWorld);
            if (Math.abs(q.x - tx) < bd) { bd = Math.abs(q.x - tx); p = q.clone().setY(box.max.y); }
          }
        } else p = new THREE.Vector3(tx, box.max.y, (box.min.z + box.max.z) / 2);
      }
      deck.userData.anchors[id] = p ? deck.worldToLocal(p) : null;
    }
    const c = deck.userData.anchors[id];
    return c ? out.copy(c).applyMatrix4(deck.matrixWorld) : null;
  }
  /** The dot of a class nearest a given fraction of the way along a cloud from west to east. */
  classAlong(pts, key, frac, out = new THREE.Vector3()) {
    pts.userData.along ??= {};
    const id = `${key}:${frac}`;
    if (!(id in pts.userData.along)) {
      const ci = this.idx[key], P = pts.geometry.attributes.position, C = pts.geometry.attributes.aClass;
      let x0 = Infinity, x1 = -Infinity;
      for (let j = 0; j < P.count; j++) if (Math.round(C.array[j]) === ci) { x0 = Math.min(x0, P.getX(j)); x1 = Math.max(x1, P.getX(j)); }
      const tx = x0 + frac * (x1 - x0);
      let best = null, bd = Infinity;
      for (let j = 0; j < P.count; j++) if (Math.round(C.array[j]) === ci && Math.abs(P.getX(j) - tx) < bd) { bd = Math.abs(P.getX(j) - tx); best = new THREE.Vector3(P.getX(j), P.getY(j), P.getZ(j)); }
      pts.userData.along[id] = best;
    }
    const p = pts.userData.along[id];
    if (!p) return null;
    const u = pts.material.uniforms, ci = this.idx[key];
    out.copy(p);
    out.y += (u.uLevel?.value[ci] ?? 0) * (u.uRise?.value ?? 1) + (u.uClassLift?.value[ci] ?? 0);
    return out.applyMatrix4(pts.matrixWorld);
  }
  /** The sweeping line of the model chapter: a bright line across the ground and a faint blade. */
  buildSwipe() {
    const P = this.modelParts.manual.holder.children.find((o) => o.isPoints)?.geometry.attributes.position;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    if (P) for (let i = 0; i < P.count; i++) { x0 = Math.min(x0, P.getX(i)); x1 = Math.max(x1, P.getX(i)); z0 = Math.min(z0, P.getZ(i)); z1 = Math.max(z1, P.getZ(i)); }
    if (!isFinite(x0)) { x0 = -120; x1 = 120; z0 = -95; z1 = 100; }
    this.swipeExtent = { cx: (x0 + x1) / 2, hw: (x1 - x0) / 2, z0, z1 };
    const blade = new THREE.Group();
    const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 1.5, z0 - 6), new THREE.Vector3(0, 1.5, z1 + 6)]);
    const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: '#eafcff', transparent: true, opacity: 0, depthWrite: false, fog: false }));
    line.userData.base = 1;
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(z1 - z0 + 12, 26), new THREE.MeshBasicMaterial({ color: '#8fdcef', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false }));
    pane.rotation.y = Math.PI / 2; pane.position.set(0, 13, (z0 + z1) / 2);
    pane.userData.base = 0.12;
    blade.add(line, pane);
    blade.visible = false;
    this.modelParts.manual.holder.parent.add(blade);
    this.swipeBlade = blade;
  }
  /** World position for the two names either side of the sweeping line (side -1 west, +1 east). */
  swipeAnchor(side, out = new THREE.Vector3()) {
    if (!this.swipeOn || !this.swipeBlade) return null;
    return out.set(this.swipeSplit + side * 10, 2, this.swipeExtent.z1 - 6).applyMatrix4(this.swipeBlade.parent.matrixWorld);
  }

  /** Map 5: the middle of one label's group of squares. */
  waffleAnchor(ci, out = new THREE.Vector3()) {
    const c = this.waffleCentres?.[ci];
    if (!c) return null;
    return out.copy(c).setY([30, 4, 7, 4][ci] ?? 4).applyMatrix4(this.groups.plan.matrixWorld);
  }
  /** Map 6: the tops of the two columns of the date in focus (monsoon, and the 30 days before). */
  rainFocusAnchor(S, which, out = new THREE.Vector3()) {
    const t = this.rainTowers[Math.round(THREE.MathUtils.clamp(S.monsoonFocus ?? 0, 0, this.rainTowers.length - 1))];
    const balls = which === 'monsoon' ? t.monsoonBalls : t.priorBalls;
    // the blue label sits halfway up its column, clear of the date written over the top of the tower
    const y = which === 'monsoon' ? 2 + balls * 3.6 * 0.6 : 2 + balls * 3.6 + 2;
    return out.set(t.x + (which === 'monsoon' ? -3.6 : 3.6), y, t.z).applyMatrix4(this.groups.monsoon.matrixWorld);
  }
  /** Map 6: the top of one date's 30-day rainfall column. */
  rainAnchor(test, out = new THREE.Vector3()) {
    const T = this.rainTowers;
    const i = test === 'wettest' ? T.reduce((bi, t, k) => (t.priorBalls > T[bi].priorBalls ? k : bi), 0) : 0;
    const t = T[i];
    return out.set(t.x + 2.6, 2 + t.priorBalls * 3.6 + 2, t.z).applyMatrix4(this.groups.monsoon.matrixWorld);
  }

  /** Sample n dots (world position and display colour) from the dot clouds now on screen. */
  sampleVisibleDots(n) {
    this.scene.updateMatrixWorld();
    const pools = [];
    this.scene.traverseVisible((o) => {
      if (!o.isPoints || o === this.dust || o === this.rain || o === this.tunnel) return;
      const u = o.material.uniforms;
      if (!u?.uOpacity || u.uOpacity.value < 0.05 || !o.geometry.attributes.aClass) return;
      pools.push({ o, w: o.geometry.attributes.position.count * u.uOpacity.value });
    });
    const pos = new Float32Array(3 * n), col = new Float32Array(3 * n);
    if (!pools.length) return { pos, col, empty: true };
    const total = pools.reduce((s, p) => s + p.w, 0);
    const v = new THREE.Vector3();
    for (let k = 0; k < n; k++) {
      let r = Math.random() * total, P = pools[0];
      for (const p of pools) { r -= p.w; if (r <= 0) { P = p; break; } }
      const { o } = P, u = o.material.uniforms, A = o.geometry.attributes;
      let j = 0, c = 0;
      for (let tries = 0; tries < 6; tries++) {          // skip classes faded out on this map
        j = Math.floor(Math.random() * A.position.count); c = Math.round(A.aClass.array[j]);
        if ((u.uClassAlpha?.value[c] ?? 1) > 0.5) break;
      }
      v.fromBufferAttribute(A.position, j);
      v.y += (u.uLevel?.value[c] ?? 0) * (u.uRise?.value ?? 1);
      v.applyMatrix4(o.matrixWorld).toArray(pos, 3 * k);
      if (u.uUseRGB?.value > 0.5) {
        const g = u.uGain.value; col[3 * k] = A.aColor.array[3 * j] * g; col[3 * k + 1] = A.aColor.array[3 * j + 1] * g; col[3 * k + 2] = A.aColor.array[3 * j + 2] * g;
      } else {
        const p = u.uPalette.value[c] ?? u.uPalette.value[0]; col[3 * k] = p.r; col[3 * k + 1] = p.g; col[3 * k + 2] = p.b;
      }
    }
    return { pos, col };
  }

  /** The way each tunnel crosses the screen (view space, unit length): right and up, left and
   *  down, and so on. main.js uses the same direction to slide the maps out and in. */
  tunnelDir(i) {
    const D = [[1, 0.45], [-1, 0.35], [0.8, -0.6], [-0.9, -0.45], [1, -0.2], [-0.7, 0.7]][((i % 6) + 6) % 6];
    const l = Math.hypot(D[0], D[1]);
    return [D[0] / l, D[1] / l];
  }

  updateTunnel(S, pr, time) {
    const f = S.tunnel ?? 0, i = Math.floor(f), p = f - i;
    const active = p > 0.0005 && p < 0.9995;
    this.tunnel.visible = active;
    if (!active) { if (this.tunnelGlow) this.tunnelGlow.visible = false; return; }
    const N = this.tunnel.geometry.attributes.position.count;
    const kf = `${i}f`, kt = `${i}t`;
    if (p < 0.5 && !this.tunnelCache[kf]) this.tunnelCache[kf] = this.sampleVisibleDots(N);
    if (p >= 0.5 && !this.tunnelCache[kt]) this.tunnelCache[kt] = this.sampleVisibleDots(N);
    const from = this.tunnelCache[kf] ?? this.tunnelCache[kt];
    const to = this.tunnelCache[kt] ?? from;
    const key = `${i}:${!!this.tunnelCache[kf]}:${!!this.tunnelCache[kt]}`;
    if (key !== this.tunnelShown) {
      const A = this.tunnel.geometry.attributes;
      A.position.array.set(from.pos); A.aColA.array.set(from.col);
      A.aTo.array.set(to.pos); A.aColB.array.set(this.tunnelCache[kt] ? to.col : from.col);
      for (const a of [A.position, A.aColA, A.aTo, A.aColB]) a.needsUpdate = true;
      this.tunnelShown = key;
    }
    const u = this.tunnel.material.uniforms;
    // speed builds and eases off: slow as the map lifts away, fastest midway, slow again on arrival
    u.uP.value = p; u.uTravel.value = 3400 * (p - Math.sin(2 * Math.PI * p) / (2 * Math.PI)); u.uPR.value = pr ?? 1;
    u.uVariant.value = i;
    u.uTime.value = time ?? 0;
    // each tunnel crosses the screen a different way: right and up, left and down, and so on
    const d = this.tunnelDir(i);
    u.uDir.value.set(d[0], d[1]);
    // place the light at the end of the tunnel (same formula as the shader, 1000 units ahead)
    {
      const s = 1000, V = i, travel = u.uTravel.value, ss = THREE.MathUtils.smoothstep;
      const go = ss(p, 0.12, 0.88), acr = THREE.MathUtils.lerp(-52, 52, go) * ss(s, 60, 520);
      const ahead = (1 - go) * 0.00012 + 0.00002;
      const b1 = s * 0.0016 - travel * 0.0011 + V, b2 = s * 0.0012 - travel * 0.0008 + V * 1.7;
      let x = d[0] * acr + d[0] * s * s * ahead + Math.sin(b1) * s * s * 0.00022;
      let y = d[1] * acr + d[1] * s * s * ahead + 0.7 * Math.sin(b2) * s * s * 0.00022;
      const bank = -0.55 * Math.sin(-travel * 0.0011 + V) * Math.sin(Math.PI * p);
      const cb = Math.cos(bank), sb = Math.sin(bank);
      [x, y] = [cb * x - sb * y, sb * x + cb * y];
      const k1 = ss(p, 0.12, 0.3), k2 = 1 - ss(p, 0.62, 0.8);
      this.tunnelGlow.position.set(x, y, -(s + 18));
      this.tunnelGlow.scale.setScalar(260);
      this.tunnelGlow.material.opacity = 0.55 * k1 * k2;
      this.tunnelGlow.visible = this.tunnelGlow.material.opacity > 0.005;
    }
  }

  // ---------- Manual and automated tracing, change and scenarios (tools/ml/classify.py, change.py) ----------
  // Date-dependent layers (one observation at a time): the hand-traced classes, the classification
  // of the same image by a model that never saw that date, and the cells where the two disagree.
  // All-date layers: how often each cell's traced class changed between consecutive observations,
  // and where the mangrove canopy was first traced. Same dots, same class look.
  buildModel() {
    const M = this.data.model;
    this.modelMeta = M;
    const g = this.group('model');
    this.modelParts = {};
    for (const k of ['manual', 'model', 'outside', 'agree', 'disagree', 'trans', 'growth']) {
      const holder = new THREE.Group(); g.add(holder);
      const opts = k === 'agree' || k === 'growth' ? { rgb: true, size: k === 'growth' ? 0.95 : 0.75 } : { size: k === 'disagree' ? 1.3 : k === 'trans' ? 0.8 : 0.95 };
      this.modelParts[k] = { holder, m: this.mat(opts) };
    }
    this.modelDate = null;
    this.modelClass = null;
    if (!M) return;
    if (M.transitions) this.buildChangeLayers(M.transitions);
    const label = (part, text, x = 118, y = 4) => {
      this.addLabel({ getWorldPosition: (v) => this.modelParts[part].holder.localToWorld(v.set(x, y, 0)) }, text, 'model', true);
      this.labels.at(-1).part = part;
    };
    label('manual', 'Traced by hand');
    label('model', 'Model');
    label('disagree', 'Disagreement');
    label('trans', 'Changes of class, all 17 dates', 95, 20);
    label('growth', 'Mangrove canopy, by first date traced', 95, 16);
  }

  /** Columns of balls from change.py: one ball per change of traced class (transitions layer), and
   *  one ball per date traced as mangrove canopy, shaded by the first date it was traced (growth). */
  buildChangeLayers(T) {
    const EST = ['water', 'muddy_shallows', 'bed_ground', 'mangrove_canopy'];
    const step = 1.15;
    const tp = [], tc = [];
    const gp = [], gc = [];
    // ramp within the mangrove family, stretched over the first-traced dates that occur
    const deep = new THREE.Color(CLASS_LOOK.mangrove_canopy.b).lerp(new THREE.Color(CLASS_LOOK.mangrove_canopy.a), 0.3);
    const pale = new THREE.Color(CLASS_LOOK.mangrove_canopy.a).lerp(new THREE.Color('#eef7dc'), 0.78);
    const tmp = new THREE.Color();
    let fMin = 255, fMax = 0;
    for (let i = 0; i < T.n; i++) if (T.firstMangrove[i] !== 255) { fMin = Math.min(fMin, T.firstMangrove[i]); fMax = Math.max(fMax, T.firstMangrove[i]); }
    for (let i = 0; i < T.n; i++) {
      const x = T.pos[3 * i], z = T.pos[3 * i + 2];
      const dom = T.dominant[i];
      const ci = dom < EST.length ? this.idx[EST[dom]] : this.idx.water;
      for (let s = 0; s < T.transitions[i]; s++) { tp.push(x, (s + 0.5) * step, z); tc.push(ci); }
      if (T.firstMangrove[i] !== 255) {
        // early canopy deep, recent canopy pale (sRGB bytes for the rgb dot mode)
        tmp.copy(deep).lerp(pale, fMax > fMin ? (T.firstMangrove[i] - fMin) / (fMax - fMin) : 0);
        const c = tmp.clone().convertLinearToSRGB();
        for (let s = 0; s < T.mangroveDates[i]; s++) { gp.push(x, (s + 0.5) * step, z); gc.push(Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)); }
      }
    }
    const add = (part, pos, cls, rgb) => {
      const n = pos.length / 3;
      if (n) this.modelParts[part].holder.add(makeDots({ n, pos: Float32Array.from(pos), cls: Uint8Array.from(cls ?? new Array(n).fill(this.idx.mangrove_canopy)), rgb: rgb ? Uint8Array.from(rgb) : null }, this.modelParts[part].m));
      this.modelParts[part].count = n;
    };
    add('trans', tp, tc, null);
    add('growth', gp, null, gc);
  }

  setModelDate(id) {
    const M = this.modelMeta;
    if (!M || id === this.modelDate || !M.dates[id]) return;
    this.modelDate = id;
    const D = M.dates[id];
    const MC = M.classes.map((k) => (k === 'land' ? 10 : this.idx[k])); // 'land' uses palette slot 10
    const sets = { manual: [], model: [], outside: [], agree: [], disagree: [] };
    for (let j = 0; j < D.n; j++) {
      const man = D.manual[j], pred = D.pred[j];
      if (pred === 255) continue;
      if (man === 255) { sets.outside.push(j); continue; }
      sets.manual.push(j); sets.model.push(j);
      (man === pred ? sets.agree : sets.disagree).push(j);
    }
    for (const [k, list] of Object.entries(sets)) {
      const part = this.modelParts[k];
      part.holder.children.forEach((c) => c.geometry.dispose());
      part.holder.clear();
      const pos = new Float32Array(3 * list.length), cls = new Uint8Array(list.length);
      const rgb = k === 'agree' ? new Uint8Array(3 * list.length).fill(92) : null;
      list.forEach((j, q) => {
        pos[3 * q] = D.pos[3 * j]; pos[3 * q + 2] = D.pos[3 * j + 2];
        cls[q] = MC[k === 'manual' ? D.manual[j] : D.pred[j]];
      });
      if (list.length) part.holder.add(makeDots({ n: list.length, pos, cls, rgb }, part.m));
      part.count = list.length;
    }
  }

  /** Single out one class in the model chapter (null = all). The class stays at full strength. */
  setModelClass(key) {
    this.modelClass = key ?? null;
  }

  /** Where a class sits on the chosen date (mean of the cells traced or modelled as it), so the
   *  camera can move to it. Null when the class has no cells on that date. */
  modelClassCentre(key) {
    const M = this.modelMeta, D = M?.dates[this.modelDate];
    if (!D || !key) return null;
    const ci = M.classes.indexOf(key);
    let x = 0, z = 0, xx = 0, zz = 0, n = 0;
    for (let j = 0; j < D.n; j++) {
      if (D.pred[j] === 255) continue;
      if (D.manual[j] === ci || D.pred[j] === ci) {
        const px = D.pos[3 * j], pz = D.pos[3 * j + 2];
        x += px; z += pz; xx += px * px; zz += pz * pz; n++;
      }
    }
    if (!n) return null;
    x /= n; z /= n;
    // spread: how far the class reaches from its centre (two standard deviations, in metres)
    const spread = 2 * Math.sqrt(Math.max(0, xx / n - x * x + zz / n - z * z));
    return { x, z, spread };
  }

  updateModel(S, time = 0) {
    const g = this.groups.model;
    g.visible = S.model > 0.002 && !!this.modelMeta;
    if (!g.visible) { this.modelOps = {}; if (this.swipeBlade) this.swipeBlade.visible = false; this.swipeOn = false; return; }
    const ops = {
      manual: S.model * S.modelManual,
      model: S.model * S.modelModel,
      outside: S.model * S.modelModel * 0.3,
      agree: S.model * S.modelDiff * 0.55,
      disagree: S.model * S.modelDiff,
      trans: S.model * S.modelTrans,
      growth: S.model * S.modelGrowth,
    };
    this.modelOps = ops;
    // class filter: the chosen class at full strength, the others faint
    const sel = this.modelClass === 'land' ? 10 : this.modelClass ? this.idx[this.modelClass] : -1;
    const alpha = new Array(MAX_CLASSES).fill(1).map((_, i) => (sel < 0 || i === sel ? 1 : 0.12));
    for (const [k, part] of Object.entries(this.modelParts)) {
      part.m.uniforms.uOpacity.value = ops[k] * (k === 'growth' && sel >= 0 && sel !== this.idx.mangrove_canopy ? 0.12 : 1);
      if (k !== 'agree' && k !== 'growth') part.m.uniforms.uClassAlpha.value = alpha;
      part.holder.visible = ops[k] > 0.004;
    }
    const lift = S.modelSep * 46;
    this.modelParts.model.holder.position.y = lift;
    this.modelParts.outside.holder.position.y = lift;
    // Comparing the two on one surface: a glowing line sweeps slowly back and forth; west of it is
    // my tracing, east of it the model's reading of the same image. Where they agree, nothing seems
    // to change as the line passes; where they disagree, the ground visibly flips.
    const sw = S.model * (S.modelSwipe ?? 0);
    this.swipeOn = sw > 0.5;
    if (!this.swipeBlade) this.buildSwipe();
    const ext = this.swipeExtent;
    const split = sw > 0.002 ? ext.cx + ext.hw * 0.78 * Math.sin(time * 0.33) : 0;
    this.swipeSplit = split;
    for (const [k, part] of Object.entries(this.modelParts)) {
      const side = k === 'manual' ? -1 : k === 'model' || k === 'outside' ? 1 : 0;
      part.m.uniforms.uSplit.value.set(side && sw > 0.002 ? 1 : 0, split, side || 1);
    }
    this.swipeBlade.visible = sw > 0.002;
    this.swipeBlade.position.x = split;
    this.swipeBlade.children.forEach((c) => { c.material.opacity = (c.userData.base ?? 0.8) * sw; });
    this.modelParts.disagree.holder.position.y = 4 + S.modelDiff * 10;
  }

  addLabel(obj, text, chapter, raw = false) {
    const el = document.createElement('span');
    el.className = `world-label world-label--${chapter}`;
    if (chapter === 'stack') {
      // year first, large; day and month beside it, after a leader line pointing at the layer
      const d = new Date(`${text.replaceAll('_', '-')}T00:00:00`);
      el.innerHTML = `<b>${d.getFullYear()}</b><span>${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>`;
    } else {
      el.textContent = raw ? text : formatDate(text.replaceAll('_', '-'));
    }
    el.dataset.id = raw ? '' : text;
    document.querySelector('#labels').append(el);
    this.labels.push({ el, obj, chapter });
  }

  setSize(aspect, pr) {
    this.aspect = aspect;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.materials.forEach((m) => { m.uniforms.uPixelRatio.value = pr; });
    this.rain.material.uniforms.uPR.value = pr;
    this.dust.material.uniforms.uPR.value = pr;
    this.motes.material.uniforms.uPR.value = pr;
    this.pr = pr;
  }

  /** Apply the scroll state S (see story.js) for this frame. */
  update(S, time, view) {
    // Leaving through a tunnel: the map's own features fade out as its elements lift away into the
    // tunnel walls (so nothing stays behind), and the next map fades in as the elements settle.
    const tf = S.tunnel ?? 0, tp = tf - Math.floor(tf), ss = THREE.MathUtils.smoothstep;
    this.leave = tp > 0.0005 && tp < 0.9995 ? (tp < 0.5 ? 1 - ss(tp, 0.03, 0.3) : ss(tp, 0.66, 0.93)) : 1;
    this.materials.forEach((m) => { m.uniforms.uTime.value = time; m.uniforms.uLeave.value = this.leave; });
    this.surfaces.forEach((m) => { m.uniforms.uLeave.value = this.leave; });
    this.lived?.forEach((d) => { d.userData.sat.material.uniforms.uLeave.value = this.leave; });
    const vis = (g, v) => { this.groups[g].visible = v > 0.002; };

    // Each map shows the classes its printed legend draws; the others fade out (see MAP_CLASSES).
    const own = MAP_CLASSES[view.mapKey];
    for (let i = 0; i < MAX_CLASSES; i++) {
      const target = !own || own.includes(this.classes[i]?.key) ? 1 : 0;
      this.classAlpha[i] += (target - this.classAlpha[i]) * 0.08;
    }
    const alpha = this.classAlpha.slice();
    for (const m of [...this.classSets.map((x) => x.m), ...this.map1.map((p) => p.userData.material), ...this.stackLayers.map((l) => l.userData.material)]) {
      m.uniforms.uClassAlpha.value = alpha;
    }

    // arrival ground + traced classes
    vis('ground', S.ground);
    // the satellite photo always draws beneath the traced classes, so tracing shows on top of it
    if (!this.groundOrdered) { this.groups.ground.traverse((o) => { o.renderOrder = -1; }); this.groundOrdered = true; }
    this.groundMat.uniforms.uOpacity.value = S.ground * (S.traceOn > 0.5 ? 0.7 : 1);
    this.groundMat.uniforms.uScatter.value = S.groundScatter;
    vis('classes', S.classes);
    // Map 1, tracing: water first, then mangrove canopy, the land edge, boats and cage farms
    if (!this.traceRank) {
      const order = ['water', 'muddy_shallows', 'bed_ground', 'mangrove_canopy', 'land_edge', 'boats', 'cage_farms'];
      const rankOf = { water: 0, muddy_shallows: 0, bed_ground: 0, mangrove_canopy: 1, land_edge: 2, boats: 3, cage_farms: 4 };
      this.traceRank = this.classes.map((c) => (c && order.includes(c.key) ? rankOf[c.key] : 9)).concat(new Array(MAX_CLASSES).fill(9)).slice(0, MAX_CLASSES);
    }
    this.classSets.forEach((set, i) => {
      const u = set.m.uniforms;
      const share = i === 0 ? 1 - (view.classDate ?? 0) : (view.classDate ?? 0);
      u.uOpacity.value = S.classes * share;
      set.pts.visible = u.uOpacity.value > 0.002;
      u.uLevel.value = this.compactLevels(this.shownKeys(i, view.mapKey), S.classSep);
      u.uScatter.value = S.classScatter;
      u.uHighlight.value = S.highlight;
      u.uDim.value = S.classDim;
      u.uHiSize.value = S.hiSize;
      u.uTraceOn.value = S.traceOn ?? 0;
      u.uTraceT.value = S.traceT ?? 5;
      u.uTraceRank.value = this.traceRank;
    });
    this.groups.classes.rotation.y = S.classSpin;
    // Map 1's exploded drawing: a sheet under each lifted layer, and the corner lines
    {
      const keys = this.shownKeys(0, view.mapKey), on = view.mapKey === 'map1' ? S.classes * (1 - (view.classDate ?? 0)) : 0;
      const lv = this.compactLevels(keys, S.classSep);
      let top = 0;
      this.sheets.forEach((s, r) => {
        const k = keys[r];
        const y = k ? lv[this.idx[k]] : 0;
        const e = k ? THREE.MathUtils.smoothstep(S.classSep, r * 0.1, r * 0.1 + 0.55) : 0;
        const a = on * e * (r === 0 ? 1 : 1) * this.leave;
        s.sheet.visible = a > 0.01;
        s.sheet.position.y = y + 0.3;
        s.fillMat.opacity = 0.05 * a;
        s.edgeMat.opacity = 0.55 * a;
        if (k) top = Math.max(top, y);
      });
      const pa = on * THREE.MathUtils.smoothstep(S.classSep, 0.15, 0.8) * this.leave;
      this.sheetPosts.visible = pa > 0.01 && top > 1;
      this.sheetPosts.scale.y = Math.max(0.001, top + 0.3);
      this.sheetPosts.material.opacity = 0.35 * pa;
    }
    this.groups.ground.rotation.y = S.classSpin;
    this.dust.material.uniforms.uOpacity.value = S.dust;
    // arrival pulse: three rings spreading out from the middle of the frame, one after another
    {
      const a = S.pulse ?? 0;
      this.pulses.forEach((m, k) => {
        const ph = (time * 0.35 + k / 3) % 1;
        m.visible = a > 0.01;
        m.scale.setScalar(10 + ph * 150);
        m.material.opacity = a * 0.3 * (1 - ph) * Math.min(1, ph * 6);
      });
    }
    // conclusion: the 17 waterlines
    {
      const wu = this.waterlines.material.uniforms;
      wu.uT.value = S.edgesT ?? 0;
      wu.uOpacity.value = (S.edges ?? 0) * this.leave;
      wu.uPR.value = this.pr ?? 1;
      this.waterlines.visible = wu.uOpacity.value > 0.002;
    }
    // the imagined tide: one slow rise and fall about every 45 seconds
    const fu = this.flats.material.uniforms;
    fu.uOpacity.value = 0.55 * (S.cosmos ?? 0) * this.leave * (1 - 0.8 * (S.murk ?? 0));
    fu.uTide.value = 0.5 + 0.07 * Math.sin(time * 0.14);
    fu.uTime.value = time;
    this.flats.visible = fu.uOpacity.value > 0.002 && !!fu.uH.value;
    this.motes.material.uniforms.uOpacity.value = 0.5 * (S.cosmos ?? 0) * this.leave * (1 - (S.murk ?? 0));
    this.motes.material.uniforms.uTime.value = time;
    this.motes.visible = this.motes.material.uniforms.uOpacity.value > 0.002;
    this.dust.material.uniforms.uTime.value = time;

    // Map 1 ring
    vis('map1', S.map1);
    this.groups.map1.rotation.y = S.map1Turn;
    this.map1.forEach((plate) => {
      const u = plate.userData.material.uniforms;
      // how directly this plate faces the camera as the ring turns (1 = at the front)
      const front = THREE.MathUtils.smoothstep((Math.cos(plate.userData.angle + S.map1Turn - S.az * Math.PI / 180) + 1) / 2, 0.55, 1);
      plate.userData.front = front;
      u.uOpacity.value = S.map1 * (0.3 + 0.7 * front); u.uLevel.value = this.levels(S.map1Sep * front, 20);
      u.uHighlight.value = S.highlight;
      plate.scale.setScalar(MAP1_SCALE * (0.85 + 0.55 * front));
      plate.rotation.y = -S.map1Turn + Math.sin(time * 0.3 + plate.userData.angle) * 0.08;
    });

    // Map 2 persistence columns
    vis('persistence', S.pers);
    const wm = this.persWater.m.uniforms, mm = this.persMangrove.m.uniforms, bm = this.persBed.m.uniforms;
    // persMode: 0 water persistence, 1 mangrove canopy persistence, 2 exposed sediment frequency
    const m = S.persMode;
    wm.uOpacity.value = S.pers * THREE.MathUtils.clamp(1 - m, 0, 1);
    mm.uOpacity.value = S.pers * THREE.MathUtils.clamp(1 - Math.abs(m - 1), 0, 1);
    bm.uOpacity.value = S.pers * THREE.MathUtils.clamp(m - 1, 0, 1);
    for (const p of [this.persWater, this.persMangrove, this.persBed]) {
      p.pts.scale.y = Math.max(0.001, S.persRise);
      p.pts.visible = p.m.uniforms.uOpacity.value > 0.002;
      // counting up: a ball shows once its date has been counted (ball s sits at (s + 0.5) x 1.15)
      const count = S.persCount ?? 17;
      p.m.uniforms.uClipY.value = count >= 16.999 ? 1e9 : count * 1.15;
    }
    wm.uThreshold.value = S.threshold;
    this.groups.persistence.rotation.y = S.persSpin;

    // Map 3 stack
    vis('stack', S.stack);
    this.stackLayers.forEach((layer, i) => {
      const u = layer.userData.material.uniforms;
      // a narrow focus: the date being read is bright and lifted on its slide, its neighbours
      // fall back to faint outlines so the two are never confused
      const focus = Math.exp(-Math.pow(i - S.stackFocus, 2) * 3.2);
      const near = Math.exp(-Math.pow(i - S.stackFocus, 2) * 0.35);
      layer.userData.focus = focus;
      u.uOpacity.value = S.stack * (0.07 + 0.25 * near * (1 - S.stackSep * 0.6) + 0.68 * focus + 0.3 * (1 - S.stackSep));
      u.uLevel.value = this.levels(S.stackSep * focus, 4.5);
      layer.position.y = layer.userData.baseY * S.stackSpread + focus * S.stackLift;
      layer.scale.setScalar(STACK_SCALE * (0.92 + 0.16 * focus));
      const slide = S.stack * S.stackSep * focus;
      layer.userData.paneMat.opacity = 0.07 * slide;
      layer.userData.edgeMat.opacity = 0.75 * slide;
      // dates far from the one in focus are nearly invisible: skip drawing them
      layer.visible = u.uOpacity.value > 0.1;
      layer.rotation.y = 0;
    });
    this.groups.stack.rotation.y = S.stackTwist;
    this.stackCloud.scale.y = Math.max(0.001, S.stackSpread);
    this.monsoonCloudMat.uniforms.uOpacity.value = S.stack * 0.26 * THREE.MathUtils.smoothstep(S.stackSpread, 0.4, 1);

    // Map 4 lived landscape
    vis('lived', S.lived);
    const lv = this.livedLevelsFor(S.livedSep);
    this.lived.forEach((deck, i) => {
      const { material: dm, layers, sat } = deck.userData;
      const f = i === 0 ? 1 - S.livedFocus : S.livedFocus;
      const op = S.lived * (0.22 + 0.78 * f);
      dm.uniforms.uOpacity.value = op;
      dm.uniforms.uLevel.value = lv;
      sat.material.uniforms.uOpacity.value = op * 0.55;
      for (const [key, l] of Object.entries(layers)) {
        l.position.y = (LIVED_RANK[key] ?? 0) * LIVED_GAP * S.livedSep;
        l.children.forEach((c) => { c.material.uniforms.uOpacity.value = op; });
        l.visible = op > 0.01;
      }
      deck.position.y = i * LIVED_DECK * S.livedSpread;
    });
    this.surfaces.forEach((m) => { m.uniforms.uTime.value = time; });

    // Map 5 plan beside ground
    vis('plan', S.plan);
    this.planMat.uniforms.uOpacity.value = S.plan * (1 - 0.85 * THREE.MathUtils.smoothstep(S.planLift ?? 0, 0.5, 1)) * (1 - 0.9 * (S.planDim ?? 0));   // the sheet steps back while its box is laid over the ground
    this.planSheet.position.y = (1 - S.planDrop) * 140;
    this.planSheet.rotation.z = (1 - S.planDrop) * 0.35;
    this.planTowerMat.uniforms.uOpacity.value = S.plan * S.planTowers;
    {
      const wu = this.waffle.material.uniforms;
      wu.uShow.value = S.planWaffle ?? 0;
      wu.uOpacity.value = S.plan * Math.min(1, (S.planWaffle ?? 0) * 3) * this.leave;
      wu.uTime.value = time;
      this.waffle.visible = wu.uOpacity.value > 0.002;
    }
    const box = S.plan * (S.planBox ?? 0);
    this.planBox.fillMat.opacity = 0.3 * box * this.leave;
    this.planBox.lineMat.opacity = 0.95 * box * this.leave;
    this.planLink.material.opacity = S.plan * (S.planLink ?? 0) * this.leave;
    this.planLink.visible = this.planLink.material.opacity > 0.002;
    // the lifted box: from its place on the plan, along the arc, to hover over the traced ground,
    // stretched to the ground's extent (for comparison only; the two are not at the same scale)
    const lift = S.planLift ?? 0, le = lift * lift * (3 - 2 * lift);
    this.planPatch.visible = S.plan > 0.002 && lift > 0.002;
    if (this.planPatch.visible) {
      const cp = this.planCurve.getPoint(le);
      const hover = THREE.MathUtils.smoothstep(lift, 0.6, 1);
      const sheetY = (1 - S.planDrop) * 140;
      this.planPatch.position.set(cp.x, THREE.MathUtils.lerp(sheetY + 1.2, cp.y, Math.min(1, le * 3)) - hover * (cp.y - 7), cp.z);
      const fx = 242 / this.patchSize.w, fz = 193 / this.patchSize.d;
      this.planPatch.scale.set(THREE.MathUtils.lerp(5.5, fx, le), 1, THREE.MathUtils.lerp(5.5, fz, le));
      this.planPatch.rotation.z = Math.sin(Math.PI * le) * 0.25;
      // once laid over the ground it fades, so the ground shows through the plan's flat colour
      this.patchMat.uniforms.uOpacity.value = S.plan * Math.min(1, lift * 8) * (1 - 0.82 * (S.planVeil ?? 0));
      this.patchMat.uniforms.uSize.value = THREE.MathUtils.lerp(1.1, 8.5, le);
    }
    this.planTowerMat.uniforms.uRise.value = 1;

    // Map 6 monsoon
    vis('monsoon', S.monsoon);
    this.rainMat.uniforms.uOpacity.value = S.monsoon;
    // the tower of the date in focus is lit and larger; the others step back
    const fi = Math.round(THREE.MathUtils.clamp(S.monsoonFocus, 0, this.rainTowers.length - 1));
    this.rainMat.uniforms.uHighlight.value = fi;
    this.rainMat.uniforms.uDim.value = 0.45;
    this.rainMat.uniforms.uGrey.value = 0;   // the other dates keep their blue and white, only fainter
    this.rainMat.uniforms.uHiSize.value = 0.6;
    this.groups.monsoon.rotation.y = S.monsoonTurn;
    const focus = this.rainTowers[Math.round(THREE.MathUtils.clamp(S.monsoonFocus, 0, this.rainTowers.length - 1))];
    const prior = this.data.manifest.dates.find((d) => d.id === focus.id).rainfall.prior30_mm;
    const monsoonMm = this.data.manifest.dates.find((d) => d.id === focus.id).rainfall.monsoon_mm;
    // the rain itself now falls across the whole screen (rain.js); none in this patch, so the towers stay clear
    this.rain.material.uniforms.uDensity.value = 0 * monsoonMm * prior;
    this.rain.material.uniforms.uTime.value = time;

    // blob specimen (classes chapter)
    this.blob.material.uniforms.uOpacity.value = S.blob;
    this.blob.mesh.visible = S.blob > 0.002;
    // Composition: shift the whole frame on screen (fractions of the viewport; + = right / down)
    // so a map can sit left, right or low while the text takes the other side.
    // setViewOffset also sets camera.aspect = fullWidth / fullHeight, so pass the real aspect.
    const a = this.aspect || this.camera.aspect;
    // Portrait screens: centre the map horizontally, then lift it above bottom text,
    // or drop it below top text (the beats where the story pushes the map down, shiftY > 0.05).
    const portrait = a < 1;
    const sx = portrait ? (S.shiftX ?? 0) * 0.15 : (S.shiftX ?? 0);
    const sy = portrait ? -0.14 + 0.4 * THREE.MathUtils.smoothstep(S.shiftY ?? 0, 0.02, 0.1) : (S.shiftY ?? 0);
    if (Math.abs(sx) > 1e-4 || Math.abs(sy) > 1e-4) this.camera.setViewOffset(a, 1, -sx * a, -sy, a, 1);
    else { this.camera.aspect = a; this.camera.clearViewOffset(); }
    // the blob rides with the camera, so cancel the shift for it and keep it where it was designed
    const halfH = 9 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)), halfW = halfH * this.camera.aspect;
    this.blob.mesh.position.x = view.blobX - sx * 2 * halfW;
    this.blob.mesh.position.y = sy * 2 * halfH;
    this.blob.mesh.rotation.y = time * 0.15;
    this.blob.update(time);

    // camera orbit around a target
    const az = THREE.MathUtils.degToRad(S.az + view.userAz), el = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(S.el + view.userEl, 4, 89.5));
    const t = new THREE.Vector3(S.tx, S.ty, S.tz);
    // Framing is authored for landscape screens; pull back on portrait screens so nothing is cropped.
    const d = S.dist * Math.pow(Math.max(1, 1.25 / this.camera.aspect), 0.85);
    this.camera.position.set(t.x + d * Math.cos(el) * Math.sin(az), t.y + d * Math.sin(el), t.z + d * Math.cos(el) * Math.cos(az));
    this.camera.lookAt(t);
    if (S.roll) this.camera.rotateZ(S.roll);   // banking, while riding a tunnel

    this.updateModel(S, time);
    this.updateTunnel(S, this.pr, time);
    this.groundShade.position.set(S.tx ?? 0, -8, S.tz ?? 0);
    this.groundShade.material.uniforms.uOpacity.value = 0.5 * (S.cosmos ?? 0) * (1 - (S.murk ?? 0)) * this.leave;
  }

  /** Project world labels for the chapter on screen. */
  updateLabels(S, w, h) {
    const v = new THREE.Vector3();
    const clear = (S.murk ?? 0) < 0.35;
    const show = { model: clear && S.model > 0.5, map1: clear && S.map1 > 0.5, stack: clear && S.stack > 0.5, lived: clear && S.lived > 0.5, plan: clear && S.plan * S.planTowers > 0.5, monsoon: clear && S.monsoon > 0.5 };
    const focusStack = Math.round(S.stackFocus), focusRain = Math.round(S.monsoonFocus);
    for (const L of this.labels) {
      let on = show[L.chapter], alpha = 1;
      if (on && L.chapter === 'stack') {
        // every layer near the one in focus keeps its year, fading with distance; the focused
        // year is set larger. Labels hang off each layer's eastern edge on a leader line.
        const i = this.stackLayers.indexOf(L.obj);
        const dist = Math.abs(i - S.stackFocus);
        on = dist < 4.5 && S.stackSpread > 0.55;
        alpha = Math.max(0, 1 - dist / 4.5) * 0.85 + (i === focusStack ? 0.15 : 0);
        L.el.classList.toggle('is-focus', i === focusStack);
      }
      if (on && L.chapter === 'model') on = (this.modelOps?.[L.part] ?? 0) > 0.4 && !(this.swipeOn && (L.part === 'manual' || L.part === 'model'));
      if (on && L.chapter === 'monsoon') on = Math.abs(this.labels.filter((x) => x.chapter === 'monsoon').indexOf(L) - focusRain) <= 1;
      if (!on) { L.el.style.opacity = '0'; continue; }
      if (L.chapter === 'stack') v.copy(L.obj.userData.anchor).applyMatrix4(L.obj.matrixWorld);
      else (L.obj.getWorldPosition ? L.obj.getWorldPosition(v) : v.copy(L.obj.position));
      if (L.chapter === 'map1' || L.chapter === 'lived') v.y += 14;
      v.project(this.camera);
      if (v.z > 1) { L.el.style.opacity = '0'; continue; }
      L.el.style.opacity = String(alpha);
      const px = (v.x * 0.5 + 0.5) * w, py = (-v.y * 0.5 + 0.5) * h;
      L.el.style.transform = L.chapter === 'stack' ? `translate(${px}px, ${py}px) translate(0, -50%)` : `translate(${px}px, ${py}px) translate(-50%, -100%)`;
    }
  }
}

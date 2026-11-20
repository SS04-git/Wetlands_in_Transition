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

export const STACK_RANK = ['water', 'muddy_shallows', 'bed_ground', 'mangrove_canopy', 'land_edge',
  'tree_cover', 'track', 'buildings', 'cage_farms', 'boats'];
const LAYER_GAP = 16;
const MAP1_SCALE = 0.42, MAP1_RADIUS = 175;
const STACK_SCALE = 0.55, STACK_GAP = 34; // metres between observation layers when fully spread
const PLAN_OFFSET = 290;
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
      g.add(pts);
      return { id, m, pts };
    });
    this.classMat = this.classSets[0].m;
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
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uMap: { value: null }, uOpacity: { value: 0 }, uNorth: { value: STRIP_NORTH } }]),
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
        uniform sampler2D uMap; uniform float uOpacity, uNorth;
        varying vec2 vUv; varying float vNorth;
        void main() {
          if (vNorth > uNorth) discard;
          vec3 c = texture2D(uMap, vUv).rgb;
          float l = dot(c, vec3(0.3, 0.59, 0.11));
          c = mix(vec3(l), c, 0.75) * 0.85;                       // a reference, quieter than the traces
          float edge = smoothstep(uNorth, uNorth - 10.0, vNorth);  // soft northern edge of the strip
          gl_FragColor = vec4(c, uOpacity * edge);
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
    // Towers of the four planning shares: one ball = 1% of the planning area.
    const cats = this.data.points.plan_categories;
    const pos = [], rgb = [];
    cats.forEach((c, ci) => {
      const balls = Math.max(1, Math.round(c.share));
      const col = new THREE.Color(PLAN_COLOURS[ci]);
      for (let b = 0; b < balls; b++) {
        const ring = b % 4, lvl = Math.floor(b / 4);
        pos.push(PLAN_OFFSET / 2 - 90 + ci * 60 + (ring % 2) * 5.6, 3 + lvl * 5.6, 150 + Math.floor(ring / 2) * 5.6);
        rgb.push(col.r * 255, col.g * 255, col.b * 255);
      }
      this.addLabel({ position: new THREE.Vector3(PLAN_OFFSET / 2 - 90 + ci * 60 + 2.8, 3 + Math.ceil(balls / 4) * 5.6 + 8, 153) }, `${c.share}%`, 'plan', true);
    });
    const tm = this.mat({ rgb: true, size: 4.2 });
    const towers = makeDots({ n: pos.length / 3, pos: Float32Array.from(pos), cls: new Uint8Array(pos.length / 3), rgb: Uint8Array.from(rgb.map((v) => {
      // rgb was linear from THREE.Color; convert back to sRGB bytes
      const c = v / 255; return Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055));
    })) }, tm);
    g.add(towers);
    this.planTowerMat = tm;
  }

  buildMonsoon() {
    const g = this.group('monsoon');
    const dates = this.data.manifest.dates;
    const pos = [], rgb = [];
    const hex = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b].map((v) => Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055))); };
    const mon = hex(RAIN_LOOK.monsoon), d30 = hex(RAIN_LOOK.prior30); // the two blues of the printed rainfall key
    this.rainTowers = dates.map((d, i) => {
      const a = -Math.PI * 0.9 + (i / (dates.length - 1)) * Math.PI * 1.8;
      const cx = Math.sin(a) * RAIN_RADIUS, cz = Math.cos(a) * RAIN_RADIUS;
      const m = Math.round(d.rainfall.monsoon_mm / 100), p = Math.round(d.rainfall.prior30_mm / 5);
      for (let b = 0; b < m; b++) { pos.push(cx - 2.2, 2 + b * 3.4, cz); rgb.push(...mon); }
      for (let b = 0; b < p; b++) { pos.push(cx + 2.2, 2 + b * 3.4, cz); rgb.push(...d30); }
      const anchor = { position: new THREE.Vector3(cx, 2 + Math.max(m, p) * 3.4 + 7, cz) };
      this.addLabel(anchor, d.id, 'monsoon');
      return { id: d.id, angle: a, x: cx, z: cz, monsoonBalls: m, priorBalls: p };
    });
    const n = pos.length / 3;
    this.rainMat = this.mat({ rgb: true, size: 2.4 });
    g.add(makeDots({ n, pos: Float32Array.from(pos), cls: new Uint8Array(n), rgb: Uint8Array.from(rgb) }, this.rainMat));
    // Falling rain over the estuary; its density follows the 30-day total of the date in focus.
    const rn = 6000, rp = new Float32Array(3 * rn);
    for (let i = 0; i < rn; i++) rp.set([(Math.random() - 0.5) * 260, Math.random() * 160, (Math.random() - 0.5) * 200], 3 * i);
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    this.rain = new THREE.Points(rg, new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uDensity: { value: 0 }, uPR: { value: 1 } },
      vertexShader: `uniform float uTime, uDensity, uPR; varying float vA;
        void main(){ vec3 p = position; p.y = mod(p.y - uTime * 60.0, 160.0);
          float keep = step(fract(sin(dot(position.xz, vec2(12.9898,78.233)))*43758.5453), uDensity);
          vA = keep; vec4 mv = modelViewMatrix*vec4(p,1.); gl_Position = projectionMatrix*mv; gl_PointSize = keep * 2.2 * uPR * (220.0 / -mv.z); }`,
      fragmentShader: `varying float vA; void main(){ vec2 q = gl_PointCoord - 0.5; if (abs(q.x) > 0.12) discard; gl_FragColor = vec4(0.8,0.9,1.0, vA * 0.55 * (1.0 - abs(q.y)*2.0)); }`,
      transparent: true, depthWrite: false,
    }));
    this.rain.frustumCulled = false;
    g.add(this.rain);
  }

  buildBlob() {
    this.blob = new Blob({ presetKey: 'water' });
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
    const N = 16000;
    const g = new THREE.BufferGeometry();
    const rnd = new Float32Array(4 * N);
    for (let i = 0; i < 4 * N; i++) rnd[i] = Math.random();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * N), 3));
    g.setAttribute('aTo', new THREE.BufferAttribute(new Float32Array(3 * N), 3));
    g.setAttribute('aColA', new THREE.BufferAttribute(new Float32Array(3 * N), 3));
    g.setAttribute('aColB', new THREE.BufferAttribute(new Float32Array(3 * N), 3));
    g.setAttribute('aRand', new THREE.BufferAttribute(rnd, 4));
    const m = new THREE.ShaderMaterial({
      uniforms: { uP: { value: 0 }, uTravel: { value: 0 }, uPR: { value: 1 }, uOpacity: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute vec3 aTo; attribute vec3 aColA; attribute vec3 aColB; attribute vec4 aRand;
        uniform float uP, uTravel, uPR, uOpacity;
        varying vec3 vCol; varying float vA;
        void main() {
          vec3 from = (viewMatrix * vec4(position, 1.0)).xyz;
          vec3 to = (viewMatrix * vec4(aTo, 1.0)).xyz;
          // the tunnel: an elliptical tube along the line of sight, its walls thick with elements
          const float L = 1500.0;
          float z = -mod(aRand.z * L - uTravel, L) - 18.0;
          float ang = aRand.x * 6.2831853 + z * 0.0032;
          float r = 34.0 + 34.0 * aRand.y * aRand.y;
          vec3 tube = vec3(cos(ang) * r * 1.35, sin(ang) * r, z);
          // staggered so the map dissolves and re-forms element by element, not all at once
          float k1 = smoothstep(0.02 + aRand.w * 0.14, 0.26 + aRand.w * 0.12, uP);
          float k2 = smoothstep(0.62 + aRand.w * 0.12, 0.88 + aRand.w * 0.1, uP);
          vec3 v = mix(mix(from, tube, k1), to, k2);
          v.z = min(v.z, -2.0);
          vCol = mix(aColA, aColB, smoothstep(0.36, 0.7, uP + (aRand.z - 0.5) * 0.2));
          vA = uOpacity * smoothstep(0.0, 0.05, uP) * (1.0 - smoothstep(0.95, 1.0, uP)) * (0.6 + 0.4 * aRand.y);
          gl_Position = projectionMatrix * vec4(v, 1.0);
          gl_PointSize = clamp(1.6 * uPR * (900.0 / -v.z), 1.0, 20.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vCol; varying float vA;
        void main() {
          vec2 q = gl_PointCoord * 2.0 - 1.0; float r2 = dot(q, q);
          if (r2 > 1.0) discard;
          vec3 n = vec3(q.x, -q.y, sqrt(1.0 - r2));
          float diff = 0.62 + 0.55 * max(dot(n, normalize(vec3(-0.45, 0.65, 0.62))), 0.0);
          gl_FragColor = vec4(vCol * diff, vA * (1.0 - smoothstep(0.78, 1.0, r2)));
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, depthTest: false,
    });
    this.tunnel = new THREE.Points(g, m);
    this.tunnel.frustumCulled = false;
    this.tunnel.renderOrder = 10;
    this.tunnel.visible = false;
    this.scene.add(this.tunnel);
    this.tunnelCache = {};
    this.tunnelShown = '';
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

  updateTunnel(S, pr) {
    const f = S.tunnel ?? 0, i = Math.floor(f), p = f - i;
    const active = p > 0.0005 && p < 0.9995;
    this.tunnel.visible = active;
    if (!active) return;
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
    u.uP.value = p; u.uTravel.value = p * 2600; u.uPR.value = pr ?? 1;
  }

  // ---------- Manual and automated tracing (tools/ml/classify.py) ----------
  // For one date at a time: the hand-traced classes, the classification of the same image by a model
  // that never saw that date, and the cells where the two disagree. Same dots, same class look.
  buildModel() {
    const M = this.data.model;
    this.modelMeta = M;
    const g = this.group('model');
    this.modelParts = {};
    for (const k of ['manual', 'model', 'outside', 'agree', 'disagree']) {
      const holder = new THREE.Group(); g.add(holder);
      this.modelParts[k] = { holder, m: this.mat(k === 'agree' ? { rgb: true, size: 0.75 } : { size: k === 'disagree' ? 1.3 : 0.95 }) };
    }
    this.modelDate = null;
    if (!M) return;
    this.addLabel({ getWorldPosition: (v) => this.modelParts.manual.holder.localToWorld(v.set(118, 4, 0)) }, 'Traced by hand', 'model', true);
    this.labels.at(-1).part = 'manual';
    this.addLabel({ getWorldPosition: (v) => this.modelParts.model.holder.localToWorld(v.set(118, 4, 0)) }, 'Model', 'model', true);
    this.labels.at(-1).part = 'model';
    this.addLabel({ getWorldPosition: (v) => this.modelParts.disagree.holder.localToWorld(v.set(118, 4, 0)) }, 'Disagreement', 'model', true);
    this.labels.at(-1).part = 'disagree';
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

  updateModel(S) {
    const g = this.groups.model;
    g.visible = S.model > 0.002 && !!this.modelMeta;
    if (!g.visible) { this.modelOps = {}; return; }
    const m = S.modelView, sm = THREE.MathUtils.smoothstep;
    const diff = sm(m, 1.2, 1.8);
    const ops = {
      manual: S.model * (1 - diff),
      model: S.model * sm(m, 0.15, 0.85) * (1 - diff),
      outside: S.model * sm(m, 0.15, 0.85) * (1 - diff) * 0.3,
      agree: S.model * diff * 0.55,
      disagree: S.model * diff,
    };
    this.modelOps = ops;
    for (const [k, part] of Object.entries(this.modelParts)) {
      part.m.uniforms.uOpacity.value = ops[k];
      part.holder.visible = ops[k] > 0.004;
    }
    const lift = S.modelSep * 46;
    this.modelParts.model.holder.position.y = lift;
    this.modelParts.outside.holder.position.y = lift;
    this.modelParts.disagree.holder.position.y = 4 + diff * 10;
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
    this.pr = pr;
  }

  /** Apply the scroll state S (see story.js) for this frame. */
  update(S, time, view) {
    this.materials.forEach((m) => { m.uniforms.uTime.value = time; });
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
    this.groundMat.uniforms.uOpacity.value = S.ground;
    this.groundMat.uniforms.uScatter.value = S.groundScatter;
    vis('classes', S.classes);
    const levels = this.levels(S.classSep);
    this.classSets.forEach((set, i) => {
      const u = set.m.uniforms;
      const share = i === 0 ? 1 - (view.classDate ?? 0) : (view.classDate ?? 0);
      u.uOpacity.value = S.classes * share;
      set.pts.visible = u.uOpacity.value > 0.002;
      u.uLevel.value = levels;
      u.uScatter.value = S.classScatter;
      u.uHighlight.value = S.highlight;
      u.uDim.value = S.classDim;
      u.uHiSize.value = S.hiSize;
    });
    this.groups.classes.rotation.y = S.classSpin;
    this.groups.ground.rotation.y = S.classSpin;
    this.dust.material.uniforms.uOpacity.value = S.dust;
    this.dust.material.uniforms.uTime.value = time;

    // Map 1 ring
    vis('map1', S.map1);
    this.groups.map1.rotation.y = S.map1Turn;
    this.map1.forEach((plate) => {
      const u = plate.userData.material.uniforms;
      u.uOpacity.value = S.map1; u.uLevel.value = this.levels(S.map1Sep, 20);
      u.uHighlight.value = S.highlight;
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
    }
    wm.uThreshold.value = S.threshold;
    this.groups.persistence.rotation.y = S.persSpin;

    // Map 3 stack
    vis('stack', S.stack);
    this.stackLayers.forEach((layer, i) => {
      const u = layer.userData.material.uniforms;
      const focus = Math.exp(-Math.pow(i - S.stackFocus, 2) * 0.9);
      layer.userData.focus = focus;
      u.uOpacity.value = S.stack * (0.2 + 0.8 * focus);
      u.uLevel.value = this.levels(S.stackSep * focus, 4.5);
      layer.position.y = layer.userData.baseY * S.stackSpread + focus * S.stackLift;
      layer.scale.setScalar(STACK_SCALE * (0.93 + 0.12 * focus));
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
    this.planMat.uniforms.uOpacity.value = S.plan;
    this.planSheet.position.y = (1 - S.planDrop) * 140;
    this.planSheet.rotation.z = (1 - S.planDrop) * 0.35;
    this.planTowerMat.uniforms.uOpacity.value = S.plan * S.planTowers;
    this.planTowerMat.uniforms.uRise.value = 1;

    // Map 6 monsoon
    vis('monsoon', S.monsoon);
    this.rainMat.uniforms.uOpacity.value = S.monsoon;
    this.groups.monsoon.rotation.y = S.monsoonTurn;
    const focus = this.rainTowers[Math.round(THREE.MathUtils.clamp(S.monsoonFocus, 0, this.rainTowers.length - 1))];
    const prior = this.data.manifest.dates.find((d) => d.id === focus.id).rainfall.prior30_mm;
    this.rain.material.uniforms.uDensity.value = S.monsoon * Math.min(1, prior / 80);
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

    this.updateModel(S);
    this.updateTunnel(S, this.pr);
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
      if (on && L.chapter === 'model') on = (this.modelOps?.[L.part] ?? 0) > 0.4;
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

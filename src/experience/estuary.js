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
import { dotMaterial, makeDots, makeColumns, paletteUniform, MAX_CLASSES } from './dots.js';
import { Blob } from './blobs.js';
import { formatDate } from './data.js';

export const STACK_RANK = ['water', 'muddy_shallows', 'bed_ground', 'mangrove_canopy', 'land_edge',
  'tree_cover', 'track', 'buildings', 'cage_farms', 'boats'];
const LAYER_GAP = 16;
const MAP1_SCALE = 0.42, MAP1_RADIUS = 175;
const STACK_SCALE = 0.55, STACK_GAP = 34; // metres between observation layers when fully spread
const PLAN_OFFSET = 290;
const RAIN_RADIUS = 175;
const PLAN_COLOURS = ['#D98C7A', '#BFD58A', '#8FB8A8', '#8EC9E0']; // swatches from the Map 5 script

export class Estuary {
  constructor(data) {
    this.data = data;
    const { manifest } = data;
    this.classes = manifest.classes;
    this.idx = Object.fromEntries(this.classes.map((c, i) => [c.key, i]));
    this.palette = paletteUniform(this.classes);
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
  }

  mat(opts) { const m = dotMaterial(this.palette, opts); this.materials.push(m); return m; }
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
      const m = this.mat({ size: 0.85 });
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
    const g = this.group('lived');
    const keep = new Set(['tree_cover', 'track', 'buildings', 'boats', 'cage_farms', 'land_edge'].map((k) => this.idx[k]));
    this.lived = ['2011_04_11', '2025_02_25'].map((id, i) => {
      const src = this.data.dots[id];
      const sel = [];
      for (let j = 0; j < src.n; j++) if (keep.has(src.cls[j])) sel.push(j);
      const pos = new Float32Array(3 * sel.length), cls = new Uint8Array(sel.length);
      sel.forEach((j, k) => { pos.set(src.pos.subarray(3 * j, 3 * j + 3), 3 * k); cls[k] = src.cls[j]; });
      const m = this.mat({ size: 0.7, bob: 0.15 });
      const s = m.uniforms.uClassSize.value; s[this.idx.boats] = 4.2; s[this.idx.cage_farms] = 4.6; s[this.idx.buildings] = 4.8;
      const deck = new THREE.Group();
      deck.add(makeDots({ n: sel.length, pos, cls }, m));
      deck.position.y = i * 46;
      deck.userData = { id, material: m };
      g.add(deck);
      this.addLabel(deck, id, 'lived');
      return deck;
    });
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
    const mon = [168, 194, 205], d30 = [216, 194, 154]; // neutral support tones (not class colours)
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
    this.lived.forEach((deck, i) => {
      const u = deck.userData.material.uniforms;
      const f = i === 0 ? 1 - S.livedFocus : S.livedFocus;
      u.uOpacity.value = S.lived * (0.25 + 0.75 * f);
      u.uLevel.value = this.levels(S.livedSep, 7);
      u.uHighlight.value = S.highlight;
      deck.position.y = i * 46 * S.livedSpread;
    });

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
  }

  /** Project world labels for the chapter on screen. */
  updateLabels(S, w, h) {
    const v = new THREE.Vector3();
    const clear = (S.murk ?? 0) < 0.35;
    const show = { map1: clear && S.map1 > 0.5, stack: clear && S.stack > 0.5, lived: clear && S.lived > 0.5, plan: clear && S.plan * S.planTowers > 0.5, monsoon: clear && S.monsoon > 0.5 };
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

// The estuary world: every map chapter is built here from the processed research data, in one
// scene and one coordinate frame (metres; x = east, y = up, z = -north).
//
//  ground        the 25 Feb 2025 screenshot resampled as coloured dots (arrival)
//  classes       the traced classes of 25 Feb 2025 as clustered dots, separable into layers (Map 1 intro)
//  map1          Map 1's six representative dates as six dotted landscapes on a turning ring
//  persistence   Map 2: per 1.5 m cell, one ball for every date the cell was traced as water
//                (or as mangrove canopy) - a count, never depth or elevation
//  stack         Map 3: all 17 dates stacked on a time axis, monsoon months as cloud between them
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
const STACK_SCALE = 0.5, STACK_PER_YEAR = 24;
const PLAN_OFFSET = 290;
const RAIN_RADIUS = 175;
const PLAN_COLOURS = ['#D98C7A', '#BFD58A', '#8FB8A8', '#8EC9E0']; // swatches from the Map 5 script

const years = (iso) => { const d = new Date(`${iso}T00:00:00Z`); return d.getUTCFullYear() + (d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 31557600000; };

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
    const g = this.group('classes');
    this.classMat = this.mat({ size: 0.95, bob: 0.25 });
    const size = this.classMat.uniforms.uClassSize.value;
    size[this.idx.boats] = 3.4; size[this.idx.cage_farms] = 3.8; size[this.idx.buildings] = 3.6; size[this.idx.land_edge] = 1.2;
    g.add(makeDots(this.data.dots['2025_02_25'], this.classMat, { yOffset: 0.6 }));
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
    // area for each threshold k (cells with water count >= k) x 2.25 m2, from the actual grid
    this.waterAreaByK = this.data.points.persistence.water_area_by_threshold_m2;
  }

  buildStack() {
    const g = this.group('stack');
    const dates = this.data.manifest.dates;
    const y0 = years(dates[0].iso);
    this.stackLayers = dates.map((d) => {
      const m = this.mat({ size: 0.75 });
      const s = m.uniforms.uClassSize.value; s[this.idx.boats] = 2.2; s[this.idx.cage_farms] = 2.4; s[this.idx.buildings] = 2.2;
      const pts = makeDots(this.data.dots[d.id], m);
      const layer = new THREE.Group();
      layer.add(pts);
      layer.scale.setScalar(STACK_SCALE);
      layer.position.y = (years(d.iso) - y0) * STACK_PER_YEAR;
      layer.userData = { id: d.id, iso: d.iso, material: m, baseY: layer.position.y };
      g.add(layer);
      this.addLabel(layer, d.id, 'stack');
      return layer;
    });
    this.stackHeight = (years(dates.at(-1).iso) - y0) * STACK_PER_YEAR;
    // Monsoon months (June-September) have no usable imagery: cloud bands between the sheets.
    const cloud = [];
    const yFirst = new Date(`${dates[0].iso}T00:00:00Z`).getUTCFullYear();
    for (let yr = yFirst; yr <= 2024; yr++) {
      const a = (yr + 151 / 365.25 - y0) * STACK_PER_YEAR, b = (yr + 273 / 365.25 - y0) * STACK_PER_YEAR;
      if (b < 0 || a > this.stackHeight) continue;
      for (let i = 0; i < 1400; i++) {
        const r = Math.sqrt(Math.random()) * 75, t = Math.random() * Math.PI * 2;
        cloud.push(Math.cos(t) * r, a + Math.random() * (b - a), Math.sin(t) * r * 0.78);
      }
    }
    const n = cloud.length / 3;
    const cm = this.mat({ rgb: true, size: 1.4 });
    const rgb = new Uint8Array(3 * n).fill(232);
    const pts = makeDots({ n, pos: Float32Array.from(cloud), cls: new Uint8Array(n), rgb }, cm);
    g.add(pts);
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
        pos.push(PLAN_OFFSET / 2 - 66 + ci * 44 + (ring % 2) * 5.6, 3 + lvl * 5.6, 150 + Math.floor(ring / 2) * 5.6);
        rgb.push(col.r * 255, col.g * 255, col.b * 255);
      }
      this.addLabel({ position: new THREE.Vector3(PLAN_OFFSET / 2 - 66 + ci * 44 + 2.8, 3 + Math.ceil(balls / 4) * 5.6 + 8, 153) }, `${c.name} ${c.share}%`, 'plan', true);
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
    this.blob.mesh.scale.setScalar(1.65);
    this.blob.material.uniforms.uOpacity.value = 0;
    this.camera.add(this.blob.mesh);
  }

  addLabel(obj, text, chapter, raw = false) {
    const el = document.createElement('span');
    el.className = `world-label world-label--${chapter}`;
    el.textContent = raw ? text : formatDate(text.replaceAll('_', '-'));
    el.dataset.id = raw ? '' : text;
    document.querySelector('#labels').append(el);
    this.labels.push({ el, obj, chapter });
  }

  setSize(aspect, pr) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.materials.forEach((m) => { m.uniforms.uPixelRatio.value = pr; });
    this.rain.material.uniforms.uPR.value = pr;
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
    const cm = this.classMat.uniforms;
    cm.uOpacity.value = S.classes;
    cm.uLevel.value = this.levels(S.classSep);
    cm.uScatter.value = S.classScatter;
    cm.uHighlight.value = S.highlight;
    this.groups.classes.rotation.y = S.classSpin;
    this.groups.ground.rotation.y = S.classSpin;

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
    const wm = this.persWater.m.uniforms, mm = this.persMangrove.m.uniforms;
    wm.uOpacity.value = S.pers * (1 - S.persMode);
    mm.uOpacity.value = S.pers * S.persMode;
    this.persWater.pts.scale.y = Math.max(0.001, S.persRise);
    this.persMangrove.pts.scale.y = Math.max(0.001, S.persRise);
    wm.uThreshold.value = S.threshold;
    this.groups.persistence.rotation.y = S.persSpin;

    // Map 3 stack
    vis('stack', S.stack);
    this.stackLayers.forEach((layer, i) => {
      const u = layer.userData.material.uniforms;
      const focus = Math.exp(-Math.pow(i - S.stackFocus, 2) * 1.4);
      u.uOpacity.value = S.stack * (0.18 + 0.82 * focus);
      u.uLevel.value = this.levels(S.stackSep * focus, 9);
      layer.position.y = layer.userData.baseY * S.stackSpread;
      layer.rotation.y = S.stackTwist * (i / 16) + time * 0.02;
    });
    this.monsoonCloudMat.uniforms.uOpacity.value = S.stack * 0.22 * S.stackSpread;

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
    this.blob.mesh.position.x = view.blobX;
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
      let on = show[L.chapter];
      if (on && L.chapter === 'stack') on = this.stackLayers.findIndex((l) => l === L.obj) === focusStack;
      if (on && L.chapter === 'monsoon') on = Math.abs(this.labels.filter((x) => x.chapter === 'monsoon').indexOf(L) - focusRain) <= 1;
      if (!on) { L.el.style.opacity = '0'; continue; }
      (L.obj.getWorldPosition ? L.obj.getWorldPosition(v) : v.copy(L.obj.position));
      if (L.chapter === 'map1' || L.chapter === 'stack' || L.chapter === 'lived') v.y += 14;
      v.project(this.camera);
      if (v.z > 1) { L.el.style.opacity = '0'; continue; }
      L.el.style.opacity = '1';
      L.el.style.transform = `translate(${(v.x * 0.5 + 0.5) * w}px, ${(-v.y * 0.5 + 0.5) * h}px) translate(-50%, -100%)`;
    }
  }
}

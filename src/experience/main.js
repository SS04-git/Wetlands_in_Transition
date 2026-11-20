// Wetlands in Transition: one renderer, four worlds composited by scroll.
//   space -> cloud layer -> estuary (all six maps and the model chapter); the tunnels between
//   chapters are made of the maps' own dots (estuary.js, buildTunnel).
import * as THREE from 'three';
import gsap from 'gsap';
import { loadAll, formatDate } from './data.js';
import { Space } from './space.js';
import { CloudTunnel } from './tunnels.js';
import { Estuary, MAP_CLASSES, PLAN_COLOURS, LAND_COLOUR } from './estuary.js';
import { publishCssColours, lookColor, RAIN_LOOK, CLASS_LOOK } from './classLook.js';
import { createLegend } from './legend.js';
import { CHAPTERS, TOTAL, SPECIMEN_ORDER, createState, buildTimeline, scrollToTime, scrollYForTime } from './story.js';
import { createGauge } from './nav.js';

// Atmosphere tints per chapter (blurred glows behind the canvas): restrained, cool, sometimes warm.
const GLOWS = {
  arrival: ['#1b6b80', '#232a66', '#4d6a5a'], classes: ['#1b6b80', '#232a66', '#4d6a5a'],
  map1: ['#1b6b80', '#2a2d6b', '#6b5a3a'], map2: ['#17708a', '#1f2f62', '#2f6a6a'],
  map3: ['#2b2f72', '#16606f', '#4a3f6e'], map4: ['#6b4a2e', '#1b5a66', '#4a3a5a'],
  map5: ['#6a3e3a', '#22386a', '#5a5a3a'], map6: ['#2c4f7a', '#1d6a7a', '#3a3f6e'], model: ['#3a2f6e', '#16606f', '#5a4a3a'], finale: ['#1b6b80', '#2a2d6b', '#6b5a3a'],
};

const $ = (s) => document.querySelector(s);
const canvas = $('#world');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.autoClear = false;
renderer.setClearColor(0x000000, 0);

publishCssColours();
const S = createState();
const view = { userAz: 0, userEl: 0, blobX: 0, classDate: 0, mapKey: null };
let gauge = null, legend = null, lastAtmo = -1;
function setGlows(c) {
  const root = document.documentElement.style;
  ['--glow-a', '--glow-b', '--glow-c'].forEach((k, i) => root.setProperty(k, c[i]));
}
const space = new Space();
const clouds = new CloudTunnel();
let estuary, tl, data;

function setLoader(f, note) {
  $('#loader .loader-bar i').style.width = `${Math.round(f * 100)}%`;
  if (note) $('#loader-note').textContent = note;
}

function resize() {
  const w = innerWidth, h = innerHeight;
  // Render budget ~4.2 MP (about 2720x1530): measured 25-60 fps at native 4K on Intel UHD graphics,
  // so large screens and TVs render slightly below native and the browser scales up.
  const pr = Math.min(devicePixelRatio || 1, 2, Math.sqrt(4.2e6 / (w * h)));
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h, false);
  const aspect = w / h;
  space.setSize(aspect, pr);
  clouds.setSize(aspect);
  estuary?.setSize(aspect, pr);
  view.blobX = aspect > 1.2 ? 1.15 : 0;
}
addEventListener('resize', resize);

// ---- drag to turn the estuary (eases back to the authored view when released) ----
let drag = null;
canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, az: view.userAz, el: view.userEl }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  view.userAz = drag.az - (e.clientX - drag.x) * 0.25;
  view.userEl = THREE.MathUtils.clamp(drag.el + (e.clientY - drag.y) * 0.15, -40, 40);
});
const endDrag = () => { drag = null; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

// ---- chapter UI ----
let specimenShown = -1, chapterIdx = -1, userThreshold = null, userLived = null, userModelView = null, modelDate = null;
function showSpecimen(i) {
  const key = SPECIMEN_ORDER[i];
  const cls = data.manifest.classByKey[key];
  estuary.blob.morphTo(key, gsap, 0.9);
  const e2025 = data.manifest.dates.at(-1), e2011 = data.manifest.dates[0];
  const src = (e2025.counts[key] ?? 0) > 0 ? e2025 : e2011;
  $('#specimen-count').textContent = `Class ${i + 1} of ${SPECIMEN_ORDER.length} · traced by hand, with the same rules on every date`;
  $('#specimen-name').textContent = cls.label;
  $('#specimen-def').textContent = cls.definition;
  const n = src.counts[key] ?? 0;
  $('#specimen-stat').textContent = cls.geometry === 'polygon'
    ? `${Math.round(src.area_m2[key]).toLocaleString('en-GB')} m² traced on ${formatDate(src.iso)}`
    : cls.geometry === 'line' ? `Traced as a line on every date` : `${n} recorded on ${formatDate(src.iso)}`;
  const tint = new THREE.Color(lookColor(key)).lerp(new THREE.Color('#0d2c3b'), 0.72);
  gsap.to(document.body, { backgroundColor: `#${tint.getHexString()}`, duration: 0.8, overwrite: 'auto' });
  estuary.scene.fog.color.copy(new THREE.Color(`#${tint.getHexString()}`));
  setGlows([lookColor(key), '#232a66', '#0d2c3b']);
  S.highlight = estuary.idx[key];
  // the small reference shows the date this class was measured on
  gsap.to(view, { classDate: src === e2011 ? 1 : 0, duration: 0.6, overwrite: true });
  $('#specimen-inset').textContent = `Lit in the reference: ${cls.label.toLowerCase()} on ${formatDate(src.iso)}`;
}

function chapterAt(t) {
  let idx = 0;
  CHAPTERS.forEach((c, i) => { if (t >= c.at - 0.05) idx = i; });
  return idx;
}
function onChapter(idx) {
  const c = CHAPTERS[idx];
  gauge?.setChapter(c.id);
  view.mapKey = c.id; // each map shows only the classes of its printed legend
  legend?.show(c.id);
  if (GLOWS[c.id] && c.id !== 'classes') setGlows(GLOWS[c.id]);
  if (c.id !== 'classes') {
    gsap.to(document.body, { backgroundColor: c.bg, duration: 0.8, overwrite: 'auto' });
    estuary.scene.fog.color.set(c.bg === '#dfe6e8' ? '#0d2c3b' : c.bg);
    S.highlight = -1; // nothing stays singled out once the classes chapter is left
    specimenShown = -1;
    gsap.to(view, { classDate: 0, duration: 0.6, overwrite: true });
  }
  document.body.classList.toggle('light', c.id === 'clouds');
  if (c.id !== 'map2') userThreshold = null;
  if (c.id !== 'map4') userLived = null;
  if (c.id !== 'model') userModelView = null;
  window.__THREE_DEVTOOLS__?.dispatchEvent(new CustomEvent('observe', { detail: idx < 3 ? space.scene : estuary.scene }));
}

function bindControls() {
  gauge = createGauge($('#gauge'), CHAPTERS, TOTAL, (id) => {
    const c = CHAPTERS.find((x) => x.id === id);
    scrollToTime(tl, c.at + (c.map && c.map > 1 ? 0.05 : 0.1));
  });
  const files = {
    1: 'Map 1 - The Estuary as a Landscape.png', 2: 'Map 2 - Patterns of Wetness and Vegetation.png',
    3: 'Map 3 - The Estuary Through Time.png', 4: 'Map 4 - The Estuary as a Lived Landscape.png',
    5: 'Map 5 - The Estuary Between Plan and Ground.png', 6: 'Map 6 - The Estuary and the Monsoon.png',
  };
  document.querySelectorAll('.open-map').forEach((b) => b.addEventListener('click', () => {
    const n = b.dataset.map;
    const img = $('#map-viewer-img');
    img.src = `/assets/maps/${n}/${encodeURIComponent(files[n])}`;
    img.alt = files[n].replace('.png', '');
    $('#map-viewer').showModal();
  }));
  const slider = $('#threshold');
  slider.addEventListener('input', () => { userThreshold = +slider.value; });
  document.querySelectorAll('[data-lived]').forEach((b) => b.addEventListener('click', () => { userLived = +b.dataset.lived; }));

  // Map 4 comparison table (counts straight from the traced data)
  const d11 = data.manifest.dates[0], d25 = data.manifest.dates.at(-1);
  const rows = ['boats', 'cage_farms', 'buildings'].map((k) => {
    const c = data.manifest.classByKey[k];
    return `<span class="k"><i style="background:${lookColor(k)}"></i>${c.label}</span><span class="v">${d11.counts[k] ?? 0}</span><span class="v">${d25.counts[k] ?? 0}</span>`;
  });
  $('#lived-compare').innerHTML = `<span></span><span class="h">2011</span><span class="h">2025</span>${rows.join('')}`;
  // hectares from the Master Plan 2031 land-use table (as recorded in the Map 5 script)
  const HA = { 'Developed Area': '541.90 ha', 'Agriculture Area': '634.48 ha', 'Marshy Area': '28.06 ha', 'Water Sheet': '537.30 ha' };
  if (data.model) bindModel();
  $('#plan-legend').innerHTML = data.points.plan_categories.map((c, i) => `<li><i style="background:${PLAN_COLOURS[i]}"></i>${c.name}<b>${c.share}%</b><span class="note">&nbsp;${HA[c.name]}</span></li>`).join('');
}

// ---- Manual and automated tracing: every figure comes from model/metrics.json ----
const pct = (v) => (v == null ? '–' : `${Math.round(v * 100)}%`);
const MODEL_LABEL = (k) => (k === 'land' ? 'Land beyond the edge' : data.manifest.classByKey[k].label);
function bindModel() {
  const M = data.model.metrics;
  const ids = data.manifest.dates.map((d) => d.id);
  // the date with the median overall accuracy is shown first (neither the best nor the worst)
  const byAcc = ids.filter((id) => M.per_date[id]).sort((a, b) => M.per_date[a].all.overall_accuracy - M.per_date[b].all.overall_accuracy);
  modelDate = byAcc[Math.floor((byAcc.length - 1) / 2)];
  estuary.setModelDate(modelDate);
  const step = (dir) => { const i = ids.indexOf(modelDate); modelDate = ids[(i + dir + ids.length) % ids.length]; estuary.setModelDate(modelDate); updateModelText(); };
  $('#model-prev').addEventListener('click', () => step(-1));
  $('#model-next').addEventListener('click', () => step(1));
  document.querySelectorAll('[data-model-view]').forEach((b) => b.addEventListener('click', () => { userModelView = +b.dataset.modelView; }));
  // pooled results over all 17 held-out dates
  const P = M.pooled.classes;
  const head = '<thead><tr><th>Class</th><th>IoU</th><th>Precision</th><th>Recall</th><th>F1</th><th>Dates</th></tr></thead>';
  const rows = data.model.classes.filter((k) => P[k]).map((k) => {
    const r = P[k], col = k === 'land' ? LAND_COLOUR : lookColor(k);
    return `<tr><td><i class="key" style="background:${col}"></i>${MODEL_LABEL(k)}</td><td>${r.iou.toFixed(2)}</td><td>${pct(r.precision)}</td><td>${pct(r.recall)}</td><td>${r.f1.toFixed(2)}</td><td>${r.dates_traced}</td></tr>`;
  }).join('');
  $('#model-table').innerHTML = `<caption>All 17 dates, each held out from its own model</caption>${head}<tbody>${rows}</tbody>`;
  const E = M.land_edge;
  $('#model-summary').innerHTML = `Overall agreement ${pct(M.pooled.overall_accuracy)} of traced cells (${pct(M.pooled_interior.overall_accuracy)} more than 2 m inside a traced boundary), against ${pct(M.baseline_overall_accuracy)} for a colour-only baseline.` +
    (E ? `<br>Land edge: the model's land / water boundary lies a median ${E.median_of_medians_m.toFixed(1)} m from the traced edge; ${pct(E.within_5m)} of the traced edge is within 5 m.` : '');
  // what the confusion matrix says about the hardest classes (fractions of traced cells)
  const C = M.confusion, ci = (k) => C.classes.indexOf(k);
  const share = (from, to) => { const row = C.rows_manual_cols_model[ci(from)]; const tot = row.reduce((a, b) => a + b, 0); return tot ? row[ci(to)] / tot : 0; };
  $('#model-summary').innerHTML += `<br>Muddy shallows, the class defined by what cannot be clearly identified, is split by the model between water (${pct(share('muddy_shallows', 'water'))}) and bed ground (${pct(share('muddy_shallows', 'bed_ground'))}). Tree cover and track, traced on only two dates, are read as land.`;
  $('#model-note').textContent = 'Every figure here is computed by tools/ml/classify.py from the tracings and images, on dates the model never saw. The images are approximately registered and their tide state is unknown, so part of any disagreement lies in the reference, not the model. Boats, cage farms and buildings were not modelled.';
  updateModelText();
}
function updateModelText() {
  const M = data.model.metrics, r = M.per_date[modelDate];
  const d = data.manifest.dates.find((x) => x.id === modelDate);
  $('#model-date').textContent = formatDate(d.iso);
  $('#model-step-date').textContent = formatDate(d.iso);
  const areas = data.model.classes.filter((k) => k !== 'land' && r.all.classes[k] && r.all.classes[k].area_manual_m2 > 0)
    .map((k) => `<span><i class="key" style="background:${lookColor(k)}"></i>${MODEL_LABEL(k).toLowerCase()} ${Math.round(r.all.classes[k].area_manual_m2).toLocaleString('en-GB')} → ${Math.round(r.all.classes[k].area_model_m2).toLocaleString('en-GB')} m²</span>`);
  $('#model-date-detail').innerHTML = `Agreement with the tracing: ${pct(r.all.overall_accuracy)} of traced cells. Traced → model area: ${areas.join(' ')}`;
}

function updateReadouts(t) {
  // Map 2 threshold
  const k = userThreshold ?? Math.max(1, Math.round(S.threshold || 1));
  $('#threshold-out').textContent = k;
  if (userThreshold === null) $('#threshold').value = k;
  const area = estuary.waterAreaByK[String(k)];
  const r = data.points.persistence.rect;
  const rectArea = (r[2] - r[0]) * (r[3] - r[1]);
  $('#threshold-area').textContent = `${Math.round(area).toLocaleString('en-GB')} m² of the ${Math.round(rectArea).toLocaleString('en-GB')} m² study rectangle`;
  // Map 2 panel in view
  const pm = Math.round(S.persMode);
  $('#pers-mode').textContent = ['Water persistence', 'Mangrove canopy persistence', 'Exposed sediment frequency'][pm];
  // Map 3 date in focus: what was traced on it (straight from the traced data)
  const di = Math.round(THREE.MathUtils.clamp(S.stackFocus, 0, 16));
  if (di !== updateReadouts.di) {
    updateReadouts.di = di;
    const d = data.manifest.dates[di];
    $('#stack-date').textContent = formatDate(d.iso);
    const cls = data.manifest.classByKey;
    const parts = ['water', 'muddy_shallows', 'bed_ground', 'mangrove_canopy'].filter((k) => d.counts[k])
      .map((k) => `<span><i class="key" style="background:${lookColor(k)}"></i>${cls[k].label.toLowerCase()}</span>`);
    const pts = ['boats', 'cage_farms'].filter((k) => d.counts[k]).map((k) => `<span><i class="key" style="background:${lookColor(k)}"></i>${d.counts[k]} ${cls[k].label.toLowerCase()}</span>`);
    const gap = estuary.monsoonGaps.find((g) => g.after === di - 1);
    $('#stack-detail').innerHTML = `Observation ${di + 1} of 17. Traced: ${[...parts, ...pts].join(' ')}` +
      (gap ? `<br>A monsoon passed between this and the previous observation.` : '');
  }
  // Map 6 date in focus
  const ri = Math.round(THREE.MathUtils.clamp(S.monsoonFocus, 0, 16));
  const rd = data.manifest.dates[ri];
  $('#rain-date').textContent = formatDate(rd.iso);
  $('#rain-detail').textContent = `Monsoon ${rd.rainfall.monsoon_year}: ${Math.round(rd.rainfall.monsoon_mm).toLocaleString('en-GB')} mm · 30 days before: ${rd.rainfall.prior30_mm.toFixed(1)} mm`;
  legend?.setPersMode(S.persMode);
  // model view buttons
  if (data.model) {
    const mv = userModelView ?? Math.round(S.modelView);
    document.querySelectorAll('[data-model-view]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.modelView === mv)));
  }
  // Map 4 buttons
  const lf = userLived ?? (S.livedFocus > 0.5 ? 1 : 0);
  document.querySelectorAll('[data-lived]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.lived === lf)));
}

const timer = new THREE.Timer();
function render(now) {
  timer.update(now);
  const time = timer.getElapsed();
  const t = tl.time();

  // user overrides inside the interactive chapters
  const frame = { ...S };
  if (userThreshold !== null) frame.threshold = userThreshold;
  if (userLived !== null) frame.livedFocus = THREE.MathUtils.lerp(S.livedFocus, userLived, 1);
  if (userModelView !== null) { frame.modelView = userModelView; frame.modelSep = userModelView === 1 ? 1 : userModelView === 2 ? 0.45 : 0; }
  if (!drag) { view.userAz *= 0.97; view.userEl *= 0.97; }

  const idx = chapterAt(t);
  if (idx !== chapterIdx) { chapterIdx = idx; onChapter(idx); }
  if (CHAPTERS[idx].id === 'classes') {
    const si = Math.round(S.specimen);
    if (si !== specimenShown) { specimenShown = si; showSpecimen(si); }
    frame.highlight = estuary.idx[SPECIMEN_ORDER[si]];
  }

  if (Math.abs(S.atmo - lastAtmo) > 0.004) { lastAtmo = S.atmo; document.documentElement.style.setProperty('--atmo', S.atmo.toFixed(3)); }

  renderer.clear();
  if (S.space > 0.002) {
    space.update(time, S.approach);
    renderer.render(space.scene, space.camera);
  }
  if (S.estuary > 0.002) {
    estuary.scene.fog.density = 0.0005 + S.murk * 0.012 + (1 - S.estuary) * 0.01;
    estuary.update(frame, time, view);
    renderer.clearDepth();
    renderer.render(estuary.scene, estuary.camera);
    estuary.updateLabels(frame, innerWidth, innerHeight);
  } else {
    estuary.updateLabels({ map1: 0, stack: 0, lived: 0, plan: 0, planTowers: 0, monsoon: 0, stackFocus: 0, monsoonFocus: 0 }, innerWidth, innerHeight);
  }
  if (S.cloudOp > 0.002) {
    clouds.update(time, S.cloudP, S.cloudOp, S.tint);
    renderer.clearDepth();
    renderer.render(clouds.scene, clouds.camera);
  }
  updateReadouts(t);
}

async function init() {
  setLoader(0.05, 'Loading the Earth');
  await space.load('/assets/earth.opt.glb');
  clouds.bake(renderer);
  resize();
  renderer.setAnimationLoop((now) => {
    // render the resting Earth while the research data loads
    if (!tl) { timer.update(now); renderer.clear(); space.update(timer.getElapsed(), 0); renderer.render(space.scene, space.camera); }
  });
  setLoader(0.2, 'Loading the traced observations');
  data = await loadAll((f) => setLoader(0.2 + f * 0.7));
  setLoader(0.92, 'Building the estuary');
  estuary = new Estuary(data);
  window.__THREE_DEVTOOLS__?.dispatchEvent(new CustomEvent('observe', { detail: estuary.scene }));
  resize();
  bindControls();
  legend = createLegend($('#legend'), { manifest: data.manifest, planCategories: data.points.plan_categories, MAP_CLASSES, PLAN_COLOURS, CLASS_LOOK, RAIN_LOOK, LAND_COLOUR, modelClasses: data.model?.classes });
  tl = buildTimeline(S, {
    stackHeight: estuary.stackHeight,
    mangroveCentre: estuary.mangroveCentre,
    onProgress: (p) => gauge.setProgress(p),
  });
  gauge.setProgress(0);
  // compile shaders up front so the first transitions do not stall
  renderer.compile(estuary.scene, estuary.camera);
  renderer.compile(clouds.scene, clouds.camera);
  renderer.setAnimationLoop(render);
  setLoader(1, 'Ready');
  $('#loader').classList.add('done');
  if (import.meta.env.DEV) window.__wit = { S, tl, estuary, space, renderer, gsap, goto: (t) => { window.scrollTo(0, scrollYForTime(tl, t)); } };
}

init().catch((err) => {
  console.error(err);
  setLoader(1, `The experience could not start: ${err.message}`);
});

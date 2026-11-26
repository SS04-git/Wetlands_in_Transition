// Wetlands in Transition: one renderer, four worlds composited by scroll.
//   space -> cloud layer -> estuary (all six maps and the model chapter); the tunnels between
//   chapters are made of the maps' own dots (estuary.js, buildTunnel).
import { createMapViewer } from './mapviewer.js';
import { startLoaderArt } from './loader.js';
import { fitBeats } from './fit.js';
import * as THREE from 'three';
import gsap from 'gsap';
import { loadAll, formatDate } from './data.js';
import { Space } from './space.js';
import { CloudTunnel } from './tunnels.js';
import { Estuary, MAP_CLASSES, PLAN_COLOURS, LAND_COLOUR } from './estuary.js';
import { publishCssColours, lookColor, RAIN_LOOK, CLASS_LOOK } from './classLook.js';
import { createLegend } from './legend.js';
import { createDateStrip } from './datestrip.js';
import { renderTrends, renderConfusion, renderScenario, renderScenarioTable } from './mlcharts.js';
import { CHAPTERS, TOTAL, SPECIMEN_ORDER, createState, buildTimeline, jumpToTime, scrollYForTime } from './story.js';
import { createGauge } from './nav.js';
import { Cosmos } from './cosmos.js';
import { Ambience } from './ambience.js';
import { ScreenRain } from './rain.js';

// Atmosphere tints per chapter (blurred glows behind the canvas): restrained, cool, sometimes warm.
const GLOWS = {
  arrival: ['#1b6b80', '#232a66', '#4d6a5a'], classes: ['#1b6b80', '#232a66', '#4d6a5a'],
  map1: ['#1b6b80', '#2a2d6b', '#3f6a66'], map2: ['#17708a', '#1f2f62', '#2f6a6a'],
  map3: ['#22567a', '#16606f', '#3a3f6e'], map4: ['#1d6a72', '#25376a', '#3f5a62'],
  map5: ['#1f5f78', '#2a306a', '#3c5c66'], map6: ['#2c4f7a', '#1d6a7a', '#3a3f6e'], model: ['#25507a', '#16606f', '#3a4a66'], finale: ['#1b6b80', '#2a2d6b', '#3f6a66'],
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
  cosmos?.setTint(c[0], c[1]);
}
const space = new Space();
const clouds = new CloudTunnel();
const cosmos = new Cosmos();
let estuary, tl, data;

// ---- Loading (see index.html): the opening title on black with a progress line; the black lifts when ready ----
const loading = { shown: 0, target: 0, alpha: 0, booting: true };
document.body.classList.add('loading');
const loaderArt = startLoaderArt($('#loader-art'), () => loading.shown, (n) => {
  const el = $('#loader-count'); if (el) el.textContent = n >= 17 ? 'All 17 waterlines' : `Waterline ${Math.max(1, n)} of 17`;
}, { y: 0.56, calm: true, perLine: 0.24 });
document.documentElement.style.overflow = 'hidden';   // no scrolling until the story is ready
function setLoader(f, note) {
  loading.target = Math.max(loading.target, f);
  if (note) { loading.note = note; if (note !== 'Ready') $('#loader-note').textContent = note; }   // 'Ready' waits for the last line
}

// Automatic quality: the page watches its own frame time and, when frames run slow, renders at a
// slightly lower resolution (the browser scales the image up); when there is room again it goes
// back up. So the same site stays smooth on a laptop's built-in graphics and sharp on a fast card.
const quality = { scale: 1, ema: 16, last: 0, checked: 0 };
function trackFrame(now) {
  const dt = now - (quality.last || now);
  quality.last = now;
  if (dt <= 0 || dt > 120 || document.hidden) return;   // skip pauses and hidden tabs
  quality.ema += (dt - quality.ema) * 0.05;
  if (now - quality.checked < 1500) return;
  quality.checked = now;
  const prev = quality.scale;
  if (quality.ema > 21 && quality.scale > 0.55) quality.scale = Math.max(0.55, quality.scale * 0.85);
  else if (quality.ema < 13.5 && quality.scale < 1) quality.scale = Math.min(1, quality.scale * 1.1);
  if (quality.scale !== prev) resize();
}

function resize() {
  const w = innerWidth, h = innerHeight;
  // Render budget ~3 MP (about 2300x1300): large screens and TVs render slightly below native and
  // the browser scales up; automatic quality (above) lowers it further only when frames run slow.
  const pr = Math.min(devicePixelRatio || 1, 2, Math.sqrt(3.0e6 / (w * h))) * quality.scale;
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h, false);
  const aspect = w / h;
  space.setSize(aspect, pr);
  clouds.setSize(aspect);
  cosmos.setSize(w, h, pr);
  estuary?.setSize(aspect, pr);
  view.blobX = aspect > 1.2 ? 1.15 : 0;
}
addEventListener('resize', resize);
let fitTimer = 0;
addEventListener('resize', () => { clearTimeout(fitTimer); fitTimer = setTimeout(() => fitBeats(), 200); });

// ---- looking around with the pointer (a gentle turn towards it) ----
const look = { x: 0, y: 0, tx: 0, ty: 0 };
addEventListener('pointermove', (e) => { look.tx = (e.clientX / innerWidth) * 2 - 1; look.ty = (e.clientY / innerHeight) * 2 - 1; });
document.documentElement.addEventListener('pointerleave', () => { look.tx = 0; look.ty = 0; });
const ambience = new Ambience();
const screenRain = new ScreenRain();

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
  $('#specimen-count').textContent = `Class ${i + 1} of ${SPECIMEN_ORDER.length}`;
  $('#specimen-name').textContent = cls.label;
  $('#specimen-def').textContent = cls.definition;
  const n = src.counts[key] ?? 0;
  // one short line beside the map: where the class is lit and how much was traced
  const name = cls.label.toLowerCase(), when = formatDate(src.iso);
  const line = cls.geometry === 'polygon' ? `${Math.round(src.area_m2[key]).toLocaleString('en-GB')} m² of ${name} traced on ${when}`
    : cls.geometry === 'line' ? `${cls.label} traced as a line on ${when}` : `${n} ${name} recorded on ${when}`;
  // the class colour only tints the surroundings gently, so the background stays one place
  const tint = new THREE.Color(lookColor(key)).lerp(new THREE.Color('#1b6b80'), 0.6);
  setGlows([`#${tint.getHexString()}`, '#232a66', '#0d2c3b']);
  S.highlight = estuary.idx[key];
  // the small reference shows the date this class was measured on
  gsap.to(view, { classDate: src === e2011 ? 1 : 0, duration: 0.6, overwrite: true });
  $('#specimen-inset').innerHTML = `<b>Lit on the map</b>${line}`;
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
  gsap.to(document.body, { backgroundColor: c.bg, duration: 0.8, overwrite: 'auto' });
  if (c.id !== 'classes') {
    estuary.scene.fog.color.set(c.bg === '#dfe6e8' ? '#0d2c3b' : c.bg);
    S.highlight = -1; // nothing stays singled out once the classes chapter is left
    specimenShown = -1;
    gsap.to(view, { classDate: 0, duration: 0.6, overwrite: true });
  }
  document.body.classList.toggle('light', c.id === 'clouds');
  if (c.id !== 'map2') userThreshold = null;
  if (c.id !== 'map4') userLived = null;
  if (c.id !== 'model') { userModelView = null; if (modelClass) setModelClass(null); }
  if (c.id !== 'model') dateStrip?.show(false);
  window.__THREE_DEVTOOLS__?.dispatchEvent(new CustomEvent('observe', { detail: idx < 3 ? space.scene : estuary.scene }));
}

function bindControls() {
  // Return to the start: no fade to black. The closing words leave, the Earth turns back to the
  // opening view (space.beginReturn), and the opening words arrive.
  $('#begin-again')?.addEventListener('click', (ev) => {
    const end = ev.currentTarget.closest('section'), hero = document.querySelector('.beat--hero');
    gsap.to(end, {
      autoAlpha: 0, y: -12, duration: 0.5, ease: 'power1.in', overwrite: true,
      onComplete: () => {
        space.beginReturn();
        gsap.killTweensOf(window);
        gsap.killTweensOf(tl);
        tl.time(0, false);
        window.scrollTo({ top: 0, behavior: 'instant' });
        gsap.killTweensOf(tl);
        tl.time(0, false);
        gsap.fromTo(hero, { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 1.0, delay: 1.1, ease: 'power2.out' });
      },
    });
  });
  $('#sound')?.addEventListener('click', (ev) => {
    const on = ambience.toggle();
    ev.currentTarget.setAttribute('aria-pressed', String(on));
    ev.currentTarget.querySelector('span').textContent = on ? 'Sound on' : 'Sound off';
  });
  const goChapter = (id) => {
    const c = CHAPTERS.find((x) => x.id === id);
    jumpToTime(tl, c.at + (c.id === 'model' ? 0.3 : c.map && c.map > 1 ? 0.05 : 0.1), $('#veil'));
  };
  gauge = createGauge($('#gauge'), CHAPTERS, TOTAL, goChapter);
  // the whole picture: each map's tile goes back to that map
  document.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => goChapter(b.dataset.goto)));
  const files = {
    1: 'Map 1 - The Estuary as a Landscape.png', 2: 'Map 2 - Patterns of Wetness and Vegetation.png',
    3: 'Map 3 - The Estuary Through Time.png', 4: 'Map 4 - The Estuary as a Lived Landscape.png',
    5: 'Map 5 - The Estuary Between Plan and Ground.png', 6: 'Map 6 - The Estuary and the Monsoon.png',
  };
  const mapViewer = createMapViewer($('#map-viewer'));
  const openMap = (n) => mapViewer.open(`/assets/maps/${n}/${encodeURIComponent(files[n])}`, files[n].replace('.png', '').replace(' - ', ' · '));
  document.querySelectorAll('.open-map[data-map]').forEach((b) => b.addEventListener('click', () => openMap(b.dataset.map)));
  // About this project: a panel over the story; its six maps open the printed sheets
  const about = $('#about');
  let aboutLines = null;
  $('#about-open')?.addEventListener('click', () => {
    about.showModal(); about.scrollTop = 0;
    // the 17 waterlines draw themselves across the top of the page, as on the loading screen
    aboutLines?.stop(); aboutLines = startLoaderArt($('#about-lines'), () => 1, null, { y: 0.3 });
  });
  about?.addEventListener('close', () => { aboutLines?.stop(); aboutLines = null; });
  about?.querySelectorAll('[data-about-map]').forEach((b) => b.addEventListener('click', () => openMap(b.dataset.aboutMap)));
  // the index scrolls the page itself (not the story behind it)
  about?.querySelectorAll('[data-ab-go]').forEach((b) => b.addEventListener('click', () => {
    const el = about.querySelector(`#${b.dataset.abGo}`);
    about.scrollTo({ top: el.offsetTop - 30, behavior: 'smooth' });
  }));
  // the colours of the ten kinds of ground, as a little row of dots
  const dots = $('#about-dots');
  if (dots) dots.innerHTML = SPECIMEN_ORDER.map((k) => `<span style="background:${CLASS_LOOK[k]?.a ?? '#8fdcef'}"></span>`).join('');
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

// ---- Model chapter: three questions. Every figure comes from model/metrics.json and change.json ----
const pct = (v) => (v == null ? '–' : `${Math.round(v * 100)}%`);
/** a row of large figures, each with a short line of explanation */
const figs = (items) => items.map(([v, t]) => `<div class="ml-fig"><b>${v}</b><span>${t}</span></div>`).join('');
/** horizontal bars in the class colours: [class, share 0 to 1, label] */
const bars = (items) => items.map(([k, f, v]) => `<div class="ml-bar"><span class="ml-bar-name"><i class="key" style="background:${MODEL_COLOUR(k)}"></i>${MODEL_LABEL(k)}</span><span class="ml-bar-track"><i style="width:${Math.max(1, f * 100).toFixed(1)}%;background:${MODEL_COLOUR(k)}"></i></span><b>${v}</b></div>`).join('');
const MODEL_LABEL = (k) => (k === 'land' ? 'Land beyond the edge' : data.manifest.classByKey[k].label);
const MODEL_COLOUR = (k) => (k === 'land' ? LAND_COLOUR : lookColor(k));
const MODEL_SHORT = { water: 'Wat', muddy_shallows: 'Mud', bed_ground: 'Bed', mangrove_canopy: 'Man', tree_cover: 'Tre', track: 'Trk', land: 'Lnd' };
// the user's view choice, as layer strengths (same fields the scroll animates)
const MODEL_VIEWS = {
  manual: { modelManual: 1, modelModel: 0, modelDiff: 0, modelTrans: 0, modelGrowth: 0, modelSep: 0, modelSwipe: 0 },
  model: { modelManual: 0, modelModel: 1, modelDiff: 0, modelTrans: 0, modelGrowth: 0, modelSep: 0, modelSwipe: 0 },
  both: { modelManual: 1, modelModel: 1, modelDiff: 0, modelTrans: 0, modelGrowth: 0, modelSep: 0, modelSwipe: 1 },
  diff: { modelManual: 0, modelModel: 0, modelDiff: 1, modelTrans: 0, modelGrowth: 0, modelSep: 0.45, modelSwipe: 0 },
};
let modelClass = null, dateStrip = null, lastAutoView = null;
// scroll times of the Question 2 steps, which look at one date at a time
const MODEL_DATE_STEPS = [38.9, 43.5];
// the compare-by-class step: a chosen class draws the camera to where it sits
const COMPARE_STEP = [40.45, 41.2];
let classFocus = null;
const focus = { k: 0, x: 0, z: 0, zoom: 1 };

/** the stage the scroll is in: which layer dominates */
function autoModelView() {
  const v = { manual: S.modelManual * (1 - S.modelModel), both: Math.min(S.modelManual, S.modelModel), model: S.modelModel * (1 - S.modelManual), diff: S.modelDiff, trans: S.modelTrans, growth: S.modelGrowth };
  return Object.entries(v).sort((a, b) => b[1] - a[1])[0][0];
}

function bindModel() {
  const M = data.model.metrics, ch = data.model.change;
  const dates = data.manifest.dates;
  // the date with the median overall accuracy is shown first (neither the best nor the worst)
  const byAcc = dates.map((d) => d.id).filter((id) => M.per_date[id]).sort((a, b) => M.per_date[a].all.overall_accuracy - M.per_date[b].all.overall_accuracy);
  const agreement = Object.fromEntries(dates.map((d) => [d.id, M.per_date[d.id]?.all.overall_accuracy ?? null]));
  dateStrip = createDateStrip($('#datestrip'), { dates, agreement, onSelect: setModelDate });
  document.querySelectorAll('[data-model-view]').forEach((b) => b.addEventListener('click', () => { userModelView = b.dataset.modelView; lastAutoView = autoModelView(); }));

  // Q2: compare by class: one chip per class the model reads, plus all classes together
  const chips = $('#ml-class-chips');
  chips.innerHTML = [['', 'All classes'], ...data.model.classes.map((k) => [k, MODEL_LABEL(k)])]
    .map(([k, n]) => `<button type="button" data-model-class="${k}">${k ? `<i class="key" style="background:${MODEL_COLOUR(k)}"></i>` : ''}${n}</button>`).join('');
  chips.addEventListener('click', (e) => { const b = e.target.closest('[data-model-class]'); if (b) setModelClass(b.dataset.modelClass || null); });

  // Q2: pooled results over all 17 held-out dates
  const P = M.pooled.classes;
  $('#model-summary').innerHTML = figs([
    [pct(M.pooled.overall_accuracy), 'of the area I traced was read the same way by the model'],
    [pct(M.baseline_overall_accuracy), 'for a simple method that looks at colour alone'],
  ]);
  // one simple score per class: F1, the balance of what the model found and what it missed
  $('#model-classes').innerHTML = bars(data.model.classes.filter((k) => P[k] && P[k].dates_traced > 2)
    .map((k) => [k, P[k].f1, P[k].f1.toFixed(2)]));
  const C = M.confusion, ci = (k) => C.classes.indexOf(k);
  const share = (from, to) => { const row = C.rows_manual_cols_model[ci(from)]; const tot = row.reduce((a, b) => a + b, 0); return tot ? row[ci(to)] / tot : 0; };
  const E = M.land_edge;
  $('#ml-confusion-note').innerHTML = 'Muddy shallows is the class for ground that cannot be clearly identified. Of everything I traced as muddy shallows, the model read:';
  $('#ml-muddy').innerHTML = bars(['bed_ground', 'water', 'muddy_shallows'].map((k) => [k, share('muddy_shallows', k), pct(share('muddy_shallows', k))]));
  $('#ml-confusion-more').innerHTML = `Mangrove canopy was read correctly ${pct(share('mangrove_canopy', 'mangrove_canopy'))} of the time and was most often mistaken for water. Tree cover and track, traced on only two dates, were read as land.` +
    (E ? ` Where land meets water, the model's edge sits a typical ${E.median_of_medians_m.toFixed(1)} m from mine.` : '');
  $('#model-note').textContent = 'Some disagreement lies in my reference, not the model: the images line up only approximately and the tide on each date is unknown. Boats, cage farms and buildings were not modelled.';

  if (ch) {
    // Q1: repeated transitions (observed, all dates)
    const T = ch.transitions, tm = T.consecutive_transition_cells, K = T.matrix_classes;
    const wb = tm[K.indexOf('water')][K.indexOf('bed_ground')] + tm[K.indexOf('bed_ground')][K.indexOf('water')];
    const off = tm.reduce((s, r, i) => s + r.reduce((a, v, j) => a + (i === j ? 0 : v), 0), 0);
    $('#ml-trans-figs').innerHTML = figs([
      [pct(T.share_changed_4_or_more), 'of the ground changed class four or more times across the 17 dates'],
      [pct(wb / off), 'of all those changes are water and bed ground swapping, which the tide can cause'],
    ]);
    // Q3: scenarios
    const A = ch.analysis.mangrove_canopy, o = A.observed, s17 = A.observed_since_2017, hc = A.hindcast;
    const m2 = (v) => `${Math.round(v).toLocaleString('en-GB')} m²`;
    $('#ml-scen-lede').innerHTML = `Mangrove canopy is the only class that is clearly growing, by about ${m2(o.slope_m2_per_year)} a year.`;
    $('#ml-scen-stats').innerHTML = `The growth is very unlikely to be chance. The most likely rate lies between ${Math.round(o.slope_low)} and ${m2(o.slope_high)} a year. The model's own tracing gives ${m2(A.model.slope_m2_per_year)} a year, so it sees the same growth.`;
    renderScenarioTable($('#ml-scen-table'), { change: ch });
    $('#ml-scen-check').innerHTML = `As a test, the trend was worked out from the dates up to 2022 only. It then predicted the 2024 and 2025 canopy to within ${m2(hc.mae_trend)} on average, far closer than guessing "same as last time" (${m2(hc.mae_last_value)} out).`;
    $('#ml-scen-note').textContent = 'These are possible rates, not predictions. Water, bed ground and muddy shallows show no clear trend and depend on the tide on each date, so no scenarios are given for them.';
  }
  setModelDate(byAcc[Math.floor((byAcc.length - 1) / 2)]);
}

/** One place changes the date: scene layers, readouts, charts and the timeline all follow it. */
function setModelDate(id) {
  modelDate = id;
  estuary.setModelDate(id);
  const M = data.model.metrics, r = M.per_date[id];
  const d = data.manifest.dates.find((x) => x.id === id);
  $('#model-date').textContent = formatDate(d.iso);
  $('#model-date-fig').innerHTML = figs([[pct(r.all.overall_accuracy), 'of the area I traced on this date was read the same way by the model']]);
  dateStrip?.set(id, `${pct(r.all.overall_accuracy)} agreement`);
  renderModelCharts();
}

function setModelClass(k) {
  modelClass = k;
  estuary.setModelClass(k);
  renderModelCharts();
}

/** Hand-drawn against the model for the chosen class and date, in plain words. */
function renderCompare() {
  const M = data.model?.metrics;
  if (!M || !modelDate) return;
  document.querySelectorAll('[data-model-class]').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.modelClass || null) === modelClass)));
  const r = M.per_date[modelDate], d = data.manifest.dates.find((x) => x.id === modelDate), when = formatDate(d.iso);
  const box = $('#ml-compare');
  classFocus = estuary.modelClassCentre(modelClass);
  if (!modelClass) {
    box.innerHTML = figs([[pct(r.all.overall_accuracy), `of the area I traced on ${when} was read the same way by the model`]]) +
      '<p class="note">Choose a class above to compare it on its own. The others fade on the right.</p>';
    return;
  }
  const k = modelClass, c = r.all.classes[k], name = MODEL_LABEL(k).toLowerCase(), all = M.pooled.classes[k];
  const m2 = (v) => `${Math.round(v).toLocaleString('en-GB')} m²`;
  const hand = c?.area_manual_m2 ?? 0, model = c?.area_model_m2 ?? 0, max = Math.max(hand, model, 1);
  const bar = (label, v, hollow) => `<div class="ml-bar"><span class="ml-bar-name">${label}</span><span class="ml-bar-track"><i style="width:${Math.max(hand || model ? 1 : 0, (v / max) * 100).toFixed(1)}%;background:${MODEL_COLOUR(k)};${hollow ? 'opacity:0.55' : ''}"></i></span><b>${m2(v)}</b></div>`;
  let words;
  if (!hand && !model) words = `No ${name} was traced or modelled on ${when}.`;
  else if (!hand) words = `I traced no ${name} on ${when}, but the model found ${m2(model)}.`;
  else if (!model) words = `The model found none of the ${name} I traced on ${when}.`;
  else words = `The model found ${pct(c.recall)} of what I traced as ${name}. Of everything the model called ${name}, ${pct(c.precision)} matches my tracing.`;
  box.innerHTML = `<div class="ml-bars">${bar('Hand-drawn', hand)}${bar('Model', model, true)}</div><p>${words}</p>` +
    `<p class="note">Match score for ${name}: ${hand && c ? `${c.f1.toFixed(2)} on this date, ` : ''}${all ? `${all.f1.toFixed(2)} across all 17 dates` : 'not measured'} (0 = never, 1 = perfectly).</p>`;
}

function renderModelCharts() {
  renderCompare();
  const ch = data.model?.change;
  if (!ch) return;
  renderTrends($('#ml-trends'), { change: ch, label: MODEL_LABEL, colour: MODEL_COLOUR, order: ['mangrove_canopy', 'water', 'bed_ground', 'muddy_shallows'], selectedDate: modelDate, selectedClass: modelClass, onClass: setModelClass });
  renderScenario($('#ml-scen'), { change: ch, colour: MODEL_COLOUR, selectedDate: modelDate });
}

function updateReadouts(t) {
  const pc = $('#pers-count');
  if (pc) { const n = String(Math.min(17, Math.floor((S.persCount ?? 17) + 1e-6))); if (pc.textContent !== n) pc.textContent = n; }
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
  $('#pers-mode').textContent = ['Counting water', 'Now counting mangroves', 'Now counting bare ground'][pm];
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
    $('#stack-detail').innerHTML = `Date ${di + 1} of 17. What was traced: ${[...parts, ...pts].join(' ')}` +
      (gap ? `<br>A monsoon came and went since the date before this one.` : '');
  }
  // Map 6 date in focus
  const ri = Math.round(THREE.MathUtils.clamp(S.monsoonFocus, 0, 16));
  const rd = data.manifest.dates[ri];
  $('#rain-date').textContent = formatDate(rd.iso);
  $('#rain-detail').textContent = `Monsoon ${rd.rainfall.monsoon_year}: ${Math.round(rd.rainfall.monsoon_mm).toLocaleString('en-GB')} mm · 30 days before: ${rd.rainfall.prior30_mm.toFixed(1)} mm`;
  legend?.setPersMode(S.persMode);
  // model view buttons and the date timeline (all-date views say so)
  if (data.model) {
    const mv = userModelView ?? autoModelView();
    document.querySelectorAll('[data-model-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.modelView === mv)));
    legend?.setModelView(mv);
    // the date picker appears only in the steps where the view shows a single date (Question 2)
    const perDate = ['manual', 'model', 'both', 'diff'].includes(mv) && t >= MODEL_DATE_STEPS[0] && t <= MODEL_DATE_STEPS[1];
    dateStrip?.show(CHAPTERS[chapterIdx]?.id === 'model' && perDate);
  }
  // Map 4 buttons
  const lf = userLived ?? (S.livedFocus > 0.5 ? 1 : 0);
  document.querySelectorAll('[data-lived]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.lived === lf)));
}

const timer = new THREE.Timer();
function render(now) {
  trackFrame(now);
  timer.update(now);
  const time = timer.getElapsed();
  const t = tl.time();

  // user overrides inside the interactive chapters
  const frame = { ...S };
  if (userThreshold !== null) frame.threshold = userThreshold;
  if (userLived !== null) frame.livedFocus = THREE.MathUtils.lerp(S.livedFocus, userLived, 1);
  if (userModelView !== null) {
    // a view chosen with the buttons holds until the scroll moves on to another stage
    if (autoModelView() !== lastAutoView) userModelView = null;
    else Object.assign(frame, MODEL_VIEWS[userModelView]);
  }
  if (!drag) { view.userAz *= 0.97; view.userEl *= 0.97; }
  // looking around: the view turns a little towards the pointer, like turning your head
  look.x += (look.tx - look.x) * 0.04; look.y += (look.ty - look.y) * 0.04;

  const idx = chapterAt(t);
  if (idx !== chapterIdx) { chapterIdx = idx; onChapter(idx); }
  // in the second half of a tunnel the next map is already settling: show its own classes
  const tfr = S.tunnel - Math.floor(S.tunnel);
  view.mapKey = CHAPTERS[tfr >= 0.5 && tfr < 0.9995 ? chapterAt(t + 0.55) : idx].id;
  if (CHAPTERS[idx].id === 'classes') {
    const si = Math.round(S.specimen);
    if (si !== specimenShown) { specimenShown = si; showSpecimen(si); }
    frame.highlight = estuary.idx[SPECIMEN_ORDER[si]];
  }
  // The ride through a tunnel, like a water slide: the camera banks from side to side and swoops,
  // the map being left slides off towards where the passage opens, and the next map swoops in
  // from the far side of the screen, where the passage comes out, before settling in its place.
  const tpr = S.tunnel - Math.floor(S.tunnel);
  // while riding a tunnel, the map key steps out of the way
  const riding = tpr > 0.12 && tpr < 0.88;
  if (riding !== document.body.classList.contains('in-tunnel')) document.body.classList.toggle('in-tunnel', riding);
  if (tpr > 0.0005 && tpr < 0.9995) {
    const ti = Math.floor(S.tunnel), [dx, dy] = estuary.tunnelDir(ti), ss = THREE.MathUtils.smoothstep;
    const leaving = tpr < 0.5;
    // only while a map is on screen: the old one slides away, the view re-centres inside the
    // passage, then swings out to where the passage ends as the new map appears and settles
    const k = leaving ? ss(tpr, 0.02, 0.24) * (1 - ss(tpr, 0.26, 0.44)) : ss(tpr, 0.54, 0.66) * (1 - ss(tpr, 0.68, 1.0));
    const sgn = leaving ? -1 : 1;
    frame.shiftX += sgn * dx * 0.4 * k;
    frame.shiftY -= sgn * dy * 0.3 * k;
    frame.az += sgn * (dx >= 0 ? 1 : -1) * 38 * k;
    frame.el += 14 * k;
    frame.dist *= 1 + 0.35 * k;
    frame.roll = 0.3 * Math.sin(Math.PI * tpr) * Math.sin(tpr * Math.PI * 3 + ti);
  }
  if (S.estuary > 0.5 && !drag) { frame.az += look.x * 5; frame.el -= look.y * 3; }
  ambience.update(S, time);
  // on the six maps the camera is never quite still: a slow drift, like hovering above the estuary
  if (/^map\d$/.test(CHAPTERS[idx].id)) {
    frame.az += 3.5 * Math.sin(time * 0.13);
    frame.el += 1.2 * Math.sin(time * 0.1 + 1.3);
  }
  // compare by class: ease the camera towards the chosen class and closer to it, and back out
  const target = CHAPTERS[idx].id === 'model' && t >= COMPARE_STEP[0] && t <= COMPARE_STEP[1] ? classFocus : null;
  focus.k += ((target ? 1 : 0) - focus.k) * 0.05;
  if (target) {
    focus.x += (target.x - focus.x) * 0.06; focus.z += (target.z - focus.z) * 0.06;
    // zoom only as far as the class needs: a class that covers the estuary keeps the whole view,
    // a small one (the mangrove patches, muddy shallows) comes in close
    focus.zoom += (THREE.MathUtils.clamp(target.spread / 110, 0.68, 1) - focus.zoom) * 0.06;
  }
  if (focus.k > 0.001) {
    frame.tx += (focus.x - frame.tx) * focus.k;
    frame.tz += (focus.z - frame.tz) * focus.k;
    frame.dist *= THREE.MathUtils.lerp(1, focus.zoom, focus.k);
    frame.el += 10 * focus.k; // look a little more from above, like zooming into a map
  }

  if (Math.abs(S.atmo - lastAtmo) > 0.004) { lastAtmo = S.atmo; document.documentElement.style.setProperty('--atmo', S.atmo.toFixed(3)); }

  renderer.clear();
  if (S.space > 0.002) {
    space.update(time, S.approach, undefined, S.away);
    renderer.render(space.scene, space.camera);
  }
  if (S.cosmos > 0.002 && S.estuary > 0.002) {
    cosmos.update(time, estuary.camera, S.cosmos * S.estuary, S.tunnel);
    cosmos.draw(renderer);
  }
  if (S.estuary > 0.002) {
    estuary.scene.fog.density = 0.0005 + S.murk * 0.012 + (1 - S.estuary) * 0.01;
    estuary.update(frame, time, view);
    renderer.clearDepth();
    renderer.render(estuary.scene, estuary.camera);
    // Map 6: rain across the whole screen, heavier for a wetter monsoon before the date in focus
    if (S.monsoon > 0.002) {
      const fd = data.manifest.dates[Math.round(THREE.MathUtils.clamp(S.monsoonFocus, 0, 16))];
      const amt = S.monsoon * (0.35 + 0.45 * Math.min(1, fd.rainfall.monsoon_mm / 3848)) * estuary.leave * (1 - S.murk);
      screenRain.update(time, amt, innerWidth / innerHeight);
      if (screenRain.active) renderer.render(screenRain.scene, screenRain.camera);
    }
    estuary.updateLabels(frame, innerWidth, innerHeight);
    updateCallouts(t);
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

// ---------- Callouts: short labels pinned to what the text is talking about ----------
// Each one names a feature on the map while its step of text is on screen, with a dot on the
// feature and a short leader line, so a first-time visitor knows where to look.
let callouts = null;
function buildCallouts() {
  const E = estuary, c25 = E.classSets[0].pts;
  const cls = (key) => (v) => E.classAnchor(c25, key, v);
  const col = (which, test) => (v) => E.columnAnchor(which, test, v);
  const deck25 = E.lived[1], deckDots = deck25.children.find((o) => o.isPoints);
  const dates = data.manifest.dates, d11 = dates.find((d) => d.id === '2011_04_11'), d25 = dates.find((d) => d.id === '2025_02_25');
  const then = (k) => d11.counts[k] ?? 0, now = (k) => d25.counts[k] ?? 0;
  // Map 6: the tower in focus carries its own numbers, so the ball scale explains itself
  const focusDate = () => dates[Math.round(THREE.MathUtils.clamp(S.monsoonFocus, 0, dates.length - 1))];
  const mmFmt = (v) => Math.round(v).toLocaleString('en-GB');
  const water = E.columnAnchor('persWater', 'max', undefined, 0.2) && E.persWater.anchors['col:max:0.2'];
  const mangrove = E.columnAnchor('persMangrove', 'max') && E.persMangrove.anchors['col:max:null'];
  const list = [
    // arrival: naming what is below
    [5.7, 6.55, 'The Panchagangavali estuary', cls('water')],
    [5.8, 6.55, 'Mangroves on the central bed', cls('mangrove_canopy')],
    [5.9, 6.55, 'The shore at Kundapur', cls('track'), 'down'],
    // conclusion: the date of the waterline being drawn
    [46.42, 47.05, () => { const d = data.manifest.dates[Math.min(16, Math.max(0, Math.ceil((S.edgesT ?? 0) - 1)))]; return `Waterline, ${formatDate(d.iso)}`; }, (v) => E.waterlineAnchor(S, v)],
    // Map 1: each kind named as it is traced over the photo
    [11.2, 11.6, 'Traced: water', cls('water')],
    [11.28, 11.6, 'Traced: mangrove canopy', cls('mangrove_canopy')],
    [11.37, 11.6, 'Traced: land edge', cls('land_edge')],
    [11.45, 11.6, 'Traced: boats', cls('boats'), 'down'],
    [11.53, 11.62, 'Traced: cage farms', cls('cage_farms'), 'down'],
    // Map 1: the exploded layers, each named on the edge of its sheet
    ...E.shownKeys(0, 'map1').map((k, r) => [11.8 + r * 0.05, 12.7, E.classes[E.idx[k]].label, (v) => E.sheetAnchor(r, v), 'side']),
    [12.9, 13.4, 'Mangrove canopy', cls('mangrove_canopy')],
    [13.65, 14.3, "Boats at the water's edge", cls('boats')], [13.65, 14.3, 'Cage farms offshore', cls('cage_farms')],
    // Map 2: tall columns are always water, short ones only sometimes
    ...(water ? [[16.15, 16.55, `Tall: under water on ${water.count} of 17 dates`, (v) => E.columnAnchor('persWater', 'max', v, 0.2)]] : []),
    [16.15, 16.55, 'Short: under water only now and then', col('persWater', 'some')],
    ...(mangrove ? [[17.75, 18.15, `Mangroves seen on ${mangrove.count} of 17 dates`, col('persMangrove', 'max')]] : []),
    [18.4, 18.8, 'Dry on some dates, under water on others', col('persBed', 'some')],
    // Map 4: the 2025 shore, once it is in focus
    // spread west to east along the shore so the names do not pile up
    ...(deckDots ? [[26.45, 27.3, 'Tree cover', (v) => E.classAlong(deckDots, 'tree_cover', 0.4, v)]] : []),
    [26.45, 27.3, `Buildings: ${then('buildings')} in 2011, ${now('buildings')} in 2025`, (v) => E.layerAnchor(1, 'buildings', 0.55, v)],
    [26.45, 27.3, 'Track', (v) => E.layerAnchor(1, 'track', 0.6, v)],
    [26.45, 27.3, `Boats: ${then('boats')} in 2011, ${now('boats')} in 2025`, (v) => E.layerAnchor(1, 'boats', 0.7, v)],
    [26.45, 27.3, `Cage farms: ${then('cage_farms')} in 2011, ${now('cage_farms')} in 2025`, (v) => E.layerAnchor(1, 'cage_farms', 0.88, v)],
    // Map 5: the ground, the box on the plan, then the two named side by side
    [28.5, 28.82, 'Water', cls('water')], [28.5, 28.82, 'Mangrove canopy', cls('mangrove_canopy')],
    [28.5, 28.82, 'Boats', cls('boats')], [28.5, 28.82, 'Cage farms', cls('cage_farms')],
    [29.42, 29.72, 'Study area on the plan', (v) => v.set(E.planBoxCentre.x, 4, E.planBoxCentre.z)],
    // the four labels on their squares
    ...data.points.plan_categories.map((c, ci) => [30.42 + ci * 0.02, 30.66, `${c.name}: ${E.waffleCounts[ci]} ${E.waffleCounts[ci] === 1 ? 'square' : 'squares'}`, (v) => E.waffleAnchor(ci, v), ci === 2 ? undefined : ci === 1 ? 'flipdown' : 'down']),
    [30.06, 30.24, 'The plan, inside the box', (v) => E.planPatch.getWorldPosition(v)],
    [30.06, 30.24, 'The ground, 25 Feb 2025', cls('mangrove_canopy'), 'down'],
    [30.78, 31.12, 'The plan: one fixed colour per area', (v) => v.set(-290, 4, -150)],
    [30.78, 31.12, 'The ground: traced on 25 Feb 2025', (v) => v.set(0, 4, -95)],
    [30.82, 31.12, 'Red box: the same stretch of river', (v) => v.set(E.planBoxCentre.x, 4, E.planBoxCentre.z), 'down'],
    // the model chapter: the two names either side of the sweeping line
    [38.85, 43.5, 'Traced by hand', (v) => E.swipeAnchor(-1, v), 'flipped'],
    [38.85, 43.5, 'Model', (v) => E.swipeAnchor(1, v)],
    // Map 6: the tallest 30-day column
    [32.6, 35.2, () => { const r = focusDate().rainfall; return `Blue · monsoon ${r.monsoon_year}: ${mmFmt(r.monsoon_mm)} mm (${Math.round(r.monsoon_mm / 100)} balls of 100 mm)`; }, (v) => E.rainFocusAnchor(S, 'monsoon', v)],
    [32.6, 35.2, () => { const r = focusDate().rainfall; return `White · 30 days before: ${r.prior30_mm.toFixed(1)} mm (${Math.round(r.prior30_mm / 5)} balls of 5 mm)`; }, (v) => E.rainFocusAnchor(S, 'prior', v), 'down'],
  ];
  const root = $('#callouts');
  // neighbours in the same step take alternate leader heights so their names do not collide
  const lifts = {};
  callouts = list.map(([from, to, text, at, dir]) => {
    const n = (lifts[from] = (lifts[from] ?? -1) + 1);
    const el = document.createElement('div');
    el.className = dir === 'down' ? 'callout callout--down' : dir === 'side' ? 'callout callout--side' : dir === 'flipped' ? 'callout callout--flip callout--fixed' : dir === 'flipdown' ? 'callout callout--down callout--flip callout--fixed' : 'callout';
    el.style.setProperty('--lift', `${26 + (n % 2) * 30}px`);
    el.innerHTML = `<i></i><span>${typeof text === 'function' ? '' : text}</span>`;
    root.append(el);
    return { from, to, at, el, shown: false, textFn: typeof text === 'function' ? text : null, span: el.querySelector('span') };
  });
}
const calloutV = new THREE.Vector3();
function updateCallouts(t) {
  if (!callouts) return;
  const w = innerWidth, h = innerHeight, clear = (S.murk ?? 0) < 0.35 && S.estuary > 0.5;
  const ss = THREE.MathUtils.smoothstep;
  for (const c of callouts) {
    const k = clear ? Math.min(ss(t, c.from, c.from + 0.08), 1 - ss(t, c.to - 0.08, c.to)) : 0;
    let v = k > 0.001 ? c.at(calloutV) : null;
    if (v) { v.project(estuary.camera); if (v.z > 1) v = null; }
    if (!v) { if (c.shown) { c.el.style.opacity = '0'; c.shown = false; } continue; }
    c.shown = true;
    if (c.textFn) { const s = c.textFn(); if (s !== c.last) { c.span.textContent = s; c.last = s; } }
    c.el.style.opacity = k.toFixed(3);
    // near the right edge the name hangs to the left of its line, so it stays on screen
    if (!c.el.classList.contains('callout--side') && !c.el.classList.contains('callout--fixed')) c.el.classList.toggle('callout--flip', v.x > 0.42);
    c.el.style.transform = `translate(${((v.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * h).toFixed(1)}px)`;
  }
}

async function init() {
  setLoader(0.02, 'Finding the Earth');
  resize();
  // space is drawn from the very first moment; the Earth joins it when its model has arrived
  renderer.setAnimationLoop((now) => {
    if (!loading.booting) return;
    timer.update(now);
    const lt = performance.now() / 1000, ldt = Math.min(0.25, lt - (loading.last ?? lt)); loading.last = lt;
    loading.shown += (loading.target - loading.shown) * (1 - Math.exp(-ldt * 3));   // the same pace at any frame rate
    // the number follows the lines as well as the loading, so 100% and 'Ready' arrive with the last line
    const pct = Math.min(loading.shown, loaderArt.progress);
    $('#loader-pct').textContent = `${Math.round(pct * 100)}%`;
    const fill = $('#loader-fill'); if (fill) fill.style.width = `${(pct * 100).toFixed(1)}%`;
    if (loading.note === 'Ready' && pct > 0.995) $('#loader-note').textContent = 'Ready';
    renderer.clear();
    space.update(timer.getElapsed(), 0);
    renderer.render(space.scene, space.camera);
  });
  await space.load('/assets/earth.opt.glb');
  clouds.bake(renderer);
  cosmos.bake(renderer);
  resize();
  setLoader(0.1, '17 dates of the estuary, from 2011 to 2025');
  data = await loadAll((f) => setLoader(0.1 + f * 0.8));
  setLoader(0.92, 'Building the estuary from its dots');
  estuary = new Estuary(data);
  estuary.bakeFlats(renderer);
  window.__THREE_DEVTOOLS__?.dispatchEvent(new CustomEvent('observe', { detail: estuary.scene }));
  resize();
  bindControls();
  buildCallouts();
  legend = createLegend($('#legend'), { manifest: data.manifest, planCategories: data.points.plan_categories, MAP_CLASSES, PLAN_COLOURS, CLASS_LOOK, RAIN_LOOK, LAND_COLOUR, modelClasses: data.model?.classes });
  tl = buildTimeline(S, {
    stackHeight: estuary.stackHeight,
    mangroveCentre: estuary.mangroveCentre,
    planBoxCentre: estuary.planBoxCentre,
    onProgress: (p) => gauge.setProgress(p),
  });
  gauge.setProgress(0);
  fitBeats();
  document.fonts?.ready.then(() => fitBeats());
  // compile shaders up front so the first transitions do not stall
  renderer.compile(estuary.scene, estuary.camera);
  renderer.compile(clouds.scene, clouds.camera);
  renderer.compile(cosmos.scene, cosmos.camera);
  setLoader(1, 'Ready');
  // let all 17 waterlines be drawn before the story opens (never more than about nine seconds)
  await new Promise((res) => { const t0 = performance.now(); const wait = () => { if ((loading.shown > 0.99 && loaderArt.done) || performance.now() - t0 > 9000) res(); else requestAnimationFrame(wait); }; wait(); });
  await new Promise((res) => setTimeout(res, 900));   // a moment with all 17 lines glowing together
  loading.booting = false;
  renderer.setAnimationLoop(render);
  document.body.classList.remove('loading');
  document.documentElement.style.overflow = '';
  // the loading screen fades away to the Earth
  $('#loader').classList.add('done');
  setTimeout(() => loaderArt.stop(), 1800);   // once the screen has faded, the drawing stops
  if (import.meta.env.DEV) window.__wit = { S, tl, estuary, space, cosmos, clouds, renderer, gsap, ambience, goto: (t) => { window.scrollTo(0, scrollYForTime(tl, t)); } };
}

init().catch((err) => {
  console.error(err);
  setLoader(1, `The experience could not start: ${err.message}`);
});

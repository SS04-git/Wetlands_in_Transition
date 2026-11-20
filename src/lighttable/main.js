// Light Table prototype: the registered satellite screenshot on an illuminated table, with each
// traced class as a translucent sheet that lifts, separates and returns as the visitor scrolls.
import * as THREE from 'three';
import { loadManifest, loadDate, formatDate } from './data.js';
import { footprintFrame } from './geo.js';
import { createStage, LightTable } from './stage.js';
import { LayerStack } from './layers.js';
import { BEATS, createState, buildTimeline, applyCamera } from './story.js';
import * as ui from './ui.js';

const PROTOTYPE_DATES = ['2025_02_25', '2011_04_11'];
const canvas = document.querySelector('#stage');
const { renderer, scene, camera } = createStage(canvas);
const table = new LightTable(scene);
const state = createState();
let stack, manifest, frame, current, entry;

function resize() {
  const w = innerWidth, h = innerHeight;
  // Cap the drawing buffer near 4K-equivalent pixel counts so a TV or a high-DPI laptop stays smooth.
  const ratio = Math.min(devicePixelRatio || 1, 2, Math.sqrt(8.3e6 / (w * h)));
  renderer.setPixelRatio(ratio);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // On landscape screens, move the subject right so the statements on the left sit beside it.
  if (w / h > 1.25) camera.setViewOffset(w, h, -w * 0.085, 0, w, h);
  else camera.clearViewOffset();
  camera.updateProjectionMatrix();
  stack?.setResolution(w * ratio, h * ratio);
}
addEventListener('resize', resize);

async function showDate(id) {
  const { entry: e, data, image } = await loadDate(manifest, id);
  current = id;
  entry = e;
  const corners = e.imagery.corners;
  table.setImage(image, corners);
  frame = footprintFrame(corners);
  stack.build(data, corners);
  ui.buildLegend(manifest, e, {
    onHover: (k) => { stack.hover(k); ui.legendHot(k); },
    onToggle: (k) => stack.toggle(k),
  });
  ui.markDate(id);
  ui.hideDetail();
  document.querySelector('#beat-date').textContent = `${formatDate(e.iso)} · Google Earth Pro`;
  const [gw, gh] = e.imagery.ground_size_m;
  document.querySelector('#beat-footprint').textContent =
    `A satellite view of about ${Math.round(gw / 5) * 5} × ${Math.round(gh / 5) * 5} m, the frame in which this observation was traced.`;
  resize();
}

// ---- picking ----
const raycaster = new THREE.Raycaster();
raycaster.params.Line2 = { threshold: 6 };
const pointer = new THREE.Vector2();
let pointerDirty = false, lastEvent = null;
canvas.addEventListener('pointermove', (ev) => { lastEvent = ev; pointerDirty = true; });
canvas.addEventListener('pointerleave', () => { lastEvent = null; stack?.hover(null); ui.legendHot(null); ui.hideTooltip(); });

function pick(ev) {
  pointer.set((ev.clientX / innerWidth) * 2 - 1, -(ev.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  // Printed geometry wins over the clear carrier of a sheet that happens to lie in front of it;
  // the carriers are only picked when the pointer is on empty acrylic.
  const content = raycaster.intersectObjects(stack.contentPickables, false)[0];
  const hit = content ?? raycaster.intersectObjects(stack.carrierPickables, false)[0];
  return hit?.object.userData.sheet ?? null;
}

canvas.addEventListener('click', (ev) => {
  const sheet = pick(ev);
  const key = stack.isolate(sheet ? sheet.key : null);
  if (key) ui.showDetail(manifest.classByKey[key], entry, release);
  else ui.hideDetail();
});
function release() { stack.isolate(null); ui.hideDetail(); }
addEventListener('keydown', (e) => { if (e.key === 'Escape') release(); });

function updateHover() {
  if (!pointerDirty || !lastEvent) return;
  pointerDirty = false;
  const sheet = pick(lastEvent);
  stack.hover(sheet?.key ?? null);
  ui.legendHot(sheet?.key ?? null);
  if (sheet) ui.showTooltip(lastEvent.clientX, lastEvent.clientY, ui.tooltipText(sheet.cls, entry));
  else ui.hideTooltip();
  canvas.style.cursor = sheet ? 'pointer' : '';
}

// ---- loop ----
const timer = new THREE.Timer();
function render(now) {
  timer.update(now);
  const dt = Math.min(timer.getDelta(), 0.05);
  const t = timer.getElapsed();
  const n = stack.sheets.length;
  stack.sheets.forEach((s, i) => { s.state.reveal = THREE.MathUtils.clamp(state.reveal * n - i, 0, 1); });
  stack.update(dt, t, state.lift, state.carrier);
  table.imageVisibility = state.image;
  table.glow = 0.6 + 0.4 * state.carrier;
  table.update();
  applyCamera(camera, state, frame);
  updateHover();
  renderer.render(scene, camera);
}

async function init() {
  ui.setLoader(0.1, 'Reading the traced sheets');
  manifest = await loadManifest();
  stack = new LayerStack(scene, manifest);
  ui.setLoader(0.4, 'Placing the satellite screenshot');
  await showDate(PROTOTYPE_DATES[0]);
  loadDate(manifest, PROTOTYPE_DATES[1]); // warm the second date
  ui.buildDateSwitch(manifest, PROTOTYPE_DATES, current, (id) => id !== current && showDate(id));
  ui.buildProgress(BEATS.length);
  buildTimeline({
    state,
    beatEls: [...document.querySelectorAll('.beat')],
    onProgress: (p) => {
      ui.setProgress(p, BEATS.length);
      document.querySelector('.instrument').classList.toggle('on', p > 0.1);
    },
  });
  ui.setLoader(1, 'Ready');
  renderer.setAnimationLoop(render);
  requestAnimationFrame(() => ui.hideLoader());
}

init().catch((err) => {
  console.error(err);
  ui.loaderError(`Could not load the data: ${err.message}`);
});

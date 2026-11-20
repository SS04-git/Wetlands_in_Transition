// The scroll director. One GSAP timeline scrubbed by ScrollTrigger over a tall track; time is in
// "screens" (1 unit = one viewport height of scrolling). The timeline animates a plain state
// object S that the render loop reads each frame, and reveals the text beats placed in the HTML
// with data-in / data-out times.
//
// Composition: shiftX / shiftY move the whole estuary frame on screen (fractions of the viewport)
// so maps can sit left, right or low beside their text; dist / el / az / target move the camera
// to zoom into the ground, track along the shore or climb the time stack.
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';
gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);

// Chapter plan. Labels are what the navigation and the map links jump to.
export const CHAPTERS = [
  { id: 'intro', at: 0, len: 1.2, bg: '#02040a' },
  { id: 'approach', at: 1.2, len: 1.8, bg: '#02040a' },
  { id: 'clouds', at: 3.0, len: 2.2, bg: '#dfe6e8' },
  { id: 'arrival', at: 5.2, len: 1.6, bg: '#0d2c3b' },
  { id: 'classes', at: 6.8, len: 4.4, bg: '#0d2c3b' },
  { id: 'map1', at: 11.2, len: 3.2, bg: '#0d2c3b', map: 1 },
  { id: 'map2', at: 15.4, len: 3.4, bg: '#0b2a36', map: 2 },
  { id: 'map3', at: 19.8, len: 3.6, bg: '#0c2836', map: 3 },
  { id: 'map4', at: 24.4, len: 3.0, bg: '#0f2e3a', map: 4 },
  { id: 'map5', at: 28.4, len: 2.8, bg: '#0d2c3b', map: 5 },
  { id: 'map6', at: 32.2, len: 3.2, bg: '#0b2733', map: 6 },
  { id: 'finale', at: 35.4, len: 1.8, bg: '#0d2c3b' },
];
export const TOTAL = 37.2;
// Water-current tunnels carry the visitor into each map after the first (1 unit before it).
export const CURRENTS = [15.4, 19.8, 24.4, 28.4, 32.2].map((t) => t - 1.0);

// Pacing: how many screens of scrolling each timeline unit takes. The opening keeps close to its
// original pace; the specimens and the maps get more scroll so their layers, structures and text
// can be watched at a normal scrolling speed; the water-current tunnels pass a little quicker.
const PACE = [
  [0, 1.2],      // Earth, approach, clouds, arrival
  [6.8, 1.85],   // the ten class specimens
  [11.2, 1.75],  // the six maps
  [35.4, 1.35],  // finale
];
const TUNNEL_PACE = 1.3;
function paceAt(t) {
  if (CURRENTS.some((c) => t >= c && t < c + 1.0)) return TUNNEL_PACE;
  let p = PACE[0][1];
  for (const [from, v] of PACE) if (t >= from) p = v;
  return p;
}
// piecewise-linear map between timeline time and scroll screens, sampled finely
const STEP = 0.05;
const SCREENS = [0];
for (let t = 0; t < TOTAL - 1e-9; t += STEP) SCREENS.push(SCREENS.at(-1) + STEP * paceAt(t + STEP / 2));
export const TOTAL_SCREENS = SCREENS.at(-1);
export function timeToScreens(t) {
  const x = Math.max(0, Math.min(TOTAL, t)) / STEP, i = Math.min(SCREENS.length - 2, Math.floor(x));
  return SCREENS[i] + (SCREENS[i + 1] - SCREENS[i]) * (x - i);
}
export function screensToTime(s) {
  s = Math.max(0, Math.min(TOTAL_SCREENS, s));
  let lo = 0, hi = SCREENS.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (SCREENS[m] <= s) lo = m; else hi = m; }
  return Math.min(TOTAL, (lo + (s - SCREENS[lo]) / Math.max(1e-9, SCREENS[lo + 1] - SCREENS[lo])) * STEP);
}

export const SPECIMEN_ORDER = ['water', 'muddy_shallows', 'bed_ground', 'mangrove_canopy', 'land_edge',
  'tree_cover', 'track', 'buildings', 'boats', 'cage_farms'];

export function createState() {
  return {
    space: 1, approach: 0,
    cloudP: 0, cloudOp: 0, tint: 0,
    estuary: 0, murk: 0, currentOp: 0, travel: 0, atmo: 0, dust: 0,
    ground: 0, groundScatter: 30, classes: 0, classSep: 0, classScatter: 0, classSpin: 0, highlight: -1,
    classDim: 0.28, hiSize: 0.35,
    blob: 0, specimen: 0,
    map1: 0, map1Sep: 0, map1Turn: 0,
    pers: 0, persRise: 0, persMode: 0, persSpin: 0, threshold: 0,
    stack: 0, stackSpread: 0, stackFocus: 0, stackSep: 0, stackTwist: 0, stackLift: 0,
    lived: 0, livedFocus: 0, livedSep: 0, livedSpread: 1,
    plan: 0, planDrop: 0, planTowers: 0,
    monsoon: 0, monsoonFocus: 0, monsoonTurn: 0,
    az: 0, el: 89, dist: 1400, tx: 0, ty: 0, tz: 0, shiftX: 0, shiftY: 0,
  };
}

export function buildTimeline(S, { stackHeight, mangroveCentre, onProgress }) {
  const track = document.querySelector('#scroll-track');
  track.style.height = `${(TOTAL_SCREENS + 1) * 100}vh`;
  // The timeline is driven by scroll through the pacing map, with a short smoothing glide (the
  // role ScrollTrigger's scrub plays), so the scene follows the scroll without jumping.
  const tl = gsap.timeline({ paused: true, defaults: { ease: 'power2.inOut' }, onUpdate: () => onProgress?.(tl.time() / TOTAL) });
  tl.st = ScrollTrigger.create({
    trigger: track, start: 'top top', end: 'bottom bottom',
    onUpdate: (self) => {
      const target = screensToTime(self.progress * TOTAL_SCREENS);
      gsap.to(tl, { time: target, duration: 1.1, ease: 'power3.out', overwrite: true });
    },
  });
  // start where the page already is (a reload keeps the scroll position)
  queueMicrotask(() => tl.time(screensToTime(tl.st.progress * TOTAL_SCREENS)));
  const to = (vars, at, duration = 1, ease) => tl.to(S, { ...vars, duration, ...(ease ? { ease } : {}) }, at);
  CHAPTERS.forEach((c) => tl.addLabel(c.id, c.at));

  // ---------- Opening (unchanged) ----------
  // 01 approach: enlarge and spin quickly onto Kundapur
  to({ approach: 1 }, 1.2, 1.9, 'power1.in');

  // 02 cloud layer: dense white, turning to the blue of the water below
  to({ cloudOp: 1 }, 2.8, 0.45, 'power1.out');
  to({ cloudP: 1 }, 2.9, 2.3, 'none');
  to({ space: 0 }, 3.25, 0.3, 'none');
  to({ tint: 1 }, 4.1, 0.9);
  to({ estuary: 1 }, 4.4, 0.4, 'none');
  to({ cloudOp: 0 }, 4.75, 0.45, 'power1.in');

  // 03 arrival: the screenshot as coloured dots, gathering out of the haze, camera descending
  to({ ground: 1, groundScatter: 0 }, 4.5, 1.2, 'power2.out');
  to({ dist: 420, el: 60, az: -18 }, 4.4, 2.2);
  to({ shiftX: 0.13 }, 5.3, 0.6); // make room for the arrival text on the left
  // the atmosphere of the opening carries on below the clouds: glows and far star dust
  to({ atmo: 1, dust: 0.55 }, 4.8, 1.0, 'power1.out');

  // ---------- 04 The classes (Blobmixer specimens) ----------
  // The estuary recedes into a small, slowly turning reference at the lower left; only the class
  // in focus stays lit in it, so the specimen holds the centre of attention.
  to({ classes: 1, ground: 0, classDim: 0.1, hiSize: 0.9 }, 6.8, 0.5);
  to({ dist: 1020, el: 52, shiftX: -0.29, shiftY: 0.19 }, 6.8, 0.6);
  to({ az: -70, classSpin: 0.4 }, 7.0, 4.0, 'none');
  to({ blob: 1 }, 6.95, 0.35);
  to({ specimen: SPECIMEN_ORDER.length - 1 }, 7.1, 3.9, 'none');
  to({ blob: 0 }, 11.0, 0.25);

  // ---------- Map 1: the estuary as a landscape (25 Feb 2025) ----------
  // The reference comes forward to the right and its classes lift into layers as the camera moves
  // in; the camera circles the separated layers, then the layers settle and the camera visits two
  // parts of the same landscape: the mangrove canopy on the central bed, then the shore.
  to({ shiftX: 0.14, shiftY: 0, dist: 500, el: 24, az: -30, ty: 70, classDim: 0.28, hiSize: 0.35, classSpin: 0 }, 11.1, 0.9);
  to({ classSep: 1 }, 11.2, 0.9);
  to({ dist: 330, az: 28, el: 16 }, 11.7, 1.0, 'sine.inOut');
  to({ classSep: 0, ty: 0, tx: mangroveCentre.x, tz: mangroveCentre.z, dist: 200, el: 50, az: -10, shiftX: 0.16, shiftY: 0.06 }, 12.75, 0.7);
  tl.set(S, { highlight: 3, classDim: 0.4, hiSize: 0.7 }, 12.8);   // mangrove canopy singled out
  tl.set(S, { highlight: -1, classDim: 0.28, hiSize: 0.35 }, 13.45);
  to({ tx: 0, tz: 78, dist: 270, el: 22, az: 8, shiftX: -0.1, shiftY: -0.13 }, 13.5, 0.6);
  to({ classSep: 0, dist: 380, el: 40, tz: 10, shiftX: 0.1 }, 14.1, 0.35);

  // ---------- Current tunnels into each following map ----------
  CURRENTS.forEach((t) => {
    to({ currentOp: 1, murk: 1 }, t, 0.35, 'power1.in');
    to({ travel: '+=1' }, t, 1.0, 'none');
    to({ currentOp: 0, murk: 0 }, t + 0.65, 0.35, 'power1.out');
  });
  // swap the content while the current covers the scene
  const swap = (t, vars) => tl.set(S, vars, t + 0.5);

  // ---------- Map 2: patterns of wetness and vegetation ----------
  // From above, the grid rises; the camera then descends into it (the counts become columns you
  // can look along) and finally moves in on the mangrove canopy.
  swap(CURRENTS[0], { map1: 0, classes: 0, pers: 1, persRise: 0, az: -25, el: 74, dist: 560, ty: 0, tx: 0, tz: 0, shiftX: 0.17, shiftY: 0 });
  to({ persRise: 1 }, 15.4, 0.9, 'power2.out');
  to({ el: 30, dist: 380, az: 12, shiftX: 0.11 }, 15.6, 1.0);
  to({ persSpin: 0.35 }, 15.4, 3.4, 'sine.inOut');
  to({ threshold: 9 }, 16.7, 0.6);
  to({ threshold: 0 }, 17.45, 0.25);
  // the three panels of Map 2: water, then mangrove canopy (camera moves in on it), then sediment
  to({ persMode: 1 }, 17.6, 0.4);
  to({ tx: mangroveCentre.x, tz: mangroveCentre.z, dist: 200, el: 40, az: -18, shiftX: 0.15, shiftY: -0.04 }, 17.6, 0.6);
  to({ persMode: 2 }, 18.25, 0.35);
  to({ tx: 0, tz: 0, dist: 420, el: 46, az: 10, shiftX: 0.11 }, 18.25, 0.5);

  // ---------- Map 3: the estuary through time ----------
  // First the six dates compared in Map 3, on a turning ring (same extent, scale and colours),
  // each lifting into its classes. Then all 17 observations: the layers separate progressively
  // while the camera pulls back to show the whole stack, move in on 2011 and climb date by date,
  // each year labelled at the edge of its layer.
  swap(CURRENTS[1], { pers: 0, persMode: 0, map1: 1, map1Sep: 0, map1Turn: 0, az: 0, el: 36, dist: 920, ty: 40, tx: 0, tz: 0, shiftX: -0.15, shiftY: -0.04 });
  to({ map1Turn: Math.PI * 1.1 }, 19.8, 1.0, 'none');
  to({ map1Sep: 1, dist: 600 }, 19.9, 0.5);
  to({ map1Sep: 0 }, 20.4, 0.25);
  tl.set(S, { map1: 0, stack: 1, stackSpread: 0.06, stackFocus: 0, stackSep: 0, stackLift: 0, stackTwist: 0, az: -28, el: 26, dist: 700, ty: 10, shiftX: 0.16 }, 20.7);
  to({ stackSpread: 1, ty: stackHeight * 0.5, dist: 960, el: 14 }, 20.7, 0.5);
  to({ ty: 0, dist: 440, el: 30, stackLift: 9, stackSep: 1, shiftX: 0.0 }, 21.2, 0.3);
  to({ stackFocus: 16, ty: stackHeight }, 21.5, 1.6, 'none');
  to({ az: 26, stackTwist: 0.25 }, 21.5, 1.6, 'sine.inOut');
  to({ ty: stackHeight * 0.5, dist: 980, el: 16, stackSep: 0, stackLift: 0 }, 23.1, 0.4);

  // ---------- Map 4: the estuary as a lived landscape ----------
  // Down to the shore and along it, west to east, as the 2011 shore gives way to 2025.
  swap(CURRENTS[2], { stack: 0, lived: 1, livedFocus: 0, livedSep: 0, az: -5, el: 42, dist: 520, tx: 0, ty: 20, tz: 30, shiftX: 0.12, shiftY: 0 });
  to({ el: 15, dist: 240, tx: -75, tz: 75, az: -24 }, 24.4, 0.9);
  // the classes lift apart to be read one by one, then settle back onto the ground so the boats,
  // houses, cage farms, track and trees are seen standing where they are, in an oblique view
  to({ livedSep: 1 }, 24.6, 0.7);
  to({ livedSep: 0 }, 25.35, 0.6);
  to({ tx: 60, az: 24, dist: 215, el: 19, shiftX: 0.17, shiftY: 0.27 }, 25.3, 1.5, 'sine.inOut');
  to({ livedFocus: 1, ty: 64 }, 25.6, 0.8);
  to({ dist: 430, el: 26, tx: 0, ty: 34, shiftX: 0.08, shiftY: 0.1 }, 26.8, 0.5);

  // ---------- Map 5: between plan and ground ----------
  // Close on the observed traces, then across to the Master Plan sheet, then back to see both.
  swap(CURRENTS[3], { lived: 0, classes: 1, classSep: 0, classSpin: 0, highlight: -1, plan: 1, planDrop: 0, planTowers: 0, az: -12, el: 46, dist: 380, tx: 0, ty: 0, tz: 20, shiftX: 0.16, shiftY: 0 });
  to({ planDrop: 1 }, 28.6, 0.8, 'power2.out');
  to({ tx: 290, dist: 640, az: 10, shiftX: -0.2 }, 28.9, 0.6);
  to({ tx: 145, tz: 90, dist: 860, el: 30, az: 4, shiftX: 0.03 }, 29.55, 0.8);
  to({ planTowers: 1 }, 29.7, 0.5);

  // ---------- Map 6: the estuary and the monsoon ----------
  // The camera orbits the ring of rainfall towers in date order, closing in as it goes.
  swap(CURRENTS[4], { plan: 0, classes: 0.55, monsoon: 1, monsoonFocus: 0, tx: 0, ty: 0, tz: 0, az: -160, el: 28, dist: 680, shiftX: 0.1, shiftY: 0 });
  to({ monsoonFocus: 16, az: 160 }, 32.4, 2.8, 'none');
  to({ dist: 500, el: 20, shiftX: 0.15 }, 32.4, 2.8, 'sine.inOut');

  // ---------- Finale: everything settles back into one estuary ----------
  to({ monsoon: 0, classes: 1, ground: 0.5, classSep: 0.6, classSpin: Math.PI * 2 }, 35.4, 1.0);
  to({ az: 0, el: 68, dist: 600, shiftX: 0.13 }, 35.4, 1.4);
  to({ classSep: 0 }, 36.4, 0.6);

  // ---------- Text beats ----------
  document.querySelectorAll('[data-in]').forEach((el) => {
    const a = +el.dataset.in, b = +el.dataset.out;
    if (a <= 0) gsap.set(el, { autoAlpha: 1, y: 0 });
    else tl.fromTo(el, { autoAlpha: 0, y: 22 }, { autoAlpha: 1, y: 0, duration: 0.28, ease: 'power2.out', immediateRender: false }, a);
    if (b < TOTAL) tl.to(el, { autoAlpha: 0, y: -16, duration: 0.22, ease: 'power2.in' }, b);
  });
  tl.to({}, { duration: 0.01 }, TOTAL);
  return tl;
}

/** Scroll position (px) for a timeline time, for the navigation and the map links. */
export function scrollYForTime(tl, t) {
  const st = tl.st;
  return st.start + (timeToScreens(t) / TOTAL_SCREENS) * (st.end - st.start);
}
export function scrollToTime(tl, t) {
  gsap.to(window, { scrollTo: scrollYForTime(tl, t), duration: 1.6, ease: 'power2.inOut' });
}

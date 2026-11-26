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
  { id: 'arrival', at: 5.2, len: 1.6, bg: '#0c2a37' },
  { id: 'classes', at: 6.8, len: 4.4, bg: '#0c2a37' },
  { id: 'map1', at: 11.2, len: 3.2, bg: '#0c2a37', map: 1 },
  { id: 'map2', at: 15.4, len: 3.4, bg: '#0c2a37', map: 2 },
  { id: 'map3', at: 19.8, len: 3.6, bg: '#0c2a37', map: 3 },
  { id: 'map4', at: 24.4, len: 3.0, bg: '#0c2a37', map: 4 },
  { id: 'map5', at: 28.4, len: 2.8, bg: '#0c2a37', map: 5 },
  { id: 'map6', at: 32.2, len: 3.2, bg: '#0c2a37', map: 6 },
  { id: 'model', at: 36.4, len: 9.8, bg: '#0c2a37' },
  { id: 'finale', at: 46.2, len: 1.8, bg: '#0c2a37' },
  { id: 'return', at: 48.0, len: 3.4, bg: '#02040a' },
];
export const TOTAL = 51.4;
// Tunnels carry the visitor into each map after the first, and into the model chapter
// (1 unit before each). Each tunnel is built from the dots of the map being left.
export const CURRENTS = [15.4, 19.8, 24.4, 28.4, 32.2, 36.4].map((t) => t - 1.0);

// Pacing: how many screens of scrolling each timeline unit takes. Every animation is tied to
// scroll distance (nothing is delayed in time): more screens per unit means each camera move,
// layer separation and text beat unfolds over a longer stretch of ordinary scrolling.
const PACE = [
  [0, 1.6],      // Earth, approach, clouds, arrival (same sequence, more room)
  [6.8, 3.0],    // the ten class specimens
  [11.2, 2.8],   // the six maps
  [28.4, 4.4],   // Map 5: six short steps, given more room
  [31.2, 2.8],   // back to the maps' pace
  [36.4, 2.2],   // manual and automated tracing: twelve short steps
  [46.2, 2.0],   // finale
  [48.0, 1.9],   // back up through the clouds to the Earth
];
const TUNNEL_PACE = 2.4;
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
    space: 1, approach: 0, away: 0,
    cloudP: 0, cloudOp: 0, tint: 0,
    estuary: 0, murk: 0, currentOp: 0, travel: 0, atmo: 0, dust: 0, tunnel: 0, cosmos: 0,
    model: 0, modelSep: 0, modelSwipe: 0, modelManual: 0, modelModel: 0, modelDiff: 0, modelTrans: 0, modelGrowth: 0,
    ground: 0, groundScatter: 30, classes: 0, classSep: 0, classScatter: 0, classSpin: 0, highlight: -1,
    classDim: 0.28, hiSize: 0.35,
    blob: 0, specimen: 0,
    map1: 0, map1Sep: 0, map1Turn: 0,
    pers: 0, persRise: 0, persCount: 17, persMode: 0, persSpin: 0, threshold: 0,
    traceOn: 0, traceT: 5, pulse: 0, edges: 0, edgesT: 0,
    stack: 0, stackSpread: 0, stackFocus: 0, stackSep: 0, stackTwist: 0, stackLift: 0,
    lived: 0, livedFocus: 0, livedSep: 0, livedSpread: 1,
    plan: 0, planDrop: 0, planTowers: 0, planWaffle: 0, planDim: 0, planBox: 0, planLink: 0, planLift: 0, planVeil: 0,
    monsoon: 0, monsoonFocus: 0, monsoonTurn: 0,
    az: 0, el: 89, dist: 1400, tx: 0, ty: 0, tz: 0, shiftX: 0, shiftY: 0,
  };
}

export function buildTimeline(S, { stackHeight, mangroveCentre, planBoxCentre = { x: -300, z: -50 }, onProgress }) {
  const track = document.querySelector('#scroll-track');
  track.style.height = `${(TOTAL_SCREENS + 1) * 100}vh`;
  // The timeline is driven by scroll through the pacing map, with a smoothing glide (the role
  // ScrollTrigger's scrub plays), so the scene follows the scroll softly without jumping.
  const tl = gsap.timeline({ paused: true, defaults: { ease: 'power2.inOut' }, onUpdate: () => onProgress?.(tl.time() / TOTAL) });
  tl.st = ScrollTrigger.create({
    trigger: track, start: 'top top', end: 'bottom bottom',
    onUpdate: (self) => {
      const target = screensToTime(self.progress * TOTAL_SCREENS);
      gsap.to(tl, { time: target, duration: 1.4, ease: 'power3.out', overwrite: true });
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
  // you are here: rings spread across the ground as the estuary gathers, then fade
  to({ pulse: 1 }, 5.0, 0.4);
  to({ pulse: 0 }, 6.4, 0.4);
  // the atmosphere of the opening carries on below the clouds: glows and far star dust
  to({ atmo: 1, dust: 0.55 }, 4.8, 1.0, 'power1.out');

  // ---------- 04 The classes (Blobmixer specimens) ----------
  // The estuary recedes into a small, slowly turning reference at the lower left; only the class
  // in focus stays lit in it, so the specimen holds the centre of attention.
  to({ classes: 1, ground: 0, classDim: 0.07, hiSize: 1.5 }, 6.8, 0.5);
  to({ dist: 640, el: 58, shiftX: -0.25, shiftY: 0.17 }, 6.8, 0.6);
  to({ az: -70, classSpin: 0.4 }, 7.0, 4.0, 'none');
  to({ blob: 1 }, 6.95, 0.35);
  to({ specimen: SPECIMEN_ORDER.length - 1 }, 7.1, 3.9, 'none');
  to({ blob: 0 }, 11.0, 0.25);

  // ---------- Map 1: the estuary as a landscape (25 Feb 2025) ----------
  // The reference comes forward to the right and its classes lift into layers as the camera moves
  // in; the camera circles the separated layers, then the layers settle and the camera visits two
  // parts of the same landscape: the mangrove canopy on the central bed, then the shore.
  // in stages: the reference comes forward, then the layers lift, then the camera circles them
  // first flat from above, as the printed map shows it; then it tilts into a landscape as the
  // layers lift, so the map is seen becoming the place
  to({ shiftX: 0.2, shiftY: -0.03, dist: 580, el: 82, az: -8, ty: 30, classDim: 0.28, hiSize: 0.35, classSpin: 0 }, 11.1, 0.35);
  // watching the tracing: the satellite photo of the day, then each kind of thing drawn over it in
  // turn (water, mangrove canopy, the land edge, boats, cage farms), sweeping across like a pen
  tl.set(S, { traceOn: 1, traceT: 0 }, 11.12);
  to({ ground: 1 }, 11.1, 0.15);
  to({ traceT: 5 }, 11.18, 0.42, 'none');
  to({ ground: 0 }, 11.6, 0.2);
  tl.set(S, { traceOn: 0 }, 11.62);
  to({ classSep: 1 }, 11.64, 0.6, 'power1.inOut');   // the layers rise one after another
  to({ el: 22, az: -34, dist: 470, ty: 70 }, 11.62, 0.45, 'sine.inOut');
  to({ dist: 330, az: 28, el: 16 }, 12.0, 0.75, 'sine.inOut');
  to({ classSep: 0, ty: 0, tx: mangroveCentre.x, tz: mangroveCentre.z, dist: 200, el: 50, az: -10, shiftX: 0.16, shiftY: 0.06 }, 12.75, 0.7);
  tl.set(S, { highlight: 3, classDim: 0.4, hiSize: 0.7 }, 12.8);   // mangrove canopy singled out
  tl.set(S, { highlight: -1, classDim: 0.28, hiSize: 0.35 }, 13.45);
  // down to eye level on the shore, as if standing at the water's edge looking along the boats
  to({ tx: 0, tz: 78, dist: 250, el: 11, az: 8, shiftX: -0.2, shiftY: -0.15 }, 13.4, 0.36);
  to({ classSep: 0, dist: 380, el: 40, tz: 10, shiftX: 0.1 }, 14.1, 0.35);

  // ---------- After the arrival, the surroundings form slowly: sky, horizon and water ----------
  to({ cosmos: 1 }, 5.4, 5.6, 'sine.inOut');

  // ---------- Tunnels into each following chapter ----------
  // S.tunnel runs from i to i + 1 through tunnel i. The map's own dots leave their places to form
  // the tunnel walls (the map itself recedes into the murk), the visitor travels through them,
  // and they settle into the next map's dots as it emerges (estuary.js, buildTunnel).
  CURRENTS.forEach((t, i) => {
    to({ tunnel: i + 1 }, t, 1.0, 'none');
    to({ murk: 1 }, t + 0.06, 0.3, 'power1.in');
    to({ murk: 0 }, t + 0.66, 0.3, 'power1.out');
  });
  // swap the content while the tunnel surrounds the visitor
  const swap = (t, vars) => tl.set(S, vars, t + 0.5);

  // ---------- Map 2: patterns of wetness and vegetation ----------
  // From above, the grid rises; the camera then descends into it (the counts become columns you
  // can look along) and finally moves in on the mangrove canopy.
  swap(CURRENTS[0], { map1: 0, classes: 0, pers: 1, persRise: 1, persCount: 0, az: -25, el: 66, dist: 400, ty: 0, tx: 0, tz: 0, shiftX: 0.17, shiftY: 0 });
  // counting: one date at a time, each adds a ball to every square that was water on it
  const countUp = (n) => (p) => { const x = p * n, i = Math.min(n - 1, Math.floor(x)); return (i + Math.min(1, (x - i) / 0.35)) / n; };
  to({ persCount: 17 }, 15.45, 0.85, countUp(17));
  // down to a low, close angle: each column is one cell, its height the dates it was water
  to({ el: 22, dist: 310, az: 18, shiftX: 0.24 }, 15.95, 0.75);
  // relaxation: look down across the slab so the cells that pass the slider stand out
  to({ el: 44, dist: 360, az: -6, shiftX: 0.2 }, 16.65, 0.6);
  to({ az: 24, el: 34 }, 17.0, 0.55, 'sine.inOut');
  to({ persSpin: 0.35 }, 15.4, 3.4, 'sine.inOut');
  to({ threshold: 9 }, 16.7, 0.6);
  to({ threshold: 0 }, 17.45, 0.25);
  // the three panels of Map 2: water, then mangrove canopy (camera moves in on it), then sediment
  to({ persMode: 1 }, 17.6, 0.4);
  to({ tx: mangroveCentre.x, tz: mangroveCentre.z, dist: 140, el: 30, az: -18, shiftX: 0.15, shiftY: -0.04 }, 17.6, 0.6);
  to({ az: 14 }, 18.0, 0.3, 'sine.inOut');
  to({ persMode: 2 }, 18.25, 0.35);
  // sediment: low and close, so the band of mid-height columns (ground that changes) is visible
  to({ tx: 0, tz: 0, dist: 360, el: 26, az: 24, shiftX: 0.21, shiftY: -0.06 }, 18.25, 0.5);

  // ---------- Map 3: the estuary through time ----------
  // First the six dates compared in Map 3, on a turning ring (same extent, scale and colours),
  // each lifting into its classes. Then all 17 observations: the layers separate progressively
  // while the camera pulls back to show the whole stack, move in on 2011 and climb date by date,
  // each year labelled at the edge of its layer.
  swap(CURRENTS[1], { pers: 0, persMode: 0, map1: 1, map1Sep: 0, map1Turn: 0, az: 0, el: 36, dist: 920, ty: 40, tx: 0, tz: 0, shiftX: -0.24, shiftY: -0.15 });
  to({ map1Turn: Math.PI * 1.1 }, 19.8, 1.0, 'none');
  to({ map1Sep: 1, dist: 600, el: 32 }, 19.9, 0.5);
  to({ map1Sep: 0 }, 20.4, 0.25);
  tl.set(S, { map1: 0, stack: 1, stackSpread: 0.06, stackFocus: 0, stackSep: 0, stackLift: 0, stackTwist: 0, az: -28, el: 26, dist: 700, ty: 10, shiftX: 0.16 }, 20.7);
  to({ stackSpread: 1, ty: stackHeight * 0.5, dist: 760, el: 14, shiftX: 0.1 }, 20.7, 0.5);
  to({ ty: 0, dist: 320, el: 26, stackLift: 9, stackSep: 1, shiftX: 0.0 }, 21.2, 0.3);
  // date by date: the focus moves to the next observation, then holds there while it is read
  const steps = (n) => (p) => { const x = p * n, i = Math.min(n - 1, Math.floor(x)), f = x - i; return (i + gsap.parseEase('power2.inOut')(Math.min(1, f / 0.45))) / n; };
  to({ stackFocus: 16, ty: stackHeight }, 21.5, 1.6, steps(16));
  to({ az: 26, stackTwist: 0.25 }, 21.5, 1.6, 'sine.inOut');
  to({ ty: stackHeight * 0.5, dist: 780, el: 16, stackSep: 0, stackLift: 0 }, 23.1, 0.4);

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
  // Five short steps that build up to the printed map's side-by-side view:
  // 1 the ground: a low pass along the traced shore of 25 February 2025;
  // 2 the plan: the Master Plan sheet settles beside it and is read from above;
  // 3 the study area on the plan: the red box, then a dotted arc joining it to the ground;
  // 4 the four categories: the towers of the plan's shares, seen low across them;
  // 5 side by side: both, from above, as the printed map sets them (plan left, ground right).
  swap(CURRENTS[3], { lived: 0, classes: 1, classSep: 0, classSpin: 0, highlight: -1, plan: 1, planDrop: 0, planTowers: 0, planWaffle: 0, planBox: 0, planLink: 0, planLift: 0, az: -40, el: 22, dist: 290, tx: 10, ty: 0, tz: 45, shiftX: 0.18, shiftY: 0 });
  // 1 the ground
  to({ az: 10, el: 30, dist: 340, tz: 20 }, 28.4, 0.45, 'sine.inOut');
  // 2 the plan settles beside it
  to({ planDrop: 1 }, 28.85, 0.35, 'power2.out');
  to({ tx: -290, tz: 0, dist: 900, el: 70, az: 0, shiftX: 0.2, shiftY: 0.04 }, 28.85, 0.33);
  // 3 the study area on the plan, then the arc to the ground
  to({ planBox: 1 }, 29.3, 0.2);
  to({ tx: planBoxCentre.x, tz: planBoxCentre.z + 20, dist: 560, el: 62, az: 6, shiftX: 0.24 }, 29.3, 0.25);
  to({ planLink: 1 }, 29.55, 0.18);
  to({ tx: -150, tz: -10, dist: 1120, el: 52, az: 0, shiftX: 0.2 }, 29.55, 0.2);
  // 4 the box is lifted out, carried along the arc and laid over the ground, then fades so the ground shows through
  to({ planLift: 1 }, 29.78, 0.32, 'power1.inOut');
  to({ tx: 50, tz: 20, ty: 0, dist: 520, el: 56, az: -10, shiftX: 0.22, shiftY: 0.06 }, 29.78, 0.32);
  to({ planVeil: 1 }, 30.0, 0.2, 'sine.inOut');
  to({ az: 8 }, 30.0, 0.25, 'sine.inOut');
  // 5 the box goes back; the plan's four categories rise as towers
  to({ planLift: 0, planVeil: 0 }, 30.28, 0.25, 'power1.inOut');
  to({ planWaffle: 1 }, 30.3, 0.2, 'none');   // the 100 squares rise in turn
  to({ planDim: 1 }, 30.28, 0.15);             // the plan sheet steps back while the squares are read
  to({ planDim: 0 }, 30.62, 0.15);
  // looking down at the 100 squares from a little above, as if over a model on a table
  to({ tx: -290, tz: 330, ty: 0, dist: 430, el: 46, az: -14, shiftX: 0.2, shiftY: 0.04 }, 30.28, 0.25);
  to({ az: 10, el: 40 }, 30.45, 0.22, 'sine.inOut');   // a slow turn round the little landscape
  // 6 side by side, as the printed map sets them
  // the 100 squares fold away (they were the last step's), and the two pictures fill the view
  to({ planWaffle: 0 }, 30.66, 0.12, 'none');
  to({ tx: -150, tz: -40, ty: 0, dist: 720, el: 80, az: 0, shiftX: 0.2, shiftY: 0.02 }, 30.68, 0.28);

  // ---------- Map 6: the estuary and the monsoon ----------
  // The camera orbits the ring of rainfall towers in date order, closing in as it goes.
  swap(CURRENTS[4], { plan: 0, classes: 0.55, monsoon: 1, monsoonFocus: 0, tx: 0, ty: 0, tz: 0, az: -160, el: 28, dist: 560, shiftX: -0.12, shiftY: 0 });
  to({ monsoonFocus: 16, az: 160 }, 32.4, 2.8, 'none');
  to({ dist: 470, el: 26, shiftX: -0.25 }, 32.4, 1.0, 'sine.inOut');
  to({ dist: 560, el: 52, shiftX: -0.25 }, 34.7, 0.6, 'sine.inOut');

  // ---------- Manual and automated tracing (tools/ml/classify.py, change.py) ----------
  // What is changing, how reliably it can be identified, what might happen next. The date shown
  // is chosen on the chapter's date timeline; the change and scenario views combine all 17 dates.
  swap(CURRENTS[5], { monsoon: 0, classes: 0, model: 1, modelManual: 1, modelModel: 0, modelDiff: 0, modelTrans: 0, modelGrowth: 0, modelSep: 0, tx: 0, ty: 0, tz: 0, az: -24, el: 58, dist: 560, shiftX: 0.16, shiftY: 0.1 });
  // An introduction, then three questions in eleven short steps. 1 What is changing: the traced classes of the selected date,
  // then how often every cell changed class across all 17 dates.
  // intro: down from above onto my tracing of the chosen date
  to({ el: 46, dist: 310, az: -32 }, 36.5, 0.7);
  // Q1 trends: a slow turn across the traced estuary
  to({ az: -6, el: 32, dist: 270 }, 37.3, 0.7, 'sine.inOut');
  // Q1 where it changes: the classes give way to columns of changes; low and close so the
  // tall columns (ground that changed most often) stand up against the short ones
  to({ modelManual: 0, modelTrans: 1 }, 38.0, 0.45);
  to({ el: 16, dist: 250, az: 26 }, 38.0, 0.7);
  // 2 How reliably: the model's version rises above the tracing; seen from the side so the two
  // layers read as a pair
  to({ modelTrans: 0, modelManual: 1, modelModel: 1, modelSep: 0, modelSwipe: 1 }, 38.8, 0.5);   // one surface, compared with a sweeping line
  to({ az: 24, dist: 340, el: 48, shiftX: 0.2, shiftY: -0.1 }, 38.8, 0.7, 'sine.inOut');
  // date by date: round to the front of the pair
  to({ az: 6, el: 52, dist: 335 }, 39.6, 0.7, 'sine.inOut');
  // compare by class: a closer, slower turn (a chosen class also draws the camera to it)
  to({ az: -12, el: 50, dist: 330 }, 40.4, 0.8, 'sine.inOut');
  // all 17 dates: back out to see the whole pair
  to({ az: -24, el: 52, dist: 370, shiftX: 0.17, shiftY: -0.1 }, 41.2, 0.6);
  // where it goes wrong: only the disagreement, from close above
  to({ modelManual: 0, modelModel: 0, modelDiff: 1, modelSep: 0.45, modelSwipe: 0 }, 42.0, 0.45);
  to({ az: -4, el: 52, dist: 240 }, 42.0, 0.7);
  // why the two disagree: a low pass along the edge of the water
  to({ az: 30, el: 22, dist: 230 }, 42.8, 0.7, 'sine.inOut');
  // 3 What might happen next: the one class with a significant trend, mangrove canopy, by the date
  // it was first traced; the camera moves in on it, circles it, then returns for the scenarios.
  to({ modelDiff: 0, modelGrowth: 1, modelSep: 0 }, 43.6, 0.45);
  to({ tx: mangroveCentre.x, tz: mangroveCentre.z, dist: 170, el: 30, az: -20, shiftX: 0.15, shiftY: 0.06 }, 43.65, 0.6);
  to({ az: 70, el: 24 }, 44.3, 0.9, 'sine.inOut');
  to({ tx: mangroveCentre.x, tz: mangroveCentre.z, el: 46, dist: 235, az: 30, shiftX: 0.15, shiftY: 0.12 }, 45.2, 0.6);

  // ---------- Finale: everything settles back into one estuary ----------
  // The estuary settles back, dimmed, and the waterline of each of the 17 dates is drawn on it,
  // one after another, from the earliest (warm) to the latest (blue): they never lie in one place.
  to({ model: 0, monsoon: 0, classes: 0.12, ground: 0, classSep: 0, classSpin: 0 }, 46.2, 0.6);
  to({ tx: 0, tz: 0, ty: 0, az: -6, el: 68, dist: 350, shiftX: 0.2, shiftY: 0.02 }, 46.2, 0.7);
  to({ edges: 1 }, 46.3, 0.2);
  to({ edgesT: 17.5 }, 46.36, 0.66, 'none');   // drawn while the step explaining them is on screen
  to({ az: 10, el: 62 }, 46.9, 1.1, 'sine.inOut');
  to({ edges: 0 }, 47.95, 0.25);

  // ---------- The way back: up through the clouds, to the Earth seen from another side ----------
  // The reverse of the arrival. The camera lifts off the estuary as its dots drift apart, the
  // clouds close in (blue turning back to white), and above them the Earth turns away from
  // Kundapur and settles, further off, on another face.
  to({ el: 84, dist: 1250, az: 40, shiftX: 0, shiftY: 0, classScatter: 16, classSpin: Math.PI * 2.4 }, 48.0, 1.0, 'power1.in');
  to({ atmo: 0, dust: 0, cosmos: 0 }, 48.2, 0.6);
  tl.set(S, { cloudP: 0.8 }, 48.4);   // back inside the cloud layer, where the arrival left it
  to({ cloudOp: 1 }, 48.45, 0.45, 'power1.out');
  to({ cloudP: 0.05 }, 48.45, 1.9, 'none');
  to({ tint: 0 }, 48.7, 0.8);
  to({ estuary: 0 }, 48.9, 0.3, 'none');
  to({ space: 1 }, 49.4, 0.3, 'none');
  to({ cloudOp: 0 }, 49.75, 0.55, 'power1.in');
  to({ away: 1 }, 49.4, 1.9, 'power2.out');

  // ---------- Text beats ----------
  // Text steps never overlap: each one has finished fading out just before the next step's text
  // begins to appear (otherwise, for a moment, two blocks of text sit on top of each other).
  const textSteps = [...document.querySelectorAll('.beat[data-in]')].sort((p, q) => +p.dataset.in - +q.dataset.in);
  const nextIn = new Map(textSteps.map((el, i) => [el, i + 1 < textSteps.length ? +textSteps[i + 1].dataset.in : Infinity]));
  document.querySelectorAll('[data-in]').forEach((el) => {
    const a = +el.dataset.in, b = +el.dataset.out;
    if (a <= 0) gsap.set(el, { autoAlpha: 1, y: 0 });
    else tl.fromTo(el, { autoAlpha: 0, y: 22 }, { autoAlpha: 1, y: 0, duration: 0.28, ease: 'power2.out', immediateRender: false }, a);
    if (b < TOTAL) {
      const n = nextIn.get(el) ?? Infinity;
      const end = Math.min(b + 0.22, n - 0.02);            // gone before the next step appears
      const start = Math.min(b, end - 0.12);
      tl.to(el, { autoAlpha: 0, y: -16, duration: Math.max(0.08, end - start), ease: 'power2.in' }, Math.max(a + 0.3, start));
    }
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
/** Jump straight to a chapter (the navigation): a short fade hides the cut, and the timeline is
 *  set directly rather than played through every chapter on the way, which is what made it lag. */
export function jumpToTime(tl, t, veil) {
  gsap.killTweensOf(window);
  gsap.to(veil, {
    autoAlpha: 1, duration: 0.28, ease: 'power1.in', overwrite: true,
    onComplete: () => {
      gsap.killTweensOf(tl);
      tl.time(t, false);
      window.scrollTo({ top: scrollYForTime(tl, t), behavior: 'instant' });
      gsap.killTweensOf(tl);
      tl.time(t, false);
      requestAnimationFrame(() => requestAnimationFrame(() => gsap.to(veil, { autoAlpha: 0, duration: 0.55, ease: 'power1.out' })));
    },
  });
}

// The scroll director. One GSAP timeline scrubbed by ScrollTrigger over a tall track; time is in
// "screens" (1 unit = one viewport height of scrolling). The timeline animates a plain state
// object S that the render loop reads each frame, and reveals the text beats placed in the HTML
// with data-in / data-out times.
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';
gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);

// Chapter plan. Labels are what the chapter rail and the map links jump to.
export const CHAPTERS = [
  { id: 'intro', at: 0, len: 1.2, bg: '#02040a' },
  { id: 'approach', at: 1.2, len: 1.8, bg: '#02040a' },
  { id: 'clouds', at: 3.0, len: 2.2, bg: '#dfe6e8' },
  { id: 'arrival', at: 5.2, len: 1.6, bg: '#0d2c3b' },
  { id: 'classes', at: 6.8, len: 4.4, bg: '#0d2c3b' },
  { id: 'map1', at: 11.2, len: 3.2, bg: '#0d2c3b', map: 1 },
  { id: 'map2', at: 15.4, len: 3.4, bg: '#0b2a36', map: 2 },
  { id: 'map3', at: 19.8, len: 3.6, bg: '#0d2c3b', map: 3 },
  { id: 'map4', at: 24.4, len: 3.0, bg: '#0f2e3a', map: 4 },
  { id: 'map5', at: 28.4, len: 2.8, bg: '#0d2c3b', map: 5 },
  { id: 'map6', at: 32.2, len: 3.2, bg: '#0b2733', map: 6 },
  { id: 'finale', at: 35.4, len: 1.8, bg: '#0d2c3b' },
];
export const TOTAL = 37.2;
// Water-current tunnels carry the visitor into each map after the first (1 unit before it).
export const CURRENTS = [15.4, 19.8, 24.4, 28.4, 32.2].map((t) => t - 1.0);
export const SPECIMEN_ORDER = ['water', 'muddy_shallows', 'bed_ground', 'mangrove_canopy', 'land_edge',
  'tree_cover', 'track', 'buildings', 'boats', 'cage_farms'];

export function createState() {
  return {
    space: 1, approach: 0,
    cloudP: 0, cloudOp: 0, tint: 0,
    estuary: 0, murk: 0, currentOp: 0, travel: 0,
    ground: 0, groundScatter: 30, classes: 0, classSep: 0, classScatter: 0, classSpin: 0, highlight: -1,
    blob: 0, specimen: 0,
    map1: 0, map1Sep: 0, map1Turn: 0,
    pers: 0, persRise: 0, persMode: 0, persSpin: 0, threshold: 0,
    stack: 0, stackSpread: 0, stackFocus: 0, stackSep: 0, stackTwist: 0,
    lived: 0, livedFocus: 0, livedSep: 0, livedSpread: 1,
    plan: 0, planDrop: 0, planTowers: 0,
    monsoon: 0, monsoonFocus: 0, monsoonTurn: 0,
    az: 0, el: 89, dist: 1400, tx: 0, ty: 0, tz: 0,
  };
}

export function buildTimeline(S, { stackHeight, onProgress }) {
  const track = document.querySelector('#scroll-track');
  track.style.height = `${(TOTAL + 1) * 100}vh`;
  const tl = gsap.timeline({
    defaults: { ease: 'power2.inOut' },
    scrollTrigger: { trigger: track, start: 'top top', end: 'bottom bottom', scrub: 1.0, onUpdate: (s) => onProgress?.(s.progress) },
  });
  const to = (vars, at, duration = 1, ease) => tl.to(S, { ...vars, duration, ...(ease ? { ease } : {}) }, at);
  CHAPTERS.forEach((c) => tl.addLabel(c.id, c.at));

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

  // 04 the classes as specimens (Blobmixer), each lighting its own dots in the estuary
  to({ classes: 1, ground: 0.22 }, 6.8, 0.5);
  to({ blob: 1 }, 6.9, 0.4);
  to({ specimen: SPECIMEN_ORDER.length - 1 }, 7.1, 3.9, 'none');
  to({ az: 24, el: 48, dist: 380 }, 6.8, 4.2, 'sine.inOut');
  to({ blob: 0 }, 11.0, 0.3);

  // Map 1: the classes lift into layers and turn; then the six representative dates on a ring
  to({ classSep: 1, classSpin: Math.PI * 0.9, ground: 0 }, 11.1, 1.2);
  to({ el: 22, az: -30, dist: 520, ty: 70 }, 11.1, 1.2);
  to({ classes: 0, classSep: 0.4 }, 12.2, 0.5);
  to({ map1: 1 }, 12.3, 0.5);
  to({ map1Turn: Math.PI * 1.35 }, 12.3, 2.0, 'none');
  to({ el: 30, az: 0, dist: 640, ty: 40, tx: -70 }, 12.3, 0.9);
  to({ map1Sep: 1 }, 12.9, 0.7);
  to({ map1Sep: 0 }, 13.9, 0.5);

  // current tunnels into each following map
  CURRENTS.forEach((t) => {
    to({ currentOp: 1, murk: 1 }, t, 0.35, 'power1.in');
    to({ travel: '+=1' }, t, 1.0, 'none');
    to({ currentOp: 0, murk: 0 }, t + 0.65, 0.35, 'power1.out');
  });
  // swap the content while the current covers the scene
  const swap = (t, vars) => tl.set(S, vars, t + 0.5);

  // Map 2: persistence columns. Each ball = one date on which the 1.5 m cell was water.
  swap(CURRENTS[0], { map1: 0, pers: 1, persRise: 0, az: -25, el: 38, dist: 360, ty: 0, tx: 0, tz: 0 });
  to({ persRise: 1 }, 15.4, 1.0, 'power2.out');
  to({ persSpin: 0.6, az: 18, el: 30 }, 15.4, 3.2, 'sine.inOut');
  to({ threshold: 9 }, 16.6, 0.6);
  to({ threshold: 0 }, 17.4, 0.3);
  to({ persMode: 1 }, 17.6, 0.5);
  to({ persMode: 0 }, 18.4, 0.3);

  // Map 3: the 17 observations stacked on a time axis; the camera climbs the years
  swap(CURRENTS[1], { pers: 0, stack: 1, stackSpread: 0.15, stackFocus: 0, az: -40, el: 18, dist: 330, ty: 0 });
  to({ stackSpread: 1 }, 19.8, 0.8);
  to({ stackFocus: 16, ty: stackHeight }, 20.3, 2.7, 'none');
  to({ stackSep: 1 }, 20.3, 0.4);
  to({ az: 40 }, 20.3, 2.7, 'sine.inOut');
  to({ stackTwist: 1.2 }, 20.6, 2.4);
  to({ stackSep: 0, stackSpread: 0.35, ty: stackHeight * 0.35 * 0.5, el: 24, dist: 420, stackTwist: 0 }, 23.0, 0.7);

  // Map 4: shoreline elements, 2011 below and 2025 above, seen low from the shore
  swap(CURRENTS[2], { stack: 0, lived: 1, livedFocus: 0, livedSep: 0, az: 0, el: 16, dist: 330, tx: -10, ty: 20, tz: 60 });
  to({ livedSep: 1 }, 24.6, 0.8);
  to({ livedFocus: 1, ty: 60 }, 25.5, 1.0);
  to({ az: 28, el: 22 }, 24.4, 3.0, 'sine.inOut');
  to({ livedSep: 0.2 }, 26.8, 0.5);

  // Map 5: the Master Plan sheet arrives beside the observed traces
  swap(CURRENTS[3], { lived: 0, classes: 1, classSep: 0, classSpin: 0, highlight: -1, plan: 1, planDrop: 0, planTowers: 0, az: -8, el: 52, dist: 720, tx: 120, ty: 0, tz: 30 });
  to({ planDrop: 1 }, 28.5, 0.9, 'power2.out');
  to({ planTowers: 1 }, 29.4, 0.5);
  to({ az: 12, el: 30, dist: 640, tz: 90 }, 29.4, 1.6);

  // Map 6: rainfall before each observation, around the estuary
  swap(CURRENTS[4], { plan: 0, classes: 0.55, monsoon: 1, monsoonFocus: 0, tx: 0, ty: 0, tz: 0, az: -160, el: 26, dist: 520 });
  to({ monsoonFocus: 16, az: 160 }, 32.4, 2.8, 'none');

  // Finale: everything settles back into one estuary
  to({ monsoon: 0, classes: 1, ground: 0.5, classSep: 0.6, classSpin: Math.PI * 2 }, 35.4, 1.0);
  to({ az: 0, el: 70, dist: 470, tx: -110 }, 35.4, 1.4);
  to({ classSep: 0 }, 36.4, 0.6);

  // text beats
  document.querySelectorAll('[data-in]').forEach((el) => {
    const a = +el.dataset.in, b = +el.dataset.out;
    if (a <= 0) gsap.set(el, { autoAlpha: 1, y: 0 });
    else tl.fromTo(el, { autoAlpha: 0, y: 26 }, { autoAlpha: 1, y: 0, duration: 0.3, ease: 'power2.out', immediateRender: false }, a);
    if (b < TOTAL) tl.to(el, { autoAlpha: 0, y: -18, duration: 0.25, ease: 'power2.in' }, b);
  });
  tl.to({}, { duration: 0.01 }, TOTAL);
  return tl;
}

/** Scroll position (px) for a timeline time, for the chapter rail and the map links. */
export function scrollToTime(tl, t) {
  const st = tl.scrollTrigger;
  const y = st.start + (t / tl.duration()) * (st.end - st.start);
  gsap.to(window, { scrollTo: y, duration: 1.4, ease: 'power2.inOut' });
}

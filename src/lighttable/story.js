// Scroll-driven narrative for the Light Table prototype.
//
// One GSAP timeline, scrubbed by ScrollTrigger over a tall scroll track. The timeline animates a
// plain state object (camera orbit, sheet reveal, lift, carrier visibility); the render loop reads
// that state every frame. The camera is described as an orbit around the footprint (azimuth,
// elevation, distance as a multiple of the "fit" distance), so the framing adapts to any aspect
// ratio without re-authoring keyframes.
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import * as THREE from 'three';

gsap.registerPlugin(ScrollTrigger);

export const BEATS = ['surface', 'trace', 'lift', 'examine', 'return'];

export function createState() {
  return {
    az: 0, el: 89, dist: 1.0, tx: 0, ty: 0, tz: 0, // camera orbit (degrees, fit multiple, target offset m)
    reveal: 0,      // 0..1 share of the classes revealed, in stack order
    lift: 0,        // 0 flat on the table, 1 fully separated
    carrier: 0,     // visibility of the clear carriers
    image: 1,       // satellite screenshot visibility
  };
}

export function buildTimeline({ state, beatEls, onProgress }) {
  const track = document.querySelector('#scroll-track');
  track.style.height = `${(BEATS.length + 1.6) * 100}vh`;

  const tl = gsap.timeline({
    defaults: { ease: 'power2.inOut' },
    scrollTrigger: {
      trigger: track, start: 'top top', end: 'bottom bottom', scrub: 1.1,
      onUpdate: (self) => onProgress?.(self.progress),
    },
  });

  const show = (el, at, dur = 0.35) => tl.fromTo(el, { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: dur, ease: 'power2.out' }, at);
  const hide = (el, at, dur = 0.3) => tl.to(el, { autoAlpha: 0, y: -16, duration: dur, ease: 'power2.in' }, at);
  const B = Object.fromEntries(beatEls.map((el) => [el.dataset.beat, el]));

  // 0 - 1  The screenshot on the table, seen from above.
  gsap.set(B.surface, { autoAlpha: 1, y: 0 }); // visible on arrival; the timeline only hides it
  tl.to(state, { el: 80, dist: 1.02, duration: 1 }, 0);
  hide(B.surface, 0.75);

  // 1 - 3  Traces appear class by class, still lying on the image.
  show(B.trace, 1.0);
  tl.to(state, { reveal: 1, duration: 1.7, ease: "none" }, 1.05);
  tl.to(state, { el: 64, az: -12, dist: 1.05, duration: 2 }, 1.0);
  hide(B.trace, 2.75);

  // 3 - 5  Lift: sheets leave the table in order, camera swings to a three-quarter view.
  show(B.lift, 3.0);
  tl.to(state, { lift: 1, carrier: 1, image: 0.55, duration: 1.8 }, 3.0);
  tl.to(state, { el: 24, az: -38, dist: 1.42, ty: 70, duration: 2 }, 3.0);
  hide(B.lift, 4.75);

  // 5 - 7  Examine: a slow orbit low along the stack.
  show(B.examine, 5.0);
  tl.to(state, { az: 28, el: 14, dist: 1.3, ty: 62, duration: 2, ease: 'sine.inOut' }, 5.0);
  hide(B.examine, 6.75);

  // 7 - 9  Return: sheets settle back into alignment, camera returns above.
  show(B.return, 7.0);
  tl.to(state, { lift: 0, carrier: 0, image: 1, duration: 1.6 }, 7.0);
  tl.to(state, { az: 0, el: 86, dist: 1.0, ty: 0, duration: 1.8 }, 7.0);
  tl.to({}, { duration: 0.6 }, 9.0); // brief hold at the end

  return tl;
}

/** Distance at which a w x h footprint fills the view (with margin), for the current camera. */
export function fitDistance(camera, width, height, margin = 1.34) {
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
  return Math.max((height / 2) / Math.tan(vFov / 2), (width / 2) / Math.tan(hFov / 2)) * margin;
}

const _pos = new THREE.Vector3();
export function applyCamera(camera, state, frame) {
  const fit = fitDistance(camera, frame.width, frame.height);
  const az = THREE.MathUtils.degToRad(state.az);
  const el = THREE.MathUtils.degToRad(state.el);
  const target = _pos.set(frame.centre.x + state.tx, frame.centre.y + state.ty, frame.centre.z + state.tz);
  const d = fit * state.dist;
  camera.position.set(
    target.x + d * Math.cos(el) * Math.sin(az),
    target.y + d * Math.sin(el),
    target.z + d * Math.cos(el) * Math.cos(az),
  );
  camera.up.set(0, 1, 0);
  camera.lookAt(target);
}

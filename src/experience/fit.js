// Type sized to the room each step has. Every step of the story is measured where it sits on the
// screen: a step with a few words (a statement, a question) gets larger type and fills its space,
// a step with more to read keeps its size, and one that would run off the screen is set a little
// smaller until it fits. Two factors are set on each step: --fh for headings and figures, --fb
// for reading text and annotations (which grows far less, so long lines stay comfortable).

const MIN = 0.84;      // never smaller than this share of the base size
const GROW = 1.3;      // headings grow at most by this much on the shortest steps
const FILL = 0.58;     // a step grows until it takes about this share of the height it has

function room(beat) {
  const H = innerHeight;
  const cs = getComputedStyle(beat);
  if (beat.classList.contains('beat--mid') || beat.classList.contains('beat--hero')) return H - 2 * 90;
  if (beat.classList.contains('beat--top') || beat.classList.contains('beat--model')) return H - parseFloat(cs.top || 0) - 70;
  return H - parseFloat(cs.bottom || 0) - 70;   // from its foot up to below the top edge
}

function set(beat, s) {
  beat.style.setProperty('--fh', s.toFixed(3));
  beat.style.setProperty('--fb', (1 + (s - 1) * (s > 1 ? 0.4 : 1)).toFixed(3));
}

export function fitBeats(root = document) {
  const portrait = innerWidth < innerHeight;
  for (const beat of root.querySelectorAll('.beat')) {
    set(beat, 1);
    if (portrait) continue;
    const A = room(beat);
    let h = beat.scrollHeight, s = 1;
    if (h > A) {
      while (h > A && s > MIN) { s -= 0.03; set(beat, s); h = beat.scrollHeight; }
    } else {
      // steps whose figures change as the visitor picks a date grow less, so a longer reading still fits
      const cap = beat.matches('.beat--interactive, .beat--readout') ? 1.12 : GROW;
      while (s < cap) {
        set(beat, s + 0.04);
        if (beat.scrollHeight > A * FILL) { set(beat, s); break; }
        s += 0.04;
      }
    }
  }
}

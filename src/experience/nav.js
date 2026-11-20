// Water-line navigation. A thin meandering line on the right, like a traced land edge, with one
// mark per chapter. The travelled part fills; a ring rides the line at the reader's position.
// Labels stay hidden: the current chapter's title appears briefly on arrival, and any mark
// reveals its title on hover or keyboard focus. Clicking a mark scrolls to that chapter.
const PATH = 'M30 0 C 8 70, 36 120, 22 190 S 6 300, 20 340 S 34 380, 26 400';
const VB_W = 46, VB_H = 400;

export const NAV_ITEMS = [
  { id: 'intro', kicker: 'Approach', title: 'From space to Kundapur' },
  { id: 'classes', kicker: 'The classes', title: 'What was traced' },
  { id: 'map1', kicker: 'Map 1', title: 'The estuary as a landscape', map: 1 },
  { id: 'map2', kicker: 'Map 2', title: 'Patterns of wetness and vegetation', map: 2 },
  { id: 'map3', kicker: 'Map 3', title: 'The estuary through time', map: 3 },
  { id: 'map4', kicker: 'Map 4', title: 'The estuary as a lived landscape', map: 4 },
  { id: 'map5', kicker: 'Map 5', title: 'Between plan and ground', map: 5 },
  { id: 'map6', kicker: 'Map 6', title: 'The estuary and the monsoon', map: 6 },
  { id: 'finale', kicker: 'Conclusion', title: 'A line that moves' },
];

export function createGauge(root, chapters, total, onGo) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${VB_W} ${VB_H}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  const mk = (cls) => { const p = document.createElementNS(ns, 'path'); p.setAttribute('d', PATH); p.setAttribute('class', cls); p.setAttribute('vector-effect', 'non-scaling-stroke'); svg.append(p); return p; };
  mk('track');
  const fill = mk('fill');
  const len = fill.getTotalLength();
  fill.style.strokeDasharray = `${len} ${len + 20}`;
  fill.style.strokeDashoffset = `${len}`;
  const ring = document.createElementNS(ns, 'g');
  ring.innerHTML = '<circle class="now" r="6.5" vector-effect="non-scaling-stroke"/><circle class="now-core" r="1.6"/>';
  svg.append(ring);
  root.append(svg);

  const label = document.createElement('div');
  label.className = 'gauge-label';
  label.innerHTML = '<small></small><span></span>';
  root.append(label);
  const count = document.createElement('div');
  count.className = 'gauge-count';
  root.append(count);

  const at = (frac) => fill.getPointAtLength(Math.max(0, Math.min(1, frac)) * len);
  const toPct = (pt) => ({ x: (pt.x / VB_W) * 100, y: (pt.y / VB_H) * 100 });

  const items = NAV_ITEMS.map((item) => {
    const ch = chapters.find((c) => c.id === item.id);
    const frac = ch.at / total;
    const p = toPct(at(frac));
    const b = document.createElement('button');
    b.type = 'button';
    b.className = item.map ? 'is-map' : '';
    b.style.left = `${p.x}%`;
    b.style.top = `${p.y}%`;
    b.setAttribute('aria-label', `${item.kicker}: ${item.title}`);
    b.addEventListener('click', () => onGo(item.id));
    b.addEventListener('pointerenter', () => show(item, p, false));
    b.addEventListener('focus', () => show(item, p, false));
    b.addEventListener('pointerleave', () => restore());
    b.addEventListener('blur', () => restore());
    root.append(b);
    return { ...item, frac, p, el: b };
  });

  let current = null, hideTimer = 0;
  function show(item, p, timed) {
    label.querySelector('small').textContent = item.kicker;
    label.querySelector('span').textContent = item.title;
    label.style.top = `${p.y}%`;
    label.classList.add('show');
    clearTimeout(hideTimer);
    if (timed) hideTimer = setTimeout(() => label.classList.remove('show'), 2800);
  }
  function restore() { label.classList.remove('show'); }

  return {
    setProgress(progress) {
      fill.style.strokeDashoffset = `${len * (1 - progress)}`;
      const pt = at(progress);
      ring.setAttribute('transform', `translate(${pt.x} ${pt.y}) scale(${VB_W / root.clientWidth || 1} ${VB_H / root.clientHeight || 1})`);
      items.forEach((it) => it.el.classList.toggle('passed', progress >= it.frac - 0.001));
    },
    setChapter(id) {
      // the last nav item whose chapter has started
      const idx = chapters.findIndex((c) => c.id === id);
      let active = null;
      items.forEach((it) => { if (chapters.findIndex((c) => c.id === it.id) <= idx) active = it; });
      items.forEach((it) => it.el.classList.toggle('active', it === active));
      if (active && active !== current) {
        current = active;
        show(active, active.p, true);
        count.textContent = active.map ? `${active.map} of 6 maps` : '';
      }
    },
  };
}

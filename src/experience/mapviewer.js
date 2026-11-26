// The printed maps, full screen. Each map is an A3 sheet (4960 x 3507 pixels, 300 dpi), wider
// than tall but not as wide as most screens, so it opens fitted to the screen's height with the
// whole sheet in view. From there it can be filled to the screen's width, or zoomed in to the
// print's own detail (wheel, pinch, double-click or the + and - buttons) and dragged around.

export function createMapViewer(dialog) {
  const stage = dialog.querySelector('.mv-stage');
  const img = dialog.querySelector('img');
  const title = dialog.querySelector('.mv-title');
  const status = dialog.querySelector('.mv-status');
  let scale = 1, fit = 1, x = 0, y = 0, W = 0, H = 0;
  const pointers = new Map();
  let pinch = null, drag = null;

  const max = () => Math.max(fit * 1.01, 1.25);   // up to a little past the print's own pixels
  function clampPos() {
    const w = W * scale, h = H * scale, sw = stage.clientWidth, sh = stage.clientHeight;
    x = w <= sw ? (sw - w) / 2 : Math.min(0, Math.max(sw - w, x));
    y = h <= sh ? (sh - h) / 2 : Math.min(0, Math.max(sh - h, y));
  }
  function apply(animate) {
    clampPos();
    img.style.transition = animate ? 'transform 0.35s ease' : 'none';
    img.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    dialog.querySelector('[data-mv="fit"]').setAttribute('aria-pressed', String(Math.abs(scale - fit) < 1e-3));
  }
  function zoomAt(next, cx, cy, animate) {
    next = Math.min(max(), Math.max(fit, next));
    x = cx - (cx - x) * (next / scale); y = cy - (cy - y) * (next / scale);
    scale = next; apply(animate);
  }
  function toFit(animate = true) { fit = Math.min(stage.clientWidth / W, stage.clientHeight / H); scale = fit; apply(animate); }
  function toWidth() { scale = Math.max(fit, stage.clientWidth / W); x = 0; y = 0; apply(true); }

  img.addEventListener('load', () => {
    W = img.naturalWidth; H = img.naturalHeight;
    img.style.width = `${W}px`; img.style.height = `${H}px`;
    toFit(false);
    status.textContent = 'Scroll or pinch to zoom, drag to move, double-click to look closer';
    dialog.classList.add('ready');
  });
  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = stage.getBoundingClientRect();
    zoomAt(scale * Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top, false);
  }, { passive: false });
  stage.addEventListener('dblclick', (e) => {
    const r = stage.getBoundingClientRect();
    if (scale > fit * 1.5) toFit(); else zoomAt(Math.min(max(), fit * 3), e.clientX - r.left, e.clientY - r.top, true);
  });
  stage.addEventListener('pointerdown', (e) => {
    stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (pointers.size === 1) drag = { px: e.clientX, py: e.clientY, x, y };
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), s: scale }; drag = null; }
    stage.classList.add('dragging');
  });
  stage.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    const r = stage.getBoundingClientRect();
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      zoomAt(pinch.s * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d, (a[0] + b[0]) / 2 - r.left, (a[1] + b[1]) / 2 - r.top, false);
    } else if (drag) { x = drag.x + e.clientX - drag.px; y = drag.y + e.clientY - drag.py; apply(false); }
  });
  const end = (e) => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null; if (!pointers.size) { drag = null; stage.classList.remove('dragging'); } };
  stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);
  dialog.querySelector('[data-mv="fit"]').addEventListener('click', () => toFit());
  dialog.querySelector('[data-mv="width"]').addEventListener('click', toWidth);
  dialog.querySelector('[data-mv="in"]').addEventListener('click', () => zoomAt(scale * 1.6, stage.clientWidth / 2, stage.clientHeight / 2, true));
  dialog.querySelector('[data-mv="out"]').addEventListener('click', () => zoomAt(scale / 1.6, stage.clientWidth / 2, stage.clientHeight / 2, true));
  addEventListener('resize', () => { if (dialog.open && W) toFit(false); });

  return {
    open(src, name) {
      dialog.classList.remove('ready');
      title.textContent = name;
      status.textContent = 'Loading the printed map…';
      img.alt = name;
      img.style.transform = 'none';
      img.removeAttribute('src');
      dialog.showModal();
      img.src = src;
    },
  };
}

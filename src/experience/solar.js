// The loading screen: an overview of the solar system, in the same calm, dark space as the opening.
// The Sun glows at the centre, the eight planets drift on their orbits (seen at a slant, not to
// scale) and Earth, picked out in cyan, travels once round its orbit as the site loads, leaving
// a trace. When everything is ready the view closes in on Earth, and the loading screen
// dissolves into the opening, where the same Earth is waiting. A plain 2D canvas, used only here.

const PLANETS = [
  // name, orbit (share of the largest), size (px), colour, seconds per orbit
  ['Mercury', 0.14, 2.0, '#b9b1a6', 9],
  ['Venus', 0.21, 3.2, '#e8cf9a', 15],
  ['Earth', 0.29, 3.6, '#6fc3e6', 0],      // Earth's position follows the loading
  ['Mars', 0.37, 2.6, '#d77a52', 34],
  ['Jupiter', 0.53, 7.5, '#d9b48c', 70],
  ['Saturn', 0.68, 6.2, '#e6d3a3', 110],
  ['Uranus', 0.84, 4.6, '#9fd8e0', 170],
  ['Neptune', 0.98, 4.4, '#6f8fe0', 240],
];
const TILT = 0.36;          // how flat the orbits look (1 = seen from directly above)
const MIN_SECONDS = 5.0;    // Earth's orbit never takes less than this, however fast the site loads

export function startSolarLoader(canvas, getProgress) {
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, raf = 0, stopped = false, last = 0;
  let shown = 0;                 // how far round its orbit Earth has gone (0 to 1)
  let zoom = 0, zooming = false; // the closing-in on Earth at the end
  let stars = [];
  const start0 = PLANETS.map((_, i) => Math.random() * Math.PI * 2);
  const EARTH_START = -Math.PI * 0.35;

  function size() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    stars = Array.from({ length: Math.round(W * H / 2600) }, () => [Math.random() * W, Math.random() * H, Math.random() * 1.1 + 0.2, Math.random() * 6.28]);
  }
  const centre = () => [W / 2, H * 0.55];
  const rMax = () => Math.min(W * 0.44, (H * 0.3) / TILT);
  const pos = (orbit, ang) => { const [cx, cy] = centre(), r = orbit * rMax(); return [cx + Math.cos(ang) * r, cy + Math.sin(ang) * r * TILT]; };

  function frame(now) {
    if (stopped) return;
    const t = now / 1000, dt = last ? Math.min(0.1, t - last) : 0; last = t;
    const target = Math.min(1, Math.max(0, getProgress()));
    shown = Math.min(target, shown + dt / MIN_SECONDS);
    if (zooming) zoom = Math.min(1, zoom + dt / 1.6);
    const ease = zoom * zoom * (3 - 2 * zoom);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const dpr = canvas.width / Math.max(1, W);
    // stars stay still while the system closes in, so the move reads as flying towards Earth
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const [x, y, r, ph] of stars) {
      ctx.globalAlpha = (0.35 + 0.35 * Math.sin(t * 0.8 + ph)) * (1 - ease * 0.6);
      ctx.fillStyle = '#dfe9f2';
      ctx.fillRect(x, y, r, r);
    }
    ctx.globalAlpha = 1;

    // the camera: from the whole system to Earth
    const earthAng = EARTH_START + shown * Math.PI * 2;
    const [ex, ey] = pos(PLANETS[2][1], earthAng);
    const k = 1 + ease * 26;
    const [cx, cy] = [W / 2 + (ex - W / 2) * ease, H / 2 + (ey - H / 2) * ease];
    ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * (W / 2 - cx * k), dpr * (H / 2 - cy * k));

    const [sx, sy] = centre();
    // orbits
    PLANETS.forEach(([name, o]) => {
      ctx.beginPath(); ctx.ellipse(sx, sy, o * rMax(), o * rMax() * TILT, 0, 0, Math.PI * 2);
      ctx.strokeStyle = name === 'Earth' ? 'rgba(143, 220, 239, 0.22)' : 'rgba(223, 233, 242, 0.09)';
      ctx.lineWidth = 1 / k; ctx.stroke();
    });
    // Earth's trace: how far it has come round (the loading)
    if (shown > 0.001) {
      ctx.beginPath(); ctx.ellipse(sx, sy, PLANETS[2][1] * rMax(), PLANETS[2][1] * rMax() * TILT, 0, EARTH_START, earthAng);
      ctx.strokeStyle = 'rgba(143, 220, 239, 0.85)'; ctx.lineWidth = 1.6 / k;
      ctx.shadowColor = 'rgba(143, 220, 239, 0.9)'; ctx.shadowBlur = 8; ctx.stroke(); ctx.shadowBlur = 0;
    }
    // planets, those behind the Sun first
    const bodies = PLANETS.map(([name, o, s, col, period], i) => {
      const ang = name === 'Earth' ? earthAng : start0[i] + (t / period) * Math.PI * 2;
      const [x, y] = pos(o, ang);
      return { name, x, y, s, col, behind: Math.sin(ang) < 0 };
    });
    const drawBody = (b) => {
      if (b.name === 'Saturn') {
        ctx.beginPath(); ctx.ellipse(b.x, b.y, b.s * 2.2, b.s * 0.7, -0.35, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(230, 211, 163, 0.55)'; ctx.lineWidth = 1.2 / k; ctx.stroke();
      }
      const g = ctx.createRadialGradient(b.x - b.s * 0.35, b.y - b.s * 0.35, b.s * 0.1, b.x, b.y, b.s);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.25, b.col); g.addColorStop(1, 'rgba(10, 20, 30, 0.9)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, b.s, 0, Math.PI * 2); ctx.fill();
      if (b.name === 'Earth') {
        ctx.beginPath(); ctx.arc(b.x, b.y, b.s + 5 + Math.sin(t * 2) * 1.2, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(143, 220, 239, ${0.55 * (1 - ease)})`; ctx.lineWidth = 1 / k; ctx.stroke();
        ctx.globalAlpha = 1 - Math.min(1, ease * 3);
        ctx.font = '12px Calibri, Carlito, Arial, sans-serif'; ctx.fillStyle = '#bfeefa';
        ctx.fillText('Earth', b.x + b.s + 9, b.y - b.s - 4);
        ctx.globalAlpha = 1;
      }
    };
    bodies.filter((b) => b.behind).forEach(drawBody);
    // the Sun
    const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, rMax() * 0.16);
    glow.addColorStop(0, 'rgba(255, 236, 196, 1)'); glow.addColorStop(0.18, 'rgba(255, 205, 140, 0.85)');
    glow.addColorStop(0.5, 'rgba(255, 170, 90, 0.18)'); glow.addColorStop(1, 'rgba(255, 150, 70, 0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(sx, sy, rMax() * 0.16, 0, Math.PI * 2); ctx.fill();
    bodies.filter((b) => !b.behind).forEach(drawBody);

    raf = requestAnimationFrame(frame);
  }

  size();
  addEventListener('resize', size);
  raf = requestAnimationFrame(frame);
  return {
    /** true once Earth has gone all the way round (the site has loaded, and at least MIN_SECONDS) */
    get done() { return shown >= 0.999; },
    /** close in on Earth; resolves when the move is nearly over */
    zoomToEarth() { zooming = true; return new Promise((res) => setTimeout(res, 1100)); },
    stop() { stopped = true; cancelAnimationFrame(raf); removeEventListener('resize', size); },
  };
}

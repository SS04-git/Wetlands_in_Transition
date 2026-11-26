// The loading screen's drawing. While the site loads, the waterline of each of the 17 dates is
// drawn as a fine line, one after another from the earliest (warm) to the latest (cool), by a small
// point of light like a pen; beneath the newest line lies a soft body of water that rises and
// falls as each new line arrives. The older lines stay as faint hairlines, so by the end the
// visitor has seen the project's point: the edge between land and water is not one line. The
// shapes are illustrative, not the traced waterlines (those appear on the estuary in the
// conclusion). Paced by its own clock (about seven seconds), never ahead of the loading itself.

const N = 17;
const PER_LINE = 0.42;   // seconds to draw one line
const WARM = [231, 176, 106], COOL = [143, 220, 239];   // the conclusion's waterline colours
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

export function startLoaderArt(canvas, getProgress, onCount) {
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, raf = 0, drawn = 0, lastT = 0, lastCount = -1, stopped = false;

  function size() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  const amp = () => Math.min(H * 0.42, W * 0.26);
  const x0 = () => W * 0.1, x1 = () => W * 0.9;
  // the shared shape of the shore, and each date's departure from it
  const shore = (u) => amp() * (0.14 * Math.sin(u * 3.6 + 0.4) + 0.06 * Math.sin(u * 8.3 + 1.1) + 0.022 * Math.sin(u * 17.0 + 2.0));
  const shift = (u, i) => amp() * (0.09 * Math.sin(u * 2.9 + i * 1.71) + 0.05 * Math.sin(i * 2.37 + 0.5) + 0.018 * Math.sin(u * 11.0 + i));
  const lineY = (u, i, t) => H * 0.64 + shore(u) + shift(u, i) + Math.sin(t * 0.6 + i * 0.9 + u * 2.6) * 1.4;
  // the ends of each line fade out, so the lines float rather than stop
  const fadeEnds = (u) => Math.min(1, u / 0.08, (1 - u) / 0.08);

  function path(i, t, upto) {
    const span = x1() - x0(), steps = 120;
    ctx.beginPath();
    for (let s = 0; s <= steps; s++) {
      const u = (s / steps) * upto;
      const x = x0() + u * span, y = lineY(u, i, t);
      if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
  }

  function frame(now) {
    if (stopped) return;
    const t = now / 1000;
    const dt = lastT ? Math.min(0.1, t - lastT) : 0; lastT = t;
    // its own steady pace, but never further ahead of the loading than one line
    const cap = Math.min(N, getProgress() * N + 1);
    drawn = Math.min(cap, drawn + dt / PER_LINE);
    ctx.clearRect(0, 0, W, H);

    const cur = Math.min(N - 1, Math.floor(drawn));
    const k = drawn >= N ? 1 : drawn - cur;
    const span = x1() - x0();

    // the water: a soft body of colour below the line being drawn (or the last one), rising and
    // falling between lines
    {
      const wi = drawn >= N ? N - 1 : Math.max(0, cur - 1 + ease(k));
      const lo = Math.floor(wi), hi = Math.min(N - 1, lo + 1), f = wi - lo;
      ctx.beginPath();
      ctx.moveTo(x0(), H);
      for (let s = 0; s <= 120; s++) {
        const u = s / 120;
        ctx.lineTo(x0() + u * span, lineY(u, lo, t) * (1 - f) + lineY(u, hi, t) * f);
      }
      ctx.lineTo(x1(), H); ctx.closePath();
      const g = ctx.createLinearGradient(0, H * 0.45, 0, H);
      g.addColorStop(0, 'rgba(60, 150, 175, 0.16)'); g.addColorStop(0.5, 'rgba(30, 90, 110, 0.07)'); g.addColorStop(1, 'rgba(10, 40, 50, 0)');
      const side = ctx.createLinearGradient(x0(), 0, x1(), 0);
      ctx.fillStyle = g; ctx.fill();
      // soften its two sides
      side.addColorStop(0, 'rgba(2, 6, 11, 1)'); side.addColorStop(0.12, 'rgba(2, 6, 11, 0)'); side.addColorStop(0.88, 'rgba(2, 6, 11, 0)'); side.addColorStop(1, 'rgba(2, 6, 11, 1)');
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = side; ctx.fillRect(x0() - 2, H * 0.3, span + 4, H * 0.7);
      ctx.globalCompositeOperation = 'source-over';
    }

    // the waterlines already drawn: fine and faint, warm to cool
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let i = 0; i < Math.min(cur, N); i++) {
      const c = mix(WARM, COOL, i / (N - 1));
      const grad = ctx.createLinearGradient(x0(), 0, x1(), 0);
      const a = 0.22 + 0.22 * (i / (N - 1));
      grad.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},0)`); grad.addColorStop(0.08, `rgba(${c[0]},${c[1]},${c[2]},${a})`);
      grad.addColorStop(0.92, `rgba(${c[0]},${c[1]},${c[2]},${a})`); grad.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
      ctx.strokeStyle = grad; ctx.lineWidth = 1;
      path(i, t, 1); ctx.stroke();
    }

    // the line being drawn: brighter, with a glow, led by a point of light
    if (drawn < N || k >= 1) {
      const i = cur, c = mix(WARM, COOL, i / (N - 1)), upto = drawn >= N ? 1 : ease(k);
      ctx.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},0.95)`; ctx.lineWidth = 1.6;
      ctx.shadowColor = `rgba(${c[0]},${c[1]},${c[2]},0.9)`; ctx.shadowBlur = 10;
      path(i, t, upto); ctx.stroke();
      ctx.shadowBlur = 0;
      if (upto < 1) {
        const px = x0() + upto * span, py = lineY(upto, i, t);
        const r = ctx.createRadialGradient(px, py, 0, px, py, 16);
        r.addColorStop(0, `rgba(255,255,255,${0.9 * fadeEnds(upto)})`); r.addColorStop(0.25, `rgba(${c[0]},${c[1]},${c[2]},${0.6 * fadeEnds(upto)})`); r.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
        ctx.fillStyle = r; ctx.beginPath(); ctx.arc(px, py, 16, 0, Math.PI * 2); ctx.fill();
      }
    }

    const count = Math.min(N, Math.floor(drawn + 1e-6) + (drawn < N && k > 0.5 ? 1 : 0));
    if (count !== lastCount) { lastCount = count; onCount?.(count); }
    raf = requestAnimationFrame(frame);
  }

  size();
  addEventListener('resize', size);
  raf = requestAnimationFrame(frame);
  return {
    stop() { stopped = true; cancelAnimationFrame(raf); removeEventListener('resize', size); },
    get done() { return drawn >= N; },
  };
}

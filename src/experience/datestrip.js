// Observation-date picker of the model chapter: the 17 dates as a strip of ticks under the estuary,
// shown in the steps that look at one date at a time. The active date carries its full label; each tick's height
// is the model's agreement with the tracing on that date (from metrics.json). Click a tick, or use
// the arrow keys / the small arrows at either end, to change the date.
import { formatDate } from './data.js';

export function createDateStrip(root, { dates, agreement, onSelect }) {
  root.innerHTML = `
    <p class="ds-cap"><span class="ds-kicker">Choose an observation date</span><span class="ds-hint">Click a date, or use ‹ › to step through all 17</span></p>
    <div class="ds-row">
      <button type="button" class="ds-step" data-step="-1" aria-label="Previous observation date">‹</button>
      <div class="ds-ticks" role="listbox" aria-label="Observation dates" tabindex="0"></div>
      <button type="button" class="ds-step" data-step="1" aria-label="Next observation date">›</button>
    </div>
    <p class="ds-active" aria-live="polite"><b class="ds-date"></b><span class="ds-meta"></span></p>`;
  const ticks = root.querySelector('.ds-ticks');
  let lastYear = null, current = null;
  const btns = dates.map((d, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'ds-tick'; b.setAttribute('role', 'option');
    b.dataset.id = d.id;
    const a = agreement[d.id];
    b.style.setProperty('--h', a == null ? 0.3 : a.toFixed(3));
    b.setAttribute('aria-label', `${formatDate(d.iso)}${a == null ? '' : `, model agreement ${Math.round(a * 100)}%`}`);
    b.title = formatDate(d.iso);
    // each date has its own slot: the year above the first date of each year, the bar (the
    // model's agreement that day), and the day and month underneath
    const yr = d.iso.slice(0, 4);
    const dm = new Date(`${d.iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    b.innerHTML = `<span class="ds-year">${yr !== lastYear ? yr : ''}</span><i></i><span class="ds-day">${dm}</span>`;
    if (yr !== lastYear) b.classList.add('ds-newyear');
    lastYear = yr;
    b.addEventListener('click', () => onSelect(d.id));
    ticks.append(b);
    return b;
  });
  const step = (dir) => {
    const i = dates.findIndex((d) => d.id === current);
    onSelect(dates[(i + dir + dates.length) % dates.length].id);
  };
  root.querySelectorAll('.ds-step').forEach((b) => b.addEventListener('click', () => step(+b.dataset.step)));
  ticks.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); step(e.key === 'ArrowLeft' ? -1 : 1); }
  });
  return {
    set(id, meta) {
      current = id;
      const d = dates.find((x) => x.id === id);
      btns.forEach((b) => { const on = b.dataset.id === id; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
      root.querySelector('.ds-date').textContent = formatDate(d.iso);
      root.querySelector('.ds-meta').textContent = meta ?? '';
    },
    show(v) { root.classList.toggle('show', v); },
    setAllDates(v) { root.classList.toggle('all', v); },
  };
}

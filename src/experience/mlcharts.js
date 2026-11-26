// Charts and tables of the model chapter. Every value is read from public/data/model/metrics.json
// (classify.py) and change.json (change.py); nothing here is typed in by hand.
// Small inline SVG in the site's own type and class colours, no chart library.

const NS = 'http://www.w3.org/2000/svg';
const fmt = (v) => Math.round(v).toLocaleString('en-GB');

function svg(w, h, cls) {
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', `0 0 ${w} ${h}`); s.setAttribute('width', w); s.setAttribute('height', h);
  if (cls) s.setAttribute('class', cls);
  return s;
}
function el(name, attrs = {}, text) {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
}

/** Q1: one small row per estuary class: traced area (filled) and model area (ring) on each date,
 *  the Theil-Sen line (solid when the trend is significant, dashed when not) and its numbers. */
export function renderTrends(root, { change, label, colour, order, selectedDate, selectedClass, onClass }) {
  root.innerHTML = '';
  const W = 250, H = 36, pad = 4;
  const t = change.years, t0 = Math.floor(t[0]), t1 = t.at(-1);
  const X = (y) => pad + ((y - t0) / (t1 - t0)) * (W - 2 * pad);
  const si = change.dates.indexOf(selectedDate);
  for (const k of order) {
    const obs = change.observed_m2[k], mod = change.model_m2[k], tr = change.analysis[k].observed;
    const max = Math.max(1, ...obs, ...mod);
    const Y = (a) => H - pad - (a / max) * (H - 2 * pad);
    const row = document.createElement('button');
    row.type = 'button';
    row.className = `ml-row${selectedClass === k ? ' on' : ''}${selectedClass && selectedClass !== k ? ' off' : ''}`;
    row.setAttribute('aria-pressed', String(selectedClass === k));
    row.addEventListener('click', () => onClass(selectedClass === k ? null : k));
    const name = document.createElement('span');
    name.className = 'ml-name';
    name.innerHTML = `<i class="key" style="background:${colour(k)}"></i>${label(k)}`;
    const s = svg(W, H, 'ml-spark');
    s.append(el('line', { x1: pad, x2: W - pad, y1: H - pad, y2: H - pad, class: 'ml-axis' }));
    if (si >= 0) s.append(el('line', { x1: X(t[si]), x2: X(t[si]), y1: 1, y2: H - 1, class: 'ml-now' }));
    const sig = tr.p < 0.05;
    s.append(el('line', { x1: X(t[0]), x2: X(t.at(-1)), y1: Y(Math.max(0, tr.intercept + tr.slope_m2_per_year * t[0])), y2: Y(Math.max(0, tr.intercept + tr.slope_m2_per_year * t.at(-1))), class: `ml-fit${sig ? '' : ' ml-fit--ns'}`, stroke: colour(k) }));
    obs.forEach((a, i) => s.append(el('circle', { cx: X(t[i]), cy: Y(a), r: i === si ? 3.2 : 2.3, fill: colour(k), class: 'ml-obs' })));
    mod.forEach((a, i) => s.append(el('circle', { cx: X(t[i]), cy: Y(a), r: 2.6, stroke: colour(k), class: 'ml-mod' })));
    const stat = document.createElement('span');
    stat.className = 'ml-stat';
    stat.innerHTML = sig ? `<b>${tr.slope_m2_per_year >= 0 ? 'growing' : 'shrinking'}</b>about ${fmt(Math.abs(tr.slope_m2_per_year))} m² a year` : '<b>no clear trend</b>goes up and down';
    row.append(name, s, stat);
    root.append(row);
  }
  const axis = document.createElement('p');
  axis.className = 'ml-years';
  axis.innerHTML = `<span>${t0}</span><span>${Math.floor(t.at(-1))}</span>`;
  root.append(axis);
}

/** Q2: confusion matrix, rows = traced, columns = model, as share of each traced class (all dates pooled). */
export function renderConfusion(table, { metrics, label, colour, short }) {
  const C = metrics.confusion, K = C.classes;
  const head = `<thead><tr><th class="cm-corner">Rows: traced · columns: model</th>${K.map((k) => `<th title="${label(k)}">${short(k)}</th>`).join('')}</tr></thead>`;
  const body = K.map((k, i) => {
    const row = C.rows_manual_cols_model[i], tot = row.reduce((a, b) => a + b, 0);
    const cells = row.map((v, j) => {
      const f = tot ? v / tot : 0;
      const txt = f >= 0.005 ? `${Math.round(f * 100)}` : '';
      return `<td class="${i === j ? 'cm-diag' : ''}" style="--f:${f.toFixed(3)}">${txt}</td>`;
    }).join('');
    return `<tr><th><i class="key" style="background:${colour(k)}"></i>${label(k)}</th>${cells}</tr>`;
  }).join('');
  table.innerHTML = `<caption>Share of each traced class (%) by the class the model chose, all 17 held-out dates</caption>${head}<tbody>${body}</tbody>`;
}

/** Q3: mangrove canopy, traced and modelled, the fitted trend and three hypothetical rates to 2035. */
export function renderScenario(root, { change, colour, selectedDate }) {
  root.innerHTML = '';
  const A = change.analysis.mangrove_canopy, sc = A.scenarios;
  const t = change.years, obs = change.observed_m2.mangrove_canopy, mod = change.model_m2.mangrove_canopy;
  const W = 440, H = 190, L = 40, R = 86, T = 10, B = 22;
  const x0 = 2011, x1 = 2035;
  const yMax = Math.max(...obs, ...mod, ...(sc ? Object.values(sc.values).map((v) => v['2035']) : [0]), ...(sc ? sc.continuation_95_interval['2035'] : [0])) * 1.05;
  const X = (y) => L + ((y - x0) / (x1 - x0)) * (W - L - R);
  const Y = (a) => H - B - (a / yMax) * (H - T - B);
  const s = svg(W, H, 'ml-scen-svg');
  // axes and the line between observed and hypothetical
  s.append(el('line', { x1: L, x2: W - R, y1: H - B, y2: H - B, class: 'ml-axis' }));
  for (const yr of [2011, 2025, 2030, 2035]) s.append(el('text', { x: X(yr), y: H - 6, class: 'ml-tick', 'text-anchor': 'middle' }, String(yr)));
  for (const a of [0, Math.round(yMax / 2 / 1000) * 1000]) {
    s.append(el('text', { x: L - 6, y: Y(a) + 3, class: 'ml-tick', 'text-anchor': 'end' }, a ? `${fmt(a)}` : '0'));
  }
  s.append(el('text', { x: L - 6, y: T + 4, class: 'ml-tick', 'text-anchor': 'end' }, 'm²'));
  const tEnd = t.at(-1);
  s.append(el('rect', { x: X(tEnd), y: T, width: X(x1) - X(tEnd), height: H - T - B, class: 'ml-future' }));
  s.append(el('text', { x: X(tEnd) + 6, y: T + 11, class: 'ml-tick ml-tick--em' }, 'possible futures'));
  // fitted trend over the record
  const f = (y) => A.observed.intercept + A.observed.slope_m2_per_year * y;
  s.append(el('line', { x1: X(t[0]), x2: X(tEnd), y1: Y(Math.max(0, f(t[0]))), y2: Y(f(tEnd)), class: 'ml-fit', stroke: colour('mangrove_canopy') }));
  if (sc) {
    const [lo, hi] = sc.continuation_95_interval['2035'];
    s.append(el('path', { d: `M${X(tEnd)},${Y(sc.base_fitted_m2)} L${X(2035)},${Y(hi)} L${X(2035)},${Y(lo)} Z`, class: 'ml-band' }));
    const names = { accelerated: '1.5 times faster', continuation: 'same rate', reduced: 'half the rate' };
    for (const [name, vals] of Object.entries(sc.values)) {
      s.append(el('polyline', { points: `${X(tEnd)},${Y(sc.base_fitted_m2)} ${X(2030)},${Y(vals['2030'])} ${X(2035)},${Y(vals['2035'])}`, class: `ml-scen-line ml-scen-line--${name}` }));
      s.append(el('text', { x: X(2035) + 5, y: Y(vals['2035']) + 3, class: 'ml-tick' }, names[name]));
    }
  }
  const si = change.dates.indexOf(selectedDate);
  obs.forEach((a, i) => s.append(el('circle', { cx: X(t[i]), cy: Y(a), r: i === si ? 3.6 : 2.6, fill: colour('mangrove_canopy'), class: 'ml-obs' })));
  mod.forEach((a, i) => s.append(el('circle', { cx: X(t[i]), cy: Y(a), r: 2.9, stroke: colour('mangrove_canopy'), class: 'ml-mod' })));
  root.append(s);
}

export function renderScenarioTable(table, { change }) {
  const sc = change.analysis.mangrove_canopy.scenarios;
  if (!sc) { table.innerHTML = ''; return; }
  const rows = [['continuation', 'At the same rate'], ['accelerated', 'One and a half times faster'], ['reduced', 'At half the rate']]
    .map(([k, n]) => `<tr><td>${n}</td><td>${fmt(sc.values[k]['2030'])}</td><td>${fmt(sc.values[k]['2035'])}</td></tr>`).join('');
  const ci = sc.continuation_95_interval;
  table.innerHTML = `<caption>Mangrove canopy in the study area (m²) if it keeps growing</caption>
    <thead><tr><th>Growth</th><th>2030</th><th>2035</th></tr></thead>
    <tbody>${rows}<tr class="muted"><td>Likely range at the same rate</td><td>${fmt(ci['2030'][0])} to ${fmt(ci['2030'][1])}</td><td>${fmt(ci['2035'][0])} to ${fmt(ci['2035'][1])}</td></tr></tbody>`;
}

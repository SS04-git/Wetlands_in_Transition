// Minimal interface: legend, date switch, tooltip, detail card, progress stakes.
import { formatDate } from './data.js';

const $ = (s) => document.querySelector(s);
const fmtArea = (m2) => `${Math.round(m2).toLocaleString('en-GB')} m²`;

export function buildDateSwitch(manifest, ids, current, onSelect) {
  const box = $('#date-switch');
  box.replaceChildren(...ids.map((id) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = formatDate(manifest.dateById[id].iso);
    b.dataset.id = id;
    b.setAttribute('aria-pressed', String(id === current));
    b.addEventListener('click', () => onSelect(id));
    return b;
  }));
}
export function markDate(id) {
  document.querySelectorAll('#date-switch button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === id)));
}

export function buildLegend(manifest, entry, { onHover, onToggle }) {
  const ul = $('#legend');
  ul.replaceChildren(...manifest.classes.map((c) => {
    const li = document.createElement('li');
    const present = (entry.counts[c.key] ?? 0) > 0;
    li.dataset.key = c.key;
    li.className = present ? '' : 'absent';
    const sw = document.createElement('i');
    sw.className = `sw ${c.geometry}`;
    sw.style.background = c.color;
    const label = document.createElement('span');
    label.textContent = c.label;
    const n = document.createElement('span');
    n.className = 'n';
    n.textContent = present ? (c.geometry === 'point' ? entry.counts[c.key] : c.geometry === 'line' ? 'line' : '') : '—';
    li.append(sw, label, n);
    li.title = present ? c.definition : 'Not traced on this date';
    if (present) {
      li.addEventListener('pointerenter', () => onHover(c.key));
      li.addEventListener('pointerleave', () => onHover(null));
      li.addEventListener('click', () => { li.classList.toggle('off'); onToggle(c.key); });
    }
    return li;
  }));
}
export function legendHot(key) {
  document.querySelectorAll('#legend li').forEach((li) => li.classList.toggle('hot', li.dataset.key === key));
}

export function showTooltip(x, y, text) {
  const t = $('#tooltip');
  t.textContent = text;
  t.hidden = false;
  const w = t.offsetWidth;
  t.style.left = `${Math.min(x + 14, innerWidth - w - 8)}px`;
  t.style.top = `${y + 14}px`;
}
export function hideTooltip() { $('#tooltip').hidden = true; }

export function tooltipText(cls, entry) {
  const n = entry.counts[cls.key] ?? 0;
  if (cls.geometry === 'polygon') return `${cls.label} · ${fmtArea(entry.area_m2[cls.key] ?? 0)}`;
  if (cls.geometry === 'line') return `${cls.label} · traced line`;
  return `${cls.label} · ${n} recorded`;
}

export function showDetail(cls, entry, onClose) {
  $('#detail-kicker').textContent = `${formatDate(entry.iso)} · ${cls.geometry}`;
  $('#detail-title').textContent = cls.label;
  $('#detail-def').textContent = cls.definition + (cls.key === 'buildings' ? ' Recorded as points in the traced data.' : '');
  const rows = [];
  if (cls.geometry === 'polygon') rows.push(['Traced area', fmtArea(entry.area_m2[cls.key] ?? 0)]);
  rows.push([cls.geometry === 'point' ? 'Features' : 'Traced shapes', String(entry.counts[cls.key] ?? 0)]);
  rows.push(['Evidence', 'Observed']);
  $('#detail-stats').replaceChildren(...rows.flatMap(([k, v]) => {
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = v;
    return [dt, dd];
  }));
  $('#detail').hidden = false;
  $('#detail-close').onclick = onClose;
}
export function hideDetail() { $('#detail').hidden = true; }

export function buildProgress(count) {
  $('#progress-ticks').replaceChildren(...Array.from({ length: count }, () => document.createElement('li')));
}
export function setProgress(p, count) {
  const active = Math.min(count - 1, Math.floor(p * count * 0.999));
  document.querySelectorAll('#progress-ticks li').forEach((li, i) => li.classList.toggle('active', i === active));
  $('#scroll-cue').style.opacity = p > 0.02 ? '0' : '1';
}

export function setLoader(fraction, note) {
  $('#loader .loader-bar i').style.width = `${Math.round(fraction * 100)}%`;
  if (note) $('#loader-note').textContent = note;
}
export function hideLoader() { $('#loader').classList.add('done'); }
export function loaderError(message) { $('#loader-note').textContent = message; }

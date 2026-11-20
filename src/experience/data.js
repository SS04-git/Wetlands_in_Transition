// Loaders for the preprocessed research data (tools/preprocess/*.py). Coordinates are metres
// east / north of the manifest origin (UTM 43N); scene axes are x = east, y = up, z = -north.
const BASE = `${import.meta.env.BASE_URL}data/`;

async function json(path) {
  const r = await fetch(BASE + path);
  if (!r.ok) throw new Error(`${path} could not be loaded (${r.status})`);
  return r.json();
}
async function buffer(path) {
  const r = await fetch(BASE + path);
  if (!r.ok) throw new Error(`${path} could not be loaded (${r.status})`);
  return r.arrayBuffer();
}

/** dots_*.bin / sat_*.bin / plan.bin: uint32 n, uint32 hasRGB, int16[2n] dm, uint8[n] class, uint8[3n] rgb */
export function parseDots(buf) {
  const head = new DataView(buf, 0, 8);
  const n = head.getUint32(0, true);
  const hasRGB = head.getUint32(4, true) === 1;
  const xy = new Int16Array(buf, 8, 2 * n);
  const cls = new Uint8Array(buf, 8 + 4 * n, n);
  const rgb = hasRGB ? new Uint8Array(buf, 8 + 5 * n, 3 * n) : null;
  const pos = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    pos[3 * i] = xy[2 * i] / 10;
    pos[3 * i + 1] = 0;
    pos[3 * i + 2] = -xy[2 * i + 1] / 10;
  }
  return { n, pos, cls, rgb };
}

/** persistence.bin: uint32 n, uint32 dates, int16[2n] dm, uint8[n] water, mangrove, bed, muddy, nobs */
export function parsePersistence(buf) {
  const head = new DataView(buf, 0, 8);
  const n = head.getUint32(0, true);
  const dates = head.getUint32(4, true);
  const xy = new Int16Array(buf, 8, 2 * n);
  const at = (k) => new Uint8Array(buf, 8 + 4 * n + k * n, n);
  const pos = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) { pos[3 * i] = xy[2 * i] / 10; pos[3 * i + 2] = -xy[2 * i + 1] / 10; }
  return { n, dates, pos, water: at(0), mangrove: at(1), bed: at(2), muddy: at(3), nobs: at(4) };
}

export async function loadAll(onProgress = () => {}) {
  const manifest = await json('manifest.json');
  const points = await json('points.json');
  onProgress(0.15);
  manifest.classByKey = Object.fromEntries(manifest.classes.map((c, i) => [c.key, { ...c, index: i }]));
  const ids = manifest.dates.map((d) => d.id);
  const jobs = [
    ...ids.map((id) => buffer(points.files[id].dots).then((b) => ['dots', id, parseDots(b)])),
    ...['2011_04_11', '2025_02_25'].map((id) => buffer(points.files[id].sat).then((b) => ['sat', id, parseDots(b)])),
    ...['2011_04_11', '2025_02_25'].map((id) => json(`dates/${id}.json`).then((d) => ['features', id, d])),
    buffer(points.persistence.file).then((b) => ['persistence', null, parsePersistence(b)]),
    buffer(points.plan.file).then((b) => ['plan', null, parseDots(b)]),
  ];
  let done = 0;
  const out = { manifest, points, dots: {}, sat: {}, features: {} };
  await Promise.all(jobs.map((p) => p.then(([kind, id, value]) => {
    if (id) out[kind][id] = value; else out[kind] = value;
    onProgress(0.15 + 0.8 * (++done / jobs.length));
  })));
  return out;
}

export const formatDate = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

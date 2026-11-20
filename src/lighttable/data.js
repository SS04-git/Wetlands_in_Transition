// Loads the preprocessed dataset written by tools/preprocess/build_data.py.
// All coordinates are metres east / north of manifest.origin_utm (EPSG:32643).
import * as THREE from 'three';

const BASE = `${import.meta.env.BASE_URL}data/`;

export async function loadManifest() {
  const res = await fetch(`${BASE}manifest.json`);
  if (!res.ok) throw new Error(`manifest.json could not be loaded (${res.status})`);
  const manifest = await res.json();
  manifest.classByKey = Object.fromEntries(manifest.classes.map((c) => [c.key, c]));
  manifest.dateById = Object.fromEntries(manifest.dates.map((d) => [d.id, d]));
  return manifest;
}

const dateCache = new Map();
export function loadDate(manifest, id) {
  if (!dateCache.has(id)) {
    const entry = manifest.dateById[id];
    if (!entry) return Promise.reject(new Error(`Unknown observation date ${id}`));
    const geometry = fetch(`${BASE}${entry.geometry}`).then((r) => {
      if (!r.ok) throw new Error(`${entry.geometry} could not be loaded (${r.status})`);
      return r.json();
    });
    const texture = new THREE.TextureLoader().loadAsync(`${BASE}${entry.imagery.file}`).then((t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      return t;
    });
    dateCache.set(id, Promise.all([geometry, texture]).then(([data, image]) => ({ entry, data, image })));
  }
  return dateCache.get(id);
}

export function formatDate(iso) {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

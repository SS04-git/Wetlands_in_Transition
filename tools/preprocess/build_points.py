"""Point clouds and the persistence grid for the 3D experience.

Reads the cleaned per-date geometry written by build_data.py (public/data/dates/*.json, local metres)
and the registered screenshots, and writes compact binary files to public/data/points/:

  dots_<date>.bin     class dots: every traced polygon filled with jittered dots, land edge as a
                      dotted line. Hero dates (2011, 2025) are dense; the others coarser for the
                      17-date stack.
  sat_<date>.bin      the registered Google Earth screenshot resampled as coloured dots.
  persistence.bin     Map 2 grid: 1.5 m cells inside the common study rectangle, with per-cell
                      counts of water / mangrove / bed / muddy and the number of dates in which the
                      cell was traced at all (nobs). Same rules as "Map 2 - Patterns of Wetness and
                      Vegetation.py": class priority mangrove > bed > muddy > water; a date counts
                      for a cell only where that date's traces cover it.
  plan.bin            the Master Plan crop resampled as halftone dots (pixel space, NOT georeferenced).

Binary layout (little endian): uint32 count, uint32 stride-info, then typed arrays (see writers).
Usage: .venv/Scripts/python.exe -I tools/preprocess/build_points.py
"""
import json, os, struct

import numpy as np
import shapely
from shapely.geometry import Polygon, LineString, box
import cv2

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
DATA = os.path.join(ROOT, 'public', 'data')
OUT = os.path.join(DATA, 'points')
PLAN_SRC = os.path.join(ROOT, 'data', 'raw', 'kundapur_masterplan_crop_3.png')
HERO = {'2011_04_11': 0.85, '2025_02_25': 0.85,
        # Map 1's six representative dates (from 'Map 1 - The Estuary as a Landscape.py')
        '2014_02_24': 1.1, '2017_12_08': 1.1, '2020_12_23': 1.1, '2022_05_07': 1.1, '2024_02_17': 1.1}
MAP1_DATES = ['2011_04_11', '2014_02_24', '2017_12_08', '2020_12_23', '2022_05_07', '2024_02_17']
STACK_SPACING = 1.7
CELL = 1.5
rng = np.random.default_rng(7)

manifest = json.load(open(os.path.join(DATA, 'manifest.json')))
CLASS_INDEX = {c['key']: i for i, c in enumerate(manifest['classes'])}


def polys(rings_list):
    out = []
    for rings in rings_list:
        p = Polygon(rings[0], rings[1:])
        out.append(p if p.is_valid else shapely.make_valid(p))
    return shapely.union_all(out) if out else None


def fill_dots(geom, spacing):
    """Jittered grid inside geom: reads as a natural cluster, not a raster."""
    if geom is None or geom.is_empty:
        return np.zeros((0, 2))
    x0, y0, x1, y1 = geom.bounds
    xs = np.arange(x0, x1, spacing); ys = np.arange(y0, y1, spacing)
    gx, gy = np.meshgrid(xs, ys)
    pts = np.column_stack([gx.ravel(), gy.ravel()]) + rng.uniform(-0.45, 0.45, (gx.size, 2)) * spacing
    keep = shapely.contains_xy(geom, pts[:, 0], pts[:, 1])
    return pts[keep]


def line_dots(coords, step):
    line = LineString(coords)
    d = np.arange(0, line.length, step)
    pts = np.array([line.interpolate(v).coords[0] for v in d])
    return pts + rng.normal(0, 0.18, pts.shape)


def write_dots(path, xy, cls, rgb=None):
    """uint32 n, uint32 hasRGB, int16[2n] decimetres, uint8[n] class, (uint8[3n] rgb)."""
    n = len(xy)
    with open(path, 'wb') as f:
        f.write(struct.pack('<II', n, 1 if rgb is not None else 0))
        f.write(np.round(np.asarray(xy) * 10).astype('<i2').tobytes())
        f.write(np.asarray(cls, dtype=np.uint8).tobytes())
        if rgb is not None:
            f.write(np.asarray(rgb, dtype=np.uint8).tobytes())
    return n


def class_dots(date, spacing):
    data = json.load(open(os.path.join(DATA, 'dates', f'{date}.json')))
    xy, cls = [], []
    for key, rings_list in data['display'].items():
        pts = fill_dots(polys(rings_list), spacing)
        xy.append(pts); cls.append(np.full(len(pts), CLASS_INDEX[key]))
    for f in data['classes'].get('land_edge', []):
        pts = line_dots(f['coords'], 0.35)
        xy.append(pts); cls.append(np.full(len(pts), CLASS_INDEX['land_edge']))
    # point features (boats, cage farms, buildings): one dot each, at its recorded position
    for key in ('boats', 'cage_farms', 'buildings'):
        pts = np.array([f['coord'] for f in data['classes'].get(key, [])]).reshape(-1, 2)
        xy.append(pts); cls.append(np.full(len(pts), CLASS_INDEX[key]))
    return np.vstack(xy), np.concatenate(cls)


def sat_dots(entry, spacing=0.7):
    img = cv2.cvtColor(cv2.imread(os.path.join(ROOT, 'assets', 'sat_images_kml', entry['id'], entry['id'] + '.png')), cv2.COLOR_BGR2RGB)
    h, w = img.shape[:2]
    tl, tr, br, bl = [np.array(c) for c in entry['imagery']['corners']]
    quad = Polygon([tl, tr, br, bl])
    pts = fill_dots(quad, spacing)
    # invert the bilinear (here affine) mapping from the TL/TR/BL corners
    ex, ey = tr - tl, bl - tl
    M = np.column_stack([ex, ey])
    uv = np.linalg.solve(M, (pts - tl).T).T
    px = np.clip((uv[:, 0] * (w - 1)).astype(int), 0, w - 1)
    py = np.clip((uv[:, 1] * (h - 1)).astype(int), 0, h - 1)
    return pts, img[py, px]


def common_rect(dates, aspect=128 / 90):
    """Largest axis-aligned rectangle of the given aspect inside the intersection of every date's
    traced footprint (convex hull of its polygon union), as in the Map 2 script."""
    g = None
    for d in dates:
        data = json.load(open(os.path.join(DATA, 'dates', f'{d}.json')))
        u = shapely.union_all([polys(r) for k, r in data['display'].items()]).convex_hull
        g = u if g is None else g.intersection(u)
    best = None
    for c in [g.centroid, g.point_on_surface()]:
        wdt = g.bounds[2] - g.bounds[0]
        while wdt > 1:
            r = box(c.x - wdt / 2, c.y - wdt / aspect / 2, c.x + wdt / 2, c.y + wdt / aspect / 2)
            if g.contains(r):
                if best is None or r.bounds[2] - r.bounds[0] > best.bounds[2] - best.bounds[0]:
                    best = r
                break
            wdt *= 0.97
    return best or box(*g.bounds)


def persistence(dates):
    rect = common_rect(dates)
    x0, y0, x1, y1 = rect.bounds
    nx, ny = int((x1 - x0) // CELL), int((y1 - y0) // CELL)
    ox = x0 + ((x1 - x0) - nx * CELL) / 2; oy = y0 + ((y1 - y0) - ny * CELL) / 2
    gx, gy = np.meshgrid(ox + (np.arange(nx) + 0.5) * CELL, oy + (np.arange(ny) + 0.5) * CELL)
    cx, cy = gx.ravel(), gy.ravel()
    order = ['mangrove_canopy', 'bed_ground', 'muddy_shallows', 'water']
    counts = {k: np.zeros(cx.size, np.uint8) for k in order}
    nobs = np.zeros(cx.size, np.uint8)
    for d in dates:
        data = json.load(open(os.path.join(DATA, 'dates', f'{d}.json')))
        geoms = {k: polys(data['display'][k]) for k in order if k in data['display']}
        traced = shapely.union_all([polys(r) for r in data['display'].values()])
        hit = np.zeros(cx.size, bool)
        for k in order:
            if k not in geoms:
                continue
            inside = shapely.contains_xy(geoms[k], cx, cy) & ~hit
            counts[k][inside] += 1
            hit |= inside
        observed = hit | shapely.contains_xy(traced, cx, cy)
        nobs[observed] += 1
    keep = nobs > 0
    xy = np.column_stack([cx, cy])[keep]
    path = os.path.join(OUT, 'persistence.bin')
    n = int(keep.sum())
    with open(path, 'wb') as f:
        f.write(struct.pack('<II', n, len(dates)))
        f.write(np.round(xy * 10).astype('<i2').tobytes())
        for k in ['water', 'mangrove_canopy', 'bed_ground', 'muddy_shallows']:
            f.write(counts[k][keep].tobytes())
        f.write(nobs[keep].tobytes())
    summary = {'cell_m': CELL, 'cells': n, 'rect': [round(v, 2) for v in rect.bounds],
               'dates': len(dates),
               'water_area_by_threshold_m2': {k: round(float(((counts['water'][keep] >= k)).sum() * CELL * CELL), 1)
                                              for k in range(1, len(dates) + 1)}}
    return summary


def plan_dots(spacing_px=3):
    """Master Plan crop as halftone dots in its own pixel space (not georeferenced)."""
    img = cv2.cvtColor(cv2.imread(PLAN_SRC), cv2.COLOR_BGR2RGB)
    h, w = img.shape[:2]
    ys, xs = np.mgrid[0:h:spacing_px, 0:w:spacing_px]
    xs = xs.ravel(); ys = ys.ravel()
    rgb = img[ys, xs]
    xy = np.column_stack([xs - w / 2, h / 2 - ys]).astype(float) / 10  # stored /10 so int16 holds it
    write_dots(os.path.join(OUT, 'plan.bin'), xy, np.zeros(len(xy)), rgb)
    return {'width_px': w, 'height_px': h, 'spacing_px': spacing_px, 'dots': len(xy)}


def main():
    os.makedirs(OUT, exist_ok=True)
    dates = [d['id'] for d in manifest['dates']]
    files = {}
    for d in dates:
        xy, cls = class_dots(d, HERO.get(d, STACK_SPACING))
        n = write_dots(os.path.join(OUT, f'dots_{d}.bin'), xy, cls)
        files[d] = {'dots': f'points/dots_{d}.bin', 'count': n}
        print(d, 'class dots', n)
    for d in ('2011_04_11', '2025_02_25'):
        entry = next(e for e in manifest['dates'] if e['id'] == d)
        xy, rgb = sat_dots(entry)
        n = write_dots(os.path.join(OUT, f'sat_{d}.bin'), xy, np.zeros(len(xy)), rgb)
        files[d]['sat'] = f'points/sat_{d}.bin'
        print(d, 'satellite dots', n)
    pers = persistence(dates)
    print('persistence cells', pers['cells'])
    plan = plan_dots()
    print('plan dots', plan['dots'])
    json.dump({'files': files, 'map1_dates': MAP1_DATES, 'persistence': {'file': 'points/persistence.bin', **pers},
               'plan': {'file': 'points/plan.bin', 'source': 'Kundapura Master Plan 2031 crop (kundapur_masterplan_crop_3.png)',
                        'georeferenced': False, **plan},
               'plan_categories': [
                   {'name': 'Developed Area', 'share': 31.11}, {'name': 'Agriculture Area', 'share': 36.43},
                   {'name': 'Marshy Area', 'share': 1.61}, {'name': 'Water Sheet', 'share': 30.85}]},
              open(os.path.join(DATA, 'points.json'), 'w'), indent=1)


if __name__ == '__main__':
    main()

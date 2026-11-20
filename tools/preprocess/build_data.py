"""Build the browser-ready dataset for the Light Table from the original research files.

Reads (never modifies):
  assets/sat_images_kml/<date>/<date>.kml               traced classes per observation date
  assets/sat_images_kml/<date>/<date>_local_elements.kml  shoreline elements (2011, 2025)
  assets/sat_images_kml/<date>/<date>.png               Google Earth Pro screenshot of the date
  data/raw/rainfall_daily.csv                           NASA POWER / MERRA-2 daily rainfall

Writes:
  public/data/manifest.json            classes, origin, dates, registration, rainfall, areas
  public/data/dates/<date>.json        geometry per class in local metres
  public/data/imagery/<date>.png       copy of the screenshot (original left in place)
  tools/preprocess/qa/<date>.jpg       registration overlay for visual checking
  tools/preprocess/report.json         geometry repair log

Coordinates: EPSG:4326 -> EPSG:32643 (WGS 84 / UTM 43N, verified for 74.69 E), then minus a
fixed origin, so every coordinate is in metres east/north of ORIGIN. The browser keeps these
small numbers in float32 without losing precision.

Usage:  .venv/Scripts/python.exe -I tools/preprocess/build_data.py
"""
import json, os, re, shutil, sys, warnings
from datetime import date, timedelta

warnings.filterwarnings('ignore')
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import cv2
import geopandas as gpd
import numpy as np
import pandas as pd
import shapely
from shapely.geometry import Polygon, MultiPolygon, LineString, MultiLineString, Point, GeometryCollection
from pyproj import Transformer

from registration import median_lookat, register

ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
KML_DIR = os.path.join(ROOT, 'assets', 'sat_images_kml')
RAIN_CSV = os.path.join(ROOT, 'data', 'raw', 'rainfall_daily.csv')
OUT = os.path.join(ROOT, 'public', 'data')
QA = os.path.join(HERE, 'qa')

CRS_SRC, CRS_UTM = 4326, 32643
ORIGIN = (466715.0, 1507830.0)  # UTM 43N metres, close to the centre of the traced study area

CLASSES = [
    # key, label, hex, geometry, definition (from the research brief)
    ('water', 'Water', '#45B5D1', 'polygon', 'Visible water surface on the date of satellite image capture.'),
    ('muddy_shallows', 'Muddy shallows', '#6F858B', 'polygon', 'Muddy ground in shallow water that cannot be clearly identified as exposed bed.'),
    ('bed_ground', 'Bed ground', '#D8C29A', 'polygon', 'Exposed sediment or estuary bed. Sediment visible beneath water is classified as water.'),
    ('mangrove_canopy', 'Mangrove canopy', '#39734D', 'polygon', 'Visible mangrove canopy only, not the complete habitat or root system.'),
    ('land_edge', 'Land edge', '#A67C3D', 'line', 'Visible boundary between land and water or exposed estuary bed.'),
    ('tree_cover', 'Tree cover', '#7FA650', 'polygon', 'Visible band of canopy, mostly palms, behind the track.'),
    ('track', 'Track', '#B5654A', 'polygon', 'Reddish unpaved strip along the shore, traced as a polygon because its width matters.'),
    ('buildings', 'Buildings', '#6B6F7A', 'point', 'Visible roofs or walls.'),
    ('boats', 'Boats', '#E5A832', 'point', 'Individual visible boats.'),
    ('cage_farms', 'Cage farms', '#C62C2C', 'point', 'Shellfish farming areas marked in water.'),
]
CLASS_KEYS = [c[0] for c in CLASSES]
# name pattern used in the KML: optional "<n>_" prefix, class words, "_YYYY_MM_DD" suffix
NAME_RE = re.compile(r'^(?:\d+_)?(?P<cls>[a-z_]+?)_(?P<date>\d{4}_\d{2}_\d{2})$')
ALIASES = {'boat': 'boats'}

# Screenshots whose stored Google Earth camera is far from the captured view (found in the QA
# overlays) get a wider search over scale and shift.
WIDE_SEARCH = {'2024_02_17'}
CACHE_FILE = os.path.join(HERE, 'registration_cache.json')
CACHE = json.load(open(CACHE_FILE)) if os.path.exists(CACHE_FILE) else {}

to_utm = Transformer.from_crs(CRS_SRC, CRS_UTM, always_xy=True)
report = {'dates': {}}


def classify(name):
    n = (name or '').strip().lower()
    m = NAME_RE.match(n)
    key = m.group('cls') if m else None
    key = ALIASES.get(key, key)
    return key if key in CLASS_KEYS else None


def polygon_parts(geom):
    if geom is None or geom.is_empty:
        return []
    if isinstance(geom, Polygon):
        return [geom]
    if isinstance(geom, (MultiPolygon, GeometryCollection)):
        return [p for g in geom.geoms for p in polygon_parts(g)]
    return []


def r2(v):
    return round(float(v), 2)


def local(coords):
    return [[r2(x - ORIGIN[0]), r2(y - ORIGIN[1])] for x, y in coords]


def rainfall_table():
    df = pd.read_csv(RAIN_CSV, skiprows=9)
    df['date'] = pd.to_datetime(df.YEAR.astype(str) + '-' + df.DOY.astype(str), format='%Y-%j')
    s = df.set_index('date').PRECTOTCORR
    if (s < 0).any():
        raise ValueError('Rainfall series contains missing values (-999)')
    return s


def rain_for(s, d):
    """Same windows as the Map 6 script: the June-September monsoon before the date (capped at the
    day before) and the 30 days immediately before the date."""
    y = d.year if d.month >= 6 else d.year - 1
    season_end = min(date(y, 9, 30), d - timedelta(days=1))
    season = s[str(date(y, 6, 1)):str(season_end)]
    last30 = s[str(d - timedelta(days=30)):str(d - timedelta(days=1))]
    last7 = s[str(d - timedelta(days=7)):str(d - timedelta(days=1))]
    return {'monsoon_year': y, 'monsoon_mm': r2(season.sum()), 'monsoon_days': int(season.size),
            'prior30_mm': r2(last30.sum()), 'prior7_mm': r2(last7.sum())}


def build_date(d, rain):
    folder = os.path.join(KML_DIR, d)
    files = [os.path.join(folder, f'{d}.kml')]
    loc = os.path.join(folder, f'{d}_local_elements.kml')
    if os.path.exists(loc):
        files.append(loc)
    log = {'files': [os.path.relpath(f, ROOT) for f in files], 'unclassified': [], 'repaired': [], 'dropped': []}

    frames = [gpd.read_file(f) for f in files]
    g = pd.concat(frames, ignore_index=True)
    g = gpd.GeoDataFrame(g, geometry='geometry', crs=CRS_SRC).to_crs(CRS_UTM)
    g['geometry'] = shapely.force_2d(g.geometry.values)

    out = {k: [] for k in CLASS_KEYS}
    union_parts = {k: [] for k in CLASS_KEYS}
    polys_utm, lines_utm = {}, {}
    for _, row in g.iterrows():
        name = row.get('Name')
        key = classify(name)
        geom = row.geometry
        if key is None:
            log['unclassified'].append(name)
            continue
        ctype = dict((c[0], c[3]) for c in CLASSES)[key]
        if ctype == 'polygon':
            if not geom.is_valid:
                fixed = shapely.make_valid(geom)
                log['repaired'].append({'name': name, 'reason': shapely.is_valid_reason(geom),
                                        'area_before': r2(geom.area), 'area_after': r2(fixed.area)})
                geom = fixed
            for p in polygon_parts(geom):
                if p.area < 0.05:
                    continue
                p = shapely.orient_polygons(p)
                rings = [local(p.exterior.coords)] + [local(i.coords) for i in p.interiors]
                out[key].append({'name': name, 'rings': rings, 'area_m2': r2(p.area)})
                union_parts[key].append(p)
                polys_utm.setdefault(key, []).append(np.asarray(p.exterior.coords))
        elif ctype == 'line':
            parts = list(geom.geoms) if isinstance(geom, MultiLineString) else [geom] if isinstance(geom, LineString) else []
            if not parts:
                log['dropped'].append({'name': name, 'reason': f'expected line, got {geom.geom_type}'})
            for l in parts:
                out[key].append({'name': name, 'coords': local(l.coords), 'length_m': r2(l.length)})
                lines_utm.setdefault(key, []).append(np.asarray(l.coords))
        else:
            if isinstance(geom, Point):
                out[key].append({'name': name, 'coord': local([(geom.x, geom.y)])[0]})
            else:
                log['dropped'].append({'name': name, 'reason': f'expected point, got {geom.geom_type}'})

    unions = {k: shapely.union_all(v) for k, v in union_parts.items() if v}
    areas = {k: r2(u.area) for k, u in unions.items()}
    counts = {k: len(v) for k, v in out.items() if v}
    # Display geometry: the union of each class, so overlapping traces of the same class (for
    # example two mangrove patches drawn over each other) render as one surface. Holes kept.
    display = {}
    for k, u in unions.items():
        display[k] = []
        for p in polygon_parts(u):
            p = shapely.orient_polygons(p)
            display[k].append([local(p.exterior.coords)] + [local(i.coords) for i in p.interiors])

    # imagery registration
    png = os.path.join(folder, f'{d}.png')
    lon, lat, heading, rng = median_lookat(files[0])
    cx, cy = to_utm.transform(lon, lat)
    # Registration is the slow step, so results are cached until the PNG or KML changes.
    stamp = f'{os.path.getmtime(png):.0f}:{os.path.getmtime(files[0]):.0f}:{d in WIDE_SEARCH}'
    if CACHE.get(d, {}).get('stamp') == stamp and os.path.exists(os.path.join(QA, f'{d}.jpg')):
        reg = dict(CACHE[d]['reg'])
    else:
        reg, qa = register(png, (cx, cy), heading, rng, polys_utm, lines_utm, wide=d in WIDE_SEARCH)
        reg['method'] = 'LookAt footprint refined against traces' + (' (wide search)' if d in WIDE_SEARCH else '')
        cv2.imwrite(os.path.join(QA, f'{d}.jpg'), qa, [cv2.IMWRITE_JPEG_QUALITY, 82])
        CACHE[d] = {'stamp': stamp, 'reg': reg}
        with open(CACHE_FILE, 'w') as f:
            json.dump(CACHE, f, indent=1)
        reg = dict(reg)
    shutil.copyfile(png, os.path.join(OUT, 'imagery', f'{d}.png'))
    imagery = {
        'file': f'imagery/{d}.png', 'source': os.path.relpath(png, ROOT),
        'lookat': {'lon': lon, 'lat': lat, 'heading': heading, 'range_m': rng},
        'corners': local(reg.pop('corners_utm')), **reg,
        'note': 'Approximate registration of a Google Earth Pro screenshot; see tools/preprocess/qa for the overlay check.',
    }

    with open(os.path.join(OUT, 'dates', f'{d}.json'), 'w') as f:
        json.dump({'date': d, 'classes': {k: v for k, v in out.items() if v}, 'display': display},
                  f, separators=(',', ':'))
    report['dates'][d] = log
    y, m, dd = map(int, d.split('_'))
    return {'id': d, 'iso': f'{y:04d}-{m:02d}-{dd:02d}', 'has_local_elements': len(files) > 1,
            'counts': counts, 'area_m2': areas, 'imagery': imagery, 'rainfall': rain_for(rain, date(y, m, dd)),
            'geometry': f'dates/{d}.json'}


def main():
    for p in (OUT, os.path.join(OUT, 'dates'), os.path.join(OUT, 'imagery'), QA):
        os.makedirs(p, exist_ok=True)
    rain = rainfall_table()
    dates = sorted(d for d in os.listdir(KML_DIR) if re.fullmatch(r'\d{4}_\d{2}_\d{2}', d))
    entries = []
    for d in dates:
        e = build_date(d, rain)
        print(f"{d}  classes={e['counts']}  reg score {e['imagery']['score_initial']} -> {e['imagery']['score_fitted']}  "
              f"{e['imagery']['metres_per_px']} m/px  repaired={len(report['dates'][d]['repaired'])}")
        entries.append(e)
    manifest = {
        'title': 'Wetlands in Transition', 'crs': f'EPSG:{CRS_UTM}', 'origin_utm': ORIGIN,
        'units': 'metres east / north of origin',
        'classes': [{'key': k, 'label': l, 'color': c, 'geometry': t, 'definition': df} for k, l, c, t, df in CLASSES],
        'rainfall_source': 'NASA POWER daily PRECTOTCORR (MERRA-2), ~0.5 x 0.625 degree grid cell; regional estimate, not site measurement.',
        'tide': 'Not known for any observation.',
        'dates': entries,
    }
    with open(os.path.join(OUT, 'manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=1)
    with open(os.path.join(HERE, 'report.json'), 'w') as f:
        json.dump(report, f, indent=1)
    print('repaired polygons:', sum(len(v['repaired']) for v in report['dates'].values()),
          '| unclassified:', sum(len(v['unclassified']) for v in report['dates'].values()))


if __name__ == '__main__':
    main()

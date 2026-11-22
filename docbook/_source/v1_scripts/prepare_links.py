"""
Makes print copies of every image used in the documentation book, in docbook/Links/.
Originals are only read. Each copy is a JPEG at 300 ppi, so its natural size in InDesign is
pixels x 72 / 300 points. Run with the project venv:  .venv\\Scripts\\python.exe docbook\\prepare_links.py
"""
import cv2, numpy as np, json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]            # Wetlands_in_Transition
SEM = ROOT.parent                                      # Sem 7 Pre thesis
OUT = ROOT / 'docbook' / 'Links'
OUT.mkdir(parents=True, exist_ok=True)

SOURCES = {
    # the six maps and the cyclone study
    'map1': ROOT / 'assets/maps/1/Map 1 - The Estuary as a Landscape.png',
    'map2': ROOT / 'assets/maps/2/Map 2 - Patterns of Wetness and Vegetation.png',
    'map3': ROOT / 'assets/maps/3/Map 3 - The Estuary Through Time.png',
    'map4': ROOT / 'assets/maps/4/Map 4 - The Estuary as a Lived Landscape.png',
    'map5': ROOT / 'assets/maps/5/Map 5 - The Estuary Between Plan and Ground.png',
    'map6': ROOT / 'assets/maps/6/Map 6 - The Estuary and the Monsoon.png',
    'map7': SEM / 'Final  Maps/Map 7 - Cyclones and Storms.png',
    'plan_crop': SEM / 'Python Code for qgis/kundapur_masterplan_crop_3.png',
    'plan_sheet': SEM / 'A2/Image-of-Kundapura-Master-Plan-2031-top-with-Coastal-Zone-Management-Plan-bottom.png',
    # candidate frames and removed dates (the student's Google Earth Pro screenshots)
    'frame_op1': SEM / 'Kml files GEP/op 1.jpg', 'frame_op2': SEM / 'Kml files GEP/op 2.jpg', 'frame_op3': SEM / 'Kml files GEP/op 3.jpg',
    'removed_2016_02_16': SEM / 'sat images/google earth pro/estuary/2_2016.jpg',
    'removed_2018_03_08': SEM / 'sat images/google earth pro/estuary/3_2018.jpg',
    'removed_2019_05_28': SEM / 'sat images/google earth pro/estuary/5_2019.jpg',
    'removed_2020_05_28': SEM / 'sat images/google earth pro/estuary/5_2020.jpg',
    'removed_2020_12_21': SEM / 'sat images/google earth pro/estuary/12_2020(earlier version).jpg',
}
# field photographs (30 August to 2 September)
PH = ROOT / 'assets/images'
for key, f in {
    'ph_moss': '20260830_163943.jpg', 'ph_green_wall': '20260830_162320.jpg', 'ph_paddy': '20260830_165634.jpg',
    'ph_clams': '20260831_071747.jpg', 'ph_cage_frames': '20260831_072208.jpg', 'ph_cage_frames2': '20260831_072228.jpg',
    'ph_canoe_open': '20260831_072659.jpg', 'ph_still_water': '20260831_073248.jpg', 'ph_canoe_bank': '20260831_073251.jpg',
    'ph_canoes_rubble': '20260831_073650.jpg', 'ph_mud_island': '20260831_074435.jpg', 'ph_canoe_island': '20260831_074608.jpg',
    'ph_two_canoes': '20260831_074929.jpg', 'ph_shells': '20260831_075305.jpg', 'ph_shell_heap': '20260831_174658.jpg',
    'ph_nets_shore': '20260831_174950.jpg', 'ph_sea_wall': '20260902_170729.jpg', 'ph_sea': '20260902_171313.jpg',
    'ph_low_tide_mud': '20260902_172432.jpg', 'ph_low_tide_mud2': '20260902_172452.jpg', 'ph_stakes': '20260902_173249.jpg',
    'ph_mangrove_edge': '20260902_171913.jpg', 'ph_boats_colour': '20260902_174459.jpg', 'ph_boats_mangrove': '20260902_174510.jpg',
    'ph_boats_shore': '20260902_174549.jpg', 'ph_cage_boat': '20260902_174112.jpg', 'ph_wetland': 'image for  wetland.png',
}.items():
    SOURCES[key] = PH / f
# website screenshots
for f in sorted((ROOT / 'docbook/Links/raw_web').glob('*.png')):
    SOURCES['web_' + f.stem[3:]] = f
# the 17 registered screenshots used for tracing
for f in sorted((ROOT / 'public/data/imagery').glob('*.png')):
    SOURCES['date_' + f.stem] = f

MAXPX = 3000


def write_jpeg_300(img, path):
    ok, buf = cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 90])
    b = bytearray(buf.tobytes())
    i = b.find(b'JFIF\x00')
    if i < 0: raise RuntimeError('no JFIF header')
    # APP0 layout after 'JFIF\0': version(2) units(1) Xdensity(2) Ydensity(2)
    b[i + 7] = 1                      # units: dots per inch
    b[i + 8:i + 10] = (300).to_bytes(2, 'big')
    b[i + 10:i + 12] = (300).to_bytes(2, 'big')
    path.write_bytes(bytes(b))


meta = {}
for key, src in SOURCES.items():
    im = cv2.imdecode(np.fromfile(str(src), np.uint8), cv2.IMREAD_COLOR)
    if im is None: raise SystemExit(f'cannot read {src}')
    h, w = im.shape[:2]
    lim = 4200 if key.startswith('map') or key.startswith('plan') else MAXPX
    s = min(1.0, lim / max(h, w))
    if s < 1: im = cv2.resize(im, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA)
    out = OUT / f'{key}.jpg'
    write_jpeg_300(im, out)
    h2, w2 = im.shape[:2]
    meta[key] = dict(path=str(out), px=[w2, h2], wpt=w2 * 72 / 300, hpt=h2 * 72 / 300, source=str(src))
(OUT / 'links.json').write_text(json.dumps(meta, indent=1))
print(len(meta), 'links written')

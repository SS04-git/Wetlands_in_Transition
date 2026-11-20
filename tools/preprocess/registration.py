"""Register each dated Google Earth Pro screenshot to the traced KML geometry.

The PNG screenshots carry no georeferencing. Every point placemark in a date's KML stores the
Google Earth camera (LookAt) that was active while tracing, so the screen footprint can be
estimated from it: centre = LookAt position, heading = LookAt heading, ground width =
2 * range * tan(FOV / 2) with Google Earth's default 60 degree horizontal field of view.

That first estimate is then refined with a 4-parameter similarity transform (scale, rotation,
shift) that maximises agreement between the traced boundaries and the image:
  * mangrove canopy polygons should sit on darker canopy pixels than the ring around them;
  * traced boundaries (land edge, bed ground, muddy shallows, mangrove) should sit on image edges.
Water outlines are excluded because they mostly follow the screen border.

The result is an approximate registration (residuals of a few pixels, roughly 1-2 m on the
ground). It is written out together with a QA overlay image for every date so it can be checked.
"""
import itertools, math, statistics
import xml.etree.ElementTree as ET

import cv2
import numpy as np

KML_NS = '{http://www.opengis.net/kml/2.2}'
FOV_DEG = 60.0


def median_lookat(kml_path):
    root = ET.parse(kml_path).getroot()
    vals = []
    for la in root.iter(KML_NS + 'LookAt'):
        try:
            vals.append(tuple(float(la.find(KML_NS + k).text) for k in ('longitude', 'latitude', 'heading', 'range')))
        except (AttributeError, TypeError, ValueError):
            continue
    if not vals:
        raise ValueError(f'No LookAt found in {kml_path}')
    # Placemarks added while zoomed in to trace boats or cage farms store close-up cameras
    # (ranges of 30-110 m). The screenshot shows the whole study area, so only the wide views
    # (range >= 180 m) describe its footprint.
    wide = [v for v in vals if v[3] >= 180] or vals
    return [statistics.median(c) for c in zip(*wide)]


class Footprint:
    """Maps local metres (east, north relative to the LookAt centre) to image pixels and back."""

    def __init__(self, w, h, rng, heading, params=(1.0, 0.0, 0.0, 0.0)):
        self.w, self.h, self.rng, self.heading = w, h, rng, heading
        self.set(params)

    def set(self, params):
        self.scale, self.rot, self.dx, self.dy = params
        self.W = 2 * self.rng * math.tan(math.radians(FOV_DEG / 2)) / self.scale
        self.H = self.W * self.h / self.w
        self.hr = math.radians(self.heading + self.rot)

    def to_px(self, P):
        c, s = math.cos(self.hr), math.sin(self.hr)
        sx = P[:, 0] * c - P[:, 1] * s
        sv = P[:, 0] * s + P[:, 1] * c
        return np.stack([self.w / 2 + sx / self.W * self.w + self.dx,
                         self.h / 2 - sv / self.H * self.h + self.dy], 1)

    def to_metres(self, px, py):
        sx = (px - self.dx - self.w / 2) / self.w * self.W
        sv = -(py - self.dy - self.h / 2) / self.h * self.H
        c, s = math.cos(self.hr), math.sin(self.hr)
        return sx * c + sv * s, -sx * s + sv * c


def _densify(lines, step=0.5):
    out = []
    for L in lines:
        for a, b in zip(L[:-1], L[1:]):
            n = max(1, int(np.hypot(*(b - a)) / step))
            out.append(a + (b - a) * np.linspace(0, 1, n, endpoint=False)[:, None])
    return np.vstack(out) if out else np.zeros((0, 2))


def register(png_path, centre_xy, heading, rng, polys_by_class, lines_by_class, wide=False):
    """polys_by_class / lines_by_class: {class: [np.array Nx2 in UTM metres]}."""
    img = cv2.imread(png_path)
    h, w = img.shape[:2]
    gray_raw = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray_raw, (0, 0), 2).astype(np.float32)
    edges = cv2.Canny(cv2.GaussianBlur(gray_raw, (5, 5), 0), 40, 120).astype(np.float32)
    field = cv2.GaussianBlur(edges, (0, 0), 3)
    field /= max(field.max(), 1e-6)

    c = np.asarray(centre_xy)
    mang = [p - c for p in polys_by_class.get('mangrove_canopy', [])]
    outline = [p - c for k in ('bed_ground', 'muddy_shallows', 'mangrove_canopy') for p in polys_by_class.get(k, [])]
    outline += [l - c for l in lines_by_class.get('land_edge', [])]
    edge_pts = _densify(outline)
    fp = Footprint(w, h, rng, heading)

    def edge_score():
        if not len(edge_pts):
            return 0.0
        q = fp.to_px(edge_pts)
        ok = (q[:, 0] >= 0) & (q[:, 0] < w - 1) & (q[:, 1] >= 0) & (q[:, 1] < h - 1)
        if ok.mean() < 0.6:
            return -1.0
        return float(field[q[ok, 1].astype(int), q[ok, 0].astype(int)].mean() * ok.mean())

    def contrast_score():
        if not mang:
            return 0.0
        inside = np.zeros((h, w), np.uint8)
        for M in mang:
            cv2.fillPoly(inside, [fp.to_px(M).astype(np.int32)], 1)
        if inside.sum() < 50:
            return -50.0
        ring = cv2.dilate(inside, np.ones((25, 25), np.uint8)) - inside
        # canopy is darker than its surroundings on bright tidal flats but lighter than the
        # water in dark, high-water images (2018-11, 2019-11), so use the size of the contrast
        return abs(float(gray[ring > 0].mean() - gray[inside > 0].mean()))

    def score(p):
        fp.set(p)
        return contrast_score() + 20.0 * edge_score()

    base = score((1.0, 0.0, 0.0, 0.0))
    scales = np.arange(0.66, 1.13, 0.04) if wide else np.arange(0.84, 1.13, 0.04)
    shifts = range(-150, 151, 15) if wide else range(-60, 61, 10)
    grid = [(float(s), r, dx, dy) for s in scales
            for r in (-12.0, -9.0, -6.0, -3.0, 0.0, 3.0, 6.0, 9.0, 12.0)
            for dx in shifts for dy in shifts]
    best = max(grid, key=score)
    best_s = score(best)
    for ds, dr, dp in [(0.02, 0.6, 5), (0.01, 0.3, 2), (0.004, 0.1, 1)]:
        improved = True
        while improved:
            improved = False
            for k, sign in itertools.product(range(4), (-1, 1)):
                cand = list(best)
                cand[k] += sign * (ds, dr, dp, dp)[k]
                s = score(cand)
                if s > best_s:
                    best, best_s, improved = tuple(cand), s, True
    fp.set(best)

    corners = [fp.to_metres(px, py) for px, py in ((0, 0), (w, 0), (w, h), (0, h))]
    corners = [(x + c[0], y + c[1]) for x, y in corners]

    qa = img.copy()
    for k, polys in polys_by_class.items():
        for p in polys:
            cv2.polylines(qa, [fp.to_px(p - c).astype(np.int32)], True, (255, 0, 255), 1, cv2.LINE_AA)
    for l in lines_by_class.get('land_edge', []):
        cv2.polylines(qa, [fp.to_px(l - c).astype(np.int32)], False, (0, 255, 255), 1, cv2.LINE_AA)

    return {
        'size_px': [w, h],
        'params': {'scale': round(best[0], 4), 'rotation_deg': round(best[1], 3),
                   'shift_px': [round(best[2], 2), round(best[3], 2)]},
        'score_initial': round(base, 3), 'score_fitted': round(best_s, 3),
        'ground_size_m': [round(fp.W, 2), round(fp.H, 2)],
        'metres_per_px': round(fp.W / w, 4),
        'corners_utm': corners,  # TL, TR, BR, BL
    }, qa

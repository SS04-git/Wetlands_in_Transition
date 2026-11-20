"""
Automated classification versus manual tracing.

A supervised per-pixel classifier is trained on the manually traced polygons (the KML traces, as
processed into public/data/dates/<date>.json by tools/preprocess/build_data.py) and the Google Earth
Pro screenshots of the 17 observation dates (registered to the traces by registration.py).

Validation is leave-one-date-out: every date is classified by a model that never saw that date's
image or labels, so every reported score is on independent data.

Only the polygon classes can be learnt pixel by pixel: water, muddy shallows, bed ground, mangrove
canopy, tree cover and track. The land edge (a line) and boats, cage farms and buildings (points,
without traced extent) are not modelled; see the report for why.

Run with the project venv:  .venv\\Scripts\\python.exe tools\\ml\\classify.py
Outputs (generated, separate from the research data):
  tools/ml/out/metrics.json, tools/ml/out/report.md, tools/ml/out/qa/<date>.png
  public/data/model/metrics.json, public/data/model/<date>.bin   (for the website)
Originals in assets/ and data/ are only read.
"""
import json, struct, time
from pathlib import Path

import cv2
import numpy as np
from scipy import ndimage, stats
from sklearn.ensemble import RandomForestClassifier
from sklearn.neighbors import NearestCentroid

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / 'public' / 'data'
OUT = ROOT / 'tools' / 'ml' / 'out'
WEB = DATA / 'model'
RES = 0.5            # analysis grid, metres per cell (screenshots are ~0.28-0.31 m per pixel)
WEB_STEP = 3         # website sample every 3 cells = 1.5 m
CLASSES = ['water', 'muddy_shallows', 'bed_ground', 'mangrove_canopy', 'tree_cover', 'track', 'land']
# 'land' is not a KML class: it is the side of the traced land edge away from the water (the edge is
# traced on every date), wherever no other class was traced. It lets the model learn dry land on
# all 17 dates and lets the traced land edge be compared with the model's land / water boundary.
DRAW_ORDER = ['land', 'water', 'muddy_shallows', 'bed_ground', 'mangrove_canopy', 'tree_cover', 'track']
NONE = 255
PER_CLASS = 2500     # training samples per class per date
INTERIOR_M = 1.5     # train only on cells at least this far inside a traced boundary
TOL_M = 2.0          # 'interior' evaluation excludes cells within this distance of a boundary
SEED = 7


def homography(corners, w, h):
    """metres (east, north) -> image pixels, from the registered corner footprint."""
    src = np.float32(corners)                       # TL, TR, BR, BL in metres
    dst = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
    return cv2.getPerspectiveTransform(src, dst)


def load_date(d):
    im = d['imagery']
    img = cv2.imread(str(DATA / im['file']), cv2.IMREAD_COLOR)
    h, w = img.shape[:2]
    H = homography(im['corners'], w, h)
    xs = [c[0] for c in im['corners']]; ys = [c[1] for c in im['corners']]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    nx, ny = int((x1 - x0) / RES), int((y1 - y0) / RES)
    gx = x0 + (np.arange(nx) + 0.5) * RES
    gy = y1 - (np.arange(ny) + 0.5) * RES
    X, Y = np.meshgrid(gx, gy)
    pts = np.stack([X.ravel(), Y.ravel()], 1).astype(np.float32)[None]
    uv = cv2.perspectiveTransform(pts, H)[0].reshape(ny, nx, 2)
    mx, my = uv[..., 0].astype(np.float32), uv[..., 1].astype(np.float32)
    valid = (mx >= 0) & (mx <= w - 1) & (my >= 0) & (my <= h - 1)
    warped = cv2.remap(img, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)

    # labels from the traced polygons, later classes drawn over earlier ones
    feats = json.loads((DATA / 'dates' / f"{d['id']}.json").read_text())['classes']
    lab = np.full((ny, nx), NONE, np.uint8)
    to_px = lambda ring: np.int32(np.round(np.stack([(np.array(ring)[:, 0] - x0) / RES - 0.5,
                                                      (y1 - np.array(ring)[:, 1]) / RES - 0.5], 1)))
    edge = [f['coords'] for f in feats.get('land_edge', []) if f.get('coords')]
    for key in DRAW_ORDER:   # priority as in build_points.py: mangrove > bed > muddy > water
        if key == 'land':
            for line in edge:   # close the edge line down to the southern border of the grid
                ln = np.array(line)
                if ln[0, 0] > ln[-1, 0]: ln = ln[::-1]
                poly = np.vstack([ln, [[ln[-1, 0], y0 - 5], [ln[0, 0], y0 - 5]]])
                cv2.fillPoly(lab, [to_px(poly)], CLASSES.index('land'))
            continue
        for f in feats.get(key, []):
            rings = f.get('rings')
            if not rings:
                continue
            cv2.fillPoly(lab, [to_px(rings[0])], CLASSES.index(key))
            for hole in rings[1:]:
                cv2.fillPoly(lab, [to_px(hole)], NONE)
    lab[~valid] = NONE
    edge_px = [to_px(np.array(line)) for line in edge]
    return dict(id=d['id'], img=warped, valid=valid, lab=lab, x0=x0, y1=y1, nx=nx, ny=ny,
                local=bool(d.get('has_local_elements')), edge_px=edge_px)


def edge_distance(x, pred):
    """Distance (m) from the traced land edge to the model's boundary between land (land, tree
    cover, track) and the estuary classes, measured along the traced line inside the image."""
    landish = np.isin(pred, [CLASSES.index('land'), CLASSES.index('tree_cover'), CLASSES.index('track')])
    est = (pred != NONE) & ~landish
    boundary = (landish & (cv2.dilate(est.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0))
    if not boundary.any():
        return None
    dist = ndimage.distance_transform_edt(~boundary) * RES
    line = np.zeros(pred.shape, np.uint8)
    for px in x['edge_px']:
        cv2.polylines(line, [px], False, 1, 1)
    sel = (line > 0) & x['valid']
    if not sel.any():
        return None
    d = dist[sel]
    return dict(mean_m=float(d.mean()), median_m=float(np.median(d)), within_2m=float((d <= 2).mean()),
                within_5m=float((d <= 5).mean()), samples=int(sel.sum()))


def features(img, valid):
    """Per-cell colour and texture features. Colour is also standardised per image, so the model
    learns relative appearance rather than one date's exposure and colour balance."""
    f32 = img.astype(np.float32) / 255.0
    lab = cv2.cvtColor(f32, cv2.COLOR_BGR2Lab)
    hsv = cv2.cvtColor(f32, cv2.COLOR_BGR2HSV)
    L, A, B = lab[..., 0], lab[..., 1], lab[..., 2]
    hue = np.deg2rad(hsv[..., 0])
    out = [L, A, B, hsv[..., 1], hsv[..., 2], np.sin(hue) * hsv[..., 1], np.cos(hue) * hsv[..., 1]]
    for ch in (L, A, B):                                   # per-image z-scores
        m, s = ch[valid].mean(), ch[valid].std() + 1e-6
        out.append((ch - m) / s)
    for sig_m in (1.5, 4.0):                               # local mean / std at two scales
        s = sig_m / RES
        for ch in (L, A, B):
            mu = cv2.GaussianBlur(ch, (0, 0), s)
            sd = np.sqrt(np.maximum(cv2.GaussianBlur(ch * ch, (0, 0), s) - mu * mu, 0))
            out += [mu, sd]
    Lb = cv2.GaussianBlur(L, (0, 0), 1.0)
    gx, gy = cv2.Sobel(Lb, cv2.CV_32F, 1, 0), cv2.Sobel(Lb, cv2.CV_32F, 0, 1)
    out.append(cv2.GaussianBlur(np.hypot(gx, gy), (0, 0), 2.0))
    out.append(cv2.GaussianBlur(np.abs(cv2.Laplacian(Lb, cv2.CV_32F)), (0, 0), 3.0))
    # excess green (vegetation) and blue-ness (water) indices
    b_, g_, r_ = f32[..., 0], f32[..., 1], f32[..., 2]
    out.append(2 * g_ - r_ - b_)
    out.append(b_ - r_)
    return np.stack(out, -1)


def interior(lab, dist_m):
    """cells at least dist_m inside the boundary of their own traced class"""
    keep = np.zeros(lab.shape, bool)
    for c in range(len(CLASSES)):
        m = lab == c
        if m.any():
            keep |= ndimage.distance_transform_edt(m) * RES >= dist_m
    return keep


def majority3(pred, valid):
    """3 x 3 majority filter to remove isolated cells (applied equally to every date)."""
    votes = np.zeros(pred.shape + (len(CLASSES),), np.float32)
    for c in range(len(CLASSES)):
        votes[..., c] = cv2.blur((pred == c).astype(np.float32), (3, 3))
    out = votes.argmax(-1).astype(np.uint8)
    out[~valid] = NONE
    return out


def scores(lab, pred, mask):
    rows = {}
    y, p = lab[mask], pred[mask]
    for c, key in enumerate(CLASSES):
        tp = int(((y == c) & (p == c)).sum()); fp = int(((y != c) & (p == c)).sum()); fn = int(((y == c) & (p != c)).sum())
        if tp + fp + fn == 0:
            continue
        prec = tp / (tp + fp) if tp + fp else None
        rec = tp / (tp + fn) if tp + fn else None
        f1 = 2 * prec * rec / (prec + rec) if prec and rec else 0.0
        rows[key] = dict(tp=tp, fp=fp, fn=fn, iou=tp / (tp + fp + fn), precision=prec, recall=rec, f1=f1,
                         area_manual_m2=(tp + fn) * RES * RES, area_model_m2=(tp + fp) * RES * RES)
    acc = float((y == p).mean()) if y.size else None
    return dict(classes=rows, overall_accuracy=acc, cells=int(mask.sum()))


def main():
    t0 = time.time()
    OUT.mkdir(parents=True, exist_ok=True); (OUT / 'qa').mkdir(exist_ok=True); WEB.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((DATA / 'manifest.json').read_text())
    dates = manifest['dates']
    rng = np.random.default_rng(SEED)
    D = []
    for d in dates:
        x = load_date(d)
        x['F'] = features(x['img'], x['valid'])
        x['inner'] = interior(x['lab'], INTERIOR_M) & (x['lab'] != NONE)
        # training sample for this date
        idx = []
        for c in range(len(CLASSES)):
            cand = np.flatnonzero((x['inner'] & (x['lab'] == c)).ravel())
            if cand.size:
                idx.append(rng.choice(cand, min(PER_CLASS, cand.size), replace=False))
        idx = np.concatenate(idx) if idx else np.array([], int)
        x['Xs'] = x['F'].reshape(-1, x['F'].shape[-1])[idx]
        x['ys'] = x['lab'].ravel()[idx]
        D.append(x)
        print(d['id'], x['nx'], 'x', x['ny'], 'labelled cells', int((x['lab'] != NONE).sum()), 'train', idx.size)

    results, baseline, confusion = {}, {}, np.zeros((len(CLASSES), len(CLASSES)), np.int64)
    for i, x in enumerate(D):
        Xtr = np.concatenate([o['Xs'] for j, o in enumerate(D) if j != i])
        ytr = np.concatenate([o['ys'] for j, o in enumerate(D) if j != i])
        rf = RandomForestClassifier(n_estimators=120, max_depth=22, min_samples_leaf=3, max_features='sqrt',
                                    class_weight='balanced_subsample', n_jobs=-1, random_state=SEED)
        rf.fit(Xtr, ytr)
        F = x['F'].reshape(-1, x['F'].shape[-1])
        v = x['valid'].ravel()
        pred = np.full(F.shape[0], NONE, np.uint8)
        pred[v] = rf.predict(F[v]).astype(np.uint8)
        pred = majority3(pred.reshape(x['ny'], x['nx']), x['valid'])
        # colour-only baseline: nearest class centroid on per-image standardised L, a, b
        nc = NearestCentroid().fit(Xtr[:, 7:10], ytr)
        base = np.full(F.shape[0], NONE, np.uint8); base[v] = nc.predict(F[v][:, 7:10]).astype(np.uint8)
        base = base.reshape(x['ny'], x['nx'])

        evalm = x['lab'] != NONE
        inner = interior(x['lab'], TOL_M) & evalm
        results[x['id']] = dict(all=scores(x['lab'], pred, evalm), interior=scores(x['lab'], pred, inner),
                                land_edge=edge_distance(x, pred),
                                trained_on=[o['id'] for j, o in enumerate(D) if j != i])
        baseline[x['id']] = scores(x['lab'], base, evalm)
        yl, pl = x['lab'][evalm], pred[evalm]
        np.add.at(confusion, (yl, pl), 1)
        x['pred'] = pred
        print(f"{x['id']}  acc {results[x['id']]['all']['overall_accuracy']:.3f}  "
              f"(baseline {baseline[x['id']]['overall_accuracy']:.3f})  {time.time() - t0:.0f}s")

        # QA image: image | manual | model | disagreement
        pal = np.array([[209, 181, 69], [140, 137, 102], [152, 197, 220], [71, 110, 47], [87, 201, 162], [64, 94, 184], [108, 128, 142]], np.uint8)  # BGR
        def paint(a):
            o = np.full(a.shape + (3,), 40, np.uint8); m = a != NONE; o[m] = pal[a[m]]; return o
        dis = np.full(pred.shape + (3,), 40, np.uint8)
        dis[evalm & (pred == x['lab'])] = (110, 110, 110); dis[evalm & (pred != x['lab'])] = (60, 60, 230)
        qa = np.concatenate([x['img'], paint(x['lab']), paint(pred), dis], 1)
        cv2.imwrite(str(OUT / 'qa' / f"{x['id']}.png"), qa)

        # website samples (1.5 m): x, y in decimetres, manual class, model class
        sel = np.zeros_like(x['valid']); sel[::WEB_STEP, ::WEB_STEP] = True; sel &= x['valid']
        rr, cc = np.nonzero(sel)
        ex = x['x0'] + (cc + 0.5) * RES; ny_ = x['y1'] - (rr + 0.5) * RES
        buf = struct.pack('<I', rr.size) + np.stack([np.round(ex * 10), np.round(ny_ * 10)], 1).astype('<i2').tobytes() \
            + x['lab'][rr, cc].astype(np.uint8).tobytes() + pred[rr, cc].astype(np.uint8).tobytes()
        (WEB / f"{x['id']}.bin").write_bytes(buf)

    # pooled metrics over all 17 held-out dates
    def pool(kind):
        agg = {}
        for key in CLASSES:
            tp = sum(r[kind]['classes'].get(key, {}).get('tp', 0) for r in results.values())
            fp = sum(r[kind]['classes'].get(key, {}).get('fp', 0) for r in results.values())
            fn = sum(r[kind]['classes'].get(key, {}).get('fn', 0) for r in results.values())
            if tp + fp + fn == 0:
                continue
            p = tp / (tp + fp) if tp + fp else 0.0; r_ = tp / (tp + fn) if tp + fn else 0.0
            agg[key] = dict(iou=tp / (tp + fp + fn), precision=p, recall=r_, f1=2 * p * r_ / (p + r_) if p + r_ else 0.0,
                            area_manual_m2=(tp + fn) * RES * RES, area_model_m2=(tp + fp) * RES * RES,
                            dates_traced=sum(1 for rr_ in results.values() if rr_[kind]['classes'].get(key, {}).get('tp', 0) + rr_[kind]['classes'].get(key, {}).get('fn', 0) > 0))
        cells = sum(r[kind]['cells'] for r in results.values())
        acc = sum(r[kind]['overall_accuracy'] * r[kind]['cells'] for r in results.values()) / cells
        return dict(classes=agg, overall_accuracy=acc, macro_f1=float(np.mean([v['f1'] for v in agg.values()])))
    base_acc = sum(b['overall_accuracy'] * b['cells'] for b in baseline.values()) / sum(b['cells'] for b in baseline.values())
    ed = [r['land_edge'] for r in results.values() if r['land_edge']]
    edge_pooled = dict(mean_m=float(np.mean([e['mean_m'] for e in ed])), median_of_medians_m=float(np.median([e['median_m'] for e in ed])),
                       within_2m=float(np.mean([e['within_2m'] for e in ed])), within_5m=float(np.mean([e['within_5m'] for e in ed])), dates=len(ed))

    # exploratory: rainfall against the manually traced areas (not a predictive model)
    rain = []
    for d in dates:
        a = d['area_m2']; rain.append(dict(id=d['id'], water=a.get('water', 0), bed=a.get('bed_ground', 0),
                                           muddy=a.get('muddy_shallows', 0), prior30=d['rainfall']['prior30_mm'],
                                           prior7=d['rainfall']['prior7_mm'], monsoon=d['rainfall']['monsoon_mm']))
    corr = {}
    for area in ('water', 'bed', 'muddy'):
        for r_ in ('prior30', 'prior7', 'monsoon'):
            rho, pval = stats.spearmanr([q[area] for q in rain], [q[r_] for q in rain])
            corr[f'{area}~{r_}'] = dict(rho=float(rho), p=float(pval), n=len(rain))

    summary = dict(
        method=dict(classifier='RandomForestClassifier (scikit-learn), 120 trees, balanced class weights',
                    features='colour (Lab, HSV), per-image standardised Lab, local mean and std at 1.5 m and 4 m, gradient, Laplacian texture, vegetation and blue indices',
                    grid_m=RES, training_samples_per_class_per_date=PER_CLASS, training_interior_m=INTERIOR_M,
                    validation='leave-one-date-out: each date is predicted by a model trained only on the other 16 dates',
                    postprocessing='3 x 3 majority filter', interior_tolerance_m=TOL_M,
                    baseline='nearest class centroid on per-image standardised L, a, b (colour only)',
                    classes=CLASSES, derived_classes=['land'],
                    land_edge='compared as a line: distance from the traced edge to the model land / estuary boundary',
                    not_modelled=['boats', 'cage_farms', 'buildings']),
        pooled=pool('all'), pooled_interior=pool('interior'), baseline_overall_accuracy=base_acc, land_edge=edge_pooled,
        per_date=results, confusion=dict(classes=CLASSES, rows_manual_cols_model=confusion.tolist()),
        rainfall_exploratory=corr, seconds=round(time.time() - t0, 1))
    (OUT / 'metrics.json').write_text(json.dumps(summary, indent=1))
    web = dict(method=summary['method'], pooled=summary['pooled'], pooled_interior=summary['pooled_interior'],
               baseline_overall_accuracy=base_acc, land_edge=edge_pooled, confusion=summary['confusion'],
               per_date={k: dict(all=v['all'], land_edge=v['land_edge'], interior=dict(overall_accuracy=v['interior']['overall_accuracy'])) for k, v in results.items()},
               web_step_m=RES * WEB_STEP)
    (WEB / 'metrics.json').write_text(json.dumps(web))
    print('pooled accuracy', round(summary['pooled']['overall_accuracy'], 3), 'interior', round(summary['pooled_interior']['overall_accuracy'], 3),
          'baseline', round(base_acc, 3), 'in', summary['seconds'], 's')
    print('land edge', {k: round(v, 3) for k, v in edge_pooled.items()})
    for k, v in summary['pooled']['classes'].items():
        print(f"  {k:16s} IoU {v['iou']:.2f}  P {v['precision']:.2f}  R {v['recall']:.2f}  F1 {v['f1']:.2f}  "
              f"area manual {v['area_manual_m2']:.0f}  model {v['area_model_m2']:.0f}  dates {v['dates_traced']}")


if __name__ == '__main__':
    main()

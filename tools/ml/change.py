"""
What is changing, and what might happen next: quantified change and exploratory scenarios.

Builds on the traced research data and on the outputs of classify.py (run that first):
  1. Observed change: the area of each traced estuary class on each of the 17 dates, inside the
     study rectangle that every date covers (the same rectangle as Map 2), so dates are comparable.
  2. Model-generated change: the same areas from the classifier's held-out predictions.
  3. Repeated transitions: per 1.5 m cell, how many times the traced class changed between
     consecutive observations (where both observations traced the cell).
  4. Trends: Theil-Sen slope (robust to outliers) with a 95% interval and a Kendall tau test of
     monotonic trend (the Mann-Kendall test without autocorrelation correction). A hindcast check
     fits 2011-2022 and predicts the 2024 and 2025 areas, against two naive predictors.
  5. Exploratory scenarios, only where a trend is significant (p < 0.05) and the class is not
     dominated by the unknown state of the tide: continuation of the fitted trend, an accelerated
     rate (1.5 x) and a reduced rate (0.5 x), from the fitted 2025 value to 2030 and 2035. The
     multipliers are hypothetical choices, not estimates.

Water, bed ground and muddy shallows are not projected: their traced extent depends on the tide
at the moment of each image, which is not known, so a date-to-date trend cannot be separated from
tidal state.

Run with the project venv:  .venv\\Scripts\\python.exe tools\\ml\\change.py
Outputs: tools/ml/out/change.json, public/data/model/change.json, public/data/model/transitions.bin
(the binary also carries, per cell, the first date it was traced as mangrove canopy)
"""
import json, struct
from datetime import date
from pathlib import Path

import cv2
import numpy as np
from scipy import stats

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / 'public' / 'data'
OUT = ROOT / 'tools' / 'ml' / 'out'
WEB = DATA / 'model'
CELL = 1.5
ESTUARY = ['water', 'muddy_shallows', 'bed_ground', 'mangrove_canopy']   # priority low -> high (as Map 2)
MODEL_CLASSES = ['water', 'muddy_shallows', 'bed_ground', 'mangrove_canopy', 'tree_cover', 'track', 'land']
TIDE_DOMINATED = {'water', 'muddy_shallows', 'bed_ground'}
NONE = 255
SCENARIOS = {'continuation': 1.0, 'accelerated': 1.5, 'reduced': 0.5}
HORIZONS = [2030, 2035]


def years(iso):
    d = date.fromisoformat(iso)
    return d.year + (d.timetuple().tm_yday - 1) / (366 if d.year % 4 == 0 else 365)


def rasterise(feats, rect):
    x0, y0, x1, y1 = rect
    nx, ny = int(round((x1 - x0) / CELL)), int(round((y1 - y0) / CELL))
    lab = np.full((ny, nx), NONE, np.uint8)
    to_px = lambda ring: np.int32(np.round(np.stack([(np.array(ring)[:, 0] - x0) / CELL - 0.5,
                                                      (y1 - np.array(ring)[:, 1]) / CELL - 0.5], 1)))
    for ci, key in enumerate(ESTUARY):
        for f in feats.get(key, []):
            rings = f.get('rings')
            if not rings:
                continue
            cv2.fillPoly(lab, [to_px(rings[0])], ci)
            for hole in rings[1:]:
                cv2.fillPoly(lab, [to_px(hole)], NONE)
    return lab, nx, ny


def model_areas(id_, rect):
    """Areas from classify.py's held-out predictions, sampled every 1.5 m (2.25 m2 per sample)."""
    buf = (WEB / f'{id_}.bin').read_bytes()
    n = struct.unpack_from('<I', buf)[0]
    xy = np.frombuffer(buf, '<i2', 2 * n, 4).reshape(n, 2) / 10.0
    pred = np.frombuffer(buf, np.uint8, n, 4 + 4 * n)
    x0, y0, x1, y1 = rect
    inside = (xy[:, 0] >= x0) & (xy[:, 0] < x1) & (xy[:, 1] >= y0) & (xy[:, 1] < y1) & (pred != NONE)
    return {k: float(((pred == MODEL_CLASSES.index(k)) & inside).sum() * CELL * CELL) for k in ESTUARY}


def trend(t, a):
    t, a = np.asarray(t), np.asarray(a, float)
    res = stats.theilslopes(a, t, 0.95)
    tau = stats.kendalltau(t, a)
    return dict(slope_m2_per_year=float(res.slope), slope_low=float(res.low_slope), slope_high=float(res.high_slope),
                intercept=float(res.intercept), kendall_tau=float(tau.statistic), p=float(tau.pvalue), n=int(len(a)))


def main():
    manifest = json.loads((DATA / 'manifest.json').read_text())
    points = json.loads((DATA / 'points.json').read_text())
    rect = points['persistence']['rect']                  # [x0, y0, x1, y1] metres; covered on every date
    rect_area = (rect[2] - rect[0]) * (rect[3] - rect[1])
    dates = manifest['dates']
    t = [years(d['iso']) for d in dates]

    labs, observed, modelled, coverage = [], {k: [] for k in ESTUARY}, {k: [] for k in ESTUARY}, []
    for d in dates:
        feats = json.loads((DATA / 'dates' / f"{d['id']}.json").read_text())['classes']
        lab, nx, ny = rasterise(feats, rect)
        labs.append(lab)
        coverage.append(float((lab != NONE).mean()))
        for ci, k in enumerate(ESTUARY):
            observed[k].append(float((lab == ci).sum() * CELL * CELL))
        m = model_areas(d['id'], rect)
        for k in ESTUARY:
            modelled[k].append(m[k])
    L = np.stack(labs)                                     # dates x ny x nx

    # repeated transitions between consecutive observations
    a, b = L[:-1], L[1:]
    both = (a != NONE) & (b != NONE)
    transitions = ((a != b) & both).sum(0).astype(np.uint8)
    pairs = both.sum(0).astype(np.uint8)
    counts = np.stack([(L == ci).sum(0) for ci in range(len(ESTUARY))])
    dominant = counts.argmax(0).astype(np.uint8)
    dominant[counts.sum(0) == 0] = NONE
    # transition matrix between consecutive dates (cells), observed
    tm = np.zeros((len(ESTUARY), len(ESTUARY)), np.int64)
    for i in range(len(ESTUARY)):
        for j in range(len(ESTUARY)):
            tm[i, j] = int(((a == i) & (b == j)).sum())

    # where the mangrove canopy appears: index of the first date each cell was traced as mangrove
    mg = L == ESTUARY.index('mangrove_canopy')
    first_mg = np.where(mg.any(0), mg.argmax(0), NONE).astype(np.uint8)
    mg_dates = mg.sum(0).astype(np.uint8)

    rows, cols = np.nonzero(pairs > 0)
    x = rect[0] + (cols + 0.5) * CELL
    y = rect[3] - (rows + 0.5) * CELL
    payload = struct.pack('<I', rows.size) + np.stack([np.round(x * 10), np.round(y * 10)], 1).astype('<i2').tobytes() \
        + transitions[rows, cols].tobytes() + pairs[rows, cols].tobytes() + dominant[rows, cols].tobytes()         + first_mg[rows, cols].tobytes() + mg_dates[rows, cols].tobytes()
    (WEB / 'transitions.bin').write_bytes(payload)

    tr = transitions[pairs > 0].astype(float)
    hist = np.bincount(transitions[pairs > 0], minlength=17).tolist()

    # trends, hindcast and scenarios
    analysis = {}
    t_arr = np.array(t)
    fit_mask = t_arr < 2023.0                               # 2011-2022 (15 dates)
    for k in ESTUARY:
        obs = np.array(observed[k])
        entry = dict(observed=trend(t_arr, obs), model=trend(t_arr, np.array(modelled[k])),
                     tide_dominated=k in TIDE_DOMINATED)
        if k == 'mangrove_canopy':
            since = t_arr >= 2017.9                         # continuous record from Dec 2017
            entry['observed_since_2017'] = trend(t_arr[since], obs[since])
        # hindcast: fit 2011-2022, predict 2024-02-17 and 2025-02-25
        tsf = stats.theilslopes(obs[fit_mask], t_arr[fit_mask])
        pred = tsf.intercept + tsf.slope * t_arr[~fit_mask]
        truth = obs[~fit_mask]
        entry['hindcast'] = dict(
            fitted_on=f'{int(fit_mask.sum())} dates, 2011-2022', predicted=[float(v) for v in pred], observed=[float(v) for v in truth],
            mae_trend=float(np.mean(np.abs(pred - truth))),
            mae_last_value=float(np.mean(np.abs(obs[fit_mask][-1] - truth))),
            mae_mean=float(np.mean(np.abs(obs[fit_mask].mean() - truth))))
        ob = entry['observed']
        if ob['p'] < 0.05 and k not in TIDE_DOMINATED:
            base_year = t_arr[-1]
            base = ob['intercept'] + ob['slope_m2_per_year'] * base_year     # fitted value at the last date
            sc = {}
            for name, f in SCENARIOS.items():
                sc[name] = {str(h): float(np.clip(base + f * ob['slope_m2_per_year'] * (h - base_year), 0, rect_area)) for h in HORIZONS}
            band = {str(h): [float(np.clip(base + ob['slope_low'] * (h - base_year), 0, rect_area)),
                             float(np.clip(base + ob['slope_high'] * (h - base_year), 0, rect_area))] for h in HORIZONS}
            entry['scenarios'] = dict(base_year=float(base_year), base_fitted_m2=float(base), values=sc,
                                      continuation_95_interval=band, multipliers=SCENARIOS)
        else:
            entry['scenarios'] = None
            entry['no_scenario_reason'] = ('tide state unknown: the traced extent depends on the tide at each image'
                                           if k in TIDE_DOMINATED else 'no significant monotonic trend (p >= 0.05)')
        analysis[k] = entry

    out = dict(
        rect=rect, rect_area_m2=rect_area, cell_m=CELL,
        dates=[d['id'] for d in dates], iso=[d['iso'] for d in dates], years=t,
        coverage=coverage, observed_m2=observed, model_m2=modelled,
        transitions=dict(cells=int(rows.size), mean=float(tr.mean()), histogram=hist,
                         share_changed_at_least_once=float((tr >= 1).mean()), share_changed_4_or_more=float((tr >= 4).mean()),
                         matrix_classes=ESTUARY, consecutive_transition_cells=tm.tolist(),
                         binary='uint32 n, int16[2n] dm, uint8[n] transitions, pairs, dominant class (ESTUARY order), first mangrove date index, mangrove dates'),
        mangrove_first_traced=[int(((first_mg == i)).sum()) for i in range(len(dates))],
        analysis=analysis,
        labels=dict(observed='areas traced by hand (measured)', model='areas classified by the held-out model (model-generated)',
                    trend='Theil-Sen slope with Kendall tau test (quantified historical change)',
                    scenarios='hypothetical: fitted trend continued at 1.0x, 1.5x, 0.5x the observed rate; not a prediction'))
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'change.json').write_text(json.dumps(out, indent=1))
    (WEB / 'change.json').write_text(json.dumps(out))
    print('rect area', round(rect_area), 'cells', rows.size, 'coverage min', round(min(coverage), 3))
    print('transitions mean', round(tr.mean(), 2), '>=1', round((tr >= 1).mean(), 3), '>=4', round((tr >= 4).mean(), 3))
    for k, e in analysis.items():
        o, m = e['observed'], e['model']
        print(f"{k:16s} obs slope {o['slope_m2_per_year']:8.1f} m2/yr [{o['slope_low']:.1f}, {o['slope_high']:.1f}] tau {o['kendall_tau']:.2f} p {o['p']:.3f} | "
              f"model slope {m['slope_m2_per_year']:8.1f} p {m['p']:.3f} | hindcast MAE trend {e['hindcast']['mae_trend']:.0f} last {e['hindcast']['mae_last_value']:.0f} mean {e['hindcast']['mae_mean']:.0f}"
              + (f" | scen {e['scenarios']['values']}" if e['scenarios'] else f" | none: {e['no_scenario_reason']}"))
        if 'observed_since_2017' in e:
            s = e['observed_since_2017']; print('   since 2017:', round(s['slope_m2_per_year'], 1), 'p', round(s['p'], 3), 'n', s['n'])
    print('observed', {k: [round(v) for v in vs] for k, vs in observed.items()})


if __name__ == '__main__':
    main()

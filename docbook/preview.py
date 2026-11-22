"""
Rough layout preview of the built IDML (docbook/_build): draws every frame, image and line of each
spread and sets the text with the real Arial and Georgia widths, so composition and overflow can be
checked without InDesign. Output: docbook/_preview/spread_NN.jpg and contact sheets.
Run after build_docbook.py:  .venv\\Scripts\\python.exe docbook\\preview.py
"""
import re, html, json
from pathlib import Path
import cv2, numpy as np
from idml_lib import STYLES, FONTS, COLOURS, PW, PH, M, BULLET_INDENT

ROOT = Path(__file__).resolve().parent
import sys
B = ROOT / (sys.argv[1] if len(sys.argv) > 1 else '_build2')
import tempfile
OUT = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(tempfile.gettempdir()) / 'wit_docbook_preview'
OUT.mkdir(exist_ok=True)
S = 1.4                       # px per pt
W, H = int(2 * PW * S), int(PH * S)
HEX = dict(COLOURS, Paper='#FFFFFF', Black='#000000')
IMG = {}


def bgr(name, tint=None):
    h = HEX.get(name, '#FF00FF').lstrip('#')
    c = np.array([int(h[4:6], 16), int(h[2:4], 16), int(h[0:2], 16)], float)
    if tint is not None: c = 255 - (255 - c) * tint / 100
    return tuple(int(v) for v in c)


def P(x, y): return int(round((x + PW) * S)), int(round((y + PH / 2) * S))


def anchors(el):
    return [tuple(map(float, a.split())) for a in re.findall(r'Anchor="([^"]+)"', el)]


def tr(el):
    m = re.search(r'ItemTransform="([^"]+)"', el)
    v = list(map(float, m.group(1).split())) if m else [1, 0, 0, 1, 0, 0]
    return v


def apply(v, pts): return [(v[0] * x + v[2] * y + v[4], v[1] * x + v[3] * y + v[5]) for x, y in pts]


def story_paras(sid):
    f = B / 'Stories' / f'Story_{sid}.xml'
    if not f.exists(): return []
    s = f.read_text(encoding='utf-8')
    out = []
    for m in re.finditer(r'<ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/([^"]+)">(.*?)</ParagraphStyleRange>', s, re.S):
        txt = ''.join(html.unescape(t) for t in re.findall(r'<Content>(.*?)</Content>', m.group(2), re.S))
        out.append((m.group(1), txt))
    return out


def draw_text(img, x, y, w, h, paras, cols=1):
    colw = (w - (cols - 1) * 17.0079) / cols
    ci = 0
    cy = y
    x0 = x
    w = colw
    for i, (st, txt) in enumerate(paras):
        if st not in STYLES:
            st = 'DB Small'
        f, fs, size, lead, sb, sa, col, extra = STYLES[st]
        if extra.get('Capitalization') == 'AllCaps': txt = txt.upper()
        font = FONTS[(f, fs)]
        ind = BULLET_INDENT if extra.get('bullet') else 0
        if i: cy += sb
        lines, cur = [], ''
        for word in txt.split(' '):
            t = (cur + ' ' + word) if cur else word
            if font.width(t, size) <= w - ind: cur = t
            else:
                if cur: lines.append(cur)
                cur = word
        if cur: lines.append(cur)
        right = extra.get('Justification') == 'RightAlign'
        for ln in lines:
            if cy + lead > y + h + 1 and ci < cols - 1:
                ci += 1; cy = y; x = x0 + ci * (colw + 17.0079)
            base = cy + lead * 0.8
            scale = size * S / 30.0
            thick = 2 if (fs == 'Bold' or size >= 18) else 1
            face = cv2.FONT_HERSHEY_TRIPLEX if f == 'Georgia' else cv2.FONT_HERSHEY_SIMPLEX
            tw = cv2.getTextSize(ln, face, scale, thick)[0][0]
            px = x + ind
            if right: px = x + w - tw / S
            if extra.get('bullet'): cv2.circle(img, P(x + 3, base - size * 0.3), max(1, int(1.5 * S)), bgr(col), -1)
            cv2.putText(img, ln, P(px, base), face, scale, bgr(col), thick, cv2.LINE_AA)
            cy += lead
        cy += sa
    if cy - sa > y + h + 1:  # overflow marker
        cv2.rectangle(img, P(x0, y), P(x0 + colw * cols, y + h), (0, 0, 255), 2)


def render(spread_file, idx):
    s = spread_file.read_text(encoding='utf-8')
    img = np.full((H, W, 3), 255, np.uint8)
    st = tr(re.search(r'<Spread [^>]+>', s).group(0))
    # walk top-level page items in order
    body = s[s.index('<Spread '):]
    for m in re.finditer(r'<(Rectangle|Oval|GraphicLine|TextFrame) Self="[^"]+"(.*?)</\1>', body, re.S):
        kind, el = m.group(1), m.group(0)
        v = tr(el)
        pts = apply(v, anchors(el))
        if not pts: continue
        fill = re.search(r'FillColor="(?:Color|Swatch)/([^"]+)"', el)
        fill = fill.group(1) if fill else 'None'
        tint = re.search(r'FillTint="([\d.]+)"', el)
        tint = float(tint.group(1)) if tint and float(tint.group(1)) >= 0 else None
        stroke = re.search(r'StrokeColor="(?:Color|Swatch)/([^"]+)"', el)
        stroke = stroke.group(1) if stroke else 'None'
        sw = float((re.search(r'StrokeWeight="([\d.]+)"', el) or [0, '0'])[1])
        xs, ys = [p[0] for p in pts], [p[1] for p in pts]
        x0, y0, x1, y1 = min(xs), min(ys), max(xs), max(ys)
        if kind == 'GraphicLine':
            cv2.line(img, P(*pts[0]), P(*pts[-1]), bgr(stroke, tint), max(1, int(sw * S)), cv2.LINE_AA)
            continue
        if kind == 'Oval':
            c, r = P((x0 + x1) / 2, (y0 + y1) / 2), int((x1 - x0) / 2 * S)
            if fill != 'None': cv2.circle(img, c, r, bgr(fill, tint), -1, cv2.LINE_AA)
            if stroke != 'None' and sw: cv2.circle(img, c, r, bgr(stroke), max(1, int(sw * S)), cv2.LINE_AA)
            continue
        if kind == 'Rectangle':
            if fill != 'None':
                cv2.rectangle(img, P(x0, y0), P(x1, y1), bgr(fill, tint), -1)
            link = re.search(r'LinkResourceURI="file:([^"]+)"', el)
            if link:
                path = html.unescape(link.group(1)).replace('%20', ' ')
                fitmode = 'Proportionally' in el and 'FillProportionally' not in el
                place_image(img, path, x0, y0, x1, y1, fitmode)
            if stroke != 'None' and sw:
                cv2.rectangle(img, P(x0, y0), P(x1, y1), bgr(stroke), max(1, int(sw * S)))
            continue
        if kind == 'TextFrame':
            sid = re.search(r'ParentStory="([^"]+)"', el).group(1)
            paras = story_paras(sid)
            if paras and paras[0][0] in STYLES:
                cc = re.search(r'TextColumnCount="(\d+)"', el)
                draw_text(img, x0, y0, x1 - x0, y1 - y0, paras, int(cc.group(1)) if cc else 1)
            else:
                cv2.rectangle(img, P(x0, y0), P(x1, y1), (200, 200, 200), 1)
    # page edges and margins
    cv2.line(img, P(0, -PH / 2), P(0, PH / 2), (180, 180, 180), 1)
    for x0 in (-PW, 0):
        cv2.rectangle(img, P(x0 + M, -PH / 2 + M), P(x0 + PW - M, PH / 2 - M), (230, 160, 230), 1)
    cv2.imwrite(str(OUT / f'spread_{idx:02d}.jpg'), img, [cv2.IMWRITE_JPEG_QUALITY, 85])
    return img


def place_image(img, path, x0, y0, x1, y1, fit):
    if path not in IMG:
        im = cv2.imdecode(np.fromfile(path, np.uint8), cv2.IMREAD_COLOR)
        if im is None: IMG[path] = None
        else:
            f = 600 / max(im.shape[:2]); IMG[path] = cv2.resize(im, None, fx=min(1, f), fy=min(1, f), interpolation=cv2.INTER_AREA)
    im = IMG[path]
    (a, b), (c, d) = P(x0, y0), P(x1, y1)
    fw, fh = c - a, d - b
    if im is None or fw < 2 or fh < 2:
        cv2.rectangle(img, (a, b), (c, d), (0, 0, 255), 3); return
    ih, iw = im.shape[:2]
    sc = (min if fit else max)(fw / iw, fh / ih)
    r = cv2.resize(im, (max(1, int(iw * sc)), max(1, int(ih * sc))))
    rh, rw = r.shape[:2]
    ox, oy = (fw - rw) // 2, (fh - rh) // 2
    sx0, sy0 = max(0, -ox), max(0, -oy)
    dx0, dy0 = a + max(0, ox), b + max(0, oy)
    ww, hh = min(rw - sx0, fw - max(0, ox)), min(rh - sy0, fh - max(0, oy))
    if dx0 < 0: sx0 -= dx0; ww += dx0; dx0 = 0
    if dy0 < 0: sy0 -= dy0; hh += dy0; dy0 = 0
    ww, hh = min(ww, img.shape[1] - dx0), min(hh, img.shape[0] - dy0)
    if ww > 0 and hh > 0: img[dy0:dy0 + hh, dx0:dx0 + ww] = r[sy0:sy0 + hh, sx0:sx0 + ww]


dm = (B / 'designmap.xml').read_text(encoding='utf-8')
spreads = re.findall(r'<idPkg:Spread src="([^"]+)"', dm)
thumbs = []
for i, sp in enumerate(spreads):
    im = render(B / sp, i)
    thumbs.append(cv2.resize(im, (W // 3, H // 3), interpolation=cv2.INTER_AREA))
# contact sheets, 4 spreads per sheet stacked
for k in range(0, len(thumbs), 8):
    grp = thumbs[k:k + 8]
    while len(grp) % 2: grp.append(np.full_like(thumbs[0], 240))
    rows = [np.hstack([grp[j], np.full((grp[j].shape[0], 10, 3), 120, np.uint8), grp[j + 1]]) for j in range(0, len(grp), 2)]
    sheet = np.vstack([np.vstack([r, np.full((10, r.shape[1], 3), 120, np.uint8)]) for r in rows])
    cv2.imwrite(str(OUT / f'sheet_{k // 8:02d}.jpg'), sheet, [cv2.IMWRITE_JPEG_QUALITY, 80])
print(len(spreads), 'spreads rendered to', OUT)

"""
Second edition of the Wetlands in Transition documentation book (pages 4 onwards).

Built on the student's own edited file: pages 1 to 3 and the closing template spread are kept
exactly as the student left them. Their layout fixes (wider text frames, larger images, the gap
under every title, the caps title on the acknowledgements, the run-in headings on their own line,
the number boxes on the map questions page) are carried into every page here.

Rules: Georgia for titles, Calibri for all other text, nothing smaller than 14 pt, simple British
English with no em dashes and no semicolons. Figures come only from the project's data.
"""
import json
from pathlib import Path
import cv2, numpy as np
from idml_lib import *  # noqa

ROOT = Path(__file__).resolve().parents[1]
MAN = json.loads((ROOT / 'public/data/manifest.json').read_text())
PTS = json.loads((ROOT / 'public/data/points.json').read_text())
MLM = json.loads((ROOT / 'tools/ml/out/metrics.json').read_text())
CHG = json.loads((ROOT / 'tools/ml/out/change.json').read_text())

TOPY = TOP + M
BODY_BOTTOM = BOT - M - 26
FOLIO_Y = BOT - M - 16
GAP = 24                       # space between a page title and its text

# ------------------------------------------------------------------ image links
LINKDIR = ROOT / 'docbook' / 'Links'
LINKDIR.mkdir(exist_ok=True)
IMGS = ROOT / 'assets' / 'images'
FIELD = IMGS / 'images for field trip'
SEM = ROOT.parent
FIXED = {
    'map1': ROOT / 'assets/maps/1/Map 1 - The Estuary as a Landscape.png',
    'map2': ROOT / 'assets/maps/2/Map 2 - Patterns of Wetness and Vegetation.png',
    'map3': ROOT / 'assets/maps/3/Map 3 - The Estuary Through Time.png',
    'map4': ROOT / 'assets/maps/4/Map 4 - The Estuary as a Lived Landscape.png',
    'map5': ROOT / 'assets/maps/5/Map 5 - The Estuary Between Plan and Ground.png',
    'map6': ROOT / 'assets/maps/6/Map 6 - The Estuary and the Monsoon.png',
    'map7': SEM / 'Final  Maps/Map 7 - Cyclones and Storms.png',
    'plan_full': IMGS / 'images for master plan/Master Plan Image.png',
    'plan_detail': IMGS / 'images for master plan/Master Plan - blue waters estuary.png',
    'plan_part': IMGS / 'images for master plan/Master Plan - specific part of Image.png',
    'frame_op1': SEM / 'Kml files GEP/op 1.jpg', 'frame_op2': SEM / 'Kml files GEP/op 2.jpg', 'frame_op3': SEM / 'Kml files GEP/op 3.jpg',
    'ph_wetland': FIELD / 'image for  wetland.png',
}
USED = set()


def write_jpeg_300(img, path):
    ok, buf = cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 90])
    b = bytearray(buf.tobytes())
    i = b.find(b'JFIF\x00')
    b[i + 7] = 1
    b[i + 8:i + 10] = (300).to_bytes(2, 'big')
    b[i + 10:i + 12] = (300).to_bytes(2, 'big')
    path.write_bytes(bytes(b))


def source_of(key):
    if key in FIXED: return FIXED[key]
    if key.startswith('f_'):
        stem = key[2:]
        return FIELD / (f'IMG-20261121-{stem}.jpg' if stem.startswith('WA') else f'2026{stem}.jpg')
    if key.startswith('date_'): return ROOT / 'public/data/imagery' / f'{key[5:]}.png'
    if key.startswith('miss_'): return IMGS / 'images for missing dates' / f'{key[5:]}.png'
    if key.startswith('web_'):
        return next((ROOT / 'docbook/_source/raw_web').glob(f'*_{key[4:]}.png'))
    raise KeyError(key)


def link(key):
    """print copy of an image at 300 ppi in docbook/Links, made the first time it is used"""
    USED.add(key)
    out = LINKDIR / f'{key}.jpg'
    src = source_of(key)
    if not out.exists() or out.stat().st_mtime < src.stat().st_mtime:
        im = cv2.imdecode(np.fromfile(str(src), np.uint8), cv2.IMREAD_COLOR)
        h, w = im.shape[:2]
        lim = 4200 if key.startswith(('map', 'plan')) else 3000
        s = min(1.0, lim / max(h, w))
        if s < 1: im = cv2.resize(im, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA)
        write_jpeg_300(im, out)
    im = cv2.imdecode(np.fromfile(str(out), np.uint8), cv2.IMREAD_REDUCED_GRAYSCALE_8)
    h8, w8 = im.shape[:2]
    # exact size from the JPEG header
    import struct
    b = out.read_bytes()
    i = 2
    while i < len(b):
        if b[i] != 0xFF: break
        mk, ln = b[i + 1], struct.unpack('>H', b[i + 2:i + 4])[0]
        if mk in (0xC0, 0xC1, 0xC2):
            hh, ww = struct.unpack('>HH', b[i + 5:i + 9])
            return dict(path=str(out), wpt=ww * 72 / 300, hpt=hh * 72 / 300, px=(ww, hh))
        i += 2 + ln
    raise RuntimeError(out)


def P(style, text):
    return (style, text)


# ------------------------------------------------------------------ book
class Book:
    def __init__(self, doc):
        self.d = doc
        self.pages = []
        self.contents = []

    @property
    def num(self): return 4 + len(self.pages)

    @property
    def side(self): return 'L' if len(self.pages) % 2 == 0 else 'R'

    def add(self, items): self.pages.append((self.side, items))

    def mark(self, title):
        self.contents.append((title, self.num))

    # -- shared pieces
    def folio(self, side, n, dark=False):
        w = 300
        if side == 'L':
            return [self.d.text(col_x(side, 0), FOLIO_Y, w, 18, [('DB Folio White' if dark else 'DB Folio', f'{n}    Wetlands in Transition')])]
        return [self.d.text(page_x0(side) + PW - M - w, FOLIO_Y, w, 18, [('DB Folio Right White' if dark else 'DB Folio Right', f'Wetlands in Transition    {n}')])]

    def bg(self, side, fill='WIT Accent'):
        if side == 'L': return self.d.rect(-PW - 9, TOP - 9, PW + 9, PH + 18, fill)
        return self.d.rect(0, TOP - 9, PW + 9, PH + 18, fill)

    def bleed_image(self, side, key):
        x = -PW - 9 if side == 'L' else 0
        return self.d.image(x, TOP - 9, PW + 9, PH + 18, link(key))

    def head(self, side, kicker, title, w=None, white=False, caps=False):
        w = w or CW
        paras = []
        if kicker: paras.append(P('DB Kicker White' if white else 'DB Kicker', kicker))
        st = 'DB Title White' if white else 'DB Title'
        paras.append((st, [(title, {'caps': True, 'tracking': 60})]) if caps else P(st, title))
        h = measure(paras, w) + 2
        return self.d.text(col_x(side, 0), TOPY, w, h, paras), TOPY + h + GAP

    def img(self, x, y, w, h, key, cap=None, mode='fill', stroke=None, cap_h=None):
        """image with an optional caption under it; returns items and the bottom edge"""
        out = [self.d.image(x, y, w, h, link(key), mode=mode, stroke=stroke)]
        bottom = y + h
        if cap:
            ch = cap_h or (measure([P('DB Caption', cap)], w) + 4)
            out.append(self.d.text(x, y + h + 2, w, ch, [P('DB Caption', cap)]))
            bottom = y + h + 2 + ch
        return out, bottom

    def cap_h(self, caps, w):
        return max(measure([P('DB Caption', c)], w) for c in caps) + 6

    # -- page types
    def title_page(self, number, title, intro, key):
        """a photograph across the whole page, with the section number and title on a band of the accent colour"""
        side, n = self.side, self.num
        self.mark(title)
        it = [self.bleed_image(side, key)]
        tx = col_x(side, 0) + 150
        tw = page_x0(side) + PW - M - tx
        tp = [P('DB Title XL', title)]
        th = measure(tp, tw) + 2
        ip = [P('DB Body White', intro)]
        ih = measure(ip, tw) + 2
        content_h = max(th + 8 + ih, 100)
        ty = FOLIO_Y - 18 - content_h
        by = ty - 26
        x0 = -PW - 9 if side == 'L' else 0
        it.append(self.d.rect(x0, by, PW + 9, BOT + 9 - by, 'WIT Accent'))
        it.append(self.d.text(col_x(side, 0), ty - 6, 140, 104, [P('DB Number', number)]))
        it.append(self.d.text(tx, ty, tw, th, tp))
        it.append(self.d.text(tx, ty + th + 8, tw, ih, ip))
        it += self.folio(side, n, dark=True)
        self.add(it)

    def text_page(self, kicker, title, paras, cols=1, extra=None, mark=None, caps=False, width=None):
        side, n = self.side, self.num
        if mark: self.mark(mark)
        h, y = self.head(side, kicker, title, caps=caps)
        it = [h]
        w = width or CW
        it.append(self.d.text(col_x(side, 0), y, w, BODY_BOTTOM - y, paras, cols=cols))
        if extra: it += extra(side, y)
        it += self.folio(side, n)
        self.add(it)

    def text_and_images(self, kicker, title, paras, shots, mark=None, text_cols=2, intro_full=None):
        """text on the left part of the page, images stacked in the remaining columns down to the bottom"""
        side, n = self.side, self.num
        if mark: self.mark(mark)
        h, y = self.head(side, kicker, title)
        it = [h]
        tw = span_w(text_cols)
        it.append(self.d.text(col_x(side, 0), y, tw, BODY_BOTTOM - y, paras))
        ix = col_x(side, text_cols)
        iw = page_x0(side) + PW - M - ix
        k = len(shots)
        caps = [c for _, c in shots if c]
        ch = self.cap_h(caps, iw) if caps else 0
        ih = (BODY_BOTTOM + 4 - y - (k - 1) * 12) / k - ch
        for j, (key, cap) in enumerate(shots):
            py = y + j * (ih + ch + 12)
            o, _ = self.img(ix, py, iw, ih, key, cap, cap_h=ch - 4 if cap else None)
            it += o
        it += self.folio(side, n)
        self.add(it)

    def grid_page(self, kicker, title, photos, intro=None, cols=3, rows=2, mark=None):
        side, n = self.side, self.num
        if mark: self.mark(mark)
        h, y = self.head(side, kicker, title)
        it = [h]
        if intro:
            ip = [P('DB Body', intro)]
            ih = measure(ip, CW) + 2
            it.append(self.d.text(col_x(side, 0), y, CW, ih, ip))
            y += ih + 6
        gw = (CW - (cols - 1) * GUT) / cols
        caps = [c for _, c in photos if c]
        ch = self.cap_h(caps, gw) if caps else 0
        gh = (BODY_BOTTOM + 4 - y - (rows - 1) * 12) / rows - ch
        for k, (key, cap) in enumerate(photos):
            r, c = divmod(k, cols)
            px, py = col_x(side, 0) + c * (gw + GUT), y + r * (gh + ch + 12)
            o, _ = self.img(px, py, gw, gh, key, cap, cap_h=ch - 4 if cap else None)
            it += o
        it += self.folio(side, n)
        self.add(it)

    def cards_page(self, kicker, title, cards, intro=None, mark=None):
        """four numbered points side by side, each with a photograph below that shows what it is about"""
        side, n = self.side, self.num
        if mark: self.mark(mark)
        h, y = self.head(side, kicker, title)
        it = [h]
        if intro:
            ip = [P('DB Body', intro)]
            ih = measure(ip, CW) + 2
            it.append(self.d.text(col_x(side, 0), y, CW, ih, ip))
            y += ih + 4
        paras = [[P('DB Big Figure', str(k + 1)), P('DB Label', ' ' + sub), P('DB Small', body)] for k, (sub, body, key) in enumerate(cards)]
        th = max(measure(p, COLW) for p in paras) + 4
        for k, (sub, body, key) in enumerate(cards):
            cx = col_x(side, k)
            it.append(self.d.line(cx, y, cx + COLW, y, 'WIT Accent', 0.75))
            it.append(self.d.text(cx, y + 8, COLW, th, paras[k]))
            o, _ = self.img(cx, y + 8 + th + 8, COLW, BODY_BOTTOM + 4 - (y + 8 + th + 8), key)
            it += o
        it += self.folio(side, n)
        self.add(it)

    def map_spread(self, key, number, name, sections, mark):
        """the map across the whole left page, its explanation on the right page"""
        assert self.side == 'L', f'map {number} must start on a left page'
        self.add([self.bleed_image('L', key)])
        side, n = self.side, self.num
        self.mark(mark)
        h, y = self.head(side, f'Map {number}', name)
        paras = []
        for head, body in sections:
            paras.append(P('DB Subhead Accent', head))
            for b in (body if isinstance(body, list) else [body]):
                paras.append(P('DB Bullet', b[2:]) if b.startswith('- ') else P('DB Body', b))
        it = [h, self.d.text(col_x(side, 0), y, CW, BODY_BOTTOM - y, paras, cols=2)]
        it += self.folio(side, n)
        self.add(it)

    def web_two(self, kicker, title, shots, paras, mark=None):
        """two large screenshots side by side with captions, text across the page below them"""
        side, n = self.side, self.num
        if mark: self.mark(mark)
        h, y = self.head(side, kicker, title)
        it = [h]
        iw = span_w(2)
        ih = iw / 1.6
        ch = self.cap_h([c for _, c in shots], iw)
        for j, (key, cap) in enumerate(shots):
            o, _ = self.img(col_x(side, 2 * j), y, iw, ih, key, cap, cap_h=ch - 4)
            it += o
        ty = y + ih + ch + 8
        it.append(self.d.text(col_x(side, 0), ty, CW, BODY_BOTTOM - ty, paras, cols=2))
        it += self.folio(side, n)
        self.add(it)

    def web_one(self, kicker, title, key, cap, paras, mark=None):
        """one large screenshot with the text beside it"""
        side, n = self.side, self.num
        if mark: self.mark(mark)
        h, y = self.head(side, kicker, title)
        it = [h]
        avail = BODY_BOTTOM + 4 - y
        ch = self.cap_h([cap], 300)
        ih = avail - ch
        iw = min(ih * 1.6, span_w(3) - 30)
        ih = iw / 1.6
        o, _ = self.img(col_x(side, 0), y, iw, ih, key, cap, cap_h=ch - 4)
        it += o
        tx = col_x(side, 0) + iw + GUT
        it.append(self.d.text(tx, y, page_x0(side) + PW - M - tx, BODY_BOTTOM - y, paras))
        it += self.folio(side, n)
        self.add(it)


def fmt_date(iso, long=False):
    months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    y, m, dd = iso.split('-')
    return f'{int(dd)} {months[int(m) - 1] if long else months[int(m) - 1][:3]} {y}'


# =========================================================================== pages
def build_pages(doc):
    b = Book(doc)
    d = doc

    # ---------------------------------------------------------------- 4 contents (filled at the end)
    b.add([])

    # ---------------------------------------------------------------- 5 acknowledgements
    b.mark('Acknowledgements')
    ack = [
        P('DB Body', 'I would like to thank my guide, Dr. Venkata Chilukuri, for the feedback at every stage of this project, which helped me narrow a large idea into one estuary and one clear question.'),
        P('DB Body', 'I am grateful to the people who work on the Kundapur estuary and spoke with me during my field visits. Their account of how fishing, shell collection and cage farming change through the year shaped the classes used in this project.'),
        P('DB Body', 'Thank you to the faculty and staff of Srishti Manipal Institute of Art, Design and Technology, and to my classmates, for their discussion and support.'),
        P('DB Body', 'Finally, thank you to my family and friends for their patience and encouragement throughout the semester.'),
    ]
    b.text_page(None, 'Acknowledgements', ack, caps=True,
                extra=lambda side, y: b.img(col_x(side, 0), y + measure(ack, CW) + 14, CW, BODY_BOTTOM + 4 - (y + measure(ack, CW) + 14), 'f_0902_174137')[0])

    # ---------------------------------------------------------------- 6 abstract
    side, n = b.side, b.num
    b.mark('Abstract')
    h, y = b.head(side, 'Abstract', 'Wetlands in Transition')
    it = [h]
    ab = [
        P('DB Heading', 'MAPPING CHANGE AND DEVELOPMENT IN KUNDAPUR'),
        P('DB Body', 'This project studies the estuary beside Kundapur town in Karnataka and the mangroves within it. It compares how the land and water change over time with the way the Kundapura Master Plan 2031 divides the same ground into four fixed categories.'),
        P('DB Body', 'Google Earth Pro offered 22 dated satellite images of the study frame between 2011 and 2025. Seventeen were clear enough to trace. I traced every one of them by hand into ten classes, exported the traces as KML files and built six maps from them in QGIS. A scroll-driven 3D website rebuilds the maps from clouds of small dots so that the estuary can be explored rather than only read.'),
        P('DB Body', 'The images are few, were taken in different months and none show the monsoon. Tide levels were never recorded. The project treats this lack of data as part of its subject and asks how a place that keeps moving can be described by maps and plans that stay still.'),
    ]
    it.append(d.text(col_x(side, 0), y, span_w(3), BODY_BOTTOM - y, ab, cols=2))
    o, _ = b.img(col_x(side, 3), y, COLW, BODY_BOTTOM + 4 - y, 'f_0902_174509')
    it += o + b.folio(side, n)
    b.add(it)

    # ---------------------------------------------------------------- 7 at a glance
    side, n = b.side, b.num
    it = [b.bg(side)]
    h, y = b.head(side, 'At a glance', 'The project in six numbers', white=True)
    it.append(h)
    figs = [('22', 'satellite dates logged, 2011 to 2025'), ('17', 'clear dates traced by hand'), ('10', 'classes traced on every date'),
            ('6', 'maps made in QGIS'), ('0', 'images from the monsoon months'), ('1', 'scroll-driven 3D website')]
    cw = (CW - 2 * GUT) / 3
    rh = (BODY_BOTTOM - y) / 2
    for k, (f, t) in enumerate(figs):
        r, c = divmod(k, 3)
        fx, fy = col_x(side, 0) + c * (cw + GUT), y + r * rh
        it.append(d.line(fx, fy, fx + cw, fy, 'Paper', 0.75))
        it.append(d.text(fx, fy + 14, cw, 50, [P('DB Big Figure White', f)]))
        it.append(d.text(fx, fy + 66, cw, 40, [P('DB Small White', t)]))
    it += b.folio(side, n, dark=True)
    b.add(it)

    # ================================================================ 01 INTRODUCTION
    b.title_page('01', 'Introduction', 'How the project began, how it changed direction and the question it now asks.', 'f_0902_174510')
    b.text_page('Introduction', 'Overview', [
        P('DB Body', 'This project looks at the estuary beside Kundapur town and the mangroves that sit within it. It began as a study of how boats are sheltered and became a study of how a changing wetland is recorded, mapped and planned for.'),
        P('DB Quote', 'How does the Kundapur estuary change across seasons and over time, and how does planning describe it?'),
        P('DB Body', 'To answer this I traced satellite imagery from 2011 to 2025 by hand, built six maps from the traces and compared what I found with the Kundapura Master Plan 2031. I also built an immersive website that rebuilds the maps in 3D, so that the way the estuary is put together and changes can be seen and not only read on paper.'),
        P('DB Subhead', 'How this book is arranged'),
        P('DB Body', 'The book follows the project in the order it happened. It starts with the site and the fieldwork, sets out the question and the thinking behind the method, explains the data and its gaps, and then describes the classification and the workflow. Each of the six maps is then explained in depth, with the map on the left page and its explanation beside it. The book ends with the website, the findings, the successes and challenges, and what could come next.'),
    ])

    b.text_and_images('Where the project started', 'From boat shelters to the estuary', [
        P('DB Body', 'I first chose Kundapur because of its large fishing and boat-building community. My plan was to compare how different groups shelter their boats. I expected to find different kinds of shelter for different kinds of boats and to map how each one worked.'),
        P('DB Body', 'The visit to Magnus Wharf, near Gangolli Port, changed this. There was one main shelter, and it was used by everything from ferries to small fishing boats. There was nothing to compare, so the idea did not hold.'),
        P('DB Body', 'Rather than force a comparison that was not there, I looked more closely at the surroundings. The boats stayed in the project, but as one of the things visible along the shore and not as the main subject.'),
    ], [('f_0901_134354', 'Fishing boats drawn up on land for repair, 1 September.'), ('f_0831_073650', 'Canoes moored along the rubble bank of the estuary.')])

    side, n = b.side, b.num
    h, y = b.head(side, 'How the project shifted', 'Nothing around Kundapur stays the same for long')
    ip = [P('DB Body', 'Looking around the area showed me a different pattern. Moss spreads across brick walls from the wettest grooves. The clay pit of a tile factory later becomes a bird sanctuary. The ground under the mangroves, which is normally hidden by water, shows at low tide. I moved from asking where boats are kept to asking how the land and water around them keep changing.')]
    ih = measure(ip, CW) + 2
    it = [h, d.text(col_x(side, 0), y, CW, ih, ip)]
    y += ih + 10
    gw = (CW - 2 * GUT) / 3
    for k, key in enumerate(['f_0830_163943', 'f_WA0020', 'f_0902_172432']):
        it.append(d.image(col_x(side, 0) + k * (gw + GUT), y, gw, BODY_BOTTOM + 4 - y, link(key)))
    it += b.folio(side, n)
    b.add(it)

    # ================================================================ 02 THE SITE
    b.title_page('02', 'The Site', 'Kundapur, the Panchagangavali estuary and the people who work on it. Why this stretch of water was chosen and why it needs to be mapped.', 'f_0831_074608')
    side, n = b.side, b.num
    h, y = b.head(side, 'The site', 'Kundapur and its estuary')
    tp = [
        P('DB Body', 'Kundapur sits on the Karnataka coast where the Panchagangavali river system meets the Arabian Sea, at about 13.639 degrees north and 74.692 degrees east. The study looks at one part of the estuary beside the town, with a curved stand of mangroves, a mud island, open water and a working shore.'),
        P('DB Body', 'The estuary is an ecological and livelihood hub for the local Kharvi community. Their work includes fishing, clam collection, and gathering, sorting and cleaning shellfish. This work follows the seasons and the tides.'),
        P('DB Body', 'Water levels move between high and low tide every few hours. Ground that is under water at one moment can be exposed as mudflat or estuary bed a few hours later. The edge between land and water is therefore a shifting condition and not a fixed line. This is the condition the whole project is built around.'),
    ]
    th = measure(tp, span_w(2)) + 4
    it = [h, d.text(col_x(side, 0), y, span_w(2), th, tp)]
    o, _ = b.img(col_x(side, 0), y + th + 10, span_w(2), BODY_BOTTOM + 4 - (y + th + 10), 'f_0902_174513')
    it += o
    o, _ = b.img(col_x(side, 2), y, span_w(2), BODY_BOTTOM + 4 - y, 'ph_wetland')
    it += o + b.folio(side, n)
    b.add(it)

    b.cards_page('Why the estuary', 'Four reasons for choosing this stretch of water', [
        ('The edge is not fixed', 'The same ground can be covered by water at one time and exposed at another.', 'f_0902_172427'),
        ('Mangroves and a mud island', 'They are the clearest signs of the movement between land and water.', 'f_0902_174510'),
        ('People work here', 'Fishing, boats and shellfish farming depend on where the water is on a given day.', 'f_0902_174112'),
        ('A plan covers it', 'The Master Plan 2031 sorts this ground into fixed categories, which allows a comparison.', 'plan_part'),
    ])

    side, n = b.side, b.num
    h, y = b.head(side, 'Choosing the frame', 'From twenty years to one frame')
    tp = [P('DB Body', 'The feedback on my proposal said the project might be too big. It first aimed at 20 years, several sites and a possible immersive piece. I reduced it to one estuary frame and the years 2011 to 2025. I compared three candidate frames in Google Earth Pro and chose the smallest. It shows the curved mangrove stand, the mud island and the boats along the shore. It had the simplest edges and held every class I wanted to trace, which suited tracing many dates.')]
    th = measure(tp, CW) + 2
    it = [h, d.text(col_x(side, 0), y, CW, th, tp)]
    y += th + 10
    fw = (CW - 2 * GUT) / 3
    caps = ['Option 1, chosen. The smallest frame, with the mangrove stand, mud island and shore.', 'Option 2. A wider view of the island and its channels.', 'Option 3. The widest frame, with more mangroves and more complex edges.']
    ch = b.cap_h(caps, fw)
    fh = BODY_BOTTOM + 4 - y - ch
    for k, key in enumerate(['frame_op1', 'frame_op2', 'frame_op3']):
        o, _ = b.img(col_x(side, 0) + k * (fw + GUT), y, fw, fh, key, caps[k], stroke='WIT Accent' if k == 0 else None, cap_h=ch - 4)
        it += o
    it += b.folio(side, n)
    b.add(it)

    b.mark('Fieldwork')
    b.text_and_images('Fieldwork', 'Walking the estuary', [
        P('DB Body', 'The field visits took place between 30 August and 2 September. I walked the shore at different times of day, photographed the water, the mud and the working edge, and spoke with people who work on the estuary.'),
        P('DB Body', 'They described how their work changes from month to month with the fish. When fishing is poor, some turn to collecting shells. They also described shellfish-farming areas marked in the water with thermocol and long rods, a fixed marker tied to something that never stays still. These areas are mapped in this project as cage farms.'),
        P('DB Body', 'The photographs record the working life of the estuary and the ground around the mangroves exposed at low tide, which later became the classes bed ground and muddy shallows.'),
    ], [('f_0831_072208', 'Cage-farm frames and canoes on a still morning, 31 August.'), ('f_0831_074920', 'Clams gathered in a basket on the bank.')])

    b.grid_page('Fieldwork', 'The working estuary', [
        ('f_0831_073248', 'Still, reflective water early on 31 August.'), ('f_0902_173249', 'Bamboo stakes standing in the shallows.'),
        ('f_0831_072228', 'Rectangular cage-farm frames in the water.'), ('f_0831_074917', 'Canoes tied up beside the cage farms.'),
        ('f_0831_075305', 'A canoe crossing the open water.'), ('f_0831_071747', 'Clam baskets, sorted and ready.'),
    ])
    b.grid_page('Fieldwork', 'Boatyards and the river mouth', [
        ('f_0901_130331', 'A fishing boat on the slipway, 1 September.'), ('f_0901_132442', 'Hulls under blue sheets in the boatyard.'),
        ('f_0901_134406', 'Boats and gear spread along the yard.'), ('f_0831_173412', 'A fishing boat near the mouth of the river, 31 August.'),
        ('f_0831_174947', 'Waves breaking on the concrete blocks of the breakwater.'), ('f_0831_175328', 'A boat heading out through the waves.'),
    ], intro='Away from the study frame I also walked the boatyards, where fishing boats are drawn up on land for repair, and the breakwater at the mouth of the river, where the estuary meets the Arabian Sea.')
    b.grid_page('Fieldwork', 'Low tide on 2 September', [
        ('f_0902_172427', 'A low mud island showing above the water.'), ('f_0902_172452', 'Mud and debris exposed near the sea wall.'),
        ('f_0902_171913', 'The edge of the mangroves in the late afternoon.'), ('f_0902_173620', 'A canoe left on the stone bank.'),
        ('f_0902_174459', 'Canoes and nets along the shore.'), ('f_0902_174513', 'Cage farms in front of the mangrove stand.'),
    ], intro='On the afternoon of 2 September the water was low. Ground that is under water in most of the satellite images showed as a low mud island, and the stakes and cage farms stood clear of the surface.')

    side, n = b.side, b.num
    h, y = b.head(side, 'Why Kundapur', 'Why this place needs to be mapped')
    tp = [
        P('DB Body', 'Kundapur is a small and little studied place. While working on this project I found no open dataset that records where its land meets its water, how its tides behave, or which parts of its estuary are mangrove, mudflat or open water on a given date.'),
        P('DB Body', 'National and global sources such as the Ramsar country profile, Wetlands International and Global Mangrove Watch describe wetlands at a scale that says very little about this stretch of coast. The local plan describes the area in four fixed categories and carries no seasonal or tidal information.'),
        P('DB Body', 'At the same time, the estuary is changing. New infrastructure is planned along the water around the town, and the people who fish and farm shellfish here depend on where the water is from week to week. Decisions about the edge of the water are being made without a record of how that edge behaves.'),
        P('DB Body', 'This project is one small step towards that record. It shows what can be learned from the imagery that exists, and it makes clear what cannot be known without new data collection on the ground.'),
    ]
    it = [h, d.text(col_x(side, 0), y, span_w(3), BODY_BOTTOM - y, tp, cols=2)]
    o, _ = b.img(col_x(side, 3), y, COLW, BODY_BOTTOM + 4 - y, 'f_0831_072659')
    it += o + b.folio(side, n)
    b.add(it)

    b.cards_page('Missing data', 'What does not exist for this estuary', [
        ('Boundary data', 'No open, dated outline of the water, mudflats or mangroves exists. Every boundary here was traced by hand.', 'date_2025_02_25'),
        ('Tide data', 'No historical tide record exists for Kundapur. The tide when each image was taken cannot be found.', 'f_0902_171313'),
        ('Class data', 'No source sorts the estuary into water, bed ground, muddy shallows and mangrove canopy.', 'f_0902_174513'),
        ('Seasonal imagery', 'Rain and cloud hide the estuary from June to September, so no monsoon image can be used.', 'f_0831_071555'),
    ], mark='What is missing')

    # ================================================================ 03 THE QUESTION
    b.title_page('03', 'The Question', 'The question the project asks, the assumptions behind it and why it is approached as an exploration.', 'f_0902_172427')
    side, n = b.side, b.num
    h, y = b.head(side, 'The question', 'What the project asks')
    q = [P('DB Quote', 'How does the Kundapur estuary change across seasons and over time, and how does planning describe it?')]
    qh = measure(q, CW) + 4
    it = [h, d.text(col_x(side, 0), y, CW, qh, q)]
    y += qh + 4
    tp = [P('DB Body', 'The project also asks how a lack of data shapes mapping and planning, and what that could mean for future policy, for the people who work in the estuary and for the wildlife that depends on it. The question rests on three assumptions.')]
    th = measure(tp, CW) + 2
    it.append(d.text(col_x(side, 0), y, CW, th, tp))
    y += th + 10
    ass = [('The wetland expands after the monsoon and shrinks in other months.', 'The imagery can only partly test this, because none of the usable images fall in the monsoon.'),
           ('Some land marked as Developed Area or Agriculture Area overlaps with land that is Marshy Area or Water Sheet for part of the year.', 'The comparison with the plan in Map 5 is built to look for this.'),
           ('This overlap lies on or near land used by local communities, including the Kharvi fishing community.', 'Map 4 looks at the shore where boats are kept and shellfish are farmed.')]
    cw = (CW - 2 * GUT) / 3
    cards = [[P('DB Big Figure', str(k + 1)), P('DB Label', '\u2028' + a_), P('DB Small', note)] for k, (a_, note) in enumerate(ass)]
    chh = BODY_BOTTOM + 4 - y
    for k in range(3):
        cx = col_x(side, 0) + k * (cw + GUT)
        it.append(d.rect(cx, y, cw, chh, 'WIT Accent', tint=10))
        it.append(d.text(cx + 12, y + 12, cw - 24, chh - 20, cards[k]))
    it += b.folio(side, n)
    b.add(it)

    side, n = b.side, b.num
    b.mark('An explorative lens')
    h, y = b.head(side, 'An explorative lens', 'Why the project explores rather than proves')
    tp = [
        P('DB Body', 'This is an explorative project. It does not set out to prove a single claim. It sets out to record a place carefully, with the data that exists, and to see what that record shows.'),
        P('DB Body', 'There are three reasons for this. First, Kundapur is a niche place. There is no boundary data for its estuary, no tide record and no published classification of its ground. Any claim about long term change would rest on data that does not exist.'),
        P('DB Body', 'Second, the imagery itself is thin. Most years have one image, the images fall in different months and none fall in the monsoon. A difference between two dates may come from the tide or the season and not from real change.'),
        P('DB Body', 'Third, the act of recording has value of its own. By tracing every usable date and keeping each trace, this project becomes an archive of what the estuary looked like on seventeen days between 2011 and 2025. Future work can build on it, test it and add to it as new data becomes available.'),
        P('DB Body', 'For these reasons, every map in this book describes differences between observations and not proven trends. Where the evidence is weak, the book says so.'),
    ]
    it = [h, d.text(col_x(side, 0), y, span_w(3), BODY_BOTTOM - y, tp, cols=1)]
    o, _ = b.img(col_x(side, 3), y, COLW, BODY_BOTTOM + 4 - y, 'f_0902_173244')
    it += o + b.folio(side, n)
    b.add(it)

    b.cards_page('Why these maps', 'Why these maps are needed', [
        ('To keep a record', 'The traces are a dated archive of a place with no other record of its edges.', 'date_2011_04_11'),
        ('To compare plan and ground', 'They set the official plan beside what is visible on the ground.', 'plan_detail'),
        ('To show the gaps', 'They make the missing monsoon, unknown tide and uneven dates visible.', 'miss_4_4_21'),
        ('To give a base for future work', 'New fieldwork, tide records or imagery can use the same frame and classes.', 'map1'),
    ])

    # ================================================================ 04 THE PLAN
    b.title_page('04', 'The Plan', 'The Kundapura Master Plan 2031, what it shows for the estuary and why it was set beside the observed ground.', 'f_0902_171309')
    side, n = b.side, b.num
    h, y = b.head(side, 'The Kundapura Master Plan 2031', 'Four fixed categories')
    tp = [P('DB Body', 'Drawing No. 2 of the Kundapura Master Plan 2031 is the existing land utilisation sheet for the Kundapura Local Planning Area. It is marked provisional, is drawn at 1:15,000 and sorts 1,741.74 hectares across Kasaba Kundapura, Vaderahobali and Hangaluru into four categories.')]
    th = measure(tp, CW) + 2
    it = [h, d.text(col_x(side, 0), y, CW, th, tp)]
    y += th + 4
    cats = [('Developed Area', 541.90, 31.11, 'Plan Developed'), ('Agriculture Area', 634.48, 36.43, 'Plan Agriculture'), ('Marshy Area', 28.06, 1.61, 'Plan Marshy'), ('Water Sheet', 537.30, 30.85, 'Plan Water')]
    lab = lambda nm, pc, ha: [('DB Big Figure', [(f'{pc}%', {'size': 32})]), P('DB Small', f'{nm}, {ha:,.2f} ha')]
    lh = measure(lab('Developed Area', 31.11, 541.9), 160) + 2
    bar_y = y + lh + 6
    xx = col_x(side, 0)
    xs = []
    for nm, ha, pc, col in cats:
        w = CW * pc / 100
        it.append(d.rect(xx, bar_y, w, 46, col))
        xs.append(xx)
        xx += w
    # labels above the bar for Developed and Marshy, below for Agriculture and Water, as the student arranged them
    it.append(d.text(xs[0], y, 160, lh, lab('Developed Area', 31.11, 541.90)))
    it.append(d.text(xs[2] - 2, y, 160, lh, lab('Marshy Area', 1.61, 28.06)))
    it.append(d.text(xs[1], bar_y + 52, 160, lh, lab('Agriculture Area', 36.43, 634.48)))
    it.append(d.text(xs[3], bar_y + 52, 160, lh, lab('Water Sheet', 30.85, 537.30)))
    y = bar_y + 52 + lh + 4
    it.append(d.text(col_x(side, 0), y, CW, BODY_BOTTOM - y, cols=2, paras=[P('DB Body', 'Marshy Area appears as two small patches in the river off the town\'s north shore, and the river and flats around them are drawn as Water Sheet. The sheet has no seasonal or tidal information. At 1:15,000 a 0.5 mm line covers about 7.5 metres, so small shifts near the edges cannot be read reliably.')]))
    it += b.folio(side, n)
    b.add(it)

    # the whole plan and the study area, with an arrow to the enlarged part
    side, n = b.side, b.num
    full, det = link('plan_full'), link('plan_detail')
    ph = 206
    pw = ph * full['wpt'] / full['hpt']
    px, py = col_x(side, 0), TOPY
    it = [d.image(px, py, pw, ph, full, mode='fit', stroke='Grey Line')]
    # where the enlarged part sits on the sheet (found by matching the two images)
    W0, H0 = 10432, 7028
    rx, ry, rw, rh = 3736, 2112, 1488, 460
    sx = pw / W0
    bx, by = px + rx * sx, py + ry * sx
    it.append(d.rect(bx, by, rw * sx, rh * sx, None, stroke='Cage farms', sw=1.5))
    tx = px + pw + GUT
    tw = page_x0(side) + PW - M - tx
    hp = [P('DB Kicker', 'The Kundapura Master Plan 2031'), P('DB Title', 'The whole plan and the study area')]
    hh = measure(hp, tw) + 2
    it.append(d.text(tx, TOPY, tw, hh, hp))
    tp = [P('DB Body', 'The full sheet, Drawing No. 2, covers the whole planning area. The small red box marks the stretch of the Haladi Hole beside the town that holds the study frame. The arrow points to the same stretch enlarged below, where the red outline is the study frame itself. On the plan, all of it is Water Sheet.')]
    it.append(d.text(tx, TOPY + hh + GAP, tw, measure(tp, tw) + 4, tp))
    dh = BODY_BOTTOM + 4 - (py + ph + 22)
    dw = dh * det['wpt'] / det['hpt']
    dx, dy = page_x0(side) + PW - M - dw, py + ph + 22
    it.append(d.image(dx, dy, dw, dh, det, mode='fit', stroke='Grey Line'))
    # arrow from the box on the sheet to the red frame in the enlargement
    tx_, ty_ = dx + dw * 0.435, dy - 2
    it.append(d.line(bx + rw * sx / 2, by + rh * sx, tx_, ty_, 'Cage farms', 1.5, arrow=True))
    it += b.folio(side, n)
    b.add(it)

    side, n = b.side, b.num
    h, y = b.head(side, 'Plan and ground', 'What the plan shows and what is there')
    lx, rx2 = col_x(side, 0), col_x(side, 2)
    it = [h, d.text(lx, y, span_w(2), 22, [P('DB Subhead Accent', 'On the plan')]), d.text(rx2, y, span_w(2), 22, [P('DB Subhead Accent', 'On the ground, 25 February 2025')])]
    y += 28
    it.append(d.rect(lx, y, span_w(2) - 40, 80, 'Rain Monsoon'))
    it.append(d.text(lx + 14, y + 14, span_w(2) - 68, 60, [P('DB Label White', 'Water Sheet'), P('DB Small White', 'The whole study frame is one category.')]))
    o, _ = b.img(lx, y + 90, span_w(2) - 40, 7 * 25 - 90, 'plan_part')
    it += o
    obs = [('Water', 'Water', 'open water across most of the frame'), ('Mangrove canopy', 'Mangrove canopy', 'six patches on the central bed'),
           ('Bed ground', 'Bed ground', 'exposed on 13 of the 17 dates'), ('Muddy shallows', 'Muddy shallows', 'traced on 5 of the 17 dates'),
           ('Land edge', 'Land edge', 'a line that moves between dates'), ('Boats', 'Boats', '27 boats along the water\'s edge'), ('Cage farms', 'Cage farms', '9 shellfish-farming areas offshore')]
    for k, (col, nm, note) in enumerate(obs):
        oy = y + k * 25
        it.append(d.rect(rx2, oy + 3, 14, 14, col))
        it.append(d.text(rx2 + 24, oy, span_w(2) - 24, 22, [('DB Small', [(nm + ':  ', {'bold': True}), (note, {})])]))
    y += 7 * 25 + 14
    it.append(d.text(col_x(side, 0), y, CW, BODY_BOTTOM - y, [
        P('DB Body', 'On the plan, the whole of the study frame falls inside the Water Sheet category. On the ground, the same area holds water, a mangrove canopy, a mud island whose bed is exposed on most dates, muddy shallows, a moving land edge and a working shore with boats and cage farms. A single category hides all of this.'),
        P('DB Body', 'The paper Aquapelagic Entanglements in the Panchagangavali Region by Deepta Sateesh and Vigna Priya Adhanki supports this reading. It reports that the plan shows new infrastructure along the water around Kundapura town and argues that its four categories leave no room for the zones between land and water.')], cols=2))
    it += b.folio(side, n)
    b.add(it)

    # ================================================================ 05 RELAXATION
    b.title_page('05', 'Relaxation', 'The idea of algorithmic relaxation, why it suits a wetland and how it shapes the maps and the website.', 'f_0902_172452')
    side, n = b.side, b.num
    h, y = b.head(side, 'Algorithmic relaxation', 'Loosening a strict rule')
    tp = [P('DB Body', 'From the book Algorithms to Live By by Brian Christian and Tom Griffiths, I took the idea of relaxation. In computing, a problem with a strict rule can be very hard to solve. Relaxation loosens the rule into a trade-off so that a workable answer can be found. A yes or no becomes a matter of degree.'),
          P('DB Body', 'This fits the estuary closely. The Master Plan treats marshy ground and water as two strict categories. The estuary does not behave like that. A patch of ground can be water on one date and exposed mud on another. Instead of asking whether a place is water or land, I ask how often it was seen as water, as bed ground or as mangrove canopy across the dates.')]
    th = measure(tp, CW) + 2
    it = [h, d.text(col_x(side, 0), y, CW, th, tp)]
    y += th + 16
    lx, rx2 = col_x(side, 0), col_x(side, 2)
    it.append(d.text(lx, y, span_w(2), 22, [P('DB Subhead Accent', 'A strict rule')]))
    it.append(d.text(rx2, y, span_w(2), 22, [P('DB Subhead Accent', 'A relaxed rule')]))
    y += 30
    it.append(d.rect(lx, y, span_w(1), 44, 'Water'))
    it.append(d.rect(lx + span_w(1), y, span_w(1) + GUT, 44, 'Bed ground'))
    for k in range(17):
        cx = rx2 + 8 + k * (span_w(2) - 16) / 16
        it.append(d.oval(cx, y + 22, 8, 'Water', tint=int(12 + 88 * k / 16) if k < 16 else None))
    sp = [P('DB Small', 'Every place is either water or land. The line between them is drawn once.')]
    rp = [P('DB Small', 'Each place is water on some of the 17 dates. The answer is a share, from never to every date.')]
    sh = max(measure(sp, span_w(2)), measure(rp, span_w(2))) + 4
    it.append(d.text(lx, y + 54, span_w(2), sh, sp))
    it.append(d.text(rx2, y + 54, span_w(2), sh, rp))
    y += 54 + sh + 14
    it.append(d.text(col_x(side, 0), y, CW, BODY_BOTTOM - y, [P('DB Body', 'This turns a hard boundary into a gradient. It explains why I chose to record where something was seen and how often, and not to give each place one permanent label. It is the idea behind Map 2.')]))
    it += b.folio(side, n)
    b.add(it)

    side, n = b.side, b.num
    h, y = b.head(side, 'Relaxation in practice', 'From traces to a share of dates')
    it = [h]
    steps = [('Trace', 'Every date is traced by hand into classes.'), ('Grid', 'The frame is cut into cells of 1.5 by 1.5 metres.'),
             ('Count', 'For each cell, count the dates it was traced as water.'), ('Share', 'Divide by the dates that covered the cell.'),
             ('Band', 'Group the shares into eight bands of 12.5%.')]
    sw = (CW - 4 * 12) / 5
    sps = [[P('DB Label Accent', f'{k + 1}  {a}'), P('DB Small', t)] for k, (a, t) in enumerate(steps)]
    shh = max(measure(s, sw - 20) for s in sps) + 22
    for k in range(5):
        sx_ = col_x(side, 0) + k * (sw + 12)
        it.append(d.rect(sx_, y, sw, shh, 'WIT Accent', tint=12 if k % 2 else 22))
        it.append(d.text(sx_ + 10, y + 10, sw - 20, shh - 14, sps[k]))
    y += shh + 14
    tp = [P('DB Body', 'I wrote a short Python script to do the counting for Map 2, because the count runs over thousands of cells and seventeen dates. The script only produces the numbers. I designed and made the map itself in QGIS.')]
    th = measure(tp, CW) + 2
    it.append(d.text(col_x(side, 0), y, CW, th, tp))
    y += th + 4
    it.append(d.text(col_x(side, 0), y, CW, 22, [P('DB Subhead Accent', 'How much counts as water depends on the rule')]))
    y += 28
    ar = PTS['persistence']['water_area_by_threshold_m2']
    note = [P('DB Small', f'Water on at least 1 of 17 dates: {ar["1"]:,.0f} m². Water on all 17 dates: {ar["17"]:,.0f} m². Each bar is one rule, from at least 1 date on the left to all 17 on the right.')]
    nh = measure(note, CW) + 4
    ch = BODY_BOTTOM - y - nh - 6
    bw = (CW - 16 * 4) / 17
    mx = max(ar.values())
    for k in range(1, 18):
        v = ar[str(k)]
        hh = ch * v / mx
        bx_ = col_x(side, 0) + (k - 1) * (bw + 4)
        it.append(d.rect(bx_, y + ch - hh, bw, hh, 'Water', tint=int(30 + 70 * k / 17) if k < 17 else None))
    it.append(d.text(col_x(side, 0), y + ch + 6, CW, nh, note))
    it += b.folio(side, n)
    b.add(it)

    side, n = b.side, b.num
    h, y = b.head(side, 'What relaxation reveals', 'A large changing zone, a small fixed core')
    it = [h]
    rows = [('Water', '668', '18,884', '19,552'), ('Mangrove canopy', '0', '3,069', '3,069'), ('Exposed sediment', '0', '17,359', '17,359')]
    for j, t in enumerate(['Every date (m²)', 'Changes between dates (m²)', 'At least one date (m²)']):
        it.append(d.text(col_x(side, 1 + j), y, COLW, 40, [P('DB Label', t)]))
    y += 44
    for k, (nm, a, c, e) in enumerate(rows):
        ry_ = y + k * 56
        it.append(d.line(col_x(side, 0), ry_, col_x(side, 3) + COLW, ry_, 'WIT Accent', 0.75))
        it.append(d.text(col_x(side, 0), ry_ + 6, COLW, 54, [P('DB Heading', nm)]))
        for j, v in enumerate((a, c, e)):
            it.append(d.text(col_x(side, 1 + j), ry_ + 6, COLW, 48, [P('DB Big Figure', v)]))
    y += 3 * 56 + 8
    it.append(d.text(col_x(side, 0), y, CW, BODY_BOTTOM - y, [
        P('DB Body', 'Across the study rectangle, only 668 square metres were water on every one of the seventeen dates. Almost all of the rest moves between classes. No cell was mangrove canopy or exposed sediment on every date. The zone that changes is far larger than the zone that stays the same, and it is exactly this zone that a fixed category cannot describe.'),
        P('DB Body', 'On the website the same idea becomes a slider. The visitor chooses how many of the 17 dates a place must be water to count as water, and watches the area change from 19,058 to 799 square metres.')], cols=2))
    it += b.folio(side, n)
    b.add(it)

    # ================================================================ 06 RESEARCH AND DATA
    b.title_page('06', 'Research and Data', 'What was read, which sources were checked and why Google Earth Pro became the main source of evidence.', 'f_0831_072213')
    b.text_page('Research', 'Reading, fieldwork and imagery', [
        P('DB Subhead Accent', 'Reading'),
        P('DB Body', 'The reading covered the Master Plan sheet, the paper by Sateesh and Adhanki and the book by Christian and Griffiths. For background, I also read parts of the Ramsar country profile for India, the Wetlands International page on valuing wetlands and the Global Mangrove Watch data. These explain how wetlands are described and valued, but they work at a national or global scale and say little about this coast.'),
        P('DB Subhead Accent', 'Fieldwork and conversations'),
        P('DB Body', 'Field visits and conversations with people who work on the estuary shaped the classes. They explained the seasonal rhythm of fishing and shell collection and the way shellfish-farming areas are marked in the water.'),
        P('DB Subhead Accent', 'The imagery'),
        P('DB Body', 'The main evidence is a set of dated satellite images from Google Earth Pro covering 2011 to 2025. Most years have one image and a few have two or three. They were taken at random points in the year and none fall in the monsoon. The seasonal pattern is therefore hard to see, and a difference between two images may come from the season or the tide and not from a real change.'),
        P('DB Subhead Accent', 'Rainfall'),
        P('DB Body', 'Because the imagery cannot show the monsoon, I added daily rainfall from NASA POWER so that each observation could be read against the rain that came before it. This became Map 6.'),
    ], cols=2)

    side, n = b.side, b.num
    h, y = b.head(side, 'Sources checked', 'Where else the data could have come from')
    it = [h]
    cards = [('USGS EarthExplorer', 'Offers GeoTIFF files for automated classification. Not used, because a fixed pixel classification is what the project questions.', 'Not used'),
             ('Copernicus and Sentinel Hub', 'Regular coverage, but the pixels are too coarse to show boats, the edge of the mangrove canopy and the buildings.', 'Not used'),
             ('Bhuvan', 'Explored for imagery and tools. It did not give the same run of dated images of one frame.', 'Not used'),
             ('NASA blogs and SOAR Atlas', 'Useful for understanding how coastal change is seen from space. No imagery of this site.', 'Context'),
             ('Ramsar, Wetlands International, Global Mangrove Watch', 'Background on wetlands and mangrove extent at national and global scale.', 'Context'),
             ('Tides Atlas and Tides4Fishing', 'Kundapur tide forecasts for the coming days only. No historical records.', 'Not usable'),
             ('FES2022 (AVISO)', 'A global tide model for the open coast. Needs registration and cannot give the tide at an image\'s capture time.', 'Not usable'),
             ('NASA POWER rainfall', 'Open daily rainfall with no account needed. A complete record for the site. Used for Map 6.', 'Used')]
    cw = (CW - 3 * 12) / 4
    chh = (BODY_BOTTOM + 4 - y - 12) / 2
    for k, (t, desc, verdict) in enumerate(cards):
        r, c = divmod(k, 4)
        cx, cy = col_x(side, 0) + c * (cw + 12), y + r * (chh + 12)
        used = verdict == 'Used'
        it.append(d.rect(cx, cy, cw, chh, 'WIT Accent', tint=None if used else 10))
        it.append(d.text(cx + 9, cy + 8, cw - 18, chh - 10, [P('DB Kicker White' if used else 'DB Kicker', verdict), P('DB Label White' if used else 'DB Label', t), P('DB Small White' if used else 'DB Small', desc)]))
    it += b.folio(side, n)
    b.add(it)

    b.text_page('Why Google Earth Pro', 'The right tool, with clear limits', [
        P('DB Subhead Accent', 'Why it was used'),
        P('DB Bullet', 'It gives dated images of the same ground over many years and lets me move between them with a time slider.'),
        P('DB Bullet', 'I could draw one fixed polygon around the study area, including the mangroves, so that every date covers the same ground.'),
        P('DB Bullet', 'It let me trace by hand, which keeps each decision visible and lets me note where the imagery is unclear.'),
        P('DB Bullet', 'Its traces export as KML files, which load straight into QGIS with their position already set.'),
        P('DB Subhead Accent', 'Its limits'),
        P('DB Bullet', 'It cannot export its imagery as georeferenced files, so everything has to be traced by hand.'),
        P('DB Bullet', 'It does not show the tide level or the time an image was taken. In my date log every image is listed at 5:30 AM, which is midnight UTC shown in Indian time and not a real capture time.'),
        P('DB Bullet', 'Its historical imagery is joined from separate captures, so seams appear and some tiles show exposed mud while others show water.'),
        P('DB Bullet', 'The earlier images are lower in resolution in places, which makes the edge of the mangroves harder to read.'),
    ], cols=2)

    # ================================================================ 07 GAPS
    b.title_page('07', 'Gaps in the Record', 'Why tide data, cyclone data and monsoon images are not part of the maps, and what that means for reading them.', 'f_0831_072659')
    side, n = b.side, b.num
    h, y = b.head(side, 'Tide', 'Why tide data was not used')
    tp = [
        P('DB Body', 'Tide is central to this estuary. Ground that is water at high tide can be mud a few hours later. Ideally each satellite image would carry the tide level at the moment it was taken. I looked for this in several places.'),
        P('DB Subhead Accent', 'Tides Atlas and Tides4Fishing.'),
        P('DB Body', 'Both give tide forecasts for Kundapur, but only for the next few days. Neither keeps historical records.'),
        P('DB Subhead Accent', 'Tide gauges.'),
        P('DB Body', 'There is no public tide gauge at Kundapur. The nearest long records, at Karwar and Mangalore, are published only as monthly averages, which cannot show the tide on a given day.'),
        P('DB Subhead Accent', 'FES2022.'),
        P('DB Body', 'This global tide model can predict the tide on the open coast for any time. It needs a registration, and it does not resolve the narrow channels of the estuary.'),
        P('DB Subhead Accent', 'Capture time.'),
        P('DB Body', 'Google Earth Pro gives the date of each image but not the time. A tide prediction needs the hour and minute, and the tide changes every few hours.'),
        P('DB Body', 'Any tide value attached to an image would therefore be invented. I chose to leave the tide unknown and to say so on every map. A difference between two dates is read as a difference between observations, which may be partly tidal, and not as a proven change.'),
    ]
    b.mark('Gaps in the record')
    it = [h, d.text(col_x(side, 0), y, CW, BODY_BOTTOM - y, tp, cols=2)]
    it += b.folio(side, n)
    b.add(it)

    side, n = b.side, b.num
    h, y = b.head(side, 'Cyclones', 'Why cyclone data was not used')
    it = [h, d.text(col_x(side, 0), y, span_w(2), BODY_BOTTOM - y, [
        P('DB Body', 'I studied storm activity in the North Indian Ocean between 2010 and 2025 using the International Best Track Archive for Climate Stewardship, kept by NOAA. It brings the records of the different agencies, including the India Meteorological Department, into one file.'),
        P('DB Body', 'I kept only the storms whose track came within 500 km of Kundapur and grouped them by wind strength on the IMD scale. I then checked which storms passed in the 30 days before each of my seventeen dates.'),
        P('DB Body', 'Only one did. Cyclone Maha passed about 206 km away before the image of 26 November 2019. With one case, storms cannot explain the differences between dates, so cyclone data was not carried into the six maps.'),
    ])]
    mw = span_w(2)
    cap = 'Cyclones and Storms Around the Estuary. A study map made to test the storm data. It was not carried into the final set.'
    chh = measure([P('DB Caption', cap)], mw) + 4
    mh = BODY_BOTTOM + 4 - y - chh - 4
    o, _ = b.img(col_x(side, 2), y, mw, mh, 'map7', cap, mode='fit', cap_h=chh)
    it += o + b.folio(side, n)
    b.add(it)

    side, n = b.side, b.num
    h, y = b.head(side, 'The monsoon', 'Why there are no monsoon images')
    tp = [P('DB Body', 'From June to September the monsoon brings heavy rain and thick cloud to this coast. In Google Earth Pro, every image from these months was either missing or hidden by cloud. All seventeen usable dates fall between November and May. The wetland at its fullest, which is probably the most important season for the estuary, is missing from the record. The chart places every traced date in its month.')]
    th = measure(tp, CW) + 2
    it = [h, d.text(col_x(side, 0), y, CW, th, tp)]
    y += th + 14
    months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    mwid = CW / 12
    gh = BODY_BOTTOM - y - 48
    it.append(d.rect(col_x(side, 0) + 5 * mwid, y, 4 * mwid, gh, 'WIT Accent'))
    it.append(d.text(col_x(side, 0) + 5 * mwid + 10, y + 10, 4 * mwid - 20, 60, [P('DB Label White', 'Monsoon'), P('DB Small White', 'No usable image')]))
    per = {}
    for dd in MAN['dates']:
        per.setdefault(int(dd['iso'][5:7]), []).append(dd['iso'])
    for mi in range(12):
        mx_ = col_x(side, 0) + mi * mwid
        it.append(d.line(mx_, y, mx_, y + gh, 'Grey Line', 0.5))
        it.append(d.text(mx_ + 4, y + gh + 6, mwid - 6, 20, [P('DB Label', months[mi])]))
        for k, iso in enumerate(sorted(per.get(mi + 1, []))):
            it.append(d.oval(mx_ + mwid / 2, y + gh - 16 - k * 26, 9, 'Water'))
    it.append(d.text(col_x(side, 0), y + gh + 28, CW, 20, [P('DB Small', 'Each circle is one traced date, placed in its month. December to February holds most of them.')]))
    it += b.folio(side, n)
    b.add(it)

    # ================================================================ 08 DATES
    b.title_page('08', 'Choosing the Dates', 'Which images were traced, which were removed and why a smaller set of clear dates was preferred.', 'f_0902_173620')
    side, n = b.side, b.num
    h, y = b.head(side, 'The date log', 'Seventeen of twenty-two')
    tp = [P('DB Body', 'I logged every date that Google Earth Pro offered for the study frame and marked each one as usable, cloudy or missing. This came to 22 dates between 2011 and 2025. Seventeen were chosen for tracing and five were removed. There was no image at all for 2012, and the only image from 2023 was removed. A removed date is treated as a gap and never as a date with no water or no change.')]
    th = measure(tp, CW) + 2
    it = [h, d.text(col_x(side, 0), y, CW, th, tp)]
    y += th + 12
    traced = [dd['iso'] for dd in MAN['dates']]
    removed = ['2019-05-17', '2021-04-04', '2021-05-05', '2023-12-18', '2024-02-22']
    yrs = list(range(2011, 2026))
    yw = CW / len(yrs)
    ty = y + 84
    it.append(d.line(col_x(side, 0), ty, col_x(side, 0) + CW, ty, 'Black', 1))
    for k, yr in enumerate(yrs):
        x = col_x(side, 0) + k * yw
        it.append(d.line(x, ty - 4, x, ty + 4, 'Black', 1))
        it.append(d.text(x + 1, ty + 8, yw, 20, [P('DB Small', str(yr))]))
        if yr == 2012:
            it.append(d.rect(x + 1, ty - 76, yw - 2, 72, 'Grey Line', tint=25))
            it.append(d.text(x + 4, ty - 72, yw - 6, 40, [P('DB Small', 'no image')]))

    def xpos(iso):
        yr, mo, da = int(iso[:4]), int(iso[5:7]), int(iso[8:10])
        return col_x(side, 0) + (yr - 2011 + (mo - 1) / 12 + (da - 1) / 365) * yw
    stack = {}
    for iso in sorted(traced + removed):
        x = xpos(iso)
        key = round(x / 13)
        lvl = stack.get(key, 0)
        stack[key] = lvl + 1
        cy = ty - 14 - lvl * 19
        if iso in removed:
            it.append(d.oval(x, cy, 7, None, stroke='Cage farms', sw=1.6))
            it.append(d.line(x - 5, cy - 5, x + 5, cy + 5, 'Cage farms', 1.6))
        else:
            it.append(d.oval(x, cy, 7, 'Water'))
    y = ty + 36
    for k, (col, lab_) in enumerate([('Water', 'Traced (17)'), ('Cage farms', 'Removed (5)'), ('Grey Line', 'No image that year')]):
        lx = col_x(side, 0) + k * 180
        if k == 1: it.append(d.oval(lx + 7, y + 9, 7, None, stroke='Cage farms', sw=1.6))
        else: it.append(d.oval(lx + 7, y + 9, 7, col, tint=25 if k == 2 else None))
        it.append(d.text(lx + 22, y, 150, 20, [P('DB Small', lab_)]))
    y += 34
    it.append(d.text(col_x(side, 0), y, CW, BODY_BOTTOM - y, [P('DB Subhead Accent', 'A date was removed if'),
        P('DB Bullet', 'cloud, haze or blur hid the classes'), P('DB Bullet', 'a seam between image tiles crossed the frame'), P('DB Bullet', 'the resolution was too low to trace'),
        P('DB Bullet', 'there was no image of the frame on that date'), P('DB Bullet', 'the frame mixed captures from different days, which would mix tide, season and year in one trace')], cols=2))
    it += b.folio(side, n)
    b.add(it)

    side, n = b.side, b.num
    h, y = b.head(side, 'Removed dates', 'The five dates that were not traced')
    it = [h]
    cols_, gw = 3, (CW - 2 * GUT) / 3
    shots = [('miss_17_5_19', '17 May 2019'), ('miss_4_4_21', '4 April 2021'), ('miss_5_5_21', '5 May 2021'), ('miss_18_12_23', '18 December 2023'), ('miss_22_2_24', '22 February 2024')]
    ch = 24
    gh = (BODY_BOTTOM + 4 - y - 12) / 2 - ch
    for k, (key, cap) in enumerate(shots):
        r, c = divmod(k, 3)
        o, _ = b.img(col_x(side, 0) + c * (gw + GUT), y + r * (gh + ch + 12), gw, gh, key, cap, cap_h=ch - 4)
        it += o
    it.append(d.text(col_x(side, 0) + 2 * (gw + GUT), y + gh + ch + 12, gw, gh + ch, [
        P('DB Body', 'These are the views of the five removed dates as they appear in Google Earth Pro. In each one, haze, blur, low contrast or a mixed capture made the edges between classes too uncertain to trace honestly.'),
        P('DB Body', 'A guessed trace would show image quality, not the estuary.')]))
    it += b.folio(side, n)
    b.add(it)

    side, n = b.side, b.num
    h, y = b.head(side, 'The traced dates', 'Seventeen observations, 2011 to 2025')
    it = [h]
    cols_, rows_ = 6, 3
    gw = (CW - (cols_ - 1) * 10) / cols_
    gh = (BODY_BOTTOM + 4 - y - (rows_ - 1) * 8) / rows_ - 22
    for k, dd in enumerate(MAN['dates']):
        r, c = divmod(k, cols_)
        px_, py_ = col_x(side, 0) + c * (gw + 10), y + r * (gh + 30)
        it.append(d.image(px_, py_, gw, gh, link('date_' + dd['id'])))
        it.append(d.text(px_, py_ + gh + 2, gw, 20, [P('DB Label', fmt_date(dd['iso']))]))
    px_, py_ = col_x(side, 0) + 5 * (gw + 10), y + 2 * (gh + 30)
    it.append(d.text(px_, py_, gw, gh + 22, [P('DB Small', 'Every image shows the same frame.')]))
    it += b.folio(side, n)
    b.add(it)

    # ================================================================ 09 CLASSIFICATION
    b.title_page('09', 'Classifying the Estuary', 'The ten classes, how each one was traced in Google Earth Pro and how QGIS turns the traces into map symbols.', 'f_0902_174459')

    def class_cards(side, y, cls, bottom, cols):
        rows = (len(cls) + cols - 1) // cols
        cw = (CW - (cols - 1) * 12) / cols
        chh = (bottom - y - (rows - 1) * 12) / rows
        out = []
        for k, (nm, shape, defi) in enumerate(cls):
            r, c = divmod(k, cols)
            cx, cy = col_x(side, 0) + c * (cw + 12), y + r * (chh + 12)
            out.append(d.rect(cx, cy, cw, chh, 'WIT Accent', tint=8))
            if shape == 'Polygon': out.append(d.rect(cx + 12, cy + 12, 30, 20, nm))
            elif shape == 'Line': out.append(d.line(cx + 12, cy + 22, cx + 42, cy + 22, nm, 4))
            else: out.append(d.oval(cx + 22, cy + 22, 10, nm))
            out.append(d.text(cx + 12, cy + 40, cw - 24, chh - 44, [P('DB Label', nm), ('DB Small', [(shape + '.  ', {'bold': True, 'colour': 'WIT Accent'}), (defi, {})])]))
        return out

    side, n = b.side, b.num
    h, y = b.head(side, 'Classes', 'Seven classes for the estuary')
    tp = [P('DB Body', 'Before tracing, I separated what is physically visible from what is a mapped class. Each class has one definition, one shape type and one colour, and it is applied the same way on every date.')]
    th = measure(tp, CW) + 2
    it = [h, d.text(col_x(side, 0), y, CW, th, tp)]
    y += th + 8
    it += class_cards(side, y, [('Water', 'Polygon', 'The water surface visible on that date.'),
           ('Muddy shallows', 'Polygon', 'Muddy ground in shallow water, not clearly exposed.'),
           ('Bed ground', 'Polygon', 'Exposed sediment or estuary bed. Sediment under water counts as water.'),
           ('Mangrove canopy', 'Polygon', 'The visible canopy only, not the full habitat or roots.'),
           ('Land edge', 'Line', 'The visible boundary between land and water or exposed bed.'),
           ('Boats', 'Point', 'Each boat visible on that date.'),
           ('Cage farms', 'Point', 'Shellfish-farming areas marked in the water.')], BODY_BOTTOM + 4, 4)
    it += b.folio(side, n)
    b.add(it)

    side, n = b.side, b.num
    h, y = b.head(side, 'Classes', 'Three classes for the shoreline')
    tp = [P('DB Body', 'For the shoreline and settlement map, three more classes were traced on two dates, 11 April 2011 and 25 February 2025. These dates were chosen because they are the earliest and latest in the record and the shore is clear in both.')]
    th = measure(tp, CW) + 2
    it = [h, d.text(col_x(side, 0), y, CW, th, tp)]
    y += th + 8
    it += class_cards(side, y, [('Tree cover', 'Polygon', 'The visible band of canopy behind the track, mostly palms.'),
            ('Track', 'Polygon', 'The reddish unpaved strip along the shore, traced as an area.'),
            ('Buildings', 'Polygon', 'Roofs or walls that can be seen, so the count is a minimum.')], y + 150, 3)
    y += 164
    it.append(d.text(col_x(side, 0), y, CW, BODY_BOTTOM - y, [
        P('DB Body', 'I traced the track as a polygon and not a line because it is wide enough to show its real extent and how close it sits to the water and the buildings. Buildings were traced as polygons in Google Earth Pro but are drawn as point symbols in QGIS, because they are small and their outlines are often hidden by palm canopy.'),
        P('DB Body', 'Each item was named by class and date, for example water_2025_02_25 or tree_cover_2011_04_11. These names matter, because QGIS uses them to apply the class symbols.')], cols=2))
    it += b.folio(side, n)
    b.add(it)

    side, n = b.side, b.num
    h, y = b.head(side, 'Google Earth Pro and QGIS', 'How a trace becomes a classified map')
    it = [h]
    flow = [('Google Earth Pro', 'One folder per date. Each drawing is a placemark with a name such as bed_ground_2022_05_07 and a colour picked by hand.'),
            ('KML file', 'Each folder is saved as KML. It keeps the shape, position and name of every drawing, but no class field and no style that QGIS reads.'),
            ('QGIS layers', 'Each date loads as three layers, one each for polygons, lines and points, in WGS 84 / UTM zone 43N.'),
            ('Rule-based styles', 'A rule reads each name. If the name contains water, the shape is drawn as Water. The same rules run on every date.')]
    fw = (CW - 3 * 26) / 4
    fps = [[P('DB Label Accent', a), P('DB Small', t)] for a, t in flow]
    fh = max(measure(f, fw - 20) for f in fps) + 24
    for k in range(4):
        fx = col_x(side, 0) + k * (fw + 26)
        it.append(d.rect(fx, y, fw, fh, 'WIT Accent', tint=12))
        it.append(d.text(fx + 10, y + 10, fw - 20, fh - 14, fps[k]))
        if k < 3: it.append(d.line(fx + fw + 4, y + fh / 2, fx + fw + 22, y + fh / 2, 'WIT Accent', 2, arrow=True))
    y += fh + 18
    it.append(d.text(col_x(side, 0), y, span_w(2), BODY_BOTTOM - y, [
        P('DB Subhead Accent', 'What changes between the two'),
        P('DB Body', 'In Google Earth Pro a class exists only as a name and a colour on each drawing. In QGIS the class is applied by rules that read the name, so the same symbol appears on every date and every map. QGIS also adds textures that the KML files never had: a dotted pattern for bed ground, crowns for the mangrove canopy and a fine line pattern for water.')]))
    it.append(d.text(col_x(side, 2), y, span_w(2), BODY_BOTTOM - y, [
        P('DB Subhead Accent', 'New layers made in QGIS'),
        P('DB Bullet', 'A traced frame for every date, so the extent of each observation is shown.'),
        P('DB Bullet', 'Three persistence layers for Map 2, styled in eight graduated bands of 12.5%.'),
        P('DB Bullet', 'A cleaned layer with proper fields, because layers loaded straight from KML could not take new fields.')]))
    it += b.folio(side, n)
    b.add(it)

    # ================================================================ 10 WORKFLOW
    b.title_page('10', 'Workflow', 'The steps from a satellite image to a finished map, and the prototypes and edits along the way.', 'f_0901_134354')
    side, n = b.side, b.num
    h, y = b.head(side, 'Workflow', 'From Google Earth Pro to QGIS')
    it = [h]
    steps = [('Set the frame', 'One fixed polygon around the study area, including the mangroves.'),
             ('Log the dates', 'Every image marked usable, cloudy or missing.'),
             ('Trace each date', 'One folder per date, each class with its own shape.'),
             ('Trace the shore', 'Tree cover, track and buildings for 2011 and 2025.'),
             ('Export', 'Each folder saved as a KML file named by date.'),
             ('Load and clean', 'Layers loaded in QGIS, one stray point removed from a 2024 outline.'),
             ('Project and style', 'WGS 84 / UTM zone 43N, one symbol per class.'),
             ('Make the maps', 'A3 layouts with the same border, fonts, scale bar and legend.')]
    cw = (CW - 3 * 16) / 4
    tps = [[P('DB Label', a), P('DB Small', t)] for a, t in steps]
    th = max(measure(t, cw) for t in tps) + 4
    note = [P('DB Body', 'A first test with two dates, February 2024 and February 2025, let me check the whole process before tracing the full set. Where an edge was unclear, I made a best estimate and noted it beside that trace.')]
    nh = measure(note, CW) + 4
    rowh = (BODY_BOTTOM - y - nh - 10) / 2
    for k, (a, t) in enumerate(steps):
        r, c = divmod(k, 4)
        cx, cy = col_x(side, 0) + c * (cw + 16), y + r * rowh
        it.append(d.oval(cx + 18, cy + 18, 18, 'WIT Accent'))
        it.append(d.text(cx + 6, cy + 9, 24, 18, [P('DB Label White Center', str(k + 1))]))
        if c < 3: it.append(d.line(cx + 42, cy + 18, cx + cw + 10, cy + 18, 'WIT Accent', 1))
        it.append(d.text(cx, cy + 46, cw, th, tps[k]))
    it.append(d.text(col_x(side, 0), y + 2 * rowh + 6, CW, nh, note))
    it += b.folio(side, n)
    b.add(it)

    # timeline across the middle of the page, cards above and below
    side, n = b.side, b.num
    h, y = b.head(side, 'Prototypes and edits', 'How the project changed shape')
    it = [h]
    its = [('Narrowing', 'From 20 years and several sites to one frame and 2011 to 2025.'),
           ('Tracing method', 'From one box polygon to separate classes and one folder per date.'),
           ('Two-date test', 'February 2024 and February 2025 traced first to test the process.'),
           ('Map style mock-ups', 'Persistence, change and textured paper versions. The textured style was kept.'),
           ('Map layouts', 'Every map on the same A3 page, with alignment fixes and fewer notes.'),
           ('Map 4 reframed', 'Cropped to the shoreline strip, with a locator image and richer symbols.'),
           ('Adding rainfall', 'Map 6 added to stand in for the missing monsoon.'),
           ('The website', 'From a pixelated scroll page to a full 3D journey.')]
    cw = COLW
    thumbs = ['frame_op3', 'date_2024_02_17', 'date_2025_02_25', 'map2', 'map1', 'map4', 'map6', 'web_map1_layers']
    cards = [[P('DB Label Accent', f'{k + 1}  {a}'), P('DB Small', t)] for k, (a, t) in enumerate(its)]
    top_h = max(measure(cards[k], cw) for k in range(0, 8, 2)) + 4
    bot_h = max(measure(cards[k], cw) for k in range(1, 8, 2)) + 4
    # one band of pictures above, one below, the same height on both sides of the line
    band = (BODY_BOTTOM + 4 - y - top_h - bot_h - 2 * (26 + 10) - 2 * 10) / 2
    ly = y + band + 10 + top_h + 26
    it.append(d.line(col_x(side, 0), ly, col_x(side, 0) + CW, ly, 'WIT Accent', 2))
    for k in range(8):
        cx = col_x(side, k // 2)
        x = cx + (COLW * 0.25 if k % 2 == 0 else COLW * 0.75)
        it.append(d.oval(x, ly, 8, 'WIT Accent'))
        if k % 2 == 0:
            it.append(d.line(x, ly - 8, x, ly - 22, 'WIT Accent', 1))
            it.append(d.text(cx, ly - 26 - top_h, cw, top_h, cards[k]))
            it.append(d.image(cx, y, cw, band, link(thumbs[k])))
        else:
            it.append(d.line(x, ly + 8, x, ly + 22, 'WIT Accent', 1))
            it.append(d.text(cx, ly + 26, cw, bot_h, cards[k]))
            it.append(d.image(cx, ly + 26 + bot_h + 10, cw, band, link(thumbs[k])))
    it += b.folio(side, n)
    b.add(it)

    side, n = b.side, b.num
    h, y = b.head(side, 'Tools and data', 'What each tool was used for')
    it = [h]
    tools = [('Google Earth Pro', 'Dated satellite imagery, hand tracing and KML export.'), ('QGIS 3.44', 'Loading and cleaning the traces, measuring areas, styling and making the six map layouts.'),
             ('WGS 84 / UTM zone 43N', 'A projection in metres that keeps the maps north-up.'), ('Esri World Imagery', 'Satellite base and context on Map 1. Not from the observation date.'),
             ('Python', 'Counting the persistence of each class for Map 2 and the rainfall totals for Map 6.'), ('NASA POWER', 'Daily rainfall for the study site, used for Map 6.'),
             ('Master Plan 2031, Drawing No. 2', 'The planning categories compared in Map 5.'), ('Three.js, GSAP and Vite', 'The website, its 3D scenes and its scroll-driven story.')]
    cw = (CW - GUT) / 2
    rh = (BODY_BOTTOM - y) / 4
    for k, (t, u) in enumerate(tools):
        r, c = divmod(k, 2)
        cx, cy = col_x(side, 0) + c * (cw + GUT), y + r * rh
        it.append(d.line(cx, cy, cx + cw, cy, 'WIT Accent', 0.75))
        it.append(d.text(cx, cy + 10, 140, rh - 12, [P('DB Label Accent', t)]))
        it.append(d.text(cx + 150, cy + 10, cw - 150, rh - 12, [P('DB Small', u)]))
    it += b.folio(side, n)
    b.add(it)

    # ================================================================ 11 THE SIX MAPS
    b.title_page('11', 'The Six Maps', 'Each map answers one question. Each is shown across a left page with its explanation beside it.', 'f_0902_174513')
    side, n = b.side, b.num
    h, y = b.head(side, 'Why six maps', 'One question per map')
    tp = [P('DB Body', 'No single map can describe a place that changes. A map of the water alone would hide the mangroves, a map of one date would hide the movement and the plan would hide what is on the ground. The project therefore uses six maps, read in order, each answering one question.')]
    th = measure(tp, CW) + 2
    it = [h, d.text(col_x(side, 0), y, CW, th, tp)]
    y += th + 10
    mq = [('1', 'The Estuary as a Landscape', 'What is this place physically?'), ('2', 'Patterns of Wetness and Vegetation', 'Where does each class stay, and where does it vary?'),
          ('3', 'The Estuary Through Time', 'How did the visible patterns differ between dates?'), ('4', 'The Estuary as a Lived Landscape', 'How does the shore relate to human activity?'),
          ('5', 'The Estuary Between Plan and Ground', 'How does the plan compare with what was observed?'), ('6', 'The Estuary and the Monsoon', 'How wet was the season before each date?')]
    cw = (CW - 5 * 10) / 6
    # the student's spacing inside the boxes: a line break before and after each map name
    boxes = [[P('DB Big Figure White' if k >= 4 else 'DB Big Figure', num), P('DB Label White' if k >= 4 else 'DB Label', ' ' + t + ' '), P('DB Small White' if k >= 4 else 'DB Small', q)] for k, (num, t, q) in enumerate(mq)]
    bh = max(measure(bx_, cw - 16) for bx_ in boxes) + 16
    for k in range(6):
        cx = col_x(side, 0) + k * (cw + 10)
        it.append(d.rect(cx, y, cw, bh, 'WIT Accent', tint=10 + k * 15 if k < 5 else None))
        it.append(d.text(cx + 8, y + 8, cw - 16, bh - 12, boxes[k]))
    y += bh + 10
    it.append(d.text(col_x(side, 0), y, CW, BODY_BOTTOM + 4 - y, [
        P('DB Body', 'All six share one A3 layout, legend and scale bar, and each class keeps one colour and texture throughout.')]))
    it += b.folio(side, n)
    b.add(it)

    b.map_spread('map1', 1, 'The Estuary as a Landscape', [
        ('What it shows?', 'Map 1 shows the study frame on 25 February 2025, the clearest of the seventeen dates. Water, muddy shallows, bed ground and the mangrove canopy are drawn as textured areas over a satellite base. The land edge is a line, and boats and cage farms are points. A dashed white line marks the edge of the traced frame, and an inset places the frame between the river, the town and the coast.'),
        ('Why it was made?', 'It introduces the place before any comparison is made. It sets out every class with its colour and texture, so that the same symbols can be recognised in all the maps that follow.'),
        ('What it reveals?', ['- Water covers about 32,655 square metres of the frame, and no bed ground is exposed on this date.',
                              '- The mangrove canopy forms six patches on the central bed, about 2,371 square metres in all.',
                              '- 27 boats line the water\'s edge and 9 cage farms sit in the open water.']),
        ('What are its limits?', 'The map shows one date only. The satellite base is Esri World Imagery and was not captured on the same day, so it gives context and is not evidence. Only the visible canopy of the mangroves is traced.'),
    ], 'Map 1. The Estuary as a Landscape')

    b.map_spread('map2', 2, 'Patterns of Wetness and Vegetation', [
        ('What it shows?', 'Map 2 draws on all seventeen dates in three panels. The first shows how often each part of the frame was water, the second how often it was mangrove canopy and the third how often exposed sediment was traced there. Each share is drawn in eight bands of 12.5%, pale where a class was seen rarely and strong where it was seen on every date.'),
        ('Why it was made?', 'It puts relaxation into a map. Instead of giving each place one permanent label, it records how often each place was seen in each state, which separates the small areas that stay the same from the larger areas that keep changing.'),
        ('How it was made?', 'A short Python script laid a grid of 1.5 metre cells over the frame and counted, for each cell, the dates on which it was traced as each class and the dates whose trace covered it. I styled the three layers and laid out the panels in QGIS.'),
        ('What it reveals?', 'Only 668 square metres were water on every date, while 18,884 square metres changed between water and other classes. No cell was mangrove canopy or exposed sediment on every date.'),
        ('What are its limits?', 'The tide was not recorded, so some of the change may be tidal. Three dates from 2022 count for more than single years, and every date falls in the dry season.'),
    ], 'Map 2. Patterns of Wetness and Vegetation')

    b.map_spread('map3', 3, 'The Estuary Through Time', [
        ('What it shows?', 'Map 3 sets six of the seventeen dates side by side: 11 April 2011, 24 February 2014, 8 December 2017, 23 December 2020, 7 May 2022 and 17 February 2024. Every panel has the same extent, scale and colours and carries its date, so the estuary can be compared with itself.'),
        ('Why it was made?', 'A single map hides movement. Placing the dates in a row shows how much the same ground changes, and the uneven gaps between them show how thin the record is.'),
        ('What it reveals?', ['- In April 2011 muddy shallows cover about 13,412 square metres at the top of the frame. By 2014 they have almost gone from the traces.',
                              '- Mangrove canopy is traced in 2011, is missing from the traces of 2013 to 2016 and is present on every date from December 2017.',
                              '- Cage farms first appear in November 2018 and are on every later date. They show in the panels from 2020 onwards.']),
        ('What are its limits?', 'Six dates are drawn for clarity. The other eleven are traced but not shown. The dates fall in different months and the tide is unknown, so the panels show differences between observations and not proven change.'),
    ], 'Map 3. The Estuary Through Time')

    b.map_spread('map4', 4, 'The Estuary as a Lived Landscape', [
        ('What it shows?', 'Map 4 looks closely at the shoreline strip on 11 April 2011 and 25 February 2025, the earliest and latest dates. Both panels share the same extent and scale and show the water, muddy shallows and bed ground, the tree cover, the track, buildings, boats and cage farms. A locator image from Google Earth Pro shows where the strip sits.'),
        ('Why it was made?', 'The estuary is a working place as well as a natural one. Fishing, boats, shellfish farming and the houses along the shore all depend on where the water is. This map shows how close they sit to the water\'s edge, which the plan does not describe.'),
        ('What it reveals?', ['- Boats traced along the strip rise from 20 in 2011 to 27 in 2025.',
                              '- Cage farms rise from none to 9, and visible buildings from 6 to 11.',
                              '- In 2025 the track runs between the water and a band of trees, with the buildings behind it.']),
        ('What are its limits?', 'These are counts of what could be seen on two days and not a census. The 2011 image is blurred and buildings are often hidden by palms, so building counts are a minimum. The 2011 track looks narrower, but the images differ in resolution, so this is not treated as a finding.'),
    ], 'Map 4. The Estuary as a Lived Landscape')

    b.map_spread('map5', 5, 'The Estuary Between Plan and Ground', [
        ('What it shows?', 'Map 5 sets the Master Plan beside the ground. The left side shows the existing land use sheet with its four categories and a bar of their shares. The right side shows the same area as traced on 25 February 2025 over the satellite view.'),
        ('Why it was made?', 'It tests the project\'s main assumption. The plan gives the land four fixed categories, while the estuary moves between water and ground. Placing the two side by side shows where they agree and where they do not.'),
        ('What it reveals?', ['- Inside the study frame the plan shows a single category, Water Sheet.',
                              '- On the ground the same area holds water, a mangrove canopy, bed ground exposed on 13 of the 17 dates, muddy shallows, a moving land edge, boats and cage farms.',
                              '- Marshy Area is only 1.61% of the 1,741.74 hectare planning area, and the mangroves of this frame are not part of it.',
                              '- The sheet shows one moment and holds no seasonal or tidal information.']),
        ('What are its limits?', 'The plan crop is not georeferenced, so it sits beside the traces and not over them. At 1:15,000 a 0.5 mm line covers about 7.5 metres, so small differences near the edges are treated as questions and not as errors.'),
    ], 'Map 5. The Estuary Between Plan and Ground')

    b.map_spread('map6', 6, 'The Estuary and the Monsoon', [
        ('What it shows?', 'Map 6 shows the rain that fell before each of the seventeen dates. Each date is a small map of the estuary in the shared colours, with two bars beside it. The first bar is the total rain of the monsoon, June to September, before the date. The second is the rain of the 30 days before it.'),
        ('Why it was made?', 'Every usable image falls in the dry season, so the monsoon, which probably does most to shape the estuary, is missing from the record. Map 6 cannot show the monsoon itself, but it shows how wet the months before each observation were.'),
        ('How it was made?', 'Daily rainfall came from the NASA POWER point service for 13.639 N, 74.692 E, from 1 June 2010 to 25 February 2025. A short Python script added up the two totals for each date. I made the map itself in QGIS.'),
        ('What it reveals?', 'Monsoon totals before the dates range from 2,272 mm before the dates of 2018 and early 2019 to 3,848 mm before the dates of late 2020 and 2021. Five dates had no rain at all in the 30 days before them, and a sixth had 0.01 mm. The wettest month before a date was the 79.8 mm before 7 May 2022.'),
    ], 'Map 6. The Estuary and the Monsoon')

    side, n = b.side, b.num
    h, y = b.head(side, 'Map 6', 'The rain before each observation')
    it = [h]
    leg_h = 46
    ch = BODY_BOTTOM - y - 44 - leg_h
    n17 = len(MAN['dates'])
    bw = (CW - (n17 - 1) * 6) / n17
    for k, dd in enumerate(MAN['dates']):
        r = dd['rainfall']
        bx_ = col_x(side, 0) + k * (bw + 6)
        h1 = ch * r['monsoon_mm'] / 4000
        it.append(d.rect(bx_, y + ch - h1, bw * 0.62, h1, 'Rain Monsoon'))
        h2 = max(1.5, ch * 0.6 * r['prior30_mm'] / 80)
        it.append(d.rect(bx_ + bw * 0.66, y + ch - h2, bw * 0.34, h2, 'Rain 30'))
        dm_, yr_ = fmt_date(dd['iso']).rsplit(' ', 1)
        it.append(d.text(bx_ - 4, y + ch + 4, bw + 8, 38, [P('DB Small', dm_), P('DB Small', yr_)]))
    it.append(d.line(col_x(side, 0), y + ch, col_x(side, 0) + CW, y + ch, 'Black', 0.75))
    ly = y + ch + 48
    it.append(d.rect(col_x(side, 0), ly + 3, 14, 14, 'Rain Monsoon'))
    it.append(d.text(col_x(side, 0) + 22, ly, span_w(2) - 30, leg_h, [P('DB Small', 'Monsoon before the date, from 2,272 to 3,848 mm.')]))
    it.append(d.rect(col_x(side, 2), ly + 3, 14, 14, 'Rain 30'))
    it.append(d.text(col_x(side, 2) + 22, ly, span_w(2) - 22, leg_h, [P('DB Small', 'The 30 days before, drawn on a larger scale, up to 79.8 mm before 7 May 2022.')]))
    it += b.folio(side, n)
    b.add(it)

    side, n = b.side, b.num
    h, y = b.head(side, 'Map 6', 'Sources and limits of the rainfall')
    it = [h, d.text(col_x(side, 0), y, span_w(3), BODY_BOTTOM - y, [
        P('DB Subhead Accent', 'Sources considered'),
        P('DB Body', 'CHIRPS has a fine grid of about 5 km. IMD gridded rainfall is the official Indian record, but its cell is about 27 km and its files are issued per year. KSNDMC publishes gauge data for Kundapura taluk, but the open version holds only annual totals. A NOAA copy of the CHIRPS daily series had most values missing.'),
        P('DB Body', 'NASA POWER was chosen because it is open, needs no account and returned a complete daily record for the site. Its values come from the MERRA-2 dataset on a grid of about 50 km.'),
        P('DB Subhead Accent', 'What are its limits?'),
        P('DB Bullet', 'Rainfall is a regional estimate and not a measurement at the estuary.'),
        P('DB Bullet', 'The map does not show tide, river flow or storms.'),
        P('DB Bullet', 'It does not prove that a rainfall total caused a mapped difference. A test of rainfall against the traced areas across the 17 dates found no significant link.'),
    ], cols=2)]
    o, _ = b.img(col_x(side, 3), y, COLW, BODY_BOTTOM + 4 - y, 'f_0831_071555')
    it += o + b.folio(side, n)
    b.add(it)

    # findings
    def findings(kicker, title, items, mark=None):
        side, n = b.side, b.num
        if mark: b.mark(mark)
        h, y = b.head(side, kicker, title)
        it = [h]
        cell_h = (BODY_BOTTOM - y - 14) / 2
        for k, (sub, body) in enumerate(items):
            cx = col_x(side, 0 if k % 2 == 0 else 2)
            cy = y + (k // 2) * (cell_h + 14)
            it.append(d.line(cx, cy, cx + span_w(2), cy, 'WIT Accent', 0.75))
            it.append(d.text(cx, cy + 8, 40, 48, [P('DB Big Figure', str(k + 1))]))
            it.append(d.text(cx + 48, cy + 12, span_w(2) - 48, cell_h - 12, [P('DB Label', sub), P('DB Body', body)]))
        it += b.folio(side, n)
        b.add(it)

    findings('Findings', 'What the maps show', [
        ('The plan describes the estuary as fixed', 'Marshy Area is 1.61% of the planning area and Water Sheet 30.85%. The sheet has no seasonal or tidal information, so it cannot show the same ground as water, mud and shore at different times.'),
        ('The imagery shows the edge moving', 'In April 2011 large areas of bed ground and muddy shallows are exposed inside the frame. In February 2025 the same ground is under water. Tide was not recorded, so this is not read as long term change.'),
        ('A small fixed core', 'Only 668 square metres were water on every date. The zone between the mangroves and the open water is where the classes change from date to date.'),
        ('Use sits close to the edge', 'In 2025 boats line up along the water\'s edge, cage farms sit offshore, the track runs between the water and a band of trees, and buildings sit behind.'),
    ], mark='Findings')
    findings('Findings', 'What the maps suggest', [
        ('The mangroves have grown', 'Mangrove canopy rose from none in the 2013 to 2016 traces to about 2,750 square metres in the study rectangle in 2025. This is the only class with a clear trend.'),
        ('Dates differ more than years', 'The dates are few, uneven and in different months. The differences are therefore described as differences between observations, and the monsoon is missing from every one.'),
        ('Rainfall gives context, not causes', 'Every observation fell in the dry season. Monsoon totals before the dates range from 2,272 to 3,848 mm. This does not show that rainfall caused any mapped difference.'),
        ('A gap in planning', 'A plan with four fixed categories and no seasonal or tidal data cannot describe land that moves between water and ground. This matters most where people work on the shore.'),
    ])

    # ================================================================ 12 THE WEBSITE
    b.title_page('12', 'The Website', 'Why the maps became an immersive website, how its story is structured and what each part is for.', 'web_arrival')

    side, n = b.side, b.num
    b.mark('The website')
    h, y = b.head(side, 'The website', 'Wetlands in Transition')
    lp = [
        P('DB Body', 'A paper map shows only the finished result. The website shows how the estuary is put together and how it changes, so that the gaps between observations can be felt as well as read. It accompanies the printed maps and does not replace them. It is designed for a jury on a laptop and for a television at the exhibition.'),
        P('DB Subhead Accent', 'Earlier versions'),
        P('DB Body', 'My first prototype was a scrolling page in Three.js and GSAP that revealed each layer in turn with a pixelated gradient style. It was hard to read, so I set it aside. It was later rebuilt as a Light Table version and then redesigned completely into the current immersive journey.'),
        P('DB Subhead Accent', 'Feedback'),
        P('DB Body', 'Reviews asked for a clear narrative, so that a visitor understands what each map is for without me in the room. They also suggested a way to compare my hand tracing with an automated one, which became the tracing model section.'),
        P('DB Subhead Accent', 'Three references'),
        P('DB Bullet', 'Blue Marine Foundation, The Sea We Breathe, for scrolling through a rich world into its sections.'),
        P('DB Bullet', 'Penderecki\'s Garden, for land drawn in 3D as clusters of dots that form layers.'),
        P('DB Bullet', 'Blobmixer, for one animated form that carries the colour and texture of one element.'),
    ]
    it = [h, d.text(col_x(side, 0), y, span_w(3) - 6, BODY_BOTTOM - y, lp, cols=2)]
    jx = col_x(side, 3) + 10
    jw = COLW - 10
    it.append(d.rect(col_x(side, 3), y - 6, COLW, BODY_BOTTOM + 4 - y + 6, 'WIT Accent'))
    jr = ['Landing page', 'Introduction to the area', 'The ten classes', 'Map 1', 'Map 2', 'Map 3', 'Map 4', 'Map 5', 'Map 6', 'Tracing model', 'Conclusion']
    jp = [P('DB Kicker White', 'The sections')] + [P('DB Small White', f'{k + 1}   {t}') for k, t in enumerate(jr)]
    it.append(d.text(jx, y + 6, jw - 6, BODY_BOTTOM - y - 6, jp))
    it += b.folio(side, n)
    b.add(it)

    b.text_page('How it is built', 'Tools, data and design decisions', [
        P('DB Subhead Accent', 'Three.js'),
        P('DB Body', 'Three.js draws the 3D scenes. GSAP and ScrollTrigger tie every movement to the scroll, and Vite runs and builds the site.'),
        P('DB Subhead Accent', 'The traces'),
        P('DB Body', 'The traces are converted into the website\'s data in the same metre grid as the QGIS maps. The original KML files and images are never changed. Each screenshot is approximately registered to its traces, so images and traces line up, and every trace and screenshot is turned into clouds of small coloured dots. This is the website\'s visual language.'),
        P('DB Subhead Accent', 'Colour and texture'),
        P('DB Body', 'Each class keeps its colour family from the maps. Shades were adjusted so that similar classes are easier to tell apart in 3D, for example tree cover is a brighter green than mangrove canopy.'),
        P('DB Subhead Accent', 'Legends and navigation'),
        P('DB Body', 'Every map has a complete legend set as quiet text. A thin line on the right, like a traced shoreline, shows progress and jumps to any section.'),
        P('DB Subhead Accent', 'Pacing and honesty'),
        P('DB Body', 'The scroll is long so each change unfolds slowly. Every limitation stays visible on the page: the unknown tide, the regional rainfall, the missing monsoon and the approximate registration.'),
    ], cols=2)

    b.web_one('Website, section 1', 'Landing page', 'web_earth', 'The landing page: the Earth in space and the project title.', [
        P('DB Body', 'The website opens in space, with the Earth glowing beside the sun and the project title over it. The only instruction is to scroll and descend.'),
        P('DB Body', 'The purpose is orientation. Before any map, the visitor learns where Kundapur is and how small the study area is in relation to the planet.'),
    ], mark='The website, section by section')
    b.web_two('Website, section 2', 'Introduction to the area', [('web_approach', 'Where the Panchagangavali meets the Arabian Sea.'), ('web_arrival', 'Blue waters, Kundapur: the study frame on 25 February 2025.')], [
        P('DB Body', 'The Earth turns onto the Karnataka coast and the first text names the place and its people: the estuary as a livelihood hub for the Kharvi community, who fish and collect clams and shellfish along its edges.'),
        P('DB Body', 'The view then settles over the estuary, where the 25 February 2025 image appears as coloured dots. This frame, about 250 by 195 metres, is the view in which every date was traced.'),
    ])
    b.web_two('Website, section 3', 'The ten classes', [('web_specimen_mangrove', 'Mangrove canopy shown as a specimen.'), ('web_specimen_tree', 'Tree cover shown as a specimen.')], [
        P('DB Body', 'Each class is shown as a specimen: one moving 3D form with its own colour, texture and shine. Water ripples, bed ground is grainy, mangroves form crowns and buildings are faceted.'),
        P('DB Body', 'Beside each specimen, its definition and its traced area or count are given, and a small reference map lights up where the class was traced. The visitor learns the vocabulary of the maps before seeing them.'),
    ])
    b.web_two('Website, section 4', 'Map 1', [('web_map1_layers', 'The classes lift apart into layers.'), ('web_map1_mangrove', 'A closer look at the mangroves on the central bed.')], [
        P('DB Body', 'Map 1 is rebuilt from clustered dots. The classes lift apart into separate layers so that each can be read on its own, then settle back into one estuary.'),
        P('DB Body', 'The camera then visits two parts of the same landscape: the mangroves on the central bed, traced as six patches on this date, and the shore, where boats line the water\'s edge and the cage farms sit offshore.'),
    ])
    b.web_two('Website, section 5', 'Map 2', [('web_map2_threshold', 'One ball for each date a cell was traced as water.'), ('web_map2_sediment', 'The ground that changes between dates.')], [
        P('DB Body', 'The frame is divided into 1.5 metre cells. Each cell rises as a column with one ball for each date it was traced as water. The height is a count of dates, not depth or elevation.'),
        P('DB Body', 'A slider asks how often a place must be water to be called water, which turns relaxation into something the visitor can try. The section ends with the mangrove canopy persistence and the band of exposed sediment that changes between dates.'),
    ])
    b.web_two('Website, section 6', 'Map 3', [('web_map3_ring', 'The six dates compared in the printed map.'), ('web_map3_stack', 'All seventeen dates stacked in order.')], [
        P('DB Body', 'Map 3 begins with the six observations of the printed map and then shows all seventeen clear dates, spaced evenly so each can be read.'),
        P('DB Body', 'The camera climbs the stack date by date, each one labelled. The text repeats that differences are read as differences between observations and not as long term change.'),
    ])
    b.web_one('Website, section 7', 'Map 4', 'web_map4', 'The shoreline in 2011 and 2025, with forms for houses, boats and cage farms.', [
        P('DB Body', 'Map 4 shows the shoreline over each year\'s satellite image, 2011 below and 2025 above, with 3D forms for houses, boat hulls, cage-farm rafts with rods, a raised track and the tree canopy.'),
        P('DB Body', 'Buildings, boats and cage farms were traced as points, so their forms are symbols at an indicative size and not measured outlines. The page says so.'),
    ])
    b.web_one('Website, section 8', 'Map 5', 'web_map5', 'The plan, printed as halftone dots, beside the traced ground.', [
        P('DB Body', 'Map 5 sets the Master Plan, printed as halftone dots, beside the traces of 25 February 2025.'),
        P('DB Body', 'Towers show the four planning categories, one ball for each per cent of the planning area. The text explains that the plan has no seasonal or tidal information and that its crop is not georeferenced.'),
    ])
    b.web_two('Website, section 9', 'Map 6', [('web_map6', 'Rainfall towers around the estuary.'), ('web_tunnel', 'The dots of one map forming a tunnel into the next.')], [
        P('DB Body', 'Map 6 circles the seventeen rainfall towers in date order. Rain falls over the estuary, and its density follows the 30 day total of the date in focus.'),
        P('DB Body', 'Between map sections, the dots of the map being left lift out and form a tunnel around the visitor before settling into the next map. The tunnels are built from the maps themselves, so the journey never leaves the estuary.'),
    ])
    b.web_two('Website, section 10', 'Tracing model', [('web_model_change', 'What is changing: the area of each class on the 17 dates.'), ('web_model_both', 'Hand tracing below, the model above.')], [
        P('DB Body', 'This section asks whether a computer could trace what I traced by hand. A random forest classifier, built in Python with scikit-learn and OpenCV, learnt the classes from the colour and texture of every 0.5 metre cell.'),
        P('DB Body', 'Each date was classified by a model trained only on the other sixteen, so every result is on a date the model never saw. The section answers three questions: what is changing, how reliably it can be identified and what might happen next.'),
    ])

    side, n = b.side, b.num
    h, y = b.head(side, 'Tracing model', 'How close the model came to the hand tracing')
    it = [h]
    pooled = MLM['pooled']
    figs = [(f'{round(pooled["overall_accuracy"] * 100)}%', 'of traced cells matched by the model'), (f'{round(MLM["baseline_overall_accuracy"] * 100)}%', 'for a simple colour-only method'),
            (f'{MLM["land_edge"]["median_of_medians_m"]:.1f} m', 'median distance from the traced land edge')]
    cw = (CW - 2 * GUT) / 3
    for k, (f, t) in enumerate(figs):
        cx = col_x(side, 0) + k * (cw + GUT)
        it.append(d.rect(cx, y, cw, 100, 'WIT Accent', tint=None if k == 0 else 14))
        it.append(d.text(cx + 12, y + 10, cw - 24, 84, [P('DB Big Figure White' if k == 0 else 'DB Big Figure', f), P('DB Small White' if k == 0 else 'DB Small', t)]))
    y += 116
    it.append(d.text(col_x(side, 0), y, span_w(2), 22, [P('DB Subhead Accent', 'F1 score by class, from 0 to 1')]))
    order = [('water', 'Water'), ('bed_ground', 'Bed ground'), ('mangrove_canopy', 'Mangrove canopy'), ('muddy_shallows', 'Muddy shallows')]
    bw = span_w(2) - 150 - 44
    for k, (key, lab_) in enumerate(order):
        f1 = pooled['classes'][key]['f1']
        ry_ = y + 34 + k * 34
        it.append(d.text(col_x(side, 0), ry_ + 1, 146, 20, [P('DB Label', lab_)]))
        it.append(d.rect(col_x(side, 0) + 146, ry_ + 3, bw, 15, 'Grey Line', tint=20))
        it.append(d.rect(col_x(side, 0) + 146, ry_ + 3, max(2, bw * f1), 15, lab_))
        it.append(d.text(col_x(side, 0) + 152 + bw, ry_ + 1, 44, 20, [P('DB Label', f'{f1:.2f}')]))
    it.append(d.text(col_x(side, 2), y, span_w(2), BODY_BOTTOM - y, [
        P('DB Body', 'The model found water and exposed bed well but could not reproduce muddy shallows, splitting those cells between bed ground (55%) and water (43%). This supports muddy shallows as a judgement made by eye. Tree cover and track could not be judged, as they were traced on only two dates. Some disagreement also comes from the approximate registration of the images and their unknown tide.')]))
    it += b.folio(side, n)
    b.add(it)

    an = CHG['analysis']['mangrove_canopy']
    sc = an['scenarios']['values']
    b.web_one('Tracing model', 'What might happen next', 'web_model_scenario', 'The mangrove canopy, by the date it was first traced.', [
        P('DB Body', f'Inside the rectangle that every date covers, mangrove canopy is the only class with a significant trend: about {round(an["observed"]["slope_m2_per_year"])} square metres a year. The model\'s own readings show the same trend.'),
        P('DB Body', f'Continued at the same rate, the canopy would reach about {sc["continuation"]["2035"]:,.0f} square metres by 2035. At 1.5 times the rate, about {sc["accelerated"]["2035"]:,.0f}. At half the rate, about {sc["reduced"]["2035"]:,.0f}.'),
        P('DB Body', 'These are hypothetical scenarios, not predictions. Water, bed ground and muddy shallows have no trend and depend on the unknown tide, so no scenario is given for them.'),
    ])
    b.web_one('Website, section 11', 'Conclusion', 'web_finale', 'Everything settles back into one estuary.', [
        P('DB Quote', 'The edge between land and water is not a line.'),
        P('DB Body', 'At the end, every element settles back into one estuary. The closing text says that the edge moves with the tide and the seasons, and that planning and mapping need to acknowledge the transitional nature of wetlands rather than impose permanent boundaries.'),
    ])

    # ================================================================ 13 REFLECTION
    b.title_page('13', 'Reflection', 'What worked, what was difficult, what I learned and what could come next.', 'f_0902_171913')
    side, n = b.side, b.num
    b.mark('Successes and challenges')
    h, y = b.head(side, 'Successes and challenges', 'What worked and what was difficult')
    it = [h]
    good = [P('DB Subhead Accent', 'What worked')] + [P('DB Bullet', t) for t in [
        'Moving from boat shelters to the changing estuary gave the project a clear subject.',
        'Narrowing to one frame and 2011 to 2025 made it possible to finish.',
        'One folder per date and consistent names gave data that loaded cleanly into QGIS.',
        'Logging every date gave a clear reason for each removal.',
        'Tracing by hand kept every decision visible.',
        'Map 6 gave some context for the missing monsoon.']]
    hard = [P('DB Subhead White', 'What was difficult')] + [P('DB Bullet White', t) for t in [
        'The first idea failed because there was nothing to compare.',
        'Google Earth Pro cannot export georeferenced imagery.',
        'Tile seams forced some dates to be dropped.',
        'No tide was recorded for any image.',
        'Map 4 first looked empty and had to be reframed.',
        'Finding a usable rainfall source took several attempts.']]
    bh = max(measure(good, span_w(2) - 28), measure(hard, span_w(2) - 28)) + 26
    it.append(d.rect(col_x(side, 0), y, span_w(2), bh, 'WIT Accent', tint=10))
    it.append(d.text(col_x(side, 0) + 14, y + 10, span_w(2) - 28, bh - 14, good))
    it.append(d.rect(col_x(side, 2), y, span_w(2), bh, 'WIT Accent'))
    it.append(d.text(col_x(side, 2) + 14, y + 10, span_w(2) - 28, bh - 14, hard))
    y += bh + 12
    gw = (CW - 2 * GUT) / 3
    for k, (key, cap) in enumerate([('frame_op1', None), ('date_2019_01_31', None), ('map4', None)]):
        it.append(d.image(col_x(side, 0) + k * (gw + GUT), y, gw, BODY_BOTTOM + 4 - y, link(key)))
    it += b.folio(side, n)
    b.add(it)

    side, n = b.side, b.num
    b.mark('Reflection')
    h, y = b.head(side, 'Reflection', 'What the project taught me')
    it = [h, d.text(col_x(side, 0), y, span_w(3), BODY_BOTTOM - y, [
        P('DB Body', 'The main thing this project showed me is how much any map depends on the date it was made. The Master Plan sheet fixes one moment in a place that keeps moving. My own images fix seventeen moments, which is better, but they still leave long gaps and miss the monsoon entirely.'),
        P('DB Body', 'My maps can show the estuary changing, but they cannot show how it behaves across a full year. I say this openly in the findings and I do not assume that nothing changed between the dates.'),
        P('DB Body', 'If I did the project again, I would log the available dates and check them for clarity and seams before tracing anything, and I would narrow the scope earlier. The fallback in my timeline was useful, because the work never depended on a single document or tool.'),
        P('DB Body', 'The project does not claim to settle how the estuary behaves. What it offers is a record made carefully from the data that exists, and a clear view of what a fixed category can and cannot describe.'),
    ], cols=2)]
    o, _ = b.img(col_x(side, 3), y, COLW, BODY_BOTTOM + 4 - y, 'f_0902_173244')
    it += o + b.folio(side, n)
    b.add(it)

    b.cards_page('Future scope', 'What could come next', [
        ('Find a monsoon image', 'Search other archives for a usable image from June to September, when the wetland is fullest.', 'f_0831_072659'),
        ('Recover the tide', 'Confirm each image\'s capture time from the providers, so the tide on the day can be estimated.', 'f_0902_172427'),
        ('Collect local data', 'Compare the regional rainfall with a local gauge and survey the mudflats and mangrove edge.', 'f_0902_173249'),
        ('Complete the plan', 'Obtain the Master Plan report and proposed land use drawing, and record how people use the shore.', 'plan_part'),
    ], mark='Future scope')

    b.text_page('References', 'Sources', [
        P('DB Small', 'Christian, Brian, and Tom Griffiths. 2016. Algorithms to Live By: The Computer Science of Human Decisions. New York: Henry Holt and Company.'),
        P('DB Small', ' '),
        P('DB Small', 'Sateesh, Deepta, and Vigna Priya Adhanki. 2026. Aquapelagic Entanglements in the Panchagangavali Region. Geo: Geography and Environment 13, no. 1, e70073.'),
        P('DB Small', ' '),
        P('DB Small', 'Town Planning Authority, Kundapura. Kundapura Master Plan 2031 (Provisional), Existing Land Utilization, Drawing No. 2, scale 1:15,000.'),
        P('DB Small', ' '),
        P('DB Small', 'Google LLC. Google Earth Pro. Historical satellite imagery, 2011 to 2025.'),
        P('DB Small', ' '),
        P('DB Small', 'NASA Prediction Of Worldwide Energy Resources (POWER). Daily point data. power.larc.nasa.gov'),
        P('DB Small', ' '),
        P('DB Small', 'NOAA NCEI. International Best Track Archive for Climate Stewardship (IBTrACS), version 4.'),
        P('DB Small', ' '),
        P('DB Small', 'QGIS Development Team. QGIS Geographic Information System, version 3.44.'),
        P('DB Small', ' '),
        P('DB Small', 'Ramsar Convention. Country profile, India. ramsar.org'),
        P('DB Small', ' '),
        P('DB Small', 'Wetlands International. Valuing wetlands. wetlands.org'),
        P('DB Small', ' '),
        P('DB Small', 'Global Mangrove Watch. globalmangrovewatch.org'),
        P('DB Small', ' '),
        P('DB Small', 'USGS EarthExplorer, Copernicus Browser and Bhuvan, consulted as alternative imagery sources.'),
        P('DB Small', ' '),
        P('DB Small', 'Blue Marine Foundation, The Sea We Breathe. Penderecki\'s Garden. Blobmixer by 14islands. Website references.'),
    ], cols=2, mark='References')

    side, n = b.side, b.num
    it = [b.bleed_image(side, 'f_0902_174137')]
    by = BOT - 150
    it.append(d.rect(0, by, PW + 9, 159, 'WIT Accent'))
    it.append(d.text(col_x(side, 0), by + 24, CW, 80, [P('DB Quote White', 'The edge between land and water is not a line.'), P('DB Small White', 'Canoes and cage farms on the Kundapur estuary, 2 September.')]))
    it += b.folio(side, n, dark=True)
    b.add(it)

    b.pages[0] = ('L', contents_page(b))
    return b.pages


def contents_page(b):
    d = b.d
    side = 'L'
    it = [b.bg(side)]
    it.append(d.text(col_x(side, 0), TOPY, CW, 44, [P('DB Title White', 'Contents')]))
    entries = b.contents
    half = (len(entries) + 1) // 2
    y0 = TOPY + 44 + GAP
    rowh = min(23, (BODY_BOTTOM - y0) / half)
    for k, (t, pn) in enumerate(entries):
        col = 0 if k < half else 2
        r = k if k < half else k - half
        y = y0 + r * rowh
        it.append(d.text(col_x(side, col), y, span_w(2) - 44, rowh, [P('DB Small White', t)]))
        it.append(d.text(col_x(side, col) + span_w(2) - 40, y, 40, rowh, [('DB Label White', [(str(pn), {})])]))
        it.append(d.line(col_x(side, col), y + rowh - 3, col_x(side, col) + span_w(2), y + rowh - 3, 'Paper', 0.4, tint=40))
    it += b.folio(side, 4, dark=True)
    return it

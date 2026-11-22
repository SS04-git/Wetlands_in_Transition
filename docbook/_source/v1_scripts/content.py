"""
Pages of the Wetlands in Transition documentation book: text, images and native graphics.
Every figure is taken from the project's own data (public/data, tools/ml/out) or the printed maps.
Language rules: simple British English, no em dashes, no semicolons, minimum type size 12 pt.
"""
import json
from pathlib import Path
from idml_lib import *  # noqa

ROOT = Path(__file__).resolve().parents[1]
MAN = json.loads((ROOT / 'public/data/manifest.json').read_text())
PTS = json.loads((ROOT / 'public/data/points.json').read_text())
MLM = json.loads((ROOT / 'tools/ml/out/metrics.json').read_text())
CHG = json.loads((ROOT / 'tools/ml/out/change.json').read_text())

TOPY = TOP + M                 # top of the content box
BODY_BOTTOM = BOT - M - 26     # leaves room for the folio line
FOLIO_Y = BOT - M - 14


def P(style, text):
    return (style, text)


def B(style, lead, text):
    """paragraph with a bold lead-in"""
    return (style, [(lead + ' ', {'bold': True}), (text, {})])


class Book:
    def __init__(self, doc, links):
        self.d, self.L = doc, links
        self.pages = []           # (side, items)
        self.contents = []        # (title, page number)

    @property
    def num(self):
        return 4 + len(self.pages)

    @property
    def side(self):
        return 'L' if len(self.pages) % 2 == 0 else 'R'

    def add(self, items):
        self.pages.append((self.side, items))

    # ------------------------------------------------------------- shared pieces
    def folio(self, side, n, dark=False):
        """page number and book title on the bottom line of the margin box, outer edge"""
        w = 300
        if side == 'L':
            st = 'DB Folio White' if dark else 'DB Folio'
            return [self.d.text(col_x(side, 0), FOLIO_Y, w, 15, [(st, f'{n}    Wetlands in Transition')])]
        st = 'DB Folio Right White' if dark else 'DB Folio Right'
        return [self.d.text(page_x0(side) + PW - M - w, FOLIO_Y, w, 15, [(st, f'Wetlands in Transition    {n}')])]

    def bg(self, side, fill='WIT Accent', tint=None):
        x0 = page_x0(side)
        if side == 'L':
            return self.d.rect(x0 - 9, TOP - 9, PW + 9, PH + 18, fill, tint)
        return self.d.rect(0, TOP - 9, PW + 9, PH + 18, fill, tint)

    def head(self, side, kicker, title, w=None, white=False, y=TOPY):
        w = w or span_w(3)
        paras = []
        if kicker: paras.append(P('DB Kicker White' if white else 'DB Kicker', kicker))
        paras.append(P('DB Title White' if white else 'DB Title', title))
        h = measure(paras, w) + 2
        return self.d.text(col_x(side, 0), y, w, h, paras), y + h + 6

    def class_dots(self, side, y, white=False):
        """the ten class colours as a row of dots: a quiet motif taken from the maps"""
        keys = ['Water', 'Muddy shallows', 'Bed ground', 'Mangrove canopy', 'Land edge', 'Tree cover', 'Track', 'Buildings', 'Boats', 'Cage farms']
        x = col_x(side, 0)
        return [self.d.oval(x + 6 + i * 20, y, 6, k) for i, k in enumerate(keys)]

    # ------------------------------------------------------------- page types
    def title_page(self, number, title, intro, contents_title=None):
        side, n = self.side, self.num
        self.contents.append((contents_title or title, n))
        it = [self.bg(side)]
        it.append(self.d.text(col_x(side, 0), TOPY - 10, span_w(2), 130, [P('DB Number', number)]))
        tp = [P('DB Title XL', title)]
        th = measure(tp, span_w(3)) + 4
        it.append(self.d.text(col_x(side, 0), 20, span_w(3), th, tp))
        it.append(self.d.line(col_x(side, 0), 20 + th + 10, col_x(side, 0) + 60, 20 + th + 10, 'Paper', 1.5))
        ip = [P('DB Body White', intro)]
        it.append(self.d.text(col_x(side, 0), 20 + th + 24, span_w(3), BODY_BOTTOM - (20 + th + 24), ip))
        it += self.class_dots(side, -150 + 2, True) if False else []
        it += self.folio(side, n, dark=True)
        self.add(it)

    def text_page(self, kicker, title, paras, span=3, start_col=0, extra=None, contents_title=None, white=False, top_items=None):
        side, n = self.side, self.num
        if contents_title: self.contents.append((contents_title, n))
        it = []
        if white: it.append(self.bg(side))
        h, y = self.head(side, kicker, title, w=span_w(max(span, 3)), white=white)
        it.append(h)
        x = col_x(side, start_col)
        it.append(self.d.text(x, y, span_w(span), BODY_BOTTOM - y, paras))
        if extra: it += extra(side, y)
        it += self.folio(side, n, dark=white)
        self.add(it)

    def quad_page(self, kicker, title, items, intro=None, contents_title=None):
        """four numbered points in a 2 x 2 grid (1 2 / 3 4)"""
        side, n = self.side, self.num
        if contents_title: self.contents.append((contents_title, n))
        it = []
        h, y = self.head(side, kicker, title, w=span_w(4))
        it.append(h)
        if intro:
            ip = [P('DB Body', intro)]
            ih = measure(ip, span_w(4)) + 2
            it.append(self.d.text(col_x(side, 0), y, span_w(4), ih, ip))
            y += ih + 4
        cell_h = (BODY_BOTTOM - y - 14) / 2
        for k, (sub, body) in enumerate(items):
            cx = col_x(side, 0 if k % 2 == 0 else 2)
            cy = y + (k // 2) * (cell_h + 14)
            it.append(self.d.line(cx, cy, cx + span_w(2), cy, 'WIT Accent', 0.75))
            it.append(self.d.text(cx, cy + 6, 40, 48, [P('DB Big Figure', str(k + 1))]))
            paras = [P('DB Subhead', sub)] + ([P('DB Body', b) for b in body] if isinstance(body, list) else [P('DB Body', body)])
            it.append(self.d.text(cx + 46, cy + 10, span_w(2) - 46, cell_h - 10, paras))
        it += self.folio(side, n)
        self.add(it)

    def map_page(self, key, caption):
        """a map on its own page, fitted inside the margins"""
        side, n = self.side, self.num
        L = self.L[key]
        mw, mh = CW, CH - 62
        sc = min(mw / L['wpt'], mh / L['hpt'])
        w, h = L['wpt'] * sc, L['hpt'] * sc
        x = col_x(side, 0) + (CW - w) / 2
        it = [self.d.image(x, TOPY, w, h, L, mode='fit', stroke='Grey Line')]
        it.append(self.d.text(max(x, col_x(side, 0)), TOPY + h + 4, max(w, span_w(3)), 34, [P('DB Caption', caption)]))
        it += self.folio(side, n)
        self.add(it)

    def photo_page(self, kicker, title, photos, intro=None, cols=3, rows=2, caption_h=34):
        side, n = self.side, self.num
        it = []
        h, y = self.head(side, kicker, title, w=span_w(4))
        it.append(h)
        if intro:
            ip = [P('DB Body', intro)]
            ih = measure(ip, span_w(4)) + 2
            it.append(self.d.text(col_x(side, 0), y, span_w(4), ih, ip))
            y += ih + 6
        gw = (CW - (cols - 1) * GUT) / cols
        gh = (BODY_BOTTOM - y - (rows - 1) * 12) / rows - caption_h
        for k, (key, cap) in enumerate(photos):
            r, c = divmod(k, cols)
            px = col_x(side, 0) + c * (gw + GUT)
            py = y + r * (gh + caption_h + 12)
            if key and key in self.L:
                it.append(self.d.image(px, py, gw, gh, self.L[key]))
            else:
                it.append(self.d.placeholder(px, py, gw, gh))
            it.append(self.d.text(px, py + gh + 2, gw, caption_h - 2, [P('DB Caption', cap)]))
        it += self.folio(side, n)
        self.add(it)

    def web_page(self, kicker, title, shots, paras, contents_title=None, img_span=3):
        """website chapter: one or two screenshots stacked on the left two thirds, text on the right"""
        side, n = self.side, self.num
        if contents_title: self.contents.append((contents_title, n))
        it = []
        h, y = self.head(side, kicker, title, w=span_w(4))
        it.append(h)
        iw = span_w(img_span)
        avail = BODY_BOTTOM - y
        k = len(shots)
        ih = min(iw * 0.625, (avail - (k - 1) * 10 - k * 34) / k)
        iw2 = ih / 0.625
        for j, (key, cap) in enumerate(shots):
            py = y + j * (ih + 44)
            it.append(self.d.image(col_x(side, 0), py, iw2, ih, self.L[key]))
            it.append(self.d.text(col_x(side, 0), py + ih + 2, iw2, 32, [P('DB Caption', cap)]))
        tx = col_x(side, 0) + iw2 + GUT
        it.append(self.d.text(tx, y, col_x(side, 3) + COLW - tx, BODY_BOTTOM - y, paras))
        it += self.folio(side, n)
        self.add(it)


# =========================================================================== content
def build_pages(doc, links):
    b = Book(doc, links)
    d = doc

    # ---------------------------------------------------------------- 4: contents (filled at the end)
    b.add([])                     # placeholder, replaced once page numbers are known
    # ---------------------------------------------------------------- 5: acknowledgements
    b.text_page('Acknowledgements', 'Thank you', [
        P('DB Body', 'I would like to thank my project guides for their feedback at every stage, which helped me narrow a large idea into one estuary and one clear question.'),
        P('DB Body', 'I am grateful to the people who work on the Kundapur estuary and spoke with me during my field visits. Their description of how fishing, shell collection and cage farming change through the year shaped the classes in this project.'),
        P('DB Body', 'Thank you to the faculty and staff of Srishti Manipal Institute of Art, Design and Technology, and to my classmates, for their discussion and support.'),
        P('DB Body', 'Finally, thank you to my family and friends for their patience and encouragement throughout the semester.'),
    ], span=2, contents_title='Acknowledgements')

    # ---------------------------------------------------------------- 6: abstract
    side, n = b.side, b.num
    it = []
    h, y = b.head(side, 'Abstract', 'Wetlands in Transition', w=span_w(4))
    it.append(h)
    ab = [
        P('DB Heading', 'Mapping change and development in Kundapur'),
        P('DB Body', 'This project studies the estuary beside Kundapur town in Karnataka and the mangroves within it. It compares how the land and water change over time with the way the Kundapura Master Plan 2031 divides the same ground into four fixed categories.'),
        P('DB Body', 'Google Earth Pro offered 22 dated satellite images of the study frame between 2011 and 2025. Seventeen were clear enough to trace. I traced every one of them by hand into ten classes, exported the traces as KML files and built six maps from them in QGIS. A scroll-driven 3D website rebuilds the maps from clouds of small dots so that the estuary can be explored rather than only read.'),
        P('DB Body', 'The images are few, were taken in different months and none show the monsoon. Tide levels were never recorded. The project treats this lack of data as part of its subject and asks how a place that keeps moving can be described by maps and plans that stay still.'),
    ]
    it.append(d.text(col_x(side, 0), y, span_w(3), BODY_BOTTOM - y, ab))
    it += b.folio(side, n)
    b.contents.append(('Abstract', n))
    b.add(it)

    # ---------------------------------------------------------------- 7: the project at a glance
    side, n = b.side, b.num
    it = [b.bg(side)]
    h, y = b.head(side, 'At a glance', 'The project in six numbers', w=span_w(4), white=True)
    it.append(h)
    figs = [('22', 'satellite dates logged, 2011 to 2025'), ('17', 'clear dates traced by hand'), ('10', 'classes traced on every date'),
            ('6', 'maps made in QGIS'), ('0', 'images from the monsoon months'), ('1', 'scroll-driven 3D website')]
    cw = (CW - 2 * GUT) / 3
    rh = (BODY_BOTTOM - y) / 2
    for k, (f, t) in enumerate(figs):
        r, c = divmod(k, 3)
        fx, fy = col_x(side, 0) + c * (cw + GUT), y + r * rh
        it.append(d.line(fx, fy + 6, fx + cw, fy + 6, 'Paper', 0.75))
        it.append(d.text(fx, fy + 16, cw, 60, [P('DB Big Figure White', f)]))
        it.append(d.text(fx, fy + 66, cw, 40, [P('DB Small White', t)]))
    it += b.folio(side, n, dark=True)
    b.add(it)

    # ================================================================ 01 INTRODUCTION
    b.title_page('01', 'Introduction', 'How the project began, how it changed direction and the question it now asks.')
    b.text_page('Introduction', 'Overview', [
        P('DB Body', 'This project looks at the estuary beside Kundapur town and the mangroves that sit within it. It began as a study of how boats are sheltered and became a study of how a changing wetland is recorded, mapped and planned for.'),
        P('DB Quote', 'How does the Kundapur estuary change across seasons and over time, and how does planning describe it?'),
        P('DB Body', 'To answer this I traced satellite imagery from 2011 to 2025 by hand, built six maps from the traces and compared what I found with the Kundapura Master Plan 2031. I also built an immersive website that rebuilds the maps in 3D, so that the way the estuary is put together and changes can be seen and not only read on paper.'),
        P('DB Subhead', 'How to read this book'),
        P('DB Body', 'The book follows the project in the order it happened. It starts with the site and the fieldwork, sets out the question and the thinking behind the method, explains the data and its gaps, and then describes the classification and the workflow. Each of the six maps is then explained in depth, with the map on the left page and its explanation beside it. The book ends with the website, the findings, the successes and challenges, and what could come next.'),
    ], span=3)

    b.text_page('Where the project started', 'From boat shelters to the estuary', [
        P('DB Body', 'I first chose Kundapur because of its large fishing and boat-building community. My plan was to compare how different groups shelter their boats. I expected to find different kinds of shelter for different kinds of boats and to map how each one worked.'),
        P('DB Body', 'The visit to Magnus Wharf, near Gangolli Port, changed this. There was one main shelter, and it was used by everything from ferries to small fishing boats. There was nothing to compare, so the idea did not hold.'),
        P('DB Body', 'Rather than force a comparison that was not there, I looked more closely at the surroundings. The boats stayed in the project, but as one of the things visible along the shore and not as the main subject.'),
    ], span=2, extra=lambda side, y: [d.image(col_x(side, 2), y, span_w(2), BODY_BOTTOM - y - 34, links['ph_canoes_rubble']),
                                      d.text(col_x(side, 2), BODY_BOTTOM - 30, span_w(2), 30, [P('DB Caption', 'Canoes drawn up on the rubble bank of the estuary.')])])

    b.photo_page('How the project shifted', 'Nothing around Kundapur stays the same for long', [
        ('ph_moss', 'Moss spreads across brick walls from the wettest grooves.'),
        (None, 'The clay pit of a tile factory that later became a bird sanctuary.'),
        ('ph_low_tide_mud', 'Ground near the mangroves that shows only at low tide.'),
    ], intro='Looking around the area showed me a different pattern. Moss spreads across brick walls from the wettest grooves. The clay pit of a tile factory later becomes a bird sanctuary. The ground under the mangroves, which is normally hidden by water, shows at low tide. I moved from asking where boats are kept to asking how the land and water around them keep changing.', cols=3, rows=1, caption_h=40)

    # ================================================================ 02 THE SITE
    b.title_page('02', 'The Site', 'Kundapur, the Panchagangavali estuary and the people who work on it. Why this stretch of water was chosen and why it needs to be mapped.')
    b.text_page('The site', 'Kundapur and its estuary', [
        P('DB Body', 'Kundapur sits on the Karnataka coast where the Panchagangavali river system meets the Arabian Sea, at about 13.639 degrees north and 74.692 degrees east. The study looks at one part of the estuary beside the town, with a curved stand of mangroves, a mud island, open water and a working shore.'),
        P('DB Body', 'The estuary is an ecological and livelihood hub for the local Kharvi community. Their work includes fishing, clam collection, and gathering, sorting and cleaning shellfish. This work follows the seasons and the tides.'),
        P('DB Body', 'Water levels move between high and low tide every few hours. Ground that is under water at one moment can be exposed as mudflat or estuary bed a few hours later. The edge between land and water is therefore a shifting condition and not a fixed line. This is the condition the whole project is built around.'),
    ], span=2, extra=lambda side, y: [d.image(col_x(side, 2), y, span_w(2), BODY_BOTTOM - y - 34, links['ph_wetland']),
                                      d.text(col_x(side, 2), BODY_BOTTOM - 30, span_w(2), 30, [P('DB Caption', 'Mangroves at the edge of the estuary, seen from the shore.')])])

    b.quad_page('Why the estuary', 'Four reasons for choosing this stretch of water', [
        ('The edge is not fixed', 'The same ground can be covered by water at one time and exposed at another. The estuary shows the problem the project studies in its clearest form.'),
        ('Mangroves and a mud island', 'It holds a stand of mangroves and a mud island. These are the clearest signs of the movement between land and water.'),
        ('People work here', 'Fishing, boats and shellfish farming all depend on where the water and the shore are on a given day.'),
        ('A plan covers it', 'The Kundapura Master Plan 2031 sorts this ground into fixed categories. That makes it possible to compare something that moves with something that does not.'),
    ])

    # choosing the frame
    side, n = b.side, b.num
    it = []
    h, y = b.head(side, 'Choosing the frame', 'From twenty years to one frame', w=span_w(4))
    it.append(h)
    tp = [P('DB Body', 'The feedback on my proposal said the project might be too big. It first aimed at 20 years, several sites and a possible immersive piece. I reduced it to one estuary frame and the years 2011 to 2025. I compared three candidate frames in Google Earth Pro and chose the smallest. It shows the curved mangrove stand, the mud island and the boats along the shore. It had the simplest edges and held every class I wanted to trace, which suited tracing many dates.')]
    th = measure(tp, span_w(4)) + 2
    it.append(d.text(col_x(side, 0), y, span_w(4), th, tp))
    y += th + 8
    fw = (CW - 2 * GUT) / 3
    fh = BODY_BOTTOM - y - 52
    for k, (key, cap) in enumerate([('frame_op1', 'Option 1, chosen. The smallest frame, with the mangrove stand, mud island and shore.'), ('frame_op2', 'Option 2. A wider view of the island and its channels.'), ('frame_op3', 'Option 3. The widest frame, with more mangroves and more complex edges.')]):
        fx = col_x(side, 0) + k * (fw + GUT)
        it.append(d.image(fx, y, fw, fh, links[key], mode='fit', stroke='WIT Accent' if k == 0 else None))
        it.append(d.text(fx, y + fh + 2, fw, 50, [P('DB Caption', cap)]))
    it += b.folio(side, n)
    b.add(it)

    # fieldwork
    b.text_page('Fieldwork', 'Walking the estuary', [
        P('DB Body', 'The field visits took place between 30 August and 2 September. I walked the shore at different times of day, photographed the water, the mud and the working edge, and spoke with people who work on the estuary.'),
        P('DB Body', 'They described how their work changes from month to month with the fish. When fishing is poor, some turn to collecting shells. They also described shellfish-farming areas marked in the water with thermocol and long rods. This is a fixed marker tied to something that never stays still. These areas are mapped in this project as cage farms.'),
        P('DB Body', 'The photographs record the working life of the estuary. They show still and reflective water, bamboo stakes, floating rectangular cage farms, canoes along rubble banks, shell heaps and clam baskets. They also show the mud island and the ground around the mangroves exposed at low tide, which later became the classes bed ground and muddy shallows.'),
    ], span=2, extra=lambda side, y: [d.image(col_x(side, 2), y, span_w(2), (BODY_BOTTOM - y) / 2 - 22, links['ph_cage_frames']),
                                      d.text(col_x(side, 2), y + (BODY_BOTTOM - y) / 2 - 20, span_w(2), 16, [P('DB Caption', 'Cage-farm frames and canoes on a still morning.')]),
                                      d.image(col_x(side, 2), y + (BODY_BOTTOM - y) / 2 + 2, span_w(2), (BODY_BOTTOM - y) / 2 - 22, links['ph_shell_heap']),
                                      d.text(col_x(side, 2), BODY_BOTTOM - 18, span_w(2), 16, [P('DB Caption', 'Shells gathered and sorted on the bank.')])],
        contents_title='Fieldwork')

    b.photo_page('Fieldwork', 'The working estuary', [
        ('ph_still_water', 'Still, reflective water at the start of the day.'),
        ('ph_stakes', 'Bamboo stakes standing in the shallows.'),
        ('ph_cage_frames2', 'Rectangular cage-farm frames in the water.'),
        ('ph_canoes_rubble', 'Canoes along the rubble bank.'),
        ('ph_shells', 'Shell heaps left on the shore.'),
        ('ph_clams', 'Clam baskets, sorted and ready.'),
    ], cols=3, rows=2, caption_h=36)

    # why Kundapur needs mapping
    b.text_page('Why Kundapur', 'Why this place needs to be mapped', [
        P('DB Body', 'Kundapur is a small and little studied place. While working on this project I found no open dataset that records where its land meets its water, how its tides behave, or which parts of its estuary are mangrove, mudflat or open water on a given date.'),
        P('DB Body', 'National and global sources such as the Ramsar country profile, Wetlands International and Global Mangrove Watch describe wetlands at a scale that says very little about this stretch of coast. The local plan describes the area in four fixed categories and carries no seasonal or tidal information.'),
        P('DB Body', 'At the same time, the estuary is changing. New infrastructure is planned along the water around the town, and the people who fish and farm shellfish here depend on where the water is from week to week. Decisions about the edge of the water are being made without a record of how that edge behaves.'),
        P('DB Body', 'This project is one small step towards that record. It shows what can be learned from the imagery that exists, and it makes clear what cannot be known without new data collection on the ground.'),
    ], span=3)

    b.quad_page('Missing data', 'What does not exist for this estuary', [
        ('Boundary data', 'There is no open, dated outline of the water, the mudflats or the mangroves. Every boundary in this project had to be traced by hand from satellite images.'),
        ('Tide data', 'No historical tide record exists for Kundapur. Online sources give forecasts for the coming days only. The tide at the moment each image was taken cannot be found.'),
        ('Class data', 'No source sorts the estuary into water, bed ground, muddy shallows and mangrove canopy. The ten classes used here were defined for this project.'),
        ('Seasonal imagery', 'Rain and cloud hide the estuary from June to September. There is no usable satellite image of the monsoon, when the wetland is likely to be at its fullest.'),
    ], contents_title='What is missing')

    # ================================================================ 03 THE QUESTION
    b.title_page('03', 'The Question', 'The question the project asks, the assumptions behind it and why it is approached as an exploration.')
    side, n = b.side, b.num
    it = []
    h, y = b.head(side, 'The question', 'What the project asks', w=span_w(4))
    it.append(h)
    q = [P('DB Quote', 'How does the Kundapur estuary change across seasons and over time, and how does planning describe it?')]
    qh = measure(q, span_w(4)) + 4
    it.append(d.text(col_x(side, 0), y, span_w(4), qh, q))
    y += qh + 6
    it.append(d.text(col_x(side, 0), y, span_w(4), 20, [P('DB Subhead Accent', 'The question rests on three assumptions')]))
    y += 24
    ass = [('The wetland expands after the monsoon and shrinks in other months.', 'The imagery can only partly test this, because none of the usable images fall in the monsoon.'),
           ('Some land marked as Developed Area or Agriculture Area overlaps with land that is Marshy Area or Water Sheet for part of the year.', 'The comparison with the plan in Map 5 is built to look for this.'),
           ('This overlap lies on or near land used by local communities, including the Kharvi fishing community.', 'Map 4 looks at the shore where boats are kept and shellfish are farmed.')]
    cw = (CW - 2 * GUT) / 3
    ch = 190
    for k, (a, note) in enumerate(ass):
        cx = col_x(side, 0) + k * (cw + GUT)
        it.append(d.rect(cx, y, cw, ch, 'WIT Accent', tint=10))
        it.append(d.text(cx + 12, y + 10, cw - 24, ch - 20, [P('DB Big Figure', str(k + 1)), P('DB Label', a), P('DB Small', note)]))
    y += ch + 12
    it.append(d.text(col_x(side, 0), y, span_w(4), BODY_BOTTOM - y, [P('DB Body', 'The project also asks how a lack of data shapes mapping and planning, and what that could mean for future policy, for the people who work in the estuary and for the wildlife that depends on it.')]))
    it += b.folio(side, n)
    b.add(it)

    b.text_page('An explorative lens', 'Why the project explores rather than proves', [
        P('DB Body', 'This is an explorative project. It does not set out to prove a single claim. It sets out to record a place carefully, with the data that exists, and to see what that record shows.'),
        P('DB Body', 'There are three reasons for this. First, Kundapur is a niche place. There is no boundary data for its estuary, no tide record and no published classification of its ground. Any claim about long term change would rest on data that does not exist.'),
        P('DB Body', 'Second, the imagery itself is thin. Most years have one image, the images fall in different months and none fall in the monsoon. A difference between two dates may come from the tide or the season and not from real change.'),
        P('DB Body', 'Third, the act of recording has value of its own. By tracing every usable date and keeping each trace, this project becomes an archive of what the estuary looked like on seventeen days between 2011 and 2025. Future work can build on it, test it and add to it as new data becomes available.'),
        P('DB Body', 'For these reasons, every map in this book describes differences between observations and not proven trends. Where the evidence is weak, the book says so.'),
    ], span=3, contents_title='An explorative lens')

    b.quad_page('Why these maps', 'Why these maps are needed', [
        ('To keep a record', 'The traces are a dated archive of a place that has no other record of its edges, mangroves and mudflats.'),
        ('To compare plan and ground', 'They make it possible to set the official plan beside what is actually visible on the ground.'),
        ('To show the gaps', 'They make the missing monsoon, the unknown tide and the uneven dates visible instead of hiding them.'),
        ('To give a base for future work', 'Future fieldwork, tide records or new imagery can be added to the same frame, classes and method.'),
    ])

    # ================================================================ 04 THE PLAN
    b.title_page('04', 'The Plan', 'The Kundapura Master Plan 2031, what it shows for the estuary and why it was set beside the observed ground.')
    side, n = b.side, b.num
    it = []
    h, y = b.head(side, 'The Kundapura Master Plan 2031', 'Four fixed categories', w=span_w(4))
    it.append(h)
    tp = [P('DB Body', 'The plan sheet used is Drawing No. 2 of the Kundapura Master Plan 2031 for the Kundapura Local Planning Area. It is the existing land utilisation sheet. It is marked provisional and is drawn at a scale of 1:15,000. It covers 1,741.74 hectares across the villages of Kasaba Kundapura, Vaderahobali and Hangaluru and sorts all of this land into four categories.')]
    th = measure(tp, span_w(4)) + 2
    it.append(d.text(col_x(side, 0), y, span_w(4), th, tp))
    y += th + 10
    # proportional bar of the four categories
    cats = [('Developed Area', 541.90, 31.11, 'Plan Developed'), ('Agriculture Area', 634.48, 36.43, 'Plan Agriculture'), ('Marshy Area', 28.06, 1.61, 'Plan Marshy'), ('Water Sheet', 537.30, 30.85, 'Plan Water')]
    y += 40
    bx, bw, bh = col_x(side, 0), CW, 46
    xx = bx
    for k, (nm, ha, pc, col) in enumerate(cats):
        w = bw * pc / 100
        it.append(d.rect(xx, y, w, bh, col))
        lx = xx if nm != 'Marshy Area' else xx - 40
        it.append(d.text(max(bx, min(lx, bx + bw - 150)), y + bh + 6, 150, 84, [P('DB Big Figure' if nm != 'Marshy Area' else 'DB Label Accent', f'{pc}%'), P('DB Label', nm), P('DB Small', f'{ha:,.2f} ha')]) if nm != 'Marshy Area' else
                  d.text(xx - 4, y - 36, 170, 34, [P('DB Label Accent', f'Marshy Area {pc}%'), P('DB Small', f'{ha:,.2f} ha')]))
        xx += w
    y += bh + 96
    tp = [P('DB Body', 'Marshy Area is only 1.61% of the planning area. It appears as two small patches in the river off the town\'s north shore. The river and flats around them are drawn as Water Sheet. The sheet has no seasonal or tidal information, and nothing explains how the marshy and water areas were measured. At 1:15,000 a line 0.5 mm thick covers about 7.5 metres on the ground, so small shifts near the edges cannot be read reliably.')]
    it.append(d.text(col_x(side, 0), y, span_w(4), BODY_BOTTOM - y, tp))
    it += b.folio(side, n)
    b.add(it)

    b.map_page('plan_crop', 'Kundapura Master Plan 2031, Drawing No. 2, existing land utilisation (provisional). Crop around the study area.')

    # plan versus ground
    side, n = b.side, b.num
    it = []
    h, y = b.head(side, 'Plan and ground', 'What the plan shows and what is there', w=span_w(4))
    it.append(h)
    colw = span_w(2)
    lx, rx = col_x(side, 0), col_x(side, 2)
    it.append(d.text(lx, y, colw, 20, [P('DB Subhead Accent', 'On the plan')]))
    it.append(d.text(rx, y, colw, 20, [P('DB Subhead Accent', 'On the ground, 25 February 2025')]))
    y += 24
    it.append(d.rect(lx, y, colw, 70, 'Plan Water'))
    it.append(d.text(lx + 12, y + 12, colw - 24, 50, [P('DB Label', 'Water Sheet'), P('DB Small', 'The whole study frame is one category.')]))
    obs = [('Water', 'Water', 'open water across most of the frame'), ('Mangrove canopy', 'Mangrove canopy', 'six patches on the central bed'),
           ('Bed ground', 'Bed ground', 'exposed on 13 of the 17 dates'), ('Muddy shallows', 'Muddy shallows', 'traced on 5 of the 17 dates'),
           ('Land edge', 'Land edge', 'a line that moves between dates'), ('Boats', 'Boats', '27 boats along the water\'s edge'), ('Cage farms', 'Cage farms', '9 shellfish-farming areas offshore')]
    for k, (col, nm, note) in enumerate(obs):
        oy = y + k * 26
        it.append(d.rect(rx, oy + 2, 14, 14, col))
        it.append(d.text(rx + 22, oy, colw - 22, 22, [('DB Small', [(nm + '  ', {'bold': True}), (note, {})])]))
    y += 7 * 26 + 10
    tp = [P('DB Body', 'On the plan, the whole of the study frame falls inside the Water Sheet category. On the ground, the same area holds water, a mangrove canopy, a mud island whose bed is exposed on most dates, muddy shallows, a moving land edge and a working shore with boats and cage farms. A single category hides all of this.'),
          P('DB Body', 'The paper Aquapelagic Entanglements in the Panchagangavali Region by Deepta Sateesh and Vigna Priya Adhanki supports this reading. It reports that the plan shows new infrastructure along the water around Kundapura town and argues that its four categories leave no room for the zones between land and water.')]
    it.append(d.text(col_x(side, 0), y, span_w(4), BODY_BOTTOM - y, tp))
    it += b.folio(side, n)
    b.add(it)

    # ================================================================ 05 RELAXATION
    b.title_page('05', 'Relaxation', 'The idea of algorithmic relaxation, why it suits a wetland and how it shapes the maps and the website.')
    side, n = b.side, b.num
    it = []
    h, y = b.head(side, 'Algorithmic relaxation', 'Loosening a strict rule', w=span_w(4))
    it.append(h)
    tp = [P('DB Body', 'From the book Algorithms to Live By by Brian Christian and Tom Griffiths, I took the idea of relaxation. In computing, a problem with a strict rule can be very hard to solve. Relaxation loosens the rule into a trade-off so that a workable answer can be found. A yes or no becomes a matter of degree.'),
          P('DB Body', 'This fits the estuary closely. The Master Plan treats marshy ground and water as two strict categories. The estuary does not behave like that. A patch of ground can be water on one date and exposed mud on another. Instead of asking whether a place is water or land, I ask how often it was seen as water, as bed ground or as mangrove canopy across the dates.')]
    th = measure(tp, span_w(4)) + 2
    it.append(d.text(col_x(side, 0), y, span_w(4), th, tp))
    y += th + 12
    # diagram: strict rule versus relaxed rule
    lx, rx = col_x(side, 0), col_x(side, 2)
    it.append(d.text(lx, y, span_w(2), 20, [P('DB Subhead Accent', 'A strict rule')]))
    it.append(d.text(rx, y, span_w(2), 20, [P('DB Subhead Accent', 'A relaxed rule')]))
    y += 24
    it.append(d.rect(lx, y, span_w(1), 44, 'Water'))
    it.append(d.rect(lx + span_w(1), y, span_w(1) + GUT, 44, 'Bed ground'))
    it.append(d.text(lx, y + 50, span_w(2), 40, [P('DB Small', 'Every place is either water or land. The line between them is drawn once.')]))
    for k in range(17):
        cx = rx + 8 + k * (span_w(2) - 16) / 16
        it.append(d.oval(cx, y + 22, 8, 'Water', tint=int(12 + 88 * k / 16)))
    it.append(d.text(rx, y + 50, span_w(2), 40, [P('DB Small', 'Each place is water on some of the 17 dates. The answer is a share, from never to every date.')]))
    y += 100
    it.append(d.text(col_x(side, 0), y, span_w(4), BODY_BOTTOM - y, [P('DB Body', 'This turns a hard boundary into a gradient. It explains why I chose to record where something was seen and how often, and not to give each place one permanent label. It is the idea behind Map 2.')]))
    it += b.folio(side, n)
    b.add(it)

    # how relaxation is used
    side, n = b.side, b.num
    it = []
    h, y = b.head(side, 'Relaxation in practice', 'From traces to a share of dates', w=span_w(4))
    it.append(h)
    steps = [('Trace', 'Every date is traced by hand into classes.'), ('Grid', 'The frame is cut into cells of 1.5 by 1.5 metres.'),
             ('Count', 'For each cell, count the dates it was traced as water.'), ('Share', 'Divide by the dates that covered the cell.'),
             ('Band', 'Group the shares into eight bands of 12.5%.')]
    sw = (CW - 4 * 12) / 5
    for k, (a, t) in enumerate(steps):
        sx = col_x(side, 0) + k * (sw + 12)
        it.append(d.rect(sx, y, sw, 92, 'WIT Accent', tint=12 if k % 2 else 22))
        it.append(d.text(sx + 10, y + 8, sw - 20, 80, [P('DB Label Accent', f'{k + 1}  {a}'), P('DB Small', t)]))
    y += 106
    tp = [P('DB Body', 'I wrote a short Python script to do the counting for Map 2, because the count runs over thousands of cells and seventeen dates. The script only produces the numbers. I designed and made the map itself in QGIS.')]
    th = measure(tp, span_w(4)) + 2
    it.append(d.text(col_x(side, 0), y, span_w(4), th, tp))
    y += th + 6
    # staircase: area that counts as water at each threshold
    it.append(d.text(col_x(side, 0), y, span_w(4), 20, [P('DB Subhead Accent', 'How much counts as water depends on the rule')]))
    y += 22
    ar = PTS['persistence']['water_area_by_threshold_m2']
    ch = BODY_BOTTOM - y - 34
    bw = (CW - 16 * 4) / 17
    mx = max(ar.values())
    for k in range(1, 18):
        v = ar[str(k)]
        hh = ch * v / mx
        bx = col_x(side, 0) + (k - 1) * (bw + 4)
        it.append(d.rect(bx, y + ch - hh, bw, hh, 'Water', tint=int(30 + 70 * k / 17)))
    it.append(d.text(col_x(side, 0), y + ch + 4, span_w(4), 30, [P('DB Small', f'Water on at least 1 of 17 dates: {ar["1"]:,.0f} m². Water on all 17 dates: {ar["17"]:,.0f} m². Each bar is one rule, from at least 1 date (left) to all 17 (right).')]))
    it += b.folio(side, n)
    b.add(it)

    # Map 2 figures
    side, n = b.side, b.num
    it = []
    h, y = b.head(side, 'What relaxation reveals', 'A large changing zone, a small fixed core', w=span_w(4))
    it.append(h)
    rows = [('Water', '668', '18,884', '19,552'), ('Mangrove canopy', '0', '3,069', '3,069'), ('Exposed sediment', '0', '17,359', '17,359')]
    it.append(d.text(col_x(side, 1), y, span_w(1), 34, [P('DB Label', 'Every date (m²)')]))
    it.append(d.text(col_x(side, 2), y, span_w(1), 34, [P('DB Label', 'Changes between dates (m²)')]))
    it.append(d.text(col_x(side, 3), y, span_w(1), 34, [P('DB Label', 'At least one date (m²)')]))
    y += 36
    for k, (nm, a, c, e) in enumerate(rows):
        ry = y + k * 70
        it.append(d.line(col_x(side, 0), ry, col_x(side, 3) + COLW, ry, 'WIT Accent', 0.75))
        it.append(d.text(col_x(side, 0), ry + 10, span_w(1), 40, [P('DB Heading', nm)]))
        for j, v in enumerate((a, c, e)):
            it.append(d.text(col_x(side, 1 + j), ry + 6, span_w(1), 50, [P('DB Big Figure', v)]))
    y += 3 * 70 + 10
    it.append(d.text(col_x(side, 0), y, span_w(4), BODY_BOTTOM - y, [
        P('DB Body', 'Across the study rectangle, only 668 square metres were water on every one of the seventeen dates. Almost all of the rest moves between classes. No cell was mangrove canopy or exposed sediment on every date. The zone that changes is far larger than the zone that stays the same, and it is exactly this zone that a fixed category cannot describe.'),
        P('DB Body', 'On the website the same idea becomes a slider. The visitor chooses how many of the 17 dates a place must be water to count as water, and watches the area change from 19,058 to 799 square metres.')]))
    it += b.folio(side, n)
    b.add(it)

    # ================================================================ 06 RESEARCH AND DATA
    b.title_page('06', 'Research and Data', 'What was read, which sources were checked and why Google Earth Pro became the main source of evidence.')
    b.text_page('Research', 'Reading, fieldwork and imagery', [
        B('DB Body', 'Reading.', 'The reading covered the Master Plan sheet, the paper by Sateesh and Adhanki and the book by Christian and Griffiths. For background, I also read parts of the Ramsar country profile for India, the Wetlands International page on valuing wetlands and the Global Mangrove Watch data. These explain how wetlands are described and valued, but they work at a national or global scale and say little about this coast.'),
        B('DB Body', 'Fieldwork and conversations.', 'Field visits and conversations with people who work on the estuary shaped the classes. They explained the seasonal rhythm of fishing and shell collection and the way shellfish-farming areas are marked in the water.'),
        B('DB Body', 'The imagery.', 'The main evidence is a set of dated satellite images from Google Earth Pro covering 2011 to 2025. Most years have one image and a few have two or three. They were taken at random points in the year and none fall in the monsoon. The seasonal pattern is therefore hard to see, and a difference between two images may come from the season or the tide and not from a real change.'),
        B('DB Body', 'Rainfall.', 'Because the imagery cannot show the monsoon, I added daily rainfall from NASA POWER so that each observation could be read against the rain that came before it. This became Map 6.'),
    ], span=3)

    # sources as cards
    side, n = b.side, b.num
    it = []
    h, y = b.head(side, 'Sources checked', 'Where else the data could have come from', w=span_w(4))
    it.append(h)
    cards = [('USGS EarthExplorer', 'Offers GeoTIFF files for automated classification. Not used for the maps because a fixed pixel classification is the approach the project questions.', 'Not used'),
             ('Copernicus and Sentinel Hub', 'Regular coverage, but the pixels are too coarse to show boats, the edge of the mangrove canopy and the buildings.', 'Not used'),
             ('Bhuvan', 'Explored for imagery and tools. It did not give the same run of dated images of one frame.', 'Not used'),
             ('NASA blogs and SOAR Atlas', 'Useful for understanding how coastal change is seen from space. No imagery of this site.', 'Context'),
             ('Ramsar, Wetlands International, Global Mangrove Watch', 'Background on wetlands and mangrove extent at national and global scale.', 'Context'),
             ('Tides Atlas and Tides4Fishing', 'Kundapur tide forecasts for the coming days only. No historical records.', 'Not usable'),
             ('FES2022 (AVISO)', 'A global tide model for the open coast. Needs registration and cannot give the tide at an image\'s capture time.', 'Not usable'),
             ('NASA POWER rainfall', 'Open daily rainfall with no account needed. A complete record for the site. Used for Map 6.', 'Used')]
    cw = (CW - 3 * 12) / 4
    chh = (BODY_BOTTOM - y - 12) / 2
    for k, (t, desc, verdict) in enumerate(cards):
        r, c = divmod(k, 4)
        cx, cy = col_x(side, 0) + c * (cw + 12), y + r * (chh + 12)
        used = verdict == 'Used'
        it.append(d.rect(cx, cy, cw, chh, 'WIT Accent', tint=None if used else 10))
        it.append(d.text(cx + 10, cy + 10, cw - 20, chh - 20, [P('DB Kicker White' if used else 'DB Kicker', verdict), P('DB Label White' if used else 'DB Label', t), P('DB Small White' if used else 'DB Small', desc)]))
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
    ], span=3)

    # ================================================================ 07 GAPS
    b.title_page('07', 'Gaps in the Record', 'Why tide data, cyclone data and monsoon images are not part of the maps, and what that means for reading them.')
    b.text_page('Tide', 'Why tide data was not used', [
        P('DB Body', 'Tide is central to this estuary. Ground that is water at high tide can be mud a few hours later. Ideally each satellite image would carry the tide level at the moment it was taken. I looked for this in several places.'),
        B('DB Bullet', 'Tides Atlas and Tides4Fishing.', 'Both give tide forecasts for Kundapur, but only for the next few days. Neither keeps historical records.'),
        B('DB Bullet', 'Tide gauges.', 'There is no public tide gauge at Kundapur. The nearest long records, at Karwar and Mangalore, are published only as monthly averages, which cannot show the tide on a given day.'),
        B('DB Bullet', 'FES2022.', 'This global tide model can predict the tide on the open coast for any time. It needs a registration, and it does not resolve the narrow channels of the estuary.'),
        B('DB Bullet', 'Capture time.', 'Google Earth Pro gives the date of each image but not the time. A tide prediction needs the hour and minute, and the tide changes every few hours.'),
        P('DB Body', 'Any tide value attached to an image would therefore be invented. I chose to leave the tide unknown and to say so on every map. A difference between two dates is read as a difference between observations, which may be partly tidal, and not as a proven change.'),
    ], span=3)

    side, n = b.side, b.num
    it = []
    h, y = b.head(side, 'Cyclones', 'Why cyclone data was not used', w=span_w(2))
    it.append(h)
    it.append(d.text(col_x(side, 0), y, span_w(2), BODY_BOTTOM - y, [
        P('DB Body', 'I studied storm activity in the North Indian Ocean between 2010 and 2025 using the International Best Track Archive for Climate Stewardship, kept by NOAA. It brings the records of the different agencies, including the India Meteorological Department, into one file.'),
        P('DB Body', 'I kept only the storms whose track came within 500 km of Kundapur and grouped them by wind strength on the IMD scale. I then checked which storms passed in the 30 days before each of my seventeen dates.'),
        P('DB Body', 'Only one did. Cyclone Maha passed about 206 km away before the image of 26 November 2019. No other observation followed a nearby storm. With one case, storms cannot explain the differences between dates, so cyclone data was not carried into the six maps.'),
    ]))
    mw = span_w(2)
    mh = mw / 1.414
    it.append(d.image(col_x(side, 2), y, mw, mh, links['map7'], mode='fit', stroke='Grey Line'))
    it.append(d.text(col_x(side, 2), y + mh + 4, mw, 40, [P('DB Caption', 'Cyclones and Storms Around the Estuary. A study map made to test the storm data. It was not carried into the final set.')]))
    it += b.folio(side, n)
    b.add(it)

    # monsoon calendar
    side, n = b.side, b.num
    it = []
    h, y = b.head(side, 'The monsoon', 'Why there are no monsoon images', w=span_w(4))
    it.append(h)
    tp = [P('DB Body', 'From June to September the monsoon brings heavy rain and thick cloud to this coast. In Google Earth Pro, every image from these months was either missing or hidden by cloud. All seventeen usable dates fall between November and May. The wetland at its fullest, which is probably the most important season for the estuary, is missing from the record. The chart below places every traced date in its month.')]
    th = measure(tp, span_w(4)) + 2
    it.append(d.text(col_x(side, 0), y, span_w(4), th, tp))
    y += th + 14
    months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    mwid = CW / 12
    gh = BODY_BOTTOM - y - 40
    it.append(d.rect(col_x(side, 0) + 5 * mwid, y, 4 * mwid, gh, 'WIT Accent'))
    it.append(d.text(col_x(side, 0) + 5 * mwid + 10, y + 10, 4 * mwid - 20, 60, [P('DB Label White', 'Monsoon'), P('DB Small White', 'No usable image')]))
    per = {}
    for dd in MAN['dates']:
        m = int(dd['iso'][5:7])
        per.setdefault(m, []).append(dd['iso'])
    for mi in range(12):
        mx = col_x(side, 0) + mi * mwid
        it.append(d.line(mx, y, mx, y + gh, 'Grey Line', 0.5))
        it.append(d.text(mx + 4, y + gh + 6, mwid - 8, 16, [P('DB Label', months[mi])]))
        for k, iso in enumerate(sorted(per.get(mi + 1, []))):
            it.append(d.oval(mx + mwid / 2, y + gh - 16 - k * 26, 9, 'Water'))
    it.append(d.text(col_x(side, 0), y + gh + 22, span_w(4), 16, [P('DB Small', 'Each circle is one traced date, placed in its month. December to February holds most of them.')]))
    it += b.folio(side, n)
    b.add(it)

    # ================================================================ 08 DATES
    b.title_page('08', 'Choosing the Dates', 'Which images were traced, which were removed and why a smaller set of clear dates was preferred.')
    side, n = b.side, b.num
    it = []
    h, y = b.head(side, 'The date log', 'Seventeen of twenty-two', w=span_w(4))
    it.append(h)
    tp = [P('DB Body', 'I logged every date that Google Earth Pro offered for the study frame and marked each one as usable, cloudy or missing. This came to 22 dates between 2011 and 2025. Seventeen were chosen for tracing and five were removed. There was no suitable image at all for 2012 or 2023. A removed date is treated as a gap and never as a date with no water or no change.')]
    th = measure(tp, span_w(4)) + 2
    it.append(d.text(col_x(side, 0), y, span_w(4), th, tp))
    y += th + 16
    traced = [dd['iso'] for dd in MAN['dates']]
    removed = ['2016-02-16', '2018-03-08', '2019-05-28', '2020-05-28', '2020-12-21']
    yrs = list(range(2011, 2026))
    yw = CW / len(yrs)
    ty = y + 70
    it.append(d.line(col_x(side, 0), ty, col_x(side, 0) + CW, ty, 'Black', 1))
    for k, yr in enumerate(yrs):
        x = col_x(side, 0) + k * yw
        it.append(d.line(x, ty - 4, x, ty + 4, 'Black', 1))
        it.append(d.text(x + 2, ty + 8, yw, 16, [P('DB Label', str(yr)[2:] if False else str(yr))]) if k % 1 == 0 else '')
        if yr in (2012, 2023):
            it.append(d.rect(x + 1, ty - 60, yw - 2, 56, 'Grey Line', tint=25))
            it.append(d.text(x + 4, ty - 56, yw - 8, 40, [P('DB Small', 'no image')]))

    def xpos(iso):
        yr, mo, da = int(iso[:4]), int(iso[5:7]), int(iso[8:10])
        return col_x(side, 0) + (yr - 2011 + (mo - 1) / 12 + (da - 1) / 365) * yw
    stack = {}
    for iso in sorted(traced + removed):
        x = xpos(iso)
        key = round(x / 12)
        lvl = stack.get(key, 0)
        stack[key] = lvl + 1
        cy = ty - 14 - lvl * 18
        if iso in removed:
            it.append(d.oval(x, cy, 7, None, stroke='Cage farms', sw=1.6))
            it.append(d.line(x - 5, cy - 5, x + 5, cy + 5, 'Cage farms', 1.6))
        else:
            it.append(d.oval(x, cy, 7, 'Water'))
    y = ty + 34
    lg = [('Water', 'Traced (17)'), ('Cage farms', 'Removed (5)'), ('Grey Line', 'No image that year')]
    for k, (col, lab) in enumerate(lg):
        lx = col_x(side, 0) + k * 170
        if k == 1:
            it.append(d.oval(lx + 7, y + 8, 7, None, stroke='Cage farms', sw=1.6))
        else:
            it.append(d.oval(lx + 7, y + 8, 7, col, tint=25 if k == 2 else None))
        it.append(d.text(lx + 20, y, 140, 18, [P('DB Small', lab)]))
    y += 34
    it.append(d.text(col_x(side, 0), y, span_w(2), BODY_BOTTOM - y, [P('DB Subhead Accent', 'A date was removed if'),
        P('DB Bullet', 'cloud, haze or blur hid the classes'), P('DB Bullet', 'a seam between image tiles crossed the frame'), P('DB Bullet', 'the resolution was too low to trace')]))
    it.append(d.text(col_x(side, 2), y + 20, span_w(2), BODY_BOTTOM - y - 20, [
        P('DB Bullet', 'there was no image of the frame on that date'), P('DB Bullet', 'the frame mixed captures from different days, which would mix tide, season and year in one trace')]))
    it += b.folio(side, n)
    b.add(it)

    b.photo_page('Removed dates', 'The five dates that were not traced', [
        ('removed_2016_02_16', '16 February 2016'), ('removed_2018_03_08', '8 March 2018'), ('removed_2019_05_28', '28 May 2019'),
        ('removed_2020_05_28', '28 May 2020'), ('removed_2020_12_21', '21 December 2020'), (None, ''),
    ], intro='These are the shoreline views of the removed dates as they appear in Google Earth Pro. In each one, haze, blur, low contrast or a mixed capture made the edges between classes too uncertain to trace honestly. I preferred a smaller set of clear dates to a larger set that included guesses, because a guessed trace would show differences caused by image quality and not by the estuary.', cols=3, rows=2, caption_h=20)
    # remove the empty sixth slot outline on that page: replace with a note
    b.pages[-1] = (b.pages[-1][0], [x for x in b.pages[-1][1] if 'StrokeType="StrokeStyle/$ID/Dashed"' not in x])

    # the 17 traced dates
    side, n = b.side, b.num
    it = []
    h, y = b.head(side, 'The traced dates', 'Seventeen observations, 2011 to 2025', w=span_w(4))
    it.append(h)
    cols, rows = 6, 3
    gw = (CW - (cols - 1) * 10) / cols
    gh = (BODY_BOTTOM - y - (rows - 1) * 8) / rows - 18
    for k, dd in enumerate(MAN['dates']):
        r, c = divmod(k, cols)
        px, py = col_x(side, 0) + c * (gw + 10), y + r * (gh + 26)
        it.append(d.image(px, py, gw, gh, links['date_' + dd['id']]))
        it.append(d.text(px, py + gh + 2, gw, 16, [P('DB Label', fmt_date(dd['iso']))]))
    px, py = col_x(side, 0) + 5 * (gw + 10), y + 2 * (gh + 26)
    it.append(d.text(px, py, gw, gh + 18, [P('DB Small', 'Every image is shown at the same frame. Notice how differently the same ground looks from one date to the next.')]))
    it += b.folio(side, n)
    b.add(it)

    # ================================================================ 09 CLASSIFICATION
    b.title_page('09', 'Classifying the Estuary', 'The ten classes, how each one was traced in Google Earth Pro and how QGIS turns the traces into map symbols.')
    side, n = b.side, b.num
    it = []
    h, y = b.head(side, 'Classes', 'Seven classes for the estuary', w=span_w(4))
    it.append(h)
    tp = [P('DB Body', 'Before tracing, I separated what is physically visible from what is a mapped class. Each class has one definition, one shape type and one colour, and it is applied the same way on every date.')]
    th = measure(tp, span_w(4)) + 2
    it.append(d.text(col_x(side, 0), y, span_w(4), th, tp))
    y += th + 6
    cls = [('Water', 'Polygon', 'The water surface visible on that date.'),
           ('Muddy shallows', 'Polygon', 'Muddy ground in shallow water that is not clearly exposed bed.'),
           ('Bed ground', 'Polygon', 'Exposed sediment or estuary bed. Sediment seen only through water counts as water.'),
           ('Mangrove canopy', 'Polygon', 'The visible canopy only, not the full habitat or roots.'),
           ('Land edge', 'Line', 'The visible boundary between land and water or exposed bed.'),
           ('Boats', 'Point', 'Each boat visible on that date.'),
           ('Cage farms', 'Point', 'Shellfish-farming areas marked in the water.')]
    it += class_cards(d, side, y, cls, BODY_BOTTOM)
    it += b.folio(side, n)
    b.add(it)

    side, n = b.side, b.num
    it = []
    h, y = b.head(side, 'Classes', 'Three classes for the shoreline', w=span_w(4))
    it.append(h)
    tp = [P('DB Body', 'For the shoreline and settlement map, three more classes were traced on two dates, 11 April 2011 and 25 February 2025. These dates were chosen because they are the earliest and latest in the record and the shore is clear in both.')]
    th = measure(tp, span_w(4)) + 2
    it.append(d.text(col_x(side, 0), y, span_w(4), th, tp))
    y += th + 6
    cls2 = [('Tree cover', 'Polygon', 'The visible band of canopy behind the track, mostly palms.'),
            ('Track', 'Polygon', 'The reddish unpaved strip along the shore, traced as an area.'),
            ('Buildings', 'Polygon', 'Roofs or walls that can be seen, so the count is a minimum.')]
    yy = y
    it += class_cards(d, side, y, cls2, y + 140)
    y += 150
    it.append(d.text(col_x(side, 0), y, span_w(4), BODY_BOTTOM - y, [
        P('DB Body', 'I traced the track as a polygon and not a line because it is wide enough to show its real extent and how close it sits to the water and the buildings. Buildings were traced as polygons in Google Earth Pro but are drawn as point symbols in QGIS, because they are small and their outlines are often hidden by palm canopy.'),
        P('DB Body', 'Each item was named by class and date, for example water_2025_02_25 or tree_cover_2011_04_11. These names matter, because QGIS uses them to apply the class symbols.')]))
    it += b.folio(side, n)
    b.add(it)

    # GEP versus QGIS
    side, n = b.side, b.num
    it = []
    h, y = b.head(side, 'Google Earth Pro and QGIS', 'How a trace becomes a classified map', w=span_w(4))
    it.append(h)
    flow = [('Google Earth Pro', 'One folder per date. Each drawing is a placemark with a name such as bed_ground_2022_05_07 and a colour I picked by hand.'),
            ('KML file', 'Each folder is saved as KML. It keeps the shape, position and name of every drawing, but no class field and no style that QGIS reads.'),
            ('QGIS layers', 'Each date loads as three layers, one each for polygons, lines and points, in WGS 84 / UTM zone 43N.'),
            ('Rule-based styles', 'A rule reads each name. If the name contains water, the shape is drawn as Water. The same rules run on every date.')]
    fw = (CW - 3 * 26) / 4
    for k, (a, t) in enumerate(flow):
        fx = col_x(side, 0) + k * (fw + 26)
        it.append(d.rect(fx, y, fw, 150, 'WIT Accent', tint=12))
        it.append(d.text(fx + 10, y + 10, fw - 20, 132, [P('DB Label Accent', a), P('DB Small', t)]))
        if k < 3:
            it.append(d.line(fx + fw + 4, y + 75, fx + fw + 22, y + 75, 'WIT Accent', 2))
    y += 164
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
    b.title_page('10', 'Workflow', 'The steps from a satellite image to a finished map, and the prototypes and edits along the way.')
    side, n = b.side, b.num
    it = []
    h, y = b.head(side, 'Workflow', 'From Google Earth Pro to QGIS', w=span_w(4))
    it.append(h)
    steps = [('Set the frame', 'One fixed polygon around the study area, including the mangroves.'),
             ('Log the dates', 'Every image marked usable, cloudy or missing.'),
             ('Trace each date', 'One folder per date, each class with its own shape.'),
             ('Trace the shore', 'Tree cover, track and buildings for 2011 and 2025.'),
             ('Export', 'Each folder saved as a KML file named by date.'),
             ('Load and clean', 'Layers loaded in QGIS, one stray point removed from a 2024 outline.'),
             ('Project and style', 'WGS 84 / UTM zone 43N, one symbol per class.'),
             ('Make the maps', 'A3 layouts with the same border, fonts, scale bar and legend.')]
    cw = (CW - 3 * 16) / 4
    chh = (BODY_BOTTOM - y - 90) / 2
    for k, (a, t) in enumerate(steps):
        r, c = divmod(k, 4)
        cx, cy = col_x(side, 0) + c * (cw + 16), y + r * (chh + 16)
        it.append(d.oval(cx + 20, cy + 20, 18, 'WIT Accent'))
        it.append(d.text(cx + 8, cy + 9, 24, 24, [P('DB Label White', str(k + 1))]))
        it.append(d.text(cx, cy + 46, cw, chh - 46, [P('DB Label', a), P('DB Small', t)]))
        if c < 3:
            it.append(d.line(cx + 44, cy + 20, cx + cw + 10, cy + 20, 'WIT Accent', 1))
    y = y + 2 * (chh + 16)
    it.append(d.text(col_x(side, 0), y, span_w(4), BODY_BOTTOM - y, [P('DB Body', 'A first test with two dates, February 2024 and February 2025, let me check the whole process before tracing the full set. Where an edge was unclear, I made a best estimate and noted it beside that trace.')]))
    it += b.folio(side, n)
    b.add(it)

    # iterations timeline
    side, n = b.side, b.num
    it = []
    h, y = b.head(side, 'Prototypes and edits', 'How the project changed shape', w=span_w(4))
    it.append(h)
    its = [('Narrowing', 'From 20 years and several sites to one frame and 2011 to 2025.'),
           ('Tracing method', 'From one box polygon to separate classes and one folder per date.'),
           ('Two-date test', 'February 2024 and February 2025 traced first to test the process.'),
           ('Map style mock-ups', 'Persistence, change and textured paper versions. The textured style was kept.'),
           ('Map layouts', 'Every map on the same A3 page, with alignment fixes and fewer notes.'),
           ('Map 4 reframed', 'Cropped to the shoreline strip, with a locator image and richer symbols.'),
           ('Adding rainfall', 'Map 6 added to stand in for the missing monsoon.'),
           ('The website', 'From a pixelated scroll page to a full 3D journey.')]
    ty = y + 20
    it.append(d.line(col_x(side, 0), ty, col_x(side, 0) + CW, ty, 'WIT Accent', 2))
    sw = CW / 8
    for k, (a, t) in enumerate(its):
        x = col_x(side, 0) + k * sw + sw / 2
        it.append(d.oval(x, ty, 8, 'WIT Accent'))
        it.append(d.text(x - sw / 2 + 4, ty + 16 + (k % 2) * 0, sw - 8, BODY_BOTTOM - ty - 16, [P('DB Label', a), P('DB Small', t)]))
    it += b.folio(side, n)
    b.add(it)

    # tools
    side, n = b.side, b.num
    it = []
    h, y = b.head(side, 'Tools and data', 'What each tool was used for', w=span_w(4))
    it.append(h)
    tools = [('Google Earth Pro', 'Dated satellite imagery, hand tracing and KML export.'), ('QGIS 3.44', 'Loading and cleaning the traces, measuring areas, styling and making the six map layouts.'),
             ('WGS 84 / UTM zone 43N', 'A projection in metres that keeps the maps north-up.'), ('Esri World Imagery', 'Satellite base and context on Map 1. Not from the observation date.'),
             ('Python', 'Counting the persistence of each class for Map 2 and the rainfall totals for Map 6.'), ('NASA POWER', 'Daily rainfall for the study site, used for Map 6.'),
             ('Master Plan 2031, Drawing No. 2', 'The planning categories compared in Map 5.'), ('Three.js, GSAP and Vite', 'The website, its 3D scenes and its scroll-driven story.')]
    cw = (CW - 12) / 2
    rh = (BODY_BOTTOM - y) / 4
    for k, (t, u) in enumerate(tools):
        r, c = divmod(k, 2)
        cx, cy = col_x(side, 0) + c * (cw + 12), y + r * rh
        it.append(d.line(cx, cy, cx + cw, cy, 'WIT Accent', 0.75))
        it.append(d.text(cx, cy + 8, 170, rh - 10, [P('DB Label Accent', t)]))
        it.append(d.text(cx + 180, cy + 8, cw - 180, rh - 10, [P('DB Small', u)]))
    it += b.folio(side, n)
    b.add(it)

    # ================================================================ 11 THE SIX MAPS
    b.title_page('11', 'The Six Maps', 'Each map answers one question. Each is shown on the left with its full explanation beside it.')
    side, n = b.side, b.num
    it = []
    h, y = b.head(side, 'Why six maps', 'One question per map', w=span_w(4))
    it.append(h)
    tp = [P('DB Body', 'No single map can describe a place that changes. A map of the water alone would hide the mangroves. A map of one date would hide the movement. A map of the plan would hide what is actually on the ground. The project therefore uses six maps, read in a set order, which share the same page, fonts, colours and symbols so that a class looks the same wherever it appears.')]
    th = measure(tp, span_w(4)) + 2
    it.append(d.text(col_x(side, 0), y, span_w(4), th, tp))
    y += th + 12
    mq = [('1', 'The Estuary as a Landscape', 'What is this place physically?'), ('2', 'Patterns of Wetness and Vegetation', 'Where does each class stay, and where does it vary?'),
          ('3', 'The Estuary Through Time', 'How did the visible patterns differ between dates?'), ('4', 'The Estuary as a Lived Landscape', 'How does the shore relate to human activity?'),
          ('5', 'The Estuary Between Plan and Ground', 'How does the plan compare with what was observed?'), ('6', 'The Estuary and the Monsoon', 'How wet was the season before each date?')]
    cw = (CW - 5 * 10) / 6
    for k, (num, t, q) in enumerate(mq):
        cx = col_x(side, 0) + k * (cw + 10)
        it.append(d.rect(cx, y, cw, BODY_BOTTOM - y, 'WIT Accent', tint=10 + k * 15 if k < 5 else None))
        white = k >= 4
        it.append(d.text(cx + 8, y + 8, cw - 16, BODY_BOTTOM - y - 16, [P('DB Big Figure White' if white else 'DB Big Figure', num), P('DB Label White' if white else 'DB Label', t), P('DB Small White' if white else 'DB Small', q)]))
    it += b.folio(side, n)
    b.add(it)

    # ---------------- Map 1
    b.map_page('map1', 'Map 1. The Estuary as a Landscape. 25 February 2025.')
    b.text_page('Map 1', 'The Estuary as a Landscape', [
        B('DB Body', 'What it shows.', 'Map 1 introduces the estuary as one connected place before any comparison is made. It is drawn for 25 February 2025, the clearest date in the set. Water, muddy shallows, bed ground and mangrove canopy are drawn as textured areas, the land edge as a line, and boats and cage farms as points. A dashed white line marks the traced frame. An inset places the study area in the wider landscape of river, town and coast.'),
        B('DB Body', 'Why it was made.', 'It gives the reader a shared picture of the study area. It names every class and shows where each one sits, so that the later maps can be read without confusion. It also sets the physical baseline: the curved mangrove stand, the open water, the boats along the shore and the cage farms offshore are all visible together.'),
        B('DB Body', 'How to read it.', 'Treat it as the key to the whole set. The colours and textures used here are the same on every other map. Start at the legend, find each class on the map, then use the inset to see where the frame sits in the estuary.'),
    ], span=3, contents_title='Map 1. The Estuary as a Landscape')
    b.quad_page('Map 1', 'Reading Map 1 in detail', [
        ('Water covers most of the frame', ['On this date water covers about 32,655 square metres of the frame. No bed ground was traced, so the mud island is fully under water.']),
        ('Six patches of mangrove', ['The mangrove canopy was traced as six patches on the central bed, about 2,371 square metres in all. Only the visible canopy is traced, not the roots or the full habitat.']),
        ('A working shore', ['27 boats line up along the water\'s edge. Nine cage farms sit offshore in the open water. The land edge runs along the shore as a single line.']),
        ('Limits', ['It shows one date only. The satellite base is Esri World Imagery and is not from the observation date, so it gives context only. The traced classes are the evidence.']),
    ])

    # ---------------- Map 2
    b.map_page('map2', 'Map 2. Patterns of Wetness and Vegetation. 17 observations, 2011 to 2025.')
    b.text_page('Map 2', 'Patterns of Wetness and Vegetation', [
        B('DB Body', 'What it shows.', 'Map 2 is the main analytical map. It has three panels. The first shows water persistence, the second mangrove canopy persistence and the third how often exposed sediment appeared. For each 1.5 metre cell, it shows how often that cell was traced as the class across the 17 dates, as a colour ramp from 0% to 100%.'),
        B('DB Body', 'Why it was made.', 'This is where the relaxation idea becomes visible. The Master Plan gives each place one fixed label. Map 2 records how often each place was seen as water, bed ground or mangrove canopy. It separates ground that is always wet or always vegetated from ground that moves between states.'),
        B('DB Body', 'How to read it.', 'A strong colour means the class was seen on many dates and a pale colour on few. Where no colour is drawn, the ground was never that class. A place that is mid-toned in both the water panel and the sediment panel changes often. The dashed line marks the area covered by all 17 dates, which is the area analysed.'),
    ], span=3, contents_title='Map 2. Patterns of Wetness and Vegetation')
    b.quad_page('Map 2', 'How Map 2 was made and what it reveals', [
        ('The calculation', ['A Python script counts, for every cell, the dates on which it was traced as each class, and the dates whose trace covered it. The share is the first number divided by the second.']),
        ('The map', ['I styled the three layers in QGIS in eight equal bands of 12.5%, each with a colour ramp in the class\'s own colour family, and laid out the panels myself.']),
        ('What it reveals', ['Only 668 square metres were water on every date. 18,884 square metres changed between water and other classes. No cell was mangrove or exposed sediment on every date.']),
        ('Limits', ['Persistence carries the gaps of the record. Tide was not recorded, so some variation may be tidal. Three 2022 dates weigh more than single years. It describes the dry season only.']),
    ])

    # ---------------- Map 3
    b.map_page('map3', 'Map 3. The Estuary Through Time. Six observations at the same extent, scale and colours.')
    b.text_page('Map 3', 'The Estuary Through Time', [
        B('DB Body', 'What it shows.', 'Map 3 is a sequence of small maps from six clear dates: 11 April 2011, 24 February 2014, 8 December 2017, 23 December 2020, 7 May 2022 and 17 February 2024. All share the same extent, scale and colours and each carries its date. They show water, muddy shallows, bed ground, mangrove canopy, the land edge, boats and cage farms.'),
        B('DB Body', 'Why it was made.', 'It lets the reader compare the estuary with itself across fourteen years. It also makes the uneven gaps in the record visible, because the dates are not evenly spaced and fall in different months. It shows how thin the evidence is as well as what it contains.'),
        B('DB Body', 'How to read it.', 'Compare the panels side by side. Look at the size of the exposed ground, the shape of the mangrove stand and the amount of water. Because the dates fall in different months, differences are described as differences between observations and not as long term change.'),
    ], span=3, contents_title='Map 3. The Estuary Through Time')
    b.quad_page('Map 3', 'What changes between the panels', [
        ('Muddy ground in 2011', ['In April 2011 a large area of muddy shallows fills the top of the frame, about 13,412 square metres. By 2014 it has almost gone from the traces.']),
        ('The mangroves appear', ['Mangrove canopy is traced in 2011, is absent from the traces of 2013 to 2016, and is present on every date from December 2017, growing in the later panels.']),
        ('Cage farms arrive', ['Cage farms first appear in the record in November 2018 and are traced on every later date. In this map they appear from the 2020 panel onwards.']),
        ('Limits', ['Six dates are shown for clarity. The other eleven are traced but not drawn here. Tide is unknown for every date, so a large change between two panels may be tidal.']),
    ])

    # ---------------- Map 4
    b.map_page('map4', 'Map 4. The Estuary as a Lived Landscape. 11 April 2011 and 25 February 2025.')
    b.text_page('Map 4', 'The Estuary as a Lived Landscape', [
        B('DB Body', 'What it shows.', 'Map 4 compares the shoreline strip on 25 February 2025 and 11 April 2011 in two panels with the same extent and scale. Each panel shows the water, muddy shallows and bed ground, tree cover, the track, buildings, boats and cage farms. A locator image from Google Earth Pro shows where the strip sits in the estuary.'),
        B('DB Body', 'Why it was made.', 'The estuary is not only a natural system. Fishing, boats, shellfish farming and the settlement along the shore all depend on where the water is. This map shows how close the track, the buildings and the working shore sit to the water\'s edge, and it shows what is on the ground beside the estuary that the plan does not describe.'),
        B('DB Body', 'How to read it.', 'Look at the distance between the water, the track, the band of trees and the buildings. In 2025 the boats line up along the water\'s edge and the cage farms sit offshore. The 2011 panel gives a point of comparison for the shape of the strip.'),
    ], span=3, contents_title='Map 4. The Estuary as a Lived Landscape')
    side, n = b.side, b.num
    it = []
    h, y = b.head(side, 'Map 4', 'What sits beside the changing edge', w=span_w(4))
    it.append(h)
    cmp_ = [('Boats', 20, 27), ('Cage farms', 0, 9), ('Buildings', 6, 11)]
    cw = (CW - 2 * GUT) / 3
    for k, (nm, a, c) in enumerate(cmp_):
        cx = col_x(side, 0) + k * (cw + GUT)
        it.append(d.rect(cx, y, cw, 120, nm))
        it.append(d.text(cx + 12, y + 10, cw - 24, 104, [P('DB Label White', nm), ('DB Big Figure White', [(f'{a}  ', {}), ('to  ', {'size': 18}), (f'{c}', {})]), P('DB Small White', 'traced in 2011 and in 2025')]))
    y += 136
    it.append(d.text(col_x(side, 0), y, span_w(2), BODY_BOTTOM - y, [
        P('DB Subhead Accent', 'Reading the counts'),
        P('DB Body', 'More boats, cage farms and buildings were traced in 2025 than in 2011. These are counts of what could be seen on two days, not a census. Buildings are hard to see under palm canopy and shadow, so their count is a minimum.')]))
    it.append(d.text(col_x(side, 2), y, span_w(2), BODY_BOTTOM - y, [
        P('DB Subhead Accent', 'Limits'),
        P('DB Body', 'The 2011 image is blurry, so buildings and boats are only shown where they can be made out reliably. The 2011 track looks narrower, but the images differ in resolution, so this is not treated as a finding. The map does not say who uses these areas or how.')]))
    it += b.folio(side, n)
    b.add(it)

    # ---------------- Map 5
    b.map_page('map5', 'Map 5. The Estuary Between Plan and Ground. Master Plan 2031 beside 25 February 2025.')
    b.text_page('Map 5', 'The Estuary Between Plan and Ground', [
        B('DB Body', 'What it shows.', 'Map 5 places the Master Plan existing land use sheet beside the observed landscape. The left side shows the plan with its own categories and a key for Developed Area, Agriculture Area, Marshy Area and Water Sheet, with a bar of their shares. The right side shows the same ground as observed on 25 February 2025, with the traced classes over the satellite view.'),
        B('DB Body', 'Why it was made.', 'This is the map that tests the project\'s main assumption. The plan divides land into four fixed categories, and the estuary does not behave in that way. By putting the two side by side, the reader can see where the plan agrees with the ground and where it does not.'),
        B('DB Body', 'How to read it.', 'Find the same place on both sides and ask whether the plan\'s category matches what was seen. In the study frame the answer is clear. The plan shows only Water Sheet, while the ground holds water, a mangrove canopy, bed ground that is exposed on most dates, muddy shallows, a land edge, boats and cage farms.'),
    ], span=3, contents_title='Map 5. The Estuary Between Plan and Ground')
    b.quad_page('Map 5', 'What the comparison shows', [
        ('One category for many', ['Everything inside the study frame falls in a single category on the plan. The traced classes show at least five different kinds of ground and water in the same space.']),
        ('Marshy Area is small', ['Marshy Area is only 1.61% of the 1,741.74 hectare planning area. The mangroves and mudflats of this frame are not part of it.']),
        ('No time on the plan', ['The sheet is headed existing land utilisation. It shows one moment and carries no seasonal or tidal information. A Kannada note on it carries the date 20/12/2008, which I could not confirm.']),
        ('Limits', ['The plan crop is not georeferenced, so it sits beside the traces and not over them. A line 0.5 mm thick on the plan covers about 7.5 metres. Differences are treated as questions and not errors.']),
    ])

    # ---------------- Map 6
    b.map_page('map6', 'Map 6. The Estuary and the Monsoon. Rainfall before each of the 17 observations.')
    b.text_page('Map 6', 'The Estuary and the Monsoon', [
        B('DB Body', 'What it shows.', 'Map 6 shows the rainfall at Kundapur before each of the 17 observation dates. Each date is drawn as a small map of the estuary in the same colours as the other maps and carries two bars. The first is the total rain of the monsoon, June to September, before the date. The second is the rain of the 30 days before the date.'),
        B('DB Body', 'Why it was made.', 'All 17 dates fall in the dry season, so the monsoon, which probably does most to shape the estuary, is missing from the imagery. Map 6 cannot show the monsoon itself, but it shows how much rain came before each observation.'),
        B('DB Body', 'How to read it.', 'Read each small map with its two bars. A long monsoon bar means a wet season came before the date. A long 30 day bar means rain fell shortly before the image was taken. Compare dates that look different and check whether the rainfall differs too. Treat any match as a clue and not as proof.'),
    ], span=3, contents_title='Map 6. The Estuary and the Monsoon')
    # rainfall chart
    side, n = b.side, b.num
    it = []
    h, y = b.head(side, 'Map 6', 'The rain before each observation', w=span_w(4))
    it.append(h)
    tp = [P('DB Body', 'Daily rainfall came from the NASA POWER daily point service for 13.639 N, 74.692 E, from 1 June 2010 to 25 February 2025. I used a short Python script to add up, for each date, the rain of the monsoon before it and the rain of the 30 days before it. I made the map itself in QGIS.')]
    th = measure(tp, span_w(4)) + 2
    it.append(d.text(col_x(side, 0), y, span_w(4), th, tp))
    y += th + 8
    ch = BODY_BOTTOM - y - 100
    n17 = len(MAN['dates'])
    bw = (CW - (n17 - 1) * 6) / n17
    mx = 4000
    for k, dd in enumerate(MAN['dates']):
        r = dd['rainfall']
        bx = col_x(side, 0) + k * (bw + 6)
        h1 = ch * r['monsoon_mm'] / mx
        it.append(d.rect(bx, y + ch - h1, bw * 0.62, h1, 'Rain Monsoon'))
        h2 = max(1.5, ch * 0.6 * r['prior30_mm'] / 80)
        it.append(d.rect(bx + bw * 0.66, y + ch - h2, bw * 0.34, h2, 'Rain 30'))
        dm_, yr_ = fmt_date(dd['iso']).rsplit(' ', 1)
        it.append(d.text(bx - 3, y + ch + 4, bw + 6, 32, [P('DB Small', dm_), P('DB Small', yr_)]))
    it.append(d.line(col_x(side, 0), y + ch, col_x(side, 0) + CW, y + ch, 'Black', 0.75))
    ly = y + ch + 40
    it.append(d.rect(col_x(side, 0), ly + 4, 12, 12, 'Rain Monsoon'))
    it.append(d.text(col_x(side, 0) + 18, ly + 2, 330, 16, [P('DB Small', 'Monsoon before the date (2,272 to 3,848 mm)')]))
    it.append(d.rect(col_x(side, 2), ly + 4, 12, 12, 'Rain 30'))
    it.append(d.text(col_x(side, 2) + 18, ly + 2, 330, 48, [P('DB Small', '30 days before, drawn on a larger scale (up to 79.8 mm, before 7 May 2022). Five dates had none and a sixth had 0.01 mm.')]))
    it += b.folio(side, n)
    b.add(it)
    b.text_page('Map 6', 'Sources and limits of the rainfall', [
        P('DB Body', 'Several rainfall sources were considered before NASA POWER. CHIRPS has a fine grid of about 5 km. IMD gridded rainfall is the official Indian record but its cell is about 27 km and its files are issued per year. KSNDMC publishes gauge data for Kundapura taluk, but the open version holds only annual totals. A NOAA copy of the CHIRPS daily series had most values missing.'),
        P('DB Body', 'NASA POWER was chosen because it is open, needs no account and returned a complete daily record for the site. Its values come from the MERRA-2 dataset on a grid of about 50 km.'),
        P('DB Subhead Accent', 'Limits'),
        P('DB Bullet', 'Rainfall is a regional estimate and not a measurement at the estuary.'),
        P('DB Bullet', 'The map does not show tide, river flow or storms.'),
        P('DB Bullet', 'It does not prove that a rainfall total caused a mapped difference. A test of rainfall against the traced areas across the 17 dates found no significant link.'),
    ], span=3)

    # findings
    b.quad_page('Findings', 'What the maps show', [
        ('The plan describes the estuary as fixed', ['Marshy Area is 1.61% of the planning area and Water Sheet 30.85%. The sheet has no seasonal or tidal information, so it cannot show the same ground as water, mud and shore at different times.']),
        ('The imagery shows the edge moving', ['In April 2011 large areas of bed ground and muddy shallows are exposed inside the frame. In February 2025 the same ground is under water. Tide was not recorded, so this is not read as long term change.']),
        ('A small fixed core', ['Only 668 square metres were water on every date. The zone between the mangroves and the open water is where the classes change from date to date.']),
        ('Use sits close to the edge', ['In 2025 boats line up along the water\'s edge, cage farms sit offshore, the track runs between the water and a band of trees, and buildings sit behind.']),
    ], contents_title='Findings')
    b.quad_page('Findings', 'What the maps suggest', [
        ('The mangroves have grown', ['Mangrove canopy rose from none in the 2013 to 2016 traces to about 2,750 square metres in the study rectangle in 2025. This is the only class with a clear trend.']),
        ('Dates differ more than years', ['The dates are few, uneven and in different months. The differences are therefore described as differences between observations, and the monsoon is missing from every one.']),
        ('Rainfall gives context, not causes', ['Every observation fell in the dry season. Monsoon totals before the dates range from 2,272 to 3,848 mm. This does not show that rainfall caused any mapped difference.']),
        ('A gap in planning', ['A plan with four fixed categories and no seasonal or tidal data cannot describe land that moves between water and ground. This matters most where people work on the shore.']),
    ])

    # ================================================================ 12 THE WEBSITE
    b.title_page('12', 'The Website', 'Why the maps became an immersive website, how its story is structured and what each part is for.')
    b.text_page('The website', 'Why a website', [
        P('DB Body', 'A paper map shows only the finished result. The website shows how the estuary is put together and how it changes, so that the gaps between observations can be felt as well as read. It accompanies the printed maps and does not replace them. It is designed for a jury on a laptop and for a television at the exhibition.'),
        B('DB Body', 'Earlier versions.', 'My first prototype was a scrolling page in Three.js and GSAP that revealed each layer in turn with a pixelated gradient style. It was hard to read, so I set it aside. It was later rebuilt as a Light Table version and then redesigned completely into the current immersive journey.'),
        B('DB Body', 'Feedback.', 'Reviews asked for a clear narrative, so that a visitor understands what each map is for without me in the room. They also suggested a way to compare my hand tracing with an automated one, which became the last chapter.'),
        P('DB Subhead Accent', 'Three references'),
        B('DB Bullet', 'Blue Marine Foundation, The Sea We Breathe.', 'How scrolling can carry a visitor through a rich world and into its sections.'),
        B('DB Bullet', 'Penderecki\'s Garden.', 'How land can be drawn in 3D as clusters of dots that form layers.'),
        B('DB Bullet', 'Blobmixer.', 'How a single animated form can carry the colour and texture of one element. Each class became one such form.'),
    ], span=3)

    side, n = b.side, b.num
    it = []
    h, y = b.head(side, 'The website', 'The journey, from top to bottom', w=span_w(4))
    it.append(h)
    jr = [('Earth', 'The Earth glows in space, then spins quickly onto Kundapur.'), ('Clouds', 'A thick layer of cloud, a reminder that no monsoon image exists.'),
          ('Arrival', 'The 2025 image appears as coloured dots over the estuary.'), ('Ten classes', 'Each class becomes a moving 3D form with its own texture.'),
          ('Six maps', 'Each map rebuilt in 3D from dots that lift into layers.'), ('Tunnels', 'The dots of one map form a tunnel into the next.'),
          ('Model', 'Manual and automated tracing compared, with change and scenarios.'), ('Conclusion', 'The edge between land and water is not a line.')]
    cw = (CW - 3 * 16) / 4
    chh = (BODY_BOTTOM - y - 16) / 2
    for k, (a, t) in enumerate(jr):
        r, c = divmod(k, 4)
        cx, cy = col_x(side, 0) + c * (cw + 16), y + r * (chh + 16)
        it.append(d.rect(cx, cy, cw, chh, 'WIT Accent', tint=12 + k * 11))
        white = k >= 5
        it.append(d.text(cx + 10, cy + 10, cw - 20, chh - 20, [P('DB Big Figure White' if white else 'DB Big Figure', str(k + 1)), P('DB Label White' if white else 'DB Label', a), P('DB Small White' if white else 'DB Small', t)]))
    it += b.folio(side, n)
    b.add(it)

    b.text_page('How it is built', 'Tools and data behind the website', [
        B('DB Bullet', 'Three.js', 'draws the 3D scenes. GSAP and ScrollTrigger tie every movement to the scroll, and Vite runs and builds the site.'),
        B('DB Bullet', 'The traces', 'are converted into the website\'s data in the same metre grid as the QGIS maps. The original KML files and images are never changed.'),
        B('DB Bullet', 'Each screenshot', 'is approximately registered to its traces, so images and traces line up.'),
        B('DB Bullet', 'Every trace and screenshot', 'is turned into clouds of small coloured dots. This is the website\'s visual language.'),
        P('DB Subhead Accent', 'Design decisions'),
        B('DB Body', 'Colour and texture.', 'Each class keeps its colour family from the maps. Shades were adjusted so that similar classes are easier to tell apart in 3D, for example tree cover is a brighter green than mangrove canopy.'),
        B('DB Body', 'Legends and navigation.', 'Every map has a complete legend set as quiet text. A thin line on the right, like a traced shoreline, shows progress and jumps to any chapter.'),
        B('DB Body', 'Pacing and honesty.', 'The scroll is long so each change unfolds slowly. Every limitation stays visible on the page: the unknown tide, the regional rainfall, the missing monsoon and the approximate registration.'),
    ], span=3)

    b.web_page('Website', 'Opening: from space to Kundapur', [('web_earth', 'The opening. The Earth in space.'), ('web_approach', 'The approach to Kundapur.')], [
        P('DB Body', 'The site opens in space with the Earth glowing beside the sun. On scroll it enlarges and spins quickly onto the coast of Karnataka.'),
        P('DB Body', 'The purpose is orientation. Before any map, the visitor learns where Kundapur is and how small the study area is in relation to the planet.'),
        P('DB Body', 'The first text names the place and the people: the estuary as an ecological and livelihood hub for the Kharvi community.')])
    b.web_page('Website', 'Clouds and arrival', [('web_clouds', 'The cloud layer.'), ('web_arrival', 'Arrival over the estuary, 25 February 2025.')], [
        P('DB Body', 'The visitor passes through a thick layer of cloud. It is the website\'s way of saying that no usable monsoon image exists, because rain and cloud hide the estuary from June to September.'),
        P('DB Body', 'Below the cloud, the 25 February 2025 image appears as coloured dots, each one taking the colour of the satellite image at that point. This is the frame in which every date was traced.')])
    b.web_page('Website', 'The ten classes', [('web_specimen_mangrove', 'Mangrove canopy as a specimen.'), ('web_specimen_tree', 'Tree cover as a specimen.')], [
        P('DB Body', 'Each class is shown as a specimen: one moving 3D form with its own colour, texture and shine. Water ripples, bed ground is grainy, mangroves form crowns and buildings are faceted.'),
        P('DB Body', 'Beside each specimen, its definition and its traced area or count are given. A small reference map lights up where the class was traced.'),
        P('DB Body', 'The purpose is to learn the vocabulary of the maps before seeing them, so that every later dot can be recognised by its colour and texture.')])
    b.web_page('Website', 'Map 1 in 3D', [('web_map1_layers', 'The classes lift into layers.'), ('web_map1_mangrove', 'A close look at the mangroves.')], [
        P('DB Body', 'Map 1 is rebuilt from clustered dots. The classes lift apart into separate layers, so the visitor sees each one on its own, then settle back into one estuary.'),
        P('DB Body', 'The camera then visits two parts of the same landscape: the mangroves on the central bed and the working shore with its boats and cage farms.'),
        P('DB Body', 'Each map shows only the classes of its printed legend.')], contents_title='The website, map by map')
    b.web_page('Website', 'Map 2 and Map 3 in 3D', [('web_map2_threshold', 'Map 2. One ball per date that a cell was water.'), ('web_map3_stack', 'Map 3. All 17 dates stacked in order.')], [
        P('DB Body', 'In Map 2 every cell rises as a column with one ball for each date it was traced as water. A slider lets the visitor choose how many dates count as water, which turns relaxation into something they can try.'),
        P('DB Body', 'In Map 3 all 17 dates are stacked in date order. The camera climbs the stack date by date, each year labelled, with cloud between dates where a monsoon passed.')])
    b.web_page('Website', 'Map 4 and Map 5 in 3D', [('web_map4', 'Map 4. The shoreline with 3D forms.'), ('web_map5', 'Map 5. The plan beside the ground.')], [
        P('DB Body', 'Map 4 shows the shoreline with real 3D forms over each year\'s satellite image: houses, boat hulls, cage-farm rafts with rods, a raised track and a tree canopy. The forms are symbols at an indicative size, and the page says so.'),
        P('DB Body', 'Map 5 sets the plan, printed as halftone dots, beside the observed traces, with towers showing the four planning shares, one ball for each per cent.')])
    b.web_page('Website', 'Map 6 and the tunnels', [('web_map6', 'Map 6. Rainfall towers around the estuary.'), ('web_tunnel', 'A tunnel made of the map\'s own dots.')], [
        P('DB Body', 'Map 6 circles the 17 rainfall towers in date order. Rain falls over the estuary, and its density follows the 30 day total of the date in focus.'),
        P('DB Body', 'Between chapters, the dots of the map being left lift out and form a tunnel around the visitor. They stream past and settle into the next map. The tunnels are built from the maps themselves, so the journey never leaves the estuary.')])

    # model chapter
    b.web_page('Website', 'Manual and automated tracing', [('web_model_change', 'What is changing.'), ('web_model_both', 'Hand tracing below, the model above.')], [
        P('DB Body', 'The last chapter asks whether a computer could trace what I traced by hand. A random forest classifier, built in Python with scikit-learn and OpenCV, learnt the classes from the colour and texture of every 0.5 metre cell.'),
        P('DB Body', 'Each date was classified by a model trained only on the other sixteen, so every result is on a date the model never saw.'),
        P('DB Body', 'The chapter answers three questions: what is changing, how reliably it can be identified, and what might happen next.')], contents_title='Manual and automated tracing')

    side, n = b.side, b.num
    it = []
    h, y = b.head(side, 'Model results', 'How close the model came to the hand tracing', w=span_w(4))
    it.append(h)
    pooled = MLM['pooled']
    figs = [(f'{round(pooled["overall_accuracy"] * 100)}%', 'of traced cells matched by the model'), (f'{round(MLM["baseline_overall_accuracy"] * 100)}%', 'for a simple colour-only method'),
            (f'{MLM["land_edge"]["median_of_medians_m"]:.1f} m', 'median distance from the traced land edge')]
    cw = (CW - 2 * GUT) / 3
    for k, (f, t) in enumerate(figs):
        cx = col_x(side, 0) + k * (cw + GUT)
        it.append(d.rect(cx, y, cw, 96, 'WIT Accent', tint=None if k == 0 else 14))
        it.append(d.text(cx + 12, y + 10, cw - 24, 80, [P('DB Big Figure White' if k == 0 else 'DB Big Figure', f), P('DB Small White' if k == 0 else 'DB Small', t)]))
    y += 112
    it.append(d.text(col_x(side, 0), y, span_w(4), 20, [P('DB Subhead Accent', 'F1 score by class, from 0 to 1')]))
    y += 24
    order = [('water', 'Water', 'Water'), ('bed_ground', 'Bed ground', 'Bed ground'), ('mangrove_canopy', 'Mangrove canopy', 'Mangrove canopy'), ('muddy_shallows', 'Muddy shallows', 'Muddy shallows')]
    bw = span_w(3) - 140
    for k, (key, lab, col) in enumerate(order):
        f1 = pooled['classes'][key]['f1']
        ry = y + k * 30
        it.append(d.text(col_x(side, 0), ry + 2, 140, 18, [P('DB Label', lab)]))
        it.append(d.rect(col_x(side, 0) + 140, ry + 2, bw, 16, 'Grey Line', tint=20))
        it.append(d.rect(col_x(side, 0) + 140, ry + 2, max(2, bw * f1), 16, col))
        it.append(d.text(col_x(side, 0) + 146 + bw, ry + 2, 80, 18, [P('DB Label', f'{f1:.2f}')]))
    y += 4 * 30 + 10
    it.append(d.text(col_x(side, 0), y, span_w(4), BODY_BOTTOM - y, [
        P('DB Body', 'The model found water and exposed bed well. It could not reproduce muddy shallows at all. It split those cells between bed ground (55%) and water (43%). This supports muddy shallows as a judgement made by eye, because by definition the ground cannot be clearly identified. Tree cover and track could not be judged, because they were traced on only two dates. Some disagreement also comes from the reference itself, because the images are only approximately registered and their tide state is unknown.')]))
    it += b.folio(side, n)
    b.add(it)

    an = CHG['analysis']['mangrove_canopy']
    sc = an['scenarios']['values']
    b.web_page('Model', 'What might happen next', [('web_model_scenario', 'The mangrove canopy, by the date it was first traced.')], [
        P('DB Body', f'Inside the rectangle that every date covers, mangrove canopy is the only class with a significant trend: about {round(an["observed"]["slope_m2_per_year"])} square metres a year. The model\'s own readings show the same trend.'),
        P('DB Body', f'Continued at the same rate, the canopy would reach about {sc["continuation"]["2035"]:,.0f} square metres by 2035. At 1.5 times the rate, about {sc["accelerated"]["2035"]:,.0f}. At half the rate, about {sc["reduced"]["2035"]:,.0f}.'),
        P('DB Body', 'These are hypothetical scenarios and not predictions. Water, bed ground and muddy shallows have no trend, and their extent depends on the unknown tide, so no scenario is given for them. No tide model was built, because no tide record exists for these dates.')], img_span=2)

    b.web_page('Website', 'The conclusion', [('web_finale', 'Everything settles back into one estuary.')], [
        P('DB Body', 'At the end, every element settles back into one estuary, with the line that sums up the project.'),
        P('DB Quote', 'The edge between land and water is not a line.'),
        P('DB Body', 'The site turns a set of maps and dates into a story a visitor can move through: first finding the place, then learning its classes, then comparing its dates, its people, its plan and its rain.')])

    # ================================================================ 13 REFLECTION
    b.title_page('13', 'Reflection', 'What worked, what was difficult, what I learned and what could come next.')
    side, n = b.side, b.num
    it = []
    h, y = b.head(side, 'Successes and challenges', 'What worked and what was difficult', w=span_w(4))
    it.append(h)
    it.append(d.rect(col_x(side, 0), y, span_w(2), BODY_BOTTOM - y, 'WIT Accent', tint=10))
    it.append(d.text(col_x(side, 0) + 12, y + 10, span_w(2) - 24, BODY_BOTTOM - y - 20, [P('DB Subhead Accent', 'What worked'),
        P('DB Bullet', 'Moving from boat shelters to the changing estuary gave the project a clear subject.'),
        P('DB Bullet', 'Narrowing to one frame and 2011 to 2025 made it possible to finish.'),
        P('DB Bullet', 'One folder per date and consistent names gave data that loaded cleanly into QGIS.'),
        P('DB Bullet', 'Logging every date gave a clear reason for each removal.'),
        P('DB Bullet', 'Tracing by hand kept every decision visible.'),
        P('DB Bullet', 'Map 6 gave some context for the missing monsoon.')]))
    it.append(d.rect(col_x(side, 2), y, span_w(2), BODY_BOTTOM - y, 'WIT Accent'))
    it.append(d.text(col_x(side, 2) + 12, y + 10, span_w(2) - 24, BODY_BOTTOM - y - 20, [P('DB Kicker White', 'What was difficult'),
        P('DB Bullet White', 'The first idea failed because there was nothing to compare.'),
        P('DB Bullet White', 'Google Earth Pro cannot export georeferenced imagery.'),
        P('DB Bullet White', 'Tile seams forced some dates to be dropped.'),
        P('DB Bullet White', 'No tide was recorded for any image.'),
        P('DB Bullet White', 'Map 4 first looked empty and had to be reframed.'),
        P('DB Bullet White', 'Finding a usable rainfall source took several attempts.')]))
    it += b.folio(side, n)
    b.add(it)

    b.text_page('Reflection', 'What the project taught me', [
        P('DB Body', 'The main thing this project showed me is how much any map depends on the date it was made. The Master Plan sheet fixes one moment in a place that keeps moving. My own images fix seventeen moments, which is better, but they still leave long gaps and miss the monsoon entirely.'),
        P('DB Body', 'My maps can show the estuary changing, but they cannot show how it behaves across a full year. I say this openly in the findings and I do not assume that nothing changed between the dates.'),
        P('DB Body', 'If I did the project again, I would log the available dates and check them for clarity and seams before tracing anything, and I would narrow the scope earlier. The fallback in my timeline was useful, because the work never depended on a single document or tool.'),
        P('DB Body', 'The project does not claim to settle how the estuary behaves. What it offers is a record made carefully from the data that exists, and a clear view of what a fixed category can and cannot describe.'),
    ], span=3)

    b.quad_page('Future scope', 'What could come next', [
        ('Find a monsoon image', ['Search other archives for a usable image from June to September, so that the wetland at its fullest can be traced.']),
        ('Recover the tide', ['Confirm the capture time of each image from the satellite providers, so that the tide on the day can be estimated.']),
        ('Collect local data', ['Compare the regional rainfall with a local gauge, and add ground surveys of the mudflats and mangrove edge.']),
        ('Complete the plan', ['Obtain the written report of the Master Plan and the proposed land use drawing, and record how people use the shore with the community.']),
    ], contents_title='Future scope')

    b.text_page('References', 'Sources', [
        P('DB Small', 'Christian, Brian, and Tom Griffiths. 2016. Algorithms to Live By: The Computer Science of Human Decisions. New York: Henry Holt and Company.'),
        P('DB Small', 'Sateesh, Deepta, and Vigna Priya Adhanki. 2026. Aquapelagic Entanglements in the Panchagangavali Region. Geo: Geography and Environment 13, no. 1, e70073.'),
        P('DB Small', 'Town Planning Authority, Kundapura. Kundapura Master Plan 2031 (Provisional), Existing Land Utilization, Drawing No. 2, scale 1:15,000.'),
        P('DB Small', 'Google LLC. Google Earth Pro. Historical satellite imagery, 2011 to 2025.'),
        P('DB Small', 'NASA Prediction Of Worldwide Energy Resources (POWER). Daily point data. power.larc.nasa.gov'),
        P('DB Small', 'NOAA NCEI. International Best Track Archive for Climate Stewardship (IBTrACS), version 4.'),
        P('DB Small', 'QGIS Development Team. QGIS Geographic Information System, version 3.44.'),
        P('DB Small', 'Ramsar Convention. Country profile, India. ramsar.org'),
        P('DB Small', 'Wetlands International. Valuing wetlands. wetlands.org'),
        P('DB Small', 'Global Mangrove Watch. globalmangrovewatch.org'),
        P('DB Small', 'USGS EarthExplorer, Copernicus Browser and Bhuvan, consulted as alternative imagery sources.'),
        P('DB Small', 'Blue Marine Foundation, The Sea We Breathe. Penderecki\'s Garden. Blobmixer by 14islands. Website references.'),
    ], span=3, contents_title='References')

    # ---------------------------------------------------------------- closing page (right)
    side, n = b.side, b.num
    it = [d.image(0, TOP - 9, PW + 9, PH + 18, links['ph_mud_island'])]
    it.append(d.rect(0, BOT - M - 120, PW + 9, 120 + M + 9, 'WIT Accent'))
    it.append(d.text(col_x(side, 0), BOT - M - 104, span_w(4), 70, [P('DB Quote White', 'The edge between land and water is not a line.'), P('DB Small White', 'The mud island in the Kundapur estuary, seen during the field visit.')]))
    it += b.folio(side, n, dark=True)
    b.add(it)

    # ---------------------------------------------------------------- contents (page 4)
    if len(b.pages) % 2:
        raise SystemExit(f'odd number of content pages ({len(b.pages)}): the book must end on a full spread')
    b.pages[0] = ('L', contents_page(b))
    return b.pages


def class_cards(d, side, y, cls, bottom):
    n = len(cls)
    cols = 4 if n > 3 else 3
    rows = (n + cols - 1) // cols
    cw = (CW - (cols - 1) * 12) / cols
    chh = (bottom - y - (rows - 1) * 12) / rows
    out = []
    for k, (nm, shape, defi) in enumerate(cls):
        r, c = divmod(k, cols)
        cx, cy = col_x(side, 0) + c * (cw + 12), y + r * (chh + 12)
        out.append(d.rect(cx, cy, cw, chh, 'WIT Accent', tint=8))
        # swatch drawn as the class's shape type
        if shape == 'Polygon':
            out.append(d.rect(cx + 12, cy + 12, 34, 24, nm))
        elif shape == 'Line':
            out.append(d.line(cx + 12, cy + 24, cx + 46, cy + 24, nm, 4))
        else:
            out.append(d.oval(cx + 24, cy + 24, 10, nm))
        out.append(d.text(cx + 12, cy + 44, cw - 24, chh - 52, [P('DB Label', nm), P('DB Label Accent', shape), P('DB Small', defi)]))
    return out


def contents_page(b):
    d = b.d
    side = 'L'
    it = [b.bg(side)]
    it.append(d.text(col_x(side, 0), TOPY, span_w(4), 50, [P('DB Title White', 'Contents')]))
    entries = b.contents
    half = (len(entries) + 1) // 2
    y0 = TOPY + 60
    for k, (t, pn) in enumerate(entries):
        col = 0 if k < half else 2
        r = k if k < half else k - half
        y = y0 + r * 23
        it.append(d.text(col_x(side, col), y, span_w(2) - 40, 22, [P('DB Small White', t)]))
        it.append(d.text(col_x(side, col) + span_w(2) - 36, y, 36, 22, [P('DB Label White', str(pn))]))
        it.append(d.line(col_x(side, col), y + 19, col_x(side, col) + span_w(2), y + 19, 'Paper', 0.4, tint=40))
    it += b.folio(side, 4, dark=True)
    return it


def fmt_date(iso):
    months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    y, m, dd = iso.split('-')
    return f'{int(dd)} {months[int(m) - 1][:3]} {y}'

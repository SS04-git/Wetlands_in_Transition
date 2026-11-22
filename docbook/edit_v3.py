"""
Third edition: targeted edits to the student's own file (docbook/_source/user_edit_v3.idml).
Nothing is rebuilt. Only these changes are made, everything else stays byte for byte as the student left it:
  1. every multi-column text frame in the content pages becomes a single column (same frame, same width)
  2. sources on pages 92-93 in Chicago style, a bulleted single column across the page, a link and a
     one-line note under each source (page 93's closing photograph is replaced, as agreed)
  3. page 72 title photograph: the website's landing page with only the title over the globe
  4. website Map 2 page: the mangrove canopy section added beside the water and sediment sections
  5. page 74 (how the website is built): a flow of the build and three design decisions with screenshots
Run:  .venv\\Scripts\\python.exe docbook\\edit_v3.py
"""
import re, shutil, zipfile, uuid, html, itertools
from pathlib import Path
import idml_lib
from idml_lib import *  # noqa
import content2
from content2 import link, P, TOPY, BODY_BOTTOM, FOLIO_Y, GAP
from sources_v3 import SOURCES

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'docbook' / '_source' / 'user_edit_v3.idml'
WORK = ROOT / 'docbook' / '_work3'
OUT = ROOT / 'docbook' / 'Wetlands_in_Transition_Docbook.idml'

STYLES['DB Source'] = ('Calibri', 'Regular', 14, 18, 0, 0, 'Black', {'bullet': True})
STYLES['DB Source Note'] = ('Calibri', 'Italic', 14, 17, 0, 7, 'Black', {'LeftIndent': '14'})


def rd(p): return p.read_bytes().decode('utf-8')
def wr(p, s): p.write_bytes(s.encode('utf-8'))
def mat(s): return list(map(float, s.split()))
def app(m, x, y): return m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]


def element_span(s, tag, sid):
    """start and end of the element <tag Self="sid" ...> ... </tag> (handles nesting of the same tag)"""
    a = s.index(f'<{tag} Self="{sid}"')
    i, depth = a, 0
    pat = re.compile(rf'<{tag}[\s>]|</{tag}>|<{tag}\s[^>]*/>')
    for m in pat.finditer(s, a):
        t = m.group(0)
        if t.startswith('</'): depth -= 1
        elif t.endswith('/>'): pass
        else: depth += 1
        if depth == 0:
            return a, m.end()
    raise ValueError(sid)


def top_items(s):
    """top-level page items of a spread with their bounds in spread coordinates"""
    out = []
    body_start = s.index('</Page>', s.rindex('<Page ')) + 7 if '<Page ' in s else 0
    i = body_start
    pat = re.compile(r'<(Rectangle|TextFrame|Oval|GraphicLine|Polygon|Group) Self="([^"]+)"([^>]*)>')
    while True:
        m = pat.search(s, i)
        if not m: break
        tag, sid = m.group(1), m.group(2)
        a, e = element_span(s, tag, sid)
        el = s[a:e]
        it = mat(re.search(r'ItemTransform="([^"]+)"', m.group(3)).group(1)) if 'ItemTransform' in m.group(3) else [1, 0, 0, 1, 0, 0]
        cut = el.find('<Image ') if '<Image ' in el else len(el)
        anc = [tuple(map(float, x.split())) for x in re.findall(r'<PathPointType Anchor="([^"]+)"', el[:cut])]
        if anc:
            pts = [app(it, *p) for p in anc]
            xs, ys = [p[0] for p in pts], [p[1] for p in pts]
            box = (min(xs), min(ys), max(xs), max(ys))
        else:
            box = None
        out.append(dict(tag=tag, id=sid, start=a, end=e, xml=el, box=box))
        i = e
    return out


def story_paras(sid):
    s = rd(WORK / 'Stories' / f'Story_{sid}.xml')
    paras = []
    for m in re.finditer(r'<ParagraphStyleRange [^>]*AppliedParagraphStyle="ParagraphStyle/([^"]+)"[^>]*>(.*?)</ParagraphStyleRange>', s, re.S):
        st = html.unescape(m.group(1))
        body = re.sub(r'<Br\s*/>', '\x00', m.group(2))
        txt = ''.join(html.unescape(a) if a else '\n' for a, b in re.findall(r'<Content>(.*?)</Content>|(\x00)', body, re.S))
        parts = txt.split('\n')
        if txt.endswith('\n'): parts = parts[:-1]
        for t in parts:
            paras.append((st if st in STYLES else 'DB Body', t))
    return paras


COMPACT = {'DB Subhead Accent': (4, 2), 'DB Subhead': (4, 2), 'DB Body': (0, 5), 'DB Bullet': (0, 2)}
FRAME_LIMIT = (BOT - M - 18) + PH / 2      # lowest a text frame may reach, just above the folio (page coordinates)


def set_path_bottom_top(xml, dy_top, dy_bottom):
    """move a frame's top and bottom edges (in its own coordinates; the frames here are unrotated, unscaled)"""
    anchors = re.findall(r'<PathPointType Anchor="([^"]+)" LeftDirection="([^"]+)" RightDirection="([^"]+)" />', xml)
    ys = sorted({float(a.split()[1]) for a, _, _ in anchors})
    top, bot = ys[0], ys[-1]
    def mv(v):
        x, y = map(float, v.split())
        y = y + dy_top if abs(y - top) < 0.01 else (y + dy_bottom if abs(y - bot) < 0.01 else y)
        return f'{x:g} {y:g}'
    for a, l, rr in anchors:
        old = f'<PathPointType Anchor="{a}" LeftDirection="{l}" RightDirection="{rr}" />'
        xml = xml.replace(old, f'<PathPointType Anchor="{mv(a)}" LeftDirection="{mv(l)}" RightDirection="{mv(rr)}" />', 1)
    return xml


def move_x_edges(xml, dx_left, dx_right):
    anchors = re.findall(r'<PathPointType Anchor="([^"]+)" LeftDirection="([^"]+)" RightDirection="([^"]+)" />', xml)
    xs = sorted({float(a.split()[0]) for a, _, _ in anchors})
    lo, hi = xs[0], xs[-1]
    def mv(v):
        x, y = map(float, v.split())
        x = x + dx_left if abs(x - lo) < 0.01 else (x + dx_right if abs(x - hi) < 0.01 else x)
        return f'{x:g} {y:g}'
    for a, l, rr in anchors:
        old = f'<PathPointType Anchor="{a}" LeftDirection="{l}" RightDirection="{rr}" />'
        xml = xml.replace(old, f'<PathPointType Anchor="{mv(a)}" LeftDirection="{mv(l)}" RightDirection="{mv(rr)}" />', 1)
    return xml


def compact_story(sid):
    f = WORK / 'Stories' / f'Story_{sid}.xml'
    s = rd(f)
    def fix(m):
        st = html.unescape(m.group(1))
        if st not in COMPACT: return m.group(0)
        sb, sa = COMPACT[st]
        head = re.sub(r' Space(Before|After)="[^"]*"', '', m.group(0))
        return head[:-1] + f' SpaceBefore="{sb}" SpaceAfter="{sa}">'
    wr(f, re.sub(r'<ParagraphStyleRange [^>]*AppliedParagraphStyle="ParagraphStyle/([^"]+)"[^>]*>', fix, s))


def measure_compact(paras, w):
    saved = {k: STYLES[k] for k in COMPACT}
    for k, (sb, sa) in COMPACT.items():
        f, st, size, lead, _, _, col, ex = STYLES[k]
        STYLES[k] = (f, st, size, lead, sb, sa, col, ex)
    try: return measure(paras, w)
    finally: STYLES.update(saved)


def fit_frame(xml, paras, x0, y0, x1, y1, its, sid, side):
    """extend the frame to the folio line, then tighten paragraph spacing, then use part of the gap under the title"""
    how = []
    ofs = PH / 2
    limit = FRAME_LIMIT - ofs
    grow = max(0, limit - y1)
    need = measure(paras, x1 - x0)
    if need <= y1 - y0 + grow:
        how.append(f'frame extended {need - (y1 - y0):.0f} pt')
        return set_path_bottom_top(xml, 0, need - (y1 - y0) + 1), need, how
    story = re.search(r'ParentStory="([^"]+)"', xml).group(1)
    need = measure_compact(paras, x1 - x0)
    compact_story(story)
    how.append('spacing tightened')
    up = 0
    if need > y1 - y0 + grow:
        up = min(12, need - (y1 - y0 + grow) + 1)
        how.append(f'top raised {up:.0f} pt')
    down = min(grow, max(0, need - (y1 - y0) - up + 1))
    if down: how.append(f'frame extended {down:.0f} pt')
    if need > y1 - y0 + up + down + 0.5:
        idml_lib.OVERSET.append(f'still {need - (y1 - y0 + up + down):.0f} pt over')
    return set_path_bottom_top(xml, -up, down), need, how


def main():
    if WORK.exists(): shutil.rmtree(WORK)
    with zipfile.ZipFile(SRC) as z: z.extractall(WORK)
    dm = rd(WORK / 'designmap.xml')
    layer = re.search(r'<Layer Self="([^"]+)"', dm).group(1)
    doc = Doc(layer)
    cnt = itertools.count(1)
    doc.uid = lambda p='db': f'w3{p}{next(cnt):04x}'

    spreads = re.findall(r'<idPkg:Spread src="Spreads/Spread_([^"]+)\.xml" />', dm)
    template = set(spreads[:2] + spreads[-2:])       # pages 1, 2-3, the closing spread and the blank back page
    # page numbers and which spread file holds them
    pages = {}
    n = 0
    for sid in spreads:
        s = rd(WORK / 'Spreads' / f'Spread_{sid}.xml')
        pp = re.findall(r'<Page Self="[^"]+"[^>]*ItemTransform="([^"]+)"', s)
        for t in pp:
            n += 1
            pages[n] = (sid, 'L' if mat(t)[4] < 0 else 'R')
    print('pages', n)
    assert n == 96

    def items_on(pnum):
        sid, side = pages[pnum]
        s = rd(WORK / 'Spreads' / f'Spread_{sid}.xml')
        res = []
        for it in top_items(s):
            if not it['box']: continue
            cx = (it['box'][0] + it['box'][2]) / 2
            if (cx < 0) == (side == 'L'):
                res.append(it)
        return sid, side, res

    edits = {}          # spread id -> list of (start, end, replacement)
    adds = {}           # spread id -> xml appended before </Spread>
    dropped_stories = set()

    def story_of(it):
        return re.search(r'ParentStory="([^"]+)"', it['xml']).group(1)

    def remove(sid, it):
        edits.setdefault(sid, []).append((it['start'], it['end'], ''))
        if it['tag'] == 'TextFrame':
            dropped_stories.add(re.search(r'ParentStory="([^"]+)"', it['xml']).group(1))

    def add(sid, xml):
        adds[sid] = adds.get(sid, '') + xml

    # ---------------------------------------------------------------- 1 single column everywhere
    report = []
    for pnum in range(4, 94):
        sid, side, its = items_on(pnum)
        if sid in template or pnum in (92, 74): continue
        for it in its:
            if it['tag'] != 'TextFrame': continue
            m = re.search(r'TextColumnCount="(\d+)"', it['xml'])
            if not m or m.group(1) == '1': continue
            x0, y0, x1, y1 = it['box']
            paras = story_paras(story_of(it))
            need = measure(paras, x1 - x0)
            new = it['xml'].replace(f'TextColumnCount="{m.group(1)}"', 'TextColumnCount="1"', 1)
            if pnum == 79:          # the website Map 2 page is re-laid below
                continue
            how = []
            if pnum == 43:
                # the legend row above the bullets moves up 4 pt so the raised frame keeps a clear gap
                for o in its:
                    if o is it or not o['box']: continue
                    if y0 - 45 < o['box'][1] < y0 - 5 and o['box'][3] <= y0 + 1:
                        open_tag = o['xml'][:o['xml'].index('>') + 1]
                        tm = re.search(r'ItemTransform="([^"]+)"', open_tag)
                        if tm:
                            mm = mat(tm.group(1)); mm[5] -= 4
                            new_tag = open_tag.replace(tm.group(0), 'ItemTransform="' + ' '.join(f'{v:g}' for v in mm) + '"', 1)
                        else:
                            new_tag = open_tag[:-1] + ' ItemTransform="1 0 0 1 0 -4">'
                        edits.setdefault(sid, []).append((o['start'], o['end'], new_tag + o['xml'][len(open_tag):]))
                        how.append('legend up 4 pt') if 'legend up 4 pt' not in how else None
            if pnum == 73:
                new = move_x_edges(new, 0, 21)
                x1 += 21
                need = measure(paras, x1 - x0)
                for o in its:
                    if o['box'] and o['box'][0] > x1 - 30 and o['tag'] in ('Rectangle', 'TextFrame') and o['box'][1] < 200:
                        if o['tag'] == 'TextFrame':
                            lst = story_paras(story_of(o))
                            ow = o['box'][2] - o['box'][0] - 14
                            assert measure(lst, ow) <= o['box'][3] - o['box'][1], 'sections list'
                        edits.setdefault(sid, []).append((o['start'], o['end'], move_x_edges(o['xml'], 14, 0)))
                how.append('frame widened 21 pt, sections box narrowed 14 pt')
            if need > y1 - y0:
                new, need, how = fit_frame(new, paras, x0, y0, x1, y1, its, sid, side)
            edits.setdefault(sid, []).append((it['start'], it['end'], new))
            report.append((pnum, round(x1 - x0), round(y1 - y0), round(need), how))
    for r in report:
        flag = 'ok' if r[4] or r[3] <= r[2] + 0.5 else 'OVERSET'
        print(f'  page {r[0]:>2}: single column {r[1]} pt wide, frame {r[2]} pt, text needs {r[3]} pt  {flag} {", ".join(r[4])}')
        if flag != 'ok': idml_lib.OVERSET.append(f'page {r[0]} single column')

    # ---------------------------------------------------------------- 2 sources, pages 92 and 93
    sid92, side92, its92 = items_on(92)
    refs = [it for it in its92 if it['tag'] == 'TextFrame' and 'TextColumnCount="2"' in it['xml']]
    assert len(refs) == 1, 'sources frame not found'
    rf = refs[0]
    x0, y0, x1, y1 = rf['box']
    remove(sid92, rf)
    paras = []
    for e, note in SOURCES:
        paras += [P('DB Source', e), P('DB Source Note', note)]
    # as many sources as fit on page 92, the rest on page 93
    k = len(SOURCES)
    while measure(paras[:2 * k], x1 - x0) > y1 - y0: k -= 1
    add(sid92, doc.text(x0, y0, x1 - x0, y1 - y0, paras[:2 * k]))
    sid93, side93, its93 = items_on(93)
    for it in its93: remove(sid93, it)          # the closing photograph, its band, quote and white folio
    add(sid93, doc.text(col_x('R', 0), TOPY, CW, BODY_BOTTOM + 4 - TOPY, paras[2 * k:]))
    add(sid93, doc.text(page_x0('R') + PW - M - 300, FOLIO_Y, 300, 18, [('DB Folio Right', 'Wetlands in Transition    93')]))
    print(f'  sources: {k} on page 92, {len(SOURCES) - k} on page 93')

    # ---------------------------------------------------------------- 3 page 72 title photograph
    sid72, side72, its72 = items_on(72)
    ph = [it for it in its72 if it['tag'] == 'Rectangle' and 'LinkResourceURI' in it['xml']]
    assert len(ph) == 1
    bx = ph[0]['box']
    new = doc.image(bx[0], bx[1], bx[2] - bx[0], bx[3] - bx[1], link('web_landing_title'))
    edits.setdefault(sid72, []).append((ph[0]['start'], ph[0]['end'], new))

    # ---------------------------------------------------------------- 4 website Map 2 page (79)
    sid79, side79, its79 = items_on(79)
    imgs = [it for it in its79 if it['tag'] == 'Rectangle' and 'LinkResourceURI' in it['xml']]
    assert len(imgs) == 2, [i['xml'][:80] for i in imgs]
    caps = [it for it in its79 if it['tag'] == 'TextFrame' and 'TextColumnCount="2"' not in it['xml'] and story_paras(story_of(it)) and story_paras(story_of(it))[0][0] == 'DB Caption']
    txt = [it for it in its79 if it['tag'] == 'TextFrame' and 'TextColumnCount="2"' in it['xml']]
    assert len(caps) == 2 and len(txt) == 1, (len(caps), len(txt))
    for it in imgs + caps: remove(sid79, it)
    top = min(i['box'][1] for i in imgs)
    gw = (CW - 2 * GUT) / 3
    gh = gw / 1.45
    shots = [('web_map2_threshold', 'One ball for each date a cell was traced as water.'),
             ('web_map2_mangrove', 'Mangrove canopy, counted date by date.'),
             ('web_map2_sediment', 'The ground that changes between dates.')]
    ch = max(measure([P('DB Caption', c)], gw) for _, c in shots) + 4
    for j, (key, cap) in enumerate(shots):
        x = col_x('R', 0) + j * (gw + GUT)
        add(sid79, doc.image(x, top, gw, gh, link(key)))
        add(sid79, doc.text(x, top + gh + 2, gw, ch, [P('DB Caption', cap)]))
    # the text frame, now one column, moves up to sit under the captions
    t = txt[0]
    tx0, ty0, tx1, ty1 = t['box']
    new_top = top + gh + 2 + ch + 10
    xml = t['xml_single'] if 'xml_single' in t else t['xml'].replace('TextColumnCount="2"', 'TextColumnCount="1"', 1)
    it_m = re.search(r'ItemTransform="([^"]+)"', xml)
    m_ = mat(it_m.group(1))
    m_[5] += new_top - ty0
    xml = xml.replace(it_m.group(0), 'ItemTransform="' + ' '.join(f'{v:g}' for v in m_) + '"', 1)
    # keep the frame's bottom edge where it was by stretching the path
    need = measure(story_paras(story_of(t)), tx1 - tx0)
    assert need <= ty1 - new_top, ('Map 2 web text', need, ty1 - new_top)
    edits.setdefault(sid79, []).append((t['start'], t['end'], xml))
    print(f'  page 79: three screenshots, text needs {need:.0f} pt of {ty1 - new_top:.0f}')

    # ---------------------------------------------------------------- 5 page 74, how the website is built
    sid74, side74, its74 = items_on(74)
    body = [it for it in its74 if it['tag'] == 'TextFrame' and 'TextColumnCount="2"' in it['xml']]
    assert len(body) == 1
    bx0, by0, bx1, by1 = body[0]['box']
    remove(sid74, body[0])
    side = side74
    steps = [('Traces and images', 'KML traces and dated screenshots, never changed.'),
             ('Website data', 'A script moves them onto the metre grid of the QGIS maps.'),
             ('Clouds of dots', 'Every trace and image becomes small coloured dots.'),
             ('3D and scroll', 'Three.js scenes, tied to the scroll by GSAP, built with Vite.')]
    sw = (CW - 3 * 26) / 4
    sp = [[P('DB Label Accent', f'{k + 1}   {a}'), P('DB Small', b)] for k, (a, b) in enumerate(steps)]
    sh = max(measure(p_, sw - 20) for p_ in sp) + 22
    y = by0
    out = []
    for k in range(4):
        x = col_x(side, 0) + k * (sw + 26)
        out.append(doc.rect(x, y, sw, sh, 'WIT Accent', tint=12 + k * 6))
        out.append(doc.text(x + 10, y + 10, sw - 20, sh - 14, sp[k]))
        if k < 3: out.append(doc.line(x + sw + 4, y + sh / 2, x + sw + 22, y + sh / 2, 'WIT Accent', 2, arrow=True))
    y += sh + 16
    cards = [('Colour and texture', 'Each class keeps its map colour. Tree cover is a brighter green than mangrove canopy so the two read apart in 3D.', 'web_specimen_tree'),
             ('Legends and navigation', 'Every map has a full legend. A thin line on the right, like a shoreline, shows progress and jumps to any section.', 'web_map2_threshold'),
             ('Pacing and honesty', 'A long scroll lets each change unfold slowly, and every limit of the data stays visible on the page.', 'web_map6')]
    cw = (CW - 2 * GUT) / 3
    cp = [[P('DB Label', a), P('DB Small', b)] for a, b, _ in cards]
    th = max(measure(c, cw) for c in cp) + 4
    ih = BODY_BOTTOM + 4 - y - th - 8
    assert ih > 90, ih
    for k, (a, b, key) in enumerate(cards):
        x = col_x(side, 0) + k * (cw + GUT)
        out.append(doc.image(x, y, cw, ih, link(key)))
        out.append(doc.text(x, y + ih + 8, cw, th, cp[k]))
    add(sid74, ''.join(out))
    print(f'  page 74: flow boxes {sh:.0f} pt, screenshots {cw:.0f} x {ih:.0f} pt')

    if idml_lib.OVERSET:
        for o in idml_lib.OVERSET: print('OVERSET', o)
        raise SystemExit('overset')

    # ---------------------------------------------------------------- write spreads
    for sid in set(edits) | set(adds):
        f = WORK / 'Spreads' / f'Spread_{sid}.xml'
        s = rd(f)
        tail = s.rindex('</Spread>')
        ins = adds.get(sid, '')
        s = s[:tail] + ins + s[tail:] if ins else s
        for a, e, rep in sorted(edits.get(sid, []), key=lambda r: -r[0]):
            s = s[:a] + rep + s[e:]
        wr(f, s)
    # stories
    for st in dropped_stories:
        (WORK / 'Stories' / f'Story_{st}.xml').unlink()
        dm = re.sub(rf'\s*<idPkg:Story src="Stories/Story_{re.escape(st)}\.xml" />', '', dm)
    for sid, xml in doc.stories.items():
        wr(WORK / 'Stories' / f'Story_{sid}.xml', xml)
    last = list(re.finditer(r'<idPkg:Story src="[^"]+" />', dm))[-1]
    dm = dm[:last.end()] + ''.join(f'\n\t<idPkg:Story src="Stories/Story_{s}.xml" />' for s in doc.stories) + dm[last.end():]
    dm = re.sub(r'StoryList="([^"]*)"', lambda m: 'StoryList="' + ' '.join([x for x in m.group(1).split() if x not in dropped_stories] + list(doc.stories)) + '"', dm, count=1)
    wr(WORK / 'designmap.xml', dm)
    # the two new paragraph styles for the sources
    st = rd(WORK / 'Resources' / 'Styles.xml')
    for name in ('DB Source', 'DB Source Note'):
        if f'ParagraphStyle/{name}"' not in st:
            st = st.replace('</RootParagraphStyleGroup>', style_xml(name, str(uuid.uuid4())) + '</RootParagraphStyleGroup>', 1)
    wr(WORK / 'Resources' / 'Styles.xml', st)

    if OUT.exists(): OUT.unlink()
    with zipfile.ZipFile(OUT, 'w') as z:
        z.write(WORK / 'mimetype', 'mimetype', compress_type=zipfile.ZIP_STORED)
        for f in sorted(WORK.rglob('*')):
            if f.is_file() and f.name != 'mimetype':
                z.write(f, f.relative_to(WORK).as_posix(), compress_type=zipfile.ZIP_DEFLATED)
    print('written', OUT)


if __name__ == '__main__':
    main()

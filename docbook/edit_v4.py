"""
Fourth edition: targeted edits to the student's file (docbook/_source/user_edit_v4.idml).
  1. a cover page becomes page 4. Old pages 4-17 move one page on (5-18, so each changes side: page
     items move across, full-bleed items keep their bleed on the outer edge, page numbers and the
     contents are updated). Old pages 18 and 19 are combined into one page (19). From page 20 on
     nothing changes.
  2. page 91, future scope: four new directions (tidal data, flood data, local communities, urbanisation)
  3. the closing photograph returns on page 94. The template pages move: old 94 to 95, old 95 to 96.
Everything else stays exactly as the student left it.
Run:  .venv\\Scripts\\python.exe docbook\\edit_v4.py
"""
import re, shutil, zipfile, html, itertools
from pathlib import Path
import idml_lib
from idml_lib import *  # noqa
from content2 import link, P, TOPY, BODY_BOTTOM, FOLIO_Y, GAP

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'docbook' / '_source' / 'user_edit_v4.idml'
WORK = ROOT / 'docbook' / '_work4'
OUT = ROOT / 'docbook' / 'Wetlands_in_Transition_Docbook.idml'


def rd(p): return p.read_bytes().decode('utf-8')
def wr(p, s): p.write_bytes(s.encode('utf-8'))
def mat(s): return list(map(float, s.split()))
def app(m, x, y): return m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]


def element_span(s, tag, a):
    depth = 0
    pat = re.compile(rf'<{tag}[\s>]|</{tag}>')
    for m in pat.finditer(s, a):
        depth += -1 if m.group(0).startswith('</') else 1
        if depth == 0: return a, m.end()
    raise ValueError(tag)


def top_items(s):
    out = []
    i = s.index('</Page>', s.rindex('<Page ')) + 7
    pat = re.compile(r'<(Rectangle|TextFrame|Oval|GraphicLine|Polygon|Group) Self="([^"]+)"([^>]*)>')
    while True:
        m = pat.search(s, i)
        if not m or m.start() > s.rindex('</Spread>'): break
        tag = m.group(1)
        a, e = element_span(s, tag, m.start())
        el = s[a:e]
        tm = re.search(r'ItemTransform="([^"]+)"', m.group(3))
        it = mat(tm.group(1)) if tm else [1, 0, 0, 1, 0, 0]
        cut = el.find('<Image ') if '<Image ' in el and tag != 'Group' else len(el)
        anc = [tuple(map(float, x.split())) for x in re.findall(r'<PathPointType Anchor="([^"]+)"', el[:cut])]
        if tag != 'Group': anc = anc[:max(1, len(anc))]
        pts = [app(it, *p) for p in anc] if anc else []
        box = (min(p[0] for p in pts), min(p[1] for p in pts), max(p[0] for p in pts), max(p[1] for p in pts)) if pts else None
        out.append(dict(tag=tag, start=a, end=e, xml=el, box=box))
        i = e
    return out


def story_paras(sid):
    s = rd(WORK / 'Stories' / f'Story_{sid}.xml')
    paras = []
    for m in re.finditer(r'<ParagraphStyleRange [^>]*AppliedParagraphStyle="ParagraphStyle/([^"]+)"[^>]*>(.*?)</ParagraphStyleRange>', s, re.S):
        body = re.sub(r'<Br\s*/>', '\x00', m.group(2))
        txt = ''.join(html.unescape(a) if a else '\n' for a, b in re.findall(r'<Content>(.*?)</Content>|(\x00)', body, re.S))
        parts = txt.split('\n')
        if txt.endswith('\n'): parts = parts[:-1]
        paras += [(html.unescape(m.group(1)), t) for t in parts]
    return paras


def shift(xml, dx):
    """move a page item sideways by dx (top-level ItemTransform)"""
    open_tag = xml[:xml.index('>') + 1]
    tm = re.search(r'ItemTransform="([^"]+)"', open_tag)
    if tm:
        m_ = mat(tm.group(1)); m_[4] += dx
        new = open_tag.replace(tm.group(0), 'ItemTransform="' + ' '.join(f'{v:g}' for v in m_) + '"', 1)
    else:
        new = open_tag[:-1] + f' ItemTransform="1 0 0 1 {dx:g} 0">'
    return new + xml[len(open_tag):]


def main():
    if WORK.exists(): shutil.rmtree(WORK)
    with zipfile.ZipFile(SRC) as z: z.extractall(WORK)
    dm = rd(WORK / 'designmap.xml')
    layer = re.search(r'<Layer Self="([^"]+)"', dm).group(1)
    doc = Doc(layer)
    cnt = itertools.count(1)
    doc.uid = lambda p='db': f'w4{p}{next(cnt):04x}'

    spreads = re.findall(r'<idPkg:Spread src="Spreads/Spread_([^"]+)\.xml" />', dm)
    pages, n = {}, 0
    for sid in spreads:
        s = rd(WORK / 'Spreads' / f'Spread_{sid}.xml')
        for t in re.findall(r'<Page Self="[^"]+"[^>]*ItemTransform="([^"]+)"', s):
            n += 1
            pages[n] = (sid, 'L' if mat(t)[4] < 0 else 'R')
    assert n == 95, n

    cache = {}
    def items(sid):
        if sid not in cache: cache[sid] = top_items(rd(WORK / 'Spreads' / f'Spread_{sid}.xml'))
        return cache[sid]

    def on_page(pnum):
        sid, side = pages[pnum]
        return [it for it in items(sid) if it['box'] and (((it['box'][0] + it['box'][2]) / 2 < 0) == (side == 'L'))]

    def story_of(it):
        m = re.search(r'ParentStory="([^"]+)"', it['xml'])
        return m.group(1) if m else None

    def is_folio(it):
        st = story_of(it) if it['tag'] == 'TextFrame' else None
        return bool(st) and story_paras(st)[:1] and story_paras(st)[0][0].startswith('DB Folio')

    dropped = set()

    def folio(side, num, dark):
        w = 300
        if side == 'L':
            return doc.text(col_x('L', 0), FOLIO_Y, w, 18, [('DB Folio White' if dark else 'DB Folio', f'{num}    Wetlands in Transition')])
        return doc.text(page_x0('R') + PW - M - w, FOLIO_Y, w, 18, [('DB Folio Right White' if dark else 'DB Folio Right', f'Wetlands in Transition    {num}')])

    def moved(pnum, to_side, new_num):
        """the items of an old page, moved to the other side of its new spread"""
        dx0 = PW if to_side == 'R' else -PW
        out = []
        for it in on_page(pnum):
            if is_folio(it):
                dark = 'White' in story_paras(story_of(it))[0][0]
                dropped.add(story_of(it))
                out.append(folio(to_side, new_num, dark))
                continue
            dx = dx0
            if it['box'][2] - it['box'][0] >= PW - 1:      # full-bleed item: keep the bleed on the outer edge
                dx += 9 if to_side == 'R' else -9
            out.append(shift(it['xml'], dx))
        return out

    new_items = {}
    # ---------------------------------------------------------------- 1 cover, shifted pages, combined page
    S = [pages[p][0] for p in range(4, 20, 2)]
    assert len(set(S)) == 8 and all(pages[p][0] == S[(p - 4) // 2] for p in range(4, 20))
    # cover (page 4, left)
    cov = [doc.image(-PW - 9, TOP - 9, PW + 9, PH + 18, link('f_0902_174500'))]
    tw = CW
    tp = [P('DB Kicker White', 'Pre-thesis project 2026-27'), P('DB Title XL', 'Wetlands in Transition'),
          P('DB Body White', 'Mapping change and development in Kundapur'), P('DB Label White', 'Sara Saju')]
    th = measure(tp, tw) + 4
    by = BOT - M - th - 26
    cov.append(doc.rect(-PW - 9, by - 26, PW + 9, BOT + 9 - (by - 26), 'WIT Accent'))
    cov.append(doc.text(col_x('L', 0), by, tw, th, tp))
    new_items[S[0]] = cov + moved(4, 'R', 5)
    for i in range(1, 8):
        new_items[S[i]] = moved(2 * i + 3, 'L', 2 * i + 4) + (moved(2 * i + 4, 'R', 2 * i + 5) if i < 7 else [])

    # combined page 19: boatyards and the river mouth above, low tide below
    caps = {}
    for p in (18, 19):
        its = on_page(p)
        for im in [i for i in its if i['tag'] == 'Rectangle' and 'LinkResourceURI' in i['xml']]:
            key = Path(html.unescape(re.search(r'LinkResourceURI="file:([^"]+)"', im['xml']).group(1)).replace('%20', ' ')).stem
            below = [t for t in its if t['tag'] == 'TextFrame' and abs(t['box'][0] - im['box'][0]) < 2 and 0 <= t['box'][1] - im['box'][3] < 10]
            caps[key] = story_paras(story_of(below[0]))[0][1] if below else ''
        for it in its:
            if it['tag'] == 'TextFrame': dropped.add(story_of(it))
    side = 'R'
    hp = [P('DB Kicker', 'Fieldwork'), P('DB Title', 'Boatyards, the river mouth and low tide')]
    hh = measure(hp, CW) + 2
    comb = [doc.text(col_x(side, 0), TOPY, CW, hh, hp)]
    y = TOPY + hh + GAP
    rows = [(('Boatyards and the river mouth', '31 August and 1 September. Away from the study frame, fishing boats are drawn up for repair, and a breakwater marks where the estuary meets the sea.'),
             ['f_0901_130331', 'f_0901_132442', 'f_0831_174947']),
            (('Low tide', '2 September. Ground that is under water in most of the satellite images showed as a low mud island, and the stakes and cage farms stood clear of the surface.'),
             ['f_0902_172427', 'f_0902_172452', 'f_0902_174513'])]
    row_h = (BODY_BOTTOM + 4 - y - 14) / 2
    ch = max(measure([P('DB Caption', caps[k])], COLW) for _, ks in rows for k in ks) + 4
    for r, ((sub, intro), keys) in enumerate(rows):
        ry = y + r * (row_h + 14)
        ip = [P('DB Subhead Accent', sub), P('DB Small', intro)]
        assert measure(ip, COLW) <= row_h, ('row text', measure(ip, COLW), row_h)
        comb.append(doc.line(col_x(side, 0), ry, col_x(side, 0) + COLW, ry, 'WIT Accent', 0.75))
        comb.append(doc.text(col_x(side, 0), ry + 4, COLW, row_h - 4, ip))
        ih = row_h - ch - 2
        for c, k in enumerate(keys):
            x = col_x(side, c + 1)
            comb.append(doc.image(x, ry, COLW, ih, link(k)))
            comb.append(doc.text(x, ry + ih + 2, COLW, ch, [P('DB Caption', caps[k])]))
    comb.append(folio('R', 19, False))
    new_items[S[7]] += comb
    print(f'  combined page 19: two rows of {row_h:.0f} pt, photos {COLW:.0f} x {row_h - ch - 2:.0f} pt')

    # contents: page numbers of the moved pages
    contents_edits = []
    def renum(nn):
        return nn + 1 if 4 <= nn <= 17 else (19 if nn in (18, 19) else nn)
    for it in on_page(4):
        st = story_of(it) if it['tag'] == 'TextFrame' else None
        if not st: continue
        ps = story_paras(st)
        if len(ps) == 1 and ps[0][1].strip().isdigit() and ps[0][0].startswith('DB Label'):
            old = int(ps[0][1].strip())
            if renum(old) != old:
                f = WORK / 'Stories' / f'Story_{st}.xml'
                s = rd(f)
                s2 = s.replace(f'<Content>{old}</Content>', f'<Content>{renum(old)}</Content>', 1)
                assert s2 != s
                contents_edits.append((st, s2, old, renum(old)))
    print('  contents:', ', '.join(f'{a}>{b}' for _, _, a, b in contents_edits))

    # ---------------------------------------------------------------- 2 future scope, page 91
    sid91 = pages[91][0]
    its91 = on_page(91)
    cards_t = sorted([i for i in its91 if i['tag'] == 'TextFrame' and story_paras(story_of(i))[0][0] == 'DB Big Figure'], key=lambda i: i['box'][0])
    cards_i = sorted([i for i in its91 if i['tag'] == 'Rectangle' and 'LinkResourceURI' in i['xml']], key=lambda i: i['box'][0])
    assert len(cards_t) == 4 and len(cards_i) == 4
    future = [('Tidal data', 'Acquire tide records for the estuary, so each observation can be read against the tide on the day.', 'f_0902_172427'),
              ('Flood data', 'Record how far floods reach and how high the water rises during the monsoon.', 'f_0831_072659'),
              ('Local communities', 'Study how changes in the estuary affect the people who live and work around it.', 'f_0831_074920'),
              ('Urbanisation', 'Explore how urban growth and the infrastructure planned along the water could change the estuary.', 'plan_part')]
    rep91 = []
    for k, (t_it, i_it, (sub, body, key)) in enumerate(zip(cards_t, cards_i, future)):
        x0, y0, x1, y1 = t_it['box']
        paras = [P('DB Big Figure', str(k + 1)), P('DB Label', ' ' + sub), P('DB Small', body)]
        rep91.append((t_it, doc.text(x0, y0, x1 - x0, y1 - y0, paras)))
        dropped.add(story_of(t_it))
        if key not in i_it['xml']:
            b = i_it['box']
            rep91.append((i_it, doc.image(b[0], b[1], b[2] - b[0], b[3] - b[1], link(key))))

    # ---------------------------------------------------------------- 3 closing photo on 94, template pages to 95 and 96
    T = pages[94][0]
    assert pages[95][0] == T
    p94, p95 = on_page(94), on_page(95)
    close = [doc.image(-PW - 9, TOP - 9, PW + 9, PH + 18, link('f_0902_174137'))]
    bb = BOT - 190
    close.append(doc.rect(-PW - 9, bb, PW + 9, 199, 'WIT Accent'))
    close.append(doc.text(col_x('L', 0), bb + 24, CW, 80, [P('DB Quote White', 'The edge between land and water is not a line.'), P('DB Small White', 'Canoes and cage farms on the Kundapur estuary, 2 September.')]))
    close.append(folio('L', 94, True))
    new_items[T] = close + [shift(it['xml'], PW) for it in p94]
    new_last = [shift(it['xml'], -PW) for it in p95]
    assert len(p94) + len(p95) == len(items(T)), 'an item of the closing spread was not placed on a page'

    if idml_lib.OVERSET:
        for o in idml_lib.OVERSET: print('OVERSET', o)
        raise SystemExit('overset')

    # ---------------------------------------------------------------- write
    def rebuild(sid, its_xml):
        f = WORK / 'Spreads' / f'Spread_{sid}.xml'
        s = rd(f)
        first = s.index('</Page>', s.rindex('<Page ')) + 7
        tail = s.rindex('</Spread>')
        wr(f, s[:first] + '\n' + ''.join(its_xml) + '\n\t' + s[tail:])
    for sid, its_xml in new_items.items():
        rebuild(sid, its_xml)
    # page 91: replace only the card texts and the changed photographs
    f = WORK / 'Spreads' / f'Spread_{sid91}.xml'
    s = rd(f)
    for it, new in sorted(rep91, key=lambda r: -r[0]['start']):
        s = s[:it['start']] + new + s[it['end']:]
    wr(f, s)
    # a new spread with the single left page 96
    base = rd(WORK / 'Spreads' / f'Spread_{T}.xml')
    head = base[:base.index('<Page ')]
    page_l = re.search(r'<Page Self="[^"]+".*?</Page>', base, re.S).group(0)
    nid = doc.uid('sp')
    ty = float(re.search(rf'<Spread Self="{T}"[^>]*ItemTransform="1 0 0 1 0 ([^"]+)"', base).group(1))
    h = re.sub(r'<Spread Self="[^"]+"', f'<Spread Self="{nid}"', head, count=1)
    h = re.sub(r'(<Spread Self="[^"]+"[^>]*ItemTransform="1 0 0 1 0 )[^"]+"', lambda m: m.group(1) + f'{ty + 645:g}"', h, count=1).replace('PageCount="2"', 'PageCount="1"')
    pg = re.sub(r'<Page Self="[^"]+"', f'<Page Self="{doc.uid("pg")}"', page_l, count=1)
    pg = re.sub(r'Name="\d+"', 'Name="96"', pg, count=1)
    pg = re.sub(r'(<ListItem type="long">)\d+(</ListItem>\s*<ListItem type="long">)\d+(</ListItem>)', r'\g<1>96\g<2>96\g<3>', pg, count=1)
    wr(WORK / 'Spreads' / f'Spread_{nid}.xml', h + pg + '\n' + ''.join(new_last) + '\n\t</Spread>\n</idPkg:Spread>\n')
    tag = f'<idPkg:Spread src="Spreads/Spread_{T}.xml" />'
    dm = dm.replace(tag, tag + f'\n\t<idPkg:Spread src="Spreads/Spread_{nid}.xml" />')
    dm, k = re.subn(r'(<Section Self="[^"]+" )Length="\d+" AlternateLayoutLength="\d+"', lambda m: m.group(1) + 'Length="96" AlternateLayoutLength="96"', dm)
    assert k == 1
    # stories
    for st, s2, _, _ in contents_edits:
        wr(WORK / 'Stories' / f'Story_{st}.xml', s2)
    for st in dropped:
        (WORK / 'Stories' / f'Story_{st}.xml').unlink()
        dm = re.sub(rf'\s*<idPkg:Story src="Stories/Story_{re.escape(st)}\.xml" />', '', dm)
    for sid, xml in doc.stories.items():
        wr(WORK / 'Stories' / f'Story_{sid}.xml', xml)
    last = list(re.finditer(r'<idPkg:Story src="[^"]+" />', dm))[-1]
    dm = dm[:last.end()] + ''.join(f'\n\t<idPkg:Story src="Stories/Story_{s}.xml" />' for s in doc.stories) + dm[last.end():]
    dm = re.sub(r'StoryList="([^"]*)"', lambda m: 'StoryList="' + ' '.join([x for x in m.group(1).split() if x not in dropped] + list(doc.stories)) + '"', dm, count=1)
    wr(WORK / 'designmap.xml', dm)

    if OUT.exists(): OUT.unlink()
    with zipfile.ZipFile(OUT, 'w') as z:
        z.write(WORK / 'mimetype', 'mimetype', compress_type=zipfile.ZIP_STORED)
        for f in sorted(WORK.rglob('*')):
            if f.is_file() and f.name != 'mimetype':
                z.write(f, f.relative_to(WORK).as_posix(), compress_type=zipfile.ZIP_DEFLATED)
    print('written', OUT)


if __name__ == '__main__':
    main()

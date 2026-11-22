"""
Fifth edition: replace repeated supporting photographs (docbook/_source/user_edit_v5.idml).
Only the picture inside each listed frame changes. The frame keeps its size, position, stroke and
everything else. No other page item, text or page is touched.
Run:  .venv\\Scripts\\python.exe docbook\\edit_v5.py
"""
import re, shutil, zipfile, html, itertools
from pathlib import Path
import content2
from content2 import link

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'docbook' / '_source' / 'user_edit_v5.idml'
WORK = ROOT / 'docbook' / '_work5'
OUT = ROOT / 'docbook' / 'Wetlands_in_Transition_Docbook.idml'
FIELD = ROOT / 'assets' / 'images' / 'images for field trip'
# the student's new photographs
for k, f in {'fn_img': 'img.png', 'fn_img1': 'img1.png', 'fn_img2': 'img 2.png', 'fn_img3': 'img3.png', 'fn_img4': 'img 4.png', 'fn_img5': 'img5.png'}.items():
    content2.FIXED[k] = FIELD / f

# (page, current picture) -> new picture
SWAPS = {
    (9, 'f_0902_174510'): 'f_0902_170729',     # title 01
    (22, 'f_0902_172427'): 'f_0831_174627',    # title 03
    (30, 'f_0902_172452'): 'f_0831_175208',    # title 05
    (34, 'f_0831_072213'): 'f_0831_074435',    # title 06
    (46, 'f_0902_174459'): 'f_0902_165216',    # title 09
    (50, 'f_0901_134354'): 'f_0901_130504',    # title 10
    (54, 'f_0902_174513'): 'f_0831_172752',    # title 11
    (6, 'f_0902_174137'): 'fn_img4',           # acknowledgements
    (7, 'f_0902_174509'): 'f_0831_175328',     # abstract
    (15, 'f_0902_172427'): 'fn_img1',          # the edge is not fixed
    (15, 'f_0902_174510'): 'fn_img',           # mangroves and a mud island
    (20, 'f_0831_072659'): 'f_0831_172346',    # why Kundapur
    (21, 'f_0902_171313'): 'f_0902_165034',    # tide data
    (21, 'f_0902_174513'): 'f_0901_125902',    # class data
    (24, 'f_0902_173244'): 'f_0831_173322',    # explorative lens
    (69, 'f_0831_071555'): 'fn_img3',          # rainfall sources
    (89, 'map4'): 'map3',                      # successes and challenges
    (91, 'f_0902_172427'): 'fn_img5',          # tidal data
    (91, 'f_0831_074920'): 'f_0901_132325',    # local communities
    (91, 'plan_part'): 'fn_img2',              # urbanisation
}


def rd(p): return p.read_bytes().decode('utf-8')
def wr(p, s): p.write_bytes(s.encode('utf-8'))
def mat(s): return list(map(float, s.split()))


def element_span(s, tag, a):
    depth = 0
    for m in re.compile(rf'<{tag}[\s>]|</{tag}>').finditer(s, a):
        depth += -1 if m.group(0).startswith('</') else 1
        if depth == 0: return a, m.end()
    raise ValueError(tag)


# title photos: the height (as a share of the photo) of what the page should show, placed about 45% down
# the page so it sits above the colour band. The photo is enlarged only as much as that needs.
FOCUS = {9: 0.76, 22: 0.58, 30: 0.66, 34: 0.62, 46: 0.58, 54: 0.62}
ZOOM = {}


def new_image(frame_xml, lk, uid, focus=None):
    """an Image element that fills the frame, in the frame's own coordinates"""
    head = frame_xml[:frame_xml.index('<Image ')]
    anc = [tuple(map(float, a.split())) for a in re.findall(r'<PathPointType Anchor="([^"]+)"', head)]
    x0, y0 = min(a[0] for a in anc), min(a[1] for a in anc)
    fw, fh = max(a[0] for a in anc) - x0, max(a[1] for a in anc) - y0
    W, H = lk['wpt'], lk['hpt']
    sc = max(fw / W, fh / H)
    if focus:
        sc = max(sc, 0.55 * fh / ((1 - focus) * H))
        sc = min(sc, 1.8 * max(fw / W, fh / H))
    tx = x0 + (fw - W * sc) / 2
    ty = y0 + (fh - H * sc) / 2
    if focus:
        ty = y0 + 0.45 * fh - focus * H * sc
        ty = min(y0, max(y0 + fh - H * sc, ty))
    uri = 'file:' + lk['path'].replace('\\', '/').replace(' ', '%20')
    return (f'<Image Self="{uid()}" Space="$ID/#Links_RGB" ActualPpi="300 300" EffectivePpi="{int(300 / sc)} {int(300 / sc)}" ImageRenderingIntent="UseColorSettings" '
            f'ImageTypeName="$ID/JPEG" AppliedObjectStyle="ObjectStyle/$ID/[None]" ItemTransform="{sc:.6f} 0 0 {sc:.6f} {tx:.3f} {ty:.3f}">'
            f'<Properties><Profile type="string">$ID/Embedded</Profile><GraphicBounds Left="0" Top="0" Right="{W:.3f}" Bottom="{H:.3f}" /></Properties>'
            f'<Link Self="{uid()}" LinkResourceURI="{html.escape(uri, quote=True)}" LinkResourceFormat="$ID/JPEG" StoredState="Normal" LinkClassID="35906" LinkClientID="257" '
            f'LinkResourceModified="false" LinkObjectModified="false" ShowInUI="true" CanEmbed="true" CanUnembed="true" CanPackage="true" ImportPolicy="NoAutoImport" ExportPolicy="NoAutoExport" />'
            f'</Image>')


def main():
    if WORK.exists(): shutil.rmtree(WORK)
    with zipfile.ZipFile(SRC) as z: z.extractall(WORK)
    dm = rd(WORK / 'designmap.xml')
    cnt = itertools.count(1)
    uid = lambda: f'w5im{next(cnt):04x}'
    spreads = re.findall(r'<idPkg:Spread src="Spreads/Spread_([^"]+)\.xml" />', dm)
    pages, n = {}, 0
    for sid in spreads:
        s = rd(WORK / 'Spreads' / f'Spread_{sid}.xml')
        for t in re.findall(r'<Page Self="[^"]+"[^>]*ItemTransform="([^"]+)"', s):
            n += 1
            pages[n] = (sid, 'L' if mat(t)[4] < 0 else 'R')
    assert n == 96, n
    done = set()
    by_spread = {}
    for (pnum, old), new in SWAPS.items():
        by_spread.setdefault(pages[pnum][0], []).append((pnum, old, new))
    for sid, swaps in by_spread.items():
        f = WORK / 'Spreads' / f'Spread_{sid}.xml'
        s = rd(f)
        reps = []
        for m in re.finditer(r'<Rectangle Self="([^"]+)"([^>]*)>', s):
            a, e = element_span(s, 'Rectangle', m.start())
            el = s[a:e]
            if '<Image ' not in el: continue
            lk = re.search(r'LinkResourceURI="file:([^"]+)"', el)
            stem = Path(html.unescape(lk.group(1)).replace('%20', ' ')).stem
            # which page: the frame's centre in spread coordinates
            tm = re.search(r'ItemTransform="([^"]+)"', m.group(2))
            it = mat(tm.group(1)) if tm else [1, 0, 0, 1, 0, 0]
            anc = [tuple(map(float, x.split())) for x in re.findall(r'<PathPointType Anchor="([^"]+)"', el[:el.index('<Image ')])]
            cx = sum(it[0] * x + it[2] * y + it[4] for x, y in anc) / len(anc)
            side = 'L' if cx < 0 else 'R'
            for pnum, old, new in swaps:
                if pages[pnum][1] == side and stem == old:
                    ia, ie = element_span(el, 'Image', el.index('<Image '))
                    new_el = el[:ia] + new_image(el, link(new), uid, FOCUS.get(pnum)) + el[ie:]
                    reps.append((a, e, new_el))
                    done.add((pnum, old))
        for a, e, new_el in sorted(reps, key=lambda r: -r[0]):
            s = s[:a] + new_el + s[e:]
        wr(f, s)
    missing = set(SWAPS) - done
    assert not missing, missing
    print(f'{len(done)} pictures replaced')

    if OUT.exists(): OUT.unlink()
    with zipfile.ZipFile(OUT, 'w') as z:
        z.write(WORK / 'mimetype', 'mimetype', compress_type=zipfile.ZIP_STORED)
        for f in sorted(WORK.rglob('*')):
            if f.is_file() and f.name != 'mimetype':
                z.write(f, f.relative_to(WORK).as_posix(), compress_type=zipfile.ZIP_DEFLATED)
    print('written', OUT)


if __name__ == '__main__':
    main()

"""
Inventory of an IDML package: for every page, the page items with their bounds in page coordinates
(points from the page's top-left), their kind, colour, linked image and the first words of each text
frame's story. Used to read back the student's own edits before changing anything.
Usage: .venv\\Scripts\\python.exe docbook\\inspect_idml.py <unzipped folder> [out.txt]
"""
import re, sys, html
from pathlib import Path

D = Path(sys.argv[1])
OUT = Path(sys.argv[2]) if len(sys.argv) > 2 else None
PW, PH = 841.889763778, 595.275590551


def mat(s):
    return list(map(float, s.split())) if s else [1, 0, 0, 1, 0, 0]


def mul(a, b):  # apply a then b  (InDesign row-vector convention)
    return [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
            a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]]


def app(m, x, y):
    return m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]


def story_text(sid):
    f = D / 'Stories' / f'Story_{sid}.xml'
    if not f.exists(): return '', []
    s = f.read_text(encoding='utf-8')
    paras = []
    for m in re.finditer(r'<ParagraphStyleRange ([^>]*)>(.*?)</ParagraphStyleRange>', s, re.S):
        st = re.search(r'AppliedParagraphStyle="ParagraphStyle/([^"]+)"', m.group(1))
        local = {k: v for k, v in re.findall(r'(PointSize|Leading|SpaceBefore|SpaceAfter|FontStyle|Justification|LeftIndent)="([^"]+)"', m.group(1))}
        runs = re.findall(r'<CharacterStyleRange ([^>]*)>(.*?)</CharacterStyleRange>', m.group(2), re.S)
        txt = ''
        rl = []
        for ra, rb in runs:
            t = ''.join(html.unescape(x) for x in re.findall(r'<Content>(.*?)</Content>', rb, re.S))
            fnt = re.search(r'<AppliedFont type="string">([^<]+)<', rb)
            ro = dict(re.findall(r'(PointSize|FontStyle|Leading)="([^"]+)"', ra))
            if fnt: ro['font'] = fnt.group(1)
            if ro: rl.append((t[:20], ro))
            txt += t
        paras.append((st.group(1) if st else '?', local, txt, rl))
    return s, paras


lines = []
dm = (D / 'designmap.xml').read_text(encoding='utf-8')
pageno = 0
for sp in re.findall(r'<idPkg:Spread src="([^"]+)"', dm):
    s = (D / sp).read_text(encoding='utf-8')
    spm = mat(re.search(r'<Spread [^>]*ItemTransform="([^"]+)"', s).group(1))
    pages = []
    for pm in re.finditer(r'<Page Self="([^"]+)"[^>]*?ItemTransform="([^"]+)"[^>]*?Name="([^"]+)"', s):
        pt = mat(pm.group(2))
        pages.append((pm.group(3), pt[4], pt[5]))  # page origin in spread coords
    lines.append(f'\n######## {sp}  pages {[p[0] for p in pages]}')
    # walk items: only direct children of Spread or groups; compute bounds via anchors
    body = s[s.index('</Page>', s.rindex('<Page ')) + 7:] if '<Page ' in s else s
    depth_items = re.finditer(r'<(Rectangle|Oval|GraphicLine|TextFrame|Polygon|Group) Self="([^"]+)"([^>]*)>', body)
    for m in depth_items:
        kind, sid, attrs = m.groups()
        if kind == 'Group':
            lines.append(f'  GROUP {sid} {re.search(r"ItemTransform=\"([^\"]+)\"", attrs).group(1)}')
            continue
        # element extent
        end = body.find(f'</{kind}>', m.end())
        el = body[m.start():end]
        it = mat(re.search(r'ItemTransform="([^"]+)"', attrs).group(1)) if 'ItemTransform' in attrs else [1, 0, 0, 1, 0, 0]
        anc = [tuple(map(float, a.split())) for a in re.findall(r'<PathPointType Anchor="([^"]+)"', el)]
        # nested images have their own PathPointType? anchors of the frame come first (frame path before Image)
        img_i = el.find('<Image ')
        if img_i > 0:
            anc = [tuple(map(float, a.split())) for a in re.findall(r'<PathPointType Anchor="([^"]+)"', el[:img_i])]
        if not anc: continue
        pts = [app(it, *a) for a in anc]
        xs, ys = [p[0] for p in pts], [p[1] for p in pts]
        x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
        cx = (x0 + x1) / 2
        side = 'L' if cx < 0 else 'R'
        po = next((p for p in pages if (p[1] < 0) == (side == 'L')), pages[0] if pages else ('?', 0, 0))
        # page coords: page origin is at its top-left in spread coords
        px0, py0 = x0 - po[1], y0 - po[2]
        fill = re.search(r'FillColor="([^"]+)"', attrs)
        fill = fill.group(1).split('/')[-1] if fill else ''
        tint = re.search(r'FillTint="([^"]+)"', attrs)
        info = f'  p{po[0]:>3} {kind[:4]:4} x{px0:7.1f} y{py0:6.1f} w{x1 - x0:6.1f} h{y1 - y0:6.1f} fill={fill}{("@" + tint.group(1)) if tint and tint.group(1) != "-1" else ""}'
        lk = re.search(r'LinkResourceURI="([^"]+)"', el)
        if lk: info += ' IMG=' + html.unescape(lk.group(1)).split('/')[-1]
        if kind == 'TextFrame':
            ps = re.search(r'ParentStory="([^"]+)"', attrs).group(1)
            cols = re.search(r'TextColumnCount="(\d+)"', el)
            _, paras = story_text(ps)
            info += f' story={ps}' + (f' cols={cols.group(1)}' if cols and cols.group(1) != '1' else '')
            lines.append(info)
            for st, local, txt, rl in paras:
                lines.append(f'        [{st}]{(" " + str(local)) if local else ""} {txt[:90]!r}{(" runs=" + str(rl[:3])) if rl else ""}')
        else:
            lines.append(info)

txt = '\n'.join(lines)
if OUT: OUT.write_text(txt, encoding='utf-8')
else: print(txt)

"""
Small IDML writer for the Wetlands in Transition documentation book.

It adds pages to the student's own template (assets/Docbook Template.idml) without changing the
template's existing pages, master, margins or columns:
  - text frames with paragraph styles, rectangles, ovals, lines and placed images
  - stories, paragraph styles and colour swatches
  - text fitting is measured with the real Georgia and Calibri font metrics so frames do not overset

Geometry follows the template: A4 landscape pages (841.89 x 595.28 pt), 24 mm margins (68.03 pt)
on every side, 4 columns with a 6 mm gutter. Spread coordinates put the binding at x = 0, the left
page from x = -841.89 to 0, the right page from 0 to 841.89, and y from -297.64 (top) to 297.64.
"""
import struct, html, itertools

PW, PH = 841.889763778, 595.275590551
M = 68.03149606299213
GUT = 17.007874015748033
COLW = (PW - 2 * M - 3 * GUT) / 4          # 163.70 pt
CW, CH = PW - 2 * M, PH - 2 * M            # content box 705.83 x 459.21 pt
TOP, BOT = -PH / 2, PH / 2


def page_x0(side):
    return -PW if side == 'L' else 0.0


def col_x(side, c):
    """left edge of column c (0..3) in spread coordinates"""
    return page_x0(side) + M + c * (COLW + GUT)


def span_w(n):
    return n * COLW + (n - 1) * GUT


# ---------------------------------------------------------------- font metrics
class TTF:
    def __init__(self, path):
        b = open(path, 'rb').read()
        n = struct.unpack('>H', b[4:6])[0]
        tables = {}
        for i in range(n):
            tag, _, off, ln = struct.unpack('>4sIII', b[12 + 16 * i: 28 + 16 * i])
            tables[tag.decode('latin1')] = (off, ln)
        self.upem = struct.unpack('>H', b[tables['head'][0] + 18: tables['head'][0] + 20])[0]
        nh = struct.unpack('>H', b[tables['hhea'][0] + 34: tables['hhea'][0] + 36])[0]
        o = tables['hmtx'][0]
        self.adv = [struct.unpack('>H', b[o + 4 * i: o + 4 * i + 2])[0] for i in range(nh)]
        self.cmap = {}
        co = tables['cmap'][0]
        nt = struct.unpack('>H', b[co + 2: co + 4])[0]
        for i in range(nt):
            pid, eid, off = struct.unpack('>HHI', b[co + 4 + 8 * i: co + 12 + 8 * i])
            so = co + off
            fmt = struct.unpack('>H', b[so: so + 2])[0]
            if fmt == 4 and pid == 3:
                segx2 = struct.unpack('>H', b[so + 6: so + 8])[0]
                seg = segx2 // 2
                ends = struct.unpack('>%dH' % seg, b[so + 14: so + 14 + segx2])
                starts = struct.unpack('>%dH' % seg, b[so + 16 + segx2: so + 16 + 2 * segx2])
                deltas = struct.unpack('>%dh' % seg, b[so + 16 + 2 * segx2: so + 16 + 3 * segx2])
                ro_off = so + 16 + 3 * segx2
                ros = struct.unpack('>%dH' % seg, b[ro_off: ro_off + segx2])
                for s in range(seg):
                    for c in range(starts[s], min(ends[s], 0x2FFF) + 1):
                        if ros[s] == 0:
                            g = (c + deltas[s]) & 0xFFFF
                        else:
                            a = ro_off + 2 * s + ros[s] + 2 * (c - starts[s])
                            g = struct.unpack('>H', b[a: a + 2])[0]
                            if g: g = (g + deltas[s]) & 0xFFFF
                        self.cmap[c] = g
                break

    def width(self, text, size):
        tot = 0
        for ch in text:
            g = self.cmap.get(ord(ch), 0)
            tot += self.adv[min(g, len(self.adv) - 1)]
        return tot * size / self.upem


FONTDIR = 'C:/Windows/Fonts/'
FONTS = {
    ('Calibri', 'Regular'): TTF(FONTDIR + 'calibri.ttf'),
    ('Calibri', 'Bold'): TTF(FONTDIR + 'calibrib.ttf'),
    ('Calibri', 'Italic'): TTF(FONTDIR + 'calibrii.ttf'),
    ('Georgia', 'Regular'): TTF(FONTDIR + 'georgia.ttf'),
    ('Georgia', 'Bold'): TTF(FONTDIR + 'georgiab.ttf'),
    ('Georgia', 'Italic'): TTF(FONTDIR + 'georgiai.ttf'),
}

# ---------------------------------------------------------------- styles
# Titles in Georgia, every other piece of text in Calibri, nothing smaller than 14 pt.
# name: (font, style, size, leading, space_before, space_after, colour, extra attrs)
STYLES = {
    'DB Title XL':   ('Georgia', 'Regular', 48, 54, 0, 0, 'Paper', {}),
    'DB Title':      ('Georgia', 'Regular', 30, 36, 0, 0, 'WIT Accent', {}),
    'DB Title White': ('Georgia', 'Regular', 30, 36, 0, 0, 'Paper', {}),
    'DB Heading':    ('Georgia', 'Regular', 20, 26, 6, 8, 'Black', {}),
    'DB Heading White': ('Georgia', 'Regular', 20, 26, 6, 8, 'Paper', {}),
    'DB Number':     ('Georgia', 'Regular', 96, 100, 0, 0, 'Paper', {}),
    'DB Big Figure': ('Georgia', 'Regular', 40, 44, 0, 4, 'WIT Accent', {}),
    'DB Big Figure White': ('Georgia', 'Regular', 40, 44, 0, 4, 'Paper', {}),
    'DB Quote':      ('Georgia', 'Italic', 20, 27, 0, 10, 'WIT Accent', {}),
    'DB Quote White': ('Georgia', 'Italic', 20, 27, 0, 10, 'Paper', {}),
    'DB Kicker':     ('Calibri', 'Bold', 14, 17, 0, 6, 'WIT Accent', {'Tracking': '60', 'Capitalization': 'AllCaps'}),
    'DB Kicker White': ('Calibri', 'Bold', 14, 17, 0, 6, 'Paper', {'Tracking': '60', 'Capitalization': 'AllCaps'}),
    'DB Subhead':    ('Calibri', 'Bold', 14, 19, 8, 2, 'Black', {}),
    'DB Subhead White': ('Calibri', 'Bold', 14, 19, 8, 2, 'Paper', {}),
    'DB Subhead Accent': ('Calibri', 'Bold', 14, 19, 8, 2, 'WIT Accent', {}),
    'DB Body':       ('Calibri', 'Regular', 14, 19, 0, 8, 'Black', {}),
    'DB Body White': ('Calibri', 'Regular', 14, 19, 0, 8, 'Paper', {}),
    'DB Bullet':     ('Calibri', 'Regular', 14, 19, 0, 4, 'Black', {'bullet': True}),
    'DB Bullet White': ('Calibri', 'Regular', 14, 19, 0, 4, 'Paper', {'bullet': True}),
    'DB Caption':    ('Calibri', 'Italic', 14, 17, 4, 0, 'Black', {}),
    'DB Caption White': ('Calibri', 'Italic', 14, 17, 4, 0, 'Paper', {}),
    'DB Label':      ('Calibri', 'Bold', 14, 18, 0, 6, 'Black', {}),
    'DB Label White': ('Calibri', 'Bold', 14, 18, 0, 6, 'Paper', {}),
    'DB Label Accent': ('Calibri', 'Bold', 14, 18, 0, 6, 'WIT Accent', {}),
    'DB Small':      ('Calibri', 'Regular', 14, 18, 0, 0, 'Black', {}),
    'DB Small White': ('Calibri', 'Regular', 14, 18, 0, 0, 'Paper', {}),
    'DB Folio':      ('Calibri', 'Regular', 14, 16, 0, 0, 'Black', {}),
    'DB Folio White': ('Calibri', 'Regular', 14, 16, 0, 0, 'Paper', {}),
    'DB Folio Right': ('Calibri', 'Regular', 14, 16, 0, 0, 'Black', {'Justification': 'RightAlign'}),
    'DB Folio Right White': ('Calibri', 'Regular', 14, 16, 0, 0, 'Paper', {'Justification': 'RightAlign'}),
    'DB Contents':   ('Georgia', 'Regular', 16, 22, 0, 4, 'Paper', {}),
    'DB Label White Center': ('Calibri', 'Bold', 14, 18, 0, 0, 'Paper', {'Justification': 'CenterAlign'}),
}
BULLET_INDENT = 14


def style_xml(name, uid):
    f, st, size, lead, sb, sa, col, extra = STYLES[name]
    attrs = dict(Name=name, NextStyle=f'ParagraphStyle/{esc_self(name)}', FillColor=f'Color/{col}',
                 FontStyle=st, PointSize=str(size), Leading=str(lead), SpaceBefore=str(sb), SpaceAfter=str(sa),
                 Hyphenation='false', Justification=extra.get('Justification', 'LeftAlign'), KeepLinesTogether='false',
                 AppliedLanguage='$ID/English: UK', Composer='Adobe Paragraph Composer')
    for k in ('Tracking', 'Capitalization', 'LeftIndent'):
        if k in extra: attrs[k] = extra[k]
    props = f'<BasedOn type="string">$ID/[No paragraph style]</BasedOn><AppliedFont type="string">{f}</AppliedFont>'
    if extra.get('bullet'):
        attrs.update(BulletsAndNumberingListType='BulletList', LeftIndent=str(BULLET_INDENT), FirstLineIndent=str(-BULLET_INDENT))
        props += '<BulletChar BulletCharacterType="UnicodeOnly" BulletCharacterValue="8226" /><BulletsFont type="string">$ID/</BulletsFont><BulletsFontStyle type="string">$ID/</BulletsFontStyle><BulletsTextAfter type="string">^t</BulletsTextAfter><TabList type="list"><ListItem type="record"><Alignment type="enumeration">LeftAlign</Alignment><AlignmentCharacter type="string">.</AlignmentCharacter><Leader type="string"></Leader><Position type="unit">' + str(BULLET_INDENT) + '</Position></ListItem></TabList>'
    a = ' '.join(f'{k}="{html.escape(v, quote=True)}"' for k, v in attrs.items())
    return f'<ParagraphStyle Self="ParagraphStyle/{esc_self(name)}" StyleUniqueId="{uid}" {a}><Properties>{props}</Properties></ParagraphStyle>'


def esc_self(name):
    return name.replace(':', '%3a')


# ---------------------------------------------------------------- colours (CMYK for print)
def rgb_to_cmyk(hexs):
    h = hexs.lstrip('#'); r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    k = 1 - max(r, g, b)
    if k >= 1: return (0, 0, 0, 100)
    c, m, y = ((1 - x - k) / (1 - k) for x in (r, g, b))
    return tuple(round(v * 100, 1) for v in (c, m, y, k))


COLOURS = {
    # the one accent colour: deep estuary teal, taken from the website's water and night tones
    'WIT Accent': '#1C5566',
    # research palette of the printed maps (unchanged from the KML / QGIS classification)
    'Water': '#45B5D1', 'Muddy shallows': '#6F858B', 'Bed ground': '#D8C29A', 'Mangrove canopy': '#39734D',
    'Land edge': '#A67C3D', 'Tree cover': '#7FA650', 'Track': '#B5654A', 'Buildings': '#6B6F7A',
    'Boats': '#E5A832', 'Cage farms': '#C62C2C',
    'Plan Developed': '#D98C7A', 'Plan Agriculture': '#BFD58A', 'Plan Marshy': '#8FB8A8', 'Plan Water': '#8EC9E0',
    'Rain Monsoon': '#2E7FA0', 'Rain 30': '#8CCFE3', 'Grey Line': '#9A9A9A',
}


def colour_xml(name, hexs):
    c = ' '.join(str(v) for v in rgb_to_cmyk(hexs))
    return (f'<Color Self="Color/{name}" Model="Process" Space="CMYK" ColorValue="{c}" ColorOverride="Normal" '
            f'ConvertToHsb="false" AlternateSpace="NoAlternateColor" AlternateColorValue="" Name="{name}" '
            f'ColorEditable="true" ColorRemovable="true" Visible="true" SwatchCreatorID="7937" SwatchColorGroupReference="n" />')


# ---------------------------------------------------------------- text measuring
def wrap_lines(text, font, size, width):
    words = text.split(' ')
    lines, cur = 0, ''
    for w in words:
        trial = (cur + ' ' + w) if cur else w
        if font.width(trial, size) <= width:
            cur = trial
        else:
            if cur: lines += 1
            # very long single word: let it overflow one line
            cur = w
    if cur: lines += 1
    return max(lines, 1)


def para_height(style, runs, width, first=False):
    f, st, size, lead, sb, sa, col, extra = STYLES[style]
    text = ''.join(r[0] for r in runs)
    if extra.get('Capitalization') == 'AllCaps': text = text.upper()
    w = width - (BULLET_INDENT if extra.get('bullet') else 0)
    font = FONTS[(f, 'Bold' if any(r[1].get('bold') for r in runs) and st == 'Regular' and f == 'Calibri' and len(runs) == 1 else st)]
    # mixed runs: measure as regular but add 6% for bold lead-ins
    n = 0
    for line in text.replace(' ', '\n').split('\n'):
        n += wrap_lines(line, font, size, w * (0.94 if len(runs) > 1 else 0.985))
    return (0 if first else sb) + n * lead + sa, n


# ---------------------------------------------------------------- document builder
OVERSET = []


class Doc:
    def __init__(self, layer):
        self.layer = layer
        self.ids = itertools.count(1)
        self.stories = {}       # id -> xml
        self.used_styles = set()

    def uid(self, p='db'):
        return f'{p}{next(self.ids):04x}'

    # -- primitives (coordinates in spread space)
    def _path(self, x, y, w, h):
        pts = [(x, y), (x, y + h), (x + w, y + h), (x + w, y)]
        pp = ''.join(f'<PathPointType Anchor="{a:.3f} {b:.3f}" LeftDirection="{a:.3f} {b:.3f}" RightDirection="{a:.3f} {b:.3f}" />' for a, b in pts)
        return f'<Properties><PathGeometry><GeometryPathType PathOpen="false"><PathPointArray>{pp}</PathPointArray></GeometryPathType></PathGeometry></Properties>'

    def rect(self, x, y, w, h, fill='WIT Accent', tint=None, stroke=None, sw=0, corner=0):
        t = f' FillTint="{tint}"' if tint is not None else ''
        s = f' StrokeColor="Color/{stroke}" StrokeWeight="{sw}"' if stroke else ' StrokeColor="Swatch/None" StrokeWeight="0"'
        f = f'Color/{fill}' if fill else 'Swatch/None'
        cr = f' TopLeftCornerOption="RoundedCorner" TopRightCornerOption="RoundedCorner" BottomLeftCornerOption="RoundedCorner" BottomRightCornerOption="RoundedCorner" TopLeftCornerRadius="{corner}" TopRightCornerRadius="{corner}" BottomLeftCornerRadius="{corner}" BottomRightCornerRadius="{corner}"' if corner else ''
        return (f'<Rectangle Self="{self.uid()}" ContentType="Unassigned" ItemLayer="{self.layer}" FillColor="{f}"{t}{s}{cr} '
                f'AppliedObjectStyle="ObjectStyle/$ID/[None]" ItemTransform="1 0 0 1 0 0">{self._path(x, y, w, h)}</Rectangle>')

    def oval(self, cx, cy, r, fill='WIT Accent', stroke=None, sw=0, tint=None):
        k = 0.5522847498 * r
        pts = [((cx, cy - r), (cx - k, cy - r), (cx + k, cy - r)), ((cx + r, cy), (cx + r, cy - k), (cx + r, cy + k)),
               ((cx, cy + r), (cx + k, cy + r), (cx - k, cy + r)), ((cx - r, cy), (cx - r, cy + k), (cx - r, cy - k))]
        pp = ''.join(f'<PathPointType Anchor="{a[0]:.3f} {a[1]:.3f}" LeftDirection="{l[0]:.3f} {l[1]:.3f}" RightDirection="{rr[0]:.3f} {rr[1]:.3f}" />' for a, l, rr in pts)
        f = f'Color/{fill}' if fill else 'Swatch/None'
        s = f' StrokeColor="Color/{stroke}" StrokeWeight="{sw}"' if stroke else ' StrokeColor="Swatch/None" StrokeWeight="0"'
        t = f' FillTint="{tint}"' if tint is not None else ''
        return (f'<Oval Self="{self.uid()}" ContentType="Unassigned" ItemLayer="{self.layer}" FillColor="{f}"{t}{s} AppliedObjectStyle="ObjectStyle/$ID/[None]" '
                f'ItemTransform="1 0 0 1 0 0"><Properties><PathGeometry><GeometryPathType PathOpen="false"><PathPointArray>{pp}</PathPointArray></GeometryPathType></PathGeometry></Properties></Oval>')

    def line(self, x1, y1, x2, y2, colour='Black', sw=1, tint=None, dashed=False, arrow=False):
        t = f' StrokeTint="{tint}"' if tint is not None else ''
        if arrow: t += ' RightLineEnd="TriangleArrowHead"'
        d = ' StrokeType="StrokeStyle/$ID/Dashed"' if dashed else ''
        pp = f'<PathPointType Anchor="{x1:.3f} {y1:.3f}" LeftDirection="{x1:.3f} {y1:.3f}" RightDirection="{x1:.3f} {y1:.3f}" /><PathPointType Anchor="{x2:.3f} {y2:.3f}" LeftDirection="{x2:.3f} {y2:.3f}" RightDirection="{x2:.3f} {y2:.3f}" />'
        return (f'<GraphicLine Self="{self.uid()}" ItemLayer="{self.layer}" StrokeColor="Color/{colour}" StrokeWeight="{sw}"{t}{d} FillColor="Swatch/None" '
                f'AppliedObjectStyle="ObjectStyle/$ID/[None]" ItemTransform="1 0 0 1 0 0"><Properties><PathGeometry><GeometryPathType PathOpen="true"><PathPointArray>{pp}</PathPointArray></GeometryPathType></PathGeometry></Properties></GraphicLine>')

    def image(self, x, y, w, h, link, mode='fill', stroke=None):
        """link: dict(path=absolute path, wpt, hpt) where wpt/hpt are the image's natural size in points"""
        W, H = link['wpt'], link['hpt']
        sc = max(w / W, h / H) if mode == 'fill' else min(w / W, h / H)
        iw, ih = W * sc, H * sc
        tx, ty = x + (w - iw) / 2, y + (h - ih) / 2
        uri = 'file:' + link['path'].replace('\\', '/').replace(' ', '%20')
        s = f' StrokeColor="Color/{stroke}" StrokeWeight="0.75"' if stroke else ' StrokeColor="Swatch/None" StrokeWeight="0"'
        img = (f'<Image Self="{self.uid()}" Space="$ID/#Links_RGB" ActualPpi="300 300" EffectivePpi="{int(300 / sc)} {int(300 / sc)}" ImageRenderingIntent="UseColorSettings" '
               f'ImageTypeName="$ID/JPEG" AppliedObjectStyle="ObjectStyle/$ID/[None]" ItemTransform="{sc:.6f} 0 0 {sc:.6f} {tx:.3f} {ty:.3f}">'
               f'<Properties><Profile type="string">$ID/Embedded</Profile><GraphicBounds Left="0" Top="0" Right="{W:.3f}" Bottom="{H:.3f}" /></Properties>'
               f'<Link Self="{self.uid()}" LinkResourceURI="{html.escape(uri, quote=True)}" LinkResourceFormat="$ID/JPEG" StoredState="Normal" LinkClassID="35906" LinkClientID="257" '
               f'LinkResourceModified="false" LinkObjectModified="false" ShowInUI="true" CanEmbed="true" CanUnembed="true" CanPackage="true" ImportPolicy="NoAutoImport" ExportPolicy="NoAutoExport" />'
               f'</Image>')
        return (f'<Rectangle Self="{self.uid()}" ContentType="GraphicType" ItemLayer="{self.layer}" FillColor="Swatch/None"{s} '
                f'AppliedObjectStyle="ObjectStyle/$ID/[None]" ItemTransform="1 0 0 1 0 0">{self._path(x, y, w, h)}'
                f'<FrameFittingOption AutoFit="false" FittingOnEmptyFrame="{"FillProportionally" if mode == "fill" else "Proportionally"}" FittingAlignment="CenterAnchor" />{img}</Rectangle>')

    def placeholder(self, x, y, w, h, label='Image to be added'):
        """an empty image frame with a thin outline for the student to fill later"""
        return (f'<Rectangle Self="{self.uid()}" ContentType="GraphicType" ItemLayer="{self.layer}" FillColor="Swatch/None" StrokeColor="Color/Grey Line" StrokeWeight="0.75" '
                f'StrokeType="StrokeStyle/$ID/Dashed" AppliedObjectStyle="ObjectStyle/$ID/[None]" ItemTransform="1 0 0 1 0 0">{self._path(x, y, w, h)}</Rectangle>')

    def text(self, x, y, w, h, paras, valign='TopAlign', cols=1, gutter=GUT, check=True):
        """paras: list of (style, runs) where runs is a str or list of (text, {bold:True, colour:..})"""
        norm = []
        for st, runs in paras:
            if isinstance(runs, str): runs = [(runs, {})]
            norm.append((st, runs))
        if check:
            colw = (w - (cols - 1) * gutter) / cols
            tot = sum(para_height(st, rr, colw, i == 0)[0] for i, (st, rr) in enumerate(norm))
            tot -= STYLES[norm[-1][0]][5]   # space after the last paragraph does not need room
            if tot > h * cols * (0.97 if cols > 1 else 1.0) + 0.5:
                OVERSET.append(f'needs {tot:.0f} pt, frame {h:.0f} pt x{cols} (w {w:.0f}). First: {norm[0][1][0][0][:70]!r}')
        sid = self.uid('st')
        body = []
        for i, (st, runs) in enumerate(norm):
            self.used_styles.add(st)
            parts = []
            for j, (t, o) in enumerate(runs):
                a = ''
                if o.get('bold'): a += ' FontStyle="Bold"'
                if o.get('italic'): a += ' FontStyle="Italic"'
                if o.get('colour'): a += f' FillColor="Color/{o["colour"]}"'
                if o.get('size'): a += f' PointSize="{o["size"]}"'
                if o.get('caps'): a += ' Capitalization="AllCaps"'
                if o.get('tracking'): a += f' Tracking="{o["tracking"]}"'
                if o.get('font'): a += f'><Properties><AppliedFont type="string">{o["font"]}</AppliedFont></Properties'
                segs = t.split('\n')
                inner = '<Br />'.join(f'<Content>{html.escape(s, quote=False)}</Content>' for s in segs)
                if i < len(norm) - 1 and j == len(runs) - 1: inner += '<Br />'
                parts.append(f'<CharacterStyleRange AppliedCharacterStyle="CharacterStyle/$ID/[No character style]"{a}>{inner}</CharacterStyleRange>')
            body.append(f'<ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/{esc_self(st)}">{"".join(parts)}</ParagraphStyleRange>')
        self.stories[sid] = (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
            '<idPkg:Story xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="22.0">'
            f'<Story Self="{sid}" AppliedTOCStyle="n" UserText="true" IsEndnoteStory="false" TrackChanges="false" StoryTitle="$ID/" AppliedNamedGrid="n">'
            '<StoryPreference OpticalMarginAlignment="false" OpticalMarginSize="12" FrameType="TextFrameType" StoryOrientation="Horizontal" StoryDirection="LeftToRightDirection" />'
            '<InCopyExportOption IncludeGraphicProxies="true" IncludeAllResources="false" />'
            + ''.join(body) + '</Story></idPkg:Story>')
        return (f'<TextFrame Self="{self.uid()}" ParentStory="{sid}" PreviousTextFrame="n" NextTextFrame="n" ContentType="TextType" ItemLayer="{self.layer}" '
                f'FillColor="Swatch/None" StrokeColor="Swatch/None" StrokeWeight="0" AppliedObjectStyle="ObjectStyle/$ID/[Normal Text Frame]" ItemTransform="1 0 0 1 0 0">'
                f'{self._path(x, y, w, h)}<TextFramePreference TextColumnCount="{cols}" TextColumnGutter="{gutter}" VerticalJustification="{valign}" '
                f'InsetSpacing="0 0 0 0" AutoSizingType="Off" FirstBaselineOffset="AscentOffset" UseMinimumHeightForFirstBaselineOffset="false" /></TextFrame>')


def measure(paras, w):
    tot = 0
    for i, (st, runs) in enumerate(paras):
        if isinstance(runs, str): runs = [(runs, {})]
        tot += para_height(st, runs, w, i == 0)[0]
    return tot - STYLES[paras[-1][0]][5]

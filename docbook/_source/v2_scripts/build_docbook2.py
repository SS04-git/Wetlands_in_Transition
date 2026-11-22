"""
Builds the second edition of the documentation book on top of the student's own edited file.

Source:  docbook/_source/user_edit_2026-11-21.idml  (a byte-for-byte copy of the student's IDML)
Kept exactly: pages 1, 2-3 and the closing spread (the template pages), every master, swatch and
document setting. Replaced: the content spreads between them (rebuilt by content2.py, which carries
the student's own layout fixes). Added: one blank page after the closing spread so that the page
count is a multiple of 4 for printing.

Run:  .venv\\Scripts\\python.exe docbook\\build_docbook2.py
Out:  docbook/Wetlands_in_Transition_Docbook.idml
"""
import re, shutil, zipfile, uuid, sys
from pathlib import Path
import idml_lib
from idml_lib import *  # noqa
import content2

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'docbook' / '_source' / 'user_edit_2026-11-21.idml'
WORK = ROOT / 'docbook' / '_build2'
OUT = ROOT / 'docbook' / 'Wetlands_in_Transition_Docbook.idml'


def rd(p): return p.read_bytes().decode('utf-8')
def wr(p, s): p.write_bytes(s.encode('utf-8'))


def main():
    if WORK.exists(): shutil.rmtree(WORK)
    with zipfile.ZipFile(SRC) as z: z.extractall(WORK)
    dm = rd(WORK / 'designmap.xml')
    spreads = re.findall(r'<idPkg:Spread src="Spreads/Spread_([^"]+)\.xml" />', dm)
    keep_first, keep_last = spreads[:2], spreads[-1]
    drop = spreads[2:-1]
    layer = re.search(r'<Layer Self="([^"]+)"', dm).group(1)

    # stories used by the spreads that are kept, and by those that are replaced
    def stories_of(sid):
        return set(re.findall(r'ParentStory="([^"]+)"', rd(WORK / 'Spreads' / f'Spread_{sid}.xml')))
    keep_st = set().union(*[stories_of(s) for s in keep_first + [keep_last]])
    drop_st = set().union(*[stories_of(s) for s in drop]) - keep_st

    # page template taken from the student's first content spread
    base = rd(WORK / 'Spreads' / f'Spread_{drop[0]}.xml')
    page_tpl = re.findall(r'<Page Self="[^"]+".*?</Page>', base, re.S)
    head = base[:base.index('<Page ')]
    base_sid = re.search(r'<Spread Self="([^"]+)"', base).group(1)
    base_y = re.search(r'<Spread Self="[^"]+"[^>]*ItemTransform="1 0 0 1 0 ([^"]+)"', base).group(1)

    doc = Doc(layer)
    pages = content2.build_pages(doc)
    if idml_lib.OVERSET:
        for o in idml_lib.OVERSET: print('OVERSET', o)
        sys.exit(f'{len(idml_lib.OVERSET)} overset frames')
    assert len(pages) % 2 == 0, 'content must fill whole spreads'
    total = 3 + len(pages) + 2 + 1
    assert total % 4 == 0, f'{total} pages is not a multiple of 4'

    for sid in drop:
        (WORK / 'Spreads' / f'Spread_{sid}.xml').unlink()
    for st in drop_st:
        f = WORK / 'Stories' / f'Story_{st}.xml'
        if f.exists(): f.unlink()

    def page_xml(tpl, pnum):
        x = re.sub(r'<Page Self="[^"]+"', f'<Page Self="{doc.uid("pg")}"', tpl, count=1)
        x = re.sub(r'Name="\d+"', f'Name="{pnum}"', x, count=1)
        x = re.sub(r'(<ListItem type="long">)\d+(</ListItem>\s*<ListItem type="long">)\d+(</ListItem>)', rf'\g<1>{pnum}\g<2>{pnum}\g<3>', x, count=1)
        return x

    new_refs = []
    y = float(base_y)
    for i in range(0, len(pages), 2):
        sid = doc.uid('sp')
        pnum = 4 + i
        h = head.replace(f'Self="{base_sid}"', f'Self="{sid}"').replace(f'ItemTransform="1 0 0 1 0 {base_y}"', f'ItemTransform="1 0 0 1 0 {y:.6f}"')
        xml = h + page_xml(page_tpl[0], pnum) + page_xml(page_tpl[1], pnum + 1) + ''.join(pages[i][1]) + ''.join(pages[i + 1][1]) + '\t</Spread>\n</idPkg:Spread>\n'
        wr(WORK / 'Spreads' / f'Spread_{sid}.xml', xml)
        new_refs.append(f'<idPkg:Spread src="Spreads/Spread_{sid}.xml" />')
        y += 645.0
    # blank back page, a single left page after the closing spread
    sid = doc.uid('sp')
    last_y = float(re.search(r'ItemTransform="1 0 0 1 0 ([^"]+)"', rd(WORK / 'Spreads' / f'Spread_{keep_last}.xml')).group(1))
    h = head.replace(f'Self="{base_sid}"', f'Self="{sid}"').replace(f'ItemTransform="1 0 0 1 0 {base_y}"', f'ItemTransform="1 0 0 1 0 {last_y + 645:.6f}"').replace('PageCount="2"', 'PageCount="1"')
    wr(WORK / 'Spreads' / f'Spread_{sid}.xml', h + page_xml(page_tpl[0], total) + '\t</Spread>\n</idPkg:Spread>\n')
    blank_ref = f'<idPkg:Spread src="Spreads/Spread_{sid}.xml" />'

    # spread order: 1, 2-3, new content, closing spread, blank page
    for sid_ in drop:
        dm = re.sub(rf'\s*<idPkg:Spread src="Spreads/Spread_{re.escape(sid_)}\.xml" />', '', dm)
    tag_last = f'<idPkg:Spread src="Spreads/Spread_{keep_last}.xml" />'
    dm = dm.replace(tag_last, '\n\t'.join(new_refs) + '\n\t' + tag_last + '\n\t' + blank_ref)
    # stories
    for st in drop_st:
        dm = re.sub(rf'\s*<idPkg:Story src="Stories/Story_{re.escape(st)}\.xml" />', '', dm)
    for sid_, xml in doc.stories.items():
        wr(WORK / 'Stories' / f'Story_{sid_}.xml', xml)
    last_story = list(re.finditer(r'<idPkg:Story src="[^"]+" />', dm))[-1]
    dm = dm[:last_story.end()] + ''.join(f'\n\t<idPkg:Story src="Stories/Story_{s}.xml" />' for s in doc.stories) + dm[last_story.end():]

    def fix_list(m):
        ids = [x for x in m.group(1).split() if x not in drop_st] + list(doc.stories)
        return f'StoryList="{" ".join(ids)}"'
    dm = re.sub(r'StoryList="([^"]*)"', fix_list, dm, count=1)
    dm, k = re.subn(r'(<Section Self="[^"]+" )Length="\d+" AlternateLayoutLength="\d+"', lambda m: m.group(1) + f'Length="{total}" AlternateLayoutLength="{total}"', dm)
    assert k == 1
    wr(WORK / 'designmap.xml', dm)

    # swatches: add any that are missing
    g = rd(WORK / 'Resources' / 'Graphic.xml')
    add = ''.join(colour_xml(n, hx) for n, hx in COLOURS.items() if f'Self="Color/{n}"' not in g)
    if add:
        i = g.index('<Color ')
        g = g[:i] + add + g[i:]
        wr(WORK / 'Resources' / 'Graphic.xml', g)
    # paragraph styles: the book's own styles are replaced by the Calibri / Georgia versions
    st = rd(WORK / 'Resources' / 'Styles.xml')
    st = re.sub(r'<ParagraphStyle Self="ParagraphStyle/DB [^"]+".*?</ParagraphStyle>\s*', '', st, flags=re.S)
    st = st.replace('</RootParagraphStyleGroup>', ''.join(style_xml(n, str(uuid.uuid4())) for n in STYLES) + '</RootParagraphStyleGroup>', 1)
    wr(WORK / 'Resources' / 'Styles.xml', st)

    if OUT.exists(): OUT.unlink()
    with zipfile.ZipFile(OUT, 'w') as z:
        z.write(WORK / 'mimetype', 'mimetype', compress_type=zipfile.ZIP_STORED)
        for f in sorted(WORK.rglob('*')):
            if f.is_file() and f.name != 'mimetype':
                z.write(f, f.relative_to(WORK).as_posix(), compress_type=zipfile.ZIP_DEFLATED)

    # Links: keep only the images the book uses
    removed = 0
    for f in content2.LINKDIR.glob('*.jpg'):
        if f.stem not in content2.USED:
            f.unlink(); removed += 1
    for f in content2.LINKDIR.glob('*.json'): f.unlink()
    print(f'pages: {total} ({len(pages)} content) | stories added {len(doc.stories)} | links used {len(content2.USED)}, removed {removed} -> {OUT}')


if __name__ == '__main__':
    main()

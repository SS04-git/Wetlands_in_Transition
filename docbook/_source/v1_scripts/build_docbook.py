"""
Builds the Wetlands in Transition documentation book as IDML, inside the student's template
(assets/Docbook Template.idml). Template pages 1, 2, 3 and the 6-7 spread are copied unchanged.
Content fills the template's empty 4-5 spread, continues on new spreads, and the original 6-7
spread is moved to the end of the book.

Run:  .venv\\Scripts\\python.exe docbook\\prepare_links.py   (once, makes docbook/Links)
      .venv\\Scripts\\python.exe docbook\\build_docbook.py
Output: docbook/Wetlands_in_Transition_Docbook.idml
"""
import json, re, shutil, zipfile, uuid
from pathlib import Path
from idml_lib import *          # noqa
from content import build_pages  # the pages, text and graphics

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = ROOT / 'assets' / 'Docbook Template.idml'
WORK = ROOT / 'docbook' / '_build'
OUTFILE = ROOT / 'docbook' / 'Wetlands_in_Transition_Docbook.idml'
LINKS = json.loads((ROOT / 'docbook' / 'Links' / 'links.json').read_text())


def main():
    if WORK.exists(): shutil.rmtree(WORK)
    with zipfile.ZipFile(TEMPLATE) as z: z.extractall(WORK)
    dm = (WORK / 'designmap.xml').read_bytes().decode('utf-8')
    layer = re.search(r'<Layer Self="([^"]+)"', dm).group(1)
    doc = Doc(layer)

    # ---- pages: list of (side, [xml items]) starting with page 4 (left)
    pages = build_pages(doc, LINKS)
    assert len(pages) % 2 == 0, 'content must fill whole spreads'
    import idml_lib
    if idml_lib.OVERSET:
        for o in idml_lib.OVERSET: print(o)
        raise SystemExit(f'{len(idml_lib.OVERSET)} overset frames')

    # ---- spread 4-5: the template's own empty spread receives the first two content pages
    sp45 = WORK / 'Spreads' / 'Spread_u1d5.xml'
    s = sp45.read_bytes().decode('utf-8')
    items = ''.join(pages[0][1]) + ''.join(pages[1][1])
    s = s.replace('\t</Spread>', items + '\t</Spread>', 1)
    sp45.write_bytes(s.encode('utf-8'))

    # ---- new spreads, modelled on the 4-5 spread (same pages, master, margins and columns)
    base = (WORK / 'Spreads' / 'Spread_u1d5.xml').read_bytes().decode('utf-8')
    page_tpl = re.findall(r'<Page Self="[^"]+".*?</Page>', base, re.S)
    head = base[:base.index('<Page ')]
    new_refs = []
    y = 1550.5511811020003
    for i in range(2, len(pages), 2):
        sid = doc.uid('sp')
        y += 645.0
        pnum = 4 + i
        p_l = page_tpl[0].replace('Self="u1da"', f'Self="{doc.uid("pg")}"').replace('Name="4"', f'Name="{pnum}"').replace('<ListItem type="long">4</ListItem>', f'<ListItem type="long">{pnum}</ListItem>')
        p_r = page_tpl[1].replace('Self="u18b"', f'Self="{doc.uid("pg")}"').replace('Name="5"', f'Name="{pnum + 1}"').replace('<ListItem type="long">5</ListItem>', f'<ListItem type="long">{pnum + 1}</ListItem>')
        h = head.replace('Self="u1d5"', f'Self="{sid}"').replace('ItemTransform="1 0 0 1 0 1550.5511811020003"', f'ItemTransform="1 0 0 1 0 {y}"')
        xml = h + p_l + p_r + ''.join(pages[i][1]) + ''.join(pages[i + 1][1]) + '\t</Spread>\n</idPkg:Spread>\n'
        (WORK / 'Spreads' / f'Spread_{sid}.xml').write_bytes(xml.encode('utf-8'))
        new_refs.append(f'<idPkg:Spread src="Spreads/Spread_{sid}.xml" />')

    # ---- order: 1, 2-3, 4-5 (content), new content spreads, then the template's 6-7 spread
    tag67 = '<idPkg:Spread src="Spreads/Spread_u186.xml" />'
    tag45 = '<idPkg:Spread src="Spreads/Spread_u1d5.xml" />'
    assert tag67 in dm and tag45 in dm
    dm = dm.replace(tag67, '')
    dm = dm.replace(tag45, tag45 + '\n\t' + '\n\t'.join(new_refs) + '\n\t' + tag67)
    # stories
    story_refs = ''.join(f'\n\t<idPkg:Story src="Stories/Story_{sid}.xml" />' for sid in doc.stories)
    for sid, xml in doc.stories.items():
        (WORK / 'Stories' / f'Story_{sid}.xml').write_bytes(xml.encode('utf-8'))
    last_story = list(re.finditer(r'<idPkg:Story src="[^"]+" />', dm))[-1]
    dm = dm[:last_story.end()] + story_refs + dm[last_story.end():]
    dm = re.sub(r'StoryList="([^"]*)"', lambda m: f'StoryList="{m.group(1)} {" ".join(doc.stories)}"', dm, count=1)
    # the template's single section covers every page (it was 7 long)
    total = 7 + len(pages) - 2
    dm, k = re.subn(r'(<Section Self="[^"]+" )Length="7" AlternateLayoutLength="7"', lambda m: m.group(1) + f'Length="{total}" AlternateLayoutLength="{total}"', dm)
    assert k == 1, 'section not found'
    (WORK / 'designmap.xml').write_bytes(dm.encode('utf-8'))

    # ---- colours and paragraph styles
    g = (WORK / 'Resources' / 'Graphic.xml').read_bytes().decode('utf-8')
    cx = ''.join(colour_xml(n, h) for n, h in COLOURS.items())
    i = g.index('<Color ')
    g = g[:i] + cx + g[i:]
    (WORK / 'Resources' / 'Graphic.xml').write_bytes(g.encode('utf-8'))
    st = (WORK / 'Resources' / 'Styles.xml').read_bytes().decode('utf-8')
    px = ''.join(style_xml(n, str(uuid.uuid4())) for n in STYLES)
    st = st.replace('</RootParagraphStyleGroup>', px + '</RootParagraphStyleGroup>', 1)
    (WORK / 'Resources' / 'Styles.xml').write_bytes(st.encode('utf-8'))

    # ---- package (mimetype first, uncompressed)
    if OUTFILE.exists(): OUTFILE.unlink()
    with zipfile.ZipFile(OUTFILE, 'w') as z:
        z.write(WORK / 'mimetype', 'mimetype', compress_type=zipfile.ZIP_STORED)
        for f in sorted(WORK.rglob('*')):
            if f.is_file() and f.name != 'mimetype':
                z.write(f, f.relative_to(WORK).as_posix(), compress_type=zipfile.ZIP_DEFLATED)
    print('pages added:', len(pages), '| total pages:', 7 + len(pages) - 2, '| stories:', len(doc.stories), '->', OUTFILE)


if __name__ == '__main__':
    main()

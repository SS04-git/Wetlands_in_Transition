// The legend panel: one per map, listing every class that map draws (checked against the six
// printed maps and their KML layers), in the colours the 3D elements use (classLook.js).
// Swatches echo the 3D form: areas are clusters of dots, the land edge is a line, boats are a
// lit ball, buildings and cage farms are small squares, as in the printed legends.

const AREA = new Set(['water', 'muddy_shallows', 'bed_ground', 'mangrove_canopy', 'tree_cover', 'track']);

function swatch(key, L) {
  const { a, b } = L[key];
  if (key === 'land_edge') return `<i class="sw sw--line" style="--a:${a}"></i>`;
  if (AREA.has(key)) return `<i class="sw sw--area" style="--a:${a};--b:${b}"></i>`;
  if (key === 'boats') return `<i class="sw sw--ball" style="--a:${a};--b:${b}"></i>`;
  return `<i class="sw sw--block" style="--a:${a};--b:${b}"></i>`;
}

export function createLegend(root, { manifest, planCategories, MAP_CLASSES, PLAN_COLOURS, CLASS_LOOK, RAIN_LOOK, LAND_COLOUR, modelClasses }) {
  const label = (k) => manifest.classByKey[k].label;
  const d2025 = manifest.dates.at(-1);
  const absent2025 = (k) => manifest.classByKey[k].geometry === 'polygon' && !(d2025.counts[k] > 0);
  const rows = (keys) => keys.map((k) => `<li>${swatch(k, CLASS_LOOK)}<span>${label(k)}</span></li>`).join('');
  // classes in the printed legend that have nothing traced on 25 February 2025
  const absentNote = (keys) => {
    const a = keys.filter(absent2025).map((k) => label(k));
    return a.length ? `<p class="lg-note">${a.join(' and ')}: none traced on this date.</p>` : '';
  };
  const group = (title, body, cls = '') => `<div class="lg-group ${cls}">${title ? `<p class="lg-title">${title}</p>` : ''}<ul>${body}</ul></div>`;
  const ramp = (k, name, i) => {
    const { a, b } = CLASS_LOOK[k];
    return `<li class="lg-ramp" data-mode="${i}"><span>${name}</span><i class="ramp" style="--a:${a};--b:${b}"></i></li>`;
  };

  const LEGENDS = {
    map1: group('25 February 2025', rows(MAP_CLASSES.map1)) + absentNote(MAP_CLASSES.map1),
    map2: `<div class="lg-group"><ul class="lg-ramps">
        ${ramp('water', 'Water persistence', 0)}
        ${ramp('mangrove_canopy', 'Mangrove canopy persistence', 1)}
        ${ramp('bed_ground', 'Exposed sediment frequency', 2)}
      </ul><p class="lg-scale"><span>0%</span><span>50%</span><span>100% (every observation)</span></p>
      <p class="lg-note">Colour: share of the 17 dates. Height: one ball per date.</p></div>`,
    map3: group('17 observations, 2011 to 2025', rows(MAP_CLASSES.map3)),
    map4: group('11 April 2011 and 25 February 2025', rows(MAP_CLASSES.map4)) +
      '<p class="lg-note">Beneath each year: the satellite image of that date, softened.</p>',
    map5: group('On the plan', planCategories.map((c, i) => `<li><i class="sw sw--block" style="--a:${PLAN_COLOURS[i]};--b:${PLAN_COLOURS[i]}"></i><span>${c.name}</span></li>`).join(''), 'lg-group--plan') +
      group('On the ground, 25 February 2025', rows(MAP_CLASSES.map5)) + absentNote(MAP_CLASSES.map5),
    map6: group('17 observations', rows(MAP_CLASSES.map6)) +
      group('Rainfall (mm)', `<li><i class="sw sw--ball" style="--a:${RAIN_LOOK.monsoon};--b:${RAIN_LOOK.monsoon}"></i><span>Monsoon, June to September · one ball = 100 mm</span></li>
        <li><i class="sw sw--ball" style="--a:${RAIN_LOOK.prior30};--b:${RAIN_LOOK.prior30}"></i><span>30 days before the date · one ball = 5 mm</span></li>`, 'lg-group--wide'),
    model: modelClasses ? group('Classified by the model', rows(modelClasses.filter((k) => k !== 'land')) +
        `<li><i class="sw sw--area" style="--a:${LAND_COLOUR}"></i><span>Land beyond the traced land edge</span></li>`) +
      group('Disagreement view', `<li><i class="sw sw--area" style="--a:#6d7a80"></i><span>Model agrees with the tracing</span></li>
        <li><i class="sw sw--ball" style="background:conic-gradient(${CLASS_LOOK.water.a}, ${CLASS_LOOK.bed_ground.a}, ${CLASS_LOOK.mangrove_canopy.a}, ${LAND_COLOUR}, ${CLASS_LOOK.water.a})"></i><span>Model differs: a larger dot, in the class the model chose</span></li>`, 'lg-group--wide') +
      group('All 17 dates, traced by hand', `<li><i class="sw sw--area" style="--a:${CLASS_LOOK.water.a}"></i><span>Changes of class: one ball per change between consecutive dates, in the cell's most frequent class</span></li>
        <li><i class="sw sw--ball" style="background:linear-gradient(90deg, ${CLASS_LOOK.mangrove_canopy.b}, #c9dcb4)"></i><span>Mangrove canopy: one ball per date traced; deep = first traced early, pale = recently</span></li>`, 'lg-group--wide') +
      '<p class="lg-note">Land is not a traced class: it is the side of the traced land edge away from the water. Land edge, boats, cage farms and buildings were not modelled.</p>' : '',
  };
  const TITLES = { model: 'Model · Legend' };

  const body = root.querySelector('.lg-body');
  const small = matchMedia('(max-width: 820px)');
  root.open = !small.matches;
  let current = null;
  return {
    show(id) {
      if (id === current) return;
      current = id;
      const html = LEGENDS[id];
      root.classList.toggle('show', !!html);
      if (html) {
        body.innerHTML = html;
        root.querySelector('summary').textContent = TITLES[id] ?? `Map ${id.slice(3)} · Legend`;
      }
    },
    setPersMode(m) {
      if (current !== 'map2') return;
      const k = Math.round(m);
      body.querySelectorAll('.lg-ramp').forEach((li) => li.classList.toggle('on', +li.dataset.mode === k));
    },
  };
}

// Classification sheets: one translucent carrier per class, printed with that class's traced
// geometry for one observation date. Sheets keep their exact plan position when lifted; only
// their height changes.
import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { polygonsGeometry, outlineGeometry, slabGeometry } from './geo.js';
import { printMaterial, outlineMaterial, carrierMaterial, carrierEdgeMaterial, markerMaterial } from './materials.js';

// Bottom to top: the water surface first, ground and vegetation over it, then the line and points.
export const STACK_ORDER = ['water', 'muddy_shallows', 'bed_ground', 'mangrove_canopy', 'land_edge',
  'tree_cover', 'track', 'buildings', 'cage_farms', 'boats'];
const FILL_OPACITY = { water: 0.46, muddy_shallows: 0.7, bed_ground: 0.74, mangrove_canopy: 0.86, tree_cover: 0.82, track: 0.86 };
const SPACING = 19;          // metres between lifted sheets
const CARRIER_T = 0.7;       // carrier thickness, metres
const ISOLATE_RAISE = 22;    // extra lift of a selected sheet
const damp = (a, b, k, dt) => THREE.MathUtils.lerp(a, b, 1 - Math.exp(-k * dt));
const smooth = (x) => x * x * (3 - 2 * x);

function markerGeometry(key) {
  if (key === 'boats') return new THREE.CylinderGeometry(1.6, 1.6, 1.1, 24);
  if (key === 'cage_farms') return new THREE.BoxGeometry(3.6, 1.1, 3.6);
  return new THREE.BoxGeometry(3.2, 2.2, 3.2); // buildings (recorded as points)
}

class Sheet {
  constructor(cls, features, display, corners, index, resolution) {
    this.key = cls.key;
    this.cls = cls;
    this.index = index;
    this.group = new THREE.Group();
    this.group.userData.sheet = this;
    this.pickables = [];
    this.state = { reveal: 0, lift: 0, carrier: 0, highlight: 0, dim: 1, raise: 0, visible: 1 };
    this.target = { highlight: 0, dim: 1, raise: 0, visible: 1 };

    const slab = slabGeometry(corners, CARRIER_T);
    this.carrier = new THREE.Mesh(slab, carrierMaterial());
    this.carrier.renderOrder = 2 + index * 3;
    this.carrier.userData.sheet = this;
    this.edges = new THREE.LineSegments(new THREE.EdgesGeometry(slab), carrierEdgeMaterial());
    this.edges.renderOrder = 3 + index * 3;
    this.group.add(this.carrier, this.edges);

    const top = CARRIER_T + 0.05;
    if (cls.geometry === 'polygon') {
      this.fill = new THREE.Mesh(polygonsGeometry(display), printMaterial(cls.key, cls.color));
      this.outline = new THREE.LineSegments(outlineGeometry(display), outlineMaterial(cls.color));
      this.fill.position.y = top;
      this.outline.position.y = top + 0.02;
      this.fill.renderOrder = 4 + index * 3;
      this.outline.renderOrder = 4 + index * 3;
      this.fill.userData.sheet = this;
      this.group.add(this.fill, this.outline);
      this.pickables.push(this.fill);
    } else if (cls.geometry === 'line') {
      this.lines = features.map((f) => {
        const g = new LineGeometry();
        g.setPositions(f.coords.flatMap(([e, n]) => [e, 0, -n]));
        const m = new LineMaterial({ color: new THREE.Color(cls.color), linewidth: 3, transparent: true, opacity: 0, resolution, depthWrite: false });
        const l = new Line2(g, m);
        l.computeLineDistances();
        l.position.y = top + 0.05;
        l.renderOrder = 4 + index * 3;
        l.userData.sheet = this;
        return l;
      });
      this.group.add(...this.lines);
      this.pickables.push(...this.lines);
    } else {
      const geo = markerGeometry(cls.key);
      geo.translate(0, geo.parameters.height / 2, 0);
      this.markers = new THREE.InstancedMesh(geo, markerMaterial(cls.color), features.length);
      const m = new THREE.Matrix4();
      features.forEach((f, i) => this.markers.setMatrixAt(i, m.makeTranslation(f.coord[0], top, -f.coord[1])));
      this.markers.castShadow = false;
      this.markers.renderOrder = 4 + index * 3;
      this.markers.userData.sheet = this;
      this.group.add(this.markers);
      this.pickables.push(this.markers);
    }
  }

  update(dt, time, lift, carrierAlpha, total) {
    const s = this.state, t = this.target;
    s.highlight = damp(s.highlight, t.highlight, 10, dt);
    s.dim = damp(s.dim, t.dim, 6, dt);
    s.raise = damp(s.raise, t.raise, 5, dt);
    s.visible = damp(s.visible, t.visible, 8, dt);

    // Staggered lift: lower sheets leave the table first.
    const stagger = 0.45;
    const local = THREE.MathUtils.clamp((lift * (1 + stagger) - (this.index / Math.max(1, total - 1)) * stagger), 0, 1);
    s.lift = smooth(local);
    const flatY = 0.1 + this.index * 0.03;
    const y = THREE.MathUtils.lerp(flatY, 2 + this.index * SPACING, s.lift) + s.raise;
    this.group.position.y = y;
    this.height = y;

    const a = s.reveal * s.dim * s.visible;
    const glow = 1 - 0.5 * THREE.MathUtils.clamp(y / (SPACING * 10), 0, 1);
    if (this.fill) {
      const u = this.fill.material.uniforms;
      u.uOpacity.value = a * (FILL_OPACITY[this.key] ?? 0.75);
      u.uGlow.value = glow;
      u.uHighlight.value = s.highlight;
      u.uTime.value = time;
      this.outline.material.opacity = a * 0.9;
    }
    if (this.lines) this.lines.forEach((l) => { l.material.opacity = a; l.material.linewidth = 3 + 1.5 * s.highlight; });
    if (this.markers) {
      this.markers.material.opacity = a;
      this.markers.material.emissiveIntensity = 0.3 + 0.5 * s.highlight;
    }
    const c = carrierAlpha * s.dim * s.visible * (s.reveal > 0.01 ? 1 : 0);
    this.carrier.material.opacity = c * (0.26 + 0.14 * s.highlight);
    this.edges.material.opacity = Math.min(1, c) * (0.7 + 0.3 * s.highlight);
    this.carrier.visible = this.carrier.material.opacity > 0.002;
    this.edges.visible = this.edges.material.opacity > 0.002;
    this.group.visible = a > 0.002 || this.carrier.visible;
  }

  dispose() {
    this.group.traverse((o) => {
      o.geometry?.dispose();
      if (o.material) [].concat(o.material).forEach((m) => m.dispose());
    });
  }
}

export class LayerStack {
  constructor(scene, manifest) {
    this.scene = scene;
    this.manifest = manifest;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.sheets = [];
    this.resolution = new THREE.Vector2(1, 1);
    this.isolated = null;
    this.hidden = new Set();
  }

  build(dateData, corners) {
    this.sheets.forEach((s) => s.dispose());
    this.group.clear();
    const present = STACK_ORDER.filter((k) => dateData.classes[k]?.length);
    this.sheets = present.map((key, i) => new Sheet(this.manifest.classByKey[key], dateData.classes[key],
      dateData.display[key], corners, i, this.resolution));
    this.sheets.forEach((s) => this.group.add(s.group));
    this.isolated = null;
    this.applyTargets();
    return present;
  }

  sheet(key) { return this.sheets.find((s) => s.key === key); }
  get activeSheets() { return this.sheets.filter((s) => s.state.visible > 0.5 && s.state.reveal > 0.5); }
  get contentPickables() { return this.activeSheets.flatMap((s) => s.pickables); }
  get carrierPickables() { return this.activeSheets.filter((s) => s.carrier.visible).map((s) => s.carrier); }

  setReveal(key, v) { const s = this.sheet(key); if (s) s.state.reveal = v; }
  setResolution(w, h) { this.resolution.set(w, h); this.sheets.forEach((s) => s.lines?.forEach((l) => l.material.resolution.set(w, h))); }

  hover(key) { this.hovered = key; this.applyTargets(); }
  isolate(key) { this.isolated = this.isolated === key ? null : key; this.applyTargets(); return this.isolated; }
  toggle(key) { this.hidden.has(key) ? this.hidden.delete(key) : this.hidden.add(key); this.applyTargets(); }

  applyTargets() {
    for (const s of this.sheets) {
      s.target.highlight = (this.hovered === s.key || this.isolated === s.key) ? 1 : 0;
      s.target.dim = this.isolated && this.isolated !== s.key ? 0.22 : 1;
      s.target.raise = this.isolated === s.key ? ISOLATE_RAISE : 0;
      s.target.visible = this.hidden.has(s.key) ? 0 : 1;
    }
  }

  update(dt, time, lift, carrierAlpha) {
    const n = this.sheets.length;
    this.sheets.forEach((s) => s.update(dt, time, lift, carrierAlpha, n));
  }

  /** Height of the fully lifted stack, for camera framing. */
  get stackHeight() { return 2 + Math.max(0, this.sheets.length - 1) * SPACING; }
}

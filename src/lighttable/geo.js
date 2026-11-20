// Geographic helpers. Scene axes: x = east, y = up, z = -north (metres from the data origin).
// Geometry is built in the XY plane as (east, north) and rotated -90 degrees about X, which maps
// (e, n, 0) to (e, 0, -n). The map therefore reads north-up when the camera looks along -z.
import * as THREE from 'three';

export const toVec3 = ([e, n], y = 0) => new THREE.Vector3(e, y, -n);

function ringToPath(ring, PathType) {
  const path = new PathType();
  ring.forEach(([e, n], i) => (i ? path.lineTo(e, n) : path.moveTo(e, n)));
  return path;
}

/** One polygon (outer ring + holes) -> THREE.Shape. Triangulated by earcut inside ShapeGeometry. */
export function ringsToShape(rings) {
  const shape = ringToPath(rings[0], THREE.Shape);
  for (const hole of rings.slice(1)) shape.holes.push(ringToPath(hole, THREE.Path));
  return shape;
}

/** Flat, triangulated surface for a list of polygons, lying in the XZ plane at y = 0. */
export function polygonsGeometry(polygons) {
  const g = new THREE.ShapeGeometry(polygons.map(ringsToShape), 1);
  g.rotateX(-Math.PI / 2);
  g.computeBoundingSphere();
  return g;
}

/** Ring outlines as one LineSegments geometry (exterior and holes). */
export function outlineGeometry(polygons) {
  const pos = [];
  for (const rings of polygons) {
    for (const ring of rings) {
      for (let i = 0; i < ring.length - 1; i++) {
        const [a, b] = [ring[i], ring[i + 1]];
        pos.push(a[0], 0, -a[1], b[0], 0, -b[1]);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

/** Footprint quad of a registered screenshot. corners: TL, TR, BR, BL in local metres. */
export function imageQuadGeometry(corners) {
  const [tl, tr, br, bl] = corners;
  const g = new THREE.BufferGeometry();
  const p = [bl, br, tr, tl].flatMap(([e, n]) => [e, 0, -n]);
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.computeBoundingSphere();
  return g;
}

/** A thin slab shaped like the footprint: the clear acrylic carrier of each sheet. */
export function slabGeometry(corners, thickness, inset = 0) {
  const c = corners.map(([e, n]) => new THREE.Vector2(e, n));
  if (inset) {
    const centre = c.reduce((a, v) => a.add(v), new THREE.Vector2()).multiplyScalar(1 / c.length);
    c.forEach((v) => v.sub(centre).multiplyScalar(1 + inset).add(centre));
  }
  const shape = new THREE.Shape([...c].reverse());
  const g = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  g.rotateX(-Math.PI / 2); // extrusion goes up (+y)
  return g;
}

/** Size and orientation of the footprint (for camera framing). */
export function footprintFrame(corners) {
  const [tl, tr, , bl] = corners.map(([e, n]) => new THREE.Vector2(e, n));
  const width = tl.distanceTo(tr);
  const height = tl.distanceTo(bl);
  const centre = corners.reduce((a, [e, n]) => a.add(new THREE.Vector2(e, n)), new THREE.Vector2()).multiplyScalar(0.25);
  return { width, height, centre: new THREE.Vector3(centre.x, 0, -centre.y) };
}

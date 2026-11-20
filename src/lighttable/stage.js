// Renderer, scene, atmosphere and the light table itself.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { imageQuadGeometry, slabGeometry } from './geo.js';

const SKY = 0xc9cecd;

export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap; // soft edges come from shadow.radius
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(SKY, 700, 2600);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  scene.environment = pmrem.fromScene(room, 0.03).texture;
  scene.environmentIntensity = 0.55;
  // The room scene is only needed to bake the reflection map: dispose it, then point Three.js
  // DevTools at the real scene (it otherwise latches onto the last scene constructed).
  room.dispose();
  pmrem.dispose();
  window.__THREE_DEVTOOLS__?.dispatchEvent(new CustomEvent('observe', { detail: scene }));

  const camera = new THREE.PerspectiveCamera(30, 1, 8, 6000);

  // Overcast daylight: broad sky light plus one soft key for the table's shadow on the floor.
  scene.add(new THREE.HemisphereLight(0xf2f4f2, 0x8e9697, 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(-260, 520, 320);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.radius = 8;
  key.shadow.bias = -0.0004;
  Object.assign(key.shadow.camera, { left: -320, right: 320, top: 320, bottom: -320, near: 50, far: 1600 });
  scene.add(key, key.target);

  // Floor: catches only the soft shadow so the table sits in the silver atmosphere.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.ShadowMaterial({ opacity: 0.16 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -14;
  floor.receiveShadow = true;
  scene.add(floor);

  return { renderer, scene, camera, key, floor };
}

/** The light table: a pale body, a glowing panel, and the registered satellite screenshot on it. */
export class LightTable {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xe6e5df, roughness: 0.82, metalness: 0 });
    this.panelMaterial = new THREE.MeshBasicMaterial({ color: 0xfffbf2, fog: true, toneMapped: false });
    this.imageMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, fog: true });
    this.glow = 1;
    this.imageVisibility = 1;
  }

  build(corners) {
    this.group.clear();
    const body = new THREE.Mesh(slabGeometry(corners, 13, 0.075), this.bodyMaterial);
    body.position.y = -13.6;
    body.castShadow = true;
    body.receiveShadow = true;
    const panel = new THREE.Mesh(slabGeometry(corners, 0.4, 0.035), this.panelMaterial);
    panel.position.y = -0.9;
    this.image = new THREE.Mesh(imageQuadGeometry(corners), this.imageMaterial);
    this.image.position.y = 0.05;
    this.image.renderOrder = 1;
    this.group.add(body, panel, this.image);
  }

  setImage(texture, corners) {
    this.build(corners);
    this.imageMaterial.map = texture;
    this.imageMaterial.needsUpdate = true;
  }

  update() {
    // The screenshot dims a little while the sheets are lifted, as if the table light shows through it.
    const v = this.imageVisibility;
    this.imageMaterial.color.setScalar(0.55 + 0.45 * v);
    this.imageMaterial.opacity = 0.35 + 0.65 * v;
    this.panelMaterial.color.setRGB(1, 0.985, 0.95).multiplyScalar(0.85 + 0.25 * this.glow);
  }
}

// Map 6: rain across the whole screen. Light, slanted streaks in three layers (near ones faster and
// longer, far ones finer), drawn over the view rather than in one patch of the scene, so the
// monsoon is felt everywhere while the rainfall towers and their labels stay clear to read.
import * as THREE from 'three';

export class ScreenRain {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uAmt: { value: 0 }, uAspect: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */ `
        uniform float uTime, uAmt, uAspect; varying vec2 vUv;
        float hash(float n) { return fract(sin(n) * 43758.5453); }
        void main() {
          vec2 uv = vec2(vUv.x * uAspect, vUv.y);
          uv.x += uv.y * 0.14;                       // a slight slant, as if blown by the wind
          float a = 0.0;
          for (int L = 0; L < 3; L++) {
            float fl = float(L);
            float cols = 70.0 + fl * 55.0;
            float c = floor(uv.x * cols);
            float h = hash(c * 1.37 + fl * 17.0);
            if (h > uAmt) continue;                 // fewer streaks in a drier monsoon
            float y = fract(uv.y * (1.2 + fl * 0.5) + uTime * (1.5 - fl * 0.3) * (0.75 + 0.5 * h) + h * 9.0);
            float fx = fract(uv.x * cols) - 0.5;
            float len = 0.22 - fl * 0.05;
            float streak = smoothstep(0.09, 0.0, abs(fx)) * smoothstep(0.0, 0.04, y) * smoothstep(len, len * 0.2, y);
            a += streak * (0.55 - fl * 0.15);
          }
          a *= 0.32;
          gl_FragColor = vec4(vec3(0.84, 0.93, 1.0) * a, a);   // premultiplied
        }`,
      transparent: true, depthTest: false, depthWrite: false, premultipliedAlpha: true,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    q.frustumCulled = false;
    this.scene.add(q);
  }
  /** amount: 0 (no rain) to 1 (the heaviest); aspect: width / height of the view. */
  update(time, amount, aspect) {
    const u = this.material.uniforms;
    u.uTime.value = time; u.uAmt.value = amount; u.uAspect.value = aspect;
  }
  get active() { return this.material.uniforms.uAmt.value > 0.01; }
}

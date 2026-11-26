// The surroundings of the estuary, from the arrival to the end. Having come down through the
// clouds, the visitor is below them and above the water: soft clouds of colour overhead, a pale
// haze along the horizon, and deep water below that darkens with depth. The same colour fades
// (baked once into a sky texture) run through all three and turn with the camera, so the maps sit
// in one place with a ground and a sky rather than floating. It forms slowly after the arrival.
import * as THREE from 'three';
import { NOISE } from './glsl.js';

export class Cosmos {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uSky: { value: null }, uTime: { value: 0 }, uOpacity: { value: 0 }, uWarp: { value: 0 },
        uCamWorld: { value: new THREE.Matrix4() }, uProjInv: { value: new THREE.Matrix4() },
        uA: { value: new THREE.Color('#1b6b80') }, uB: { value: new THREE.Color('#2a2d6b') },
      },
      vertexShader: 'varying vec2 vNdc; void main(){ vNdc = position.xy; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */ `
        uniform sampler2D uSky; uniform float uTime, uOpacity, uWarp;
        uniform mat4 uCamWorld, uProjInv; uniform vec3 uA, uB;
        varying vec2 vNdc;
        void main() {
          vec4 v = uProjInv * vec4(vNdc, 1.0, 1.0);
          vec3 d = normalize(mat3(uCamWorld) * (v.xyz / v.w));
          vec2 ll = vec2(atan(d.z, d.x) / 6.28318 + 0.5, asin(clamp(d.y, -1.0, 1.0)) / 3.14159 + 0.5);
          // keep the middle of the screen calm, where the maps are
          float edge = smoothstep(0.18, 1.05, length(vNdc * vec2(1.0, 0.85)));
          // the colour fades: a few very broad, smooth waves of colour that drift slowly (no texture,
          // so there are no blotches or patterned shapes, only long soft gradients)
          float t = uTime * 0.025;
          float f1 = 0.5 + 0.5 * sin(dot(d, vec3(1.1, 0.35, 0.8)) * 1.5 + t);
          float f2 = 0.5 + 0.5 * sin(dot(d, vec3(-0.6, 0.8, 1.0)) * 1.1 - t * 0.8 + 1.7);
          vec2 neb = vec2(0.15 + 0.7 * f1 * f2, f1);
          vec3 fade = mix(uA, uB, neb.g);
          float h = d.y;
          // overhead: the underside of the clouds, lit softly
          float up = smoothstep(0.0, 0.45, h);
          vec3 sky = mix(fade, vec3(0.56, 0.74, 0.80), 0.3 + 0.16 * neb.r);
          // below: deep water, darker further down, with the same fades moving through it
          float down = smoothstep(0.0, -0.7, h);
          vec3 deep = mix(fade * 0.55, vec3(0.012, 0.05, 0.07), down * 0.7) * (0.9 + 0.2 * neb.r);
          vec3 col = mix(deep, sky, smoothstep(-0.02, 0.06, h));
          float alpha = mix(0.38 + 0.3 * down, 0.26 + 0.18 * neb.r * up, smoothstep(-0.02, 0.06, h));
          // a pale haze where water meets sky, so there is a horizon to stand the maps against
          float haze = exp(-abs(h - 0.01) * 16.0);
          col = mix(col, vec3(0.42, 0.66, 0.74), haze * 0.55);
          alpha = mix(alpha, 0.55, haze * 0.5);
          // soft light breaking through the clouds from one side of the sky, and its path on the water
          vec3 L = normalize(vec3(-0.55, 0.32, -0.77));
          float shaft = pow(max(dot(d, L), 0.0), 7.0) * (0.55 + 0.45 * neb.r);
          vec3 light = vec3(0.70, 0.86, 0.88);
          col += light * shaft * 0.35 * up;
          alpha += shaft * 0.16 * up;
          // faint rays fanning out from that light, turning very slowly
          vec3 ru = normalize(cross(L, vec3(0.0, 1.0, 0.0))), rw = cross(ru, L);
          vec3 pr = d - L * dot(d, L);
          float ra = atan(dot(pr, rw), dot(pr, ru));
          float rays = pow(0.5 + 0.5 * sin(ra * 11.0 + 1.8 * sin(ra * 3.0 + uTime * 0.04)), 2.0);   // soft, no hard edges
          float rayFade = pow(max(dot(d, L), 0.0), 2.5) * smoothstep(-0.02, 0.08, h);
          col += light * rays * rayFade * 0.12;
          alpha += rays * rayFade * 0.05;
          // distant hills along the horizon, two hazy layers (the hills inland of Kundapur): the far
          // ridge is paler, the nearer one a little darker, both soft at the top
          float az = atan(d.z, d.x);
          float side = 0.7 + 0.45 * smoothstep(-0.3, 0.9, cos(az - 0.6));
          float far = (0.05 + 0.026 * sin(az * 3.0 + 0.4) + 0.014 * sin(az * 7.0 + 1.3) + 0.006 * sin(az * 17.0)) * side;
          float near = (0.028 + 0.018 * sin(az * 4.0 + 2.2) + 0.01 * sin(az * 9.0 + 0.7) + 0.004 * sin(az * 21.0 + 1.1)) * side;
          float onFar = smoothstep(far + 0.006, far - 0.004, h) * smoothstep(-0.006, 0.002, h);
          float onNear = smoothstep(near + 0.005, near - 0.003, h) * smoothstep(-0.006, 0.002, h);
          col = mix(col, mix(vec3(0.26, 0.42, 0.50), fade, 0.25), onFar * 0.7);
          col = mix(col, mix(vec3(0.13, 0.25, 0.31), fade, 0.2), onNear * 0.8);
          alpha = mix(alpha, 0.6, max(onFar * 0.5, onNear * 0.65));
          // below: that light reflected as a soft path across the water
          float path = pow(max(dot(vec3(d.x, -d.y, d.z), L), 0.0), 6.0);
          float below = smoothstep(0.01, -0.05, h) * (1.0 - 0.7 * down);
          col += light * path * below * 0.2;
          alpha += path * below * 0.08;
          // long, gentle swells of light rolling slowly across the water, very low contrast
          vec2 flat2 = d.xz / max(0.08, -h + 0.08);
          float swell = 0.5 + 0.5 * sin(dot(flat2, vec2(0.8, 0.6)) * 1.4 - uTime * 0.12);
          col += light * swell * below * 0.05;
          alpha += swell * below * 0.025;
          float calm = 0.6 + 0.4 * edge;
          col *= calm; alpha *= calm;
          // in the tunnels the space falls back, so the elements of the maps carry the journey
          float o = uOpacity * (1.0 - 0.7 * uWarp);
          alpha = clamp(alpha, 0.0, 1.0);
          gl_FragColor = vec4(col * alpha * o, alpha * o);   // premultiplied
          #include <colorspace_fragment>
        }`,
      transparent: true, depthTest: false, depthWrite: false, premultipliedAlpha: true,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    quad.frustumCulled = false;
    this.scene.add(quad);
    this.tint = { a: new THREE.Color('#1b6b80'), b: new THREE.Color('#2a2d6b') };
  }

  /** Bake the nebula once: an equirectangular sky of soft fbm clouds (density in red, hue mix in green). */
  bake(renderer) {
    const rt = new THREE.WebGLRenderTarget(1024, 512, { wrapS: THREE.RepeatWrapping });
    rt.texture.wrapS = THREE.RepeatWrapping;
    rt.texture.wrapT = THREE.RepeatWrapping;   // the finer layers sample it more than once around
    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */ `
        ${NOISE}
        varying vec2 vUv;
        void main() {
          float lon = (vUv.x - 0.5) * 6.28318, lat = (vUv.y - 0.5) * 3.14159;
          vec3 d = vec3(cos(lat) * cos(lon), sin(lat), cos(lat) * sin(lon));
          float n = fbm(d * 1.3 + 4.0);
          float wisps = fbm(d * 3.0 + vec3(n * 1.2));
          float density = smoothstep(0.12, 0.95, n + 0.25 * wisps);   // sparse, with long soft edges
          float hue = smoothstep(-0.4, 0.5, fbm(d * 1.1 + 11.0));
          gl_FragColor = vec4(density, hue, 0.0, 1.0);
        }`,
    })));
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(rt);
    renderer.render(scene, this.camera);
    renderer.setRenderTarget(prev);
    this.material.uniforms.uSky.value = rt.texture;
  }

  /** The background is drawn at half the screen's resolution into its own image, then stretched
   *  over the screen: it is all soft gradients, so it looks the same at about a quarter of the cost. */
  setSize(w, h, pr) {
    const W = Math.max(2, Math.round(w * pr * 0.5)), H = Math.max(2, Math.round(h * pr * 0.5));
    if (!this.rt) {
      // half float, so the faint, premultiplied gradients do not band
      this.rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, depthBuffer: false });
      this.blitScene = new THREE.Scene();
      const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
        uniforms: { uTex: { value: this.rt.texture } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader: `uniform sampler2D uTex; varying vec2 vUv;
          void main(){
            vec4 c = texture2D(uTex, vUv);
            gl_FragColor = vec4(c.a > 0.0001 ? c.rgb / c.a : vec3(0.0), c.a);
            #include <colorspace_fragment>
            gl_FragColor.rgb *= gl_FragColor.a;   // back to premultiplied for blending
          }`,
        transparent: true, depthTest: false, depthWrite: false, premultipliedAlpha: true,
        blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      }));
      q.frustumCulled = false;
      this.blitScene.add(q);
    } else this.rt.setSize(W, H);
  }

  /** Draw the background: into the half-size image, then over the screen. */
  draw(renderer) {
    if (!this.rt) return renderer.render(this.scene, this.camera);
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.rt);
    renderer.clear(true, false, false);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(prev);
    renderer.render(this.blitScene, this.camera);
  }

  /** Follow the chapter's atmosphere colours (eased in update). */
  setTint(a, b) { this.tint.a.set(a); this.tint.b.set(b); }

  update(time, camera, opacity, tunnel = 0) {
    const u = this.material.uniforms;
    camera.updateMatrixWorld();
    u.uCamWorld.value.copy(camera.matrixWorld);
    u.uProjInv.value.copy(camera.projectionMatrixInverse);
    u.uTime.value = time;
    u.uOpacity.value = opacity;
    const p = tunnel - Math.floor(tunnel);
    u.uWarp.value = p > 0 && p < 1 ? Math.sin(Math.PI * p) : 0;
    u.uA.value.lerp(this.tint.a, 0.02);
    u.uB.value.lerp(this.tint.b, 0.02);
  }
}

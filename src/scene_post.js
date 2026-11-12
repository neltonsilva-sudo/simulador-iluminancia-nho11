// RENDER — pós-processamento (EffectComposer r169). Dono: RENDER.
// Cadeia (HDR linear → display):
//   RenderPass (MSAA 4× em 'alta') → GTAO (só calcula; needsSwap=false) → PRE (exposição + balanço de branco + AO
//   ponderado: não escurece fontes de luz) → Bloom (suave, só nas lâmpadas) → [passes extras do stage.addPostPass]
//   → OutputPass (tone mapping + sRGB) → SMAA ('alta') | FXAA ('media') → CÂMERA (nitidez, vinheta, grão de celular).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

const VS = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;

const PreShader = {
  uniforms: {
    tDiffuse: { value: null }, tAO: { value: null }, tAOMask: { value: null }, aoOn: { value: 0 }, aoIntensity: { value: 0.78 },
    exposure: { value: 1 }, wb: { value: new THREE.Vector3(0.955, 1.0, 0.945) }, clampMax: { value: 24 },
  },
  vertexShader: VS,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform sampler2D tAO; uniform sampler2D tAOMask; uniform float aoOn, aoIntensity, exposure, clampMax; uniform vec3 wb;
    varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb;
      if (any(isnan(col)) || any(isinf(col))) col = vec3(0.0);
      col = min(col, vec3(65000.0)) * exposure * wb;
      if (aoOn > 0.5) {
        float ao = texture2D(tAO, vUv).r;
        float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
        // AO atua na luz "difusa ambiente": some nas superfícies emissoras/estouradas
        float w = aoIntensity * (1.0 - smoothstep(1.4, 5.0, l)) * texture2D(tAOMask, vUv).a;
        col *= mix(1.0, ao, w);
      }
      col = min(col, vec3(clampMax));
      gl_FragColor = vec4(col, c.a);
    }`,
};

// Olhar de câmera de celular (em espaço de display): nitidez (unsharp), saturação/contraste leves, vinheta, grão.
const CameraShader = {
  uniforms: {
    tDiffuse: { value: null }, res: { value: new THREE.Vector2(1280, 720) }, time: { value: 0 },
    sharpen: { value: 0.32 }, vignette: { value: 0.16 }, grain: { value: 0.022 }, sat: { value: 0.96 },
    contrast: { value: 1.0 }, lift: { value: 0.0 }, tint: { value: new THREE.Vector3(1, 1, 1) },
  },
  vertexShader: VS,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform vec2 res; uniform float time, sharpen, vignette, grain, sat, contrast, lift; uniform vec3 tint;
    varying vec2 vUv;
    float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    void main(){
      vec2 px = 1.0 / res;
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      vec3 b = texture2D(tDiffuse, vUv + vec2(px.x, 0.0)).rgb + texture2D(tDiffuse, vUv - vec2(px.x, 0.0)).rgb
             + texture2D(tDiffuse, vUv + vec2(0.0, px.y)).rgb + texture2D(tDiffuse, vUv - vec2(0.0, px.y)).rgb;
      c += (c - b * 0.25) * sharpen;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, sat);
      c = (c - 0.5) * contrast + 0.5;
      c = c * (1.0 - lift) + lift;
      c *= tint;
      vec2 d = vUv - 0.5; d.x *= 1.15;
      c *= 1.0 - vignette * smoothstep(0.12, 0.62, dot(d, d) * 2.2);
      float n = (hash(floor(vUv * res) + fract(time) * 517.0) + hash(floor(vUv * res) * 1.37 + fract(time * 1.7) * 91.0)) - 1.0;
      c += n * grain * (1.15 - 0.8 * clamp(l, 0.0, 1.0));
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};

export const TONEMAPS = { agx: THREE.AgXToneMapping, aces: THREE.ACESFilmicToneMapping, neutral: THREE.NeutralToneMapping, linear: THREE.LinearToneMapping };

export function createPost(renderer, scene, camera, quality) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const hi = quality !== 'media';
  // sem MSAA: com 8–16 RectAreaLights (LTC) o MSAA 4× quase dobra o custo do quadro no Metal; SMAA + nitidez dão conta
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 0 });
  const composer = new EffectComposer(renderer, rt);

  const render = new RenderPass(scene, camera);
  composer.addPass(render);

  // GTAO — oclusão de contato (sob cadeiras, cantos parede/teto). Só calcula o mapa; quem aplica é o PRE.
  let gtao = null;
  if (hi) {
    gtao = new GTAOPass(scene, camera, size.x, size.y);
    gtao.output = GTAOPass.OUTPUT.Off; gtao.needsSwap = false;
    gtao.updateGtaoMaterial({ radius: 0.32, distanceExponent: 1.5, thickness: 0.6, distanceFallOff: 1.0, scale: 1.0, samples: 16 });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
    // G-buffer próprio: cada malha recebe um material de normais cujo ALFA é a máscara de AO
    //   1 = AO normal · 0,45 = geometria fina (tubos, perfis, pernas de tripé: AO reduzida) · 0 = userData.noAO (sem AO).
    // A profundidade continua correta (a malha entra no G-buffer), só a aplicação da AO é mascarada no passe PRE.
    // Translúcidos sem depthWrite (isolux, marcadores) e sprites ficam fora.
    const nmFull = gtao.normalMaterial;
    const nmThin = new THREE.MeshNormalMaterial({ blending: THREE.NoBlending, opacity: 0.45 });
    const nmNone = new THREE.MeshNormalMaterial({ blending: THREE.NoBlending, opacity: 0.0 });
    const _b = new THREE.Box3(), _sz = new THREE.Vector3(), _sc = new THREE.Vector3();
    const thinOf = (o) => {
      const g = o.geometry; if (!g) return false;
      if (o.userData._aoThinG !== g.uuid) {
        if (!g.boundingBox) g.computeBoundingBox();
        _b.copy(g.boundingBox); _b.getSize(_sz); o.getWorldScale(_sc); _sz.multiply(_sc);
        const d = [Math.abs(_sz.x), Math.abs(_sz.y), Math.abs(_sz.z)].sort((a, b) => a - b);
        o.userData._aoThin = !o.isInstancedMesh && d[1] < 0.06 && d[2] > d[1] * 6; // barra/tubo/perfil
        o.userData._aoThinG = g.uuid;
      }
      return o.userData._aoThin;
    };
    const swapped = [];
    gtao.renderOverride = function (renderer, overrideMaterial, renderTarget, clearColor, clearAlpha) {
      if (overrideMaterial !== nmFull) return GTAOPass.prototype.renderOverride.call(this, renderer, overrideMaterial, renderTarget, clearColor, clearAlpha);
      scene.traverse((o) => {
        if (!o.isMesh || !o.visible) return;
        const m = o.material;
        const mm = Array.isArray(m) ? m[0] : m;
        if (o.isSprite || (mm && mm.transparent && !mm.depthWrite)) { swapped.push([o, m, true]); o.visible = false; return; }
        let nm = nmFull;
        if (o.userData.noAO) nm = nmNone; else if (thinOf(o)) nm = nmThin;
        swapped.push([o, m, false]); o.material = nm;
      });
      renderer.getClearColor(this.originalClearColor);
      const a0 = renderer.getClearAlpha(), ac = renderer.autoClear;
      renderer.setRenderTarget(renderTarget); renderer.autoClear = false;
      renderer.setClearColor(clearColor); renderer.setClearAlpha(1.0); renderer.clear();
      renderer.render(scene, this.camera);
      renderer.autoClear = ac; renderer.setClearColor(this.originalClearColor); renderer.setClearAlpha(a0);
      for (const [o, m, hid] of swapped) { if (hid) o.visible = true; else o.material = m; }
      swapped.length = 0;
    };
    composer.addPass(gtao);
  }

  const pre = new ShaderPass(PreShader);
  if (gtao) { pre.uniforms.tAO.value = gtao.gtaoMap; pre.uniforms.tAOMask.value = gtao.normalRenderTarget.texture; pre.uniforms.aoOn.value = 1; }
  composer.addPass(pre);

  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), hi ? 0.22 : 0.14, 0.62, 1.6);
  composer.addPass(bloom);

  const extraIndex = composer.passes.length; // passes extras HDR entram aqui
  const output = new OutputPass();
  composer.addPass(output);

  let aa;
  if (hi) aa = new SMAAPass(size.x, size.y);
  else { aa = new ShaderPass(FXAAShader); aa.uniforms.resolution.value.set(1 / size.x, 1 / size.y); }
  composer.addPass(aa);

  const cam = new ShaderPass(CameraShader);
  composer.addPass(cam);

  let nExtra = 0;
  return {
    bloomBase: bloom.strength,
    composer, render, gtao, pre, bloom, output, aa, cam, hi,
    addPass(pass) { composer.insertPass(pass, extraIndex + nExtra++); },
    setSize(w, h) { // tamanho do drawing buffer (px reais)
      composer.setSize(w / renderer.getPixelRatio(), h / renderer.getPixelRatio());
      cam.uniforms.res.value.set(w, h);
      if (!hi) aa.uniforms.resolution.value.set(1 / w, 1 / h);
    },
  };
}

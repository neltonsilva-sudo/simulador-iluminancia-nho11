// MARCAÇÃO — integração com o pipeline HDR do RENDER (exposição física + AgX no OutputPass).
//  • ovPatch(material): marcas 3D "de interface" dentro da cena (adesivo, disco, laser…) são pré-compensadas:
//    divide-se pela exposição/balanço de branco do passe PRE e aplica-se a inversa exata do AgX (r169), para que a
//    cor exibida seja a cor sRGB especificada (dentro do gamute alcançável pelo AgX).
//  • OverlayPass: etiquetas (sprites) são desenhadas DEPOIS do último passe (cores exatas, nítidas, sem grão/bloom).
// Dono: MARCAÇÃO.
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

export const OV = {
  uOvGain: { value: new THREE.Vector3(1, 1, 1) },
  uOvMode: { value: 0 },      // 0 = identidade, 1 = inversa AgX, 2 = só exposição
  uOvMax: { value: 0.8 },     // teto da cor alvo (evita bloom excessivo em brancos)
};

export const OV_GLSL = /* glsl */`
uniform vec3 uOvGain; uniform float uOvMode; uniform float uOvMax;
const mat3 OV_S2R = mat3(vec3(0.6274,0.0691,0.0164), vec3(0.3293,0.9195,0.0880), vec3(0.0433,0.0113,0.8956));
const mat3 OV_R2S = mat3(vec3(1.6605,-0.1246,-0.0182), vec3(-0.5876,1.1329,-0.1006), vec3(-0.0728,-0.0083,1.1187));
const mat3 OV_IOUT = mat3(vec3(0.8997969559116108,0.11142098895747997,0.11142098895747998), vec3(0.08719961920283507,0.8755755861569658,0.08719961920283488), vec3(0.013003424885555,0.013003424885554797,0.801379391839686));
const mat3 OV_IIN = mat3(vec3(1.1974410768877044,-0.19647462632134563,-0.14655741710660064), vec3(-0.14426151269800058,1.3540951314697303,-0.1082840587884694), vec3(-0.05317956418970419,-0.15762050514838477,1.2548414758950708));
float ovPoly(float x){ float x2 = x*x, x4 = x2*x2; return 15.5*x4*x2 - 40.14*x4*x + 31.96*x4 - 6.868*x2*x + 0.4298*x2 + 0.1191*x - 0.00232; }
float ovInvPoly(float y){ float lo = 0.0, hi = 1.0; for (int i = 0; i < 16; i++) { float m = 0.5*(lo+hi); if (ovPoly(m) < y) lo = m; else hi = m; } return 0.5*(lo+hi); }
vec3 ovMap(vec3 c){
  if (uOvMode < 0.5) return c;
  if (uOvMode > 1.5) return c * uOvGain;
  c = clamp(c, 0.0, uOvMax);
  c = OV_S2R * c;
  c = pow(max(c, vec3(0.0)), vec3(1.0/2.2));
  c = clamp(OV_IOUT * c, 0.0, 1.0);
  c = vec3(ovInvPoly(c.r), ovInvPoly(c.g), ovInvPoly(c.b));
  c = exp2(c * (4.026069 + 12.47393) - 12.47393);
  c = OV_R2S * (OV_IIN * c);
  return max(c, vec3(0.0)) * uOvGain;
}
`;

/** Injeta a pré-compensação num material embutido (MeshBasic/Sprite). */
export function ovPatch(m) {
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, OV);
    sh.fragmentShader = OV_GLSL + sh.fragmentShader.replace('#include <tonemapping_fragment>', 'gl_FragColor.rgb = ovMap(gl_FragColor.rgb);\n#include <tonemapping_fragment>');
  };
  m.customProgramCacheKey = () => 'markOV';
  return m;
}

/** Atualiza os uniformes a partir do stage (chamar a cada quadro). */
export function ovSync(stage) {
  const post = stage.post, ex = stage.exposure;
  if (!post || !post.composer || !Number.isFinite(ex) || ex <= 0) { OV.uOvMode.value = 0; OV.uOvGain.value.set(1, 1, 1); return false; }
  const wb = post.pre?.uniforms?.wb?.value || { x: 1, y: 1, z: 1 };
  OV.uOvGain.value.set(1 / (ex * (wb.x || 1)), 1 / (ex * (wb.y || 1)), 1 / (ex * (wb.z || 1)));
  const tm = stage.renderer.toneMapping;
  OV.uOvMode.value = tm === THREE.AgXToneMapping ? 1 : 2;
  return true;
}

const CopyFS = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tDiffuse, vUv); }',
};

/** Passe final: copia o quadro pronto e desenha a cena de etiquetas por cima (espaço de display, sRGB exato). */
export class OverlayPass extends Pass {
  constructor(scene, getCamera) {
    super(); this.oScene = scene; this.getCamera = getCamera; this.needsSwap = false;
    this.quad = new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.clone(CopyFS.uniforms), vertexShader: CopyFS.vertexShader, fragmentShader: CopyFS.fragmentShader, depthTest: false, depthWrite: false }));
  }
  render(renderer, writeBuffer, readBuffer) {
    const clip = renderer.clippingPlanes, ac = renderer.autoClear;
    renderer.clippingPlanes = [];
    if (this.renderToScreen) {
      this.quad.material.uniforms.tDiffuse.value = readBuffer.texture;
      renderer.setRenderTarget(null); this.quad.render(renderer);
    } else renderer.setRenderTarget(readBuffer);
    renderer.autoClear = false; renderer.clearDepth();
    renderer.render(this.oScene, this.getCamera());
    renderer.autoClear = ac; renderer.clippingPlanes = clip;
  }
  dispose() { this.quad.dispose(); this.quad.material.dispose(); }
}

/** Mantém o OverlayPass como último passe do compositor (o RENDER pode recriar o pós ao trocar a qualidade). */
export function ensureLast(stage, pass) {
  const comp = stage.post?.composer; if (!comp) return false;
  const ps = comp.passes;
  if (ps[ps.length - 1] !== pass) {
    const i = ps.indexOf(pass); if (i >= 0) ps.splice(i, 1);
    comp.addPass(pass);
  }
  return true;
}

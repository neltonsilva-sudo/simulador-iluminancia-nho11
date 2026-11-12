// FOTOMETRIA — passe de sobreposição do isolux DEPOIS do tone mapping/pós (cores exatas da rampa, independentes da
// exposição automática, do AgX, do bloom e da vinheta). Oclusão correta: pré-passe de profundidade da cena principal
// (paredes/cadeiras/luminárias escondem o plano como na realidade) e depois a cena de sobreposição com teste de
// profundidade. Usa apenas a API pública do stage (stage.post.composer); se o RENDER não tiver pós, cai no modo simples.
// Dono: FOTOMETRIA.
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
// Marcas da MARCAÇÃO são pré-compensadas para o pipeline HDR (uniforme compartilhado OV.uOvMode); ao redesenhá-las no
// passe do isolux (espaço linear → sRGB exato) a compensação é desligada temporariamente. Import opcional.
let MARK_OV = null; import('./mark_overlay.js').then((m) => { MARK_OV = m.OV || null; }).catch(() => {});

const CompositeShader = {
  uniforms: { tBase: { value: null }, tOver: { value: null } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tBase; uniform sampler2D tOver; varying vec2 vUv;
    vec3 toSRGB(vec3 c){ c = clamp(c, 0.0, 1.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
    void main(){
      vec4 b = texture2D(tBase, vUv); vec4 o = texture2D(tOver, vUv);
      vec3 c = o.a > 1e-4 ? toSRGB(o.rgb / o.a) : vec3(0.0);
      gl_FragColor = vec4(mix(b.rgb, c, clamp(o.a, 0.0, 1.0)), 1.0);
    }`,
};

export class IsoluxOverlayPass extends Pass {
  constructor(stage, overlay) {
    super();
    this.stage = stage; this.overlay = overlay; this.needsSwap = true;
    this.rt = new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.UnsignedByteType, depthBuffer: true });
    this.depthMat = new THREE.MeshBasicMaterial({ colorWrite: false });
    this.quad = new FullScreenQuad(new THREE.ShaderMaterial({ ...CompositeShader, uniforms: THREE.UniformsUtils.clone(CompositeShader.uniforms), depthTest: false, depthWrite: false }));
    this._size = new THREE.Vector2(); this._cc = new THREE.Color(); this._sig = ''; this._age = 0;
  }
  setSize() { /* ajustado a cada quadro pelo tamanho do drawing buffer */ }
  render(renderer, writeBuffer, readBuffer) {
    const { scene, camera } = this.stage;
    renderer.getDrawingBufferSize(this._size);
    if (this.rt.width !== this._size.x || this.rt.height !== this._size.y) this.rt.setSize(this._size.x, this._size.y);
    const prevAuto = renderer.autoClear, prevAlpha = renderer.getClearAlpha(); renderer.getClearColor(this._cc);
    const prevShadow = renderer.shadowMap.autoUpdate, prevBg = scene.background, prevOverride = scene.overrideMaterial;
    // 1) profundidade da cena principal (só objetos opacos)
    const hidden = [], ui = [];
    scene.traverse((o) => { if (!o.visible) return; const m = o.material;
      if (o.isSprite || o.isPoints || o.isLine || o.isLight || (m && !Array.isArray(m) && (m.transparent && !m.depthWrite || m.colorWrite === false && !m.depthWrite))) {
        hidden.push(o);
        // elementos de interface na cena (marcadores: toneMapped=false, translúcidos) são redesenhados POR CIMA do isolux
        if (m && !Array.isArray(m) && m.toneMapped === false && m.transparent && m.blending !== THREE.AdditiveBlending) ui.push(o);
      } });
    for (const o of hidden) o.visible = false;
    // o pré-passe de profundidade só é refeito quando a câmera/tamanho mudam (ou a cada ~0,5 s para objetos que se movem)
    const sig = camera.matrixWorld.elements.join(',') + camera.projectionMatrix.elements.join(',') + this._size.x + 'x' + this._size.y;
    // câmera acima do forro (planta / visão geral) = leitura de MAPA: o plano fica por cima de cadeiras e luminárias
    // (as luminárias são desenhadas como contornos na textura); de dentro da sala, oclusão real pela profundidade.
    const mapView = camera.position.y > (this.stage.room?.H ?? 2.7) + 0.05;
    const redoDepth = !mapView && (sig !== this._sig || ++this._age > 30); if (redoDepth) { this._sig = sig; this._age = 0; }
    if (mapView) this._sig = '';
    renderer.setRenderTarget(this.rt); renderer.setClearColor(0x000000, 0); renderer.autoClear = false; renderer.clear(true, redoDepth || mapView, false);
    renderer.shadowMap.autoUpdate = false; scene.background = null; scene.overrideMaterial = this.depthMat;
    try { if (redoDepth) renderer.render(scene, camera); } finally {
      scene.overrideMaterial = prevOverride; scene.background = prevBg; renderer.shadowMap.autoUpdate = prevShadow;
    }
    // 2) sobreposição (linear, alfa pré-multiplicado pela mistura normal sobre preto transparente)
    renderer.render(this.overlay, camera);
    // 3) marcadores por cima (camada 31 temporária; a profundidade do pré-passe continua valendo)
    if (ui.length) {
      const mask = camera.layers.mask; for (const o of ui) { o.visible = true; o.layers.enable(31); }
      camera.layers.set(31); renderer.shadowMap.autoUpdate = false; scene.background = null;
      const ovMode = MARK_OV?.uOvMode?.value; if (MARK_OV) MARK_OV.uOvMode.value = 0;
      try { renderer.render(scene, camera); } finally {
        if (MARK_OV) MARK_OV.uOvMode.value = ovMode;
        camera.layers.mask = mask; for (const o of ui) { o.layers.disable(31); o.visible = false; }
        scene.background = prevBg; renderer.shadowMap.autoUpdate = prevShadow;
      }
    }
    for (const o of hidden) o.visible = true;
    // 4) composição sobre a imagem final (já em sRGB)
    this.quad.material.uniforms.tBase.value = readBuffer.texture; this.quad.material.uniforms.tOver.value = this.rt.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (this.clear) renderer.clear();
    this.quad.render(renderer);
    renderer.autoClear = prevAuto; renderer.setClearColor(this._cc, prevAlpha);
  }
  dispose() { this.rt.dispose(); this.depthMat.dispose(); this.quad.material.dispose(); this.quad.dispose(); }
}

/**
 * Liga a cena de sobreposição ao stage. Retorna {scene, setEnabled(b)}. Mantém o passe como o ÚLTIMO do composer
 * (o RENDER pode recriar o pós ao trocar a qualidade).
 */
export function attachOverlay(stage) {
  const overlay = new THREE.Scene(); overlay.name = 'isolux-overlay';
  const hasPost = () => !!stage.post?.composer;
  let pass = null, enabled = false, fallback = false;
  function ensure() {
    if (!hasPost()) { // RENDER sem pós: desenha na própria cena
      if (!fallback) { fallback = true; stage.scene.add(overlay); }
      overlay.visible = enabled; return;
    }
    if (fallback) { fallback = false; stage.scene.remove(overlay); overlay.visible = true; }
    const comp = stage.post.composer, ps = comp.passes;
    if (!pass) pass = new IsoluxOverlayPass(stage, overlay);
    // posição: logo ANTES do passe final de etiquetas da MARCAÇÃO (se houver), senão o último
    const labelsPass = ps.find((p) => p !== pass && p.oScene && typeof p.getCamera === 'function');
    const want = labelsPass ? ps.indexOf(labelsPass) - (ps.indexOf(pass) >= 0 && ps.indexOf(pass) < ps.indexOf(labelsPass) ? 1 : 0) : ps.length - (ps.includes(pass) ? 1 : 0);
    const i = ps.indexOf(pass);
    if (i !== want) { if (i >= 0) ps.splice(i, 1); const at = labelsPass ? ps.indexOf(labelsPass) : ps.length; ps.splice(at, 0, pass);
      pass.setSize?.(); }
    pass.enabled = enabled;
  }
  stage.onFrame?.(ensure);
  return { scene: overlay, setEnabled(b) { enabled = !!b; try { ensure(); } catch (e) { console.warn('[isolux overlay]', e); } } };
}

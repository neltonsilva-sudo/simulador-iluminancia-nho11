// RENDER — renderer, câmera, controles, vistas, IBL da própria sala, reflexo do piso, pós-processamento. Dono: RENDER.
// API (docs/CONTRACT.md): createStage(canvas,{quality,still}) → stage
//   {THREE, renderer, scene, camera, controls, canvas, room, setRoom, onFrame, setView, addPostPass, setExposure, ...}
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { createPost, TONEMAPS } from './scene_post.js';
import { createEnv } from './scene_env.js';
import { createFloorReflection } from './scene_reflect.js';
import { viewSpec, ease, REF1 } from './scene_views.js';

// Calibração fotométrica: luzes em unidades reais (lm, cd, nit). Uma parede branca (ρ≈0,8) com ~150 lx tem
// L = ρE/π ≈ 38 cd/m²; K_PHYS leva isso a ~0,6 (branco claro, não estourado, após o tone mapping Neutral).
// A exposição é FIXA (física): 500 lx parece mais claro que 200 lx, dimerizar escurece. Uma medição de AE no boot só
// assume se as unidades estiverem fora de escala (> 4× de diferença) — proteção contra tela branca/preta.
const K_PHYS = 0.019; // calibrado (tone mapping Neutral): sala padrão, Ē≈220 lx → paredes ≈ 200/255 como na foto

// Guarda global (nível do renderer): nenhum material grava NaN/Inf nem passa do limite do HalfFloat (65504) nos alvos
// HDR — emissores físicos muito intensos (chips de LED a dezenas de milhares de nit) virariam Inf, e um único Inf
// contamina mipmaps, PMREM e bloom (a imagem inteira estoura em branco).
const HDR_MAX = 30000.0;
if (!THREE.ShaderChunk.opaque_fragment.includes('HDR_GUARD')) {
  THREE.ShaderChunk.opaque_fragment += `
// HDR_GUARD
if (any(isnan(gl_FragColor.rgb)) || any(isinf(gl_FragColor.rgb))) gl_FragColor.rgb = vec3(0.0);
gl_FragColor.rgb = clamp(gl_FragColor.rgb, 0.0, ${HDR_MAX.toFixed(1)});`;
}

export function createStage(canvas, opts = {}) {
  RectAreaLightUniformsLib.init();
  const qs = new URLSearchParams(location.search);
  let quality = opts.quality === 'media' ? 'media' : 'alta';
  const still = !!opts.still;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true, stencil: false });
  const DPR_MAX = quality === 'alta' ? 1.25 : 1.0; // Retina a 2× custava 2,5× mais pixels
  const prLock = parseFloat(qs.get('pr'));
  let pixelRatio = Number.isFinite(prLock) ? prLock : Math.min(devicePixelRatio || 1, DPR_MAX);
  renderer.setPixelRatio(pixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  let toneName = TONEMAPS[qs.get('tm')] ? qs.get('tm') : 'neutral';
  renderer.toneMapping = TONEMAPS[toneName];
  renderer.toneMappingExposure = 1.0; // a exposição vai no passe PRE (antes do bloom)
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.localClippingEnabled = false;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1c1f23);
  const camera = new THREE.PerspectiveCamera(REF1.vfov, 16 / 9, 0.05, 80);
  camera.position.set(0, 1.5, 3);

  const controls = new OrbitControls(camera, canvas);
  Object.assign(controls, { enableDamping: true, dampingFactor: 0.085, rotateSpeed: 0.55, zoomSpeed: 0.8, panSpeed: 0.7, screenSpacePanning: true, maxPolarAngle: Math.PI - 0.08, minDistance: 0.3, maxDistance: 40 });

  let room = { L: 9.16, W: 5.9, H: 2.7, plane: 0.75 };
  const frameFns = [];

  // ---------- pós, ambiente, reflexo ----------
  let post = createPost(renderer, scene, camera, quality);
  const refl = createFloorReflection(renderer, scene, { enabled: quality === 'alta', scale: 0.4 });
  const env = createEnv(renderer, scene, () => room, { before: () => refl.suspend(true), after: () => refl.suspend(false) });

  // ---------- exposição (AE de celular travado uma vez + compensação manual) ----------
  let K = K_PHYS, expComp = 1;
  const qsExp = parseFloat(qs.get('exp'));
  if (Number.isFinite(qsExp)) expComp = qsExp;
  const qsWb = (qs.get('wb') || '').split(',').map(Number);
  if (qsWb.length === 3 && qsWb.every(Number.isFinite)) post.pre.uniforms.wb.value.set(...qsWb);
  const AE_KEY = 0.30; // valor-chave (média log de luminância do quadro ref1 → cinza claro de foto noturna de celular)
  const meterRT = new THREE.WebGLRenderTarget(128, 52, { type: THREE.FloatType });
  const meterCam = new THREE.PerspectiveCamera();
  function meter() {
    // Mede o quadro que o usuário está vendo (como a câmera de um celular). Na vista 'ref1' a medição coincide com a
    // calibração física; nas demais, a exposição se adapta para não estourar (teto perto das calhas, janelas de dia).
    meterCam.copy(camera); meterCam.near = 0.05; meterCam.far = 80; meterCam.updateProjectionMatrix(); meterCam.updateMatrixWorld();
    refl.suspend(true);
    const prev = renderer.getRenderTarget();
    const prevClip = renderer.clippingPlanes; renderer.clippingPlanes = []; // o corte do teto (vista de cima) não pode entrar na medição
    renderer.setRenderTarget(meterRT); renderer.clear(); renderer.render(scene, meterCam); renderer.setRenderTarget(prev);
    renderer.clippingPlanes = prevClip;
    refl.suspend(false);
    const buf = new Float32Array(128 * 52 * 4);
    renderer.readRenderTargetPixels(meterRT, 0, 0, 128, 52, buf);
    const lum = [];
    for (let i = 0; i < 128 * 52; i++) { const l = 0.2126 * buf[i * 4] + 0.7152 * buf[i * 4 + 1] + 0.0722 * buf[i * 4 + 2]; if (Number.isFinite(l)) lum.push(l); }
    lum.sort((a, b) => a - b);
    const n = Math.floor(lum.length * 0.97); // ignora as fontes (3% mais brilhantes)
    let acc = 0, c = 0; for (let i = 0; i < n; i++) { acc += Math.log(1e-4 + lum[i]); c++; }
    if (c < 50) return null;
    const avg = Math.exp(acc / c);
    if (!(avg > 1e-4)) { Kt = K_PHYS * K_UP; return null; } // luzes apagadas à noite: exposição no teto do AE (fica escuro)
    const kae = AE_KEY / avg;
    stage.aeSuggested = kae;
    // AE de celular com limites: a noite (luz artificial) fica na exposição FÍSICA calibrada (dimerizar escurece);
    // de dia (sol/céu, 1000+ lx) a câmera fecha suavemente até K_PHYS/60. Compensação parcial (expoente 0,9) como num
    // celular: dia continua parecendo mais claro que noite. Unidades fora de escala (> 30× / < 1/80) → AE pleno (proteção).
    const r = kae / K_PHYS;
    if (r > 30 || r < 1 / 80) Kt = kae;
    else Kt = K_PHYS * Math.min(K_UP, Math.max(1 / 60, Math.pow(r, 0.9)));
    if (Math.abs(Math.log(r)) < Math.log(1.6)) Kt = K_PHYS; // faixa morta: sala padrão à noite = calibração física exata
    // proteção de altas luzes: no máximo ~4% do quadro (fora as fontes) acima do branco
    const p96 = lum[Math.min(lum.length - 1, Math.floor(lum.length * 0.96))];
    if (p96 > 0 && Kt * p96 > 0.95) Kt = 0.95 / p96;
    // bloom proporcional: muita área estourada (teto luminoso, manchas de sol) → bloom contido
    let bright = 0; for (let i = 0; i < lum.length; i++) if (lum[i] * Kt > 2.0) bright++;
    brightFrac = bright / lum.length;
    return avg;
  }
  const K_UP = 1.25;
  let Kt = K_PHYS, brightFrac = 0.01;
  const exposure = () => K * expComp;

  // ---------- tamanho / resolução dinâmica ----------
  let cssW = 0, cssH = 0;
  function resize() {
    const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
    cssW = w; cssH = h;
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(w, h, false);
    post.composer.setPixelRatio(pixelRatio);
    post.composer.setSize(w, h);
    const db = renderer.getDrawingBufferSize(new THREE.Vector2());
    post.cam.uniforms.res.value.set(db.x, db.y);
    if (!post.hi) post.aa.uniforms.resolution.value.set(1 / db.x, 1 / db.y);
    refl.setSize(db.x, db.y);
    applyCameraAspect();
  }
  let cur = { squash: 1 };
  // Inset lateral (painel da UI cobrindo a esquerda): o centro óptico vai para o meio da área livre (setViewOffset),
  // sem mudar a câmera. Ativo nas vistas de detalhe (point/top/overview/ceiling); ref1 e orbit ficam como estão.
  let insetL = 0, insetAuto = true, insetUse = 0;
  function applyCameraAspect() {
    const W = cssW || 16, H = cssH || 9;
    const L = cur.insetOK ? Math.min(insetL, W * 0.45) : 0;
    const k = anim ? 1 : 1; void k;
    insetUse += (L - insetUse) * (anim ? 1 : 1);
    if (insetUse > 1) {
      camera.aspect = (W + insetUse) / H / (cur.squash || 1);
      camera.setViewOffset(W + insetUse, H, 0, 0, W, H);
    } else {
      camera.aspect = W / H / (cur.squash || 1);
      camera.clearViewOffset();
    }
    camera.updateProjectionMatrix();
  }
  function detectInset() { // painel fixo à esquerda dentro de #ui (largura 200 px..50% da tela, altura > 55%)
    if (!insetAuto) return;
    let L = 0;
    try {
      const ui = document.getElementById('ui');
      if (ui && getComputedStyle(ui).display !== 'none') {
        for (const el of ui.querySelectorAll(':scope > *, :scope > * > *')) {
          const r = el.getBoundingClientRect();
          if (r.width < 200 || r.width > innerWidth * 0.5 || r.height < innerHeight * 0.55 || r.left > 24) continue;
          const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity < 0.2) continue;
          L = Math.max(L, r.right);
        }
      }
    } catch {}
    if (Math.abs(L - insetL) > 8) { insetL = L; applyCameraAspect(); }
  }

  // ---------- vistas + animação ----------
  let anim = null, viewName = 'ref1', viewOpts = {}, inside = true, cutOn = false;
  const cutPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
  function setView(name, o = {}) {
    viewName = name || 'ref1'; viewOpts = o;
    const aspect = (cssW || 16) / (cssH || 9);
    const s = viewSpec(viewName, { ...o, occluded }, room, aspect);
    controls.enableRotate = s.rotate !== false;
    if (o.animate && !still) {
      anim = { t: 0, t0ms: performance.now(), dur: o.duration || 1.15, p0: camera.position.clone(), t0: controls.target.clone(), f0: camera.fov, s0: cur.squash, s };
      controls.enabled = false;
    } else {
      anim = null; finishView(s);
    }
    cur.insetOK = /^(point:|top|overview|ceiling)/.test(viewName);
    applyCameraAspect();
    return s;
  }
  // fração de raios bloqueados entre a câmera e os alvos (ignora marcadores/luxímetro e o que está a < 0,2 m do alvo)
  const ray = new THREE.Raycaster();
  function occluded(from, targets) {
    let blocked = 0;
    const objs = scene.children.filter((c) => c.visible && !/MARC|MARK|lux/i.test(c.name || ''));
    for (const t of targets) {
      const d = t.clone().sub(from); const len = d.length(); d.normalize();
      ray.set(from, d); ray.far = Math.max(0.01, len - 0.2);
      const hit = ray.intersectObjects(objs, true).find((h) => h.object.isMesh && h.object.visible && !(h.object.material?.transparent && !h.object.material?.depthWrite));
      if (hit) blocked++;
    }
    return blocked / targets.length;
  }
  function finishView(s) {
    camera.position.copy(s.pos); controls.target.copy(s.target); camera.fov = s.fov; cur.squash = s.squash;
    inside = !!s.inside; controls.enabled = true;
    applyCameraAspect(); controls.update();
  }
  function stepAnim(dt) {
    if (!anim) return;
    anim.t = Math.min(1, (performance.now() - anim.t0ms) / 1000 / anim.dur); // relógio real: termina no tempo mesmo com quadros lentos
    const k = ease(anim.t), s = anim.s;
    camera.position.lerpVectors(anim.p0, s.pos, k);
    controls.target.lerpVectors(anim.t0, s.target, k);
    camera.fov = anim.f0 + (s.fov - anim.f0) * k;
    cur.squash = anim.s0 + (s.squash - anim.s0) * k;
    applyCameraAspect();
    camera.lookAt(controls.target);
    if (anim.t >= 1) { const ss = anim.s; anim = null; finishView(ss); }
  }
  controls.addEventListener('start', () => { if (anim) { anim = null; controls.enabled = true; } });

  // limites: dentro da sala a câmera não atravessa paredes/teto/piso
  function clampInside() {
    if (!inside || anim) return;
    const { L, W, H } = room, m = 0.12, p = camera.position;
    p.x = Math.max(-W / 2 + m, Math.min(W / 2 - m, p.x));
    p.z = Math.max(-L / 2 + m, Math.min(L / 2 - m, p.z));
    p.y = Math.max(0.15, Math.min(H - 0.1, p.y));
    const t = controls.target;
    t.x = Math.max(-W / 2, Math.min(W / 2, t.x)); t.z = Math.max(-L / 2, Math.min(L / 2, t.z)); t.y = Math.max(0, Math.min(H, t.y));
  }
  // corte do teto (casa de bonecas) quando a câmera está acima do forro
  function updateCut() {
    const want = camera.position.y > room.H - 0.02;
    cutPlane.constant = room.H - 0.006;
    if (want !== cutOn) { cutOn = want; renderer.clippingPlanes = want ? [cutPlane] : []; }
  }

  // ---------- vigia da cena (IBL + reflexos + sombras) ----------
  let sig = '', sigT = 0, dirtyAt = -1, bootT = 0, frame = 0;
  const shadowBudget = { max: quality === 'alta' ? 4 : 2, mapSize: quality === 'alta' ? 1024 : 512 };
  function enforceShadowBudget() {
    let n = 0;
    scene.traverse((o) => {
      if (!o.isLight || !o.shadow) return;
      if (o.castShadow) {
        if (++n > shadowBudget.max) { o.castShadow = false; o.userData.shadowCulledByBudget = true; }
        else if (o.shadow.mapSize.x > shadowBudget.mapSize) { o.shadow.mapSize.set(shadowBudget.mapSize, shadowBudget.mapSize); o.shadow.map?.dispose(); o.shadow.map = null; }
      }
    });
  }
  function refreshEnv() {
    enforceShadowBudget();
    refl.scan();
    env.refresh();
    meter(); // AE reavaliado a cada mudança de cena (luz natural, dimerização, sala); a exposição segue suave
    sig = env.signature();
  }
  function watch(now) {
    if (now - sigT < 0.4) return;
    sigT = now;
    const s = env.signature();
    if (s !== sig) { sig = s; dirtyAt = now; }
    if (dirtyAt >= 0 && now - dirtyAt > 0.45) { dirtyAt = -1; refreshEnv(); }
  }

  // ---------- desempenho ----------
  let fc = 0, ft = 0, lowT = 0, highT = 0, last = performance.now(), autoDowngraded = false;
  let fpsT0 = performance.now();
  window.__fps = 0;
  function perf(dt) {
    fc++; const nowMs = performance.now(); ft = (nowMs - fpsT0) / 1000;
    if (ft >= 0.5) {
      const fps = fc / ft; window.__fps = Math.round(fps); fc = 0; ft = 0; fpsT0 = nowMs;
      detectInset();
      if (still || Number.isFinite(prLock) || bootT < 4 || anim) { lowT = highT = 0; return; }
      if (fps < 45) { lowT += 0.5; highT = 0; } else if (fps > 58) { highT += 0.5; lowT = 0; } else { lowT = highT = 0; }
      const maxPR = Math.min(devicePixelRatio || 1, DPR_MAX);
      if (lowT >= 2 && pixelRatio > 0.6) { pixelRatio = Math.max(0.6, pixelRatio - 0.15); lowT = 0; resize(); }
      else if (lowT >= 3 && quality === 'alta' && !autoDowngraded) { autoDowngraded = true; lowT = 0; stage.setQuality('media'); console.info('[render] qualidade média automática (GPU lenta)'); }
      else if (highT >= 2.5 && pixelRatio < maxPR) { pixelRatio = Math.min(maxPR, pixelRatio + 0.15); highT = 0; resize(); }
    }
  }

  // ---------- assinatura de movimento (barata, por quadro) ----------
  const lastCam = new THREE.Matrix4(), lastProj = new THREE.Matrix4();
  let lastMotion = 0, motionSigVal = 0, staticN = 0, settleT = 0;
  function motionSig() {
    let a = 0, k = 0;
    scene.traverseVisible((o) => { if (o.isMesh || o.isLight) { const e = o.matrixWorld.elements; k++; a += (e[12] * 1.3 + e[13] * 2.1 + e[14] * 3.7) * ((k % 7) + 1); if (o.isLight) a += o.intensity * 0.01; } });
    motionSigVal = Math.round(a * 300) + k * 1e9; // ~3 mm: ignora balanço do tripé/pulsos
    return motionSigVal;
  }

  // ---------- laço ----------
  function renderFrame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    const t = now / 1000; bootT += dt; frame++;
    perf(dt);
    stepAnim(dt);
    if (!anim) { controls.update(); clampInside(); }
    updateCut();
    frameFns.forEach((f) => { try { f(dt, t); } catch (e) { console.error('[onFrame]', e); } });
    if (frame === 2) refreshEnv();
    else if (frame > 2) watch(t);
    // exposição segue o alvo do AE com constante de tempo de ~0,7 s (no boot e em captura 'still', direto)
    K = (frame < 30 || still) ? Kt : K * Math.exp(Math.log(Kt / K) * Math.min(1, dt / 0.7));
    post.bloom.strength = post.bloomBase * Math.min(1, Math.max(0.12, 0.025 / Math.max(1e-4, brightFrac)));
    const ex = exposure();
    post.pre.uniforms.exposure.value = ex;
    post.cam.uniforms.time.value = still ? 0.5 : t;
    camera.updateMatrixWorld();
    // cache estático: com câmera parada e cena sem movimento, reflexo planar e GTAO (os passes mais caros depois da
    // própria cena) só são refeitos a cada 8 quadros — o resultado é idêntico e sobra GPU para manter ≥ 45 fps.
    const moving = !lastCam.equals(camera.matrixWorld) || !lastProj.equals(camera.projectionMatrix) || motionSig() !== lastMotion;
    if (moving) settleT = 0; else if (settleT >= 0 && (settleT += dt) > 0.25) { settleT = -1; meter(); }
    lastCam.copy(camera.matrixWorld); lastProj.copy(camera.projectionMatrix); lastMotion = motionSigVal;
    staticN = moving ? 0 : staticN + 1;
    // cena parada há ~0,5 s: redesenha só 1 a cada 3 quadros (libera GPU/CPU para a interface; a imagem não muda)
    if (!still && staticN > 30 && staticN % 3 !== 0) return;
    const heavy = staticN < 3 || staticN % 8 === 0;
    if (heavy) refl.update(camera);
    if (post.gtao) post.gtao.enabled = heavy;
    post.composer.render(dt);
  }

  const stage = {
    THREE, renderer, scene, camera, controls, canvas,
    get room() { return room; },
    setRoom(r) { room = { ...room, ...r }; bootT = 1.5; sig = ''; if (!anim) setView(viewName, { ...viewOpts, animate: false }); },
    onFrame(fn) { frameFns.push(fn); },
    setView,
    get view() { return viewName; },
    addPostPass(pass) { post.addPass(pass); return pass; },
    /** v: número = compensação linear sobre o AE calibrado (1 = padrão); 'auto' = remede o AE agora. */
    setExposure(v) {
      if (v === 'auto') { expComp = 1; meter(); return exposure(); }
      if (Number.isFinite(+v)) expComp = Math.max(0, +v);
      return exposure();
    },
    get exposure() { return exposure(); },
    get exposureBase() { return K; },
    get exposureTarget() { return Kt; },
    setToneMapping(name) { if (TONEMAPS[name]) { toneName = name; renderer.toneMapping = TONEMAPS[name]; } return toneName; },
    refreshEnv,
    get env() { return env; },
    floorReflection: refl,
    shadowBudget,
    get quality() { return quality; },
    setQuality(q) {
      q = q === 'media' ? 'media' : 'alta'; if (q === quality) return;
      quality = q; post.composer.dispose?.(); post = createPost(renderer, scene, camera, quality);
      refl.enabled = quality === 'alta'; shadowBudget.max = q === 'alta' ? 4 : 2; shadowBudget.mapSize = q === 'alta' ? 1024 : 512;
      resize();
    },
    get post() { return post; },
    get fx() { return post.cam.uniforms; }, // nitidez, vinheta, grão, saturação... (ajuste fino)
    get pixelRatio() { return pixelRatio; },
    get staticFrames() { return staticN; },
    /** Área coberta pela UI à esquerda (px CSS). null = detecção automática. */
    setInsets(o) { if (o == null) { insetAuto = true; return; } insetAuto = false; insetL = +o.left || 0; applyCameraAspect(); },
    render() { renderFrame(performance.now()); },
    REF1,
  };

  addEventListener('resize', resize); resize();
  try { window.__sim?.on?.('daylight', () => { dirtyAt = 0; sigT = 0; }); } catch {}
  setView('ref1', { animate: false });
  renderer.setAnimationLoop(renderFrame);
  window.__stage = stage;
  return stage;
}

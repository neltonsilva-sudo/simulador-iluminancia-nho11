// MARCAÇÃO — window.__lux: API pública do luxímetro para demonstrações/roteiros (documentada em docs/CONTRACT.md).
// Close de câmera suave por peça (vista 'orbit' do RENDER, animada) + destaque com contorno pulsante.
import * as THREE from 'three';
import { OV } from './mark_overlay.js';

const V = THREE.Vector3;
const KEY_ALIAS = { source: 'hold', ls: 'hold', read: 'mem', lxfc: 'unit', fc: 'unit', cd: 'unit' };
const KEY_NAMES = ['power', 'hold', 'mem', 'zero', 'up', 'down', 'unit', 'source', 'read', 'lxfc', 'ls'];

export function installLuxAPI(stage, dev) {
  const I = dev._internal;
  // destaque: casca levemente inflada pelas normais com brilho de borda (Fresnel), aditiva — funciona também em
  // superfícies abertas (lathe/planos). Pré-compensada pela exposição do RENDER (OV.uOvGain).
  const hullMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0x4fd2ff) }, uOpacity: { value: 0.8 }, uT: { value: 0.0008 }, uOvGain: OV.uOvGain },
    vertexShader: /* glsl */`uniform float uT; varying vec3 vN; varying vec3 vV;
      void main(){ vec3 p = position + normal * uT; vec4 mv = modelViewMatrix * vec4(p, 1.0); vN = normalize(normalMatrix * normal); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */`uniform vec3 uColor; uniform float uOpacity; uniform vec3 uOvGain; varying vec3 vN; varying vec3 vV;
      void main(){ float r = 1.0 - abs(dot(normalize(vN), normalize(vV))); float k = 0.015 + 1.2 * pow(r, 4.0);
        gl_FragColor = vec4(uColor * k * uOpacity * uOvGain, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const hulls = [];
  let focusPart = null, pending = null, savedMin = null, backByFocus = false, placing = false, token = 0;

  function clearHull() { for (const h of hulls) { h.parent?.remove(h); } hulls.length = 0; }
  function outline(meshes, t) {
    clearHull(); hullMat.uniforms.uT.value = t;
    for (const m of meshes) {
      if (!m?.isMesh || !m.geometry || m.material?.visible === false) continue;
      const h = new THREE.Mesh(m.geometry, hullMat);
      h.renderOrder = 5; h.castShadow = h.receiveShadow = false; h.userData.noEnv = true; h.userData.noReflect = true; h.raycast = () => {};
      m.add(h); hulls.push(h);
    }
  }
  function partMeshes(part) {
    const P = I.parts; if (!P) return [];
    if (part === 'body' || part === 'back') return P.body || [];
    if (part === 'lcd') return P.lcd || [];
    if (part === 'sensor') return P.sensor || [];
    if (part === 'cap') return P.cap || [];
    if (part === 'tripod') return P.tripod || [];
    const k = P.keys?.[KEY_ALIAS[part] || part]; return k ? [k] : [];
  }

  /** Coloca o aparelho em cena se ainda não estiver (ponto ativo, ou p1). */
  function ensurePlaced() {
    if (dev.active) return true;
    let id = null, pts = [];
    try { pts = window.__sim?.points?.() || []; id = window.__sim?.state?.activePoint || null; } catch { /* */ }
    if (!id || !pts.some((p) => p.id === id)) id = (pts.find((p) => p.id === 'p1') || pts[0])?.id;
    if (!id) return false;
    placing = true;
    try {
      if (window.__markers?.luxmeterTo) window.__markers.luxmeterTo(id);
      else { const p = pts.find((q) => q.id === id); dev.moveTo(p.x, p.z, { plane: 0.75, ...(window.__sim?.state?.room || {}) }, id); }
    } finally { placing = false; }
    return dev.active;
  }

  // ---------- poses de câmera ----------
  const up = new V(0, 1, 0);
  function pose(part) {
    I.rig.updateMatrixWorld(true);
    const body = I.body, mount = I.mount, cell = I.cell; if (!body || !mount || !cell) return null;
    const mq = mount.getWorldQuaternion(new THREE.Quaternion());
    const mountN = new V(0, 0, 1).applyQuaternion(mq);
    const yaw = I.S.yaw, front = new V(Math.sin(yaw), 0, Math.cos(yaw)), right = new V(Math.cos(yaw), 0, -Math.sin(yaw));
    const elev = (v, deg) => { const a = THREE.MathUtils.degToRad(deg); return v.clone().multiplyScalar(Math.cos(a)).addScaledVector(up, Math.sin(a)).normalize(); };
    let T, dir, viewH, fov = 20;
    const key = I.parts?.keys?.[KEY_ALIAS[part] || part];
    if (part === 'body' || part === 'back') { T = body.getWorldPosition(new V()); dir = mountN.clone().addScaledVector(up, 0.12).normalize(); viewH = part === 'back' ? 0.2 : 0.23; fov = 22; }
    else if (part === 'lcd') { T = body.localToWorld(new V(0, 0.0372, 0.014)); dir = mountN.clone(); viewH = 0.072; fov = 18; }
    else if (part === 'sensor') { T = cell.group.localToWorld(new V(0.035, -0.008, 0)); dir = elev(front, 52).addScaledVector(right, -0.25).normalize(); viewH = 0.15; fov = 22; }
    else if (part === 'cap') { T = I.cap.group.getWorldPosition(new V()); dir = elev(front.clone().addScaledVector(right, -0.45).normalize(), I.S.cap ? 45 : 22); viewH = 0.13; fov = 22; }
    else if (part === 'tripod') { T = new V(I.rig.position.x, 0.4, I.rig.position.z); dir = elev(front, 16); viewH = 0.98; fov = 36; }
    else if (key) { T = key.getWorldPosition(new V()); dir = mountN.clone().addScaledVector(up, 0.1).normalize(); viewH = 0.05; fov = 18; }
    else return null;
    const d = (viewH / 2) / Math.tan(THREE.MathUtils.degToRad(fov) / 2);
    const P = T.clone().addScaledVector(dir, d);
    return { pos: P, target: T, fov, d };
  }
  function goPose(ps, dur) {
    const r = Math.hypot(ps.pos.x - ps.target.x, ps.pos.z - ps.target.z), ang = Math.atan2(ps.pos.x - ps.target.x, ps.pos.z - ps.target.z);
    const c = stage.controls; if (c) { if (savedMin == null) savedMin = c.minDistance; c.minDistance = Math.min(savedMin, 0.06); }
    const f = (x) => (+x).toFixed(5);
    stage.setView('orbit', { animate: true, duration: dur, orbit: [f(ang), f(ps.pos.y), f(r), f(ps.target.x), f(ps.target.y), f(ps.target.z), f(ps.fov)].join(',') });
  }

  stage.onFrame?.((dt, t) => {
    if (hulls.length) hullMat.uniforms.uOpacity.value = 0.45 + 0.4 * (0.5 + 0.5 * Math.sin(t * 4.2));
    if (pending && !I.busy()) {
      const p = pending; pending = null;
      const ps = pose(p.part);
      if (!ps) { p.resolve(false); return; }
      outline(partMeshes(p.part), p.part === 'tripod' ? 0.0025 : p.part === 'body' || p.part === 'back' ? 0.0009 : 0.0007);
      goPose(ps, p.dur);
      setTimeout(() => p.resolve(true), p.dur * 1000 + 60);
    }
  });

  dev.onRetarget = () => { if (placing) return; if (focusPart) { clearHull(); focusPart = null; I.S.yawLock = false; } };

  const lux = {
    /** Liga/desliga (sem argumento: alterna). Ao ligar, teste de segmentos de ~1 s. */
    power(on) { return dev.setPower(on); },
    /** Tecla: 'power'|'source'|'hold'|'mem'|'zero'|'up'|'down' (+ 'read', 'unit', 'rec'). opts.long = pressão longa. */
    press(name, opts) { if (!dev.active) ensurePlaced(); return dev.press(String(name || '').toLowerCase(), opts || {}); },
    /** Tampa da fotocélula: true = colocada (leitura ~0, permite ZERO); false = retirada (pendurada no cordão). */
    setCap(b) { return dev.setCap(b); },
    state() { return dev.state(); },
    /** Close suave numa peça + contorno pulsante. part: 'body'|'lcd'|'sensor'|'cap'|'back'|'tripod'|tecla. Promise → true ao chegar. */
    focus(part = 'body', opts = {}) {
      part = String(part).toLowerCase();
      if (!['body', 'lcd', 'sensor', 'cap', 'back', 'tripod'].includes(part) && !KEY_NAMES.includes(part)) return Promise.resolve(false);
      ensurePlaced();
      I.S.yawLock = true; focusPart = part;
      if (part === 'back' && !I.S.back) { dev.showBack(true); backByFocus = true; }
      else if (part !== 'back' && part !== 'body' && part !== 'tripod' && part !== 'sensor' && part !== 'cap' && I.S.back) { dev.showBack(false); }
      const myTok = ++token;
      if (pending) pending.resolve(false);
      return new Promise((resolve) => { pending = { part, dur: opts.duration || 1.4, resolve: (v) => resolve(myTok === token ? v : false) }; });
    },
    /** Sai do close: remove o destaque e volta à vista do ponto (ou à vista da foto). */
    unfocus(opts = {}) {
      token++; if (pending) { pending.resolve(false); pending = null; }
      clearHull(); focusPart = null; I.S.yawLock = false;
      if (backByFocus) { dev.showBack(false); backByFocus = false; }
      const c = stage.controls; if (c && savedMin != null) { c.minDistance = savedMin; savedMin = null; }
      const id = dev.id;
      const dur = opts.duration || 1.3;
      try {
        if (id && window.__sim?.setView) window.__sim.setView('point:' + id, { animate: true, duration: dur });
        else stage.setView(id ? 'point:' + id : 'ref1', { animate: true, duration: dur });
      } catch (e) { console.error(e); }
      return new Promise((r) => setTimeout(() => r(true), dur * 1000 + 60));
    },
    /** Gira o corpo para mostrar o verso (etiquetas de calibração, QC, nº de série, advertência/pilhas). */
    showBack(b = true) { if (!b) backByFocus = false; return dev.showBack(b); },
    /** Assina mudanças de estado (teclas, tampa, visor). Devolve função para cancelar. */
    onChange(fn) { return dev.onChange(fn); },
    // extras
    get focused() { return focusPart; },
    sources: dev.sources,
    setSource(x) { return dev.setSource(x); },
    clearMem() { return dev.clearMem(); },
    /** Registra a leitura atual no campo do ponto (== __sim.recordReading(id)). */
    record() { return dev.press('rec'); },
    place(id) { if (id && window.__markers?.luxmeterTo) window.__markers.luxmeterTo(String(id).toLowerCase()); else ensurePlaced(); return dev.state(); },
  };
  window.__lux = lux;
  return lux;
}

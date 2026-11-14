// MARCAÇÃO — luxímetro virtual "LED Light Meter" (réplica do aparelho do usuário, fotos em refs/lux/, sem marca):
// corpo cinza-claro com bumper de borracha ranhurado, LCD de 2 linhas (leitura + fonte de luz/fator), 6 teclas
// (LX/FC·CD, MEM·READ, HOLD·L.S., ▲, ZERO, ▼) + POWER amarelo; fotocélula separada com cúpula difusora, tampa presa
// por cordão e cabo espiralado físico. A fotocélula fica num tripé com o TOPO DA CÚPULA EXATAMENTE em room.plane
// (0,75 m); o corpo fica num berço preso à coluna do tripé, inclinado para a câmera (visor legível na vista do ponto).
// Funções (manual do aparelho): POWER liga/desliga (teste de segmentos); HOLD congela; HOLD longo = L.S. (fonte de luz:
// código + fator na 2ª linha, fator aplicado à leitura); MEM grava (até 99), MEM longo = READ (▲/▼ navegam); ZERO só
// com a tampa; LX/FC alterna lux/fc. API de demonstração: window.__lux (mark_lux_api.js, docs/CONTRACT.md).
import * as THREE from 'three';
import { canvasTex } from './mark_tex.js';
import { drawLuxLCD, LCD_W, LCD_H } from './mark_lux_lcd.js';
import { makeMaterials, buildBody, buildPhotocell, buildCap, buildTripod, buildCradle, CoilCable, BODY } from './mark_lux_geo.js';
import { installLuxAPI } from './mark_lux_api.js';

const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/** Fontes de luz (tecla HOLD longa / L.S.): código no visor + fator de correção espectral. */
// O aparelho vem ajustado para LED branco (fator 1,000 = fonte da sala): visor estável == __sim.readLuxmeter(id).
// Outra fonte → visor = readLuxmeter × fator (e é esse valor exibido que REC/MEM gravam).
export const LIGHT_SOURCES = [
  { code: 'L1', name: 'LED branco', factor: 1.000 },
  { code: 'L2', name: 'Fluorescente', factor: 0.975 },
  { code: 'L3', name: 'Vapor metálico', factor: 0.962 },
  { code: 'L4', name: 'Vapor de sódio', factor: 0.947 },
  { code: 'L5', name: 'Incandescente', factor: 1.018 },
  { code: 'L6', name: 'Luz do dia', factor: 1.012 },
];
const FC = 10.764;
const MEM_MAX = 99;

/** Fonte de luz realmente presente na sala (para o efeito do fator escolhido). */
function actualSource() {
  try {
    const st = window.__sim?.state; if (!st) return 0;
    if (st.lum?.on === false) return st.avaliacao?.periodo === 'diurno' ? 5 : 0;
    return /fluor/i.test(st.lum?.type || '') ? 1 : 0;
  } catch { return 0; }
}
function fmt4(v) {
  if (!isFinite(v)) return { s: '----', x10: false };
  v = Math.max(0, v);
  if (v >= 400000) return { s: 'OL', x10: false };
  if (v < 999.95) return { s: v.toFixed(1), x10: false };
  if (v < 9999.5) return { s: String(Math.round(v)), x10: false };
  return { s: String(Math.round(v / 10)), x10: true };
}

export function buildLuxmeter(stage) {
  const group = new THREE.Group(); group.name = 'luxmeter'; group.visible = false;
  const rig = new THREE.Group(); group.add(rig);
  const lcdCanvas = document.createElement('canvas'); lcdCanvas.width = LCD_W; lcdCanvas.height = LCD_H;
  drawLuxLCD(lcdCanvas, { off: true });
  const lcdTex = canvasTex(lcdCanvas);
  const M = makeMaterials();
  const fadeMats = new Set();
  let parts = {}, keys = [], hits = [], bodyRef = null, mountRef = null, cell = null, capObj = null, cable = null, cord = null, tripodMeshes = [];
  let plane = -1, builtFor = -1;
  const meshAt = (geo, mat, parent, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
  const tube = (a, b, r, mat, seg = 14, parent = rig) => {
    const d = new THREE.Vector3().subVectors(b, a), L = d.length();
    const m = meshAt(new THREE.CylinderGeometry(r, r, L, seg), mat, parent);
    m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); return m;
  };

  // pose do corpo no berço (frente = +Z do rig, voltada para a câmera)
  const MOUNT = { y: 0, z: 0.128, tilt: -0.5 };
  // tampa: pose assentada × pendurada pelo cordão
  const capSeat = { p: new THREE.Vector3(), q: new THREE.Quaternion() }, capHang = { p: new THREE.Vector3(), q: new THREE.Quaternion() };

  function build(pl) {
    rig.traverse((o) => { if (o.isMesh) o.geometry.dispose(); }); rig.clear();
    const yTop = pl;
    // fotocélula: topo da cúpula = plano de trabalho
    cell = buildPhotocell(M); cell.group.position.set(0, yTop, 0); rig.add(cell.group);
    // tripé
    const tp = buildTripod(M, rig, yTop, (a, b, r, mat, seg) => tube(a, b, r, mat, seg)); tripodMeshes = tp.meshes;
    // berço + corpo
    MOUNT.y = tp.yArm + 0.012;
    const mount = new THREE.Group(); mount.position.set(0, MOUNT.y, MOUNT.z); mount.rotation.x = MOUNT.tilt; rig.add(mount); mountRef = mount;
    const cradle = buildCradle(M, mount); tripodMeshes.push(...cradle.meshes);
    const armA = new THREE.Vector3(0, tp.yArm, 0.012); rig.updateMatrixWorld(true);
    const armB = mount.localToWorld(new THREE.Vector3(0, -0.006, -0.004)); rig.worldToLocal(armB);
    tripodMeshes.push(tube(armA, armB, 0.0062, M.black, 16));
    tripodMeshes.push(meshAt(new THREE.SphereGeometry(0.0085, 16, 12), M.black, rig, armB.x, armB.y, armB.z));
    const B = buildBody(M, lcdTex); B.group.position.set(0, BODY.h / 2 + 0.0002, 0); mount.add(B.group); bodyRef = B.group; B.group.userData.cableEnd = B.cableEnd;
    keys = B.keys; hits = keys.map((k) => k.hit);
    // tampa
    capObj = buildCap(M); rig.add(capObj.group);
    capSeat.p.set(0, yTop + cell.yS - 0.0016, 0); capSeat.q.identity();
    // pendurada: aba para cima, topo voltado para a frente, abaixo do olhal (lado −X)
    const mb = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0));
    capHang.q.setFromRotationMatrix(mb);
    const lugW = cell.lugPos.clone().add(cell.group.position);
    const tabW = lugW.clone().add(new THREE.Vector3(-0.012, -0.036, 0.006));
    capHang.p.copy(tabW).sub(capObj.tabLocal.clone().applyQuaternion(capHang.q));
    // cordão da tampa
    cord = meshAt(new THREE.BufferGeometry(), M.cord, rig); cord.castShadow = false;
    // cabo espiralado
    cable = new CoilCable(M.cable, { rest: 0.2, turns: 44 }); rig.add(cable.mesh); cable.inited = false;
    parts = {
      body: [...B.parts.body], back: [...B.parts.body], lcd: B.parts.lcd, keys: B.parts.keys,
      sensor: [...cell.parts.sensor, ...cell.parts.handle], cap: capObj.parts.cap, tripod: tripodMeshes,
    };
    fadeMats.clear(); rig.traverse((o) => { o.userData.noEnv = true; if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m && m.visible !== false && fadeMats.add(m)); });
    for (const m of fadeMats) { m.userData.op0 = m.opacity; m.userData.tr0 = m.transparent; }
    builtFor = pl; S.capPoseK = -1; S.backPoseK = -1;
  }

  // ---------- estado ----------
  const S = {
    x: 0, z: 0, fx: 0, fz: 0, tx: 0, tz: 0, t0: 0, dur: 0, yaw: 0, yawLock: false, fade: 0, fadeDir: 0, lcdT: 0, lastKey: '',
    id: null, arriveT: 0, on: true, testUntil: 0, hold: false, heldV: NaN, src: 0, unit: 'lux', zeroed: false,
    cap: false, capK: 1, capT0: -9, capFrom: 1, lf: 1, mode: 'meas', readIdx: 0, mem: [], flash: null,
    memUntil: 0, memV: NaN, shown: NaN, shownRaw: NaN, stable: false, press: {}, back: false, backK: 0, backFrom: 0, backT0: -9,
    capPoseK: -1, backPoseK: -1, dispL1: '', dispL2: '', msg: '', vel: new THREE.Vector3(), lastPos: new THREE.Vector3(), acc: new THREE.Vector3(),
  };
  const listeners = new Set();
  let emitQueued = false;
  function emit() { if (emitQueued) return; emitQueued = true; queueMicrotask(() => { emitQueued = false; const st = state(); listeners.forEach((f) => { try { f(st); } catch (e) { console.error(e); } }); }); }

  function setFade(o) {
    for (const m of fadeMats) {
      const tr = o < 1 ? true : m.userData.tr0;
      if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; }
      m.opacity = (m.userData.op0 ?? 1) * o;
    }
  }
  let onRecord = null;

  function moveTo(x, z, room, id) {
    const pl = room.plane ?? 0.75;
    if (builtFor !== pl) build(pl);
    plane = pl;
    const now = performance.now() / 1000;
    const changed = (id || null) !== S.id;
    S.id = id || null; S.hold = false; S.memUntil = 0;
    if (changed) api.onRetarget?.();
    if (!group.visible || S.fadeDir < 0) {
      group.visible = true; S.x = S.fx = S.tx = x; S.z = S.fz = S.tz = z; S.t0 = now; S.dur = 0; S.arriveT = now;
      S.fadeDir = 1; setFade(0.001);
      if (!S.yawLock) { const cam = stage.camera; S.yaw = Math.atan2(cam.position.x - x, cam.position.z - z); }
      if (cable) cable.inited = false;
    } else {
      S.fx = S.x; S.fz = S.z; S.tx = x; S.tz = z; S.t0 = now;
      S.dur = Math.hypot(x - S.x, z - S.z) < 1e-4 ? 0 : Math.min(2.4, 0.75 + Math.hypot(x - S.x, z - S.z) * 0.3); S.arriveT = now + S.dur;
    }
    S.lcdT = 0; emit();
  }
  function hide() { if (group.visible && S.fadeDir >= 0) { S.fadeDir = -1; S.id = null; emit(); } }

  // ---------- teclas ----------
  const src = () => LIGHT_SOURCES[S.src];
  function flash(l2, ms = 1300, icons = {}, l1) { S.flash = { l2, l1, icons, until: performance.now() / 1000 + ms / 1000 }; }
  function storeMem(v, id) {
    if (!isFinite(v)) return false;
    if (S.mem.length >= MEM_MAX) { flash('  FULL', 1500); return false; }
    S.mem.push({ no: S.mem.length + 1, v: Math.round(v * 10) / 10, unit: S.unit, src: src().code, factor: src().factor, id: id || S.id, t: Date.now() });
    flash('no.  ' + String(S.mem.length).padStart(2, '0'), 1300, { mem: true });
    return true;
  }
  /**
   * name: 'power'|'source'|'hold'|'mem'|'read'|'zero'|'up'|'down'|'unit'|'rec'  (opts.long: pressão longa da tecla física)
   * Teclas físicas → hold (curto) / source (longo); mem (curto) / read (longo); unit (LX/FC·CD).
   */
  function press(name, opts = {}) {
    const now = performance.now() / 1000;
    if (opts.long && name === 'hold') name = 'source';
    if (opts.long && name === 'mem') name = 'read';
    const keyName = name === 'source' ? 'hold' : name === 'read' ? 'mem' : name === 'lxfc' ? 'unit' : name;
    S.press[keyName] = now; S.lcdT = 0; S.msg = '';
    if (name === 'power') { setPower(!S.on); return state(); }
    if (!S.on && name !== 'rec') return state();
    switch (name) {
      case 'hold': if (S.mode === 'read') break; if (!S.hold) tickReading(now, S.dur > 0); S.hold = !S.hold; S.heldV = S.shownRaw; break;
      case 'source':
        S.src = (S.src + 1) % LIGHT_SOURCES.length; S.hold = false;
        flash(null, 1800, { ls: true, blink: true }); S.msg = `Fonte de luz: ${src().code} ${src().name} (fator ${src().factor.toFixed(3)})`; break;
      case 'mem':
        if (S.mode === 'read') { S.mode = 'meas'; break; }
        { const v = displayed(); if (storeMem(v)) { S.msg = `Leitura gravada na memória NO.${String(S.mem.length).padStart(2, '0')}`; writeField(v); } } break;
      case 'read':
        S.mode = S.mode === 'read' ? 'meas' : 'read'; S.hold = false; S.readIdx = Math.max(0, S.mem.length - 1); break;
      case 'up': case 'down': {
        if (S.mode !== 'read') { S.mode = 'read'; S.readIdx = Math.max(0, S.mem.length - 1); break; }
        const n = S.mem.length; if (!n) break;
        S.readIdx = (S.readIdx + (name === 'up' ? 1 : -1) + n) % n; break;
      }
      case 'zero':
        if (S.capK > 0.02 || S.cap === false) { flash('  CAP ', 1600); S.msg = 'ZERO exige a tampa na fotocélula'; }
        else { S.zeroed = true; S.msg = 'Ajuste de zero feito (tampa colocada)'; }
        break;
      case 'unit': S.unit = S.unit === 'lux' ? 'fc' : 'lux'; break;
      case 'rec': { const v = displayed(); if (S.id && isFinite(v)) { writeField(v); try { window.__sim?.emit?.('record', { id: S.id, v }); } catch (e) { console.error(e); } if (onRecord) onRecord(S.id, v); } } break;
      default: break;
    }
    S.lcdT = 0; emit(); return state();
  }
  /** Valor exibido (lux): congelado (HOLD) ou ao vivo. */
  function displayed() { return S.on ? (S.hold ? S.heldV : S.shownRaw) : NaN; }
  /** Grava o valor EXIBIDO no campo do ponto (planilha). */
  function writeField(v) {
    const sim = window.__sim; if (!S.id || !isFinite(v) || !sim?.set) return;
    try { sim.set({ values: { ...sim.state.values, [S.id]: Math.round(v * 10) / 10 } }); } catch (e) { console.error(e); }
  }
  function setPower(on) {
    on = on === undefined ? !S.on : !!on;
    if (on === S.on) return state();
    const now = performance.now() / 1000;
    S.on = on; S.hold = false; S.mode = 'meas'; S.flash = null; S.press.power = now;
    if (on) { S.testUntil = now + 1.1; S.arriveT = now + 1.1; } else { S.zeroed = false; }
    S.lcdT = 0; emit(); return state();
  }
  function setCap(b) {
    b = !!b; if (b === S.cap) return state();
    S.cap = b; S.capFrom = S.capK; S.capT0 = performance.now() / 1000; if (b) S.zeroed = false; S.lcdT = 0; emit(); return state();
  }
  function showBack(b) {
    b = !!b; if (b === S.back) return state();
    S.back = b; S.backFrom = S.backK; S.backT0 = performance.now() / 1000; emit(); return state();
  }
  /** Mostra no visor o valor registrado no campo (e guarda na memória interna). */
  function showRecorded(v) {
    if (!isFinite(v)) return;
    const last = S.mem[S.mem.length - 1];
    if (!(last && last.id === S.id && Math.abs(last.v - v) < 0.05 && Date.now() - last.t < 1500)) storeMem(v);
    S.memV = v; S.memUntil = performance.now() / 1000 + 2.5; S.lcdT = 0; emit();
  }
  function liveLux() { let v = NaN; try { v = window.__sim?.simulatedLux?.(S.x, S.z); } catch { /* */ } return v; }

  // ---------- visor ----------
  function lcdModel(now) {
    if (!S.on) return { off: true, l1: '', l2: '' };
    if (now < S.testUntil) return { test: true, l1: '8.8.8.8', l2: '888888' };
    const icons = { auto: true, bat: true, ls: true, lux: S.unit === 'lux', fc: S.unit === 'fc', hold: S.hold, zero: S.zeroed };
    let l1, l2 = `${src().code}${src().factor.toFixed(3)}`, x10 = false;
    if (S.mode === 'read') {
      icons.read = true; icons.hold = false;
      const r = S.mem[S.readIdx];
      if (r) { const f = fmt4(r.unit === S.unit ? r.v : S.unit === 'fc' ? r.v / FC : r.v * FC); l1 = f.s; x10 = f.x10; l2 = 'no.  ' + String(r.no).padStart(2, '0'); }
      else { l1 = '----'; l2 = 'no.  00'; }
    } else {
      const v = S.hold ? S.heldV : S.shownRaw;
      const f = fmt4(S.unit === 'fc' ? v / FC : v); l1 = f.s; x10 = f.x10;
    }
    icons.x10 = x10;
    if (S.flash && now < S.flash.until) {
      Object.assign(icons, S.flash.icons);
      if (S.flash.l2 != null) l2 = S.flash.l2;
      if (S.flash.l1 != null) l1 = S.flash.l1;
      if (S.flash.icons.blink && Math.floor(now * 3) % 2) l2 = '  ' + l2.slice(2);   // código da fonte piscando (seleção L.S.)
    } else S.flash = null;
    return { icons, l1, l2 };
  }
  const l2Text = (s) => { if (!s) return ''; const c = s.replace(/\./g, ''); return /^L\d/.test(s) ? `${s.slice(0, 2)} ${s.slice(2)}` : /^no/.test(s) ? `NO.${c.slice(2).trim()}` : s.trim(); };

  // ---------- quadro ----------
  const tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), endA = new THREE.Vector3(), endB = new THREE.Vector3();
  function update(dt, now) {
    if (!group.visible) return;
    if (S.fadeDir) {
      S.fade = clamp01(S.fade + S.fadeDir * dt / 0.35); setFade(Math.max(0.001, S.fade));
      if (S.fadeDir > 0 && S.fade >= 1) { S.fadeDir = 0; setFade(1); }
      if (S.fadeDir < 0 && S.fade <= 0) { S.fadeDir = 0; group.visible = false; return; }
    }
    // deslocamento suave (pés sempre no piso) + balanço leve do tripé
    let moving = false;
    if (S.dur > 0) {
      const u = Math.min(1, (now - S.t0) / S.dur), e = easeInOut(u);
      S.x = S.fx + (S.tx - S.fx) * e; S.z = S.fz + (S.tz - S.fz) * e; moving = u < 1;
      if (u >= 1) S.dur = 0;
    }
    rig.position.set(S.x, 0, S.z);
    const sway = moving ? Math.sin(Math.PI * Math.min(1, (now - S.t0) / Math.max(0.01, S.dur))) : 0;
    rig.rotation.x = sway * Math.sin(now * 8) * 0.004; rig.rotation.z = sway * Math.cos(now * 6.5) * 0.004;
    if (!S.yawLock) {
      const cam = stage.camera; const want = Math.atan2(cam.position.x - S.x, cam.position.z - S.z);
      let d = want - S.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); S.yaw += d * Math.min(1, dt * 3.5);
    }
    rig.rotation.y = S.yaw;
    // aceleração do referencial (para o cabo balançar quando o tripé anda)
    tmpV.set(S.x, 0, S.z); if (dt > 0) { const v = tmpV.clone().sub(S.lastPos).divideScalar(dt); S.acc.copy(v).sub(S.vel).divideScalar(dt).clampLength(0, 6); S.vel.copy(v); } S.lastPos.copy(tmpV);
    // teclas: afundam 1,2 mm ao pressionar
    for (const k of keys) { const tp = now - (S.press[k.name] ?? -9); k.mesh.position.z = k.mesh.userData.z0 - (tp < 0.16 ? 0.0012 : 0); }
    // corpo: girar para mostrar o verso (levanta do berço, gira 180°, assenta)
    const bk = clamp01((now - S.backT0) / 1.4); S.backK = S.backFrom + ((S.back ? 1 : 0) - S.backFrom) * easeInOut(bk);
    if (bodyRef && S.backK !== S.backPoseK) {
      S.backPoseK = S.backK; const k = S.backK, lift = Math.sin(Math.PI * k) * 0.05;
      bodyRef.position.set(0, BODY.h / 2 + 0.0002 + lift, Math.sin(Math.PI * k) * 0.025);
      bodyRef.rotation.y = Math.PI * easeInOut(sstep(0.15, 0.85, k));
    }
    // tampa: assentada (capK=0) ↔ pendurada pelo cordão (capK=1)
    const ck = clamp01((now - S.capT0) / 1.1); S.capK = S.capFrom + ((S.cap ? 0 : 1) - S.capFrom) * easeInOut(ck);
    const swing = S.capK > 0.98 ? Math.sin(now * 3.1) * 0.06 * Math.exp(-Math.max(0, now - S.capT0 - 1.1) * 0.6) : 0;
    if (capObj && (S.capK !== S.capPoseK || swing)) {
      S.capPoseK = S.capK; const k = S.capK;
      const lift = sstep(0, 0.3, k) * 0.028;
      const m = sstep(0.25, 1, k);
      capObj.group.position.copy(capSeat.p).lerp(capHang.p, m); capObj.group.position.y += lift * (1 - m) + Math.sin(Math.PI * m) * 0.02;
      capObj.group.quaternion.slerpQuaternions(capSeat.q, capHang.q, m);
      if (swing) { tmpQ.setFromAxisAngle(new THREE.Vector3(0, 0, 1), swing); capObj.group.quaternion.premultiply(tmpQ); }
      updateCord();
    }
    // cabo espiralado (simulação contínua enquanto houver movimento)
    if (cable && cell && bodyRef) {
      rig.updateMatrixWorld(true);
      endA.copy(cell.cableStart).add(cell.group.position);
      endB.copy(bodyRef.userData.cableEnd || (bodyRef.userData.cableEnd = new THREE.Vector3(0.0115, BODY.h / 2 + 0.019, 0)));
      bodyRef.localToWorld(endB); rig.worldToLocal(endB);
      tmpV.copy(S.acc).applyAxisAngle(new THREE.Vector3(0, 1, 0), -S.yaw);
      cable.step(endA, endB, dt, tmpV);
    }
    // leitura (~4 Hz)
    S.lcdT -= dt;
    if (S.lcdT <= 0) { S.lcdT = moving ? 0.2 : 0.25; tickReading(now, moving); }
  }
  function updateCord() {
    if (!cord || !cell || !capObj) return;
    const a = cell.lugPos.clone().add(cell.group.position);
    const b = capObj.tabLocal.clone().applyQuaternion(capObj.group.quaternion).add(capObj.group.position);
    const span = a.distanceTo(b), slack = Math.max(0.004, 0.05 - span);
    const c = a.clone().lerp(b, 0.5); c.y -= slack * 0.9; c.x -= slack * 0.3;
    const curve = new THREE.QuadraticBezierCurve3(a, c, b);
    cord.geometry.dispose(); cord.geometry = new THREE.TubeGeometry(curve, 20, 0.0007, 5, false);
  }
  let lastT = performance.now() / 1000;
  function tickReading(now, moving) {
    const dt = Math.min(0.5, now - lastT); lastT = now;
    let T = NaN;
    if (!moving && S.id) { try { const f = window.__sim?.readLuxmeter?.(S.id); if (isFinite(f)) T = f; } catch { /* */ } }
    if (!isFinite(T)) T = liveLux();
    const target = T * src().factor;
    // luz que atravessa a cúpula: a tampa bloqueia (resposta da fotocélula ~0,3 s)
    const open = S.capK > 0.12 ? 1 : 0;
    S.lf += (open - S.lf) * (1 - Math.exp(-dt / 0.3)); if (Math.abs(open - S.lf) < 2e-3) S.lf = open;
    let v = target * S.lf;
    const u = now - S.arriveT;
    if (!moving && isFinite(target) && u < 1.6) v = v * (1 - Math.exp(-Math.max(0, u) / 0.32)) + target * 0.035 * Math.exp(-Math.max(0, u) / 0.4) * Math.sin(u * 8);
    if (S.lf < 0.02) v = S.zeroed ? 0 : 0.5 + 0.3 * Math.abs(Math.sin(now * 1.3)) + 0.1 * Math.sin(now * 7.1);   // corrente de escuro (sem ZERO)
    S.stable = !moving && u >= 1.6 && (S.lf === 1 || S.lf === 0);
    S.shownRaw = isFinite(v) ? Math.round(Math.max(0, v) * 10) / 10 : NaN;
    let shown = S.hold ? S.heldV : S.shownRaw;
    if (now < S.memUntil) shown = S.memV;
    S.shown = shown;
    const m = lcdModel(now);
    const key = JSON.stringify(m);
    if (key !== S.lastKey) {
      S.lastKey = key; drawLuxLCD(lcdCanvas, m); lcdTex.needsUpdate = true;
      const unit = S.unit === 'fc' ? 'Fc' : 'Lux';
      S.dispL1 = m.off ? '' : m.test ? '8.8.8.8' : `${m.l1} ${unit}`; S.dispL2 = m.off ? '' : m.test ? '888888' : l2Text(m.l2);
      emit();
    }
  }

  function state() {
    const s = src();
    return {
      on: S.on, hold: S.hold, source: { code: s.code, name: s.name, factor: s.factor, index: S.src }, zeroed: S.zeroed, cap: S.cap,
      reading: S.on ? (S.hold ? S.heldV : S.shownRaw) : NaN, unit: S.unit, mode: S.mode, readIndex: S.readIdx, display: [S.dispL1, S.dispL2],
      mem: S.mem.map((r) => ({ ...r })), id: S.id, stable: S.stable, back: S.back, msg: S.msg,
      roomSource: LIGHT_SOURCES[actualSource()].code, visible: group.visible && S.fadeDir >= 0,
    };
  }
  const _v = new THREE.Vector3();
  const api = {
    group, moveTo, hide, update, press, showRecorded, setPower, setCap, showBack, state,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    sources: LIGHT_SOURCES.map((x) => ({ ...x })),
    setSource(x) {
      const i = typeof x === 'number' ? x : LIGHT_SOURCES.findIndex((s) => s.code.toLowerCase() === String(x).toLowerCase() || s.name.toLowerCase() === String(x).toLowerCase());
      if (i >= 0 && i < LIGHT_SOURCES.length) { S.src = i; S.lcdT = 0; emit(); } return state();
    },
    clearMem() { S.mem.length = 0; S.readIdx = 0; S.lcdT = 0; emit(); return state(); },
    get focused() { return window.__lux?.focused || null; },
    set onRecord(fn) { onRecord = fn; },
    get active() { return group.visible && S.fadeDir >= 0; },
    get target() { return { x: S.tx, z: S.tz }; },
    get pos() { return { x: S.x, z: S.z }; },
    get id() { return S.id; },
    get hitTargets() { return hits; },
    /** estado do visor (rótulo flutuante da MARCAÇÃO): {value, stable, hold, power, mem, moving, cap} */
    get display() { return { value: S.shown, stable: S.stable, hold: S.hold, power: S.on, mem: performance.now() / 1000 < S.memUntil, moving: S.dur > 0, cap: S.cap, mode: S.mode }; },
    bodyWorld(out = _v) { if (!bodyRef) return null; return bodyRef.getWorldPosition(out); },
    get reading() { return S.shown; }, get plane() { return plane; },
    // internos para o __lux (mark_lux_api.js)
    _internal: {
      S, rig, get parts() { return parts; }, get body() { return bodyRef; }, get mount() { return mountRef; }, get cell() { return cell; }, get cap() { return capObj; },
      lcdCanvas,
      busy: () => S.dur > 0 || S.fadeDir !== 0 || Math.abs(S.capK - (S.cap ? 0 : 1)) > 1e-3 || Math.abs(S.backK - (S.back ? 1 : 0)) > 1e-3,
    },
  };
  installLuxAPI(stage, api);
  return api;
}

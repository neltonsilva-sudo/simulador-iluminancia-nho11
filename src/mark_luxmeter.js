// MARCAÇÃO — luxímetro virtual (aparelho digital genérico, fotocélula separada com cabo espiralado, tripé).
// A face superior do difusor da fotocélula fica EXATAMENTE na altura do plano de trabalho (room.plane, 0,75 m).
// Dono: MARCAÇÃO. Sem marca comercial.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { canvasTex, FONT } from './mark_tex.js';

const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

// ---------- LCD de 7 segmentos ----------
const SEGS = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', '-': 'g', O: 'abcdef', L: 'fed' };
function seg(g, x, y, w, h, t, s) {
  const gp = 3, ht = t / 2; const ym = y + h / 2;
  const H = (x1, x2, yy) => { g.moveTo(x1, yy); g.lineTo(x1 + ht, yy - ht); g.lineTo(x2 - ht, yy - ht); g.lineTo(x2, yy); g.lineTo(x2 - ht, yy + ht); g.lineTo(x1 + ht, yy + ht); g.closePath(); };
  const V = (xx, y1, y2) => { g.moveTo(xx, y1); g.lineTo(xx + ht, y1 + ht); g.lineTo(xx + ht, y2 - ht); g.lineTo(xx, y2); g.lineTo(xx - ht, y2 - ht); g.lineTo(xx - ht, y1 + ht); g.closePath(); };
  g.beginPath();
  if (s.includes('a')) H(x + gp, x + w - gp, y);
  if (s.includes('g')) H(x + gp, x + w - gp, ym);
  if (s.includes('d')) H(x + gp, x + w - gp, y + h);
  if (s.includes('f')) V(x, y + gp, ym - gp);
  if (s.includes('b')) V(x + w, y + gp, ym - gp);
  if (s.includes('e')) V(x, ym + gp, y + h - gp);
  if (s.includes('c')) V(x + w, ym + gp, y + h - gp);
  g.fill();
}
function drawLCD(c, str, f = {}) {
  const g = c.getContext('2d'), W = c.width, H = c.height;
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#c3cdb6'); bg.addColorStop(1, '#adb99f');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  // sombra interna da moldura
  const sh = g.createLinearGradient(0, 0, 0, 26); sh.addColorStop(0, 'rgba(0,0,0,.28)'); sh.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = sh; g.fillRect(0, 0, W, 26);
  const ink = 'rgba(28,34,30,.93)', ghost = 'rgba(28,34,30,.065)';
  if (f.off) return;                                     // visor desligado
  // indicadores
  g.font = `700 30px ${FONT}`; g.textBaseline = 'top';
  g.fillStyle = ink; g.fillText('AUTO', 22, 18);
  g.fillStyle = f.hold ? ink : ghost; g.fillText('HOLD', 112, 18);
  g.fillStyle = f.mem ? ink : ghost; g.fillText('REC', 206, 18);
  // bateria
  g.fillStyle = ink; g.strokeStyle = ink; g.lineWidth = 3; g.strokeRect(W - 76, 20, 46, 22); g.fillRect(W - 30, 26, 5, 10); g.fillRect(W - 72, 24, 30, 14);
  // dígitos (4 posições, alinhados à direita)
  const dw = 80, dh = 152, t = 21, gap = 26, x0 = W - 4 * (dw + gap) - 48, y0 = 72, sk = 0.1;
  const chars = []; let dp = -1; for (const ch of str) { if (ch === '.') dp = chars.length - 1; else chars.push(ch); }
  while (chars.length < 4) chars.unshift(' ');
  g.save(); g.transform(1, 0, -sk, 1, sk * (y0 + dh), 0);
  for (let i = 0; i < 4; i++) {
    const x = x0 + i * (dw + gap);
    g.fillStyle = ghost; seg(g, x, y0, dw, dh, t, 'abcdefg');
    g.fillStyle = ink; if (chars[i] !== ' ') seg(g, x, y0, dw, dh, t, SEGS[chars[i]] || '');
    // ponto decimal
    g.fillStyle = i === dp ? ink : ghost; g.beginPath(); g.arc(x + dw + 14, y0 + dh + 2, 9.5, 0, Math.PI * 2); g.fill();
  }
  g.restore();
  g.fillStyle = ink; g.font = `800 40px ${FONT}`; g.textBaseline = 'alphabetic'; g.textAlign = 'right'; g.fillText('lux', W - 18, H - 24);
  g.fillStyle = ghost; g.fillText('fc', W - 18, H - 84); g.textAlign = 'left';
  g.fillStyle = ink; g.font = `700 26px ${FONT}`; g.fillText('×1', 22, H - 26);
}
function fmtLCD(v) {
  if (!isFinite(v) || v < 0) return '-.--';
  if (v >= 10000) return 'OL';
  if (v >= 1000) return String(Math.round(v));
  return (Math.round(v * 10) / 10).toFixed(1);
}

// ---------- painel frontal (serigrafia genérica, sem marca) ----------
function makeFaceTex() {
  const W = 256, H = 600, c = mk(W, H), g = c.getContext('2d');
  const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#6c737a'); bg.addColorStop(1, '#5a6168'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
  // moldura do LCD
  rrect(g, 8, 62, W - 16, 172, 14); g.fillStyle = '#16191c'; g.fill();
  // rótulos dos botões
  g.fillStyle = '#eef1f4'; g.font = `700 22px ${FONT}`; g.textAlign = 'center';
  [['POWER', 64, 398], ['HOLD', 192, 398], ['RANGE', 64, 510], ['REC', 192, 510]].forEach(([s, x, y]) => g.fillText(s, x, y));
  g.strokeStyle = 'rgba(235,240,245,.5)'; g.lineWidth = 2; [[64, 348], [192, 348], [64, 460], [192, 460]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 31, 0, Math.PI * 2); g.stroke(); });
  g.font = `800 25px ${FONT}`; g.fillStyle = '#f2f4f6'; g.fillText('LUXÍMETRO', W / 2, 560); g.font = `600 18px ${FONT}`; g.fillStyle = '#d4d9de'; g.fillText('DIGITAL  ·  0–200 000 lx', W / 2, 586);
  g.font = `700 18px ${FONT}`; g.fillText('▲ SENSOR', W / 2, 36);
  return canvasTex(c);
}

export function buildLuxmeter(stage) {
  const group = new THREE.Group(); group.name = 'luxmeter'; group.visible = false;
  const rig = new THREE.Group(); group.add(rig);
  const lcdCanvas = mk(512, 330); drawLCD(lcdCanvas, '-.--');
  const lcdTex = canvasTex(lcdCanvas);
  const M = {
    alu: new THREE.MeshStandardMaterial({ color: 0xb4bac1, metalness: 0.35, roughness: 0.32 }),
    alu2: new THREE.MeshStandardMaterial({ color: 0x9aa0a7, metalness: 0.35, roughness: 0.4 }),
    black: new THREE.MeshStandardMaterial({ color: 0x1a1c1f, roughness: 0.5, metalness: 0.15 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x0e0f10, roughness: 0.92 }),
    body: new THREE.MeshStandardMaterial({ color: 0x2c3136, roughness: 0.7 }),
    face: new THREE.MeshStandardMaterial({ map: makeFaceTex(), roughness: 0.55 }),
    diff: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, emissive: 0xffffff, emissiveIntensity: 0.35 }),
    lcd: new THREE.MeshStandardMaterial({ map: lcdTex, roughness: 0.35, metalness: 0 }),   // LCD reflexivo (iluminado pela sala)
    glass: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.08, depthWrite: false }),
    btnG: new THREE.MeshStandardMaterial({ color: 0x5b636b, roughness: 0.6 }),
    btnY: new THREE.MeshStandardMaterial({ color: 0xf2b72e, roughness: 0.55 }),
    btnR: new THREE.MeshStandardMaterial({ color: 0xd8473a, roughness: 0.55 }),
    btnRec: new THREE.MeshStandardMaterial({ color: 0x3f8f5a, roughness: 0.55 }),
    cable: new THREE.MeshStandardMaterial({ color: 0x141618, roughness: 0.42, metalness: 0.05 }),
    bubble: new THREE.MeshStandardMaterial({ color: 0x9be36a, roughness: 0.15, emissive: 0x2c5a12, emissiveIntensity: 0.6 }),
  };
  const mats = Object.values(M);
  const buttons = [], hits = []; let bodyRef = null;
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  let plane = -1, builtFor = -1;
  const add = (geo, mat, x = 0, y = 0, z = 0, parent = rig) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
  const tube = (a, b, r, mat, parent = rig, seg = 14) => { // cilindro entre dois pontos
    const d = new THREE.Vector3().subVectors(b, a), L = d.length();
    const m = add(new THREE.CylinderGeometry(r, r, L, seg), mat, 0, 0, 0, parent);
    m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); return m;
  };

  function build(pl) {
    rig.traverse((o) => { if (o.isMesh) o.geometry.dispose(); }); rig.clear();
    const yTop = pl;                      // face do difusor = plano de trabalho
    // --- fotocélula ---
    add(new THREE.CylinderGeometry(0.0255, 0.0255, 0.004, 48), M.diff, 0, yTop - 0.002, 0);                     // difusor plano (cosseno-corrigido)
    const bez = add(new THREE.TorusGeometry(0.0285, 0.0028, 12, 48), M.alu, 0, yTop - 0.0032, 0); bez.rotation.x = Math.PI / 2;
    add(new THREE.CylinderGeometry(0.033, 0.035, 0.026, 48), M.black, 0, yTop - 0.004 - 0.013, 0);               // carcaça
    const gland = add(new THREE.CylinderGeometry(0.0055, 0.0065, 0.016, 16), M.black, 0.041, yTop - 0.019, 0); gland.rotation.z = Math.PI / 2;
    add(new THREE.CylinderGeometry(0.011, 0.013, 0.02, 20), M.black, 0, yTop - 0.04, 0);                         // rosca 1/4"
    // --- cabeça do tripé ---
    add(new THREE.CylinderGeometry(0.024, 0.024, 0.008, 28), M.black, 0, yTop - 0.054, 0);
    add(new THREE.SphereGeometry(0.017, 24, 16), M.alu2, 0, yTop - 0.072, 0);
    add(new THREE.CylinderGeometry(0.02, 0.016, 0.03, 24), M.black, 0, yTop - 0.096, 0);
    const knob = add(new THREE.CylinderGeometry(0.008, 0.008, 0.03, 16), M.black, 0.03, yTop - 0.094, 0); knob.rotation.z = Math.PI / 2;
    // nível de bolha
    const lv = add(new THREE.CylinderGeometry(0.009, 0.009, 0.006, 20), M.black, -0.022, yTop - 0.05, 0.0);
    add(new THREE.SphereGeometry(0.0055, 12, 8), M.bubble, -0.022, yTop - 0.047, 0).scale.set(1, 0.4, 1); void lv;
    // --- coluna central ---
    const yHub = Math.min(0.42, yTop - 0.22), yCol0 = Math.max(0.12, yHub - 0.12);
    tube(new THREE.Vector3(0, yCol0, 0), new THREE.Vector3(0, yTop - 0.11, 0), 0.0095, M.alu, rig, 20);
    add(new THREE.CylinderGeometry(0.03, 0.026, 0.055, 28), M.black, 0, yHub, 0);                               // coroa
    add(new THREE.CylinderGeometry(0.016, 0.016, 0.012, 20), M.black, 0, yCol0 + 0.004, 0);                      // batente
    const lock = add(new THREE.CylinderGeometry(0.006, 0.006, 0.028, 12), M.black, 0, yHub + 0.004, 0.036); lock.rotation.x = Math.PI / 2;
    // --- pernas (uma para trás, duas para a frente; frente = +Z local, voltada à câmera) ---
    const footR = Math.min(0.34, yHub * 0.78);
    for (let k = 0; k < 3; k++) {
      const a = Math.PI + k * 2 * Math.PI / 3, dx = Math.sin(a), dz = Math.cos(a);
      const top = new THREE.Vector3(dx * 0.03, yHub - 0.008, dz * 0.03), foot = new THREE.Vector3(dx * footR, 0.012, dz * footR);
      const mid = top.clone().lerp(foot, 0.52);
      add(new THREE.BoxGeometry(0.02, 0.03, 0.02), M.black, top.x, top.y, top.z).lookAt(foot.x, foot.y, foot.z);
      tube(top, mid, 0.0085, M.alu, rig, 16);
      tube(mid, foot, 0.0062, M.alu2, rig, 14);
      const cl = tube(mid.clone().lerp(top, 0.06), mid.clone().lerp(foot, 0.06), 0.0115, M.black, rig, 16); void cl;
      add(new THREE.SphereGeometry(0.012, 16, 12), M.rubber, foot.x, 0.009, foot.z).scale.set(1, 0.75, 1);
      // braço de travamento (aranha) da coluna à perna
      const t = 0.62, onLeg = top.clone().lerp(foot, t);
      tube(new THREE.Vector3(dx * 0.016, yCol0 + 0.004, dz * 0.016), onLeg, 0.0035, M.black, rig, 8);
    }
    // --- suporte e corpo do luxímetro ---
    const yArm = Math.min(yTop - 0.2, yHub + 0.11);
    add(new THREE.CylinderGeometry(0.015, 0.015, 0.022, 20), M.black, 0, yArm, 0);
    tube(new THREE.Vector3(0, yArm, 0.012), new THREE.Vector3(0, yArm + 0.004, 0.07), 0.0055, M.black, rig, 10);
    const body = new THREE.Group(); body.position.set(0, yArm + 0.055, 0.092); body.rotation.x = -0.5; rig.add(body);
    add(new THREE.BoxGeometry(0.05, 0.012, 0.03), M.black, 0, -0.088, -0.004, body);                            // berço
    add(new RoundedBoxGeometry(0.074, 0.168, 0.034, 4, 0.011), M.body, 0, 0, 0, body);
    add(new THREE.PlaneGeometry(0.064, 0.15), M.face, 0, 0, 0.01701, body);
    add(new THREE.PlaneGeometry(0.056, 0.0355), M.lcd, 0, 0.0385, 0.0172, body);
    add(new THREE.PlaneGeometry(0.06, 0.04), M.glass, 0, 0.0385, 0.0178, body);
    buttons.length = 0; hits.length = 0;
    [[-0.016, -0.012, M.btnR, 'power'], [0.016, -0.012, M.btnY, 'hold'], [-0.016, -0.04, M.btnG, 'range'], [0.016, -0.04, M.btnRec, 'rec']].forEach(([x, y, m, name]) => {
      const b = add(new THREE.CylinderGeometry(0.0058, 0.0062, 0.004, 20), m, x, y, 0.0185, body); b.rotation.x = Math.PI / 2;
      b.userData.btn = name; b.userData.z0 = 0.0185; buttons.push(b);
      // alvo de clique um pouco maior que a tecla (fácil de acertar no 3D)
      const hit = add(new THREE.CylinderGeometry(0.011, 0.011, 0.012, 12), hitMat, x, y, 0.02, body); hit.rotation.x = Math.PI / 2; hit.userData.btn = name; hit.castShadow = false; hits.push(hit); });
    bodyRef = body;
    add(new THREE.CylinderGeometry(0.0058, 0.0058, 0.012, 16), M.black, 0.022, 0.088, 0, body);                   // conector
    // --- cabo espiralado: da fotocélula ao conector do aparelho ---
    rig.updateMatrixWorld(true);
    const end = body.localToWorld(new THREE.Vector3(0.022, 0.094, 0)); rig.worldToLocal(end);
    const base = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.049, yTop - 0.019, 0), new THREE.Vector3(0.07, yTop - 0.045, 0.01), new THREE.Vector3(0.075, yTop - 0.11, 0.03),
      new THREE.Vector3(0.06, (yTop + end.y) / 2, 0.055), new THREE.Vector3(end.x + 0.012, end.y + 0.035, end.z - 0.005), end,
    ], false, 'catmullrom', 0.5);
    const n = 900, pts = [], coils = 26, up = new THREE.Vector3(0, 1, 0), side = new THREE.Vector3(), bin = new THREE.Vector3();
    for (let i = 0; i <= n; i++) {
      const u = i / n, p = base.getPointAt(u), tg = base.getTangentAt(u);
      side.crossVectors(tg, Math.abs(tg.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : up).normalize(); bin.crossVectors(tg, side).normalize();
      const w = THREE.MathUtils.smoothstep(u, 0.06, 0.16) * (1 - THREE.MathUtils.smoothstep(u, 0.86, 0.95));
      const th = u * coils * Math.PI * 2, r = 0.0075 * w;
      pts.push(p.addScaledVector(side, Math.cos(th) * r).addScaledVector(bin, Math.sin(th) * r));
    }
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 1400, 0.0019, 7, false), M.cable);
    rig.traverse((o) => { o.userData.noEnv = true; });
    builtFor = pl;
  }

  // ---------- estado / movimento / funcionamento ----------
  const S = { x: 0, z: 0, fx: 0, fz: 0, tx: 0, tz: 0, t0: 0, dur: 0, yaw: 0, fade: 0, fadeDir: 0, lastLCD: '', lcdT: 0,
    id: null, arriveT: 0, power: true, hold: false, heldV: NaN, memV: NaN, memUntil: 0, shown: NaN, stable: false, press: {} };
  function setTransparent(b) { for (const m of mats) { if (m === M.glass) continue; if (m.transparent !== b) { m.transparent = b; m.needsUpdate = true; } } }
  function setOpacity(o) { for (const m of mats) m.opacity = m === M.glass ? 0.08 * o : o; }
  let onRecord = null;

  function moveTo(x, z, room, id) {
    const pl = room.plane ?? 0.75;
    if (builtFor !== pl) build(pl);
    plane = pl;
    const now = performance.now() / 1000;
    S.id = id || null; S.hold = false; S.memUntil = 0;
    if (!group.visible || S.fadeDir < 0) {
      group.visible = true; S.x = S.fx = S.tx = x; S.z = S.fz = S.tz = z; S.t0 = now; S.dur = 0; S.arriveT = now;
      S.fadeDir = 1; setTransparent(true);
      const cam = stage.camera; S.yaw = Math.atan2(cam.position.x - x, cam.position.z - z);
    } else {
      S.fx = S.x; S.fz = S.z; S.tx = x; S.tz = z; S.t0 = now;
      S.dur = Math.min(2.4, 0.75 + Math.hypot(x - S.x, z - S.z) * 0.3); S.arriveT = now + S.dur;
    }
    S.lastLCD = ''; S.lcdT = 0;
  }
  function hide() { if (group.visible && S.fadeDir >= 0) { S.fadeDir = -1; setTransparent(true); S.id = null; } }
  /** Teclas do aparelho: power (liga/desliga o visor), hold (congela), rec (registra no campo do ponto), range (sem efeito: auto). */
  function press(name) {
    const now = performance.now() / 1000; S.press[name] = now; S.lcdT = 0;
    if (name === 'power') { S.power = !S.power; S.hold = false; if (S.power) S.arriveT = now; }
    else if (!S.power) return;
    else if (name === 'hold') { S.hold = !S.hold; S.heldV = S.shown; }
    else if (name === 'rec') { if (S.id && onRecord) onRecord(S.id, S.shown); }
  }
  /** Mostra no visor o valor efetivamente registrado (indicador REC por 2,5 s). */
  function showRecorded(v) { if (isFinite(v)) { S.memV = v; S.memUntil = performance.now() / 1000 + 2.5; S.lcdT = 0; } }
  function liveLux() { let v = NaN; try { v = window.__sim?.simulatedLux?.(S.x, S.z); } catch { /* */ } return v; }

  function update(dt, now) {
    if (!group.visible) return;
    if (S.fadeDir) {
      S.fade = Math.min(1, Math.max(0, S.fade + S.fadeDir * dt / 0.35)); setOpacity(S.fade);
      if (S.fadeDir > 0 && S.fade >= 1) { S.fadeDir = 0; setTransparent(false); setOpacity(1); }
      if (S.fadeDir < 0 && S.fade <= 0) { S.fadeDir = 0; group.visible = false; return; }
    }
    // deslocamento suave, pés sempre no piso (balanço leve do tripé durante o transporte)
    let moving = false;
    if (S.dur > 0) {
      const u = Math.min(1, (now - S.t0) / S.dur), e = easeInOut(u);
      S.x = S.fx + (S.tx - S.fx) * e; S.z = S.fz + (S.tz - S.fz) * e; moving = u < 1;
      if (u >= 1) S.dur = 0;
    }
    rig.position.set(S.x, 0, S.z);
    const sway = moving ? Math.sin(Math.PI * Math.min(1, (now - S.t0) / Math.max(0.01, S.dur))) : 0;
    rig.rotation.x = sway * Math.sin(now * 8) * 0.004; rig.rotation.z = sway * Math.cos(now * 6.5) * 0.004;
    // painel voltado para a câmera
    const cam = stage.camera; const want = Math.atan2(cam.position.x - S.x, cam.position.z - S.z);
    let d = want - S.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); S.yaw += d * Math.min(1, dt * 3.5); rig.rotation.y = S.yaw;
    // teclas: afundam 1,5 mm ao pressionar
    for (const b of buttons) { const tp = now - (S.press[b.userData.btn] ?? -9); b.position.z = b.userData.z0 - (tp < 0.18 ? 0.0015 : 0); }
    // leitura (~3 Hz). Ao chegar ao ponto a leitura sobe e assenta em ~1,5 s (estabilização, NHO-11 item 6.4).
    S.lcdT -= dt;
    if (S.lcdT <= 0) {
      S.lcdT = moving ? 0.2 : 0.33;
      const T = liveLux(); let v = T, mem = false;
      const u = now - S.arriveT;
      if (!moving && isFinite(T)) {
        if (u < 1.6) v = T * (1 - Math.exp(-Math.max(0, u) / 0.32)) + T * 0.035 * Math.exp(-Math.max(0, u) / 0.4) * Math.sin(u * 8);
        else v = T + (Math.random() - 0.5) * 0.2 * (T < 1000 ? 1 : 10);
      }
      S.stable = !moving && u >= 1.6;
      if (S.hold) v = S.heldV;
      if (now < S.memUntil) { v = S.memV; mem = true; }
      S.shown = isFinite(v) ? Math.round(v * 10) / 10 : NaN;
      const str = S.power ? fmtLCD(S.shown) : '';
      const key = str + (S.hold ? 'H' : '') + (mem ? 'M' : '') + (S.power ? '' : 'off');
      if (key !== S.lastLCD) { S.lastLCD = key; drawLCD(lcdCanvas, str, { hold: S.hold, mem, off: !S.power }); lcdTex.needsUpdate = true; }
    }
  }
  const _v = new THREE.Vector3();
  return {
    group, moveTo, hide, update, press, showRecorded,
    set onRecord(fn) { onRecord = fn; },
    get active() { return group.visible && S.fadeDir >= 0; },
    get target() { return { x: S.tx, z: S.tz }; },
    get pos() { return { x: S.x, z: S.z }; },
    get id() { return S.id; },
    get hitTargets() { return hits; },
    /** estado do visor: {value, stable, hold, power, mem, moving} */
    get display() { return { value: S.shown, stable: S.stable, hold: S.hold, power: S.power, mem: performance.now() / 1000 < S.memUntil, moving: S.dur > 0 }; },
    bodyWorld(out = _v) { if (!bodyRef) return null; return bodyRef.getWorldPosition(out); },
    get reading() { return S.shown; }, get plane() { return plane; },
  };
}

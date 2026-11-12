// MARCAÇÃO — marcas no teto (adesivo-alvo + etiqueta), linhas de construção tracejadas (Figura A1 / croqui),
// prumo laser até o plano de trabalho, disco de leitura com valor/estado, cota 0,75 m, luxímetro virtual e seleção.
// Dono: MARCAÇÃO. API (CONTRACT.md): buildMarkers(stage) → {group, show, hide, setValues, highlight, luxmeterTo, onPick}
//
// Integração com o RENDER (HDR físico + AgX): as marcas 3D ficam na cena (oclusão correta) e são pré-compensadas
// (mark_overlay.ovPatch); as ETIQUETAS são desenhadas num passe final próprio (OverlayPass), depois de todo o
// pós-processamento → texto nítido, cores sRGB exatas, sem bloom/grão/tone mapping, tamanho constante em tela.
import * as THREE from 'three';
import {
  GROUP_HEX, STATE_HEX, LS, setAniso, canvasTex, makeTargetTexture, makeIdLabel, drawReading, READ_W, READ_H,
  makeDiscTexture, makeGlowTexture, makeRingTexture, makeDimLabel, makeLaserMaterial, makeDashMaterial, ribbonGeometry,
} from './mark_tex.js';
import { OV, ovPatch, ovSync, OverlayPass, ensureLast } from './mark_overlay.js';
import { buildLuxmeter } from './mark_luxmeter.js';
import { makeChairMover } from './mark_chairs.js';
import { FONT } from './mark_tex.js';

const ORDER = ['P', 'T', 'Q', 'R'];
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);
const easeInOut = (x) => { x = clamp01(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const easeOutBack = (x) => { x = clamp01(x); const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const num = (v) => (v === '' || v == null || !isFinite(+v) ? null : +v);
const fmtLux = (v) => (+v).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
const fmtM = (v) => (+v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' m';

// tamanhos (m) — o adesivo fica 9 mm abaixo do forro (abaixo do plano de corte “casa de bonecas” do RENDER, H−6 mm)
const STICKER_R = 0.105, DISC_R = 0.15, Y_STICK = 0.009, Y_GUIDE = 0.011;

export function buildMarkers(stage) {
  if (new URLSearchParams(location.search).get('nomark') === '1') return { group: new THREE.Group(), show() {}, hide() {}, setValues() {}, highlight() {}, luxmeterTo() {}, onPick() {} }; // diagnóstico
  const { renderer } = stage; setAniso(renderer);
  const canvas = stage.canvas || renderer.domElement;
  const group = new THREE.Group(); group.name = 'markers'; stage.scene.add(group);
  const marks = new THREE.Group(); marks.name = 'marks'; marks.visible = false; group.add(marks);
  const lux = buildLuxmeter(stage); group.add(lux.group);
  // camada de etiquetas: passe final próprio quando há compositor; senão, na própria cena
  const useOverlay = !!stage.post?.composer;
  const ovScene = new THREE.Scene();
  const labels = new THREE.Group(); labels.name = 'mark_labels'; labels.visible = false;
  (useOverlay ? ovScene : group).add(labels);
  const ovPass = useOverlay ? new OverlayPass(ovScene, () => stage.camera) : null;
  const flag = (root, reflect = false) => root.traverse((o) => { o.userData.noEnv = true; if (!reflect) o.userData.noReflect = true; });
  flag(group); flag(lux.group, true);

  // ---------- recursos compartilhados ----------
  const glowTex = makeGlowTexture(), ringTex = makeRingTexture(), discTex = makeDiscTexture();
  const targetTex = {}; ORDER.forEach((g) => (targetTex[g] = makeTargetTexture(GROUP_HEX[g])));
  const G = {
    sticker: new THREE.PlaneGeometry(STICKER_R * 2, STICKER_R * 2),
    disc: new THREE.PlaneGeometry(DISC_R * 2, DISC_R * 2),
    ring: new THREE.PlaneGeometry(1, 1),
    beam: new THREE.CylinderGeometry(1, 1, 1, 12, 1, true).translate(0, -0.5, 0),   // topo em y=0, desce até y=−1
    pick: new THREE.CylinderGeometry(1, 1, 1, 6, 1, false).translate(0, -0.5, 0),
  };
  const pickMat = new THREE.MeshBasicMaterial({ visible: false });

  // ---------- estado ----------
  let points = [], room = { L: 9.16, W: 5.9, H: 2.7, plane: 0.75 }, cfg = 1, sig = '';
  let values = {}, bands = null, hlId = null, hlT0 = 0, hoverId = null;
  let showT0 = 0, hiding = false, hideT0 = 0, guidesOn = true;
  let pickFn = () => {};
  const P = new Map();           // id → objeto do ponto
  let guides = null; const guideMat = makeDashMaterial('#2a3646', 0.6);
  const disposables = [];

  const dim = buildDim(); marks.add(dim.group); labels.add(dim.labelRoot);

  function clearPoints() {
    for (const o of P.values()) { o.root.removeFromParent(); o.lroot.removeFromParent(); }
    P.clear();
    disposables.splice(0).forEach((d) => d.dispose?.());
    if (guides) { guides.removeFromParent(); guides.geometry.dispose(); guides = null; }
  }
  function makeSprite(tex, center, order = 30) {
    const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false, sizeAttenuation: true });
    const s = new THREE.Sprite(m); s.center.set(center[0], center[1]); s.renderOrder = order; disposables.push(m); return s;
  }
  function flatMesh(geo, mat, up) { const m = new THREE.Mesh(geo, mat); m.rotation.x = up ? -Math.PI / 2 : Math.PI / 2; return m; }
  const basic = (o) => { const m = ovPatch(new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, ...o })); disposables.push(m); return m; };

  function buildPoint(p, idx) {
    const H = room.H, pl = room.plane ?? 0.75, hex = GROUP_HEX[p.group] || '#ffffff';
    const root = new THREE.Group(); root.name = 'pt_' + p.id; root.position.set(p.x, 0, p.z); marks.add(root);
    const lroot = new THREE.Group(); lroot.name = 'lbl_' + p.id; lroot.position.set(p.x, 0, p.z); labels.add(lroot);
    const o = { id: p.id, p, hex, root, lroot, idx, pick: [], occ: 0, occT: 0, yTop: H - Y_STICK };
    // adesivo-alvo no teto (sem z-fighting: afastado + polygonOffset)
    o.sticker = flatMesh(G.sticker, basic({ map: targetTex[p.group] || targetTex.R, color: new THREE.Color().setRGB(0.6, 0.6, 0.6), alphaTest: 0.02, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -8 }), false);
    o.sticker.position.y = H - Y_STICK; o.sticker.renderOrder = 3; root.add(o.sticker);
    // ondas (identificação / destaque) no teto e no plano
    const mkRing = (y, up) => { const r = flatMesh(G.ring, basic({ map: ringTex, color: hex, opacity: 0, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -10 }), up);
      r.position.y = y; r.renderOrder = 4; r.visible = false; root.add(r); return r; };
    o.ringC = mkRing(H - Y_STICK - 0.001, false); o.ringP = mkRing(pl + 0.006, true);
    // brilho do ponto de saída do laser no teto
    const glow = () => { const m = ovPatch(new THREE.SpriteMaterial({ map: glowTex, color: hex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); disposables.push(m); return new THREE.Sprite(m); };
    o.glowC = glow(); o.glowC.position.y = H - Y_STICK - 0.006; o.glowC.renderOrder = 6; root.add(o.glowC);
    // feixe: núcleo fino + halo
    o.coreMat = makeLaserMaterial(hex, { pow: 0.25, opacity: 1, additive: false }); o.coreMat.uniforms.uBoost.value = 1.9;
    o.haloMat = makeLaserMaterial(hex, { pow: 2.2, opacity: 0.3, additive: false });
    disposables.push(o.coreMat, o.haloMat);
    o.core = new THREE.Mesh(G.beam, o.coreMat); o.core.position.y = H - Y_STICK; o.core.renderOrder = 7; root.add(o.core);
    o.halo = new THREE.Mesh(G.beam, o.haloMat); o.halo.position.y = H - Y_STICK; o.halo.renderOrder = 8; root.add(o.halo);
    // ponta do laser (desce na animação; depois vira o “spot” no plano)
    o.head = glow(); o.head.renderOrder = 9; root.add(o.head);
    // disco de leitura no plano de trabalho (visível + “fantasma” atrás de móveis)
    o.discMat = basic({ map: discTex, color: STATE_HEX.none, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -8 });
    o.ghostMat = basic({ map: discTex, color: STATE_HEX.none, opacity: 0.22, depthTest: false, side: THREE.DoubleSide });
    o.ghost = flatMesh(G.disc, o.ghostMat, true); o.ghost.position.y = pl + 0.004; o.ghost.renderOrder = 1; root.add(o.ghost);
    o.disc = flatMesh(G.disc, o.discMat, true); o.disc.position.y = pl + 0.004; o.disc.renderOrder = 5; root.add(o.disc);
    // etiquetas (camada de overlay)
    const idl = makeIdLabel(p.label || p.id.toUpperCase(), hex); disposables.push(idl.tex);
    o.cLabel = makeSprite(idl.tex, [0, 0.5], 31); o.cAspect = idl.aspect; o.cLabel.position.y = H - Y_STICK - 0.004; lroot.add(o.cLabel);
    o.rCanvas = document.createElement('canvas'); o.rCanvas.width = Math.ceil(READ_W * LS); o.rCanvas.height = Math.ceil(READ_H * LS);
    o.rTex = canvasTex(o.rCanvas); disposables.push(o.rTex);
    o.pLabel = makeSprite(o.rTex, [0.5, 0], 32); o.pLabel.position.y = pl + 0.006; lroot.add(o.pLabel);
    o.rState = null; o.rValue = undefined; drawLabel(o);
    // alvo de clique invisível ao longo do prumo
    o.pickBeam = new THREE.Mesh(G.pick, pickMat); o.pickBeam.position.y = H; o.pickBeam.scale.set(0.05, H - pl, 0.05); root.add(o.pickBeam);
    [o.sticker, o.disc, o.cLabel, o.pLabel, o.pickBeam].forEach((m) => { m.userData.pid = p.id; o.pick.push(m); });
    flag(root); flag(lroot);
    return o;
  }

  function stateOf(id) {
    const v = num(values?.[id]); if (v == null) return { v: null, s: 'none' };
    const lim = bands && isFinite(bands.lim70) ? bands.lim70 : null;
    return { v, s: lim == null ? 'meas' : v >= lim ? 'ok' : 'bad' };
  }
  function drawLabel(o) {
    const { v, s } = stateOf(o.id);
    if (o.rValue === v && o.rState === s) return;
    o.rValue = v; o.rState = s;
    const r = drawReading(o.rCanvas, o.p.label || o.id.toUpperCase(), o.hex, v == null ? '' : fmtLux(v), s);
    o.rTex.needsUpdate = true;
    // usa só a faixa útil do canvas (largura variável) → ajusta UV e proporção do sprite
    o.rTex.repeat.set(r.w / READ_W * 1.04, 1); o.rTex.offset.set((r.x0 - r.w * 0.02) / READ_W, 0);
    o.pAspect = (r.w * 1.04) / READ_H;
    const col = new THREE.Color(STATE_HEX[s]).multiplyScalar(0.72); o.discMat.color.copy(col); o.ghostMat.color.copy(col);
  }

  // ---------- linhas de construção (croqui / Figura A1) ----------
  function guideSegments() {
    const { L, W } = room; const segs = []; const key = new Set();
    const addSeg = (s) => { const k = s.map((v) => v.toFixed(3)).join(','); if (!key.has(k)) { key.add(k); segs.push(s); } };
    let lums = [];
    try { lums = window.__sim?.luminaires?.() || []; } catch { /* */ }
    const uniq = (a) => [...new Set(a.map((v) => +v.toFixed(3)))].sort((a, b) => a - b);
    let xs = uniq(lums.map((l) => l.x)), zs;
    if (lums.some((l) => l.axis === 'z')) { const zEnd = Math.max(...lums.map((l) => Math.abs(l.z) + l.len / 2)); zs = [-zEnd, zEnd]; }
    else zs = uniq(lums.map((l) => l.z));
    if (!lums.length && cfg === 6) { const e = 0.6; xs = [-W / 2 + e, W / 2 - e]; zs = [-L / 2 + e, L / 2 - e]; } // teto luminoso: faixa de 0,60 m
    xs.forEach((x) => addSeg([x, -L / 2, x, L / 2]));
    zs.forEach((z) => addSeg([-W / 2, z, W / 2, z]));
    // “X” tracejado na célula cujo centro é o ponto (cantos, meia distância das paredes, centro de 4 luminárias)
    const gx = [-W / 2, ...xs, W / 2], gz = [-L / 2, ...zs, L / 2];
    for (const p of points) {
      for (let i = 0; i < gx.length - 1; i++) for (let j = 0; j < gz.length - 1; j++) {
        const [x0, x1, z0, z1] = [gx[i], gx[i + 1], gz[j], gz[j + 1]];
        if (Math.abs(p.x - (x0 + x1) / 2) < 0.03 && Math.abs(p.z - (z0 + z1) / 2) < 0.03 && x1 - x0 > 0.1 && z1 - z0 > 0.1) {
          addSeg([x0, z0, x1, z1]); addSeg([x1, z0, x0, z1]);
        }
      }
    }
    return segs;
  }
  function buildGuides() {
    const segs = guideSegments(); if (!segs.length) return;
    guides = new THREE.Mesh(ribbonGeometry(segs, 0.016), guideMat); guides.renderOrder = 2; guides.position.y = room.H - Y_GUIDE; marks.add(guides);
    flag(guides);
  }

  // ---------- cota 0,75 m (régua discreta no ponto destacado) ----------
  function buildDim() {
    const g = new THREE.Group(); g.name = 'cota'; g.visible = false;
    const mat = ovPatch(new THREE.MeshBasicMaterial({ color: 0x27303b, transparent: true, depthWrite: false, toneMapped: false }));
    const matL = ovPatch(new THREE.MeshBasicMaterial({ color: 0x27303b, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false }));
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.005, 1, 0.005).translate(0, 0.5, 0), mat); g.add(bar);
    const tickG = new THREE.BoxGeometry(0.07, 0.005, 0.005);
    const t0 = new THREE.Mesh(tickG, mat), t1 = new THREE.Mesh(tickG, mat); g.add(t0, t1);
    const arG = new THREE.ConeGeometry(0.012, 0.04, 14);
    const a0 = new THREE.Mesh(arG, mat), a1 = new THREE.Mesh(arG, mat); a0.rotation.x = Math.PI; g.add(a0, a1);
    const extG = new THREE.BoxGeometry(1, 0.003, 0.003).translate(0.5, 0, 0);
    const e0 = new THREE.Mesh(extG, matL), e1 = new THREE.Mesh(extG, matL); g.add(e0, e1);
    const cross = new THREE.Group(); const cG = new THREE.BoxGeometry(0.12, 0.002, 0.006);
    const c0 = new THREE.Mesh(cG, mat), c1 = new THREE.Mesh(cG, mat); c1.rotation.y = Math.PI / 2; cross.add(c0, c1); cross.position.y = 0.003; g.add(cross);
    const labelRoot = new THREE.Group(); labelRoot.visible = false;
    let lbl = null, lblText = '';
    const off = 0.27;
    function layout(pl) {
      bar.position.set(off, 0, 0); bar.scale.y = pl; t0.position.set(off, 0.0025, 0); t1.position.set(off, pl, 0);
      a0.position.set(off, 0.02, 0); a1.position.set(off, pl - 0.02, 0);
      e0.position.set(0.02, 0.002, 0); e0.scale.x = off + 0.03; e1.position.set(DISC_R, pl, 0); e1.scale.x = off - DISC_R + 0.03;
      const txt = fmtM(pl); if (txt !== lblText) { lblText = txt; if (lbl) { lbl.material.map.dispose(); lbl.material.dispose(); labelRoot.remove(lbl); }
        const d = makeDimLabel(txt); lbl = new THREE.Sprite(new THREE.SpriteMaterial({ map: d.tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
        lbl.center.set(-0.12, 0.5); lbl.renderOrder = 33; lbl.userData.aspect = d.aspect; labelRoot.add(lbl); }
    }
    flag(g); flag(labelRoot);
    return { group: g, labelRoot, layout, mats: [mat, matL], off, get label() { return lbl; } };
  }

  // ---------- luxímetro: gravação, rótulo flutuante e botão "Registrar leitura" ----------
  const chairs = makeChairMover(stage);
  lux.onRecord = (id) => { try { const v = window.__sim?.recordReading?.(id); if (isFinite(v)) lux.showRecorded(v); } catch (err) { console.error(err); } };
  let recHooked = false;
  function hookSim() {
    if (recHooked || !window.__sim?.on) return; recHooked = true;
    window.__sim.on('record', (r) => { if (r && r.id === lux.id && isFinite(r.v)) lux.showRecorded(r.v); });
  }
  const LC = document.createElement('canvas'); LC.width = Math.ceil(860 * LS); LC.height = Math.ceil(196 * LS);
  const lcTex = canvasTex(LC);
  const luxLabel = new THREE.Sprite(new THREE.SpriteMaterial({ map: lcTex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
  luxLabel.center.set(-0.08, 0.5); luxLabel.renderOrder = 40; luxLabel.visible = false; (useOverlay ? ovScene : group).add(luxLabel); flag(luxLabel);
  let lcKey = '', lcAspect = 860 / 196;
  function drawLuxLabel(id, hex, valStr, sub, subCol) {
    const g = LC.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, LC.width, LC.height); g.setTransform(LS, 0, 0, LS, 0, 0);
    g.font = `800 64px ${FONT}`; const idW = g.measureText(id).width + 40;
    g.font = `800 76px ${FONT}`; const vW = g.measureText(valStr).width; g.font = `600 44px ${FONT}`; const uW = g.measureText('lux').width;
    g.font = `600 36px ${FONT}`; const sW = g.measureText(sub).width + 48;
    const W = Math.min(856, Math.max(idW + 24 + vW + 14 + uW + 40, sW, 300)); lcAspect = W / 196;
    const R = (x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
    g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 18; g.shadowOffsetY = 5; R(6, 6, W - 12, 180, 26); g.fillStyle = 'rgba(12,16,22,.94)'; g.fill(); g.shadowColor = 'transparent';
    g.lineWidth = 4; g.strokeStyle = 'rgba(255,255,255,.9)'; g.stroke();
    R(22, 22, idW, 92, 18); g.fillStyle = hex; g.fill();
    g.textBaseline = 'middle'; g.textAlign = 'center'; g.font = `800 64px ${FONT}`; g.fillStyle = '#fff'; g.fillText(id, 22 + idW / 2, 70);
    g.textAlign = 'left'; let x = 22 + idW + 24; g.font = `800 76px ${FONT}`; g.fillStyle = '#fff'; g.fillText(valStr, x, 68); x += vW + 14;
    g.font = `600 44px ${FONT}`; g.fillStyle = 'rgba(220,228,238,.85)'; g.fillText('lux', x, 78);
    g.font = `600 36px ${FONT}`; g.fillStyle = subCol; g.fillText(sub, 24, 152);
    lcTex.repeat.set(W / 860, 1); lcTex.offset.set(0, 0); lcTex.needsUpdate = true;
  }
  // botão DOM ancorado ao aparelho (para quem não acertar a tecla REC do 3D)
  let recBtn = null;
  function ensureBtn() {
    if (recBtn) return recBtn; const host = document.getElementById('ui'); if (!host) return null;
    if (!document.getElementById('mark-style')) { const st = document.createElement('style'); st.id = 'mark-style'; st.textContent = `
      .mark-rec{position:absolute;left:0;top:0;transform:translate(-9999px,0);display:flex;align-items:center;gap:8px;padding:8px 14px 8px 10px;border-radius:12px;
        border:1px solid rgba(255,255,255,.22);background:linear-gradient(180deg,#1f8f55,#17784a);color:#fff;font:600 13px/1 ${FONT};letter-spacing:.01em;
        box-shadow:0 6px 18px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.18);cursor:pointer;white-space:nowrap;transition:opacity .2s, filter .15s;pointer-events:auto}
      .mark-rec:hover{filter:brightness(1.08)} .mark-rec:active{filter:brightness(.92)} .mark-rec[disabled]{opacity:.55;cursor:default}
      .mark-rec i{width:10px;height:10px;border-radius:50%;background:#ff4757;box-shadow:0 0 0 3px rgba(255,255,255,.25)} .mark-rec.done{background:linear-gradient(180deg,#2d6cdf,#2457b8)}`;
      document.head.appendChild(st); }
    recBtn = document.createElement('button'); recBtn.type = 'button'; recBtn.className = 'mark-rec'; recBtn.innerHTML = '<i></i><span>Registrar leitura</span>';
    recBtn.title = 'Grava a leitura do luxímetro no campo do ponto';
    recBtn.addEventListener('click', (ev) => { ev.stopPropagation(); lux.press('rec'); });
    host.appendChild(recBtn); return recBtn;
  }
  const bw = new THREE.Vector3(), bv = new THREE.Vector3();
  function luxUI() {
    hookSim();
    const on = lux.active && !!lux.id && !!lux.bodyWorld(bw);
    let show = false;
    if (on) {
      const cam = stage.camera; bv.copy(bw).applyMatrix4(cam.matrixWorldInverse); const depth = -bv.z;
      show = depth > 0.2;
      if (show) {
        const o = P.get(lux.id); const hex = o?.hex || GROUP_HEX[lux.id[0].toUpperCase()] || '#888';
        const dsp = lux.display; const id = (o?.p.label || lux.id.toUpperCase());
        const val = !dsp.power ? '—' : isFinite(dsp.value) ? fmtLux(dsp.value) : '—';
        const [sub, col] = !dsp.power ? ['visor desligado (POWER)', '#9aa6b5'] : dsp.mem ? ['✓ leitura registrada', '#5fe39a'] : dsp.hold ? ['HOLD — leitura congelada', '#ffd166']
          : dsp.moving ? ['deslocando o tripé…', '#9aa6b5'] : !dsp.stable ? ['estabilizando a fotocélula…', '#ffd166'] : ['leitura ao vivo · estável', '#9fc4ff'];
        const rv = num(values?.[lux.id]); const sub2 = rv == null ? sub : `${sub}  ·  campo: ${fmtLux(rv)} lux`;
        const key = id + val + sub2; if (key !== lcKey) { lcKey = key; drawLuxLabel(id, hex, val, sub2, col); }
        luxLabel.position.copy(bw); luxLabel.updateMatrixWorld();
        const vh = canvas.clientHeight || innerHeight, tanH = Math.tan(THREE.MathUtils.degToRad(cam.fov || 50) / 2);
        sizeLabel(luxLabel, lcAspect, Math.max(30, Math.min(48, vh * 0.05)), cam, vh, tanH);
        // fica à direita do aparelho
        luxLabel.center.set(-Math.min(1.2, (0.06 / luxLabel.userData.k + 8) / luxLabel.userData.wpx), 0.5);
        luxLabel.material.opacity = 1;
        window.__luxDisplay = { id: lux.id, ...dsp };
        // se a UI já oferece um “Registrar leitura”, não duplica
        const other = [...document.querySelectorAll('#ui button')].some((x) => x !== recBtn && /registrar leitura/i.test(x.textContent || '') && x.offsetParent);
        const b = other ? null : ensureBtn();
        if (recBtn) recBtn.style.visibility = other ? 'hidden' : '';
        if (b) {
          bv.copy(bw).project(cam); const r = canvas.getBoundingClientRect();
          const sx = (bv.x * 0.5 + 0.5) * r.width + r.left, sy = (-bv.y * 0.5 + 0.5) * r.height + r.top;
          const lx = sx - luxLabel.center.x * luxLabel.userData.wpx, ly = sy + luxLabel.userData.hpx * 0.5 + 8;
          b.style.transform = `translate(${Math.round(lx)}px, ${Math.round(ly)}px)`;
          b.disabled = !dsp.power || dsp.moving; b.classList.toggle('done', dsp.mem);
          b.querySelector('span').textContent = dsp.mem ? 'Registrada ✓' : 'Registrar leitura';
        }
      }
    }
    luxLabel.visible = show;
    if (recBtn) recBtn.style.display = show ? '' : 'none';
    if (ovPass && show) ovPass.enabled = true;
  }

  // ---------- API ----------
  function show(pts, rm, opts = {}) {
    const animate = !!opts.animate;
    room = { plane: 0.75, ...(rm || room) }; cfg = opts.config ?? cfg;
    const s = JSON.stringify([pts.map((p) => [p.id, p.x, p.z]), room.L, room.W, room.H, room.plane, cfg]);
    if (s !== sig || !P.size) {
      sig = s; points = pts.slice(); clearPoints();
      // ordem de identificação: P → T → Q → R
      const sorted = points.slice().sort((a, b) => (ORDER.indexOf(a.group) - ORDER.indexOf(b.group)) || a.id.localeCompare(b.id, 'pt', { numeric: true }));
      let t = 0.25, lastG = null;
      sorted.forEach((p, i) => { if (lastG && p.group !== lastG) t += 0.3; lastG = p.group; const o = buildPoint(p, i); o.t0 = t; t += 0.12; P.set(p.id, o); });
      buildGuides(); dim.layout(room.plane); occList = null; seatT = -1;
    }
    for (const o of P.values()) drawLabel(o);
    const wasVisible = marks.visible && !hiding;
    marks.visible = labels.visible = true; hiding = false;
    if (animate) showT0 = performance.now() / 1000;
    else if (!wasVisible) showT0 = performance.now() / 1000 - 100;
  }
  function hide() {
    if (marks.visible && !hiding) { hiding = true; hideT0 = performance.now() / 1000; }
    lux.hide(); chairs.restore(); canvas.style.cursor = ''; hoverId = null;
  }
  /** Recolhe o luxímetro (Esc / clique no vazio). */
  function retract() {
    if (!lux.active) return;
    lux.hide(); chairs.restore(); highlight(null);
    try { if (window.__sim?.state) window.__sim.state.activePoint = null; } catch { /* */ }
  }
  function setValues(v, b) { values = v || {}; bands = b || null; for (const o of P.values()) drawLabel(o); }
  function highlight(id) { hlId = id ? String(id).toLowerCase() : null; hlT0 = performance.now() / 1000; }
  function luxmeterTo(id) {
    if (!id) { lux.hide(); chairs.restore(); return; }
    id = String(id).toLowerCase();
    let p = points.find((q) => q.id === id);
    if (!p) { try { p = window.__sim?.points?.().find((q) => q.id === id); } catch { /* */ } }
    if (!p) return;
    const rm = window.__sim?.state?.room || room;
    lux.moveTo(p.x, p.z, { plane: 0.75, ...rm }, id);
    chairs.clearAround(p.x, p.z);            // a carteira sob o ponto é afastada (o tripé fica livre, nunca enterrado)
    flag(lux.group, true);
  }

  // ---------- seleção por clique (raycast) ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pickAt(e) {
    if (!marks.visible || hiding || !P.size) return null;
    const r = canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, stage.camera);
    const objs = []; for (const o of P.values()) for (const m of o.pick) if (m.visible !== false && (m.isSprite ? m.material.opacity > 0.15 : true)) objs.push(m);
    const hits = ray.intersectObjects(objs, false);
    if (!hits.length) return null;
    const sp = hits.find((h) => h.object.isSprite); return (sp || hits[0]).object.userData.pid;   // etiquetas têm prioridade
  }
  let down = null, lastMove = 0;
  canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  canvas.addEventListener('pointerup', (e) => {
    if (!down) return; const d = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = performance.now() - down.t; down = null;
    if (d > 6 || dt > 700) return;
    const lh = luxAt(e);
    if (lh) { if (lh !== 'body') lux.press(lh); return; }               // teclas 3D do aparelho
    const id = pickAt(e);
    if (id) { highlight(id); try { pickFn(id); } catch (err) { console.error(err); } }
    else retract();                                                    // clique no vazio recolhe o luxímetro
  });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && lux.active) retract(); });
  function luxAt(e) {
    if (!lux.active) return null;
    const r = canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, stage.camera);
    const hits = ray.intersectObject(lux.group, true); if (!hits.length) return null;
    const b = hits.find((h) => h.object.userData.btn && h.distance < hits[0].distance + 0.03);
    return b ? b.object.userData.btn : 'body';
  }
  canvas.addEventListener('pointermove', (e) => {
    const now = performance.now(); if (now - lastMove < 60 || e.buttons) return; lastMove = now;
    const id = pickAt(e); if (id !== hoverId) { hoverId = id; canvas.style.cursor = id ? 'pointer' : ''; }
  });

  // ---------- oclusão inteligente das etiquetas do plano (móveis entre a câmera e o ponto) ----------
  // Raios em rodízio (poucos por quadro) contra objetos pequenos da cena (cadeiras, mesas, luminárias);
  // paredes/forro/piso (grandes) não contam. Etiqueta oculta: esmaece e perde prioridade.
  let occList = null, occT = 0, occI = 0;
  const occRay = new THREE.Raycaster(); const tv = new THREE.Vector3(), sph = new THREE.Sphere();
  function collectOccluders() {
    occList = [];
    stage.scene.traverse((o) => {
      if (!o.isMesh || !o.visible || o.userData.noEnv) return;
      for (let q = o.parent; q; q = q.parent) if (!q.visible) return;
      const m = Array.isArray(o.material) ? o.material[0] : o.material; if (!m || m.visible === false || (m.transparent && !m.depthWrite)) return;
      const g = o.geometry; if (!g) return; if (!g.boundingSphere) g.computeBoundingSphere();
      sph.copy(g.boundingSphere).applyMatrix4(o.matrixWorld);
      if (!o.isInstancedMesh && sph.radius > 1.4) return;           // arquitetura: ignora
      if (o.isInstancedMesh && g.boundingSphere.radius > 1.4) return;
      occList.push(o);
    });
  }
  function updateOcclusion(cam, now) {
    if (!occList || now - occT > 2.5) { occT = now; collectOccluders(); }
    const ids = [...P.keys()]; if (!ids.length) return;
    for (let k = 0; k < 3; k++) {
      const o = P.get(ids[occI++ % ids.length]);
      tv.set(o.p.x, o.pLabel.position.y + 0.01, o.p.z); const d = tv.distanceTo(cam.position);
      occRay.set(cam.position, tv.sub(cam.position).normalize()); occRay.near = 0.05; occRay.far = d - 0.06;
      let hit = false;
      try { hit = occRay.intersectObjects(occList, false).length > 0; } catch { hit = false; }
      o.occ = hit ? 1 : 0;
    }
  }

  // Adesivo “assenta” na face inferior do que estiver pendurado no ponto (luminária, perfil do forro); senão, no forro.
  let seatT = -1; const seatRay = new THREE.Raycaster(); const UP = new THREE.Vector3(0, 1, 0), org = new THREE.Vector3();
  function seatStickers() {
    const H = room.H, pl = room.plane ?? 0.75, cand = [];
    stage.scene.traverse((o) => { if (o.isMesh && !o.userData.noEnv) { const m = Array.isArray(o.material) ? o.material[0] : o.material; if (m && m.visible !== false) cand.push(o); } });
    for (const o of P.values()) {
      org.set(o.p.x, H - 0.4, o.p.z); seatRay.set(org, UP); seatRay.near = 0; seatRay.far = 0.45;
      let y = H - Y_STICK;
      try {
        const hits = seatRay.intersectObjects(cand, false);
        for (const h of hits) { let vis = true; for (let q = h.object; q; q = q.parent) if (!q.visible) { vis = false; break; }
          if (vis && h.point.y > H - 0.35) { y = Math.min(H - Y_STICK, h.point.y - 0.004); break; } }
      } catch { /* */ }
      o.yTop = Math.max(pl + 0.3, y); o.pickBeam.position.y = o.yTop; o.pickBeam.scale.y = o.yTop - pl;
    }
  }

  // Evita sobreposição: prioridade destacado > sob o cursor > visível > mais próximo; as demais esmaecem.
  const scr = new THREE.Vector3();
  function declutter(cam, dt) {
    const vh = canvas.clientHeight || innerHeight, vw = canvas.clientWidth || innerWidth;
    const items = [];
    for (const o of P.values()) {
      for (const k of ['c', 'p']) {
        const sp = k === 'c' ? o.cLabel : o.pLabel; const base = k === 'c' ? o.cBase : o.pBase;
        if (!sp.visible || !(base > 0.01) || !(sp.userData.depth > 0.05)) { o[k + 'Vis'] = 0; sp.material.opacity = 0; continue; }
        scr.set(o.p.x, sp.position.y, o.p.z).project(cam);
        const sx = (scr.x * 0.5 + 0.5) * vw, sy = (-scr.y * 0.5 + 0.5) * vh;
        const wpx = sp.userData.wpx, hpx = sp.userData.hpx;
        const r = [sx - sp.center.x * wpx, sy - (1 - sp.center.y) * hpx, sx + (1 - sp.center.x) * wpx, sy + sp.center.y * hpx];
        const occ = k === 'p' ? o.occS || 0 : 0;
        const prio = (o.id === hlId ? -1e6 : 0) + (o.id === hoverId ? -1e5 : 0) + occ * 50 + sp.userData.depth + (k === 'c' ? 0.15 : 0);
        items.push({ o, k, sp, base, r, prio, occ });
      }
    }
    items.sort((a, b) => a.prio - b.prio);
    const acc = [];
    for (const it of items) {
      const [a0, b0, a1, b1] = it.r; const ar = (a1 - a0) * (b1 - b0);
      let clash = false;
      for (const q of acc) { const ix = Math.min(a1, q[2]) - Math.max(a0, q[0]), iy = Math.min(b1, q[3]) - Math.max(b0, q[1]);
        if (ix > 2 && iy > 2) { clash = true; break; } }
      if (!clash) acc.push(it.r);
      const key = it.k + 'Vis'; const tgt = clash ? 0 : 1; const cur = it.o[key] ?? tgt;
      it.o[key] = cur + (tgt - cur) * Math.min(1, dt * 9);
      const hl = it.o.id === hlId || it.o.id === hoverId;
      it.sp.material.opacity = it.base * it.o[key] * (hl ? 1 : 1 - 0.38 * it.occ); void ar;
    }
  }

  // ---------- quadro a quadro ----------
  const camDir = new THREE.Vector3(), tmp = new THREE.Vector3(), right = new THREE.Vector3();
  /** Tamanho em tela constante: devolve a altura em metros para `px` pixels na profundidade do objeto. */
  function sizeLabel(sp, aspect, px, cam, vh, tanH) {
    tmp.setFromMatrixPosition(sp.matrixWorld).applyMatrix4(cam.matrixWorldInverse); const depth = -tmp.z;
    sp.userData.depth = depth; if (depth <= 0.05) return 0;
    const k = (2 * depth * tanH) / vh, h = px * k; sp.scale.set(h * aspect, h, 1);
    sp.userData.hpx = px; sp.userData.wpx = px * aspect; sp.userData.k = k; return depth;
  }
  let msEMA = 0;
  stage.onFrame?.((dt) => { const t0p = performance.now(); try { frame(dt); } finally { msEMA += (performance.now() - t0p - msEMA) * 0.05; window.__markMs = +msEMA.toFixed(3); } });
  function frame(dt) {
    const now = performance.now() / 1000;
    ovSync(stage);
    if (ovPass) { ovPass.enabled = labels.visible; ensureLast(stage, ovPass); }
    lux.update(dt, now); chairs.update(); luxUI(dt, now);
    if (!marks.visible) return;
    let K = 1;
    if (hiding) { K = 1 - clamp01((now - hideT0) / 0.35); if (K <= 0) { marks.visible = labels.visible = false; hiding = false; if (ovPass) ovPass.enabled = luxLabel.visible; return; } }
    const cam = stage.camera; cam.getWorldDirection(camDir); cam.updateMatrixWorld();
    labels.updateMatrixWorld(true);
    const vh = canvas.clientHeight || innerHeight, tanH = Math.tan(THREE.MathUtils.degToRad(cam.fov || 50) / 2);
    const pxBase = Math.max(17, Math.min(30, vh * 0.027));                // altura das etiquetas em px CSS
    const H = room.H, pl = room.plane ?? 0.75;
    const above = cam.position.y > H + 0.02;                 // câmera acima do forro (overview / planta)
    const plan = above && camDir.y < -0.8;                    // vista em planta
    const ts = now - showT0;
    // linhas de construção
    if (guides) {
      guides.visible = guidesOn;
      guideMat.uniforms.uProgress.value = sstep(0, 1, ts / 1.6);
      guideMat.uniforms.uOpacity.value = (plan ? 0.78 : above ? 0.5 : 0.58) * K;
      guides.position.y = plan ? pl + 0.008 : H - Y_GUIDE;
    }
    if (marks.visible) { updateOcclusion(cam, now); if (now - seatT > 2.5) { seatT = now; seatStickers(); } }
    const hlPulse = 0.5 + 0.5 * Math.sin((now - hlT0) * 5.5);
    right.set(1, 0, 0).applyQuaternion(cam.quaternion); right.y = 0; if (right.lengthSq() < 1e-4) right.set(1, 0, 0); right.normalize();
    for (const o of P.values()) {
      const tau = ts - o.t0, hl = o.id === hlId, hov = o.id === hoverId;
      tmp.set(o.p.x, pl, o.p.z); const nearP = sstep(0.7, 1.6, tmp.distanceTo(cam.position));   // marca do plano rente à câmera some
      const dimK = (hlId && !hl ? 0.62 : 1) * K;
      // adesivo
      const aS = clamp01(tau / 0.28), sS = easeOutBack(tau / 0.38) * (hl ? 1 + 0.14 * hlPulse : hov ? 1.08 : 1);
      o.sticker.visible = !plan && aS > 0; o.sticker.scale.setScalar(Math.max(0.001, sS)); o.sticker.material.opacity = aS * K;
      // feixe descendo
      const yT = o.yTop; o.sticker.position.y = yT; o.ringC.position.y = yT - 0.001; o.glowC.position.y = yT - 0.006; o.core.position.y = o.halo.position.y = yT; o.cLabel.position.y = yT - 0.004;
      const uL = easeInOut((tau - 0.22) / 0.55), len = Math.max(0.0005, (yT - pl) * uL);
      const beamOn = uL > 0 && !plan;
      o.core.visible = o.halo.visible = beamOn;
      const hb = hl ? 1.5 + 0.4 * hlPulse : 1;
      tmp.set(o.p.x, (yT + pl) / 2, o.p.z); const dB = tmp.distanceTo(cam.position);
      const rMin = dB * tanH * 2 / vh * 0.9;                                  // núcleo nunca abaixo de ~1,8 px
      const rc0 = Math.max(0.0026, rMin) * (hl ? 1.3 : 1), rh0 = Math.max(0.014, rMin * 4.5) * (hl ? 1.35 : 1);
      o.core.scale.set(rc0, len, rc0); o.halo.scale.set(rh0, len, rh0);
      o.coreMat.uniforms.uLen.value = o.haloMat.uniforms.uLen.value = len;
      o.coreMat.uniforms.uTime.value = o.haloMat.uniforms.uTime.value = now;
      o.coreMat.uniforms.uOpacity.value = dimK; o.haloMat.uniforms.uOpacity.value = 0.3 * hb * dimK;
      o.glowC.visible = beamOn; o.glowC.material.opacity = 0.9 * dimK;
      o.glowC.scale.setScalar(0.06 * (hl ? 1.2 + 0.3 * hlPulse : 1));
      // ponta / spot
      const landed = uL >= 1;
      o.head.visible = uL > 0; o.head.position.y = yT - len + (landed ? 0.006 : 0);
      o.head.scale.setScalar(landed ? (hl ? 0.07 + 0.02 * hlPulse : 0.05) : 0.11); o.head.material.opacity = (landed ? 0.95 : 1) * dimK * nearP;
      // disco de leitura
      const aD = clamp01((tau - 0.72) / 0.3), sD = easeOutBack((tau - 0.72) / 0.42);
      o.disc.visible = o.ghost.visible = aD > 0;
      const ds = Math.max(0.001, sD) * (hl ? 1.1 + 0.08 * hlPulse : hov ? 1.06 : 1);
      o.disc.scale.setScalar(ds); o.ghost.scale.setScalar(ds);
      const luxHere = lux.active && Math.abs(lux.target.x - o.p.x) < 0.01 && Math.abs(lux.target.z - o.p.z) < 0.01;
      o.luxK = (o.luxK ?? 1) + ((luxHere ? 0.06 : 1) - (o.luxK ?? 1)) * Math.min(1, dt * 4);
      o.discMat.opacity = 0.95 * aD * dimK * o.luxK * nearP; o.ghostMat.opacity = 0.2 * aD * dimK * (luxHere ? 0 : 1) * nearP;
      // ondas
      const rip = (mesh, t0, dur, r0, r1, peak) => { const u = (tau - t0) / dur; if (u >= 0 && u < 1) { mesh.visible = true; const r = r0 + (r1 - r0) * easeOut(u); mesh.scale.set(r, r, 1); mesh.material.opacity = peak * (1 - u) * K; return true; } return false; };
      let rc = rip(o.ringC, 0, 0.75, 0.15, 0.62, 1), rp = rip(o.ringP, 0.72, 0.8, 0.2, 0.8, 1);
      if (hl) { const u = ((now - hlT0) % 1.5) / 1.5; const r = 0.22 + 0.55 * easeOut(u);
        if (!rc) { o.ringC.visible = true; o.ringC.scale.set(r, r, 1); o.ringC.material.opacity = (1 - u) * 0.9 * K; rc = true; }
        if (!rp) { o.ringP.visible = true; o.ringP.scale.set(r * 1.25, r * 1.25, 1); o.ringP.material.opacity = (1 - u) * 0.9 * K; rp = true; } }
      if (!rc || plan) o.ringC.visible = false; if (!rp) o.ringP.visible = false; o.ringP.material.opacity *= nearP;
      // etiquetas — tamanho constante em tela; somem perto da câmera
      o.occS = (o.occS ?? o.occ) + (o.occ - (o.occS ?? o.occ)) * Math.min(1, dt * 5);
      const aCL = clamp01((tau - 0.12) / 0.3);
      o.cLabel.visible = !above && aCL > 0;
      if (o.cLabel.visible) {
        const d = sizeLabel(o.cLabel, o.cAspect, pxBase * (hl ? 1.2 : 1), cam, vh, tanH);
        const stickPx = STICKER_R / Math.max(1e-4, o.cLabel.userData.k);
        o.cLabel.center.set(-Math.min(1.5, (stickPx * 1.05 + 3) / o.cLabel.userData.wpx), 0.5);
        o.cBase = aCL * sstep(0.5, 1.0, d) * (hlId && !hl ? 0.72 : 1) * K;
      } else o.cBase = 0;
      const aPL = clamp01((tau - 0.85) / 0.3);
      o.pLabel.visible = aPL > 0;
      if (o.pLabel.visible) {
        const d = sizeLabel(o.pLabel, o.pAspect, pxBase * 1.06 * (hl ? 1.2 : 1 - 0.12 * o.occS), cam, vh, tanH);
        const discPx = DISC_R / Math.max(1e-4, o.pLabel.userData.k);
        o.pLabel.center.set(0.5, -Math.min(2.5, (discPx * (plan ? 1.0 : 0.45) + 4) / o.pLabel.userData.hpx));
        o.pBase = aPL * sstep(0.5, 1.0, d) * (hlId && !hl ? 0.72 : 1) * K * (luxHere && lux.display.power ? 0 : 1);   // o rótulo do luxímetro substitui
      } else o.pBase = 0;
      o.pickBeam.visible = beamOn;
    }
    declutter(cam, dt);
    // cota 0,75 m no ponto destacado
    const cotaId = hlId && P.has(hlId) ? hlId : null;                 // só no ponto destacado (foco / clique)
    const co = P.get(cotaId);
    const dimOn = !!co && !above && ts > 1.0 + (co?.t0 || 0) && now - hlT0 > 0.25;
    dim.group.visible = dim.labelRoot.visible = dimOn;
    if (dimOn) {
      dim.group.position.set(co.p.x, 0, co.p.z);
      dim.group.rotation.y = Math.atan2(-right.z, right.x);      // régua ao lado do prumo, perpendicular à visão
      const a = clamp01(Math.min(ts - 1.0 - co.t0, now - hlT0 - 0.25) / 0.4) * K; dim.mats[0].opacity = a; dim.mats[1].opacity = 0.55 * a;
      const lb = dim.label;
      if (lb) {
        dim.labelRoot.position.set(co.p.x + right.x * dim.off, pl / 2, co.p.z + right.z * dim.off); dim.labelRoot.updateMatrixWorld(true);
        sizeLabel(lb, lb.userData.aspect, pxBase * 0.95, cam, vh, tanH); lb.material.opacity = a * (lb.userData.depth > 0.3 ? 1 : 0);
      }
    }
  }

  const api = {
    group, show, hide, setValues, highlight, luxmeterTo,
    onPick(fn) { pickFn = typeof fn === 'function' ? fn : () => {}; },
    // extras (não exigidos pelo contrato)
    setGuides(b) { guidesOn = !!b; },
    get luxmeter() { return lux; },
    get overlayScene() { return ovScene; },
  };
  window.__markers = api;   // inspeção/testes automatizados
  return api;
}

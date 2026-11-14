// MARCAÇÃO — geometria do luxímetro "LED Light Meter" (corpo com bumper ranhurado, teclas, visor, verso etiquetado),
// fotocélula separada (cúpula difusora translúcida, empunhadura, tampa com cordão), tripé e cabo espiralado físico.
// Unidades em metros. Proporções medidas nas fotos refs/lux/IMG_4962..4964 (corpo ≈ 16,5 × 6,4 × 3,1 cm).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ovPatch } from './mark_overlay.js';
import { FACE, LAYOUT, makeFaceTex, makeBackTex, makeKeyLegend, makePowerLegend, makeRubberRough } from './mark_lux_tex.js';

export const BODY = { w: 0.064, h: 0.165, d: 0.031 };

function rrShape(w, h, r, cx = 0, cy = 0, hole = false) {
  const s = hole ? new THREE.Path() : new THREE.Shape(); const x = cx - w / 2, y = cy - h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s;
}
function mesh(geo, mat, parent, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent?.add(m); return m; }

export function makeMaterials() {
  const rough = makeRubberRough();
  return {
    shell: new THREE.MeshStandardMaterial({ color: 0xffffff, map: null, roughness: 0.46, metalness: 0 }),
    face: new THREE.MeshStandardMaterial({ map: makeFaceTex(), roughness: 0.42, metalness: 0 }),
    back: null,
    bumper: new THREE.MeshStandardMaterial({ color: 0x45494d, roughness: 0.78, roughnessMap: rough, metalness: 0 }),
    key: new THREE.MeshStandardMaterial({ color: 0x6e7378, roughness: 0.42, metalness: 0.05 }),
    keyLeg: new THREE.MeshStandardMaterial({ transparent: true, roughness: 0.42, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    power: new THREE.MeshStandardMaterial({ color: 0xf0bf1c, roughness: 0.38, metalness: 0, side: THREE.DoubleSide }),
    lcdGlass: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0, transparent: true, opacity: 0.06, clearcoat: 0.25, clearcoatRoughness: 0.45, envMapIntensity: 0.25, specularIntensity: 0.3, depthWrite: false }),
    bezel: new THREE.MeshStandardMaterial({ color: 0x3c4146, roughness: 0.35, metalness: 0.2 }),
    black: new THREE.MeshStandardMaterial({ color: 0x151618, roughness: 0.5, metalness: 0.1 }),
    sensor: new THREE.MeshStandardMaterial({ color: 0x2b2d30, roughness: 0.52, metalness: 0.02 }),
    sensorRing: new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.36, metalness: 0.05, side: THREE.DoubleSide }),
    dome: new THREE.MeshPhysicalMaterial({ color: 0xf6f6f2, roughness: 0.32, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.18, sheen: 0.6, sheenColor: new THREE.Color(0xffffff), sheenRoughness: 0.5, transparent: true, opacity: 0.93, emissive: 0xffffff, emissiveIntensity: 0.12 }),
    domeCore: ovPatch(new THREE.MeshBasicMaterial({ color: 0xe9ebe8 })),
    cap: new THREE.MeshStandardMaterial({ color: 0x141517, roughness: 0.3, metalness: 0.05, side: THREE.DoubleSide }),
    capTop: new THREE.MeshPhysicalMaterial({ color: 0x16191c, roughness: 0.12, metalness: 0, transparent: true, opacity: 0.9, clearcoat: 1, clearcoatRoughness: 0.05, depthWrite: false }),
    cord: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xc9ccd0, roughness: 0.25, metalness: 0.9 }),
    cable: new THREE.MeshStandardMaterial({ color: 0x17181a, roughness: 0.38, metalness: 0.04 }),
    alu: new THREE.MeshStandardMaterial({ color: 0xb4bac1, metalness: 0.35, roughness: 0.32 }),
    alu2: new THREE.MeshStandardMaterial({ color: 0x9aa0a7, metalness: 0.35, roughness: 0.4 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x0e0f10, roughness: 0.92 }),
    bubble: new THREE.MeshStandardMaterial({ color: 0x9be36a, roughness: 0.15, emissive: 0x2c5a12, emissiveIntensity: 0.6 }),
    hit: new THREE.MeshBasicMaterial({ visible: false }),
  };
}

/** Corpo do aparelho. Origem no centro; painel em +Z; topo em +Y. */
export function buildBody(M, lcdTex) {
  const g = new THREE.Group(); g.name = 'lux_body';
  const parts = { body: [], lcd: [], back: [], keys: {} };
  // casco cinza-claro
  const shellGeo = new RoundedBoxGeometry(0.0578, 0.1535, 0.0266, 3, 0.002);
  parts.body.push(mesh(shellGeo, new THREE.MeshStandardMaterial({ color: 0xd6d8d7, roughness: 0.48 }), g));
  // painel frontal
  const face = mesh(new THREE.PlaneGeometry(FACE.w, FACE.h), M.face, g, 0, 0, 0.01334); face.castShadow = false; parts.body.push(face);
  // verso
  const bk = makeBackTex(); M.back = new THREE.MeshStandardMaterial({ map: bk.tex, roughness: 0.5 });
  const back = mesh(new THREE.PlaneGeometry(FACE.w, FACE.h), M.back, g, 0, 0, -0.01334); back.rotation.y = Math.PI; back.castShadow = false; parts.back.push(back);
  // parafuso da tampa das pilhas
  const screw = mesh(new THREE.CylinderGeometry(0.0021, 0.0023, 0.0012, 20), M.steel, g, bk.screw.x, bk.screw.y, -0.0138); screw.rotation.x = Math.PI / 2;
  const slot = mesh(new THREE.BoxGeometry(0.0032, 0.0005, 0.0004), M.black, g, bk.screw.x, bk.screw.y, -0.01445); slot.rotation.z = 0.5; parts.back.push(screw, slot);
  // bumper de borracha (anel extrudado com chanfro)
  const outer = rrShape(BODY.w - 0.0032, BODY.h - 0.0032, 0.0105);
  outer.holes.push(rrShape(0.0599, 0.1567, 0.006, 0, 0, true));
  const bg = new THREE.ExtrudeGeometry(outer, { depth: 0.0262, bevelEnabled: true, bevelThickness: 0.0024, bevelSize: 0.0016, bevelSegments: 4, curveSegments: 10 });
  bg.translate(0, 0, -0.0131);
  parts.body.push(mesh(bg, M.bumper, g));
  // ranhuras laterais (faixas em relevo na metade inferior, como na foto de perfil)
  const ribGeo = new RoundedBoxGeometry(0.0022, 0.0074, 0.0262, 2, 0.0009);
  for (const sx of [-1, 1]) for (let i = 0; i < 6; i++) parts.body.push(mesh(ribGeo, M.bumper, g, sx * (BODY.w / 2 - 0.0006), -0.074 + i * 0.0104, 0));
  // moldura do visor em relevo + LCD + vidro
  const F = LAYOUT.frame, Lc = LAYOUT.lcd;
  const fr = rrShape(F.w, F.h, 0.0026, 0, 0); fr.holes.push(rrShape(Lc.w + 0.0012, Lc.h + 0.0012, 0.0008, 0, 0, true));
  const frGeo = new THREE.ExtrudeGeometry(fr, { depth: 0.0006, bevelEnabled: true, bevelThickness: 0.0004, bevelSize: 0.0004, bevelSegments: 2, curveSegments: 6 });
  const frame = mesh(frGeo, M.bezel, g, F.x, F.y, 0.0134); frame.castShadow = false; parts.lcd.push(frame);
  const lcdMat = new THREE.MeshStandardMaterial({ map: lcdTex, roughness: 0.4, metalness: 0 });
  const lcd = mesh(new THREE.PlaneGeometry(Lc.w, Lc.h), lcdMat, g, Lc.x, Lc.y, 0.01345); lcd.castShadow = false; lcd.name = 'lux_lcd'; parts.lcd.push(lcd);
  const glass = mesh(new THREE.PlaneGeometry(F.w - 0.002, F.h - 0.002), M.lcdGlass, g, F.x, F.y, 0.0148); glass.castShadow = false; glass.renderOrder = 2;
  // teclas
  const keys = [];
  for (const k of LAYOUT.keys) {
    const kg = new RoundedBoxGeometry(k.w, k.h, 0.0034, 4, Math.min(k.h / 2 - 0.0002, 0.0032));
    const key = mesh(kg, M.key, g, k.x, k.y, 0.0137);
    const lm = M.keyLeg.clone(); lm.map = makeKeyLegend(k.l, k.w, k.h);
    const leg = mesh(new THREE.PlaneGeometry(k.w * 0.92, k.h * 0.92), lm, key, 0, 0, 0.00172); leg.castShadow = false;
    const hit = mesh(new THREE.BoxGeometry(k.w + 0.003, k.h + 0.003, 0.008), M.hit, g, k.x, k.y, 0.016); hit.castShadow = false;
    key.userData.btn = hit.userData.btn = k.name; key.userData.z0 = 0.0137;
    keys.push({ name: k.name, mesh: key, hit }); parts.keys[k.name] = key;
  }
  // POWER amarelo (lathe com borda arredondada)
  const P = LAYOUT.power, r = P.r;
  const pl = new THREE.LatheGeometry([new THREE.Vector2(0.0001, 0.0036), new THREE.Vector2(r * 0.7, 0.00355), new THREE.Vector2(r - 0.0005, 0.0032), new THREE.Vector2(r, 0.0026), new THREE.Vector2(r, 0)], 40);
  const pw = mesh(pl, M.power, g, P.x, P.y, 0.0128); pw.rotation.x = Math.PI / 2;
  const pleg = mesh(new THREE.CircleGeometry(r * 0.78, 32), new THREE.MeshStandardMaterial({ map: makePowerLegend(), transparent: true, roughness: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), pw, 0, 0.00362, 0);
  pleg.rotation.x = -Math.PI / 2; pleg.castShadow = false;
  const phit = mesh(new THREE.CylinderGeometry(r + 0.002, r + 0.002, 0.008, 16), M.hit, g, P.x, P.y, 0.016); phit.rotation.x = Math.PI / 2; phit.castShadow = false;
  pw.userData.btn = phit.userData.btn = 'power'; pw.userData.z0 = 0.0128; pw.userData.axisY = true;
  keys.push({ name: 'power', mesh: pw, hit: phit }); parts.keys.power = pw;
  // conector do cabo no topo (lado direito, visto de frente) + alívio de tensão
  const cx = 0.0115, top = BODY.h / 2 - 0.0012;
  mesh(new THREE.CylinderGeometry(0.0046, 0.0052, 0.004, 24), M.black, g, cx, top + 0.002, 0);
  mesh(new THREE.CylinderGeometry(0.0024, 0.0036, 0.016, 16), M.black, g, cx, top + 0.012, 0);
  for (let i = 0; i < 4; i++) mesh(new THREE.TorusGeometry(0.0031 - i * 0.0002, 0.0005, 6, 16), M.black, g, cx, top + 0.007 + i * 0.0028, 0).rotation.x = Math.PI / 2;
  const cableEnd = new THREE.Vector3(cx, top + 0.02, 0);
  return { group: g, parts, keys, lcd, cableEnd };
}

/** Fotocélula (sensor remoto). Origem no eixo da cúpula com y=0 NO TOPO DA CÚPULA; empunhadura para +X. */
export function buildPhotocell(M) {
  const g = new THREE.Group(); g.name = 'lux_photocell';
  const parts = { sensor: [], handle: [] };
  const yS = -0.0092;                                      // plano superior da cabeça
  // casco: cabeça circular + empunhadura com cintura (planta), extrudado com chanfro generoso
  const R = 0.0305, t0 = Math.asin(0.0148 / R);
  const s = new THREE.Shape();
  s.moveTo(R * Math.cos(t0), 0.0148);
  s.absarc(0, 0, R, t0, Math.PI * 2 - t0, false);
  s.bezierCurveTo(0.036, -0.0135, 0.044, -0.0112, 0.054, -0.0112);
  s.bezierCurveTo(0.066, -0.0112, 0.07, -0.0128, 0.082, -0.0126);
  s.absarc(0.088, 0, 0.0126, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05, false);
  s.bezierCurveTo(0.07, 0.0128, 0.066, 0.0112, 0.054, 0.0112);
  s.bezierCurveTo(0.044, 0.0112, 0.036, 0.0135, R * Math.cos(t0), 0.0148);
  const sg = new THREE.ExtrudeGeometry(s, { depth: 0.0125, bevelEnabled: true, bevelThickness: 0.0042, bevelSize: 0.0032, bevelSegments: 5, curveSegments: 40 });
  sg.rotateX(-Math.PI / 2); sg.translate(0, yS - 0.0125 - 0.0042 - 0.001, 0);   // topo do casco 1 mm abaixo do plano da cabeça
  const shell = mesh(sg, M.sensor, g); parts.handle.push(shell);
  // anéis da cabeça (perfil de revolução): colar externo, sulco da tampa, aro interno
  const prof = [[0.0136, 0.0002], [0.0158, 0.0006], [0.0166, 0.0026], [0.0182, 0.0029], [0.0192, 0.0004], [0.0226, -0.0004], [0.0234, 0.0034],
    [0.0243, 0.0064], [0.0283, 0.0070], [0.0300, 0.0046], [0.0306, 0.0006], [0.0306, -0.0040]].map(([r, y]) => new THREE.Vector2(r, y));
  const ring = mesh(new THREE.LatheGeometry(prof, 72), M.sensorRing, g, 0, yS, 0); parts.sensor.push(ring);
  // cúpula difusora translúcida (calota) + núcleo luminoso (a luz da sala atravessa o acrílico opalino)
  const domeH = -yS, domeR = 0.0138;
  const dome = mesh(new THREE.SphereGeometry(domeR, 56, 20, 0, Math.PI * 2, 0, Math.PI / 2), M.dome, g, 0, yS, 0); dome.scale.y = domeH / domeR; dome.renderOrder = 1;
  const core = mesh(new THREE.SphereGeometry(domeR * 0.82, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.domeCore, g, 0, yS, 0); core.scale.y = (domeH * 0.8) / (domeR * 0.82); core.castShadow = false;
  dome.name = 'lux_dome'; parts.sensor.push(dome);
  // alívio de tensão do cabo na ponta da empunhadura
  const sr = mesh(new THREE.CylinderGeometry(0.0026, 0.0044, 0.016, 16), M.black, g, 0.1065, yS - 0.0085, 0); sr.rotation.z = Math.PI / 2;
  for (let i = 0; i < 3; i++) { const rr = mesh(new THREE.TorusGeometry(0.0036 - i * 0.0004, 0.0005, 6, 14), M.black, g, 0.103 + i * 0.004, yS - 0.0085, 0); rr.rotation.y = Math.PI / 2; }
  parts.handle.push(sr);
  // olhal do cordão da tampa (lado oposto à empunhadura)
  const lug = mesh(new THREE.TorusGeometry(0.0023, 0.0007, 8, 16), M.steel, g, -0.0335, yS - 0.0042, 0);
  return { group: g, parts, yS, cableStart: new THREE.Vector3(0.1145, yS - 0.0085, 0), lugPos: new THREE.Vector3(-0.0352, yS - 0.0055, 0), dome, lug };
}

/** Tampa protetora preta (encaixa no sulco da cabeça). Origem = centro da base assentada; aba do cordão em −X. */
export function buildCap(M) {
  const g = new THREE.Group(); g.name = 'lux_cap';
  const prof = [[0.0204, -0.0004], [0.0204, 0.0108], [0.0206, 0.0112], [0.0228, 0.0122], [0.0244, 0.0126], [0.0252, 0.0118], [0.0252, 0.0096], [0.0240, 0.0090],
    [0.0238, 0.0010], [0.0232, -0.0004]].map(([r, y]) => new THREE.Vector2(r, y));
  const body = mesh(new THREE.LatheGeometry(prof, 64), M.cap, g);
  const top = mesh(new THREE.CircleGeometry(0.0206, 48), M.capTop, g, 0, 0.0116, 0); top.rotation.x = -Math.PI / 2; top.castShadow = false;
  const under = mesh(new THREE.CircleGeometry(0.0206, 48), M.capTop, g, 0, 0.0113, 0); under.rotation.x = Math.PI / 2; under.castShadow = false;
  // aba com furo para o cordão
  const tab = mesh(new RoundedBoxGeometry(0.008, 0.0024, 0.007, 2, 0.001), M.cap, g, -0.0272, 0.0112, 0);
  const tabRing = mesh(new THREE.TorusGeometry(0.0021, 0.0006, 8, 14), M.steel, g, -0.0305, 0.0112, 0); tabRing.rotation.x = Math.PI / 2;
  return { group: g, parts: { cap: [body, top, tab] }, tabLocal: new THREE.Vector3(-0.0305, 0.0112, 0) };
}

/** Tripé (coluna, cabeça, 3 pernas telescópicas, braço com berço para o corpo). yTop = topo da cúpula. */
export function buildTripod(M, parent, yTop, tube) {
  const meshes = [];
  const add = (geo, mat, x, y, z) => { const m = mesh(geo, mat, parent, x, y, z); meshes.push(m); return m; };
  const T = (a, b, r, mat, seg) => { const m = tube(a, b, r, mat, seg); meshes.push(m); return m; };
  const yPl = yTop - 0.0092 - 0.0195;                            // base do casco da fotocélula
  // rosca 1/4" + plataforma + cabeça esférica
  add(new THREE.CylinderGeometry(0.019, 0.019, 0.006, 32), M.black, 0, yPl - 0.003, 0);
  add(new THREE.CylinderGeometry(0.009, 0.011, 0.016, 20), M.black, 0, yPl - 0.014, 0);
  add(new THREE.SphereGeometry(0.0155, 24, 16), M.alu2, 0, yPl - 0.03, 0);
  add(new THREE.CylinderGeometry(0.019, 0.015, 0.03, 24), M.black, 0, yPl - 0.052, 0);
  const knob = add(new THREE.CylinderGeometry(0.007, 0.007, 0.028, 16), M.black, 0.028, yPl - 0.05, 0); knob.rotation.z = Math.PI / 2;
  add(new THREE.CylinderGeometry(0.008, 0.008, 0.005, 20), M.black, -0.021, yPl - 0.04, 0);
  add(new THREE.SphereGeometry(0.0048, 12, 8), M.bubble, -0.021, yPl - 0.0375, 0).scale.set(1, 0.4, 1);
  // coluna central
  const yHub = Math.min(0.42, yTop - 0.24), yCol0 = Math.max(0.12, yHub - 0.12);
  T(new THREE.Vector3(0, yCol0, 0), new THREE.Vector3(0, yPl - 0.066, 0), 0.0095, M.alu, 20);
  add(new THREE.CylinderGeometry(0.03, 0.026, 0.055, 28), M.black, 0, yHub, 0);
  add(new THREE.CylinderGeometry(0.016, 0.016, 0.012, 20), M.black, 0, yCol0 + 0.004, 0);
  const lock = add(new THREE.CylinderGeometry(0.006, 0.006, 0.028, 12), M.black, 0, yHub + 0.004, -0.036); lock.rotation.x = Math.PI / 2;
  const footR = Math.min(0.34, yHub * 0.8);
  for (let k = 0; k < 3; k++) {
    const a = Math.PI + k * 2 * Math.PI / 3, dx = Math.sin(a), dz = Math.cos(a);
    const top = new THREE.Vector3(dx * 0.03, yHub - 0.008, dz * 0.03), foot = new THREE.Vector3(dx * footR, 0.012, dz * footR);
    const mid = top.clone().lerp(foot, 0.52);
    add(new THREE.BoxGeometry(0.02, 0.03, 0.02), M.black, top.x, top.y, top.z).lookAt(foot.x, foot.y, foot.z);
    T(top, mid, 0.0085, M.alu, 16); T(mid, foot, 0.0062, M.alu2, 14);
    T(mid.clone().lerp(top, 0.06), mid.clone().lerp(foot, 0.06), 0.0115, M.black, 16);
    add(new THREE.SphereGeometry(0.012, 16, 12), M.rubber, foot.x, 0.009, foot.z).scale.set(1, 0.75, 1);
    T(new THREE.Vector3(dx * 0.016, yCol0 + 0.004, dz * 0.016), top.clone().lerp(foot, 0.62), 0.0035, M.black, 8);
  }
  // braço + berço do corpo (copo inferior aberto, segura só os 2 cm de baixo do bumper)
  const yArm = yTop - 0.255;
  add(new THREE.CylinderGeometry(0.0145, 0.0145, 0.024, 20), M.black, 0, yArm, 0);
  return { meshes, yArm, yHub };
}

/** Berço: copo que prende a base do corpo; origem = centro da base do corpo. */
export function buildCradle(M, parent) {
  const g = new THREE.Group(); parent.add(g); const ms = [];
  const A = (geo, x, y, z) => { const m = mesh(geo, M.black, g, x, y, z); ms.push(m); return m; };
  A(new RoundedBoxGeometry(0.072, 0.0045, 0.037, 2, 0.0015), 0, -0.0022, 0);              // fundo
  A(new RoundedBoxGeometry(0.0045, 0.022, 0.037, 2, 0.0015), -0.0352, 0.009, 0);          // laterais
  A(new RoundedBoxGeometry(0.0045, 0.022, 0.037, 2, 0.0015), 0.0352, 0.009, 0);
  A(new RoundedBoxGeometry(0.066, 0.009, 0.0035, 2, 0.0012), 0, 0.0025, 0.0172);          // aba frontal baixa
  A(new RoundedBoxGeometry(0.05, 0.016, 0.0035, 2, 0.0012), 0, 0.006, -0.0172);           // aba traseira
  return { group: g, meshes: ms };
}

// ---------------------------------------------------------------------------------------------------------------
// Cabo espiralado físico: espinha de nós (Verlet + molas PBD, gravidade, inércia do tripé) com hélice enrolada.
// Pontas presas (alívio de tensão da fotocélula → conector do corpo). Malha atualizada no lugar (sem realocar).
export class CoilCable {
  constructor(mat, { nodes = 26, turns = 46, coilR = 0.0044, wireR = 0.00145, rest = 0.2, radial = 7, perTurn = 16 } = {}) {
    this.N = nodes; this.turns = turns; this.coilR = coilR; this.wireR = wireR; this.rest = rest; this.radial = radial;
    this.S = turns * perTurn + 40;
    this.p = []; this.q = []; for (let i = 0; i <= nodes; i++) { this.p.push(new THREE.Vector3()); this.q.push(new THREE.Vector3()); }
    const nv = (this.S + 1) * radial;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(nv * 3); this.nor = new Float32Array(nv * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('normal', new THREE.BufferAttribute(this.nor, 3).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < this.S; i++) for (let j = 0; j < radial; j++) {
      const a = i * radial + j, b = i * radial + (j + 1) % radial, c = (i + 1) * radial + j, d = (i + 1) * radial + (j + 1) % radial;
      idx.push(a, c, b, b, c, d);
    }
    geo.setIndex(idx);
    this.mesh = new THREE.Mesh(geo, mat); this.mesh.castShadow = true; this.mesh.receiveShadow = true; this.mesh.frustumCulled = false;
    this.inited = false; this.energy = 1; this.helix = []; for (let i = 0; i <= this.S; i++) this.helix.push(new THREE.Vector3());
    this._t = new THREE.Vector3(); this._n = new THREE.Vector3(); this._b = new THREE.Vector3(); this._v = new THREE.Vector3();
  }
  reset(a, b) {
    const N = this.N;
    for (let i = 0; i <= N; i++) { const u = i / N; this.p[i].lerpVectors(a, b, u); this.p[i].y -= Math.sin(Math.PI * u) * 0.06; this.q[i].copy(this.p[i]); }
    this.inited = true; this.energy = 1;
  }
  /** a, b: pontas (no espaço do pai do mesh); acc: aceleração do referencial (m/s²) a subtrair. */
  step(a, b, dt, acc) {
    if (!this.inited) this.reset(a, b);
    const N = this.N, l0 = this.rest / N, sub = 3, h = Math.min(dt, 1 / 30) / sub;
    const moved = a.distanceToSquared(this.p[0]) + b.distanceToSquared(this.p[N]) > 1e-10 || (acc && acc.lengthSq() > 1e-4);
    if (!moved && this.energy < 2e-9) return false;
    let e = 0;
    for (let s = 0; s < sub; s++) {
      this.p[0].copy(a); this.p[N].copy(b);
      for (let i = 1; i < N; i++) {
        const p = this.p[i], q = this.q[i];
        const vx = (p.x - q.x) * 0.985, vy = (p.y - q.y) * 0.985, vz = (p.z - q.z) * 0.985;
        q.copy(p);
        p.x += vx - (acc ? acc.x : 0) * h * h; p.y += vy + (-9.8 - (acc ? acc.y : 0)) * h * h; p.z += vz - (acc ? acc.z : 0) * h * h;
      }
      for (let it = 0; it < 10; it++) {
        for (let i = 0; i < N; i++) {
          const A = this.p[i], B = this.p[i + 1]; const d = this._v.subVectors(B, A); const L = d.length() || 1e-6;
          // mola do espiral: puxa quando esticado; trava quando as espiras se fecham (comprimento sólido ≈ 45% do repouso)
          let k = 0; if (L > l0) k = 0.22 * (L - l0) / L; else if (L < l0 * 0.45) k = 0.5 * (L - l0 * 0.45) / L; else k = 0.04 * (L - l0) / L;
          const wa = i === 0 ? 0 : 1, wb = i + 1 === N ? 0 : 1, ws = wa + wb; if (!ws) continue;
          d.multiplyScalar(k / ws); A.addScaledVector(d, wa); B.addScaledVector(d, -wb);
        }
        // rigidez à flexão (espiras resistem a dobrar): mantém i ↔ i+2 afastados
        for (let i = 0; i + 2 <= N; i++) {
          const A = this.p[i], C = this.p[i + 2]; const d = this._v.subVectors(C, A); const L = d.length() || 1e-6, m = l0 * 1.5;
          if (L < m) { const k = 0.08 * (L - m) / L, wa = i === 0 ? 0 : 1, wc = i + 2 === N ? 0 : 1, ws = wa + wc; if (!ws) continue; d.multiplyScalar(k / ws); A.addScaledVector(d, wa); C.addScaledVector(d, -wc); }
        }
        this.p[0].copy(a); this.p[N].copy(b);
      }
    }
    for (let i = 1; i < N; i++) e += this.p[i].distanceToSquared(this.q[i]);
    this.energy = e;
    this.build();
    return true;
  }
  build() {
    const { S, N, radial } = this; const curve = this.curve || (this.curve = new THREE.CatmullRomCurve3(this.p, false, 'centripetal'));
    curve.points = this.p;
    // espinha → hélice (parâmetro por nó: espiras se abrem onde o trecho estica)
    const T = this._t, Nn = this._n, B = this._b, c = new THREE.Vector3(), c2 = new THREE.Vector3();
    let first = true;
    for (let i = 0; i <= S; i++) {
      const u = i / S; curve.getPoint(u, c); curve.getPoint(Math.min(1, u + 1e-3), c2); if (u >= 1) { curve.getPoint(u - 1e-3, c2); c2.sub(c).negate().add(c); }
      T.subVectors(c2, c).normalize();
      if (first) { Nn.set(0, 1, 0); if (Math.abs(T.y) > 0.9) Nn.set(1, 0, 0); first = false; }
      Nn.addScaledVector(T, -Nn.dot(T)).normalize(); B.crossVectors(T, Nn);
      const w = THREE.MathUtils.smoothstep(u, 0.05, 0.11) * (1 - THREE.MathUtils.smoothstep(u, 0.8, 0.88));
      const th = u * this.turns * Math.PI * 2, r = this.coilR * w;
      this.helix[i].copy(c).addScaledVector(Nn, Math.cos(th) * r).addScaledVector(B, Math.sin(th) * r);
    }
    // tubo em volta da hélice (transporte paralelo)
    const t = new THREE.Vector3(), n = new THREE.Vector3(0, 1, 0), b = new THREE.Vector3(), v = new THREE.Vector3();
    const pos = this.pos, nor = this.nor, wr = this.wireR;
    for (let i = 0; i <= S; i++) {
      const p = this.helix[i]; const a = this.helix[Math.max(0, i - 1)], z = this.helix[Math.min(S, i + 1)];
      t.subVectors(z, a).normalize();
      if (i === 0 && Math.abs(t.y) > 0.9) n.set(1, 0, 0);
      n.addScaledVector(t, -n.dot(t)).normalize(); b.crossVectors(t, n);
      for (let j = 0; j < radial; j++) {
        const ang = (j / radial) * Math.PI * 2, cs = Math.cos(ang), sn = Math.sin(ang);
        v.set(n.x * cs + b.x * sn, n.y * cs + b.y * sn, n.z * cs + b.z * sn);
        const k = (i * radial + j) * 3;
        pos[k] = p.x + v.x * wr; pos[k + 1] = p.y + v.y * wr; pos[k + 2] = p.z + v.z * wr;
        nor[k] = v.x; nor[k + 1] = v.y; nor[k + 2] = v.z;
      }
    }
    const g = this.mesh.geometry; g.attributes.position.needsUpdate = true; g.attributes.normal.needsUpdate = true; g.computeBoundingSphere();
  }
}

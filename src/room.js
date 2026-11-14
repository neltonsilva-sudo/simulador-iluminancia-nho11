// SALA — arquitetura da sala modular (paredes de painéis sanduíche, teto de placas com perfis C galvanizados, porcelanato,
// janelas de correr com grade, porta, quadros A3, interruptor, eletroduto). Dono: SALA.
// API: buildRoom(stage, room) → { group, update(room) }  — reconstrói para qualquer L (4–20), W (3–15), H (2,4–4).
// Coordenadas (SPEC): origem no centro do piso; x=−W/2 parede das 4 janelas; z=−L/2 parede do quadro/interruptor;
// porta em x=+W/2 perto de z=+L/2.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as TX from './room_tex.js';
import { addBox, addPlane, wallFrame, buildWindow, buildDoor, buildSwitch, buildConduit, buildWhiteboard, addHole } from './room_parts.js';

const WALL_T = 0.075;          // espessura do painel sanduíche (profundidade do vão)
const WIN_W = 1.30, WIN_H = 0.95, WIN_HEAD = 2.20;  // janelas de correr (proporção da foto ref1) — verga a 2,06 m
const DOOR_W = 0.84, DOOR_H = 2.10;
const BAND = 1.45;            // altura da divisa de tom da parede (foto ref3)
const WB_W = 2.40, WB_H = 1.20, WB_BOTTOM = 0.90; // quadro branco (foto ref3)
const CH_D = 0.042;            // altura dos perfis C longitudinais (encostados no teto)
const BEAM_D = 0.075;          // altura das vigas C transversais (abaixo dos longitudinais)

function makeMaterials() {
  const w = TX.wallTextures(), c = TX.ceilingTextures(), f = TX.floorTextures(), g = TX.galvTextures();
  const M = {
    wall: new THREE.MeshPhysicalMaterial({ name: 'room.wall', color: 0xffffff, map: w.map, roughnessMap: w.roughnessMap, roughness: 1, normalMap: w.normalMap, normalScale: new THREE.Vector2(0.45, 0.45), vertexColors: true, clearcoat: 0.55, clearcoatRoughness: 0.15, metalness: 0 }),
    ceiling: new THREE.MeshPhysicalMaterial({ name: 'room.ceiling', color: 0xffffff, map: c.map, roughnessMap: c.roughnessMap, roughness: 1, normalMap: c.normalMap, normalScale: new THREE.Vector2(0.3, 0.3), vertexColors: true, clearcoat: 0.25, clearcoatRoughness: 0.28 }),
    floor: new THREE.MeshPhysicalMaterial({ name: 'room.floor', color: 0xffffff, map: f.map, roughnessMap: f.roughnessMap, roughness: 1, normalMap: f.normalMap, normalScale: new THREE.Vector2(0.45, 0.45), vertexColors: true, clearcoat: 0.5, clearcoatMap: f.maskMap, clearcoatRoughness: 0.06, clearcoatRoughnessMap: f.maskMap, specularIntensity: 0.75, specularIntensityMap: f.maskMap }),
    joint: new THREE.MeshStandardMaterial({ name: 'room.joint', color: 0xe4e5e2, map: TX.jointTexture(), roughness: 0.5 }),
    galv: new THREE.MeshStandardMaterial({ name: 'room.galv', color: 0xffffff, map: g.map, roughnessMap: g.roughnessMap, roughness: 1, normalMap: g.normalMap, normalScale: new THREE.Vector2(0.4, 0.4), metalness: 0.55 }),
    chDark: new THREE.MeshStandardMaterial({ name: 'room.chDark', color: 0x34373b, roughness: 0.7, metalness: 0.2 }),
    tjoint: new THREE.MeshStandardMaterial({ name: 'room.tjoint', color: 0x55595d, roughness: 0.55, metalness: 0.3 }),
    trim: new THREE.MeshStandardMaterial({ name: 'room.trim', color: 0x8c9094, roughness: 0.45, metalness: 0.35 }),
    cornice: new THREE.MeshStandardMaterial({ name: 'room.cornice', color: 0xa9adb0, roughness: 0.4, metalness: 0.45 }),
    postEdge: new THREE.MeshStandardMaterial({ name: 'room.postEdge', color: 0x9ea2a5, roughness: 0.5 }),
    exterior: new THREE.MeshBasicMaterial({ name: 'room.exterior', map: TX.exteriorTexture(), toneMapped: false, color: 0xe4ddd0 }),
    post: new THREE.MeshPhysicalMaterial({ name: 'room.post', color: 0xc8cbc8, roughness: 0.38, clearcoat: 0.2, clearcoatRoughness: 0.3 }),
    cap: new THREE.MeshStandardMaterial({ name: 'room.cap', color: 0x9a9ea1, roughness: 0.6 }),
    alu: new THREE.MeshStandardMaterial({ name: 'room.alu', color: 0xd9dcde, roughness: 0.32, metalness: 0.45, normalMap: g.normalMap, normalScale: new THREE.Vector2(0.15, 0.15) }),
    dark: new THREE.MeshStandardMaterial({ name: 'room.dark', color: 0x1d1f21, roughness: 0.6 }),
    glass: new THREE.MeshPhysicalMaterial({ name: 'room.glass', color: 0xf3ead6, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.30, depthWrite: false, specularIntensity: 1, envMapIntensity: 1.2 }),
    film: new THREE.MeshStandardMaterial({ name: 'room.film', color: 0xffffff, map: TX.filmTexture(), roughness: 0.75, emissive: 0xfff1d6, emissiveMap: TX.filmTexture(), emissiveIntensity: 0.10 }),
    grille: new THREE.MeshStandardMaterial({ name: 'room.grille', color: 0xd7ccb0, roughness: 0.62 }),
    night: new THREE.MeshBasicMaterial({ name: 'room.night', map: TX.nightTexture() }),
    door: new THREE.MeshPhysicalMaterial({ name: 'room.door', color: 0xe3e4e1, roughness: 0.42, clearcoat: 0.25, clearcoatRoughness: 0.3, normalMap: w.normalMap, normalScale: new THREE.Vector2(0.2, 0.2) }),
    doorGroove: new THREE.MeshStandardMaterial({ name: 'room.doorGroove', color: 0xc9cac7, roughness: 0.5 }),
    chrome: new THREE.MeshStandardMaterial({ name: 'room.chrome', color: 0xd6d8da, roughness: 0.16, metalness: 1 }),
    pframe: new THREE.MeshStandardMaterial({ name: 'room.pframe', color: 0x1c2f86, roughness: 0.35, metalness: 0.1 }),
    pback: new THREE.MeshStandardMaterial({ name: 'room.pback', color: 0xf2f2f0, roughness: 0.6 }),
    switch: new THREE.MeshStandardMaterial({ name: 'room.switch', color: 0x26282b, roughness: 0.42 }),
    switchKey: new THREE.MeshStandardMaterial({ name: 'room.switchKey', color: 0x1a1b1d, roughness: 0.3 }),
    conduit: new THREE.MeshStandardMaterial({ name: 'room.conduit', color: 0x141516, roughness: 0.5 }),
    pvc: new THREE.MeshStandardMaterial({ name: 'room.pvc', color: 0xe9ebe7, roughness: 0.5 }),
  };
  M.wall.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n#ifdef USE_COLOR_ALPHA\n roughnessFactor = clamp(roughnessFactor * vColor.a, 0.04, 1.0);\n#endif'); };
  M.wall.customProgramCacheKey = () => 'room.wall.rA';
  // vista pelas janelas (noite / nublado / ensolarado) — sem luzes; valores em unidades pós-exposição (÷ exposição do RENDER)
  const extMat = (tN, gN) => new THREE.ShaderMaterial({
    name: 'room.exteriorView',
    uniforms: { tN: { value: tN }, tC: { value: TX.exteriorCloudTexture() }, tS: { value: TX.exteriorSunTexture() }, w: { value: new THREE.Vector3(1, 0, 0) }, g: { value: new THREE.Vector3(gN, 1.25, 1.6) }, invExp: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tN, tC, tS; uniform vec3 w, g; uniform float invExp; varying vec2 vUv;
      void main(){ vec3 c = texture2D(tN, vUv).rgb * (w.x * g.x) + texture2D(tC, vUv).rgb * (w.y * g.y) + texture2D(tS, vUv).rgb * (w.z * g.z);
        gl_FragColor = vec4(c * invExp, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  M.extL = extMat(TX.exteriorTexture(), 0.16); // parede x=−W/2 (porta): dá para o CORREDOR — sem sol, luz difusa menor
  M.extL.uniforms.g.value.y = 0.55; M.extL.uniforms.g.value.z = 0.6;
  M.extR = extMat(TX.nightTexture(), 1.0);     // parede x=+W/2: exterior, lado do sol
  M.filmL = M.film.clone(); M.filmL.name = 'room.filmL'; M.filmR = M.film.clone(); M.filmR.name = 'room.filmR';
  { const wb = TX.whiteboardTextures();
    M.wbSurf = new THREE.MeshPhysicalMaterial({ name: 'room.wbSurf', color: 0xffffff, map: wb.map, roughnessMap: wb.roughnessMap, roughness: 1, clearcoat: 1, clearcoatRoughness: 0.085, specularIntensity: 1, envMapIntensity: 1.2 });
    M.wbBack = new THREE.MeshStandardMaterial({ name: 'room.wbBack', color: 0x8d8f90, roughness: 0.7 });
    M.wbFrame = new THREE.MeshStandardMaterial({ name: 'room.wbFrame', color: 0xc6c9cc, roughness: 0.34, metalness: 0.6, normalMap: g.normalMap, normalScale: new THREE.Vector2(0.08, 0.08) });
    M.wbLip = new THREE.MeshStandardMaterial({ name: 'room.wbLip', color: 0x8e9295, roughness: 0.4, metalness: 0.5 });
    M.wbCorner = new THREE.MeshStandardMaterial({ name: 'room.wbCorner', color: 0x7d8083, roughness: 0.55 });
    M.wbMagnet = new THREE.MeshStandardMaterial({ name: 'room.wbMagnet', color: 0x2b5fd0, roughness: 0.35 });
    M.wbShadow = new THREE.MeshBasicMaterial({ name: 'room.wbShadow', color: 0x000000, alphaMap: TX.softShadowTexture(), transparent: true, opacity: 0.45, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
    M.hole = new THREE.MeshStandardMaterial({ name: 'room.hole', color: 0x2a2b2c, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 }); }
  // (cartazes A3 removidos a pedido do usuário)
  return M;
}

// ---------- ruído/hash determinísticos para variações por vértice ----------
const hash1 = (n) => { let h = Math.imul(n | 0, 2654435761) ^ 0x9e3779b9; h = Math.imul(h ^ (h >>> 15), 2246822519); return ((h ^ (h >>> 13)) >>> 0) / 4294967296; };
function vn2(x, y, s) { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const h = (a, b) => hash1(a * 73856093 ^ b * 19349663 ^ s * 83492791);
  const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1); return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy; }

const uniq = (arr, lo, hi) => { const s = arr.filter((x) => x >= lo - 1e-6 && x <= hi + 1e-6).map((x) => Math.min(hi, Math.max(lo, x))).sort((a, b) => a - b); const o = []; for (const x of s) if (!o.length || x - o[o.length - 1] > 1e-4) o.push(x); return o; };
function steps(len, step) { const n = Math.max(1, Math.ceil(len / step)); return Array.from({ length: n + 1 }, (_, i) => (len * i) / n); }

/** Superfície em grade (sem índice compartilhado entre células) com cor por vértice (AO/sujeira/variação por painel).
 * p = o + ud·u + vd·v ; normal = ud × vd. holes: [{u0,u1,v0,v1}] — células dentro são omitidas. */
function gridSurface({ o, ud, vd, us, vs, holes = [], color, uvOff = [0, 0], uvSign = [1, 1], cs = 3 }) {
  const n = new THREE.Vector3(...ud).cross(new THREE.Vector3(...vd)).normalize();
  const pos = [], nor = [], uv = [], col = [], idx = []; let vi = 0;
  for (let i = 0; i < us.length - 1; i++) for (let j = 0; j < vs.length - 1; j++) {
    const u0 = us[i], u1 = us[i + 1], v0 = vs[j], v1 = vs[j + 1], uc = (u0 + u1) / 2, vc = (v0 + v1) / 2;
    if (holes.some((h) => uc > h.u0 && uc < h.u1 && vc > h.v0 && vc < h.v1)) continue;
    for (const [u, v] of [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]) {
      pos.push(o[0] + ud[0] * u + vd[0] * v, o[1] + ud[1] * u + vd[1] * v, o[2] + ud[2] * u + vd[2] * v);
      nor.push(n.x, n.y, n.z); uv.push(uvOff[0] + uvSign[0] * u, uvOff[1] + uvSign[1] * v);
      const c = color(u, v, uc, vc); for (let q = 0; q < cs; q++) col.push(c[q] ?? 1);
    }
    idx.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3); vi += 4;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, cs)); g.setIndex(idx);
  return g;
}
/** quadrilátero com cor constante (para os vãos/requadros) — orienta o winding pela normal desejada */
function quadGeo(p0, p1, p2, p3, nrm, c, uvs) {
  const a = new THREE.Vector3(...p0), b = new THREE.Vector3(...p1), d = new THREE.Vector3(...p3);
  const flip = b.clone().sub(a).cross(d.clone().sub(a)).dot(new THREE.Vector3(...nrm)) < 0;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...p0, ...p1, ...p2, ...p3], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([...nrm, ...nrm, ...nrm, ...nrm], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute([...c, ...c, ...c, ...c], c.length));
  g.setIndex(flip ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]); return g;
}

// ---------- layout (croqui do usuário + pedido: porta no lugar da 1ª janela da parede esquerda) ----------
// Parede esquerda (x=−W/2): n janelas regulares; a mais próxima de z=−L/2 vira a PORTA. Parede direita (x=+W/2): n janelas.
function layoutOpenings(L) {
  const n = Math.max(1, Math.round(L / 2.29));
  const lo = -L / 2 + 0.12 + WIN_W / 2, hi = L / 2 - 0.10 - WIN_W / 2, cl = (z) => Math.min(hi, Math.max(lo, z));
  // parede da porta (esquerda, corredor), a partir da parede do quadro: 1 janela, a porta e mais n−1 janelas.
  // Redimensiona: folgas iguais; se não couber, estreita as janelas (mín. 0,60 m).
  const m = 0.30, nw = n, minGap = 0.35;
  let winL = WIN_W, gap = (L - 2 * m - nw * winL - DOOR_W) / nw;
  if (gap < minGap) { winL = Math.max(0.6, (L - 2 * m - DOOR_W - nw * minGap) / nw); gap = Math.max(0.1, (L - 2 * m - nw * winL - DOOR_W) / nw); }
  const zl = []; let doorC = 0, z = -L / 2 + m;
  for (let i = 0; i <= nw; i++) {
    if (i === 1) { doorC = z + DOOR_W / 2; z += DOOR_W + gap; continue; }
    zl.push(z + winL / 2); z += winL + gap;
  }
  const zr = [];
  for (let i = 0; i < n; i++) { const z = cl(-L / 2 + (i + 0.5) * (L / n) + 0.33 * Math.min(1, L / 9.16)); if (!zr.some((q) => Math.abs(q - z) < WIN_W + 0.2)) zr.push(z); }
  return { zl, zr, doorC, winL };
}
const vertical = (H) => { const head = Math.min(WIN_HEAD, H - 0.25); return { head, sill: Math.min(WIN_HEAD - WIN_H, head - 0.6), doorH: Math.min(DOOR_H, H - 0.12) }; };

/** Função pura (SPEC: origem no centro do piso, metros). Aberturas da sala para FOTOMETRIA / croqui da UI.
 * → [{kind:'window'|'door', wall:'left'|'right'|'front'|'back', x, z, width, sill, head}] (x,z = centro do vão no plano da parede) */
export function getOpenings(room) {
  const L = +room.L, W = +room.W, H = +room.H; const { zl, zr, doorC, winL } = layoutOpenings(L); const v = vertical(H);
  return [
    { kind: 'door', wall: 'left', x: -W / 2, z: doorC, width: DOOR_W, sill: 0, head: v.doorH },
    ...zl.map((z) => ({ kind: 'window', wall: 'left', x: -W / 2, z, width: winL, sill: v.sill, head: v.head })),
    ...zr.map((z) => ({ kind: 'window', wall: 'right', x: W / 2, z, width: WIN_W, sill: v.sill, head: v.head })),
  ];
}

export function buildRoom(stage, room) {
  try { TX.setAnisotropy(stage.renderer.capabilities.getMaxAnisotropy()); } catch {}
  const group = new THREE.Group(); group.name = 'room'; stage.scene.add(group);
  const M = makeMaterials();
  try { stage.floorReflection?.apply?.(M.floor, { strength: 1.0 }); } catch (e) { console.warn('[room] floorReflection', e); }
  let wallGroups = [], ceilStruct = null, curH = room.H, outside = [];

  // visibilidade “casa de bonecas”: anexos de uma parede somem quando a câmera está do lado de fora dela;
  // estrutura do teto some quando a câmera está acima do teto (planta / vistas aéreas).
  // ---- luz natural vista pelas janelas: lê __sim.state.avaliacao {periodo, ceu}; transição suave ----
  const DAY = { noturno: { w: [1, 0, 0], glassOp: 0.42, glassCol: 0x1c2026, filmL: 0.03, filmR: 0.03 },
    nublado: { w: [0, 1, 0], glassOp: 0.12, glassCol: 0xf4f6f7, filmL: 0.40, filmR: 0.85 },
    ensolarado: { w: [0, 0, 1], glassOp: 0.10, glassCol: 0xffffff, filmL: 0.50, filmR: 1.45 } };
  const dl = { key: null, cur: null, tgt: null };
  const condOf = (a) => (a?.periodo === 'diurno' ? (a.ceu === 'ensolarado' ? 'ensolarado' : 'nublado') : 'noturno');
  const vecOf = (c) => { const d = DAY[c], col = new THREE.Color(d.glassCol); return [...d.w, d.glassOp, col.r, col.g, col.b, d.filmL, d.filmR]; };
  function setDaylight(a, instant) { const k = condOf(a); if (k === dl.key && !instant) return; dl.key = k; dl.tgt = vecOf(k); if (instant || !dl.cur) dl.cur = dl.tgt.slice(); }
  try { window.__sim?.on?.('daylight', (a) => setDaylight(a || window.__sim?.state?.avaliacao)); } catch {}
  setDaylight(window.__sim?.state?.avaliacao, true);
  const _gc = new THREE.Color();
  function applyDaylight(dt) {
    setDaylight(window.__sim?.state?.avaliacao, false);
    const k = 1 - Math.exp(-(dt || 0.016) * 2.2);
    for (let i = 0; i < dl.cur.length; i++) dl.cur[i] += (dl.tgt[i] - dl.cur[i]) * k;
    const c = dl.cur, inv = 1 / Math.max(1e-6, stage.exposure || 1);
    for (const m of [M.extL, M.extR]) { m.uniforms.w.value.set(c[0], c[1], c[2]); m.uniforms.invExp.value = inv; }
    M.glass.opacity = c[3]; M.glass.color.setRGB(c[4], c[5], c[6]);
    // película: emissão difusa (luz do dia atravessando) em unidades pós-exposição, abaixo do limiar do bloom
    M.filmL.emissiveIntensity = Math.max(0.0, c[7]) * inv * 0.9; M.filmR.emissiveIntensity = Math.max(0.0, c[8]) * inv * 0.9;
    _gc.set(0xfff1d6); M.filmL.emissive.copy(_gc); M.filmR.emissive.copy(_gc);
  }
  stage.onFrame?.((dt) => {
    try { applyDaylight(dt); } catch (e) { /* estado ainda não disponível */ }
    const cp = stage.camera.position;
    for (const wg of wallGroups) { const { o, n } = wg.userData; wg.visible = (cp.x - o[0]) * n[0] + (cp.z - o[2]) * n[2] > -0.02; }
    if (ceilStruct) ceilStruct.visible = cp.y < curH - 0.01;
    const inside = cp.y < curH - 0.01; for (const m of outside) m.visible = inside; // fundos externos só de dentro da sala
  });

  function emit(target, col, opts = {}) {
    for (const k in col) {
      const gs = col[k]; if (!gs.length) continue; const mat = M[k]; if (!mat) { console.warn('[room] material?', k); continue; }
      const keep = ['position', 'normal', 'uv', 'color'].filter((a) => gs.every((g) => g.attributes[a]));
      const list = gs.map((g) => { for (const a of Object.keys(g.attributes)) if (!keep.includes(a)) g.deleteAttribute(a); return g.index ? g : g.setIndex([...Array(g.attributes.position.count).keys()]); });
      const merged = mergeGeometries(list, false); gs.forEach((g) => g.dispose());
      if (!merged) { console.warn('[room] merge falhou', k); continue; }
      const mesh = new THREE.Mesh(merged, mat); mesh.name = 'room.' + k;
      mesh.receiveShadow = opts.receive ?? true; mesh.castShadow = (opts.cast ?? false) && !mat.transparent && k !== 'night';
      if (k === 'glass') mesh.renderOrder = 2;
      if (k === 'extL' || k === 'extR' || k === 'night') { mesh.userData.noReflect = false; outside.push(mesh); }
      target.add(mesh);
    }
  }

  function clear() {
    group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    group.clear(); wallGroups = []; ceilStruct = null; outside = [];
  }

  function build(r) {
    const L = +r.L, W = +r.W, H = +r.H; curH = H;
    const up = [0, 1, 0];
    const walls = [
      { id: 'front', o: [-W / 2, 0, -L / 2], ud: [1, 0, 0], len: W, seed: 1, uvo: 0.0 },
      { id: 'right', o: [W / 2, 0, -L / 2], ud: [0, 0, 1], len: L, seed: 2, uvo: 0.71 },
      { id: 'back', o: [W / 2, 0, L / 2], ud: [-1, 0, 0], len: W, seed: 3, uvo: 1.37 },
      { id: 'left', o: [-W / 2, 0, L / 2], ud: [0, 0, -1], len: L, seed: 4, uvo: 0.29 },
    ];
    // n = ud × up = (ud.y*0 - ud.z*1, ud.z*0 - ud.x*0, ud.x*1 - ud.y*0) = (-ud.z, 0, ud.x)
    for (const w of walls) w.n = [-w.ud[2], 0, w.ud[0]];
    const W_ = Object.fromEntries(walls.map((w) => [w.id, w]));

    // ---- aberturas ----
    const { zl, zr, doorC, winL } = layoutOpenings(L);
    const vv = vertical(H), winV = [vv.sill, vv.head];
    W_.left.holes = zl.map((z) => { const u = L / 2 - z; return { u0: u - winL / 2, u1: u + winL / 2, v0: winV[0], v1: winV[1], kind: 'win', film: true, side: 'L' }; });
    W_.right.holes = zr.map((z) => { const u = z + L / 2; return { u0: u - WIN_W / 2, u1: u + WIN_W / 2, v0: winV[0], v1: winV[1], kind: 'win', film: true, side: 'R' }; });
    const dh = vv.doorH, ud0 = L / 2 - doorC; // parede esquerda: u = L/2 − z
    W_.left.holes.push({ u0: ud0 - DOOR_W / 2, u1: ud0 + DOOR_W / 2, v0: 0, v1: dh, kind: 'door' });
    W_.front.holes = []; W_.back.holes = [];

    // ---- paredes (grade com AO/sujeira por vértice) ----
    for (const w of walls) {
      const wg = new THREE.Group(); wg.name = 'room.wall.' + w.id; wg.userData = { o: w.o, n: w.n }; group.add(wg); wallGroups.push(wg);
      const mod = w.len / Math.max(1, Math.round(w.len / (w.id === 'front' || w.id === 'back' ? 1.18 : 1.145)));
      w.mod = mod;
      const extraU = [0.015, 0.05, 0.12, 0.25, w.len - 0.015, w.len - 0.05, w.len - 0.12, w.len - 0.25];
      for (let k = 1; k * mod < w.len - 0.01; k++) extraU.push(k * mod);
      for (const h of w.holes) extraU.push(h.u0, h.u1, h.u0 - 0.06, h.u1 + 0.06);
      const us = uniq([...steps(w.len, 0.3), ...extraU], 0, w.len);
      const extraV = [0.015, 0.04, 0.08, 0.14, 0.22, 0.32, 0.45, BAND - 0.006, BAND + 0.006, H - 0.015, H - 0.04, H - 0.09, H - 0.17, H - 0.3];
      for (const h of w.holes) extraV.push(h.v0, h.v1, h.v1 + 0.05, h.v0 - 0.05);
      const vs = uniq([...steps(H, 0.35), ...extraV], 0, H);
      const pv = (p) => 1 + (hash1(p * 7 + w.seed * 131) - 0.5) * 0.08;
      const pr = (p) => 0.78 + hash1(p * 11 + w.seed * 57) * 0.5; // rugosidade relativa por painel (canal alfa)
      const color = (u, v, uc) => {
        const pnl = Math.floor(uc / mod);
        const du = Math.min(u, w.len - u), dc = H - v;
        let a = (1 - 0.20 * Math.exp(-v / 0.06) - 0.07 * Math.exp(-v / 0.45)) * (1 - 0.10 * Math.exp(-dc / 0.07) - 0.04 * Math.exp(-dc / 0.5)) * (1 - 0.12 * Math.exp(-du / 0.08) - 0.05 * Math.exp(-du / 0.5));
        // sombra suave sob a verga e ao redor dos vãos
        for (const h of w.holes) { const dx = Math.max(h.u0 - u, 0, u - h.u1), dy = Math.max(h.v0 - v, 0, v - h.v1); const d = Math.hypot(dx, dy); a *= 1 - 0.05 * Math.exp(-d / 0.05); }
        a *= pv(pnl) * (1 + (vn2(u * 0.8, v * 0.8, w.seed) - 0.5) * 0.035) * (1 - 0.025 * Math.abs(((uc % mod) / mod) - 0.5) * 2);
        a *= v < BAND ? 0.945 : 1.0; // faixa inferior levemente mais acinzentada/suja (2 tons, como na foto do quadro)
        const dirt = Math.exp(-v / 0.12) * 0.06 + Math.max(0, 1 - v / 0.4) ** 2 * 0.05 * (0.5 + vn2(u * 3.1, 7.7, w.seed + 40));
        return [a * (1 - dirt * 0.6), a * (1 - dirt * 0.8) * (v < BAND ? 0.997 : 1), a * (1 - dirt) * (v < BAND ? 0.99 : 1), pr(pnl) * (1 + Math.max(0, 1 - v / 0.4) * 0.25)];
      };
      const col = {};
      const surf = gridSurface({ o: w.o, ud: w.ud, vd: up, us, vs, holes: w.holes, color, uvOff: [w.uvo, 0], cs: 4 });
      (col.wall ||= []).push(surf);
      // requadros dos vãos (espessura do painel)
      for (const h of w.holes) {
        const P = (u, v, d) => [w.o[0] + w.ud[0] * u + w.n[0] * d, v, w.o[2] + w.ud[2] * u + w.n[2] * d];
        const c = [0.86, 0.86, 0.86, 1], t = -WALL_T;
        const tw = h.u1 - h.u0, th = h.v1 - h.v0;
        col.wall.push(quadGeo(P(h.u0, h.v1, 0), P(h.u1, h.v1, 0), P(h.u1, h.v1, t), P(h.u0, h.v1, t), [0, -1, 0], [0.8, 0.8, 0.8, 1], [0, 0, tw, 0, tw, WALL_T, 0, WALL_T]));
        if (h.v0 > 0.01) col.wall.push(quadGeo(P(h.u0, h.v0, 0), P(h.u1, h.v0, 0), P(h.u1, h.v0, t), P(h.u0, h.v0, t), [0, 1, 0], c, [0, 0, tw, 0, tw, WALL_T, 0, WALL_T]));
        col.wall.push(quadGeo(P(h.u0, h.v0, 0), P(h.u0, h.v1, 0), P(h.u0, h.v1, t), P(h.u0, h.v0, t), w.ud, c, [0, 0, th, 0, th, WALL_T, 0, WALL_T]));
        col.wall.push(quadGeo(P(h.u1, h.v0, 0), P(h.u1, h.v1, 0), P(h.u1, h.v1, t), P(h.u1, h.v0, t), w.ud.map((x) => -x), c, [0, 0, th, 0, th, WALL_T, 0, WALL_T]));
        const hc = (h.u0 + h.u1) / 2, vc = (h.v0 + h.v1) / 2;
        if (h.kind === 'win') {
          buildWindow(col, wallFrame(w, hc, vc, 0), tw, th, { film: h.film, t: WALL_T, side: h.side });
          // pingadeira/arremate de alumínio sob a janela e na verga (lado interno)
          addBox(col, 'alu', tw + 0.03, 0.012, 0.008, hc, h.v0 - 0.006, 0.004, wallFrame(w, 0, 0, 0));
          addBox(col, 'alu', tw + 0.03, 0.012, 0.008, hc, h.v1 + 0.006, 0.004, wallFrame(w, 0, 0, 0));
          addBox(col, 'alu', 0.012, th, 0.008, h.u0 - 0.006, vc, 0.004, wallFrame(w, 0, 0, 0));
          addBox(col, 'alu', 0.012, th, 0.008, h.u1 + 0.006, vc, 0.004, wallFrame(w, 0, 0, 0));
        } else buildDoor(col, wallFrame(w, hc, vc, 0), tw, th, { t: WALL_T, hingeRight: true });
      }
      // juntas verticais entre painéis (interrompidas nos vãos)
      for (let k = 1; k * mod < w.len - 0.05; k++) {
        const u = k * mod; let segs = [[0.055, H - 0.035]];
        for (const h of w.holes) if (u > h.u0 - 0.03 && u < h.u1 + 0.03) segs = segs.flatMap(([a, b]) => [[a, Math.min(b, h.v0 - 0.02)], [Math.max(a, h.v1 + 0.025), b]]).filter(([a, b]) => b - a > 0.02);
        for (const [a, b] of segs) { const g = addPlane(col, 'joint', 0.014, b - a, u, (a + b) / 2, 0.0012, wallFrame(w, 0, 0, 0)); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * (b - a)); }
      }
      // rodapé (perfil inferior cinza) — interrompido na porta
      let rs = [[0, w.len]]; for (const h of w.holes) if (h.v0 < 0.1) rs = rs.flatMap(([a, b]) => [[a, Math.min(b, h.u0 - 0.05)], [Math.max(a, h.u1 + 0.05), b]]).filter(([a, b]) => b - a > 0.02);
      for (const [a, b] of rs) { addBox(col, 'trim', b - a, 0.055, 0.012, (a + b) / 2, 0.0275, 0.006, wallFrame(w, 0, 0, 0)); addBox(col, 'trim', b - a, 0.004, 0.018, (a + b) / 2, 0.053, 0.009, wallFrame(w, 0, 0, 0)); }
      // cantoneira superior (parede-teto) — perfil L cinza claro
      addBox(col, 'cornice', w.len, 0.032, 0.003, w.len / 2, H - 0.016, 0.0015, wallFrame(w, 0, 0, 0));
      addBox(col, 'cornice', w.len, 0.003, 0.032, w.len / 2, H - 0.0015, 0.016, wallFrame(w, 0, 0, 0));
      // perfil de canto (montante) — no início de cada parede (os 4 cantos)
      // montante de canto saliente (perfil 0,09 × 0,03 m) nos dois lados de cada canto
      for (const uu of [0.045, w.len - 0.045]) {
        addBox(col, 'post', 0.09, H - 0.035, 0.03, uu, (H - 0.035) / 2, 0.015, wallFrame(w, 0, 0, 0));
        addBox(col, 'postEdge', 0.004, H - 0.035, 0.032, uu + (uu < 1 ? 0.045 : -0.045), (H - 0.035) / 2, 0.016, wallFrame(w, 0, 0, 0));
      }
      // topo da parede (visível só de cima)
      addBox(col, 'cap', w.len + 2 * WALL_T, 0.03, WALL_T, w.len / 2, H + 0.015, -WALL_T / 2, wallFrame(w, 0, 0, 0));
      decorate(w, col, { L, W, H, zl, zr, doorC, winL });
      emit(wg, col, { receive: true, cast: false });
    }

    // ---- piso ----
    {
      const us = uniq([...steps(W, 0.3), 0.02, 0.06, 0.14, W - 0.02, W - 0.06, W - 0.14], 0, W);
      const vs = uniq([...steps(L, 0.3), 0.02, 0.06, 0.14, L - 0.02, L - 0.06, L - 0.14], 0, L);
      const color = (u, v) => {
        const d = Math.min(u, W - u, v, L - v);
        let a = (1 - 0.22 * Math.exp(-d / 0.05) - 0.08 * Math.exp(-d / 0.4));
        a *= 1 + (vn2(u * 0.55, v * 0.55, 9) - 0.5) * 0.06 + (vn2(u * 2.1, v * 2.1, 10) - 0.5) * 0.025;
        return [a, a, a * 0.995];
      };
      // ud=+x, vd=−z (normal +y); u = x+W/2, v = L/2−z. Desloca UV p/ juntas alinhadas à parede de fundo (z=−L/2).
      const g = gridSurface({ o: [-W / 2, 0, L / 2], ud: [1, 0, 0], vd: [0, 0, -1], us, vs, color, uvOff: [-((W / 2) % 0.6), -(L % 0.6)] });
      const m = new THREE.Mesh(g, M.floor); m.name = 'room.floor'; m.receiveShadow = true; group.add(m);
    }

    // ---- teto (placas) ----
    const nStrip = Math.max(2, Math.round(W / 0.74)), sw = W / nStrip;
    const xsAll = Array.from({ length: nStrip - 1 }, (_, j) => -W / 2 + (j + 1) * sw);
    const xs = xsAll.filter((_, j) => j % 2 === 0), xj = xsAll.filter((_, j) => j % 2 === 1); // C galvanizados | juntas escuras
    {
      const us = uniq([...steps(W, 0.3), ...xsAll.map((x) => x + W / 2), 0.03, 0.1, 0.25, W - 0.03, W - 0.1, W - 0.25], 0, W);
      const vs = uniq([...steps(L, 0.3), 0.03, 0.1, 0.25, L - 0.03, L - 0.1, L - 0.25], 0, L);
      const color = (u, v, uc) => {
        const d = Math.min(u, W - u, v, L - v), s = Math.floor(uc / sw);
        let a = (1 - 0.12 * Math.exp(-d / 0.06) - 0.05 * Math.exp(-d / 0.5)) * (1 + (hash1(s * 13 + 5) - 0.5) * 0.035);
        a *= 1 + (vn2(u * 0.7, v * 0.7, 21) - 0.5) * 0.025;
        return [a, a, a];
      };
      const g = gridSurface({ o: [-W / 2, H, -L / 2], ud: [1, 0, 0], vd: [0, 0, 1], us, vs, color, uvOff: [0.37, 0.11] });
      const m = new THREE.Mesh(g, M.ceiling); m.name = 'room.ceiling'; m.receiveShadow = true; group.add(m);
    }

    // ---- estrutura aparente do teto: perfis C longitudinais (juntas), vigas C transversais, juntas transversais ----
    {
      ceilStruct = new THREE.Group(); ceilStruct.name = 'room.ceilingStructure'; group.add(ceilStruct);
      const col = {};
      const bw = 0.088, lip = 0.022, th = 0.0025;
      for (const x of xs) {
        addBox(col, 'galv', th, CH_D, L, x - bw / 2, H - CH_D / 2, 0);
        addBox(col, 'galv', th, CH_D, L, x + bw / 2, H - CH_D / 2, 0);
        addBox(col, 'galv', lip, th, L, x - bw / 2 + lip / 2, H - CH_D + th / 2, 0);
        addBox(col, 'galv', lip, th, L, x + bw / 2 - lip / 2, H - CH_D + th / 2, 0);
        addBox(col, 'chDark', bw - 0.004, 0.003, L, x, H - 0.0035, 0);  // alma (fundo do C) em sombra + fresta entre placas
      }
      for (const x of xj) { // junta longitudinal entre placas: perfil T escuro raso
        addBox(col, 'tjoint', 0.040, 0.012, L, x, H - 0.006, 0);
        addBox(col, 'chDark', 0.016, 0.002, L, x, H - 0.0125, 0);
      }
      // vigas transversais (abaixo dos perfis longitudinais), afastadas das fileiras de luminárias
      const nT = Math.max(2, Math.round(L / 2.29)), st = L / nT;
      let lumZ = [];
      try { lumZ = (window.__sim?.luminaires?.() || []).filter((l) => l.axis === 'x').map((l) => l.z); } catch {}
      const yb = H - CH_D - BEAM_D;
      for (let k = 1; k < nT; k++) {
        let z = -L / 2 + k * st;
        for (const lz of lumZ) if (Math.abs(z - lz) < 0.2) z = lz + (z >= lz ? 0.26 : -0.26);
        const bwT = 0.10, len = W - 0.004;
        addBox(col, 'galv', len, th, bwT, 0, yb + th / 2, z);                          // mesa inferior (vista de baixo)
        addBox(col, 'galv', len, BEAM_D, th, 0, yb + BEAM_D / 2, z - bwT / 2);          // almas laterais
        addBox(col, 'galv', len, BEAM_D, th, 0, yb + BEAM_D / 2, z + bwT / 2);
        addBox(col, 'galv', len, th, 0.018, 0, yb + BEAM_D - th / 2, z - bwT / 2 + 0.009); // enrijecedores
        addBox(col, 'galv', len, th, 0.018, 0, yb + BEAM_D - th / 2, z + bwT / 2 - 0.009);
        // presilhas de fixação nos perfis longitudinais
        for (const x of xs) { addBox(col, 'galv', 0.05, CH_D + 0.01, 0.004, x, H - (CH_D + 0.01) / 2 - 0.004, z - bwT / 2 - 0.004); addBox(col, 'galv', 0.05, CH_D + 0.01, 0.004, x, H - (CH_D + 0.01) / 2 - 0.004, z + bwT / 2 + 0.004); }
        // apoio nas paredes laterais (cantoneira)
        for (const sx of [-1, 1]) addBox(col, 'galv', 0.004, BEAM_D + CH_D, 0.14, sx * (W / 2 - 0.004), H - (BEAM_D + CH_D) / 2, z);
      }
      // juntas transversais entre placas (rasas, cinza-escuro)
      for (let k = 0; k < nT; k++) { const z = -L / 2 + (k + 0.5) * st; addBox(col, 'tjoint', W - 0.01, 0.006, 0.028, 0, H - 0.003, z); }
      emit(ceilStruct, col, { receive: true, cast: true });
    }

    // ---- eletroduto flexível e caixa de passagem (canto parede esquerda × parede do quadro) ----
    {
      const wg = wallGroups.find((g) => g.name === 'room.wall.left'); const col = {};
      const bx = -W / 2, bz = -L / 2 + 0.5, by = Math.min(2.42, H - 0.3);
      addBox(col, 'pvc', 0.05, 0.10, 0.10, bx + 0.025, by, bz);
      addBox(col, 'pvc', 0.006, 0.084, 0.084, bx + 0.053, by, bz);
      buildConduit(col, [[bx + 0.03, by + 0.05, bz], [bx + 0.035, by + 0.12, bz - 0.03], [bx + 0.06, H - 0.12, bz - 0.16], [bx + 0.08, H - 0.05, bz - 0.30], [bx + 0.10, H - 0.025, bz - 0.42]]);
      buildConduit(col, [[bx + 0.03, by + 0.05, bz + 0.03], [bx + 0.04, by + 0.15, bz + 0.05], [bx + 0.05, H - 0.07, bz + 0.12], [bx + 0.045, H - 0.03, bz + 0.45], [bx + 0.05, H - 0.03, bz + 1.2]], 0.010);
      emit(wg, col, { receive: true, cast: false });
    }
  }

  // ---- quadros, interruptor, sensores (posições tiradas da foto ref1, em frações do comprimento da parede) ----
  function decorate(w, col, { L, W, H, zl, zr, doorC, winL = WIN_W }) {
    const F = (u, v) => wallFrame(w, u, v, 0);
    const holes = (pts) => pts.forEach(([u, v]) => { if (v > 0.2 && v < H - 0.1 && u > 0.1 && u < w.len - 0.1) addHole(col, F(0, 0), u, v); });
    if (w.id === 'front') {
      // quadro branco centralizado (largura limitada em salas estreitas), borda inferior a 0,90 m
      const bw = Math.min(WB_W, W - 1.1), bh = Math.min(WB_H, H - WB_BOTTOM - 0.35), uc = W / 2, vc = WB_BOTTOM + bh / 2;
      buildWhiteboard(col, F(uc, vc), bw, bh);
      // interruptor à esquerda do quadro (fora da moldura)
      const uSw = Math.max(0.2, Math.min(0.168 * W, uc - bw / 2 - 0.35));
      buildSwitch(col, F(uSw, Math.min(1.40, H - 0.5)));
      // furinhos de parafusos antigos (cartazes retirados) — poucos
      holes([[uc - bw / 2 - 0.18, vc + 0.75], [uc - bw / 2 + 0.55, vc + 0.68], [uc + 0.35, vc + 0.71], [uc + bw / 2 - 0.42, vc + 0.69], [uc + bw / 2 - 0.20, vc + 0.70],
        [uc + bw / 2 + 0.25, vc + 0.12], [uc - bw / 2 - 0.25, vc - 0.15], [0.124 * W - 0.15, 2.12], [0.124 * W + 0.15, 2.12], [0.893 * W - 0.15, 2.16]]);
    } else if (w.id === 'right') {
      addBox(col, 'switch', 0.06, 0.06, 0.03, 0.22, Math.min(2.0, H - 0.4), 0.015, F(0, 0)); // sensor/caixa escura perto do canto (foto)
      if (zr.length >= 2) { const u = (zr[0] + zr[1]) / 2 + L / 2; holes([[u - 0.15, 2.15], [u + 0.15, 2.15], [u + 0.14, 1.70]]); }
    } else if (w.id === 'left') {
      // interruptor junto à porta, no lado da maçaneta (para o fundo da sala, z maior → u menor)
      const uSw = L / 2 - doorC - DOOR_W / 2 - 0.22;
      const zN = zl.find((q) => q > doorC);
      if (zN === undefined || uSw > L / 2 - zN + winL / 2 + 0.06) buildSwitch(col, F(uSw, 1.15));
      if (zl.length >= 3) { const u = L / 2 - (zl[1] + zl[2]) / 2; holes([[u - 0.16, 2.14], [u + 0.16, 2.14]]); }
    } else if (w.id === 'back') {
      holes([[W * 0.62 - 0.15, 2.07], [W * 0.62 + 0.15, 2.07], [W * 0.62 - 0.15, 1.63]]);
    }
  }

  const api = { group, update(r) { clear(); build(r); } };
  api.update(room);
  return api;
}

// MOBILIÁRIO — carteiras universitárias (concha PP azul royal + prancheta), mesa e cadeira do professor. Dono: MOBILIÁRIO.
// API: buildFurniture(stage, room) → { group, update(room, lums), setVisible(b) }
// Desempenho: cada peça da carteira é UM InstancedMesh (≈ 8 draw calls para ~40 cadeiras).
import * as THREE from 'three';
import { chairSeatShell, chairBackShell, chairFrame, chairCaps, chairTablet, cushionSeat, cushionBack, teacherDesk, teacherChair } from './furniture_geo.js';
import { furnitureTextures } from './furniture_tex.js';

const MAX = 160;

function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function makeMaterials(renderer) {
  const T = furnitureTextures(renderer);
  // polipropileno azul royal injetado (acetinado, leve brilho especular)
  const pp = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#1a3cba'), map: T.ppColor, roughness: 1, roughnessMap: T.ppRough, normalMap: T.ppNormal, normalScale: new THREE.Vector2(0.18, 0.18),
    metalness: 0, specularIntensity: 0.55, ior: 1.49, sheen: 0.12, sheenRoughness: 0.6, sheenColor: new THREE.Color('#6f8cff'),
  });
  const ppBack = pp.clone(); ppBack.alphaMap = T.holeTex; ppBack.alphaTest = 0.5; ppBack.side = THREE.FrontSide;
  // aço tubular com pintura epóxi cinza-prata (metálico, anisotrópico ao longo do tubo)
  const steel = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#b0b4b8'), metalness: 0.05, roughness: 1, roughnessMap: T.mtRough, normalMap: T.mtNormal, normalScale: new THREE.Vector2(0.12, 0.12),
    clearcoat: 0.1, clearcoatRoughness: 0.4, // anisotropia testada (0,3–0,55) escurecia os tubos nas vistas laterais — estrias via roughnessMap
  });
  steel.envMapIntensity = steel.userData.envI = 2.4; // estrutura vertical recebe pouca luz direta (luminárias acima)
  const capMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#2b2d30'), roughness: 0.62, metalness: 0 });
  // prancheta: laminado melamínico bege-acinzentado + fita de borda PVC
  const formica = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: T.fmColor, roughness: 1, roughnessMap: T.fmRough, normalMap: T.fmNormal, normalScale: new THREE.Vector2(0.08, 0.08), specularIntensity: 0.6, clearcoat: 0.12, clearcoatRoughness: 0.4 });
  const edge = new THREE.MeshStandardMaterial({ color: new THREE.Color('#7a6650'), roughness: 0.5, metalness: 0 });
  // estofado: tecido poliéster azul-marinho
  const fabric = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#1f3c9e'), map: T.fbColor, normalMap: T.fbNormal, normalScale: new THREE.Vector2(0.45, 0.45), roughness: 0.95, sheen: 0.5, sheenRoughness: 0.6, sheenColor: new THREE.Color('#3f5fd0') });
  const fabricDark = fabric.clone(); fabricDark.color = new THREE.Color('#2a2c31'); fabricDark.sheenColor = new THREE.Color('#6a6d74');
  const blackSteel = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#26282b'), metalness: 0.3, roughness: 0.45, clearcoat: 0.3, clearcoatRoughness: 0.3 });
  const mdfPanel = new THREE.MeshStandardMaterial({ color: new THREE.Color('#b9b3a6'), roughness: 0.6 });
  return { pp, ppBack, steel, capMat, formica, edge, fabric, fabricDark, blackSteel, mdfPanel };
}

// ------------------------------------------------------------ disposição (determinística, semente fixa)
// Pedido do usuário: 40 carteiras = 4 filas (colunas ao longo de W) × 10 carteiras, voltadas para a parede da frente.
// Pegada de uma carteira (local): x −0,25…+0,33 (prancheta à direita); z −0,47 (frente da prancheta)…+0,27 (encosto/pés).
// Na altura da prancheta (0,735 m) a profundidade útil é 0,706 m: passo mínimo sem colisão = 0,706 + folga.
const FOOT = { l: 0.25, r: 0.33, f: 0.47, b: 0.27, tabDepth: 0.706 };
export const SEATING = { cols: 4, perCol: 10 };
function plan({ L, W }) {
  // laterais: 0,45 m na parede esquerda; 0,90 m na direita (faixa livre até a porta em x=+W/2, z≈+L/2−1,78)
  const xL = -W / 2 + 0.45 + FOOT.l, xR = W / 2 - 0.90 - FOOT.r;
  let nc = SEATING.cols; while (nc > 1 && (xR - xL) / (nc - 1) < 0.72) nc--;
  const px = nc > 1 ? Math.min(W / 4, (xR - xL) / (nc - 1)) : 0, x0 = nc > 1 ? (xL + xR) / 2 - px * (nc - 1) / 2 : (xL + xR) / 2;
  const cols = Array.from({ length: nc }, (_, k) => x0 + k * px);
  // longitudinal: área do professor T (frente da 1ª prancheta) e folga do fundo B; reduz de (1,5; 0,9) até (1,2; 0,5)
  const span = (T, B) => (L / 2 - B - FOOT.b) - (-L / 2 + T + FOOT.f);
  const n = SEATING.perCol, need = 0.85;
  let T = 1.5, B = 0.9;
  for (let i = 0; i <= 20 && span(T, B) / (n - 1) < need; i++) { T = 1.5 - 0.3 * i / 20; B = 0.9 - 0.4 * i / 20; }
  const pMin = FOOT.tabDepth + 0.035; // 3,5 cm de folga entre a prancheta e o encosto da carteira da frente
  let nr = n; while (nr > 1 && span(T, B) / (nr - 1) < pMin) nr--;
  const pz = nr > 1 ? Math.min(1.1, span(T, B) / (nr - 1)) : 0;
  const zFront = -L / 2 + T + FOOT.f;
  return { cols, px, rows: nr, pz, zFront, T, B, gap: pz - FOOT.tabDepth };
}
function deskSpot(room) { const { L, W } = room, { T } = plan(room); return { dx: Math.min(W / 2 - 1.0, Math.max(-W / 2 + 0.85, W * 0.25)), dz: -L / 2 + Math.max(0.85, T - 0.32) }; }
export function layoutChairs(room) {
  const { W } = room, rnd = mulberry(1109), P = plan(room);
  // folga disponível limita o jitter longitudinal e o giro (canto da prancheta a ~0,4 m do eixo)
  const zJit = Math.min(0.05, Math.max(0, (P.gap - 0.012) / 2)), maxTurn = Math.min(0.25, Math.max(0, (P.gap - 0.02) / 0.4));
  const baseRot = Math.min(0.052, maxTurn);
  const out = [];
  for (let r = 0; r < P.rows; r++) {
    for (let c = 0; c < P.cols.length; c++) {
      let x = P.cols[c] + (rnd() - 0.5) * 0.10, z = P.zFront + r * P.pz + (rnd() - 0.5) * 2 * zJit, ry = (rnd() - 0.5) * 2 * baseRot;
      if (rnd() < 0.05 && maxTurn > baseRot) ry = (rnd() < 0.5 ? -1 : 1) * (baseRot + rnd() * (maxTurn - baseRot)); // levemente virada
      x = Math.max(-W / 2 + 0.3, Math.min(W / 2 - 0.36, x));
      out.push({ x, z, ry, uph: false, tone: rnd(), col: c, row: r });
    }
  }
  // ~1 em 9 é a versão estofada (assento/encosto em tecido), sem repetir
  const k = Math.max(1, Math.round(out.length / 9)), idx = new Set();
  while (idx.size < Math.min(k, out.length)) idx.add(Math.floor(rnd() * out.length));
  for (const i of idx) out[i].uph = true;
  out.plan = P;
  return out;
}

export function buildFurniture(stage, room) {
  const group = new THREE.Group(); group.name = 'furniture'; stage.scene.add(group);
  const M = makeMaterials(stage.renderer);
  const inst = (geo, mat, name) => { const m = new THREE.InstancedMesh(geo, mat, MAX); m.name = name; m.castShadow = m.receiveShadow = true; m.count = 0; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); group.add(m); return m; };
  const tablet = chairTablet();
  const parts = {
    seat: inst(chairSeatShell(), M.pp, 'chair-seat'),
    back: inst(chairBackShell(), M.ppBack, 'chair-back'),
    useat: inst(cushionSeat(), M.fabric, 'chair-seat-uph'),
    uback: inst(cushionBack(), M.fabric, 'chair-back-uph'),
    frame: inst(chairFrame(), M.steel, 'chair-frame'),
    caps: inst(chairCaps(), M.capMat, 'chair-caps'),
    tablet: inst(tablet, [M.formica, M.edge], 'chair-tablet'),
  };

  // oclusão de contato no piso (decal escurecedor sob cada carteira — os pés "assentam" no porcelanato)
  const T = furnitureTextures(stage.renderer);
  const aoMat = new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: T.aoTex, transparent: true, opacity: 0.62, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const aoGeo = new THREE.PlaneGeometry(T.AW, T.AH); aoGeo.rotateX(-Math.PI / 2); aoGeo.translate(0, 0.0015, 0);
  parts.ao = new THREE.InstancedMesh(aoGeo, aoMat, MAX); parts.ao.name = 'chair-ao'; parts.ao.count = 0; parts.ao.renderOrder = 1; group.add(parts.ao);

  // professor
  const desk = teacherDesk(), tch = teacherChair();
  const prof = new THREE.Group(); prof.name = 'teacher'; group.add(prof);
  const mk = (g, m) => { const o = new THREE.Mesh(g, m); o.castShadow = o.receiveShadow = true; prof.add(o); return o; };
  const deskG = new THREE.Group(); prof.add(deskG);
  deskG.add(mk(desk.top, [M.formica, M.edge]), mk(desk.frame, M.steel), mk(desk.panel, M.mdfPanel));
  const chairG = new THREE.Group(); prof.add(chairG);
  chairG.add(mk(tch.seat, M.fabricDark), mk(tch.back, M.fabricDark), mk(tch.frame, M.blackSteel));
  { const dg = new THREE.PlaneGeometry(1.3, 0.65); dg.rotateX(-Math.PI / 2); dg.translate(0, 0.0015, 0); const dm = aoMat.clone(); dm.alphaMap = T.deskAo; const d = new THREE.Mesh(dg, dm); d.renderOrder = 1; deskG.add(d); chairG.add(new THREE.Mesh(aoGeo, aoMat)); }

  const mat4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), col = new THREE.Color();
  let layout = [];
  function update(r = room) {
    room = { ...room, ...r };
    layout = layoutChairs(room);
    const c = { seat: 0, back: 0, useat: 0, uback: 0, frame: 0, caps: 0, tablet: 0, ao: 0 };
    const put = (m, k) => { m.setMatrixAt(c[k]++, mat4); };
    for (const ch of layout.slice(0, MAX)) {
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, ch.ry); pos.set(ch.x, 0, ch.z); mat4.compose(pos, q, one);
      put(parts.frame, 'frame'); put(parts.caps, 'caps'); put(parts.tablet, 'tablet'); put(parts.ao, 'ao');
      if (ch.uph) { put(parts.useat, 'useat'); put(parts.uback, 'uback'); }
      else {
        // leve variação de lote/desbotamento do PP
        const v = 0.93 + ch.tone * 0.12; col.setRGB(v, v * (0.985 + ch.tone * 0.03), v);
        parts.seat.setColorAt(c.seat, col); parts.back.setColorAt(c.back, col);
        put(parts.seat, 'seat'); put(parts.back, 'back');
      }
    }
    for (const k in parts) { const m = parts[k]; m.count = c[k]; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; m.computeBoundingSphere(); }
    // mesa do professor perto da parede da frente (z = −L/2), voltada para os alunos
    const { dx, dz } = deskSpot(room);
    deskG.position.set(dx, 0, dz); deskG.rotation.y = 0.015;
    chairG.position.set(dx + 0.1, 0, dz - 0.55); chairG.rotation.y = Math.PI - 0.16;
  }
  update(room);

  // ambiente de reflexo de reserva enquanto o RENDER não define scene.environment (metais não ficam pretos)
  let fallbackEnv = null;
  stage.onFrame?.(() => {
    const env = stage.scene.environment;
    if (!env && !fallbackEnv) {
      import('three/addons/environments/RoomEnvironment.js').then(({ RoomEnvironment }) => {
        if (stage.scene.environment || fallbackEnv) return;
        const pm = new THREE.PMREMGenerator(stage.renderer); fallbackEnv = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose();
        for (const m of Object.values(M)) { m.envMap = fallbackEnv; m.envMapIntensity = 0.35 * (m.userData.envI || 1); m.needsUpdate = true; }
      });
      fallbackEnv = 'loading';
    } else if (env && fallbackEnv && fallbackEnv !== 'loading' && M.steel.envMap === fallbackEnv) {
      for (const m of Object.values(M)) { m.envMap = null; m.envMapIntensity = m.userData.envI || 1; m.needsUpdate = true; }
    }
  });

  const api = {
    group,
    update(r, lums) { update(r); void lums; },
    setVisible(b) { group.visible = b; },
    get layout() { return layout; },
    get count() { return layout.length; },
    get plan() { return layout.plan; },
  };
  window.__furniture = api; // depuração/capturas: __furniture.count, __furniture.plan
  return api;
}

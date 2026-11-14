// MOBILIÁRIO — carteiras universitárias (concha PP azul royal + prancheta), mesa e cadeira do professor. Dono: MOBILIÁRIO.
// API: buildFurniture(stage, room) → { group, update(room, lums), setVisible(b) }
// Desempenho: cada peça da carteira é UM InstancedMesh (≈ 8 draw calls para ~40 cadeiras).
import * as THREE from 'three';
import { chairSeatShell, chairBackShell, chairFrame, chairCaps, chairTablet, cushionSeat, cushionBack, teacherDesk, teacherChair } from './furniture_geo.js';
import { furnitureTextures } from './furniture_tex.js';
import * as ROOM from './room.js';

const MAX = 160;

function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function makeMaterials(renderer) {
  const T = furnitureTextures(renderer);
  // polipropileno azul royal injetado (acetinado, leve brilho especular)
  const pp = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#2050d0'), map: T.ppColor, roughness: 1, roughnessMap: T.ppRough, normalMap: T.ppNormal, normalScale: new THREE.Vector2(0.15, 0.15),
    metalness: 0, specularIntensity: 0.6, ior: 1.49, clearcoat: 0.2, clearcoatRoughness: 0.5,
  });
  const ppBack = pp.clone(); ppBack.alphaMap = T.holeTex; ppBack.alphaTest = 0.5; ppBack.side = THREE.FrontSide;
  // furos: quando o furo cobre < ~3 px na tela ele se funde à casca (evita o "chuvisco" serrilhado sem MSAA)
  ppBack.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <alphamap_fragment>', `#ifdef USE_ALPHAMAP
      float holeA = texture2D( alphaMap, vAlphaMapUv ).g;
      float holePx = ${T.holeUv.toFixed(4)} / max( length( fwidth( vAlphaMapUv ) ), 1e-6 );
      diffuseColor.a *= mix( 1.0, holeA, smoothstep( 0.9, 1.8, holePx ) );
    #endif`);
  };
  ppBack.customProgramCacheKey = () => 'ppBackHoleFade';
  // aço tubular com pintura epóxi cinza-prata acetinada (foto: cinza-prata claro)
  const steel = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#b4b8bc'), metalness: 0.3, roughness: 1, roughnessMap: T.mtRough, normalMap: T.mtNormal, normalScale: new THREE.Vector2(0.04, 0.04),
    clearcoat: 0.1, clearcoatRoughness: 0.4, // anisotropia testada (0,3–0,55) escurecia os tubos nas vistas laterais — estrias via roughnessMap
  });
  steel.envMapIntensity = steel.userData.envI = 1.6; // estrutura vertical recebe pouca luz direta (luminárias acima)
  const capMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#2b2d30'), roughness: 0.62, metalness: 0 });
  // prancheta: laminado melamínico bege-acinzentado + fita de borda PVC
  const formica = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: T.fmColor, roughness: 1, roughnessMap: T.fmRough, normalMap: T.fmNormal, normalScale: new THREE.Vector2(0.08, 0.08), specularIntensity: 0.6, clearcoat: 0.12, clearcoatRoughness: 0.4 });
  const edge = new THREE.MeshStandardMaterial({ color: new THREE.Color('#7a6650'), roughness: 0.5, metalness: 0 });
  // estofado: tecido poliéster azul-marinho (foto: nitidamente mais escuro que o PP)
  const fabric = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#1b2c66'), map: T.fbColor, normalMap: T.fbNormal, normalScale: new THREE.Vector2(0.45, 0.45), roughness: 0.95, sheen: 0.3, sheenRoughness: 0.7, sheenColor: new THREE.Color('#34488a') });
  const fabricDark = fabric.clone(); fabricDark.color = new THREE.Color('#2a2c31'); fabricDark.sheenColor = new THREE.Color('#6a6d74');
  const blackSteel = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#26282b'), metalness: 0.3, roughness: 0.45, clearcoat: 0.3, clearcoatRoughness: 0.3 });
  const mdfPanel = new THREE.MeshStandardMaterial({ color: new THREE.Color('#b9b3a6'), roughness: 0.6 });
  return { pp, ppBack, steel, capMat, formica, edge, fabric, fabricDark, blackSteel, mdfPanel };
}

// ------------------------------------------------------------ disposição (determinística, semente fixa)
// Pedido do usuário: 40 carteiras = 5 filas (colunas ao longo de W) × 8 carteiras, voltadas para a parede da frente;
// as 2 filas dos cantos ENCOSTADAS nas paredes laterais (~2,5 cm), as 3 internas igualmente espaçadas entre elas.
// Pegada de uma carteira (local, sem giro): x −0,241 (prancheta/pé esq.) … +0,333 (prancheta dir.);
// z −0,47 (frente da prancheta) … +0,27 (encosto/pés traseiros). Profundidade na altura da prancheta: 0,706 m.
const FOOT = { l: 0.241, r: 0.333, f: 0.47, b: 0.27, tabDepth: 0.706 };
export const SEATING = { cols: 5, perCol: 8, wallGap: 0.025, teacher: 1.4, back: 0.6 };
// porta: lida de room.js (getOpenings) quando a SALA exportar; senão, regra do croqui — parede ESQUERDA, no lugar da
// janela mais próxima da parede da frente (1ª de n = round(L/2,29) janelas)
function doorOf(room) {
  try {
    const o = ROOM.getOpenings?.(room), d = o && (o.door || (Array.isArray(o.doors) && o.doors[0]) || (Array.isArray(o) && o.find((k) => k.kind === 'door')));
    if (d) {
      const z = d.z ?? d.zc ?? d.c ?? d.center ?? d.u, w = d.w ?? d.width ?? 0.84;
      const side = d.wall ?? d.side ?? (d.x !== undefined ? (d.x < 0 ? 'left' : 'right') : 'left');
      if (Number.isFinite(z)) return { side: /esq|left|-x/i.test(String(side)) ? 'left' : 'right', z0: z - w / 2, z1: z + w / 2 };
    }
  } catch { /* SALA em transição */ }
  const { L } = room, n = Math.max(1, Math.round(L / 2.29));
  const z = -L / 2 + 0.5 * (L / n) + 0.12 * Math.min(1, L / 9.16);
  return { side: 'left', z0: z - 0.42, z1: z + 0.42 };
}
function plan(room) {
  const { L, W } = room, S = SEATING;
  // colunas: extremas encostadas (folga S.wallGap até a face da parede; o rodapé avança 1,8 cm só até 5,5 cm de altura)
  const xL = -W / 2 + S.wallGap + FOOT.l, xR = W / 2 - S.wallGap - FOOT.r;
  let nc = S.cols; while (nc > 2 && (xR - xL) / (nc - 1) < 0.66) nc--;
  const px = nc > 1 ? (xR - xL) / (nc - 1) : 0;
  const cols = nc > 1 ? Array.from({ length: nc }, (_, k) => xL + k * px) : [(xL + xR) / 2];
  // longitudinal: frente da 1ª prancheta a S.teacher da parede da frente; encosto da última a S.back do fundo
  const zFront = -L / 2 + S.teacher + FOOT.f, zBack = L / 2 - S.back - FOOT.b;
  const pMin = FOOT.tabDepth + 0.06;
  const rowsFor = (z0) => { let n = S.perCol; while (n > 1 && (zBack - z0) / (n - 1) < pMin) n--; return { n, p: n > 1 ? Math.min(1.1, (zBack - z0) / (n - 1)) : 0, z0 }; };
  const door = doorOf(room);
  const colRows = cols.map((x, k) => {
    // coluna junto à parede da porta: começa atrás do vão + 0,9 m livres diante da porta (faixa de x até 0,9 m)
    const atDoor = (door.side === 'left' && k === 0) || (door.side === 'right' && k === cols.length - 1);
    let z0 = zFront;
    if (atDoor && door.z1 + 0.1 > z0 - FOOT.f && door.z0 - 0.1 < zBack + FOOT.b) z0 = Math.max(z0, door.z1 + 0.1 + FOOT.f);
    return rowsFor(z0);
  });
  return { cols, px, colRows, zFront, zBack, door, wallCols: [0, cols.length - 1] };
}
function deskSpot(room) { const { L, W } = room; return { dx: Math.min(W / 2 - 1.0, Math.max(-W / 2 + 1.0, W * 0.25)), dz: -L / 2 + Math.max(0.85, SEATING.teacher - 0.32) }; }
export function layoutChairs(room) {
  const { W } = room, rnd = mulberry(1109), P = plan(room);
  const out = [];
  P.cols.forEach((cx, c) => {
    const R = P.colRows[c], wall = P.wallCols.includes(c);
    for (let r = 0; r < R.n; r++) {
      // jitter pequeno (±3 cm, ±3°); filas encostadas: sem giro e deslocamento só para dentro (não atravessa a parede)
      let x = cx + (wall ? (c === 0 ? 1 : -1) * rnd() * 0.012 : (rnd() - 0.5) * 0.06);
      const z = R.z0 + r * R.p + (rnd() - 0.5) * 0.06;
      let ry = wall ? 0 : (rnd() - 0.5) * 0.105;
      if (!wall && rnd() < 0.05) ry = (rnd() < 0.5 ? -1 : 1) * (0.06 + rnd() * 0.06); // levemente virada (folga ≥ 0,15 m)
      out.push({ x, z, ry, uph: false, tone: rnd(), col: c, row: r });
    }
  });
  void W;
  // ~1 em 9 é a versão estofada, sem repetir
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

  // tubos finos fora do G-buffer do GTAO do RENDER (a AO em tela os deixava quase pretos; o contato vem do decal abaixo)
  parts.frame.userData.noAO = parts.caps.userData.noAO = true;
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
  deskG.add(mk(desk.top, [M.formica, M.edge]), mk(desk.frame, M.steel), mk(desk.panel, M.mdfPanel)); deskG.children[1].userData.noAO = true;
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

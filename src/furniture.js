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
    color: new THREE.Color('#a6aaae'), metalness: 0.08, roughness: 1, roughnessMap: T.mtRough, normalMap: T.mtNormal, normalScale: new THREE.Vector2(0.12, 0.12),
    anisotropy: 0.3, anisotropyRotation: 0, clearcoat: 0.2, clearcoatRoughness: 0.35,
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
// Leitura métrica da foto ref1 (câmera no canto traseiro-esquerdo, girada ~22° para a direita; foto esticada ~1,8× na
// horizontal): 1 coluna encostada na parede esquerda (x ≈ −W/2+0,5), corredor ≈ 0,75 m, bloco principal de ~6 colunas
// apertadas (passo ≈ 0,70 m) até a parede direita; 1ª fileira ≈ 1,45 m da parede da frente; passo entre fileiras ≈ 0,85 m.
function deskSpot({ L, W }) { return { dx: Math.min(W / 2 - 0.85, Math.max(-W / 2 + 0.85, W * 0.25)), dz: -L / 2 + Math.min(0.98, L * 0.12) }; }
export function layoutChairs(room) {
  const { L, W } = room, rnd = mulberry(1109);
  const offR = 0.33, offL = 0.25; // pegada da carteira: x−0,25 … x+0,33 (prancheta à direita do usuário)
  const pz = 0.95, aisle = 0.75;
  const blocks = []; // [{x0, x1}] faixas de centros
  let left = -W / 2 + 0.25 + offL; // centro da 1ª coluna possível
  const right = W / 2 - 0.22 - offR;
  const wallCol = W >= 4.2;
  if (wallCol) { blocks.push({ cols: [left + 0.02], wall: true }); left = left + 0.02 + offR + aisle + offL; }
  const fill = (x0, x1) => { const span = Math.max(0, x1 - x0), n = Math.max(1, Math.floor(span / 0.70 + 1e-6) + 1), p = n > 1 ? Math.min(0.82, span / (n - 1)) : 0; const c = []; for (let k = 0; k < n; k++) c.push(n > 1 ? x0 + k * p : (x0 + x1) / 2); return c; };
  if (right - left > 4.6) { // sala larga: corredor central no bloco principal
    const mid = (left + right) / 2;
    blocks.push({ cols: fill(left, mid - aisle / 2 - offR) }, { cols: fill(mid + aisle / 2 + offL, right) });
  } else blocks.push({ cols: fill(left, Math.max(left, right)) });
  const zFront = -L / 2 + Math.min(1.02, Math.max(0.9, L * 0.11)), zBack = L / 2 - Math.min(1.5, Math.max(0.9, L * 0.16));
  const nRows = Math.max(1, Math.floor((zBack - zFront) / pz + 1e-6) + 1);
  const out = [];
  for (let r = 0; r < nRows; r++) {
    const rowOff = (rnd() - 0.5) * 0.08, rowRot = (rnd() - 0.5) * 0.04, rowBow = (rnd() - 0.5) * 0.06, zr = zBack - (nRows - 1 - r) * pz + rowOff; // ancorado no fundo: a fileira mais próxima fica a ~1,5 m da câmera
    for (const bl of blocks) {
      if (bl.wall && r >= nRows - 1 && nRows > 3) continue; // fundo-esquerdo livre (circulação junto à câmera)
      for (const cx of bl.cols) {
        if (rnd() < 0.06) continue; // lugar vazio
        let x = cx + (rnd() - 0.5) * 0.10, z = zr + rowBow * Math.cos(cx / W * Math.PI) + (rnd() - 0.5) * 0.10, ry = rowRot + (rnd() - 0.5) * 0.10;
        if (rnd() < 0.05) ry += (rnd() < 0.5 ? -1 : 1) * (0.12 + rnd() * 0.13); // carteira "virada"
        x = Math.max(-W / 2 + 0.3, Math.min(W / 2 - 0.36, x));
        out.push({ x, z, ry, uph: false, tone: rnd() });
      }
    }
  }
  // libera a área da mesa do professor
  const { dx, dz } = deskSpot(room);
  for (let i = out.length - 1; i >= 0; i--) { const c = out[i]; if (Math.abs(c.x + 0.04 - dx) < 0.6 + 0.29 + 0.15 && c.z - 0.46 < dz + 0.3 + 0.12) out.splice(i, 1); }
  // ~1 em 9 é a versão estofada (assento/encosto em tecido) — como na foto
  const k = Math.max(1, Math.round(out.length / 9));
  for (let i = 0; i < k; i++) out[Math.floor(rnd() * out.length)].uph = true;
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

  return {
    group,
    update(r, lums) { update(r); void lums; },
    setVisible(b) { group.visible = b; },
    get layout() { return layout; },
  };
}

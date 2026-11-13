// LUMINÁRIAS — luz natural na cena 3D (dia nublado / ensolarado). Dono: LUMINÁRIAS.
// Coerente com a FOTOMETRIA (photo_core.js):
//   • céu: cada janela é uma fonte difusa voltada para dentro, exitância M = daylight · extLux · vertRatio · tau
//     (DAYLIGHT; spec.daylightLux sobrepõe) → RectAreaLight com power = M · área do vão (lm), cor ≈ céu encoberto 6500 K;
//   • sol (só ensolarado): DirectionalLight com a direção e a iluminância de SUN (Edn · tau · daylight/2,5, lux na normal),
//     sombra recortada pelas janelas: “sombras-fantasma” das malhas da SALA (mesma geometria, material invisível —
//     colorWrite/depthWrite desligados; o WebGLShadowMap testa as camadas da câmera principal, então ficam na camada 0) — paredes, caixilhos, grades, teto. Cadeiras e mesas fazem sombra nas manchas de sol.
// Transição suave (~0,8 s) ao trocar noturno ↔ diurno / nublado ↔ ensolarado.
import * as THREE from 'three';
import * as PH from './photometry.js';
import * as ROOM from './room.js';
import { cctColor } from './lum_color.js';

const SKY_CCT = 6500, SUN_CCT = 5500;

export function buildDaylight(stage, parent, { mapSize = 2048 } = {}) {
  const { scene } = stage;
  const group = new THREE.Group(); group.name = 'lum-daylight'; parent.add(group);
  const winGroup = new THREE.Group(); group.add(winGroup);
  const proxies = new THREE.Group(); proxies.name = 'lum-sun-proxies'; group.add(proxies);
  const skyCol = cctColor(SKY_CCT), sunCol = cctColor(SUN_CCT);

  const sun = new THREE.DirectionalLight(sunCol, 0); sun.name = 'lum-sun';
  sun.castShadow = false;   // liga só no ensolarado (orçamento de sombras do RENDER: máx. 4)
  sun.shadow.mapSize.set(mapSize, mapSize); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.025;
  group.add(sun, sun.target);

  const st = { day: 0, dayCur: 0, sun: 0, sunCur: 0, wins: [], M1: 0, sunE1: 0, room: null, sunny: false };
  const proxyMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, transparent: true, side: THREE.DoubleSide });
  proxyMat.shadowSide = THREE.DoubleSide;

  function openings(room) {
    let list = null;
    try { if (typeof ROOM.getOpenings === 'function') list = ROOM.getOpenings(room); } catch { list = null; }
    if (Array.isArray(list) && list.length) {
      return list.filter((o) => /window|janela/i.test(o.kind)).map((o) => ({ wall: o.wall, c: o.wall === 'left' || o.wall === 'right' ? o.z : o.x, w: o.width, y0: o.sill, y1: o.head }));
    }
    return (PH.OPENINGS || []).filter((o) => o.kind === 'janela').map((o) => {
      const span = o.wall === 'left' || o.wall === 'right' ? room.L : room.W;
      return { wall: o.wall, c: -span / 2 + o.at * span, w: o.w, y0: o.y0, y1: Math.min(o.y1, room.H) };
    });
  }
  function sunDir() {
    const S = PH.SUN || { alt: 35, az: 20, wall: 'left' }; const a = S.alt * Math.PI / 180, b = S.az * Math.PI / 180;
    const d = new THREE.Vector3(Math.cos(a) * Math.cos(b), -Math.sin(a), Math.cos(a) * Math.sin(b));   // raio que entra pela parede x = −W/2
    if (S.wall === 'right') d.x = -d.x;
    return d;
  }
  /** Sombras-fantasma: cópias invisíveis das malhas opacas da SALA (paredes com vãos, caixilhos, grades, teto, porta). */
  function buildProxies() {
    proxies.clear();
    const roomG = scene.children.find((c) => c.name === 'room'); if (!roomG) return 0;
    roomG.updateMatrixWorld(true); let n = 0;
    roomG.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh) return;
      const m = Array.isArray(o.material) ? o.material[0] : o.material, nm = `${o.name} ${m?.name || ''}`;
      if (/glass|vidro|film|ext|exterior|floor|piso|night|poster|switch/i.test(nm) || m?.transparent) return;
      const p = new THREE.Mesh(o.geometry, proxyMat); p.matrixAutoUpdate = false; p.matrix.copy(o.matrixWorld);
      p.castShadow = true; p.receiveShadow = false; p.renderOrder = -10; p.userData.noEnv = true; p.frustumCulled = false;
      proxies.add(p); n++;
    });
    return n;
  }

  function update(room, spec = {}) {
    st.room = room;
    const cond = typeof PH.skyCondition === 'function' ? PH.skyCondition(spec)
      : { daylight: spec.period === 'diurno' ? (spec.sky === 'ensolarado' ? 2.5 : 1) : 0, sunny: spec.period === 'diurno' && spec.sky === 'ensolarado' };
    const DL = PH.DAYLIGHT || { extLux: 10000, vertRatio: 0.4, tau: 0.62 };
    st.day = cond.daylight || 0; st.sunny = !!cond.sunny && st.day > 0;
    st.M1 = (+spec.daylightLux || DL.extLux) * DL.vertRatio * DL.tau;          // exitância por unidade de daylight (lm/m²)
    const S = PH.SUN || { Edn: 70000, tau: 0.62 };
    st.sunE1 = S.Edn * S.tau / 2.5;                                              // lux (normal) por unidade de daylight
    st.sun = st.sunny ? 1 : 0;

    // janelas → RectAreaLights voltadas para dentro (recria só se a sala mudou)
    {
      winGroup.clear(); st.wins = [];
      // desempenho: 1 RectAreaLight por PAREDE (faixa que cobre as janelas daquela parede), com a potência somada de
      // todas as janelas dela (Σ M·A) — o fluxo que entra é o mesmo da fotometria; a forma vira uma faixa contínua.
      const byWall = {};
      for (const o of openings(room)) (byWall[o.wall] ||= []).push(o);
      // à noite (e depois do esmaecimento) não há luzes de janela: luz com intensidade 0 ainda custa no shader
      if (!(st.day > 0 || st.dayCur > 1e-3)) for (const k in byWall) delete byWall[k];
      for (const wall in byWall) {
        const ws = byWall[wall];
        const c0 = Math.min(...ws.map((o) => o.c - o.w / 2)), c1 = Math.max(...ws.map((o) => o.c + o.w / 2));
        const y0 = Math.min(...ws.map((o) => o.y0)), y1 = Math.max(...ws.map((o) => o.y1));
        const A = ws.reduce((s, o) => s + o.w * Math.max(0.05, o.y1 - o.y0), 0);
        const w = c1 - c0, h = Math.max(0.05, y1 - y0), c = (c0 + c1) / 2;
        const r = new THREE.RectAreaLight(skyCol, 0, w, h);
        const side = wall === 'left' ? -1 : wall === 'right' ? 1 : 0;
        if (side) { r.position.set(side * (room.W / 2 - 0.03), (y0 + y1) / 2, c); r.rotation.set(0, side < 0 ? -Math.PI / 2 : Math.PI / 2, 0); }
        else { const s2 = wall === 'back' ? -1 : 1; r.position.set(c, (y0 + y1) / 2, s2 * (room.L / 2 - 0.03)); r.rotation.set(0, s2 < 0 ? 0 : Math.PI, 0); }
        r.userData.A = A * (PH.CORRIDOR && wall === PH.CORRIDOR.wall ? PH.CORRIDOR.factor : 1); // corredor: luz menor
        winGroup.add(r); st.wins.push(r);
      }
      const ext = Math.max(room.L, room.W) / 2 + 1.5, c = sun.shadow.camera;
      c.left = -ext; c.right = ext; c.top = ext; c.bottom = -ext; c.near = 0.5; c.far = 40; c.updateProjectionMatrix();
    }
    const d = sunDir(); sun.target.position.set(0, 0.6, 0); sun.position.copy(sun.target.position).addScaledVector(d, -18);
    // sombra só quando há sol (ou ainda esmaecendo)
    sun.castShadow = st.sunny || st.sunCur > 0.01;
    // a SALA recria as malhas a cada reconstrução → refaz as sombras-fantasma (são só invólucros da mesma geometria)
    if (sun.castShadow) buildProxies(); else proxies.clear();
    apply();
  }
  function apply() {
    for (const r of st.wins) r.power = st.M1 * st.dayCur * r.userData.A;
    sun.intensity = st.sunE1 * st.sunCur;
  }
  /** passo de animação; devolve true se mudou algo */
  function step(dt, still) {
    const k = still ? 1 : 1 - Math.exp(-dt / 0.28);
    const tSun = st.sun * st.day;
    let ch = false;
    if (Math.abs(st.dayCur - st.day) > 1e-4) { st.dayCur += (st.day - st.dayCur) * k; if (Math.abs(st.dayCur - st.day) < 2e-3) st.dayCur = st.day; ch = true; }
    if (Math.abs(st.sunCur - tSun) > 1e-4) { st.sunCur += (tSun - st.sunCur) * k; if (Math.abs(st.sunCur - tSun) < 2e-3) st.sunCur = tSun; ch = true; }
    if (!st.sunny && st.sunCur === 0 && sun.castShadow) { sun.castShadow = false; proxies.clear(); }
    if (st.day === 0 && st.dayCur === 0 && st.wins.length) { winGroup.clear(); st.wins = []; }
    if (ch) apply();
    return ch;
  }
  return { group, sun, st, update, step, get sunny() { return st.sunny; } };
}

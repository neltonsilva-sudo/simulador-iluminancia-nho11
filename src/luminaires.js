// LUMINÁRIAS — corpos das luminárias + luz física. Dono: LUMINÁRIAS.
// API (CONTRACT.md): buildLuminaires(stage) → { group, update(list, room, spec), setOn(b), setDim(f) }
//
// Luz em unidades físicas (three r169: RectAreaLight.power = intensidade[nit]·w·h·π  [lm];
// SpotLight.power = intensidade[cd]·π; HemisphereLight.intensity = irradiância [lx]).
// Coerência com photometry.illuminanceAt: fluxo emitido por luminária = flux · lor · dim · MF (mesmo MF da fotometria).
//   • parcela para baixo  (1 − up):  RectAreaLight voltada para baixo, do tamanho da abertura emissora;
//       – uma fração SHADOW_FRAC dessa parcela vai para 1–4 SpotLights com sombra (aglomerados de luminárias), que
//         imitam a distribuição lambertiana (smoothstep do cone ≈ cos θ) e dão as sombras suaves das cadeiras;
//   • parcela para cima / lateral (up, só calhas com tubo exposto): RectAreaLight fraca voltada para o teto (halo);
//   • componente indireta (inter-reflexão, método do fluxo médio — mesma expressão de photometry.js):
//       HemisphereLight com irradiância E_ind = Φ·ρ̄ / (A·(1−ρ̄)), céu > chão (o teto/paredes iluminam o piso).
import * as THREE from 'three';
import * as PH from './photometry.js';
import { cctColor } from './lum_color.js';
import { makeMaterials, lumModel, luminousCeiling } from './lum_models.js';

const UP_FRAC = { tube: 0.075, tube2: 0.06, louver: 0.02, panel: 0 };   // fração do fluxo emitido para cima/lados
const SHADOW_FRAC = 0.55;          // fração da luz direta transportada pelas luzes com sombra
// teto luminoso ≡ spec.count, senão N×M do app, senão 8 luminárias (mesma regra de photometry)
const luminousCount = (spec) => (isFinite(spec.count) ? +spec.count : (globalThis.__sim?.state?.N * globalThis.__sim?.state?.M) || 8);
const EMIT_MAX = 24000;           // nit — teto de radiância emissiva (half-float)
const SKY = 1.08, GROUND = 0.80;   // repartição direcional da indireta (teto+paredes → piso; piso → teto)

export function buildLuminaires(stage) {
  const { scene } = stage;
  const qs = new URLSearchParams(location.search);
  const media = qs.get('q') === 'media';
  const still = qs.get('still') === '1';
  const maxShadows = media ? 2 : 4, mapSize = media ? 512 : 1024;

  const group = new THREE.Group(); group.name = 'LUMINARIAS'; scene.add(group);
  const bodies = new THREE.Group(); bodies.name = 'lum-bodies';
  const lights = new THREE.Group(); lights.name = 'lum-lights';
  group.add(bodies, lights);
  const M = makeMaterials();
  const hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 0); hemi.name = 'lum-indirect'; hemi.position.set(0, 1, 0); group.add(hemi);

  const col = new THREE.Color(1, 1, 1);
  const st = {
    on: true, level: 1, anim: null, inited: false,
    dim: 1, dimCur: 1,
    rects: [], spots: [], E_ind: 0, L: {}, spec: null, list: [], room: null, shadowT: 0,
  };

  // ---------- montagem: encosta a luminária na face inferior do que estiver acima (forro, perfis/caibros) ----------
  const ray = new THREE.Raycaster(); ray.far = 0.75; ray.camera = stage.camera;
  const up = new THREE.Vector3(0, 1, 0);
  function isSolid(o) {
    if (!o.isMesh) return false;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!m || m.transparent || m.depthWrite === false || m.visible === false) return false;
    for (let p = o; p; p = p.parent) if (!p.visible || p === group) return false;
    return true;
  }
  function mountY(room, pts) {
    const H = room.H; scene.updateMatrixWorld();
    // só malhas sólidas (sem Sprites/rótulos/marcadores translúcidos), testadas sem recursão
    const cands = [];
    scene.traverse((o) => { if (o.isMesh && !o.isSprite && !o.isInstancedMesh && isSolid(o)) cands.push(o); });
    let y = H;
    for (const [x, z] of pts) {
      ray.set(new THREE.Vector3(x, H - 0.7, z), up);
      const hit = ray.intersectObjects(cands, false)[0];
      if (hit) y = Math.min(y, hit.point.y);
    }
    return Math.max(H - 0.45, Math.min(H, y)) - 0.001;
  }
  function samplePts(l, len, wid, axis) {
    const out = [];
    for (let i = 0; i <= 8; i++) for (const k of [-0.5, 0, 0.5]) {
      const a = (i / 8 - 0.5) * len, b = k * wid;
      out.push(axis === 'z' ? [l.x + b, l.z + a] : [l.x + a, l.z + b]);
    }
    return out;
  }

  // ---------- agrupamento (k-médias) das luminárias para as luzes com sombra ----------
  function clusters(pts, k) {
    if (pts.length <= k) return pts.map((p) => ({ x: p.x, z: p.z, w: p.w, n: 1 }));
    const d2 = (p, q) => (p.x - q.x) ** 2 + (p.z - q.z) ** 2;
    let best = null;
    // k-médias com várias sementes (cada luminária como 1º centro + ponto mais distante); fica a de menor inércia,
    // desempate pelo equilíbrio de fluxo entre os grupos (malhas regulares → pares/quartetos simétricos)
    for (let s0 = 0; s0 < pts.length; s0++) {
      const c = [pts[s0]];
      while (c.length < k) { let bp = null, bd = -1; for (const p of pts) { const d = Math.min(...c.map((q) => d2(p, q))); if (d > bd + 1e-9) { bd = d; bp = p; } } c.push(bp); }
      let cen = c.map((p) => ({ x: p.x, z: p.z })), asg = [];
      for (let it = 0; it < 16; it++) {
        asg = pts.map((p) => { let bi = 0, bd = Infinity; cen.forEach((q, i) => { const d = d2(p, q); if (d < bd - 1e-9) { bd = d; bi = i; } }); return bi; });
        cen = cen.map((q, i) => { const m = pts.filter((_, j) => asg[j] === i); return m.length ? { x: m.reduce((s, p) => s + p.x, 0) / m.length, z: m.reduce((s, p) => s + p.z, 0) / m.length } : q; });
      }
      const sse = pts.reduce((s, p, j) => s + d2(p, cen[asg[j]]), 0);
      const cnt = cen.map((_, i) => asg.filter((a) => a === i).length), imb = Math.max(...cnt) - Math.min(...cnt);
      const score = sse * (1 + 0.15 * imb);
      if (!best || score < best.score - 1e-9) best = { score, cen, asg };
    }
    return best.cen.map((q, i) => { const m = pts.filter((_, j) => best.asg[j] === i); return { x: q.x, z: q.z, w: m.reduce((s, p) => s + p.w, 0), n: m.length }; }).filter((q) => q.n);
  }

  function disposeLights() {
    for (const s of st.spots) { s.shadow?.dispose?.(); }
    lights.clear(); st.rects = []; st.spots = [];
  }
  function addRect(P, w, h, x, y, z, facingUp) {
    const r = new THREE.RectAreaLight(col, 0, w, h);
    r.position.set(x, y, z); r.rotation.set(facingUp ? Math.PI / 2 : -Math.PI / 2, 0, 0);   // largura→X, altura→Z
    r.userData.P = P; lights.add(r); st.rects.push(r); return r;
  }
  function addSpot(P, x, y, z, room) {
    const s = new THREE.SpotLight(col, 0, 0, 1.18, 1, 2);
    s.position.set(x, y, z); s.target.position.set(x, 0, z);
    s.castShadow = true; s.shadow.mapSize.set(mapSize, mapSize);
    s.shadow.bias = -0.0005; s.shadow.normalBias = 0.03; s.shadow.radius = 5; s.shadow.blurSamples = 12;
    s.shadow.camera.near = 0.08; s.shadow.camera.far = room.H + 0.5; s.shadow.focus = 1;
    s.shadow.autoUpdate = false; s.shadow.needsUpdate = true;
    s.userData.P = P; lights.add(s, s.target); st.spots.push(s); return s;
  }

  // ---------- calibração pela radiosidade da FOTOMETRIA (photometry.solve) ----------
  // Devolve, por lúmen emitido: irradiância indireta média no teto (Ec), no piso (Ef) e nas paredes (Ew), e a fração do
  // fluxo que chega DIRETO ao teto (up). Assim o preenchimento indireto e o halo no teto batem com o luxímetro virtual.
  let calibCache = null;
  function calibrate(list, room, spec) {
    try {
      if (typeof PH.solve !== 'function' || spec.on === false || !(spec.dim ?? 1)) return calibCache;
      const S = PH.solve(list, room, spec); if (!S?.G?.P || !(S.emitted > 0)) return calibCache;
      const acc = { ceiling: [0, 0, 0], floor: [0, 0, 0], wall: [0, 0, 0] };
      S.G.P.forEach((p, i) => {
        const k = p.surf === 'ceiling' ? 'ceiling' : p.surf === 'floor' ? 'floor' : 'wall', r = S.rho[i];
        const Ein = r > 1e-6 ? Math.max(0, (S.B[i] - S.Em[i]) / r - S.E0[i]) : 0;
        acc[k][0] += Ein * p.area; acc[k][1] += p.area; acc[k][2] += S.E0[i] * p.area;
      });
      const e = S.emitted, f = (k) => acc[k][0] / Math.max(1e-9, acc[k][1]) / e;
      calibCache = { key: `${spec.kind}|${spec.config}|${list.length}`, Ec: f('ceiling'), Ef: f('floor'), Ew: f('wall'), up: acc.ceiling[2] / e };
      return calibCache;
    } catch (err) { console.warn('[luminarias] calibração indisponível', err); return calibCache; }
  }

  // ---------- reconstrução ----------
  function update(list, room, spec) {
    st.spec = spec = spec || {}; st.list = list = list || []; st.room = room;
    bodies.clear(); disposeLights();
    const MF = spec.mf ?? PH.MF ?? 0.8, lor = spec.lor ?? 0.9, flux = spec.flux ?? 1850;
    const R = PH.REFLECT || { ceiling: 0.8, walls: 0.7, floor: 0.3 };
    cctColor(spec.cct ?? 6500, col);
    hemi.color.copy(col).multiplyScalar(SKY); hemi.groundColor.copy(col).multiplyScalar(GROUND);
    for (const k in M) if (M[k].emissive) M[k].emissive.copy(col);
    st.dim = spec.dim ?? 1; if (!st.inited) st.dimCur = st.dim;

    let Ftot = 0; const shadowPts = []; const L = st.L = {};
    const luminous = !list.length && spec.config === 6;
    if (luminous) {
      const Fl = flux * luminousCount(spec) * lor * MF; Ftot = Fl;
      const g = [];
      for (let i = 0; i <= 6; i++) for (let j = 0; j <= 6; j++) g.push([(-0.5 + i / 6) * (room.W - 0.3), (-0.5 + j / 6) * (room.L - 0.3)]);
      const y0 = mountY(room, g);
      const lc = luminousCeiling(room.W, room.L, M, 0.0); lc.position.set(0, y0, 0); bodies.add(lc);
      const { w, l } = lc.userData, nx = 2, nz = Math.max(2, Math.round(room.L / room.W * 2));
      const yE = y0 + lc.userData.y - 0.002;
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
        const cx = -w / 2 + (i + 0.5) * w / nx, cz = -l / 2 + (j + 0.5) * l / nz;
        addRect(Fl * (1 - SHADOW_FRAC) / (nx * nz), w / nx, l / nz, cx, yE, cz, false);
        shadowPts.push({ x: cx, z: cz, w: Fl * SHADOW_FRAC / (nx * nz) });
      }
      L.tile = Fl / (Math.PI * w * l) / 0.93; L.tProfile = L.tile * 0.05;
      shadowPts.y = yE - 0.01;
    } else if (list.length) {
      const kind = spec.kind || 'tube';
      const cal = calibrate(list, room, spec);
      // fração para cima: a da radiosidade da FOTOMETRIA, com piso no valor típico do tipo (tubo nu emite até ~120°)
      const upF = Math.min(0.2, Math.max(cal && cal.key.startsWith(kind + '|') ? cal.up : 0, UP_FRAC[kind] ?? 0.05));
      st.upF = upF;
      const Fl = flux * lor * MF; Ftot = Fl * list.length;
      let yMin = room.H, info = null;
      for (const l of list) {
        const len = kind === 'panel' ? (spec.lenM ?? 0.62) : Math.min(l.len, spec.lenM ?? l.len);
        const wid = kind === 'panel' ? (spec.widM ?? 0.62) : (spec.widM ?? l.wid);
        const m = lumModel(kind, len, wid, M); info = m.userData;
        const axis = l.axis === 'z' ? 'z' : 'x';
        const y0 = mountY(room, samplePts(l, len, wid, axis)); yMin = Math.min(yMin, y0);
        m.position.set(l.x, y0, l.z); if (axis === 'z') m.rotation.y = Math.PI / 2;
        m.userData.lum = l; bodies.add(m);
        const e = info.emit; const ew = axis === 'x' ? e.l : e.w, eh = axis === 'x' ? e.w : e.l;
        const Pd = Fl * (1 - upF);
        addRect(Pd * (1 - SHADOW_FRAC), ew, eh, l.x, y0 + e.y - 0.0015, l.z, false);
        if (upF > 0) {
          // halo no teto: emissor virtual largo e afastado → gradiente suave (o tubo nu “vaza” luz para cima/lados)
          const uw = axis === 'x' ? e.l + 0.7 : 0.8, uh = axis === 'x' ? 0.8 : e.l + 0.7;
          addRect(Fl * upF, uw, uh, l.x, y0 - 0.42, l.z, true);
        }
        shadowPts.push({ x: l.x, z: l.z, w: Pd * SHADOW_FRAC });
      }
      shadowPts.y = yMin + (info?.emit.y ?? -0.06) - 0.02;
      // luminâncias (nit) das superfícies emissoras/autoiluminadas do corpo
      const Pd = Fl * (1 - upF);
      if (kind === 'tube' || kind === 'tube2') {
        L.tubeLed = Pd / (Math.PI * info.tubeArea) / (M.tubeLed.emissiveMap.userData.mean || 0.3);  // ÷ média da textura de chips
        L.paint = 0.85 * (Fl * 0.07) / (Math.PI * Math.min(l0len(list), 1.3) * (kind === 'tube' ? 0.07 : 0.16));
        L.plastic = L.paint * 1.2; L.socket = L.paint * 1.4; L.tubeAlu = L.tubeLed * 0.012;
      } else if (kind === 'louver') {
        L.tubeFluo = Fl / (Math.PI * info.tubeArea * 0.75);
        L.mirror = L.tubeFluo * 0.0035; L.paint = 6; L.socket = L.tubeFluo * 0.01;
      } else if (kind === 'panel') {
        L.diffuser = Pd / (Math.PI * info.emit.w * info.emit.l) / 0.96;
        L.frame = L.diffuser * 0.006; L.paint = 0;
      }
    }
    // luzes com sombra (sombras suaves das cadeiras/mesas) — 1 a 4, nos centros dos aglomerados
    for (const c of clusters(shadowPts, maxShadows)) addSpot(c.w, c.x, shadowPts.y, c.z, room);

    // componente indireta (fluxo médio, refletâncias de photometry.REFLECT)
    const cal = luminous ? calibrate(list, room, spec) : calibCache;
    if (cal && cal.key === `${spec.kind}|${spec.config}|${list.length}`) {
      st.E_ind = 1; st.calib = cal;
      hemi.color.copy(col).multiplyScalar(cal.Ef * Ftot); hemi.groundColor.copy(col).multiplyScalar(cal.Ec * Ftot);
    } else {   // fallback: método do fluxo médio (mesma expressão da versão base de photometry.js)
      const Ac = room.L * room.W, Aw = 2 * (room.L + room.W) * room.H, A = 2 * Ac + Aw;
      const rho = (R.ceiling * Ac + R.floor * Ac + R.walls * Aw) / A;
      st.E_ind = (Ftot * rho) / (A * (1 - rho)) * 0.9; st.calib = null;
    }

    if (!st.inited) { st.inited = true; st.level = spec.on === false ? 0 : 1; st.on = spec.on !== false; }
    apply();
  }
  const l0len = (list) => list[0]?.len ?? 1.24;

  // ---------- aplica o nível (liga/desliga, flicker, dimerização) ----------
  function apply() {
    const eff = Math.max(0, st.level) * st.dimCur;
    for (const r of st.rects) r.power = r.userData.P * eff;
    for (const s of st.spots) { s.power = s.userData.P * eff; }
    // se o RENDER já fornece a indireta por IBL da própria sala (scene.environment), a HemisphereLight sairia em dobro
    hemi.intensity = scene.environment && (scene.environmentIntensity ?? 1) > 0 ? 0 : st.E_ind * eff;
    const L = st.L;
    for (const k in M) {
      const m = M[k]; if (!m.emissive) continue;
      // teto de radiância: os alvos HDR do RENDER são half-float (máx. 65504) — o pico da textura × intensidade
      // passando disso vira Inf → NaN no PMREM/bloom (tela branca). O tubo continua estourado (≫ exposição·nit).
      const peak = m.emissiveMap?.userData?.peak ?? 1;
      m.emissiveIntensity = Math.min((L[k] || 0) * eff, EMIT_MAX / peak);
    }
    // tubo apagado: policarbonato leitoso cinza (sem emissão), aceso: quase branco
    const lit = Math.min(1, eff * 4);
    M.tubeLed.color.setScalar(0.62 + 0.25 * lit); M.tubeFluo.color.setScalar(0.66 + 0.22 * lit);
  }

  // curva de partida de driver LED: ~0,25 s, 2 tremidas curtas e acomodação
  function startCurve(t) {
    const k = [[0.00, 0], [0.035, 0], [0.045, 0.62], [0.075, 0.62], [0.085, 0.06], [0.11, 0.06], [0.12, 0.9], [0.15, 0.9], [0.16, 0.5], [0.18, 0.5], [0.19, 0.86], [0.26, 1]];
    for (let i = 1; i < k.length; i++) if (t <= k[i][0]) { const [t0, v0] = k[i - 1], [t1, v1] = k[i]; return v0 + (v1 - v0) * (t - t0) / Math.max(1e-6, t1 - t0); }
    return 1;
  }
  stage.onFrame?.((dt) => {
    let dirty = false;
    if (st.anim) {
      st.anim.t += dt;
      if (st.anim.type === 'on') { st.level = startCurve(st.anim.t); if (st.anim.t >= 0.26) { st.level = 1; st.anim = null; } }
      else { st.level *= Math.exp(-dt / 0.055); if (st.level < 0.002) { st.level = 0; st.anim = null; } }
      dirty = true;
    }
    if (Math.abs(st.dimCur - st.dim) > 1e-4) { st.dimCur += (st.dim - st.dimCur) * Math.min(1, dt * 10); if (Math.abs(st.dimCur - st.dim) < 1e-3) st.dimCur = st.dim; dirty = true; }
    const envNow = !!(scene.environment && (scene.environmentIntensity ?? 1) > 0);
    if (envNow !== st.envSeen) { st.envSeen = envNow; dirty = true; }
    if (dirty) apply();
    // sombras: mapas estáticos, renovados 3×/s (mobiliário pode mudar) — economiza ~4 passes de sombra por quadro
    st.shadowT += dt; if (st.shadowT > 0.33) { st.shadowT = 0; for (const s of st.spots) s.shadow.needsUpdate = true; }
  });

  function setOn(b) {
    b = !!b;
    if (!st.inited) { st.on = b; st.level = b ? 1 : 0; return apply(); }
    if (b === st.on && !st.anim) return;
    st.on = b;
    if (still) { st.level = b ? 1 : 0; st.anim = null; return apply(); }
    st.anim = { type: b ? 'on' : 'off', t: 0 };
  }
  function setDim(f) { st.dim = Math.max(0, Math.min(1, +f || 0)); if (still) { st.dimCur = st.dim; apply(); } }

  const api = { group, update, setOn, setDim };
  window.__lum = { api, stage, st, M };   // depuração/capturas
  return api;
}

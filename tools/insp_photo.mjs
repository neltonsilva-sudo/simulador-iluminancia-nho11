// Inspetor FOTOMETRIA — verificações independentes (node tools/insp_photo.mjs)
import { layoutLuminaires, measurementPoints, computeIM } from '../src/norm.js';
import * as P from '../src/photo_core.js';
const { LUM_TYPES, illuminanceAt, illuminanceParts, computeGrid, solve, setReflectances, setMF, setOpenings, OPENINGS, REFLECT } = P;
const room = { L: 9.16, W: 5.9, H: 2.7, plane: 0.75 };
const specOf = (id, x = {}) => { const t = LUM_TYPES.find((q) => q.id === id); return { ...t, type: t.id, on: true, dim: 1, config: 1, ...x }; };
const f = (v, d = 1) => (+v).toFixed(d);
const openSave = OPENINGS.slice(), refSave = { ...REFLECT };

// ---------- A. luminária isolada, ρ=0: integração própria (linha com 4000 elementos, normalização por quadratura própria)
function myD(a, dn, dv, phiC = 110) { const ca = Math.sqrt(Math.max(0, 1 - a * a)); const phi = Math.atan2(Math.abs(dv), dn); return phi >= phiC * Math.PI / 180 ? 0 : ca * Math.cos(phi * 90 / phiC); }
function myIntegral(phiC) { // Monte Carlo estratificado em (cosγ, ψ)
  let s = 0; const N = 2000; for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { const u = -1 + 2 * (i + 0.5) / N, p = 2 * Math.PI * (j + 0.5) / N, sg = Math.sqrt(1 - u * u); s += myD(sg * Math.cos(p), u, sg * Math.sin(p), phiC); }
  return s * 4 * Math.PI / (N * N);
}
setReflectances({ ceiling: 0, walls: 0, floor: 0 }); setOpenings([]);
{
  const sp = specOf('led-t8-1x18'); const Phi = sp.flux * sp.lor * 0.8; const integ = myIntegral(110);
  const len = 1.24 * 0.94, y0 = room.H - 0.05; const one = [{ x: 0, z: 0, len: 1.24, wid: 0.09, axis: 'x' }];
  const mine = (px, py, pz) => { const n = 4000, I = Phi / integ / n; let E = 0; for (let k = 0; k < n; k++) { const sx = ((k + 0.5) / n - 0.5) * len; const dx = px - sx, dy = py - y0, dz = pz; const r = Math.hypot(dx, dy, dz); const ux = dx / r, uy = dy / r, uz = dz / r; if (uy >= 0) continue; E += I * myD(ux, -uy, uz) * (-uy) / (r * r); } return E; };
  console.log(`A. ∫D dΩ meu=${f(integ, 4)} sr | Φ_saída=${f(Phi, 0)} lm`);
  for (const [x, y, z] of [[0, 0.75, 0], [0.5, 0.75, 0], [0, 0.75, 1.0], [1.5, 0.75, 1.5], [0, 2.0, 0], [0.62, 2.3, 0.2], [0, 0.0, 0]]) {
    const a = illuminanceAt(x, y, z, one, room, sp), b = mine(x, y, z);
    console.log(`   (${x},${y},${z})  modelo ${f(a, 2)}  meu ${f(b, 2)}  Δ ${f(100 * (a - b) / b, 2)} %`);
  }
  // fonte-ponto clássica: E = I(0)/h² com I(0) da curva
  const ic = P.intensityCurve(sp); console.log(`   I(γ=0) curva ${f(ic.C0[0], 1)} cd/klm → E_ponto(h=1,9)=${f(ic.C0[0] * Phi / 1000 / 1.9 ** 2, 1)} lux`);
}
// ---------- A2. demais tipos isolados, ρ=0 — fluxo interceptado pelo piso infinito-ish (balanço direto)
for (const id of LUM_TYPES.map((t) => t.id)) {
  const sp = specOf(id), one = [{ x: 0, z: 0, len: sp.lenM, wid: sp.widM, axis: 'x' }];
  const S = solve(one, room, sp); let tot = 0; S.G.P.forEach((p, i) => tot += S.E0[i] * p.area);
  console.log(`A2 ${id.padEnd(12)} emitido ${f(S.emitted, 0)} lm, chega às superfícies ${f(tot, 0)} (${f(100 * tot / S.emitted, 2)} %)  E nadir ${f(illuminanceAt(0, .75, 0, one, room, sp), 1)} lux`);
}
setReflectances(refSave); setOpenings(openSave);

// ---------- B. balanço de energia completo (ρ padrão + aberturas): absorvido = emitido
{
  const arr = { N: 4, M: 2, config: 1 }, lums = layoutLuminaires(room, arr), sp = specOf('led-t8-1x18'); const S = solve(lums, room, sp);
  const { P: Pt, n, F } = S.G; let abs = 0, inc = 0; const bySurf = {};
  for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < n; j++) s += F[i * n + j] * S.B[j]; const Ei = S.E0[i] + s; abs += (1 - S.rho[i]) * Ei * Pt[i].area; inc += Ei * Pt[i].area; bySurf[Pt[i].surf] = (bySurf[Pt[i].surf] || 0) + Ei * Pt[i].area / (Pt[i].surf === 'wall' ? 2 * (room.L + room.W) * room.H : room.L * room.W); }
  console.log(`B. emitido ${f(S.emitted, 0)} lm | absorvido ${f(abs, 0)} lm (${f(100 * abs / S.emitted, 2)} %) | incidente total ${f(inc, 0)} lm | E médio: piso ${f(bySurf.floor)} paredes ${f(bySurf.wall)} teto ${f(bySurf.ceiling)} lux`);
  const g = computeGrid(lums, room, sp, 0.1); console.log(`   plano 0,75: Ē ${f(g.Emed)} → fluxo ${f(g.Emed * room.L * room.W, 0)} lm; UF(lâmpada)=${f(g.Emed * room.L * room.W / (8 * 2100), 3)} (MF incl.: ${f(g.Emed * room.L * room.W / (8 * 2100 * .8), 3)})`);
  const pts = measurementPoints(room, arr), v = {}; for (const p of pts) v[p.id] = illuminanceAt(p.x, .75, p.z, lums, room, sp);
  const vs = Object.values(v); console.log(`   pontos NHO: ${f(Math.min(...vs))}–${f(Math.max(...vs))} lux, Ē(NHO) ${f(computeIM(1, v, { N: 4, M: 2, L: room.L, W: room.W }).E)} (planilha 124,7–333,1; Ē 203,7)`);
  // assimetria esperada pelas janelas (ρ 0,10) à esquerda
  console.log(`   esq/dir (x=∓2,2, z=0): ${f(illuminanceAt(-2.2, .75, 0, lums, room, sp))} / ${f(illuminanceAt(2.2, .75, 0, lums, room, sp))}`);
  // cantos/paredes
  console.log(`   canto (−2,95;−4,58) ${f(illuminanceAt(-2.95, .75, -4.58, lums, room, sp))}  parede (0;−4,58) ${f(illuminanceAt(0, .75, -4.58, lums, room, sp))}  y=H ${illuminanceAt(0, 2.7, 0, lums, room, sp)}  y=2,69 ${f(illuminanceAt(0, 2.69, 0, lums, room, sp))}  y=2,66 (acima lum.? drop .05) ${f(illuminanceAt(0.0, 2.66, -1.15, lums, room, sp))}`);
}
// ---------- C. Sensibilidades: N/M, H, tipos, MF, off, dim, cfg6
{
  const base = (o = {}) => { const r = { ...room, ...(o.room || {}) }, arr = { N: 4, M: 2, config: 1, ...(o.arr || {}) }, sp = specOf(o.id || 'led-t8-1x18', o.sp || {}); const lums = layoutLuminaires(r, arr); const g = computeGrid(lums, r, sp, 0.2); return { g, lums, r, sp, arr }; };
  const row = (lbl, o) => { const t0 = performance.now(); const { g, lums } = base(o); console.log(`C. ${lbl.padEnd(34)} n=${String(lums.length).padStart(2)} Ē ${f(g.Emed).padStart(6)} Emín ${f(g.Emin).padStart(6)} Emáx ${f(g.Emax).padStart(6)} U0 ${f(g.U0, 2)}  ${f(performance.now() - t0, 0)} ms`); return g; };
  const g0 = row('padrão 4×2', {});
  row('N=2 M=2', { arr: { N: 2, M: 2 } }); row('N=6 M=3', { arr: { N: 6, M: 3 } }); row('N=8 M=4', { arr: { N: 8, M: 4 } });
  row('H=3,5', { room: { H: 3.5 } }); row('H=5,0', { room: { H: 5.0 } }); row('H=2,4', { room: { H: 2.4 } });
  row('sala 20×12 H4 N6 M4', { room: { L: 20, W: 12, H: 4 }, arr: { N: 6, M: 4 } });
  for (const t of LUM_TYPES) row('tipo ' + t.id, { id: t.id });
  const off = row('desligado', { sp: { on: false } }); const d50 = row('dim 0,5', { sp: { dim: 0.5 } });
  const mf = row('spec.mf 0,6', { sp: { mf: 0.6 } }); console.log(`   razão MF 0,6/0,8 = ${f(mf.Emed / g0.Emed, 4)} (esperado 0,75); dim = ${f(d50.Emed / g0.Emed, 4)}; off Emáx = ${off.Emax}`);
  setMF(0.6); const mf2 = row('setMF(0,6)', {}); setMF(0.8); console.log(`   setMF razão ${f(mf2.Emed / g0.Emed, 4)}`);
  // cfg 6
  for (const cnt of [8, 16]) { const r = room, sp = specOf('led-t8-1x18', { config: 6, count: cnt }); const g = computeGrid([], r, sp, 0.2); console.log(`C. cfg6 teto luminoso count=${cnt}: Ē ${f(g.Emed)} Emín ${f(g.Emin)} Emáx ${f(g.Emax)} U0 ${f(g.U0, 2)}  (exitância própria ${f(2100 * .92 * .8 * cnt / (r.L * r.W))} lm/m²)`); }
  { const sp = specOf('led-t8-1x18', { config: 6 }); delete sp.count; const g = computeGrid([], room, sp, 0.2); console.log(`C. cfg6 sem count (sem __sim) Ē ${f(g.Emed)} ← usa 8 por padrão`); }
  { const sp = specOf('led-t8-1x18', { config: 6, count: 8, on: false }); console.log(`C. cfg6 off: ${illuminanceAt(0, .75, 0, [], room, sp)}`); }
  // cfg6 balanço
  { const sp = specOf('led-t8-1x18', { config: 6, count: 8 }); const S = solve([], room, sp); const { P: Pt, n, F } = S.G; let abs = 0, emit = 0;
    for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < n; j++) s += F[i * n + j] * S.B[j]; abs += (1 - S.rho[i]) * (S.E0[i] + s) * Pt[i].area; emit += S.Em[i] * Pt[i].area; }
    console.log(`   cfg6 balanço: emitido ${f(emit, 0)} absorvido ${f(abs, 0)} (${f(100 * abs / emit, 2)} %)`); }
}
// ---------- D. desempenho
{
  const r2 = { L: 9.17, W: 5.9, H: 2.7, plane: 0.75 }, lums = layoutLuminaires(r2, { N: 4, M: 2, config: 1 }), sp = specOf('led-t8-1x18');
  let t0 = performance.now(); illuminanceAt(0, .75, 0, lums, r2, sp); const cold = performance.now() - t0;
  const sp2 = { ...sp, flux: 2200 }; t0 = performance.now(); illuminanceAt(0, .75, 0, lums, r2, sp2); const warmGeom = performance.now() - t0;
  t0 = performance.now(); for (let k = 0; k < 1000; k++) illuminanceAt(Math.random() * 5 - 2.5, .75, Math.random() * 8 - 4, lums, r2, sp2); const per = (performance.now() - t0) / 1000;
  t0 = performance.now(); computeGrid(lums, r2, sp2, 0.25, { nx: 128, nz: 199 }); const grid = performance.now() - t0;
  const big = { L: 30, W: 20, H: 6, plane: .75 }, lb = layoutLuminaires(big, { N: 10, M: 6, config: 1 }); t0 = performance.now(); illuminanceAt(0, .75, 0, lb, big, sp); const bigc = performance.now() - t0;
  console.log(`D. frio (fatores de forma+radiosidade) ${f(cold, 0)} ms | nova spec mesma sala ${f(warmGeom, 0)} ms | por ponto ${f(per * 1000, 0)} µs | grade 128×199 ${f(grid, 0)} ms | sala 30×20×6 60 lum. frio ${f(bigc, 0)} ms`);
}

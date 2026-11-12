// Teste numérico da FOTOMETRIA (node puro, sem DOM/THREE): node tools/photo_test.mjs
// Leituras simuladas nos 18 pontos da NHO-11 (sala padrão 9,16×5,90×2,70, 2×4 LED T8 1×18 W), Ē pelo método da norma,
// média real da grade (computeGrid), lúmen-method e verificações de conservação de energia.
import { measurementPoints, layoutLuminaires, computeIM, EXEMPLOS, CONFIGS } from '../src/norm.js';
import { LUM_TYPES, illuminanceAt, illuminanceParts, computeGrid, diagnostics, intensityCurve, REFLECT, MF } from '../src/photo_core.js';

let fail = 0; const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fail++; };
const f1 = (v) => (+v).toFixed(1).padStart(7);
const room = { L: 9.16, W: 5.9, H: 2.7, plane: 0.75 };
const specOf = (id, extra = {}) => { const t = LUM_TYPES.find((x) => x.id === id); return { ...t, type: t.id, flux: t.flux, cct: t.cct, on: true, dim: 1, config: 1, ...extra }; };

console.log(`REFLECT teto ${REFLECT.ceiling} paredes ${REFLECT.walls} piso ${REFLECT.floor}  MF ${MF}`);
// ---- 0. curva C/γ do tipo padrão
const ic = intensityCurve(LUM_TYPES[0]);
console.log('Curva cd/klm (led-t8-1x18)  γ:', [0, 30, 45, 60, 75, 90, 105].map((g) => `${g}°→C0 ${ic.C0[g / 5].toFixed(0)}/C90 ${ic.C90[g / 5].toFixed(0)}`).join('  '));

// ---- 1. sala padrão, config 1
const arr = { N: 4, M: 2, config: 1 };
const lums = layoutLuminaires(room, arr), pts = measurementPoints(room, arr), spec = specOf('led-t8-1x18');
let t0 = performance.now();
const dg = diagnostics(lums, room, spec);
console.log(`\nRadiosidade: ${dg.patches} patches (${dg.patchSize.toFixed(2)} m), fechamento ΣF ∈ [${dg.closure[0].toFixed(4)}, ${dg.closure[1].toFixed(4)}], ${dg.iterations} iterações GS, ${dg.ms.toFixed(0)} ms (com fatores de forma)`);
console.log(`Fluxo emitido ${dg.emitted.toFixed(0)} lm · direto nas superfícies ${dg.directOnSurfaces.toFixed(0)} lm (${(100 * dg.directOnSurfaces / dg.emitted).toFixed(2)} %) · piso ${dg.bySurf.floor.toFixed(0)} paredes ${dg.bySurf.wall.toFixed(0)} teto ${dg.bySurf.ceiling.toFixed(0)}`);
ok(Math.abs(dg.directOnSurfaces / dg.emitted - 1) < 0.01, 'conservação: fluxo direto que chega às 6 superfícies = fluxo emitido (±1 %)');
ok(dg.closure[0] > 0.97 && dg.closure[1] < 1.03, 'fatores de forma: Σ_j F_ij ≈ 1 antes da normalização (±3 %)');

const values = {}; const real = EXEMPLOS.planilha.values;
console.log('\nPonto      x       z    direta  indireta   total   planilha');
t0 = performance.now();
for (const p of pts) {
  const c = illuminanceParts(p.x, room.plane, p.z, lums, room, spec); values[p.id] = c.total;
  console.log(`${p.label.padEnd(4)} ${f1(p.x)} ${f1(p.z)} ${f1(c.direct)} ${f1(c.indirect)}  ${f1(c.total)}  ${f1(real[p.id])}`);
}
const tPts = performance.now() - t0;
const im = computeIM(1, values, { N: 4, M: 2, L: room.L, W: room.W });
t0 = performance.now(); const g = computeGrid(lums, room, spec, 0.25); const tGrid = performance.now() - t0;
const g2 = computeGrid(lums, room, spec, 0.05);
const err = 100 * (im.E - g2.Emed) / g2.Emed;
console.log(`\nGrupos: P ${im.groups.P.toFixed(1)} T ${im.groups.T.toFixed(1)} Q ${im.groups.Q.toFixed(1)} R ${im.groups.R.toFixed(1)}`);
console.log(`Ē (método NHO-11, 18 pontos)        = ${im.E.toFixed(1)} lux   (planilha real: ${EXEMPLOS.planilha.expectE.toFixed(1)} lux)`);
console.log(`Média da grade 0,25 m (${g.nx}×${g.nz})     = ${g.Emed.toFixed(1)} lux   Emín ${g.Emin.toFixed(1)}  Emáx ${g.Emax.toFixed(1)}  U0 ${g.U0.toFixed(2)}`);
console.log(`Média da grade 0,05 m (${g2.nx}×${g2.nz})   = ${g2.Emed.toFixed(1)} lux   Emín ${g2.Emin.toFixed(1)}  Emáx ${g2.Emax.toFixed(1)}  U0 ${g2.U0.toFixed(2)}`);
console.log(`Erro do método NHO vs média real da grade: ${err >= 0 ? '+' : ''}${err.toFixed(1)} %`);
// lúmen-method: E = n·Φ·U·MF/A — U implícito no modelo vs faixa típica de tabelas para luminária de distribuição direta
// larga, montada no teto, K≈1,9, ρ 0,8/0,7/0,3: U ≈ 0,70–0,90 (fator de utilização referido ao fluxo das lâmpadas)
const n = lums.length, A = room.L * room.W, hm = room.H - 0.05 - room.plane, K = (room.L * room.W) / (hm * (room.L + room.W));
const Uimp = g2.Emed * A / (n * spec.flux * MF);
console.log(`Lúmen-method: K = ${K.toFixed(2)}; U implícito no modelo = ${Uimp.toFixed(3)} → E = ${n}·${spec.flux}·${Uimp.toFixed(2)}·${MF}/${A.toFixed(2)} = ${(n * spec.flux * Uimp * MF / A).toFixed(1)} lux;`);
console.log(`  com U de tabela 0,70 / 0,80 / 0,90 → ${[0.7, 0.8, 0.9].map((u) => (n * spec.flux * u * MF / A).toFixed(0)).join(' / ')} lux`);
console.log(`Tempo: 18 pontos ${tPts.toFixed(1)} ms; grade ${g.nx}×${g.nz} ${tGrid.toFixed(0)} ms (${(1000 * tGrid / (g.nx * g.nz)).toFixed(0)} µs/ponto)`);

const vals = Object.values(values);
ok(Math.min(...vals) > 90 && Math.max(...vals) < 400, `leituras na faixa da planilha real (min ${Math.min(...vals).toFixed(0)}, máx ${Math.max(...vals).toFixed(0)}; planilha 125–333)`);
ok(im.E > 170 && im.E < 240, `Ē NHO na ordem da planilha (≈204 lux): ${im.E.toFixed(1)}`);
ok(Math.abs(err) < 8, `método NHO aproxima a média real da grade (erro ${err.toFixed(1)} %)`);
ok(Uimp > 0.65 && Uimp < 0.95, `U implícito plausível para calha nua (${Uimp.toFixed(2)})`);
ok(Math.abs(g.Emed - g2.Emed) / g2.Emed < 0.01, 'convergência de malha da grade (0,25 m vs 0,05 m < 1 %)');

// ---- 2. Simetria e linearidade (sem aberturas: sala simétrica)
const { setOpenings, OPENINGS } = await import('../src/photo_core.js'); const openSave = OPENINGS.slice(); setOpenings([]);
const sym = illuminanceAt(1.2, 0.75, 2.0, lums, room, spec), symM = illuminanceAt(-1.2, 0.75, -2.0, lums, room, spec);
ok(Math.abs(sym - symM) / sym < 1e-3, `simetria central da sala (${sym.toFixed(2)} vs ${symM.toFixed(2)})`);
const half = illuminanceAt(0.3, 0.75, 0.4, lums, room, { ...spec, dim: 0.5 }), full = illuminanceAt(0.3, 0.75, 0.4, lums, room, spec);
ok(Math.abs(half / full - 0.5) < 1e-6, 'linearidade com a dimerização');
ok(illuminanceAt(0, 0.75, 0, lums, room, { ...spec, on: false }) === 0, 'desligado → 0 lux');

// ---- 3. Validação analítica: radiosidade em caixa com refletância nula → só direta; esfera integradora (ρ uniforme)
{ // fonte pontual lambertiana equivalente: painel pequeno — E sob ele ≈ I0/h²
  const pan = specOf('painel-62', { lenM: 0.02, widM: 0.02, lor: 1, mf: 1, flux: 1000 });
  const one = [{ x: 0, z: 0, len: 0.02, wid: 0.02, axis: 'x' }];
  const save = { ...REFLECT };
  const { setReflectances } = await import('../src/photo_core.js');
  setReflectances({ ceiling: 0, walls: 0, floor: 0 });
  const h = room.H - pan.drop - 0.75, E = illuminanceAt(0, 0.75, 0, one, room, pan), Eth = (1000 / Math.PI) / (h * h);
  ok(Math.abs(E / Eth - 1) < 0.005, `lei do inverso do quadrado: fonte lambertiana pontual de 1000 lm, E(nadir) ${E.toFixed(2)} vs I0/h² ${Eth.toFixed(2)} lux`);
  const off = 1.5, d2 = h * h + off * off, Eoff = illuminanceAt(off, 0.75, 0, one, room, pan), EthOff = (1000 / Math.PI) * (h / Math.sqrt(d2)) ** 2 / d2;
  ok(Math.abs(Eoff / EthOff - 1) < 0.005, `lei do cosseno (cos²θ·cosθ fonte+sensor): ${Eoff.toFixed(2)} vs ${EthOff.toFixed(2)} lux`);
  // caixa com ρ uniforme: fluxo total que chega a todas as superfícies = Φ/(1−ρ) ⇒ média de irradiância = Φ/(A(1−ρ))
  setReflectances({ ceiling: 0.5, walls: 0.5, floor: 0.5 });
  const { solve } = await import('../src/photo_core.js');
  const S = solve(one, room, pan); let tot = 0; S.G.P.forEach((p, i) => { tot += (S.B[i] / 0.5) * p.area; });
  ok(Math.abs(tot / (1000 / 0.5) - 1) < 0.01, `balanço da radiosidade (ρ=0,5): Σ E·A = Φ/(1−ρ) → ${tot.toFixed(0)} vs ${(1000 / 0.5).toFixed(0)} lm`);
  setReflectances(save);
}
setOpenings(openSave);

// ---- 5. Luz natural (janelas) e fator por luminária (depreciada/queimada)
{ const dl = { ...spec, on: false, daylight: 1 };
  const nearL = illuminanceAt(-2.4, 0.75, -1.02, lums, room, dl), mid = illuminanceAt(0, 0.75, 0, lums, room, dl), nearR = illuminanceAt(2.4, 0.75, -1.22, lums, room, dl);
  const dg2 = diagnostics(lums, room, dl);
  console.log(`Luz natural (dia nublado 10 klx, luminárias desligadas): junto às janelas esq. ${nearL.toFixed(0)} lux · centro ${mid.toFixed(0)} lux (FLD ${(mid / 100).toFixed(2)} %) · dir. ${nearR.toFixed(0)} lux`);
  ok(mid > 30 && mid < 400 && nearL > mid, 'luz natural: ordem de grandeza plausível (FLD central 0,3–4 %) e decrescente para o interior');
  const both = illuminanceAt(0, 0.75, 0, lums, room, { ...spec, daylight: 1 }), night = illuminanceAt(0, 0.75, 0, lums, room, spec);
  ok(Math.abs(both - (night + mid)) / both < 1e-6, `superposição dia + luminárias (${both.toFixed(1)} = ${night.toFixed(1)} + ${mid.toFixed(1)})`);
  const id = lums[0].id, under = { x: lums[0].x, z: lums[0].z };
  const E1 = illuminanceAt(under.x, 0.75, under.z, lums, room, spec), E0 = illuminanceAt(under.x, 0.75, under.z, lums, room, { ...spec, lumFactors: { [id]: 0 } }),
    E5 = illuminanceAt(under.x, 0.75, under.z, lums, room, { ...spec, lumFactors: { [id]: 0.5 } });
  console.log(`Luminária ${id} queimada: sob ela ${E1.toFixed(0)} → ${E0.toFixed(0)} lux (50 %: ${E5.toFixed(0)})`);
  ok(E0 < 0.75 * E1 && Math.abs((E1 - E5) / (E1 - E0) - 0.5) < 1e-6, 'lumFactors: lâmpada queimada reduz localmente e é linear');
}

// ---- 6. Condição da avaliação: noturna < diurna nublada < diurna ensolarada (sol direto pelas janelas x = −W/2)
{ const { sunPatches, skyCondition, SUN } = await import('../src/photo_core.js');
  const conds = [['noturno', 'nublado', 0], ['diurno', 'nublado', 1], ['diurno', 'ensolarado', 2.5]];
  const res = conds.map(([period, sky, daylight]) => { const sp = { ...spec, period, sky, daylight }, v = {};
    for (const p of pts) v[p.id] = illuminanceAt(p.x, 0.75, p.z, lums, room, sp);
    const g = computeGrid(lums, room, sp, 0.1); return { label: skyCondition(sp).label, E: computeIM(1, v, { N: 4, M: 2, L: room.L, W: room.W }).E, g, v, sp }; });
  for (const r of res) console.log(`${r.label.padEnd(20)} Ē(NHO) ${r.E.toFixed(1).padStart(7)}  média grade ${r.g.Emed.toFixed(1).padStart(7)}  Emín ${r.g.Emin.toFixed(0).padStart(5)}  Emáx ${r.g.Emax.toFixed(0).padStart(6)}`);
  ok(res[0].E < res[1].E && res[1].E < res[2].E, 'Ē noturna < diurna nublada < diurna ensolarada');
  // fator de luz diurna (céu encoberto 10 klx, luminárias desligadas) no plano de trabalho
  const off = { ...spec, on: false, period: 'diurno', sky: 'nublado', daylight: 1 }, gd = computeGrid(lums, room, off, 0.1);
  const DF = gd.Emed / 10000 * 100, DFmin = gd.Emin / 10000 * 100;
  console.log(`Fator de luz diurna (nublado, 10 klx): médio ${DF.toFixed(2)} %, mínimo ${DFmin.toFixed(2)} %`);
  ok(DF >= 1 && DF <= 5, `nublado: fator de luz diurna médio entre 1 e 5 % (${DF.toFixed(2)} %)`);
  const night0 = illuminanceAt(0, 0.75, 0, lums, room, { ...spec, on: false, period: 'noturno', sky: 'ensolarado', daylight: 2.5 });
  ok(night0 === 0, 'período noturno ignora o céu (0 lux com luminárias desligadas)');
  // manchas de sol
  const sunny = res[2].sp, sp0 = sunPatches(room, sunny), spF = sunPatches(room, sunny, 0);
  console.log(`Sol: alt ${SUN.alt}°, az ${SUN.az}°; ${sp0.length} manchas no plano 0,75 m (E ${sp0[0]?.E.toFixed(0)} lux), ${spF.length} no piso; mancha 1 (0,75 m): ${sp0[0]?.pts.map((q) => `(${q[0].toFixed(2)},${q[1].toFixed(2)})`).join(' ')}`);
  ok(sp0.length >= 3 && spF.length >= 3, 'sunPatches: uma mancha por janela ensolarada (plano e piso)');
  const c = sp0[0].pts.reduce((a, q) => [a[0] + q[0] / sp0[0].pts.length, a[1] + q[1] / sp0[0].pts.length], [0, 0]);
  const Ein = illuminanceAt(c[0], 0.75, c[1], lums, room, sunny), Eout = illuminanceAt(c[0] + 1.6, 0.75, c[1], lums, room, sunny);
  console.log(`Centro da mancha (${c[0].toFixed(2)}, ${c[1].toFixed(2)}): ${Ein.toFixed(0)} lux; 1,6 m adiante: ${Eout.toFixed(0)} lux`);
  ok(Ein > 2000 && Ein > 5 * Eout, 'ponto dentro da mancha de sol: milhares de lux');
  const S2 = (await import('../src/photo_core.js')).solve(lums, room, sunny), d = [Math.cos(SUN.alt * Math.PI / 180) * Math.cos(SUN.az * Math.PI / 180)];
  const winA = OPENINGS.filter((o) => o.kind === 'janela' && o.wall === 'left').reduce((a, o) => a + o.w * (o.y1 - o.y0), 0);
  const expect = S2.Esun * d[0] * winA;
  ok(Math.abs(S2.sunFlux / expect - 1) < 0.01, `fluxo solar que entra = depositado nas superfícies (${S2.sunFlux.toFixed(0)} vs ${expect.toFixed(0)} lm)`);
}

// ---- 4. Outras configurações e tipos (sanidade, sem NaN)
for (const c of CONFIGS) {
  const a = { N: 4, M: 2, config: c.id }, L = layoutLuminaires(room, a), P = measurementPoints(room, a), s = specOf('led-t8-1x18', { config: c.id, count: 8 });
  const v = {}; for (const p of P) v[p.id] = illuminanceAt(p.x, 0.75, p.z, L, room, s);
  const r = computeIM(c.id, v, { N: 4, M: 2, L: room.L, W: room.W }), gg = computeGrid(L, room, s, 0.2);
  console.log(`cfg${c.id} ${c.short.padEnd(26)} Ē(NHO) ${r.E.toFixed(1).padStart(6)}  média grade ${gg.Emed.toFixed(1).padStart(6)}  erro ${(100 * (r.E - gg.Emed) / gg.Emed).toFixed(1).padStart(5)} %  U0 ${gg.U0.toFixed(2)}`);
  ok(isFinite(r.E) && r.E > 0, `cfg${c.id}: Ē finito`);
}
for (const t of LUM_TYPES) {
  const s = specOf(t.id), gg = computeGrid(lums, room, s, 0.25), Ui = gg.Emed * A / (n * t.flux * MF);
  console.log(`${t.id.padEnd(12)} média ${gg.Emed.toFixed(1).padStart(6)} lux  Emín ${gg.Emin.toFixed(0).padStart(4)}  Emáx ${gg.Emax.toFixed(0).padStart(4)}  U0 ${gg.U0.toFixed(2)}  U ${Ui.toFixed(2)}`);
  ok(Ui > 0.5 && Ui < 1.0, `${t.id}: fator de utilização plausível`);
}
// Anexo 4 (sala 6,0×4,5, 3×2) — sanidade de magnitude
{ const r4 = { L: 6, W: 4.5, H: 2.7, plane: 0.75 }, a = { N: 3, M: 2, config: 1 }, L = layoutLuminaires(r4, a), P = measurementPoints(r4, a), s = specOf('fluor-2x32');
  const v = {}; for (const p of P) v[p.id] = illuminanceAt(p.x, 0.75, p.z, L, r4, s);
  const r = computeIM(1, v, { N: 3, M: 2, L: 6, W: 4.5 }), gg = computeGrid(L, r4, s, 0.05);
  console.log(`Anexo 4 (6×4,5 m, 6× fluor 2×32): Ē(NHO) ${r.E.toFixed(1)}  média grade ${gg.Emed.toFixed(1)}  erro ${(100 * (r.E - gg.Emed) / gg.Emed).toFixed(1)} %  (norma: 494 lux medidos)`); }

console.log(fail ? `\n${fail} FAIL` : '\nALL OK'); process.exit(fail ? 1 : 0);

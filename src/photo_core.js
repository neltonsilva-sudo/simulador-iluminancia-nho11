// FOTOMETRIA — núcleo físico PURO (sem DOM, sem THREE): roda no navegador, em Web Worker e no Node (tools/photo_test.mjs).
// Dono: FOTOMETRIA.
//
// Modelo (luxímetro virtual):
//  • Componente DIRETA — cada luminária é discretizada em elementos (fonte linear: 16 ao longo do eixo × 1–2 linhas;
//    painel: 6×6). Cada elemento emite I(d) = I0·D(d), com D a distribuição C/γ do tipo (curva plausível):
//      tube   — tubo LED T8 nu sob calha: lambertiano alargado no plano transversal (emissão lateral até γ≈110°),
//               ×cos α no plano axial (projeção do cilindro);
//      louver — aletas parabólicas: corte suave 46°→65° no plano transversal e 50°→70° no axial;
//      panel  — painel difusor de embutir: lambertiano puro (I = I0·cos γ).
//    I0 é normalizado por integração numérica na esfera para que o fluxo emitido seja Φ·LOR·dim·MF.
//    E = Σ I(d)·cos θ / r²  (lei do inverso do quadrado + lei do cosseno; fotocélula horizontal com correção de cosseno).
//  • Componente INDIRETA — radiosidade em patches (~0,5 m) das 6 superfícies (teto, piso, 4 paredes) com refletâncias
//    REFLECT; fatores de forma pela fórmula analítica de Lambert (área diferencial → polígono), subamostrados para pares
//    próximos e normalizados (caixa fechada: Σ F = 1); Gauss–Seidel até convergir (≡ todos os rebatimentos).
//    A leitura indireta num ponto soma B_j·F(dA→patch j), analítica para patches próximos (com recorte pelo plano do
//    sensor) e aproximação de ponto para os distantes.
//  • Teto luminoso (config 6): o teto inteiro é uma fonte lambertiana de área (exitância própria = Φ_total/A_teto) que
//    entra na radiosidade como emissão — a parcela “direta” do teto é integrada exatamente pelos fatores de forma.
//  • Cache: matriz de fatores de forma por geometria (L, W, H); solução de radiosidade por (sala, luminárias, spec,
//    refletâncias, MF). illuminanceAt é barato depois do primeiro ponto.

const PI = Math.PI;

export const LUM_TYPES = [
  { id: 'led-t8-1x18', name: 'Calha de sobrepor LED tubular T8 1×18 W (foto)', flux: 2100, cct: 6500, watts: 18, lenM: 1.24, widM: 0.09, lor: 0.92, kind: 'tube',
    dist: 'tube', phiC: 110, lines: 1, drop: 0.050, lumFrac: 0.94, note: 'Tubo LED T8 120 cm, 2.100 lm (≈117 lm/W), sem difusor: emissão lateral até γ≈110°' },
  { id: 'led-t8-2x18', name: 'Calha de sobrepor LED tubular T8 2×18 W', flux: 4200, cct: 6500, watts: 36, lenM: 1.24, widM: 0.16, lor: 0.88, kind: 'tube2',
    dist: 'tube', phiC: 104, lines: 2, lineGap: 0.075, drop: 0.050, lumFrac: 0.94, note: 'Dois tubos LED T8 sob calha refletora' },
  { id: 'fluor-2x32', name: 'Luminária fluorescente T8 2×32 W com aletas', flux: 5000, cct: 4000, watts: 64, lenM: 1.24, widM: 0.26, lor: 0.70, kind: 'louver',
    dist: 'louver', lines: 2, lineGap: 0.12, drop: 0.045, lumFrac: 0.95, note: 'Aletas parabólicas de alumínio: corte ≈65°' },
  { id: 'painel-62', name: 'Painel LED de embutir 62×62 cm 40 W', flux: 4000, cct: 5000, watts: 40, lenM: 0.62, widM: 0.62, lor: 0.95, kind: 'panel',
    dist: 'panel', drop: 0.004, lumFrac: 0.95, note: 'Difusor opalino: lambertiano' },
];
export const REFLECT = { ceiling: 0.80, walls: 0.70, floor: 0.30 };
export let MF = 0.80; // fator de manutenção (live binding: use setMF)
export const LUMINOUS_CEILING_RHO = 0.60; // refletância do difusor do teto luminoso (config 6)
/** Aberturas nas paredes (refletância própria, mistura por área nos patches). Posições ao longo da parede como fração de L
 *  (0 = parede do fundo z=−L/2), conforme o croqui: 4 janelas na parede esquerda (x=−W/2), 3 janelas + porta na direita.
 *  Janelas basculantes à noite (vidro + grade, exterior escuro): ρ ≈ 0,10. Porta de painel: ρ ≈ 0,50. */
export const OPENINGS = [
  ...[0.133, 0.389, 0.642, 0.892].map((f) => ({ kind: 'janela', wall: 'left', at: f, w: 1.0, y0: 1.10, y1: 2.10, rho: 0.10 })),
  ...[0.157, 0.404, 0.647].map((f) => ({ kind: 'janela', wall: 'right', at: f, w: 1.0, y0: 1.10, y1: 2.10, rho: 0.10 })),
  { kind: 'porta', wall: 'right', at: 0.815, w: 0.90, y0: 0, y1: 2.10, rho: 0.50 },
];
/** Luz natural (spec.daylight 0..1): janelas como fontes difusas. Exitância transmitida pela janela =
 *  daylight · extLux · vertRatio · tau  (céu encoberto CIE: E_vertical ≈ 0,40·E_horizontal; vidro 0,80 × caixilho/grade 0,78).
 *  extLux padrão 10 000 lx (dia nublado típico); spec.daylightLux sobrepõe. A NHO-11 manda avaliar na condição mais
 *  desfavorável — à noite (daylight = 0, padrão). */
export const DAYLIGHT = { extLux: 10000, vertRatio: 0.40, tau: 0.62 };
let version = 0;
/** Substitui as aberturas (lista no formato de OPENINGS; [] = paredes contínuas). */
export function setOpenings(list = []) { OPENINGS.length = 0; OPENINGS.push(...list); version++; }
/** Ajusta refletâncias {ceiling, walls, floor} (0–1). Invalida o cache. */
export function setReflectances(r = {}) { for (const k of ['ceiling', 'walls', 'floor']) if (isFinite(r[k])) REFLECT[k] = Math.min(0.98, Math.max(0, +r[k])); version++; }
/** Ajusta o fator de manutenção (0–1). */
export function setMF(v) { if (isFinite(v)) { MF = Math.min(1, Math.max(0.05, +v)); version++; } }

// ---------------------------------------------------------------- distribuição de intensidade (C/γ)
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const D2R = PI / 180;
/** Retorna D(a, dn, dv): a = componente axial da direção, dn = componente para baixo (cos γ), dv = componente transversal. */
function distFn(t) {
  if (t.dist === 'panel') return (a, dn) => (dn > 0 ? dn : 0);
  if (t.dist === 'louver') {
    return (a, dn, dv) => {
      if (dn <= 0) return 0;
      const ca = Math.sqrt(Math.max(0, 1 - a * a)); if (ca < 1e-9) return 0;
      const phi = Math.atan2(Math.abs(dv), dn), al = Math.asin(Math.min(1, Math.abs(a)));
      return ca * Math.pow(Math.cos(phi), 0.35) * (1 - smooth(46 * D2R, 65 * D2R, phi)) * (1 - smooth(50 * D2R, 70 * D2R, al));
    };
  }
  const phiC = (t.phiC || 110) * D2R, k = (PI / 2) / phiC;
  return (a, dn, dv) => {
    const ca = Math.sqrt(Math.max(0, 1 - a * a)); if (ca < 1e-9) return 0;
    const phi = Math.atan2(Math.abs(dv), dn);
    return phi >= phiC ? 0 : ca * Math.cos(phi * k);
  };
}
const normCache = new Map();
/** ∫ D dΩ (sr) — integração numérica (γ: 360 passos, ψ: 720 passos, regra do ponto médio). */
function distIntegral(t) {
  const key = `${t.dist}|${t.phiC}`; if (normCache.has(key)) return normCache.get(key);
  const D = distFn(t), NG = 360, NP = 720, dg = PI / NG, dp = 2 * PI / NP; let s = 0;
  for (let i = 0; i < NG; i++) {
    const g = (i + 0.5) * dg, sg = Math.sin(g), cg = Math.cos(g); let row = 0;
    for (let j = 0; j < NP; j++) { const p = (j + 0.5) * dp; row += D(sg * Math.cos(p), cg, sg * Math.sin(p)); }
    s += row * sg * dg * dp;
  }
  normCache.set(key, s); return s;
}
/** Curva fotométrica (cd/klm) nos planos C0 (ao longo do eixo) e C90 (transversal), γ = 0..180° de 5 em 5. */
export function intensityCurve(typeOrSpec) {
  const t = resolveType(typeOrSpec), D = distFn(t), I0 = 1000 / distIntegral(t), out = { gamma: [], C0: [], C90: [] };
  for (let g = 0; g <= 180; g += 5) { const sg = Math.sin(g * D2R), cg = Math.cos(g * D2R); out.gamma.push(g); out.C0.push(I0 * D(sg, cg, 0)); out.C90.push(I0 * D(0, cg, sg)); }
  return out;
}
function resolveType(spec) { const base = LUM_TYPES.find((x) => x.id === spec?.id || x.id === spec?.type) || LUM_TYPES[0]; return { ...base, ...(spec || {}) }; }

// ---------------------------------------------------------------- elementos emissores
/** Fluxo total emitido (lm) pelas luminárias, já com LOR, dimerização e MF. */
function emittedFlux(spec) { if (spec.on === false) return 0; return (+spec.flux || 0) * (spec.lor ?? 0.9) * (spec.dim ?? 1) * (spec.mf ?? MF); }
/** Nº de luminárias equivalentes no teto luminoso: spec.count, senão N×M do app, senão 8. */
function luminousCount(spec) {
  if (isFinite(spec.count)) return +spec.count;
  const st = globalThis.__sim?.state; if (st && st.N && st.M) return st.N * st.M;
  return 8;
}
function buildElements(lums, room, spec) {
  const t = resolveType(spec), phiOut = emittedFlux(t);
  if (!lums.length || phiOut <= 0) return { n: 0, data: new Float64Array(0), D: distFn(t) };
  const panel = t.dist === 'panel', nL = panel ? 6 : 16, lines = panel ? 6 : (t.lines || 1);
  const per = lums.length * nL * lines, I = phiOut / distIntegral(t) / (nL * lines); // cd por elemento
  const data = new Float64Array(lums.length * nL * lines * 5); let k = 0;
  const LF = t.lumFactors || {};
  for (const l of lums) {
    const ax = l.axis === 'z' ? 1 : 0, f = Math.min(2, Math.max(0, +(LF[l.id] ?? 1) || 0)); // depreciada/queimada: f < 1 / 0
    const len = (panel ? (t.lenM || 0.62) : Math.min(l.len || t.lenM, t.lenM || l.len)) * (t.lumFrac ?? 0.94);
    const wid = panel ? (t.widM || 0.62) * (t.lumFrac ?? 0.95) : (lines > 1 ? (t.lineGap || 0.08) : 0);
    const y = room.H - (t.drop ?? 0.05);
    for (let i = 0; i < nL; i++) for (let j = 0; j < lines; j++) {
      const s = ((i + 0.5) / nL - 0.5) * len, w = lines > 1 ? (panel ? ((j + 0.5) / lines - 0.5) * wid : (j - (lines - 1) / 2) * wid) : 0;
      data[k++] = ax ? l.x + w : l.x + s; data[k++] = y; data[k++] = ax ? l.z + s : l.z + w; data[k++] = ax; data[k++] = I * f;
    }
  }
  return { n: per, data, D: distFn(t), type: t };
}
/** Iluminância direta (lux) num ponto com normal n. */
function directAt(px, py, pz, nx, ny, nz, EL) {
  const d = EL.data, D = EL.D; let E = 0;
  for (let k = 0, e = 0; k < EL.n; k++, e += 5) {
    const dx = px - d[e], dy = py - d[e + 1], dz = pz - d[e + 2];
    const r2 = dx * dx + dy * dy + dz * dz; if (r2 < 1e-6) continue;
    const r = Math.sqrt(r2), ux = dx / r, uy = dy / r, uz = dz / r;
    const cosInc = -(nx * ux + ny * uy + nz * uz); if (cosInc <= 0) continue;
    const ax = d[e + 3], a = ax ? uz : ux, dv = ax ? ux : uz;
    const I = d[e + 4] * D(a, -uy, dv); if (I <= 0) continue;
    E += I * cosInc / r2;
  }
  return E;
}

// ---------------------------------------------------------------- geometria: patches + fatores de forma
// Patch = retângulo alinhado aos eixos. axis = eixo da normal (0=x,1=y,2=z), sgn = sentido da normal (para dentro).
function buildPatches(room) {
  const { L, W, H } = room, area = 2 * L * W + 2 * (L + W) * H;
  const size = Math.max(0.5, Math.sqrt(area / 1100)); // ≈0,5 m; cresce em salas grandes (≤ ~1100 patches)
  const P = [];
  const n = (len) => Math.max(1, Math.round(len / size));
  const add = (surf, axis, sgn, c, uA, uLo, uHi, vA, vLo, vHi) => {
    const nu = n(uHi - uLo), nv = n(vHi - vLo);
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const lo = [0, 0, 0], hi = [0, 0, 0];
      lo[axis] = hi[axis] = c;
      lo[uA] = uLo + (uHi - uLo) * i / nu; hi[uA] = uLo + (uHi - uLo) * (i + 1) / nu;
      lo[vA] = vLo + (vHi - vLo) * j / nv; hi[vA] = vLo + (vHi - vLo) * (j + 1) / nv;
      P.push({ surf, axis, sgn, lo, hi, area: (hi[uA] - lo[uA]) * (hi[vA] - lo[vA]), uA, vA });
    }
  };
  add('floor', 1, +1, 0, 0, -W / 2, W / 2, 2, -L / 2, L / 2);
  add('ceiling', 1, -1, H, 0, -W / 2, W / 2, 2, -L / 2, L / 2);
  add('wall', 0, +1, -W / 2, 2, -L / 2, L / 2, 1, 0, H); // parede esquerda (x = −W/2)
  add('wall', 0, -1, W / 2, 2, -L / 2, L / 2, 1, 0, H);  // parede direita
  add('wall', 2, +1, -L / 2, 0, -W / 2, W / 2, 1, 0, H); // parede do fundo (z = −L/2)
  add('wall', 2, -1, L / 2, 0, -W / 2, W / 2, 1, 0, H);  // parede de entrada
  for (const p of P) {
    p.c = [(p.lo[0] + p.hi[0]) / 2, (p.lo[1] + p.hi[1]) / 2, (p.lo[2] + p.hi[2]) / 2];
    p.n = [0, 0, 0]; p.n[p.axis] = p.sgn;
    p.v = rectVerts(p.lo, p.hi, p.uA, p.vA);
    p.dim = Math.max(p.hi[p.uA] - p.lo[p.uA], p.hi[p.vA] - p.lo[p.vA]);
  }
  return { P, size };
}
function rectVerts(lo, hi, uA, vA) {
  const v = []; const corner = (a, b) => { const q = [lo[0], lo[1], lo[2]]; q[uA] = a ? hi[uA] : lo[uA]; q[vA] = b ? hi[vA] : lo[vA]; return q; };
  for (const [a, b] of [[0, 0], [1, 0], [1, 1], [0, 1]]) v.push(...corner(a, b));
  return v; // 12 números
}
/** Fator de forma área diferencial (p, n) → polígono convexo V (fórmula de Lambert, exata). */
function ffPointPoly(px, py, pz, nx, ny, nz, V, nv = 4) {
  let s = 0;
  for (let k = 0; k < nv; k++) {
    const i = 3 * k, j = 3 * ((k + 1) % nv);
    let ax = V[i] - px, ay = V[i + 1] - py, az = V[i + 2] - pz, bx = V[j] - px, by = V[j + 1] - py, bz = V[j + 2] - pz;
    const la = Math.hypot(ax, ay, az), lb = Math.hypot(bx, by, bz); if (la < 1e-12 || lb < 1e-12) continue;
    ax /= la; ay /= la; az /= la; bx /= lb; by /= lb; bz /= lb;
    const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx, cl = Math.hypot(cx, cy, cz);
    if (cl < 1e-12) continue;
    const beta = Math.atan2(cl, ax * bx + ay * by + az * bz);
    s += beta * (nx * cx + ny * cy + nz * cz) / cl;
  }
  return Math.abs(s) / (2 * PI);
}
const geomCache = new Map();
const geomKey = (room) => `${(+room.L).toFixed(3)}|${(+room.W).toFixed(3)}|${(+room.H).toFixed(3)}`;
function storeGeom(key, g) { if (geomCache.size > 6) geomCache.delete(geomCache.keys().next().value); geomCache.set(key, g); return g; }
function geometry(room) {
  const key = geomKey(room);
  let g = geomCache.get(key); if (g) return g;
  const { P, size } = buildPatches(room), n = P.length, F = new Float32Array(n * n);
  // pares i<j calculados uma vez (emissor diferencial i subamostrado); F_ji = F_ij·A_i/A_j (reciprocidade)
  for (let i = 0; i < n; i++) {
    const a = P[i], ua = a.uA, va = a.vA;
    for (let j = i + 1; j < n; j++) {
      const b = P[j];
      if (a.axis === b.axis && Math.abs(a.c[a.axis] - b.c[b.axis]) < 1e-9) continue; // coplanares
      const r = Math.hypot(a.c[0] - b.c[0], a.c[1] - b.c[1], a.c[2] - b.c[2]);
      const m = r < 1.2 * (a.dim + b.dim) ? (r < 0.75 * (a.dim + b.dim) ? 5 : 3) : 1;
      let f = 0;
      for (let si = 0; si < m; si++) for (let sj = 0; sj < m; sj++) {
        const q = [a.c[0], a.c[1], a.c[2]];
        q[ua] = a.lo[ua] + (a.hi[ua] - a.lo[ua]) * (si + 0.5) / m; q[va] = a.lo[va] + (a.hi[va] - a.lo[va]) * (sj + 0.5) / m;
        f += ffPointPoly(q[0], q[1], q[2], a.n[0], a.n[1], a.n[2], b.v);
      }
      f /= m * m; F[i * n + j] = f; F[j * n + i] = f * a.area / b.area;
    }
  }
  let closureMin = 9, closureMax = 0;
  for (let i = 0; i < n; i++) { let row = 0; for (let j = 0; j < n; j++) row += F[i * n + j];
    closureMin = Math.min(closureMin, row); closureMax = Math.max(closureMax, row);
    if (row > 0) for (let j = 0; j < n; j++) F[i * n + j] /= row; } // caixa fechada: Σ_j F_ij = 1 (conservação)
  return storeGeom(key, { P, n, F, size, closure: [closureMin, closureMax] });
}
/** Fatores de forma da sala (para transferir do Worker): {key, n, F (cópia), closure}. */
export function geometryData(room) { const g = geometry(room); return { key: geomKey(room), n: g.n, F: g.F.slice(), closure: g.closure }; }
/** Instala no cache fatores de forma calculados noutro thread (evita travar a thread principal ao mudar a sala). */
export function primeGeometry(room, data) {
  const key = geomKey(room); if (geomCache.has(key) || !data || data.key !== key) return false;
  const { P, size } = buildPatches(room); if (P.length !== data.n) return false;
  storeGeom(key, { P, n: P.length, F: data.F, size, closure: data.closure }); return true;
}
export const hasGeometry = (room) => geomCache.has(geomKey(room));

// ---------------------------------------------------------------- solução de radiosidade (cacheada)
const solCache = new Map();
let last = { lums: null, room: null, spec: null, ver: -1, S: null };
function solKey(lums, room, spec) {
  const t = resolveType(spec);
  return [room.L, room.W, room.H, t.id, t.dist, t.phiC, t.flux, t.lor, t.dim ?? 1, t.on !== false, t.config, t.mf ?? MF, t.lenM, t.widM, t.drop, t.lines,
    t.config === 6 && !lums.length ? luminousCount(t) : '', REFLECT.ceiling, REFLECT.walls, REFLECT.floor, version, OPENINGS.length, +t.daylight || 0, t.daylightLux || '',
    t.lumFactors ? JSON.stringify(t.lumFactors) : '',
    lums.map((l) => `${(+l.x).toFixed(3)},${(+l.z).toFixed(3)},${(+l.len).toFixed(3)},${l.axis}`).join(';')].join('|');
}
/** Resolve (ou devolve do cache) a radiosidade para (sala, luminárias, spec). Exposto para testes/diagnóstico. */
export function solve(lums, room, spec) {
  if (last.S && last.lums === lums && last.room === room && last.spec === spec && last.ver === version) return last.S;
  const key = solKey(lums, room, spec); let S = solCache.get(key);
  if (!S) {
    const t0 = now(), t = resolveType(spec), G = geometry(room), { P, n, F } = G;
    const EL = buildElements(lums, room, t);
    const luminous = !lums.length && t.config === 6 && t.on !== false;
    const Mday = Math.max(0, +t.daylight || 0) * (+t.daylightLux || DAYLIGHT.extLux) * DAYLIGHT.vertRatio * DAYLIGHT.tau;
    let daylit = false;
    const rho = new Float64Array(n), Em = new Float64Array(n), E0 = new Float64Array(n);
    let fluxSurf = 0, daylightFlux = 0;
    for (let i = 0; i < n; i++) {
      const p = P[i];
      if (p.surf === 'wall') { const w = wallMix(p, room); rho[i] = w.rho; if (Mday > 0 && w.win > 0) { Em[i] += w.win * Mday; daylit = true; } }
      else rho[i] = p.surf === 'ceiling' ? (luminous ? LUMINOUS_CEILING_RHO : REFLECT.ceiling) : REFLECT.floor;
      if (EL.n) { // irradiância direta média no patch (subamostragem 3×3; 6×6 perto das luminárias)
        const near = p.surf === 'ceiling' || (p.hi[1] > room.H - 0.6 && p.surf === 'wall');
        const m = near ? 4 : 2; let e = 0;
        for (let a = 0; a < m; a++) for (let b = 0; b < m; b++) {
          const q = [p.c[0], p.c[1], p.c[2]];
          q[p.uA] = p.lo[p.uA] + (p.hi[p.uA] - p.lo[p.uA]) * (a + 0.5) / m; q[p.vA] = p.lo[p.vA] + (p.hi[p.vA] - p.lo[p.vA]) * (b + 0.5) / m;
          e += directAt(q[0], q[1], q[2], p.n[0], p.n[1], p.n[2], EL);
        }
        E0[i] = e / (m * m); fluxSurf += E0[i] * p.area;
      }
      if (luminous && p.surf === 'ceiling') Em[i] = emittedFlux(t) * luminousCount(t) / (room.L * room.W);
      if (Em[i]) daylightFlux += p.surf === 'wall' ? Em[i] * p.area : 0;
    }
    // Gauss–Seidel: B_i = Em_i + ρ_i·(E0_i + Σ_j F_ij·B_j)
    const B = new Float64Array(n); for (let i = 0; i < n; i++) B[i] = Em[i] + rho[i] * E0[i];
    let it = 0, delta = 1;
    for (; it < 200 && delta > 1e-7; it++) {
      let maxB = 1e-9; delta = 0;
      for (let i = 0; i < n; i++) {
        let s = 0; const row = i * n; for (let j = 0; j < n; j++) s += F[row + j] * B[j];
        const nb = Em[i] + rho[i] * (E0[i] + s); delta = Math.max(delta, Math.abs(nb - B[i])); B[i] = nb; maxB = Math.max(maxB, nb);
      }
      delta /= maxB;
    }
    const emitted = EL.n ? emittedFlux(t) * lums.length : (luminous ? emittedFlux(t) * luminousCount(t) : 0);
    S = { EL, G, B, rho, E0, Em, iterations: it, emitted, fluxSurf, daylightFlux, ms: now() - t0, luminous, daylit, plane: room.plane ?? 0.75 };
    if (solCache.size > 12) solCache.delete(solCache.keys().next().value);
    solCache.set(key, S);
  }
  last = { lums, room, spec, ver: version, S };
  return S;
}
/** Refletância efetiva de um patch de parede: mistura por área com as aberturas (janelas/porta). */
function wallMix(p, room) {
  const wall = p.axis === 0 ? (p.sgn > 0 ? 'left' : 'right') : (p.sgn > 0 ? 'back' : 'front');
  let cov = 0, acc = 0, win = 0;
  for (const o of OPENINGS) {
    if (o.wall !== wall) continue;
    const span = wall === 'left' || wall === 'right' ? room.L : room.W, c = -span / 2 + o.at * span;
    const a0 = Math.max(p.lo[p.uA], c - o.w / 2), a1 = Math.min(p.hi[p.uA], c + o.w / 2);
    const b0 = Math.max(p.lo[1], o.y0), b1 = Math.min(p.hi[1], Math.min(o.y1, room.H));
    if (a1 > a0 && b1 > b0) { const f = (a1 - a0) * (b1 - b0) / p.area; cov += f; acc += f * o.rho; if (o.kind === 'janela') win += f; }
  }
  cov = Math.min(1, cov); return { rho: REFLECT.walls * (1 - cov) + acc, win: Math.min(1, win) };
}
const now = () => (globalThis.performance?.now ? performance.now() : Date.now());

/** Iluminância indireta (lux) num ponto com sensor horizontal voltado para cima, a partir da radiosidade B. */
function indirectAt(px, py, pz, S) {
  const { P, n } = S.G, B = S.B; let E = 0; const V = new Float64Array(12);
  for (let j = 0; j < n; j++) {
    const b = B[j]; if (b <= 0) continue; const p = P[j];
    if (p.hi[1] <= py + 1e-6) continue; // abaixo do plano do sensor
    let ylo = p.lo[1], cy = p.c[1], area = p.area, verts = p.v;
    if (p.axis !== 1 && ylo < py) { // parede atravessando o plano do sensor: recorta a parte de cima
      ylo = py + 1e-6; cy = (ylo + p.hi[1]) / 2; area = p.area * (p.hi[1] - ylo) / (p.hi[1] - p.lo[1]);
      for (let k = 0; k < 12; k++) V[k] = p.v[k];
      for (let k = 1; k < 12; k += 3) if (V[k] < ylo) V[k] = ylo;
      verts = V;
    }
    const dx = p.c[0] - px, dy = cy - py, dz = p.c[2] - pz, r2 = dx * dx + dy * dy + dz * dz, r = Math.sqrt(r2);
    if (r < 3 * p.dim) E += b * ffPointPoly(px, py, pz, 0, 1, 0, verts);
    else { const cp = dy / r, cj = -(p.n[0] * dx + p.n[1] * dy + p.n[2] * dz) / r; if (cp > 0 && cj > 0) E += b * area * cp * cj / (PI * r2); }
  }
  return E;
}

/** Iluminância horizontal (lux) num ponto (x, y, z): direta + indireta (radiosidade). */
export function illuminanceAt(x, y, z, lums, room, spec) {
  if (!room || !(room.H > y)) return 0;
  if (spec?.on === false && !(spec.daylight > 0)) return 0;
  const S = solve(lums || [], room, spec || {});
  if (!S.EL.n && !S.luminous && !S.daylit) return 0;
  return directAt(x, y, z, 0, 1, 0, S.EL) + indirectAt(x, y, z, S);
}
/** Componentes separadas {direct, indirect, total} — útil para o painel didático. */
export function illuminanceParts(x, y, z, lums, room, spec) {
  if (spec?.on === false && !(spec.daylight > 0)) return { direct: 0, indirect: 0, total: 0 };
  const S = solve(lums || [], room, spec || {});
  const d = S.EL.n ? directAt(x, y, z, 0, 1, 0, S.EL) : 0, i = (S.EL.n || S.luminous || S.daylit) ? indirectAt(x, y, z, S) : 0;
  return { direct: d, indirect: i, total: d + i };
}

/**
 * Grade de iluminância no plano de trabalho (centros de células de ≈step m cobrindo a sala toda).
 * Retorna {xs, zs, nx, nz, y, E: Float32Array (E[j*nx+i] ↔ zs[j], xs[i]), Emin, Emax, Emed (média por área), U0 = Emin/Emed}.
 */
export function computeGrid(lums, room, spec, step = 0.25, opts = {}) {
  const y = opts.y ?? room.plane ?? 0.75;
  const nx = opts.nx || Math.max(2, Math.round(room.W / step)), nz = opts.nz || Math.max(2, Math.round(room.L / step));
  const xs = Array.from({ length: nx }, (_, i) => -room.W / 2 + (i + 0.5) * room.W / nx);
  const zs = Array.from({ length: nz }, (_, j) => -room.L / 2 + (j + 0.5) * room.L / nz);
  const E = new Float32Array(nx * nz); let mn = Infinity, mx = -Infinity, s = 0;
  const on = spec?.on !== false || spec?.daylight > 0, S = on ? solve(lums || [], room, spec || {}) : null, lit = S && (S.EL.n || S.luminous || S.daylit);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const e = lit ? directAt(xs[i], y, zs[j], 0, 1, 0, S.EL) + indirectAt(xs[i], y, zs[j], S) : 0;
    E[j * nx + i] = e; if (e < mn) mn = e; if (e > mx) mx = e; s += e;
  }
  const Emed = s / (nx * nz);
  return { xs, zs, nx, nz, y, E, Emin: mn, Emax: mx, Emed, U0: Emed > 0 ? mn / Emed : 0 };
}

/** Diagnóstico da solução (balanço de fluxo, nº de iterações, fechamento dos fatores de forma). */
export function diagnostics(lums, room, spec) {
  const S = solve(lums || [], room, spec || {});
  const bySurf = {}; S.G.P.forEach((p, i) => { bySurf[p.surf] = (bySurf[p.surf] || 0) + S.E0[i] * p.area; });
  return { patches: S.G.n, patchSize: S.G.size, closure: S.G.closure, iterations: S.iterations, emitted: S.emitted, directOnSurfaces: S.fluxSurf, bySurf, ms: S.ms };
}

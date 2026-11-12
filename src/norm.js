// NHO-11 (Fundacentro, 2018) — núcleo normativo do simulador.
// Dono: ORQUESTRADOR. Funções puras (sem Three.js) — testadas por tools/norm_test.mjs.
//
// Sistema de coordenadas (metros): origem no centro do piso; X = largura W (parede esquerda x=-W/2, janelas);
// Z = comprimento L (z=-L/2 = parede do fundo/“topo” do croqui; z=+L/2 = parede da porta/“base” do croqui); Y para cima.
// “Fila” (NHO) = linha de luminárias ao longo do comprimento (Z). N = luminárias por fila, M = número de filas.
// Convenção dos pontos idêntica à Figura A7 (Anexo 4) e ao croqui da planilha de referência:
//   q nas paredes de topo (z = ±L/2), t nas paredes laterais (x = ±W/2), p em cantos opostos, r em dois vãos centrais.

export const CONFIGS = [
  { id: 1, short: 'Fileiras regulares (2+)', name: 'Área retangular com fontes de padrão regular, simetricamente espaçadas em duas ou mais fileiras', fig: 'A1',
    points: ['p1', 'p2', 't1', 't2', 't3', 't4', 'q1', 'q2', 'q3', 'q4', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8'],
    formula: 'Ē = [R·(N−1)·(M−1) + Q·(N−1) + T·(M−1) + P] / (N·M)', layout: 'grid' },
  { id: 2, short: 'Luminária central', name: 'Área retangular com luminária central', fig: 'A2',
    points: ['p1', 'p2', 'p3', 'p4'], formula: 'Ē = P = (p1 + p2 + p3 + p4) / 4', layout: 'central' },
  { id: 3, short: 'Linha única', name: 'Área retangular com linha única de luminárias', fig: 'A3',
    points: ['p1', 'p2', 'q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8'], formula: 'Ē = [Q·(N−1) + P] / N', layout: 'single' },
  { id: 4, short: 'Linhas contínuas (2+)', name: 'Área retangular com duas ou mais linhas contínuas de luminárias', fig: 'A4',
    points: ['p1', 'p2', 't1', 't2', 't3', 't4', 'q1', 'q2', 'r1', 'r2', 'r3', 'r4'],
    formula: 'Ē = [R·N·(M−1) + Q·N + T·(M−1) + P] / [M·(N+1)]', layout: 'continuous' },
  { id: 5, short: 'Uma linha contínua', name: 'Área retangular com uma linha contínua de luminárias', fig: 'A5',
    points: ['p1', 'p2', 'q1', 'q2', 'q3', 'q4', 'q5', 'q6'], formula: 'Ē = [Q·N + P] / (N+1)', layout: 'continuous1' },
  { id: 6, short: 'Teto luminoso', name: 'Área retangular com teto luminoso (ex.: iluminação indireta)', fig: 'A6',
    points: ['p1', 'p2', 't1', 't2', 'q1', 'q2', 'r1', 'r2', 'r3', 'r4'],
    formula: 'Ē = [R·(L−2,4)·(W−2,4) + 2,4·Q·(L−2,4) + 2,4·T·(W−2,4) + 5,76·P] / (W·L)', layout: 'luminous' },
];
export const configById = (id) => CONFIGS.find((c) => c.id === +id) || CONFIGS[0];

// Escala de iluminância (item 5.1)
export const ESCALA = [20, 30, 50, 75, 100, 150, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 5000];

/** Sugere a configuração do Anexo 1 a partir do arranjo. */
export function suggestConfig(N, M, kind = 'discrete') {
  if (kind === 'luminous') return 6;
  if (kind === 'continuous') return M >= 2 ? 4 : 5;
  if (N <= 1 && M <= 1) return 2;
  if (M <= 1 || N <= 1) return 3;
  return 1;
}

const mid = (a, b) => (a + b) / 2;
const clampI = (i, n) => Math.max(0, Math.min(n - 1, i));

/**
 * Posições das luminárias. Retorna [{id,x,z,len,wid,axis,row,col}] — axis 'x' (barra transversal, como na foto/croqui)
 * ou 'z' (linha contínua ao longo do comprimento). len/wid em metros (tamanho do corpo, não da luz).
 * room = {L,W,H}; arr = {N, M, config, lumLen=1.24, lumWid=0.09, wallGapZ?, wallGapX?}
 */
export function layoutLuminaires(room, arr) {
  const { L, W } = room; const cfg = configById(arr.config);
  let N = Math.max(1, arr.N | 0), M = Math.max(1, arr.M | 0);
  const lumLen = arr.lumLen ?? 1.24, lumWid = arr.lumWid ?? 0.09;
  const out = [];
  if (cfg.layout === 'central') { out.push({ id: 'L1', x: 0, z: 0, len: lumLen, wid: lumWid, axis: 'x', row: 0, col: 0 }); return out; }
  if (cfg.layout === 'luminous') return out; // teto luminoso: sem luminárias discretas
  if (cfg.layout === 'single') M = 1;
  if (cfg.layout === 'continuous1') M = 1;
  const xs = cols(W, M);
  if (cfg.layout === 'continuous' || cfg.layout === 'continuous1') {
    // N luminárias encostadas ponta a ponta ao longo de Z, linha centrada, ocupando ~70% de L (máx L−1,2 m)
    const seg = Math.min(lumLen, (L - 1.2) / N);
    const z0 = -seg * N / 2;
    xs.forEach((x, c) => { for (let i = 0; i < N; i++) out.push({ id: `L${c + 1}.${i + 1}`, x, z: z0 + seg * (i + 0.5), len: seg, wid: lumWid, axis: 'z', row: i, col: c }); });
    return out;
  }
  const zs = rows(L, N);
  xs.forEach((x, c) => zs.forEach((z, i) => out.push({ id: `L${c + 1}.${i + 1}`, x, z, len: lumLen, wid: lumWid, axis: 'x', row: i, col: c })));
  return out;
}
export const rows = (L, N) => Array.from({ length: N }, (_, i) => -L / 2 + (L / N) * (i + 0.5));
export const cols = (W, M) => Array.from({ length: M }, (_, j) => -W / 2 + (W / M) * (j + 0.5));

/**
 * Pontos de medição (no plano de trabalho). Retorna [{id:'p1', group:'P', x, z, label:'P1', note}].
 * As marcações no teto são a projeção vertical (x, H, z).
 */
export function measurementPoints(room, arr) {
  const { L, W } = room; const cfg = configById(arr.config);
  const N = Math.max(1, arr.N | 0), M = Math.max(1, arr.M | 0);
  const P = [];
  const add = (id, x, z, note) => P.push({ id, group: id[0].toUpperCase(), label: id.toUpperCase(), x: +x.toFixed(3), z: +z.toFixed(3), note });

  if (cfg.layout === 'grid') {
    const xs = cols(W, Math.max(2, M)), zs = rows(L, Math.max(2, N));
    const nz = zs.length, nx = xs.length;
    const zE0 = mid(-L / 2, zs[0]), zE1 = mid(L / 2, zs[nz - 1]);
    const xE0 = mid(-W / 2, xs[0]), xE1 = mid(W / 2, xs[nx - 1]);
    const bA = Math.max(0, Math.floor((nz - 1) / 2) - 1);           // primeiro vão central (ao longo de Z)
    const j0 = Math.max(0, Math.floor((nx - 2) / 2));               // vão central (ao longo de X)
    const xa = xs[j0], xb = xs[j0 + 1], xm = mid(xa, xb);
    const z = (i) => zs[clampI(i, nz)];
    const zm = (i) => (i + 1 < nz ? mid(zs[i], zs[i + 1]) : mid(zs[nz - 1], L / 2));
    // P1 junto à porta e P2 no canto oposto, como no croqui da planilha do usuário (a média P não muda)
    add('p1', xE1, zE1, 'Canto: centro do retângulo entre o canto e a luminária mais próxima');
    add('p2', xE0, zE0, 'Canto oposto ao P1');
    const k = clampI(bA + 1, nz);
    add('t1', xE0, zm(k), 'Parede lateral: entre duas luminárias da fila, a meia distância da parede');
    add('t2', xE0, z(k), 'Parede lateral: alinhado à luminária, a meia distância da parede');
    const k2 = clampI(k + 1, nz);
    add('t3', xE1, z(k2), 'Parede lateral oposta: alinhado à luminária');
    add('t4', xE1, zm(Math.min(k2, nz - 2)), 'Parede lateral oposta: entre duas luminárias da fila');
    add('q1', xm, zE0, 'Parede de topo: entre as filas, a meia distância da parede');
    add('q2', xb, zE0, 'Parede de topo: alinhado à luminária');
    add('q3', xm, zE1, 'Parede de topo oposta: entre as filas');
    add('q4', xb, zE1, 'Parede de topo oposta: alinhado à luminária');
    add('r1', xa, z(bA), 'Vão central 1: sob a luminária');
    add('r2', xm, z(bA), 'Vão central 1: entre luminárias de filas vizinhas');
    add('r3', xm, zm(bA), 'Vão central 1: centro das quatro luminárias');
    add('r4', xb, zm(bA), 'Vão central 1: entre luminárias da mesma fila');
    const b2 = nz >= 3 ? bA + 1 : bA;
    add('r5', xb, z(b2 + 1), 'Vão central 2: sob a luminária');
    add('r6', xb, zm(b2), 'Vão central 2: entre luminárias da mesma fila');
    add('r7', xm, z(b2), 'Vão central 2: entre luminárias de filas vizinhas');
    add('r8', xm, zm(b2), 'Vão central 2: centro das quatro luminárias');
  } else if (cfg.layout === 'central') {
    add('p1', -W / 4, -L / 4, 'Centro do quadrante 1'); add('p2', W / 4, -L / 4, 'Centro do quadrante 2');
    add('p3', -W / 4, L / 4, 'Centro do quadrante 3'); add('p4', W / 4, L / 4, 'Centro do quadrante 4');
  } else if (cfg.layout === 'single') {
    const zs = rows(L, Math.max(2, N)); const nz = zs.length;
    const zm = (i) => mid(zs[clampI(i, nz)], zs[clampI(i + 1, nz)]);
    const a = 0, b = Math.max(0, nz - 2), c = Math.max(0, Math.floor((nz - 2) / 2)), d = Math.max(0, Math.ceil((nz - 2) / 2));
    const xl = -W / 4, xr = W / 4;
    add('p1', xr, mid(-L / 2, zs[0]), 'Extremidade da linha: entre a parede de topo e a 1ª luminária');
    add('p2', xl, mid(L / 2, zs[nz - 1]), 'Extremidade oposta da linha');
    add('q1', xl, zm(a), 'Entre duas luminárias, a meia distância da parede'); add('q2', xl, zs[clampI(a + 1, nz)], 'Alinhado à luminária');
    add('q3', xl, zm(c === a ? Math.min(b, a + 1) : c), 'Entre duas luminárias'); add('q4', xl, zs[clampI((c === a ? Math.min(b, a + 1) : c) + 1, nz)], 'Alinhado à luminária');
    add('q5', xr, zm(d), 'Entre duas luminárias (lado oposto)'); add('q6', xr, zs[clampI(d + 1, nz)], 'Alinhado à luminária');
    add('q7', xr, zm(b), 'Entre duas luminárias (lado oposto)'); add('q8', xr, zs[clampI(b + 1, nz)], 'Alinhado à luminária');
  } else if (cfg.layout === 'continuous') {
    const xs = cols(W, Math.max(2, M)); const nx = xs.length;
    const lum = layoutLuminaires(room, { ...arr, M: nx }); const zEnd = Math.max(...lum.map((l) => l.z + l.len / 2));
    const zE0 = mid(-L / 2, -zEnd), zE1 = mid(L / 2, zEnd);
    const j0 = Math.max(0, Math.floor((nx - 2) / 2)); const xa = xs[j0], xb = xs[j0 + 1], xm = mid(xa, xb);
    add('p1', mid(-W / 2, xs[0]), zE0, 'Canto'); add('p2', mid(W / 2, xs[nx - 1]), zE1, 'Canto oposto');
    add('t1', xm, zE0, 'Parede de topo: entre duas linhas'); add('t2', xa, zE0, 'Parede de topo: no prolongamento da linha');
    add('t3', xm, zE1, 'Parede de topo oposta: entre linhas'); add('t4', xb, zE1, 'Parede de topo oposta: no prolongamento da linha');
    add('q1', mid(-W / 2, xs[0]), -L * 0.07, 'Parede lateral: entre a parede e a 1ª linha');
    add('q2', mid(W / 2, xs[nx - 1]), L * 0.07, 'Parede lateral oposta');
    add('r1', xm, -L * 0.10, 'Centro: entre linhas'); add('r2', xm, L * 0.12, 'Centro: entre linhas');
    add('r3', mid(xm, xb), -L * 0.04, 'Centro: junto à linha'); add('r4', mid(xm, xb), L * 0.18, 'Centro: junto à linha');
  } else if (cfg.layout === 'continuous1') {
    const lum = layoutLuminaires(room, { ...arr, M: 1 }); const zEnd = Math.max(...lum.map((l) => l.z + l.len / 2));
    const xl = -W / 4, xr = W / 4;
    add('p1', xl, mid(-L / 2, -zEnd), 'Canto além da extremidade da linha'); add('p2', xr, mid(L / 2, zEnd), 'Canto oposto');
    [-zEnd / 2, 0, zEnd / 2].forEach((z, i) => add(`q${i + 1}`, xl, z, 'Lateral, em ¼ do comprimento da linha'));
    [-zEnd / 2, 0, zEnd / 2].forEach((z, i) => add(`q${i + 4}`, xr, z, 'Lateral oposta, em ¼ do comprimento da linha'));
  } else if (cfg.layout === 'luminous') {
    const e = 0.6;
    add('p1', -W / 2 + e, -L / 2 + e, 'Canto, a 0,60 m das duas paredes'); add('p2', W / 2 - e, L / 2 - e, 'Canto oposto');
    add('t1', W * 0.12, -L / 2 + e, 'A 0,60 m da parede de topo'); add('t2', -W * 0.08, L / 2 - e, 'A 0,60 m da parede de topo oposta');
    add('q1', -W / 2 + e, L * 0.10, 'A 0,60 m da parede lateral'); add('q2', W / 2 - e, -L * 0.14, 'A 0,60 m da parede lateral oposta');
    add('r1', -W * 0.06, -L * 0.16, 'Área central'); add('r2', -W * 0.18, L * 0.04, 'Área central');
    add('r3', W * 0.16, -L * 0.02, 'Área central'); add('r4', W * 0.06, L * 0.18, 'Área central');
  }
  return P;
}

const avg = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
const num = (v) => (v === '' || v == null || !isFinite(+v) ? null : +v);

/**
 * Cálculo da iluminância média (Anexo 1). values = {p1: 293, ...}. Retorna
 * {ok, missing:[ids], groups:{P,T,Q,R}, E, formula, expanded}
 */
export function computeIM(configId, values, { N, M, L, W }) {
  const cfg = configById(configId);
  const missing = cfg.points.filter((id) => num(values[id]) == null);
  const g = {};
  for (const G of ['P', 'T', 'Q', 'R']) {
    const ids = cfg.points.filter((id) => id[0].toUpperCase() === G);
    if (!ids.length) continue;
    const v = ids.map((id) => num(values[id])).filter((x) => x != null);
    g[G] = v.length === ids.length ? avg(v) : NaN;
  }
  const { P, T, Q, R } = g;
  let E = NaN, expanded = '';
  const f = (x) => (isFinite(x) ? fmt(x, 2) : '—');
  switch (cfg.id) {
    case 1: E = (R * (N - 1) * (M - 1) + Q * (N - 1) + T * (M - 1) + P) / (N * M);
      expanded = `[${f(R)}·(${N}−1)·(${M}−1) + ${f(Q)}·(${N}−1) + ${f(T)}·(${M}−1) + ${f(P)}] / (${N}·${M})`; break;
    case 2: E = P; expanded = `(p1 + p2 + p3 + p4) / 4 = ${f(P)}`; break;
    case 3: E = (Q * (N - 1) + P) / N; expanded = `[${f(Q)}·(${N}−1) + ${f(P)}] / ${N}`; break;
    case 4: E = (R * N * (M - 1) + Q * N + T * (M - 1) + P) / (M * (N + 1));
      expanded = `[${f(R)}·${N}·(${M}−1) + ${f(Q)}·${N} + ${f(T)}·(${M}−1) + ${f(P)}] / [${M}·(${N}+1)]`; break;
    case 5: E = (Q * N + P) / (N + 1); expanded = `[${f(Q)}·${N} + ${f(P)}] / (${N}+1)`; break;
    case 6: E = (R * (L - 2.4) * (W - 2.4) + 2.4 * Q * (L - 2.4) + 2.4 * T * (W - 2.4) + 5.76 * P) / (W * L);
      expanded = `[${f(R)}·(${fmt(L, 2)}−2,4)·(${fmt(W, 2)}−2,4) + 2,4·${f(Q)}·(${fmt(L, 2)}−2,4) + 2,4·${f(T)}·(${fmt(W, 2)}−2,4) + 5,76·${f(P)}] / (${fmt(W, 2)}·${fmt(L, 2)})`; break;
  }
  return { ok: missing.length === 0 && isFinite(E), missing, groups: g, E, formula: cfg.formula, expanded };
}

/**
 * Avaliação conforme item 5 da NHO-11 + faixas da planilha de referência.
 * ctx = {E (média), Emin (Quadro 1), values (todos os pontos), task:[lux...] (área da tarefa, opcional), continuous:bool}
 */
/** Condição da medição (item 6.2 da NHO-11): período e céu. */
export const CONDICOES = {
  periodo: [{ id: 'noturno', label: 'Noturna' }, { id: 'diurno', label: 'Diurna' }],
  ceu: [{ id: 'nublado', label: 'Nublado' }, { id: 'ensolarado', label: 'Ensolarado' }],
};
export function condicaoMedicao({ periodo = 'noturno', ceu = 'nublado', atividadeNoturna = false } = {}) {
  if (periodo === 'noturno') return { ok: true, nivel: 'ok', texto: 'Medição noturna: o iluminamento depende somente das fontes instaladas (condição mais desfavorável — item 6.2 da NHO-11).' };
  if (ceu === 'nublado') return { ok: true, nivel: atividadeNoturna ? 'alerta' : 'ok',
    texto: 'Medição diurna com céu nublado: aceita pelo item 6.2 da NHO-11 como condição desfavorável, com janelas e cortinas como no uso normal; avaliar reflexos e ofuscamento da luz natural (Anexo 2).'
      + (atividadeNoturna ? ' Como há atividades noturnas no ambiente, as medições também devem ser feitas à noite.' : '') };
  return { ok: false, nivel: 'invalida', texto: 'Medição diurna com céu ensolarado: a luz natural eleva as leituras e o resultado NÃO representa a iluminação instalada. O item 6.2 da NHO-11 exige medir na condição mais desfavorável (dia nublado ou à noite); repetir a avaliação. Verificar também ofuscamento e reflexos causados pelo sol (Anexo 2).' };
}

export function evaluate({ E, Emin, values = {}, task = [], continuous = true, periodo = 'noturno', ceu = 'nublado', atividadeNoturna = false }) {
  const res = { checks: [], verdict: 'incompleto' };
  res.condicao = condicaoMedicao({ periodo, ceu, atividadeNoturna });
  if (!isFinite(E)) return res;
  const pts = Object.values(values).map(num).filter((v) => v != null);
  const taskV = (task.length ? task : pts).map(num).filter((v) => v != null);
  const lim70 = 0.7 * E;
  const minReq = Emin * 0.9; // tolerância de 10% abaixo do Quadro 1
  const push = (id, label, ok, detail) => res.checks.push({ id, label, ok, detail });
  push('emin', `Iluminância média ≥ E do Quadro 1 (${fmt(Emin, 0)} lux, tolerância de −10% = ${fmt(minReq, 0)} lux)`, E >= minReq,
    `Ē = ${fmt(E, 1)} lux ${E >= Emin ? '≥' : E >= minReq ? 'dentro da tolerância de' : '<'} ${fmt(E >= Emin ? Emin : minReq, 0)} lux`);
  const minPt = Math.min(...taskV), maxPt = Math.max(...taskV);
  push('70', `Pontos da área da tarefa ≥ 70% de Ē (${fmt(lim70, 1)} lux)`, minPt >= lim70,
    `Menor leitura ${task.length ? 'na tarefa' : 'medida'}: ${fmt(minPt, 1)} lux`);
  const ratioOk = maxPt > 2500 ? null : maxPt / E <= 5;
  push('5:1', 'Razão maior leitura / Ē ≤ 5:1', ratioOk, maxPt > 2500 ? '> 2.500 lux: avaliar caso a caso (contraste)' : `${fmt(maxPt / E, 2)} : 1`);
  if (task.length) {
    const tmin = Math.min(...taskV);
    push('tarefa', `Leituras da área da tarefa ≥ E do Quadro 1 (${fmt(Emin, 0)} lux, −10% = ${fmt(minReq, 0)} lux)`, tmin >= minReq,
      `Menor leitura na tarefa: ${fmt(tmin, 1)} lux`);
  } else {
    res.note = 'Sem leituras da área da tarefa: os critérios de 70% de Ē, 5:1 e 200 lux foram aplicados às leituras da malha do Anexo 1.';
  }
  if (continuous) push('200', 'Tarefas contínuas: nenhuma leitura < 200 lux', minPt >= 200, `Menor leitura: ${fmt(minPt, 1)} lux`);
  push('condicao', `Condição da medição (item 6.2): ${periodo === 'noturno' ? 'noturna' : `diurna, céu ${ceu}`}`, res.condicao.ok, res.condicao.texto);
  const fails = res.checks.filter((c) => c.ok === false && c.id !== 'condicao').length;
  // Medição sob sol: as leituras incluem luz natural — não se conclui sobre a iluminação instalada.
  res.verdict = !res.condicao.ok ? 'inconclusivo' : fails ? 'nao-atende' : 'atende';
  res.bands = { E15: [E * 0.85, E * 1.15], lim70, lim70_15: [lim70 * 0.85, lim70 * 1.15], minReq };
  return res;
}

/** Entorno imediato (Tabela 1) quando há iluminação suplementar. */
export function entornoImediato(Etarefa) {
  if (Etarefa >= 750) return 500; if (Etarefa >= 500) return 300; if (Etarefa >= 300) return 200; return Etarefa;
}

export function fmt(v, d = 1) {
  if (!isFinite(v)) return '—';
  return (+v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
}

// Conjuntos de exemplo (para botões “carregar exemplo”)
export const EXEMPLOS = {
  planilha: { label: 'Planilha de referência (sala 9,16 × 5,90 m, noite)', room: { L: 9.16, W: 5.9 }, N: 4, M: 2, config: 1, Emin: 500,
    values: { p1: 293, p2: 124.7, t1: 333.1, t2: 310.5, t3: 220.9, t4: 188.2, q1: 187, q2: 246, q3: 204.2, q4: 158.7,
      r1: 276.3, r2: 150.3, r3: 143.3, r4: 202.3, r5: 229.7, r6: 198.2, r7: 146.8, r8: 148.9 }, expectE: 203.734375 },
  anexo4: { label: 'NHO-11 Anexo 4 (sala de reuniões, 6 luminárias)', room: { L: 6.0, W: 4.5 }, N: 3, M: 2, config: 1, Emin: 500,
    values: { p1: 200, p2: 350, t1: 470, t2: 380, t3: 420, t4: 400, q1: 350, q2: 320, q3: 600, q4: 625,
      r1: 360, r2: 680, r3: 730, r4: 650, r5: 840, r6: 790, r7: 600, r8: 650 }, expectE: 494.1666666 },
};

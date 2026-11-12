// UI — condição da avaliação (período / céu, item 6.2 da NHO-11) e leituras por condição (abas DIA/NOITE da planilha). Dono: UI.
export const COND_KEYS = ['noturno', 'diurno-nublado', 'diurno-ensolarado'];
export const COND_LABEL = { noturno: 'Noturna', 'diurno-nublado': 'Diurna · nublado', 'diurno-ensolarado': 'Diurna · ensolarado' };
export const COND_LONG = { noturno: 'avaliação noturna', 'diurno-nublado': 'avaliação diurna, céu nublado', 'diurno-ensolarado': 'avaliação diurna, céu ensolarado' };
export const COND_SHEET = { noturno: 'NOITE', 'diurno-nublado': 'DIA — CÉU NUBLADO', 'diurno-ensolarado': 'DIA — CÉU ENSOLARADO' };
export const condOf = (key) => { const [periodo, ceu = 'nublado'] = String(key).split('-'); return { periodo, ceu }; };
export function curKey(app) { if (app.condKey) return app.condKey(); const a = app.state.avaliacao || {}; return a.periodo === 'diurno' ? `diurno-${a.ceu || 'nublado'}` : 'noturno'; }
/** {chave: leituras} de todas as condições (a atual vem de state.values). */
export function allConds(app) { const S = app.state; const o = { ...(S.valuesByCond || {}) }; o[curKey(app)] = S.values; return o; }
/** results() calculado para as leituras de uma condição qualquer. */
export function resultsFor(app, values, key) {
  const S = app.state, N = app.NORM; const { periodo, ceu } = condOf(key);
  const im = N.computeIM(S.config, values || {}, { N: S.N, M: S.M, L: S.room.L, W: S.room.W });
  const ev = N.evaluate({ E: im.E, Emin: S.Emin, values: values || {}, task: S.task || [], continuous: S.continuous, periodo, ceu, atividadeNoturna: !!S.avaliacao?.atividadeNoturna });
  const area = S.room.L * S.room.W;
  return { ...im, ...ev, area, areaBand: [area * 0.97, area * 1.03], Emin: S.Emin, env: app.QUADRO1.find((e) => e.id === S.envId) };
}
/** Condições com todas as leituras (ordem: noite, dia nublado, dia ensolarado). */
export function completeConds(app) { const all = allConds(app); return COND_KEYS.filter((k) => all[k] && resultsFor(app, all[k], k).ok); }
/** Luminárias queimadas / depreciadas (spec.lumFactors) entre as luminárias atuais. */
export function lumState(app) {
  const F = app.state.lum?.lumFactors || {}; const ids = app.luminaires().map((l) => l.id);
  const off = ids.filter((id) => F[id] != null && +F[id] <= 0), dep = ids.filter((id) => F[id] != null && +F[id] > 0 && +F[id] < 1);
  const eff = ids.length ? ids.reduce((s, id) => s + Math.max(0, Math.min(1, F[id] ?? 1)), 0) / ids.length : 1;
  return { ids, off, dep, eff };
}

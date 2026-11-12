// Orquestrador — dono: ORQUESTRADOR. Liga norma (norm.js) ↔ 3D (scene/room/furniture/luminaires/markers/photometry) ↔ UI.
import * as THREE from 'three';
import { createStage } from './scene.js';
import { buildRoom } from './room.js';
import { buildFurniture } from './furniture.js';
import { buildLuminaires } from './luminaires.js';
import { buildMarkers } from './markers.js';
import { LUM_TYPES, buildIsolux, illuminanceAt } from './photometry.js';
import { createUI } from './ui.js';
import { QUADRO1 } from './norm_quadro1.js';
import * as NORM from './norm.js';

const qs = new URLSearchParams(location.search);
const canvas = document.getElementById('c');

const defaultEnv = QUADRO1.find((e) => /noturn/i.test(e.nome) && /aula/i.test(e.nome)) || QUADRO1[0];
const state = {
  room: { L: 9.16, W: 5.9, H: 2.7, plane: 0.75 },
  config: 1, N: 4, M: 2,
  lum: { type: LUM_TYPES[0].id, flux: LUM_TYPES[0].flux, cct: LUM_TYPES[0].cct, on: true, dim: 1 },
  envId: defaultEnv?.id, Emin: defaultEnv?.E ?? 500, continuous: true,
  values: {}, task: [],
  avaliacao: { periodo: 'noturno', ceu: 'nublado', atividadeNoturna: true }, valuesByCond: {},
  showPoints: false, showIsolux: false, view: 'ref1',
};

const listeners = {};
const app = {
  THREE, NORM, QUADRO1, LUM_TYPES, state,
  on(ev, fn) { (listeners[ev] ||= []).push(fn); },
  emit(ev, d) { (listeners[ev] || []).forEach((f) => { try { f(d); } catch (e) { console.error(e); } }); },
  set(patch) {
    const prevGeom = JSON.stringify([state.room, state.config, state.N, state.M]);
    // Leituras separadas por condição de avaliação (como as abas DIA / NOITE da planilha)
    const prevCond = condKey();
    deepAssign(state, patch);
    if (patch.avaliacao && condKey() !== prevCond && !('values' in patch)) {
      state.valuesByCond[prevCond] = { ...state.values };
      state.values = { ...(state.valuesByCond[condKey()] || {}) };
      patch = { ...patch, values: state.values };
    }
    if (patch.envId) { const e = QUADRO1.find((x) => x.id === patch.envId); if (e) state.Emin = e.E; }
    const geomChanged = prevGeom !== JSON.stringify([state.room, state.config, state.N, state.M]);
    if (geomChanged) { state.values = pruneValues(state.values); rebuild(); }
    else if (patch.lum || patch.avaliacao) { refreshLighting(); app.emit('daylight', state.avaliacao); }
    if ('showPoints' in patch) patch.showPoints ? identify(false) : markers?.hide();
    if ('showIsolux' in patch) isolux?.setVisible(state.showIsolux);
    if ('values' in patch && markers) markers.setValues(state.values, results().bands);
    app.emit('change', { geomChanged });
  },
  luminaires: () => NORM.layoutLuminaires(state.room, { N: state.N, M: state.M, config: state.config }),
  points: () => NORM.measurementPoints(state.room, { N: state.N, M: state.M, config: state.config }),
  results, condKey,
  identify: () => identify(true),
  simulate, loadExample, setView: (v, o) => { state.view = v; stage.setView(v, o); },
  focusPoint: (id) => {
    if (!id) return; id = String(id).toLowerCase();
    const now = performance.now(); if (id === lastFocus.id && now - lastFocus.t < 600) return; // clique + foco do campo = 1 só
    lastFocus.id = id; lastFocus.t = now; state.activePoint = id;
    if (!state.showPoints) identify(false);
    markers?.highlight(id); markers?.luxmeterTo?.(id);
    const p = app.points().find((q) => q.id === id);
    stage.setView('point:' + id, { animate: true, target: p ? { x: p.x, z: p.z } : undefined });
    app.emit('focus', id);
  },
  // Luxímetro virtual: leitura no ponto (fotocélula horizontal a 0,75 m) com ruído de instrumento ±2% e resolução 0,1 lux
  // Determinística por ponto (ruído fixo derivado do id): o visor e o valor gravado são sempre iguais.
  readLuxmeter: (id) => {
    const p = app.points().find((q) => q.id === String(id).toLowerCase()); if (!p) return NaN;
    let h = 2166136261; for (const c of p.id + state.N + 'x' + state.M) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    const noise = ((h >>> 0) / 4294967296 - 0.5) * 0.04;
    return Math.round(app.simulatedLux(p.x, p.z) * (1 + noise) * 10) / 10;
  },
  recordReading: (id) => { id = String(id || state.activePoint || '').toLowerCase(); const v = app.readLuxmeter(id); if (isFinite(v)) app.set({ values: { ...state.values, [id]: v } }); app.emit('record', { id, v }); return v; },
  simulatedLux: (x, z) => illuminanceAt(x, state.room.plane, z, app.luminaires(), state.room, lumSpec()),
};
window.__sim = app;

function condKey() { return state.avaliacao.periodo === 'noturno' ? 'noturno' : `diurno-${state.avaliacao.ceu}`; }
function deepAssign(t, s) { for (const k in s) { if (s[k] && typeof s[k] === 'object' && !Array.isArray(s[k]) && t[k] && typeof t[k] === 'object') deepAssign(t[k], s[k]); else t[k] = s[k]; } }
function pruneValues(v) { const ids = new Set(NORM.configById(state.config).points); const o = {}; for (const k in v) if (ids.has(k)) o[k] = v[k]; return o; }
function lumSpec() { const t = LUM_TYPES.find((x) => x.id === state.lum.type) || LUM_TYPES[0]; return { ...t, ...state.lum, config: state.config, count: state.N * state.M,
  // condição da avaliação → luz natural (FOTOMETRIA: daylight 1 = céu nublado ≈10 klx; ensolarado ≈2,5×, sky='ensolarado' ativa manchas de sol)
  period: state.avaliacao.periodo, sky: state.avaliacao.ceu,
  daylight: state.avaliacao.periodo === 'diurno' ? (state.avaliacao.ceu === 'ensolarado' ? 2.5 : 1) : 0 }; }

function results() {
  const { N, M, room } = state;
  const im = NORM.computeIM(state.config, state.values, { N, M, L: room.L, W: room.W });
  const ev = NORM.evaluate({ E: im.E, Emin: state.Emin, values: state.values, task: state.task, continuous: state.continuous, ...state.avaliacao });
  const area = room.L * room.W;
  return { ...im, ...ev, area, areaBand: [area * 0.97, area * 1.03], Emin: state.Emin, env: QUADRO1.find((e) => e.id === state.envId) };
}

// ---------- 3D ----------
const stage = createStage(canvas, { quality: qs.get('q') || 'alta', still: qs.get('still') === '1' });
let room, furniture, lums, markers, isolux;
const safe = (name, fn) => { try { return fn(); } catch (e) { console.error(`[${name}]`, e); return null; } };
room = safe('room', () => buildRoom(stage, state.room));
furniture = safe('furniture', () => buildFurniture(stage, state.room));
lums = safe('luminaires', () => buildLuminaires(stage));
markers = safe('markers', () => buildMarkers(stage));
isolux = safe('isolux', () => buildIsolux(stage));
const lastFocus = { id: null, t: 0 };
markers?.onPick?.((id) => { app.focusPoint(id); app.emit('pick', id); });

function rebuild() {
  stage.setRoom?.(state.room);
  safe('room.update', () => room?.update(state.room));
  safe('furniture.update', () => furniture?.update(state.room, app.luminaires()));
  refreshLighting();
  if (state.showPoints) identify(false); else markers?.hide();
}
function refreshLighting() {
  const list = app.luminaires(); const spec = lumSpec();
  safe('luminaires.update', () => { lums?.update(list, state.room, spec); lums?.setOn(state.lum.on); });
  safe('isolux.update', () => { isolux?.update(list, state.room, spec); isolux?.setVisible(state.showIsolux); });
}
function identify(animate) {
  state.showPoints = true;
  safe('markers.show', () => { markers?.show(app.points(), state.room, { animate, config: state.config }); markers?.setValues(state.values, results().bands); });
  app.emit('identify');
}
function simulate() {
  // Leitura virtual do luxímetro em cada ponto (com ruído de instrumento ±3% e resolução de 0,1 lux)
  const v = {};
  for (const p of app.points()) { const e = app.simulatedLux(p.x, p.z); v[p.id] = Math.round(e * (1 + (Math.random() - 0.5) * 0.06) * 10) / 10; }
  app.set({ values: v });
}
function loadExample(k) {
  const e = NORM.EXEMPLOS[k]; if (!e) return;
  app.set({ room: { ...state.room, ...e.room }, config: e.config, N: e.N, M: e.M });
  app.set({ values: { ...e.values } });
}

rebuild();
safe('ui', () => createUI(document.getElementById('ui'), app));

// parâmetros de URL (capturas automáticas): cam, ui=0, pts=1, iso=1, ex=planilha, cfg, N, M, sim=1
if (qs.get('ex')) loadExample(qs.get('ex'));
['N', 'M', 'cfg'].forEach((k) => qs.get(k) && app.set(k === 'cfg' ? { config: +qs.get(k) } : { [k]: +qs.get(k) }));
if (qs.get('per') || qs.get('ceu')) app.set({ avaliacao: { periodo: qs.get('per') || state.avaliacao.periodo, ceu: qs.get('ceu') || state.avaliacao.ceu } });
if (qs.get('sim') === '1') simulate();
if (qs.get('pts') === '1') app.set({ showPoints: true });
if (qs.get('iso') === '1') app.set({ showIsolux: true });
if (qs.get('ui') === '0') document.getElementById('ui').style.display = 'none';
stage.setView(qs.get('cam') || 'ref1', { animate: false, orbit: qs.get('orbit') });
document.getElementById('boot')?.remove();

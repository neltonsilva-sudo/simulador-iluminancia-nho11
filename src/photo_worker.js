// FOTOMETRIA — Web Worker (módulo) do mapa isolux: grade de alta resolução + pixels coloridos (rampa turbo).
// Dono: FOTOMETRIA. Mensagem: {seq, lums, room, spec, reflect, mf, openings, nx, nz, cw, ch, lo, hi} → {seq, grid, rgba}.
import { computeGrid, setReflectances, setMF, setOpenings } from './photo_core.js';
import { colorizeGrid } from './photo_color.js';

let lastEnv = '';
self.onmessage = (ev) => {
  const m = ev.data;
  try {
    const env = JSON.stringify([m.reflect, m.mf, m.openings]);
    if (env !== lastEnv) { if (m.reflect) setReflectances(m.reflect); if (m.mf) setMF(m.mf); if (m.openings) setOpenings(m.openings); lastEnv = env; }
    const t0 = performance.now();
    const g = computeGrid(m.lums, m.room, m.spec, 0.25, { nx: m.nx, nz: m.nz });
    const t1 = performance.now();
    const rgba = colorizeGrid(g, m.cw, m.ch, m.range);
    self.postMessage({ seq: m.seq, grid: g, rgba, cw: m.cw, ch: m.ch, range: rgba.range, ms: [t1 - t0, performance.now() - t1] }, [g.E.buffer, rgba.data.buffer]);
  } catch (e) { self.postMessage({ seq: m.seq, error: String(e && e.stack || e) }); }
};

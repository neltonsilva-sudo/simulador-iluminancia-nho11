import { computeIM, measurementPoints, layoutLuminaires, EXEMPLOS, CONFIGS, evaluate } from '../src/norm.js';
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } };
for (const k of Object.keys(EXEMPLOS)) { const e = EXEMPLOS[k]; const r = computeIM(1, e.values, { N: e.N, M: e.M, L: e.room.L, W: e.room.W });
  console.log(k, r.E.toFixed(4), r.groups); ok(Math.abs(r.E - e.expectE) < 1e-3, k); }
const room = { L: 9.16, W: 5.9, H: 2.7 };
for (const c of CONFIGS) for (const [N, M] of [[4, 2], [2, 2], [3, 2], [1, 1], [6, 3], [8, 9], [4, 1]]) {
  const pts = measurementPoints(room, { N, M, config: c.id });
  ok(pts.length === c.points.length, `cfg${c.id} N${N} M${M} count ${pts.length}`);
  ok(pts.every(p => Math.abs(p.x) < room.W / 2 && Math.abs(p.z) < room.L / 2 && isFinite(p.x + p.z)), `cfg${c.id} inside`);
  const ids = new Set(pts.map(p => p.id)); ok(c.points.every(i => ids.has(i)), `cfg${c.id} ids`);
  layoutLuminaires(room, { N, M, config: c.id });
}
const pts = measurementPoints(room, { N: 4, M: 2, config: 1 });
console.log(pts.map(p => `${p.id}(${(p.x + room.W / 2).toFixed(2)},${(p.z + room.L / 2).toFixed(2)})`).join(' '));
const dup = new Set(pts.map(p => p.x + ',' + p.z)); ok(dup.size === pts.length, 'no duplicates 4x2');
const ev = evaluate({ E: 203.73, Emin: 500, values: EXEMPLOS.planilha.values }); console.log(ev.verdict, ev.checks.map(c => c.id + ':' + c.ok).join(' '));
console.log(fail ? `${fail} FAIL` : 'ALL OK'); process.exit(fail ? 1 : 0);

// FOTOMETRIA — rampa de cores, escala, níveis isolux e linhas de contorno (marching squares). Puro (sem DOM/THREE).
// Dono: FOTOMETRIA.

/** Turbo (Google, aprox. polinomial de A. Mikhailov) — t∈[0,1] → [r,g,b] 0..255. */
export function turbo(t) {
  t = Math.min(1, Math.max(0, t));
  const r = 0.13572138 + t * (4.61539260 + t * (-42.66032258 + t * (132.13108234 + t * (-152.94239396 + t * 59.28637943))));
  const g = 0.09140261 + t * (2.19418839 + t * (4.84296658 + t * (-14.18503333 + t * (4.27729857 + t * 2.82956604))));
  const b = 0.10667330 + t * (12.64194608 + t * (-60.58204836 + t * (110.36276771 + t * (-89.90310912 + t * 27.34824973))));
  return [255 * Math.min(1, Math.max(0, r)), 255 * Math.min(1, Math.max(0, g)), 255 * Math.min(1, Math.max(0, b))];
}
// Usa a faixa central do turbo (evita o azul-violeta e o vinho muito escuros nas pontas — mais legível translúcido).
export const T0 = 0.07, T1 = 0.93;
export const colorAt = (t) => turbo(T0 + (T1 - T0) * Math.min(1, Math.max(0, t)));

/** Escala de iluminância da NHO-11 (item 5.1). */
export const ESCALA = [20, 30, 50, 75, 100, 150, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 5000];

/** Passo “redondo” e faixa da legenda a partir de Emín/Emáx. */
export function niceRange(mn, mx) {
  if (!(mx > 0)) return { lo: 0, hi: 100, step: 25 };
  const span = Math.max(mx - mn, mx * 0.08, 1);
  const steps = [1, 2.5, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];
  let step = steps.find((s) => span / s <= 7) || 5000;
  const lo = Math.max(0, Math.floor(mn / step) * step), hi = Math.ceil(mx / step) * step;
  return { lo, hi: hi > lo ? hi : lo + step, step };
}
/** Escala de cores ANCORADA em 0 até ≥ max(Emáx, E exigido pelo Quadro 1): 210 lux numa sala que exige 500 não fica
 *  “vermelha”. Topo arredondado para um valor redondo (≈5–6 divisões). */
export function anchoredRange(Emax, Ereq = 0) {
  const top = Math.max(Emax || 0, Ereq || 0, 1);
  const steps = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];
  const step = steps.find((st) => top / st <= 6) || 5000;
  return { lo: 0, hi: Math.ceil(top / step - 1e-9) * step, step };
}
/** Níveis das linhas isolux: múltiplos do passo dentro de (Emín, Emáx); os da escala NHO são marcados `major`. */
export function isoLevels(mn, mx, range = niceRange(mn, mx)) {
  const out = [];
  for (let v = range.lo; v <= range.hi + 1e-9; v += range.step) if (v > mn + 1e-6 && v < mx - 1e-6) out.push({ v, major: ESCALA.includes(v) });
  for (const v of ESCALA) if (v > mn && v < mx && !out.some((o) => o.v === v)) out.push({ v, major: true });
  return out.sort((a, b) => a.v - b.v);
}

/** Pinta a grade (centros de células) num buffer RGBA cw×ch com interpolação bicúbica (Catmull-Rom) dos valores. */
export function colorizeGrid(g, cw, ch, range) {
  const { nx, nz, E } = g; const R = range || niceRange(g.Emin, g.Emax);
  const data = new Uint8ClampedArray(cw * ch * 4), lut = new Uint8ClampedArray(1024 * 3);
  for (let k = 0; k < 1024; k++) { const c = colorAt(k / 1023); lut[3 * k] = c[0]; lut[3 * k + 1] = c[1]; lut[3 * k + 2] = c[2]; }
  const inv = 1 / (R.hi - R.lo || 1), at = (i, j) => E[Math.min(nz - 1, Math.max(0, j)) * nx + Math.min(nx - 1, Math.max(0, i))];
  const cr = (p0, p1, p2, p3, t) => p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
  const rowBuf = new Float32Array(4);
  for (let py = 0; py < ch; py++) {
    const gz = (py + 0.5) / ch * nz - 0.5, j = Math.floor(gz), fz = gz - j;
    for (let px = 0; px < cw; px++) {
      const gx = (px + 0.5) / cw * nx - 0.5, i = Math.floor(gx), fx = gx - i;
      for (let q = 0; q < 4; q++) rowBuf[q] = cr(at(i - 1, j - 1 + q), at(i, j - 1 + q), at(i + 1, j - 1 + q), at(i + 2, j - 1 + q), fx);
      const v = cr(rowBuf[0], rowBuf[1], rowBuf[2], rowBuf[3], fz);
      const k = Math.round(Math.min(1, Math.max(0, (v - R.lo) * inv)) * 1023) * 3, o = (py * cw + px) * 4;
      data[o] = lut[k]; data[o + 1] = lut[k + 1]; data[o + 2] = lut[k + 2]; data[o + 3] = 255;
    }
  }
  return { data, range: R };
}

/**
 * Linhas de contorno (marching squares com interpolação linear e desambiguação de sela pelo valor central).
 * Retorna polilinhas encadeadas em coordenadas de grade contínuas (gx, gz), centros de célula em inteiros.
 */
export function contours(g, level) {
  const { nx, nz, E } = g; const segs = [];
  const v = (i, j) => E[j * nx + i];
  const key = (t, i, j) => `${t}${i},${j}`;
  const pt = (t, i, j) => { // ponto na aresta t ('h' entre (i,j)-(i+1,j); 'v' entre (i,j)-(i,j+1))
    const a = v(i, j), b = t === 'h' ? v(i + 1, j) : v(i, j + 1), f = (level - a) / (b - a);
    return t === 'h' ? [i + f, j] : [i, j + f];
  };
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = v(i, j) >= level, b = v(i + 1, j) >= level, c = v(i + 1, j + 1) >= level, d = v(i, j + 1) >= level;
    const idx = (a ? 1 : 0) | (b ? 2 : 0) | (c ? 4 : 0) | (d ? 8 : 0);
    if (idx === 0 || idx === 15) continue;
    const T = key('h', i, j), B = key('h', i, j + 1), Lk = key('v', i, j), Rk = key('v', i + 1, j);
    const e = { T: [T, 'h', i, j], B: [B, 'h', i, j + 1], L: [Lk, 'v', i, j], R: [Rk, 'v', i + 1, j] };
    const add = (p, q) => segs.push([e[p], e[q]]);
    switch (idx) {
      case 1: case 14: add('L', 'T'); break;
      case 2: case 13: add('T', 'R'); break;
      case 3: case 12: add('L', 'R'); break;
      case 4: case 11: add('R', 'B'); break;
      case 6: case 9: add('T', 'B'); break;
      case 7: case 8: add('L', 'B'); break;
      case 5: case 10: {
        const center = (v(i, j) + v(i + 1, j) + v(i + 1, j + 1) + v(i, j + 1)) / 4 >= level;
        if ((idx === 5) === center) { add('L', 'B'); add('T', 'R'); } else { add('L', 'T'); add('R', 'B'); }
        break;
      }
    }
  }
  // encadeia segmentos pelas arestas compartilhadas
  const adj = new Map(), pts = new Map();
  segs.forEach((s, k) => { for (const e of s) { pts.set(e[0], e); (adj.get(e[0]) || adj.set(e[0], []).get(e[0])).push(k); } });
  const used = new Uint8Array(segs.length), lines = [];
  const walk = (start, from) => { const out = []; let cur = start, seg = from;
    while (seg != null) { used[seg] = 1; const s = segs[seg]; const nxt = s[0][0] === cur ? s[1][0] : s[0][0]; out.push(nxt); cur = nxt;
      seg = (adj.get(cur) || []).find((q) => !used[q]); if (seg === undefined) seg = null; }
    return out; };
  for (let k = 0; k < segs.length; k++) {
    if (used[k]) continue; used[k] = 1;
    const [a, b] = segs[k]; const fwd = walk(b[0], (adj.get(b[0]) || []).find((q) => !used[q]) ?? null);
    const back = walk(a[0], (adj.get(a[0]) || []).find((q) => !used[q]) ?? null);
    const keys = [...back.reverse(), a[0], b[0], ...fwd];
    const closed = keys.length > 3 && keys[0] === keys[keys.length - 1];
    lines.push({ closed, pts: keys.map((kk) => { const e = pts.get(kk); return pt(e[1], e[2], e[3]); }) });
  }
  return lines;
}

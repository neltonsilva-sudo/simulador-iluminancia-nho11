// MARCAÇÃO — visor LCD do luxímetro (2 linhas de 7 segmentos + ícones), desenhado em canvas.
// Reproduz o LCD reflexivo cinza-azulado do aparelho real: segmentos chanfrados com "sombra" do cristal sobre o
// refletor, segmentos apagados levemente visíveis, ícones HOLD / ZERO / MEM / READ / Light Source / bateria / Lux-Fc.
// Sem marca comercial.
import { FONT } from './mark_tex.js';

export const LCD_W = 760, LCD_H = 980;

// mapa de 7 segmentos (a b c d e f g)
const SEG = {
  0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg',
  '-': 'g', L: 'fed', n: 'ceg', o: 'cdeg', O: 'abcdef', C: 'afed', c: 'ged', A: 'abcefg', P: 'abefg', E: 'afged', r: 'eg',
  F: 'afeg', U: 'bcdef', u: 'cde', H: 'bcefg', h: 'cefg', b: 'cdefg', d: 'bcdeg', t: 'defg', l: 'fe', S: 'afgcd', Z: 'abged', ' ': '',
};

/** Parte uma string "335.3" em posições {ch, dp}. */
export function cells(str, n) {
  const out = [];
  for (const ch of String(str)) {
    if (ch === '.') { if (out.length) out[out.length - 1].dp = true; else out.push({ ch: ' ', dp: true }); }
    else out.push({ ch, dp: false });
  }
  while (out.length < n) out.unshift({ ch: ' ', dp: false });
  return out.slice(-n);
}

// segmento chanfrado (hexágono alongado) com folga entre segmentos
function segPath(g, x, y, w, h, t, s) {
  const gp = t * 0.16, ht = t / 2, ym = y + h / 2;
  const H = (x1, x2, yy) => { g.moveTo(x1, yy); g.lineTo(x1 + ht, yy - ht); g.lineTo(x2 - ht, yy - ht); g.lineTo(x2, yy); g.lineTo(x2 - ht, yy + ht); g.lineTo(x1 + ht, yy + ht); g.closePath(); };
  const V = (xx, y1, y2) => { g.moveTo(xx, y1); g.lineTo(xx + ht, y1 + ht); g.lineTo(xx + ht, y2 - ht); g.lineTo(xx, y2); g.lineTo(xx - ht, y2 - ht); g.lineTo(xx - ht, y1 + ht); g.closePath(); };
  if (s.includes('a')) H(x + gp, x + w - gp, y);
  if (s.includes('g')) H(x + gp, x + w - gp, ym);
  if (s.includes('d')) H(x + gp, x + w - gp, y + h);
  if (s.includes('f')) V(x, y + gp, ym - gp);
  if (s.includes('b')) V(x + w, y + gp, ym - gp);
  if (s.includes('e')) V(x, ym + gp, y + h - gp);
  if (s.includes('c')) V(x + w, ym + gp, y + h - gp);
}

const INK = 'rgba(18,22,25,.95)', SHADOW = 'rgba(40,52,58,.15)', GHOST = 'rgba(30,40,46,.04)';

/** Desenha uma linha de dígitos. layout: {x0, y0, dw, dh, t, gap, n, skew, gapAfter?:{i:extra}} */
function digits(g, cellsArr, L, all) {
  const { x0, y0, dw, dh, t, gap, skew } = L;
  g.save(); g.transform(1, 0, -skew, 1, skew * (y0 + dh), 0);
  let x = x0;
  const pos = [];
  for (let i = 0; i < cellsArr.length; i++) { pos.push(x); x += dw + gap + (L.gapAfter?.[i] || 0); }
  // passes: fantasma, sombra (cristal → refletor), tinta
  for (const pass of ['ghost', 'shadow', 'ink']) {
    g.fillStyle = pass === 'ghost' ? GHOST : pass === 'shadow' ? SHADOW : INK;
    const ox = pass === 'shadow' ? 5 : 0, oy = pass === 'shadow' ? 6 : 0;
    g.beginPath();
    cellsArr.forEach((c, i) => {
      const s = pass === 'ghost' ? 'abcdefg' : all ? 'abcdefg' : (SEG[c.ch] ?? '');
      segPath(g, pos[i] + ox, y0 + oy, dw, dh, t, s);
      const dpOn = pass === 'ghost' || all || c.dp;
      if (dpOn && !(L.noDp?.includes(i))) { const r = t * 0.48; g.moveTo(pos[i] + dw + gap * 0.5 + ox + r, y0 + dh + oy); g.arc(pos[i] + dw + gap * 0.5 + ox, y0 + dh + oy, r, 0, Math.PI * 2); }
    });
    g.fill();
  }
  g.restore();
}

function icon(g, on, fn) { g.save(); g.fillStyle = on ? INK : GHOST; g.strokeStyle = on ? INK : GHOST; fn(); g.restore(); }
function txt(g, s, x, y, size, on, weight = 800, align = 'left') {
  icon(g, on, () => {
    g.font = `${weight} ${size}px ${FONT}`; g.textAlign = align; g.textBaseline = 'alphabetic';
    if (on) { g.save(); g.fillStyle = SHADOW; g.fillText(s, x + 4, y + 5); g.restore(); }
    g.fillText(s, x, y);
  });
}

/**
 * model = { off, test, l1:'335.3', l2:'L10.990', icons:{hold, zero, mem, read, ls, bat, auto, lux, fc, x10, cd} }
 */
export function drawLuxLCD(c, m = {}) {
  const g = c.getContext('2d'), W = c.width, H = c.height;
  g.setTransform(W / LCD_W, 0, 0, H / LCD_H, 0, 0);
  // fundo: cristal reflexivo cinza-azulado (como no aparelho real), leve vinheta do polarizador
  const bg = g.createLinearGradient(0, 0, LCD_W * 0.4, LCD_H);
  bg.addColorStop(0, '#c2cbcd'); bg.addColorStop(0.55, '#b5bfc2'); bg.addColorStop(1, '#a8b2b5');
  g.fillStyle = bg; g.fillRect(0, 0, LCD_W, LCD_H);
  const vg = g.createRadialGradient(LCD_W * 0.45, LCD_H * 0.4, LCD_W * 0.2, LCD_W * 0.5, LCD_H * 0.5, LCD_W * 0.95);
  vg.addColorStop(0, 'rgba(255,255,255,.06)'); vg.addColorStop(1, 'rgba(0,10,20,.12)'); g.fillStyle = vg; g.fillRect(0, 0, LCD_W, LCD_H);
  // sombra interna da moldura (o cristal fica rebaixado sob o vidro)
  const shT = g.createLinearGradient(0, 0, 0, 40); shT.addColorStop(0, 'rgba(0,0,0,.32)'); shT.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = shT; g.fillRect(0, 0, LCD_W, 40);
  const shL = g.createLinearGradient(0, 0, 30, 0); shL.addColorStop(0, 'rgba(0,0,0,.22)'); shL.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = shL; g.fillRect(0, 0, 30, LCD_H);
  if (m.off) return;
  const all = !!m.test, I = m.icons || {};
  const on = (k) => all || !!I[k];
  // --- faixa superior de ícones ---
  // desligamento automático (relógio)
  icon(g, on('auto'), () => { g.lineWidth = 7; g.beginPath(); g.arc(62, 62, 24, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.moveTo(62, 62); g.lineTo(62, 46); g.moveTo(62, 62); g.lineTo(74, 68); g.stroke(); });
  txt(g, 'MEM', 106, 80, 36, on('mem'));
  txt(g, 'READ', 222, 80, 36, on('read'));
  txt(g, 'ZERO', 358, 80, 36, on('zero'));
  txt(g, 'HOLD', LCD_W - 40, 80, 50, on('hold'), 800, 'right');
  // --- linha 1: 4 dígitos grandes ---
  const c1 = cells(m.l1 ?? '', 4);
  digits(g, c1, { x0: 44, y0: 128, dw: 104, dh: 300, t: 30, gap: 40, skew: 0.085, noDp: [3] }, all);
  // unidades à direita
  txt(g, 'Fc', LCD_W - 30, 210, 50, on('fc'), 800, 'right');
  txt(g, 'x10', LCD_W - 30, 300, 40, on('x10'), 800, 'right');
  txt(g, 'Lux', LCD_W - 30, 420, 54, on('lux'), 800, 'right');
  // --- faixa do meio: Light Source + bateria + CD ---
  txt(g, 'Light Source', 34, 520, 38, on('ls'), 700);
  txt(g, 'CD', 420, 520, 38, on('cd'), 800);
  icon(g, on('bat'), () => {
    g.lineWidth = 6; g.strokeRect(LCD_W - 140, 486, 82, 38); g.fillRect(LCD_W - 58, 497, 9, 16);
    g.fillRect(LCD_W - 132, 494, 20, 22); g.fillRect(LCD_W - 108, 494, 20, 22); g.fillRect(LCD_W - 84, 494, 20, 22);
  });
  // --- linha 2: 6 dígitos (código da fonte + fator, ou NO. da memória) ---
  const c2 = cells(m.l2 ?? '', 6);
  digits(g, c2, { x0: 44, y0: 576, dw: 74, dh: 196, t: 21, gap: 30, skew: 0.085, gapAfter: { 1: 30 }, noDp: [5] }, all);
  // --- faixa inferior: m / ft (distância da função CD; apagados) ---
  txt(g, 'm', LCD_W - 120, 900, 46, on('m'), 700);
  txt(g, 'ft', LCD_W - 60, 900, 46, on('ft'), 700);
  txt(g, 'MAX', 40, 900, 40, on('max'), 800);
  txt(g, 'MIN', 150, 900, 40, on('min'), 800);
}

// MARCAÇÃO — texturas procedurais (canvas) do luxímetro "LED Light Meter": painel frontal, verso com etiquetas
// (calibração, QC, nº de série, advertência / pilhas), legendas das teclas e mapas de rugosidade.
// Somente textos genéricos — nenhum logotipo ou nome de fabricante.
import { canvasTex, FONT } from './mark_tex.js';

const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
export function rrect(g, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function rng(seed) { let s = seed >>> 0; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9 >>> 0) / 4294967296); }
function grain(g, w, h, amt, seed = 7, n = 9000) { const r = rng(seed); for (let i = 0; i < n; i++) { const v = r() < 0.5 ? 0 : 255; g.fillStyle = `rgba(${v},${v},${v},${amt * r()})`; g.fillRect(r() * w, r() * h, 1 + r() * 1.5, 1 + r() * 1.5); } }

// Dimensões físicas (m) do painel frontal visível (dentro do bumper) — o canvas usa 10 px/mm.
export const FACE = { w: 0.0565, h: 0.152 };
export const PX = 10000;    // px por metro
/** Converte coordenada local do painel (m, origem no centro, +y para cima) para px do canvas. */
const fx = (x) => (x + FACE.w / 2) * PX, fy = (y) => (FACE.h / 2 - y) * PX;

// Layout do painel (m, origem no centro do corpo). Medido sobre a foto IMG_4962.
export const LAYOUT = {
  lcd: { x: 0, y: 0.0372, w: 0.0372, h: 0.048 },
  frame: { x: 0, y: 0.0372, w: 0.0462, h: 0.0575 },
  title: { y: 0.0062 },
  keys: [
    { name: 'unit', x: -0.0142, y: -0.0062, w: 0.0128, h: 0.0074, l: ['LX/FC', 'CD'] },
    { name: 'mem', x: 0, y: -0.0062, w: 0.0128, h: 0.0074, l: ['MEM', 'READ'] },
    { name: 'hold', x: 0.0142, y: -0.0062, w: 0.0128, h: 0.0074, l: ['HOLD', 'L.S.'] },
    { name: 'up', x: -0.0142, y: -0.0172, w: 0.0108, h: 0.0072, l: ['▲'] },
    { name: 'zero', x: 0, y: -0.0172, w: 0.0128, h: 0.0072, l: ['ZERO'] },
    { name: 'down', x: 0.0142, y: -0.0172, w: 0.0108, h: 0.0072, l: ['▼'] },
  ],
  power: { x: -0.0142, y: -0.0405, r: 0.0042 },
};

/** Painel frontal: plástico cinza-claro, moldura do visor, "LED Light Meter", rebaixos das teclas. */
export function makeFaceTex() {
  const W = Math.round(FACE.w * PX), H = Math.round(FACE.h * PX), c = mk(W, H), g = c.getContext('2d');
  const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#e4e6e5'); bg.addColorStop(0.5, '#dcdedd'); bg.addColorStop(1, '#d2d4d3');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  grain(g, W, H, 0.05, 11, 14000);
  // painel superior em relevo (área do visor + título): contorno sutil cinza
  const F = LAYOUT.frame;
  const px = fx(F.x - F.w / 2), py = fy(F.y + F.h / 2) - 10, pw = F.w * PX, ph = F.h * PX + 120;
  rrect(g, px - 18, py - 14, pw + 36, ph + 28, 40); g.strokeStyle = 'rgba(120,126,130,.55)'; g.lineWidth = 3; g.stroke();
  rrect(g, px - 15, py - 11, pw + 30, ph + 22, 37); g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 2; g.stroke();
  // moldura do visor: cinza-chumbo com chanfro
  rrect(g, px, py, pw, F.h * PX, 26);
  const fr = g.createLinearGradient(0, py, 0, py + F.h * PX); fr.addColorStop(0, '#5b6167'); fr.addColorStop(1, '#474c51'); g.fillStyle = fr; g.fill();
  g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 3; g.stroke();
  // janela do LCD (o LCD real é um plano separado; aqui só a borda escura)
  const Lc = LAYOUT.lcd; rrect(g, fx(Lc.x - Lc.w / 2) - 8, fy(Lc.y + Lc.h / 2) - 8, Lc.w * PX + 16, Lc.h * PX + 16, 10); g.fillStyle = '#1d2023'; g.fill();
  // título
  g.fillStyle = '#26292c'; g.font = `800 30px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('LED Light Meter', W / 2, fy(LAYOUT.title.y));
  // rebaixos das teclas (anel escuro + realce inferior)
  for (const k of LAYOUT.keys) {
    const x = fx(k.x - k.w / 2) - 7, y = fy(k.y + k.h / 2) - 7, w = k.w * PX + 14, h = k.h * PX + 14;
    rrect(g, x, y, w, h, h / 2); g.fillStyle = '#b9bcbd'; g.fill();
    rrect(g, x, y + 3, w, h - 3, h / 2); g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 2; g.stroke();
    rrect(g, x + 2, y + 1, w - 4, h - 4, h / 2); g.strokeStyle = 'rgba(70,75,80,.45)'; g.lineWidth = 2; g.stroke();
  }
  const P = LAYOUT.power; g.beginPath(); g.arc(fx(P.x), fy(P.y), P.r * PX + 9, 0, Math.PI * 2); g.fillStyle = '#b4b7b8'; g.fill();
  g.strokeStyle = 'rgba(70,75,80,.45)'; g.lineWidth = 2; g.stroke();
  return canvasTex(c);
}

/** Legenda de tecla (texto branco sobre transparente), 2 linhas no máximo. */
export function makeKeyLegend(lines, wM, hM) {
  const W = Math.round(wM * PX * 2.4), H = Math.round(hM * PX * 2.4), c = mk(W, H), g = c.getContext('2d');
  g.fillStyle = '#f3f5f6'; g.textAlign = 'center'; g.textBaseline = 'middle';
  if (lines.length === 1 && /[▲▼]/.test(lines[0])) {
    const up = lines[0] === '▲', cx = W / 2, cy = H / 2, s = H * 0.26;
    g.beginPath(); if (up) { g.moveTo(cx, cy - s); g.lineTo(cx + s * 1.15, cy + s * 0.8); g.lineTo(cx - s * 1.15, cy + s * 0.8); }
    else { g.moveTo(cx, cy + s); g.lineTo(cx + s * 1.15, cy - s * 0.8); g.lineTo(cx - s * 1.15, cy - s * 0.8); } g.closePath(); g.fill();
  } else if (lines.length === 1) {
    g.font = `800 ${Math.round(H * 0.36)}px ${FONT}`; g.fillText(lines[0], W / 2, H / 2 + 1);
  } else {
    g.font = `800 ${Math.round(H * 0.3)}px ${FONT}`; g.fillText(lines[0], W / 2, H * 0.33);
    g.font = `800 ${Math.round(H * 0.28)}px ${FONT}`; g.fillText(lines[1], W / 2, H * 0.7);
  }
  return canvasTex(c);
}

/** Símbolo ⏻ escuro para a tecla POWER amarela. */
export function makePowerLegend() {
  const S = 160, c = mk(S, S), g = c.getContext('2d');
  g.strokeStyle = '#3a3324'; g.lineWidth = 13; g.lineCap = 'round';
  g.beginPath(); g.arc(S / 2, S / 2 + 6, 42, -Math.PI / 2 + 0.75, -Math.PI / 2 - 0.75 + Math.PI * 2); g.stroke();
  g.beginPath(); g.moveTo(S / 2, S / 2 - 46); g.lineTo(S / 2, S / 2 + 4); g.stroke();
  return canvasTex(c);
}

// ---------- verso ----------
function barcode(g, x, y, w, h, seed) {
  const r = rng(seed); let cx = x;
  g.fillStyle = '#111';
  while (cx < x + w - 4) { const bw = 1.5 + Math.floor(r() * 4) * 1.4; if (r() > 0.42) g.fillRect(cx, y, bw, h); cx += bw + 1.2 + r() * 2; }
}
function hand(g, s, x, y, size, rot = -0.03) { // escrita à mão (caneta azul)
  g.save(); g.translate(x, y); g.rotate(rot); g.font = `italic 600 ${size}px "Bradley Hand", "Segoe Print", "Comic Sans MS", cursive`;
  g.fillStyle = 'rgba(40,52,170,.88)'; g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillText(s, 0, 0); g.restore();
}
/** Verso do corpo: plástico cinza-claro, etiqueta amarela de calibração, selo QC, nº de série, parafuso e tampa das pilhas
 *  com a etiqueta de advertência. Retorna {tex, screw:{x,y}} (posição do parafuso em m, origem no centro). */
export function makeBackTex() {
  const W = Math.round(FACE.w * PX), H = Math.round(FACE.h * PX), c = mk(W, H), g = c.getContext('2d');
  const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#d9dcdb'); bg.addColorStop(1, '#cfd2d1'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
  grain(g, W, H, 0.05, 23, 14000);
  // degrau superior (moldagem)
  rrect(g, 30, 22, W - 60, 300, 26); g.fillStyle = 'rgba(255,255,255,.18)'; g.fill(); g.strokeStyle = 'rgba(110,116,120,.4)'; g.lineWidth = 2; g.stroke();
  // --- etiqueta amarela de calibração ---
  const lx = 66, ly = 60, lw = W - 132, lh = 236;
  g.save(); g.shadowColor = 'rgba(0,0,0,.25)'; g.shadowBlur = 6; g.shadowOffsetY = 2; g.fillStyle = '#f2d21b'; g.fillRect(lx, ly, lw, lh); g.restore();
  g.fillStyle = '#f7de2e'; g.fillRect(lx, ly, lw, lh);
  const fw = lw - 66; // faixa lateral vertical "CALIBRADO"
  g.fillStyle = '#4a4310'; g.font = `600 15px ${FONT}`; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  const fields = ['Identificação do Instrumento', 'Número do Certificado', 'Data da Calibração', 'Próxima Calibração'];
  fields.forEach((f, i) => {
    const y = ly + 26 + i * 56; g.fillStyle = '#3e3809'; g.fillText(f, lx + 12, y);
    g.fillStyle = '#fbf7e4'; g.fillRect(lx + 10, y + 6, fw - 14, 34); g.strokeStyle = 'rgba(80,70,10,.4)'; g.lineWidth = 1; g.strokeRect(lx + 10, y + 6, fw - 14, 34);
  });
  hand(g, 'LX-07', lx + 22, ly + 26 + 36, 26);
  hand(g, 'I 0412/22', lx + 22, ly + 26 + 56 + 36, 27);
  hand(g, '23/05/2026', lx + 22, ly + 26 + 112 + 36, 27, -0.02);
  hand(g, '23/05/2027', lx + 22, ly + 26 + 168 + 36, 25, -0.015);
  g.save(); g.translate(lx + lw - 22, ly + lh / 2); g.rotate(Math.PI / 2); g.fillStyle = '#2a2606'; g.font = `900 30px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.letterSpacing = '6px'; g.fillText('CALIBRADO', 0, 0); g.restore();
  g.fillStyle = 'rgba(60,50,0,.5)'; g.fillRect(lx + lw - 46, ly + 6, 2, lh - 12);
  // --- selo dourado "Q.C PASSED" ---
  const qx = W / 2, qy = 420, qr = 50;
  const qg = g.createRadialGradient(qx - 14, qy - 16, 6, qx, qy, qr); qg.addColorStop(0, '#f0dc78'); qg.addColorStop(0.6, '#cdb03c'); qg.addColorStop(1, '#a8872a');
  g.beginPath(); g.arc(qx, qy, qr, 0, Math.PI * 2); g.fillStyle = qg; g.fill(); g.strokeStyle = 'rgba(90,70,10,.6)'; g.lineWidth = 2; g.stroke();
  g.beginPath(); g.arc(qx, qy, qr - 7, 0, Math.PI * 2); g.strokeStyle = 'rgba(110,85,10,.55)'; g.lineWidth = 1.5; g.stroke();
  g.fillStyle = '#4b3a05'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `800 17px ${FONT}`; g.fillText('Q.C', qx, qy - 12); g.font = `800 16px ${FONT}`; g.fillText('PASSED', qx, qy + 10);
  // --- etiqueta de nº de série (código de barras) ---
  const bx = 92, by = 510, bw = W - 184, bh = 70;
  g.fillStyle = '#fbfbfa'; rrect(g, bx, by, bw, bh, 6); g.fill(); g.strokeStyle = 'rgba(0,0,0,.15)'; g.stroke();
  barcode(g, bx + 14, by + 8, bw - 28, 34, 2107);
  g.fillStyle = '#222'; g.font = `600 19px ${FONT}`; g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillText('S/N:210700236', bx + 16, by + 63);
  // --- parafuso e lingueta da tampa das pilhas ---
  const sx = W / 2, sy = 690;
  g.beginPath(); g.arc(sx, sy, 50, Math.PI, 0); g.lineTo(sx + 50, sy + 40); g.lineTo(sx - 50, sy + 40); g.closePath(); g.strokeStyle = 'rgba(95,100,104,.6)'; g.lineWidth = 3; g.stroke();
  g.beginPath(); g.arc(sx, sy, 30, 0, Math.PI * 2); g.fillStyle = '#9da1a3'; g.fill();
  // --- tampa das pilhas (rebaixo) ---
  const tx = 46, ty = 760, tw = W - 92, th = H - 820;
  rrect(g, tx, ty, tw, th, 22); g.strokeStyle = 'rgba(85,90,95,.7)'; g.lineWidth = 4; g.stroke();
  rrect(g, tx + 3, ty + 4, tw - 6, th - 6, 20); g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 2; g.stroke();
  g.fillStyle = 'rgba(85,90,95,.5)'; g.fillRect(tx + 60, ty + th - 26, 46, 10); g.fillRect(tx + tw - 106, ty + th - 26, 46, 10);
  // etiqueta de advertência (cinza-claro, cantos arredondados)
  const wx = tx + 26, wy = ty + 30, ww = tw - 52, wh = th - 80;
  rrect(g, wx, wy, ww, wh, 16); g.fillStyle = '#e9ebea'; g.fill(); g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 2; g.stroke();
  // triângulo de alerta
  const ax = wx + 46, ay = wy + 64;
  g.beginPath(); g.moveTo(ax, ay - 32); g.lineTo(ax + 34, ay + 26); g.lineTo(ax - 34, ay + 26); g.closePath(); g.fillStyle = '#f2c81a'; g.fill(); g.strokeStyle = '#111'; g.lineWidth = 4; g.lineJoin = 'round'; g.stroke();
  g.fillStyle = '#111'; g.font = `900 40px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('!', ax, ay + 4);
  g.textAlign = 'left'; g.font = `800 40px ${FONT}`; g.fillText('WARNING', ax + 50, ay);
  g.textAlign = 'center'; g.font = `700 33px ${FONT}`;
  ['PLEASE READ', 'MANUAL FOR', 'SAFETY.'].forEach((s, i) => g.fillText(s, wx + ww / 2, wy + 150 + i * 46));
  // pilha + "3 x AAA"
  const py = wy + 330; g.strokeStyle = '#111'; g.lineWidth = 3; g.strokeRect(wx + ww / 2 - 54, py - 14, 52, 26); g.fillStyle = '#111'; g.fillRect(wx + ww / 2 - 60, py - 6, 6, 10);
  g.font = `700 20px ${FONT}`; g.fillText('+    −', wx + ww / 2 - 28, py);
  g.font = `700 24px ${FONT}`; g.fillText('3 x "AAA" 1.5V batteries', wx + ww / 2, py + 44);
  // lixeira riscada (WEEE) + CE genérico
  const ex = wx + ww / 2 - 56, ey = py + 120;
  g.strokeStyle = '#111'; g.lineWidth = 3; g.strokeRect(ex - 16, ey - 18, 32, 40); g.beginPath(); g.moveTo(ex - 22, ey - 22); g.lineTo(ex + 22, ey - 22); g.stroke();
  g.beginPath(); g.moveTo(ex - 26, ey - 30); g.lineTo(ex + 26, ey + 30); g.moveTo(ex + 26, ey - 30); g.lineTo(ex - 26, ey + 30); g.stroke(); g.fillStyle = '#111'; g.fillRect(ex - 22, ey + 36, 44, 8);
  g.font = `600 64px ${FONT}`; g.textAlign = 'center'; g.fillText('CE', wx + ww / 2 + 56, ey + 6);
  return { tex: canvasTex(c), screw: { x: 0, y: FACE.h / 2 - sy / PX } };
}

/** Rugosidade do bumper de borracha (manchas de uso) — usada como roughnessMap. */
export function makeRubberRough() {
  const S = 256, c = mk(S, S), g = c.getContext('2d');
  g.fillStyle = '#d4d4d4'; g.fillRect(0, 0, S, S);
  const r = rng(91);
  for (let i = 0; i < 2600; i++) { const v = 170 + r() * 85 | 0; g.fillStyle = `rgba(${v},${v},${v},.35)`; g.fillRect(r() * S, r() * S, 2, 2); }
  return canvasTex(c, false);
}

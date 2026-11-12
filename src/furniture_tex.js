// MOBILIÁRIO — texturas procedurais (sem assets externos). Dono: MOBILIÁRIO.
import * as THREE from 'three';
import { BACK_BOX } from './furniture_geo.js';

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ruído de valor periódico (tileable) — fbm
function tileNoise(size, freq, seed) {
  const r = rng(seed), g = new Float32Array(freq * freq); for (let i = 0; i < g.length; i++) g[i] = r();
  const out = new Float32Array(size * size), sm = (t) => t * t * (3 - 2 * t);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const fx = x / size * freq, fy = y / size * freq, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = sm(fx - x0), ty = sm(fy - y0);
    const a = g[(y0 % freq) * freq + (x0 % freq)], b = g[(y0 % freq) * freq + ((x0 + 1) % freq)], c = g[((y0 + 1) % freq) * freq + (x0 % freq)], d = g[((y0 + 1) % freq) * freq + ((x0 + 1) % freq)];
    out[y * size + x] = (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
  }
  return out;
}
function fbm(size, octs, seed) {
  const out = new Float32Array(size * size); let amp = 1, tot = 0;
  for (const [f, w] of octs) { const n = tileNoise(size, f, seed + f * 13); for (let i = 0; i < out.length; i++) out[i] += n[i] * w; tot += w; amp *= 0.5; }
  for (let i = 0; i < out.length; i++) out[i] /= tot; return out;
}
function dataTex(size, fill, { srgb = false, repeat = 1 } = {}) {
  const d = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) { const v = fill(i, i % size, (i / size) | 0); d[i * 4] = v[0]; d[i * 4 + 1] = v[1]; d[i * 4 + 2] = v[2]; d[i * 4 + 3] = v[3] ?? 255; }
  const t = new THREE.DataTexture(d, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.repeat.set(repeat, repeat); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t;
}
function normalFromHeight(h, size, k) {
  return (i, x, y) => {
    const hx = h[y * size + ((x + 1) % size)] - h[y * size + ((x + size - 1) % size)], hy = h[((y + 1) % size) * size + x] - h[((y + size - 1) % size) * size + x];
    let nx = -hx * k, ny = -hy * k, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    return [(nx * 0.5 + 0.5) * 255, (ny * 0.5 + 0.5) * 255, (nz * 0.5 + 0.5) * 255];
  };
}

const cache = {};
export function furnitureTextures(renderer) {
  if (cache.t) return cache.t;
  const aniso = Math.min(8, renderer?.capabilities?.getMaxAnisotropy?.() || 4);
  const S = 256;
  // --- polipropileno: textura de molde (granulado fino "fosco acetinado") + manchas de uso
  const grain = fbm(S, [[64, 0.55], [128, 0.45]], 7), blot = fbm(S, [[4, 0.6], [8, 0.4]], 21), scr = fbm(S, [[16, 0.5], [32, 0.5]], 33);
  const ppNormal = dataTex(S, normalFromHeight(grain, S, 2.2), { repeat: 3 });
  const ppRough = dataTex(S, (i) => { const r = 0.36 + grain[i] * 0.08 + Math.max(0, blot[i] - 0.55) * 0.2 + Math.max(0, scr[i] - 0.7) * 0.3; return [0, Math.min(255, r * 255), 0]; }, { repeat: 1 });
  const ppColor = dataTex(S, (i) => { const v = 240 + (blot[i] - 0.5) * 12 - Math.max(0, scr[i] - 0.7) * 18; return [v, v, Math.min(255, v + 4)]; }, { srgb: true });

  // --- fórmica (laminado melamínico) bege-acinzentado: salpicado fino + leve "nuvem"
  const fS = 512, sp = fbm(fS, [[128, 0.5], [256, 0.5]], 51), cl = fbm(fS, [[6, 0.6], [12, 0.4]], 57), wear = fbm(fS, [[24, 0.6], [48, 0.4]], 61);
  const fr = rng(99), speck = new Float32Array(fS * fS); for (let k = 0; k < 9000; k++) { const p = (fr() * fS * fS) | 0; speck[p] = fr() < 0.5 ? -1 : 1; }
  const fmColor = dataTex(fS, (i) => {
    const n = (sp[i] - 0.5) * 16 + (cl[i] - 0.5) * 10 + speck[i] * 18 - Math.max(0, wear[i] - 0.66) * 30;
    return [216 + n, 211 + n, 200 + n * 0.95];
  }, { srgb: true });
  const fmRough = dataTex(fS, (i) => [0, (0.50 + (sp[i] - 0.5) * 0.12 - Math.max(0, wear[i] - 0.62) * 0.55) * 255, 0]);
  const fmNormal = dataTex(fS, normalFromHeight(sp, fS, 1.4));

  // --- aço pintado (epóxi cinza-prata): estrias longitudinais para anisotropia + micro-casca de laranja
  const mS = 256, st = new Float32Array(mS * mS), mr = rng(5), rowv = []; for (let y = 0; y < mS; y++) rowv.push(mr());
  const orange = fbm(mS, [[32, 0.6], [64, 0.4]], 71);
  for (let y = 0; y < mS; y++) for (let x = 0; x < mS; x++) st[y * mS + x] = rowv[y] * 0.35 + orange[y * mS + x] * 0.65;
  const mtNormal = dataTex(mS, normalFromHeight(orange, mS, 1.6));
  const mtRough = dataTex(mS, (i) => [0, (0.42 + st[i] * 0.06) * 255, 0]);

  // --- tecido (estofado): trama em sarja
  const tS = 256, tw = new Float32Array(tS * tS), tn = fbm(tS, [[64, 0.5], [128, 0.5]], 81);
  for (let y = 0; y < tS; y++) for (let x = 0; x < tS; x++) { const a = Math.sin((x + y) * Math.PI / 4) * 0.5 + 0.5, b = Math.sin((x - y * 0.25) * Math.PI / 2) * 0.5 + 0.5; tw[y * tS + x] = a * 0.6 + b * 0.25 + tn[y * tS + x] * 0.3; }
  const fbNormal = dataTex(tS, normalFromHeight(tw, tS, 2.5), { repeat: 10 });
  const fbColor = dataTex(tS, (i) => { const v = 225 + (tw[i] - 0.5) * 50; return [v, v, v]; }, { srgb: true, repeat: 10 });

  // --- furos de ventilação + alça do encosto (alphaMap no espaço UV do encosto)
  const hc = document.createElement('canvas'); const HW = 1024, HH = Math.round(1024 * (BACK_BOX.maxB - BACK_BOX.minB) / (BACK_BOX.maxA - BACK_BOX.minA));
  hc.width = HW; hc.height = HH; const g = hc.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, HW, HH); g.fillStyle = '#000';
  const toPx = (a, b) => [(a - BACK_BOX.minA) / (BACK_BOX.maxA - BACK_BOX.minA) * HW, (1 - (b - BACK_BOX.minB) / (BACK_BOX.maxB - BACK_BOX.minB)) * HH];
  const pxPerM = HW / (BACK_BOX.maxA - BACK_BOX.minA);
  const holes = [];
  // como na foto: 4 fileiras esparsas e intercaladas (9/8), só na metade superior do encosto; sem alça
  const rows = 4, sy = 0.04, y0 = -0.005;
  for (let r = 0; r < rows; r++) {
    const b = y0 + r * sy, cols = r % 2 ? 8 : 9, sx = 0.044, off = -(cols - 1) / 2 * sx;
    for (let c = 0; c < cols; c++) {
      const a = off + c * sx;
      if (Math.abs(a) > 0.19 - Math.max(0, b - 0.09) * 0.6) continue;
      holes.push([a, b]);
    }
  }
  const hr = 0.0055 * pxPerM;
  for (const [a, b] of holes) { const [x, y] = toPx(a, b); g.beginPath(); g.arc(x, y, hr, 0, Math.PI * 2); g.fill(); }
  const holeTex = new THREE.CanvasTexture(hc); holeTex.flipY = true; holeTex.anisotropy = aniso; holeTex.generateMipmaps = true;
  holeTex.minFilter = THREE.LinearMipmapLinearFilter; holeTex.wrapS = holeTex.wrapT = THREE.ClampToEdgeWrapping;

  // --- oclusão de contato sob a carteira (4 pés + sombra difusa sob o assento/porta-livros); quad 0,8 × 0,9 m
  const aoc = document.createElement('canvas'); aoc.width = 256; aoc.height = 288; const ag = aoc.getContext('2d');
  ag.fillStyle = '#000'; ag.fillRect(0, 0, 256, 288);
  const AW = 0.8, AH = 0.9, apx = (x) => (x / AW + 0.5) * 256, apz = (z) => (z / AH + 0.5) * 288;
  const blob = (x, z, r, a) => { const gr = ag.createRadialGradient(apx(x), apz(z), 0, apx(x), apz(z), r / AW * 256); gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); ag.fillStyle = gr; ag.fillRect(0, 0, 256, 288); };
  blob(0, 0.01, 0.36, 0.38); blob(0, 0.0, 0.22, 0.25);
  for (const sx of [-1, 1]) for (const z of [-0.245, 0.262]) { blob(0.222 * sx, z, 0.07, 0.75); blob(0.222 * sx, z, 0.025, 0.9); }
  blob(0.25, -0.2, 0.2, 0.18); // sob a prancheta
  const aoTex = new THREE.CanvasTexture(aoc);
  // mesa do professor: retângulo suave
  const dc = document.createElement('canvas'); dc.width = 256; dc.height = 128; const dg = dc.getContext('2d'); dg.filter = 'blur(10px)';
  dg.fillStyle = '#000'; dg.fillRect(0, 0, 256, 128); dg.fillStyle = 'rgba(255,255,255,0.35)'; dg.fillRect(30, 22, 196, 84);
  dg.fillStyle = 'rgba(255,255,255,0.85)'; dg.fillRect(26, 20, 12, 88); dg.fillRect(218, 20, 12, 88);
  const deskAo = new THREE.CanvasTexture(dc);
  cache.ao = { aoTex, deskAo, AW, AH };
  for (const t of [ppNormal, ppRough, ppColor, fmColor, fmRough, fmNormal, mtNormal, mtRough, fbNormal, fbColor]) t.anisotropy = aniso;
  cache.t = { holeUv: 0.011 / (BACK_BOX.maxA - BACK_BOX.minA), ppNormal, ppRough, ppColor, fmColor, fmRough, fmNormal, mtNormal, mtRough, fbNormal, fbColor, holeTex, ...cache.ao };
  return cache.t;
}

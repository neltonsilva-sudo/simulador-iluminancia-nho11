// SALA — texturas 100% procedurais (canvas): painéis de parede, placas de teto, porcelanato, aço galvanizado,
// cartazes de segurança genéricos, película de janela, juntas. Dono: SALA.
// Todas as texturas tileáveis usam ruído de valor PERIÓDICO (sem costura). UVs dos meshes estão em METROS; cada textura
// declara quantos metros cobre (texture.userData.meters) e o repeat é 1/meters.
import * as THREE from 'three';

// ---------- utilidades ----------
let _aniso = 8;
export function setAnisotropy(a) { _aniso = Math.max(1, a | 0); }
function rng(seed) { let s = (seed >>> 0) || 1; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822519 + (s | 1)) ^ (s + 0x6d2b79f5)), ((s ^ (s >>> 13)) >>> 0) / 4294967296); }
function hash2(x, y, s) { let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(s, 1442695041); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
const smooth = (t) => t * t * (3 - 2 * t);
/** ruído de valor periódico em [0,1) — px, py = período (células) */
function vnoise(x, y, px, py, s) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = smooth(x - xi), fy = smooth(y - yi);
  const x0 = ((xi % px) + px) % px, y0 = ((yi % py) + py) % py, x1 = (x0 + 1) % px, y1 = (y0 + 1) % py;
  const a = hash2(x0, y0, s), b = hash2(x1, y0, s), c = hash2(x0, y1, s), d = hash2(x1, y1, s);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
/** fBm tileável num array Float32 (w×h), u∈[0,1) cobre cx células na 1ª oitava */
function fbm(w, h, cx, cy, oct, seed, gain = 0.5) {
  const out = new Float32Array(w * h); let amp = 1, norm = 0;
  for (let o = 0; o < oct; o++) {
    const px = cx << o, py = cy << o;
    for (let j = 0; j < h; j++) { const y = (j / h) * py; for (let i = 0; i < w; i++) out[j * w + i] += amp * vnoise((i / w) * px, y, px, py, seed + o * 31); }
    norm += amp; amp *= gain;
  }
  for (let k = 0; k < out.length; k++) out[k] /= norm;
  return out;
}
/** amostragem bilinear tileável de um campo (para usar campos de baixa resolução em canvas grande) */
function sampler(f, w, h) {
  return (u, v) => { const x = u * w - 0.5, y = v * h - 0.5, xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const x0 = ((xi % w) + w) % w, y0 = ((yi % h) + h) % h, x1 = (x0 + 1) % w, y1 = (y0 + 1) % h;
    const a = f[y0 * w + x0], b = f[y0 * w + x1], c = f[y1 * w + x0], d = f[y1 * w + x1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy; };
}
const s2l = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const l2s = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, { srgb = true, meters = [1, 1], wrap = true, mip = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (wrap) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / meters[0], 1 / meters[1]); }
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = _aniso;
  t.generateMipmaps = mip; t.minFilter = mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.userData.meters = meters; t.needsUpdate = true; return t;
}
/** altura (Float32, tileável) → normal map (canvas) */
function normalFromHeight(hgt, w, h, strength) {
  const c = canvas(w, h), g = c.getContext('2d'), im = g.createImageData(w, h), d = im.data;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const l = hgt[j * w + ((i - 1 + w) % w)], r = hgt[j * w + ((i + 1) % w)];
    const u = hgt[((j - 1 + h) % h) * w + i], dn = hgt[((j + 1) % h) * w + i];
    let nx = (l - r) * strength, ny = (dn - u) * strength, nz = 1; const inv = 1 / Math.hypot(nx, ny, nz);
    // canvas: linha 0 = topo = v alto (flipY) → derivada em v invertida já embutida em (dn-u)
    const k = (j * w + i) * 4; d[k] = (nx * inv * 0.5 + 0.5) * 255; d[k + 1] = (ny * inv * 0.5 + 0.5) * 255; d[k + 2] = (nz * inv * 0.5 + 0.5) * 255; d[k + 3] = 255;
  }
  g.putImageData(im, 0, 0); return c;
}
function grayCanvas(vals, w, h) { // roughness: canal G (three lê G para roughness, B para metalness)
  const c = canvas(w, h), g = c.getContext('2d'), im = g.createImageData(w, h), d = im.data;
  for (let k = 0; k < w * h; k++) { const v = Math.max(0, Math.min(255, vals[k] * 255)); d[k * 4] = v; d[k * 4 + 1] = v; d[k * 4 + 2] = v; d[k * 4 + 3] = 255; }
  g.putImageData(im, 0, 0); return c;
}
function rgbCanvas(r, gg, b, w, h) { // valores LINEARES → sRGB
  const c = canvas(w, h), g = c.getContext('2d'), im = g.createImageData(w, h), d = im.data;
  for (let k = 0; k < w * h; k++) { d[k * 4] = l2s(Math.max(0, Math.min(1, r[k]))) * 255; d[k * 4 + 1] = l2s(Math.max(0, Math.min(1, gg[k]))) * 255; d[k * 4 + 2] = l2s(Math.max(0, Math.min(1, b[k]))) * 255; d[k * 4 + 3] = 255; }
  g.putImageData(im, 0, 0); return c;
}

const cache = {};
const once = (k, fn) => cache[k] || (cache[k] = fn());

// ---------- PAREDE: painel sanduíche branco acetinado (2 m × 4 m por ladrilho) ----------
export function wallTextures() {
  return once('wall', () => {
    const W = 512, H = 1024, MW = 2, MH = 4; // 256 px/m
    const low = fbm(64, 128, 4, 8, 4, 11), lowS = sampler(low, 64, 128);
    const mid = fbm(128, 256, 16, 32, 3, 23), midS = sampler(mid, 128, 256);
    const peel = fbm(W, H, 128, 256, 2, 37, 0.6);
    const R = new Float32Array(W * H), G = new Float32Array(W * H), B = new Float32Array(W * H), rough = new Float32Array(W * H), hgt = new Float32Array(W * H);
    const base = [s2l(0.905), s2l(0.912), s2l(0.905)];
    const rnd = rng(77);
    // manchas de encosto de cadeira (faixa 0,72–0,98 m) e pequenos riscos
    const scuffs = []; for (let k = 0; k < 9; k++) scuffs.push({ u: rnd(), v: 0.74 + rnd() * 0.22, rx: 0.04 + rnd() * 0.12, ry: 0.006 + rnd() * 0.012, a: 0.025 + rnd() * 0.04 });
    const specks = []; for (let k = 0; k < 140; k++) specks.push({ u: rnd(), v: rnd() * MH, r: 0.0012 + rnd() * 0.002, a: 0.04 + rnd() * 0.10 });
    for (let j = 0; j < H; j++) {
      const vm = (1 - (j + 0.5) / H) * MH; // metros (v para cima)
      for (let i = 0; i < W; i++) {
        const u = (i + 0.5) / W, k = j * W + i;
        const n1 = lowS(u, j / H) - 0.5, n2 = midS(u, j / H) - 0.5;
        let f = 1 + n1 * 0.035 + n2 * 0.012;
        let dirt = 0;
        for (const s of scuffs) { let du = Math.abs(u - s.u); du = Math.min(du, 1 - du) * MW; const dv = vm - s.v; const e = (du * du) / (s.rx * s.rx) + (dv * dv) / (s.ry * s.ry); if (e < 9) dirt += s.a * Math.exp(-e); }
        if (vm < 0.42) { const t0 = Math.max(0, 1 - vm / 0.4); dirt += t0 * t0 * (0.03 + 0.05 * Math.max(0, n2 * 2 + n1 + 0.4)) + t0 * 0.012 * Math.max(0, Math.sin(u * 61 + n1 * 9)); }
        f *= 1 - dirt;
        R[k] = base[0] * f * (1 - dirt * 0.3); G[k] = base[1] * f * (1 - dirt * 0.4); B[k] = base[2] * f * (1 - dirt * 0.6);
        rough[k] = 0.36 + n1 * 0.10 + (peel[k] - 0.5) * 0.05 - dirt * 0.8;
        hgt[k] = peel[k] * 0.35 + n2 * 3.0 + n1 * 10.0;
      }
    }
    // pontinhos (poeira/resíduo de fita) — desenhados sobre o albedo
    const albC = rgbCanvas(R, G, B, W, H), g = albC.getContext('2d');
    for (const s of specks) { g.fillStyle = `rgba(90,88,84,${s.a})`; g.beginPath(); g.arc(s.u * W, (1 - s.v / MH) * H, Math.max(0.6, s.r * W / MW), 0, Math.PI * 2); g.fill(); }
    const map = tex(albC, { meters: [MW, MH] });
    const roughnessMap = tex(grayCanvas(rough, W, H), { srgb: false, meters: [MW, MH] });
    const normalMap = tex(normalFromHeight(hgt, W, H, 0.9), { srgb: false, meters: [MW, MH] });
    return { map, roughnessMap, normalMap };
  });
}

// ---------- TETO: placa branca plana (2 m × 2 m) ----------
export function ceilingTextures() {
  return once('ceil', () => {
    const W = 512, H = 512, M = 2;
    const low = fbm(64, 64, 4, 4, 4, 51), lowS = sampler(low, 64, 64);
    const peel = fbm(W, H, 128, 128, 2, 53, 0.6);
    const R = new Float32Array(W * H), G = new Float32Array(W * H), B = new Float32Array(W * H), rough = new Float32Array(W * H), hgt = new Float32Array(W * H);
    const base = [s2l(0.93), s2l(0.935), s2l(0.93)];
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const k = j * W + i, n = lowS(i / W, j / H) - 0.5, f = 1 + n * 0.04;
      R[k] = base[0] * f; G[k] = base[1] * f; B[k] = base[2] * f;
      rough[k] = 0.42 + n * 0.12 + (peel[k] - 0.5) * 0.06; hgt[k] = peel[k] * 0.3 + n * 5;
    }
    return { map: tex(rgbCanvas(R, G, B, W, H), { meters: [M, M] }), roughnessMap: tex(grayCanvas(rough, W, H), { srgb: false, meters: [M, M] }), normalMap: tex(normalFromHeight(hgt, W, H, 0.8), { srgb: false, meters: [M, M] }) };
  });
}

// ---------- PISO: porcelanato polido cinza-claro 60×60, rejunte fino (ladrilho de textura = 8×8 placas = 4,8 m) ----------
export function floorTextures() {
  return once('floor', () => {
    const S = 2048, NT = 8, M = NT * 0.6, tp = S / NT; // 256 px por placa → 2,34 mm/px
    const rnd = rng(1234);
    const tiles = []; for (let k = 0; k < NT * NT; k++) tiles.push({ b: 1 + (rnd() - 0.5) * 0.05, w: (rnd() - 0.5) * 0.012, r: 0.9 + rnd() * 0.25, ox: rnd(), oy: rnd(), tx: (rnd() - 0.5), ty: (rnd() - 0.5) });
    // "nuvens" do porcelanato (efeito cimentício suave) — campo tileável com período = textura
    const cloud = fbm(512, 512, 12, 12, 5, 91, 0.55), cloudS = sampler(cloud, 512, 512);
    const vein = fbm(256, 256, 6, 6, 4, 93, 0.5), veinS = sampler(vein, 256, 256);
    const smudge = fbm(256, 256, 5, 5, 4, 97, 0.6), smS = sampler(smudge, 256, 256);
    const grain = fbm(512, 512, 256, 256, 1, 99), grainS = sampler(grain, 512, 512);
    const R = new Float32Array(S * S), G = new Float32Array(S * S), B = new Float32Array(S * S), rough = new Float32Array(S * S), hgt = new Float32Array(S * S), mask = new Float32Array(S * S);
    const base = [s2l(0.60), s2l(0.605), s2l(0.598)], grout = [s2l(0.47), s2l(0.475), s2l(0.47)];
    const gw = 1.15; // meia-largura do rejunte em px (~2,7 mm total)
    for (let j = 0; j < S; j++) {
      const ty = Math.floor(j / tp), fyp = j - ty * tp;
      for (let i = 0; i < S; i++) {
        const tx = Math.floor(i / tp), fxp = i - tx * tp, k = j * S + i, t = tiles[ty * NT + tx];
        const u = i / S, v = j / S;
        const dEdge = Math.min(fxp + 0.5, tp - fxp - 0.5, fyp + 0.5, tp - fyp - 0.5); // px até a borda
        const gr = Math.max(0, Math.min(1, (gw + 0.5 - dEdge)));                       // cobertura do rejunte (AA)
        // padrão interno: nuvens deslocadas por placa (cada placa é um "recorte" diferente da chapa)
        const cu = (u + t.ox * 0.37) % 1, cv = (v + t.oy * 0.37) % 1;
        const c = cloudS(cu, cv) - 0.5, ve = Math.abs(veinS(cu * 1.0, cv) - 0.5), gn = grainS(u * 1.0, v) - 0.5;
        const veinLine = Math.exp(-ve * ve / 0.0006) * 0.035;
        let f = t.b * (1 + c * 0.10 + gn * 0.035 - veinLine);
        const warm = t.w;
        let r = base[0] * f * (1 + warm), g2 = base[1] * f, b = base[2] * f * (1 - warm);
        // leve escurecimento/bisel na borda da placa
        const bev = Math.exp(-dEdge / 2.2) * 0.10;
        r *= 1 - bev; g2 *= 1 - bev; b *= 1 - bev;
        R[k] = r * (1 - gr) + grout[0] * gr; G[k] = g2 * (1 - gr) + grout[1] * gr; B[k] = b * (1 - gr) + grout[2] * gr;
        const sm = smS(u, v) - 0.5;
        const rt = Math.max(0.09, 0.13 * t.r + sm * 0.08 + gn * 0.02);
        mask[k] = 1 - gr;
        rough[k] = rt * (1 - gr) + 0.6 * gr;
        // altura: rejunte rebaixado + bisel + leve empeno (lippage) por placa
        const lip = (t.tx * (fxp / tp - 0.5) + t.ty * (fyp / tp - 0.5)) * 1.2;
        hgt[k] = -gr * 0.45 - Math.exp(-dEdge / 1.6) * 0.2 + lip * 0.6 + c * 0.25;
      }
    }
    const map = tex(rgbCanvas(R, G, B, S, S), { meters: [M, M] });
    const roughnessMap = tex(grayCanvas(rough, S, S), { srgb: false, meters: [M, M] });
    const normalMap = tex(normalFromHeight(hgt, S, S, 1.0), { srgb: false, meters: [M, M] });
    // máscara: R = clearcoat (só na placa), G = rugosidade do verniz, A = intensidade especular (rejunte ≈ fosco)
    const mc = canvas(S, S), mg = mc.getContext('2d'), mi = mg.createImageData(S, S), md = mi.data;
    for (let k = 0; k < S * S; k++) { const m = mask[k]; md[k * 4] = 255 * m; md[k * 4 + 1] = 255 * (0.35 + 0.65 * (1 - m)); md[k * 4 + 2] = 0; md[k * 4 + 3] = 255 * (0.12 + 0.88 * m); }
    mg.putImageData(mi, 0, 0);
    const maskMap = tex(mc, { srgb: false, meters: [M, M] });
    return { map, roughnessMap, normalMap, maskMap };
  });
}

// ---------- AÇO GALVANIZADO (perfis C, cantoneiras) — 0,5 m × 0,5 m ----------
export function galvTextures() {
  return once('galv', () => {
    const S = 512, M = 0.5, rnd = rng(4242);
    // flor de zinco: Voronoi grosseiro (células ~1–2 cm) com brilho e rugosidade por célula
    const NC = 900, pts = []; for (let k = 0; k < NC; k++) pts.push({ x: rnd() * S, y: rnd() * S, b: (rnd() - 0.5), r: rnd() });
    const grid = new Map(), cs = 32; const key = (a, b) => a + ',' + b;
    for (const p of pts) { const gx = Math.floor(p.x / cs), gy = Math.floor(p.y / cs); (grid.get(key(gx, gy)) || grid.set(key(gx, gy), []).get(key(gx, gy))).push(p); }
    const streak = fbm(S, 64, 64, 2, 3, 61); // estrias de laminação ao longo de U
    const R = new Float32Array(S * S), G = new Float32Array(S * S), B = new Float32Array(S * S), rough = new Float32Array(S * S), hgt = new Float32Array(S * S);
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const gx = Math.floor(i / cs), gy = Math.floor(j / cs); let best = 1e9, sec = 1e9, bp = null;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        const gxx = ((gx + a) % (S / cs) + S / cs) % (S / cs), gyy = ((gy + b) % (S / cs) + S / cs) % (S / cs);
        for (const p of grid.get(key(gxx, gyy)) || []) {
          let dx = Math.abs(p.x - i), dy = Math.abs(p.y - j); dx = Math.min(dx, S - dx); dy = Math.min(dy, S - dy);
          const d = dx * dx + dy * dy; if (d < best) { sec = best; best = d; bp = p; } else if (d < sec) sec = d;
        }
      }
      const k = j * S + i, st = streak[Math.floor(j / 8) * S + i] - 0.5, edge = Math.sqrt(sec) - Math.sqrt(best) < 1.2 ? 1 : 0;
      const f = 1 + bp.b * 0.16 + st * 0.06 - edge * 0.05;
      R[k] = s2l(0.70) * f; G[k] = s2l(0.72) * f; B[k] = s2l(0.735) * f;
      rough[k] = 0.30 + bp.r * 0.16 + edge * 0.08 + st * 0.05; hgt[k] = bp.b * 0.6 + st * 0.8;
    }
    return { map: tex(rgbCanvas(R, G, B, S, S), { meters: [M, M] }), roughnessMap: tex(grayCanvas(rough, S, S), { srgb: false, meters: [M, M] }), normalMap: tex(normalFromHeight(hgt, S, S, 0.6), { srgb: false, meters: [M, M] }) };
  });
}

// ---------- JUNTA vertical entre painéis (textura transversal: u = largura da junta 0..1) ----------
export function jointTexture() {
  return once('joint', () => {
    const W = 32, H = 4, c = canvas(W, H), g = c.getContext('2d');
    const prof = (x) => { // perfil de brilho através da junta (0..1)
      const d = Math.abs(x - 0.5) * 2;
      if (d < 0.22) return 0.40;           // fresta escura
      if (d < 0.42) return 0.72;           // lábio do macho-fêmea em sombra
      if (d < 0.62) return 0.98;           // aresta clara (pega luz)
      return 0.93;
    };
    for (let i = 0; i < W; i++) { const v = Math.round(255 * prof((i + 0.5) / W)); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(i, 0, 1, H); }
    const t = tex(c, { wrap: false, mip: true }); t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping; return t;
  });
}

// ---------- CARTAZES de segurança genéricos (A3 retrato, impressão densa) — sem logotipo/instituição ----------
export function posterTexture(variant = 0) {
  return once('poster' + variant, () => {
    const w = 600, h = 848, c = canvas(w, h), g = c.getContext('2d'), rnd = rng(900 + variant * 17);
    const blue = '#20409c', blueD = '#152c74', yel = '#f1c232';
    g.fillStyle = blue; g.fillRect(0, 0, w, h);
    // título: faixa amarela com texto grande ilegível
    g.fillStyle = yel; g.fillRect(26, 26, w - 52, 74);
    g.fillStyle = blueD; textRow(g, rnd, 44, 40, w - 70, 20, 10); textRow(g, rnd, 44, 68, w - 160, 16, 8);
    // fotos: 1 grande + 2 pequenas (tons amarelados, figuras desfocadas, ruído de impressão)
    const layouts = [[[26, 116, w - 52, 300], [26, 430, 270, 170], [304, 430, 270, 170]], [[26, 116, 270, 250], [304, 116, 270, 250], [26, 380, w - 52, 210]],
      [[26, 116, w - 52, 230], [26, 360, 180, 160], [214, 360, 180, 160], [402, 360, 172, 160]], [[26, 116, 330, 330], [366, 116, 208, 160], [366, 286, 208, 160]]][variant % 4];
    for (const [x, y, pw, ph] of layouts) photo(g, rnd, x, y, pw, ph);
    const yT = Math.max(...layouts.map(([, y, , ph]) => y + ph)) + 18;
    // texto miúdo em 2 colunas com marcadores amarelos
    for (let col = 0; col < 2; col++) {
      let y = yT; const x0 = 30 + col * (w / 2 - 10), cw = w / 2 - 44;
      while (y < h - 92) { g.fillStyle = yel; g.fillRect(x0, y + 1, 7, 7); g.fillStyle = 'rgba(255,255,255,0.82)';
        const lines = 2 + Math.floor(rnd() * 3); for (let l = 0; l < lines && y < h - 92; l++) { textRow(g, rnd, x0 + 12, y, l === lines - 1 ? cw * (0.4 + rnd() * 0.5) : cw, 6, 3); y += 10; } y += 7; }
    }
    // rodapé com pictograma pequeno + linha de texto
    g.fillStyle = yel; g.fillRect(26, h - 74, w - 52, 48);
    g.fillStyle = blueD; g.beginPath(); g.arc(56, h - 50, 17, 0, Math.PI * 2); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(56, h - 50, 9, Math.PI, 0); g.fill(); g.fillRect(44, h - 51, 24, 4);
    g.fillStyle = blueD; textRow(g, rnd, 86, h - 60, w - 130, 9, 5); textRow(g, rnd, 86, h - 44, w - 220, 8, 5);
    // grão de impressão
    const im = g.getImageData(0, 0, w, h), d = im.data; for (let k = 0; k < d.length; k += 4) { const n = (rnd() - 0.5) * 14; d[k] += n; d[k + 1] += n; d[k + 2] += n; } g.putImageData(im, 0, 0);
    return tex(c, { wrap: false });
  });
}
function textRow(g, rnd, x, y, wmax, hh, gap) { let xx = x; while (xx < x + wmax - 6) { const ww = Math.min(x + wmax - xx, hh * (1.2 + rnd() * 4.5)); g.fillRect(xx, y, ww, hh); xx += ww + gap; } }
function photo(g, rnd, x, y, pw, ph) {
  g.save(); g.beginPath(); g.rect(x, y, pw, ph); g.clip();
  const gr = g.createLinearGradient(x, y, x + pw * 0.3, y + ph); const hue = 46 + rnd() * 10;
  gr.addColorStop(0, `hsl(${hue},${45 + rnd() * 20}%,${78 + rnd() * 10}%)`); gr.addColorStop(1, `hsl(${hue - 6},${40 + rnd() * 20}%,${55 + rnd() * 12}%)`);
  g.fillStyle = gr; g.fillRect(x, y, pw, ph);
  g.filter = 'blur(3px)';
  // fundo: blocos de "equipamento"
  for (let k = 0; k < 5; k++) { g.fillStyle = `hsla(${30 + rnd() * 30},${20 + rnd() * 40}%,${30 + rnd() * 50}%,0.6)`; g.fillRect(x + rnd() * pw, y + ph * (0.3 + rnd() * 0.5), pw * (0.1 + rnd() * 0.3), ph * (0.1 + rnd() * 0.5)); }
  // 1–2 trabalhadores (capacete amarelo/branco, roupa azul/laranja)
  const nf = 1 + Math.floor(rnd() * 2);
  for (let f = 0; f < nf; f++) { const cx = x + pw * (0.25 + rnd() * 0.5), s = ph * (0.30 + rnd() * 0.12), by = y + ph * 0.95;
    g.fillStyle = rnd() < 0.5 ? '#2d4f9a' : '#d9732c'; g.beginPath(); g.ellipse(cx, by - s * 0.55, s * 0.42, s * 0.62, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#c99a78'; g.beginPath(); g.arc(cx, by - s * 1.32, s * 0.2, 0, Math.PI * 2); g.fill();
    g.fillStyle = rnd() < 0.6 ? '#f2d023' : '#f4f4f0'; g.beginPath(); g.ellipse(cx, by - s * 1.45, s * 0.25, s * 0.14, 0, Math.PI, 0); g.fill(); }
  g.filter = 'none';
  const im = g.getImageData(x, y, pw, ph), d = im.data; for (let k = 0; k < d.length; k += 4) { const n = (rnd() - 0.5) * 30; d[k] += n; d[k + 1] += n; d[k + 2] += n * 0.8; } g.putImageData(im, x, y);
  g.restore(); g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 3; g.strokeRect(x + 1.5, y + 1.5, pw - 3, ph - 3);
}

// ---------- JANELA: película leitosa creme (folha direita) e exterior noturno ----------
export function filmTexture() {
  return once('film', () => {
    const W = 256, H = 256, c = canvas(W, H), g = c.getContext('2d');
    const f = fbm(64, 16, 16, 1, 3, 71);
    for (let i = 0; i < W; i++) { const n = f[Math.floor(i / 4)] - 0.5, fold = Math.sin(i / W * Math.PI * 2 * 9) * 0.5 + 0.5;
      const l = 0.80 + n * 0.10 - fold * 0.06; g.fillStyle = `rgb(${Math.round(250 * l)},${Math.round(238 * l)},${Math.round(210 * l)})`; g.fillRect(i, 0, 1, H); }
    const grd = g.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, 'rgba(255,255,255,0.06)'); grd.addColorStop(1, 'rgba(0,0,0,0.10)'); g.fillStyle = grd; g.fillRect(0, 0, W, H);
    return tex(c, { wrap: false });
  });
}
export function exteriorTexture() { // vão claro bege-acinzentado (muro/corredor iluminado lá fora, como na foto)
  return once('ext', () => {
    const W = 256, H = 256, c = canvas(W, H), g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, '#d6cdbb'); grd.addColorStop(0.6, '#cdc4b1'); grd.addColorStop(1, '#b9b09e');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    g.filter = 'blur(6px)'; g.fillStyle = 'rgba(150,140,122,0.35)'; g.fillRect(W * 0.62, 0, W * 0.08, H); g.fillRect(0, H * 0.7, W, H * 0.05); g.filter = 'none';
    return tex(c, { wrap: false });
  });
}
// dia nublado: céu cinza-esbranquiçado difuso + prédio vizinho genérico claro (sem marcas)
export function exteriorCloudTexture() {
  return once('extC', () => {
    const W = 512, H = 512, c = canvas(W, H), g = c.getContext('2d'), rnd = rng(515);
    const sky = g.createLinearGradient(0, 0, 0, H * 0.55); sky.addColorStop(0, '#e4e7ea'); sky.addColorStop(1, '#f1f2f2'); g.fillStyle = sky; g.fillRect(0, 0, W, H);
    g.filter = 'blur(14px)'; for (let k = 0; k < 14; k++) { g.fillStyle = `rgba(${200 + rnd() * 30},${205 + rnd() * 30},${212 + rnd() * 30},0.5)`; g.beginPath(); g.ellipse(rnd() * W, rnd() * H * 0.45, 40 + rnd() * 90, 14 + rnd() * 26, 0, 0, Math.PI * 2); g.fill(); } g.filter = 'none';
    // prédio vizinho (bloco claro com janelas em fita) e muro
    g.fillStyle = '#c9c7c1'; g.fillRect(W * 0.08, H * 0.40, W * 0.6, H * 0.6);
    g.fillStyle = '#9fa3a6'; for (let r = 0; r < 3; r++) for (let k = 0; k < 6; k++) g.fillRect(W * 0.11 + k * W * 0.095, H * (0.46 + r * 0.13), W * 0.07, H * 0.06);
    g.fillStyle = '#d9d4ca'; g.fillRect(0, H * 0.72, W, H * 0.28); g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(0, H * 0.72, W, 6);
    g.filter = 'blur(2px)'; g.drawImage(c, 0, 0); g.filter = 'none';
    return tex(c, { wrap: false });
  });
}
// dia ensolarado: céu azul-claro, muro creme ensolarado, copa de árvore e prédio genérico
export function exteriorSunTexture() {
  return once('extS', () => {
    const W = 512, H = 512, c = canvas(W, H), g = c.getContext('2d'), rnd = rng(616);
    const sky = g.createLinearGradient(0, 0, 0, H * 0.6); sky.addColorStop(0, '#7fb2e3'); sky.addColorStop(1, '#c7dff2'); g.fillStyle = sky; g.fillRect(0, 0, W, H);
    g.filter = 'blur(10px)'; for (let k = 0; k < 5; k++) { g.fillStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.ellipse(rnd() * W, H * (0.08 + rnd() * 0.25), 50 + rnd() * 70, 12 + rnd() * 16, 0, 0, Math.PI * 2); g.fill(); } g.filter = 'none';
    g.fillStyle = '#e6dccb'; g.fillRect(W * 0.55, H * 0.30, W * 0.45, H * 0.7); g.fillStyle = '#b9b2a6'; g.fillRect(W * 0.55, H * 0.30, W * 0.07, H * 0.7);
    g.fillStyle = '#8f9aa3'; for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) g.fillRect(W * 0.66 + k * W * 0.11, H * (0.36 + r * 0.14), W * 0.07, H * 0.07);
    // árvore: tronco + copa de vários verdes
    g.fillStyle = '#5d4a36'; g.fillRect(W * 0.27, H * 0.5, W * 0.03, H * 0.3);
    g.filter = 'blur(3px)'; for (let k = 0; k < 60; k++) { const a = rnd() * Math.PI * 2, r = rnd() * W * 0.17; g.fillStyle = `hsl(${95 + rnd() * 35},${35 + rnd() * 25}%,${22 + rnd() * 26}%)`; g.beginPath(); g.arc(W * 0.285 + Math.cos(a) * r, H * 0.42 + Math.sin(a) * r * 0.7, 10 + rnd() * 22, 0, Math.PI * 2); g.fill(); } g.filter = 'none';
    // muro ensolarado com sombra projetada
    g.fillStyle = '#efe4cf'; g.fillRect(0, H * 0.70, W, H * 0.30); g.fillStyle = 'rgba(70,60,40,0.22)'; g.beginPath(); g.moveTo(0, H * 0.70); g.lineTo(W * 0.45, H * 0.70); g.lineTo(W * 0.30, H); g.lineTo(0, H); g.fill();
    g.filter = 'blur(1.5px)'; g.drawImage(c, 0, 0); g.filter = 'none';
    return tex(c, { wrap: false });
  });
}
export function nightTexture() {
  return once('night', () => {
    const W = 256, H = 256, c = canvas(W, H), g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, '#0d1118'); grd.addColorStop(0.55, '#141820'); grd.addColorStop(1, '#1c1d1f');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    // silhuetas difusas (muro / poste ao longe)
    g.fillStyle = 'rgba(40,40,42,0.7)'; g.fillRect(0, H * 0.62, W, H * 0.38);
    const r = g.createRadialGradient(W * 0.72, H * 0.3, 2, W * 0.72, H * 0.3, W * 0.35); r.addColorStop(0, 'rgba(120,110,90,0.35)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, W, H);
    return tex(c, { wrap: false });
  });
}

// ---------- QUADRO BRANCO: laminado branco brilhante com fantasmas de pincel apagado, riscos e pontinhos ----------
// map (albedo) + roughnessMap (G) — 2048×1024 cobre a superfície inteira (u 0..1 = largura, v 0..1 = altura)
export function whiteboardTextures() {
  return once('wb', () => {
    const W = 2048, H = 1024, rnd = rng(3131);
    const a = canvas(W, H), g = a.getContext('2d'), r = canvas(W, H), gr = r.getContext('2d');
    const base = g.createLinearGradient(0, 0, W, H); base.addColorStop(0, '#f6f7f7'); base.addColorStop(1, '#f1f2f2'); g.fillStyle = base; g.fillRect(0, 0, W, H);
    gr.fillStyle = 'rgb(18,18,18)'; gr.fillRect(0, 0, W, H); // rugosidade ≈0,07
    const stroke = (ctx, col, lw, blur, pts) => { ctx.save(); ctx.filter = `blur(${blur}px)`; ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); ctx.restore(); };
    // névoa geral de apagador (faixas largas, curvas, muito suaves)
    for (let k = 0; k < 26; k++) { const x = rnd() * W, y = rnd() * H, len = 200 + rnd() * 600, ang = (rnd() - 0.5) * 0.6, pts = [];
      for (let t = 0; t <= 6; t++) pts.push([x + Math.cos(ang) * len * t / 6 + Math.sin(t * 1.3 + k) * 30, y + Math.sin(ang) * len * t / 6 + Math.cos(t + k) * 40]);
      stroke(g, `rgba(150,156,162,${0.012 + rnd() * 0.02})`, 50 + rnd() * 90, 22, pts); stroke(gr, `rgba(70,70,70,${0.25 + rnd() * 0.25})`, 60 + rnd() * 90, 18, pts); }
    // fantasmas de escrita (linhas de "texto" apagadas)
    for (let line = 0; line < 9; line++) { const y0 = 120 + line * 95 + rnd() * 20; let x = 140 + rnd() * 200; const xe = W - 200 - rnd() * 500;
      while (x < xe) { const ww = 30 + rnd() * 90, pts = []; for (let t = 0; t <= 8; t++) pts.push([x + ww * t / 8, y0 + Math.sin(t * 2.1 + x) * 14]); stroke(g, `rgba(120,128,136,${0.008 + rnd() * 0.018})`, 5, 2.5, pts); x += ww + 18 + rnd() * 30; } }
    // marcas mais escuras (pincel mal apagado), como no centro-direita da foto
    for (let k = 0; k < 3; k++) { const x = W * (0.45 + rnd() * 0.25), y = H * (0.3 + rnd() * 0.35), pts = [];
      for (let t = 0; t <= 6; t++) pts.push([x + (rnd() - 0.5) * 40 + t * (rnd() - 0.3) * 10, y + t * (25 + rnd() * 25)]);
      stroke(g, `rgba(80,88,98,${0.04 + rnd() * 0.07})`, 6 + rnd() * 10, 4 + rnd() * 4, pts); }
    stroke(g, 'rgba(60,75,95,0.13)', 8, 3.5, [[W * 0.585, H * 0.38], [W * 0.59, H * 0.47], [W * 0.592, H * 0.58]]);
    stroke(g, 'rgba(120,130,140,0.10)', 30, 10, [[W * 0.57, H * 0.27], [W * 0.6, H * 0.22], [W * 0.63, H * 0.25]]);
    // traço azul/verde residual fino e vertical (canto inferior esquerdo da foto)
    stroke(g, 'rgba(70,140,170,0.22)', 2.5, 1, [[W * 0.31, H * 0.86], [W * 0.312, H * 0.93], [W * 0.311, H * 0.98]]);
    // riscos finos (pegam brilho diferente)
    for (let k = 0; k < 40; k++) { const x = rnd() * W, y = rnd() * H, l = 15 + rnd() * 80, an = rnd() * Math.PI; const pts = [[x, y], [x + Math.cos(an) * l, y + Math.sin(an) * l]];
      stroke(g, `rgba(150,150,150,${0.05 + rnd() * 0.08})`, 1.2, 0, pts); stroke(gr, 'rgba(110,110,110,0.8)', 1.5, 0, pts); }
    // pontinhos (ponta de pincel, sujeira)
    for (let k = 0; k < 140; k++) { g.fillStyle = `rgba(${60 + rnd() * 60},${60 + rnd() * 60},${70 + rnd() * 60},${0.15 + rnd() * 0.45})`; g.beginPath(); g.arc(rnd() * W, rnd() * H, 0.8 + rnd() * 2.2, 0, Math.PI * 2); g.fill(); }
    const map = tex(a, { wrap: false }), roughnessMap = tex(r, { wrap: false, srgb: false });
    return { map, roughnessMap };
  });
}

// sombra de contato suave (alfa) para o quadro: retângulo desfocado, mais forte embaixo
export function softShadowTexture() {
  return once('wbShadow', () => {
    const W = 512, H = 256, c = canvas(W, H), g = c.getContext('2d');
    g.filter = 'blur(7px)'; g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(16, 18, W - 32, H - 30); g.filter = 'none';
    const t = tex(c, { wrap: false }); t.colorSpace = THREE.NoColorSpace; return t;
  });
}

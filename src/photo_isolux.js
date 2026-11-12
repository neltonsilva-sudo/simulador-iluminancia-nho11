// FOTOMETRIA — mapa isolux 3D: cores (turbo) no plano de trabalho, linhas isolux, rótulos em “pílulas” (sprites de
// tamanho constante na tela) e legenda em canvas (DOM). Cálculo num Web Worker (fallback síncrono), com debounce.
// Dono: FOTOMETRIA.
import * as THREE from 'three';
import { computeGrid, REFLECT, MF, OPENINGS, primeGeometry, hasGeometry } from './photo_core.js';
import { colorizeGrid, contours, isoLevels, niceRange, anchoredRange, colorAt } from './photo_color.js';
import { attachOverlay } from './photo_overlay.js';

const NX = 128;            // amostras ao longo de W (a grade fica ≈128 × 199 na sala padrão)
const PX_PER_M = 190;      // resolução da textura
const DEBOUNCE = 140;
const LABEL_PX = 15;       // altura dos rótulos na tela (px CSS)
const fmtInt = (v) => Math.round(v).toLocaleString('pt-BR');
const fmt2 = (v) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function buildIsolux(stage) {
  const { scene } = stage;
  // cena de sobreposição desenhada depois do tone mapping (cores exatas, independentes da exposição)
  const overlay = attachOverlay(stage);
  const group = new THREE.Group(); group.name = 'isolux'; group.visible = false; overlay.scene.add(group);
  const setShown = (b) => { group.visible = b; overlay.setEnabled(b); legend.style.display = b ? 'block' : 'none'; if (b) placeLegend(); };
  // legenda: canto inferior esquerdo sem UI; com o painel da UI aberto, canto inferior direito acima da barra de vistas
  function placeLegend() {
    const ui = document.getElementById('ui'), uiOn = ui && getComputedStyle(ui).display !== 'none' && ui.children.length > 0;
    Object.assign(legend.style, uiOn ? { left: 'auto', right: '16px', bottom: '84px' } : { left: '16px', right: 'auto', bottom: '16px' });
  }

  // ---- plano colorido
  const cv = document.createElement('canvas'); cv.width = 4; cv.height = 4;
  const ctx = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 1, depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  plane.rotation.x = -Math.PI / 2; plane.renderOrder = 20; plane.name = 'isolux-plane'; group.add(plane);
  // moldura fina (borda do plano de trabalho)
  const frame = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.5, 0.5, 0), new THREE.Vector3(0.5, 0.5, 0), new THREE.Vector3(0.5, -0.5, 0), new THREE.Vector3(-0.5, -0.5, 0)]),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false }));
  frame.renderOrder = 21; plane.add(frame);

  // ---- rótulos
  const labels = new THREE.Group(); labels.renderOrder = 30; group.add(labels);
  const labelTexCache = new Map();

  // ---- legenda (canvas DOM)
  const legend = document.createElement('canvas'); legend.className = 'photo-isolux-legend';
  Object.assign(legend.style, { position: 'fixed', left: '16px', bottom: '16px', width: '360px', height: '112px', zIndex: 5, pointerEvents: 'none',
    borderRadius: '12px', boxShadow: '0 6px 24px rgba(0,0,0,.28)', display: 'none', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' });
  document.body.appendChild(legend);

  // ---- worker
  let worker = null, busy = false, pending = null, seq = 0, applied = 0, timer = 0, visible = false, dirty = false, args = null;
  try {
    worker = new Worker(new URL('./photo_worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (ev) => { const m = ev.data;
      if (m.type === 'geom') { primeGeometry(m.room, m.data); return; } // fatores de forma calculados fora da thread principal
      busy = false; if (m.error) { console.error('[isolux worker]', m.error); worker = null; }
      else if (m.seq >= applied) { applied = m.seq; apply(m.grid, m.rgba, m.cw, m.ch, m.range); }
      if (pending) { const p = pending; pending = null; post(p); } };
    worker.onerror = (e) => { console.warn('[isolux] worker indisponível, usando cálculo local', e.message); worker = null; busy = false; if (args) run(); };
  } catch (e) { worker = null; }

  let room = { L: 9.16, W: 5.9, H: 2.7, plane: 0.75 };
  let stats = null, range = null, levelsCache = [], curLums = [], curSpec = {};

  function post(job) { busy = true; worker.postMessage(job); }
  const Ereq = () => { const v = +globalThis.__sim?.state?.Emin; return Number.isFinite(v) && v > 0 ? v : 0; };
  let lastReq = Ereq();
  // troca de ambiente (Quadro 1) muda a âncora da escala de cores → recolorir
  try { globalThis.__sim?.on?.('change', () => { const e = Ereq(); if (e !== lastReq) { lastReq = e; if (visible) schedule(); else dirty = true; } }); } catch { /* sem app */ }
  // pré-aquece os fatores de forma de salas novas no worker (evita 0,2–1 s de trava na thread principal)
  const geomAsked = new Set();
  function prewarm(r) {
    if (!worker || !r || hasGeometry(r)) return; const k = `${(+r.L).toFixed(3)}|${(+r.W).toFixed(3)}|${(+r.H).toFixed(3)}`;
    if (geomAsked.has(k)) return; geomAsked.add(k); worker.postMessage({ type: 'geom', room: { L: +r.L, W: +r.W, H: +r.H } });
  }
  function run() {
    if (!args) return; dirty = false;
    const [lums, r, spec] = args; room = { ...r, plane: r.plane ?? 0.75 };
    const nx = NX, nz = Math.max(16, Math.round(NX * room.L / room.W));
    const cw = Math.min(2048, Math.round(room.W * PX_PER_M)), ch = Math.min(2048, Math.round(room.L * PX_PER_M));
    const clean = (o) => JSON.parse(JSON.stringify(o));
    const job = { seq: ++seq, lums: clean(lums), room: clean(room), spec: clean(spec), reflect: { ...REFLECT }, mf: MF, openings: clean(OPENINGS), nx, nz, cw, ch, Ereq: Ereq() };
    curLums = job.lums; curSpec = job.spec;
    if (worker) { if (busy) pending = job; else post(job); return; }
    // fallback síncrono (grade reduzida para não travar)
    const g = computeGrid(job.lums, job.room, job.spec, 0.25, { nx: 72, nz: Math.round(72 * room.L / room.W) });
    const rgba = colorizeGrid(g, Math.round(cw / 2), Math.round(ch / 2), anchoredRange(g.Emax, job.Ereq));
    applied = job.seq; apply(g, rgba, Math.round(cw / 2), Math.round(ch / 2), rgba.range);
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(run, DEBOUNCE); }

  function apply(g, rgba, cw, ch, R) {
    const lit = g.Emax > 0.5;
    stats = { Emin: g.Emin, Emax: g.Emax, Emed: g.Emed, U0: g.U0, nx: g.nx, nz: g.nz, lit, Ereq: Ereq() };
    range = R;
    cv.width = cw; cv.height = ch;
    const img = new ImageData(rgba.data || rgba, cw, ch);
    ctx.putImageData(img, 0, 0);
    // véu translúcido: alfa aplicado pelo canvas para que linhas fiquem opacas
    ctx.globalCompositeOperation = 'destination-in'; ctx.fillStyle = `rgba(0,0,0,${lit ? 0.86 : 0.35})`; ctx.fillRect(0, 0, cw, ch);
    ctx.globalCompositeOperation = 'source-over';
    const sx = cw / g.nx, sz = ch / g.nz, toPx = (p) => [(p[0] + 0.5) * sx, (p[1] + 0.5) * sz];
    const levels = lit ? isoLevels(g.Emin, g.Emax, niceRange(g.Emin, g.Emax)) : []; // linhas: passo fino dos dados; cores: escala ancorada
    const lines = [];
    // 70 % de Ē (critério do item 5 da NHO-11) — tracejada
    const e70 = 0.7 * g.Emed; const show70 = lit && e70 > g.Emin && e70 < g.Emax;
    const drawSet = [...levels.map((l) => ({ ...l, kind: 'iso' })), ...(show70 ? [{ v: e70, kind: '70' }] : [])];
    const m = cw / room.W; // px por metro na textura — larguras de linha em metros (legíveis em qualquer vista)
    for (const L of drawSet) {
      const cs = contours(g, L.v); lines.push({ ...L, cs });
      const w = (L.kind === '70' ? 0.040 : L.major ? 0.046 : 0.028) * m;
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      const path = () => { ctx.beginPath(); for (const c of cs) { c.pts.forEach((p, k) => { const [x, y] = toPx(p); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); if (c.closed) ctx.closePath(); } };
      path(); ctx.setLineDash([]); ctx.strokeStyle = 'rgba(8,12,20,0.50)'; ctx.lineWidth = w + 0.024 * m; ctx.stroke();
      path(); ctx.setLineDash(L.kind === '70' ? [0.16 * m, 0.10 * m] : []);
      ctx.strokeStyle = L.kind === '70' ? '#ffffff' : (L.major ? 'rgba(255,255,255,0.98)' : 'rgba(255,255,255,0.82)'); ctx.lineWidth = w; ctx.stroke();
    }
    ctx.setLineDash([]);
    // contorno das luminárias (projeção no plano), estilo planta luminotécnica
    for (const l of curLums || []) {
      const panel = curSpec?.dist === 'panel' || curSpec?.kind === 'panel';
      const a = l.axis === 'z', len = panel ? (curSpec.lenM || 0.62) : l.len, wid = panel ? (curSpec.widM || 0.62) : Math.max(l.wid || 0.09, 0.07);
      const w = (a ? wid : len) * m, h = (a ? len : wid) * m, x = (l.x + room.W / 2) * m - w / 2, y = (l.z + room.L / 2) * m - h / 2;
      const f = Math.min(1, Math.max(0, +(curSpec?.lumFactors?.[l.id] ?? 1) || 0)); // depreciada (cinza) / queimada (×)
      ctx.beginPath(); ctx.roundRect(x, y, w, h, Math.min(w, h) * 0.3);
      ctx.fillStyle = f >= 0.999 ? 'rgba(255,255,255,0.92)' : `rgba(${Math.round(60 + 195 * f)},${Math.round(60 + 195 * f)},${Math.round(64 + 191 * f)},0.92)`;
      ctx.fill(); ctx.lineWidth = 0.018 * m; ctx.strokeStyle = f < 0.999 ? 'rgba(255,93,108,0.95)' : 'rgba(12,16,24,0.75)'; ctx.stroke();
      if (f < 0.02) { const cx = x + w / 2, cy = y + h / 2, r = 0.16 * m; ctx.strokeStyle = '#ff5d6c'; ctx.lineWidth = 0.035 * m; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx + r, cy + r); ctx.moveTo(cx + r, cy - r); ctx.lineTo(cx - r, cy + r); ctx.stroke(); }
    }
    tex.needsUpdate = true;
    plane.scale.set(room.W, room.L, 1); plane.position.set(0, room.plane + 0.012, 0);
    levelsCache = lines;
    placeLabels(g, lines);
    drawLegend();
    setShown(visible);
  }

  // ---- rótulos ao longo das linhas (sprites de tamanho constante na tela)
  function labelTexture(text, strong) {
    const k = text + (strong ? '*' : ''); if (labelTexCache.has(k)) return labelTexCache.get(k);
    const s = 4, fs = 13 * s, padX = 7 * s, c = document.createElement('canvas'), x = c.getContext('2d');
    x.font = `600 ${fs}px Inter, system-ui, -apple-system, "Segoe UI", sans-serif`;
    const tw = Math.ceil(x.measureText(text).width); c.width = tw + 2 * padX; c.height = Math.round(fs * 1.55);
    x.font = `600 ${fs}px Inter, system-ui, -apple-system, "Segoe UI", sans-serif`;
    const r = c.height / 2; x.beginPath(); x.roundRect(1, 1, c.width - 2, c.height - 2, r - 1);
    x.fillStyle = strong ? 'rgba(14,18,26,0.86)' : 'rgba(14,18,26,0.72)'; x.fill();
    x.lineWidth = s * 0.9; x.strokeStyle = strong ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.35)'; x.stroke();
    x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, c.width / 2, c.height / 2 + s * 0.6);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
    const v = { tex: t, aspect: c.width / c.height }; labelTexCache.set(k, v); return v;
  }
  // Cadeias em coordenadas do mundo (guardadas a cada cálculo); a disposição dos rótulos é feita em ESPAÇO DE TELA para a
  // câmera atual (sem sobrepor outros rótulos nem os marcadores dos pontos) e refeita quando a câmera para de se mover.
  let chainsW = [];
  function placeLabels(g, lines) {
    const W = room.W, L = room.L, toW = (p) => [-W / 2 + (p[0] + 0.5) / g.nx * W, -L / 2 + (p[1] + 0.5) / g.nz * L];
    chainsW = [...lines].sort((a, b) => (b.kind === '70') - (a.kind === '70') || (b.major ? 1 : 0) - (a.major ? 1 : 0) || a.v - b.v)
      .map((Ln) => ({ Ln, chains: Ln.cs.map((c) => { const w = c.pts.map(toW); let len = 0; for (let k = 1; k < w.length; k++) len += Math.hypot(w[k][0] - w[k - 1][0], w[k][1] - w[k - 1][1]); return { w, len }; })
        .filter((c) => c.len > 0.6).sort((a, b) => b.len - a.len) }));
    layoutLabels();
  }
  const _v = new THREE.Vector3();
  function layoutLabels() {
    labels.children.slice().forEach((o) => { labels.remove(o); o.material.dispose(); });
    const cam = stage.camera; if (!cam || !chainsW.length) return;
    cam.updateMatrixWorld(); const el = stage.renderer?.domElement, vw = el?.clientWidth || innerWidth, vh = el?.clientHeight || innerHeight;
    const y = room.plane + 0.03, hpx = LABEL_PX * 1.55;
    const proj = (x, z) => { _v.set(x, y, z).project(cam); return _v.z > 1 || _v.z < -1 ? null : [(_v.x + 1) / 2 * vw, (1 - _v.y) / 2 * vh]; };
    // marcadores dos pontos (projeção no teto e no plano); com leitura digitada a etiqueta fica larga (~140 px)
    const marks = []; try { const vals = globalThis.__sim?.state?.values || {}, shown = globalThis.__sim?.state?.showPoints !== false;
      if (shown) for (const p of globalThis.__sim?.points?.() || []) { const hw = vals[p.id] != null && vals[p.id] !== '' ? 78 : 26;
        for (const yy of [room.plane, room.H]) { _v.set(p.x, yy, p.z).project(cam); if (_v.z <= 1 && _v.z >= -1) marks.push([(_v.x + 1) / 2 * vw, (1 - _v.y) / 2 * vh, hw]); } } } catch { /* sem app */ }
    const rects = []; let total = 0;
    // contorno da sala projetado (convexo): o rótulo deve caber dentro do plano de trabalho
    const quad = [[-W2(), -L2()], [W2(), -L2()], [W2(), L2()], [-W2(), L2()]].map(([qx, qz]) => proj(qx, qz));
    const inside = (px, py, tol) => { if (quad.some((q) => !q)) return true; let sgn = 0;
      for (let k = 0; k < 4; k++) { const [ax, ay] = quad[k], [bx, by] = quad[(k + 1) % 4], ex = bx - ax, ey = by - ay, len = Math.hypot(ex, ey) || 1;
        const d = (ex * (py - ay) - ey * (px - ax)) / len; if (!sgn) sgn = Math.sign(d) || 1; if (d * sgn < -tol) return false; }
      return true; };
    const rectInside = (r, tol) => inside(r[0], r[1], tol) && inside(r[2], r[1], tol) && inside(r[0], r[3], tol) && inside(r[2], r[3], tol);
    // obstáculos de tela: legenda e painéis da UI (coordenadas relativas ao canvas)
    const blocks = []; try { const cr = el.getBoundingClientRect();
      const add = (e) => { if (!e || getComputedStyle(e).display === 'none') return; const b = e.getBoundingClientRect(); if (b.width && b.height) blocks.push([b.left - cr.left, b.top - cr.top, b.right - cr.left, b.bottom - cr.top]); };
      if (legend.style.display !== 'none') add(legend);
      const ui = document.getElementById('ui'); if (ui && getComputedStyle(ui).display !== 'none') for (const c of ui.children) add(c); } catch { /* sem DOM */ }
    const hit = (r) => blocks.some((o) => r[0] < o[2] + 6 && r[2] > o[0] - 6 && r[1] < o[3] + 6 && r[3] > o[1] - 6) || rects.some((o) => r[0] < o[2] + 8 && r[2] > o[0] - 8 && r[1] < o[3] + 6 && r[3] > o[1] - 6)
      || marks.some((m) => m[0] > r[0] - m[2] && m[0] < r[2] + m[2] && m[1] > r[1] - 30 && m[1] < r[3] + 36);
    for (const { Ln, chains } of chainsW) {
      const text = Ln.kind === '70' ? `70% Ē · ${fmtInt(Ln.v)} lx` : `${fmtInt(Ln.v)} lx`;
      const lt = labelTexture(text, Ln.kind === '70' || Ln.major), wpx = hpx * lt.aspect;
      let count = 0;
      for (const c of chains) {
        const want = c.len > 7 ? 2 : 1;
        for (let n = 0; n < want && count < (chains[0].len > 7 ? 2 : 1) && total < 10; n++) {
          let best = null, bestS = -Infinity;
          // a linha de 70 % Ē costuma ser um arco curto no canto: se o rótulo não couber sobre ela, desloca para dentro
          const cand = []; for (let k = 0; k < c.w.length; k += 2) cand.push(c.w[k]);
          if (Ln.kind === '70') for (const sh of [0.35, 0.6, 0.9]) for (let k = 0; k < c.w.length; k += 3) { const [px, pz] = c.w[k], d = Math.hypot(px, pz) || 1; cand.push([px - px / d * sh, pz - pz / d * sh, sh]); }
          for (const cw of cand) {
            const [x, z] = cw, wall = Math.min(W2() - Math.abs(x), L2() - Math.abs(z)); if (wall < (Ln.kind === '70' ? 0.2 : 0.5)) continue;
            const q = proj(x, z); if (!q) continue;
            const r = [q[0] - wpx / 2, q[1] - hpx / 2, q[0] + wpx / 2, q[1] + hpx / 2];
            if (r[0] < 6 || r[1] < 6 || r[2] > vw - 6 || r[3] > vh - 6 || hit(r) || !rectInside(r, Ln.kind === '70' ? 10 : -2)) continue;
            let dl = 400; for (const o of rects) dl = Math.min(dl, Math.hypot((o[0] + o[2]) / 2 - q[0], (o[1] + o[3]) / 2 - q[1]));
            const s = Math.min(dl, 260) + 40 * Math.min(wall, 1.5) - 200 * (cw[2] || 0);
            if (s > bestS) { bestS = s; best = { x, z, r }; }
          }
          if (!best) break;
          rects.push(best.r); count++; total++;
          const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: lt.tex, depthTest: false, depthWrite: false, transparent: true, toneMapped: false, sizeAttenuation: false }));
          sp.userData.aspect = lt.aspect; sp.position.set(best.x, y, best.z); sp.renderOrder = 30; labels.add(sp);
        }
      }
    }
    rescaleLabels();
  }
  const W2 = () => room.W / 2, L2 = () => room.L / 2;
  function rescaleLabels() {
    const cam = stage.camera; if (!cam || !labels.children.length) return;
    const h = stage.renderer?.domElement?.clientHeight || innerHeight;
    const unit = (LABEL_PX * 1.55 / h) * 2 * Math.tan((cam.fov * Math.PI / 180) / 2);
    for (const sp of labels.children) sp.scale.set(unit * sp.userData.aspect, unit, 1);
  }
  let camSig = '', relayoutT = 0;
  stage.onFrame?.(() => {
    if (!group.visible) return; rescaleLabels();
    const c = stage.camera; if (!c) return;
    const sig = c.matrixWorld.elements.map((v) => v.toFixed(3)).join(',') + c.fov + (stage.renderer?.domElement?.clientWidth || 0);
    if (sig !== camSig) { camSig = sig; clearTimeout(relayoutT); relayoutT = setTimeout(layoutLabels, 180); }
  });

  // ---- legenda
  function drawLegend() {
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1), Wc = 360, Hc = 112;
    legend.width = Wc * dpr; legend.height = Hc * dpr; const x = legend.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, Wc, Hc);
    x.beginPath(); x.roundRect(0, 0, Wc, Hc, 12); x.fillStyle = 'rgba(16,19,25,0.82)'; x.fill();
    x.lineWidth = 1; x.strokeStyle = 'rgba(255,255,255,0.10)'; x.stroke();
    const font = (w, s) => `${w} ${s}px Inter, system-ui, -apple-system, "Segoe UI", sans-serif`;
    x.textBaseline = 'alphabetic'; x.fillStyle = '#eef2f7'; x.font = font(650, 12); x.fillText('Simulação (luxímetro virtual)', 14, 20);
    const tw = x.measureText('Simulação (luxímetro virtual)').width;
    x.font = font(500, 10.5); x.fillStyle = 'rgba(233,237,243,0.58)';
    x.fillText(`· plano ${fmt2(room.plane ?? 0.75).replace(/0$/, '')} m`, 14 + tw + 6, 20);
    x.textAlign = 'right'; x.fillText('lux', Wc - 14, 20); x.textAlign = 'left';
    if (!stats || !stats.lit) { x.fillStyle = 'rgba(233,237,243,0.75)'; x.font = font(500, 12); x.fillText('Luminárias desligadas — 0 lux', 14, 62); return; }
    const bx = 14, by = 48, bw = Wc - 28, bh = 12, R = range;
    const gr = x.createLinearGradient(bx, 0, bx + bw, 0);
    for (let k = 0; k <= 16; k++) { const c = colorAt(k / 16); gr.addColorStop(k / 16, `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`); }
    x.beginPath(); x.roundRect(bx, by, bw, bh, 3); x.fillStyle = gr; x.fill();
    const X = (v) => bx + Math.min(1, Math.max(0, (v - R.lo) / (R.hi - R.lo))) * bw;
    // colchete sob a barra: faixa presente na sala (Emín–Emáx)
    const x0 = X(stats.Emin), x1 = X(stats.Emax);
    x.strokeStyle = 'rgba(255,255,255,0.85)'; x.lineWidth = 1.4; x.beginPath(); x.moveTo(x0, by + bh + 2); x.lineTo(x0, by + bh + 6); x.lineTo(x1, by + bh + 6); x.lineTo(x1, by + bh + 2); x.stroke();
    // marcas verticais: Ē (cheia), 70 % Ē (tracejada), Quadro 1 (vermelha) com rótulos acima da barra
    const tags = [];
    const mark = (v, color, dash, text) => { const px = X(v); x.save(); x.strokeStyle = color; x.lineWidth = 2; if (dash) x.setLineDash([2.5, 2]);
      x.beginPath(); x.moveTo(px, by - 3); x.lineTo(px, by + bh + 3); x.stroke(); x.restore(); tags.push({ px, text, color }); };
    if (0.7 * stats.Emed > R.lo) mark(0.7 * stats.Emed, '#ffffff', true, `70% ${fmtInt(0.7 * stats.Emed)}`);
    mark(stats.Emed, '#ffffff', false, `Ē ${fmtInt(stats.Emed)}`);
    if (stats.Ereq > 0) mark(stats.Ereq, '#ff5d6c', false, `Quadro 1 · ${fmtInt(stats.Ereq)}`);
    x.font = font(600, 10); let lastRight = -1e9;
    for (const t of tags.sort((a, b) => a.px - b.px)) { const w = x.measureText(t.text).width; let lx = Math.min(Wc - 12 - w, Math.max(12, t.px - w / 2));
      if (lx < lastRight + 6) lx = lastRight + 6; lx = Math.min(Wc - 12 - w, lx); x.fillStyle = t.color === '#ffffff' ? '#eef2f7' : t.color; x.fillText(t.text, lx, by - 7); lastRight = lx + w; }
    // escala
    x.font = font(500, 10); x.fillStyle = 'rgba(233,237,243,0.72)'; x.textAlign = 'center';
    for (let v = R.lo; v <= R.hi + 1e-9; v += R.step) x.fillText(fmtInt(v), Math.min(Wc - 16, Math.max(16, X(v))), by + bh + 19);
    x.textAlign = 'left';
    let cx = 14; const item = (k, v, col) => { x.font = font(500, 11); x.fillStyle = 'rgba(233,237,243,0.6)'; x.fillText(k, cx, Hc - 12); cx += x.measureText(k).width + 4;
      x.font = font(650, 11.5); x.fillStyle = col || '#f3f6fa'; x.fillText(v, cx, Hc - 12); cx += x.measureText(v).width + 12; };
    item('Emín', fmtInt(stats.Emin)); item('Ē', fmtInt(stats.Emed)); item('Emáx', fmtInt(stats.Emax)); item('U₀', fmt2(stats.U0));
    if (stats.Ereq > 0) item('exigido', fmtInt(stats.Ereq), stats.Emed >= 0.9 * stats.Ereq ? '#5fe08f' : '#ff7b87');
  }

  return {
    group,
    legend,
    update(lums, r, spec) { args = [lums, r, spec]; prewarm(r); if (visible) schedule(); else dirty = true; },
    setVisible(b) { visible = !!b; setShown(visible && !!stats);
      if (visible && (dirty || !stats) && args) schedule(); },
    stats: () => stats,
    levels: () => levelsCache.map((l) => ({ v: l.v, kind: l.kind, major: !!l.major })),
  };

}

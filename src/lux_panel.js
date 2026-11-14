// Segunda tela do luxímetro (duplo clique no aparelho 3D): imagem do equipamento em tamanho grande com as teclas
// funcionais (mesma lógica do aparelho 3D via window.__lux), visor ao vivo, frente/verso e botão Fechar.
import { FACE, PX, LAYOUT, makeFaceTex, makeKeyLegend, makePowerLegend, makeBackTex } from './mark_lux_tex.js';

let el = null, raf = 0, imgs = null, side = 'front', lastSt = null;
const HELP = {
  power: 'Liga / desliga', unit: 'Alterna lux ↔ foot-candle', mem: 'Grava a leitura · segure: READ (memória)',
  hold: 'Congela o visor · segure: L.S. (tipo de lâmpada)', up: 'Memória: próxima', zero: 'Zera (com a tampa colocada)', down: 'Memória: anterior',
};

function images() {
  if (imgs) return imgs;
  const url = (t) => t.image.toDataURL('image/png');
  imgs = { face: url(makeFaceTex()), power: url(makePowerLegend()), keys: {} };
  try { const b = makeBackTex(); imgs.back = url(b.tex || b); } catch { imgs.back = null; }
  for (const k of LAYOUT.keys) imgs.keys[k.name] = url(makeKeyLegend(k.l, k.w, k.h));
  return imgs;
}

const pct = (x, y, w, h) => {
  const l = ((x - w / 2) + FACE.w / 2) / FACE.w * 100, t = (FACE.h / 2 - (y + h / 2)) / FACE.h * 100;
  return `left:${l}%;top:${t}%;width:${w / FACE.w * 100}%;height:${h / FACE.h * 100}%`;
};

function build() {
  const I = images();
  el = document.createElement('div'); el.className = 'lxp'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Luxímetro');
  const L = LAYOUT.lcd, P = LAYOUT.power;
  const keys = LAYOUT.keys.map((k) => `<button type="button" class="lxp-k" data-k="${k.name}" style="${pct(k.x, k.y, k.w, k.h)}" title="${HELP[k.name] || ''}" aria-label="${k.l.join(' ')} — ${HELP[k.name] || ''}"><img src="${I.keys[k.name]}" alt=""></button>`).join('');
  el.innerHTML = `
  <div class="lxp-card">
    <header class="lxp-hd"><b>Luxímetro</b><span class="lxp-pt"></span>
      <button type="button" class="lxp-x" data-close aria-label="Fechar" title="Fechar (Esc)">✕</button></header>
    <div class="lxp-body">
      <div class="lxp-dev">
        <div class="lxp-cell" aria-hidden="true"><i></i></div>
        <div class="lxp-bump">
          <div class="lxp-face" style="background-image:url(${I.face})">
            <canvas class="lxp-lcd" style="${pct(L.x, L.y, L.w, L.h)}"></canvas>
            ${keys}
            <button type="button" class="lxp-k lxp-pw" data-k="power" style="${pct(P.x, P.y, P.r * 2.3, P.r * 2.3)}" title="${HELP.power}" aria-label="Liga / desliga"><img src="${I.power}" alt=""></button>
          </div>
          <div class="lxp-backimg" style="${I.back ? `background-image:url(${I.back})` : ''}"></div>
        </div>
      </div>
      <aside class="lxp-side">
        <div class="lxp-read"><small>Leitura</small><b class="lxp-v">—</b><span class="lxp-st"></span></div>
        <div class="lxp-msg" aria-live="polite"></div>
        <div class="lxp-row">
          <button type="button" class="lxp-b" data-cap>Tampa</button>
          <button type="button" class="lxp-b" data-flip>Ver verso</button>
        </div>
        <button type="button" class="lxp-b lxp-rec" data-rec>✓ Registrar leitura</button>
        <ul class="lxp-help">
          <li><b>Toque curto</b> numa tecla: função principal.</li>
          <li><b>Segure</b> (meio segundo) HOLD → L.S. e MEM → READ.</li>
          ${Object.entries(HELP).map(([k, v]) => `<li><em>${{ power: '⏻', unit: 'LX/FC', mem: 'MEM', hold: 'HOLD', up: '▲', zero: 'ZERO', down: '▼' }[k]}</em> ${v}</li>`).join('')}
        </ul>
      </aside>
    </div>
  </div>`;
  document.body.appendChild(el);
  el.addEventListener('click', (e) => {
    if (e.target === el || e.target.closest('[data-close]')) return close();
    const L = window.__lux; if (!L) return;
    if (e.target.closest('[data-cap]')) { L.setCap?.(!L.state().cap); return; }
    if (e.target.closest('[data-flip]')) { side = side === 'front' ? 'back' : 'front'; el.classList.toggle('is-back', side === 'back'); e.target.closest('[data-flip]').textContent = side === 'back' ? 'Ver frente' : 'Ver verso'; return; }
    if (e.target.closest('[data-rec]')) { L.press?.('rec'); return; }
  });
  // teclas: pressão curta / longa (≥ 650 ms), como no aparelho real
  let down = null;
  el.addEventListener('pointerdown', (e) => { const b = e.target.closest('.lxp-k'); if (!b) return; e.preventDefault(); down = { k: b.dataset.k, t: performance.now(), b }; b.classList.add('down'); });
  const up = (e) => { if (!down) return; const d = down; down = null; d.b.classList.remove('down'); if (e.type === 'pointercancel') return;
    window.__lux?.press?.(d.k, { long: performance.now() - d.t > 650 }); };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  el.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
}

function loop() {
  raf = requestAnimationFrame(loop);
  const L = window.__lux, src = L?._lcd; const cv = el.querySelector('.lxp-lcd');
  if (src && cv) { if (cv.width !== src.width) { cv.width = src.width; cv.height = src.height; } cv.getContext('2d').drawImage(src, 0, 0); }
  const st = L?.state?.(); if (!st) return;
  const key = JSON.stringify([st.on, st.hold, st.reading, st.unit, st.msg, st.cap, st.id, st.mode, st.source?.code]);
  if (key === lastSt) return; lastSt = key;
  const v = isFinite(st.reading) ? (st.unit === 'fc' ? (st.reading / 10.764).toFixed(1) + ' fc' : st.reading.toFixed(1).replace('.', ',') + ' lux') : '—';
  el.querySelector('.lxp-v').textContent = st.on ? v : 'desligado';
  el.querySelector('.lxp-st').textContent = !st.on ? '' : [st.hold ? 'HOLD' : (st.stable ? 'estável' : 'estabilizando'), st.source?.code, st.mode === 'read' ? 'memória' : ''].filter(Boolean).join(' · ');
  el.querySelector('.lxp-msg').textContent = st.msg || '';
  el.querySelector('.lxp-pt').textContent = st.id ? `Ponto ${String(st.id).toUpperCase()}` : '';
  el.querySelector('[data-cap]').textContent = st.cap ? 'Tirar a tampa' : 'Colocar a tampa';
  el.querySelector('.lxp-cell').classList.toggle('capped', !!st.cap);
  el.querySelector('[data-rec]').disabled = !st.id || !st.on;
}

export function openLuxPanel() {
  if (!el) build();
  el.classList.add('open'); side = 'front'; el.classList.remove('is-back'); el.querySelector('[data-flip]').textContent = 'Ver verso';
  lastSt = null; cancelAnimationFrame(raf); loop();
  setTimeout(() => el.querySelector('[data-close]')?.focus(), 30);
}
export function closeLuxPanel() { close(); }
function close() { if (!el) return; el.classList.remove('open'); cancelAnimationFrame(raf); raf = 0; }
addEventListener('keydown', (e) => { if (e.key === 'Escape' && el?.classList.contains('open')) close(); });
window.__luxPanel = { open: openLuxPanel, close: closeLuxPanel };

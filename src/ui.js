// UI — painel do simulador de iluminância NHO-11. Dono: UI.
// createUI(root, app): painel lateral (desktop) / bottom-sheet (celular), HUD com Ē, barra de vistas, croqui e relatório.
import { icon } from './ui_icons.js';
import { createEnvPicker } from './ui_env.js';
import { croquiFromApp, miniFigure } from './ui_croqui.js';
import { openReportStudio } from './ui_report.js';
import { esc, fmt, parseNum, groupInfo, GROUP_COLORS, ADJ_REASONS, adjustedE, parecer, fracHTML, expandedUI } from './ui_text.js';

const KEY = 'nho11-twin-ui-v1';
const loadStore = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } };
const debounce = (f, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; };
const fmtIn = (v) => (+v).toLocaleString('pt-BR', { maximumFractionDigits: 2, useGrouping: false });
const $ = (r, s) => r.querySelector(s); const $$ = (r, s) => [...r.querySelectorAll(s)];
const TABS = [['amb', 'Ambiente', 'room'], ['lum', 'Luminárias', 'lum'], ['med', 'Medições', 'list'], ['res', 'Resultado', 'chart'], ['cro', 'Croqui', 'map']];
const VIEWS = [['ref1', 'Foto', 'camera'], ['overview', 'Visão geral', 'cube'], ['top', 'Planta', 'plan'], ['ceiling', 'Teto', 'ceil']];
const MARK = `<svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true"><defs><radialGradient id="mkg" cx="50%" cy="38%" r="62%"><stop offset="0" stop-color="#ffe9a8"/><stop offset=".55" stop-color="#ffc23a"/><stop offset="1" stop-color="#f08a1c"/></radialGradient></defs>
  <rect x="1" y="1" width="30" height="30" rx="9" fill="#14181f"/><path d="M8 9.5h16" stroke="#e8ecf2" stroke-width="2.2" stroke-linecap="round"/><path d="M10 11 6.5 24h19L22 11z" fill="url(#mkg)" opacity=".9"/>
  <circle cx="11" cy="21" r="1.5" fill="#ff5a36"/><circle cx="16" cy="18" r="1.5" fill="#2f9bff"/><circle cx="21" cy="21" r="1.5" fill="#2ecc71"/></svg>`;

export function createUI(root, app) {
  const S = app.state, NORM = app.NORM, qs = new URLSearchParams(location.search);
  const store = Object.assign({ theme: 'auto', tab: null, collapsed: false, adjust: 0, adjReason: 0, adjWhy: '', report: {}, sheet: 'half', construct: true, cvals: true }, loadStore());
  const urlDriven = ['ex', 'sim', 'cfg', 'N', 'M'].some((k) => qs.has(k));
  const isMobile = () => matchMedia('(max-width: 760px)').matches;
  let activeId = null, fieldSig = '', undoValues = null;

  const persist = debounce(() => {
    try { localStorage.setItem(KEY, JSON.stringify({ ...store, sim: { room: S.room, config: S.config, N: S.N, M: S.M, lum: S.lum, envId: S.envId, continuous: S.continuous, values: S.values, task: S.task } })); } catch {}
  }, 350);

  // ---------- tema ----------
  const isDark = () => { const t = document.documentElement.dataset.theme; return t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches); };
  function applyTheme(t) { store.theme = t; if (t === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t; persist(); }
  if (store.theme !== 'auto') applyTheme(store.theme);

  // ---------- restaurar sessão ----------
  const baseE = () => { const e = app.QUADRO1.find((x) => x.id === S.envId); return e && isFinite(+e.E) ? +e.E : S.Emin; };
  if (!urlDriven && store.sim) {
    try {
      const s = store.sim; const env = app.QUADRO1.find((x) => x.id === s.envId);
      app.set({ room: s.room, config: s.config, N: s.N, M: s.M, lum: s.lum, continuous: s.continuous, ...(env ? { envId: env.id } : {}) });
      app.set({ values: { ...(s.values || {}) }, task: Array.isArray(s.task) ? s.task : [] });
    } catch (e) { console.warn('[ui] restauração ignorada', e); }
  }
  if (store.adjust) app.set({ Emin: adjustedE(NORM.ESCALA, baseE(), store.adjust) });
  if (urlDriven) { store.adjust = 0; }

  // ---------- esqueleto ----------
  root.classList.add('nho-ui');
  root.innerHTML = `
  <aside class="nho-panel" id="nho-panel" aria-label="Painel do simulador NHO-11" data-sheet="${store.sheet === 'full' ? 'full' : 'half'}">
    <button type="button" class="sheet-grab" aria-label="Redimensionar painel"><span></span></button>
    <header class="ph">
      <div class="ph-mark">${MARK}</div>
      <div class="ph-t"><h1>Iluminância <span>NHO-11</span></h1><p>Avaliação de iluminamento</p></div>
      <div class="ph-a">
        <button type="button" class="ib" data-act="report" aria-label="Emitir relatório técnico" title="Emitir relatório técnico">${icon('doc')}</button>
        <button type="button" class="ib" data-act="theme" aria-label="Tema" title="Tema">${icon('auto')}</button>
        <button type="button" class="ib desk" data-act="collapse" aria-label="Recolher painel" title="Recolher painel">${icon('chevL')}</button>
      </div>
    </header>
    <nav class="tabs" role="tablist" aria-label="Etapas">
      ${TABS.map(([k, l, ic], i) => `<button type="button" role="tab" class="tab" id="tab-${k}" data-tab="${k}" aria-controls="pane-${k}" aria-selected="false" tabindex="-1"><span class="tab-i">${icon(ic)}<em>${i + 1}</em></span><span class="tab-l">${l}</span></button>`).join('')}
    </nav>
    <div class="pbody">
      <section class="pane" role="tabpanel" id="pane-amb" aria-labelledby="tab-amb" hidden>${paneAmb()}</section>
      <section class="pane" role="tabpanel" id="pane-lum" aria-labelledby="tab-lum" hidden>${paneLum()}</section>
      <section class="pane" role="tabpanel" id="pane-med" aria-labelledby="tab-med" hidden>${paneMed()}</section>
      <section class="pane" role="tabpanel" id="pane-res" aria-labelledby="tab-res" hidden>${paneRes()}</section>
      <section class="pane" role="tabpanel" id="pane-cro" aria-labelledby="tab-cro" hidden>${paneCro()}</section>
    </div>
  </aside>
  <button type="button" class="reopen" aria-label="Abrir painel" hidden>${icon('panel')}<span>Painel</span></button>
  <div class="hud" role="status" aria-live="polite">
    <button type="button" class="hud-main" aria-label="Ver resultado">
      <span class="hud-k">Ē</span><span class="hud-v">—</span><span class="hud-u">lux</span><span class="chip hud-chip">—</span>
    </button>
    <div class="hud-sub"><span class="hud-req"></span><span class="hud-prog"><i></i></span><span class="hud-cnt"></span></div>
    <button type="button" class="hud-rep" data-hud="report">${icon('doc')}<span>Emitir relatório técnico</span></button>
  </div>
  <div class="dock" role="toolbar" aria-label="Vistas e camadas">
    <div class="dock-seg" role="group" aria-label="Vista">${VIEWS.map(([k, l, ic]) => `<button type="button" class="dk" data-view="${k}" aria-pressed="false" title="${l}">${icon(ic)}<span>${l}</span></button>`).join('')}</div>
    <span class="dock-sep" aria-hidden="true"></span>
    <button type="button" class="dk tg" data-tg="points" aria-pressed="false" title="Pontos de medição">${icon('pin')}<span>Pontos</span></button>
    <button type="button" class="dk tg" data-tg="iso" aria-pressed="false" title="Mapa isolux no plano de trabalho">${icon('iso')}<span>Isolux</span></button>
    <button type="button" class="dk tg" data-tg="on" aria-pressed="true" title="Ligar/desligar luminárias">${icon('bulb')}<span>Luzes</span></button>
  </div>
  <div class="lxcard" role="region" aria-label="Luxímetro virtual" hidden>
    <div class="lx-ic">${icon('meter')}</div>
    <div class="lx-m"><span class="lx-t">Luxímetro em <b class="lx-id">—</b><em class="lx-g"></em></span><span class="lx-v"><b class="lx-val" aria-live="off">—</b> lux</span><span class="lx-s">fotocélula horizontal a 0,75 m · leitura ao vivo</span></div>
    <button type="button" class="btn btn-primary lx-rec" aria-keyshortcuts="R">${icon('check')}<span>Registrar leitura</span><kbd>R</kbd></button>
    <button type="button" class="ib lx-x" aria-label="Fechar luxímetro">${icon('x')}</button>
  </div>
  <div class="toast" role="status" aria-live="polite" hidden></div>`;

  const panel = $(root, '.nho-panel');

  // ===================== painéis =====================
  function paneAmb() {
    return `
    <div class="sec">
      <label class="lbl" for="env-in-proxy">Tipo de ambiente, tarefa ou atividade <small>Quadro 1 · ${app.QUADRO1.length} itens</small></label>
      <div id="env-host"></div>
      <div class="env-card">
        <div class="env-grp"></div><div class="env-name"></div>
        <div class="stats">
          <div class="stat"><span>E mínimo</span><b class="env-E">—</b><i>lux</i></div>
          <div class="stat"><span>IRC/Ra mín.</span><b class="env-irc">—</b></div>
          <div class="stat accent"><span>E adotado</span><b class="env-Ead">—</b><i>lux</i></div>
        </div>
        <p class="env-obs"></p>
      </div>
    </div>
    <div class="sec">
      <h3 class="sh">Escala de iluminância <small>item 5.1</small></h3>
      <div class="seg" role="radiogroup" aria-label="Ajuste do nível mínimo pela escala">
        <button type="button" role="radio" data-adj="-1">−1 nível</button><button type="button" role="radio" data-adj="0">Quadro 1</button><button type="button" role="radio" data-adj="1">+1 nível</button>
      </div>
      <div class="scale" aria-hidden="true">${NORM.ESCALA.map((v) => `<span data-v="${v}">${v >= 1000 ? fmt(v / 1000, v % 1000 ? 1 : 0) + 'k' : v}</span>`).join('')}</div>
      <div class="adj-up" hidden>
        <label class="lbl" for="adj-reason">Motivo do aumento</label>
        <select id="adj-reason" class="inp">${ADJ_REASONS.map((r, i) => `<option value="${i}">${r}</option>`).join('')}</select>
      </div>
      <div class="adj-down" hidden>
        <label class="lbl" for="adj-why">Justificativa técnica da redução <small>obrigatória</small></label>
        <textarea id="adj-why" class="inp" rows="2" placeholder="Ex.: tarefa com detalhes excepcionalmente grandes ou de alto contraste…"></textarea>
        <p class="hint warn adj-warn" hidden>${icon('warn')} A redução deve ser justificada para garantir segurança, conforto e desempenho.</p>
      </div>
    </div>
    <div class="sec">
      <label class="chk"><input type="checkbox" id="cont"><span class="chk-box">${icon('check')}</span><span class="chk-t">Há tarefas contínuas no ambiente<small>Nenhuma leitura pode ser inferior a 200 lux (item 5).</small></span></label>
    </div>
    <div class="sec">
      <h3 class="sh">Dimensões da sala</h3>
      <div class="g3">
        ${[['L', 'Comprimento', 2, 40], ['W', 'Largura', 2, 30], ['H', 'Pé-direito', 2.2, 8]].map(([k, l, mn, mx]) => `
        <div class="nf"><label for="room-${k}">${l} <b>${k}</b></label><div class="nf-c"><input id="room-${k}" class="inp num" type="text" inputmode="decimal" data-room="${k}" data-min="${mn}" data-max="${mx}" autocomplete="off"><span>m</span></div></div>`).join('')}
      </div>
      <div class="area"><div><span>Área</span><b class="area-v">—</b></div><div class="area-b">faixa ± 3%: <span class="area-band">—</span></div></div>
      <p class="hint">${icon('info')} Leituras no plano de trabalho a 0,75 m do piso, fotocélula na horizontal (item 6.4).</p>
    </div>`;
  }
  function paneLum() {
    return `
    <div class="sec">
      <h3 class="sh">Configuração do Anexo 1</h3>
      <div class="cfg-grid" role="radiogroup" aria-label="Configuração do Anexo 1">
        ${NORM.CONFIGS.map((c) => `<button type="button" role="radio" class="cfg" data-cfg="${c.id}" aria-checked="false" title="${esc(c.name)}">
          <span class="cfg-fig">${miniFigure(NORM, c.id)}</span><span class="cfg-n">Fig. ${c.fig}</span><span class="cfg-t">${esc(c.short)}</span><span class="cfg-sug">sugerida</span></button>`).join('')}
      </div>
      <div class="suggest" hidden></div>
      <div class="fbox"><span class="fbox-k">Iluminância média</span><code class="cfg-formula"></code><span class="fbox-p"></span></div>
    </div>
    <div class="sec">
      <h3 class="sh">Quantidade de luminárias</h3>
      <div class="stps">
        ${[['N', 'Luminárias por fila', 1, 20], ['M', 'Número de filas', 1, 10]].map(([k, l, mn, mx]) => `
        <div class="stp" data-k="${k}"><span class="stp-l" id="stp-${k}-l">${l} <b>${k}</b></span>
          <div class="stp-c"><button type="button" data-d="-1" aria-label="Diminuir ${k}">${icon('minus')}</button>
          <input id="stp-${k}" type="text" inputmode="numeric" aria-labelledby="stp-${k}-l" data-min="${mn}" data-max="${mx}" autocomplete="off">
          <button type="button" data-d="1" aria-label="Aumentar ${k}">${icon('plus')}</button></div></div>`).join('')}
        <div class="total"><b class="tot-n">—</b><span class="tot-l">luminárias</span><span class="tot-f"></span></div>
      </div>
    </div>
    <div class="sec">
      <h3 class="sh">Luminária</h3>
      <label class="lbl" for="lum-type">Tipo</label>
      <select id="lum-type" class="inp">${app.LUM_TYPES.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select>
      <div class="g2">
        <div class="nf"><label for="lum-flux">Fluxo luminoso</label><div class="nf-c"><input id="lum-flux" class="inp num" type="text" inputmode="numeric" autocomplete="off"><span>lm</span></div></div>
        <div class="nf"><label for="lum-cct">Temperatura de cor</label><div class="nf-c"><input id="lum-cct" class="inp num" type="text" inputmode="numeric" autocomplete="off"><span>K</span></div></div>
      </div>
      <div class="lum-row">
        <label class="sw"><input type="checkbox" id="lum-on"><span class="sw-t" aria-hidden="true"></span><span>Luminárias ligadas</span></label>
        <div class="dim"><label for="lum-dim">Dimerização <b class="dim-v">100%</b></label><input id="lum-dim" type="range" min="10" max="100" step="5"></div>
      </div>
      <p class="hint lum-meta"></p>
    </div>`;
  }
  function paneMed() {
    return `
    <div class="sec">
      <button type="button" class="identify">${icon('target')}<span><b>Identificar pontos de medição</b><small class="id-sub">Marca no teto e projeta no plano a 0,75 m</small></span></button>
      <div class="tools">
        <button type="button" class="btn" data-act="simulate">${icon('meter')}<span>Simular leituras</span></button>
        <div class="menu-w"><button type="button" class="btn" data-act="examples" aria-haspopup="menu" aria-expanded="false">${icon('sheet')}<span>Exemplos</span>${icon('chevD', 'sm')}</button>
          <div class="menu" role="menu" hidden>${Object.entries(NORM.EXEMPLOS).map(([k, e]) => `<button type="button" role="menuitem" data-ex="${k}"><b>${k === 'planilha' ? 'Planilha de referência' : 'NHO-11 — Anexo 4'}</b><small>${esc(e.label)} · Ē = ${fmt(e.expectE, 2)} lux</small></button>`).join('')}</div></div>
        <button type="button" class="btn" data-act="clear">${icon('erase')}<span>Limpar</span></button>
      </div>
      <div class="prog"><div class="prog-b"><i></i></div><span class="prog-t"></span></div>
    </div>
    <div class="fields"></div>
    <p class="hint">${icon('info')} <span><b>Enter</b> avança, <b>Shift+Enter</b> volta. Cole uma coluna do Excel em qualquer campo para preencher em sequência. Clique num ponto 3D para ir ao campo.</span></p>`;
  }
  function paneRes() {
    return `
    <div class="hero">
      <div class="hero-t"><span>Iluminância média</span><span class="chip res-chip">—</span></div>
      <div class="hero-v"><b class="res-E">—</b><i>lux</i></div>
      <div class="gauge" aria-hidden="true"><div class="g-tol"></div><div class="g-fill"></div><div class="g-min"></div><div class="g-e"></div></div>
      <div class="gauge-l"><span class="g-l0">0</span><span class="g-lmin"></span></div>
    </div>
    <div class="sec">
      <h3 class="sh">Médias por grupo</h3>
      <div class="gmeans"></div>
    </div>
    <div class="sec">
      <h3 class="sh">Cálculo <small class="res-fig"></small></h3>
      <div class="calc"><code class="c-gen"></code><code class="c-exp"></code></div>
    </div>
    <div class="sec">
      <h3 class="sh">Faixas de referência</h3>
      <div class="bands"></div>
    </div>
    <div class="sec">
      <h3 class="sh">Verificações <small>NHO-11, item 5</small></h3>
      <ul class="checks"></ul>
      <p class="hint res-note" hidden></p>
    </div>
    <div class="sec">
      <label class="lbl" for="task">Leituras na área da tarefa <small>opcional</small></label>
      <textarea id="task" class="inp" rows="2" placeholder="Ex.: 310; 295,5; 287 — separadas por ponto e vírgula ou quebra de linha"></textarea>
      <p class="hint">${icon('info')} Sem leituras da tarefa, os critérios de 70% de Ē, 5:1 e 200 lux usam as leituras da malha.</p>
    </div>
    <div class="sec">
      <div class="par-h"><h3 class="sh">Parecer técnico</h3><button type="button" class="btn sm" data-act="copy">Copiar</button></div>
      <div class="parecer"></div>
    </div>

    <button type="button" class="btn btn-primary wide" data-act="report">${icon('doc')}<span>Emitir relatório técnico</span></button>`;
  }
  function paneCro() {
    return `
    <div class="cro-tools">
      <label class="mini-chk"><input type="checkbox" data-cro="construct"><span>Tracejados</span></label>
      <label class="mini-chk"><input type="checkbox" data-cro="cvals"><span>Leituras</span></label>
      <span class="grow"></span>
      <button type="button" class="btn sm" data-act="svg">${icon('download')}<span>SVG</span></button>
      <button type="button" class="btn sm" data-act="png">${icon('download')}<span>PNG</span></button>
      <button type="button" class="ib" data-act="zoom" aria-label="Ampliar croqui" title="Ampliar">${icon('expand')}</button>
    </div>
    <div class="cro-box"></div>
    <div class="legend">${['P', 'T', 'Q', 'R'].map((g) => `<span><i style="background:${GROUP_COLORS[g]}"></i>${g}</span>`).join('')}<span><i class="lk"></i>Luminária</span><span><i class="wk"></i>Janela</span></div>
    <p class="hint">${icon('info')} Planta vista de cima: parede do quadro no topo, porta à direita. Clique num ponto para digitar a leitura.</p>`;
  }

  // ===================== referências =====================
  const env = createEnvPicker($(root, '#env-host'), app.QUADRO1, { value: S.envId, onSelect: (e) => { app.set({ envId: e.id }); reapplyAdjust(); toast(`Quadro 1: ${e.nome} — ${fmt(+e.E, 0)} lux`); } });
  $(root, '.lbl[for="env-in-proxy"]').setAttribute('for', $(root, '.cbx-in').id);

  // ---------- tabs ----------
  let tab = store.tab && TABS.some((t) => t[0] === store.tab) && !urlDriven ? store.tab : (qs.get('ex') || qs.get('pts') === '1' || qs.get('sim') ? 'med' : 'amb');
  function setTab(k, focus) {
    tab = k; store.tab = k; persist();
    $$(root, '.tab').forEach((b) => { const on = b.dataset.tab === k; b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); });
    $$(root, '.pane').forEach((p) => (p.hidden = p.id !== 'pane-' + k));
    $(root, '.pbody').scrollTop = 0;
    if (k === 'cro') renderCroqui();
    if (k === 'res') renderRes();
  }
  $(root, '.tabs').addEventListener('click', (e) => { const b = e.target.closest('.tab'); if (b) { setTab(b.dataset.tab); if (isMobile() && panel.dataset.sheet === 'peek') setSheet('half'); } });
  $(root, '.tabs').addEventListener('keydown', (e) => {
    const i = TABS.findIndex((t) => t[0] === tab);
    const d = { ArrowRight: 1, ArrowLeft: -1, Home: -99, End: 99 }[e.key]; if (d == null) return; e.preventDefault();
    setTab(TABS[Math.max(0, Math.min(TABS.length - 1, i + d))][0], true);
  });

  // ---------- cabeçalho ----------
  panel.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return; const a = b.dataset.act;
    if (a === 'theme') { const nx = { auto: 'light', light: 'dark', dark: 'auto' }[store.theme] || 'auto'; applyTheme(nx); toast(`Tema: ${{ auto: 'automático (sistema)', light: 'claro', dark: 'escuro' }[nx]}`); }
    else if (a === 'collapse') setCollapsed(true);
    else if (a === 'report') doReport();
    else if (a === 'simulate') { if (!S.showPoints) app.identify(); app.simulate(); toast('Leituras simuladas pelo luxímetro virtual (cálculo físico, ruído ±3%).'); }
    else if (a === 'clear') { undoValues = { ...S.values }; clearValues(); toast('Leituras apagadas.', 'Desfazer', () => { app.set({ values: undoValues }); }); }
    else if (a === 'examples') toggleMenu(b);
    else if (a === 'copy') copyParecer();
    else if (a === 'svg') exportSVG(); else if (a === 'png') exportPNG(); else if (a === 'zoom') zoomCroqui();
  });
  function setCollapsed(c, focus = true) {
    store.collapsed = c; persist();
    panel.classList.toggle('collapsed', c); $(root, '.reopen').hidden = !c; root.classList.toggle('panel-off', c);
    panel.inert = c;
    if (!focus) return;
    if (c) $(root, '.reopen').focus(); else $(root, '.tab[aria-selected=true]')?.focus();
  }
  $(root, '.reopen').onclick = () => setCollapsed(false);
  function themeIcon() { const b = $(root, '[data-act=theme]'); b.innerHTML = icon({ auto: 'auto', light: 'sun', dark: 'moon' }[store.theme] || 'auto'); b.setAttribute('aria-label', `Tema: ${{ auto: 'automático', light: 'claro', dark: 'escuro' }[store.theme]} (alternar)`); }
  new MutationObserver(() => { themeIcon(); if (tab === 'cro') renderCroqui(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (tab === 'cro') renderCroqui(); });

  // ---------- menu de exemplos ----------
  function toggleMenu(btn, force) {
    const m = btn.parentElement.querySelector('.menu'); const open = force ?? m.hidden;
    m.hidden = !open; btn.setAttribute('aria-expanded', open);
    if (open) { m.querySelector('button')?.focus(); setTimeout(() => document.addEventListener('click', function off(ev) { if (!m.contains(ev.target) && ev.target !== btn) { toggleMenu(btn, false); } document.removeEventListener('click', off); }), 0); }
  }
  $(root, '.menu').addEventListener('click', (e) => { const b = e.target.closest('[data-ex]'); if (!b) return; toggleMenu($(root, '[data-act=examples]'), false); loadEx(b.dataset.ex); });
  $(root, '.menu').addEventListener('keydown', (e) => {
    const items = $$(e.currentTarget, 'button'); const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    if (e.key === 'Escape') { e.preventDefault(); const b = $(root, '[data-act=examples]'); toggleMenu(b, false); b.focus(); }
  });
  function loadEx(k) {
    const e = NORM.EXEMPLOS[k]; if (!e) return;
    const target = k === 'planilha' ? app.QUADRO1.find((x) => /noturn/i.test(x.nome) && /aula/i.test(x.nome)) : app.QUADRO1.find((x) => /reuni/i.test(x.nome));
    store.adjust = 0;
    if (target) { app.set({ envId: target.id }); env.set(target.id); }
    app.loadExample(k); app.set({ Emin: e.Emin && !target ? e.Emin : baseE(), task: k === 'anexo4' ? [550, 600, 620, 550, 650, 700] : [] }); // Anexo 4, Tabela A2: leituras na área da tarefa
    if (!S.showPoints) app.identify();
    toast(`Exemplo carregado: ${e.label} — Ē esperado ${fmt(e.expectE, 2)} lux.`);
  }
  function clearValues() { const v = {}; for (const id of NORM.configById(S.config).points) v[id] = null; app.set({ values: v }); }

  // ---------- ambiente ----------
  function reapplyAdjust() { app.set({ Emin: adjustedE(NORM.ESCALA, baseE(), store.adjust) }); persist(); }
  $(root, '.seg').addEventListener('click', (e) => { const b = e.target.closest('[data-adj]'); if (!b) return; store.adjust = +b.dataset.adj; reapplyAdjust(); });
  $(root, '.seg').addEventListener('keydown', (e) => { const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key]; if (!d) return; e.preventDefault(); store.adjust = Math.max(-1, Math.min(1, store.adjust + d)); reapplyAdjust(); $(root, `.seg [data-adj="${store.adjust}"]`).focus(); });
  $(root, '#adj-reason').onchange = (e) => { store.adjReason = +e.target.value; persist(); };
  $(root, '#adj-why').oninput = (e) => { store.adjWhy = e.target.value; persist(); updEnv(); };
  $(root, '#cont').onchange = (e) => app.set({ continuous: e.target.checked });
  $$(root, '[data-room]').forEach((inp) => {
    const commit = () => { const k = inp.dataset.room; let v = parseNum(inp.value); if (v == null) { inp.value = fmt(S.room[k], 2); return; }
      v = Math.max(+inp.dataset.min, Math.min(+inp.dataset.max, v)); if (Math.abs(v - S.room[k]) > 1e-6) app.set({ room: { [k]: +v.toFixed(2) } }); inp.value = fmt(S.room[k], 2); };
    inp.addEventListener('change', commit); inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); inp.select(); } });
  });

  // ---------- luminárias ----------
  $(root, '.cfg-grid').addEventListener('click', (e) => { const b = e.target.closest('.cfg'); if (b) setConfig(+b.dataset.cfg); });
  $(root, '.cfg-grid').addEventListener('keydown', (e) => {
    const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]; if (!d) return; e.preventDefault();
    const n = ((S.config - 1 + d + 6) % 6) + 1; setConfig(n); $(root, `.cfg[data-cfg="${n}"]`).focus();
  });
  function setConfig(n) { const c = NORM.configById(n); const patch = { config: n }; if (c.layout === 'grid' || c.layout === 'continuous') { if (S.M < 2) patch.M = 2; if (S.N < 2) patch.N = 2; } app.set(patch); }
  $$(root, '.stp').forEach((st) => {
    const k = st.dataset.k, inp = $(st, 'input');
    const setV = (v) => { v = Math.max(+inp.dataset.min, Math.min(+inp.dataset.max, Math.round(v))); if (isFinite(v) && v !== S[k]) app.set({ [k]: v }); inp.value = S[k]; };
    st.addEventListener('click', (e) => { const b = e.target.closest('[data-d]'); if (b) setV(S[k] + +b.dataset.d); });
    inp.addEventListener('change', () => setV(parseNum(inp.value) ?? S[k]));
    inp.addEventListener('keydown', (e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); setV(S[k] + (e.key === 'ArrowUp' ? 1 : -1)); } if (e.key === 'Enter') { e.preventDefault(); setV(parseNum(inp.value) ?? S[k]); } });
  });
  $(root, '.suggest').addEventListener('click', (e) => { const b = e.target.closest('[data-apply]'); if (b) setConfig(+b.dataset.apply); });
  $(root, '#lum-type').onchange = (e) => { const t = app.LUM_TYPES.find((x) => x.id === e.target.value); if (t) app.set({ lum: { type: t.id, flux: t.flux, cct: t.cct } }); };
  const numCommit = (sel, key, mn, mx) => { const inp = $(root, sel); const c = () => { const v = parseNum(inp.value); if (v != null) app.set({ lum: { [key]: Math.max(mn, Math.min(mx, Math.round(v))) } }); inp.value = fmt(S.lum[key], 0); };
    inp.addEventListener('change', c); inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); c(); } }); };
  numCommit('#lum-flux', 'flux', 50, 100000); numCommit('#lum-cct', 'cct', 1800, 10000);
  $(root, '#lum-on').onchange = (e) => app.set({ lum: { on: e.target.checked } });
  $(root, '#lum-dim').oninput = (e) => { $(root, '.dim-v').textContent = e.target.value + '%'; app.set({ lum: { dim: +e.target.value / 100 } }); };

  // ---------- medições ----------
  $(root, '.identify').onclick = () => { app.identify(); const n = app.points().length; toast(`${n} pontos identificados no teto (${[...new Set(app.points().map((p) => p.group))].join(', ')}).`); };
  const fieldsEl = $(root, '.fields');
  const order = () => NORM.configById(S.config).points;
  function buildFields() {
    const cfg = NORM.configById(S.config); const gi = groupInfo(cfg.layout); const pts = app.points(); const byId = Object.fromEntries(pts.map((p) => [p.id, p]));
    const groups = [...new Set(cfg.points.map((id) => id[0].toUpperCase()))];
    fieldsEl.innerHTML = groups.map((G) => {
      const ids = cfg.points.filter((id) => id[0].toUpperCase() === G);
      return `<fieldset class="grp" style="--g:${GROUP_COLORS[G]}" data-g="${G}">
        <legend><span class="gdot">${G}</span><span class="gname">${esc(gi[G] || '')}</span><span class="gmean"><span>média</span> <b data-gm="${G}">—</b></span></legend>
        <div class="fgrid">${ids.map((id) => `<div class="fld" data-id="${id}"><label for="v-${id}" title="${esc(byId[id]?.note || '')}">${id.toUpperCase()}</label>
          <input id="v-${id}" class="inp v" data-id="${id}" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" placeholder="—" aria-label="Leitura ${id.toUpperCase()} em lux — ${esc(byId[id]?.note || '')}"><span class="u">lux</span><button type="button" class="lx" data-lx="${id}" aria-label="Medir ${id.toUpperCase()} com o luxímetro" title="Levar o luxímetro até ${id.toUpperCase()}">${icon('meter')}</button></div>`).join('')}</div></fieldset>`;
    }).join('');
    fieldSig = cfg.points.join();
  }
  const writeValue = (id, raw) => { const v = parseNum(raw); app.set({ values: { [id]: v } }); return v; };
  fieldsEl.addEventListener('input', (e) => { const i = e.target.closest('input.v'); if (!i) return; const v = writeValue(i.dataset.id, i.value); i.closest('.fld').classList.toggle('invalid', i.value.trim() !== '' && v == null); });
  fieldsEl.addEventListener('click', (e) => { const b = e.target.closest('[data-lx]'); if (!b) return; const id = b.dataset.lx; app.focusPoint(id); if (!isMobile()) focusField(id); else setActive(id); });
  fieldsEl.addEventListener('focusin', (e) => { const i = e.target.closest('input.v'); if (!i) return; setActive(i.dataset.id); try { app.focusPoint(i.dataset.id); } catch (err) { console.warn(err); } });
  fieldsEl.addEventListener('focusout', (e) => { const i = e.target.closest('input.v'); if (!i) return; const v = S.values[i.dataset.id]; if (v != null && v !== '' && isFinite(+v)) i.value = fmtIn(v); });
  fieldsEl.addEventListener('keydown', (e) => {
    const i = e.target.closest('input.v'); if (!i) return; const ids = order(); const k = ids.indexOf(i.dataset.id);
    let d = 0; if (e.key === 'Enter') d = e.shiftKey ? -1 : 1; else if (e.key === 'ArrowDown') d = 1; else if (e.key === 'ArrowUp') d = -1; if (!d) return;
    e.preventDefault(); const nx = ids[k + d];
    if (nx) focusField(nx); else if (d > 0) { const miss = ids.find((id) => !isNum(S.values[id])); if (miss) focusField(miss); else { setTab('res'); toast('Todas as leituras preenchidas — veja o resultado.'); } }
  });
  fieldsEl.addEventListener('paste', (e) => {
    const i = e.target.closest('input.v'); if (!i) return; const txt = (e.clipboardData || window.clipboardData)?.getData('text') || '';
    const parts = txt.split(/\r?\n|\t|;/).map((s) => s.trim()).filter((s) => s !== '');
    if (parts.length < 2) return; e.preventDefault();
    const ids = order(); const k0 = ids.indexOf(i.dataset.id); const patch = {}; let n = 0, last = k0;
    for (let j = 0; j < parts.length && k0 + j < ids.length; j++) { const v = parseNum(parts[j]); if (v == null) continue; patch[ids[k0 + j]] = v; n++; last = k0 + j; }
    app.set({ values: patch }); syncFieldValues(true);
    toast(`${n} leitura${n > 1 ? 's' : ''} colada${n > 1 ? 's' : ''} (${ids[k0].toUpperCase()} → ${ids[last].toUpperCase()}).`);
    focusField(ids[Math.min(ids.length - 1, last + 1)]);
  });
  const isNum = (v) => v != null && v !== '' && isFinite(+v);
  function focusField(id) { const i = $(root, `#v-${id}`); if (!i) return; i.focus(); i.select(); i.closest('.fld').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  function setActive(id) { activeId = id; $$(root, '.fld').forEach((f) => f.classList.toggle('act', f.dataset.id === id)); if (tab === 'cro') renderCroqui(); }

  // ---------- resultado ----------
  $(root, '#task').addEventListener('input', debounce((e) => { const arr = e.target.value.split(/[;\n\t\r]+|\s+/).map(parseNum).filter((v) => v != null); app.set({ task: arr }); }, 250));
  function ctx() { return { adjust: store.adjust, adjReason: store.adjReason, adjWhy: store.adjWhy, baseE: baseE() }; }
  function doReport() { try { if (!document.getElementById('nho-report')) openReportStudio(app, { ctx, toast }); } catch (e) { console.error('[ui] relatório', e); toast('Não foi possível gerar o relatório.'); } }
  function copyParecer() {
    const r = app.results(); const p = parecer(app, r, ctx()); const t = [p.title.toUpperCase(), ...p.paras, ...(p.recs.length ? ['Recomendações:', ...p.recs.map((x) => '• ' + x)] : [])].join('\n\n');
    (navigator.clipboard?.writeText(t) || Promise.reject()).then(() => toast('Parecer copiado.'), () => toast('Não foi possível copiar.'));
  }

  // ---------- croqui ----------
  $$(root, '[data-cro]').forEach((c) => { c.checked = !!store[c.dataset.cro]; c.onchange = () => { store[c.dataset.cro] = c.checked; persist(); renderCroqui(); }; });
  const croBox = $(root, '.cro-box');
  function renderCroqui() { croBox.innerHTML = croquiFromApp(app, { dark: isDark(), interactive: true, active: activeId, construct: store.construct, values: store.cvals ? S.values : {}, idPrefix: 'pn' }); }
  croBox.addEventListener('click', (e) => { const g = e.target.closest('.cq-pt'); if (g) gotoField(g.dataset.id); });
  function gotoField(id) { if (store.collapsed) setCollapsed(false); if (isMobile() && panel.dataset.sheet === 'peek') setSheet('half'); setTab('med'); requestAnimationFrame(() => focusField(id)); }
  const download = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); };
  function exportSVG() { download(new Blob([croquiFromApp(app, { dark: false, construct: store.construct, values: store.cvals ? S.values : {} })], { type: 'image/svg+xml' }), 'croqui-nho11.svg'); toast('Croqui exportado em SVG.'); }
  function exportPNG() {
    const svg = croquiFromApp(app, { dark: false, construct: store.construct, values: store.cvals ? S.values : {} }); const img = new Image();
    const vb = /viewBox="0 0 (\d+) (\d+)"/.exec(svg); const w = +vb[1] * 2, h = +vb[2] * 2;
    img.onload = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h); c.toBlob((b) => { download(b, 'croqui-nho11.png'); toast('Croqui exportado em PNG.'); }); };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }
  function zoomCroqui() {
    const ov = document.createElement('div'); ov.className = 'zoom'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Croqui ampliado');
    ov.innerHTML = `<div class="zoom-c"><div class="zoom-h"><b>Croqui — ${esc(NORM.configById(S.config).short)} (Fig. ${NORM.configById(S.config).fig})</b><button type="button" class="ib" aria-label="Fechar">${icon('x')}</button></div><div class="zoom-b">${croquiFromApp(app, { dark: isDark(), construct: store.construct, values: store.cvals ? S.values : {}, idPrefix: 'zm' })}</div></div>`;
    root.appendChild(ov); const btn = $(ov, 'button'); const prev = document.activeElement; btn.focus();
    const close = () => { ov.remove(); document.removeEventListener('keydown', k, true); prev?.focus?.(); };
    const k = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
    document.addEventListener('keydown', k, true); btn.onclick = close; ov.onclick = (e) => { if (e.target === ov) close(); };
  }

  // ---------- HUD / dock ----------
  $(root, '.hud-rep').onclick = () => doReport();
  $(root, '.hud-main').onclick = () => { if (store.collapsed) setCollapsed(false); if (isMobile() && panel.dataset.sheet === 'peek') setSheet('half'); setTab('res'); };
  $(root, '.dock').addEventListener('click', (e) => {
    const b = e.target.closest('.dk'); if (!b) return;
    if (b.dataset.view) { app.setView(b.dataset.view, { animate: true }); updDock(); }
    else if (b.dataset.tg === 'points') app.set({ showPoints: !S.showPoints });
    else if (b.dataset.tg === 'iso') app.set({ showIsolux: !S.showIsolux });
    else if (b.dataset.tg === 'on') app.set({ lum: { on: !S.lum.on } });
  });

  // ---------- toast ----------
  let toastT;
  function toast(msg, action, fn) {
    const t = $(root, '.toast'); t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button">${esc(action)}</button>` : ''}`; t.hidden = false;
    t.classList.remove('in'); void t.offsetWidth; t.classList.add('in');
    if (action) $(t, 'button').onclick = () => { fn(); t.hidden = true; };
    clearTimeout(toastT); toastT = setTimeout(() => { t.classList.remove('in'); setTimeout(() => (t.hidden = true), 250); }, action ? 6000 : 3200);
  }

  // ---------- bottom-sheet (celular) ----------
  const sheetH = { peek: () => 132, half: () => Math.round(innerHeight * 0.5), full: () => innerHeight - 56 };
  function setSheet(s) { panel.dataset.sheet = s; store.sheet = s; persist(); panel.style.height = ''; syncSheetVar(); }
  function syncSheetVar() { root.style.setProperty('--sheet-h', (isMobile() ? (panel.getBoundingClientRect().height || sheetH[panel.dataset.sheet]()) : 0) + 'px'); }
  const grab = $(root, '.sheet-grab');
  let drag = null;
  const startDrag = (e) => { if (!isMobile() || e.target.closest('button:not(.sheet-grab),input,select,textarea')) return; drag = { y: e.clientY, h: panel.getBoundingClientRect().height, moved: false }; panel.classList.add('dragging'); e.currentTarget.setPointerCapture?.(e.pointerId); };
  const moveDrag = (e) => { if (!drag) return; const dy = drag.y - e.clientY; if (Math.abs(dy) > 4) drag.moved = true; panel.style.height = Math.max(110, Math.min(innerHeight - 40, drag.h + dy)) + 'px'; syncSheetVar(); };
  const endDrag = (e) => { if (!drag) return; panel.classList.remove('dragging'); const h = panel.getBoundingClientRect().height; const moved = drag.moved; drag = null;
    if (!moved) { if (e.currentTarget === grab) setSheet({ peek: 'half', half: 'full', full: 'peek' }[panel.dataset.sheet]); else { panel.style.height = ''; } return; }
    const best = Object.keys(sheetH).reduce((a, k) => (Math.abs(sheetH[k]() - h) < Math.abs(sheetH[a]() - h) ? k : a), 'half'); setSheet(best); };
  for (const el of [grab, $(root, '.ph')]) { el.addEventListener('pointerdown', startDrag); el.addEventListener('pointermove', moveDrag); el.addEventListener('pointerup', endDrag); el.addEventListener('pointercancel', endDrag); }
  grab.addEventListener('keydown', (e) => { if (e.key === 'ArrowUp') { e.preventDefault(); setSheet(panel.dataset.sheet === 'peek' ? 'half' : 'full'); } if (e.key === 'ArrowDown') { e.preventDefault(); setSheet(panel.dataset.sheet === 'full' ? 'half' : 'peek'); } });
  addEventListener('resize', debounce(syncSheetVar, 100));
  new ResizeObserver(() => syncSheetVar()).observe(panel);

  // ===================== atualização =====================
  function updEnv() {
    const e = app.QUADRO1.find((x) => x.id === S.envId);
    $(root, '.env-grp').textContent = e?.grupo || '';
    $(root, '.env-name').textContent = e?.nome || 'Selecione o tipo de ambiente';
    $(root, '.env-E').textContent = e ? fmt(+e.E, 0) : '—';
    $(root, '.env-irc').textContent = e?.IRC ?? '—';
    $(root, '.env-Ead').textContent = fmt(S.Emin, 0);
    const obs = $(root, '.env-obs'); obs.textContent = e?.obs ? e.obs : ''; obs.hidden = !e?.obs;
    $$(root, '.seg [data-adj]').forEach((b) => { const on = +b.dataset.adj === store.adjust; b.setAttribute('aria-checked', on); b.tabIndex = on ? 0 : -1; });
    const b0 = baseE();
    $$(root, '.scale span').forEach((s) => { const v = +s.dataset.v; s.classList.toggle('base', v === b0); s.classList.toggle('cur', v === S.Emin); });
    $(root, '.adj-up').hidden = store.adjust !== 1; $(root, '.adj-down').hidden = store.adjust !== -1;
    $(root, '#adj-reason').value = store.adjReason; if (document.activeElement !== $(root, '#adj-why')) $(root, '#adj-why').value = store.adjWhy;
    $(root, '.adj-warn').hidden = !!store.adjWhy.trim();
    $(root, '#cont').checked = !!S.continuous;
    for (const k of ['L', 'W', 'H']) { const i = $(root, `#room-${k}`); if (document.activeElement !== i) i.value = fmt(S.room[k], 2); }
    const A = S.room.L * S.room.W; $(root, '.area-v').innerHTML = `${fmt(A, 2)} m²`; $(root, '.area-band').textContent = `${fmt(A * 0.97, 2)} a ${fmt(A * 1.03, 2)} m²`;
  }
  function updLum() {
    const cfg = NORM.configById(S.config);
    const kind = cfg.layout === 'luminous' ? 'luminous' : (cfg.layout === 'continuous' || cfg.layout === 'continuous1') ? 'continuous' : 'discrete';
    const sug = cfg.layout === 'central' ? 2 : NORM.suggestConfig(S.N, ['single', 'continuous1'].includes(cfg.layout) ? 1 : S.M, kind);
    $$(root, '.cfg').forEach((b) => { const id = +b.dataset.cfg; b.setAttribute('aria-checked', id === cfg.id); b.tabIndex = id === cfg.id ? 0 : -1; b.classList.toggle('is-sug', id === sug && id !== cfg.id); });
    const sg = $(root, '.suggest');
    if (sug !== cfg.id && cfg.layout !== 'central') { const c2 = NORM.configById(sug); sg.hidden = false;
      sg.innerHTML = `${icon('info')}<span>Para ${S.N} × ${S.M} luminárias ${kind === 'continuous' ? 'em linhas contínuas' : 'discretas'}, o Anexo 1 indica a <b>Fig. ${c2.fig} — ${esc(c2.short)}</b>.</span><button type="button" class="btn sm" data-apply="${sug}">Aplicar</button>`; }
    else sg.hidden = true;
    $(root, '.cfg-formula').innerHTML = fracHTML(cfg.formula);
    $(root, '.fbox-p').textContent = `${cfg.points.length} pontos: ${summarizeIds(cfg.points)}`;
    const noM = ['single', 'continuous1', 'central', 'luminous'].includes(cfg.layout), noN = ['central', 'luminous'].includes(cfg.layout);
    for (const [k, dis] of [['N', noN], ['M', noM]]) { const st = $(root, `.stp[data-k="${k}"]`); st.classList.toggle('dis', dis); $$(st, 'button,input').forEach((x) => (x.disabled = dis));
      const i = $(st, 'input'); if (document.activeElement !== i) i.value = dis ? (k === 'M' && cfg.layout !== 'central' && cfg.layout !== 'luminous' ? 1 : '—') : S[k]; }
    const n = app.luminaires().length;
    $(root, '.tot-n').textContent = cfg.layout === 'luminous' ? '—' : n;
    $(root, '.tot-l').textContent = cfg.layout === 'luminous' ? 'teto luminoso' : n === 1 ? 'luminária' : 'luminárias';
    $(root, '.tot-f').textContent = cfg.layout === 'luminous' ? '' : cfg.layout === 'central' ? 'central' : `${S.N} × ${noM ? 1 : S.M}`;
    $(root, '#lum-type').value = S.lum.type;
    for (const [sel, k] of [['#lum-flux', 'flux'], ['#lum-cct', 'cct']]) { const i = $(root, sel); if (document.activeElement !== i) i.value = fmt(S.lum[k], 0); }
    $(root, '#lum-on').checked = S.lum.on !== false;
    const d = Math.round((S.lum.dim ?? 1) * 100); $(root, '#lum-dim').value = d; $(root, '.dim-v').textContent = d + '%';
    const T = app.LUM_TYPES.find((x) => x.id === S.lum.type) || {};
    $(root, '.lum-meta').innerHTML = `${icon('bulb')} <span>${T.watts ? `${T.watts} W · ` : ''}${T.flux && T.watts ? `${fmt(T.flux / T.watts, 0)} lm/W · ` : ''}fluxo instalado ${fmt(S.lum.flux * Math.max(1, n), 0)} lm${n ? ` · ${fmt(S.lum.flux * n / (S.room.L * S.room.W), 0)} lm/m²` : ''}</span>`;
  }
  function summarizeIds(ids) { const g = {}; ids.forEach((id) => { const G = id[0].toUpperCase(); (g[G] ||= []).push(+id.slice(1)); }); return Object.entries(g).map(([G, a]) => a.length === 1 ? `${G}${a[0]}` : `${G}${a[0]}–${G}${a[a.length - 1]}`).join(', '); }
  function syncFieldValues(force) {
    const r = app.results(); const lim = r.bands?.lim70;
    for (const i of $$(fieldsEl, 'input.v')) {
      const id = i.dataset.id, v = S.values[id], has = isNum(v);
      if (force || document.activeElement !== i) i.value = has ? fmtIn(v) : '';
      const f = i.closest('.fld'); f.classList.toggle('filled', has); f.classList.toggle('low', has && lim != null && +v < lim);
      if (has || !i.value.trim()) f.classList.remove('invalid');
      f.title = has && lim != null && +v < lim ? `Abaixo de 70% de Ē (${fmt(lim, 1)} lux)` : '';
    }
    for (const [G, v] of Object.entries(r.groups || {})) { const b = $(fieldsEl, `[data-gm="${G}"]`); if (b) b.textContent = isFinite(v) ? fmt(v, 2) : '—'; }
    const ids = order(); const n = ids.filter((id) => isNum(S.values[id])).length;
    $(root, '.prog-b i').style.width = (100 * n / ids.length) + '%';
    $(root, '.prog-t').innerHTML = `<b>${n}</b> de ${ids.length} leituras${n === ids.length ? ' · completo' : ''}`;
    const idb = $(root, '.identify'); idb.classList.toggle('done', !!S.showPoints);
    $(root, '.id-sub').textContent = S.showPoints ? `${ids.length} pontos marcados no teto · clique para refazer` : 'Marca no teto e projeta no plano a 0,75 m';
  }
  function updFields() { if (fieldSig !== order().join()) buildFields(); syncFieldValues(false); }
  function renderRes() {
    const r = app.results(); const cfg = NORM.configById(S.config); const ok = isFinite(r.E);
    const chip = $(root, '.res-chip'); setChip(chip, r);
    $(root, '.res-E').textContent = ok ? fmt(r.E, 2) : '—';
    const top = Math.max(S.Emin * 1.35, ok ? r.E * 1.12 : 0, 10); const pct = (v) => Math.max(0, Math.min(100, (v / top) * 100)) + '%';
    $(root, '.g-fill').style.width = ok ? pct(r.E) : '0%'; $(root, '.g-fill').className = 'g-fill ' + (ok ? (r.E >= S.Emin * 0.9 ? 'ok' : 'bad') : '');
    $(root, '.g-e').style.left = ok ? pct(r.E) : '0%'; $(root, '.g-e').hidden = !ok;
    $(root, '.g-min').style.left = pct(S.Emin); $(root, '.g-tol').style.left = pct(S.Emin * 0.9); $(root, '.g-tol').style.width = `calc(${pct(S.Emin)} - ${pct(S.Emin * 0.9)})`;
    $(root, '.g-lmin').style.left = pct(S.Emin); $(root, '.g-lmin').textContent = `Quadro 1: ${fmt(S.Emin, 0)} lux (−10%: ${fmt(S.Emin * 0.9, 0)})`;
    $(root, '.gmeans').innerHTML = Object.entries(r.groups || {}).map(([G, v]) => `<div class="gm" style="--g:${GROUP_COLORS[G]}"><span class="gm-k">${G}</span><b>${isFinite(v) ? fmt(v, 2) : '—'}</b><small>${esc(groupInfo(cfg.layout)[G] || '')}</small></div>`).join('');
    $(root, '.res-fig').textContent = `Anexo 1 · Fig. ${cfg.fig}`;
    $(root, '.c-gen').innerHTML = fracHTML(cfg.formula);
    $(root, '.c-exp').innerHTML = `${fracHTML('Ē = ' + expandedUI(cfg.id, r.groups, { N: S.N, M: S.M, L: S.room.L, W: S.room.W }))}<b class="c-res">Ē = ${ok ? fmt(r.E, 2) : '—'} lux</b>`;
    const B = r.bands;
    $(root, '.bands').innerHTML = ok && B ? `
      <div class="band"><span>Ē</span><b>${fmt(r.E, 2)}</b><em>faixa ± 15%</em><b>${fmt(B.E15[0], 2)} – ${fmt(B.E15[1], 2)}</b></div>
      <div class="band"><span>70% de Ē</span><b>${fmt(B.lim70, 2)}</b><em>faixa ± 15%</em><b>${fmt(B.lim70_15[0], 2)} – ${fmt(B.lim70_15[1], 2)}</b></div>
      <div class="band"><span>E mínimo</span><b>${fmt(S.Emin, 0)}</b><em>tolerância −10%</em><b>${fmt(B.minReq, 0)}</b></div>
      <div class="band"><span>Área</span><b>${fmt(r.area, 2)} m²</b><em>faixa ± 3%</em><b>${fmt(r.areaBand[0], 2)} – ${fmt(r.areaBand[1], 2)}</b></div>`
      : `<p class="empty">Preencha todas as leituras para calcular as faixas.</p>`;
    $(root, '.checks').innerHTML = (r.checks || []).length ? r.checks.map((c) => `<li class="${c.ok === null ? 'na' : c.ok ? 'ok' : 'bad'}"><span class="ck">${icon(c.ok === null ? 'dash' : c.ok ? 'check' : 'x')}</span><span><b>${esc(c.label)}</b><small>${esc(c.detail)}</small></span></li>`).join('')
      : `<li class="na"><span class="ck">${icon('dash')}</span><span><b>Aguardando leituras</b><small>Faltam ${r.missing.length}: ${esc(r.missing.map((x) => x.toUpperCase()).join(', '))}</small></span></li>`;
    const rn = $(root, '.res-note'); rn.hidden = !r.note; rn.innerHTML = r.note ? `${icon('info')}<span>${esc(r.note)}</span>` : '';
    const p = parecer(app, r, ctx());
    $(root, '.parecer').className = 'parecer ' + p.tone;
    $(root, '.parecer').innerHTML = `<div class="par-t">${icon(p.tone === 'ok' ? 'check' : p.tone === 'bad' ? 'warn' : 'info')}<b>${esc(p.title)}</b></div>${p.paras.map((x) => `<p>${esc(x)}</p>`).join('')}${p.recs.length ? `<div class="par-r"><b>Recomendações</b><ul>${p.recs.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}`;
    const ti = $(root, '#task'); if (document.activeElement !== ti) ti.value = (S.task || []).map(fmtIn).join('; ');
  }
  function setChip(el, r) {
    const t = r.verdict === 'atende' ? ['ok', 'Atende'] : r.verdict === 'nao-atende' ? ['bad', 'Não atende'] : ['muted', `${(NORM.configById(S.config).points.length - r.missing.length)}/${NORM.configById(S.config).points.length} leituras`];
    el.className = el.className.replace(/\b(ok|bad|muted)\b/g, '').trim() + ' ' + t[0]; el.textContent = t[1];
  }
  function updHUD() {
    const r = app.results(); const ok = isFinite(r.E);
    $(root, '.hud-v').textContent = ok ? fmt(r.E, 1) : '—'; $(root, '.hud-v').classList.toggle('empty', !ok);
    setChip($(root, '.hud-chip'), r);
    $(root, '.hud-req').textContent = `${store.adjust ? 'E adotado' : 'Quadro 1'}: ${fmt(S.Emin, 0)} lux`;
    const ids = order(); const n = ids.filter((id) => isNum(S.values[id])).length;
    $(root, '.hud-prog i').style.width = (100 * n / ids.length) + '%'; $(root, '.hud-cnt').textContent = `${n}/${ids.length}`;
    $(root, '.hud').classList.toggle('has', ok);
  }
  function updDock() {
    $$(root, '[data-view]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.view === S.view));
    $(root, '[data-tg=points]').setAttribute('aria-pressed', !!S.showPoints);
    $(root, '[data-tg=iso]').setAttribute('aria-pressed', !!S.showIsolux);
    $(root, '[data-tg=on]').setAttribute('aria-pressed', S.lum.on !== false);
  }
  function updateAll() {
    try { updEnv(); updLum(); updFields(); updHUD(); updDock(); if (tab === 'res') renderRes(); if (tab === 'cro') renderCroqui(); } catch (e) { console.error('[ui] update', e); }
    persist();
  }
  const queue = (() => { let raf = 0; return () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; updateAll(); }); }; })();
  app.on('change', queue);
  app.on('identify', queue);
  app.on('pick', (id) => gotoField(id));
  const lxCard = $(root, '.lxcard'); let lxTimer = 0, lxId = null;
  function lxShow(id) {
    lxId = id ? String(id).toLowerCase() : null; lxCard.hidden = !lxId; clearInterval(lxTimer);
    if (!lxId) return;
    const p = app.points().find((q) => q.id === lxId); const G = p?.group || lxId[0].toUpperCase();
    lxCard.style.setProperty('--g', GROUP_COLORS[G] || '#888');
    $(lxCard, '.lx-id').textContent = lxId.toUpperCase(); $(lxCard, '.lx-g').textContent = p?.note ? ' · ' + p.note : '';
    const tick = () => { if (document.hidden || !lxId) return; let v = NaN; try { v = app.readLuxmeter(lxId); } catch {} $(lxCard, '.lx-val').textContent = fmt(v, 1); };
    tick(); lxTimer = setInterval(tick, 330);
  }
  app.on('focus', (id) => { setActive(id); lxShow(id); const f = $(root, `.fld[data-id="${id}"]`); if (f && tab === 'med') f.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); });
  $(lxCard, '.lx-rec').onclick = () => { if (lxId) app.recordReading(lxId); };
  $(lxCard, '.lx-x').onclick = () => { lxShow(null); S.activePoint = null; };
  app.on('record', ({ id, v } = {}) => {
    if (!id) return; syncFieldValues(true);
    const f = $(root, `.fld[data-id="${id}"]`); if (f) { f.classList.remove('flash'); void f.offsetWidth; f.classList.add('flash'); }
    if (!isFinite(v)) { toast(`Sem leitura em ${id.toUpperCase()}.`); return; }
    const ids = order(); const k = ids.indexOf(id);
    const next = ids.slice(k + 1).find((x) => !isNum(S.values[x])) || ids.find((x) => !isNum(S.values[x]));
    if (next) {
      toast(`${id.toUpperCase()} registrado: ${fmt(v, 1)} lux → luxímetro segue para ${next.toUpperCase()}.`);
      setTimeout(() => { app.focusPoint(next); if (tab === 'med' && !isMobile() && !store.collapsed) focusField(next); }, 450);
    } else { toast(`${id.toUpperCase()} registrado: ${fmt(v, 1)} lux — todas as ${ids.length} leituras concluídas.`); lxShow(null); S.activePoint = null; setTimeout(() => { if (store.collapsed) setCollapsed(false, false); setTab('res'); }, 700); }
  });
  document.addEventListener('keydown', (e) => {
    if ((e.key !== 'r' && e.key !== 'R') || e.ctrlKey || e.metaKey || e.altKey || !lxId || lxCard.hidden) return;
    const t = e.target; const typing = t && (t.isContentEditable || /^(TEXTAREA|SELECT)$/.test(t.tagName) || (t.tagName === 'INPUT' && !t.classList.contains('v')));
    if (typing || document.querySelector('#nho-report, .zoom')) return;
    e.preventDefault(); app.recordReading(lxId);
  });
  if (S.activePoint) lxShow(S.activePoint);
  // vista atual também pode mudar por fora (setView direto)
  const _sv = app.setView; app.setView = (v, o) => { _sv(v, o); updDock(); };

  // ---------- inicial ----------
  themeIcon();
  setCollapsed(!!store.collapsed && !isMobile() && !urlDriven, false);
  if (qs.get('cam')) S.view = qs.get('cam');
  if (isMobile()) setSheet(store.sheet === 'full' && !urlDriven ? 'full' : 'half');
  setTab(tab);
  updateAll();
  syncSheetVar();
}

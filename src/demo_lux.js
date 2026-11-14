// Demonstração guiada do luxímetro (tour narrado). Dono: UI.
// mountDemoLux(root, app, hooks) — injeta o botão "Demonstração do luxímetro" (aba Medições + barra de vistas) e o cartão
// do tour. Usa a API do luxímetro 3D `window.__lux` quando existir (power/press/setCap/state/focus/unfocus/showBack/onChange)
// e degrada para `__sim.focusPoint` / `__sim.setView` quando não existir. Exposto em `window.__demoLux = {start, go, stop}`.
// Base: manual do luxímetro digital para LED branco (refs/lux) e NHO-11 itens 6.2–6.4 + Anexo 1.

const CANCEL = Symbol('cancel');
const MUTE_KEY = 'nho11-demo-lux-mute';
const PLAY = '<svg class="ico" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>';
const SVG = (p, extra = '') => `<svg class="ico" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" ${extra}>${p}</svg>`;
const IC = {
  prev: SVG('<path d="m14.5 6-6 6 6 6"/>'), next: SVG('<path d="m9.5 6 6 6-6 6"/>'),
  pause: SVG('<path d="M9 6v12M15 6v12"/>'), play: PLAY, x: SVG('<path d="m6 6 12 12M18 6 6 18"/>'),
  vol: SVG('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>'),
  mute: SVG('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>'),
};
const PART = { body: 'corpo do aparelho', lcd: 'visor LCD', sensor: 'fotocélula', cap: 'tampa da fotocélula', back: 'verso: etiqueta e pilhas',
  tripod: 'tripé (0,75 m)', power: 'tecla liga/desliga', source: 'tecla HOLD/L.S (fonte de luz)', hold: 'tecla HOLD/L.S', mem: 'tecla MEM/READ',
  zero: 'tecla ZERO', up: 'tecla ▲', down: 'tecla ▼' };

const fmt = (v, d = 1) => (v == null || !isFinite(+v) ? '—' : (+v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isNum = (v) => v != null && v !== '' && isFinite(+v);

export function mountDemoLux(root, app, hooks = {}) {
  const S = app.state, NORM = app.NORM;
  const isMobile = () => matchMedia('(max-width: 760px)').matches;
  const $ = (s, r = root) => r.querySelector(s); const $$ = (s, r = root) => [...r.querySelectorAll(s)];

  // ---------- estilo ----------
  if (!document.getElementById('demo-lux-css')) {
    const l = document.createElement('link'); l.id = 'demo-lux-css'; l.rel = 'stylesheet'; l.href = new URL('./demo_lux.css', import.meta.url).href; document.head.appendChild(l);
  }

  // ---------- botões de entrada ----------
  const idBtn = $('.identify');
  if (idBtn) {
    const row = document.createElement('div'); row.className = 'dlx-row'; idBtn.before(row); row.appendChild(idBtn);
    row.insertAdjacentHTML('beforeend', `<button type="button" class="btn dlx-launch" data-demo-lux aria-haspopup="dialog" title="Tour narrado: como usar o luxímetro conforme o manual e a NHO-11">${PLAY}<span><b>Demonstração</b><small>do luxímetro</small></span></button>`);
  }
  const dockSep = $('.dock .dock-sep');
  if (dockSep) dockSep.insertAdjacentHTML('afterend', `<button type="button" class="dk dlx-dock" data-demo-lux aria-haspopup="dialog" title="Demonstração do luxímetro" aria-label="Demonstração do luxímetro">${PLAY}<span>Demonstração</span></button><span class="dock-sep" aria-hidden="true"></span>`);
  root.addEventListener('click', (e) => { const b = e.target.closest?.('[data-demo-lux]'); if (!b) return; e.stopPropagation(); if (open) stop(); else { opener = b; start(1); } }, true);

  // ---------- cartão ----------
  const card = document.createElement('div');
  card.className = 'dlx'; card.hidden = true; card.tabIndex = -1;
  card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'false'); card.setAttribute('aria-labelledby', 'dlx-t'); card.setAttribute('aria-describedby', 'dlx-x');
  card.innerHTML = `
    <div class="dlx-top"><span class="dlx-n"></span><span class="dlx-ref"></span><span class="dlx-sp"></span>
      <button type="button" class="dlx-ib" data-dlx="mute" aria-pressed="false"></button>
      <button type="button" class="dlx-ib" data-dlx="exit" aria-label="Sair da demonstração (Esc)" title="Sair (Esc)">${IC.x}</button></div>
    <div class="dlx-cap" aria-live="polite" aria-atomic="true"><h2 class="dlx-t" id="dlx-t"></h2><p class="dlx-x" id="dlx-x"></p></div>
    <div class="dlx-read" aria-live="off"><span class="dlx-lcd"><b class="dlx-l1">—</b><em class="dlx-l2"></em></span><span class="dlx-sub"></span></div>
    <div class="dlx-prog" role="progressbar" aria-label="Progresso da demonstração" aria-valuemin="1"><i></i></div>
    <div class="dlx-nav">
      <button type="button" class="dlx-b" data-dlx="prev">${IC.prev}<span>Anterior</span></button>
      <button type="button" class="dlx-b" data-dlx="pause" aria-pressed="false"></button>
      <button type="button" class="dlx-b dlx-pri" data-dlx="next"><span>Próximo</span>${IC.next}</button>
    </div>
    <div class="dlx-end" hidden>
      <button type="button" class="dlx-b dlx-pri" data-dlx="keep">Manter leituras da demonstração</button>
      <button type="button" class="dlx-b" data-dlx="restore">Restaurar leituras anteriores</button>
    </div>`;
  root.appendChild(card);
  card.addEventListener('click', (e) => {
    const b = e.target.closest('[data-dlx]'); if (!b) return; const a = b.dataset.dlx;
    if (a === 'exit') stop(); else if (a === 'prev') go(idx); else if (a === 'next') go(idx + 2);
    else if (a === 'pause') setPaused(!paused); else if (a === 'mute') setMuted(!muted);
    else if (a === 'keep') stop({ keep: true }); else if (a === 'restore') stop({ keep: false });
  });
  document.addEventListener('keydown', (e) => {
    if (!open || e.key !== 'Escape' || document.querySelector('#nho-report, .zoom')) return;
    e.preventDefault(); e.stopPropagation(); stop();
  }, true);
  card.addEventListener('keydown', (e) => {
    if (e.target.closest('button') && (e.key === ' ' || e.key === 'Enter')) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); if (idx < STEPS.length - 1) go(idx + 2); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); if (idx > 0) go(idx); }
  });

  // ---------- estado ----------
  let open = false, idx = 0, gen = 0, paused = false, opener = null, readT = 0, snap = null, cleared = false, demoRec = new Set(), hiEls = [];
  let muted = (() => { try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; } })();

  // espera "pausável" e cancelável (troca de passo ou Sair → rejeita com CANCEL)
  const wait = (ms, g = gen) => new Promise((res, rej) => {
    let left = ms, last = performance.now();
    const tick = () => { if (g !== gen) return rej(CANCEL); const now = performance.now(); if (!paused) left -= now - last; last = now; if (left <= 0) res(); else setTimeout(tick, Math.min(120, left)); };
    tick();
  });

  // ---------- luxímetro 3D (tolerante) ----------
  const L = () => window.__lux;
  const lx = (fn, ...a) => { try { const f = L()?.[fn]; return typeof f === 'function' ? f.apply(L(), a) : undefined; } catch (e) { console.warn('[demo-lux]', fn, e); } };
  const lst = () => { try { return L()?.state?.() || null; } catch { return null; } };
  const order = () => NORM.configById(S.config).points;
  const firstId = () => order()[0];
  const lumType = () => app.LUM_TYPES.find((t) => t.id === S.lum.type) || app.LUM_TYPES[0];
  const isLED = () => /led|painel/i.test(lumType().id + ' ' + lumType().name);
  let partLabel = '';
  let lastPart = '';
  function focus(part) {
    partLabel = PART[part] || part; lastPart = part;
    if (L()?.focus) { lx('focus', part); return; }
    const id = S.activePoint || firstId(); if (!id) return; // sem __lux: enquadra o luxímetro virtual no ponto
    if (S.activePoint !== id) app.focusPoint(id); frameLux(id);
  }
  // câmera 3/4 a ~1,7 m do ponto, vinda do centro da sala, mirando o luxímetro (tripé + fotocélula a 0,75 m) no centro do quadro
  let frameT = 0;
  function frameLux(id, delay = 60) {
    clearTimeout(frameT);
    frameT = setTimeout(() => {
      if (!open || L()?.focus && /^(body|lcd|power|source|hold|mem|zero|up|down|back|cap|sensor)$/.test(lastPart)) return;
      const p = app.points().find((q) => q.id === id); if (!p) return;
      const { W, L: Lr, H, plane } = S.room; const ang = Math.atan2(-p.x, -p.z) + 0.35; let r = 1.75;
      for (; r > 0.9; r -= 0.15) { const cx = p.x + r * Math.sin(ang), cz = p.z + r * Math.cos(ang); if (Math.abs(cx) < W / 2 - 0.25 && Math.abs(cz) < Lr / 2 - 0.25) break; }
      const h = Math.min(H - 0.4, 1.5);
      app.setView('orbit', { animate: true, orbit: [ang, h, r, p.x, plane + 0.05, p.z, 58].map((v) => +(+v).toFixed(3)).join(',') });
    }, delay);
  }
  function cam(v) { clearTimeout(frameT); lx('unfocus'); partLabel = ''; lastPart = ''; app.setView(v, { animate: true }); }
  function goPoint(id) { lx('unfocus'); lastPart = ''; partLabel = 'ponto ' + id.toUpperCase(); app.focusPoint(id); frameLux(id); }
  async function ensureOn(on, g) { const s = lst(); if (!L()) return; if (!!s?.on !== on) { lx('power', on); await wait(on ? 1500 : 400, g); } }
  function ensureHold(h) { const s = lst(); if (s && !!s.hold !== h) lx('press', 'hold'); }
  function ensureCap(c) { const s = lst(); if (L() && (!s || !!s.cap !== c)) lx('setCap', c); }
  async function selectSource(g) {
    const re = isLED() ? /\bL1\b|LED/i : /fluor|\bL2\b/i;
    for (let k = 0; k < 12; k++) { const s = lst(); if (!s) return; const src = s.source || {}; if (re.test(`${src.code || ''} ${src.name || ''}`)) return; lx('press', 'source'); await wait(500, g); }
  }
  async function ensureReady(g) { lx('showBack', false); await ensureOn(true, g); if (lst()?.mode === 'read') lx('press', 'mem'); ensureCap(false); ensureHold(false); }
  // app.set mescla objetos (deepAssign): para SUBSTITUIR as leituras troca-se o objeto antes de notificar
  function setValues(v) { S.values = { ...v }; app.set({ values: S.values }); }
  function ensureClean() { if (!cleared) { cleared = true; setValues({}); demoRec = new Set(); } }
  function fillMissing() { ensureClean(); const v = { ...S.values }; let ch = false; for (const id of order()) if (!isNum(v[id])) { v[id] = app.readLuxmeter(id); ch = true; } if (ch) app.set({ values: v }); }
  function ensurePanel() { if (!isMobile() && $('.nho-panel')?.classList.contains('collapsed')) hooks.setCollapsed?.(false, false); }
  function hi(...els) { for (const el of els.flat()) if (el) { el.classList.add('dlx-hi'); hiEls.push(el); } }
  function unhi() { hiEls.forEach((el) => el.classList.remove('dlx-hi')); hiEls = []; }
  const condLabel = () => { const a = S.avaliacao || {}; return a.periodo === 'noturno' ? 'noturna' : `diurna com céu ${a.ceu}`; };

  // ---------- passos ----------
  const STEPS = [
    { t: 'Conheça o luxímetro', ref: 'Manual · item 8',
      x: () => 'Este é um luxímetro digital para LED branco, com fotocélula separada ligada por cabo espiralado. No corpo ficam o visor de 4 dígitos e as teclas: liga/desliga, LUX/FC, MEM/READ, HOLD/L.S, ZERO e as setas ▲ ▼. A fotocélula tem difusor branco com correção de cosseno e de cor (curva do olho humano, CIE) e é protegida por uma tampa preta.',
      run: async (g) => { lx('showBack', false); for (const [p, ms] of [['body', 0], ['lcd', 4200], ['power', 3800], ['mem', 2600], ['sensor', 3600], ['cap', 4200]]) { await wait(ms, g); focus(p); } } },
    { t: 'Verso: calibração e pilhas', ref: 'NHO-11 · 6.3.2',
      x: () => 'Antes de ir a campo, vire o aparelho. A etiqueta de calibração traz o número do certificado, a data da calibração e a data da próxima: ela deve estar dentro da validade, emitida pelo Inmetro ou por laboratório acreditado (RBC). Confira também as 3 pilhas AAA de 1,5 V: se o símbolo de bateria fraca aparecer no visor, troque-as antes de medir.',
      run: async (g) => { lx('showBack', true); focus('back'); await wait(200, g); } },
    { t: 'Ligar e testar o visor', ref: 'Manual · Operação 1',
      x: () => 'Pressione a tecla liga/desliga. Ao ligar, todos os segmentos do visor acendem por um instante: confira se nenhum está apagado. O aparelho se desliga sozinho após 3 a 5 minutos sem uso e mostra OL quando a luz passa do limite da escala.',
      run: async (g) => { lx('showBack', false); focus('power'); await wait(1400, g); if (L()) { lx('power', true); } focus('lcd'); await wait(1200, g); } },
    { t: 'Tipo de fonte de luz', ref: 'NHO-11 · 6.3.1',
      x: () => `As luminárias desta sala são: ${lumType().name.replace(/\s*\(foto\)/, '')}. Mantenha HOLD/L.S pressionada por alguns segundos até o código piscar e escolha a fonte com ▲ ▼: L1 é LED branco (fator 0,99); L2 a L9 são fontes comuns (fator 1,00). Confirme com um toque rápido. A NHO-11 exige medidor que permita ajustar a medição ao tipo de lâmpada.`,
      run: async (g) => { lx('showBack', false); await ensureOn(true, g); focus('source'); await wait(1600, g); await selectSource(g); focus('lcd'); } },
    { t: 'Zerar com a tampa', ref: 'Manual · ZERO',
      x: () => 'Com a tampa colocada na fotocélula, nenhuma luz chega ao sensor. Pressione ZERO para ajustar o ponto zero: o visor passa a indicar 0 lux. Isso elimina o desvio do sensor no escuro antes de medir.',
      run: async (g) => { await ensureOn(true, g); ensureHold(false); ensureCap(true); focus('cap'); await wait(2200, g); focus('zero'); await wait(900, g); lx('press', 'zero'); await wait(700, g); focus('lcd'); } },
    { t: 'Tirar a tampa e estabilizar', ref: 'NHO-11 · 6.4',
      x: () => 'Retire a tampa. A leitura sobe e oscila por alguns instantes: aguarde o tempo de estabilização recomendado pelo fabricante antes da primeira leitura. Repita essa espera sempre que a fotocélula passar de um local escuro para outro muito iluminado, ou o contrário.',
      run: async (g) => { await ensureOn(true, g); ensureHold(false); focus('cap'); await wait(1500, g); ensureCap(false); focus('sensor'); await wait(1500, g); focus('lcd'); } },
    { t: 'Fotocélula no tripé, a 0,75 m', ref: 'NHO-11 · 6.4',
      x: () => `Monte a fotocélula no tripé, com o difusor na horizontal e a ${fmt(S.room.plane, 2)} m do piso, o plano de trabalho adotado quando a tarefa não está definida. Se a tarefa for numa bancada, quadro ou prancheta inclinada, a fotocélula vai no próprio plano da tarefa, na mesma inclinação.`,
      run: async (g) => { await ensureReady(g); if (L()?.focus) focus('tripod'); else goPoint(firstId()); await wait(400, g); } },
    { t: 'Postura e condição da medição', ref: 'NHO-11 · 6.2',
      x: () => { const a = S.avaliacao || {}; const bad = a.periodo === 'diurno' && a.ceu === 'ensolarado';
        return `Use roupa escura e fique afastado, ao lado da fotocélula, sem fazer sombra nem refletir luz sobre ela. Meça com as luminárias em operação normal e na condição mais desfavorável: à noite ou em dia nublado, quando o iluminamento depende só das fontes instaladas. Havendo atividade noturna, meça à noite. Condição atual: ${condLabel()}${bad ? ' — sob sol a medição não vale; troque para Noturna na aba Medições.' : '.'}`; },
      run: async (g) => { await ensureReady(g); cam('ref1'); await wait(300, g); } },
    { t: 'Identificar os pontos', ref: 'NHO-11 · Anexo 1',
      x: () => { const c = NORM.configById(S.config); const ids = c.points; const gs = [...new Set(ids.map((i) => i[0].toUpperCase()))];
        const cnt = gs.map((G) => `${ids.filter((i) => i[0].toUpperCase() === G).length} ${G}`).join(', ');
        return `Agora marque os pontos de medição do Anexo 1. Neste arranjo (Figura ${c.fig}, ${c.short.toLowerCase()}) são ${ids.length} pontos: ${cnt}. Meça na ordem ${gs.join(' → ')}, sempre a ${fmt(S.room.plane, 2)} m, e anote cada leitura no ponto certo. A planilha começa em branco.`; },
      prep: () => ensureClean(),
      run: async (g) => { await ensureReady(g); hooks.setTab?.('med'); ensurePanel(); app.identify(); hi($('.identify')); cam('top'); await wait(600, g); } },
    { t: () => `Medir no ${firstId().toUpperCase()}`, ref: 'Manual · HOLD',
      x: () => `Leve o tripé até o ponto ${firstId().toUpperCase()}, afaste-se e espere o número parar de variar. Então toque em HOLD para congelar a leitura no visor e leia o valor em lux.`,
      prep: () => ensureClean(),
      run: async (g) => { await ensureReady(g); if (!S.showPoints) app.identify(); goPoint(firstId()); await wait(2600, g); for (let k = 0; k < 12 && lst() && lst().stable === false; k++) await wait(300, g); focus('hold'); await wait(700, g); ensureHold(true); await wait(500, g); focus('lcd'); } },
    { t: 'Registrar a leitura', ref: 'Planilha de campo',
      x: () => `Anote o valor congelado no campo ${firstId().toUpperCase()} da planilha; aqui, o botão Registrar leitura (tecla R) faz isso. Depois toque de novo em HOLD para liberar o visor. O luxímetro virtual já segue para o próximo ponto.`,
      prep: () => ensureClean(),
      run: async (g) => { await ensureOn(true, g); ensureCap(false); hooks.setTab?.('med'); ensurePanel(); const id = firstId();
        if (S.activePoint !== id) { goPoint(id); await wait(1500, g); }
        ensureHold(true); hi($('.lxcard .lx-rec')); await wait(1600, g); app.recordReading(id); demoRec.add(id);
        const f = $(`.fld[data-id="${id}"]`); hi(f); f?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }); await wait(1400, g); ensureHold(false); } },
    { t: 'Memória interna (MEM/READ)', ref: 'Manual · MEM',
      x: () => 'Como cópia de segurança, toque rapidamente em MEM: a leitura é gravada na memória interna, de NO.01 até NO.99. Para rever, mantenha MEM/READ pressionada por alguns segundos e use as setas ▲ ▼ para navegar entre as leituras salvas. Para apagar a memória, use com o aparelho desligado a combinação de teclas indicada no manual.',
      run: async (g) => { await ensureReady(g); focus('mem'); await wait(1800, g); lx('press', 'mem'); focus('lcd'); await wait(2600, g);
        focus('mem'); await wait(900, g); lx('press', 'read'); focus('lcd'); await wait(1800, g); focus('up'); lx('press', 'up'); await wait(1300, g); focus('down'); lx('press', 'down'); await wait(1300, g);
        focus('lcd'); await wait(1200, g); if (lst()?.mode === 'read') lx('press', 'mem'); } },
    { t: 'Demais pontos', ref: 'NHO-11 · Anexo 1',
      x: () => `Repita em cada ponto: posicionar o tripé, aguardar estabilizar, congelar com HOLD e registrar. Vamos acelerar e percorrer os ${order().filter((i) => !demoRec.has(i)).length} pontos restantes na ordem do Anexo 1.`,
      prep: () => ensureClean(),
      run: async (g) => { await ensureReady(g); hooks.setTab?.('med'); ensurePanel(); if (!S.showPoints) app.identify();
        for (const id of order()) { if (demoRec.has(id)) continue; goPoint(id); await wait(1050, g); app.recordReading(id); demoRec.add(id); await wait(260, g); } } },
    { t: 'Resultado e relatório', ref: 'NHO-11 · Anexo 1 e item 5',
      x: () => { const r = app.results(); const c = NORM.configById(S.config);
        const v = { atende: 'ATENDE à NHO-11', 'nao-atende': 'NÃO ATENDE à NHO-11', inconclusivo: 'INCONCLUSIVO (medição sob sol)' }[r.verdict] || 'incompleto';
        return `Com as ${c.points.length} leituras, o simulador aplica a fórmula da Figura ${c.fig}: Ē = ${fmt(r.E, 1)} lux. O Quadro 1 pede ${fmt(S.Emin, 0)} lux para este ambiente e nenhum ponto pode ficar abaixo de 70% de Ē (${fmt(r.bands?.lim70, 1)} lux). Parecer: ${v}. O relatório técnico sai pelo botão Emitir relatório técnico.`; },
      prep: () => { fillMissing(); order().forEach((i) => demoRec.add(i)); },
      run: async (g) => { lx('unfocus'); hooks.setTab?.('res'); ensurePanel(); cam('overview'); await wait(500, g); hi($('#pane-res [data-act="report"]'), $('.hud-rep')); } },
    { t: 'Desligar e guardar', ref: 'Manual · itens 6 e 9',
      x: () => 'Terminadas as medições, recoloque a tampa na fotocélula para protegê-la, desligue o aparelho e guarde-o no estojo. Se ficar muito tempo sem uso, retire as pilhas e evite guardá-lo em local quente ou úmido.',
      run: async (g) => { lx('showBack', false); ensureHold(false); focus('cap'); await wait(1500, g); ensureCap(true); await wait(1200, g); focus('power'); await wait(900, g); if (L()) lx('power', false); await wait(700, g); focus('body'); } },
    { t: 'Demonstração concluída', ref: 'Fim',
      x: () => 'Pronto! Você viu o procedimento completo, da conferência da calibração ao parecer. Deseja manter as leituras desta demonstração ou restaurar as leituras que havia antes?',
      end: true, run: async () => {} },
  ];
  const N = STEPS.length;

  // ---------- narração (speechSynthesis pt-BR) ----------
  const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
  let voice = null, uTok = 0, sp = null;
  function pickVoice() {
    if (!synth) return null; const vs = synth.getVoices() || []; const pt = vs.filter((v) => /^pt[-_]BR/i.test(v.lang));
    for (const re of [/luciana/i, /francisca/i, /google.*portugu/i, /thalita/i, /felipe/i, /daniel/i]) { const v = pt.find((x) => re.test(x.name)); if (v) return v; }
    return pt.find((v) => v.localService) || pt[0] || vs.find((v) => /^pt/i.test(v.lang)) || null;
  }
  if (synth) { voice = pickVoice(); synth.addEventListener?.('voiceschanged', () => { voice = pickVoice(); updMute(); }); }
  const canSpeak = () => !!(synth && voice && !muted);
  const toSpeech = (t) => t.replace(/Ē/g, 'E médio').replace(/[▲▼]\s*/g, '').replace(/setas\s+(?=[:.,]|$)/g, 'setas ').replace(/HOLD\/L\.S/g, 'HOLD')
    .replace(/MEM\/READ/g, 'MEM READ').replace(/LUX\/FC/g, 'LUX F C').replace(/NHO-(\d+)/g, 'ene agá ó $1').replace(/\bNHO\b/g, 'ene agá ó').replace(/\bRBC\b/g, 'R B C').replace(/\bAAA\b/g, 'triplo A')
    .replace(/\bOL\b/g, 'O L').replace(/\bLCD\b/g, 'L C D').replace(/\bCIE\b/g, 'C I E').replace(/\bNO\.(\d+)/g, 'número $1').replace(/\b1,5 V\b/g, '1,5 volt')
    .replace(/(\d),(\d+) m\b/g, '$1,$2 metro').replace(/\bLED\b/g, 'led').replace(/→/g, ',').replace(/\b([PTQR])(\d+)\b/g, '$1 $2').replace(/[()]/g, ',').replace(/—/g, ',');
  const est = (s) => 900 + s.split(/\s+/).length * 330;
  function speakStep(text, g) {
    const sentences = toSpeech(text).match(/[^.!?:;]+[.!?:;]?/g)?.map((s) => s.trim()).filter((s) => s.length > 1) || [];
    return new Promise((resolve) => { sp = { sentences, i: 0, g, resolve }; speakNext(); });
  }
  function speakNext() {
    const s = sp; if (!s || s.g !== gen || paused) return;
    if (s.i >= s.sentences.length) { sp = null; s.resolve(); return; }
    const txt = s.sentences[s.i]; const tok = ++uTok;
    const advance = () => { if (tok !== uTok || s !== sp || paused) return; s.i++; speakNext(); };
    if (!canSpeak()) { wait(est(txt), s.g).then(advance, () => {}); return; }
    const u = new SpeechSynthesisUtterance(txt); u.lang = 'pt-BR'; u.voice = voice; u.rate = 1.04; u.pitch = 1;
    let wd = 0; const fin = () => { clearTimeout(wd); advance(); };
    u.onend = fin; u.onerror = fin;
    wd = setTimeout(fin, est(txt) * 2.2 + 2500); // salvaguarda (onend que não chega)
    try { synth.speak(u); } catch { fin(); }
  }
  function hush() { uTok++; try { synth?.cancel(); } catch {} }
  function setMuted(m) { muted = m; try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch {} hush(); updMute(); if (open && !paused) speakNext(); }
  function updMute() {
    const b = $('[data-dlx="mute"]', card); const avail = !!(synth && voice);
    b.innerHTML = muted || !avail ? IC.mute : IC.vol; b.setAttribute('aria-pressed', String(muted));
    const lbl = !avail ? 'Narração indisponível (sem voz pt-BR neste navegador)' : muted ? 'Ativar narração' : 'Silenciar narração';
    b.setAttribute('aria-label', lbl); b.title = lbl; b.disabled = !avail;
  }
  function setPaused(p) {
    paused = p; const b = $('[data-dlx="pause"]', card);
    b.innerHTML = p ? `${IC.play}<span>Continuar</span>` : `${IC.pause}<span>Pausar</span>`; b.setAttribute('aria-pressed', String(p));
    card.classList.toggle('paused', p);
    if (p) hush(); else speakNext();
  }

  // ---------- leitura no cartão (espelho do visor) ----------
  function updRead() {
    const s = lst(); let l1 = '—', l2 = '';
    if (s) { const d = s.display || []; l1 = s.on ? (d[0] ?? fmt(s.reading, 1)) : 'desligado'; l2 = s.on ? [d[1], s.hold ? 'HOLD' : '', s.cap ? 'tampa' : ''].filter(Boolean).join(' · ') : (s.cap ? 'tampa colocada' : ''); }
    else if (S.activePoint) { l1 = fmt(app.readLuxmeter(S.activePoint), 1); l2 = `lux · ${S.activePoint.toUpperCase()}`; }
    $('.dlx-l1', card).textContent = l1; $('.dlx-l2', card).textContent = l2; $('.dlx-lcd', card).hidden = l1 === '—';
    $('.dlx-sub', card).textContent = partLabel ? 'Destaque: ' + partLabel : (L() ? 'Luxímetro 3D' : 'Luxímetro virtual');
  }

  // ---------- navegação ----------
  async function enter(i) {
    i = Math.max(0, Math.min(N - 1, i)); const g = ++gen; idx = i; hush(); sp = null; unhi(); partLabel = '';
    const s = STEPS[i];
    try { s.prep?.(); } catch (e) { console.error('[demo-lux] prep', e); }
    const title = typeof s.t === 'function' ? s.t() : s.t; let text = '';
    try { text = s.x(); } catch (e) { console.error('[demo-lux] texto', e); }
    $('.dlx-n', card).textContent = `Passo ${i + 1} de ${N}`; $('.dlx-ref', card).textContent = s.ref;
    $('.dlx-t', card).textContent = title; $('.dlx-x', card).textContent = text;
    const pr = $('.dlx-prog', card); pr.setAttribute('aria-valuemax', N); pr.setAttribute('aria-valuenow', i + 1); pr.setAttribute('aria-valuetext', `Passo ${i + 1} de ${N}: ${title}`);
    $('i', pr).style.width = `${(100 * (i + 1)) / N}%`;
    $('[data-dlx="prev"]', card).disabled = i === 0;
    $('.dlx-nav', card).hidden = !!s.end; $('.dlx-end', card).hidden = !s.end;
    card.classList.toggle('end', !!s.end);
    if (s.end) requestAnimationFrame(() => $('[data-dlx="keep"]', card)?.focus());
    const act = (async () => { try { await s.run(g); } catch (e) { if (e !== CANCEL) console.error('[demo-lux] passo', i + 1, e); } })();
    const talk = Promise.all([speakStep(`${title}. ${text}`, g), wait(est(`${title}. ${text}`) * 0.7, g).catch(() => {})]);
    await Promise.all([act, talk]);
    if (g !== gen || s.end) return;
    try { await wait(1300, g); } catch { return; }
    if (g === gen && open) enter(i + 1);
  }
  function go(n) { if (!open) return start(n); enter((+n || 1) - 1); }

  function start(n = 1) {
    if (open) return go(n);
    open = true; paused = false; cleared = false; demoRec = new Set();
    const tabEl = $('.tab[aria-selected="true"]'); const panel = $('.nho-panel');
    const ls = lst();
    snap = { values: { ...S.values }, view: S.view, showPoints: !!S.showPoints, activePoint: S.activePoint || null, tab: tabEl?.dataset.tab || 'med',
      collapsed: !!panel?.classList.contains('collapsed'), sheet: panel?.dataset.sheet || 'half',
      lux: ls ? { on: !!ls.on, cap: !!ls.cap, hold: !!ls.hold, src: ls.source ? `${ls.source.code}|${ls.source.name}` : null } : null };
    root.classList.add('dlx-on'); card.hidden = false; setPaused(false); updMute();
    if (isMobile()) hooks.setSheet?.('peek');
    clearInterval(readT); readT = setInterval(updRead, 300); updRead();
    $$('[data-demo-lux]').forEach((b) => b.setAttribute('aria-expanded', 'true'));
    try { synth?.cancel(); synth?.resume(); } catch {}
    requestAnimationFrame(() => card.focus({ preventScroll: true }));
    enter((+n || 1) - 1);
  }

  async function stop({ keep } = {}) {
    if (!open) return;
    open = false; gen++; clearTimeout(frameT); hush(); sp = null; paused = false; unhi(); clearInterval(readT); partLabel = '';
    card.hidden = true; root.classList.remove('dlx-on');
    $$('[data-demo-lux]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
    const s = snap; snap = null; if (!s) return;
    const changed = JSON.stringify(S.values) !== JSON.stringify(s.values);
    const restore = keep !== true;
    try {
      // luxímetro: volta ao estado anterior
      lx('unfocus'); lx('showBack', false);
      if (s.lux && L()) {
        const cur = lst() || {};
        if (s.lux.on && !cur.on) lx('power', true);
        if (lst()?.mode === 'read') lx('press', 'mem');
        if (lst()?.on && !!lst()?.hold !== s.lux.hold) lx('press', 'hold');
        if (!!lst()?.cap !== s.lux.cap) lx('setCap', s.lux.cap);
        if (s.lux.src && s.lux.on) for (let k = 0; k < 12; k++) { const c = lst()?.source; if (!c || `${c.code}|${c.name}` === s.lux.src) break; lx('press', 'source'); }
        if (!s.lux.on && lst()?.on) lx('power', false);
      }
      if (restore && changed) setValues(s.values);
      if (!s.showPoints && restore) app.set({ showPoints: false });
      const lxc = $('.lxcard'); if (lxc && !lxc.hidden && !s.activePoint) $('.lx-x', lxc)?.click();
      S.activePoint = s.activePoint;
      app.setView(s.view || 'ref1', { animate: true });
      hooks.setTab?.(restore ? s.tab : 'res');
      if (s.collapsed && !isMobile()) hooks.setCollapsed?.(true, false);
      if (isMobile()) hooks.setSheet?.(s.sheet);
    } catch (e) { console.error('[demo-lux] restauração', e); }
    if (keep === true) hooks.toast?.('Demonstração encerrada — leituras da demonstração mantidas.');
    else if (changed) hooks.toast?.('Demonstração encerrada — leituras anteriores restauradas.');
    else hooks.toast?.('Demonstração encerrada.');
    const o = opener; opener = null; try { (o && o.isConnected && o.offsetParent ? o : $('[data-demo-lux]'))?.focus({ preventScroll: true }); } catch {}
  }

  app.on('focus', (id) => { if (open && id) { partLabel = 'ponto ' + String(id).toUpperCase(); if (idx >= 9 && idx <= 12) frameLux(id, 120); } });
  window.__demoLux = { start: (n) => start(n), go: (n) => go(n), stop: (o) => stop(o), get step() { return open ? idx + 1 : 0; }, get running() { return open; }, steps: N };
  return window.__demoLux;
}

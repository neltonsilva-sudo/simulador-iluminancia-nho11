// UI — relatório técnico imprimível (NHO-11 item 8 / NR-17 item 17.8). Sem logotipo de instituição. Dono: UI.
import { esc, fmt, parecer, GROUP_COLORS, groupInfo, ADJ_REASONS, fracHTML } from './ui_text.js';
import { croquiFromApp } from './ui_croqui.js';
import { icon } from './ui_icons.js';

export const REPORT_FIELDS = [
  ['empresa', 'Empresa / razão social'], ['cnpj', 'CNPJ'], ['endereco', 'Endereço'], ['setor', 'Setor / local avaliado'],
  ['data', 'Data da avaliação', 'date'], ['periodo', 'Período / horário das medições'], ['atividades', 'Atividades e tarefas visuais', 'area'],
  ['equip', 'Luxímetro (marca / modelo)'], ['serie', 'Número de série'], ['certificado', 'Certificado de calibração (nº / data / laboratório)'],
  ['responsavel', 'Responsável técnico'], ['registro', 'Registro profissional'], ['local', 'Local (cidade/UF) para assinatura'],
];

const blank = (v, w = 'lg') => (v && String(v).trim() ? esc(v) : `<span class="rp-blank rp-${w}"></span>`);
const dateBR = (s) => { if (!s) return ''; const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); return m ? `${m[3]}/${m[2]}/${m[1]}` : s; };

export function reportHTML(app, info = {}, ctx = {}) {
  const S = app.state; const N = app.NORM; const cfg = N.configById(S.config); const r = app.results();
  const pts = app.points(); const lums = app.luminaires(); const env = r.env || {};
  const T = app.LUM_TYPES.find((x) => x.id === S.lum.type) || {};
  const pr = parecer(app, r, ctx); const gi = groupInfo(cfg.layout);
  const ok = isFinite(r.E);
  const d = info;
  const lim = r.bands?.lim70;
  const rows = pts.map((p) => { const v = S.values[p.id]; const has = v != null && v !== '' && isFinite(+v);
    const st = !has ? '—' : lim == null ? '' : (+v >= lim ? 'sim' : '<b class="rp-bad">não</b>');
    return `<tr><td><span class="rp-dot" style="background:${GROUP_COLORS[p.group]}"></span>${p.label}</td><td>${esc(gi[p.group] || p.group)}</td>
      <td class="n">${fmt(p.x + S.room.W / 2, 2)}</td><td class="n">${fmt(p.z + S.room.L / 2, 2)}</td><td class="n"><b>${has ? fmt(+v, 1) : ''}</b></td><td class="c">${st}</td></tr>`; }).join('');
  const groups = Object.entries(r.groups || {}).map(([g, v]) => `<td><span class="rp-dot" style="background:${GROUP_COLORS[g]}"></span><b>${g}</b> = ${fmt(v, 2)} lux</td>`).join('');
  const checks = (r.checks || []).map((c) => `<tr><td>${esc(c.label)}</td><td>${esc(c.detail)}</td><td class="c">${c.ok === null ? '<span class="rp-na">caso a caso</span>' : c.ok ? '<b class="rp-ok">Atende</b>' : '<b class="rp-bad">Não atende</b>'}</td></tr>`).join('');
  const adjTxt = ctx.adjust ? `Nível ${ctx.adjust > 0 ? 'aumentado' : 'reduzido'} em um degrau da escala (item 5.1): de ${fmt(ctx.baseE, 0)} para ${fmt(S.Emin, 0)} lux. Justificativa: ${esc(ctx.adjust > 0 ? (ADJ_REASONS[ctx.adjReason] || '') : (ctx.adjWhy || '—'))}.` : 'Sem ajuste de nível pela escala do item 5.1.';
  const taskTxt = S.task?.length ? `Leituras adicionais na área da tarefa: ${S.task.map((v) => fmt(v, 1)).join('; ')} lux.` : '';
  const svg = croquiFromApp(app, { dark: false, idPrefix: 'rp' });

  return `
  <article class="rp-doc" lang="pt-BR">
    <header class="rp-head">
      <div class="rp-kicker">Relatório técnico</div>
      <h1>Avaliação dos níveis de iluminamento em ambiente interno</h1>
      <p class="rp-sub">Metodologia: NHO-11 (Fundacentro, 2018) — Avaliação dos níveis de iluminamento em ambientes internos de trabalho · NR-17, item 17.8</p>
    </header>

    <section><h2>1. Identificação</h2>
      <table class="rp-kv">
        <tr><th>Empresa</th><td colspan="3">${blank(d.empresa)}</td></tr>
        <tr><th>CNPJ</th><td>${blank(d.cnpj, 'md')}</td><th>Setor / local</th><td>${blank(d.setor, 'md')}</td></tr>
        <tr><th>Endereço</th><td colspan="3">${blank(d.endereco)}</td></tr>
        <tr><th>Data da avaliação</th><td>${blank(dateBR(d.data), 'sm')}</td><th>Período / horário</th><td>${blank(d.periodo, 'md')}</td></tr>
      </table>
    </section>

    <section><h2>2. Introdução</h2>
      <p>O presente relatório tem por objetivo avaliar os níveis de iluminamento do ambiente “${esc(env.nome || '—')}”, verificando o atendimento aos valores mínimos de iluminância estabelecidos no Quadro 1 da Norma de Higiene Ocupacional NHO-11 da Fundacentro.</p>
      <p>A avaliação justifica-se pelo item 17.8 da Norma Regulamentadora NR-17 (Ergonomia), que trata das condições de conforto no ambiente de trabalho e exige iluminação natural ou artificial, geral ou suplementar, apropriada à natureza da atividade, remetendo aos níveis de iluminamento da NHO-11. As medições foram realizadas ${d.data ? 'em ' + esc(dateBR(d.data)) : 'na data indicada no item 1'}${d.periodo ? ', ' + esc(d.periodo) : ''}, ${S.continuous ? 'considerando a existência de tarefas contínuas no ambiente' : 'em ambiente sem tarefas contínuas'}, sob as condições mais desfavoráveis (sem contribuição de luz natural).</p>
    </section>

    <section><h2>3. Instrumental utilizado</h2>
      <table class="rp-kv">
        <tr><th>Medidor de iluminância</th><td colspan="3">${blank(d.equip)}</td></tr>
        <tr><th>Número de série</th><td>${blank(d.serie, 'md')}</td><th>Certificado de calibração</th><td>${blank(d.certificado, 'md')}</td></tr>
      </table>
      <p class="rp-note">Luxímetro com fotocélula corrigida para a sensibilidade do olho humano e para o ângulo de incidência, adequado ao tipo de lâmpada avaliado, calibrado por laboratório acreditado pelo Inmetro (NHO-11, item 6.3). Respeitado o tempo de estabilização do instrumento antes das leituras (item 6.4).</p>
    </section>

    <section><h2>4. Critérios e procedimentos de avaliação</h2>
      <ul>
        <li>Medição ponto a ponto no plano de trabalho, a 0,75 m do piso, com a fotocélula na horizontal (item 6.4), com o sistema de iluminação em operação típica.</li>
        <li>Iluminância média (Ē) determinada pelo Anexo 1 — configuração ${cfg.id}: ${esc(cfg.name)} (Figura ${cfg.fig}), com ${cfg.points.length} pontos de medição: <span class="rp-mono">${esc(cfg.formula)}</span>.</li>
        <li>Ē deve ser igual ou superior ao valor E do Quadro 1, admitida tolerância de 10% abaixo (item 5).</li>
        <li>Nenhum ponto da área da tarefa pode ser inferior a 70% de Ē; a razão entre a maior leitura e Ē não deve exceder 5:1 (não aplicável acima de 2.500 lux).</li>
        ${S.continuous ? '<li>Em áreas com tarefas contínuas, a iluminância não pode ser inferior a 200 lux.</li>' : ''}
        <li>Faixas de referência adotadas na planilha de cálculo: Ē ± 15% e 70% de Ē ± 15%; área do ambiente ± 3%.</li>
      </ul>
    </section>

    <section><h2>5. Descrição do ambiente e do sistema de iluminação</h2>
      <table class="rp-kv">
        <tr><th>Tipo de ambiente (Quadro 1)</th><td colspan="3">${esc(env.grupo ? env.grupo + ' — ' : '')}${esc(env.nome || '—')}</td></tr>
        <tr><th>E mínimo (Quadro 1)</th><td>${fmt(ctx.baseE ?? env.E, 0)} lux</td><th>IRC/Ra mínimo</th><td>${esc(env.IRC ?? '—')}</td></tr>
        <tr><th>E adotado</th><td colspan="3">${fmt(S.Emin, 0)} lux. ${adjTxt}</td></tr>
        ${env.obs ? `<tr><th>Observações do Quadro 1</th><td colspan="3">${esc(env.obs)}</td></tr>` : ''}
        <tr><th>Dimensões internas</th><td>${fmt(S.room.L, 2)} × ${fmt(S.room.W, 2)} m, pé-direito ${fmt(S.room.H, 2)} m</td><th>Área</th><td>${fmt(r.area, 2)} m² (± 3%: ${fmt(r.areaBand[0], 2)} a ${fmt(r.areaBand[1], 2)} m²)</td></tr>
        <tr><th>Luminárias</th><td colspan="3">${lums.length ? `${lums.length} unidade(s) — ${cfg.layout === 'central' ? 'luminária central' : `${S.N} por fila × ${cfg.layout === 'single' || cfg.layout === 'continuous1' ? 1 : S.M} fila(s)`}` : 'teto luminoso'} · ${esc(T.name || S.lum.type)} · ${fmt(S.lum.flux, 0)} lm por luminária · ${fmt(S.lum.cct, 0)} K${S.lum.on === false ? ' · <b>desligadas no momento da simulação</b>' : ''}</td></tr>
        <tr><th>Atividades / tarefas</th><td colspan="3">${blank(d.atividades)}</td></tr>
      </table>
    </section>

    <section class="rp-break"><h2>6. Croqui do ambiente e pontos de medição</h2>
      <figure class="rp-fig">${svg}
        <figcaption><span><i style="background:${GROUP_COLORS.P}"></i>P</span><span><i style="background:${GROUP_COLORS.T}"></i>T</span><span><i style="background:${GROUP_COLORS.Q}"></i>Q</span><span><i style="background:${GROUP_COLORS.R}"></i>R</span>
        <span><i class="rp-lumkey"></i>luminária</span><span>– – – linhas de construção do Anexo 1 (Fig. ${cfg.fig})</span></figcaption></figure>
    </section>

    <section><h2>7. Dados obtidos</h2>
      <table class="rp-grid">
        <thead><tr><th>Ponto</th><th>Grupo</th><th class="n">x (m)</th><th class="n">y (m)</th><th class="n">Leitura (lux)</th><th class="c">≥ 70% de Ē</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="rp-note">Coordenadas a partir do canto superior esquerdo do croqui. ${taskTxt}</p>
    </section>

    <section><h2>8. Cálculo da iluminância média (Anexo 1)</h2>
      <table class="rp-grid rp-groups"><tr>${groups || '<td>—</td>'}</tr></table>
      <p class="rp-formula">${fracHTML(cfg.formula)}</p>
      <p class="rp-formula">${fracHTML('Ē = ' + r.expanded)} &nbsp;⇒&nbsp; <b>Ē = ${ok ? fmt(r.E, 2) + ' lux' : '—'}</b></p>
      ${ok ? `<table class="rp-kv">
        <tr><th>Ē</th><td><b>${fmt(r.E, 2)} lux</b></td><th>Faixa ± 15%</th><td>${fmt(r.bands.E15[0], 2)} a ${fmt(r.bands.E15[1], 2)} lux</td></tr>
        <tr><th>70% de Ē</th><td>${fmt(r.bands.lim70, 2)} lux</td><th>Faixa ± 15%</th><td>${fmt(r.bands.lim70_15[0], 2)} a ${fmt(r.bands.lim70_15[1], 2)} lux</td></tr>
        <tr><th>E mínimo exigido</th><td>${fmt(S.Emin, 0)} lux</td><th>Com tolerância de −10%</th><td>${fmt(r.bands.minReq, 0)} lux</td></tr>
      </table>
      <table class="rp-grid"><thead><tr><th>Critério (NHO-11, item 5)</th><th>Resultado</th><th class="c">Situação</th></tr></thead><tbody>${checks}</tbody></table>` : ''}
    </section>

    <section><h2>9. Interpretação dos resultados e parecer</h2>
      <p class="rp-verdict rp-${pr.tone}">${esc(pr.title)}</p>
      ${pr.paras.map((p) => `<p>${esc(p)}</p>`).join('')}
      ${pr.recs.length ? `<h3>Recomendações</h3><ul>${pr.recs.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      <p class="rp-note">Recomenda-se complementar este relatório com a avaliação preliminar qualitativa (ofuscamento, cintilação, sombras, aparência de cor e contraste — Anexos 2 e 3 da NHO-11).</p>
    </section>

    <section class="rp-sign">
      <p>${d.local ? esc(d.local) : '<span class="rp-blank rp-md"></span>'}, ${d.data ? esc(dateBR(d.data)) : '<span class="rp-blank rp-sm"></span>'}</p>
      <div class="rp-sigline"></div>
      <p class="rp-signame"><b>${d.responsavel ? esc(d.responsavel) : 'Responsável técnico'}</b></p>
      <p class="rp-signame">Registro profissional: ${d.registro ? esc(d.registro) : '<span class="rp-blank rp-sm"></span>'}</p>
    </section>
  </article>`;
}

export function openReport(app, info, ctx, onClose) {
  let ov = document.getElementById('nho-report');
  if (!ov) { ov = document.createElement('div'); ov.id = 'nho-report'; document.body.appendChild(ov); }
  ov.className = 'rp-overlay'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Relatório técnico');
  ov.innerHTML = `<div class="rp-bar"><div class="rp-bar-t">${icon('doc')} Pré-visualização do relatório <small>A4 · campos em branco para preenchimento</small></div>
    <div class="rp-bar-a"><button type="button" class="btn btn-primary" data-a="print">${icon('print')} Imprimir / salvar PDF</button>
    <button type="button" class="btn btn-ghost icon-only" data-a="close" aria-label="Fechar relatório">${icon('x')}</button></div></div>
    <div class="rp-scroll">${reportHTML(app, info, ctx)}</div>`;
  const prev = document.activeElement;
  const close = () => { ov.remove(); document.documentElement.classList.remove('nho-print-mode'); prev?.focus?.(); onClose?.(); document.removeEventListener('keydown', key, true); };
  const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
  document.addEventListener('keydown', key, true);
  ov.querySelector('[data-a=close]').onclick = close;
  ov.querySelector('[data-a=print]').onclick = () => { document.documentElement.classList.add('nho-print-mode'); setTimeout(() => window.print(), 30); };
  document.documentElement.classList.add('nho-print-mode');
  ov.querySelector('[data-a=print]').focus();
  return { close };
}

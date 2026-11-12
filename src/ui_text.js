// UI — textos, formatação e parecer técnico (pt-BR). Dono: UI.
export const GROUP_COLORS = { P: '#ff5a36', T: '#2f9bff', Q: '#2ecc71', R: '#ffc23a' };

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function fmt(v, d = 1) {
  if (v == null || v === '' || !isFinite(+v)) return '—';
  return (+v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
}
/** "1.234,5" | "1234.5" | "293" | "293 lux" → número ou null */
export function parseNum(s) {
  if (s == null) return null;
  let t = String(s).trim().replace(/\s|lux|lx/gi, '');
  if (!t) return null;
  if (t.includes(',') && t.includes('.')) t = t.replace(/\./g, '').replace(',', '.');
  else t = t.replace(',', '.');
  const v = Number(t);
  return isFinite(v) && v >= 0 ? v : null;
}

/** Significado de cada grupo de pontos conforme o arranjo (Anexo 1). */
export function groupInfo(layout) {
  const m = {
    grid: { P: 'Cantos', T: 'Paredes laterais', Q: 'Paredes de topo', R: 'Região central' },
    central: { P: 'Centros dos quadrantes' },
    single: { P: 'Extremidades da linha', Q: 'Laterais da linha' },
    continuous: { P: 'Cantos', T: 'Paredes de topo', Q: 'Paredes laterais', R: 'Região central' },
    continuous1: { P: 'Além das extremidades', Q: 'Laterais da linha' },
    luminous: { P: 'Cantos (0,60 m das paredes)', T: 'Paredes de topo (0,60 m)', Q: 'Paredes laterais (0,60 m)', R: 'Região central' },
  };
  return m[layout] || m.grid;
}

export const ADJ_REASONS = [
  'O trabalho visual é crítico',
  'A capacidade visual dos trabalhadores está abaixo do normal',
  'A tarefa apresenta contrastes excepcionalmente baixos',
];

/** E adotado pela escala do item 5.1 (ajuste de ±1 nível). */
export function adjustedE(ESCALA, E, adj) {
  if (!isFinite(E) || !adj) return E;
  let i = ESCALA.indexOf(E);
  if (i < 0) { i = ESCALA.reduce((b, v, k) => (Math.abs(v - E) < Math.abs(ESCALA[b] - E) ? k : b), 0); }
  return ESCALA[Math.max(0, Math.min(ESCALA.length - 1, i + adj))];
}

/** Parecer automático no estilo do relatório da planilha. Retorna {title, tone, paras[], recs[]}. */
export function parecer(app, r, ctx = {}) {
  const S = app.state; const cfg = app.NORM.configById(S.config);
  const env = r.env; const envName = env ? env.nome : 'ambiente avaliado';
  const nPts = cfg.points.length; const have = nPts - (r.missing?.length || 0);
  if (r.verdict === 'incompleto' || !isFinite(r.E)) {
    return { title: 'Avaliação incompleta', tone: 'muted',
      paras: [`Foram informadas ${have} de ${nPts} leituras exigidas pela configuração “${cfg.short}” (Anexo 1, Figura ${cfg.fig}). ` +
        `Preencha ${r.missing?.length === 1 ? 'a leitura que falta' : 'as leituras que faltam'} (${(r.missing || []).map((x) => x.toUpperCase()).join(', ')}) para obter a iluminância média e o parecer.`], recs: [] };
  }
  const E = r.E, Emin = r.Emin, tol = Emin * 0.9;
  const chk = Object.fromEntries((r.checks || []).map((c) => [c.id, c]));
  const fails = (r.checks || []).filter((c) => c.ok === false);
  const atende = r.verdict === 'atende';
  const adj = ctx.adjust ? ` (nível ${ctx.adjust > 0 ? 'aumentado' : 'reduzido'} em um degrau da escala do item 5.1 a partir de ${fmt(ctx.baseE, 0)} lux)` : '';
  const paras = [];
  paras.push(`Com base nas ${nPts} leituras realizadas a 0,75 m do piso, com a fotocélula no plano horizontal, e no método do Anexo 1 da NHO-11 (Fundacentro, 2018) para ${cfg.name.charAt(0).toLowerCase() + cfg.name.slice(1)}, ` +
    `a iluminância média do ambiente é Ē = ${fmt(E, 2)} lux. O Quadro 1 estabelece, para “${envName}”, o nível mínimo de ${fmt(Emin, 0)} lux${adj}, admitida a tolerância de 10% abaixo desse valor (${fmt(tol, 0)} lux).`);
  if (chk.emin) paras.push(chk.emin.ok
    ? `A iluminância média ${E >= Emin ? 'é superior ao' : 'situa-se dentro da tolerância de 10% do'} nível mínimo exigido.`
    : `A iluminância média é inferior ao nível mínimo exigido, mesmo considerada a tolerância de 10% (déficit de ${fmt(Emin - E, 1)} lux, ou ${fmt((1 - E / Emin) * 100, 1)}% abaixo do Quadro 1).`);
  const extra = [];
  if (chk['70']) extra.push(chk['70'].ok ? `todas as leituras ${S.task?.length ? 'da área da tarefa' : ''} são iguais ou superiores a 70% de Ē (${fmt(r.bands.lim70, 1)} lux)` : `há leituras ${S.task?.length ? 'na área da tarefa ' : ''}inferiores a 70% de Ē (${fmt(r.bands.lim70, 1)} lux), o que indica distribuição pouco uniforme`);
  if (chk['5:1'] && chk['5:1'].ok !== null) extra.push(chk['5:1'].ok ? `a razão entre a maior leitura e Ē (${chk['5:1'].detail}) não excede 5:1` : `a razão entre a maior leitura e Ē (${chk['5:1'].detail}) excede 5:1`);
  if (chk['200']) extra.push(chk['200'].ok ? 'nenhuma leitura é inferior a 200 lux (tarefas contínuas)' : 'há leituras inferiores a 200 lux, valor mínimo para áreas com tarefas contínuas');
  if (extra.length) paras.push('Quanto aos demais critérios do item 5, ' + extra.join('; ') + '.');
  if (atende) paras.push(`Conclui-se que o ambiente ATENDE aos níveis mínimos de iluminamento da NHO-11 e, portanto, as condições de iluminação, quanto à iluminância, são adequadas conforme o item 17.8 da NR-17 (condições de conforto no ambiente de trabalho).`);
  else paras.push(`Conclui-se que o ambiente NÃO ATENDE à NHO-11 (${fails.map((c) => critName(c.id)).join('; ')}). As condições de iluminamento são, portanto, consideradas antiergonômicas, nos termos do item 17.8 da NR-17, que remete aos níveis de iluminamento da NHO-11 da Fundacentro.`);
  const recs = [];
  if (!atende) {
    if (chk.emin && !chk.emin.ok) {
      const n = app.luminaires().length || 0;
      if (n && S.lum?.on !== false) recs.push(`Rever o projeto luminotécnico: por proporcionalidade simples, seriam necessárias cerca de ${Math.ceil(n * Emin / E)} luminárias do tipo atual (hoje ${n}) — confirmar por cálculo luminotécnico (método dos lúmens) antes da execução.`);
      recs.push('Substituir lâmpadas/luminárias por modelos de maior fluxo luminoso e eficiência, com temperatura de cor e IRC adequados ao Quadro 1.');
    }
    if (chk['70'] && !chk['70'].ok) recs.push('Melhorar a uniformidade: redistribuir as luminárias ou acrescentá-las sobre as áreas com leituras abaixo de 70% de Ē.');
    if (chk['200'] && !chk['200'].ok) recs.push('Garantir no mínimo 200 lux em todas as áreas com tarefas contínuas (iluminação geral ou suplementar).');
    recs.push('Implantar manutenção preventiva do sistema de iluminação (limpeza de luminárias, troca programada de lâmpadas) — item 7 da NHO-11.');
    recs.push('Após as adequações, repetir a avaliação nas mesmas condições (período noturno, sem contribuição de luz natural).');
  }
  return { title: atende ? 'Atende à NHO-11' : 'Não atende à NHO-11', tone: atende ? 'ok' : 'bad', paras, recs };
}
export function critName(id) {
  return { emin: 'iluminância média abaixo do Quadro 1', '70': 'leituras abaixo de 70% de Ē', '5:1': 'razão máxima/média acima de 5:1', '200': 'leituras abaixo de 200 lux em tarefas contínuas' }[id] || id;
}

/** "A = [num] / den = x" → HTML com fração empilhada. */
export function fracHTML(s) {
  s = String(s ?? ''); const k = s.lastIndexOf(' / '); if (k < 0) return esc(s);
  let num = s.slice(0, k), den = s.slice(k + 3), lhs = '', tail = '';
  const m = /^(.*=\s)(.*)$/.exec(num); if (m && !m[2].includes('=')) { lhs = m[1]; num = m[2]; }
  const t = /^(\S+)(\s=\s.*)$/.exec(den); if (t) { den = t[1]; tail = t[2]; }
  return `${esc(lhs)}<span class="frac"><span>${esc(num)}</span><span>${esc(den)}</span></span>${esc(tail)}`;
}

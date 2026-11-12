// UI — "Emitir relatório técnico": formulário + pré-visualização A4 fiel ao modelo do Excel do usuário
// (docs/RELATORIO_MODELO.md — aba "RELATORIO TEC. ILUMINANCIA-EAD"). Sem logotipo de instituição. Dono: UI.
import { esc, fmt, parecer, GROUP_COLORS, groupInfo, fracHTML, expandedUI } from './ui_text.js';
import { croquiFromApp, roomOpenings } from './ui_croqui.js';
import { icon } from './ui_icons.js';
import { allConds, resultsFor, completeConds, curKey, COND_LONG, COND_SHEET, COND_LABEL, lumState } from './ui_cond.js';

const KEY = 'nho11-twin-relatorio-v1', FOTO_KEY = 'nho11-twin-relatorio-foto-v1';
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };

export const EMPRESA = [
  ['razao', 'Razão social'], ['cnpj', 'CNPJ'], ['fantasia', 'Nome fantasia'], ['contato', 'Contato'], ['endereco', 'Endereço', 'full'],
  ['cnae', 'CNAE'], ['grau', 'Grau de risco'], ['ntrab', 'Número de trabalhadores'], ['horario', 'Horário de trabalho'], ['respEmp', 'Responsável pela empresa', 'full'],
];
export const CHECK = [
  ['cintilacao', 'cintilação perceptível'], ['estrobo', 'efeito estroboscópico'], ['direcional', 'problemas de direcionalidade da luz'],
  ['sombras', 'sombras excessivas'], ['ofusc', 'ofuscamento ou reflexos incômodos'], ['sujidade', 'sujidades nas luminárias'], ['defeito', 'lâmpadas ou luminárias apagadas/com defeito'],
];
const DEFAULTS = { instituicao: '', local: '', unidade: '', atividade: 'aulas teóricas', periodo: 'noturno', tipoIlum: 'artificial', instalacao: 'sobrepondo o teto',
  portas: 1, janelas: 8, luxModelo: '', certificado: '', outros: 'Microcomputador\nCalculadora científica\nTripé para apoio do luxímetro',
  datas: '', h1: '', h2: '', chk: {}, tecnico: '', mte: '', cidade: '', dataAss: '', foto: 'scene', edits: {} };

// ---------------- utilidades de texto ----------------
const U = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const D = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
export function extenso(n, fem = false) {
  n = Math.round(+n); if (!isFinite(n) || n < 0 || n > 99) return String(n);
  const u = (k) => (fem && k === 1 ? 'uma' : fem && k === 2 ? 'duas' : U[k]);
  return n < 20 ? u(n) : D[Math.floor(n / 10)] + (n % 10 ? ' e ' + u(n % 10) : '');
}
const nx = (n, fem, pad = false) => `${pad ? String(n).padStart(2, '0') : n} (${extenso(n, fem)})`;
const dateBR = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : (s || ''); };
const B = (v, w = 'md') => (v != null && String(v).trim() !== '' ? esc(v) : `<span class="rp-blank rp-${w}"></span>`);
const paras = (t) => String(t || '').split(/\n{1,}/).map((x) => x.trim()).filter(Boolean).map((x) => `<p>${esc(x)}</p>`).join('');
const sig = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return h; };
const lower1 = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

const condFrase = (S) => (S.avaliacao?.periodo === 'diurno' ? `diurno, com céu ${S.avaliacao.ceu}` : 'noturno');
/** Texto da descrição do ambiente (item 4). */
function descText(app, rel) {
  const S = app.state; const cfg = app.NORM.configById(S.config); const T = app.LUM_TYPES.find((x) => x.id === S.lum.type) || {};
  const n = app.luminaires().length; const local = rel.local || app.results().env?.nome || 'ambiente avaliado';
  const tipo = lower1((T.name || 'luminárias').replace(/\s*\(foto\)\s*/i, '').trim());
  let arr;
  if (cfg.layout === 'luminous') arr = 'A iluminação artificial se dá através de teto luminoso (iluminação difusa distribuída por todo o forro)';
  else if (cfg.layout === 'central') arr = `A iluminação artificial se dá através de ${nx(1, true, true)} luminária do tipo ${tipo}, instalada no centro do ambiente, ${rel.instalacao}`;
  else {
    const M = ['single', 'continuous1'].includes(cfg.layout) ? 1 : S.M;
    const disp = cfg.layout === 'continuous' || cfg.layout === 'continuous1' ? `formando ${nx(M, true)} linha${M > 1 ? 's' : ''} contínua${M > 1 ? 's' : ''} de ${nx(S.N, true)}` : `dispostas regularmente em ${nx(M, true)} fileira${M > 1 ? 's' : ''} de ${nx(S.N, true)}`;
    arr = `A iluminação artificial se dá através de ${nx(n, true, true)} luminárias do tipo ${tipo}, ${disp}, instaladas ${rel.instalacao}`;
  }
  const ops = roomOpenings(S.room); const portas = ops ? ops.filter((o) => o.kind === 'porta').length : +rel.portas || 0, jan = ops ? ops.filter((o) => o.kind === 'janela').length : +rel.janelas || 0;
  return `O(A) ${local} é utilizado(a) para ${rel.atividade || '________'}, no período ${rel.periodo}, e possui iluminação do tipo ${rel.tipoIlum}. ${arr}. ` +
    lumTxt(app) + `O ambiente possui área total de ${fmt(S.room.L * S.room.W, 2)} m² (${fmt(S.room.L, 2)} m × ${fmt(S.room.W, 2)} m), pé-direito de ${fmt(S.room.H, 2)} m, dispondo de ${nx(portas, true)} porta${portas === 1 ? '' : 's'} e ${nx(jan, true)} janela${jan === 1 ? '' : 's'}, e paredes em cores claras.`;
}

function lumTxt(app) {
  const st = lumState(app); const t = [];
  if (st.off.length) t.push(`${nx(st.off.length, true)} luminária${st.off.length > 1 ? 's' : ''} apagada${st.off.length > 1 ? 's' : ''}/queimada${st.off.length > 1 ? 's' : ''} (${st.off.join(', ')})`);
  if (st.dep.length) t.push(`${nx(st.dep.length, true)} com fluxo luminoso reduzido por depreciação (${st.dep.map((id) => `${id}: ${Math.round((app.state.lum.lumFactors[id]) * 100)}%`).join(', ')})`);
  return t.length ? `No momento da avaliação, havia ${t.join(' e ')}. ` : '';
}
/** Frase da avaliação preliminar (item 5). */
function prelimText(app, rel) {
  const local = rel.local || app.results().env?.nome || 'ambiente avaliado';
  const has = CHECK.filter(([k]) => rel.chk?.[k]).map((x) => x[1]), not = CHECK.filter(([k]) => !rel.chk?.[k]).map((x) => x[1]);
  const list = (a) => (a.length > 1 ? a.slice(0, -1).join(', ') + ' e ' + a[a.length - 1] : a[0] || '');
  const S = app.state; const st = lumState(app);
  let t = `Na avaliação preliminar (NHO-11, item 6.1 e Anexo 2) realizada em ${rel.datas || '____/____/______'}, no horário das ${rel.h1 || '____'} às ${rel.h2 || '____'}, no período ${condFrase(S)}, no(a) ${local}, verificou-se que `;
  if (!has.length) t += `não há ${list(not)}.`;
  else if (!not.length) t += `há ${list(has)}.`;
  else t += `não há ${list(not)}; contudo, há ${list(has)}.`;
  if (st.off.length || st.dep.length) t += ` Observaram-se ${[st.off.length ? `${st.off.length} luminária(s) apagada(s)/queimada(s)` : '', st.dep.length ? `${st.dep.length} com fluxo reduzido` : ''].filter(Boolean).join(' e ')}.`;
  const cond = S.avaliacao?.periodo !== 'diurno' ? ' As medições foram realizadas no período noturno, sob a condição mais desfavorável, sem contribuição de iluminação natural, com o sistema de iluminação em operação típica.'
    : S.avaliacao.ceu === 'nublado' ? ' As medições foram realizadas em dia nublado, com janelas e cortinas na condição de uso normal — condição desfavorável admitida pelo item 6.2 da NHO-11.' + (S.avaliacao.atividadeNoturna ? ' Como há atividades noturnas no ambiente, as medições também devem ser realizadas à noite.' : '')
    : ' ATENÇÃO: as medições foram realizadas em dia ensolarado; a contribuição da luz natural eleva as leituras e invalida a avaliação da iluminação instalada (item 6.2 da NHO-11).';
  return t + cond;
}

/** Parecer técnico no texto-modelo da planilha (item 6). */
function parecerText(app, r) {
  const S = app.state; if (!isFinite(r.E)) return 'Avaliação incompleta: preencha todas as leituras dos pontos de medição para emitir o parecer técnico.';
  const key = curKey(app); const all = allConds(app);
  const cmp = completeConds(app).filter((k) => k !== key).map((k) => `Na ${COND_LONG[k]}, a iluminância média foi de ${fmt(resultsFor(app, all[k], k).E, 2)} lux.`).join(' ');
  if (r.verdict === 'inconclusivo') return [`A avaliação foi realizada no período diurno, com céu ensolarado. Nessa condição, a luz natural eleva as leituras (Ē = ${fmt(r.E, 2)} lux) e o resultado NÃO representa a iluminação artificial instalada.`,
    'Conforme o item 6.2 da NHO-11, as medições devem ser realizadas na condição mais desfavorável, de forma que o iluminamento dependa somente das fontes instaladas. PELO EXPOSTO, a avaliação é INCONCLUSIVA e deve ser repetida à noite ou em dia nublado; avaliar também ofuscamento e reflexos causados pelo sol (Anexo 2).', cmp].filter(Boolean).join('\n');
  const E = S.Emin, tol = E * 0.9, Em = r.E, lim = r.bands.lim70; const c = Object.fromEntries((r.checks || []).map((x) => [x.id, x]));
  const vals = Object.values(S.values).map(Number).filter((v) => isFinite(v));
  const out = [];
  if (r.verdict === 'atende') {
    out.push(`A iluminação medida no ambiente encontra-se ${Em >= E ? 'acima do determinado pela NHO-11' : 'dentro da tolerância de 10% admitida pela NHO-11'}: ${fmt(E, 0)} lux (tolerância de 10%: ${fmt(tol, 0)} lux). ` +
      `A iluminância média medida no ambiente (Ē = ${fmt(Em, 2)} lux) atende às especificações do Quadro 1, e todas as leituras ${S.task?.length ? 'da área da tarefa ' : ''}são superiores ao valor correspondente a 70% da iluminância média: ${fmt(lim, 2)} lux; ` +
      `a razão entre a maior leitura e a iluminância média é de ${c['5:1']?.detail || '—'} (limite 5:1)${c['200'] ? ', e nenhuma leitura é inferior a 200 lux (tarefas contínuas)' : ''}.`);
    if (c.tarefa) out.push(`As leituras da área da tarefa atendem ao valor do Quadro 1 com a tolerância de 10% (${c.tarefa.detail.toLowerCase()}).`);
    if (r.note) out.push(r.note);
    if (cmp) out.push(cmp);
    out.push('Portanto, o nível de iluminância encontra-se DENTRO DO LIMITE estabelecido pela NHO-11. PELO EXPOSTO, o ambiente de trabalho é considerado ADEQUADO quanto à iluminação (NR-17, item 17.8).');
    return out.join('\n');
  }
  if (c.emin && !c.emin.ok) {
    const todos = vals.length && vals.every((v) => v < E);
    let t = `A iluminação medida em ${todos ? 'todos os' : 'alguns'} postos encontra-se abaixo do determinado pela NHO-11: ${fmt(E, 0)} lux e abaixo da tolerância de 10%: ${fmt(tol, 0)} lux. ` +
      `A iluminância média medida no ambiente (Ē = ${fmt(Em, 2)} lux) apresentou valor que não atende às especificações do Quadro 1`;
    if (c['70'] && !c['70'].ok) t += `, bem como há leituras inferiores ao valor correspondente a 70% da iluminância média: ${fmt(lim, 2)} lux`;
    out.push(t + '.');
  } else {
    let t = `A iluminância média medida no ambiente (Ē = ${fmt(Em, 2)} lux) atende ao Quadro 1 da NHO-11 (${fmt(E, 0)} lux; tolerância de 10%: ${fmt(tol, 0)} lux)`;
    if (c['70'] && !c['70'].ok) t += `; entretanto, há leituras inferiores ao valor correspondente a 70% da iluminância média: ${fmt(lim, 2)} lux`;
    out.push(t + '.');
  }
  const extra = [];
  if (c['200'] && !c['200'].ok) extra.push(`há leituras inferiores a 200 lux em área com tarefas contínuas (${c['200'].detail.toLowerCase()})`);
  if (c.tarefa && !c.tarefa.ok) extra.push(`há leituras da área da tarefa abaixo do valor do Quadro 1 com a tolerância de 10% (${c.tarefa.detail.toLowerCase()})`);
  if (c['5:1'] && c['5:1'].ok === false) extra.push(`a razão entre a maior leitura e a iluminância média (${c['5:1'].detail}) excede 5:1`);
  if (extra.length) out.push('Verificou-se ainda que ' + extra.join('; ') + '.');
  if (r.note) out.push(r.note);
  if (cmp) out.push(cmp);
  if (r.condicao?.nivel === 'alerta') out.push(r.condicao.texto);
  out.push(`Portanto, o nível de iluminância encontra-se ABAIXO DO LIMITE estabelecido pela NHO-11. PELO EXPOSTO, o ambiente de trabalho é considerado ANTIERGONÔMICO quanto à iluminação (NR-17, item 17.8).`);
  return out.join('\n');
}

function editable(rel, key, auto, on) {
  const e = rel.edits?.[key]; const txt = e && e.sig === sig(auto) ? e.text : auto;
  return `<div class="rp-ed" data-ed="${key}"${on ? ' contenteditable="true" spellcheck="true" title="Clique para editar o texto antes de imprimir"' : ''}>${paras(txt)}</div>`;
}


/** Quadro de cálculo no padrão da aba "EAD" da planilha, para as leituras de uma condição. */
function quadroHTML(app, r, values, { title = '', croqui = true } = {}) {
  const S = app.state; const cfg = app.NORM.configById(S.config); const env = r.env || {}; const ok = isFinite(r.E); const lim = r.bands?.lim70;
  const pts = app.points(); const byG = {}; cfg.points.forEach((id) => (byG[id[0].toUpperCase()] ||= []).push(id));
  const G = Object.keys(byG); const rows = Math.max(...G.map((g) => byG[g].length));
  const v = (id) => { const x = values[id]; return x != null && x !== '' && isFinite(+x) ? +x : null; };
  let tbl = `<thead><tr>${G.map((g) => `<th colspan="2" style="--g:${GROUP_COLORS[g]}"><i></i>${g} — ${esc(groupInfo(cfg.layout)[g] || '')}</th>`).join('')}</tr></thead><tbody>`;
  for (let i = 0; i < rows; i++) tbl += '<tr>' + G.map((g) => { const id = byG[g][i]; if (!id) return '<td></td><td></td>';
    const x = v(id); return `<td class="pt">${id.toUpperCase()}</td><td class="n${x != null && lim != null && x < lim ? ' low' : ''}">${x != null ? fmt(x, 1) : ''}</td>`; }).join('') + '</tr>';
  tbl += `<tr class="avg">${G.map((g) => `<td class="pt">${g}</td><td class="n">${fmt(r.groups?.[g], 2)}</td>`).join('')}</tr></tbody>`;
  const NM = cfg.layout === 'grid' || cfg.layout === 'continuous' ? `N = ${S.N} (luminárias por fila) · M = ${S.M} (filas)` : cfg.layout === 'single' || cfg.layout === 'continuous1' ? `N = ${S.N} (luminárias na linha)` : cfg.layout === 'luminous' ? `L = ${fmt(S.room.L, 2)} m · W = ${fmt(S.room.W, 2)} m` : '';
  return `<div class="rp-ead">
      <div class="rp-ead-h">QUADRO DE CÁLCULO DA ILUMINÂNCIA MÉDIA — NHO-11, ANEXO 1 · ${title}</div>
      <table class="rp-kv2">
        <tr><th>Tipo de ambiente (Quadro 1)</th><td>${esc(env.nome || '—')}</td><th>E mínimo</th><td class="n"><b>${fmt(S.Emin, 0)} lux</b>${env.IRC ? ` · IRC ≥ ${esc(env.IRC)}` : ''}</td></tr>
        <tr><th>Área (lado × lado)</th><td>${fmt(S.room.L, 2)} m × ${fmt(S.room.W, 2)} m = <b>${fmt(r.area, 2)} m²</b></td><th>Área ± 3%</th><td class="n">${fmt(r.areaBand[0], 2)} – ${fmt(r.areaBand[1], 2)} m²</td></tr>
      </table>
      ${croqui ? `<figure class="rp-cro">${croquiFromApp(app, { dark: false, idPrefix: 'rel' })}<figcaption><span><i style="background:${GROUP_COLORS.P}"></i>P</span><span><i style="background:${GROUP_COLORS.T}"></i>T</span><span><i style="background:${GROUP_COLORS.Q}"></i>Q</span><span><i style="background:${GROUP_COLORS.R}"></i>R</span><span>Croqui — Fig. ${cfg.fig} (${esc(cfg.short)})</span></figcaption></figure>` : ''}
      <div class="rp-form"><div class="rp-form-k">Fórmula da iluminância média</div><div>${fracHTML(cfg.formula)}</div><div class="rp-form-nm">${NM}</div>
        <div>${fracHTML('Ē = ' + expandedUI(cfg.id, r.groups, { N: S.N, M: S.M, L: S.room.L, W: S.room.W }))} &nbsp;⇒&nbsp; <b>Ē = ${ok ? fmt(r.E, 2) : '—'} lux</b></div></div>
      <table class="rp-reads">${tbl}</table>
      <table class="rp-res">
        <tr><th>Iluminância média (Ē)</th><td class="n big">${ok ? fmt(r.E, 2) : '—'} lux</td><th>Ē com tolerância de 15% (mín. – máx.)</th><td class="n">${ok ? `${fmt(r.bands.E15[0], 2)} – ${fmt(r.bands.E15[1], 2)}` : '—'} lux</td></tr>
        <tr><th>70% de Ē</th><td class="n">${ok ? fmt(lim, 2) : '—'} lux</td><th>70% de Ē com tolerância de 15% (mín. – máx.)</th><td class="n">${ok ? `${fmt(r.bands.lim70_15[0], 2)} – ${fmt(r.bands.lim70_15[1], 2)}` : '—'} lux</td></tr>
        <tr><th>E mínimo (Quadro 1)</th><td class="n">${fmt(S.Emin, 0)} lux</td><th>Com tolerância de 10%</th><td class="n">${fmt(S.Emin * 0.9, 0)} lux</td></tr>
      </table>
      ${r.note ? `<p class="rp-note">${esc(r.note)}</p>` : ''}
      ${S.task?.length ? `<p class="rp-note">Leituras na área da tarefa: ${S.task.map((x) => fmt(x, 1)).join('; ')} lux.</p>` : ''}
      ${(r.checks || []).length ? `<table class="rp-chk"><tr><th>Critério (NHO-11, item 5)</th><th>Resultado</th><th>Situação</th></tr>${r.checks.map((c) => `<tr><td>${esc(c.label)}</td><td>${esc(c.detail)}</td><td class="${c.ok === null ? '' : c.ok ? 'ok' : 'bad'}">${c.ok === null ? 'caso a caso' : c.ok ? 'ATENDE' : 'NÃO ATENDE'}</td></tr>`).join('')}</table>` : ''}
    </div>`;
}

// ---------------- documento ----------------
export function reportHTML(app, rel, ctx = {}, { edit = false, foto = null } = {}) {
  const S = app.state; const N = app.NORM; const cfg = N.configById(S.config); const r = app.results(); const env = r.env || {};
  const local = rel.local || env.nome || 'ambiente avaliado'; const ok = isFinite(r.E); const lim = r.bands?.lim70;
  const key = curKey(app); const all = allConds(app); const done = completeConds(app);
  const keys = done.includes(key) ? done : [key, ...done]; keys.sort((a, b) => ['noturno', 'diurno-nublado', 'diurno-ensolarado'].indexOf(a) - ['noturno', 'diurno-nublado', 'diurno-ensolarado'].indexOf(b));
  const quadros = keys.map((k) => quadroHTML(app, k === key ? r : resultsFor(app, all[k], k), k === key ? S.values : all[k], { title: COND_SHEET[k] + (keys.length > 1 && k === key ? ' (condição do parecer)' : ''), croqui: k === key })).join('');
  const verdCls = r.verdict === 'atende' ? 'ok' : r.verdict === 'nao-atende' ? 'bad' : r.verdict === 'inconclusivo' ? 'warn' : '';
  const verdTxt = { atende: 'ATENDE À NHO-11', 'nao-atende': 'NÃO ATENDE À NHO-11', inconclusivo: 'AVALIAÇÃO INCONCLUSIVA' }[r.verdict] || 'AVALIAÇÃO INCOMPLETA';
  const outros = String(rel.outros || '').split('\n').map((x) => x.trim()).filter(Boolean);
  const verdOk = r.verdict === 'atende';
  const fotoHTML = foto ? `<figure class="rp-photo"><img src="${foto}" alt="Foto do ambiente avaliado"><figcaption>Foto do ambiente avaliado</figcaption></figure>` : `<div class="rp-photo-empty">Foto do ambiente avaliado</div>`;
  return `<article class="rp-doc rp-model" lang="pt-BR">
  ${rel.instituicao ? `<div class="rp-inst">${esc(rel.instituicao)}</div>` : edit ? `<div class="rp-inst rp-inst-empty">(cabeçalho institucional opcional — sem logotipo)</div>` : ''}
  <div class="rp-band navy">RELATÓRIO TÉCNICO DA AVALIAÇÃO DE ILUMINÂNCIA - NHO-11</div>
  <div class="rp-band green">INFORMAÇÕES DA EMPRESA</div>
  <table class="rp-emp">${(() => { let h = '', row = []; for (const [k, l, full] of EMPRESA) { const cell = `<th>${l.toUpperCase()}:</th><td${full ? ' colspan="3"' : ''}>${B(rel[k], full ? 'lg' : 'md')}</td>`;
    if (full) { if (row.length) { h += `<tr>${row.join('')}<td></td><td></td></tr>`; row = []; } h += `<tr>${cell}</tr>`; } else { row.push(cell); if (row.length === 2) { h += `<tr>${row.join('')}</tr>`; row = []; } } }
    return h + (row.length ? `<tr>${row.join('')}<th></th><td></td></tr>` : ''); })()}</table>

  <section><h2>1. INTRODUÇÃO</h2>
    <p>Este trabalho tem como objetivo avaliar a iluminância do(a) ${esc(local)} de forma a atender a NR-17 (MTE), no que diz respeito à Ergonomia, conforme o item 17.8, subitens 17.8.1 e 17.8.3, como segue: “Em todos os locais e situações de trabalho deve haver iluminação, natural ou artificial, geral ou suplementar, apropriada à natureza da atividade.”</p>
    <p>“Em todos os locais e situações de trabalho internos, deve haver iluminação em conformidade com os níveis mínimos de iluminamento a serem observados nos locais de trabalho estabelecidos na Norma de Higiene Ocupacional nº 11 (NHO 11) da Fundacentro – Avaliação dos Níveis de Iluminamento em Ambientes Internos de Trabalho, versão 2018.”</p>
    <p>Dessa forma, segundo as características de cada ambiente, sob o ponto de vista da ergonomia, identificar os pontos de melhoria para o conforto na execução das atividades nos ambientes laborais desta unidade, adotando as diretrizes de segurança e saúde ocupacional, visando ao bem-estar dos trabalhadores.</p>
    <p><b>Justificativa:</b> este trabalho foi realizado visando à adoção de medidas de controle e à melhoria das condições de trabalho no que tange a questões de iluminância na unidade ${B(rel.unidade || rel.fantasia, 'md')}, conforme estabelecido na NR-17 – Ergonomia, da Portaria nº 3.214 de 1978.</p>
    <blockquote class="rp-quote"><p>“17.8 Condições de conforto no ambiente de trabalho:</p>
      <p>17.8.1 Em todos os locais e situações de trabalho deve haver iluminação, natural ou artificial, geral ou suplementar, apropriada à natureza da atividade.</p>
      <p>17.8.2 A iluminação deve ser projetada e instalada de forma a evitar ofuscamento, reflexos incômodos, sombras e contrastes excessivos.</p>
      <p>17.8.3 Em todos os locais e situações de trabalho internos, deve haver iluminação em conformidade com os níveis mínimos de iluminamento a serem observados nos locais de trabalho estabelecidos na Norma de Higiene Ocupacional nº 11 (NHO 11) da Fundacentro – Avaliação dos Níveis de Iluminamento em Ambientes Internos de Trabalho, versão 2018.”</p></blockquote>
  </section>

  <section class="rp-pb"><h2>2. EQUIPAMENTO UTILIZADO</h2>
    <p>Para a realização desta avaliação foram utilizados os seguintes equipamentos:</p>
    <ul><li>Luxímetro ${B(rel.luxModelo, 'md')}, com certificado de calibração nº ${B(rel.certificado, 'sm')}.</li>${outros.map((x) => `<li>${esc(x)}${/[.;:]$/.test(x) ? '' : '.'}</li>`).join('')}</ul>
  </section>

  <section><h2>3. CRITÉRIOS E PROCEDIMENTOS</h2>
    <p>O critério utilizado para avaliação do nível de iluminamento no(a) ${esc(local)} é a medição ponto a ponto nas diferentes tarefas e a comparação com os valores mínimos exigidos correspondentes ao valor da iluminância mínima E (lux) para as tarefas apresentadas no Quadro 1 da NHO-11, sendo permitida uma tolerância de 10% abaixo desse valor.</p>
    <p>A iluminância média (Ē) foi determinada pelo método do Anexo 1 da NHO-11 — configuração ${cfg.id}: ${esc(lower1(cfg.name))} (Figura ${cfg.fig}), com ${cfg.points.length} pontos de medição. A avaliação foi realizada no período ${condFrase(S)}${rel.h1 ? `, das ${esc(rel.h1)}${rel.h2 ? ` às ${esc(rel.h2)}` : ''}` : ''} (${keys.length > 1 ? 'foram também registradas as leituras da ' + keys.filter((k) => k !== key).map((k) => COND_LONG[k]).join(' e da ') : 'item 6.2 da NHO-11: condição mais desfavorável'}). As leituras foram realizadas com a fotocélula na horizontal, a 0,75 m do piso. As leituras na área da tarefa não podem ser inferiores a 70% de Ē, e a razão entre a maior leitura e Ē não deve ser superior a 5:1${S.continuous ? '; em áreas com tarefas contínuas, nenhuma leitura pode ser inferior a 200 lux' : ''}.</p>
  </section>

  <section><h2>4. DESCRIÇÃO DO AMBIENTE</h2>
    ${fotoHTML}
    ${editable(rel, 'desc', descText(app, rel), edit)}
  </section>

  <section class="rp-pb"><h2>5. DADOS E PARÂMETROS OBTIDOS NA AVALIAÇÃO</h2>
    ${editable(rel, 'prelim', prelimText(app, rel), edit)}
    <p>A iluminância média encontrada no ambiente avaliado foi de <b>${ok ? fmt(r.E, 2) : '—'} lux</b>.</p>
    ${quadros}
  </section>

  <section class="rp-pb"><h2>6. PARECER TÉCNICO</h2>
    <div class="rp-verdict ${verdCls}">${verdTxt}</div>
    ${editable(rel, 'parecer', parecerText(app, r), edit)}
    ${ok && r.verdict === 'nao-atende' ? `<h3>Recomendações</h3><ul>${parecer(app, r, ctx).recs.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
  </section>

  <section class="rp-sign">
    <p>${B(rel.cidade, 'md')}, ${rel.dataAss ? esc(dateBR(rel.dataAss)) : '<span class="rp-blank rp-sm"></span>'}.</p>
    <div class="rp-sigline"></div>
    <p><b>${rel.tecnico ? esc(rel.tecnico) : '&nbsp;'}</b></p>
    <p>Técnico em Segurança do Trabalho</p>
    <p>Registro MTE: ${B(rel.mte, 'sm')}</p>
  </section>
  </article>`;
}

// ---------------- estilos do relatório (também embutidos no .html baixado) ----------------
export const REPORT_CSS = `
.rp-doc{width:210mm;max-width:100%;margin:0 auto;padding:14mm 15mm 18mm;background:#fff;color:#111;font-family:Calibri,Carlito,"Segoe UI",Roboto,Arial,sans-serif;font-size:11.5pt;line-height:1.45;box-sizing:border-box}
.rp-doc *{box-sizing:border-box}
.rp-inst{text-align:center;font-weight:700;font-size:14pt;padding:2px 0 8px}
.rp-inst-empty{color:#9aa3b0;font-weight:400;font-size:10pt;font-style:italic}
.rp-band{text-align:center;font-weight:700;padding:6px 8px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.rp-band.navy{background:#002060;color:#fff;font-size:14pt;letter-spacing:.01em}
.rp-band.green{background:#00B050;color:#000;font-size:15pt;margin-top:2px}
.rp-emp{width:100%;border-collapse:collapse;font-size:10.5pt;margin:0 0 12px}
.rp-emp th,.rp-emp td{border:1px solid #9aa3b0;padding:5px 7px;text-align:left;vertical-align:top}
.rp-emp{table-layout:fixed}.rp-emp th{font-weight:700;width:22%;background:#f2f4f7;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.rp-doc h2{margin:16px 0 8px;padding:5px 9px;font-size:13.5pt;font-weight:700;background:#D9E1F2;color:#002060;-webkit-print-color-adjust:exact;print-color-adjust:exact;break-after:avoid}
.rp-doc h3{font-size:11.5pt;margin:12px 0 4px;color:#002060}
.rp-doc p{margin:0 0 7px;text-align:justify;hyphens:auto}
.rp-doc ul{margin:0 0 8px;padding-left:22px}.rp-doc li{margin:2px 0}
.rp-quote{margin:6px 0 4px;padding:6px 12px;border-left:3px solid #002060;background:#f6f8fb;font-style:italic;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.rp-quote p{margin:0 0 4px}
.rp-blank{display:inline-block;border-bottom:1px solid #7a8494;height:1em;vertical-align:-2px}.rp-blank.rp-lg{width:100%}.rp-blank.rp-md{width:38%;min-width:90px}.rp-emp .rp-blank.rp-md{width:100%;min-width:0}.rp-blank.rp-sm{width:90px}
.rp-photo{margin:6px auto 10px;text-align:center;break-inside:avoid}
.rp-photo img{display:block;max-width:100%;max-height:92mm;margin:0 auto;border:1px solid #c9ced6}
.rp-photo figcaption{text-align:right;font-size:9.5pt;font-style:italic;color:#444;margin-top:3px}
.rp-photo-empty{display:grid;place-items:center;height:60mm;margin:6px 0 10px;border:1.5px dashed #b8bfca;color:#8a93a2;font-style:italic}
.rp-ed[contenteditable]{outline:1.5px dashed #9db4ff;outline-offset:3px;border-radius:2px;cursor:text}
.rp-ed[contenteditable]:focus{outline:2px solid #2356e0;background:#f7f9ff}
.rp-ead{border:1.5px solid #002060;padding:8px;margin-top:8px;break-inside:auto}
.rp-ead-h{background:#002060;color:#fff;font-weight:700;text-align:center;padding:4px;margin:-8px -8px 8px;font-size:11pt;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.rp-kv2,.rp-reads,.rp-res,.rp-chk{width:100%;border-collapse:collapse;font-size:10pt;margin:0 0 8px}
.rp-kv2 th,.rp-kv2 td,.rp-reads th,.rp-reads td,.rp-res th,.rp-res td,.rp-chk th,.rp-chk td{border:1px solid #a9b1bd;padding:4px 6px;text-align:left;vertical-align:middle}
.rp-kv2 th,.rp-res th,.rp-chk th{background:#D9E1F2;font-weight:700;color:#0d1b3d;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.n{text-align:right!important;font-variant-numeric:tabular-nums;white-space:nowrap}
.rp-res td.big{font-size:12pt;font-weight:700}
.rp-cro{margin:4px 0 8px;text-align:center;break-inside:avoid}
.rp-cro svg{width:auto;max-width:100%;max-height:118mm}
.rp-cro figcaption{display:flex;flex-wrap:wrap;justify-content:center;gap:4px 14px;font-size:9pt;color:#444}
.rp-cro figcaption span{display:inline-flex;align-items:center;gap:5px}
.rp-cro i,.rp-reads th i{display:inline-block;width:9px;height:9px;border-radius:50%;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.rp-form{border:1px solid #a9b1bd;padding:6px 9px;margin:0 0 8px;font-family:"Cambria Math",Cambria,Georgia,serif;font-size:10.5pt;break-inside:avoid}
.rp-form > div{margin:3px 0}.rp-form-k{font-family:Calibri,Carlito,Arial,sans-serif;font-weight:700;color:#002060;font-size:10pt}
.rp-form-nm{font-family:Calibri,Carlito,Arial,sans-serif;font-size:9.5pt;color:#444}
.rp-reads{break-inside:avoid}
.rp-reads th{background:color-mix(in srgb,var(--g) 22%,#fff);text-align:center;font-weight:700;font-size:9.5pt;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.rp-reads th i{background:var(--g);margin-right:5px;vertical-align:0}
.rp-reads td.pt{font-weight:700;color:#333;width:7%;text-align:center}
.rp-reads td.low{color:#c00000;font-weight:700}
.rp-reads tr.avg td{background:#f2f4f7;font-weight:700;border-top:2px solid #002060;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.rp-chk td.ok{color:#00843f;font-weight:700;text-align:center}.rp-chk td.bad{color:#c00000;font-weight:700;text-align:center}
.rp-note{font-size:9.5pt;color:#444}
.rp-verdict{display:inline-block;margin:2px 0 8px;padding:5px 14px;font-weight:700;font-size:12pt;border:2px solid #9aa3b0;color:#444}
.rp-verdict.ok{border-color:#00B050;color:#00843f;background:#e6f7ee;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.rp-verdict.warn{border-color:#c98a00;color:#8a5a00;background:#fff4dc;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.rp-verdict.bad{border-color:#c00000;color:#c00000;background:#fdecec;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.rp-sign{margin-top:38px;text-align:center;break-inside:avoid}
.rp-sign p{text-align:center;margin:0 0 2px}
.rp-sigline{width:60%;margin:46px auto 6px;border-top:1px solid #111}
.frac{display:inline-flex;flex-direction:column;vertical-align:middle;text-align:center;margin:2px 0}
.frac>span:first-child{border-bottom:1.3px solid currentColor;padding:0 4px 2px}.frac>span:last-child{padding:2px 4px 0}
@page{size:A4;margin:12mm 12mm 14mm}
@media print{.rp-doc{width:auto;padding:0;margin:0;box-shadow:none}.rp-pb{break-before:page}.rp-ed[contenteditable]{outline:none;background:none}.rp-inst-empty{display:none}tr,.rp-form,.rp-cro,.rp-photo{break-inside:avoid}}
`;
function ensureCSS() { if (!document.getElementById('rp-model-css')) { const s = document.createElement('style'); s.id = 'rp-model-css'; s.textContent = REPORT_CSS; document.head.appendChild(s); } }

// ---------------- captura da cena 3D (vista "Foto") ----------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function captureScene(app) {
  const canvas = document.getElementById('c'); if (!canvas) throw new Error('canvas 3D ausente');
  const S = app.state; const prev = { view: S.view || 'ref1', pts: !!S.showPoints, iso: !!S.showIsolux };
  try {
    if (prev.pts) app.set({ showPoints: false }); if (prev.iso) app.set({ showIsolux: false });
    (window.__stage || {}).setView?.('ref1', { animate: false });
    await sleep(1100);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const w = Math.min(1600, canvas.width), h = Math.round(w * canvas.height / canvas.width);
    const out = document.createElement('canvas'); out.width = w; out.height = h; out.getContext('2d').drawImage(canvas, 0, 0, w, h);
    const url = out.toDataURL('image/jpeg', 0.86);
    const px = out.getContext('2d').getImageData(w >> 1, h >> 1, 1, 1).data; if (px[3] === 0) throw new Error('quadro vazio');
    return url;
  } finally {
    if (prev.pts) app.set({ showPoints: true }); if (prev.iso) app.set({ showIsolux: true });
    (window.__stage || {}).setView?.(prev.view, { animate: false });
  }
}
async function fileToJpeg(file) {
  const url = URL.createObjectURL(file); const img = new Image(); img.src = url; await img.decode(); URL.revokeObjectURL(url);
  const s = Math.min(1, 1600 / img.naturalWidth); const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', 0.86);
}

// ---------------- estúdio (formulário + pré-visualização) ----------------
const F = (k, l, opt = {}) => {
  const id = 'rl-' + k; const t = opt.type || 'text';
  if (t === 'select') return `<div class="rl-f${opt.full ? ' full' : ''}"><label for="${id}">${l}</label><select id="${id}" class="inp" data-k="${k}">${opt.options.map((o) => `<option>${o}</option>`).join('')}</select></div>`;
  if (t === 'area') return `<div class="rl-f full"><label for="${id}">${l}</label><textarea id="${id}" class="inp" rows="${opt.rows || 3}" data-k="${k}"></textarea></div>`;
  return `<div class="rl-f${opt.full ? ' full' : ''}"><label for="${id}">${l}</label><input id="${id}" class="inp" type="${t}" data-k="${k}" autocomplete="off"${opt.ph ? ` placeholder="${opt.ph}"` : ''}${t === 'number' ? ' min="0" max="99"' : ''}></div>`;
};

export function openReportStudio(app, { ctx = () => ({}), toast = () => {} } = {}) {
  ensureCSS();
  const rel = Object.assign({}, DEFAULTS, load(KEY, {})); rel.chk = rel.chk || {}; rel.edits = rel.edits || {};
  let foto = rel.foto === 'upload' ? load(FOTO_KEY, null) : null; let sceneFoto = null;
  const persist = () => { if (!save(KEY, rel)) toast('Não foi possível salvar os dados no navegador.'); };
  const env = app.results().env;
  if (!rel.local && env) rel.local = lower1(env.nome.split(/[,;]/)[0]);

  const ov = document.createElement('div'); ov.id = 'nho-report'; ov.className = 'rl-overlay'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Emitir relatório técnico');
  ov.innerHTML = `
  <div class="rl-bar">
    <div class="rl-t">${icon('doc')}<b>Relatório técnico de iluminância</b><small>modelo da planilha · A4</small></div>
    <div class="rl-tabs" role="tablist"><button type="button" role="tab" data-v="form" aria-selected="true">Dados</button><button type="button" role="tab" data-v="prev" aria-selected="false">Pré-visualização</button></div>
    <div class="rl-a">
      <button type="button" class="btn" data-a="html">${icon('download')}<span>Baixar .html</span></button>
      <button type="button" class="btn btn-primary" data-a="print">${icon('print')}<span>Imprimir / salvar PDF</span></button>
      <button type="button" class="btn icon-only rl-close" data-a="close" aria-label="Fechar">${icon('x')}</button>
    </div>
  </div>
  <div class="rl-main" data-view="form">
    <form class="rl-form" autocomplete="off" onsubmit="return false">
      <fieldset><legend>Cabeçalho</legend>${F('instituicao', 'Instituição / empresa avaliadora (opcional, sem logotipo)', { full: true })}</fieldset>
      <fieldset><legend>Informações da empresa</legend><div class="rl-g">${EMPRESA.map(([k, l, full]) => F(k, l, { full })).join('')}</div></fieldset>
      <fieldset><legend>Local e atividade</legend><div class="rl-g">
        ${F('local', 'Identificação do local', { full: true })}${F('unidade', 'Unidade')}${F('atividade', 'Atividade realizada')}
        ${F('periodo', 'Período de uso do ambiente', { type: 'select', options: ['noturno', 'diurno', 'diurno e noturno'] })}${F('tipoIlum', 'Tipo de iluminação', { type: 'select', options: ['artificial', 'natural e artificial'] })}
        ${F('instalacao', 'Instalação das luminárias', { type: 'select', options: ['sobrepondo o teto', 'embutidas no forro', 'pendentes'] })}
        <div class="rl-f rl-2">${F('portas', 'Portas', { type: 'number' })}${F('janelas', 'Janelas', { type: 'number' })}</div></div></fieldset>
      <fieldset><legend>Equipamento</legend><div class="rl-g">${F('luxModelo', 'Luxímetro (modelo / fabricante)')}${F('certificado', 'Nº do certificado de calibração')}${F('outros', 'Outros equipamentos (um por linha)', { type: 'area' })}</div></fieldset>
      <fieldset><legend>Avaliação preliminar e medições</legend><div class="rl-g">${F('datas', 'Data(s) da avaliação', { ph: 'ex.: 12/11/2026' })}<div class="rl-f rl-2">${F('h1', 'Das', { type: 'time' })}${F('h2', 'Às', { type: 'time' })}</div></div>
        <p class="rl-hint">Marque o que <b>foi observado</b> no ambiente (Anexo 2 da NHO-11):</p>
        <div class="rl-chk">${CHECK.map(([k, l]) => `<label><input type="checkbox" data-chk="${k}"><span>${l.charAt(0).toUpperCase() + l.slice(1)}</span></label>`).join('')}</div></fieldset>
      <fieldset><legend>Foto do ambiente</legend>
        <div class="rl-seg" role="radiogroup" aria-label="Origem da foto">
          <label><input type="radio" name="rl-foto" value="scene"><span>Cena 3D (vista Foto)</span></label><label><input type="radio" name="rl-foto" value="upload"><span>Enviar foto</span></label><label><input type="radio" name="rl-foto" value="none"><span>Sem foto</span></label></div>
        <div class="rl-photo"><img alt="" hidden><div class="rl-ph-a"><button type="button" class="btn sm" data-a="capture">${icon('camera')}<span>Capturar cena agora</span></button>
          <label class="btn sm rl-up">${icon('download')}<span>Escolher arquivo</span><input type="file" accept="image/*" hidden></label></div></div></fieldset>
      <fieldset><legend>Responsável técnico</legend><div class="rl-g">${F('tecnico', 'Nome do técnico em Segurança do Trabalho', { full: true })}${F('mte', 'Registro MTE')}${F('cidade', 'Local (cidade/UF)')}${F('dataAss', 'Data do relatório', { type: 'date' })}</div></fieldset>
      <p class="rl-hint">${icon('info')} Os textos da descrição do ambiente, da avaliação preliminar e do parecer podem ser editados diretamente na pré-visualização (contorno tracejado). Tudo fica salvo neste navegador.</p>
    </form>
    <div class="rl-prev"><div class="rl-sheet"></div></div>
  </div>`;
  document.body.appendChild(ov);
  const $ = (s) => ov.querySelector(s), $$ = (s) => [...ov.querySelectorAll(s)];
  const sheet = $('.rl-sheet'), img = $('.rl-photo img');

  // preencher formulário
  $$('[data-k]').forEach((i) => { i.value = rel[i.dataset.k] ?? ''; i.addEventListener('input', () => { rel[i.dataset.k] = i.type === 'number' ? Math.max(0, Math.min(99, +i.value || 0)) : i.value; persist(); queue(); }); });
  $$('[data-chk]').forEach((c) => { c.checked = !!rel.chk[c.dataset.chk]; c.onchange = () => { rel.chk[c.dataset.chk] = c.checked; persist(); queue(); }; });
  $$('input[name=rl-foto]').forEach((r) => { r.checked = r.value === rel.foto; r.onchange = () => { rel.foto = r.value; persist(); syncFoto(); render(); if (r.value === 'scene' && !sceneFoto) doCapture(); }; });
  $('input[type=file]').onchange = async (e) => { const f = e.target.files?.[0]; if (!f) return; try { foto = await fileToJpeg(f); rel.foto = 'upload'; $$('input[name=rl-foto]').forEach((r) => (r.checked = r.value === 'upload')); if (!save(FOTO_KEY, foto)) toast('Foto grande demais para salvar no navegador (será usada só nesta sessão).'); persist(); syncFoto(); render(); } catch { toast('Não foi possível ler a imagem.'); } };
  function curFoto() { return rel.foto === 'scene' ? sceneFoto : rel.foto === 'upload' ? foto : null; }
  function syncFoto() { const f = curFoto(); img.hidden = !f; if (f) img.src = f; $('[data-a=capture]').hidden = rel.foto !== 'scene'; $('.rl-up').hidden = rel.foto !== 'upload'; }
  async function doCapture() { const b = $('[data-a=capture]'); b.disabled = true; b.querySelector('span').textContent = 'Capturando…';
    try { sceneFoto = await captureScene(app); } catch (e) { console.warn('[ui] captura', e); toast('Não foi possível capturar a cena 3D — envie uma foto.'); }
    b.disabled = false; b.querySelector('span').textContent = 'Capturar cena novamente'; syncFoto(); render(); }

  // pré-visualização
  function render() { const y = $('.rl-prev').scrollTop; sheet.innerHTML = reportHTML(app, rel, ctx(), { edit: true, foto: curFoto() }); $('.rl-prev').scrollTop = y; }
  let t = 0; const queue = () => { clearTimeout(t); t = setTimeout(render, 220); };
  sheet.addEventListener('input', (e) => { const ed = e.target.closest('[data-ed]'); if (!ed) return; const k = ed.dataset.ed;
    const auto = k === 'desc' ? descText(app, rel) : k === 'prelim' ? prelimText(app, rel) : parecerText(app, app.results());
    rel.edits[k] = { sig: sig(auto), text: ed.innerText }; persist(); });

  // barra
  const setV = (v) => { $('.rl-main').dataset.view = v; $$('.rl-tabs [role=tab]').forEach((b) => b.setAttribute('aria-selected', b.dataset.v === v)); };
  $('.rl-tabs').onclick = (e) => { const b = e.target.closest('[data-v]'); if (b) setV(b.dataset.v); };
  const prevFocus = document.activeElement;
  const close = () => { ov.remove(); document.documentElement.classList.remove('nho-print-mode'); document.removeEventListener('keydown', key, true); prevFocus?.focus?.(); };
  const key = (e) => { if (e.key === 'Escape' && !e.target.closest?.('[contenteditable]')) { e.preventDefault(); close(); } };
  document.addEventListener('keydown', key, true);
  ov.addEventListener('click', (e) => { const b = e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a;
    if (a === 'close') close();
    else if (a === 'capture') doCapture();
    else if (a === 'print') { document.documentElement.classList.add('nho-print-mode'); setTimeout(() => window.print(), 50); }
    else if (a === 'html') downloadHTML(); });
  function downloadHTML() {
    const html = reportHTML(app, rel, ctx(), { edit: false, foto: curFoto() });
    const doc = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Relatório técnico — iluminância NHO-11</title><style>body{margin:0;background:#e9ebee}@media print{body{background:#fff}}${REPORT_CSS}@media screen{.rp-doc{margin:24px auto;box-shadow:0 10px 40px rgba(0,0,0,.18)}}</style></head><body>${html}</body></html>`;
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([doc], { type: 'text/html' })); a.download = `relatorio-iluminancia-nho11${rel.local ? '-' + rel.local.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : ''}.html`;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); toast('Relatório baixado em .html (autocontido).');
  }
  syncFoto(); render();
  if (rel.foto === 'scene') doCapture();
  $('[data-a=print]').focus();
  return { close, render, el: ov, rel };
}

// UI — seletor pesquisável do Quadro 1 (combobox acessível, agrupado). Dono: UI.
import { esc, fmt } from './ui_text.js';
import { icon } from './ui_icons.js';

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function createEnvPicker(host, list, { value, onSelect }) {
  const uid = 'env' + Math.random().toString(36).slice(2, 7);
  host.innerHTML = `
    <div class="cbx">
      <div class="cbx-field">
        ${icon('search', 'cbx-ico')}
        <input id="${uid}-in" class="cbx-in" type="text" role="combobox" aria-expanded="false" aria-autocomplete="list"
          aria-controls="${uid}-lb" autocomplete="off" spellcheck="false" placeholder="Buscar no Quadro 1 (ex.: sala de aula, solda, escritório)">
        <button type="button" class="cbx-btn" tabindex="-1" aria-label="Mostrar lista">${icon('chevD')}</button>
      </div>
      <div id="${uid}-lb" class="cbx-list" role="listbox" aria-label="Quadro 1 — tipos de ambiente, tarefa ou atividade" hidden></div>
    </div>`;
  const input = host.querySelector('.cbx-in'), lb = host.querySelector('.cbx-list'), btn = host.querySelector('.cbx-btn');
  let items = [], active = -1, current = value, open = false;
  const byId = (id) => list.find((e) => e.id === id);
  const label = (e) => (e ? e.nome : '');
  input.value = label(byId(current));

  function render(q) {
    const nq = norm(q).trim(); const terms = nq.split(/\s+/).filter(Boolean);
    const sel = byId(current); const showAll = !nq || (sel && q === label(sel));
    const match = list.filter((e) => showAll || terms.every((t) => norm(e.nome + ' ' + e.grupo + ' ' + (e.obs || '')).includes(t)));
    items = match; const groups = new Map();
    match.forEach((e, i) => { const g = e.grupo || 'Outros'; if (!groups.has(g)) groups.set(g, []); groups.get(g).push([e, i]); });
    if (!match.length) { lb.innerHTML = `<div class="cbx-empty">Nenhuma atividade encontrada. Associe a uma tarefa similar do Quadro 1 (item 5).</div>`; active = -1; return; }
    let h = '', gi = 0;
    for (const [g, arr] of groups) {
      h += `<div role="group" aria-labelledby="${uid}-g${gi}"><div class="cbx-group" id="${uid}-g${gi}">${esc(g)}</div>`;
      for (const [e, i] of arr) {
        h += `<div class="cbx-opt${e.id === current ? ' sel' : ''}" role="option" id="${uid}-o${i}" data-i="${i}" aria-selected="${e.id === current}">
          <span class="cbx-name">${hl(e.nome, terms)}</span><span class="cbx-e"><b>${isFinite(+e.E) ? fmt(+e.E, 0) : esc(e.E)}</b> lux</span></div>`;
      }
      h += '</div>'; gi++;
    }
    lb.innerHTML = h;
    active = Math.max(0, match.findIndex((e) => e.id === current)); if (nq && !showAll) active = 0;
    paint();
  }
  function hl(s, terms) {
    let out = esc(s); if (!terms.length) return out;
    const ns = norm(s); const marks = new Array(s.length).fill(false);
    for (const t of terms) { let k = ns.indexOf(t); while (k >= 0) { for (let j = k; j < k + t.length; j++) marks[j] = true; k = ns.indexOf(t, k + 1); } }
    out = ''; let on = false;
    for (let j = 0; j < s.length; j++) { if (marks[j] !== on) { out += marks[j] ? '<mark>' : '</mark>'; on = marks[j]; } out += esc(s[j]); }
    return on ? out + '</mark>' : out;
  }
  function paint() {
    lb.querySelectorAll('.cbx-opt').forEach((o) => o.classList.toggle('act', +o.dataset.i === active));
    const a = lb.querySelector(`[data-i="${active}"]`);
    if (a) { input.setAttribute('aria-activedescendant', a.id); a.scrollIntoView({ block: 'nearest' }); } else input.removeAttribute('aria-activedescendant');
  }
  function show(b) { open = b; lb.hidden = !b; input.setAttribute('aria-expanded', b); host.classList.toggle('open', b); if (b) render(input.value); }
  function choose(i) { const e = items[i]; if (!e) return; current = e.id; input.value = label(e); show(false); onSelect(e); }
  input.addEventListener('focus', () => { input.select(); });
  input.addEventListener('click', () => show(true));
  input.addEventListener('input', () => { if (!open) show(true); else render(input.value); });
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); if (!open) return show(true);
      active = Math.max(0, Math.min(items.length - 1, active + (ev.key === 'ArrowDown' ? 1 : -1))); paint(); }
    else if (ev.key === 'Enter') { if (open && active >= 0) { ev.preventDefault(); choose(active); } }
    else if (ev.key === 'Escape') { if (open) { ev.preventDefault(); ev.stopPropagation(); show(false); input.value = label(byId(current)); } }
    else if (ev.key === 'Tab') { show(false); input.value = label(byId(current)); }
  });
  lb.addEventListener('mousedown', (ev) => ev.preventDefault());
  lb.addEventListener('click', (ev) => { const o = ev.target.closest('.cbx-opt'); if (o) choose(+o.dataset.i); });
  btn.addEventListener('mousedown', (ev) => ev.preventDefault());
  btn.addEventListener('click', () => { input.focus(); show(!open); });
  input.addEventListener('blur', () => setTimeout(() => { if (open) { show(false); input.value = label(byId(current)); } }, 120));
  return { set(id) { current = id; input.value = label(byId(id)); }, setList(l) { list = l; } };
}

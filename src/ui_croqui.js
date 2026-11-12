// UI — croqui 2D (planta) em SVG, ao vivo, no estilo do croqui da planilha e das figuras do Anexo 1. Dono: UI.
import { GROUP_COLORS, fmt, esc } from './ui_text.js';

const PAL = {
  light: { paper: '#ffffff', wall: '#1d2128', wallFill: '#e9ecf1', line: '#1d2128', dash: '#7d8696', lum: '#ffffff', lumStroke: '#1d2128', lumGlow: 'rgba(255,196,58,.22)', text: '#1d2128', sub: '#5c6575', win: '#1d2128', lumin: 'rgba(255,214,120,.25)' },
  dark: { paper: '#15181d', wall: '#c9d0db', wallFill: '#2a2f38', line: '#c9d0db', dash: '#7b8597', lum: '#20252d', lumStroke: '#d7dde7', lumGlow: 'rgba(255,196,58,.22)', text: '#e6eaf0', sub: '#97a1b2', win: '#c9d0db', lumin: 'rgba(255,214,120,.16)' },
};

/**
 * opts: {dark, mini, rotate, labels=true, values=true, dims=true, openings=true, construct=true, interactive, room, config, N, M, lums, points, values, bands, idPrefix}
 */
export function croquiSVG(o) {
  const c = PAL[o.dark ? 'dark' : 'light'];
  const { L, W } = o.room; const mini = !!o.mini; const rot = !!o.rotate;
  const S = 100; // px por metro (viewBox)
  const mL = mini ? 8 : (o.dims !== false ? 92 : 30), mT = mini ? 8 : (o.dims !== false ? 78 : 30), mR = mini ? 8 : (o.openings !== false ? 112 : 46), mB = mini ? 8 : 44;
  const RW = (rot ? L : W) * S, RH = (rot ? W : L) * S;
  const VW = RW + mL + mR, VH = RH + mT + mB;
  // (x,z) metros → (u,v) px
  const map = (x, z) => rot ? [mL + (z + L / 2) * S, mT + (W / 2 - x) * S] : [mL + (x + W / 2) * S, mT + (z + L / 2) * S];
  const rectXZ = (x0, z0, x1, z1) => { const [a, b] = map(x0, z0), [d, e] = map(x1, z1); return { x: Math.min(a, d), y: Math.min(b, e), w: Math.abs(d - a), h: Math.abs(e - b) }; };
  const out = [];
  const sw = mini ? 6 : 2.2; // espessura de traço
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VW.toFixed(0)} ${VH.toFixed(0)}" class="croqui${mini ? ' mini' : ''}" role="img" aria-label="${mini ? 'Esquema da configuração' : `Croqui da sala ${fmt(L, 2)} × ${fmt(W, 2)} m com luminárias e pontos de medição`}" font-family="Inter, -apple-system, 'Segoe UI', Roboto, sans-serif">`);
  if (!mini) out.push(`<rect x="0" y="0" width="${VW}" height="${VH}" fill="${c.paper}"/>`);
  // parede (espessura 0,12 m)
  const t = 0.12 * S; const R0 = rectXZ(-W / 2, -L / 2, W / 2, L / 2);
  if (mini) out.push(`<rect x="${R0.x}" y="${R0.y}" width="${R0.w}" height="${R0.h}" rx="10" fill="currentColor" fill-opacity=".06" stroke="currentColor" stroke-opacity=".55" stroke-width="${sw}"/>`);
  else {
    out.push(`<rect x="${R0.x - t}" y="${R0.y - t}" width="${R0.w + 2 * t}" height="${R0.h + 2 * t}" fill="${c.wallFill}" stroke="${c.wall}" stroke-width="1.6"/>`);
    out.push(`<rect x="${R0.x}" y="${R0.y}" width="${R0.w}" height="${R0.h}" fill="${c.paper}" stroke="${c.wall}" stroke-width="1.6"/>`);
  }
  const cfgLayout = o.layout;
  if (cfgLayout === 'luminous') {
    const r = mini ? R0 : rectXZ(-W / 2 + 0.05, -L / 2 + 0.05, W / 2 - 0.05, L / 2 - 0.05);
    out.push(`<defs><pattern id="${o.idPrefix || 'c'}hatch" width="${mini ? 26 : 14}" height="${mini ? 26 : 14}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="${mini ? 26 : 14}" stroke="${mini ? 'currentColor' : '#e0a92a'}" stroke-opacity="${mini ? .35 : .45}" stroke-width="${mini ? 5 : 1.5}"/></pattern></defs>`);
    out.push(`<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="url(#${o.idPrefix || 'c'}hatch)"/>`);
  }
  // aberturas (janelas / porta) — como no croqui da planilha
  if (!mini && o.openings !== false) {
    const win = (side, f, len = 0.95) => {
      const z = -L / 2 + f * L; const x = side < 0 ? -W / 2 : W / 2;
      const r = rectXZ(x - (side < 0 ? t / S : 0), z - len / 2, x + (side > 0 ? t / S : 0), z + len / 2);
      out.push(`<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${c.paper}" stroke="${c.win}" stroke-width="1.3"/>`);
      for (const k of [1 / 3, 2 / 3]) { if (rot) out.push(`<line x1="${r.x}" y1="${r.y + r.h * k}" x2="${r.x + r.w}" y2="${r.y + r.h * k}" stroke="${c.win}" stroke-width="1"/>`); else out.push(`<line x1="${r.x + r.w * k}" y1="${r.y}" x2="${r.x + r.w * k}" y2="${r.y + r.h}" stroke="${c.win}" stroke-width="1"/>`); }
    };
    [0.14, 0.39, 0.64, 0.89].forEach((f) => win(-1, f));
    [0.16, 0.40, 0.645].forEach((f) => win(1, f)); win(1, 0.93, 0.62);
    // porta (folha 0,90 m abrindo para fora, como no croqui)
    const dz0 = -L / 2 + 0.765 * L, dz1 = dz0 + 0.9, x = W / 2;
    const g = rectXZ(x, dz0, x + t / S, dz1);
    out.push(`<rect x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" fill="${c.paper}" stroke="none"/>`);
    const [hx, hy] = map(x + t / S, dz0), [ex, ey] = map(x + t / S + 0.9, dz0), [ax, ay] = map(x + t / S, dz1);
    out.push(`<line x1="${hx}" y1="${hy}" x2="${ex}" y2="${ey}" stroke="${c.win}" stroke-width="1.8"/>`);
    out.push(`<path d="M${ex} ${ey} A ${0.9 * S} ${0.9 * S} 0 0 ${rot ? 0 : 1} ${ax} ${ay}" fill="none" stroke="${c.win}" stroke-width="1" stroke-dasharray="${rot ? '0' : '0'}"/>`);
  }
  // linhas de construção (tracejados das figuras da NHO / croqui)
  const lums = o.lums || [], pts = o.points || [];
  const uniq = (a) => [...new Set(a.map((v) => +v.toFixed(3)))].sort((p, q) => p - q);
  let xl = uniq(lums.map((l) => l.x)), zl;
  if (lums.some((l) => l.axis === 'z')) { const zs = lums.map((l) => [l.z - l.len / 2, l.z + l.len / 2]).flat(); zl = uniq([Math.min(...zs), Math.max(...zs)]); }
  else zl = uniq(lums.map((l) => l.z));
  if (!mini && o.construct !== false && lums.length > 1) {
    const dashA = `stroke="${c.dash}" stroke-width="1.1" stroke-dasharray="7 5" fill="none"`;
    for (const x of xl) { const [a, b] = map(x, -L / 2), [d, e] = map(x, L / 2); out.push(`<line x1="${a}" y1="${b}" x2="${d}" y2="${e}" ${dashA}/>`); }
    for (const z of zl) { const [a, b] = map(-W / 2, z), [d, e] = map(W / 2, z); out.push(`<line x1="${a}" y1="${b}" x2="${d}" y2="${e}" ${dashA}/>`); }
    const XL = uniq([-W / 2, ...xl, W / 2]), ZL = uniq([-L / 2, ...zl, L / 2]);
    const span = (v, arr) => { const on = arr.findIndex((a) => Math.abs(a - v) < 0.015); if (on >= 0) return null; // só o X limpo de cada célula (como no croqui da planilha)
      const i = arr.findIndex((a) => a > v); if (i <= 0) return null; const a0 = arr[i - 1], a1 = arr[i]; return Math.abs((a0 + a1) / 2 - v) < 0.02 ? [a0, a1] : null; };
    const seen = new Set();
    for (const p of pts) {
      const sx = span(p.x, XL), sz = span(p.z, ZL); if (!sx || !sz) continue;
      const key = sx.concat(sz).map((v) => v.toFixed(2)).join(); if (seen.has(key)) continue; seen.add(key);
      const [a, b] = map(sx[0], sz[0]), [d, e] = map(sx[1], sz[1]), [f, g] = map(sx[0], sz[1]), [h, k] = map(sx[1], sz[0]);
      out.push(`<path d="M${a} ${b}L${d} ${e}M${f} ${g}L${h} ${k}" stroke="${c.dash}" stroke-opacity=".75" stroke-width="1" stroke-dasharray="6 5" fill="none"/>`);
    }
  }
  // luminárias
  const obst = [];
  for (const l of lums) {
    const vis = mini ? Math.max(l.wid, 0.32) : Math.max(l.wid, 0.2);
    const r = l.axis === 'x' ? rectXZ(l.x - l.len / 2, l.z - vis / 2, l.x + l.len / 2, l.z + vis / 2) : rectXZ(l.x - vis / 2, l.z - l.len / 2, l.x + vis / 2, l.z + l.len / 2);
    if (mini) out.push(`<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="5" fill="currentColor" fill-opacity=".85"/>`);
    else {
      obst.push({ x: r.x - 4, y: r.y - 4, w: r.w + 8, h: r.h + 8 });
      out.push(`<rect x="${r.x - 5}" y="${r.y - 5}" width="${r.w + 10}" height="${r.h + 10}" rx="8" fill="${o.on === false ? 'none' : c.lumGlow}"/>`);
      out.push(`<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${c.lum}" stroke="${c.lumStroke}" stroke-width="1.4"/>`);
      const [cx, cy] = map(l.x, l.z);
      if (l.axis === 'x' && !rot || l.axis === 'z' && rot) out.push(`<line x1="${cx - 5}" y1="${r.y}" x2="${cx - 5}" y2="${r.y + r.h}" stroke="${c.lumStroke}" stroke-width="1"/><line x1="${cx + 5}" y1="${r.y}" x2="${cx + 5}" y2="${r.y + r.h}" stroke="${c.lumStroke}" stroke-width="1"/>`);
      else out.push(`<line x1="${r.x}" y1="${cy - 5}" x2="${r.x + r.w}" y2="${cy - 5}" stroke="${c.lumStroke}" stroke-width="1"/><line x1="${r.x}" y1="${cy + 5}" x2="${r.x + r.w}" y2="${cy + 5}" stroke="${c.lumStroke}" stroke-width="1"/>`);
    }
  }
  // pontos
  const vals = o.values || {}; const lim = o.bands?.lim70;
  if (!mini) for (const p of pts) { const [u, v] = map(p.x, p.z); obst.push({ x: u - 10, y: v - 10, w: 20, h: 20 }); }
  for (const p of pts) {
    const [u, v] = map(p.x, p.z); const col = GROUP_COLORS[p.group] || '#888';
    if (mini) { out.push(`<circle cx="${u}" cy="${v}" r="17" fill="${col}" stroke="${o.dark ? '#111' : '#fff'}" stroke-width="5"/>`); continue; }
    const val = vals[p.id]; const has = val != null && val !== '' && isFinite(+val);
    const low = has && lim != null && +val < lim;
    out.push(`<g class="cq-pt" data-id="${p.id}"${o.interactive ? ` tabindex="-1" style="cursor:pointer"` : ''}>`);
    if (o.interactive) out.push(`<circle cx="${u}" cy="${v}" r="26" fill="transparent"/>`);
    if (o.active === p.id) out.push(`<circle cx="${u}" cy="${v}" r="19" fill="none" stroke="${col}" stroke-width="3.5" opacity=".9"/>`);
    out.push(`<circle cx="${u}" cy="${v}" r="9" fill="${col}" stroke="${c.paper}" stroke-width="3"/>`);
    if (o.labels !== false) {
      const tw = Math.max(p.label.length * 16, has && o.values !== false ? fmt(+val, 1).length * 11.5 : 0) + 4, th = has && o.values !== false ? 50 : 28;
      const prefRight = rot ? (v > mT + RH * 0.15) : (u < mL + RW - 70);
      const cands = []; for (const by of [v - 5, v - 32, v + 26]) for (const r of prefRight ? [true, false] : [false, true]) cands.push([r, by]);
      const box = (r, by) => ({ x: r ? u + 13 : u - 13 - tw, y: by - 21, w: tw, h: th });
      const hit = (a) => obst.some((b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) || a.x < mL - 2 || a.x + a.w > mL + RW + 2 || a.y < mT - 2 || a.y + a.h > mT + RH + 2;
      const [right, by] = cands.find(([r, y]) => !hit(box(r, y))) || cands[0]; obst.push(box(right, by));
      const lx = right ? u + 13 : u - 13, anchor = right ? 'start' : 'end';
      out.push(`<text x="${lx}" y="${by}" text-anchor="${anchor}" font-size="25" font-weight="700" fill="${c.text}" paint-order="stroke" stroke="${c.paper}" stroke-width="4" stroke-linejoin="round">${p.label}</text>`);
      if (o.values !== false && has) out.push(`<text x="${lx}" y="${by + 24}" text-anchor="${anchor}" font-size="20" font-weight="600" fill="${low ? '#d6342c' : c.sub}" paint-order="stroke" stroke="${c.paper}" stroke-width="4" stroke-linejoin="round" style="font-variant-numeric:tabular-nums">${fmt(+val, 1)}</text>`);
    }
    out.push('</g>');
  }
  // cotas
  if (!mini && o.dims !== false) {
    const dim = (x0, y0, x1, y1, txt, vertical) => {
      const tk = 9; const d = [];
      d.push(`<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="${c.line}" stroke-width="1.2"/>`);
      if (vertical) { d.push(`<line x1="${x0 - tk}" y1="${y0}" x2="${x0 + tk}" y2="${y0}" stroke="${c.line}" stroke-width="1.2"/><line x1="${x1 - tk}" y1="${y1}" x2="${x1 + tk}" y2="${y1}" stroke="${c.line}" stroke-width="1.2"/>`);
        d.push(`<path d="M${x0} ${y0}l-5 12h10zM${x1} ${y1}l-5 -12h10z" fill="${c.line}"/>`);
        d.push(`<text x="${x0 - 14}" y="${(y0 + y1) / 2}" font-size="26" font-weight="500" fill="${c.text}" text-anchor="middle" transform="rotate(-90 ${x0 - 14} ${(y0 + y1) / 2})" letter-spacing="1">${txt}</text>`); }
      else { d.push(`<line x1="${x0}" y1="${y0 - tk}" x2="${x0}" y2="${y0 + tk}" stroke="${c.line}" stroke-width="1.2"/><line x1="${x1}" y1="${y1 - tk}" x2="${x1}" y2="${y1 + tk}" stroke="${c.line}" stroke-width="1.2"/>`);
        d.push(`<path d="M${x0} ${y0}l12 -5v10zM${x1} ${y1}l-12 -5v10z" fill="${c.line}"/>`);
        d.push(`<text x="${(x0 + x1) / 2}" y="${y0 - 12}" font-size="26" font-weight="500" fill="${c.text}" text-anchor="middle" letter-spacing="1">${txt}</text>`); }
      return d.join('');
    };
    const hor = rot ? L : W, ver = rot ? W : L;
    out.push(dim(mL, mT - t - 30, mL + RW, mT - t - 30, fmt(hor, 2), false));
    out.push(dim(mL - t - 38, mT, mL - t - 38, mT + RH, fmt(ver, 2), true));
    out.push(`<text x="${mL + RW / 2}" y="${mT + RH + t + 26}" font-size="15" fill="${c.sub}" text-anchor="middle">medidas internas em metros · área ${fmt(W * L, 2)} m²</text>`);
  }
  out.push('</svg>');
  return out.join('');
}

/** Constrói o SVG do croqui a partir do estado atual do app. */
export function croquiFromApp(app, extra = {}) {
  const S = app.state; const cfg = app.NORM.configById(S.config);
  let bands = null; try { bands = app.results().bands; } catch {}
  return croquiSVG({ room: S.room, layout: cfg.layout, lums: app.luminaires(), points: app.points(), values: S.values, bands, on: S.lum?.on, ...extra });
}

/** Mini-desenho de cada figura do Anexo 1 (usa a mesma geometria normativa de norm.js). */
export function miniFigure(NORM, cfgId, idPrefix) {
  const room = { L: 9.16, W: 5.9, H: 2.7 }; const cfg = NORM.configById(cfgId);
  const arr = { 1: [4, 2], 2: [1, 1], 3: [4, 1], 4: [4, 2], 5: [4, 1], 6: [1, 1] }[cfgId] || [4, 2];
  const a = { N: arr[0], M: arr[1], config: cfgId };
  return croquiSVG({ room, layout: cfg.layout, lums: NORM.layoutLuminaires(room, a), points: NORM.measurementPoints(room, a), mini: true, rotate: true, idPrefix: idPrefix || 'm' + cfgId });
}
export { esc };

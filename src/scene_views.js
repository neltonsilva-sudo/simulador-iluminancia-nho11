// RENDER — vistas de câmera. Dono: RENDER.
// Cada vista devolve {pos, target, fov, squash, inside, rotate, cut}.
//  - ref1: enquadramento da foto refs/ref1_sala.png. A foto é um 4:3 de celular (26 mm eq., ~67°×53°) reamostrado
//    para 906×358 (as placas de parede de ~1 m aparecem 1,85× mais largas que altas). Quando o canvas tem proporção de
//    foto (≥ 2,2:1) reproduzimos esse "anamórfico" (squash) para casar linhas de fuga e proporções; em telas normais
//    a mesma câmera é mostrada sem distorção.
//  - overview: casa de bonecas (teto cortado), alto, 3/4.  - top: planta quase ortográfica (tele 18°), orientação do croqui.
//  - ceiling: de baixo, vendo o teto inteiro e as marcações.  - point:<id>: ponto no plano + marca no teto.
//  - orbit: "ang,h,r,tx,ty,tz,fov".
import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const D2R = Math.PI / 180;

export const REF1 = { // calibrado contra a foto (ver shots/render_log.md)
  back: 8.65,      // distância da câmera à parede do fundo (z = −L/2)
  x: -1.9,         // deslocamento lateral: a foto foi feita do lado ESQUERDO (x<0), sob a fila esquerda
  h: 1.6,          // altura da lente
  yaw: 22,        // graus para a direita (+x)
  pitch: 5.0,      // graus para cima
  vfov: 47,        // FOV vertical da foto (antes da reamostragem)
  squash: 1.8,    // reamostragem horizontal da foto
};

try { // ajuste fino por URL (captura de calibração): r1=back,x,h,yaw,pitch,vfov,squash
  const q = new URLSearchParams(location.search).get('r1');
  if (q) q.split(',').map(Number).forEach((v, i) => { if (Number.isFinite(v)) REF1[['back', 'x', 'h', 'yaw', 'pitch', 'vfov', 'squash'][i]] = v; });
} catch {}

export function photoSquash(aspect) { return aspect >= 2.2 ? Math.min(REF1.squash, aspect / 1.36) : 1; }

export function viewSpec(name, o, room, aspect) {
  const { L, W, H } = room; const plane = room.plane ?? 0.75;
  name = name || 'ref1';
  if (name === 'ref1') {
    const z = -L / 2 + Math.min(REF1.back, L - 0.4);
    const pos = V(Math.max(-W / 2 + 0.3, Math.min(W / 2 - 0.3, REF1.x)), Math.min(REF1.h, H - 0.3), Math.min(L / 2 - 0.3, z));
    const yaw = REF1.yaw * D2R, pitch = REF1.pitch * D2R;
    const dir = V(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    return { pos, target: pos.clone().addScaledVector(dir, 4), fov: REF1.vfov, squash: photoSquash(aspect), inside: true, rotate: true };
  }
  if (name === 'overview') {
    const r = Math.max(L, W);
    const pos = V(W * 0.62 + 1.2, H + r * 0.62, L * 0.5 + r * 0.42);
    return { pos, target: V(0, 0.2, -L * 0.04), fov: 40, squash: 1, inside: false, rotate: true, cut: true };
  }
  if (name === 'top') {
    const fov = 18, t = Math.tan((fov / 2) * D2R);
    const needV = (L + 0.9) / 2 / t, needH = (W + 0.9) / 2 / (t * Math.max(0.3, aspect));
    const d = Math.max(needV, needH);
    return { pos: V(0, plane + d, 0.0005), target: V(0, plane, 0), fov, squash: 1, inside: false, rotate: false, cut: true, top: true };
  }
  if (name === 'ceiling') {
    const pos = V(0, 0.55, L / 2 - 0.25);
    return { pos, target: V(0, H, -L * 0.18), fov: 74, squash: 1, inside: true, rotate: true };
  }
  if (name.startsWith('point:')) {
    const id = name.slice(6);
    let p = o.target;
    if (!p) { try { p = window.__sim?.points?.().find((q) => q.id === id); } catch { p = null; } }
    if (!p) return viewSpec('overview', o, room, aspect);
    // câmera do lado de dentro, olhando do centro da sala para o ponto, girada 35° para dar profundidade
    let dx = -p.x, dz = -p.z; const len = Math.hypot(dx, dz);
    if (len < 0.3) { dx = 0.35; dz = 1; } const n = Math.hypot(dx, dz); dx /= n; dz /= n;
    const a = 35 * D2R * (p.x * p.z >= 0 ? 1 : -1);
    const rx = dx * Math.cos(a) - dz * Math.sin(a), rz = dx * Math.sin(a) + dz * Math.cos(a);
    let dist = 2.5;
    const m = 0.28;
    const lim = (v, half) => Math.max(-half + m, Math.min(half - m, v));
    let cx = lim(p.x + rx * dist, W / 2), cz = lim(p.z + rz * dist, L / 2);
    dist = Math.max(0.9, Math.hypot(cx - p.x, cz - p.z));
    const ty = (plane + H) / 2 - 0.05;
    const span = H - plane + 0.55;
    const fov = Math.min(88, Math.max(42, 2 * Math.atan(span / 2 / dist) / D2R + 6));
    return { pos: V(cx, ty + 0.12, cz), target: V(p.x, ty, p.z), fov, squash: 1, inside: true, rotate: true, focus: p };
  }
  if (name === 'orbit') {
    const s = (o.orbit || '').split(',').map(Number);
    const [ang = 0.6, h = H * 1.9, r = Math.max(L, W) * 0.9, tx = 0, ty = 0.6, tz = 0, fov = 50] = s.map((v) => (Number.isFinite(v) ? v : undefined));
    const pos = V(tx + r * Math.sin(ang), h, tz + r * Math.cos(ang));
    const inside = Math.abs(pos.x) < W / 2 && Math.abs(pos.z) < L / 2 && pos.y < H;
    return { pos, target: V(tx, ty, tz), fov, squash: 1, inside, rotate: true, cut: !inside };
  }
  return viewSpec('overview', o, room, aspect);
}

export const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

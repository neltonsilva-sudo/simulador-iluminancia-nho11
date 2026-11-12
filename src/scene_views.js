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
    // 3/4 que mostra a marca no teto, o prumo e o luxímetro (tripé, fotocélula a 0,75 m) com o visor legível.
    // Candidatos em volta do ponto (a cada 20°), a ~1,7 m, dentro da sala; escolhe o de menor oclusão (raycast contra a
    // cena: cadeiras/paredes entre a câmera e o luxímetro/teto) e com preferência por olhar a partir do centro da sala.
    const m = 0.3, camY = Math.min(H - 0.45, 1.95);
    const toC = Math.atan2(-p.x, -p.z);
    let best = null;
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * Math.PI * 2;
      for (const dist of [1.5, 1.3, 1.1]) {
        const cx = p.x + Math.sin(a) * dist, cz = p.z + Math.cos(a) * dist;
        if (Math.abs(cx) > W / 2 - m || Math.abs(cz) > L / 2 - m) continue;
        let da = Math.abs(Math.atan2(Math.sin(a - toC), Math.cos(a - toC)));
        let score = Math.abs(da - 0.6) * 0.6 + (1.5 - dist) * 1.0;
        if (o.occluded) score += o.occluded(V(cx, camY, cz), [V(p.x, plane + 0.03, p.z), V(p.x, plane - 0.08, p.z), V(p.x + 0.06, plane - 0.02, p.z), V(p.x, H - 0.02, p.z)]) * 4;
        if (!best || score < best.score) best = { score, cx, cz, dist };
        if (!o.occluded || score < 1.2) break;
      }
    }
    if (!best) best = { cx: Math.max(-W / 2 + m, Math.min(W / 2 - m, p.x + 0.8)), cz: Math.max(-L / 2 + m, Math.min(L / 2 - m, p.z + 0.8)), dist: 1.1 };
    const dist = Math.max(0.8, Math.hypot(best.cx - p.x, best.cz - p.z));
    // eixo óptico na bissetriz entre a marca do teto e o pé do tripé: frustum justo (FOV menor → visor maior)
    const aUp = Math.atan2(H + 0.07 - camY, dist), aDn = Math.atan2(plane - 0.3 - camY, dist);
    const mid = (aUp + aDn) / 2, ty = camY + dist * Math.tan(mid);
    const fov = Math.min(84, Math.max(46, ((aUp - aDn) / D2R) * 1.04 + 3));
    return { pos: V(best.cx, camY, best.cz), target: V(p.x, ty, p.z), fov, squash: 1, inside: true, rotate: true, focus: p };
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

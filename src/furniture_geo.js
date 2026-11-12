// MOBILIÁRIO — geometria procedural (cadeira universitária, mesa e cadeira do professor). Dono: MOBILIÁRIO.
// Unidades em metros. Sistema local da cadeira: origem no piso sob o centro do assento, usuário olhando para −Z
// (a frente da sala), encosto em +Z, prancheta à direita do usuário (+X).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const V3 = THREE.Vector3;

// ---------------------------------------------------------------- polígono convexo com cantos arredondados
// pts: [[a,b],...] (convexo); radii: raio por vértice; seg: segmentos por arco; step: densidade nas arestas retas.
export function roundedPolygon(pts, radii, seg = 8, step = 0.025) {
  const n = pts.length, corners = [];
  for (let i = 0; i < n; i++) {
    const P = pts[i], A = pts[(i + n - 1) % n], B = pts[(i + 1) % n], r = radii[i] || 0;
    if (r <= 0) { corners.push({ t1: P, t2: P, arc: [P] }); continue; }
    const u1 = norm2([A[0] - P[0], A[1] - P[1]]), u2 = norm2([B[0] - P[0], B[1] - P[1]]);
    const th = Math.acos(Math.max(-1, Math.min(1, u1[0] * u2[0] + u1[1] * u2[1])));
    const t = r / Math.tan(th / 2), bis = norm2([u1[0] + u2[0], u1[1] + u2[1]]), dc = r / Math.sin(th / 2);
    const C = [P[0] + bis[0] * dc, P[1] + bis[1] * dc];
    const T1 = [P[0] + u1[0] * t, P[1] + u1[1] * t], T2 = [P[0] + u2[0] * t, P[1] + u2[1] * t];
    let a1 = Math.atan2(T1[1] - C[1], T1[0] - C[0]), a2 = Math.atan2(T2[1] - C[1], T2[0] - C[0]);
    let da = a2 - a1; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    const arc = []; for (let k = 0; k <= seg; k++) { const a = a1 + da * k / seg; arc.push([C[0] + r * Math.cos(a), C[1] + r * Math.sin(a)]); }
    corners.push({ t1: T1, t2: T2, arc });
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const c = corners[i], nx = corners[(i + 1) % n];
    for (const p of c.arc) out.push(p);
    const A = c.t2, B = nx.t1, len = Math.hypot(B[0] - A[0], B[1] - A[1]), k = Math.floor(len / step);
    for (let j = 1; j < k; j++) out.push([A[0] + (B[0] - A[0]) * j / k, A[1] + (B[1] - A[1]) * j / k]);
  }
  // remove duplicados consecutivos
  return out.filter((p, i) => { const q = out[(i + out.length - 1) % out.length]; return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-5; });
}
function norm2(v) { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; }

// ---------------------------------------------------------------- casca "loft": contorno × perfil
// profile: [{s, d, h}] — s escala ao centro (0 = vértice central), d recuo para dentro a partir do contorno, h deslocamento
// ao longo da normal da casca. surf(a,b) dá a forma (altura) e toWorld(a,b,h) devolve [x,y,z].
export function loftShell({ outline, profile, surf, toWorld, up, box }) {
  const N = outline.length;
  let area = 0, cx = 0, cy = 0;
  for (let i = 0; i < N; i++) { const p = outline[i], q = outline[(i + 1) % N]; area += p[0] * q[1] - q[0] * p[1]; cx += p[0]; cy += p[1]; }
  cx /= N; cy /= N; const ccw = area > 0;
  const nrm = outline.map((p, i) => { const a = outline[(i + N - 1) % N], b = outline[(i + 1) % N]; const t = norm2([b[0] - a[0], b[1] - a[1]]); return ccw ? [-t[1], t[0]] : [t[1], -t[0]]; });
  let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
  for (const p of outline) { minA = Math.min(minA, p[0]); maxA = Math.max(maxA, p[0]); minB = Math.min(minB, p[1]); maxB = Math.max(maxB, p[1]); }
  if (box) ({ minA, maxA, minB, maxB } = box);
  const pos = [], uv = [], idx = [], rows = [];
  const vert = (a, b, h) => { const w = toWorld(a, b, surf(a, b) + h); pos.push(w[0], w[1], w[2]); uv.push((a - minA) / (maxA - minA), (b - minB) / (maxB - minB)); return pos.length / 3 - 1; };
  for (const pr of profile) {
    if (pr.s === 0) { rows.push({ c: vert(cx, cy, pr.h) }); continue; }
    const ring = [];
    for (let i = 0; i < N; i++) { const p = outline[i], n = nrm[i]; const qa = cx + (p[0] + n[0] * pr.d - cx) * pr.s, qb = cy + (p[1] + n[1] * pr.d - cy) * pr.s; ring.push(vert(qa, qb, pr.h)); }
    rows.push({ ring });
  }
  for (let k = 0; k < rows.length - 1; k++) {
    const A = rows[k], B = rows[k + 1];
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      if (A.c !== undefined && B.ring) idx.push(A.c, B.ring[i], B.ring[j]);
      else if (A.ring && B.c !== undefined) idx.push(A.ring[i], B.c, A.ring[j]);
      else if (A.ring && B.ring) idx.push(A.ring[i], B.ring[i], B.ring[j], A.ring[i], B.ring[j], A.ring[j]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  // orientação: a normal do primeiro vértice deve concordar com `up`
  const n0 = new V3().fromBufferAttribute(g.attributes.normal, 0);
  if (n0.dot(up) < 0) { for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; } g.setIndex(idx); g.computeVertexNormals(); }
  return g;
}

// ---------------------------------------------------------------- tubo varrido ao longo de polilinha com curvas
// pts: vértices da poligonal; bend: raio de curvatura nas dobras. Retas = 1 segmento, dobras = `bs` segmentos.
export function bentPath(pts, bend = 0.04, bs = 7) {
  const P = pts.map((p) => new V3(...p)), out = [P[0].clone()];
  for (let i = 1; i < P.length - 1; i++) {
    const a = P[i - 1], b = P[i], c = P[i + 1];
    const u1 = a.clone().sub(b), u2 = c.clone().sub(b), l1 = u1.length(), l2 = u2.length(); u1.normalize(); u2.normalize();
    const th = Math.acos(THREE.MathUtils.clamp(u1.dot(u2), -1, 1));
    if (th > Math.PI - 0.02) { out.push(b.clone()); continue; }
    const t = Math.min(bend / Math.tan(th / 2), l1 * 0.48, l2 * 0.48);
    const T1 = b.clone().addScaledVector(u1, t), T2 = b.clone().addScaledVector(u2, t);
    for (let k = 0; k <= bs; k++) { const s = k / bs, m = 1 - s; out.push(new V3().addScaledVector(T1, m * m).addScaledVector(b, 2 * m * s).addScaledVector(T2, s * s)); }
  }
  out.push(P[P.length - 1].clone());
  return out.filter((p, i) => i === 0 || p.distanceTo(out[i - 1]) > 1e-5);
}

export function sweepTube(path, r, radial = 10, { caps = true, rx = r, ry = r } = {}) {
  const n = path.length, T = [];
  for (let i = 0; i < n; i++) { const a = path[Math.max(0, i - 1)], b = path[Math.min(n - 1, i + 1)]; T.push(b.clone().sub(a).normalize()); }
  // referencial por transporte paralelo
  let N0 = Math.abs(T[0].y) < 0.9 ? new V3(0, 1, 0) : new V3(1, 0, 0);
  N0 = N0.sub(T[0].clone().multiplyScalar(N0.dot(T[0]))).normalize();
  const Ns = [N0], Bs = [new V3().crossVectors(T[0], N0)];
  for (let i = 1; i < n; i++) {
    const prev = Ns[i - 1], axis = new V3().crossVectors(T[i - 1], T[i]); let Nn = prev.clone();
    if (axis.length() > 1e-6) { axis.normalize(); Nn.applyAxisAngle(axis, Math.acos(THREE.MathUtils.clamp(T[i - 1].dot(T[i]), -1, 1))); }
    Nn.sub(T[i].clone().multiplyScalar(Nn.dot(T[i]))).normalize(); Ns.push(Nn); Bs.push(new V3().crossVectors(T[i], Nn));
  }
  const pos = [], nor = [], uv = [], idx = []; let len = 0;
  for (let i = 0; i < n; i++) {
    if (i) len += path[i].distanceTo(path[i - 1]);
    for (let j = 0; j <= radial; j++) {
      const a = j / radial * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      const nn = Ns[i].clone().multiplyScalar(c * ry).addScaledVector(Bs[i], s * rx);
      const nv = Ns[i].clone().multiplyScalar(c / ry).addScaledVector(Bs[i], s / rx).normalize();
      pos.push(path[i].x + nn.x, path[i].y + nn.y, path[i].z + nn.z); nor.push(nv.x, nv.y, nv.z); uv.push(len * 8, j / radial);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  if (caps) for (const [i, sgn] of [[0, -1], [n - 1, 1]]) {
    const c0 = pos.length / 3; const t = T[i].clone().multiplyScalar(sgn);
    // tampa levemente abaulada (ponta de tubo prensada)
    pos.push(path[i].x + t.x * r * 0.25, path[i].y + t.y * r * 0.25, path[i].z + t.z * r * 0.25); nor.push(t.x, t.y, t.z); uv.push(0, 0);
    for (let j = 0; j <= radial; j++) { const k = (i * (radial + 1) + j) * 3; pos.push(pos[k], pos[k + 1], pos[k + 2]); const q = new V3(nor[k], nor[k + 1], nor[k + 2]).multiplyScalar(0.35).add(t).normalize(); nor.push(q.x, q.y, q.z); uv.push(0, 0); }
    for (let j = 0; j < radial; j++) sgn > 0 ? idx.push(c0, c0 + 1 + j, c0 + 2 + j) : idx.push(c0, c0 + 2 + j, c0 + 1 + j);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); return g;
}
const tube = (pts, r, bend, o) => sweepTube(bentPath(pts, bend, 6), r, o?.radial ?? 9, o);

// ---------------------------------------------------------------- CADEIRA UNIVERSITÁRIA
export const CH = {
  seatY: 0.455,         // topo do assento na borda dianteira (NBR 14006 / mobiliário escolar adulto ≈ 0,45 m)
  tabY: 0.735,          // topo da prancheta ≈ plano de trabalho 0,75 m
  tube: 0.0128,         // tubo oblongo/1" (≈ 25,6 mm) — na foto a estrutura é robusta
  backTilt: THREE.MathUtils.degToRad(13), backY: 0.775, backZ: 0.225,
};

// forma do assento (a = x, b = z; b<0 frente)
function seatSurf(a, b) {
  const dish = -0.011 * Math.max(0, 1 - (a / 0.24) ** 2) * Math.exp(-(((b - 0.02) / 0.13) ** 2));
  const front = b < -0.12 ? -2.4 * (-0.12 - b) ** 2 : 0;
  const rear = b > 0.08 ? 1.3 * (b - 0.08) ** 2 : 0;
  const side = 0.12 * a * a;
  return dish + front + rear + side;
}
export function seatTopAt(a, b) { return CH.seatY + seatSurf(a, b); }

export function chairSeatShell() {
  const outline = roundedPolygon([[-0.232, -0.215], [0.232, -0.215], [0.212, 0.205], [-0.212, 0.205]], [0.05, 0.05, 0.075, 0.075], 6, 0.04);
  const H0 = 0.016;
  const profile = [
    { s: 0, h: 0 }, ...[0.3, 0.6, 0.84, 0.95, 1].map((s) => ({ s, d: 0.024, h: 0 })),
    { s: 1, d: 0.016, h: -0.0008 }, { s: 1, d: 0.0095, h: -0.003 }, { s: 1, d: 0.0045, h: -0.0072 }, { s: 1, d: 0.0012, h: -0.0125 },
    { s: 1, d: 0, h: -0.019 }, { s: 1, d: 0.0003, h: -0.026 }, { s: 1, d: 0.002, h: -0.0295 }, { s: 1, d: 0.0055, h: -0.0305 },
    { s: 1, d: 0.0075, h: -0.027 }, { s: 1, d: 0.008, h: -0.012 }, { s: 1, d: 0.011, h: -0.0065 },
    ...[1, 0.85, 0.45].map((s) => ({ s, d: 0.014, h: -0.0055 })), { s: 0, h: -0.0055 },
  ];
  void H0;
  return loftShell({ outline, profile, surf: seatSurf, toWorld: (a, b, h) => [a, CH.seatY + h, b], up: new V3(0, 1, 0) });
}

// encosto: (a = x, b = vertical local); h positivo = para trás (+Z local)
function backSurf(a, b) { return -(a * a) / 0.86 - 0.0075 * Math.exp(-(((b + 0.06) / 0.09) ** 2)) + 0.03 * Math.max(0, b - 0.06) ** 2; }
const backQ = new THREE.Quaternion().setFromAxisAngle(new V3(1, 0, 0), CH.backTilt);
export function backToWorld(a, b, h) { const v = new V3(a, b, h).applyQuaternion(backQ); return [v.x, v.y + CH.backY, v.z + CH.backZ]; }
export const BACK_OUTLINE = () => roundedPolygon([[-0.208, -0.162], [0.208, -0.162], [0.228, 0.152], [0, 0.171], [-0.228, 0.152]], [0.045, 0.045, 0.07, 0, 0.07], 6, 0.035);
export const BACK_BOX = { minA: -0.228, maxA: 0.228, minB: -0.162, maxB: 0.171 };
export function chairBackShell() {
  const profile = [
    { s: 0, h: 0 }, ...[0.35, 0.65, 0.88, 0.96, 1].map((s) => ({ s, d: 0.02, h: 0 })),
    { s: 1, d: 0.0125, h: 0.0005 }, { s: 1, d: 0.0065, h: 0.0024 }, { s: 1, d: 0.002, h: 0.0062 }, { s: 1, d: 0, h: 0.0108 },
    { s: 1, d: 0.0018, h: 0.0152 }, { s: 1, d: 0.0055, h: 0.0182 }, { s: 1, d: 0.0105, h: 0.0193 }, { s: 1, d: 0.0145, h: 0.0172 },
    { s: 1, d: 0.0162, h: 0.0115 }, { s: 1, d: 0.0185, h: 0.0072 },
    ...[1, 0.95, 0.8, 0.45].map((s) => ({ s, d: 0.024, h: 0.0058 })), { s: 0, h: 0.0058 },
  ];
  const shell = loftShell({ outline: BACK_OUTLINE(), profile, surf: backSurf, toWorld: backToWorld, up: new V3(0, 0, -1).applyQuaternion(backQ), box: BACK_BOX });
  const parts = [shell];
  return mergeGeometries(parts, false);
}
// superfície traseira do encosto (para posicionar os montantes)
export function backRearPoint(a, b, off) { return new V3(...backToWorld(a, b, backSurf(a, b) + 0.0193 + off)); }

// estrutura tubular de aço + porta-livros aramado + braço da prancheta
export function chairFrame() {
  const r = CH.tube, gs = [], y0 = 0.405; // trilho sob o assento
  for (const sx of [-1, 1]) {
    const x = 0.205 * sx, xf = 0.222 * sx;
    // lateral em trapézio: pé dianteiro → trilho do assento → pé traseiro
    gs.push(tube([[xf, r * 0.6, -0.245], [x, y0, -0.175], [x, y0, 0.155], [xf, r * 0.6, 0.262]], r, 0.045));
    // travessa lateral baixa
    const lerp = (A, B, t) => A.map((v, i) => v + (B[i] - v) * t);
    const Fa = lerp([xf, 0, -0.245], [x, y0, -0.175], 0.16 / y0), Ra = lerp([xf, 0, 0.262], [x, y0, 0.155], 0.16 / y0);
    gs.push(tube([Fa, Ra], r * 0.82, 0.02, { caps: false }));
    // montante do encosto: sai do trilho, contorna a borda traseira do assento e sobe atrás do encosto
    const xb = 0.198 * sx, P1 = backRearPoint(xb, -0.10, r * 0.95), P2 = backRearPoint(xb, 0.095, r * 0.95);
    gs.push(tube([[x, y0 - 0.002, 0.05], [x, y0 - 0.002, 0.19], [xb, 0.47, 0.243], [P1.x, P1.y, P1.z], [P2.x, P2.y, P2.z]], r * 0.92, 0.05));
  }
  // travessas transversais: traseira baixa, sob o assento (2)
  const rb = (y, z, rr = r * 0.82, xs = 0.214) => tube([[-xs, y, z], [xs, y, z]], rr, 0.02, { caps: false });
  gs.push(rb(0.16, 0.236, r * 0.82, 0.216), rb(y0 - 0.002, -0.115, r * 0.8, 0.205), rb(y0 - 0.002, 0.11, r * 0.8, 0.205));
  // chapa/travessa do encosto (atrás, entre os montantes)
  // porta-livros (grade de arame Ø 4,8 mm) — y ≈ 0,20 m
  const wr = 0.0024, yg = 0.205, gx = 0.172, gz0 = -0.135, gz1 = 0.13;
  gs.push(tube([[-gx, yg, gz0], [gx, yg, gz0], [gx, yg, gz1], [-gx, yg, gz1], [-gx, yg, gz0 + 0.0001]], wr, 0.012, { radial: 6 }));
  for (let i = 1; i < 8; i++) { const x = -gx + (2 * gx) * i / 8; gs.push(tube([[x, yg + 0.001, gz0], [x, yg + 0.001, gz1]], wr * 0.9, 0.01, { radial: 5, caps: false })); }
  gs.push(tube([[-gx, yg + 0.004, 0], [gx, yg + 0.004, 0]], wr * 0.9, 0.01, { radial: 5, caps: false }));
  // tirantes da grade até a travessa sob o assento
  for (const sx of [-1, 1]) for (const z of [gz0 + 0.02, gz1 - 0.02]) gs.push(tube([[sx * gx, yg, z], [sx * 0.2, y0 - 0.01, z * 0.9]], wr, 0.01, { radial: 5, caps: false }));
  // braço da prancheta (lado direito): sobe do trilho e curva para a frente sob a prancheta
  const ya = CH.tabY - 0.018 - r * 0.85;
  gs.push(tube([[0.205, y0 - 0.002, 0.10], [0.262, y0 + 0.01, 0.085], [0.282, 0.585, 0.03], [0.272, ya, -0.07], [0.205, ya, -0.30]], r * 0.92, 0.06));
  // braço inferior (apoio dianteiro) do pé da frente até a prancheta
  gs.push(tube([[0.214, 0.30, -0.212], [0.255, 0.48, -0.235], [0.232, ya, -0.31]], r * 0.8, 0.07));
  return mergeGeometries(gs, false);
}

// ponteiras plásticas dos 4 pés + sapata das travessas
export function chairCaps() {
  const gs = [];
  const r = CH.tube;
  for (const sx of [-1, 1]) for (const [zf, zt] of [[-0.245, -0.175], [0.262, 0.155]]) {
    const foot = new V3(0.222 * sx, 0, zf), top = new V3(0.205 * sx, 0.405, zt), dir = top.clone().sub(foot).normalize();
    const g = new THREE.CylinderGeometry(r * 1.22, r * 1.32, 0.03, 14, 1); g.translate(0, 0.015, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), dir)); g.translate(foot.x, 0.0, foot.z);
    gs.push(g);
  }
  return mergeGeometries(gs.map((g) => g.index ? g.toNonIndexed() : g), false);
}

// prancheta: forma de "raquete" — parte estreita junto ao braço direito e parte larga sobre o colo. 2 grupos: tampo/fita.
export function chairTablet() {
  const s = new THREE.Shape(); // coordenadas (x, -z)
  const P = [[0.33, -0.07], [0.33, 0.47], [-0.228, 0.47], [-0.238, 0.265], [0.125, 0.10], [0.145, -0.07]];
  const R = [0.035, 0.08, 0.07, 0.07, 0.16, 0.035];
  const pts = roundedPolyConcave(P, R, 10);
  s.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.0028, bevelSegments: 3, curveSegments: 4 });
  g.rotateX(-Math.PI / 2); g.translate(0, CH.tabY - 0.015, 0);
  return g;
}
// cantos arredondados em polígono possivelmente côncavo (fillet com sinal)
function roundedPolyConcave(pts, radii, seg) {
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const P = pts[i], A = pts[(i + n - 1) % n], B = pts[(i + 1) % n], r = radii[i];
    const u1 = norm2([A[0] - P[0], A[1] - P[1]]), u2 = norm2([B[0] - P[0], B[1] - P[1]]);
    const th = Math.acos(Math.max(-1, Math.min(1, u1[0] * u2[0] + u1[1] * u2[1])));
    const t = Math.min(r / Math.tan(th / 2), Math.hypot(A[0] - P[0], A[1] - P[1]) * 0.45, Math.hypot(B[0] - P[0], B[1] - P[1]) * 0.45);
    const T1 = [P[0] + u1[0] * t, P[1] + u1[1] * t], T2 = [P[0] + u2[0] * t, P[1] + u2[1] * t];
    for (let k = 0; k <= seg; k++) { const s = k / seg, m = 1 - s; out.push([m * m * T1[0] + 2 * m * s * P[0] + s * s * T2[0], m * m * T1[1] + 2 * m * s * P[1] + s * s * T2[1]]); }
  }
  return out;
}

// variante estofada (assento e encosto com espuma + tecido)
export function cushionSeat() {
  const outline = roundedPolygon([[-0.234, -0.218], [0.234, -0.218], [0.215, 0.208], [-0.215, 0.208]], [0.07, 0.07, 0.09, 0.09], 6, 0.04);
  const T = 0.042, prof = [{ s: 0, h: T }];
  for (const s of [0.35, 0.6, 0.8, 0.92, 1]) prof.push({ s, d: 0.03, h: T });
  for (let k = 1; k <= 7; k++) { const a = k / 7 * Math.PI / 2; prof.push({ s: 1, d: 0.03 * (1 - Math.sin(a)), h: T - 0.022 * (1 - Math.cos(a)) }); }
  prof.push({ s: 1, d: 0, h: 0.012 }, { s: 1, d: 0.004, h: 0.002 }, { s: 1, d: 0.012, h: 0 }, { s: 0.8, d: 0.012, h: 0 }, { s: 0, h: 0 });
  return loftShell({ outline, profile: prof, surf: (a, b) => seatSurf(a, b) * 0.6 - 0.0015 * Math.cos(a * 40) * 0, toWorld: (a, b, h) => [a, CH.seatY - 0.03 + h, b], up: new V3(0, 1, 0) });
}
export function cushionBack() {
  const outline = roundedPolygon([[-0.205, -0.15], [0.205, -0.15], [0.215, 0.135], [-0.215, 0.135]], [0.1, 0.1, 0.12, 0.12], 7, 0.04);
  const T = 0.045, prof = [{ s: 0, h: -T * 0.65 }];
  for (const s of [0.35, 0.6, 0.8, 0.92, 1]) prof.push({ s, d: 0.032, h: -T * 0.65 * (1 - 0.15 * s * s) });
  for (let k = 1; k <= 8; k++) { const a = k / 8 * Math.PI; prof.push({ s: 1, d: 0.032 * (1 - Math.sin(Math.min(a, Math.PI / 2))) + (a > Math.PI / 2 ? 0.02 * Math.sin(a - Math.PI / 2) : 0), h: -T * 0.55 + T * 0.75 * (1 - Math.cos(a)) / 2 }); }
  for (const s of [1, 0.85, 0.5]) prof.push({ s, d: 0.03, h: T * 0.25 });
  prof.push({ s: 0, h: T * 0.25 });
  return loftShell({ outline, profile: prof, surf: (a, b) => backSurf(a, b) * 0.85, toWorld: (a, b, h) => backToWorld(a, b + 0.005, h), up: new V3(0, 0, -1).applyQuaternion(backQ) });
}

// ---------------------------------------------------------------- MESA DO PROFESSOR (1,20 × 0,60 × 0,75)
// local: tampo centrado na origem, professor senta em −Z, alunos em +Z (a mesa será girada 180° no layout)
export function teacherDesk() {
  const W = 1.2, D = 0.6, Ht = 0.75, t = 0.025;
  const s = new THREE.Shape(); const rr = 0.012;
  const pts = roundedPolyConcave([[-W / 2, -D / 2], [W / 2, -D / 2], [W / 2, D / 2], [-W / 2, D / 2]], [rr, rr, rr, rr], 4);
  s.moveTo(...pts[0]); pts.slice(1).forEach((p) => s.lineTo(...p)); s.closePath();
  const top = new THREE.ExtrudeGeometry(s, { depth: t - 0.006, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 3, curveSegments: 3 });
  top.rotateX(-Math.PI / 2); top.translate(0, Ht - t + 0.003, 0);
  // estrutura em tubo de aço (pés em "U" invertido com sapatas) + travessa
  const r = 0.0125, frame = [];
  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 - 0.06);
    frame.push(tube([[x, 0.012, -D / 2 + 0.06], [x, Ht - t - r, -D / 2 + 0.06], [x, Ht - t - r, D / 2 - 0.06], [x, 0.012, D / 2 - 0.06]], r, 0.035));
    frame.push(tube([[x, 0.012, -D / 2 + 0.03], [x, 0.012, D / 2 - 0.03]], r, 0.02));
  }
  frame.push(tube([[-(W / 2 - 0.06), Ht - t - r, 0.14], [W / 2 - 0.06, Ht - t - r, 0.14]], r * 0.9, 0.02, { caps: false }));
  frame.push(tube([[-(W / 2 - 0.06), Ht - t - r, -0.14], [W / 2 - 0.06, Ht - t - r, -0.14]], r * 0.9, 0.02, { caps: false }));
  // painel frontal (saia) MDF do lado dos alunos (+Z)
  const panel = new THREE.BoxGeometry(W - 0.16, 0.36, 0.015); panel.translate(0, Ht - t - 0.2, D / 2 - 0.075);
  return { top, frame: mergeGeometries(frame, false), panel };
}

// cadeira fixa do professor (estofada, base em tubo preto "4 pés")
export function teacherChair() {
  const seat = cushionSeat(), back = cushionBack();
  const r = 0.0105, gs = [];
  for (const sx of [-1, 1]) {
    const x = sx * 0.21;
    gs.push(tube([[x * 1.05, 0.01, -0.235], [x, 0.405, -0.17], [x, 0.405, 0.15], [x * 1.05, 0.01, 0.262]], r, 0.045));
    const P1 = backRearPoint(sx * 0.15, -0.1, r + 0.006), P2 = backRearPoint(sx * 0.15, 0.06, r + 0.006);
    gs.push(tube([[x * 0.95, 0.40, 0.04], [sx * 0.15, 0.40, 0.19], [sx * 0.15, 0.47, 0.245], [P1.x, P1.y, P1.z], [P2.x, P2.y, P2.z]], r, 0.05));
  }
  gs.push(tube([[-0.21, 0.40, -0.1], [0.21, 0.40, -0.1]], r * 0.85, 0.02, { caps: false }), tube([[-0.21, 0.40, 0.1], [0.21, 0.40, 0.1]], r * 0.85, 0.02, { caps: false }));
  gs.push(tube([[-0.225, 0.16, 0.24], [0.225, 0.16, 0.24]], r * 0.85, 0.02, { caps: false }));
  return { seat, back, frame: mergeGeometries(gs, false) };
}

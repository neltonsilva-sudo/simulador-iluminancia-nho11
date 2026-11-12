// SALA — peças: utilitários de geometria (UV em metros), janelas de correr com grade, porta, cartazes, interruptor,
// eletroduto. Tudo é emitido como BufferGeometry em coordenadas do MUNDO num "coletor" {material: [geoms]} que o
// room.js mescla (mergeGeometries) por material. Dono: SALA.
import * as THREE from 'three';

const _m = new THREE.Matrix4();

/** Box com UVs em metros (cada face usa suas próprias dimensões). */
export function boxGeo(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d); const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]); }
  return g;
}
/** Box alongada cujo eixo maior recebe U (bom para perfis com textura de laminação). */
export function addBox(col, mat, w, h, d, x, y, z, frame) {
  const g = boxGeo(w, h, d); g.translate(x, y, z); if (frame) g.applyMatrix4(frame); (col[mat] ||= []).push(g); return g;
}
export function addPlane(col, mat, w, h, x, y, z, frame, { uvMeters = false } = {}) {
  const g = new THREE.PlaneGeometry(w, h); if (uvMeters) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w, uv.getY(i) * h); }
  g.translate(x, y, z); if (frame) g.applyMatrix4(frame); (col[mat] ||= []).push(g); return g;
}
/** Matriz de um referencial de parede: x local = ud (ao longo da parede), y = up, z = normal para dentro da sala. */
export function wallFrame(wall, u, v, d = 0) {
  const { o, ud, n } = wall;
  _m.makeBasis(new THREE.Vector3(...ud), new THREE.Vector3(0, 1, 0), new THREE.Vector3(...n));
  _m.setPosition(o[0] + ud[0] * u + n[0] * d, o[1] + v, o[2] + ud[2] * u + n[2] * d);
  return _m.clone();
}

// ---------- janela de correr de alumínio (2 folhas) com grade externa ----------
// local: origem no centro do vão, no plano da parede; z<0 = para fora (espessura da parede t)
export function buildWindow(col, frame, w, h, { film = false, t = 0.075 } = {}) {
  const fp = 0.032, fd = 0.068, zc = -t + fd / 2 + 0.002;
  // marco
  addBox(col, 'alu', w, fp, fd, 0, h / 2 - fp / 2, zc, frame);
  addBox(col, 'alu', w, fp, fd, 0, -h / 2 + fp / 2, zc, frame);
  addBox(col, 'alu', fp, h - 2 * fp, fd, -w / 2 + fp / 2, 0, zc, frame);
  addBox(col, 'alu', fp, h - 2 * fp, fd, w / 2 - fp / 2, 0, zc, frame);
  // trilhos (2 canais escuros na base e no topo)
  addBox(col, 'dark', w - 2 * fp, 0.006, fd - 0.012, 0, -h / 2 + fp + 0.003, zc, frame);
  addBox(col, 'dark', w - 2 * fp, 0.006, fd - 0.012, 0, h / 2 - fp - 0.003, zc, frame);
  const wi = w - 2 * fp, hi = h - 2 * fp - 0.012, sw = wi / 2 + 0.022, sp = 0.026, sd = 0.022;
  const sashes = [{ x: -wi / 2 + sw / 2, z: -0.024, film: false }, { x: wi / 2 - sw / 2, z: -0.050, film }];
  for (const s of sashes) {
    const zz = s.z; // folha
    addBox(col, 'alu', sw, sp, sd, s.x, hi / 2 - sp / 2, zz, frame);
    addBox(col, 'alu', sw, sp, sd, s.x, -hi / 2 + sp / 2, zz, frame);
    addBox(col, 'alu', sp, hi - 2 * sp, sd, s.x - sw / 2 + sp / 2, 0, zz, frame);
    addBox(col, 'alu', sp + 0.006, hi - 2 * sp, sd + 0.004, s.x + sw / 2 - sp / 2, 0, zz, frame);
    // borracha de vedação (fina, escura) em volta do vidro
    const gw = sw - 2 * sp, gh = hi - 2 * sp;
    addBox(col, 'dark', gw, 0.006, 0.008, s.x, gh / 2 - 0.003, zz, frame); addBox(col, 'dark', gw, 0.006, 0.008, s.x, -gh / 2 + 0.003, zz, frame);
    addBox(col, 'dark', 0.006, gh, 0.008, s.x - gw / 2 + 0.003, 0, zz, frame); addBox(col, 'dark', 0.006, gh, 0.008, s.x + gw / 2 - 0.003, 0, zz, frame);
    addPlane(col, 'glass', gw, gh, s.x, 0, zz + 0.001, frame);
    if (s.film) { const g = addPlane(col, 'film', gw - 0.01, gh - 0.01, s.x, 0, zz - 0.003, frame); g.userData.film = true; }
  }
  // fecho no encontro das folhas
  addBox(col, 'dark', 0.016, 0.07, 0.016, -wi / 2 + sw - sp / 2, 0.02, -0.006, frame);
  // grade externa (barras chatas pintadas creme) — vista através do vidro
  const gz = -t - 0.045, nb = Math.max(4, Math.round(w / 0.105));
  for (let i = 0; i <= nb; i++) { const x = -w / 2 + 0.03 + (w - 0.06) * (i / nb); addBox(col, 'grille', 0.016, h + 0.06, 0.010, x, 0, gz, frame); }
  for (const y of [-h / 2 + 0.02, -h / 6, h / 6, h / 2 - 0.02]) addBox(col, 'grille', w + 0.02, 0.028, 0.008, 0, y, gz - 0.01, frame);
  // exterior noturno (só visível pelo vão)
  addPlane(col, 'night', w + 1.4, h + 1.2, 0, 0, -t - 0.6, frame);
}

// ---------- porta (folha branca de aço, batente de alumínio, maçaneta de alavanca) ----------
export function buildDoor(col, frame, w, h, { t = 0.075, hingeRight = true } = {}) {
  const fp = 0.05, fd = 0.085, zc = -t / 2 + 0.006;
  addBox(col, 'alu', w + 2 * fp, fp, fd, 0, h / 2 + fp / 2, zc, frame);
  addBox(col, 'alu', fp, h, fd, -w / 2 - fp / 2, 0, zc, frame);
  addBox(col, 'alu', fp, h, fd, w / 2 + fp / 2, 0, zc, frame);
  const lw = w - 0.006, lh = h - 0.012, lz = -0.03;
  addBox(col, 'door', lw, lh, 0.042, 0, 0.003, lz, frame);
  // almofadas estampadas (2 retângulos rasos)
  for (const [cy, hh] of [[0.42, 0.78], [-0.52, 0.66]]) {
    const pw = lw - 0.22; addBox(col, 'doorGroove', pw, 0.008, 0.004, 0, cy + hh / 2, lz + 0.021, frame); addBox(col, 'doorGroove', pw, 0.008, 0.004, 0, cy - hh / 2, lz + 0.021, frame);
    addBox(col, 'doorGroove', 0.008, hh, 0.004, -pw / 2, cy, lz + 0.021, frame); addBox(col, 'doorGroove', 0.008, hh, 0.004, pw / 2, cy, lz + 0.021, frame);
  }
  const s = hingeRight ? -1 : 1; // lado da maçaneta
  const hx = s * (lw / 2 - 0.065), hy = 1.02 - h / 2;
  const ros = new THREE.CylinderGeometry(0.026, 0.028, 0.012, 24); ros.rotateX(Math.PI / 2); ros.translate(hx, hy, lz + 0.027); ros.applyMatrix4(frame); (col.chrome ||= []).push(ros);
  const ros2 = new THREE.CylinderGeometry(0.018, 0.02, 0.012, 20); ros2.rotateX(Math.PI / 2); ros2.translate(hx, hy - 0.17, lz + 0.027); ros2.applyMatrix4(frame); (col.chrome ||= []).push(ros2);
  addBox(col, 'dark', 0.006, 0.02, 0.004, hx, hy - 0.17, lz + 0.034, frame);
  const stem = new THREE.CylinderGeometry(0.009, 0.009, 0.05, 12); stem.rotateX(Math.PI / 2); stem.translate(hx, hy, lz + 0.05); stem.applyMatrix4(frame); (col.chrome ||= []).push(stem);
  addBox(col, 'chrome', 0.13, 0.018, 0.016, hx - s * 0.06, hy, lz + 0.072, frame);
  for (const y of [h / 2 - 0.25, 0, -h / 2 + 0.25]) { const hg = new THREE.CylinderGeometry(0.008, 0.008, 0.10, 12); hg.translate(-s * (lw / 2 + 0.004), y, lz + 0.022); hg.applyMatrix4(frame); (col.chrome ||= []).push(hg); }
  addPlane(col, 'night', w + 1.0, h + 0.6, 0, 0, -t - 0.6, frame);
}

// ---------- quadro A3 com moldura azul ----------
export function buildPoster(col, frame, variant, w = 0.335, h = 0.465) {
  const fb = 0.016, fd = 0.016;
  addBox(col, 'pframe', w, fb, fd, 0, h / 2 - fb / 2, fd / 2, frame); addBox(col, 'pframe', w, fb, fd, 0, -h / 2 + fb / 2, fd / 2, frame);
  addBox(col, 'pframe', fb, h - 2 * fb, fd, -w / 2 + fb / 2, 0, fd / 2, frame); addBox(col, 'pframe', fb, h - 2 * fb, fd, w / 2 - fb / 2, 0, fd / 2, frame);
  addBox(col, 'pback', w - 2 * fb, h - 2 * fb, 0.004, 0, 0, 0.002, frame);
  addPlane(col, 'poster' + (variant % 4), w - 2 * fb + 0.002, h - 2 * fb + 0.002, 0, 0, 0.0105, frame);
}
// ---------- interruptor (placa escura 4×2") ----------
export function buildSwitch(col, frame) {
  addBox(col, 'switch', 0.074, 0.118, 0.010, 0, 0, 0.005, frame);
  addBox(col, 'switchKey', 0.026, 0.044, 0.006, 0, 0.012, 0.012, frame);
  addBox(col, 'switchKey', 0.026, 0.020, 0.004, 0, -0.03, 0.011, frame);
}
// ---------- caixa de passagem + eletroduto flexível preto ----------
export function buildConduit(col, pts, r = 0.012) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), false, 'catmullrom', 0.4);
  const g = new THREE.TubeGeometry(curve, 64, r, 10, false); const uv = g.attributes.uv; const len = curve.getLength();
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len, uv.getY(i) * 2 * Math.PI * r);
  (col.conduit ||= []).push(g);
}

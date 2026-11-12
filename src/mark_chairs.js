// MARCAÇÃO — afasta visualmente as carteiras que ocupam o lugar do tripé do luxímetro e as devolve depois.
// Atua só nas matrizes de instância (InstancedMesh 'chair-*' do grupo 'furniture'), sem alterar o módulo MOBILIÁRIO;
// se o MOBILIÁRIO reconstruir o leiaute no meio do caminho, a entrada é descartada (nada é sobrescrito).
// Dono: MARCAÇÃO.
import * as THREE from 'three';

const CLEAR = 0.62;          // distância mínima do centro da carteira ao ponto (m)
const DUR = 0.7;
const ease = (x) => { x = Math.min(1, Math.max(0, x)); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };

export function makeChairMover(stage) {
  const E = new Map();       // key → {mesh, i, orig: Matrix4, from: Matrix4, to: Matrix4, last: Vector3, t0}
  const m4 = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  const pa = new THREE.Vector3(), pb = new THREE.Vector3(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
  let busy = false;
  function meshes() {
    const out = []; const f = stage.scene.getObjectByName('furniture');
    f?.traverse((o) => { if (o.isInstancedMesh && /^chair-/.test(o.name || '')) out.push(o); });
    return out;
  }
  const now = () => performance.now() / 1000;
  /** Afasta as carteiras perto de (x,z); devolve as que tinham sido afastadas antes. */
  function clearAround(x, z) {
    const t = now();
    for (const e of E.values()) { e.from.copy(current(e)); e.to.copy(e.orig); e.t0 = t; }
    // origens de todas as carteiras (pela estrutura, uma instância por carteira)
    const ms = meshes(), frame = ms.find((m) => m.name === 'chair-frame'), others = [];
    if (frame) for (let i = 0; i < frame.count; i++) { const e = E.get(frame.uuid + ':' + i); const o = e ? e.orig : (frame.getMatrixAt(i, m4), m4); o.decompose(p, q, s); others.push([p.x, p.z]); }
    const room = stage.room || { W: 5.9, L: 9.16 };
    const decide = new Map();   // "x,z" da carteira → {mode:'push'|'lift', px, pz}
    const plan = (cx, cz) => {
      const k = cx.toFixed(3) + ',' + cz.toFixed(3); if (decide.has(k)) return decide.get(k);
      const dx = cx - x, dz = cz - z, d = Math.hypot(dx, dz);
      let ux = dx / (d || 1), uz = dz / (d || 1); if (d < 0.05) { ux = 0; uz = 1; }
      const push = CLEAR - d + 0.04, px = cx + ux * push, pz = cz + uz * push;
      const inside = Math.abs(px) < room.W / 2 - 0.35 && Math.abs(pz) < room.L / 2 - 0.35;
      const free = others.every(([ox, oz]) => (Math.abs(ox - cx) < 1e-3 && Math.abs(oz - cz) < 1e-3) || Math.hypot(ox - px, oz - pz) >= 0.6);
      const r = inside && free ? { mode: 'push', px, pz } : { mode: 'lift' }; decide.set(k, r); return r;
    };
    for (const mesh of ms) {
      for (let i = 0; i < mesh.count; i++) {
        const key = mesh.uuid + ':' + i; let e = E.get(key);
        const orig = e ? e.orig : (mesh.getMatrixAt(i, m4), m4.clone());
        orig.decompose(p, q, s);
        const dx = p.x - x, dz = p.z - z, d = Math.hypot(dx, dz);
        if (d >= CLEAR) continue;
        const pl = plan(p.x, p.z); let to;
        if (pl.mode === 'push') {
          const h = Math.sin(p.x * 12.9898 + p.z * 78.233) * 43758.5453; const sgn = h - Math.floor(h) < 0.5 ? -1 : 1;
          const rot = new THREE.Quaternion().setFromAxisAngle(THREE.Object3D.DEFAULT_UP, sgn * 0.18).multiply(q);
          to = new THREE.Matrix4().compose(new THREE.Vector3(pl.px, p.y, pl.pz), rot, s);
        } else {   // sem espaço livre: a carteira é retirada do lugar (sai de cena encolhendo)
          to = new THREE.Matrix4().compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(0.001, 0.001, 0.001));
        }
        if (!e) { e = { mesh, i, orig, from: orig.clone(), to, last: p.clone(), t0: t }; E.set(key, e); }
        else { e.to.copy(to); }
      }
    }
    busy = true;
  }
  function restore() { const t = now(); for (const e of E.values()) { e.from.copy(current(e)); e.to.copy(e.orig); e.t0 = t; } busy = E.size > 0; }
  const cur = new THREE.Matrix4();
  const sa = new THREE.Vector3(), sb = new THREE.Vector3();
  function current(e) { const u = ease((now() - e.t0) / DUR); e.from.decompose(pa, qa, sa); e.to.decompose(pb, qb, sb); pa.lerp(pb, u); qa.slerp(qb, u); sa.lerp(sb, u); return cur.compose(pa, qa, sa); }
  function update() {
    if (!busy) return;
    const t = now(); let active = false; const touched = new Set();
    for (const [key, e] of E) {
      if (e.i >= e.mesh.count || !e.mesh.parent) { E.delete(key); continue; }
      // o MOBILIÁRIO refez o leiaute? (a matriz atual não é a que escrevemos) → abandona a entrada
      e.mesh.getMatrixAt(e.i, m4); m4.decompose(p, q, s);
      if (p.distanceTo(e.last) > 1e-3) { E.delete(key); continue; }
      const M = current(e); e.mesh.setMatrixAt(e.i, M); M.decompose(e.last, q, s); touched.add(e.mesh);
      const done = t - e.t0 >= DUR;
      if (done && e.to.equals(e.orig)) { e.mesh.setMatrixAt(e.i, e.orig); E.delete(key); }
      else if (!done) active = true;
    }
    for (const m of touched) { m.instanceMatrix.needsUpdate = true; if (!active) m.computeBoundingSphere(); }
    busy = active || [...E.values()].some((e) => t - e.t0 < DUR);
  }
  return { clearAround, restore, update };
}

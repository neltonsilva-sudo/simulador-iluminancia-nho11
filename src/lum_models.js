// LUMINÁRIAS — modelos 3D (geometria + materiais procedurais) de cada tipo de luminária. Dono: LUMINÁRIAS.
// Convenção local de cada modelo: origem no ponto de fixação (face superior encostada no teto/perfil), eixo longo = +X,
// largura = Z, Y para cima (o corpo fica em y < 0). userData.emit = {w, l, y} descreve a abertura emissora (para a
// RectAreaLight), userData.kind o tipo.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------- texturas procedurais ----------
function canvasTex(w, h, draw, { repeat = [1, 1], srgb = true } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat);
  t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t;
}
/** Chip SMD visto através do difusor leitoso: um ponto mais brilhante por célula, fundo já luminoso. */
function ledDotsTex(dots) {
  let sum = 0, peak = 0; const W = 64, Hh = 32;
  const t = canvasTex(W, Hh, (g, w, h) => {
    const im = g.createImageData(w, h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const u = (i + 0.5) / w - 0.5, v = (j + 0.5) / h - 0.5;   // u: em volta do tubo (0 = fundo), v: ao longo
      const band = Math.exp(-(u * u) / (2 * 0.17 * 0.17));        // os LEDs olham para baixo: fundo mais luminoso
      const dot = Math.exp(-((u * u) / (2 * 0.045 * 0.045) + (v * v) / (2 * 0.12 * 0.12)));
      const val = Math.min(1, 0.03 + 0.42 * band + 0.55 * dot);
      sum += val; peak = Math.max(peak, val);
      const k = (j * w + i) * 4; const c = Math.round(255 * Math.pow(val, 1 / 2.2));
      im.data[k] = c; im.data[k + 1] = c; im.data[k + 2] = c; im.data[k + 3] = 255;
    }
    g.putImageData(im, 0, 0);
  }, { repeat: [1, dots] });
  t.userData.mean = sum / (W * Hh); t.userData.peak = peak; return t;
}
/** Difusor de painel edge-lit: muito uniforme, leve queda nas bordas + textura de micro-pontos. */
function panelDiffuserTex() {
  return canvasTex(256, 256, (g, w, h) => {
    const im = g.createImageData(w, h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const u = Math.abs((i + 0.5) / w - 0.5) * 2, v = Math.abs((j + 0.5) / h - 0.5) * 2;
      const edge = 1 - 0.10 * Math.pow(Math.max(u, v), 6) + 0.04 * Math.pow(Math.max(u, v), 30);
      const k = (j * w + i) * 4, c = Math.round(255 * Math.pow(Math.min(1, edge * (0.985 + 0.015 * Math.random())), 1 / 2.2));
      im.data[k] = c; im.data[k + 1] = c; im.data[k + 2] = c; im.data[k + 3] = 255;
    }
    g.putImageData(im, 0, 0);
  });
}
/** Placa de teto luminoso (lona/acrílico retroiluminado por matriz de LEDs): leves pontos quentes e vinheta da célula. */
function luminousTileTex() {
  return canvasTex(256, 256, (g, w, h) => {
    const im = g.createImageData(w, h); const n = 6;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const u = (i + 0.5) / w, v = (j + 0.5) / h;
      const cu = (u * n) % 1 - 0.5, cv = (v * n) % 1 - 0.5;
      const hot = Math.exp(-(cu * cu + cv * cv) / (2 * 0.22 * 0.22));
      const eu = Math.abs(u - 0.5) * 2, ev = Math.abs(v - 0.5) * 2;
      const vig = 1 - 0.12 * Math.pow(Math.max(eu, ev), 4);
      const val = Math.min(1, (0.90 + 0.10 * hot) * vig);
      const k = (j * w + i) * 4, c = Math.round(255 * Math.pow(val, 1 / 2.2));
      im.data[k] = c; im.data[k + 1] = c; im.data[k + 2] = c; im.data[k + 3] = 255;
    }
    g.putImageData(im, 0, 0);
  });
}
/** Pintura eletrostática: micro-textura casca-de-laranja (rugosidade) — quase imperceptível, mata o “plástico CG”. */
function powderRoughTex() {
  return canvasTex(128, 128, (g, w, h) => {
    const im = g.createImageData(w, h);
    for (let k = 0; k < w * h; k++) { const c = 150 + Math.round((Math.random() - 0.5) * 40); im.data[k * 4] = c; im.data[k * 4 + 1] = c; im.data[k * 4 + 2] = c; im.data[k * 4 + 3] = 255; }
    g.putImageData(im, 0, 0);
  }, { srgb: false, repeat: [8, 1] });
}

// ---------- materiais (compartilhados; luminaires.js ajusta emissive conforme nível/fluxo) ----------
export function makeMaterials() {
  const rough = powderRoughTex();
  const M = {
    // chapa de aço pintada branca (calha). emissive ≈ autoiluminação da face próxima ao tubo (luz que o tubo joga nela)
    paint: new THREE.MeshPhysicalMaterial({ color: 0xf1f1ee, roughness: 0.42, roughnessMap: rough, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.3, emissive: 0xffffff, emissiveIntensity: 0 }),
    // tampas / porta-lâmpadas em plástico ABS/PC branco
    plastic: new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.5, metalness: 0, emissive: 0xffffff, emissiveIntensity: 0 }),
    socket: new THREE.MeshStandardMaterial({ color: 0xdedbd4, roughness: 0.55, metalness: 0, emissive: 0xffffff, emissiveIntensity: 0 }),
    pin: new THREE.MeshStandardMaterial({ color: 0xb8b2a2, roughness: 0.25, metalness: 1 }),
    screw: new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.3, metalness: 1 }),
    // tubo LED: difusor de policarbonato leitoso (aceso = emissivo com chips) + dorso de alumínio
    tubeLed: new THREE.MeshPhysicalMaterial({ color: 0xe3e5e6, roughness: 0.28, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.12, sheen: 0.4, sheenColor: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0 }),
    tubeFluo: new THREE.MeshPhysicalMaterial({ color: 0xe9eae8, roughness: 0.35, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.15, emissive: 0xffffff, emissiveIntensity: 0 }),
    tubeAlu: new THREE.MeshStandardMaterial({ color: 0xc4c8cb, roughness: 0.38, metalness: 0.9, emissive: 0xffffff, emissiveIntensity: 0 }),
    tubeCap: new THREE.MeshStandardMaterial({ color: 0xd9d9d4, roughness: 0.45, metalness: 0.2 }),
    // aletas parabólicas de alumínio espelhado (alta pureza, anodizado)
    mirror: new THREE.MeshPhysicalMaterial({ color: 0xe8ebee, roughness: 0.12, metalness: 1, emissive: 0xffffff, emissiveIntensity: 0, envMapIntensity: 1.2, side: THREE.DoubleSide }),
    // painel: moldura de alumínio pintado + difusor PMMA opalino
    frame: new THREE.MeshPhysicalMaterial({ color: 0xf2f2f0, roughness: 0.35, metalness: 0.15, clearcoat: 0.3, emissive: 0xffffff, emissiveIntensity: 0 }),
    diffuser: new THREE.MeshPhysicalMaterial({ color: 0xf0f0ee, roughness: 0.6, metalness: 0, emissive: 0xffffff, emissiveIntensity: 0 }),
    // teto luminoso: placas difusoras + perfis T de alumínio
    lumTile: new THREE.MeshStandardMaterial({ color: 0xf1f1ef, roughness: 0.7, metalness: 0, emissive: 0xffffff, emissiveIntensity: 0 }),
    tProfile: new THREE.MeshStandardMaterial({ color: 0xe9eae9, roughness: 0.38, metalness: 0.35, emissive: 0xffffff, emissiveIntensity: 0 }),
  };
  // halo/véu do tubo (espalhamento no difusor + ofuscamento da lente): casca aditiva com queda tipo Fresnel.
  // Radiância em nit (uL), como as luzes; não grava profundidade (fica fora da captura do IBL do RENDER).
  M.glow = new THREE.ShaderMaterial({
    uniforms: { uL: { value: 0 }, uColor: { value: new THREE.Color(1, 1, 1) } },
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uL; uniform vec3 uColor; varying vec3 vN; varying vec3 vV;
      void main(){ float f = max(dot(normalize(vN), normalize(vV)), 0.0); float a = pow(f, 4.0) * 0.7 + pow(f, 14.0) * 0.8;
        gl_FragColor = vec4(uColor * uL * a, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: true,
  });
  M.tubeLed.emissiveMap = ledDotsTex(118);
  M.diffuser.emissiveMap = panelDiffuserTex();
  M.lumTile.emissiveMap = luminousTileTex();
  return M;
}

// ---------- utilidades de geometria ----------
const rbox = (w, h, d, r, seg = 3) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
const at = (g, x, y, z) => { g.translate(x, y, z); return g; };
const mesh = (g, m) => { const o = new THREE.Mesh(g, m); o.castShadow = false; o.receiveShadow = false; return o; };
/** Meia-casca cilíndrica ao longo de X (θ medido em torno de X; θ=0 → +Y, θ=π → −Y). */
function tubeShell(r, len, th0, thLen, seg = 24) {
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1, true, th0, thLen);
  g.rotateZ(Math.PI / 2);   // eixo Y → X. Original (x=r·sinθ) vira y=r·sinθ  ⇒ base de baixo: θ∈(π, 2π)
  return g;
}
/** Tubo T8 (Ø 26 mm) ao longo de X, centrado na origem. led=true → dorso de alumínio + difusor com chips. */
function tubeT8(len, M, led) {
  const g = new THREE.Group(), r = 0.013;
  if (led) {
    const aluArc = 1.9; // ~110° de alumínio em cima
    g.add(mesh(tubeShell(r, len, Math.PI / 2 - aluArc / 2, aluArc), M.tubeAlu));
    g.add(mesh(tubeShell(r, len, Math.PI / 2 + aluArc / 2, Math.PI * 2 - aluArc), M.tubeLed));
    if (M.glow) { const gg = new THREE.CapsuleGeometry(0.030, len - 0.03, 6, 20); gg.rotateZ(Math.PI / 2); gg.translate(0, -0.006, 0);
      const gm = mesh(gg, M.glow); gm.renderOrder = 3; gm.userData.noEnv = true; gm.name = 'lum-glow'; g.add(gm); }
  } else {
    g.add(mesh(tubeShell(r, len, 0, Math.PI * 2), M.tubeFluo));
  }
  // terminais (bases G13) do tubo
  for (const s of [-1, 1]) {
    const cap = new THREE.CylinderGeometry(r * 1.02, r * 1.02, 0.022, 24); cap.rotateZ(Math.PI / 2); cap.translate(s * (len / 2 + 0.011), 0, 0);
    g.add(mesh(cap, M.tubeCap));
    for (const pz of [-0.00635, 0.00635]) { const p = new THREE.CylinderGeometry(0.0012, 0.0012, 0.007, 8); p.rotateZ(Math.PI / 2); p.translate(s * (len / 2 + 0.025), 0, pz); g.add(mesh(p, M.pin)); }
  }
  return g;
}
/** Tampa de extremidade + porta-lâmpada G13 (soquete rotativo), lado s = ±1, sobre a calha. */
function endCapWithSocket(M, x, s, wid, depth, tubeY, tubesZ) {
  const g = new THREE.Group();
  const cap = rbox(0.034, depth, wid + 0.004, 0.006); at(cap, x - s * 0.017, -depth / 2, 0); g.add(mesh(cap, M.plastic));
  for (const tz of tubesZ) {
    const rotor = new THREE.CylinderGeometry(0.017, 0.017, 0.010, 28); rotor.rotateZ(Math.PI / 2); rotor.translate(x - s * 0.039, tubeY, tz);
    g.add(mesh(rotor, M.socket));
    const slot = new THREE.BoxGeometry(0.002, 0.024, 0.0035); slot.translate(x - s * 0.0445, tubeY - 0.004, tz); g.add(mesh(slot, M.pin));
  }
  // parafuso de fixação visível na tampa
  const sc = new THREE.CylinderGeometry(0.0035, 0.0035, 0.002, 12); sc.rotateX(Math.PI / 2); sc.translate(x - s * 0.017, -depth * 0.42, wid / 2 + 0.003); g.add(mesh(sc, M.screw));
  return g;
}

// ---------- modelos ----------
function modelTube(len, M) {
  // calha de sobrepor 1×T8: perfil estreito de chapa branca, tampas nas pontas, soquetes G13, tubo LED 1,2 m
  const g = new THREE.Group(); const cw = 0.052, ch = 0.030, capD = 0.068, tubeY = -0.047;
  const body = rbox(len - 0.064, ch, cw, 0.006); at(body, 0, -ch / 2, 0); g.add(mesh(body, M.paint));
  // dobra/friso longitudinal sob a calha (base do reator/driver) — dá leitura de chapa dobrada
  const lip = rbox(len - 0.10, 0.006, cw * 0.62, 0.002); at(lip, 0, -ch - 0.002, 0); g.add(mesh(lip, M.paint));
  for (const s of [-1, 1]) g.add(endCapWithSocket(M, s * len / 2, s, cw, capD, tubeY, [0]));
  const tlen = len - 0.090;
  const t = tubeT8(tlen, M, true); t.position.set(0, tubeY, 0); g.add(t);
  g.userData = { kind: 'tube', emit: { w: 0.026, l: tlen, y: tubeY - 0.013 }, tubeArea: tlen * 0.026, tubes: 1 };
  return g;
}
function modelTube2(len, wid, M) {
  const g = new THREE.Group(); const cw = Math.max(0.12, Math.min(wid, 0.2)), ch = 0.036, capD = 0.074, tubeY = -0.054, dz = cw * 0.25;
  const body = rbox(len - 0.064, ch, cw, 0.007); at(body, 0, -ch / 2, 0); g.add(mesh(body, M.paint));
  // refletor central em “V” entre os dois tubos
  const tri = new THREE.Shape(); tri.moveTo(-cw * 0.22, 0); tri.lineTo(0, -0.018); tri.lineTo(cw * 0.22, 0); tri.closePath();
  const v = new THREE.ExtrudeGeometry(tri, { depth: len - 0.07, bevelEnabled: false }); v.rotateY(Math.PI / 2); at(v, -(len - 0.07) / 2, -ch, 0); g.add(mesh(v, M.paint));
  for (const s of [-1, 1]) g.add(endCapWithSocket(M, s * len / 2, s, cw, capD, tubeY, [-dz, dz]));
  const tlen = len - 0.090;
  for (const z of [-dz, dz]) { const t = tubeT8(tlen, M, true); t.position.set(0, tubeY, z); g.add(t); }
  g.userData = { kind: 'tube2', emit: { w: 2 * dz + 0.026, l: tlen, y: tubeY - 0.013 }, tubeArea: 2 * tlen * 0.026, tubes: 2 };
  return g;
}
function modelLouver(len, wid, M) {
  // luminária de sobrepor 2×T8 com refletor e aletas parabólicas de alumínio espelhado
  const g = new THREE.Group(); const W = Math.max(0.22, wid), D = 0.078, t = 0.0012;
  // caixa (chapa branca): tampo + laterais + cabeceiras, com aba inferior
  const top = rbox(len, 0.012, W, 0.004); at(top, 0, -0.006, 0); g.add(mesh(top, M.paint));
  for (const s of [-1, 1]) {
    const side = rbox(len, D, 0.010, 0.003); at(side, 0, -D / 2, s * (W / 2 - 0.005)); g.add(mesh(side, M.paint));
    const lip = rbox(len, 0.004, 0.016, 0.0015); at(lip, 0, -D + 0.002, s * (W / 2 - 0.011)); g.add(mesh(lip, M.paint));
    const end = rbox(0.010, D, W, 0.003); at(end, s * (len / 2 - 0.005), -D / 2, 0); g.add(mesh(end, M.paint));
    const lipE = rbox(0.016, 0.004, W, 0.0015); at(lipE, s * (len / 2 - 0.011), -D + 0.002, 0); g.add(mesh(lipE, M.paint));
  }
  // refletores laterais parabólicos (perfil no plano ZY, extrudados ao longo de X)
  const inner = W / 2 - 0.012, half = len / 2 - 0.012;
  const sideProfile = (s) => {
    const pts = []; const n = 14;
    for (let i = 0; i <= n; i++) { const k = i / n; const z = s * (0.035 + (inner - 0.035) * k); const y = -0.014 - (D - 0.016) * Math.pow(k, 1.7); pts.push([z, y]); }
    const sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1]); pts.forEach(([z, y]) => sh.lineTo(z, y));
    for (let i = n; i >= 0; i--) sh.lineTo(pts[i][0], pts[i][1] + t * 1.6); sh.closePath();
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 2 * half, bevelEnabled: false, curveSegments: 1 });
    geo.rotateY(Math.PI / 2); geo.translate(-half, 0, 0);   // perfil simétrico: o espelhamento x→−z é irrelevante
    return geo;
  };
  const refl = [sideProfile(1), sideProfile(-1)];
  // refletor central (cumeeira) entre os tubos
  const ridge = new THREE.Shape(); ridge.moveTo(-0.035, -0.012); ridge.quadraticCurveTo(-0.008, -0.016, 0, -0.036); ridge.quadraticCurveTo(0.008, -0.016, 0.035, -0.012); ridge.closePath();
  const rg = new THREE.ExtrudeGeometry(ridge, { depth: 2 * half, bevelEnabled: false, curveSegments: 8 }); rg.rotateY(Math.PI / 2); rg.translate(-half, 0, 0); refl.push(rg);
  // aletas transversais (perfil parabólico duplo no plano XY, extrudado ao longo de Z)
  const pitch = 0.068, nB = Math.max(2, Math.floor((2 * half) / pitch)), bh = 0.044;
  const blade = (() => {
    const sh = new THREE.Shape(); const n = 10; const pts = [];
    for (let i = 0; i <= n; i++) { const k = i / n; pts.push([-0.0045 * Math.pow(1 - k, 1.5) - 0.0008, -D + 0.004 + bh * k]); }
    sh.moveTo(pts[0][0], pts[0][1]); pts.forEach(([x, y]) => sh.lineTo(x, y));
    for (let i = n; i >= 0; i--) sh.lineTo(-pts[i][0], pts[i][1]); sh.closePath();
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 2 * inner, bevelEnabled: false, curveSegments: 1 }); geo.translate(0, 0, -inner); return geo;
  })();
  for (let i = 1; i < nB; i++) { const b = blade.clone(); b.translate(-half + (2 * half) * i / nB, 0, 0); refl.push(b); }
  // normaliza atributos (Extrude gera uv/normal; garante compatibilidade no merge)
  const merged = mergeGeometries(refl.map((x) => { const y = x.index ? x.toNonIndexed() : x; y.deleteAttribute('uv'); return y; }), false);
  merged.computeVertexNormals();
  g.add(mesh(merged, M.mirror));
  // dois tubos fluorescentes T8
  const tlen = len - 0.07, tz = W * 0.21;
  for (const z of [-tz, tz]) {
    const tb = tubeT8(tlen, M, false); tb.position.set(0, -0.030, z); g.add(tb);
    for (const s of [-1, 1]) { const so = rbox(0.022, 0.03, 0.032, 0.004); at(so, s * (len / 2 - 0.022), -0.026, z); g.add(mesh(so, M.socket)); }
  }
  g.userData = { kind: 'louver', emit: { w: W - 0.03, l: len - 0.03, y: -D + 0.001 }, tubeArea: 2 * tlen * Math.PI * 0.013, tubes: 2 };
  return g;
}
function modelPanel(size, M) {
  // painel LED 62×62 de embutir: moldura de alumínio + difusor opalino (edge-lit)
  const g = new THREE.Group(); const S = size, fw = 0.022, D = 0.012;
  const back = new THREE.BoxGeometry(S - 0.02, 0.006, S - 0.02); back.translate(0, -0.003, 0); g.add(mesh(back, M.paint));   // fica acima do difusor
  for (const [w, d, x, z] of [[S, fw, 0, S / 2 - fw / 2], [S, fw, 0, -S / 2 + fw / 2], [fw, S - 2 * fw, S / 2 - fw / 2, 0], [fw, S - 2 * fw, -S / 2 + fw / 2, 0]]) {
    const f = rbox(w, D, d, 0.003); at(f, x, -D / 2, z); g.add(mesh(f, M.frame));
  }
  const dif = new THREE.PlaneGeometry(S - 2 * fw + 0.002, S - 2 * fw + 0.002); dif.rotateX(Math.PI / 2); dif.translate(0, -D + 0.0025, 0);
  g.add(mesh(dif, M.diffuser));
  g.userData = { kind: 'panel', emit: { w: S - 2 * fw, l: S - 2 * fw, y: -D + 0.002 }, tubeArea: (S - 2 * fw) ** 2, tubes: 0 };
  return g;
}

const protoCache = new Map();
/** Protótipo (compartilhado) do modelo; o chamador usa .clone() (geometria/material compartilhados). */
export function lumModel(kind, len, wid, M) {
  const key = `${kind}|${len.toFixed(3)}|${wid.toFixed(3)}`;
  if (!protoCache.has(key)) {
    const m = kind === 'tube2' ? modelTube2(len, wid, M) : kind === 'louver' ? modelLouver(len, wid, M) : kind === 'panel' ? modelPanel(Math.max(len, wid), M) : modelTube(len, M);
    protoCache.set(key, m);
  }
  const p = protoCache.get(key); const c = p.clone(); c.userData = { ...p.userData }; return c;
}

/** Teto luminoso: forro de placas difusoras retroiluminadas em grelha de perfis T (24 mm). */
export function luminousCeiling(W, L, M, margin = 0.0) {
  const g = new THREE.Group(); const mod = 0.625;
  const w = W - 2 * margin, l = L - 2 * margin;
  const nx = Math.max(1, Math.round(w / mod)), nz = Math.max(1, Math.round(l / mod)); const dx = w / nx, dz = l / nz;
  const tiles = new THREE.PlaneGeometry(w, l); tiles.rotateX(Math.PI / 2);
  // UV por célula: cada placa recebe a textura inteira
  const uv = tiles.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * nx, uv.getY(i) * nz);
  tiles.translate(0, -0.020, 0); g.add(mesh(tiles, M.lumTile));
  const bars = [];
  for (let i = 0; i <= nx; i++) { const b = new THREE.BoxGeometry(0.024, 0.030, l); b.translate(-w / 2 + i * dx, -0.008, 0); bars.push(b); }
  for (let j = 0; j <= nz; j++) { const b = new THREE.BoxGeometry(w, 0.030, 0.024); b.translate(0, -0.0085, -l / 2 + j * dz); bars.push(b); }
  g.add(mesh(mergeGeometries(bars), M.tProfile));
  g.userData = { kind: 'luminous', w, l, nx, nz, y: -0.020 };
  return g;
}

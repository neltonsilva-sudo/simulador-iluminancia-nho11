// MARCAÇÃO — texturas procedurais (canvas) e shaders das marcas. Dono: MARCAÇÃO.
import * as THREE from 'three';
import { OV, OV_GLSL } from './mark_overlay.js';
// escala dos canvases das etiquetas (≈2× o tamanho exibido → nítido com mipmaps)
export const LS = 0.62;

export const GROUP_HEX = { P: '#ff5a36', T: '#2f9bff', Q: '#2ecc71', R: '#ffc23a' };
// cor de estado da leitura (≥ 70% de Ē = verde, abaixo = vermelho, sem valor = neutro)
export const STATE_HEX = { none: '#5d6b7e', meas: '#5b8fd6', ok: '#14c46c', bad: '#ff2e44' };
// cor do traço da faixa de estado na etiqueta (neutro claro sobre fundo escuro)
export const STATE_BAR = { none: '#d7dee7', meas: '#9cc2ff', ok: '#1fd67a', bad: '#ff3347' };
export const FONT = '"Inter", "SF Pro Display", "Helvetica Neue", system-ui, -apple-system, "Segoe UI", Arial, sans-serif';

let maxAniso = 8;
export function setAniso(renderer) { try { maxAniso = renderer.capabilities.getMaxAnisotropy(); } catch { /* */ } }

export function canvasTex(cv, srgb = true) {
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = Math.min(8, maxAniso);
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  return t;
}
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
export const shade = (hex, k) => { const c = new THREE.Color(hex); c.offsetHSL(0, 0, k); return '#' + c.getHexString(); };

/** Adesivo de marcação no teto: alvo de levantamento (quadrantes alternados), anel colorido e cruz. */
export function makeTargetTexture(hex) {
  const S = 512, c = mk(S, S), g = c.getContext('2d'); g.translate(S / 2, S / 2);
  // papel do adesivo com borda levemente acinzentada (corte)
  g.beginPath(); g.arc(0, 0, 252, 0, Math.PI * 2); g.fillStyle = '#2b333c'; g.fill();
  g.beginPath(); g.arc(0, 0, 243, 0, Math.PI * 2); g.fillStyle = '#ffffff'; g.fill();
  // anel externo na cor do grupo
  g.beginPath(); g.arc(0, 0, 226, 0, Math.PI * 2); g.lineWidth = 26; g.strokeStyle = hex; g.stroke();
  // quadrantes alternados (alvo topográfico)
  for (let k = 0; k < 4; k++) {
    g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 196, k * Math.PI / 2, (k + 1) * Math.PI / 2); g.closePath();
    g.fillStyle = k % 2 ? '#ffffff' : hex; g.fill();
  }
  g.beginPath(); g.arc(0, 0, 196, 0, Math.PI * 2); g.lineWidth = 5; g.strokeStyle = '#1b2129'; g.stroke();
  g.beginPath(); g.arc(0, 0, 98, 0, Math.PI * 2); g.lineWidth = 3; g.strokeStyle = 'rgba(27,33,41,.75)'; g.stroke();
  // cruz (retículo) que atravessa o adesivo
  g.strokeStyle = '#151a21'; g.lineCap = 'butt'; g.lineWidth = 7;
  g.beginPath(); g.moveTo(-244, 0); g.lineTo(-22, 0); g.moveTo(22, 0); g.lineTo(244, 0);
  g.moveTo(0, -244); g.lineTo(0, -22); g.moveTo(0, 22); g.lineTo(0, 244); g.stroke();
  // ponto central
  g.beginPath(); g.arc(0, 0, 13, 0, Math.PI * 2); g.fillStyle = '#151a21'; g.fill();
  g.beginPath(); g.arc(0, 0, 5, 0, Math.PI * 2); g.fillStyle = '#ffffff'; g.fill();
  return canvasTex(c);
}

/** Etiqueta do teto: pílula na cor do grupo com o nome (ex.: “R3”). Retorna {tex, aspect}. */
export function makeIdLabel(text, hex) {
  const H = 168, padX = 40; const c0 = mk(8, 8).getContext('2d'); c0.font = `800 108px ${FONT}`;
  const tw = Math.ceil(c0.measureText(text).width); const W = tw + padX * 2 + 24;
  const c = mk(Math.ceil(W * LS), Math.ceil(H * LS)), g = c.getContext('2d'); g.scale(LS, LS);
  g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 14; g.shadowOffsetY = 4;
  rrect(g, 12, 12, W - 24, H - 28, (H - 28) / 2); g.fillStyle = hex; g.fill();
  g.shadowColor = 'transparent';
  g.lineWidth = 6; g.strokeStyle = 'rgba(255,255,255,.95)'; g.stroke();
  g.font = `800 108px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 8; g.strokeStyle = 'rgba(10,14,20,.35)'; g.strokeText(text, W / 2, H / 2 - 5);
  g.fillStyle = '#ffffff'; g.fillText(text, W / 2, H / 2 - 5);
  return { tex: canvasTex(c), aspect: W / H, canvas: c };
}

/**
 * Etiqueta da leitura (plano de trabalho): chip do ponto + valor em lux + indicador de estado.
 * Redesenha num canvas existente (largura fixa) — retorna aspect útil.
 */
export const READ_W = 760, READ_H = 184;
export function drawReading(c, text, hex, valueStr, state) {
  const g = c.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height); g.setTransform(c.width / READ_W, 0, 0, c.height / READ_H, 0, 0);
  const H = READ_H, y0 = 14, h = H - 32;
  g.font = `800 100px ${FONT}`; const tw = Math.ceil(g.measureText(text).width);
  const chipW = tw + 64;
  let W = chipW + 24;
  if (valueStr) { g.font = `700 92px ${FONT}`; const vw = g.measureText(valueStr).width; g.font = `600 52px ${FONT}`; const uw = g.measureText('lux').width; W = Math.min(READ_W, chipW + 24 + 30 + vw + 16 + uw + 34 + 70); }
  const x0 = Math.round((READ_W - W) / 2) + 12; const w = W - 24;
  g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 16; g.shadowOffsetY = 5;
  rrect(g, x0, y0, w, h, 30); g.fillStyle = valueStr ? 'rgba(14,19,26,.92)' : hex; g.fill();
  g.shadowColor = 'transparent';
  if (valueStr) {
    // chip do ponto
    g.save(); rrect(g, x0, y0, w, h, 30); g.clip();
    g.fillStyle = hex; g.fillRect(x0, y0, chipW, h);
    // faixa de estado na base
    g.fillStyle = STATE_BAR[state] || STATE_BAR.meas; g.fillRect(x0 + chipW, y0 + h - 12, w - chipW, 12);
    g.restore();
  }
  g.lineWidth = 5; g.strokeStyle = 'rgba(255,255,255,.92)'; rrect(g, x0, y0, w, h, 30); g.stroke();
  g.textBaseline = 'middle'; g.textAlign = 'center';
  g.font = `800 100px ${FONT}`; g.lineWidth = 8; g.strokeStyle = 'rgba(10,14,20,.3)';
  const cx = valueStr ? x0 + chipW / 2 : x0 + w / 2;
  g.strokeText(text, cx, y0 + h / 2 - 3); g.fillStyle = '#fff'; g.fillText(text, cx, y0 + h / 2 - 3);
  if (valueStr) {
    let x = x0 + chipW + 30; g.textAlign = 'left';
    g.font = `700 92px ${FONT}`; g.fillStyle = '#ffffff'; g.fillText(valueStr, x, y0 + h / 2 - 6); x += g.measureText(valueStr).width + 14;
    g.font = `600 52px ${FONT}`; g.fillStyle = 'rgba(225,232,240,.85)'; g.fillText('lux', x, y0 + h / 2 + 8); x += g.measureText('lux').width + 26;
    // ícone de estado
    if (state === 'ok' || state === 'bad') {
      const r = 26, cy = y0 + h / 2 - 4; g.beginPath(); g.arc(x + r, cy, r, 0, Math.PI * 2); g.fillStyle = STATE_BAR[state]; g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 7; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath();
      if (state === 'ok') { g.moveTo(x + r - 12, cy + 1); g.lineTo(x + r - 3, cy + 10); g.lineTo(x + r + 13, cy - 9); }
      else { g.moveTo(x + r, cy - 13); g.lineTo(x + r, cy + 3); g.moveTo(x + r, cy + 13); g.lineTo(x + r, cy + 13.5); }
      g.stroke();
    }
  }
  return { x0, w };
}

/** Disco de leitura no plano de trabalho (desenhado em branco; tingido pela cor de estado). */
export function makeDiscTexture() {
  const S = 512, c = mk(S, S), g = c.getContext('2d'); g.translate(S / 2, S / 2);
  const grd = g.createRadialGradient(0, 0, 10, 0, 0, 240);
  grd.addColorStop(0, 'rgba(255,255,255,.34)'); grd.addColorStop(0.55, 'rgba(255,255,255,.16)'); grd.addColorStop(0.93, 'rgba(255,255,255,.30)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.beginPath(); g.arc(0, 0, 244, 0, Math.PI * 2); g.fillStyle = grd; g.fill();
  g.strokeStyle = '#fff';
  g.beginPath(); g.arc(0, 0, 230, 0, Math.PI * 2); g.lineWidth = 16; g.stroke();
  g.beginPath(); g.arc(0, 0, 196, 0, Math.PI * 2); g.lineWidth = 3; g.globalAlpha = 0.7; g.stroke(); g.globalAlpha = 1;
  for (let k = 0; k < 72; k++) { const a = k * Math.PI / 36, L = k % 18 === 0 ? 34 : k % 6 === 0 ? 20 : 10; g.lineWidth = k % 18 === 0 ? 7 : 3;
    g.beginPath(); g.moveTo(Math.cos(a) * 214, Math.sin(a) * 214); g.lineTo(Math.cos(a) * (214 - L), Math.sin(a) * (214 - L)); g.stroke(); }
  g.lineWidth = 4; g.globalAlpha = 0.85; g.beginPath(); g.moveTo(-150, 0); g.lineTo(-70, 0); g.moveTo(70, 0); g.lineTo(150, 0); g.moveTo(0, -150); g.lineTo(0, -70); g.moveTo(0, 70); g.lineTo(0, 150); g.stroke();
  g.globalAlpha = 1;
  // furo central (não cobre a fotocélula do luxímetro)
  g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(0, 0, 58, 0, Math.PI * 2); g.fill(); g.globalCompositeOperation = 'source-over';
  g.beginPath(); g.arc(0, 0, 60, 0, Math.PI * 2); g.lineWidth = 4; g.strokeStyle = '#fff'; g.stroke();
  return canvasTex(c);
}

/** Brilho radial (ponto do laser). */
export function makeGlowTexture() {
  const S = 128, c = mk(S, S), g = c.getContext('2d');
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.12, 'rgba(255,255,255,.95)'); grd.addColorStop(0.3, 'rgba(255,255,255,.35)'); grd.addColorStop(0.6, 'rgba(255,255,255,.08)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, S, S); return canvasTex(c);
}
/** Anel suave (onda de identificação / destaque). */
export function makeRingTexture() {
  const S = 256, c = mk(S, S), g = c.getContext('2d');
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(0.72, 'rgba(255,255,255,0)'); grd.addColorStop(0.86, 'rgba(255,255,255,1)'); grd.addColorStop(0.92, 'rgba(255,255,255,.6)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, S, S); return canvasTex(c);
}
/** Etiqueta de cota (“0,75 m”). */
export function makeDimLabel(text) {
  const H = 120, c0 = mk(8, 8).getContext('2d'); c0.font = `700 70px ${FONT}`; const W = Math.ceil(c0.measureText(text).width) + 76;
  const c = mk(Math.ceil(W * LS), Math.ceil(H * LS)), g = c.getContext('2d'); g.scale(LS, LS);
  g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 10; g.shadowOffsetY = 3;
  rrect(g, 8, 8, W - 16, H - 20, 18); g.fillStyle = 'rgba(250,251,252,.96)'; g.fill(); g.shadowColor = 'transparent';
  g.lineWidth = 4; g.strokeStyle = '#2a323c'; g.stroke();
  g.font = `700 70px ${FONT}`; g.fillStyle = '#1d242c'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, W / 2, H / 2 - 3);
  return { tex: canvasTex(c), aspect: W / H };
}

// ---------- shaders ----------
/** Feixe do laser (cilindro aberto): brilho por fresnel invertido, pulso descendo, desvanece perto da câmera. */
export function makeLaserMaterial(hex, { pow = 3, opacity = 0.9, additive = true } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(hex) }, uOpacity: { value: opacity }, uTime: { value: 0 }, uLen: { value: 1 }, uPow: { value: pow }, uFlow: { value: 0.25 }, uBoost: { value: 1 }, ...OV },
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec3 vV; varying float vY; varying float vD;
      void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); vY = position.y; vD = length(mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: OV_GLSL + /* glsl */`
      uniform vec3 uColor; uniform float uOpacity, uTime, uLen, uPow, uFlow, uBoost;
      varying vec3 vN; varying vec3 vV; varying float vY; varying float vD;
      void main(){
        float f = pow(abs(dot(normalize(vN), normalize(vV))), uPow);
        float y = vY * uLen;
        float flow = 1.0 - uFlow + uFlow * (0.5 + 0.5 * sin(y * 34.0 + uTime * 7.0));
        float near = smoothstep(0.35, 1.5, vD);
        float ends = smoothstep(0.0, 0.02, -y) ;
        gl_FragColor = vec4(ovMap(uColor * 0.62) * uBoost * (0.8 + 0.6 * f), f * uOpacity * flow * near * ends);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: false,
  });
}

/** Linhas de construção tracejadas (fitas no plano XZ), com revelação progressiva ao longo de cada segmento. */
export function makeDashMaterial(hex, opacity = 0.55) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(hex) }, uOpacity: { value: opacity }, uProgress: { value: 1 }, uDash: { value: 0.15 }, uDuty: { value: 0.58 }, ...OV },
    vertexShader: /* glsl */`
      attribute float aDist; attribute float aLen; attribute float aSide;
      varying float vDist; varying float vLen; varying float vSide;
      void main(){ vDist = aDist; vLen = aLen; vSide = aSide; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: OV_GLSL + /* glsl */`
      uniform vec3 uColor; uniform float uOpacity, uProgress, uDash, uDuty;
      varying float vDist; varying float vLen; varying float vSide;
      void main(){
        if (vDist > uProgress * (vLen + 0.4) - 0.2) discard;
        float ph = fract(vDist / uDash);
        float fw = max(fwidth(vDist / uDash), 1e-4);
        float dash = smoothstep(0.0, fw * 1.5, ph) * (1.0 - smoothstep(uDuty - fw * 1.5, uDuty, ph));
        float sw = max(fwidth(vSide), 1e-4);
        float edge = 1.0 - smoothstep(1.0 - sw * 1.5, 1.0, abs(vSide));
        float a = dash * edge * uOpacity;
        if (a < 0.003) discard;
        gl_FragColor = vec4(ovMap(uColor), a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6,
  });
}

/** Geometria de fitas a partir de segmentos [[x1,z1,x2,z2],...] (largura w, em y=0 do grupo). */
export function ribbonGeometry(segs, w = 0.014) {
  const pos = [], dist = [], len = [], side = [], idx = []; let v = 0;
  for (const [x1, z1, x2, z2] of segs) {
    const dx = x2 - x1, dz = z2 - z1, L = Math.hypot(dx, dz); if (L < 1e-4) continue;
    const nx = -dz / L * w / 2, nz = dx / L * w / 2;
    pos.push(x1 + nx, 0, z1 + nz, x1 - nx, 0, z1 - nz, x2 + nx, 0, z2 + nz, x2 - nx, 0, z2 - nz);
    dist.push(0, 0, L, L); len.push(L, L, L, L); side.push(1, -1, 1, -1);
    idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2); v += 4;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aDist', new THREE.Float32BufferAttribute(dist, 1));
  g.setAttribute('aLen', new THREE.Float32BufferAttribute(len, 1));
  g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
  g.setIndex(idx); g.computeBoundingSphere(); return g;
}

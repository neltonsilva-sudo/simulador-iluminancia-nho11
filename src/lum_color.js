// LUMINÁRIAS — cor da luz a partir da temperatura de cor correlata (TCC, K). Dono: LUMINÁRIAS.
// Lugar geométrico de Planck (aprox. cúbica de Kim et al., 2002) → xy CIE 1931 → XYZ (Y=1) → sRGB linear.
// O resultado é normalizado para luminância Y = 1, de modo que light.power/intensity continuam em lm/cd/nit reais.
import * as THREE from 'three';

export function cctToXY(T) {
  T = Math.min(25000, Math.max(1667, T || 6500));
  const t1 = 1e3 / T, t2 = t1 * t1, t3 = t2 * t1;
  const x = T <= 4000
    ? -0.2661239 * t3 - 0.2343589 * t2 + 0.8776956 * t1 + 0.179910
    : -3.0258469 * t3 + 2.1070379 * t2 + 0.2226347 * t1 + 0.240390;
  const x2 = x * x, x3 = x2 * x;
  const y = T <= 2222 ? -1.1063814 * x3 - 1.3481102 * x2 + 2.18555832 * x - 0.20219683
    : T <= 4000 ? -0.9549476 * x3 - 1.37418593 * x2 + 2.09137015 * x - 0.16748867
      : 3.081758 * x3 - 5.8733867 * x2 + 3.75112997 * x - 0.37001483;
  return [x, y];
}

/** THREE.Color (sRGB linear, espaço de trabalho do three) com luminância 1 para a TCC dada. */
export function cctColor(T, target = new THREE.Color()) {
  const [x, y] = cctToXY(T);
  const X = x / y, Y = 1, Z = (1 - x - y) / y;
  let r = 3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z;
  let g = -0.969266 * X + 1.8760108 * Y + 0.041556 * Z;
  let b = 0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z;
  r = Math.max(0, r); g = Math.max(0, g); b = Math.max(0, b);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b || 1;
  return target.setRGB(r / lum, g / lum, b / lum, THREE.LinearSRGBColorSpace);
}

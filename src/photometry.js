// FOTOMETRIA — API pública (contrato): física da luz + mapa isolux. Dono: FOTOMETRIA.
// O cálculo vive em photo_core.js (puro, sem THREE/DOM — testado por tools/photo_test.mjs); o visual em photo_isolux.js.
export { LUM_TYPES, REFLECT, MF, OPENINGS, illuminanceAt, illuminanceParts, computeGrid, intensityCurve, diagnostics, solve,
  setReflectances, setMF, setOpenings, openingsFromRoom, sunPatches, skyCondition, SUN, DAYLIGHT } from './photo_core.js';
export { buildIsolux } from './photo_isolux.js';

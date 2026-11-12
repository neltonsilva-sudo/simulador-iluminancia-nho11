// RENDER — ambiente (IBL) gerado a partir da PRÓPRIA sala + vigia de mudanças de cena. Dono: RENDER.
// Uma CubeCamera no centro da sala captura a sala iluminada pelas luminárias (HDR) → PMREM → scene.environment.
// Duas passadas = 2 rebatimentos (a 2ª captura já enxerga a sala iluminada pela 1ª): dá a luz indireta do teto/paredes
// e os reflexos no plástico das cadeiras e no porcelanato. Refeito com debounce quando a cena muda.
import * as THREE from 'three';

export function createEnv(renderer, scene, getRoom, hooks = {}) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const cubeRT = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType, generateMipmaps: false });
  const cubeCam = new THREE.CubeCamera(0.03, 60, cubeRT);
  let envRT = null, count = 0, bounces = 2, intensity = 1;

  function refresh() {
    const room = getRoom();
    cubeCam.position.set(0, Math.min(1.45, room.H * 0.55), 0);
    // o que não é "sala" fica fora da captura: marcadores translúcidos, isolux, objetos marcados
    const hidden = [];
    scene.traverse((o) => {
      if (!o.visible) return;
      const m = o.material;
      if (o.userData.noEnv || o.isSprite || (m && !Array.isArray(m) && m.transparent && !m.depthWrite)) { hidden.push(o); o.visible = false; }
    });
    hooks.before?.();
    const prevRT = renderer.getRenderTarget(), prevSh = renderer.shadowMap.autoUpdate, prevClip = renderer.clippingPlanes;
    renderer.clippingPlanes = [];
    scene.environment = null;
    for (let i = 0; i < bounces; i++) {
      cubeCam.update(renderer, scene);
      renderer.shadowMap.autoUpdate = false; // sombras já estão prontas após a 1ª face
      const rt = pmrem.fromCubemap(cubeRT.texture);
      if (envRT) envRT.dispose();
      envRT = rt;
      scene.environment = rt.texture;
      scene.environmentIntensity = intensity;
    }
    renderer.shadowMap.autoUpdate = prevSh;
    renderer.clippingPlanes = prevClip;
    renderer.setRenderTarget(prevRT);
    hooks.after?.();
    hidden.forEach((o) => (o.visible = true));
    count++;
  }

  // assinatura barata da cena: nº de objetos, luzes (intensidade, cor, visibilidade, posição), emissivos, sala
  function signature() {
    let n = 0, s = 0;
    scene.traverse((o) => {
      if (o.userData.noEnv) return;
      n++;
      if (!o.visible) { s += 0.37 * n % 7; return; }
      if (o.isLight) s += (o.intensity || 0) * 1.3 + o.color.r * 3 + o.color.g * 5 + o.color.b * 7 + o.position.x * 11 + o.position.z * 13 + o.position.y * 17;
      else if (o.isMesh) {
        const m = o.material;
        if (m && !Array.isArray(m) && m.emissive) s += (m.emissiveIntensity || 0) * (m.emissive.r + m.emissive.g + m.emissive.b) * 0.71;
        s += (o.position.x + o.position.y * 2 + o.position.z * 3) * 0.013;
      }
    });
    const r = getRoom();
    return `${n}|${s.toFixed(3)}|${r.L},${r.W},${r.H}`;
  }

  return {
    refresh, signature,
    get texture() { return envRT?.texture || null; },
    get count() { return count; },
    get bounces() { return bounces; }, set bounces(b) { bounces = Math.max(1, Math.min(3, b | 0)); },
    get intensity() { return intensity; }, set intensity(v) { intensity = v; scene.environmentIntensity = v; },
  };
}

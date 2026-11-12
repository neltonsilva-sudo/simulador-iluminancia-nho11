// RENDER — reflexo planar barato do piso (porcelanato brilhante). Dono: RENDER.
// Uma câmera-espelho (abaixo do plano y = 0) renderiza a cena em meia resolução, HDR, com mipmaps. Os materiais de piso
// recebem o reflexo pela API `stage.floorReflection.apply(material, {strength})`: o reflexo planar SUBSTITUI a radiância
// do envMap na BRDF de especular indireta da própria three (Fresnel + rugosidade corretos); o borrão segue a rugosidade.
// Se a SALA não chamar apply(), qualquer Mesh com `userData.floor === true` (ou nome /piso|floor/) é aplicado sozinho.
import * as THREE from 'three';

export function createFloorReflection(renderer, scene, opts = {}) {
  const rt = new THREE.WebGLRenderTarget(16, 16, {
    type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
  });
  const vcam = new THREE.PerspectiveCamera();
  const U = {
    uReflTex: { value: rt.texture }, uReflMatrix: { value: new THREE.Matrix4() }, uReflOn: { value: 0 },
    uReflLod: { value: 7.0 }, uReflTexel: { value: new THREE.Vector2(1 / 16, 1 / 16) },
  };
  const patched = new Set(); // materiais
  const floorMeshes = new Set();
  let scale = opts.scale ?? 0.5, enabled = opts.enabled ?? true, planeY = 0;

  const tmp = { n: new THREE.Vector3(0, 1, 0), cp: new THREE.Vector3(), tp: new THREE.Vector3(), la: new THREE.Vector3(), rot: new THREE.Matrix4(),
    view: new THREE.Vector3(), target: new THREE.Vector3(), plane: new THREE.Plane(), clip: new THREE.Vector4(), q: new THREE.Vector4() };

  function apply(material, o = {}) {
    if (!material || patched.has(material)) return material;
    if (!(material.isMeshStandardMaterial)) return material;
    patched.add(material);
    const mix = { value: o.strength ?? 1.0 };
    material.userData.floorReflection = mix;
    const prev = material.onBeforeCompile;
    const prevKey = material.customProgramCacheKey?.bind(material);
    material.onBeforeCompile = (shader, r) => {
      if (prev) prev.call(material, shader, r);
      Object.assign(shader.uniforms, U, { uReflMix: mix });
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform mat4 uReflMatrix;\nvarying vec4 vReflUv;')
        .replace('#include <project_vertex>', `#include <project_vertex>
          #ifdef USE_INSTANCING
            vReflUv = uReflMatrix * modelMatrix * instanceMatrix * vec4(transformed, 1.0);
          #else
            vReflUv = uReflMatrix * modelMatrix * vec4(transformed, 1.0);
          #endif`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform sampler2D uReflTex; uniform float uReflOn, uReflMix, uReflLod; uniform vec2 uReflTexel; varying vec4 vReflUv;`)
        .replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>
          #if defined( RE_IndirectSpecular )
          if (uReflOn > 0.5) {
            vec2 ruv = vReflUv.xy / vReflUv.w;
            // leve distorção pela normal perturbada (rejuntes/ondulação do porcelanato)
            ruv += (normal.xy - nonPerturbedNormal.xy) * 0.03;
            float lod = clamp(log2(1.0 + material.roughness * material.roughness * 260.0), 0.0, uReflLod);
            vec2 o = uReflTexel * exp2(lod) * 0.75;
            vec3 pr = textureLod(uReflTex, ruv, lod).rgb * 0.4
                    + textureLod(uReflTex, ruv + vec2( o.x,  o.y), lod).rgb * 0.15
                    + textureLod(uReflTex, ruv + vec2(-o.x,  o.y), lod).rgb * 0.15
                    + textureLod(uReflTex, ruv + vec2( o.x, -o.y), lod).rgb * 0.15
                    + textureLod(uReflTex, ruv + vec2(-o.x, -o.y), lod).rgb * 0.15;
            float edge = smoothstep(0.0, 0.03, ruv.x) * smoothstep(1.0, 0.97, ruv.x) * smoothstep(0.0, 0.03, ruv.y) * smoothstep(1.0, 0.97, ruv.y);
            radiance = mix(radiance, pr, clamp(uReflMix * edge, 0.0, 1.0));
            #ifdef USE_CLEARCOAT
              float lodc = clamp(log2(1.0 + material.clearcoatRoughness * material.clearcoatRoughness * 260.0), 0.0, uReflLod);
              vec3 prc = textureLod(uReflTex, ruv, lodc).rgb;
              clearcoatRadiance = mix(clearcoatRadiance, prc, clamp(uReflMix * edge, 0.0, 1.0));
            #endif
          }
          #endif`);
    };
    material.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|floorRefl';
    material.needsUpdate = true;
    return material;
  }

  function scan() { // auto-detecção dos pisos marcados
    scene.traverse((o) => {
      if (!o.isMesh) return;
      if (o.userData.floor === true || /(^|_|\b)(piso|floor)(\b|_|$)/i.test(o.name || '')) {
        floorMeshes.add(o);
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        ms.forEach((m) => apply(m));
      }
    });
    for (const o of floorMeshes) if (!o.parent) floorMeshes.delete(o);
    // materiais aplicados pela SALA também identificam seus meshes (para escondê-los no passe do espelho)
    if (patched.size) scene.traverse((o) => { if (o.isMesh && !Array.isArray(o.material) && patched.has(o.material)) floorMeshes.add(o); });
  }

  function setSize(w, h) { // drawing buffer
    const W = Math.max(64, Math.round(w * scale)), H = Math.max(32, Math.round(h * scale));
    rt.setSize(W, H); U.uReflTexel.value.set(1 / W, 1 / H);
  }

  function update(camera) {
    U.uReflOn.value = enabled && patched.size ? 1 : 0;
    if (!U.uReflOn.value) return;
    // câmera virtual (mesma matemática do Reflector da three, com plano y = planeY e normal +Y)
    const n = tmp.n, cp = tmp.cp.setFromMatrixPosition(camera.matrixWorld), rp = tmp.tp.set(cp.x, planeY, cp.z);
    if (cp.y < planeY + 0.01) { U.uReflOn.value = 0; return; }
    tmp.view.subVectors(rp, cp).reflect(n).negate().add(rp);
    tmp.rot.extractRotation(camera.matrixWorld);
    tmp.la.set(0, 0, -1).applyMatrix4(tmp.rot).add(cp);
    tmp.target.subVectors(rp, tmp.la).reflect(n).negate().add(rp);
    vcam.position.copy(tmp.view);
    vcam.up.set(0, 1, 0).applyMatrix4(tmp.rot).reflect(n);
    vcam.lookAt(tmp.target);
    vcam.far = camera.far; vcam.near = camera.near;
    vcam.updateMatrixWorld();
    vcam.projectionMatrix.copy(camera.projectionMatrix);
    const tm = U.uReflMatrix.value;
    tm.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    tm.multiply(vcam.projectionMatrix).multiply(vcam.matrixWorldInverse);
    // plano de corte oblíquo (nada abaixo do piso entra no reflexo)
    tmp.plane.setFromNormalAndCoplanarPoint(n, rp).applyMatrix4(vcam.matrixWorldInverse);
    const clip = tmp.clip.set(tmp.plane.normal.x, tmp.plane.normal.y, tmp.plane.normal.z, tmp.plane.constant);
    const pm = vcam.projectionMatrix, q = tmp.q;
    q.x = (Math.sign(clip.x) + pm.elements[8]) / pm.elements[0];
    q.y = (Math.sign(clip.y) + pm.elements[9]) / pm.elements[5];
    q.z = -1.0; q.w = (1.0 + pm.elements[10]) / pm.elements[14];
    clip.multiplyScalar(2.0 / clip.dot(q));
    pm.elements[2] = clip.x; pm.elements[6] = clip.y; pm.elements[10] = clip.z + 1.0 - 0.003; pm.elements[14] = clip.w;

    const vis = [];
    for (const o of floorMeshes) { vis.push(o.visible); o.visible = false; }
    const hidden = [];
    scene.traverse((o) => { if (o.visible && o.userData.noReflect) { hidden.push(o); o.visible = false; } });
    const prevRT = renderer.getRenderTarget(), prevSh = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    U.uReflOn.value = 0;
    renderer.setRenderTarget(rt); renderer.clear(); renderer.render(scene, vcam);
    renderer.setRenderTarget(prevRT);
    renderer.shadowMap.autoUpdate = prevSh;
    U.uReflOn.value = 1;
    let i = 0; for (const o of floorMeshes) o.visible = vis[i++];
    hidden.forEach((o) => (o.visible = true));
  }

  return {
    texture: rt.texture, uniforms: U, apply, scan, update, setSize,
    get enabled() { return enabled; }, set enabled(b) { enabled = !!b; },
    get scale() { return scale; }, set scale(s) { scale = s; },
    get planeY() { return planeY; }, set planeY(y) { planeY = y; },
    suspend(b) { U.uReflOn.value = b ? 0 : (enabled && patched.size ? 1 : 0); },
    get count() { return patched.size; },
  };
}

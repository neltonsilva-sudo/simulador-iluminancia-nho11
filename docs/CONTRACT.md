# Contrato dos módulos (API exata — `src/main.js` já chama estas funções)

| Dono | Arquivos | API exportada |
|---|---|---|
| ORQUESTRADOR | main.js, norm.js, index.html | — (não editar) |
| RENDER | scene.js (+ scene_*.js) | `createStage(canvas,{quality,still})` → stage |
| SALA | room.js (+ room_*.js) | `buildRoom(stage, room)` → `{group, update(room)}` |
| MOBILIÁRIO | furniture.js (+ furniture_*.js) | `buildFurniture(stage, room)` → `{group, update(room, lums), setVisible(b)}` |
| LUMINÁRIAS | luminaires.js (+ lum_*.js) | `buildLuminaires(stage)` → `{group, update(list, room, spec), setOn(b), setDim(f)}` |
| FOTOMETRIA | photometry.js (+ photo_*.js) | `LUM_TYPES`, `REFLECT`, `MF`, `illuminanceAt(x,y,z,lums,room,spec)`, `buildIsolux(stage)` → `{group, update(lums,room,spec), setVisible(b)}` |
| MARCAÇÃO | markers.js (+ mark_*.js) | `buildMarkers(stage)` → `{group, show(points, room, {animate,config}), hide(), setValues(values, bands), highlight(id), luxmeterTo(id\|null), onPick(fn)}` |
| UI | ui.js, ui.css (+ ui_*.js) | `createUI(root, app)` |
| QUADRO1 | norm_quadro1.js | `QUADRO1 = [{id, grupo, nome, E, IRC, obs}]` |

## stage (RENDER)
`{THREE, renderer, scene, camera, controls, canvas, room, setRoom(room), onFrame(fn(dt,t)), setView(name, opts)}`
Vistas: `ref1` (mesmo enquadramento da foto: do fundo da sala, perto da porta, olhando para z=−L/2, altura de olhos, teto
ocupando ~55% da imagem), `overview`, `top` (planta), `ceiling`, `point:<id>` (opts.target={x,z} opcional — RENDER deve
buscar o ponto em `window.__sim.points()` se não vier), `orbit` (opts.orbit="ang,h,r,tx,ty,tz,fov"). Animação suave
quando opts.animate. Mais: `stage.addPostPass?`, `stage.setExposure(v)`. `window.__fps` deve ser atualizado.

## spec (luminárias / fotometria)
`spec = {...LUM_TYPES[i], flux, cct, on, dim, config}` — `flux` em lm por luminária, `cct` em K. `config===6` → teto
luminoso (lista vazia; LUMINÁRIAS desenha um forro difusor luminoso e FOTOMETRIA usa o fluxo distribuído).

## app (para a UI) — `window.__sim`
`state` {room{L,W,H,plane}, config, N, M, lum{type,flux,cct,on,dim}, envId, Emin, continuous, values{p1..}, task[],
showPoints, showIsolux, view}; `set(patch)` (mescla profunda e recalcula); `on('change'|'identify'|'pick', fn)`;
`luminaires()`, `points()`, `results()` → `{E, groups{P,T,Q,R}, formula, expanded, missing, ok, checks[{id,label,ok,detail}],
verdict:'atende'|'nao-atende'|'incompleto', bands{E15,lim70,lim70_15,minReq}, area, areaBand, Emin, env}`;
`identify()`, `simulate()`, `loadExample('planilha'|'anexo4')`, `setView(v)`, `focusPoint(id)`,
`simulatedLux(x,z)`; `NORM`, `QUADRO1`, `LUM_TYPES`, `THREE`.

## FOTOMETRIA (detalhes — photometry.js reexporta photo_core.js, puro/sem THREE, e photo_isolux.js)
- `computeGrid(lums, room, spec, step=0.25, {y?, nx?, nz?})` → `{xs, zs, nx, nz, y, E: Float32Array (E[j*nx+i] ↔ zs[j], xs[i]),
  Emin, Emax, Emed (média por área, centros de células), U0 = Emin/Emed}`.
- `illuminanceParts(x,y,z,lums,room,spec)` → `{direct, indirect, total}` (lux; sensor horizontal com correção de cosseno).
- `LUM_TYPES[i]` ganhou campos fotométricos: `dist` ('tube'|'louver'|'panel'), `phiC` (corte lateral, °), `lines`, `lineGap`,
  `drop` (m abaixo do teto), `lumFrac`, `note`. Tipo padrão 'led-t8-1x18' calibrado: 2.100 lm, LOR 0,92 → sala padrão 2×4:
  pontos 182–248 lux, Ē(NHO) ≈ 210 lux (planilha real 203,7), Ē(NHO) = média real da grade ±0,5 %.
- `REFLECT` {ceiling .80, walls .70, floor .30} e `MF` (.80): altere com `setReflectances({...})` / `setMF(v)` (invalidam o
  cache). `spec.mf` sobrepõe MF por chamada. `OPENINGS` (4 janelas esq., 3 janelas + porta dir., ρ 0,10/0,50) via `setOpenings([])`.
- Teto luminoso (config 6): fluxo total = `spec.count` × flux (se ausente: `__sim.state.N×M`, senão 8).
- `intensityCurve(spec)` → `{gamma[], C0[], C90[]}` em cd/klm (para gráfico polar). `diagnostics(lums,room,spec)` → balanço de fluxo,
  nº de patches, fechamento ΣF, iterações.
- `buildIsolux(stage)` → `{group, legend (canvas DOM .photo-isolux-legend), update, setVisible, stats() → {Emin,Emax,Emed,U0,nx,nz},
  levels()}`. Cálculo 128×199 em Web Worker (photo_worker.js) com debounce; desenhado num passe próprio DEPOIS do tone mapping
  (photo_overlay.js), imediatamente antes do passe de etiquetas da MARCAÇÃO; marcas da MARCAÇÃO são redesenhadas por cima.
  Legenda: canto inferior esquerdo sem UI; com `#ui` visível, inferior direito (bottom 84px). Teste: `node tools/photo_test.mjs`.

## Parâmetros de URL (capturas)
`cam=ref1|overview|top|ceiling|orbit&orbit=…`, `ui=0`, `pts=1` (pontos visíveis), `iso=1`, `ex=planilha|anexo4`,
`cfg=1..6`, `N=`, `M=`, `sim=1` (preenche leituras simuladas), `q=alta|media`, `still=1`.

# Contrato dos módulos (API exata — `src/main.js` já chama estas funções)

| Dono | Arquivos | API exportada |
|---|---|---|
| ORQUESTRADOR | main.js, norm.js, index.html | — (não editar) |
| RENDER | scene.js (+ scene_*.js) | `createStage(canvas,{quality,still})` → stage |
| SALA | room.js (+ room_*.js) | `buildRoom(stage, room)` → `{group, update(room)}`; `getOpenings(room)` (pura) |
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
RENDER (adições, implementadas): `stage.setExposure(v)` = compensação linear sobre a exposição calibrada (1 = padrão;
`'auto'` remede). Exposição física K=0,019 (Ē≈220 lx → paredes ≈200/255), tone mapping Neutral; AE de celular com limites
(K_PHYS/60 … 1,25·K_PHYS, faixa morta ±60% à noite) medido sempre pelo quadro ref1 → igual em todas as vistas; reavaliado a
cada mudança de cena / evento `daylight`. `stage.exposure`, `stage.exposureTarget`, `stage.setToneMapping('neutral'|'agx'|'aces')`.
`stage.refreshEnv()` — IBL PMREM capturado da própria sala (2 rebatimentos); chamado sozinho com debounce quando a cena muda.
`stage.floorReflection.apply(material,{strength})` — reflexo planar (radiância especular + clearcoat); auto-aplicado a
meshes com `userData.floor===true` ou nome /piso|floor/ (SALA: `room.floor` já é detectado).
Marcas por objeto: `userData.noAO` (sem AO), `userData.noEnv` (fora da captura IBL), `userData.noReflect` (fora do reflexo).
Geometria fina (barra/tubo: 2ª dimensão < 6 cm) recebe AO reduzida automaticamente.
`stage.shadowBudget` {max: 4|2, mapSize: 1024|512} — luzes com sombra além do orçamento têm castShadow desligado.
`stage.setInsets({left})` / `null` = auto — área coberta pela UI à esquerda; vistas point/top/overview/ceiling centram na
área livre (setViewOffset). Guarda HDR global: nenhum material grava NaN/Inf nem > 30000 (limite do HalfFloat).
Orçamento de desempenho: cada RectAreaLight (LTC) custa ~3 ms a 1280×720 → manter ≤ 8 por cena; MSAA desligado (SMAA).
ref1 calibrada na foto (sobreposição de bordas + 13 marcos): câmera em x=−1,90, z=−L/2+8,65, y=1,60, guinada 22° à direita,
+5° para cima, FOV vertical 47°; a foto é um 4:3 reamostrado para 906×358 (squash 1,8 só quando o canvas tem proporção ≥ 2,2:1).
URL: `tm=` tone mapping, `exp=` compensação, `wb=r,g,b`, `pr=` resolução fixa, `r1=back,x,h,yaw,pitch,vfov,squash` (calibração).

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
- Teto luminoso (config 6): fluxo total = `spec.count` × flux (se ausente: `__sim.state.N×M`, senão 8). O worker recebe o spec inteiro (count incluso).
- **Luz natural** `spec.daylight` (0..1, padrão 0 = noite, condição mais desfavorável exigida pela NHO-11): janelas de `OPENINGS` viram fontes
  difusas na radiosidade com exitância = daylight · `spec.daylightLux` (padrão `DAYLIGHT.extLux` = 10 000 lx, dia nublado) · 0,40 (E_vert/E_hor,
  céu encoberto CIE) · 0,62 (vidro × caixilho/grade). Sala padrão, daylight 1, luminárias desligadas: ≈450–490 lux junto às janelas, 242 lux no
  centro (FLD ≈ 2,4 %). Superpõe-se linearmente às luminárias; funciona com `on:false`. Em `illuminanceParts` a luz natural entra em `indirect`.
- **Condição da avaliação** (spec do orquestrador): `period` ('noturno'|'diurno'), `sky` ('nublado'|'ensolarado'), `daylight` (0|1|2,5).
  `skyCondition(spec)` → `{day, sunny, daylight, label:'Noturna'|'Diurna · nublado'|'Diurna · ensolarado'}`; 'noturno' força 0.
  Nublado = céu CIE encoberto 10 klx (janelas difusas). Ensolarado = difusa ×2,5 + **sol direto** (`SUN` = {alt 35°, az 20° rumo a +z,
  Edn 70 klx, τ 0,62}, manhã, entrando pelas janelas da parede x = −W/2): o sensor recebe Edn·τ·sen(alt) ≈ 24,9 klx quando o raio para o sol
  passa por uma janela (sem sombra de móveis); o fluxo solar (raios das janelas até piso/parede) entra na radiosidade.
  Sala padrão: Ē(NHO) noturna 208 · nublada 513 · ensolarada 2.146 lux; fator de luz diurna nublado médio 3,4 % (mín 1,2 %).
- `sunPatches(room, spec, y = room.plane)` → `[{pts:[[x,z],…], y, E}]` — manchas de sol no plano horizontal y (use y = 0 para o piso),
  já recortadas pela sala; [] sem sol. Mesma geometria usada no cálculo (para LUMINÁRIAS/RENDER desenharem).
- `OPENINGS` (disposição atual: esquerda = porta junto à frente + 3 janelas 1,30×0,95 m, peitoril 1,25; direita = 4 janelas). Quando
  room.js exportar `getOpenings(room)`, o isolux converte (`openingsFromRoom`, formato tolerante) e chama `setOpenings` automaticamente.
- Isolux com sol: escala de cores logarítmica (Emín…Emáx, ticks 500/1k/2k/5k/10k…), isolinhas só da escala NHO até ~1.000 lx, manchas de
  sol com contorno âmbar tracejado e rótulo “sol direto ≈ 24.900 lx”; legenda mostra a condição (“Diurna · ensolarado”).
- **Fator por luminária** `spec.lumFactors = { 'L1.1': 0, 'L2.3': 0.55, … }` (ids de `layoutLuminaires`; 0 = queimada, <1 = depreciada,
  limite 0..2): multiplica a intensidade daquela luminária (direta + radiosidade). O isolux desenha a luminária queimada com ×, a depreciada em cinza.
- `primeGeometry(room, data)` / `geometryData(room)` / `hasGeometry(room)`: fatores de forma (reciprocidade, ≤120 ms) pré-calculados no worker
  a cada `isolux.update` com sala nova. Obs.: LUMINÁRIAS chama `solve()` sincronamente no próprio update (antes do isolux), então a 1ª sala nova
  ainda custa ≈ 70–120 ms (geometria) + ≈ 40 ms (solução) na thread principal.
- Isolux: escala de cores ANCORADA em 0 … ≥ max(Emáx, `__sim.state.Emin`) (Quadro 1); recolore ao trocar o ambiente (`app.on('change')`).
  Legenda “Simulação (luxímetro virtual)” com marcas de Ē, 70 % Ē e Quadro 1, colchete Emín–Emáx e “exigido”.
- `intensityCurve(spec)` → `{gamma[], C0[], C90[]}` em cd/klm (para gráfico polar). `diagnostics(lums,room,spec)` → balanço de fluxo,
  nº de patches, fechamento ΣF, iterações.
- `buildIsolux(stage)` → `{group, legend (canvas DOM .photo-isolux-legend), update, setVisible, stats() → {Emin,Emax,Emed,U0,nx,nz},
  levels()}`. Cálculo 128×199 em Web Worker (photo_worker.js) com debounce; desenhado num passe próprio DEPOIS do tone mapping
  (photo_overlay.js), imediatamente antes do passe de etiquetas da MARCAÇÃO; marcas da MARCAÇÃO são redesenhadas por cima.
  Legenda: canto inferior esquerdo sem UI; com `#ui` visível, inferior direito (bottom 84px). Teste: `node tools/photo_test.mjs`.

## Parâmetros de URL (capturas)
`cam=ref1|overview|top|ceiling|orbit&orbit=…`, `ui=0`, `pts=1` (pontos visíveis), `iso=1`, `ex=planilha|anexo4`,
`cfg=1..6`, `N=`, `M=`, `sim=1` (preenche leituras simuladas), `q=alta|media`, `still=1`.

## SALA — aberturas (`import { getOpenings } from './room.js'`)
`getOpenings(room)` é PURA (só depende de `{L, W, H}`; não precisa do stage) e devolve
`[{kind:'window'|'door', wall:'left'|'right'|'front'|'back', x, z, width, sill, head}]` em metros, coordenadas do SPEC
(origem no centro do piso). `x, z` = centro do vão no plano interno da parede (left: x=−W/2; right: x=+W/2);
`width` ao longo da parede; `sill`/`head` = alturas do peitoril e da verga (porta: sill=0).
Layout (pedido do usuário): parede esquerda x=−W/2 → PORTA no lugar da 1ª janela (a mais próxima de z=−L/2) + demais
janelas; parede direita x=+W/2 → n janelas (padrão 9,16 m: esquerda 3 janelas + porta, direita 4 janelas).
Janela padrão 1,30 × 0,95 m (verga 2,20 m, peitoril 1,25 m); porta 0,84 × 2,10 m. `n = max(1, round(L/2,29))`.
A vista pelas janelas segue `__sim.state.avaliacao` ({periodo, ceu}) e o evento `'daylight'` (SALA não cria luzes).

## MARCAÇÃO — luxímetro "LED Light Meter" (mark_luxmeter.js + mark_lux_lcd/tex/geo/api.js) e `window.__lux`
Réplica do aparelho do usuário (refs/lux/, sem marca): corpo 16,5×6,4×3,1 cm num berço preso à coluna do tripé (visor
voltado à câmera), fotocélula com o TOPO DA CÚPULA exatamente em room.plane (0,75 m), tampa presa por cordão, cabo
espiralado físico. Teclas: POWER, LX/FC·CD (`unit`), MEM·READ (curto `mem` grava até 99 + grava o campo; longo `read`),
HOLD·L.S. (curto `hold`; longo `source`), ▲ `up`, ZERO `zero` (só com tampa), ▼ `down`. Clique longo (>650 ms) no 3D.
Fontes (2ª linha "L1 1.000"): L1 LED branco 1,000 (padrão = sala) · L2 Fluorescente 0,975 · L3 Vapor metálico 0,962 ·
L4 Vapor de sódio 0,947 · L5 Incandescente 1,018 · L6 Luz do dia 1,012. Visor estável = `__sim.readLuxmeter(id) × fator`
(com L1: exatamente readLuxmeter; varia só nos ~1,6 s de estabilização). REC (botão "Registrar leitura") e MEM gravam o
VALOR EXIBIDO via `__sim.set({values})` (REC também emite `'record'`). Tampa colocada → ~0,5 lx (escuro) ou 0,0 após ZERO.
`window.__lux = { power(on?), press(name, {long}?) /* 'power'|'source'|'hold'|'mem'|'zero'|'up'|'down' (+'read','unit','rec') */,
setCap(bool), state(), focus(part, {duration}?) → Promise<bool> /* 'body'|'lcd'|'sensor'|'cap'|'back'|'tripod'|tecla */,
unfocus() → Promise, showBack(bool), onChange(fn) → unsubscribe, sources, setSource(code|idx), clearMem(), record(), place(id) }`.
`state()` = `{on, hold, source:{code,name,factor,index}, zeroed, cap, reading /* lux exibido (HOLD → congelado) */, unit,
mode:'meas'|'read', readIndex, display:[linha1, linha2] /* ex. "185.0 Lux","L1 1.000" */, mem:[{no,v,unit,src,factor,id,t}],
id, stable, back, msg, roomSource, visible}`. Sem ponto ativo, `focus`/`press` posicionam o aparelho no ponto ativo ou p1.
`focus` trava a guinada do tripé, faz close com a vista `orbit` animada e contorno Fresnel pulsante; `unfocus` volta a `point:<id>`.

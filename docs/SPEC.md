# Gêmeo digital — simulador de cálculo de iluminância (NHO-11 Fundacentro, 2018)

## Referências
- `refs/ref1_sala.png` — FOTO REAL (906×358) da sala de aula: sala modular, paredes de painéis brancos lisos com juntas
  verticais finas, teto plano de placas brancas com perfis metálicos cinza (vigas/caibros em C e uma grelha de perfis),
  2 filas × 4 luminárias tubulares LED de sobrepor (barras finas, orientadas TRANSVERSALMENTE à sala, ao longo de X),
  ~40 cadeiras universitárias azuis (concha plástica azul royal, prancheta clara bege/cinza, estrutura tubular cinza),
  piso porcelanato cinza-claro brilhante em placas grandes, janelas basculantes com grade (parede direita), quadros
  azuis com moldura (A3) nas paredes, interruptor escuro na parede do fundo. Luz fria (~6500 K), sem luz do dia.
- `refs/ref2_croqui_planilha.png` — croqui da planilha do usuário: sala 9,16 m × 5,90 m, 2 filas de 4 luminárias,
  8 janelas (4 por parede lateral longa: parede esquerda com 4, direita com 3 + porta perto do fim), pontos P/T/Q/R.
- `refs/nho_figA1..A7.jpg` — figuras do Anexo 1 e 4 da NHO-11. Texto integral: `docs/nho11.txt`.

## Coordenadas (metros) — iguais para todos os módulos
Origem no centro do piso. X = largura W (x = −W/2 parede esquerda, das janelas do croqui), Z = comprimento L
(z = −L/2 parede do fundo/“frente da sala”, onde ficam o quadro e o interruptor; z = +L/2 parede de entrada, porta no
lado x>0 perto de z=+L/2). Y para cima; teto em y = H (padrão 2,70 m); plano de trabalho y = 0,75 m.
Padrão: L = 9,16, W = 5,90, H = 2,70, N = 4 luminárias por fila (ao longo de Z), M = 2 filas.
Luminárias: `norm.layoutLuminaires()` → `{x,z,len,wid,axis}`; axis 'x' = barra transversal (foto); 'z' = linha contínua.
Pontos: `norm.measurementPoints()` → `{id,group,label,x,z,note}` (P, T, Q, R). A marcação no teto é (x, H, z) e a
leitura é feita no plano (x, 0,75, z).

## Método (NHO-11, Anexo 1) — implementado em src/norm.js (NÃO alterar sem o orquestrador)
1. Fileiras regulares (2+): Ē = [R(N−1)(M−1) + Q(N−1) + T(M−1) + P]/(N·M) — r1..r8, q1..q4, t1..t4, p1, p2.
   Validação: planilha → 203,73 lux; Anexo 4 (N=3, M=2) → 494,17 lux.
2. Luminária central: Ē = média de p1..p4.  3. Linha única: Ē = [Q(N−1)+P]/N (q1..q8, p1, p2).
4. Linhas contínuas (2+): Ē = [R·N(M−1) + Q·N + T(M−1) + P]/[M(N+1)].  5. Uma linha contínua: Ē = [Q·N+P]/(N+1).
6. Teto luminoso: Ē = [R(L−2,4)(W−2,4) + 2,4Q(L−2,4) + 2,4T(W−2,4) + 5,76P]/(W·L).

## Critérios (item 5) + planilha
- Ē ≥ E do Quadro 1 (tolerância de 10% abaixo). Pontos da área da tarefa ≥ 70% de Ē. Maior leitura/Ē ≤ 5:1
  (não se aplica > 2.500 lux). Tarefas contínuas ≥ 200 lux. Entorno imediato (Tabela 1) com iluminação suplementar.
- Planilha: área ±3%; Ē com faixa ±15%; 70% de Ē com faixa ±15%. Medições a 0,75 m do piso, fotocélula horizontal.
- Escala de iluminância (5.1): 20…5000; subir 1 nível (trabalho crítico, visão abaixo do normal, baixo contraste).

## Funcionalidades pedidas pelo usuário
- Escolher a quantidade de luminárias (N por fila × M filas) e a configuração do Anexo 1.
- Escolher o tipo de ambiente (Quadro 1 completo, com busca) → E mínimo e IRC.
- Botão “Identificar pontos”: marca no TETO P1, P2, T1–T4, Q1–Q4, R1–R8 (e a projeção no plano a 0,75 m).
- Campos para digitar os valores medidos de cada ponto; cálculo automático de P, T, Q, R, Ē, 70%, faixas, parecer.
- Extras: “Simular leituras” (luxímetro virtual com cálculo físico), mapa isolux, croqui 2D, relatório imprimível,
  exemplos (planilha e Anexo 4). SEM logotipo do SENAI ou de qualquer instituição (pedido explícito do usuário).

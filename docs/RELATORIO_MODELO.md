# Modelo do relatório técnico — extraído da planilha do usuário (aba "RELATORIO TEC. ILUMINANCIA-EAD")

Pedido do usuário: "crie um botão onde será emitido o relatório técnico com o parecer; siga o modelo de relatório que
está no Excel". Seguir a ESTRUTURA, a ORDEM, os TÍTULOS e o ESTILO abaixo. Sem logotipo (o usuário retirou a logo do
SENAI): a linha de cabeçalho institucional vira um campo editável "Instituição / empresa avaliadora" (vazio por padrão).
Corrigir os erros de digitação do modelo (1078→1978, TEM→MTE, ANTI-ERGONONICO→ANTIERGONÔMICO, adoatando→adotando,
equpamentos→equipamentos, luximentro→luxímetro, sujicidades→sujidades, ambiete→ambiente, tolerânciade→tolerância de,
correspondentea→correspondente a, "no diz respeito"→"no que diz respeito", "adenda"→"subitem").

## Layout (planilha: colunas B–F, larguras B≈35,6 e F≈41,9; Calibri)
1. Linha 2 — cabeçalho institucional, negrito 14 pt, centralizado (campo editável, sem logo).
2. Linha 3 — faixa AZUL-MARINHO (#002060) com texto branco negrito 14 pt centralizado:
   **RELATÓRIO TÉCNICO DA AVALIAÇÃO DE ILUMINÂNCIA - NHO-11**
3. Linha 4 — faixa VERDE (#00B050), negrito 16 pt centralizado: **INFORMAÇÕES DA EMPRESA**
4. Grade de campos (11 pt, rótulo + valor, 2 colunas):
   RAZÃO SOCIAL: | CNPJ: / NOME FANTASIA: | CONTATO: / ENDEREÇO: (linha inteira) / CNAE: | GRAU DE RISCO: /
   NÚMERO DE TRABALHADORES: | HORÁRIO DE TRABALHO: / RESPONSÁVEL PELA EMPRESA: (linha inteira)
5. Seções numeradas, título negrito 16 pt (faixa de cor de tema clara na planilha), corpo 13–14 pt justificado:

### 1. INTRODUÇÃO
"Este trabalho tem como objetivo avaliar a iluminância do(a) {ambiente/identificação do local} de forma a atender a
NR-17 (MTE), no que diz respeito à Ergonomia, conforme o item 17.8, subitens 17.8.1 e 17.8.3, como segue: “Em todos os
locais e situações de trabalho deve haver iluminação, natural ou artificial, geral ou suplementar, apropriada à
natureza da atividade.”
“Em todos os locais e situações de trabalho internos, deve haver iluminação em conformidade com os níveis mínimos de
iluminamento a serem observados nos locais de trabalho estabelecidos na Norma de Higiene Ocupacional nº 11 (NHO 11) da
Fundacentro – Avaliação dos Níveis de Iluminamento em Ambientes Internos de Trabalho, versão 2018.”
Dessa forma, segundo as características de cada ambiente, sob o ponto de vista da ergonomia, identificar os pontos de
melhoria para o conforto na execução das atividades nos ambientes laborais desta unidade, adotando as diretrizes de
segurança e saúde ocupacional, visando ao bem-estar dos trabalhadores.
Justificativa: este trabalho foi realizado visando à adoção de medidas de controle e à melhoria das condições de
trabalho no que tange a questões de iluminância na unidade {unidade}, conforme estabelecido na NR-17 – Ergonomia, da
Portaria nº 3.214 de 1978.
“17.8 Condições de conforto no ambiente de trabalho:
17.8.1 Em todos os locais e situações de trabalho deve haver iluminação, natural ou artificial, geral ou suplementar,
apropriada à natureza da atividade.
17.8.2 A iluminação deve ser projetada e instalada de forma a evitar ofuscamento, reflexos incômodos, sombras e
contrastes excessivos.
17.8.3 Em todos os locais e situações de trabalho internos, deve haver iluminação em conformidade com os níveis mínimos
de iluminamento a serem observados nos locais de trabalho estabelecidos na Norma de Higiene Ocupacional nº 11 (NHO 11)
da Fundacentro – Avaliação dos Níveis de Iluminamento em Ambientes Internos de Trabalho, versão 2018.”

### 2. EQUIPAMENTO UTILIZADO
"Para a realização desta avaliação foram utilizados os seguintes equipamentos:" + lista editável. Padrão:
- Luxímetro {modelo/fabricante — campo editável; padrão em branco "________"}, com certificado de calibração nº {campo}.
- Microcomputador.
- Calculadora científica.
- Tripé para apoio do luxímetro.

### 3. CRITÉRIOS E PROCEDIMENTOS
"O critério utilizado para avaliação do nível de iluminamento no(a) {local} é a medição ponto a ponto nas diferentes
tarefas e a comparação com os valores mínimos exigidos correspondentes ao valor da iluminância mínima E (lux) para as
tarefas apresentadas no Quadro 1 da NHO-11, sendo permitida uma tolerância de 10% abaixo desse valor."
(Acrescentar, como na aba de cálculo: método do Anexo 1 — configuração {n} {nome}; medições com a fotocélula na
horizontal a 0,75 m do piso; pontos ≥ 70% de Ē; razão máx./Ē ≤ 5:1.)

### 4. DESCRIÇÃO DO AMBIENTE
- FOTO do ambiente avaliado (centralizada, legenda à direita "Foto do ambiente avaliado"): usar captura da cena 3D
  (vista "Foto") gerada na hora, OU foto enviada pelo usuário (input file) — o usuário escolhe.
- Texto gerado com os dados do simulador e editável: "O(A) {local} é utilizado(a) para {atividade, campo}, no período
  {diurno/noturno}, e possui iluminação do tipo {natural/artificial}. A iluminação artificial se dá através de
  {N×M, por extenso com 2 dígitos ex.: 08} luminárias {tipo LUM_TYPES}, dispostas regularmente em {M} fileiras de {N},
  instaladas {sobrepondo o teto/embutidas}. O ambiente possui área total de {L×W} m² ({L} m × {W} m), pé-direito de
  {H} m, dispondo de {nº} porta(s) e {nº} janelas, e paredes em cores claras."

### 5. DADOS E PARÂMETROS OBTIDOS NA AVALIAÇÃO
- Texto da avaliação preliminar (item 6.1 / Anexo 2), com campos de data(s) e horário editáveis e checklist
  (cintilação, efeito estroboscópico, direcionalidade, sombras excessivas, ofuscamento, sujidade das luminárias,
  funcionamento) que monta a frase: "Na avaliação preliminar realizada em {datas}, no horário das {h1} às {h2}, no(a)
  {local}, verificou-se que {não há / há} …".
- "A iluminância média encontrada no ambiente avaliado foi de {Ē} lux."
- ANEXO/QUADRO DE CÁLCULO no padrão da aba "EAD" da planilha: Tipo de ambiente (Quadro 1) e E mínimo; croqui com os
  pontos; área = lado × lado com faixa ±3%; fórmula da iluminância média com N e M; tabela de leituras P1–P2, T1–T4,
  Q1–Q4, R1–R8 com média de cada grupo; Ē; Ē com tolerância de 15% (mín. – máx.); 70% de Ē; 70% de Ē com tolerância
  de 15% (mín. – máx.).

### 6. PARECER TÉCNICO (automático, conforme resultados; editável antes de imprimir)
Não atende (modelo da planilha): "A iluminação medida em {todos os/alguns} postos encontra-se abaixo do determinado
pela NHO-11: {E} lux e abaixo da tolerância de 10%: {0,9·E} lux. A iluminância média medida no ambiente apresentou
valor que não atende às especificações do Quadro 1{, bem como há leituras inferiores ao valor correspondente a 70% da
iluminância média: {0,7·Ē} lux}. Portanto, o nível de iluminância encontra-se ABAIXO DO LIMITE estabelecido pela
NHO-11. PELO EXPOSTO, o ambiente de trabalho é considerado ANTIERGONÔMICO quanto à iluminação (NR-17, item 17.8)."
Atende: texto simétrico ("encontra-se acima do determinado… atende… DENTRO DO LIMITE… o ambiente é considerado
adequado quanto à iluminação"). Incluir as demais verificações (5:1, 200 lux) e recomendações quando não atende.

### 7. ASSINATURA
Linha de assinatura centralizada + "Técnico em Segurança do Trabalho" + "Registro MTE: {campo}" + nome/local/data.

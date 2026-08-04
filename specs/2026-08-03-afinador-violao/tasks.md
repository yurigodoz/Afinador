# Tasks: Afinador Online — Violão e Baixo

## Overview

- **Total Tasks:** 12
- **Completed:** 9 · **Em execução com o Yuri:** 1 (Task 11 — deploy) · **Pending:** 2 (Tasks 10 e 12,
  ambas dependem da URL pública)
- **Estado por wave:** Wave 0 ✅ · Wave 1 ✅ exceto iPhone · Wave 2 ✅ verificada com violão real
  contra afinador de referência · Wave 3 código pronto, sem baixo real disponível (`decisions.md`
  D21) · Wave 4 em andamento, com Tasks 10 e 11 invertidas (D20)
- **Estratégia de decomposição:** fatiamento vertical por capacidade demonstrável, com um único
  slice horizontal na Wave 0 (scaffolding + módulos puros). O horizontal se justifica porque
  `lib/pitch` é o contrato compartilhado por todas as verticais e concentra o risco algorítmico —
  vale isolá-lo e testá-lo antes de existir qualquer UI.
- **Ordem violão → baixo:** o violão é validado ponta a ponta primeiro (Waves 0–2) e só então
  entra o baixo (Wave 3). Não porque o baixo seja secundário, mas porque ele é o caso difícil: se
  o pipeline não estiver sólido no E2, não há chance no B0, e depurar os dois ao mesmo tempo
  confunde causa e efeito.
- **Caminho crítico:** 1 → 2 → 4 → 5 → 6 → 8 → 10.

---

## Waves

> Waves rodam em sequência; tasks dentro de uma wave são independentes entre si.
> Cada checkpoint precisa passar antes da wave seguinte.

### Wave 0 — Fundação

#### [x] 1. Scaffolding do projeto Next.js
- **Size:** S · **Complexity:** low · **Risk:** low
- **Dependencies:** (nenhuma)
- **Steps:**
  1. `frontend/` equivalente ao padrão dos outros repos: Next 16.1.4, React 19.2.3, Tailwind v4
     via `@tailwindcss/postcss`, ESLint 9, **JS puro, App Router, `src/`, alias `@/`**. Sem
     TypeScript.
  2. `package.json` com `"dev": "next dev -p 3007"` **e** `"start": "next start -p 3007"` — porta
     explícita nos dois (armadilha documentada em `vps-config/README.md` §1).
  3. `layout.js` com `<html lang="pt-BR">` e metadata em português; limpar o boilerplate.
  4. `.gitignore`, `README.md` curto, `git init` + commit inicial.
- **Acceptance Criteria:**
  - **GIVEN** repositório recém-criado **WHEN** `cd frontend; npm run dev` **THEN** `localhost:3007`
    responde sem erro no console.
  - **GIVEN** o projeto **WHEN** `npm run lint` **THEN** passa sem avisos.

#### [x] 2. Módulos puros: instrumentos, cents, decimação e YIN
- **Size:** L · **Complexity:** medium · **Risk:** **high**
- **Dependencies:** 1
- **Requirements:** FR-0, FR-3, FR-5, FR-6, FR-11, FR-12, NFR-1
- **Steps:**
  1. `lib/instrumentos.js`: violão 6, baixo 4 e baixo 5, cada um com **perfil de análise**
     (janela, `fmin`/`fmax`, filtros, decimação — `design.md` §3) e seus presets por número MIDI.
     `midiParaFreq(midi, a4)`, `nomeDaNota(midi, grafia)`, `cordasDaAfinacao(...)`.
  2. `lib/pitch/cents.js`: `cents(f, alvo)`, `cordaMaisProxima(f, cordas)`, `notaCromatica(f, a4)`.
  3. `lib/pitch/decimate.js`: decimação por fator inteiro M com buffer de saída pré-alocado.
  4. `lib/pitch/yin.js`: `criarDetector({ tamanho, sampleRate, fmin, fmax })` conforme
     `design.md` §4.2 — diferença, normalização cumulativa, limiar 0,15 com busca do mínimo local,
     interpolação parabólica, `clarity`. `Float32Array` pré-alocado no closure, **zero alocação
     por chamada** (NFR-3).
  5. `lib/pitch/smoothing.js`: mediana móvel de 5, exponencial em cents (α = 0,25), retenção de
     400 ms, confirmação de 700 ms com banda morta de ±10 cents.
- **Acceptance Criteria:**
  - **GIVEN** senoide sintética em cada uma das 26 frequências-alvo distintas dos presets
    **WHEN** o detector do perfil correspondente roda **THEN** o erro é ≤ 1 cent (NFR-1).
  - **GIVEN** tom com fundamental **fraca** e 2ª/3ª parciais fortes em E1 (41,20 Hz) — o timbre
    típico de baixo **WHEN** detecta **THEN** retorna ~41,20 Hz, não 82,4 nem 123,6.
  - **GIVEN** B0 (30,87 Hz) com o perfil de baixo **WHEN** detecta **THEN** erro ≤ 1 cent.
  - **GIVEN** ruído branco **WHEN** detecta **THEN** retorna `null` ou `clarity` baixa.
  - **GIVEN** `a4 = 432` **WHEN** calcula as cordas de qualquer preset **THEN** as frequências
    escalam por 432/440.
  - **GIVEN** 1000 chamadas consecutivas ao detector **WHEN** medida a alocação **THEN** não há
    crescimento de heap atribuível ao laço.

**Wave Checkpoint 0:** `npm run lint` limpo; suíte de tons sintéticos passando via `node --test`
nos três perfis; nenhum módulo de `lib/` importa React ou toca `window`.

> **✅ Passou em 2026-08-03.** 51 testes, 10 execuções seguidas sem instabilidade (a suíte usa fase
> e ruído aleatórios de propósito). Lint limpo — verificado que não passa por vacuidade,
> introduzindo um erro proposital e confirmando que o ESLint o pega (66 regras ativas).
>
> **Resultados de precisão (NFR-1):** erro ≤ 1 cent nas 26 frequências-alvo dos 10 presets, nos
> três perfis. Os dois casos que mais preocupavam passaram:
> - **E1 (41,20 Hz) com fundamental atenuada** (pesos 0,2 / 1 / 0,8 / 0,4 — timbre de baixo):
>   sem erro de oitava.
> - **B0 (30,87 Hz):** dentro de 1 cent.
>
> **Custo:** ambos os perfis convergem para 2048 amostras por janela depois da decimação, e a
> medição de heap deu ~1,3 byte por chamada — alocação zero no laço, como exigia NFR-3.
>
> **Acrescentado ao plano:** `src/lib/pureza.test.js`, que falha se algum módulo de `lib/`
> referenciar navegador ou React, ou importar pelo alias `@/`. A regra estava só na prosa do
> design; agora é executável.

---

### Wave 1 — Captura e leitura ao vivo

#### [x] 3. Tela de permissão de microfone
- **Size:** S · **Complexity:** low · **Risk:** low
- **Dependencies:** 1
- **Requirements:** FR-1, FR-2, NFR-4, NFR-5
- **Steps:**
  1. `PermissaoMicrofone.js` com os estados inicial / pedindo / negado / erro.
  2. Textos distintos por causa: negada pelo usuário, sem suporte, contexto inseguro
     (`window.isSecureContext`), nenhum dispositivo de entrada.
  3. Cartão de privacidade (NFR-4) e botão que dispara a permissão a partir de gesto do usuário.
- **Acceptance Criteria:**
  - **GIVEN** permissão negada no navegador **WHEN** a página carrega **THEN** aparece a
    explicação com o caminho para reverter e nenhum prompt em laço.
  - **GIVEN** a página aberta por `http://` num IP de rede local **WHEN** o usuário aciona iniciar
    **THEN** aparece a mensagem de contexto inseguro.

#### [x] 4. Hook `useMicrofone` — grafo de áudio parametrizado por perfil
- **Size:** M · **Complexity:** medium · **Risk:** medium
- **Dependencies:** 2
- **Requirements:** FR-0, FR-1, FR-14, NFR-3, NFR-5
- **Steps:**
  1. `getUserMedia` com as três flags de processamento em `false` (FR-1).
  2. Montar o grafo de `design.md` §3 **a partir do perfil do instrumento**: highpass, notches
     opcionais, lowpass e `fftSize` vêm do perfil, não são constantes.
  3. `trocarPerfil(perfil)`: refaz apenas os nós de processamento, preservando o `MediaStream` —
     trocar de instrumento não pode pedir permissão de novo.
  4. Criar/retomar o `AudioContext` dentro do gesto do usuário (iOS).
  5. `parar()`: `track.stop()` em todas as trilhas, `context.close()`, limpar refs. Chamar no
     cleanup do `useEffect` e no `visibilitychange` prolongado (FR-14).
- **Acceptance Criteria:**
  - **GIVEN** afinador ativo **WHEN** o usuário aciona parar **THEN** o indicador de gravação do
    navegador some em até 1 s.
  - **GIVEN** afinador ativo no violão **WHEN** troca para baixo **THEN** o grafo é refeito com
    `fftSize` 8192 e os notches, sem novo prompt de permissão.
  - **GIVEN** iPhone com Safari **WHEN** o usuário aciona iniciar **THEN** `context.state === 'running'`.
  - **GIVEN** 10 ciclos liga/desliga **WHEN** inspecionado **THEN** não há `AudioContext` órfão.

**Wave Checkpoint 1:** microfone liga e desliga limpo em Chrome desktop e Safari iOS; troca de
perfil funciona sem reprompt; sem vazamento de contexto.

> **⏳ Código pronto em 2026-08-03; checkpoint pendente de verificação no navegador.**
>
> **Verificado automaticamente:** 69 testes passando, lint limpo, `next build` compilando. A
> classificação de erros de permissão (FR-2) tem teste próprio — as seis causas, incluindo os nomes
> legados de `DOMException`, e a garantia de que todo código tem texto dizendo o que o usuário deve
> fazer.
>
> **Só o Yuri pode verificar** (exige microfone e dispositivo real): o app sobe em
> `localhost:3007` com um painel de nível ao vivo. Roteiro:
> 1. Ligar o microfone e conferir que a barra reage ao tocar uma corda.
> 2. Trocar entre violão / baixo 4 / baixo 5 **com a captura ligada** — não pode reabrir o prompt
>    de permissão, e o painel deve mostrar a janela e a decimação mudando.
> 3. Desligar e conferir que o indicador de gravação do navegador apaga em até 1 s.
> 4. Repetir liga/desliga ~10 vezes e conferir que não sobra `AudioContext` órfão.
> 5. Negar a permissão e conferir que a mensagem explica a causa, sem laço de prompts.
> 6. Abrir por `http://<ip-da-rede>:3007` de outro aparelho e conferir a mensagem de contexto
>    inseguro.
> 7. Repetir os passos 1–3 no Safari do iPhone — é o item de maior risco (`AudioContext` suspenso).
>
> **Resultado parcial (Yuri, 2026-08-03):** passo 2 (liga/desliga e indicador de gravação) ✅ em
> desktop. Passos 1 e 7 (celular e iPhone) **bloqueados por falta de HTTPS** — exatamente o D9 se
> manifestando em desenvolvimento. Resolvido com `npm run dev:https`
> (`next dev --experimental-https`, certificado autoassinado via mkcert), documentado no README.
> **✅ Troca de perfil verificada (Yuri):** 10 trocas de instrumento em Android e desktop, com a
> captura ligada, **sem reabrir o prompt de permissão** — era o critério central da Task 4.
> **Adiado por decisão do usuário:** Safari no iPhone. Continua sendo o item de maior risco da
> wave (`AudioContext` suspenso no iOS) e precisa acontecer antes do deploy da Task 11.
>
> **Medições de campo (Yuri, desktop + Android):** taxa de **48 000 Hz nos dois aparelhos** — os
> valores históricos da spec (4096/8192 amostras, ÷2/÷4) valem diretamente. Níveis: **−75 dBFS** em
> repouso, **−20 a −11 dBFS** de pico ao tocar. Duas consequências: o limiar da porta de silêncio
> foi recalibrado para −55 dBFS (`decisions.md` D19), e a variação de nível entre cordas confirma
> que o `autoGainControl` está mesmo desligado no Android (D8 verificado em campo).
>
> **Correção de design feita nesta wave:** um teste que varria taxas de amostragem reais achou que a
> janela fixa em amostras quebrava a 96 kHz (violão caía para 2,8 períodos da nota mais grave).
> Janela e decimação passaram a ser derivadas de `AudioContext.sampleRate` — ver `decisions.md` D17
> e D18. A 48 kHz os valores continuam idênticos aos da spec original.

---

### Wave 2 — Afinador de violão funcionando

#### [x] 5. Hook `useDeteccaoAltura` — laço de análise
- **Size:** M · **Complexity:** medium · **Risk:** medium
- **Dependencies:** 4
- **Requirements:** FR-3, FR-4, NFR-2, NFR-3
- **Steps:**
  1. Laço `requestAnimationFrame` com throttle a ~30 Hz; `getFloatTimeDomainData` em buffer
     pré-alocado dimensionado pelo perfil.
  2. RMS antes de tudo; abaixo de **−55 dBFS** (`LIMIAR_SILENCIO_DBFS`, calibrado com medição real —
     `decisions.md` D19) descarta o frame sem rodar decimação nem YIN.
  3. Encadear decimação → YIN → mediana → exponencial → retenção (Task 2).
  4. Emitir `{ frequencia, clarity, cents, cordaId, notaCromatica, foraDaAfinacao }`, com
     `setState` **só** em mudanças discretas; valores contínuos via `ref` (`design.md` §8).
- **Acceptance Criteria:**
  - **GIVEN** tom estável ao microfone **WHEN** observado por 5 s **THEN** a leitura em cents
    varia menos de ±2 cents (NFR-2).
  - **GIVEN** silêncio **WHEN** passam 400 ms **THEN** o estado volta a "aguardando".
  - **GIVEN** o laço rodando em qualquer perfil **WHEN** medido no Performance do DevTools
    **THEN** nenhum frame de análise passa de 8 ms e não há alocação por frame.

#### [x] 6. Mostrador e lista de cordas
- **Size:** L · **Complexity:** medium · **Risk:** low
- **Dependencies:** 5
- **Requirements:** FR-5, FR-6, FR-7, FR-8, FR-9, FR-15, NFR-6, NFR-7
- **Steps:**
  1. `Mostrador.js`: SVG do arco −50…+50 cents, zona de ±5, ponteiro animado por `ref`, nota-alvo
     com oitava, desvio numérico, rótulo aperte/afrouxe/afinado.
  2. Estado de nota fora da afinação (FR-6): mostra a nota cromática e sinaliza que não é do preset.
  3. `ListaCordas.js`: grade **fluida de 4 a 6 pastilhas** (não assumir seis colunas), da mais
     grave para a mais aguda, com estados pendente/ativa/afinada persistidos até troca de
     instrumento/preset ou saída da banda morta (FR-9).
  4. Região `aria-live` com throttle de 1 s (NFR-6); layout mobile-first sem rolagem (FR-15).
  5. `Afinador.js` compõe permissão + mostrador + lista e detém o estado da §8 do design.
- **Acceptance Criteria:**
  - **GIVEN** violão minimamente afinado **WHEN** o usuário toca as 6 cordas soltas **THEN** as 6
    ficam marcadas como afinadas sem controle extra (cenário 1).
  - **GIVEN** desvio de −12 cents **WHEN** exibido **THEN** aparece "aperte" e o valor numérico,
    não apenas cor.
  - **GIVEN** corda a 300 cents do alvo mais próximo **WHEN** detectada **THEN** exibe nota
    cromática e o aviso de fora da afinação.
  - **GIVEN** iPhone SE em retrato, com 4, 5 e 6 cordas **WHEN** a tela carrega **THEN** tudo cabe
    sem rolagem nos três casos.

**Wave Checkpoint 2:** afinar um violão real ponta a ponta com a afinação padrão, em desktop e
celular. Revisão visual antes de seguir (NFR-7).

> **⏳ Código pronto em 2026-08-03; checkpoint pendente de verificação com violão real.**
>
> **Verificado automaticamente:** 83 testes, lint limpo, `next build` com 3 rotas. A lógica de
> decisão do mostrador foi extraída para `lib/pitch/leitura.js` (puro) e tem 12 testes próprios —
> escolha da corda, direção do ajuste, nota fora da afinação, corda travada vencendo a proximidade,
> oitavas que não colidem e as frases do leitor de tela.
>
> **Só o Yuri pode verificar:**
> 1. Tocar as 6 cordas soltas de um violão minimamente afinado e ver as 6 marcadas como afinadas,
>    sem tocar em nenhum controle (cenário 1 de `requirements.md` §5).
> 2. O ponteiro precisa se mover **sem tremer** com nota estável — é o NFR-2 na prática, e o que a
>    mediana e a suavização exponencial existem para garantir.
> 3. Afrouxar a corda 6 cerca de um tom: deve aparecer a nota cromática com "fora desta afinação"
>    (FR-6); tocar na pastilha da corda 6 trava o alvo (FR-10) e o mostrador passa a guiar de volta
>    ao E2 (cenário 2).
> 4. Revisão visual (NFR-7): o mostrador domina a tela? Cabe sem rolagem no celular?
>
> **Correção de lint que mudou o desenho:** a regra `react-hooks/set-state-in-effect` pegou dois
> `setState` dentro de efeito. O motor de análise (decimador + detector) passou a ser construído em
> `useMemo`, o que torna a falha de configuração **derivável no render** em vez de sincronizada por
> estado — menos render em cascata e um caminho de erro mais direto.
>
> **Página `/diagnostico`:** o painel de captura da Wave 1 foi mantido em rota própria a pedido do
> usuário, com link discreto no rodapé. Serve ao suporte remoto do D16 — é dela que sai taxa do
> dispositivo, nível de entrada e parâmetros do perfil quando alguém relatar problema à distância.
>
> **✅ Verificado com violão real (Yuri, 2026-08-03), em todos os pontos:**
> 1. Seis cordas reconhecidas e marcadas; **conferido contra o afinador do Google** — é a validação
>    cruzada que o critério de aceite pedia.
> 2. Ponteiro estável com nota sustentada (NFR-2 satisfeito na prática).
> 3. Trava de corda funciona; ver a observação abaixo.
> 4. Revisão visual aprovada (NFR-7).
>
> **🐛 Bug encontrado ao travar corda — corrigido.** Relatado primeiro como "fica impreciso no
> primeiro segundo" e diagnosticado erroneamente como o temporizador do FR-8; o sintoma real, depois
> esclarecido, era **−1000 cents com o ponteiro cravado à esquerda**.
>
> *Causa raiz:* a retenção do FR-4 segura a última frequência por 400 ms para o mostrador não piscar
> entre dedilhadas. Travando uma corda dentro dessa janela, a nota **anterior** passava a ser
> comparada com o alvo **novo**. O −1000 era exato e verificável: é o E2 (82,41 Hz) medido contra o
> D3 (146,83 Hz). Aritmética correta descrevendo um som que já tinha acabado.
>
> *Correção:* trocar de alvo — travar, destravar, mudar de afinação ou de instrumento — descarta a
> leitura retida e reinicia mediana, suavização e confirmador. O mostrador volta a "aguardando" até
> a corda nova ser tocada.
>
> *Melhoria associada:* um ponteiro na ponta da escala é indistinguível de um ponteiro travado.
> A leitura agora carrega `foraDaEscala` (|cents| > 50) e a interface diz "aperte muito" /
> "afrouxe muito", com o leitor de tela anunciando "muito N cents abaixo" (NFR-6).
>
> Coberto por dois testes de regressão em `leitura.test.js`, um deles reproduzindo exatamente o
> cenário E2-contra-D3.
>
> **Segunda causa, encontrada depois — a real.** O relato foi refinado: com a **corda E4 travada**,
> afrouxá-la e depois afiná-la fazia o mostrador apontar **−1800 cents por meio segundo, mesmo com
> a corda afinada**. Duas hipóteses foram testadas antes de mexer no código:
>
> 1. *Transiente de palhetada.* **Descartada por experimento** — sintetizando ataque com ruído de
>    banda larga decaindo sobre a nota, o detector acerta o E4 em 1 cent já na primeira janela,
>    com `clarity` 0,88.
> 2. *Estado sobrevivendo ao silêncio.* **Confirmada por reprodução.** A mediana de frequência se
>    reinicia ao expirar a retenção, mas o **suavizador de cents não**. O desvio de quando a corda
>    estava frouxa persistia, e a nota seguinte entrava deslizando a partir dele: com α = 0,25 a
>    30 Hz, sair de −1800 e chegar a ±5 cents leva ~20 frames ≈ **667 ms** — exatamente o "meio
>    segundo" relatado. Cada valor exibido no caminho era uma leitura que nunca aconteceu.
>
> *Correções:* (a) perder o sinal reinicia o suavizador, para a próxima nota entrar inteira;
> (b) salto maior que 100 cents dentro do mesmo alvo é assumido de uma vez em vez de interpolado —
> defesa em profundidade para quando a corda é mexida enquanto soa. Um teste garante que a
> suavização de variações pequenas continua valendo, que é o que sustenta o NFR-2.
>
> **Lição de método:** as duas primeiras explicações que dei para este sintoma estavam erradas (o
> temporizador do FR-8 e depois a retenção comparada com alvo novo). Só a reprodução isolada
> apontou a causa. Sintoma vago mais explicação plausível é uma combinação perigosa.
>
> **✅ Confirmado corrigido por Yuri.** Resta ~100 ms de acomodação, que **é o piso físico do
> perfil, não resíduo do bug**:
>
> | Parcela | Tempo |
> |---|---|
> | Janela de análise (4096 amostras a 48 kHz) | 85,3 ms |
> | Espera de um frame do laço (30 Hz) | 33,3 ms |
> | **Piso teórico** | **118,7 ms** |
>
> Observado ~100 ms, dentro dos 150 ms do NFR-2. Reduzir exigiria janela menor (perde precisão nos
> graves) ou laço mais rápido (mais CPU) — troca ruim para 30 ms.
>
> **Diagnóstico do resíduo, dado por Yuri:** abafando as demais cordas e tocando o E4 sem unha, a
> leitura vai direto para afinado. Ou seja, o que sobra é **acústico** — ressonância simpática das
> cordas vizinhas e transiente da unhada —, não software. Isso também mostra que o ataque sintético
> usado para descartar a primeira hipótese era otimista demais em relação a uma palhetada real.

---

### Wave 3 — Baixo e controles

#### [x] 7. Seletor de instrumento e presets de baixo
- **Size:** M · **Complexity:** medium · **Risk:** medium
- **Dependencies:** 6
- **Requirements:** FR-0, FR-11
- **Steps:**
  1. `SeletorInstrumento.js`: violão/guitarra, baixo 4 cordas, baixo 5 cordas. Trocar dispara
     `trocarPerfil` (Task 4), recria o detector e zera o progresso.
  2. `SeletorAfinacao.js` lista apenas os presets do instrumento atual.
  3. Ajustar `ListaCordas` e `Mostrador` para os casos de 4 e 5 cordas.
- **Acceptance Criteria:**
  - **GIVEN** baixo 4 cordas selecionado **WHEN** o usuário toca as 4 soltas **THEN** as 4 são
    reconhecidas e marcadas como afinadas (cenário 5).
  - **GIVEN** baixo 5 cordas **WHEN** um gerador de tom reproduz 30,87 Hz por alto-falante capaz
    **THEN** identifica a corda 5 sem erro de oitava (cenário 6, validação parcial — instrumento
    real fica para a Task 12, `decisions.md` D16).
  - **GIVEN** troca violão → baixo **WHEN** ocorre **THEN** os presets listados mudam e o
    progresso zera.

#### [x] 8. Diapasão e persistência
- **Size:** S · **Complexity:** low · **Risk:** low
- **Dependencies:** 7
- **Requirements:** FR-12
- **Steps:**
  1. `AjusteDiapasao.js`, faixa 415–466 Hz, passo de 1 Hz, botão de voltar a 440.
  2. Persistir `instrumentoId`, `presetId` e `a4` em `localStorage`, lendo no *mount* com fallback
     seguro.
- **Acceptance Criteria:**
  - **GIVEN** cordas afinadas em Padrão **WHEN** troca para Drop D **THEN** progresso zera e só a
    corda mais grave acusa desvio (cenário 3).
  - **GIVEN** instrumento, preset e A4 alterados **WHEN** a página recarrega **THEN** os três são
    restaurados.

#### [x] 9. Travar corda e tom de referência
- **Size:** M · **Complexity:** low · **Risk:** low
- **Dependencies:** 7
- **Requirements:** FR-10, FR-13
- **Steps:**
  1. Toque numa pastilha trava a corda; indicação visual clara e jeito óbvio de destravar.
  2. `useTomReferencia.js`: `OscillatorNode` + `GainNode` com envelope curto (evitar clique),
     suspendendo a detecção enquanto soa.
  3. **Alvos abaixo de 60 Hz soam uma oitava acima**, com aviso na interface — alto-falante de
     celular não reproduz 30–40 Hz (FR-13).
- **Acceptance Criteria:**
  - **GIVEN** corda 6 um tom abaixo **WHEN** o usuário trava a corda 6 **THEN** o mostrador
    compara só com E2 e guia até o alvo (cenário 2).
  - **GIVEN** tom de referência tocando **WHEN** soa **THEN** o afinador não registra o próprio tom.
  - **GIVEN** referência do B0 **WHEN** acionada **THEN** soa B1 com indicação de "oitava acima".

**Wave Checkpoint 3:** afinar um baixo real de 4 cordas ponta a ponta; se houver baixo de 5
disponível, validar o B0.

> **⏳ Código pronto em 2026-08-03; checkpoint pendente de instrumento real.**
>
> **Verificado automaticamente:** 98 testes, lint limpo, build com 3 rotas. Novos testes puros para
> preferências (9) e para a regra da oitava do tom de referência (4).
>
> **Decisões tomadas durante a implementação:**
> - **Controles recolhidos por padrão.** Instrumento, afinação e diapasão ficam atrás de um resumo
>   de uma linha. O caso comum é abrir e afinar sem mexer em nada; três seletores permanentes
>   roubariam espaço do mostrador (NFR-7) e ameaçariam o "cabe sem rolagem" do FR-15, ainda mais
>   com seis cordas na lista.
> - **Trocar de instrumento preserva a afinação equivalente.** Quem estava em "meio tom abaixo" no
>   violão continua em "meio tom abaixo" no baixo de 4; só cai no padrão quando o preset não existe
>   no instrumento novo (`afinacaoAoTrocarInstrumento`).
> - **Preferências via `useSyncExternalStore`**, não hidratação por efeito. `localStorage` é uma
>   fonte externa de dados, que é o caso de uso da API; resolve o render no servidor por um
>   snapshot separado e, de brinde, sincroniza duas abas.
> - **Tom de referência por botão, não por toque longo.** A spec previa toque longo na pastilha,
>   mas isso conflitaria com o toque curto que trava a corda e seria inacessível por teclado
>   (NFR-6). Virou um botão "Ouvir <nota>" que toca enquanto pressionado, sempre visível e
>   alcançável por teclado. Desvio deliberado da spec original.
>
> **Só o Yuri pode verificar:**
> 1. Baixo de 4 cordas: as quatro soltas reconhecidas e marcadas (cenário 5).
> 2. Trocar violão ↔ baixo com o microfone ligado: sem novo prompt, presets mudando, progresso
>    zerado.
> 3. Diapasão: mover para 432 Hz e conferir que os alvos descem ~32 cents; recarregar a página e
>    ver instrumento, afinação e diapasão restaurados.
> 4. Tom de referência: pressionar "Ouvir" e conferir que soa sem clique no início/fim e que a
>    detecção não mede o próprio tom. Nas cordas graves do baixo deve aparecer o aviso de oitava
>    acima.
> 5. Confirmar que o bug do −1000 cents sumiu: tocar uma corda, travar outra, e ver "aguardando"
>    em vez de ponteiro cravado.

---

### Wave 4 — Publicação e verificação

> **Ordem invertida em 2026-08-04** (`decisions.md` D20): a Task 11 (deploy) roda **antes** da
> Task 10 (verificação ampla). Os itens que faltam verificar — Safari no iPhone, outros aparelhos,
> baixo do amigo — dependem de HTTPS confiável, que é exatamente o que o deploy entrega. Fazer na
> ordem original custaria brigar com certificado autoassinado agora e refazer tudo depois.

#### [ ] 10. Verificação: precisão, dispositivos e cenários
- **Size:** M · **Complexity:** medium · **Risk:** medium
- **Dependencies:** 8, 9
- **Requirements:** NFR-1, NFR-2, NFR-3, NFR-5, NFR-6
- **Steps:**
  1. Suíte de tons sintéticos (senoide pura, com harmônicos, **com fundamental atenuada**, com
     ruído somado, vibrato leve) nas 26 frequências distintas dos presets — assertiva de ≤ 1 cent.
  2. Comparar leituras contra um afinador de referência (app ou pedal) em violão e baixo reais.
  3. Rodar os 7 cenários de `requirements.md` §5 ponta a ponta.
  4. Teste específico de zumbido: fonte de 60 Hz audível com o perfil de baixo ativo (cenário 7).
  5. Chrome, Firefox, Edge desktop + Safari iOS + Chrome Android; medir CPU no perfil de baixo em
     celular de entrada.
  6. Leitor de tela na região `aria-live` e verificação de contraste AA.
- **Acceptance Criteria:**
  - **GIVEN** a suíte sintética **WHEN** executada **THEN** todos os casos passam.
  - **GIVEN** instrumentos reais **WHEN** comparados ao afinador de referência **THEN**
    divergência ≤ 3 cents em todas as cordas.
  - **GIVEN** cada navegador da lista **WHEN** usado **THEN** funciona sem erro de console.

#### [~] 11. Deploy em afinador.godoz.dev.br — arquivos prontos, execução com o Yuri

> **Preparado em 2026-08-04:**
> - `vps-config/nginx/afinador.conf` — no molde do `luccare.conf`, sem bloco de API, sem
>   `/socket.io/` e sem `limit_req` (não há rota cara nem login). **Diferença que vale notar:** aqui
>   as páginas *podem* ser cacheadas na borda (10 min) — são estáticas, iguais para todos e sem dado
>   de usuário, ao contrário do SSR por usuário do Luccare.
> - `vps-config/ecosystem.config.js` — bloco `afinador-web` acrescentado, fork, 1 instância, porta
>   3007, heap de 384 MB (não há SSR com dados nem sessão para segurar). Verificado que os quatro
>   apps do arquivo não colidem de porta.
> - `Afinador/DEPLOY.md` — passo a passo de DNS, build, PM2, nginx, certbot e verificação, mais o
>   roteiro de teste remoto do baixo.
>
> **Execução é do Yuri** (exige acesso à VPS e ao DNS). Ponto de atenção do passo 4: entre o nginx
> e o certbot, a página abre em HTTP e o afinador **não vai funcionar** — vai exibir "Esta página
> precisa de HTTPS". É o FR-2 trabalhando, não erro de deploy.
>
> **Dois ajustes de interface vindos de revisão da tela de erro (Yuri, 2026-08-04):**
> 1. **Controles escondidos fora do estado inicial.** Na tela de erro a única ação útil é destravar
>    o acesso ao microfone; oferecer seletor de instrumento e afinação ali dilui a mensagem e sugere
>    que há algo a configurar quando não há. No estado inicial eles continuam visíveis, onde
>    escolher o instrumento antes de ligar o microfone evita refazer o grafo depois.
> 2. **A dica técnica virou condicional ao endereço.** A mensagem de contexto inseguro mandava rodar
>    `npm run dev:https` — instrução de desenvolvedor que apareceria para qualquer visitante em
>    produção, passando impressão de site quebrado por descuido. Agora `pareceDesenvolvimento()`
>    checa o hostname (localhost, 127.0.0.1, faixas privadas 10/172.16–31/192.168) e a dica só sai
>    para quem pode agir sobre ela. Quatro testes cobrem a distinção, incluindo os limites da faixa
>    172.16–31 e o caso de `193.168.x` que se parece com privado mas é público.
- **Size:** S · **Complexity:** low · **Risk:** low
- **Dependencies:** 10
- **Requirements:** NFR-5, FR-2
- **Steps:**
  1. `npm run build`; publicar na VPS seguindo `guia-vps-hostinger.md` e `vps-config/`.
  2. Acrescentar `afinador-web` ao `ecosystem.config.js` (fork, 1 instância, `PORT: 3007`,
     `NEXT_TELEMETRY_DISABLED`), no mesmo padrão do `luccare-web`.
  3. Criar `vps-config/nginx/afinador.conf` a partir do `luccare.conf`, com upstream
     `127.0.0.1:3007` e `keepalive 32`; sem bloco de API e sem `map $connection_upgrade`.
  4. Apontar o DNS de `afinador.godoz.dev.br` para a VPS; subir primeiro em `listen 80`, confirmar,
     então `sudo certbot --nginx -d afinador.godoz.dev.br`.
  5. Conferir num celular via 4G, fora da rede local.
- **Acceptance Criteria:**
  - **GIVEN** `https://afinador.godoz.dev.br` **WHEN** aberta no celular **THEN** pede microfone e
    afina violão e baixo.
  - **GIVEN** acesso por `http://` **WHEN** aberto **THEN** redireciona para `https://`.
  - **GIVEN** `pm2 restart afinador-web` **WHEN** executado **THEN** o app sobe na 3007 sem
    colisão com os outros seis apps da máquina.

#### [ ] 12. Validação remota do baixo de 5 cordas
- **Size:** S · **Complexity:** low · **Risk:** medium
- **Dependencies:** 11
- **Requirements:** FR-0, FR-11, NFR-1 (cenário 6)
- **Contexto:** o hardware não está disponível localmente; um amigo do usuário tem o instrumento e
  testa pela URL pública (`decisions.md` D16).
- **Steps:**
  1. Enviar `https://afinador.godoz.dev.br` com um roteiro curto: selecionar "Baixo 5 cordas",
     tocar cada corda solta, e **anotar o que aparece na tela** — nota exibida, cents e qual corda
     ficou destacada.
  2. Pedir explicitamente a leitura do B0: se aparecer B1 em vez de B0, é erro de oitava; se
     nenhuma corda destacar, é falha de captação do microfone naquela frequência.
  3. Perguntar o modelo do celular e se havia ruído ambiente — sem isso não dá para separar
     problema de algoritmo de limitação do microfone.
  4. Se reprovar: diagnosticar pelo dado recebido antes de mexer no código. Erro de oitava →
     revisar faixa τ e limiar do YIN. Ausência de sinal → limitação de captação, e a saída passa
     a ser entrada de linha (D15) ou aceitar detecção pela 2ª parcial.
- **Acceptance Criteria:**
  - **GIVEN** o roteiro enviado **WHEN** o amigo toca as 5 cordas soltas **THEN** as 5 são
    identificadas com a oitava correta e cents plausíveis.
  - **GIVEN** reprovação **WHEN** o retorno chega **THEN** existe dado suficiente (nota, cents,
    aparelho) para decidir a causa sem precisar de nova rodada de teste.

**Final Checkpoint:** afinar um violão e um baixo de 4 cordas reais pela URL pública, em celular,
com pelo menos dois presets diferentes em cada. O baixo de 5 cordas é confirmado pela Task 12,
que roda em paralelo à publicação e não bloqueia o lançamento — se reprovar, o preset de 5 cordas
sai do ar sem afetar violão e baixo de 4.

---

## Riscos de cronograma

- **Task 2 é o risco concentrado**, e o baixo aumenta esse risco. Se o YIN não bater NFR-1 nos
  tons sintéticos — especialmente no caso de fundamental atenuada, típico de baixo — nada adiante
  funciona. Por isso está na Wave 0, com critério numérico próprio, antes de qualquer UI.
- **Baixo de 5 cordas não está disponível localmente.** Confirmado com o usuário: o B0 é validado
  por tom sintético e gerador de tom nas Waves 0–3, e em instrumento real por terceiro depois do
  deploy (Task 12, `decisions.md` D16). Isso tira o hardware do caminho crítico, mas empurra a
  descoberta de um eventual problema para *depois* da publicação — daí o preset de 5 cordas ser o
  único item que pode sair do ar sem afetar o resto.
- **Task 4 depende de dispositivo real** (Safari iOS tem comportamento próprio de `AudioContext`).
- **Task 6 concentra o trabalho visual** (NFR-7) e é a mais provável de precisar de ida e volta.

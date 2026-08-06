# Decisions: Afinador Online — Violão e Baixo

## Gate Progress

| Gate | Status | Confidence | Date |
|------|--------|------------|------|
| 0 - Research | Complete | 85% | 2026-08-03 |
| 1 - Requirements | Complete | 88% | 2026-08-03 |
| 2 - Context | Complete | 90% | 2026-08-03 |
| 3 - Architecture | Complete | 84% | 2026-08-03 |
| 4 - Tasks | Complete | 87% | 2026-08-03 |
| 5 - Go/No-Go | Aguardando aprovação do usuário | — | — |

> A confiança da arquitetura caiu de 86% para 84% com a entrada do baixo: o perfil de 8192
> amostras com decimação por 4 é sólido no papel e nos números, mas a captação real de 30–40 Hz
> por microfone de celular é um risco que só some com teste em dispositivo (Task 10).

## Repository Context

- **`c:\Git\Afinador`** (este repo): novo. Sem README/ADR prévios além desta spec.
- **Padrão da stack** extraído de `c:\Git\Luccare`, `c:\Git\Bandapp` e `c:\Git\Agiotapp` — os três
  `frontend/package.json` são praticamente idênticos:
  - Next **16.1.4**, React **19.2.3**, `react-dom` 19.2.3, Tailwind **v4** via
    `@tailwindcss/postcss`, ESLint 9 + `eslint-config-next`.
  - **JavaScript puro, sem TypeScript.** Frontend em ESM. Alias `@/` → `src/`.
  - App Router com `src/app`, componentes em `src/components` (subpasta por domínio + `ui/`),
    `src/lib`, `src/services`.
  - Idioma pt-BR em UI, comentários e commits (`Luccare/CLAUDE.md`).
  - Shell primário: **PowerShell no Windows** (`;` para encadear, não `&&`).
- **Infra** em `c:\Git\vps-config`: VPS Hostinger KVM 2 (2 cores, 8 GB), PM2 em `fork` mode,
  nginx com upstreams `keepalive`, certbot para TLS, domínio `godoz.dev.br` com subdomínio por app
  (`luccare.godoz.dev.br`, `api-luccare.godoz.dev.br`).

---

## Decisões

### D0 — Porta 3007
**Decisão:** dev e produção na **3007**.
**Verificação:** varredura de `package.json`, `.env*` e `vps-config/` nos cinco repositórios.
Mapa completo em uso:

| Porta | App |
|---|---|
| 3000 | Luccare API |
| 3001 | Luccare Web |
| 3002 | GlobalAuth API |
| 3003 | Bandapp API |
| 3004 | Bandapp Web |
| 3005 | Agiotapp API |
| 3006 | Agiotapp Web |
| **3007** | **Afinador Web** ← livre |

**Observação:** o `vps-config/README.md` sugere "Bandapp 3020/3021", mas o `.env` do repo usa
3003/3004 — que é o que vale. De todo jeito a 3007 está livre nas duas leituras.
**Consequência:** `"start": "next start -p 3007"` com porta explícita, evitando a armadilha do
Luccare (o `next start` sem porta caía na 3000, a da API — `vps-config/README.md` §1).

### D1 — Frontend-only, sem backend
**Decisão:** o afinador é 100% cliente; o Next.js só serve os assets.
**Alternativas:** backend Express + Prisma como nos outros repos.
**Razão:** não há nada para persistir no servidor nem para autenticar. Toda a detecção acontece
no navegador e o áudio não pode sair do dispositivo (NFR-4). Um backend aqui seria peso morto.
**Consequência:** preferências (instrumento, preset, A4) vão para `localStorage`.

### D2 — Autocorrelação (YIN) em vez de FFT
**Decisão:** detecção de altura no domínio do tempo pelo algoritmo YIN.
**Alternativas:** FFT com interpolação de pico; HPS; MPM/NSDF.
**Razão:** com janela de 4096 a 48 kHz, a resolução espectral da FFT é 11,7 Hz — e 1 cent no E2
vale 0,048 Hz, no B0 apenas 0,018 Hz. Chegar lá por FFT exigiria janelas de vários segundos.
YIN mede o período em amostras e refina por interpolação parabólica. MPM daria resultado
equivalente; YIN foi escolhido por ser o mais documentado e por ter o passo de normalização
cumulativa que ataca diretamente o erro de oitava — o problema real nas cordas graves, e o
problema *dominante* no baixo, cujo timbre tem fundamental fraca e 2ª parcial forte.

### D3 — `AnalyserNode` em vez de `AudioWorklet`
**Decisão:** puxar amostras com `getFloatTimeDomainData` num laço de `requestAnimationFrame`.
**Alternativas:** `AudioWorklet` (análise na thread de áudio); `ScriptProcessorNode` (obsoleto).
**Razão:** a análise não precisa ser sample-accurate nem livre de *jitter* — 30 leituras por
segundo com janelas sobrepostas bastam para NFR-2. `AudioWorklet` exigiria arquivo de módulo
separado, `port.postMessage` e complicaria o build do Next sem ganho perceptível.
**Consequência:** se o `rAF` for estrangulado (aba em segundo plano), a análise para — desejável.

### D4 — Janela por instrumento: 4096 no violão, 8192 no baixo
**Decisão:** `fftSize` faz parte do **perfil do instrumento**, não é constante global.
**Razão:** YIN precisa de vários períodos dentro da janela. A 48 kHz:

| Nota | Período | Em 4096 | Em 8192 |
|---|---|---|---|
| D2 73,42 Hz (violão, mais grave) | 654 am | 6,3 períodos ✓ | — |
| E1 41,20 Hz (baixo 4) | 1165 am | 3,5 períodos ✗ | 7,0 ✓ |
| B0 30,87 Hz (baixo 5) | 1555 am | **2,6 períodos ✗** | 5,3 ✓ |

2,6 períodos não sustentam um vale confiável na função diferença. Usar 8192 nos dois seria mais
simples, mas jogaria a latência do violão de 85 ms para 171 ms sem necessidade nenhuma.
**Consequência:** trocar de instrumento reconstrói o `AnalyserNode` (§8 do design). E a latência
do baixo fica em ~250 ms — limite físico, registrado em D13.

### D5 — Cordas por número MIDI, não por Hz literal
**Decisão:** presets guardam número MIDI; a frequência vem de `a4 · 2^((midi−69)/12)`.
**Razão:** torna o diapasão ajustável (FR-12) uma linha de código e elimina a classe de bug de
constante mal digitada — agora são 10 presets e 26 frequências distintas entre três instrumentos.
Também dá o nome da nota de graça.
**Consequência:** o nome precisa de um parâmetro de grafia (sustenido/bemol) por preset, porque
"Eb / Ab / Db" é o que o músico lê nas afinações de meio tom abaixo.

### D6 — `setState` só em mudanças discretas
**Decisão:** valores contínuos (ponteiro, cents) escritos por `ref` direto no SVG dentro do laço;
React re-renderiza apenas quando muda corda ativa, estado de afinado ou presença de sinal.
**Razão:** 30 re-renders por segundo da árvore inteira é desperdício mensurável em celular de
entrada (NFR-3), e o React não agrega valor para um número que muda a cada frame.
**Consequência:** o `Mostrador` fica com um pedaço imperativo. Aceito, isolado num único
componente e documentado no arquivo.

### D7 — Modo cromático com presets (escolha do usuário)
**Decisão:** detecção livre, com as cordas na tela e destaque automático da mais próxima; com
escape manual de travar corda (FR-10).
**Alternativas consideradas com o usuário:** só cromático; corda a corda.
**Razão:** melhor UX — o usuário só dedilha e o afinador acompanha. O modo corda-a-corda não some:
vira o escape do FR-10 para quando a detecção oscilar.
**Consequência:** exige tratar nota fora da afinação (FR-6), que o modo corda-a-corda não teria.

### D8 — Flags de processamento de voz desligadas
**Decisão:** `echoCancellation: false`, `noiseSuppression: false`, `autoGainControl: false`.
**Razão:** o pipeline de voz do navegador é otimizado para fala: o AGC modula a amplitude entre
frames e o supressor de ruído ataca justamente os parciais graves e sustentados. No violão isso
degrada a corda 6; no baixo, cuja tessitura inteira está abaixo da banda da voz, seria fatal.
**Consequência:** sinal cru mais ruidoso, compensado pelos filtros do grafo e pela porta de RMS.

### D9 — HTTPS é pré-requisito de produção
**Decisão:** deploy obrigatoriamente com TLS em `afinador.godoz.dev.br` via certbot.
**Razão:** `getUserMedia` só existe em contexto seguro. Sem HTTPS o produto não funciona fora de
`localhost`.
**Consequência:** Task 11 inclui a verificação; FR-2 detecta e explica o caso em vez de falhar em
silêncio.

### D10 — PWA offline fica para v2
**Decisão:** sem service worker nem manifesto instalável na v1.
**Razão:** o afinador é frontend-only e cabe num cache trivial, e o caso de uso (ensaiar sem
sinal) é real. Mas adiciona ciclo de invalidação de cache a um projeto que ainda não tem a
primeira versão validada.
**Revisitar:** depois do Final Checkpoint.

### D11 — Decimação é parte do desenho, não otimização
**Decisão:** decimar o sinal por M antes do YIN — M = 2 no violão (24 kHz), M = 4 no baixo
(12 kHz).
**Razão:** custo do YIN é `(τmax − τmin) × N`. Sem decimar, o perfil de baixo custaria 13,2 M
operações por frame a 30 Hz — cinco vezes o violão, inviável em celular. Com decimação os dois
perfis caem para menos de 1 M:

| Perfil | Sem decimar | Com decimação |
|---|---|---|
| Violão | 2,74 M | **0,69 M** (M = 2) |
| Baixo | 13,17 M | **0,82 M** (M = 4) |

Nyquist sobra: a 12 kHz o limite é 6 kHz, contra um lowpass de 500 Hz no perfil de baixo.
**Consequência:** a precisão passa a depender inteiramente da interpolação parabólica — a 12 kHz
um degrau de τ inteiro no B0 vale ~4,5 cents. A suíte de tons sintéticos da Task 2 é o que prova
que a interpolação está fazendo o trabalho; sem ela o requisito de 1 cent (NFR-1) cai.

### D12 — Notch de 50/60 Hz no baixo, não highpass
**Decisão:** perfil de baixo usa highpass em 25 Hz + dois notches (50 e 60 Hz, Q = 30). O perfil
de violão usa highpass em 60 Hz e nenhum notch.
**Razão:** o zumbido de rede cai dentro da tessitura do baixo — 60 Hz fica entre A1 (55,00 Hz) e
D2 (73,42 Hz). Um highpass alto mataria as duas cordas mais graves junto com o zumbido. Um notch
com Q = 30 em 60 Hz tem banda de 2 Hz; a distância de 55 Hz até 60 Hz é de 151 cents, então a
atenuação sobre o A1 é desprezível. No violão o problema não existe: a faixa de busca começa em
65 Hz e o zumbido fica fora dela.
**Consequência:** os dois notches ficam sempre ligados no baixo (não dá para saber a rede
elétrica do usuário); o custo de dois biquads é irrisório. Cenário 7 de aceitação verifica.

### D13 — Latência maior no baixo é aceita, não combatida
**Decisão:** NFR-2 tem dois limites: ≤ 150 ms no violão, ≤ 250 ms no baixo.
**Razão:** um ciclo de B0 dura 32 ms; cinco ciclos, 162 ms. Não existe algoritmo que meça esse
período em menos tempo do que ele leva para acontecer — é limite de física, não de software.
Fingir um número único e mais bonito só criaria um requisito que nenhuma implementação cumpre.
**Consequência:** a UI precisa dar feedback de "ouvindo" durante a janela no perfil de baixo, ou
o usuário vai achar que travou (risco em `design.md` §11).

### D17 — Janela e decimação derivadas da taxa do dispositivo, não constantes
**Decisão:** o perfil declara `duracaoJanelaMs` e `taxaAlvoHz`; `tamanhoDeJanela(perfil, sampleRate)`
e `fatorDeDecimacao(perfil, sampleRate)` derivam os valores concretos em tempo de execução.
**Substitui:** os campos fixos `tamanhoJanela: 4096 | 8192` e `decimacao: 2 | 4` de D4 e D11.
**Razão:** descoberto durante a Wave 1, por um teste que varria taxas reais. `AudioContext.sampleRate`
é escolha do hardware, não nossa. Com janela fixa em **amostras**, quanto maior a taxa, menos tempo
ela cobre — a 96 kHz (comum com interface de áudio externa) o violão caía para **2,8 períodos** da
nota mais grave, abaixo do mínimo que o YIN aguenta. E com fator de decimação fixo, o mesmo aparelho
de 96 kHz custaria 4× mais CPU que um de 48 kHz.
O que precisa ser constante é a **duração** da janela (85 ms no violão, 170 ms no baixo) e a **taxa
de trabalho** depois da decimação (24 kHz e 12 kHz).
**Consequência:** a 48 kHz nada muda — os valores derivados são exatamente 4096/8192 e ÷2/÷4, e há
teste fixando isso para que a spec continue verdadeira. Em 44,1 kHz e 96 kHz a precisão de 1 cent se
mantém, verificado na corda mais grave de cada instrumento.

### D18 — Detector recusa faixa de busca acima de Nyquist
**Decisão:** `criarDetector` lança se `fmax > sampleRate / 2`.
**Razão:** apareceu ao investigar um teste meu que estava errado. Numa taxa de trabalho muito baixa,
`fmax` de 450 Hz passaria do Nyquist e o que houvesse naquela região seria aliasing — o detector
devolveria, com `clarity` alta, uma nota que ninguém tocou. Falhar na construção é melhor que mentir
a cada frame.
**Consequência:** nenhuma nas taxas reais — a folga é de pelo menos 13× nos perfis atuais, e há teste
que a verifica. O guard existe para o caso patológico (headset Bluetooth em modo de chamada, WebView
antigo).

### D19 — Porta de silêncio em −55 dBFS, calibrada com medição real
**Decisão:** o limiar da porta de silêncio (FR-4) passa de −50 para **−55 dBFS**.
**Evidência (Yuri, 2026-08-03, celular Android e desktop, ambos a 48 kHz):**

| Condição | Nível |
|---|---|
| Repouso (sala silenciosa) | **−75 dBFS** |
| Tocando, pico | **−20 a −11 dBFS**, variando conforme a corda |

**Razão:** o −50 original era estimativa. Com os números reais dá para escolher com critério. A
−55 sobram 20 dB de margem sobre o ruído de fundo e 35 dB de decaimento tolerado na corda mais
fraca. Importa porque **uma corda dedilhada perde tipicamente 20 a 30 dB nos primeiros segundos** —
com o limiar a −50, uma corda que começa em −20 seria abandonada pelo afinador ainda durante o
ajuste da tarraxa, que é justamente quando o usuário precisa da leitura. Descer até −65 daria só
10 dB sobre o ruído e deixaria a sala entrar como sinal.

**Achado colateral, e talvez o mais valioso:** o pico **varia de −20 a −11 dB conforme a corda**.
Isso prova que o `autoGainControl` está de fato desligado no Android — com AGC ativo os níveis
seriam nivelados entre si. É a confirmação em campo do D8, que não tinha como ser verificada em
teste automatizado.

**Consequência e limite conhecido:** o piso de −75 dBFS é de sala silenciosa. Em ensaio ou bar ele
sobe, e limiar fixo deixa de bastar. A segunda linha de defesa é a `clarity` do YIN, que rejeita o
que não tem altura definida (já coberto por teste com ruído branco). Estimativa de piso em tempo
real fica **não implementada por falta de evidência** — se o teste em campo mostrar necessidade, é o
próximo passo natural.

### D20 — Deploy antes da verificação ampla (inversão das Tasks 10 e 11)
**Decisão:** publicar em `afinador.godoz.dev.br` antes de concluir a Task 10.
**Razão:** os itens que faltam verificar são justamente os que o deploy destrava. Safari no iPhone,
outros aparelhos Android e o baixo do amigo dependem de **HTTPS confiável** — com certificado
autoassinado o iOS exige instalar a raiz do mkcert, atrito que o usuário já recusou. Manter a ordem
original significaria brigar com certificado agora e refazer os mesmos testes depois do deploy.
**Risco aceito:** vai ao ar algo ainda não verificado em vários dispositivos. Mitigado por a URL não
ser divulgada e por não haver dado de usuário, backend nem conta em jogo — o pior caso é alguém
achar o endereço e o afinador não funcionar no aparelho dele.
**Consequência:** a Task 10 passa a rodar **pela URL pública**, o que a torna mais fiel ao uso real
do que seria em `localhost`.

### D21 — Perfil de baixo publicado sem validação em instrumento real
**Decisão:** os presets de baixo de 4 e 5 cordas vão ao ar validados apenas por tons sintéticos.
**Razão:** o usuário não tem baixo disponível, nem de 4 nem de 5 cordas. Segurar o lançamento do
violão — que está verificado contra um afinador de referência — por causa de um instrumento que não
existe à mão travaria o projeto por tempo indeterminado.
**O que está coberto:** erro ≤ 1 cent nas frequências dos presets de baixo, inclusive B0 (30,87 Hz)
e E1 com fundamental atenuada, que é o timbre real do instrumento. O que **não** está coberto é a
captação: se o microfone do aparelho entrega 30–40 Hz com nível útil.
**Consequência:** amplia o D16 do baixo de 5 para os dois. A Task 12 valida ambos remotamente, com
roteiro em `DEPLOY.md`. Se reprovar, os presets de baixo saem do ar sem afetar o violão — eles são
dados, não código compartilhado.

### D22 — Correção de erro de oitava no YIN
**Decisão:** depois de achar o período, o detector investiga se o **dobro** dele explica melhor o
sinal, e nesse caso adota o dobro. Dois parâmetros governam a decisão: `FATOR_OITAVA = 0,2` e
`LIMIAR_SUSPEITA = 0,005`.

**Motivo (relatado por Yuri, com vídeo, 2026-08-04):** afinar o E2 do violão ficou ruim — a leitura
pulava entre **E2 e E3**, que é exatamente o dobro. Ele perguntou se os filtros tinham mudado. Não
tinham: highpass, lowpass e notches seguem iguais. A única mudança no caminho de detecção tinha sido
a porta de silêncio (D19), e a investigação mostrou que ela não era a causa.

**Causa raiz, isolada por experimento:** microfone de celular capta mal 82 Hz, e dependendo de onde a
corda é tocada a **3ª parcial some**. Sobram as parciais pares, que se repetem na *metade* do
período. O sinal fica genuinamente periódico em τ/2 — o YIN acerta a matemática e erra a nota. A
normalização cumulativa não protege contra isso: ela existe para evitar o erro **oposto** (escolher
múltiplos do período) e portanto favorece o τ menor.

**Como a decisão é tomada — medido, não arbitrado:**

| Sinal | `d'(τ)` | `d'(2τ)` | razão | conclusão |
|---|---|---|---|---|
| E2, fundamental 15%, 3ª ausente | 0,0352 | 0,0012 | **0,03** | corrigir |
| E2, fundamental 8%, 3ª ausente | 0,0106 | 0,0012 | **0,11** | corrigir |
| E3 legítimo | 0,0005 | 0,0002 | **0,39** | manter |
| E2, fundamental 3% | 0,0017 | 0,0012 | **0,67** | não corrigível |

O discriminante não é a razão sozinha: é o **valor absoluto** de `d'(τ)`. Num E3 verdadeiro o período
achado explica o sinal quase perfeitamente e o dobro não melhora muito, porque em sinal periódico
todo múltiplo do período também é período. No E2 mal captado o período achado é apenas razoável e o
dobro é uma ordem de grandeza melhor.

**`LIMIAR_SUSPEITA` foi acrescentado depois de uma regressão real:** sem ele, uma **senoide pura** de
D3 virava D2. Os dois vales valiam ~1e-8 e a razão entre eles decidia no último dígito de ponto
flutuante. Só se investiga oitava quando o casamento é medíocre.

**Limite conhecido e aceito:** com a fundamental abaixo de ~5% da 2ª parcial (razão 0,67) o sinal é
**indistinguível** da oitava acima — nenhum limiar separa esse caso do E3 legítimo (0,39) sem
quebrar a detecção de notas verdadeiras. É ambiguidade do sinal, não falha de implementação.

**Consequência:** quatro testes novos em `yin.test.js`, incluindo o caso oposto (notas legítimas não
podem descer de oitava) e a senoide pura. A correção também beneficia o baixo, cuja fundamental é
naturalmente fraca — verificado nas cordas mais graves dos três instrumentos.

### D23 — Porta de silêncio revertida para −50 dBFS (anula D19)
**Decisão:** `LIMIAR_SILENCIO_DBFS` volta de −55 para **−50 dBFS**.

**Razão — e é sobre método, não sobre o número.** O D19 baixou o limiar para acompanhar a nota por
mais tempo no decaimento. O raciocínio era coerente e apoiado em medições reais, mas resolvia um
problema **previsto, nunca observado**: o usuário havia relatado *níveis*, não um sintoma. E o valor
de −50 era justamente o que estava em uso quando ele validou o afinador contra um afinador de
referência.

Quando um sintoma real apareceu depois (erro de oitava no E2), a primeira pergunta dele foi "por que
você mexeu na porta de silêncio?" — e a pergunta era boa. **Trocar um parâmetro validado por causa de
uma previsão adicionou uma variável à investigação sem necessidade.** A causa acabou sendo outra
(D22), mas isso só ficou claro depois de gastar tempo descartando esta.

**Nota sobre interação com D22:** a −55 dBFS entram mais quadros marginais, de baixa relação
sinal/ruído — exatamente os que têm `d'(τ)` medíocre e portanto ficam elegíveis à correção de
oitava. Não foi possível reproduzir isso em sinal sintético, mas a interação é plausível e é mais um
motivo para voltar ao valor validado antes de seguir ajustando.

**Consequência:** com −50 dBFS sobram 25 dB de margem sobre o piso de ruído medido e 30 dB de
decaimento tolerado na corda mais fraca — os testes que travam essas margens continuam passando. A
análise que motivou os −55 segue registrada em D19 e pode ser retomada **se o corte no decaimento for
observado de verdade**.

**Regra que fica:** parâmetro validado em campo só muda com sintoma relatado, não com previsão.

### D14 — Sem integração com o Bandapp nesta versão
**Decisão:** o afinador é um site próprio em `afinador.godoz.dev.br`; nenhuma rota, componente ou
dependência compartilhada com o Bandapp.
**Razão:** decisão do usuário. Acoplar dois projetos antes de o mais novo estar validado só
espalha risco.
**Consequência:** a separação de `lib/pitch` e `lib/instrumentos` (módulos puros, sem React nem
`window`) continua valendo — não pela integração, mas porque é o que torna o algoritmo testável
em Node. Se um dia a integração voltar à mesa, esses módulos são copiáveis sem alteração.

### D15 — Entrada de linha fica para a v2
**Decisão:** a v1 escuta só pelo microfone padrão do dispositivo; sem seletor de dispositivo de
entrada nem suporte explícito a interface de áudio.
**Razão:** decisão do usuário. Tecnicamente sairia barato (`getUserMedia` com `deviceId`
específico alimenta o mesmo `MediaStreamSource`), mas adiciona superfície de UI — enumerar
dispositivos, lidar com o que aparece e some — a uma versão que ainda não provou o caminho
principal.
**Consequência:** nenhuma amarra criada contra isso. O `useMicrofone` já recebe as *constraints*
como parâmetro; acrescentar `deviceId` na v2 não mexe em nada abaixo dele. Vale lembrar que a
entrada de linha é justamente o que daria o sinal mais limpo para o B0 do baixo de 5 — se a
captação por microfone se mostrar ruim (D16), essa carta sobe de prioridade.

### D16 — Validação do B0 é remota e pós-deploy
**Decisão:** o baixo de 5 cordas não está disponível localmente. O B0 é validado em duas etapas:
(a) tom sintético e gerador de tom durante o desenvolvimento — cobre o algoritmo; (b) teste em
instrumento real por um amigo do usuário, **depois do deploy**, abrindo `afinador.godoz.dev.br`
no próprio celular.
**Razão:** sendo o produto uma página web pública, a validação remota fica trivial — não exige
build local, cabo nem instalar nada. O que antes era um bloqueio de hardware vira um link enviado
por mensagem.
**Consequência:** a Wave 3 é concluída sem a confirmação em instrumento real de 5 cordas, e o
preset de baixo 5 é publicado com essa ressalva. A Task 12 fecha o ciclo depois do deploy. Se o
teste remoto reprovar, o preset de 5 cordas sai do ar até ser corrigido — o de 4 cordas e o
violão não dependem dele.
**Ponto de atenção:** o retorno vem de terceiro, não do desenvolvedor. Pedir sempre **o que
apareceu na tela** (nota, cents, corda destacada) e não só "funcionou/não funcionou" — sem o
número, um erro de oitava é indistinguível de sucesso para quem não sabe o que procurar.

---

## Questões em aberto

1. **Baixo de 6 cordas — fora, sem data.** F#0 = 23,12 Hz exigiria rever a faixa de busca e
   provavelmente janela de 16384 (341 ms de latência). O modelo de dados suporta; só não vale o
   custo agora. Reavaliar depois da v1 em produção.

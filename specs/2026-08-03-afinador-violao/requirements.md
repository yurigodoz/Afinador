# Requirements: Afinador Online — Violão e Baixo

## 1. Context

### Business Objective

Uma página web que afina violão/guitarra e baixo pelo microfone do próprio dispositivo, sem
instalar nada. O usuário abre o site, escolhe o instrumento, autoriza o microfone e dedilha as
cordas: o afinador detecta a nota tocada automaticamente, mostra qual corda ele reconheceu e o
quanto ela está desviada do alvo (em cents), guiando até a afinação correta. Presets cobrem
afinações alternativas em ambos os instrumentos.

**URL pública:** `afinador.godoz.dev.br`

### Actors and Stakeholders

- **Primary:** Violonista/guitarrista e baixista — escolhem o instrumento, concedem acesso ao
  microfone, tocam as cordas e afinam.
- **External system:** Nenhum. Toda a detecção de altura roda no navegador (Web Audio API);
  não há backend, banco de dados nem autenticação.

### Constraints and Policies

- **Stack fixa** (padrão dos outros projetos do repositório): Next.js 16 App Router, React 19,
  Tailwind CSS v4, **JavaScript puro (sem TypeScript)**, ESM no frontend. Porta de dev **3007**
  (3000–3006 já em uso — ver `decisions.md` D0).
- **Idioma pt-BR** em UI, comentários e mensagens de commit.
- **Frontend-only.** Nenhum áudio sai do dispositivo — ver NFR-4.
- `getUserMedia` exige **contexto seguro**: HTTPS em produção ou `localhost` em desenvolvimento
  (ver `decisions.md` D9).
- **Instrumentos da v1:** violão/guitarra de 6 cordas e baixo de 4 e 5 cordas. Ukulele,
  cavaquinho, violino e afinação por sopro ficam fora (§4).
- O baixo de 5 cordas desce até **B0 = 30,87 Hz**, o que impõe janela de análise maior e uma
  latência maior que a do violão — restrição física, não de implementação (NFR-2, `design.md` §4).

## 2. Functional Requirements (EARS)

### FR-0: Seleção de instrumento
**Priority:** Critical

**When** o usuário escolhe um instrumento (violão/guitarra ou baixo), **the system shall** aplicar
o perfil de análise correspondente (janela, faixa de busca e filtros — `design.md` §3), carregar
as afinações daquele instrumento, zerar o progresso das cordas e persistir a escolha para a
próxima visita.

### FR-1: Solicitação de acesso ao microfone
**Priority:** Critical

**When** o usuário aciona o botão de iniciar o afinador, **the system shall** solicitar
permissão de microfone via `getUserMedia` com `echoCancellation`, `noiseSuppression` e
`autoGainControl` **desativados**, e iniciar a captura ao receber o consentimento.

> O processamento de voz do navegador é destrutivo para detecção de altura: o AGC bombeia o
> ganho entre frames e o cancelamento de ruído come parciais graves. Sem desligá-los, as cordas
> mais graves ficam instáveis — e no baixo o problema deixa de ser incômodo e vira impeditivo.

### FR-2: Estados de permissão
**Priority:** Critical

**When** a permissão de microfone for negada, revogada ou indisponível (navegador sem suporte,
página servida sem HTTPS), **the system shall** exibir uma mensagem explicando a causa provável
e como reverter, sem travar a interface nem tentar reabrir o prompt em laço.

### FR-3: Detecção de altura (pitch)
**Priority:** Critical

**When** o afinador está ativo e chega um novo bloco de áudio, **the system shall** estimar a
frequência fundamental do sinal dentro da faixa de busca do instrumento selecionado — 65 Hz a
700 Hz no violão, 28 Hz a 450 Hz no baixo — e derivar dela a nota mais próxima e o desvio em
cents.

### FR-4: Porta de silêncio
**Priority:** Critical

**While** o nível do sinal estiver abaixo do limiar de ruído **or** a estimativa de altura tiver
confiança insuficiente, **the system shall** manter a última leitura válida por um curto período
de retenção e depois voltar ao estado "aguardando" — sem exibir notas derivadas de ruído.

### FR-5: Seleção automática da corda
**Priority:** Critical

**When** uma altura válida é detectada, **the system shall** identificar, entre as cordas da
afinação selecionada, aquela cujo alvo está mais próximo em cents, e destacá-la na interface.

### FR-6: Nota fora da afinação
**Priority:** High

**Where** a altura detectada estiver a mais de 100 cents (um semitom) de qualquer corda da
afinação selecionada, **the system shall** exibir a nota cromática detectada e sinalizar que ela
não corresponde a nenhuma corda do preset, em vez de forçar a corda mais próxima.

### FR-7: Indicação de desvio
**Priority:** Critical

**When** existe uma corda-alvo ativa, **the system shall** exibir o desvio em cents em relação a
ela, com indicação direcional explícita de "apertar" (abaixo do alvo) ou "afrouxar" (acima do
alvo), além do valor numérico.

### FR-8: Critério de corda afinada
**Priority:** Critical

**When** o desvio absoluto se mantiver dentro de ±5 cents de forma contínua pelo tempo de
confirmação definido em NFR-2, **the system shall** marcar a corda como afinada, com retorno
visual distinto do estado "próximo".

### FR-9: Progresso da afinação
**Priority:** High

**When** uma corda é marcada como afinada, **the system shall** preservar esse estado na lista de
cordas até que o instrumento ou a afinação sejam trocados, a corda saia da tolerância novamente
ou o usuário reinicie o progresso.

### FR-10: Travar corda
**Priority:** High

**When** o usuário seleciona manualmente uma corda, **the system shall** comparar toda altura
detectada exclusivamente com o alvo daquela corda, ignorando a seleção automática, até que o
usuário destrave.

> Escape para os casos em que a detecção automática oscila: corda muito desafinada (mais perto
> da corda vizinha que da própria) ou captação de harmônico.

### FR-11: Presets de afinação
**Priority:** Critical

**When** o usuário escolhe uma afinação da lista do instrumento atual, **the system shall**
substituir os alvos, zerar o progresso das cordas e persistir a escolha para a próxima visita.

Presets da v1:

- **Violão/guitarra (6 cordas):** Padrão (E), Drop D, Meio tom abaixo (Eb), Um tom abaixo (D),
  DADGAD, Open G.
- **Baixo (4 cordas):** Padrão (E), Drop D, Meio tom abaixo (Eb).
- **Baixo (5 cordas):** Padrão (B).

### FR-12: Diapasão configurável
**Priority:** Medium

**Where** o usuário ajusta a referência A4 dentro da faixa de 415 Hz a 466 Hz, **the system
shall** recalcular todos os alvos a partir dessa referência e persistir o valor.

### FR-13: Nota de referência audível
**Priority:** Medium

**When** o usuário aciona a reprodução de referência de uma corda, **the system shall** emitir um
tom na frequência-alvo daquela corda enquanto o controle estiver acionado, e interromper a
detecção durante a emissão para não medir o próprio tom.

> No baixo, alto-falante de celular não reproduz 30–40 Hz. O tom de referência deve soar a
> oitava acima quando o alvo estiver abaixo de 60 Hz, indicando isso na interface.

### FR-14: Encerrar captura
**Priority:** High

**When** o usuário para o afinador **or** a página fica oculta por tempo prolongado, **the system
shall** liberar as trilhas do microfone e suspender o `AudioContext`, apagando o indicador de
gravação do navegador.

### FR-16: Tela acesa durante a afinação
**Priority:** Medium

**While** o afinador estiver capturando áudio, **the system shall** solicitar ao navegador que
mantenha a tela acesa, repetindo o pedido ao voltar de segundo plano, e liberar a trava ao encerrar
a captura.

> Afinar seis cordas leva mais que o tempo de apagamento automático da maioria dos celulares, e as
> mãos estão ocupadas com o instrumento — tocar na tela para reacendê-la é justamente o que não dá
> para fazer. Onde a API não existir, a degradação é silenciosa: a tela apagar é incômodo, não
> impedimento.

### FR-15: Layout responsivo
**Priority:** High

**Where** a viewport é de celular, **the system shall** apresentar mostrador, cordas e controles
em uma única tela vertical sem rolagem para operar o afinador, acomodando 4, 5 ou 6 cordas.

## 3. Non-Functional Requirements

### NFR-1: Precisão
Erro de estimativa ≤ 1 cent para um tom estável em todas as frequências-alvo dos presets
(verificação com tons sintéticos, `tasks.md` Task 9). No E2 (82,41 Hz) 1 cent ≈ 0,048 Hz; no
B0 (30,87 Hz) ≈ 0,018 Hz — resolução inatingível por FFT nas janelas usadas, o que motiva a
escolha de autocorrelação (`design.md` §4).

### NFR-2: Latência e estabilidade
Da nota tocada ao mostrador refletir o desvio:

- **Violão/guitarra:** ≤ 150 ms (janela de 85 ms).
- **Baixo:** ≤ 250 ms (janela de 171 ms).

O limite do baixo é físico: não se mede o período de uma onda de 30,87 Hz — 32 ms por ciclo — em
menos tempo do que alguns ciclos levam para passar. Confirmação de "afinado": 700 ms contínuos
dentro da tolerância. O mostrador não deve tremer visivelmente com um tom estável.

### NFR-3: Desempenho
Laço de análise a ~30 Hz sem travar a UI; sem alocação de arrays dentro do laço (buffers
pré-alocados). Deve rodar fluido em celular de entrada, **inclusive no perfil de baixo**, que
processa o dobro de amostras por janela (`design.md` §4 — decimação).

### NFR-4: Privacidade
Áudio nunca sai do dispositivo: sem upload, sem gravação, sem telemetria de áudio. A página
declara isso ao usuário na tela de permissão.

### NFR-5: Compatibilidade
Chrome, Edge, Firefox e Safari (desktop e iOS) em versões atuais. `AudioContext` só é criado
após gesto do usuário (exigência do iOS).

### NFR-6: Acessibilidade
Estado da corda e "afinado/apertar/afrouxar" comunicados também por texto e `aria-live`, não
apenas por cor e posição de ponteiro. Contraste AA.

### NFR-7: Design visual
Interface autoral, não boilerplate Tailwind. O mostrador é o elemento central da tela.
Revisão visual no navegador antes de escalar o padrão para as demais telas.

## 4. Out of Scope (v1)

- Ukulele, cavaquinho, violino, bandolim e afinações customizadas criadas pelo usuário.
- **Baixo de 6 cordas** — decidido ficar fora; o F#0 (23,12 Hz) exigiria rever a faixa de busca e
  provavelmente janela de 16384 (`decisions.md`, questão em aberto 1).
- **Entrada de linha / seletor de dispositivo de captura** — v2 (`decisions.md` D15).
- Backend, contas de usuário, histórico de afinação.
- Modo polifônico (afinar todas as cordas de um acorde dedilhado de uma vez).
- Metrônomo, gerador de acordes, gravador.
- ~~PWA offline instalável~~ — **implementado** em 2026-08-04 (`decisions.md` D24).
- Integração com o Bandapp — descartada para esta versão (`decisions.md` D14).

## 5. Acceptance — cenários ponta a ponta

1. **Afinação completa (violão):** usuário abre a página, autoriza o microfone, toca as seis
   cordas de um violão minimamente afinado e vê as seis marcadas como afinadas sem tocar em
   nenhum controle além do botão inicial.
2. **Corda muito desafinada:** corda 6 afrouxada ~1 tom abaixo; o afinador indica nota fora da
   afinação (FR-6); usuário trava a corda 6 (FR-10) e consegue subir até o alvo.
3. **Troca de preset:** com cordas já afinadas, usuário troca para Drop D; o progresso zera e
   apenas a corda 6 passa a acusar desvio.
4. **Permissão negada:** usuário nega o microfone; a página explica o que aconteceu e como
   reverter, sem laço de prompts.
5. **Afinação completa (baixo 4 cordas):** usuário troca para baixo, toca as quatro cordas
   soltas e vê as quatro marcadas como afinadas; a leitura do E1 (41,20 Hz) é estável.
6. **B0 do baixo de 5 cordas:** usuário seleciona baixo de 5 cordas e toca a corda B0
   (30,87 Hz); o afinador identifica a corda e mostra o desvio sem erro de oitava.
   *Validado por gerador de tom durante o desenvolvimento e em instrumento real por terceiro
   após o deploy* — `decisions.md` D16, Task 12.
7. **Zumbido de rede:** com uma fonte de zumbido de 60 Hz audível, o afinador não reporta 60 Hz
   como nota no perfil de baixo (`design.md` §3 — notches).

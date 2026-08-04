# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this
repository.

Afinador — afinador cromático de violão, guitarra e baixo que roda inteiro no navegador, pelo
microfone do dispositivo. **Não há backend**: o Next.js só serve os assets.

## Estrutura

```
frontend/   App Next.js 16 (App Router, React 19, Tailwind 4)  → porta 3007
specs/      requirements.md, design.md, tasks.md, decisions.md
```

Não há workspace raiz — rode `npm` dentro de `frontend/`.

## Ambiente

- **Shell primário: PowerShell no Windows.** Use sintaxe PowerShell (`;` para encadear, `$env:VAR`;
  não há `&&`).
- Node.js apenas. Sem banco, sem Docker, sem serviço externo.

## Comandos

```powershell
cd frontend; npm install
cd frontend; npm run dev      # next dev -p 3007
cd frontend; npm run dev:https # HTTPS autoassinado — necessário para testar no celular
cd frontend; npm run build
cd frontend; npm test         # node --test — suíte de tons sintéticos
cd frontend; npm run lint
```

`npm run dev` basta no desktop (`localhost` conta como contexto seguro). Para qualquer teste em
outro aparelho da rede é `dev:https`, senão o `getUserMedia` não existe e nada funciona.

## Convenções

- **JavaScript puro**, sem TypeScript. ESM. Alias `@/` → `src/`.
- **Idioma: português (pt-BR).** Comentários, texto de UI e mensagens de commit em português.
- Porta 3007 explícita em `dev` **e** `start` — a máquina de produção roda sete apps e
  `next start` sem porta cai na 3000, que é a API do Luccare.

## Arquitetura

### A regra que não se quebra

**Nada em `src/lib` pode tocar `window`, `AudioContext` ou React.** Os módulos puros
(`instrumentos.js`, `pitch/yin.js`, `pitch/cents.js`, `pitch/decimate.js`, `pitch/smoothing.js`)
rodam em Node, e é isso que permite validar a precisão do detector com tons sintéticos sem
microfone. `src/lib/pureza.test.js` falha se alguém violar a regra — inclusive pelo alias `@/`,
que depende do bundler e quebraria `node --test`.

Efeito colateral de áudio vive em `src/hooks`; interface, em `src/components`.

### Pipeline de detecção

```
getUserMedia (sem echoCancellation/noiseSuppression/autoGainControl)
  → highpass → [notch 50/60 Hz, só no baixo] → lowpass → AnalyserNode
  → decimação → YIN → mediana móvel → suavização exponencial em cents → histerese
```

### Perfis por instrumento

Não existe um conjunto único de parâmetros. O violão usa janela de 4096 e busca de 65–700 Hz; o
baixo usa 8192 e 28–450 Hz. Os números têm justificativa em `specs/.../decisions.md` — em
particular:

- **Janela 8192 no baixo (D4):** 4096 dá só 2,6 períodos do B0 (30,87 Hz), insuficiente para o
  vale da função diferença ser confiável.
- **Notch em vez de highpass no baixo (D12):** 60 Hz de zumbido de rede cai *entre* A1 (55 Hz) e
  D2 (73,42 Hz); um highpass que o removesse levaria as duas cordas graves junto.
- **Decimação obrigatória (D11):** sem ela o baixo custaria 13,2 M operações por frame.

Antes de mexer nesses valores, leia a decisão correspondente — todos foram escolhidos por
restrição numérica, não por gosto.

## Pontos de atenção (gotchas)

- **Cordas são declaradas por número MIDI**, nunca por Hz literal. A frequência sai de
  `a4 · 2^((midi−69)/12)`, o que torna o diapasão ajustável trivial e elimina constante mal
  digitada.
- **As três flags de processamento de voz do `getUserMedia` ficam em `false`.** O AGC e o supressor
  de ruído são feitos para fala e destroem as cordas graves — no baixo, fatalmente.
- **`setState` só em mudanças discretas.** O ponteiro e o número de cents são escritos por `ref`
  dentro do laço; re-renderizar 30×/s trava celular de entrada.
- **A latência do baixo é maior (~250 ms) e isso é físico**, não bug: um ciclo de B0 dura 32 ms.
- **Sem HTTPS não há `getUserMedia`.** Deploy sem TLS = produto que não funciona.
- Preferências (instrumento, afinação, diapasão) vão para `localStorage` — não há backend para
  guardá-las.

## Specs

O trabalho é guiado por `specs/2026-08-03-afinador-violao/`. `tasks.md` tem o plano em waves com
critérios de aceite; `decisions.md` registra o porquê de cada escolha técnica. Ao concluir uma
task, marque o checkbox e atualize a contagem no topo do `tasks.md`.

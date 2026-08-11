# Afinador

Afinador cromático de **violão, guitarra e baixo** que roda no navegador, pelo microfone do próprio
dispositivo. Sem instalar nada, e o áudio nunca sai do aparelho.

Você toca as cordas soltas e ele acompanha: detecta a nota, reconhece qual corda é, mostra o desvio
em cents e diz se é para apertar ou afrouxar.

**Produção:** `afinador.godoz.dev.br` · **Dev:** `localhost:3007`

## Estado

Waves 0 a 3 concluídas — o afinador está funcional e **os três instrumentos foram validados em
hardware real**. 112 testes automatizados, lint limpo, build gerando as rotas estáticas mais o
manifest.

| Etapa | Situação |
|---|---|
| Motor de detecção (YIN) | ✅ ≤ 1 cent nas 26 frequências dos presets |
| Captura de áudio | ✅ verificado em desktop e Android |
| Mostrador e cordas | ✅ violão real, conferido contra o afinador do Google |
| Presets, diapasão, tom de referência | ✅ código pronto |
| Baixo de 4 e de 5 cordas | ✅ testados em instrumento real, incluindo o B0 (30,87 Hz) |
| Safari no iPhone | ⏳ pendente |
| Deploy | ⏳ arquivos prontos, ver [DEPLOY.md](DEPLOY.md) |

Detalhe por task em [`specs/2026-08-03-afinador-violao/tasks.md`](specs/2026-08-03-afinador-violao/tasks.md).

## Funcionalidades

- **Detecção automática de corda** — dedilhe e o afinador identifica qual das cordas você tocou.
- **Travar corda** — para quando a corda está tão desafinada que fica mais perto da vizinha.
- **10 presets:** violão (padrão E, Drop D, meio tom abaixo, um tom abaixo, DADGAD, Open G), baixo
  de 4 cordas (padrão, Drop D, meio tom abaixo) e baixo de 5 cordas (padrão B).
- **Diapasão ajustável** de 415 a 466 Hz.
- **Tom de referência** por corda; alvos abaixo de 60 Hz soam uma oitava acima, porque alto-falante
  de celular não reproduz 30–40 Hz.
- **Preferências salvas** entre visitas, no próprio navegador.
- **Instalável e offline** — dá para adicionar à tela inicial do celular e usar sem rede nenhuma.
  Fácil de suportar aqui porque não há backend: depois da carga, o afinador não fala com ninguém.
- **Tela não apaga** durante a afinação, já que as mãos estão no instrumento.
- **Página `/diagnostico`** — taxa do dispositivo, nível de entrada, parâmetros do perfil ativo e
  sinais de instalabilidade. Existe para suporte remoto: transforma "não funcionou no meu celular"
  em dado utilizável. **Não há link para ela no site** — é ferramenta de apoio, não parte do uso
  normal; chega-se digitando o endereço.

## Como rodar

```powershell
cd frontend; npm install
cd frontend; npm run dev     # http://localhost:3007
cd frontend; npm test        # 105 testes, sem navegador
cd frontend; npm run lint
```

Não há backend, banco nem variável de ambiente para configurar.

## Testando no celular

O microfone só funciona em **contexto seguro**. `localhost` conta como seguro, mas
`http://192.168.x.x:3007` não — é por isso que existe um script separado:

```powershell
cd frontend; npm run dev:https
```

O Next gera um certificado autoassinado (via mkcert) em `frontend/certificates/` e serve em
`https://localhost:3007`. Para abrir do celular, use o IP da máquina na rede:
`https://192.168.x.x:3007`.

**No primeiro acesso o navegador do celular vai avisar que a conexão não é privada.** Isso é
esperado — o certificado é seu, não de uma autoridade pública. No Safari: *Mostrar detalhes* →
*visitar este site*. No Chrome Android: *Avançado* → *Ir para o site*. Depois disso a origem passa a
contar como segura e o microfone é liberado.

**O que o certificado autoassinado não permite testar:** a **instalação do app**. O Chromium não
considera instalável uma origem com certificado inválido, mesmo depois de você prosseguir pelo aviso
— e o mesmo erro costuma impedir o registro do service worker. Ou seja, PWA e offline só se validam
no domínio público, com certificado de verdade. A página `/diagnostico` mostra esses sinais
(contexto seguro, service worker, convite do navegador) para não ser preciso adivinhar.

Se o iOS recusar mesmo depois de passar pelo aviso, o caminho definitivo é instalar a autoridade
raiz do mkcert no aparelho: envie o `rootCA.pem` (o caminho sai de `mkcert -CAROOT`) para o iPhone,
instale o perfil em *Ajustes → Geral → VPN e Gerenciamento de Dispositivos* e depois marque a
confiança total em *Ajustes → Geral → Sobre → Configurações de Confiança do Certificado*.

Vale lembrar que HTTPS não é detalhe de desenvolvimento: em produção ele é pré-requisito, porque sem
ele o `getUserMedia` simplesmente não existe (`decisions.md` D9).

## Estrutura

```
frontend/src/lib/         módulos puros — rodam em Node, sem navegador nem React
  instrumentos.js         instrumentos, perfis de análise e presets (cordas por número MIDI)
  preferencias.js         validação do que veio do localStorage
  erros-microfone.js      classificação e texto dos erros de permissão
  pitch/yin.js            detecção de altura
  pitch/decimate.js       decimação e porta de silêncio
  pitch/smoothing.js      mediana, suavização e histerese
  pitch/cents.js          desvio em cents e escolha da corda
  pitch/leitura.js        do que foi detectado para o que a tela mostra
  pitch/referencia.js     regra da oitava no tom de referência
frontend/src/hooks/       efeito colateral de áudio e ciclo de vida do React
frontend/src/components/  interface
specs/                    requisitos, design, tasks e decisões
DEPLOY.md                 publicação na VPS
```

## Como funciona

```
getUserMedia (sem echoCancellation / noiseSuppression / autoGainControl)
  → highpass → [notch 50/60 Hz, só no baixo] → lowpass → AnalyserNode
  → decimação → YIN → mediana móvel → suavização em cents → histerese → tela
```

Três coisas explicam a maior parte do desenho, e todas têm justificativa numérica em
[`decisions.md`](specs/2026-08-03-afinador-violao/decisions.md):

**Autocorrelação, não FFT.** Com janela de 4096 a 48 kHz a resolução espectral é 11,7 Hz, enquanto
1 cent vale 0,048 Hz no E2 e 0,018 Hz no B0. Chegar lá por FFT exigiria janelas de vários segundos.

**Perfil por instrumento.** A corda mais grave do baixo de 5 (B0 = 30,87 Hz) está mais de uma oitava
abaixo da do violão. O baixo usa janela de 170 ms contra 85 ms do violão, e ganha notches de 50/60 Hz
— o zumbido de rede cai *entre* A1 (55 Hz) e D2 (73,42 Hz), então um highpass que o removesse levaria
as duas cordas graves junto.

**Janela em tempo, não em amostras.** `AudioContext.sampleRate` é escolha do hardware. Janela fixa em
amostras cobre menos tempo quanto maior a taxa — a 96 kHz o violão caía para 2,8 períodos da nota
mais grave. O que é constante é a duração.

## A regra que sustenta o projeto

**Nada em `src/lib` toca `window`, `AudioContext` ou React.**

É o que permite validar a precisão do detector com tons sintéticos, em Node, sem microfone nem
navegador — e é essa suíte que sustenta a garantia de 1 cent. `src/lib/pureza.test.js` falha se
alguém quebrar a regra, inclusive pelo alias `@/`, que depende do bundler.

Efeito colateral de áudio vive em `src/hooks`; interface, em `src/components`.

## Testes

```powershell
cd frontend; npm test
```

Rodam em Node puro, sem navegador. Cobrem a precisão do detector com tons sintéticos — incluindo
timbre de baixo com fundamental atenuada, que é onde a autocorrelação ingênua erra a oitava —, as
três taxas de amostragem comuns, a lógica de qual corda mostrar, a suavização e os erros de permissão.

Alguns testes existem por causa de bug encontrado em instrumento real e ficam como regressão. O mais
instrutivo é o do E2 medido contra o D3: por retenção de leitura, o mostrador acusava −1000 cents com
o ponteiro cravado — número correto descrevendo um som que já tinha acabado.

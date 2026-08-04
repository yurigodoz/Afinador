# Afinador

Afinador cromático de violão, guitarra e baixo que roda no navegador, pelo microfone do próprio
dispositivo. Sem instalar nada, e o áudio nunca sai do aparelho.

**Produção:** `afinador.godoz.dev.br` · **Dev:** `localhost:3007`

## Como rodar

```powershell
cd frontend; npm install
cd frontend; npm run dev     # http://localhost:3007
cd frontend; npm test        # suíte de tons sintéticos
cd frontend; npm run lint
```

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

Se o iOS recusar mesmo depois de passar pelo aviso, o caminho definitivo é instalar a autoridade
raiz do mkcert no aparelho: envie o `rootCA.pem` (o caminho sai de `mkcert -CAROOT`) para o iPhone,
instale o perfil em *Ajustes → Geral → VPN e Gerenciamento de Dispositivos* e depois marque a
confiança total em *Ajustes → Geral → Sobre → Configurações de Confiança do Certificado*.

Vale lembrar que HTTPS não é detalhe de desenvolvimento: em produção ele é pré-requisito, porque sem
ele o `getUserMedia` simplesmente não existe (`specs/.../decisions.md` D9).

## Estrutura

```
frontend/src/lib/      módulos puros — rodam em Node, sem navegador nem React
frontend/src/hooks/    captura de áudio e laço de análise (Wave 1+)
frontend/src/components/  interface (Wave 2+)
specs/                 requisitos, design, tasks e decisões
```

A regra que sustenta o projeto: **nada em `src/lib` toca `window`, `AudioContext` ou React.** É o
que permite validar a precisão do detector com tons sintéticos, sem microfone — e há um teste que
falha se alguém quebrar isso.

## Estado

Wave 0 concluída: motor de detecção de altura implementado e testado (51 testes). A interface
começa na Wave 2. Ver `specs/2026-08-03-afinador-violao/tasks.md`.

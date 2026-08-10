# Deploy — afinador.godoz.dev.br

Segue o padrão da VPS já documentado em `c:\Git\vps-config`. O afinador é o app mais simples da
máquina: **não tem backend, banco nem WebSocket** — só um Next.js servindo três rotas estáticas.

**HTTPS não é opcional.** `getUserMedia` só existe em contexto seguro: sem TLS o site abre, o botão
aparece e o microfone nunca liga. Enquanto o certbot não rodar, o deploy não está concluído
(`specs/2026-08-03-afinador-violao/decisions.md` D9).

---

## 1. DNS

Apontar `afinador.godoz.dev.br` para o IP da VPS (registro A) e esperar propagar.

```bash
dig +short afinador.godoz.dev.br
```

Só siga quando devolver o IP certo — o certbot valida o domínio por HTTP e falha se o DNS ainda não
resolveu.

## 2. Código e build na VPS

```bash
cd /home/deploy
git clone <repo> Afinador          # ou: cd Afinador && git pull
cd Afinador/frontend
npm ci                             # usa o package-lock.json
npm run build
```

`npm ci` e não `npm install`: reproduz exatamente as versões testadas.

## 3. PM2

O bloco `afinador-web` já está em `vps-config/ecosystem.config.js`.

```bash
cd /home/deploy
cp /caminho/do/repo/vps-config/ecosystem.config.js ./ecosystem.config.js
pm2 start ecosystem.config.js --only afinador-web
pm2 save
pm2 logs afinador-web --lines 30
```

Conferir que subiu na porta certa, sem colidir com os outros seis apps:

```bash
curl -I http://127.0.0.1:3007
```

## 4. nginx

```bash
sudo cp /caminho/do/repo/vps-config/nginx/afinador.conf /etc/nginx/sites-available/afinador
sudo ln -s /etc/nginx/sites-available/afinador /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Confirme que a página abre em `http://afinador.godoz.dev.br` **antes** do certbot. Neste momento o
afinador ainda não funciona — vai exibir a mensagem "Esta página precisa de HTTPS", que é o FR-2
fazendo o trabalho dele. É o comportamento esperado, não um erro de deploy.

## 5. TLS

```bash
sudo certbot --nginx -d afinador.godoz.dev.br
```

O certbot reescreve o server block adicionando o TLS e o redirecionamento de 80 para 443.

Depois de alguns dias estáveis, considere descomentar o `Strict-Transport-Security` em
`afinador.conf`. Antes disso não: uma vez enviado, o navegador recusa HTTP nesse domínio por um ano.

## 6. Verificação pós-deploy

```bash
curl -I https://afinador.godoz.dev.br            # 200, com os headers de segurança
curl -I http://afinador.godoz.dev.br             # 301 para https
curl -sI https://afinador.godoz.dev.br/_next/static/ | grep -i x-cache-status
pm2 status afinador-web
```

No celular, via 4G (fora da rede local):

1. A página abre e pede permissão de microfone.
2. Afinar as seis cordas de um violão.
3. Abrir `/diagnostico` e conferir a taxa do dispositivo e o nível de entrada.

## 7. Atualizações

```bash
cd /home/deploy/Afinador && git pull
cd frontend && npm ci && npm run build
pm2 restart afinador-web
```

O nginx não cacheia nada (`decisions.md` D25), então a mudança aparece assim que o PM2 reinicia.

**Atenção ao app instalado.** Quem adicionou o afinador à tela inicial roda com service worker: a
nova versão é baixada em segundo plano e o app **avisa "Nova versão disponível"** com um botão de
atualizar. A troca não é automática de propósito — substituir o app no meio de uma afinação seria
pior que esperar. Se quiser forçar durante um teste, basta recarregar duas vezes ou limpar os dados
do site.

Ao mudar o `sw.js`, incremente a constante `VERSAO` nele: é o que descarta os caches antigos.

---

## Roteiro para teste remoto do baixo

O baixo de 4 e de 5 cordas **não foi testado em instrumento real** — só com tons sintéticos
(`decisions.md` D16). O teste depende de terceiro, e o retorno precisa vir com números, não com
veredito: erro de oitava é indistinguível de acerto para quem não sabe o que procurar.

Peça exatamente isto:

> Abre `https://afinador.godoz.dev.br` no celular, escolhe "Baixo 4 cordas" (ou 5) nos controles e
> toca cada corda solta. Para cada uma me manda:
> - qual **nota** apareceu no meio da tela (com o número da oitava — "E1", não só "E")
> - quantos **cents** apareceram embaixo
> - qual **corda** ficou destacada na lista
>
> Depois abre `afinador.godoz.dev.br/diagnostico` e me manda a **taxa do dispositivo** e o **nível
> de entrada** em repouso e tocando. E me diz o modelo do celular.

O que procurar na resposta:

- **Nota certa, oitava errada** (B1 no lugar de B0) → erro de oitava no detector; revisar faixa de
  busca e limiar do YIN.
- **Nenhuma corda destaca** → limitação de captação do microfone naquela frequência. A saída passa a
  ser entrada de linha (D15) ou aceitar detecção pela 2ª parcial.
- **Nível em repouso muito acima de −55 dBFS** → ambiente barulhento; a porta de silêncio calibrada
  em D19 não serve para o caso dele, e o piso adaptativo sai da gaveta.

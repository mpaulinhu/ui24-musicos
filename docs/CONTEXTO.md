# CONTEXTO DO PROJETO — leia isto primeiro

> Este arquivo existe para dar contexto rápido a qualquer pessoa **ou a uma nova
> sessão do Claude / assistente de IA** que pegar este projeto do zero (por
> exemplo, em outro computador ou outra conta). Se você é uma IA lendo isto:
> este é o resumo do que foi construído, por quê, e o que ainda falta.

## O que é este projeto

Interface web **própria** para os músicos de uma igreja controlarem o **fone
individual (aux)** deles numa mesa de som **Soundcraft Ui24R**, sem precisar dar
acesso à interface oficial da mesa.

**Em uso real na igreja do Marcos desde setembro/2026.** A intenção agora é
disponibilizar o projeto para **outras igrejas** rodarem a própria instalação
(cada igreja com seu próprio servidor, sua própria mesa, sua própria config —
ver "Modelo de instalação" abaixo).

## As 4 telas — quem usa cada uma

O projeto tem **quatro telas web separadas**, cada uma para um público:

| Tela | URL | Quem usa | Senha | Para quê |
|---|---|---|---|---|
| **Músico** | `/musico` | Cada músico, no celular dele | a senha individual do músico (definida no Admin) | Ver e ajustar o fone (faders, mute, volume geral) + chat com a House Mix |
| **Monitor** | `/monitor` | A House Mix (operador), numa tela grande/TV | a senha da House Mix | Ver as mensagens do chat dos músicos, com beep e destaque de urgência |
| **Admin** | `/admin` | Quem administra a instalação (ex: o responsável técnico da igreja) | a senha de admin | **Configurar tudo** sem editar código nem arquivo — ver seção abaixo |
| **Espião** | `/espiao` | Quem está fazendo a instalação inicial, só durante o mapeamento da mesa | a mesma senha da House Mix | Descobrir os números reais (canal/aux) da mesa da igreja, ao vivo |

Reforçando porque é uma dúvida recorrente: são **quatro páginas HTML
diferentes** (`public/musico/`, `public/monitor/`, `public/admin/`,
`public/espiao/`), servidas pelo mesmo servidor Node na mesma porta (3000).
Não é a mesma tela com abas — cada uma tem seu próprio login e sua própria
senha.

## A tela Admin cobre 100% da configuração — sem mexer em código

Isso é o ponto central para outra igreja conseguir instalar sozinha: **depois
que o servidor está rodando, tudo que muda de uma igreja para outra é feito
pela tela `/admin`**, sem editar nenhum arquivo `.js` nem reiniciar o servidor
manualmente. O admin edita e salva ao vivo:

- **IP e porta da mesa** (ao salvar com IP novo, o servidor reconecta sozinho).
- **Senha da House Mix** e **senha do próprio Admin**.
- **Músicos**: nome, senha, aux (fone) de cada um, e o par estéreo se houver.
- **Canais da mesa**: número do canal (id), nome amigável, par estéreo.
- **Mute Geral**: quais canais aparecem na aba "GERAL" (tira do fone de todo
  mundo e do som principal).

O único arquivo que a tela Admin não expõe é o `server/config.json` em si —
ela lê e grava nele por baixo dos panos (`GET/POST /api/admin/*` em
`server/index.js`), mas quem instala nunca precisa abrir esse arquivo à mão.
Editar `config.json` direto continua possível (é só um JSON), mas é o
caminho manual — o caminho pensado para "outra igreja aplicar na máquina dela
sem mudar código" é sempre a tela `/admin`.

**O que continua exigindo alguém tecnicamente capaz, mas só uma vez** (não dá
pela tela Admin): baixar o projeto e dar duplo-clique no `PRIMEIRA-VEZ.bat`
(ver "Instalador leigo" abaixo), e usar o `/espiao` para mapear os números da
mesa — que também é feito clicando/mexendo em faders na mesa, sem escrever
código. Depois disso, o dia a dia (ligar o servidor, trocar músico, trocar
senha, ajustar canal) é tudo por duplo-clique + tela, sem terminal.

## Instalador leigo — `PRIMEIRA-VEZ.bat` / `LIGAR-SERVIDOR.bat` (Windows)

Na raiz do repo (não em `scripts/`, para ficar visível de cara):

- **`PRIMEIRA-VEZ.bat`** — usar só uma vez, no primeiro uso num computador
  novo. Confere se o Node.js está instalado (orienta a instalar se não
  estiver), roda `npm install`, e no final já chama o `LIGAR-SERVIDOR.bat`.
- **`LIGAR-SERVIDOR.bat`** — usar todas as vezes seguintes (inclusive é
  chamado pelo `PRIMEIRA-VEZ.bat` no final). Sobe `npm start` e imprime os
  4 links das telas na própria janela.

Os dois são **genéricos**: usam `cd /d "%~dp0"` (a própria pasta onde o
`.bat` está), então funcionam em qualquer máquina/pasta sem editar caminho —
diferente dos scripts antigos em `scripts/iniciar-servidor*.bat`, que têm o
caminho `c:\Users\Pc\Downloads\Repo-UI` cravado (são específicos da
instalação do Marcos, não usar como modelo para outra igreja).

**Gotcha de codificação (testado e corrigido em 2026-09-23):** arquivos
`.bat` no Windows precisam ser **ASCII puro + CRLF**, nunca UTF-8 (mesmo sem
BOM) nem LF puro — o `cmd.exe` corrompe o parsing em acentos/caracteres
especiais de forma silenciosa e imprevisível (sintoma visto:
`'EM' não é reconhecido como um comando interno`, com `REM` sendo lido como
`EM`). Além disso, **evite blocos `if (...) ( ... )` com `echo` contendo
parênteses escapados (`echo 1^) texto`)** dentro do bloco — isso também
corrompeu o parsing do bloco inteiro num teste real (parte do `echo` sumia
silenciosamente). Prefira `if errorlevel 1 goto :label` com blocos separados
por `:label` a blocos `if (...)`. Ferramenta usada para diagnosticar: `file`
+ `xxd` nos bytes iniciais do arquivo, comparando com um `.bat` que já
funcionava (`scripts/iniciar-servidor.bat`, ASCII+CRLF).

## Modelo de instalação — cada igreja é uma cópia isolada

Não é um serviço central que várias igrejas compartilham. Cada igreja:

1. Baixa este repositório na própria máquina (o PC da House Mix, ou um
   Raspberry Pi) — ZIP do GitHub ou `git clone`.
2. Dá duplo-clique em `PRIMEIRA-VEZ.bat` (Windows — ver seção acima) ou roda
   `npm install` pelo terminal (Mac/Linux).
3. Na primeira execução, o servidor copia `server/config.default.json` para
   `server/config.json` — esse `config.json` é **local da instalação**, tem
   as senhas e o IP da mesa **daquela** igreja, e nunca vai para o Git
   (está no `.gitignore`; ver `server/config.js`).
4. Dali em diante, a igreja edita a própria config pela tela `/admin`, e liga
   o servidor sempre por `LIGAR-SERVIDOR.bat`.

Ou seja: distribuir o projeto para outra igreja = ela baixar o repo e seguir o
README (seções 1 a 4B) na própria máquina. Não há dado de uma igreja visível
para outra — são instalações fisicamente separadas.

## Arquitetura (resumo)

```
Músicos (celular) ─┐
House Mix (monitor)├─► SEU SERVIDOR (Node.js) ──WebSocket──► Ui24R (a mesa)
Admin ─────────────┤     mantém 1 conexão com a mesa
Espião ────────────┘     e distribui para todos + faz o chat
```

- **server/index.js** — servidor central (HTTP + WebSocket). Serve as quatro
  páginas, autentica cada tipo de cliente (musico/housemix/admin/espiao),
  roteia comandos e chat, e expõe a API do Admin (`/api/admin/get`,
  `/api/admin/save`).
- **server/ui24-client.js** — fala o protocolo da Ui24R. Comandos:
  `i.<canal>.aux.<aux>.value` (nível) e `.mix` (mute); `a.<aux>.value` (master
  do fone). Índices começam em 0. **Se o firmware de outra mesa usar outro
  formato, é AQUI que se ajusta** (métodos caminhoNivel/caminhoMix/caminhoMasterAux)
  — esse é o único cenário em que instalar em outra igreja pode exigir tocar
  em código, e só se o protocolo da mesa dela divergir do mapeado hoje.
- **server/ui24-simulator.js** — "mesa de mentira" para testar sem a Ui24R.
- **server/config.js** — carrega/valida/salva o `config.json` de cada
  instalação; é consumido pelo `index.js`, mas quem instala não precisa abrir
  este arquivo (é lógica, não dado — o dado é o `config.json`).
- **public/musico**, **public/monitor**, **public/admin**, **public/espiao**
  — as quatro telas.

## Estado atual (o que já funciona e foi testado)

- Interface do músico com login, até 20 faders, mute, master, chat geral com
  histórico, alerta de "chamar atenção" entre músicos.
- Monitor com presença (com tolerância a quedas de conexão), beep, destaque
  de urgência, resposta da House Mix.
- Tela Admin completa: mesa, senhas, músicos, canais, mute geral — validação
  no servidor antes de salvar, aplica ao vivo sem reiniciar.
- Reconexão automática (músico e monitor refazem login se a conexão cair).
- Espião traduzindo comandos (canal/aux/valor) ao vivo.
- PWA (instalável no celular do músico) e VU meter ao vivo.
- **Validado em produção**, na igreja do Marcos, contra a mesa Ui24R real —
  não é mais "só simulador" (era o estado quando este arquivo foi escrito
  pela primeira vez; ver git log para o histórico).
- Testei em 2026-09-23 (sessão de revisão) o fluxo completo via WebSocket
  direto contra o simulador: login → estado inicial dos canais → `set_nivel`
  → chat, tudo chegando e propagando corretamente. Sem erros de console nas
  telas `/musico`, `/monitor`, `/admin`, `/espiao`.

## Para adaptar em outra mesa/igreja (roteiro)

1. A outra igreja baixa o repo, roda `PRIMEIRA-VEZ.bat` (Windows) ou
   `npm install` (Mac/Linux).
2. Testa em casa contra o simulador (`npm run sim` + `LIGAR-SERVIDOR.bat`/
   `npm start`) para aprender a interface antes de ir à igreja.
3. Na igreja, edita **pela tela `/admin`** (não por arquivo): IP da mesa,
   senhas, e deixa músicos/canais com os valores de exemplo por enquanto.
4. Usa o `/espiao` para descobrir os números reais (canal/aux) da mesa dela —
   ver README seção 4B. Regra rápida: número que aparece na mesa − 1 =
   número no Admin.
5. Volta no `/admin` e preenche músicos/canais com os números reais.
   Salvar já aplica ao vivo.
6. Testa fader por fader confirmando no fone/na mesa.
7. Se os comandos crus no `/espiao` tiverem formato diferente do esperado
   (firmware diferente), aí sim é preciso mexer em código — em
   `server/ui24-client.js`, único ponto de ajuste do protocolo.

## Senhas de exemplo (no config.default.json — trocar em produção)

Musico 1 = 1111, Musico 2 = 2222 (o modelo vem só com 2; adicione mais pela
tela Admin). House Mix / Espião / Admin = `troque-esta-senha`.

## Gotchas conhecidos

- Sintomas de "página feia" ou "não envia" quase sempre são **cache do
  navegador** (Ctrl+Shift+R resolve) ou **servidor caído**, não bug de código.
- Assets usam caminho absoluto (`/musico/style.css` etc.); caminho relativo
  quebra ao acessar uma rota sem barra final.
- Para depurar, vale abrir a página com Playwright/DevTools (pega 404 de
  asset e erro de JS que teste de terminal não pega).
- Login de músico/admin/housemix compara senha em texto simples, sem hash e
  sem limite de tentativas — aceitável para uso dentro da rede Wi-Fi da
  igreja, mas é uma limitação conhecida, principalmente para a senha de
  Admin (que reconfigura a mesa inteira). Não expor a porta do servidor para
  fora da rede local sem VPN.
- `server/config.json` é por instalação e nunca vai para o Git — se for
  reescrever este projeto do zero em outra máquina, ele é recriado
  automaticamente a partir de `config.default.json` na primeira execução.

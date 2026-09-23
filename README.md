# Mix de Fone — Interface para músicos (Soundcraft Ui24R)

Uma interface **própria** para os músicos controlarem o **fone individual (aux)**
deles na mesa Ui24R, sem precisar dar acesso à interface oficial da mesa. Inclui
uma **aba de chat**: o músico manda uma mensagem e ela aparece num **monitor** da
House Mix.

```
┌───────────┐        ┌──────────────────┐        ┌───────────┐
│  Músicos  │◄─────►│  SEU SERVIDOR    │◄─────►│  Ui24R    │
│ (celular) │        │  (este projeto)  │  WS    │  (a mesa) │
│ House Mix │◄─────►│  1 conexão c/ a  │        │           │
│ (monitor) │        │  mesa + chat     │        └───────────┘
└───────────┘        └──────────────────┘
```

> **Por que um servidor no meio?** A Ui24R tem um limite de conexões simultâneas.
> O servidor mantém **uma única** conexão com a mesa e distribui para todos os
> músicos. Isso é mais estável e ainda dá o chat "de graça".

### As 4 telas do sistema

| Tela | URL | Quem usa | Para quê |
|---|---|---|---|
| **Músico** | `/musico` | Cada músico, no celular | Fone (faders, mute, volume) + chat |
| **Monitor** | `/monitor` | House Mix, numa tela grande | Ver mensagens do chat dos músicos |
| **Admin** | `/admin` | Quem administra a instalação | **Configurar tudo** (mesa, senhas, músicos, canais) — sem editar arquivo nem código |
| **Espião** | `/espiao` | Só durante a instalação inicial | Descobrir os números (canal/aux) da mesa da igreja |

São quatro páginas separadas, cada uma com seu próprio login/senha, servidas
pelo mesmo servidor na mesma porta (3000). **Toda a configuração do dia a dia
— trocar músico, trocar senha, ajustar canal, mudar o IP da mesa — é feita
pela tela `/admin`, sem precisar editar `config.json` nem reiniciar nada.**
Isso é o que permite outra igreja instalar e configurar a própria unidade sem
tocar em código: só é preciso mexer em código se o protocolo da mesa dela for
diferente do mapeado aqui (ver seção 8).

---

## 1. O que você precisa

- Um computador para rodar o servidor — **Windows** é o caminho mais simples
  (tem os atalhos prontos abaixo); Mac/Linux/Raspberry Pi também funcionam,
  mas aí é pelo terminal (ver alternativa no fim desta seção).
  - Pode ser o mesmo PC da House Mix.
- **Node.js** instalado (versão 18 ou superior) — o instalador abaixo confere
  e avisa se estiver faltando; ou baixe direto em <https://nodejs.org> (versão
  "LTS").
- A mesa **Ui24R** e o computador na **mesma rede** (mesmo Wi-Fi/switch).

---

## 2. Instalação (uma vez só) — sem precisar saber programar

1. Baixe este projeto (botão verde **Code → Download ZIP** no GitHub, ou
   `git clone`) e descompacte numa pasta.
2. Dentro da pasta, dê **duplo-clique em `PRIMEIRA-VEZ.bat`**.
   - Ele confere se o Node.js está instalado (e te avisa como instalar, se
     não estiver).
   - Instala tudo que o projeto precisa (demora um pouco só nesta vez).
   - Já liga o servidor no final — não precisa fazer mais nada.
3. Da próxima vez que for usar (depois de reiniciar o PC, por exemplo), é só
   dar duplo-clique em **`LIGAR-SERVIDOR.bat`** — não precisa rodar o
   `PRIMEIRA-VEZ.bat` de novo.

> A janela preta que abre (o servidor) **precisa ficar aberta** enquanto o
> sistema estiver em uso — pode minimizar, mas fechá-la desliga para todo
> mundo. Ela mesma mostra os links das telas assim que sobe.

**Alternativa por terminal** (Mac/Linux, ou quem preferir): na pasta do
projeto, rode `npm install` uma vez e depois `npm start` para ligar.

---

## 3. Testar em casa (SEM a mesa) — usando o simulador

Você consegue testar tudo antes de ir à igreja. Precisa de **duas janelas** de
terminal:

**Janela 1 — o simulador (finge ser a mesa):**
```bash
npm run sim
```

**Janela 2 — o servidor:**
```bash
npm start
```

Agora abra no navegador:

- Interface do músico: <http://localhost:3000/musico>
- Monitor da House Mix: <http://localhost:3000/monitor>

**Logins de teste** (definidos em `server/config.default.json`, editáveis pela
tela `/admin`):

| Músico       | Senha |
|--------------|-------|
| Baterista    | 1111  |
| Baixista     | 2222  |
| Guitarrista  | 3333  |
| Tecladista   | 4444  |

Monitor da House Mix — senha: **housemix**

Faça login como um músico, mexa nos faders e mande uma mensagem no chat: ela
aparece no monitor. Abra os dois em janelas diferentes para ver funcionando.

---

## 4. Usar na igreja (COM a mesa de verdade)

1. **NÃO** rode o simulador — na igreja é sempre `LIGAR-SERVIDOR.bat` (ou
   `PRIMEIRA-VEZ.bat` se for a primeira vez neste computador).
2. Descubra o **IP da mesa**. Na Ui24R, vá em **Settings → Network** (ou veja
   no roteador). Anote algo como `192.168.1.100`.
3. Abra **`http://localhost:3000/admin`** (senha padrão: `troque-esta-senha`,
   definida em `server/config.default.json` — **troque-a assim que entrar**)
   e preencha o **IP da mesa** no cartão "Mesa (mixer)". Clique em
   **SALVAR E APLICAR** — o servidor reconecta na mesa sozinho, sem precisar
   reiniciar.

   > Esse é o caminho recomendado: tudo pela tela, sem editar arquivo nem
   > reiniciar. Editar `server/config.json` direto (o arquivo que a tela
   > Admin lê e grava) continua funcionando, mas nesse caso é preciso
   > reiniciar o servidor manualmente para a mudança valer.

4. Descubra o **IP do computador** onde o servidor está rodando (no Windows:
   `ipconfig`; no Mac/Linux: `ifconfig` ou `ip a`). Ex: `192.168.1.50`.
5. Os músicos acessam no celular (mesmo Wi-Fi):
   - **`http://192.168.1.50:3000/musico`**
6. O monitor lá em cima abre:
   - **`http://192.168.1.50:3000/monitor`**
7. A tela de administração (só para quem cuida da instalação) fica em:
   - **`http://192.168.1.50:3000/admin`**

> **Dica:** deixe o navegador do monitor em tela cheia (F11).

---

## 4B. Descobrir os números da mesa — o "Espião" 🔍

Antes de preencher os músicos/canais na tela **Admin**, você precisa saber
**qual canal e qual fone (aux)** cada fader deve controlar. Em vez de
adivinhar, use o **Espião da Mesa** — uma ferramenta que mostra ao vivo os
comandos que a mesa envia, já traduzidos.

**Como usar:**

1. Com o servidor rodando e conectado na mesa real, abra no PC:
   - **`http://localhost:3000/espiao`**
2. Entre com a senha da House Mix (padrão: `housemix`).
3. Agora, na **interface OFICIAL da Ui24R** (no navegador, como você já usa), vá
   no fone de um músico e **mexa um canal por vez**. Ex: mexa o Bumbo no fone do
   baterista.
4. Veja o que aparece no Espião. Exemplo:
   ```
   Canal 2 (mesa: canal 3)   no   Aux 0 (mesa: fone 1)   [value] = 75%
   ```
   Isso significa: o Bumbo é o `id: 2` e o fone do baterista é o `aux: 0`. **Anote.**
5. Repita para cada canal de cada músico. Em ~15 min você tem o mapa completo,
   sem tentativa e erro.
6. Preencha esses números na tela **Admin** (veja a seção 5) e clique em
   **SALVAR E APLICAR** — não precisa reiniciar nada.

**Regra rápida (se preferir mapear na mão):** *número que você vê na mesa − 1 =
número no Admin.* Canal 1 → `id: 0`; Fone 3 → `aux: 2`.

**Método alternativo (F12 do Chrome):** na interface oficial da mesa, aperte
**F12 → aba Network → filtro WS → clique na conexão → aba Messages**. Ao mexer um
fader, você vê o comando cru (ex: `SETD^i.2.aux.0.value^0.75`). O Espião faz essa
leitura e já traduz para você — o F12 é só um "plano B" para confirmar.

> **Se o comando cru no Espião tiver um formato diferente** do `i.<canal>.aux.<aux>.value`
> esperado (por diferença de firmware), anote alguns exemplos: o ajuste é feito
> em `server/ui24-client.js` (métodos `caminhoNivel` / `caminhoMix` /
> `caminhoMasterAux`).

---

## 5. Personalizar os músicos e canais

Tudo isso é feito pela tela **`/admin`** (senha de admin) — **sem editar
arquivo nem reiniciar o servidor**. Lá você define:

- **Mesa**: IP e porta.
- **Senhas**: da House Mix (tela `/monitor`) e do próprio Admin.
- **Músicos**: nome, senha, o **aux** (qual saída de fone é a dele — de 0 a 9)
  e o par estéreo, se houver.
- **Canais da mesa**: o **número na mesa** (id) e um **nome amigável** para
  cada um, até **20 canais** por músico.
- **Mute Geral**: quais canais aparecem no botão "GERAL" (tira do fone de
  todo mundo e do som principal).

Clique em **SALVAR E APLICAR** ao final — a mudança já vale na hora para
todo mundo conectado.

> **Atenção aos números dos canais:** no protocolo, os canais começam em **0**.
> Ou seja: Canal 1 da mesa = `id: 0`, Canal 2 = `id: 1`, … Canal 24 = `id: 23`.
> O mesmo vale para os auxes (Fone 1 = `aux: 0`).

**Caminho alternativo (avançado):** o arquivo **`server/config.json`** guarda
os mesmos dados que a tela Admin edita, e pode ser editado direto num editor
de texto se preferir — nesse caso é preciso reiniciar o servidor (fechar a
janela do `LIGAR-SERVIDOR.bat` e abrir de novo) para a mudança valer.
`server/config.js` é só o código que lê/valida/salva esse arquivo; não é ele
que você edita no dia a dia.

---

## 6. Recursos da interface

**Do músico:**
- Login por instrumento + senha.
- Um fader (vertical) por canal, com o volume daquele canal **no fone dele**.
- Botão **MUTE** por canal.
- **Volume geral** do próprio fone.
- Aba **Chat** com botões de mensagens rápidas ("meu fone está baixo", etc.).

**Do monitor (House Mix):**
- Mensagens grandes, fáceis de ler de longe.
- **Beep** sonoro quando chega mensagem (tom mais agudo em palavras urgentes
  como "microfonia").
- Cartão fica **vermelho** em mensagens urgentes.
- Lista de quem está **online**.
- Campo para **responder a todos**.

**Do admin:**
- Edita mesa, senhas, músicos, canais e mute geral — tudo em uma tela, com
  validação antes de salvar.
- Salva e aplica ao vivo, sem reiniciar o servidor.
- Protegido por senha própria (diferente da senha da House Mix).

---

## 7. Estrutura do projeto

```
server/
  config.default.json  <- modelo versionado no Git (sem dados reais)
  config.json           <- config REAL desta instalação (mesa/senhas/músicos);
                            gerado a partir do modelo na 1a execução; NUNCA vai
                            pro Git; editado pela tela /admin (ou à mão)
  config.js             <- código que le/valida/salva o config.json
  ui24-client.js         <- fala o protocolo da Ui24R (conexão com a mesa)
  ui24-simulator.js      <- mesa "de mentira" para testar em casa
  index.js               <- o servidor central (HTTP + WebSocket + API do admin)
public/
  musico/               <- interface dos músicos (/musico)
  monitor/              <- tela da House Mix (/monitor)
  admin/                <- tela de configuração (/admin) — mesa, senhas, músicos, canais
  espiao/                <- ferramenta de mapeamento (/espiao) — descobrir id/aux da mesa
```

---

## 8. Sobre o protocolo da Ui24R (leitura importante)

O protocolo de controle da Ui24R **não é documentado oficialmente** pela
Soundcraft — ele foi mapeado pela comunidade. Os comandos usados aqui
(`i.<canal>.aux.<aux>.value` para nível e `.mix` para mute) são os mais comuns e
estáveis, e é o que a interface oficial usa.

Se em alguma coisa o comportamento na SUA mesa não bater (por diferença de
firmware), o **único ponto a ajustar** são os métodos `caminhoNivel()`,
`caminhoMix()` e `caminhoMasterAux()` em `server/ui24-client.js`. Há comentários
explicando exatamente o que cada um faz.

**Para mapear com 100% de precisão a sua mesa:** com a mesa ligada, dá para
"escutar" os comandos que a interface oficial dela envia quando você mexe num
fader (usando as ferramentas de desenvolvedor do navegador, aba Network →
WS). Se precisar, me chame que eu te ajudo a fazer essa captura e ajustar.

---

## 9. Problemas comuns

| Sintoma | Causa provável / solução |
|---|---|
| "mesa off" na interface | O servidor não achou a mesa. Confira o IP e a porta na tela `/admin` e se estão na mesma rede. |
| Músico não abre a página | Confirme o IP do computador do servidor e que o celular está no mesmo Wi-Fi. |
| Mexo no fader e nada acontece na mesa | Verifique se o `id` do canal e o `aux` do músico batem com a mesa. Lembre: começa em 0. |
| Sem beep no monitor | Alguns navegadores só tocam som após um clique na página. Clique uma vez na tela do monitor. |

---

## 10. Links rápidos das telas

Com o servidor ligado (`LIGAR-SERVIDOR.bat`), estes são os endereços — a
própria janela do servidor também mostra esta lista assim que sobe.

**No mesmo computador do servidor** (troque `localhost` pelo IP do
computador — seção 4 — para acessar de outro aparelho na mesma rede):

| Tela | Link |
|---|---|
| Músico (celular de cada músico) | http://localhost:3000/musico |
| Monitor (tela da House Mix) | http://localhost:3000/monitor |
| Admin (configurar mesa/senhas/músicos/canais) | http://localhost:3000/admin |
| Espião (mapear a mesa na instalação) | http://localhost:3000/espiao |

---

Feito para a House Mix. Qualquer ajuste (mais músicos, EQ, cores, logo da
igreja), é só pedir.
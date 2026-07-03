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

---

## 1. O que você precisa

- Um computador para rodar o servidor (Windows, Mac, Linux ou um Raspberry Pi).
  - Pode ser o mesmo PC da House Mix.
- **Node.js** instalado (versão 18 ou superior). Baixe em <https://nodejs.org>.
- A mesa **Ui24R** e o computador na **mesma rede** (mesmo Wi-Fi/switch).

---

## 2. Instalação (uma vez só)

Abra o terminal na pasta do projeto e rode:

```bash
npm install
```

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

**Logins de teste** (definidos em `server/config.js`):

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

1. Descubra o **IP da mesa**. Na Ui24R, vá em **Settings → Network** (ou veja no
   roteador). Anote algo como `192.168.1.100`.
2. Abra o arquivo **`server/config.js`** e edite o bloco `mesa`:

   ```js
   mesa: {
     host: '192.168.1.100', // <- IP real da SUA mesa
     port: 80,              // <- na mesa real é 80
   },
   ```

3. **NÃO** rode o simulador. Rode só o servidor:
   ```bash
   npm start
   ```
4. Descubra o **IP do computador** onde o servidor está rodando (no Windows:
   `ipconfig`; no Mac/Linux: `ifconfig` ou `ip a`). Ex: `192.168.1.50`.
5. Os músicos acessam no celular (mesmo Wi-Fi):
   - **`http://192.168.1.50:3000/musico`**
6. O monitor lá em cima abre:
   - **`http://192.168.1.50:3000/monitor`**

> **Dica:** deixe o navegador do monitor em tela cheia (F11).

---

## 4B. Descobrir os números da mesa — o "Espião" 🔍

Antes de preencher o `config.js` na igreja, você precisa saber **qual canal e qual
fone (aux)** cada fader deve controlar. Em vez de adivinhar, use o **Espião da
Mesa** — uma ferramenta que mostra ao vivo os comandos que a mesa envia,
já traduzidos.

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
6. Preencha o `config.js` com esses números (veja a seção 5) e reinicie.

**Regra rápida (se preferir mapear na mão):** *número que você vê na mesa − 1 =
número no config.* Canal 1 → `id: 0`; Fone 3 → `aux: 2`.

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

Tudo fica em **`server/config.js`** — é o único arquivo que você precisa editar
no dia a dia. Lá você define, para cada músico:

- **nome** e **senha**
- o **aux** (qual saída de fone é a dele — de 0 a 9)
- a lista de **até 20 canais** que ele controla, com o **id** do canal na mesa e
  um **nome amigável**.

> **Atenção aos números dos canais:** no protocolo, os canais começam em **0**.
> Ou seja: Canal 1 da mesa = `id: 0`, Canal 2 = `id: 1`, … Canal 24 = `id: 23`.
> O mesmo vale para os auxes (Fone 1 = `aux: 0`).

Depois de editar, **reinicie o servidor** (Ctrl+C e `npm start` de novo).

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

---

## 7. Estrutura do projeto

```
server/
  config.js           <- VOCÊ EDITA: músicos, canais, IP da mesa
  ui24-client.js      <- fala o protocolo da Ui24R (conexão com a mesa)
  ui24-simulator.js   <- mesa "de mentira" para testar em casa
  index.js            <- o servidor central
public/
  musico/             <- interface dos músicos
  monitor/            <- tela da House Mix
  espiao/             <- ferramenta de mapeamento (descobrir id/aux da mesa)
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
| "mesa off" na interface | O servidor não achou a mesa. Confira o IP e a porta em `config.js` e se estão na mesma rede. |
| Músico não abre a página | Confirme o IP do computador do servidor e que o celular está no mesmo Wi-Fi. |
| Mexo no fader e nada acontece na mesa | Verifique se o `id` do canal e o `aux` do músico batem com a mesa. Lembre: começa em 0. |
| Sem beep no monitor | Alguns navegadores só tocam som após um clique na página. Clique uma vez na tela do monitor. |

---

Feito para a House Mix. Qualquer ajuste (mais músicos, EQ, cores, logo da
igreja), é só pedir.




http://localhost:3000/espiao
# CONTEXTO DO PROJETO — leia isto primeiro

> Este arquivo existe para dar contexto rápido a qualquer pessoa **ou a uma nova
> sessão do Claude / assistente de IA** que pegar este projeto do zero (por
> exemplo, em outro computador ou outra conta). Se você é uma IA lendo isto:
> este é o resumo do que foi construído, por quê, e o que ainda falta.

## O que é este projeto

Interface web **própria** para os músicos de uma igreja controlarem o **fone
individual (aux)** deles numa mesa de som **Soundcraft Ui24R**, sem precisar dar
acesso à interface oficial da mesa. Inclui:

- **Aba Mix:** cada músico vê os canais do fone DELE (até 20) em faders, com mute
  e volume geral do fone.
- **Aba Chat (geral):** todos os músicos e a House Mix veem as mesmas mensagens;
  quem entra vê o histórico do culto. Mensagens urgentes (ex: "microfonia")
  ficam destacadas.
- **Monitor da House Mix** (`/monitor`): tela grande que mostra as mensagens dos
  músicos, com beep, para ficar num monitor visível ao operador.
- **Espião da Mesa** (`/espiao`): ferramenta para descobrir os números (id de
  canal e aux) reais da mesa — usada na fase de configuração na igreja.

## Arquitetura (resumo)

```
Músicos (celular) ─┐
House Mix (monitor)├─► SEU SERVIDOR (Node.js) ──WebSocket──► Ui24R (a mesa)
Espião ────────────┘     mantém 1 conexão com a mesa
                         e distribui para todos + faz o chat
```

- **server/index.js** — servidor central (HTTP + WebSocket). Serve as páginas,
  autentica, roteia comandos e chat, e tem o "modo espião".
- **server/ui24-client.js** — fala o protocolo da Ui24R. Comandos:
  `i.<canal>.aux.<aux>.value` (nível) e `.mix` (mute); `a.<aux>.value` (master do
  fone). Índices começam em 0. **Se o firmware da mesa usar outro formato, é
  AQUI que se ajusta** (métodos caminhoNivel/caminhoMix/caminhoMasterAux).
- **server/ui24-simulator.js** — "mesa de mentira" para testar sem a Ui24R.
- **server/config.js** — ÚNICO arquivo que se edita no dia a dia: IP da mesa,
  músicos, senhas, aux de cada um e a lista de canais.
- **public/musico**, **public/monitor**, **public/espiao** — as três telas.

## Estado atual (o que já funciona e foi testado)

- Interface do músico com login, 20 faders, mute, master, chat geral com
  histórico. TESTADO com Playwright (ponta a ponta, contra o simulador).
- Monitor com presença, beep, destaque de urgência, resposta da House Mix.
- Reconexão automática (músico e monitor refazem login se a conexão cair).
- Espião traduzindo comandos (canal/aux/valor) ao vivo.
- Tudo validado apenas contra o SIMULADOR. **Ainda NÃO foi testado na mesa real.**

## O QUE FALTA (próximo passo, na igreja)

1. Em `server/config.js`, trocar `mesa.host` pelo IP real da Ui24R e `mesa.port`
   para 80.
2. Descobrir o mapeamento real: abrir `/espiao` (senha = a da house mix), e na
   interface OFICIAL da mesa mexer um canal por vez em cada fone. O espião mostra
   qual `id` (canal) e `aux` (fone) usar. Regra: **número da mesa − 1 = número no
   config** (Canal 1 = id 0; Fone 1 = aux 0).
3. Preencher `config.js` com músicos/canais/aux reais e reiniciar.
4. Testar fader por fader confirmando no fone/na mesa.
5. Se os comandos crus no espião tiverem formato diferente do esperado, ajustar
   `server/ui24-client.js`.

## Como rodar

- Testar em casa: duplo-clique em **INICIAR.bat** (sobe simulador + servidor).
- Na igreja: **INICIAR-IGREJA.bat** (só o servidor, conecta na mesa real).
- Páginas: `/musico`, `/monitor`, `/espiao`. Porta 3000.

## Senhas de teste (trocar em config.js)

Baterista=1111, Baixista=2222, Guitarrista=3333, Tecladista=4444,
House Mix / Espião = housemix.

## Gotchas conhecidos

- Sintomas de "página feia" ou "não envia" quase sempre são **cache do navegador**
  (Ctrl+Shift+R resolve) ou **servidor caído**, não bug de código.
- Assets usam caminho absoluto (`/musico/style.css`); caminho relativo quebra ao
  acessar `/musico` sem barra final.
- Para depurar, vale abrir a página com Playwright (pega 404 de asset e erro de
  JS que testes de terminal não pegam).
- Os .bat matam node.exe antigo antes de subir (evita "porta em uso").

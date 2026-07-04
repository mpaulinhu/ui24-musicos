# Terminar o envio pro GitHub (fazer em casa)

O projeto JÁ está com Git configurado e com o primeiro commit feito. Falta só
ENVIAR pro GitHub, e isso deve ser feito em casa (na conta pessoal), porque no
PC do trabalho o Git está logado em outra conta.

## Situação atual

- Repositório local: **criado** ✅
- Primeiro commit: **feito** ✅ ("Primeira versao: interface de fone...")
- Repositório no GitHub: **criado** em `https://github.com/mpaulinhu/ui24-musicos`
- Falta: **enviar (push)** — precisa estar logado na conta `mpaulinhu`.

## O que descobrimos (o motivo do erro no trabalho)

O erro "Repository not found" NÃO era problema de URL. Era **conta errada**:
o repositório é da conta `mpaulinhu`, mas o Git no PC do trabalho estava logado
como `Marcospaulo-elo`. Como o repo é privado, o GitHub responde "not found" pra
quem não tem acesso.

## Passos em casa

1. Abra o terminal na pasta do projeto (no VS Code: Terminal > New Terminal).

2. Confira em qual conta o Git está logado:
   ```
   gh auth status
   ```
   Se disser `mpaulinhu`, ótimo, pule pro passo 4.

3. Se NÃO estiver como `mpaulinhu`, faça login nela:
   ```
   gh auth login
   ```
   Responda: GitHub.com > HTTPS > Yes > "Login with a web browser".
   No navegador, confirme que está logado como **mpaulinhu** antes de autorizar.

4. Envie o projeto:
   ```
   git push -u origin main
   ```

5. Deu certo se aparecer algo como "Writing objects" e "branch main -> main".
   Atualize `https://github.com/mpaulinhu/ui24-musicos` no navegador para ver.

## Depois disso, o dia a dia

Para salvar mudanças futuras no GitHub, 3 comandos:
```
git add .
git commit -m "descricao do que mudei"
git push
```

Para baixar o projeto em outro PC (ex: na igreja):
```
git clone https://github.com/mpaulinhu/ui24-musicos.git
```
(depois rode `npm install` nesse PC novo).

@echo off
REM ============================================================
REM  INICIA O SERVIDOR DO MIX DE FONE (Ui24R)
REM
REM  Para ligar sozinho junto com o Windows:
REM    1) Aperte Win+R, digite: shell:startup   e Enter
REM    2) Copie ESTE arquivo (ou um atalho dele) para essa pasta
REM
REM  Essa janela fica aberta mostrando o status do servidor
REM  (se conectou na mesa, erros, etc). Pode minimizar, mas nao
REM  fechar - fechar a janela desliga o servidor.
REM ============================================================
cd /d "c:\Users\Pc\Downloads\Repo-UI"
title Mix de Fone - Servidor (nao feche esta janela)

echo Reativando o link de acesso remoto (Tailscale Funnel)...
powershell -NoProfile -ExecutionPolicy Bypass -File "c:\Users\Pc\Downloads\Repo-UI\reativar-funnel.ps1"
echo.

echo Iniciando o servidor do Mix de Fone...
echo.
call npm start

echo.
echo ============================================================
echo  O servidor PAROU (fechou ou deu erro acima).
echo  Feche esta janela ou rode de novo dando duplo-clique aqui.
echo ============================================================
pause

@echo off
REM ============================================================
REM  INICIA O SERVIDOR EM SEGUNDO PLANO (sem janela visivel)
REM
REM  Nao rode este arquivo diretamente com duplo-clique - ele ainda
REM  abre uma janela rapidinho. Use o "iniciar-servidor-oculto.vbs"
REM  em vez disso (ou coloque ELE na pasta de Inicializacao).
REM
REM  Como nao tem janela pra mostrar os logs, tudo vai para o
REM  arquivo servidor.log, na pasta do projeto. Abra esse arquivo
REM  (com o Bloco de Notas) sempre que quiser conferir se a mesa
REM  conectou ou se deu algum erro.
REM ============================================================
cd /d "c:\Users\Pc\Downloads\Repo-UI"

echo. >> servidor.log
echo ============================================================ >> servidor.log
echo Iniciado em %date% %time% >> servidor.log
echo ============================================================ >> servidor.log

echo Reativando o link de acesso remoto (Tailscale Funnel)... >> servidor.log
powershell -NoProfile -ExecutionPolicy Bypass -File "c:\Users\Pc\Downloads\Repo-UI\reativar-funnel.ps1" >> servidor.log 2>&1

echo Iniciando o servidor do Mix de Fone... >> servidor.log
node server\index.js >> servidor.log 2>&1

echo O servidor PAROU em %date% %time% >> servidor.log

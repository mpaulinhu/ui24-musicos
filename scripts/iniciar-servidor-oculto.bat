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

REM O link remoto (Tailscale Funnel) e' so' para acesso de FORA da rede da
REM igreja. Roda em segundo plano, sem bloquear o servidor local — antes,
REM se o Tailscale estivesse com problema, o servidor demorava ate 2 minutos
REM (ou nem subia) so' esperando o Funnel, mesmo o acesso local nao precisando
REM disso.
echo Reativando o link de acesso remoto (Tailscale Funnel) em segundo plano... >> servidor.log
start "" /min powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command "& 'c:\Users\Pc\Downloads\Repo-UI\scripts\reativar-funnel.ps1' *> 'c:\Users\Pc\Downloads\Repo-UI\funnel.log'"

echo Iniciando o servidor do Mix de Fone... >> servidor.log
node server\index.js >> servidor.log 2>&1

echo O servidor PAROU em %date% %time% >> servidor.log

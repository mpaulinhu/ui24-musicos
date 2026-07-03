@echo off
REM ============================================================
REM  INICIAR  -  sobe o simulador e o servidor em duas janelas
REM  Basta dar DUPLO-CLIQUE neste arquivo.
REM  (Para testar em casa, com a mesa "de mentira".)
REM ============================================================

cd /d "%~dp0"

echo Limpando servidores antigos (se houver)...
REM Fecha qualquer node que tenha ficado aberto de uma execucao anterior.
REM Isso evita o erro "address already in use" (porta ocupada).
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 /nobreak >nul

echo Iniciando o SIMULADOR da mesa (janela separada)...
start "SIMULADOR DA MESA" cmd /k "node server\ui24-simulator.js"

REM Espera 2 segundos para o simulador subir
timeout /t 2 /nobreak >nul

echo Iniciando o SERVIDOR (janela separada)...
start "SERVIDOR DA HOUSE MIX" cmd /k "node server\index.js"

REM Espera o servidor subir e abre o navegador
timeout /t 3 /nobreak >nul

echo Abrindo a interface do musico no navegador...
start "" "http://localhost:3000/musico"

echo.
echo ============================================================
echo  Tudo iniciado!
echo  - Interface do musico:  http://localhost:3000/musico
echo  - Monitor da house mix: http://localhost:3000/monitor
echo.
echo  Senhas de teste:
echo    Baterista=1111  Baixista=2222  Guitarrista=3333  Tecladista=4444
echo    Monitor da house mix: housemix
echo.
echo  DEIXE as duas janelas pretas ABERTAS enquanto estiver usando.
echo  Para parar, feche as duas janelas.
echo ============================================================
echo.
echo Pode fechar ESTA janela. As outras duas devem ficar abertas.
timeout /t 8 /nobreak >nul

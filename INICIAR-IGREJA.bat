@echo off
REM ============================================================
REM  INICIAR-IGREJA  -  sobe SO o servidor (conecta na mesa real)
REM  Use este na igreja, depois de configurar o IP da mesa
REM  em server\config.js.  Basta dar DUPLO-CLIQUE.
REM ============================================================

cd /d "%~dp0"

echo Limpando servidores antigos (se houver)...
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 /nobreak >nul

echo Iniciando o SERVIDOR (conectando na mesa real)...
start "SERVIDOR DA HOUSE MIX" cmd /k "node server\index.js"

timeout /t 3 /nobreak >nul

start "" "http://localhost:3000/monitor"

echo.
echo ============================================================
echo  Servidor iniciado!
echo  - Musicos acessam:  http://SEU-IP:3000/musico
echo  - Monitor:          http://localhost:3000/monitor
echo.
echo  Descubra SEU-IP rodando "ipconfig" no terminal.
echo  DEIXE a janela preta ABERTA enquanto estiver usando.
echo ============================================================
echo.
pause

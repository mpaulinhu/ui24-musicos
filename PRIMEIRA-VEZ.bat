@echo off
REM ============================================================================
REM  PRIMEIRA VEZ - instala tudo e ja liga o servidor
REM
REM  Rode este arquivo (duplo-clique) SO NA PRIMEIRA VEZ, depois de baixar
REM  o projeto num computador novo. Ele:
REM    1) Confere se o Node.js esta instalado (e avisa como instalar, se nao).
REM    2) Instala as dependencias do projeto (demora um pouco, so na 1a vez).
REM    3) Liga o servidor.
REM
REM  Depois desta vez, use sempre o LIGAR-SERVIDOR.bat.
REM ============================================================================
cd /d "%~dp0"
title Mix de Fone - Primeira instalacao

echo ============================================================
echo   MIX DE FONE - Primeira instalacao
echo ============================================================
echo.

where node >nul 2>nul
if errorlevel 1 goto :semnode

echo Node.js encontrado. Instalando as dependencias do projeto...
echo (isso demora um pouco so nesta primeira vez)
echo.
call npm install
if errorlevel 1 goto :erroinstall

echo.
echo ============================================================
echo   Instalacao concluida! Ligando o servidor...
echo ============================================================
echo.
call "%~dp0LIGAR-SERVIDOR.bat"
goto :fim

:semnode
echo O Node.js NAO esta instalado neste computador.
echo.
echo   - Abra https://nodejs.org no navegador
echo   - Baixe e instale a versao "LTS" (recomendada)
echo   - Depois de instalar, feche esta janela e de duplo-clique
echo     neste arquivo de novo.
echo.
pause
exit /b 1

:erroinstall
echo.
echo ============================================================
echo   Algo deu errado no "npm install" (veja o erro acima).
echo   Confira sua conexao com a internet e tente de novo.
echo ============================================================
pause
exit /b 1

:fim

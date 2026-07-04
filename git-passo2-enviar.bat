@echo off
REM ============================================================
REM  GIT PASSO 2 - liga ao GitHub e envia o projeto
REM  Basta dar DUPLO-CLIQUE e colar a URL do seu repositorio.
REM ============================================================
cd /d "%~dp0"

echo Renomeando a branch principal para "main"...
git branch -M main

echo.
echo ------------------------------------------------------------
echo  Cole abaixo a URL do seu repositorio no GitHub.
echo  (Ela termina com .git, ex:
echo   https://github.com/seu-usuario/ui24-musicos.git )
echo ------------------------------------------------------------
set /p URL="Cole a URL aqui e aperte ENTER: "

REM Remove uma barra "/" que sobra no final, se houver (erro comum ao colar).
if "%URL:~-1%"=="/" set URL=%URL:~0,-1%

echo.
echo URL que sera usada: %URL%
echo.
echo Ligando ao GitHub...
REM Remove ligacao antiga se existir (nao da erro se nao existir)
git remote remove origin 2>nul
git remote add origin %URL%

echo.
echo Enviando (pode abrir uma janela pedindo login do GitHub)...
git push -u origin main

echo.
echo ============================================================
echo  Se apareceu "Writing objects" / "branch main -> main",
echo  DEU CERTO! Seus arquivos ja estao no GitHub.
echo  Atualize a pagina do repositorio no site para ver.
echo ============================================================
echo.
pause

@echo off
REM ============================================================
REM  GIT PASSO 1 - faz o primeiro commit (salva a versao inicial)
REM  Basta dar DUPLO-CLIQUE. Nao precisa copiar nada.
REM ============================================================
cd /d "%~dp0"

echo Fazendo o primeiro commit...
echo.
git commit -m "Primeira versao: interface de fone para musicos Ui24R"

echo.
echo ============================================================
echo  Se apareceu "xx files changed" acima, DEU CERTO!
echo  Agora rode o proximo: git-passo2-enviar.bat
echo  (mas antes leia as instrucoes que o assistente te deu)
echo ============================================================
echo.
pause

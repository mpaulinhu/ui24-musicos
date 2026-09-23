@echo off
REM ============================================================================
REM  LIGA O SERVIDOR DO MIX DE FONE
REM
REM  Use este arquivo (duplo-clique) sempre que for usar o sistema, depois
REM  de ja ter rodado o PRIMEIRA-VEZ.bat uma vez neste computador.
REM
REM  Esta janela precisa ficar ABERTA enquanto o sistema estiver em uso
REM  (pode minimizar, mas nao fechar - fechar a janela desliga o servidor
REM  para todo mundo).
REM
REM  Para ligar sozinho junto com o Windows (opcional):
REM    1) Aperte Win+R, digite: shell:startup   e Enter
REM    2) Copie um ATALHO deste arquivo para essa pasta
REM ============================================================================
cd /d "%~dp0"
title Mix de Fone - Servidor (NAO FECHE esta janela)

echo ============================================================
echo   MIX DE FONE - Servidor
echo ============================================================
echo.
echo   Depois que aparecer "SERVIDOR DA HOUSE MIX rodando" abaixo,
echo   abra no navegador (neste computador):
echo.
echo     http://localhost:3000/admin     (configurar tudo)
echo     http://localhost:3000/musico    (tela dos musicos)
echo     http://localhost:3000/monitor   (tela da house mix)
echo     http://localhost:3000/espiao    (mapear a mesa)
echo.
echo   Para os celulares dos musicos acessarem, troque "localhost"
echo   pelo IP deste computador na rede Wi-Fi (veja o README, secao 4).
echo.
echo ============================================================
echo.

call npm start

echo.
echo ============================================================
echo   O servidor PAROU (fechou ou deu erro acima).
echo   Feche esta janela ou rode de novo dando duplo-clique aqui.
echo ============================================================
pause

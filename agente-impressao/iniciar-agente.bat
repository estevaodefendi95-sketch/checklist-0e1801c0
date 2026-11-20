@echo off
rem Agente de impressao Paggio. Na primeira vez ele pede o token (cole e aperte Enter); depois fica salvo em token.txt.
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js nao encontrado. Instale a versao LTS em nodejs.org e abra este arquivo de novo. & pause & exit /b)
:loop
node agente.mjs
echo Agente parou. Reiniciando em 5 segundos...
timeout /t 5 >nul
goto loop

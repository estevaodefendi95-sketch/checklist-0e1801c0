@echo off
rem Agente de impressao Paggio. Cole o TOKEN do dispositivo "Agente de impressao" abaixo (uma vez) e de dois cliques neste arquivo.
set PDV_FUNCAO_URL=https://jcqpuqhdfveleusjsxeo.supabase.co/functions/v1/pdv-print
set PDV_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjcXB1cWhkZnZlbGV1c2pzeGVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5NDg3ODIsImV4cCI6MjA5NjUyNDc4Mn0.u0hL3IV8Vdzpoh0Tr1fPUetcbAVbL5Cc0RFjBT3YZH0
set PDV_TOKEN_AGENTE=COLE_O_TOKEN_AQUI
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js nao encontrado. Instale a versao LTS em nodejs.org e abra este arquivo de novo. & pause & exit /b)
if "%PDV_TOKEN_AGENTE%"=="COLE_O_TOKEN_AQUI" (echo Falta colar o TOKEN neste arquivo. Clique com o botao direito em Editar e troque COLE_O_TOKEN_AQUI. & pause & exit /b)
:loop
node agente.mjs
echo Agente parou. Reiniciando em 5 segundos...
timeout /t 5 >nul
goto loop

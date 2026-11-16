@echo off
rem Faz o agente de impressao abrir sozinho quando este usuario entrar no Windows.
schtasks /Create /TN "Paggio Agente de Impressao" /TR "\"%~dp0iniciar-agente.bat\"" /SC ONLOGON /RL LIMITED /F
if %errorlevel%==0 (echo Pronto. O agente vai abrir sozinho a cada vez que o Windows iniciar.) else (echo Nao foi possivel criar a tarefa. Tente clicar com o botao direito e "Executar como administrador".)
pause

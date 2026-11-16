@echo off
rem Faz o agente de impressao abrir sozinho quando o Windows iniciar (nao precisa ser administrador).
set "DESTINO=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Paggio Agente de Impressao.lnk"
powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut($env:DESTINO); $s.TargetPath='%~dp0iniciar-agente.bat'; $s.WorkingDirectory='%~dp0'; $s.WindowStyle=7; $s.Save()"
if exist "%DESTINO%" (echo Pronto. O agente vai abrir sozinho a cada vez que o Windows iniciar.) else (echo Nao foi possivel criar o atalho. Faca manualmente: Win+R, digite shell:startup e coloque ali um atalho para iniciar-agente.bat)
pause

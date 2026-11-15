@echo off
rem Faz a ponte do FarmaRotina abrir junto com o Windows, sem janela e SEM a pergunta de seguranca
rem ("Deseja abrir este arquivo?"). Rode uma vez em cada computador da farmacia, com duplo clique.
rem   inicio-automatico.bat           liga
rem   inicio-automatico.bat remover   desliga
rem Nao precisa de administrador: grava so nas configuracoes do usuario atual.
setlocal
cd /d "%~dp0"
set CHAVE=HKCU\Software\Microsoft\Windows\CurrentVersion\Run
set NOME=PonteFarmaRotina

if /i "%~1"=="remover" (
  reg delete "%CHAVE%" /v %NOME% /f >nul 2>&1
  echo Inicio automatico desligado. A ponte que estiver aberta continua ate o parar.bat.
  goto fim
)

rem 1) Tira a marca de "arquivo vindo da internet" dos arquivos da ponte (e ela que faz o Windows perguntar)
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -LiteralPath '%~dp0' -File | Unblock-File" >nul 2>&1

rem 2) Tira o atalho antigo da pasta Inicializar, se houver (ele e que mostrava a pergunta)
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s = New-Object -ComObject WScript.Shell; Get-ChildItem ([Environment]::GetFolderPath('Startup')) -Filter *.lnk | Where-Object { $s.CreateShortcut($_.FullName).TargetPath -match 'iniciar(-oculto)?\.(vbs|bat)$' } | Remove-Item -Force" >nul 2>&1

rem 3) Abre com o Windows chamando o wscript direto (assim nao passa pela pergunta de seguranca)
reg add "%CHAVE%" /v %NOME% /t REG_SZ /d "\"%SystemRoot%\System32\wscript.exe\" \"%~dp0iniciar-oculto.vbs\"" /f >nul
if errorlevel 1 (
  echo Nao foi possivel gravar o inicio automatico.
  goto fim
)

rem 4) Ja abre a ponte agora, se ainda nao estiver rodando
netstat -ano | findstr /r /c:":3790 .*LISTENING" >nul
if errorlevel 1 start "" "%SystemRoot%\System32\wscript.exe" "%~dp0iniciar-oculto.vbs"

echo Pronto. A ponte vai abrir sozinha, sem janela, toda vez que este usuario entrar no Windows.
echo Para desligar: inicio-automatico.bat remover

:fim
echo.
pause

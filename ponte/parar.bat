@echo off
rem Encerra a ponte do FarmaRotina (inclusive a que roda oculta pelo iniciar-oculto.vbs).
cd /d "%~dp0"
rem Porta da ponte: portaPonte do config (lida pelo porta.js) ou 3790
set PORTA=3790
for /f %%n in ('node porta.js 2^>nul') do set PORTA=%%n
rem Avisa o iniciar.bat para não reiniciar e encerra o programa que atende nessa porta
echo.> parar.flag
set achou=
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":%PORTA% .*LISTENING"') do (
  taskkill /pid %%p /f >nul 2>&1
  set achou=1
)
if defined achou (
  echo Ponte encerrada.
) else (
  del parar.flag >nul 2>&1
  echo A ponte nao estava rodando.
)
"%SystemRoot%\System32\timeout.exe" /t 3 >nul

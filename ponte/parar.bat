@echo off
rem Encerra a ponte do FarmaRotina (inclusive a que roda oculta pelo iniciar-oculto.vbs).
cd /d "%~dp0"
rem Avisa o iniciar.bat para não reiniciar e encerra o programa que atende na porta da ponte (3790)
echo.> parar.flag
set achou=
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":3790 .*LISTENING"') do (
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

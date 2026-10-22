@echo off
title Ponte do FarmaRotina (consultas ao Trier)
cd /d "%~dp0"
rem "iniciar.bat oculto" (usado pelo iniciar-oculto.vbs): sem janela, então o que a ponte escreve vai para ponte.log
:inicio
if /i "%~1"=="oculto" (
  echo [%date% %time%] Ponte iniciada>> ponte.log
  node servidor.js >> ponte.log 2>&1
) else (
  node servidor.js
)
rem parar.bat cria este arquivo para a ponte não reiniciar
if exist parar.flag (
  del parar.flag
  exit /b
)
echo.
echo A ponte parou. Reiniciando em 10 segundos (feche a janela para encerrar)...
"%SystemRoot%\System32\timeout.exe" /t 10 /nobreak >nul
goto inicio

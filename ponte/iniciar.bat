@echo off
title Ponte do FarmaRotina (consultas ao Trier)
cd /d "%~dp0"
:inicio
node servidor.js
echo.
echo A ponte parou. Reiniciando em 10 segundos (feche a janela para encerrar)...
timeout /t 10 /nobreak >nul
goto inicio

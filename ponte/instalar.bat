@echo off
rem Instala a ponte do FarmaRotina neste computador. Rode com duplo clique, dentro da pasta ponte.
rem Passos: confere o Node.js, instala as dependencias, cria o arquivo de configuracao (com a senha do
rem banco, fora desta pasta) e liga o inicio automatico com o Windows. Veja o LEIA-ME.txt.
setlocal
cd /d "%~dp0"
title Instalar a ponte do FarmaRotina
set PASTA_CONFIG=C:\FarmaRotinaPonte
set ARQ_CONFIG=%PASTA_CONFIG%\config.json

echo ============================================================
echo  Ponte do FarmaRotina - instalacao
echo ============================================================
echo.

echo [1/4] Conferindo o Node.js...
where node >nul 2>&1
if errorlevel 1 goto sem_node
for /f "delims=" %%v in ('node --version') do echo       Node.js %%v encontrado.
echo.

echo [2/4] Instalando as dependencias (precisa de internet)...
call npm install --omit=dev --no-audit --no-fund
if errorlevel 1 goto erro_npm
echo.

echo [3/4] Arquivo de configuracao: %ARQ_CONFIG%
if not exist "%PASTA_CONFIG%" mkdir "%PASTA_CONFIG%"
if exist "%ARQ_CONFIG%" goto config_existe
copy /y config.exemplo.json "%ARQ_CONFIG%" >nul
echo       Criei o arquivo a partir do exemplo. Vou abrir no Bloco de Notas:
echo       troque o servidor, o banco, o usuario e a senha, SALVE e FECHE o Bloco de Notas.
echo.
pause
start /wait notepad "%ARQ_CONFIG%"
goto config_ok
:config_existe
echo       Ja existe, mantive como esta.
:config_ok
echo.

echo [4/4] Ligando o inicio automatico com o Windows...
call "%~dp0parar.bat" >nul 2>&1
if exist parar.flag del parar.flag
call "%~dp0inicio-automatico.bat"
echo.
echo Instalacao concluida. Abra o FarmaRotina, entre em Consultas Trier e confira se aparece "conectada".
echo Se nao conectar, veja o arquivo ponte.log nesta pasta.
goto fim

:sem_node
echo.
echo O Node.js nao esta instalado neste computador.
echo  1. Abra https://nodejs.org e baixe a versao LTS (botao verde).
echo  2. Instale clicando em Avancar ate o fim (nao precisa mudar nada).
echo  3. Rode este instalar.bat de novo.
echo.
echo Ou, pelo Prompt de Comando:  winget install OpenJS.NodeJS.LTS
goto fim

:erro_npm
echo.
echo Nao consegui instalar as dependencias. Confira a internet e rode este instalar.bat de novo.
goto fim

:fim
echo.
pause

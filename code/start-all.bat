@echo off
echo ========================================
echo   Iniciando AlphaVest
echo ========================================
echo.

:: Iniciar servidor Python en segundo plano
echo [1/2] Iniciando servidor Python ML...
start "Python ML Server" cmd /c "cd /d "%~dp0..\python" && python server.py"

:: Esperar un momento para que el servidor Python inicie
timeout /t 2 /nobreak > nul

:: Iniciar Expo
echo [2/2] Iniciando Expo...
echo.
npx expo start

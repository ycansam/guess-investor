@echo off
REM ============================================================
REM   GUESS INVESTOR - ML Training Daemon
REM   Ejecuta el entrenamiento cada hora de forma continua
REM ============================================================

cd /d "%~dp0"

echo.
echo ============================================================
echo   GUESS INVESTOR - ML Training Daemon
echo   Presiona Ctrl+C para detener
echo ============================================================
echo.

:loop
    call train.bat
    
    echo.
    echo [DAEMON] Esperando 1 hora para el proximo entrenamiento...
    echo [DAEMON] Presiona Ctrl+C para detener
    echo.
    
    REM Esperar 1 hora (3600 segundos)
    timeout /t 3600 /nobreak >nul
    
goto loop

@echo off
REM ============================================================
REM   GUESS INVESTOR - ML Training Automation
REM   Este script se ejecuta automáticamente cada hora
REM   para entrenar el modelo con las predicciones verificadas
REM ============================================================

cd /d "%~dp0"

echo.
echo ============================================================
echo   GUESS INVESTOR - Entrenamiento Automatico ML
echo   %date% %time%
echo ============================================================
echo.

REM Verificar que Python está instalado
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python no esta instalado o no esta en el PATH
    exit /b 1
)

REM Ejecutar entrenamiento
echo [INFO] Iniciando entrenamiento...
python main.py --verbose

if errorlevel 1 (
    echo [WARN] Entrenamiento finalizado con advertencias
) else (
    echo [OK] Entrenamiento completado exitosamente
)

echo.
echo Proximo entrenamiento en 1 hora...
echo.

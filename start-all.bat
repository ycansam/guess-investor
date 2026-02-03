@echo off
title Guess Investor - Launcher
echo.
echo  ========================================
echo   🚀 Iniciando Guess Investor
echo  ========================================
echo.

echo [1/3] Iniciando Backend...
start "Backend - Guess Investor" cmd /k "cd /d D:\Documentos\App Projects\guess-investor\backend && npm run dev"

timeout /t 2 >nul

echo [2/3] Iniciando Frontend (Expo)...
start "Frontend - Guess Investor" cmd /k "cd /d D:\Documentos\App Projects\guess-investor\code && npm start"

timeout /t 2 >nul

echo [3/3] Iniciando Python ML Service...
start "Python ML - Guess Investor" cmd /k "cd /d D:\Documentos\App Projects\guess-investor\code && npm run python:watch"

echo.
echo  ========================================
echo   ✅ Todos los servicios iniciados!
echo  ========================================
echo.
pause

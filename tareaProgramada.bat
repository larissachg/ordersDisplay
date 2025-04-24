@echo off

REM Restaurar procesos PM2
pm2 resurrect

REM Agregar un pequeño retraso para verificar errores
timeout /t 5 /nobreak

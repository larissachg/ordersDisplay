@echo off
echo Instalando la aplicación...

REM Verifica si Node.js está instalado
node -v >nul 2>&1
IF ERRORLEVEL 1 (
    echo Node.js no está instalado. Por favor, instálalo desde https://nodejs.org. 
    pause
)

REM Verifica si la carpeta node_modules existe
IF EXIST node_modules (
    echo La carpeta node_modules ya existe. Saltando la instalación de dependencias...
) ELSE (
    echo Instalando dependencias con npm...
    npm install
    IF ERRORLEVEL 1 (
        echo Ocurrio un error al instalar las dependencias.
        pause
        exit /b
    )
)

REM Ejecuta setup.js usando Node.js
node setup.js
IF ERRORLEVEL 1 (
    echo Ocurrio un error durante la configuracion.
    pause
    exit /b
)

pause

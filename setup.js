/* eslint-disable @typescript-eslint/no-var-requires */
const { execSync } = require('child_process')
const fs = require('fs')
const readlineSync = require('readline-sync')

try {
  console.log('🚀 Configurando la aplicación...')

  // Verificar si se ejecuta como administrador
  if (process.getuid && process.getuid() !== 0) {
    console.error('❌ Por favor, ejecuta este script como administrador.')
    process.exit(1)
  }

  // Verificar si el archivo .env ya existe
  if (fs.existsSync('.env')) {
    const overwrite = readlineSync.keyInYN(
      '⚠️ El archivo .env ya existe. ¿Deseas sobrescribirlo?'
    )

    if (overwrite) {
      // Si el usuario decide sobrescribir, pedir las variables nuevamente
      console.log('⚙️ Configurando nuevas variables de entorno...')
      const envVariables = {
        TZ: 'UTC',
        NEXT_PUBLIC_PRIMARY_COLOR: '626e78',
        NEXT_PUBLIC_SECONDARY_COLOR: '626e7845',
        NEXT_PUBLIC_DONE_COLOR: 'a0bd93',
        DB_USER: readlineSync.question(
          'Ingrese el usuario de la base de datos (por defecto: sa): ',
          { defaultInput: 'sa' }
        ),
        DB_PASSWORD: readlineSync.question(
          'Ingrese la contraseña de la base de datos: ',
          { hideEchoBack: true }
        ),
        DB_SERVER: readlineSync.question(
          'Ingrese la dirección del servidor de base de datos:'
        ),
        DB_PORT: readlineSync.question(
          'Ingrese el puerto del servidor de base de datos (por defecto: 1433): ',
          { defaultInput: '1433' }
        ),
        DB_DATABASE: readlineSync.question(
          'Ingrese el nombre de la base de datos: '
        )
      }

      // Crear o sobrescribir el archivo .env
      console.log('📄 Generando archivo .env...')
      const envContent = Object.entries(envVariables)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n')
      fs.writeFileSync('.env', envContent)
      console.log('✅ Archivo .env sobrescrito con éxito.')
    } else {
      console.log('✅ Manteniendo el archivo .env existente.')
    }
  } else {
    // Si el archivo .env no existe, pedir las variables y crearlo
    console.log('⚙️ Configurando variables de entorno...')
    const envVariables = {
      TZ: 'UTC',
      NEXT_PUBLIC_PRIMARY_COLOR: '626e78',
      NEXT_PUBLIC_SECONDARY_COLOR: '626e7845',
      NEXT_PUBLIC_DONE_COLOR: 'a0bd93',
      DB_USER: readlineSync.question(
        '🛠️ Ingrese el usuario de la base de datos (por defecto: sa): ',
        { defaultInput: 'sa' }
      ),
      DB_PASSWORD: readlineSync.question(
        '🔒 Ingrese la contraseña de la base de datos: ',
        { hideEchoBack: true }
      ),
      DB_SERVER: readlineSync.question(
        '🌐 Ingrese la dirección del servidor de base de datos:'
      ),
      DB_PORT: readlineSync.question(
        '🔌 Ingrese el puerto del servidor de base de datos (por defecto: 1433): ',
        { defaultInput: '1433' }
      ),
      DB_DATABASE: readlineSync.question(
        '📂 Ingrese el nombre de la base de datos: '
      )
    }

    // Crear el archivo .env
    console.log('📄 Generando archivo .env...')
    const envContent = Object.entries(envVariables)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n')
    fs.writeFileSync('.env', envContent)
    console.log('✅ Archivo .env creado con éxito.')
  }

  // Instalar dependencias
  if (!fs.existsSync('node_modules')) {
    console.log('📦 Instalando dependencias...')
    execSync('npm install', { stdio: 'inherit' })
  } else {
    console.log('📦 Dependencias ya instaladas. Saltando npm install...')
  }

  // Construir la aplicación
  console.log('🔧 Construyendo la aplicación...')
  execSync('npm run build', { stdio: 'inherit' })

  // Instalar PM2 si no está instalado
  try {
    execSync('pm2 -v', { stdio: 'inherit' })
    console.log('✅ PM2 ya está instalado.')
  } catch (e) {
    console.log('🔥 Instalando PM2...')
    execSync('npm install pm2 -g', { stdio: 'inherit' })
  }

  try {
    console.log('🔥 Iniciando la aplicación con PM2...')

    try {
      const pm2ListOutput = execSync('pm2 list').toString()
      if (!pm2ListOutput.includes('online')) {
        console.log('⚠️ No hay procesos activos en PM2. Continuando...')
      } else {
        console.log('🛑 Deteniendo procesos existentes en PM2...')
        execSync('pm2 stop all')
        execSync('pm2 delete all')
      }
    } catch (error) {
      console.error('❌ Error al listar procesos de PM2:', error.message)
    }

    execSync('pm2 start pm2.json', { stdio: 'inherit' })
    execSync('pm2 save --force', { stdio: 'inherit' })

    console.log('🛠 Configuración de PM2 para inicio automático...')
    if (process.platform !== 'win32') {
      execSync('pm2 startup', { stdio: 'inherit' })
    } else {
      console.log(
        '⚠️⚠️⚠️ En Windows, configure el inicio automático manualmente porfavor.'
      )
    }
  } catch (error) {
    console.error('❌ Error al configurar PM2:', error.message)
  }

  console.log('✅ ¡Aplicación configurada y corriendo en localhost:3000!')
} catch (error) {
  console.error('❌ Error durante la configuración:', error.message)
}

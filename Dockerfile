# Usa una imagen base de Node.js
FROM node:18

# Establece el directorio de trabajo dentro del contenedor
WORKDIR /app

# Copia los archivos necesarios
COPY package*.json ./
RUN npm install

# Copia el resto de la aplicación
COPY . .

# Construye la aplicación
RUN npm run build

# Expone el puerto donde corre la aplicación
EXPOSE 3000

# Usa variables de entorno desde el sistema o docker-compose
ENV DB_CONNECTION_STRING=${DB_CONNECTION_STRING}
ENV APP_COLOR=${APP_COLOR}

# Comando por defecto para iniciar la aplicación
CMD ["npm", "start"]

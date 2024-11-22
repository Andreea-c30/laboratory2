# Etapa de construcție (build stage)
FROM node:16 AS builder

# Setează directorul de lucru
WORKDIR /app

# Copiază doar package.json și package-lock.json pentru a profita de cache
COPY package*.json ./ 

# Instalează dependențele aplicației
RUN npm install
RUN npm install prom-client

# Copiază restul aplicației
COPY . . 

# Etapa finală (production stage)
FROM node:16

# Setează directorul de lucru
WORKDIR /app

# Copiază doar fișierele necesare din etapa de build
COPY --from=builder /app /app

# Exportează portul pe care gateway-ul va asculta
EXPOSE 3000

# Setează variabile de mediu
ENV NODE_ENV=production
ENV CHAT_WS_URL="ws://new-chat:6789"
ENV ANIMAL_SERVICE_URL="http://animal_posts_service:50052"
ENV SERVICE_DISCOVERY_URL="http://service_discovery:3001"

# Comanda de rulare a aplicației
CMD ["node", "gateway.js"]

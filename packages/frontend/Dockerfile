# Multi-stage build per ottimizzare le dimensioni dell'immagine

# Stage 1: Build
FROM node:18-alpine AS builder

# Installa dipendenze di sistema
RUN apk add --no-cache libc6-compat

WORKDIR /app

# Copia file di configurazione
COPY package*.json ./
COPY tsconfig*.json ./
COPY vite.config.ts ./

# Installa dipendenze
RUN npm install && npm cache clean --force

# Copia codice sorgente
COPY src ./src
COPY index.html ./

# Build applicazione per produzione
RUN npm run build

# Stage 2: Production con Nginx
FROM nginx:alpine AS runner

# Copia configurazione Nginx personalizzata
COPY nginx.conf /etc/nginx/nginx.conf

# Copia build dell'applicazione
COPY --from=builder /app/dist /usr/share/nginx/html

# Crea utente non-root per sicurezza
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 reactjs

# Esponi porta
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000 || exit 1

# Comando di avvio
CMD ["nginx", "-g", "daemon off;"] 

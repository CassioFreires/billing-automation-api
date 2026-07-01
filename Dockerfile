# syntax=docker/dockerfile:1

# ==========================================================================
# BUILD STAGE
# ==========================================================================
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN npx prisma generate && npm run build

# ==========================================================================
# PRODUCTION STAGE
# ==========================================================================
FROM node:22-alpine AS production

# tini: PID 1 correto (encaminha SIGTERM ao node → graceful shutdown)
# openssl: runtime dos engines do Prisma
RUN apk add --no-cache tini openssl

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Artefatos de build
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/public ./public

# Prisma Client já gerado (client + engine)
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Roda como usuário sem privilégios (a imagem node:alpine já traz o usuário `node`)
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

# tini como init para propagar sinais corretamente
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server.js"]

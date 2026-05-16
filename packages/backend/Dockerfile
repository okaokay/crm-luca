FROM mcr.microsoft.com/playwright:v1.58.2-noble AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm install

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

FROM mcr.microsoft.com/playwright:v1.58.2-noble AS runner
WORKDIR /app

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

RUN npm prune --omit=dev && npm cache clean --force && chown -R pwuser:pwuser /app

USER pwuser

EXPOSE 3001

ENV NODE_ENV=production
ENV PORT=3001
ENV HOME=/home/pwuser
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -fsS http://localhost:3001/api/health || exit 1

CMD ["node", "dist/main.js"]

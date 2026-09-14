FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production \
    PORT=4000 \
    DB_PATH=/data/machinewatch.db

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src
RUN mkdir -p /data && chown node:node /data

USER node
VOLUME ["/data"]
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:4000/api/health || exit 1

# Node 24 runs TypeScript directly via type stripping: no build step needed.
CMD ["node", "src/server.ts"]

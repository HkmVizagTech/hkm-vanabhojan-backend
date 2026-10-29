# syntax=docker/dockerfile:1
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Production dependencies only (no jest / pino-pretty / mongodb-memory-server)
RUN npm ci --omit=dev && npm cache clean --force

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY scripts ./scripts
# Run as the unprivileged "node" user that ships with the image
USER node
# Railway injects PORT; the app reads it (default 3300 locally)
EXPOSE 3300
CMD ["node", "src/server.js"]

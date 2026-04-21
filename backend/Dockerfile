# ── backend/Dockerfile ───────────────────────────────────────
FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
RUN mkdir -p logs
EXPOSE 3001
CMD ["node", "src/server.js"]

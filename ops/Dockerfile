# Image for the "ops-cron" Railway service (hourly cron). Only needs the ops/ folder.
FROM node:22-bookworm-slim
WORKDIR /app
COPY ops/package.json ops/package-lock.json ./
RUN npm ci --omit=dev
COPY ops/ ./
CMD ["node", "run.mjs"]

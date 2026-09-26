# Image for the "ops-cron" Railway service (hourly cron). Only needs the ops/ folder.
# poppler-utils + tesseract (eng/hin/guj) are used by text recovery and issue ingestion.
FROM node:22-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends poppler-utils tesseract-ocr tesseract-ocr-eng tesseract-ocr-hin tesseract-ocr-guj ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY ops/package.json ops/package-lock.json ./
RUN npm ci --omit=dev
COPY ops/ ./
CMD ["node", "run.mjs"]

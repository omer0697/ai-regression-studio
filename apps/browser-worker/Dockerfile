# syntax=docker/dockerfile:1
# Build context: repository root (see infrastructure/docker-compose.full.yml)

FROM node:22-alpine
WORKDIR /repo

COPY package.json package-lock.json ./
COPY packages/shared-contracts/package.json packages/shared-contracts/
COPY packages/test-schemas/package.json packages/test-schemas/
COPY apps/browser-worker/package.json apps/browser-worker/
COPY apps/web/package.json apps/web/
RUN npm ci

COPY packages ./packages
COPY apps/browser-worker ./apps/browser-worker
RUN npm run build -w packages/shared-contracts \
  && npm run build -w packages/test-schemas \
  && npm run build -w apps/browser-worker

EXPOSE 9100
CMD ["node", "apps/browser-worker/dist/index.js"]

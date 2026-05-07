FROM node:22-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable

WORKDIR /app

FROM base AS build

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/frontend/package.json apps/frontend/package.json

RUN pnpm install --frozen-lockfile

COPY . .

ARG DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres"
ENV DATABASE_URL=$DATABASE_URL

RUN pnpm --dir apps/backend exec node ./node_modules/prisma/build/index.js generate
RUN pnpm --dir apps/backend build

FROM base AS runtime

RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium ca-certificates fonts-dejavu-core fonts-liberation \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV ATTENDANCE_PDF_EXECUTABLE_PATH=/usr/bin/chromium

COPY --from=build /app /app

WORKDIR /app/apps/backend

EXPOSE 4000

CMD ["sh", "-c", "node ./node_modules/prisma/build/index.js migrate deploy --schema prisma/schema.prisma && node dist/main.js"]

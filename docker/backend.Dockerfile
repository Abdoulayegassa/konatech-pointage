FROM node:22-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

FROM base AS build

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/frontend/package.json apps/frontend/package.json

ENV PUPPETEER_SKIP_DOWNLOAD=true

RUN pnpm install --frozen-lockfile

COPY . .

# Prisma loads prisma.config.ts during generation and therefore expects this
# variable to exist. Generation does not connect to the database, so never pass
# the production URL into the image build.
ENV DATABASE_URL=postgresql://prisma-build:prisma-build@localhost:5432/prisma-build

RUN pnpm --dir apps/backend exec node ./node_modules/prisma/build/index.js generate
RUN pnpm --dir apps/backend build
RUN pnpm deploy --legacy --filter backend --prod /app/backend-runtime
RUN generated_client="$(find /app/node_modules/.pnpm -path '*/node_modules/.prisma/client' -type d -print -quit)" \
  && client_package="$(find /app/backend-runtime/node_modules/.pnpm -type d -path '*/node_modules/@prisma/client' -print -quit)" \
  && client_node_modules="$(dirname "$(dirname "$client_package")")" \
  && test -n "$generated_client" \
  && test -n "$client_package" \
  && mkdir -p "$client_node_modules/.prisma" \
  && cp -a "$generated_client" "$client_node_modules/.prisma/client"

FROM base AS migration

ENV NODE_ENV=production
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV DATABASE_URL=postgresql://prisma-build:prisma-build@localhost:5432/prisma-build

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json apps/backend/package.json

RUN pnpm install --frozen-lockfile --filter backend...

COPY --chown=node:node apps/backend/prisma.config.ts /app/apps/backend/prisma.config.ts
COPY --chown=node:node apps/backend/prisma /app/apps/backend/prisma

WORKDIR /app/apps/backend

USER node

CMD ["node", "./node_modules/prisma/build/index.js", "migrate", "deploy", "--schema", "prisma/schema.prisma"]

FROM build AS runtime-prep

# @prisma/client declares an optional CLI peer. pnpm's deploy layout retains
# that peer and its config chain in the virtual store even with --prod. The
# generated client above has no runtime dependency on that chain, so remove it
# only in the runtime-prep stage, after the client and its native engine exist.
RUN runtime_modules=/app/backend-runtime/node_modules \
  && rm -rf "$runtime_modules"/.pnpm/prisma@* \
    "$runtime_modules"/.pnpm/@prisma+config@* \
    "$runtime_modules"/.pnpm/deepmerge-ts@* \
    "$runtime_modules"/.pnpm/typescript@* \
  && rm -f "$runtime_modules"/.pnpm/node_modules/prisma \
    "$runtime_modules"/.pnpm/node_modules/typescript \
    "$runtime_modules"/.pnpm/node_modules/deepmerge-ts \
    "$runtime_modules"/.pnpm/node_modules/@prisma/config

FROM base AS runtime

RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium ca-certificates fonts-dejavu-core fonts-liberation \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV ATTENDANCE_PDF_EXECUTABLE_PATH=/usr/bin/chromium
ENV HOME=/tmp

COPY --chown=node:node --from=runtime-prep /app/backend-runtime/node_modules /app/apps/backend/node_modules
COPY --chown=node:node --from=runtime-prep /app/backend-runtime/package.json /app/apps/backend/package.json
COPY --chown=node:node --from=runtime-prep /app/backend-runtime/dist /app/apps/backend/dist

WORKDIR /app/apps/backend

USER node

EXPOSE 4000

CMD ["node", "dist/main.js"]

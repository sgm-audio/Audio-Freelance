# SGM Outreach Engine CLI — runs inside distrobox/Docker (spec §1)
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable

WORKDIR /app

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY packages/cli/package.json packages/cli/

RUN pnpm install --frozen-lockfile=false

COPY packages/core packages/core
COPY packages/cli packages/cli

RUN pnpm --filter @sgm-outreach/core build \
  && pnpm --filter @sgm-outreach/cli build

ENV SGM_OUTREACH_DB=/data/outreach.sqlite
VOLUME ["/data"]

ENTRYPOINT ["node", "packages/cli/dist/bin.js"]
CMD ["status"]

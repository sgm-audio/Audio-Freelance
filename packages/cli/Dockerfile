# SGM Outreach Engine CLI — runs inside distrobox/Docker (spec §1)
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable

WORKDIR /app

# Copy the frozen workspace before source so dependency installation is reproducible.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages packages
RUN pnpm install --frozen-lockfile \
  && pnpm build \
  && CI=true pnpm install --prod --frozen-lockfile --offline

ENV NODE_ENV=production
ENV SGM_OUTREACH_DB=/data/outreach.sqlite
RUN mkdir -p /data && chown -R node:node /app /data
VOLUME ["/data"]
USER node

ENTRYPOINT ["node", "packages/cli/dist/bin.js"]
CMD ["status"]

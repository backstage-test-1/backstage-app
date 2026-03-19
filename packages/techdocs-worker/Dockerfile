FROM node:24-trixie-slim

ENV PYTHON=/usr/bin/python3
ENV NODE_ENV=production

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && \
    apt-get install -y --no-install-recommends python3 python3-pip && \
    pip3 install --break-system-packages --no-cache-dir mkdocs-techdocs-core==1.* && \
    rm -rf /var/lib/apt/lists/*

USER node
WORKDIR /app

COPY --chown=node:node .yarn ./.yarn
COPY --chown=node:node .yarnrc.yml ./
COPY --chown=node:node backstage.json ./

COPY --chown=node:node yarn.lock package.json packages/techdocs-worker/dist/skeleton.tar.gz ./
RUN tar xzf skeleton.tar.gz && rm skeleton.tar.gz

RUN --mount=type=cache,target=/home/node/.cache/yarn,sharing=locked,uid=1000,gid=1000 \
    yarn workspaces focus techdocs-worker --production && rm -rf "$(yarn cache clean)"

COPY --chown=node:node packages/techdocs-worker/dist/bundle.tar.gz ./
RUN tar xzf bundle.tar.gz && rm bundle.tar.gz

CMD ["node", "packages/techdocs-worker", "--config", "app-config.yaml"]

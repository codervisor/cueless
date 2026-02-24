FROM node:22-alpine

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.json ./
COPY packages/core/package.json ./packages/core/package.json
COPY packages/tsconfig/package.json ./packages/tsconfig/package.json
COPY packages/tsconfig/base.json ./packages/tsconfig/base.json

RUN pnpm install --frozen-lockfile

COPY packages/core ./packages/core

RUN pnpm --filter @cueless/core build

CMD ["pnpm", "--filter", "@cueless/core", "start"]

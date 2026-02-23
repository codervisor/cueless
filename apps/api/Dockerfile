FROM node:22-alpine

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/tsconfig/package.json ./packages/tsconfig/package.json
COPY packages/tsconfig/base.json ./packages/tsconfig/base.json

RUN pnpm install --frozen-lockfile

COPY apps/api ./apps/api

RUN pnpm --filter @cueless/api build

CMD ["pnpm", "--filter", "@cueless/api", "start"]

FROM node:22.12.0-alpine3.19 AS build

WORKDIR /opt

RUN npm install -g turbo pnpm
COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile --ignore-scripts
COPY . .

RUN pnpm build

FROM node:22.12.0-alpine3.19

WORKDIR /opt

ENV NODE_ENV=production

COPY --from=build /opt/build ./build
COPY --from=build /opt/node_modules ./node_modules

USER node

CMD ["node", "build/main.js"]

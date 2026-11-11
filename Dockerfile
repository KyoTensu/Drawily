FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY web/package.json web/
COPY server/package.json server/
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/web/dist web/dist
COPY package.json ./
COPY server/package.json server/
COPY server/src server/src
# Owned by node so a fresh named volume mounted here is writable.
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 3000
CMD ["node", "server/src/index.ts"]

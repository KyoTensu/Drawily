FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY web/package.json web/
COPY server/package.json server/
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-alpine
RUN apk add --no-cache su-exec
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/web/dist web/dist
COPY package.json ./
COPY server/package.json server/
COPY server/src server/src
COPY entrypoint.sh /usr/local/bin/drawily-entrypoint
# Starts as root so the entrypoint can give /data to PUID:PGID; the server itself runs as that user.
EXPOSE 3000
ENTRYPOINT ["drawily-entrypoint"]
CMD ["node", "server/src/index.ts"]

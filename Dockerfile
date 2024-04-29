FROM node:18-slim

WORKDIR /app
# COPY package.json scripts src ./
# todo shouldn't copy non-existent our outdated dist
COPY package.json dist

ENTRYPOINT node dist/app.js -c /config

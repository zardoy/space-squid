FROM node:23-alpine

# WORKDIR /app
# RUN apk add --no-cache git
# RUN npm i -g pnpm
# RUN SHELL=sh pnpm setup
# COPY . /app
# RUN pnpm install
# VOLUME /app/world
# EXPOSE 25565
# RUN pnpm build
# RUN pnpm tsx bundle.ts

ENTRYPOINT node -e "setInterval(() => console.log('hello'), 1000)"

# ENTRYPOINT node out.js

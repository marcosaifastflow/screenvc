FROM node:20-slim

WORKDIR /app

COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc

RUN npm prune --omit=dev

ENV PORT=3100
EXPOSE 3100

CMD ["node", "dist/index.js"]

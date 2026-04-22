FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --production=false

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

ENV PORT=3100
EXPOSE 3100

CMD ["node", "dist/http-server.js"]

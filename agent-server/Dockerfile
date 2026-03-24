FROM node:20-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-slim

# The Agent SDK needs git for session management
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY --from=builder /app/dist ./dist

# Initialise a git repo so the Agent SDK can manage sessions
RUN git init && git config user.email "agents@paybacker.co.uk" && git config user.name "Paybacker Agents"

EXPOSE 3000

CMD ["node", "dist/index.js"]

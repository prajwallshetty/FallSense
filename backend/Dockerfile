# SafeFall API. Build:  docker build -t safefall-api backend
# Run migrations once per release (release command):  npx tsx scripts/migrate.ts
# Start:                                              node dist/server.js
# Supabase's TLS certificate needs its CA: download prod-ca-2021.crt from Project Settings >
# Database > SSL, mount it, and set NODE_EXTRA_CA_CERTS=/path/prod-ca-2021.crt
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
# Dev dependencies stay because the migration script runs through tsx.
RUN npm ci && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY migrations ./migrations
COPY scripts ./scripts
COPY tsconfig.json ./
COPY src ./src
USER node
EXPOSE 8787
# Liveness over plain HTTP. /health never touches the database.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]

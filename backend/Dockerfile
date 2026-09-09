FROM node:22-bookworm-slim AS base
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm install

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src

# Demo/HRMIS input sheets. Baked into the image so hosts without a persistent
# volume (e.g. Render) can still run the import job. Local docker-compose mounts
# ./data over /app/data, so this copy is shadowed there and behaviour is unchanged.
COPY data ./data
RUN npm run build

ENV NODE_ENV=production
EXPOSE 4000

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]

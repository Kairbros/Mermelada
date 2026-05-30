FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# ── Build ─────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_API_URL is baked into the JS bundle at build time.
# Pass the public URL of the backend when building for production:
#   docker build --build-arg NEXT_PUBLIC_API_URL=https://api.tudominio.com .
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN mkdir -p public
RUN npm run build

# ── Runtime image (uses Next.js standalone output) ────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000
CMD ["node", "server.js"]

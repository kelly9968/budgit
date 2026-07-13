# ── Build stage ───────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Vite reads VITE_* env vars at build time and bakes them into the bundle.
# These are public-by-design (OAuth client ID, browser API key, project
# number) — the security boundary is HTTP referrer + JS origin restriction
# configured in Google Cloud, not secrecy.
ARG VITE_GOOGLE_CLIENT_ID
ARG VITE_GOOGLE_API_KEY
ARG VITE_GOOGLE_PROJECT_NUMBER
ARG VITE_OPENROUTER_API_KEY
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
ENV VITE_GOOGLE_API_KEY=$VITE_GOOGLE_API_KEY
ENV VITE_GOOGLE_PROJECT_NUMBER=$VITE_GOOGLE_PROJECT_NUMBER
ENV VITE_OPENROUTER_API_KEY=$VITE_OPENROUTER_API_KEY

# Cache-bust knob so CapRover can force a clean rebuild when needed.
ARG CACHEBUST=1
# Cap Node heap — mew (Pi 4 build node) has ~1.8GB RAM, 0 swap. Vite + tsc
# can spike well past 1GB on default settings. 768MB is plenty for this app
# and leaves headroom on the host.
ENV NODE_OPTIONS=--max-old-space-size=768
RUN echo "cachebust: $CACHEBUST" && npm run build

# ── Runtime stage ─────────────────────────────────────────────────────
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
RUN chmod -R a+rX /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

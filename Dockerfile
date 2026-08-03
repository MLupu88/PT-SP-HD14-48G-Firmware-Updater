# syntax=docker/dockerfile:1

# ---- Build stage ------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /app

# Vite inlines VITE_* variables at build time, so the safety flag must be
# supplied here (and defaults to disabled, matching the repo default).
ARG VITE_ENABLE_REAL_FLASHING=false
ENV VITE_ENABLE_REAL_FLASHING=${VITE_ENABLE_REAL_FLASHING}

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN npm run lint \
  && npm run typecheck \
  && npm run test \
  && npm run build

# ---- Runtime stage ------------------------------------------------------
# Unprivileged image: nginx already runs as a non-root user (uid 101) and
# listens on 8080, so no extra permission juggling is needed.
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime

COPY nginx/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/health || exit 1

CMD ["nginx", "-g", "daemon off;"]

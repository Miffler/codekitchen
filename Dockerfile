FROM node:22-alpine

ARG BUILD_DATE=2026-09-07T14:00:00Z
ENV BUILD_DATE=$BUILD_DATE

WORKDIR /app

# Install build dependencies for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

# Copy backend
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --production

COPY backend/dist ./backend/dist

# Copy frontend static files
COPY index.html ./
COPY 404.html ./
COPY order ./order
COPY contact ./contact
COPY assets ./assets
COPY favicon.svg ./
COPY icons.svg ./

EXPOSE 8088

CMD ["node", "backend/dist/server.js"]
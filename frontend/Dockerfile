# Multi-stage production build for CATMS Frontend SPA
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig*.json vite.config.ts index.html postcss.config.js tailwind.config.js ./
COPY public ./public
COPY src ./src
RUN npm run build

# Production Nginx web server
FROM nginx:alpine AS runner

COPY --from=builder /app/dist /usr/share/nginx/html
COPY infra/docker/nginx/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

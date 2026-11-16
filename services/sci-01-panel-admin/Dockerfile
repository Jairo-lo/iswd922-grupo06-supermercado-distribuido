FROM node:22-trixie-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY services/sci-01-panel-admin/package.json services/sci-01-panel-admin/
COPY services/sci-02-api-gateway/package.json services/sci-02-api-gateway/
COPY services/sci-03-inventario/package.json services/sci-03-inventario/
COPY services/sci-04-pedidos/package.json services/sci-04-pedidos/
RUN npm ci
COPY services/sci-01-panel-admin/ services/sci-01-panel-admin/
ARG VITE_API_GATEWAY_URL=http://localhost:4000
ENV VITE_API_GATEWAY_URL=$VITE_API_GATEWAY_URL
RUN npm run build --workspace @grupo06/sci-01-panel-admin

FROM nginx:stable-alpine AS runtime
COPY services/sci-01-panel-admin/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/services/sci-01-panel-admin/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --retries=5 CMD wget -q -O - http://127.0.0.1/healthz || exit 1

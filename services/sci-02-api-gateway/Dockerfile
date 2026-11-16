FROM node:22-trixie-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY services/sci-01-panel-admin/package.json services/sci-01-panel-admin/
COPY services/sci-02-api-gateway/package.json services/sci-02-api-gateway/
COPY services/sci-03-inventario/package.json services/sci-03-inventario/
COPY services/sci-04-pedidos/package.json services/sci-04-pedidos/
RUN npm ci
COPY services/sci-02-api-gateway/ services/sci-02-api-gateway/
RUN npm run build --workspace @grupo06/sci-02-api-gateway

FROM node:22-trixie-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4000
COPY package.json package-lock.json ./
COPY services/sci-01-panel-admin/package.json services/sci-01-panel-admin/
COPY services/sci-02-api-gateway/package.json services/sci-02-api-gateway/
COPY services/sci-03-inventario/package.json services/sci-03-inventario/
COPY services/sci-04-pedidos/package.json services/sci-04-pedidos/
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/services/sci-02-api-gateway/dist services/sci-02-api-gateway/dist
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=5 CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "services/sci-02-api-gateway/dist/index.js"]

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
# Vite copies `public/` into `dist/` verbatim. Without this line it builds without them and the
# baked card stills are simply absent from the image — and because the SPA fallback answers any
# unknown path with index.html and a 200, a curl smoke test cannot tell the difference. The
# gallery spec can, and did.
COPY public ./public
RUN npm run build

FROM nginx:1.28-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
EXPOSE 80

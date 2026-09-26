# İki istemci tek Dockerfile: docker build --build-arg APP=driver|ops
FROM node:24-alpine AS build
ARG APP
WORKDIR /app
COPY package.json package-lock.json ./
COPY driver/package.json driver/
COPY ops/package.json ops/
RUN npm ci
COPY . .
RUN npm run build -w ${APP}

FROM nginx:1.29-alpine
ARG APP
# /etc/nginx/templates altındaki dosyalar açılışta envsubst ile işlenir (API_KEY).
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/${APP}/dist /usr/share/nginx/html

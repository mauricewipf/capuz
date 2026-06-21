FROM nginx:alpine

WORKDIR /app

COPY pages/ /app/seed/
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY seed-data.sh /docker-entrypoint.d/40-seed-data.sh
RUN chmod +x /docker-entrypoint.d/40-seed-data.sh

ENV PORT=80

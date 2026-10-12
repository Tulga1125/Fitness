# The tagent.space landing page: a static page served by nginx on port 8080 (unprivileged image,
# so it runs on platforms that do not let uid 101 bind port 80).
FROM nginxinc/nginx-unprivileged:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html logo.png og.png icon-512.png apple-touch-icon.png favicon.png /usr/share/nginx/html/
HEALTHCHECK --interval=5m --timeout=5s --retries=3 CMD wget --spider -q http://127.0.0.1:8080/healthz || exit 1

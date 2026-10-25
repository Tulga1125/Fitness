# mom.sonorgroup.mn — цэвэрлэгчийн апп. Нэг Node контейнер: статик файл + JSON API.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY server.js ./
COPY public ./public
# Railway: volume-г /data дээр холбоно (Settings → Volumes). Үгүй бол redeploy бүрт өгөгдөл арилна.
# Railway volume-ууд root эзэмшилтэй mount хийгддэг тул root-оор ажиллана (USER node бол EACCES).
ENV DATA_DIR=/data PORT=8080
RUN mkdir -p /data
EXPOSE 8080
HEALTHCHECK --interval=1m --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1
CMD ["node", "server.js"]

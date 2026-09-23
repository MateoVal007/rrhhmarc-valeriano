FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm install
COPY src ./src
USER node
EXPOSE 3000
CMD ["node", "src/server.js"]

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1
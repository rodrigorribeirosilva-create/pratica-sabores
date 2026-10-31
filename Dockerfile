FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
RUN mkdir -p /app/data /app/uploads
ENV DATA_DIR=/app/data UPLOAD_DIR=/app/uploads
EXPOSE 3000
# (sem VOLUME: em produção use um Disk do Render montado em /app/data)
CMD ["node", "server.js"]

FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY src/ ./src/
EXPOSE 9878
ENV PORT=9878
ENV PROXY_HOST=localhost
ENV FLARESOLVERR_URL=http://localhost:8191/v1
ENV API_KEY=torznab-proxy-key
CMD ["node", "src/server.js"]


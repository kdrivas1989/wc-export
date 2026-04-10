FROM node:20-alpine
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --production
ARG CACHEBUST=1
COPY server.js .
RUN mkdir -p /data
ENV PORT=3000
ENV DB_PATH=/data/registrations.db
EXPOSE 3000
CMD ["node", "server.js"]

FROM node:20-alpine AS build
WORKDIR /app
RUN apk add --no-cache python3 build-base
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:20-alpine
WORKDIR /app
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
COPY --from=build /app/node_modules ./node_modules
COPY . .
USER appuser
EXPOSE 3000
CMD ["node", "--max-old-space-size=384", "server.js"]

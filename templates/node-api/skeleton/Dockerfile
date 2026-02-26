FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install --production

FROM node:22-alpine AS runner
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY src ./src
COPY package.json ./

ENV NODE_ENV=production
# PORT is set at runtime via Kubernetes Deployment env vars
ENV PORT=3000

EXPOSE 3000

CMD ["node", "src/index.js"]

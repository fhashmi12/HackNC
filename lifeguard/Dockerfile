# Deploy anywhere that runs a container (Render, Railway, Fly, DigitalOcean, Vultr).
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV PORT=3000 USE_TERMINAL=false
EXPOSE 3000
CMD ["npm", "start"]

FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
CMD ["npm", "start"]

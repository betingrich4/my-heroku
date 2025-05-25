FROM node:18

WORKDIR /app

# Install dependencies
COPY server/package*.json ./
RUN npm install

# Copy server files
COPY server/ .

# Build client
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ .
RUN npm run build

# Return to server directory
WORKDIR /app

# Set environment variables
ENV NODE_ENV=production
ENV PORT=5000
ENV CLIENT_URL=https://your-app-name.herokuapp.com

EXPOSE 5000

CMD ["node", "server.js"]

FROM node:22-alpine

WORKDIR /app

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy the server source code
COPY server.js ./

# Hugging Face Spaces and other container platforms set a custom PORT environment variable (usually 7860 or 8080)
# Our server.js automatically listens on process.env.PORT, falling back to 3001 if not set.
EXPOSE 3000

CMD ["node", "server.js"]

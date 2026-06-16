FROM node:22-alpine

WORKDIR /app

# Copy package.json and install production dependencies
COPY package.json ./
RUN npm install --omit=dev

# Copy the server source code
COPY server.js ./

# Set port to 7860 for Hugging Face Spaces routing
ENV PORT=7860
EXPOSE 7860

CMD ["node", "server.js"]

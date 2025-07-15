# Use official Node.js 20 image as the base
FROM node:20

# Set working directory
WORKDIR /app

# Accept database URL as build argument and set as environment variable
ARG DATABASE_URL
ENV DATABASE_URL=$DATABASE_URL

# Copy all files to the container
COPY . .

# Install all dependencies (including devDependencies) for build
RUN npm install

# Build the project (TypeScript, etc.)
RUN NODE_OPTIONS=--max-old-space-size=4096 npm run build

# (Optional for production: prune devDependencies or use multi-stage build)
# RUN npm prune --production

# Expose the port the app runs on
EXPOSE 5000

# Start the application
CMD ["npm", "start"]
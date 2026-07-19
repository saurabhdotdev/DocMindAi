# Build stage
FROM node:20-alpine AS builder

RUN apk add --no-cache openssl

WORKDIR /app

# Copy package files
COPY package*.json ./

# Copy Prisma schema first for dependency caching
COPY prisma ./prisma/

# Install dependencies (including devDependencies for building)
RUN npm ci

# Generate Prisma Client
RUN npx prisma generate

# Copy source code
COPY . .

# Build TypeScript code
RUN npm run build

# Production stage
FROM node:20-alpine

RUN apk add --no-cache openssl

WORKDIR /app

# Copy package files
COPY package*.json ./

# Copy Prisma schema
COPY prisma ./prisma/

# Install only production dependencies
RUN npm ci --only=production

# Regenerate Prisma Client in production environment
RUN npx prisma generate

# Copy compiled JS files from builder stage
COPY --from=builder /app/dist ./dist

# Expose port
EXPOSE 5000

# Run the server
CMD ["node", "dist/index.js"]

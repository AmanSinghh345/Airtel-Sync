# ==============================================================
# UdyamOne Backend Production Container (NestJS + Prisma + OCR)
# Target Platform: Render Web Service (Docker Runtime)
# ==============================================================

FROM node:20-bookworm-slim AS production

# Install Python 3, Tesseract OCR, and headless graphics libraries for OCR verification
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-numpy \
    tesseract-ocr \
    tesseract-ocr-eng \
    libgl1 \
    libglib2.0-0 \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python OCR dependencies
RUN pip3 install --no-cache-dir opencv-python-headless pytesseract numpy --break-system-packages

WORKDIR /app

# Copy root & workspace package definitions for caching
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

# Install exact npm dependencies across workspaces
RUN npm ci

# Copy monorepo source files and required seed registries
COPY packages/shared-types ./packages/shared-types
COPY apps/api ./apps/api
COPY smb_leads.csv product_catalogue.csv mock_gstin_registry.csv mock_udyam_registry.csv ./
COPY kyc_documents ./kyc_documents

# Build @udyamone/shared-types
RUN npm run build --workspace=@udyamone/shared-types

# Generate Prisma Client & Build @udyamone/api
RUN npx prisma generate --schema apps/api/prisma/schema.prisma
RUN npm run build --workspace=@udyamone/api

# Create persistent storage folder for uploaded KYC documents
RUN mkdir -p /app/uploads

# Default production environment
ENV NODE_ENV=production
ENV PORT=10000
ENV PYTHON_BIN=python3
ENV STORAGE_PATH=/app/uploads

EXPOSE 10000

# Health check endpoint for container orchestrators
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:${PORT}/api/health || exit 1

# Start script: apply pending database migrations to production PostgreSQL, then launch server
CMD ["sh", "-c", "npx prisma migrate deploy --schema apps/api/prisma/schema.prisma && node apps/api/dist/main"]

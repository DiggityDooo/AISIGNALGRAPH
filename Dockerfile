# Stage 1: Build the Next.js frontend
FROM node:22-slim AS frontend-builder
WORKDIR /build
COPY frontend-next/package*.json ./
RUN npm install
COPY frontend-next/ ./
RUN npm run build

# Stage 2: Build the Python backend
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Copy the built frontend into Flask's static directory
COPY --from=frontend-builder /build/out /app/webapp/static/hub

# Pre-initialize the database to avoid startup timeouts in Cloud Run
RUN python3 -c "from webapp import create_app; create_app()"

# Secret key should be provided at runtime via environment variables or Secret Manager
ENV PORT=8080

EXPOSE 8080

# Use gunicorn for production-grade serving
CMD ["gunicorn", "--bind", "0.0.0.0:8080", "--workers", "1", "--threads", "8", "--timeout", "0", "app:app"]

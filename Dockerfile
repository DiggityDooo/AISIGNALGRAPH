FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Pre-initialize the database to avoid startup timeouts in Cloud Run
RUN python3 -c "from webapp import create_app; create_app()"

ENV FLASK_SECRET_KEY=REDACTED_SECRET
ENV PORT=8080

EXPOSE 8080

# Use gunicorn for production-grade serving
CMD ["gunicorn", "--bind", "0.0.0.0:8080", "--workers", "1", "--threads", "8", "--timeout", "0", "app:app"]

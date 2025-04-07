# Build frontend
FROM node:16 AS frontend-build
WORKDIR /app/frontend
COPY text-summary-app/ .
RUN npm install
RUN npm run build

# Set up Python backend
FROM python:3.9
# Install system dependencies for Tesseract OCR
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    libtesseract-dev \
    poppler-utils \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Copy backend code and frontend build
COPY backend/ /app/backend/
COPY --from=frontend-build /app/frontend/build /app/static/

# Change working directory to backend folder
WORKDIR /app/backend

# Install Python dependencies
RUN pip install --no-cache-dir \
    flask \
    flask-cors \
    pypdf \
    python-docx \
    pillow \
    pytesseract \
    transformers \
    torch \
    python-magic \
    python-dateutil \
    chardet \
    pymupdf \
    gunicorn

# Create uploads directory
RUN mkdir -p uploads && chmod 777 uploads

# Set environment variables
ENV PORT=8000
ENV STATIC_DIR=/app/static
ENV PYTHONUNBUFFERED=1

# Expose the port
EXPOSE 8000

# Use server:app since we're now inside the backend directory
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "server:app"]
# Build frontend
FROM node:16 AS frontend-build
WORKDIR /app/frontend
COPY text-summary-app/ .
RUN npm install
RUN npm run build

# Set up Python backend
FROM python:3.9-slim
WORKDIR /app

# Copy backend code and frontend build
COPY backend/ /app/
COPY --from=frontend-build /app/frontend/build /app/static/

# Install Python dependencies directly (replace with your actual dependencies)
RUN pip install --no-cache-dir flask gunicorn python-dotenv

# Set environment variables
ENV PORT=8000
ENV STATIC_DIR=/app/static

# Expose the port
EXPOSE 8000

# Start command - replace with your actual app module and variable
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "backend.server:app"]
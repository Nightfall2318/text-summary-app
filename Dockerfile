# Build frontend
FROM node:16 AS frontend-build
WORKDIR /app/frontend
COPY text-summary-app/ .
RUN npm install
RUN npm run build

# Set up Python backend
FROM python:3.9-slim
# Copy everything first
COPY backend/ /app/backend/
COPY --from=frontend-build /app/frontend/build /app/static/

# Change working directory to be INSIDE the backend folder
WORKDIR /app/backend

# Install Python dependencies 
# (Create this file in your backend folder if you haven't already)
RUN pip install --no-cache-dir -r requirements.txt

# Make sure gunicorn is installed
RUN pip install --no-cache-dir gunicorn

# Set environment variables
ENV PORT=8000
ENV STATIC_DIR=/app/static

# Expose the port
EXPOSE 8000

# Use server:app since we're now inside the backend directory
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "server:app"]
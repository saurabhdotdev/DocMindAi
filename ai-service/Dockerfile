FROM python:3.12-slim

# Set work directory
WORKDIR /app

# Install system dependencies if any are needed (e.g. gcc for compiling some C dependencies)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements file
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy project files
COPY . .

# Expose port
EXPOSE 8000

# Start the FastAPI application
CMD ["python", "main.py"]

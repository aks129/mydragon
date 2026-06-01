# Use official lightweight Python image
FROM python:3.11-slim

# Install system dependencies (git for cloning potential package dependencies)
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

# Set working directory inside container
WORKDIR /app

# Copy dependency specifications
COPY requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application files
COPY . .

# Set default port to 8080 (Cloud Run standard)
ENV PORT=8080

# Start Uvicorn bound to 0.0.0.0 and the dynamic Cloud Run PORT variable
CMD ["sh", "-c", "python3 -m uvicorn main:app --host 0.0.0.0 --port $PORT"]

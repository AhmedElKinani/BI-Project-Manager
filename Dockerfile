# Use a lightweight Python 3.9 image
FROM python:3.9-slim

# Set working directory inside the container
WORKDIR /app

# Copy the required application files
COPY backend.py .
COPY index.html .
COPY App.js .
COPY styles.css .
COPY mockData.js .

# Expose port 8080 because the internal HTTP server runs on 8080
EXPOSE 8080

# Command to run the application
CMD ["python3", "backend.py"]

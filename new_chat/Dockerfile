# new_chat/Dockerfile
FROM python:3.10-slim

# Set the working directory
WORKDIR /app

# Copy the requirements file if it exists
COPY requirements.txt ./

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the application code to the container
COPY . .

# Expose the WebSocket server port
EXPOSE 6789

# Command to run the application
CMD ["python", "server.py"]

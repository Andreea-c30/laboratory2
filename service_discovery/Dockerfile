# service_discovery/Dockerfile
FROM node:16

# Set the working directory
WORKDIR /app

# Copy package.json and install dependencies
COPY package*.json ./
RUN npm install

# Copy the application code to the container
COPY . .

# Expose the port the service discovery runs on
EXPOSE 3001

# Command to run the application
CMD ["node", "service_discovery.js"]

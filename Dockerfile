# Use an official Node.js runtime as a parent image
FROM node:18-alpine

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install the app dependencies
RUN npm install

# Copy the rest of the application code into the container
COPY . .

# Expose port 3000 (NestJS default port)
EXPOSE 3000

# Run the NestJS app
CMD ["npm", "run", "start:dev"]
# Wallet API

## Description

The Wallet API is a robust and scalable backend service designed for managing digital wallets and processing financial transactions. Built with the NestJS framework, it ensures high performance, security, and reliability. The API supports features such as wallet creation, balance management, transaction processing, and idempotency to prevent duplicate operations. It is ideal for applications requiring secure and efficient wallet management.

### Setup Instructions

1. **Clone the Repository**:
   ```bash
   git clone <repository-url>
   cd wallet-api
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Environment Configuration**:
   Edit the `.env.example` file in the root directory and rename it to `.env. Configure the following variables:

   ```env
   # Database configuration
   DB_HOST=localhost
   DB_PORT=5432
   DB_USERNAME=your_username_here
   DB_PASSWORD=your_password_here
   DB_NAME=your_database_name_here

   # Redis configuration (for Bull and caching)
   REDIS_HOST=redis
   REDIS_PORT=6379
   ```

4. **Run the Application**:
   ```bash
   npm run start:dev
   ```

5. **Run Tests**:
   ```bash
   npm run test
   ```

### Running with Docker

1. **Install Docker**:
   Ensure Docker is installed on your system. You can download it from [Docker's official website](https://www.docker.com/).

2. **Start Services**:
   Use the following command to start the application and its dependencies:
   ```bash
   docker-compose up --build
   ```

3. **Access the Application**:
   Once the services are running, the API will be accessible at `http://localhost:3000`.

4. **Stop Services**:
   To stop the services, use:
   ```bash
   docker-compose down
   ```

### Notes on Docker Setup

- The `docker-compose.yml` file sets up three services:
  - `wallet-api`: The main application.
  - `db`: A PostgreSQL database.
  - `redis`: A Redis instance for caching and idempotency.
- Ensure that ports `3000`, `5432`, and `6379` are not in use by other applications on your system.

### Assumptions Made

- The application assumes a PostgreSQL database for storing wallet and transaction data.
- Redis is used for caching and ensuring idempotency in transaction processing.
- All monetary values are stored in the smallest currency unit (e.g., cents for USD) to avoid floating-point errors.

### Decisions Taken

- **Database Design**: The schema is optimized for transactional consistency and performance.
- **Idempotency**: Implemented using Redis to ensure that duplicate transaction requests are not processed multiple times.
- **Scalability**: The application is designed to scale horizontally by leveraging Redis and stateless APIs.

### Updated SQL Schema

#### Wallets Table
```sql
CREATE TABLE wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- Unique identifier for the wallet
    balance INT NOT NULL DEFAULT 0 -- Current balance of the wallet
);
```

#### Transactions Table
```sql
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- Unique identifier for the transaction
    amount INT NOT NULL, -- Amount involved in the transaction
    type VARCHAR(50) NOT NULL CHECK (type IN ('deposit', 'withdrawal', 'transfer')), -- Type of transaction
    status VARCHAR(20) NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed')), -- Status of the transaction
    wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE, -- Wallet that initiated the transaction
    to_wallet_id UUID REFERENCES wallets(id), -- Destination wallet (only for transfers)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP -- Timestamp when the transaction was created
);

-- Index to optimize queries by wallet_id, to_wallet_id, and type
CREATE INDEX idx_transactions_wallet_id_to_wallet_id_type ON transactions(wallet_id, to_wallet_id, type);
```

### Indexes and Constraints

- **Indexes**:
  - `idx_transactions_wallet_id_to_wallet_id_type`: Optimizes queries by `wallet_id`, `to_wallet_id`, and `type`.

- **Constraints**:
  - `FOREIGN KEY (wallet_id)`: Maintains referential integrity between `transactions` and `wallets`.
  - `FOREIGN KEY (to_wallet_id)`: Ensures referential integrity for transfer transactions.

### Additional Notes

- Ensure that the database and Redis are running before starting the application.
- Use a robust monitoring solution to track API performance and database health.

### API Documentation

The Wallet API includes comprehensive API documentation powered by Swagger. This documentation provides details about all available endpoints, request/response structures, and authentication requirements.

#### Accessing the Documentation

1. Start the application using Docker or the development server.
2. Open your browser and navigate to:
   ```
   http://localhost:3000/api
   ```
3. Use the interactive interface to explore and test the API endpoints.

#### Features of the Documentation

- **Endpoint Descriptions**: Detailed information about each API endpoint.
- **Request/Response Models**: Clear definitions of input and output data.

This documentation is automatically generated and kept up-to-date with the application's codebase.

For further details, refer to the source code and comments within the project.
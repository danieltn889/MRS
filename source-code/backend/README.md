# V-WES Backend

This folder contains the Node.js and TypeScript backend for the V-WES recruitment and culture-fit evaluation platform.

## Company Information

| Item | Details |
|------|---------|
| Company name | Mpuza Inc. |
| Physical address | Kk737St, Kigali, Rwanda |
| Official email | info@mpuza.com |
| Phone | +250786397515 |
| Industry supervisor | Derek J. Blair |
| Supervisor job title | CTO |
| Supervisor email | jbderek@mpuza.com |
| Supervisor phone | +16505077742 |

## Backend Purpose

The backend manages the platform API for authentication, user profiles, job postings, applications, virtual work simulations, AI scoring, analytics, notifications, and blockchain verification.

## Tech Stack

- Node.js with Express.js
- TypeScript
- PostgreSQL
- JWT authentication
- Socket.IO for real-time communication
- Nodemailer for email notifications
- Multer for uploads
- Winston and Morgan for logging
- Web3/Ethers integration for blockchain services

## Project Structure

```text
backend/
  src/
    config/       Application, database, and service configuration
    controllers/  Request handlers
    middleware/   Authentication, validation, and security middleware
    routes/       Versioned API routes
    services/     Business logic and integrations
    utils/        Shared helper functions
    db/           Database migration and seed logic
    socket/       Real-time communication handlers
  emails/         Email templates
  logs/           Runtime logs
  uploads/        Uploaded files
```

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create and configure `.env` in this folder:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=recruitment_db
DB_USER=postgres
DB_PASSWORD=your_password_here
JWT_SECRET=your_jwt_secret_here
JWT_EXPIRE=30d
PORT=3001
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000
FRONTEND_URL=http://localhost:3000
AI_SERVICE_URL=http://localhost:5000
BLOCKCHAIN_RPC_URL=http://127.0.0.1:8545
```

3. Run database setup:

```bash
npm run db:setup
```

4. Start the development server:

```bash
npm run dev
```

## Useful Scripts

```bash
npm run dev        # Run the backend in development mode
npm run build      # Type-check the TypeScript project
npm test           # Run tests
npm run migrate    # Run database migrations
npm run seed       # Seed the database
npm run db:reset   # Reset the database
```

## Security Notes

Do not commit `.env`, passwords, JWT secrets, API keys, private keys, uploaded private files, or production logs.

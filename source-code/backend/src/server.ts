require('dotenv').config();
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import app from './app';
import { logger } from './utils/logger';

const PORT = parseInt(process.env.PORT || '3001', 10);

let server: any;

try {
  server = createServer(app);
  const io = new SocketServer(server, {
    cors: {
      origin: true,
      credentials: true
    }
  });

  io.on('connection', (socket) => {
    logger.info(`User connected: ${socket.id}`);

    socket.on('join_simulation', (simulationId: string) => {
      if (simulationId) {
        socket.join(`simulation:${simulationId}`);
        logger.info(`Socket ${socket.id} joined simulation:${simulationId}`);
      }
    });

    socket.on('leave_simulation', (simulationId: string) => {
      if (simulationId) socket.leave(`simulation:${simulationId}`);
    });

    socket.on('join_session', (sessionId: string) => {
      if (sessionId) {
        socket.join(`session:${sessionId}`);
        logger.info(`Socket ${socket.id} joined session:${sessionId}`);
      }
    });

    socket.on('leave_session', (sessionId: string) => {
      if (sessionId) socket.leave(`session:${sessionId}`);
    });

    socket.on('join_user', (userId: string) => {
      if (userId) {
        socket.join(`user:${userId}`);
        logger.info(`Socket ${socket.id} joined user:${userId}`);
      }
    });

    socket.on('leave_user', (userId: string) => {
      if (userId) socket.leave(`user:${userId}`);
    });

    socket.on('join_simulation_session', (sessionId: string) => {
      if (sessionId) socket.join(`simulation:${sessionId}`);
    });

    socket.on('leave_simulation_session', (sessionId: string) => {
      if (sessionId) socket.leave(`simulation:${sessionId}`);
    });

    socket.on('disconnect', () => {
      logger.info(`User disconnected: ${socket.id}`);
    });
  });

  app.set('io', io);

  server.listen(PORT, '0.0.0.0', () => {
    logger.info(`Server running on port ${PORT}`);
    console.log(`Server running on port ${PORT}`);
  });

  process.on('unhandledRejection', (err: Error) => {
    logger.error('Unhandled Rejection:', err.message);
    server.close(() => {
      process.exit(1);
    });
  });

  process.on('uncaughtException', (err: Error) => {
    logger.error('Uncaught Exception:', err.message, err.stack);
    process.exit(1);
  });
} catch (error) {
  console.error('Error starting server:', error);
  process.exit(1);
}

export default server;

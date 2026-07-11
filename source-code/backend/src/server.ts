import 'dotenv/config';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import app from './app.js';
import { logger } from './utils/logger.js';
import DatabaseService from './services/database.service.js';

const PORT = parseInt(process.env.PORT || '3001', 10);

let server: any;

// Store connected users
const connectedUsers = new Map<string, string>(); // userId -> socketId
const userSockets = new Map<string, string>(); // socketId -> userId

try {
  server = createServer(app);
  const io = new SocketServer(server, {
    cors: {
      origin: true,
      credentials: true
    }
  });

  // Store io instance on app for controllers to access
  app.set('io', io);
  
  // Export for use in controllers
  (global as any).io = io;
  (global as any).connectedUsers = connectedUsers;
  (global as any).isUserOnline = (userId: string) => connectedUsers.has(userId);
  (global as any).getUserSocket = (userId: string) => {
    const socketId = connectedUsers.get(userId);
    return socketId ? io.sockets.sockets.get(socketId) : null;
  };
  (global as any).sendToUser = (userId: string, event: string, data: any) => {
    const socket = (global as any).getUserSocket(userId);
    if (socket) {
      socket.emit(event, data);
      return true;
    }
    return false;
  };

  // Socket authentication: if a JWT is supplied (via auth.token, query.token, or
  // the Authorization header), verify it and treat its `id` as the authoritative
  // user id. An invalid token is rejected. Connections without a token are still
  // accepted (legacy clients) but cannot be trusted to set another user's id.
  io.use((socket, next) => {
    try {
      const authToken =
        (socket.handshake.auth && (socket.handshake.auth as any).token) ||
        (socket.handshake.query && (socket.handshake.query as any).token) ||
        (socket.handshake.headers.authorization || '').replace(/^Bearer\s+/i, '');

      if (authToken && process.env.JWT_SECRET) {
        try {
          const decoded = jwt.verify(authToken, process.env.JWT_SECRET) as { id: string };
          if (decoded?.id) {
            socket.data.authUserId = decoded.id;
          }
        } catch {
          return next(new Error('Unauthorized: invalid token'));
        }
      }
      next();
    } catch {
      next();
    }
  });

  io.on('connection', (socket) => {
    logger.info(`User connected: ${socket.id}`);

    // Prefer the verified user id from the JWT; fall back to the client-provided
    // id only for legacy connections that did not present a token.
    const userId = socket.data.authUserId || socket.handshake.auth.userId || socket.handshake.query.userId;
    
    if (userId && typeof userId === 'string') {
      // Store user connection
      connectedUsers.set(userId, socket.id);
      userSockets.set(socket.id, userId);
      socket.data.userId = userId;
      
      logger.info(`User ${userId} mapped to socket ${socket.id}`);
      logger.info(`Total connected users: ${connectedUsers.size}`);
      
      // Auto-join user's personal room
      socket.join(`user:${userId}`);
      
      // Broadcast online status to all rooms user is in
      socket.broadcast.emit('user_status_change', { userId, status: 'online'});
    }

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

    socket.on('join_user', (requestedUserId: string) => {
      // If this socket is authenticated, only let it join its OWN user room.
      const allowedUserId = socket.data.authUserId || requestedUserId;
      if (allowedUserId) {
        socket.join(`user:${allowedUserId}`);
        logger.info(`Socket ${socket.id} joined user:${allowedUserId}`);
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

    // Mark messages as read
    socket.on('mark_read', async (data: { sessionId: string; simulationId?: string }) => {
      const { sessionId, simulationId } = data;
      const currentUserId = socket.data.userId;
      
      if (!currentUserId || !sessionId) return;
      
      try {
        // Update unread count in database
        await DatabaseService.query(`
          UPDATE simulation_sessions 
          SET unread_count = 0 
          WHERE id = $1 AND user_id = $2
        `, [sessionId, currentUserId]);
        
        // Notify others that user read messages
        socket.to(`session:${sessionId}`).emit('messages_read', {
          userId: currentUserId,
          sessionId,
          simulationId
        });
        
        logger.info(`User ${currentUserId} marked messages as read in session ${sessionId}`);
      } catch (err) {
        logger.error('Error marking messages as read:', err);
      }
    });

    // Typing indicator
    socket.on('typing', (data: { sessionId: string; isTyping: boolean; userName?: string }) => {
      const { sessionId, isTyping, userName } = data;
      const currentUserId = socket.data.userId;
      
      if (!currentUserId || !sessionId) return;
      
      socket.to(`session:${sessionId}`).emit('user_typing', {
        userId: currentUserId,
        userName: userName || `User ${currentUserId.substring(0, 8)}`,
        isTyping
      });
    });

    // Get online users
    socket.on('get_online_users', () => {
      const onlineUsers = Array.from(connectedUsers.keys());
      socket.emit('online_users', onlineUsers);
    });

    socket.on('disconnect', () => {
      const userId = userSockets.get(socket.id);
      
      if (userId) {
        connectedUsers.delete(userId);
        userSockets.delete(socket.id);
        
        logger.info(`User disconnected: ${userId} (${socket.id})`);
        logger.info(`Remaining connected users: ${connectedUsers.size}`);
        
        // Broadcast offline status
        socket.broadcast.emit('user_status_change', { userId, status: 'offline'});
      } else {
        logger.info(`User disconnected: ${socket.id}`);
      }
    });
  });

  // Helper function to check if user is online (available globally)
  (global as any).isUserOnline = (userId: string): boolean => {
    return connectedUsers.has(userId);
  };

  (global as any).getUserSocket = (userId: string): any => {
    const socketId = connectedUsers.get(userId);
    return socketId ? io.sockets.sockets.get(socketId) : null;
  };

  (global as any).sendToUser = (userId: string, event: string, data: any): boolean => {
    const socket = (global as any).getUserSocket(userId);
    if (socket) {
      socket.emit(event, data);
      logger.info(`Sent ${event} to user ${userId}`);
      return true;
    }
    logger.warn(`User ${userId} not connected, cannot send ${event}`);
    return false;
  };

  (global as any).getOnlineUsers = (): string[] => {
    return Array.from(connectedUsers.keys());
  };

  server.listen(PORT, '0.0.0.0', () => {
    logger.info(`Server running on port ${PORT}`);
    console.log(`Server running on port ${PORT}`);
    console.log(`WebSocket server ready with user tracking`);
  });

  process.on('unhandledRejection', (err: Error) => {
    logger.error('Unhandled Rejection:', err.message);
    if (server) {
      server.close(() => {
        process.exit(1);
      });
    } else {
      process.exit(1);
    }
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
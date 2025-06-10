const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = createServer(app);

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling']
});

// Store active connections for room management
const activeConnections = new Map();

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Handle joining a chat room
  socket.on('join_order_room', (data) => {
    const { orderId, userId, platform, type } = data;

    if (!orderId || !userId) {
      socket.emit('error', { message: 'Order ID and User ID are required' });
      return;
    }

    const room = `order_${orderId}`;
    socket.join(room);
    activeConnections.set(socket.id, { room, userId, platform, type });

    console.log(`User ${userId} joined order room ${orderId}`);
    socket.emit('joined_order_room', { room, userId });
  });

  // Handle sending order messages
  socket.on('send_order_message', async (data, callback) => {
    const connectionInfo = activeConnections.get(socket.id);
    if (!connectionInfo) {
      socket.emit('error', { message: 'Join a room before sending messages' });
      return;
    }

    const { room, platform, type } = connectionInfo;
    const { message } = data;

    if (!message) {
      if (callback) callback({ error: 'Message content is required' });
      return;
    }

    const timestamp = Number(new Date());
    const messageData = {
      id: 0,
      sender_id: connectionInfo.userId,
      type: type || 'chat-message',
      json: JSON.stringify({ message, sender_id: connectionInfo.userId }),
      timestamp,
      platform: platform || 'web'
    };

    // Broadcast message to all clients in the order room
    io.to(room).emit('new_order_message', messageData);
    console.log(`Order message sent to ${room}:`, messageData);

    // Call callback immediately
    if (callback) callback({ success: true });

    // Save to database (skip if from server)
    if (platform !== 'server') {
      try {
        await saveMessageToDatabase(messageData);
      } catch (error) {
        console.error('Failed to save message:', error);
      }
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    const connection = activeConnections.get(socket.id);
    if (connection) {
      console.log(`User ${connection.userId} disconnected from order room ${connection.room}`);
      activeConnections.delete(socket.id);
    }
    console.log('Client disconnected:', socket.id);
  });
});

// REST API endpoint to send order messages from server
app.post('/api/send-order-message', (req, res) => {
  const { orderId, userId, message, platform = 'server', type = 'chat-message' } = req.body;

  if (!orderId || !userId || !message) {
    return res.status(400).json({
      error: 'Order ID, User ID, and message are required'
    });
  }

  const room = `order_${orderId}`;
  const messageData = {
    id: Date.now().toString(),
    room,
    userId,
    message,
    type,
    timestamp: new Date().toISOString(),
    platform
  };

  // Broadcast to order room
  io.to(room).emit('new_order_message', messageData);
  console.log(`Server message sent to ${room}:`, messageData);

  res.json({
    success: true,
    message: 'Order message sent successfully',
    data: messageData
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Database saving function
async function saveMessageToDatabase(messageData) {
  // Implementation would go here
  console.log('Saving message to database:', messageData);
  // Example: await database.save(messageData);
}

const PORT = process.env.PORT || 3005;

server.listen(PORT, () => {
  console.log(`Order chat server running on port ${PORT}`);
});

module.exports = { app, server, io };
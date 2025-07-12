const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = createServer(app);

app.use(cors());
app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling']
});

const activeConnections = new Map();

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('join_order_room', (data) => {
    const { orderId, userId, platform, type } = data;

    if (!orderId || !userId) {
      socket.emit('error', { message: 'Order ID and User ID are required' });
      return;
    }

    const room = `order_${orderId}`;
    socket.join(room);
    activeConnections.set(socket.id, { room, userId, platform, type, orderId });

    console.log(`User ${userId} joined order room ${orderId}`);
    socket.emit('joined_order_room', { room, userId });
  });

  socket.on('send_order_message', async (data, callback) => {
    const connectionInfo = activeConnections.get(socket.id);
    if (!connectionInfo) {
      socket.emit('error', { message: 'Join a room before sending messages' });
      return;
    }

    const { room, platform, type, userId, orderId } = connectionInfo;
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

    io.to(room).emit('new_order_message', messageData);
    console.log(`Order message from ${platform} sent to ${room}:`, messageData);

    if (callback) callback({ success: true });

    if (platform !== 'server') {
      try {
        const messageData = {
          order_id: orderId,
          sender_id: userId,
          type: type || 'chat-message',
          json: message,
          timestamp,
          platform: platform || 'web'
        };

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

app.post('/api/send-order-message', async (req, res) => {
  const { orderId, userId, message, platform = 'server', type = 'chat-message' } = req.body;

  if (!orderId || !userId || !message) {
    return res.status(400).json({
      error: 'Order ID, User ID, and message are required'
    });
  }

  const room = `order_${orderId}`;
  const timestamp = Number(new Date());

  const messageData = {
    id: timestamp.toString(),
    sender_id: userId.toString(),
    type,
    json: JSON.stringify(message),
    timestamp,
    platform
  };

  io.to(room).emit('new_order_message', messageData);
  console.log(`Server message sent to ${room}:`, messageData);

  res.json({
    success: true,
    message: 'Order message sent successfully',
    data: messageData
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

async function saveMessageToDatabase(messageData) {
  try {
    const response = await fetch('http://194.238.18.114:3002/api/chat/save-message', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messageData)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error saving message to database:', error);
    throw error;
  }
}

const PORT = process.env.PORT || 3005;

server.listen(PORT, () => {
  console.log(`Order chat server running on port ${PORT}`);
});

module.exports = { app, server, io };
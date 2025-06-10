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
  socket.on('join_room', (data) => {
    const { roomId, userId } = data;
    
    if (!roomId || !userId) {
      socket.emit('error', { message: 'Room ID and User ID are required' });
      return;
    }

    // Join the room
    socket.join(roomId);
    activeConnections.set(socket.id, { roomId, userId });
    
    console.log(`User ${userId} joined room ${roomId}`);
    socket.emit('joined_room', { roomId, userId });
  });

  // Handle sending messages
  socket.on('send_message', async (data) => {
    const { roomId, userId, message } = data;
    
    if (!roomId || !userId || !message) {
      socket.emit('error', { message: 'Room ID, User ID, and message are required' });
      return;
    }

    const messageData = {
      id: Date.now().toString(),
      roomId,
      userId,
      message,
      timestamp: new Date().toISOString()
    };

    // Broadcast message to all clients in the room
    io.to(roomId).emit('new_message', messageData);
    
    console.log(`Message sent to room ${roomId}:`, messageData);

    // Save message to database (you can implement this API call)
    try {
      // Replace with your actual API endpoint
      await saveMessageToDatabase(messageData);
    } catch (error) {
      console.error('Failed to save message:', error);
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    const connection = activeConnections.get(socket.id);
    if (connection) {
      console.log(`User ${connection.userId} disconnected from room ${connection.roomId}`);
      activeConnections.delete(socket.id);
    }
    console.log('Client disconnected:', socket.id);
  });
});

// REST API endpoint to send messages from server
app.post('/api/send-message', (req, res) => {
  const { roomId, userId, message } = req.body;

  if (!roomId || !userId || !message) {
    return res.status(400).json({ 
      error: 'Room ID, User ID, and message are required' 
    });
  }

  const messageData = {
    id: Date.now().toString(),
    roomId,
    userId,
    message,
    timestamp: new Date().toISOString(),
    fromServer: true
  };

  // Broadcast message to all clients in the room
  io.to(roomId).emit('new_message', messageData);
  
  console.log(`Server message sent to room ${roomId}:`, messageData);

  res.json({ 
    success: true, 
    message: 'Message sent successfully',
    data: messageData 
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Function to save message to database (implement your own logic)
async function saveMessageToDatabase(messageData) {
  // Replace this with your actual database saving logic
  // Example: await fetch('your-api-endpoint', { method: 'POST', body: JSON.stringify(messageData) })
  console.log('Saving message to database:', messageData);
}

const PORT = process.env.PORT || 3005;

server.listen(PORT, () => {
  console.log(`Chat server running on port ${PORT}`);
});

module.exports = { app, server, io };
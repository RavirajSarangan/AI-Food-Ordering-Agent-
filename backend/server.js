require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const { router: agentRouter } = require('./routes/agent');
const menuRouter = require('./routes/menu');
const ordersRouter = require('./routes/orders');

const app = express();
const PORT = process.env.PORT || 5001;

// Middlewares
app.use(cors());
app.use(express.json());

// Database Connection
const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/foodhub';
mongoose.connect(mongoURI)
  .then(() => console.log('Successfully connected to MongoDB.'))
  .catch(err => {
    console.error('Failed to connect to MongoDB:', err.message);
    console.warn('Note: Express backend is running, but database connection is unavailable. Ensure MongoDB is active.');
  });

// Mount Routes
app.use('/api', agentRouter);
app.use('/api', menuRouter);
app.use('/api', ordersRouter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err.stack);
  res.status(500).json({
    success: false,
    error: 'Internal server error occurred.'
  });
});

// Start Server
app.listen(PORT, () => {
  console.log(`FoodHub Backend Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

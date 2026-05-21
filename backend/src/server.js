const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const env = require('./config/env');
const { errorHandler } = require('./middleware/error.middleware');

const app = express();

// Middleware
app.use(helmet());
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001'
  ],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Routes
const healthRoutes = require('./routes/health.routes');
const authRoutes = require('./routes/auth.routes');
const inventoryRoutes = require('./routes/inventory.routes');
const proposalsRoutes = require('./routes/proposals.routes');
const quotationsRoutes = require('./routes/quotations.routes');
const invoicesRoutes = require('./routes/invoices.routes');
const paymentsRoutes = require('./routes/payments.routes');

app.use('/health', healthRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/inventory', inventoryRoutes);
app.use('/api/v1/proposals', proposalsRoutes);
app.use('/api/v1/quotations', quotationsRoutes);
app.use('/api/v1/invoices', invoicesRoutes);
app.use('/api/v1/payments', paymentsRoutes);

app.get('/', (req, res) => {
  res.json({ message: 'Enterprise API is Online', docs: '/docs' });
});

// Error handling
app.use(errorHandler);

// Ensure the process doesn't exit on unhandled rejections or exceptions
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

const PORT = process.env.PORT || 8000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`=========================================`);
  console.log(`🚀 Node backend running on port ${PORT}`);
  console.log(`🏠 Health Check: http://localhost:${PORT}/health`);
  console.log(`=========================================`);
});

// Force the Node.js process to stay alive and not exit "cleanly"
setInterval(() => {
  // Keeping the event loop active
}, 10000);

module.exports = app;

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const http = require('http');
const https = require('https');
const env = require('./config/env');
const { errorHandler } = require('./middleware/error.middleware');
const { csrfMiddleware } = require('./middleware/csrf.middleware');
const { loadOrGenerateCert } = require('./config/tls');

const app = express();

// HTTPS is on by default; set ENABLE_HTTPS=false to fall back to plain HTTP
// (only useful in extremely constrained envs — and unsafe outside localhost).
const ENABLE_HTTPS =
  String(process.env.ENABLE_HTTPS || 'true').toLowerCase() !== 'false';
// Whether issued cookies should carry the Secure flag. Tied to actual
// transport, not just NODE_ENV.
app.locals.secureCookies = ENABLE_HTTPS || env.NODE_ENV === 'production';

// Tell express that helmet's hsts is safe to apply (we are or will be on TLS).
app.use(helmet({
  hsts: ENABLE_HTTPS
    ? { maxAge: 15552000, includeSubDomains: true }
    : false   // don't send HSTS over plain HTTP, browsers reject it anyway
}));

// CORS: allow localhost dev ports (http AND https) + APP_URL + CORS_ORIGINS.
const corsOrigins = new Set([
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'https://localhost:3000',
  'https://localhost:3001',
  'https://127.0.0.1:3000',
  'https://127.0.0.1:3001'
]);
if (env.APP_URL) corsOrigins.add(env.APP_URL);
if (process.env.CORS_ORIGINS) {
  for (const o of process.env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)) {
    corsOrigins.add(o);
  }
}
app.use(cors({
  origin: (origin, cb) => {
    // Allow same-origin / curl (no Origin header) and explicit allowlist.
    if (!origin || corsOrigins.has(origin)) return cb(null, true);
    return cb(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan('dev'));
app.use(csrfMiddleware);

// Routes
const healthRoutes = require('./routes/health.routes');
const authRoutes = require('./routes/auth.routes');
const inventoryRoutes = require('./routes/inventory.routes');
const proposalsRoutes = require('./routes/proposals.routes');
const quotationsRoutes = require('./routes/quotations.routes');
const invoicesRoutes = require('./routes/invoices.routes');
const paymentsRoutes = require('./routes/payments.routes');
const reportsRoutes = require('./routes/reports.routes');
const auditLogsRoutes = require('./routes/audit-logs.routes');
const emailRoutes = require('./routes/email.routes');
const customersRoutes = require('./routes/customers.routes');
const companySettingsRoutes = require('./routes/company-settings.routes');
const usersRoutes = require('./routes/users.routes');
const rolesRoutes = require('./routes/roles.routes');

app.use('/health', healthRoutes);

// Every API router is mounted under both /api (spec) and /api/v1 (legacy).
const apiRouters = [
  ['auth', authRoutes],
  ['inventory', inventoryRoutes],
  ['proposals', proposalsRoutes],
  ['quotations', quotationsRoutes],
  ['invoices', invoicesRoutes],
  ['payments', paymentsRoutes],
  ['reports', reportsRoutes],
  ['audit-logs', auditLogsRoutes],
  ['email', emailRoutes],
  ['customers', customersRoutes],
  ['company-settings', companySettingsRoutes],
  ['users', usersRoutes],
  ['roles', rolesRoutes]
];
for (const [name, handler] of apiRouters) {
  app.use(`/api/${name}`, handler);
  app.use(`/api/v1/${name}`, handler);
}

app.get('/', (req, res) => {
  res.json({ message: 'Enterprise API is Online', docs: '/docs' });
});

// Error handling
app.use(errorHandler);

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

const PORT = process.env.PORT || 8000;

if (require.main === module) {
  const scheme = ENABLE_HTTPS ? 'https' : 'http';
  let server;
  if (ENABLE_HTTPS) {
    const { cert, key } = loadOrGenerateCert();
    server = https.createServer({ cert, key }, app);
  } else {
    server = http.createServer(app);
  }
  server.listen(PORT, '0.0.0.0', () => {
    console.log('=========================================');
    console.log(`Node backend running on ${scheme.toUpperCase()} port ${PORT}`);
    console.log(`Health check: ${scheme}://localhost:${PORT}/health`);
    if (ENABLE_HTTPS) {
      console.log('Self-signed cert — browser will warn once, accept and reload.');
    }
    console.log('=========================================');
  });
}

module.exports = app;

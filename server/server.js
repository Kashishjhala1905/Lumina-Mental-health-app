const path = require('path');
const dotenv = require('dotenv');

// Load server/.env first, then fall back to the repository-root .env.
// dotenv never overrides variables that are already set.
dotenv.config({ path: path.join(__dirname, '.env'), quiet: true });
dotenv.config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { Server } = require('socket.io');
const connectDB = require('./config/db');
const { getJwtSecret } = require('./utils/authTokens');
const { sanitizeRequest, verifyOrigin, apiLimiter, getAllowedOrigins } = require('./middleware/security');
const { notFound, errorHandler } = require('./middleware/errorHandler');

// Fail fast on a missing JWT secret in production; warn in development.
getJwtSecret();

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

const allowedOrigins = getAllowedOrigins();
const corsOptions = {
    origin(origin, callback) {
        // Allow same-origin / non-browser requests (no Origin header) and allow-listed origins.
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
};

// Middleware
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors(corsOptions));
app.use(express.json({
    limit: '100kb',
    // Keep the raw body only for signed provider webhooks (signature verification needs exact bytes)
    verify: (req, res, buf) => { if (req.originalUrl.startsWith('/api/email/webhooks')) req.rawBody = buf.toString('utf8'); },
}));
app.use(cookieParser());
app.use(sanitizeRequest);
app.use('/api', verifyOrigin);
app.use('/api', apiLimiter);
// API responses carry personal data: never let the browser or a proxy cache them, so nothing
// private can be shown again (e.g. via the Back button) after signing out.
app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
});

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/appointment', require('./routes/appointmentRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/chatbot', require('./routes/chatbotRoutes'));
app.use('/api/resources', require('./routes/resourceRoutes'));
app.use('/api/community', require('./routes/communityRoutes'));
app.use('/api/counseling', require('./routes/counselingRoutes'));
app.use('/api/mood', require('./routes/moodRoutes'));
app.use('/api/assessments', require('./routes/assessmentRoutes'));
app.use('/api/feedback', require('./routes/feedbackRoutes'));
app.use('/api/history', require('./routes/historyRoutes'));
app.use('/api/victim-support', require('./routes/victimSupportRoutes'));
app.use('/api/counselor', require('./routes/counselorRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/internal', require('./routes/internalRoutes'));
app.use('/api/email/webhooks', require('./routes/emailWebhookRoutes'));

// Health / root routes
app.get('/', (req, res) => {
    res.send('API is running...');
});
app.get('/api/health', (req, res) => {
    const mongoose = require('mongoose');
    res.json({ success: true, status: 'ok', db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' });
});

app.use('/api', notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

// Connect to DB (also runs when imported by Vercel's serverless runtime)
connectDB();

// Built-in resources are synced once per process (idempotent, race-safe)
require('mongoose').connection.once('open', () => {
    require('./services/resourceCatalog').ensureCatalogue().catch((err) => console.error('Resource catalogue sync failed:', err.message));
});

/**
 * Start the HTTP server, Socket.io and the centralized reminder scheduler.
 * Only used for long-running processes (local dev / VPS); serverless imports skip it.
 */
function startServer(port = PORT) {
    const server = http.createServer(app);
    const io = new Server(server, { cors: { origin: allowedOrigins, credentials: true } });
    io.on('connection', (socket) => console.log('Socket.io client connected', socket.id));
    app.set('io', io);

    const { startReminderScheduler } = require('./services/reminderScheduler');
    startReminderScheduler();

    server.listen(port, () => console.log(`Server running on port ${port}`));
    return server;
}

if (require.main === module) {
    startServer();
}

module.exports = app;
module.exports.startServer = startServer;

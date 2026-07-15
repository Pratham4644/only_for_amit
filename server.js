const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDatabase } = require('./database/db');
const { startScheduler } = require('./utils/meal-scheduler');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Global crash protection ──────────────────────────────────────────────────
// Catch any synchronous exception that escapes an async handler so the process
// doesn't die and take down the entire mess-hall system.
process.on('uncaughtException', (err) => {
    console.error('[FATAL] Uncaught exception — server kept alive:', err);
});

// Catch unhandled promise rejections (Node 15+ throws by default).
process.on('unhandledRejection', (reason, promise) => {
    console.error('[FATAL] Unhandled promise rejection — server kept alive:', reason);
});
// ─────────────────────────────────────────────────────────────────────────────

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// API Routes
app.use('/api/students', require('./routes/students'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/reminders', require('./routes/reminders'));
app.use('/api/leave', require('./routes/leave'));
app.use('/api/payments', require('./routes/payments'));

// Root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Counter screen route
app.get('/counter', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'counter', 'index.html'));
});

// Admin panel route
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

// ─── Global Express error handler ────────────────────────────────────────────
// Must be registered AFTER all routes. Returns clean JSON instead of leaking
// internal stack traces / filesystem paths to the client.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    console.error('[ERROR] Unhandled route error:', err);
    const status = err.status || err.statusCode || 500;
    res.status(status).json({
        success: false,
        error: 'SERVER_ERROR',
        message: 'An internal server error occurred. Please try again.'
    });
});
// ─────────────────────────────────────────────────────────────────────────────

// Initialize database and start server
initDatabase()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`\n🚀 Mess Attendance System is running!`);
            console.log(`\n📍 Access points:`);
            console.log(`   Counter Screen: http://localhost:${PORT}/counter`);
            console.log(`   Admin Panel:    http://localhost:${PORT}/admin`);
            console.log(`   API:            http://localhost:${PORT}/api`);
            console.log(`   API Reminders:  http://localhost:${PORT}/api/reminders`);
            console.log(`\n✅ Server started on port ${PORT}\n`);

            // Start the meal reminder scheduler
            console.log('Starting meal reminder scheduler...');
            startScheduler();
        });
    })
    .catch(err => {
        console.error('Failed to initialize database:', err);
        process.exit(1);
    });

module.exports = app;


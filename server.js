const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDatabase } = require('./database/db');

const app = express();
const PORT = process.env.PORT || 3000;

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

// Initialize database and start server
initDatabase()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`\n🚀 Mess Attendance System is running!`);
            console.log(`\n📍 Access points:`);
            console.log(`   Counter Screen: http://localhost:${PORT}/counter`);
            console.log(`   Admin Panel:    http://localhost:${PORT}/admin`);
            console.log(`   API:            http://localhost:${PORT}/api`);
            console.log(`\n✅ Server started on port ${PORT}\n`);
        });
    })
    .catch(err => {
        console.error('Failed to initialize database:', err);
        process.exit(1);
    });

module.exports = app;

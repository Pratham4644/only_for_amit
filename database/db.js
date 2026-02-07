const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

// Database file path
const DB_PATH = path.join(__dirname, 'mess_attendance.db');

// Initialize database
function initDatabase() {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(DB_PATH, (err) => {
            if (err) {
                console.error('Error opening database:', err);
                reject(err);
                return;
            }
            console.log('Connected to SQLite database');
            
            // Read and execute schema
            const schemaPath = path.join(__dirname, 'schema.sql');
            const schema = fs.readFileSync(schemaPath, 'utf8');
            
            db.exec(schema, (err) => {
                if (err) {
                    console.error('Error executing schema:', err);
                    reject(err);
                    return;
                }
                console.log('Database schema initialized successfully');
                resolve(db);
            });
        });
    });
}

// Get database connection
function getDatabase() {
    return new sqlite3.Database(DB_PATH, (err) => {
        if (err) {
            console.error('Error connecting to database:', err);
        }
    });
}

module.exports = {
    initDatabase,
    getDatabase
};

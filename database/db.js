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

            // First, run migrations to update existing schema
            runMigrations(db, (migErr) => {
                if (migErr) {
                    console.error('Error running migrations:', migErr);
                    reject(migErr);
                    return;
                }

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
    });
}

// Run database migrations
function runMigrations(db, callback) {
    // Check if room_number column exists
    db.all("PRAGMA table_info(students)", (err, columns) => {
        if (err) {
            console.error('Error checking table schema:', err);
            callback(err);
            return;
        }

        const hasRoomNumber = columns && columns.some(col => col.name === 'room_number');
        const hasStudentDept = columns && columns.some(col => col.name === 'student_department');

        if (hasRoomNumber && !hasStudentDept) {
            // Migrate room_number to student_department
            console.log('Migrating room_number to student_department...');
            db.run('ALTER TABLE students RENAME COLUMN room_number TO student_department', (err) => {
                if (err) {
                    console.error('Error migrating column:', err);
                    callback(err);
                    return;
                }
                console.log('Migration completed: room_number → student_department');
                callback(null);
            });
        } else if (!hasStudentDept && !hasRoomNumber) {
            // Column doesn't exist yet, schema will add it
            callback(null);
        } else {
            // Column already exists or no migration needed
            callback(null);
        }
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

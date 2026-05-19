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
    db.all("PRAGMA table_info(students)", (err, columns) => {
        if (err) {
            console.error('Error checking table schema:', err);
            callback(err);
            return;
        }

        const hasRoomNumber = columns && columns.some(col => col.name === 'room_number');
        const hasStudentDept = columns && columns.some(col => col.name === 'student_department');
        const hasJoinDate = columns && columns.some(col => col.name === 'join_date');
        const hasMessPrice = columns && columns.some(col => col.name === 'mess_price');

        // Step 1: Migrate room_number to student_department if needed
        const migrateRoomNumber = (next) => {
            if (hasRoomNumber && !hasStudentDept) {
                console.log('Migrating room_number to student_department...');
                db.run('ALTER TABLE students RENAME COLUMN room_number TO student_department', (err) => {
                    if (err) {
                        console.error('Error migrating column room_number:', err);
                        next(err);
                        return;
                    }
                    console.log('Migration completed: room_number → student_department');
                    next(null);
                });
            } else {
                next(null);
            }
        };

        // Step 2: Add join_date column if missing
        const migrateJoinDate = (next) => {
            if (!hasJoinDate) {
                console.log('Migrating: Adding join_date column to students table...');
                db.run('ALTER TABLE students ADD COLUMN join_date TEXT', (err) => {
                    if (err) {
                        console.error('Error adding join_date column:', err);
                        next(err);
                        return;
                    }
                    console.log('Migration completed: join_date column added successfully');
                    next(null);
                });
            } else {
                next(null);
            }
        };

        // Step 3: Add mess_price column if missing
        const migrateMessPrice = (next) => {
            if (!hasMessPrice) {
                console.log('Migrating: Adding mess_price column to students table...');
                db.run('ALTER TABLE students ADD COLUMN mess_price REAL', (err) => {
                    if (err) {
                        console.error('Error adding mess_price column:', err);
                        next(err);
                        return;
                    }
                    console.log('Migration completed: mess_price column added successfully');
                    
                    // Backfill mess_price values based on fee_settings or default plan fallback
                    console.log('Backfilling default mess_price values for existing students...');
                    db.run(`
                        UPDATE students 
                        SET mess_price = (
                            SELECT monthly_fee FROM fee_settings 
                            WHERE fee_settings.meal_plan = students.meal_plan
                        )
                        WHERE mess_price IS NULL
                    `, (err2) => {
                        if (err2) {
                            console.error('Warning backfilling mess_price from fee_settings:', err2);
                        }
                        
                        // Perform static fallbacks for safety if subquery returned NULL or fee_settings was missing rows
                        db.run(`
                            UPDATE students 
                            SET mess_price = CASE 
                                WHEN meal_plan = 'LUNCH_ONLY' THEN 1800.0
                                WHEN meal_plan = 'DINNER_ONLY' THEN 1500.0
                                ELSE 3000.0
                            END
                            WHERE mess_price IS NULL
                        `, (err3) => {
                            if (err3) {
                                console.error('Error in static backfill fallback:', err3);
                                next(err3);
                                return;
                            }
                            console.log('Static mess_price backfill completed successfully');
                            next(null);
                        });
                    });
                });
            } else {
                next(null);
            }
        };

        // Run migrations sequentially
        migrateRoomNumber((err) => {
            if (err) {
                callback(err);
                return;
            }
            migrateJoinDate((err) => {
                if (err) {
                    callback(err);
                    return;
                }
                migrateMessPrice((err) => {
                    callback(err);
                });
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

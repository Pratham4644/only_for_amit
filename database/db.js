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

                    // Cleanup old bills: keep only the most recent one for each student
                    db.run('DELETE FROM monthly_bills WHERE id NOT IN (SELECT MAX(id) FROM monthly_bills GROUP BY student_id)', (errClean) => {
                        if (errClean) {
                            console.error('Error cleaning up old bills:', errClean);
                        } else {
                            console.log('Cleaned up old monthly bills: only kept the most recent per student');
                        }
                        resolve(db);
                    });
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

        // Step 4: Add from_date and to_date columns to monthly_bills if missing
        const migrateMonthlyBills = (next) => {
            db.all("PRAGMA table_info(monthly_bills)", (err, columns) => {
                if (err) {
                    console.error('Error checking monthly_bills schema:', err);
                    next(err);
                    return;
                }

                const hasFromDate = columns && columns.some(col => col.name === 'from_date');
                const hasToDate = columns && columns.some(col => col.name === 'to_date');

                if (!hasFromDate || !hasToDate) {
                    console.log('Migrating: Adding from_date and to_date columns to monthly_bills...');
                    
                    const addFromDate = (cb) => {
                        if (!hasFromDate) {
                            db.run('ALTER TABLE monthly_bills ADD COLUMN from_date TEXT', cb);
                        } else {
                            cb(null);
                        }
                    };

                    const addToDate = (cb) => {
                        if (!hasToDate) {
                            db.run('ALTER TABLE monthly_bills ADD COLUMN to_date TEXT', cb);
                        } else {
                            cb(null);
                        }
                    };

                    addFromDate((err1) => {
                        if (err1) {
                            console.error('Error adding from_date column:', err1);
                            next(err1);
                            return;
                        }
                        addToDate((err2) => {
                            if (err2) {
                                console.error('Error adding to_date column:', err2);
                                next(err2);
                                return;
                            }
                            console.log('Columns added to monthly_bills. Backfilling existing rows...');
                            
                            // Backfill existing rows
                            db.all("SELECT id, month FROM monthly_bills WHERE from_date IS NULL", [], (err3, rows) => {
                                if (err3) {
                                    console.error('Error selecting bills for backfill:', err3);
                                    next(err3);
                                    return;
                                }

                                if (!rows || rows.length === 0) {
                                    next(null);
                                    return;
                                }

                                let pendingBackfill = rows.length;
                                rows.forEach(row => {
                                    if (/^\d{4}-\d{2}$/.test(row.month)) {
                                        const [yearStr, monthStr] = row.month.split('-');
                                        const y = parseInt(yearStr, 10);
                                        const m = parseInt(monthStr, 10);
                                        const lastDay = new Date(y, m, 0).getDate();
                                        const fromDate = `${row.month}-01`;
                                        const toDate = `${row.month}-${String(lastDay).padStart(2, '0')}`;

                                        db.run(
                                            "UPDATE monthly_bills SET from_date = ?, to_date = ? WHERE id = ?",
                                            [fromDate, toDate, row.id],
                                            (err4) => {
                                                if (err4) console.error(`Error backfilling bill ID ${row.id}:`, err4);
                                                if (--pendingBackfill === 0) {
                                                    console.log('Backfill of monthly_bills completed.');
                                                    next(null);
                                                }
                                            }
                                        );
                                    } else {
                                        if (--pendingBackfill === 0) {
                                            next(null);
                                        }
                                    }
                                });
                            });
                        });
                    });
                } else {
                    next(null);
                }
            });
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
                    if (err) {
                        callback(err);
                        return;
                    }
                    migrateMonthlyBills((err) => {
                        callback(err);
                    });
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

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Path to the database file
const DB_PATH = path.join(__dirname, 'database', 'mess_attendance.db');

console.log('🔄 Starting database migration...\n');

const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('❌ Error opening database:', err);
        process.exit(1);
    }
    console.log('✅ Connected to database\n');
});

// Check if phone_number column exists
db.all("PRAGMA table_info(students)", (err, columns) => {
    if (err) {
        console.error('❌ Error checking table structure:', err);
        db.close();
        process.exit(1);
    }

    const hasPhoneNumber = columns.some(col => col.name === 'phone_number');

    if (hasPhoneNumber) {
        console.log('✅ phone_number column already exists. No migration needed.');
        db.close();
        process.exit(0);
    }

    console.log('📝 Adding phone_number column to students table...');

    // Add the phone_number column
    db.run("ALTER TABLE students ADD COLUMN phone_number TEXT", (err) => {
        if (err) {
            console.error('❌ Error adding column:', err);
            db.close();
            process.exit(1);
        }

        console.log('✅ Successfully added phone_number column!');
        console.log('\n🎉 Migration completed successfully!\n');

        db.close();
        process.exit(0);
    });
});

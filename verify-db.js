const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'database', 'mess_attendance.db');

const db = new sqlite3.Database(DB_PATH);

db.all('PRAGMA table_info(students)', (err, cols) => {
    if (err) {
        console.error('Error:', err);
    } else {
        console.log('\n✅ Columns in students table:\n');
        cols.forEach(c => {
            console.log(`  - ${c.name.padEnd(20)} (${c.type})`);
        });
        console.log('');
    }
    db.close();
});

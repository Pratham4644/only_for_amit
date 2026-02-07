const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database', 'mess_attendance.db');
const db = new sqlite3.Database(dbPath);

console.log('Checking meal_timings table...\n');

// First, let's see what we have
db.all('SELECT * FROM meal_timings', [], (err, rows) => {
    if (err) {
        console.error('Error reading meal_timings:', err);
        db.close();
        return;
    }

    console.log('Current meal_timings entries:');
    console.log(JSON.stringify(rows, null, 2));
    console.log(`\nTotal entries: ${rows.length}\n`);

    // Count by meal type
    const lunchCount = rows.filter(r => r.meal_type === 'LUNCH').length;
    const dinnerCount = rows.filter(r => r.meal_type === 'DINNER').length;

    console.log(`LUNCH entries: ${lunchCount}`);
    console.log(`DINNER entries: ${dinnerCount}\n`);

    if (lunchCount > 1 || dinnerCount > 1) {
        console.log('⚠️  Duplicates found! Cleaning up...\n');

        // Keep only the first LUNCH and first DINNER entry, delete the rest
        db.serialize(() => {
            // Get IDs to keep
            const lunchId = rows.find(r => r.meal_type === 'LUNCH')?.id;
            const dinnerId = rows.find(r => r.meal_type === 'DINNER')?.id;

            console.log(`Keeping LUNCH id: ${lunchId}`);
            console.log(`Keeping DINNER id: ${dinnerId}\n`);

            // Delete all LUNCH entries except the first one
            if (lunchCount > 1) {
                db.run('DELETE FROM meal_timings WHERE meal_type = ? AND id != ?',
                    ['LUNCH', lunchId],
                    function (err) {
                        if (err) {
                            console.error('Error deleting duplicate LUNCH:', err);
                        } else {
                            console.log(`✓ Deleted ${this.changes} duplicate LUNCH entries`);
                        }
                    }
                );
            }

            // Delete all DINNER entries except the first one
            if (dinnerCount > 1) {
                db.run('DELETE FROM meal_timings WHERE meal_type = ? AND id != ?',
                    ['DINNER', dinnerId],
                    function (err) {
                        if (err) {
                            console.error('Error deleting duplicate DINNER:', err);
                        } else {
                            console.log(`✓ Deleted ${this.changes} duplicate DINNER entries`);
                        }
                    }
                );
            }

            // Verify the cleanup
            setTimeout(() => {
                db.all('SELECT * FROM meal_timings', [], (err, rows) => {
                    if (err) {
                        console.error('Error verifying cleanup:', err);
                    } else {
                        console.log('\n✅ Final meal_timings entries:');
                        console.log(JSON.stringify(rows, null, 2));
                        console.log(`\nTotal entries: ${rows.length}`);
                    }
                    db.close();
                });
            }, 500);
        });
    } else {
        console.log('✅ No duplicates found. Database is clean!');
        db.close();
    }
});

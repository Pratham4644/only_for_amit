'use strict';

/**
 * migrate-leave-credits.js
 *
 * One-time database migration for the Leave Credit System (v2.0).
 * Creates leave_requests and leave_credits tables if they don't exist.
 *
 * Usage:
 *   node migrate-leave-credits.js
 */

const sqlite3 = require('sqlite3').verbose();
const path    = require('path');

const DB_PATH = path.join(__dirname, 'database', 'mess_attendance.db');

const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('❌ Failed to open database:', err.message);
        process.exit(1);
    }
    console.log('📂 Connected to:', DB_PATH);
});

const migrations = [
    // ── leave_requests ──────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS leave_requests (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id    TEXT    NOT NULL,
        from_date     TEXT    NOT NULL,
        to_date       TEXT    NOT NULL,
        total_days    REAL    NOT NULL,
        month         TEXT    NOT NULL,
        is_half_day   INTEGER DEFAULT 0,
        half_day_meal TEXT,
        reason        TEXT,
        status        TEXT    DEFAULT 'PENDING',
        created_at    TEXT    DEFAULT (datetime('now')),
        updated_at    TEXT    DEFAULT (datetime('now')),
        FOREIGN KEY (student_id) REFERENCES students(student_id)
    )`,

    // ── leave_credits ────────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS leave_credits (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id       TEXT    NOT NULL,
        leave_month      TEXT    NOT NULL,
        credit_month     TEXT    NOT NULL,
        absent_days      REAL    NOT NULL,
        credit_days      REAL    NOT NULL,
        source           TEXT    DEFAULT 'auto',
        leave_request_id INTEGER,
        status           TEXT    DEFAULT 'PENDING',
        computed_at      TEXT    DEFAULT (datetime('now')),
        applied_at       TEXT,
        FOREIGN KEY (student_id) REFERENCES students(student_id),
        FOREIGN KEY (leave_request_id) REFERENCES leave_requests(id)
    )`,

    // ── Indexes ──────────────────────────────────────────────────────────────
    `CREATE INDEX IF NOT EXISTS idx_leave_requests_student
        ON leave_requests(student_id)`,
    `CREATE INDEX IF NOT EXISTS idx_leave_requests_month
        ON leave_requests(month)`,
    `CREATE INDEX IF NOT EXISTS idx_leave_requests_status
        ON leave_requests(status)`,
    `CREATE INDEX IF NOT EXISTS idx_leave_credits_student
        ON leave_credits(student_id)`,
    `CREATE INDEX IF NOT EXISTS idx_leave_credits_leave_month
        ON leave_credits(leave_month)`,
    `CREATE INDEX IF NOT EXISTS idx_leave_credits_credit_month
        ON leave_credits(credit_month)`,
    `CREATE INDEX IF NOT EXISTS idx_leave_credits_status
        ON leave_credits(status)`,

    // ── Unique constraint: one credit record per student per leave month ──────
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_leave_credits_unique
        ON leave_credits(student_id, leave_month)`,
];

db.serialize(() => {
    db.run('BEGIN TRANSACTION');

    let ok = true;
    migrations.forEach((sql, i) => {
        db.run(sql, (err) => {
            if (err) {
                console.error(`❌ Migration step ${i + 1} failed:`, err.message);
                ok = false;
            } else {
                console.log(`✅ Step ${i + 1} / ${migrations.length} done`);
            }
        });
    });

    db.run(ok ? 'COMMIT' : 'ROLLBACK', (err) => {
        if (err) console.error('❌ Transaction error:', err.message);
        else if (ok) console.log('\n✨ Migration completed successfully!');
        else console.error('\n❌ Migration rolled back due to errors.');

        db.close();
    });
});

'use strict';

/**
 * cron/monthly-leave-cron.js — CLI-based cron trigger for Leave Credits
 *
 * Usage:
 *   node cron/monthly-leave-cron.js compute 2026-04   ← auto+manual merged compute
 *   node cron/monthly-leave-cron.js apply   2026-05   ← apply pending credits
 *   node cron/monthly-leave-cron.js auto               ← detect action from today's date
 *
 * Schedule via Task Scheduler (Windows) or cron (Linux/Mac):
 *   Last day of month at 23:30 → compute
 *   1st of month  at 00:05    → apply
 */

const path    = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = path.join(__dirname, '..', 'database', 'mess_attendance.db');

const {
    mergeAndComputeFinal,
    saveCredits,
    applyCreditsToNextMonth,
    nextMonth,
} = require('../utils/leave-credit-logic');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getYM(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function isLastDayOfMonth(date = new Date()) {
    const next = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    return date.getDate() === next.getDate();
}

function openDB() {
    return new sqlite3.Database(DB_PATH, (err) => {
        if (err) { console.error('❌ Cannot open DB:', err.message); process.exit(1); }
    });
}

// ─── Actions ─────────────────────────────────────────────────────────────────

async function runCompute(ym) {
    console.log(`\n📊 Computing leave credits for ${ym} (merged mode)…`);
    const db = openDB();
    try {
        const results = await mergeAndComputeFinal(db, ym);
        const saved   = await saveCredits(db, ym, results);
        console.log(`✅ Computed ${results.length} qualifying students — ${saved} records saved.`);
        if (results.length > 0) {
            console.log('\nBreakdown:');
            results.forEach(r => {
                console.log(`  Student ${r.student_id}: ${r.absent_days} absent days → ${r.credit_days} credit days (${r.source})`);
            });
        } else {
            console.log('  No students qualified this month.');
        }
        console.log(`\n💡 Credits will be applied to ${nextMonth(ym)}`);
    } catch (err) {
        console.error('❌ Compute failed:', err.message);
        process.exit(1);
    } finally {
        db.close();
    }
}

async function runApply(ym) {
    console.log(`\n💰 Applying pending credits for credit_month: ${ym}…`);
    const db = openDB();
    try {
        const changed = await applyCreditsToNextMonth(db, ym);
        console.log(`✅ ${changed} credit record(s) marked as APPLIED for ${ym}.`);
    } catch (err) {
        console.error('❌ Apply failed:', err.message);
        process.exit(1);
    } finally {
        db.close();
    }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
    const [,, action, targetYM] = process.argv;

    if (action === 'compute') {
        if (!targetYM || !/^\d{4}-\d{2}$/.test(targetYM)) {
            console.error('Usage: node cron/monthly-leave-cron.js compute YYYY-MM');
            process.exit(1);
        }
        await runCompute(targetYM);

    } else if (action === 'apply') {
        if (!targetYM || !/^\d{4}-\d{2}$/.test(targetYM)) {
            console.error('Usage: node cron/monthly-leave-cron.js apply YYYY-MM');
            process.exit(1);
        }
        await runApply(targetYM);

    } else if (action === 'auto') {
        const today = new Date();
        if (isLastDayOfMonth(today)) {
            // Last day → compute last month's credits
            await runCompute(getYM(today));
        } else if (today.getDate() === 1) {
            // First day → apply this month's credits
            await runApply(getYM(today));
        } else {
            console.log(`ℹ️  Today (${today.toDateString()}) is neither the 1st nor the last day of the month.`);
            console.log('   No action taken. Run with "compute YYYY-MM" or "apply YYYY-MM" manually.');
        }

    } else {
        console.log(`
Leave Credit Cron Runner
────────────────────────
Usage:
  node cron/monthly-leave-cron.js compute YYYY-MM   Compute merged credits for a month
  node cron/monthly-leave-cron.js apply   YYYY-MM   Apply pending credits to billing
  node cron/monthly-leave-cron.js auto               Auto-detect action from today's date

Examples:
  node cron/monthly-leave-cron.js compute 2026-04
  node cron/monthly-leave-cron.js apply   2026-05
  node cron/monthly-leave-cron.js auto
        `.trim());
        process.exit(1);
    }
}

main().catch(err => {
    console.error('Unhandled error:', err);
    process.exit(1);
});

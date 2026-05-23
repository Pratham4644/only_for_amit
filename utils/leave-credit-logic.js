/**
 * Leave Credit Logic — utils/leave-credit-logic.js
 *
 * All pure business logic for the Leave Credit System (v2.0).
 * Supports automatic (attendance scan gap) and manual (admin entry) modes.
 * Half-day (0.5) and full-day (1.0) credits. Minimum threshold: 4.0 days.
 *
 * NOTE: This file uses the callback-based sqlite3 API (not better-sqlite3).
 */

'use strict';

const { getDatabase } = require('../database/db');

// ─────────────────────────────────────────────
// HELPER
// ─────────────────────────────────────────────

/**
 * Compute the credit month (the month after the leave month).
 * @param {string} ym  e.g. "2026-04"
 * @returns {string}   e.g. "2026-05"
 */
function nextMonth(ym) {
    const [year, month] = ym.split('-').map(Number);
    const d = new Date(year, month, 1); // month is already 1-indexed, so passing it gives next month
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Count calendar days between two Date objects (inclusive).
 */
function daysBetween(from, to) {
    let count = 0;
    const cur = new Date(from);
    while (cur <= to) {
        count++;
        cur.setDate(cur.getDate() + 1);
    }
    return count;
}

// ─────────────────────────────────────────────
// AUTO MODE — scan attendance gaps
// ─────────────────────────────────────────────

/**
 * Automatically compute absent days from the attendance table.
 * Supports full-day (1.0) and half-day (0.5) credits.
 *
 * @param {object} db   - sqlite3 Database instance
 * @param {string} ym   - Month to compute, format: "YYYY-MM"
 * @returns {Promise<Array>}  Array of { student_id, month, absent_days, credit_days, source }
 */
function computeMonthlyCredits(db, ym) {
    return new Promise((resolve, reject) => {
        const [year, month] = ym.split('-').map(Number);
        const daysInMonth = new Date(year, month, 0).getDate();

        // Get all active students with their meal plans
        db.all(`SELECT student_id, meal_plan FROM students WHERE active = 1`, [], (err, students) => {
            if (err) return reject(err);
            if (!students || students.length === 0) return resolve([]);

            const results = [];
            let pending = students.length;

            students.forEach(student => {
                // Build a list of dates to check for this student
                const datesToCheck = [];
                for (let day = 1; day <= daysInMonth; day++) {
                    datesToCheck.push(`${ym}-${String(day).padStart(2, '0')}`);
                }

                // Fetch all attendance records for this student in the month at once
                db.all(
                    `SELECT date, meal_type FROM attendance
                     WHERE student_id = ? AND date BETWEEN ? AND ?`,
                    [student.student_id, `${ym}-01`, `${ym}-${String(daysInMonth).padStart(2, '0')}`],
                    (err2, records) => {
                        if (err2) {
                            // Don't fail entirely — skip this student
                            console.error(`Error fetching attendance for ${student.student_id}:`, err2.message);
                            if (--pending === 0) resolve(results);
                            return;
                        }

                        // Build a Set for quick lookup: "YYYY-MM-DD|MEAL"
                        const scanSet = new Set();
                        (records || []).forEach(r => {
                            scanSet.add(`${r.date}|${r.meal_type.toUpperCase()}`);
                        });

                        let totalCredit = 0;
                        const plan = student.meal_plan || 'FULL';

                        datesToCheck.forEach(dateStr => {
                            const hasLunch  = scanSet.has(`${dateStr}|LUNCH`);
                            const hasDinner = scanSet.has(`${dateStr}|DINNER`);

                            if (plan === 'FULL') {
                                if (!hasLunch && !hasDinner) {
                                    totalCredit += 1.0; // Full absent day
                                } else if (!hasLunch || !hasDinner) {
                                    totalCredit += 0.5; // Half-day absent
                                }
                            } else if (plan === 'LUNCH_ONLY') {
                                if (!hasLunch) totalCredit += 1.0;
                            } else if (plan === 'DINNER_ONLY') {
                                if (!hasDinner) totalCredit += 1.0;
                            }
                        });

                        if (totalCredit >= 4) {
                            results.push({
                                student_id:  student.student_id,
                                month:       ym,
                                absent_days: totalCredit,
                                credit_days: Math.min(totalCredit, daysInMonth),
                                source:      'auto',
                            });
                        }

                        if (--pending === 0) resolve(results);
                    }
                );
            });
        });
    });
}

// ─────────────────────────────────────────────
// MANUAL MODE — approved leave requests
// ─────────────────────────────────────────────

/**
 * Compute credits from manually approved leave requests.
 * Handles full-day and half-day requests.
 *
 * @param {object} db   - sqlite3 Database instance
 * @param {string} ym   - Month in format "YYYY-MM"
 * @returns {Promise<Array>}
 */
function computeManualLeaveCredits(db, ym) {
    return new Promise((resolve, reject) => {
        db.all(
            `SELECT * FROM leave_requests WHERE month = ? AND status = 'APPROVED'`,
            [ym],
            (err, leaves) => {
                if (err) return reject(err);
                if (!leaves || leaves.length === 0) return resolve([]);

                const results = [];

                leaves.forEach(leave => {
                    let totalDays = 0;

                    if (leave.is_half_day) {
                        // Single day, one meal missed → 0.5
                        totalDays = 0.5;
                    } else {
                        // Count each calendar day in the range
                        totalDays = daysBetween(new Date(leave.from_date), new Date(leave.to_date));
                    }

                    results.push({
                        student_id:       leave.student_id,
                        month:            ym,
                        absent_days:      totalDays,
                        credit_days:      totalDays,
                        source:           'manual',
                        leave_request_id: leave.id,
                    });
                });

                resolve(results);
            }
        );
    });
}

// ─────────────────────────────────────────────
// MERGE — auto + manual without double-counting
// ─────────────────────────────────────────────

/**
 * Merge automatic and manual absent days.
 * For students with both sources, takes the MAX of the two totals
 * (because auto already counted the real gaps; manual is the declared leave).
 * A full per-date deduplication requires iterating both sets, but since
 * this project stores aggregate totals — not per-date breakdowns — we take
 * the higher of the two values (safe for the majority of real-world cases).
 *
 * Students who only have one source get that source's total.
 * Returns only students with combined absent_days >= 4.
 *
 * @param {object} db   - sqlite3 Database instance
 * @param {string} ym   - Month in format "YYYY-MM"
 * @returns {Promise<Array>}
 */
function mergeAndComputeFinal(db, ym) {
    return new Promise(async (resolve, reject) => {
        try {
            const [autoResults, manualResults] = await Promise.all([
                computeMonthlyCredits(db, ym),
                computeManualLeaveCredits(db, ym),
            ]);

            const merged = {};

            // Index auto results by student_id
            for (const r of autoResults) {
                merged[r.student_id] = { ...r, source: 'auto' };
            }

            // Merge manual — take the MAX of overlapping totals to avoid double-count
            for (const r of manualResults) {
                if (merged[r.student_id]) {
                    const combined = Math.max(merged[r.student_id].absent_days, r.absent_days);
                    merged[r.student_id].absent_days = combined;
                    merged[r.student_id].credit_days = combined;
                    merged[r.student_id].source = 'merged';
                } else {
                    merged[r.student_id] = { ...r, source: 'manual' };
                }
            }

            const qualifiedStudents = Object.values(merged).filter(r => r.absent_days >= 4);
            resolve(qualifiedStudents);
        } catch (err) {
            reject(err);
        }
    });
}

// ─────────────────────────────────────────────
// APPLY — write credits to leave_credits table
// ─────────────────────────────────────────────

/**
 * Save computed results into the leave_credits table.
 * Existing records for the same (student_id, leave_month) are replaced.
 *
 * @param {object} db       - sqlite3 Database instance
 * @param {string} ym       - Leave month (YYYY-MM)
 * @param {Array}  results  - Output of mergeAndComputeFinal / computeMonthlyCredits
 * @returns {Promise<number>} - Number of rows inserted/replaced
 */
function saveCredits(db, ym, results) {
    return new Promise((resolve, reject) => {
        if (!results || results.length === 0) return resolve(0);

        const creditMonth = nextMonth(ym);
        const now = new Date().toISOString();
        let saved = 0;

        const stmt = `
            INSERT OR REPLACE INTO leave_credits
              (student_id, leave_month, credit_month, absent_days, credit_days,
               source, leave_request_id, status, computed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)
        `;

        let pending = results.length;

        results.forEach(r => {
            db.run(stmt, [
                r.student_id,
                ym,
                creditMonth,
                r.absent_days,
                r.credit_days,
                r.source || 'auto',
                r.leave_request_id || null,
                now,
            ], function (err) {
                if (!err) saved++;
                if (--pending === 0) resolve(saved);
            });
        });
    });
}

/**
 * Mark PENDING credits for a given credit_month as APPLIED.
 * Called at the start of each month to activate the prior month's credits.
 *
 * @param {object} db  - sqlite3 Database instance
 * @param {string} ym  - credit_month (YYYY-MM) to apply
 * @returns {Promise<number>} - Number of records updated
 */
function applyCreditsToNextMonth(db, ym) {
    return new Promise((resolve, reject) => {
        const now = new Date().toISOString();
        db.run(
            `UPDATE leave_credits
             SET status = 'APPLIED', applied_at = ?
             WHERE credit_month = ? AND status = 'PENDING'`,
            [now, ym],
            function (err) {
                if (err) return reject(err);
                resolve(this.changes);
            }
        );
    });
}

// ─────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────

module.exports = {
    nextMonth,
    computeMonthlyCredits,
    computeManualLeaveCredits,
    mergeAndComputeFinal,
    saveCredits,
    applyCreditsToNextMonth,
};

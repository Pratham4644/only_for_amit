'use strict';

/**
 * routes/leave.js — Leave Credit System REST API
 *
 * Mount with: app.use('/api/leave', require('./routes/leave'));
 *
 * Endpoints:
 *   POST   /api/leave/request                        — Submit leave request
 *   GET    /api/leave/requests                       — All requests (admin)
 *   GET    /api/leave/requests/:studentId            — One student's requests
 *   PUT    /api/leave/requests/:id/approve           — Approve (admin)
 *   PUT    /api/leave/requests/:id/reject            — Reject  (admin)
 *   DELETE /api/leave/requests/:id                   — Cancel pending
 *
 *   GET    /api/leave/credits                        — All credit records
 *   GET    /api/leave/credits/student/:studentId     — Student balance + history
 *   GET    /api/leave/credits/month/:ym              — Month summary
 *   POST   /api/leave/credits/compute/:ym            — Auto computation
 *   POST   /api/leave/credits/compute-manual/:ym     — Manual computation
 *   POST   /api/leave/credits/compute-merged/:ym     — Merged computation
 *   POST   /api/leave/credits/apply/:ym              — Apply PENDING credits
 */

const express = require('express');
const router  = express.Router();
const { getDatabase } = require('../database/db');
const {
    computeMonthlyCredits,
    computeManualLeaveCredits,
    mergeAndComputeFinal,
    saveCredits,
    applyCreditsToNextMonth,
    nextMonth,
} = require('../utils/leave-credit-logic');

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Validate YYYY-MM-DD date string */
function isValidDate(str) {
    return /^\d{4}-\d{2}-\d{2}$/.test(str) && !isNaN(Date.parse(str));
}

/** Validate YYYY-MM month string */
function isValidYM(str) {
    return /^\d{4}-\d{2}$/.test(str);
}

/** Extract "YYYY-MM" from "YYYY-MM-DD" */
function toYM(dateStr) {
    return dateStr.slice(0, 7);
}

/**
 * Calculate total_days for a leave request.
 * Half-day → 0.5, otherwise count calendar days in range.
 */
function calcTotalDays(fromDate, toDate, isHalfDay) {
    if (isHalfDay) return 0.5;
    const from = new Date(fromDate);
    const to   = new Date(toDate);
    let count  = 0;
    const cur  = new Date(from);
    while (cur <= to) { count++; cur.setDate(cur.getDate() + 1); }
    return count;
}

// ─────────────────────────────────────────────────────────────────────────────
// LEAVE REQUESTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/leave/request
 * Body: { student_id, from_date, to_date, is_half_day?, half_day_meal?, reason? }
 */
router.post('/request', (req, res) => {
    const { student_id, from_date, to_date, reason } = req.body;
    const is_half_day  = req.body.is_half_day  ? 1 : 0;
    const half_day_meal = req.body.half_day_meal || null;

    if (!student_id || !from_date || !to_date) {
        return res.status(400).json({ error: 'student_id, from_date and to_date are required' });
    }
    if (!isValidDate(from_date) || !isValidDate(to_date)) {
        return res.status(400).json({ error: 'Dates must be in YYYY-MM-DD format' });
    }
    if (from_date > to_date) {
        return res.status(400).json({ error: 'from_date must be ≤ to_date' });
    }

    // Enforce single-month constraint
    if (toYM(from_date) !== toYM(to_date)) {
        return res.status(400).json({
            error: 'Leave request must be within a single calendar month. Split multi-month requests.'
        });
    }

    if (is_half_day && from_date !== to_date) {
        return res.status(400).json({ error: 'Half-day requests must be for a single day (from_date = to_date)' });
    }

    if (is_half_day && !['lunch', 'dinner'].includes((half_day_meal || '').toLowerCase())) {
        return res.status(400).json({ error: 'half_day_meal must be "lunch" or "dinner" for half-day requests' });
    }

    const month      = toYM(from_date);
    const total_days = calcTotalDays(from_date, to_date, is_half_day);
    const db         = getDatabase();

    // Verify student exists
    db.get('SELECT student_id, name FROM students WHERE student_id = ?', [student_id], (err, student) => {
        if (err)       { db.close(); return res.status(500).json({ error: err.message }); }
        if (!student)  { db.close(); return res.status(404).json({ error: `Student ${student_id} not found` }); }

        db.run(
            `INSERT INTO leave_requests
               (student_id, from_date, to_date, total_days, month,
                is_half_day, half_day_meal, reason, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
            [student_id, from_date, to_date, total_days, month,
             is_half_day, half_day_meal, reason || null],
            function (err2) {
                db.close();
                if (err2) return res.status(500).json({ error: err2.message });
                res.status(201).json({
                    success:     true,
                    id:          this.lastID,
                    student_id,
                    student_name: student.name,
                    from_date,
                    to_date,
                    total_days,
                    month,
                    is_half_day: !!is_half_day,
                    half_day_meal,
                    status:      'PENDING',
                });
            }
        );
    });
});

/**
 * GET /api/leave/requests
 * Query params: ?status=PENDING|APPROVED|REJECTED&month=YYYY-MM
 */
router.get('/requests', (req, res) => {
    const { status, month } = req.query;
    const db = getDatabase();

    let sql    = `SELECT lr.*, s.name as student_name FROM leave_requests lr
                  LEFT JOIN students s ON lr.student_id = s.student_id WHERE 1=1`;
    const params = [];

    if (status) { sql += ' AND lr.status = ?';   params.push(status.toUpperCase()); }
    if (month)  { sql += ' AND lr.month = ?';    params.push(month); }

    sql += ' ORDER BY lr.created_at DESC';

    db.all(sql, params, (err, rows) => {
        db.close();
        if (err) return res.status(500).json({ error: err.message });
        res.json({ requests: rows || [], count: (rows || []).length });
    });
});

/**
 * GET /api/leave/requests/:studentId
 */
router.get('/requests/:studentId', (req, res) => {
    const db = getDatabase();
    db.all(
        `SELECT * FROM leave_requests WHERE student_id = ? ORDER BY created_at DESC`,
        [req.params.studentId],
        (err, rows) => {
            db.close();
            if (err) return res.status(500).json({ error: err.message });
            res.json({ student_id: req.params.studentId, requests: rows || [] });
        }
    );
});

/**
 * PUT /api/leave/requests/:id/approve
 */
router.put('/requests/:id/approve', (req, res) => {
    const db  = getDatabase();
    const now = new Date().toISOString();

    // First fetch the request to know the month
    db.get('SELECT * FROM leave_requests WHERE id = ?', [req.params.id], (err, leave) => {
        if (err)   { db.close(); return res.status(500).json({ error: err.message }); }
        if (!leave){ db.close(); return res.status(404).json({ error: 'Leave request not found' }); }
        if (leave.status !== 'PENDING') {
            db.close();
            return res.status(400).json({ error: `Cannot approve a request with status: ${leave.status}` });
        }

        db.run(
            `UPDATE leave_requests SET status = 'APPROVED', updated_at = ? WHERE id = ?`,
            [now, req.params.id],
            function (err2) {
                db.close();
                if (err2) return res.status(500).json({ error: err2.message });
                res.json({
                    success:      true,
                    id:           Number(req.params.id),
                    student_id:   leave.student_id,
                    month:        leave.month,
                    credit_month: nextMonth(leave.month),
                    days_credited: leave.total_days,
                    status:       'APPROVED',
                });
            }
        );
    });
});

/**
 * PUT /api/leave/requests/:id/reject
 */
router.put('/requests/:id/reject', (req, res) => {
    const db  = getDatabase();
    const now = new Date().toISOString();

    db.get('SELECT status FROM leave_requests WHERE id = ?', [req.params.id], (err, leave) => {
        if (err)    { db.close(); return res.status(500).json({ error: err.message }); }
        if (!leave) { db.close(); return res.status(404).json({ error: 'Leave request not found' }); }
        if (leave.status !== 'PENDING') {
            db.close();
            return res.status(400).json({ error: `Cannot reject a request with status: ${leave.status}` });
        }

        db.run(
            `UPDATE leave_requests SET status = 'REJECTED', updated_at = ? WHERE id = ?`,
            [now, req.params.id],
            function (err2) {
                db.close();
                if (err2) return res.status(500).json({ error: err2.message });
                res.json({ success: true, id: Number(req.params.id), status: 'REJECTED' });
            }
        );
    });
});

/**
 * DELETE /api/leave/requests/:id
 * Only PENDING requests can be cancelled.
 */
router.delete('/requests/:id', (req, res) => {
    const db = getDatabase();
    db.get('SELECT status FROM leave_requests WHERE id = ?', [req.params.id], (err, leave) => {
        if (err)    { db.close(); return res.status(500).json({ error: err.message }); }
        if (!leave) { db.close(); return res.status(404).json({ error: 'Leave request not found' }); }
        if (leave.status !== 'PENDING') {
            db.close();
            return res.status(400).json({ error: 'Only PENDING requests can be deleted' });
        }

        db.run('DELETE FROM leave_requests WHERE id = ?', [req.params.id], function (err2) {
            db.close();
            if (err2) return res.status(500).json({ error: err2.message });
            res.json({ success: true, deleted: this.changes });
        });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// LEAVE CREDITS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/leave/credits
 * Query: ?status=PENDING|APPLIED&month=YYYY-MM
 */
router.get('/credits', (req, res) => {
    const { status, month } = req.query;
    const db = getDatabase();

    let sql    = `SELECT lc.*, s.name as student_name
                  FROM leave_credits lc
                  LEFT JOIN students s ON lc.student_id = s.student_id
                  WHERE 1=1`;
    const params = [];

    if (status) { sql += ' AND lc.status = ?';        params.push(status.toUpperCase()); }
    if (month)  { sql += ' AND lc.leave_month = ?';   params.push(month); }

    sql += ' ORDER BY lc.computed_at DESC';

    db.all(sql, params, (err, rows) => {
        db.close();
        if (err) return res.status(500).json({ error: err.message });
        res.json({ credits: rows || [], count: (rows || []).length });
    });
});

/**
 * GET /api/leave/credits/student/:studentId
 * Returns full history + current_balance (sum of APPLIED credit_days not yet settled).
 *
 * NOTE: Must be defined BEFORE /credits/:studentId to avoid route clash.
 */
router.get('/credits/student/:studentId', (req, res) => {
    const db = getDatabase();
    const sid = req.params.studentId;

    db.all(
        `SELECT * FROM leave_credits WHERE student_id = ? ORDER BY leave_month DESC`,
        [sid],
        (err, rows) => {
            if (err) { db.close(); return res.status(500).json({ error: err.message }); }

            // Sum all APPLIED credits as current balance
            const balance = (rows || [])
                .filter(r => r.status === 'APPLIED')
                .reduce((sum, r) => sum + r.credit_days, 0);

            const pending = (rows || [])
                .filter(r => r.status === 'PENDING')
                .reduce((sum, r) => sum + r.credit_days, 0);

            db.close();
            res.json({
                student_id:      sid,
                current_balance: balance,
                pending_credits: pending,
                history:         rows || [],
            });
        }
    );
});

/**
 * GET /api/leave/credits/month/:ym
 * Summary of all credits for a leave month (YYYY-MM).
 */
router.get('/credits/month/:ym', (req, res) => {
    const { ym } = req.params;
    if (!isValidYM(ym)) return res.status(400).json({ error: 'Month must be YYYY-MM' });

    const db = getDatabase();
    db.all(
        `SELECT lc.*, s.name as student_name
         FROM leave_credits lc
         LEFT JOIN students s ON lc.student_id = s.student_id
         WHERE lc.leave_month = ?
         ORDER BY lc.credit_days DESC`,
        [ym],
        (err, rows) => {
            db.close();
            if (err) return res.status(500).json({ error: err.message });

            const totalCredits = (rows || []).reduce((s, r) => s + r.credit_days, 0);
            res.json({
                leave_month:   ym,
                credit_month:  nextMonth(ym),
                students:      rows || [],
                count:         (rows || []).length,
                total_credits: totalCredits,
            });
        }
    );
});

/**
 * POST /api/leave/credits/compute/:ym
 * Trigger automatic credit computation from attendance gaps.
 */
router.post('/credits/compute/:ym', async (req, res) => {
    const { ym } = req.params;
    if (!isValidYM(ym)) return res.status(400).json({ error: 'Month must be YYYY-MM' });

    const db = getDatabase();
    try {
        const results = await computeMonthlyCredits(db, ym);
        const saved   = await saveCredits(db, ym, results);
        db.close();
        res.json({
            success:      true,
            mode:         'auto',
            month:        ym,
            credit_month: nextMonth(ym),
            students:     results,
            saved,
        });
    } catch (err) {
        db.close();
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/leave/credits/compute-manual/:ym
 * Trigger credit computation from approved manual leave requests.
 */
router.post('/credits/compute-manual/:ym', async (req, res) => {
    const { ym } = req.params;
    if (!isValidYM(ym)) return res.status(400).json({ error: 'Month must be YYYY-MM' });

    const db = getDatabase();
    try {
        const results = await computeManualLeaveCredits(db, ym);
        const saved   = await saveCredits(db, ym, results);
        db.close();
        res.json({
            success:      true,
            mode:         'manual',
            month:        ym,
            credit_month: nextMonth(ym),
            students:     results,
            saved,
        });
    } catch (err) {
        db.close();
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/leave/credits/compute-merged/:ym
 * Trigger merged (auto + manual) credit computation.
 */
router.post('/credits/compute-merged/:ym', async (req, res) => {
    const { ym } = req.params;
    if (!isValidYM(ym)) return res.status(400).json({ error: 'Month must be YYYY-MM' });

    const db = getDatabase();
    try {
        const results = await mergeAndComputeFinal(db, ym);
        const saved   = await saveCredits(db, ym, results);
        db.close();
        res.json({
            success:      true,
            mode:         'merged',
            month:        ym,
            credit_month: nextMonth(ym),
            students:     results,
            saved,
        });
    } catch (err) {
        db.close();
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/leave/credits/apply/:ym
 * Mark all PENDING credits for the given credit_month as APPLIED.
 */
router.post('/credits/apply/:ym', async (req, res) => {
    const { ym } = req.params;
    if (!isValidYM(ym)) return res.status(400).json({ error: 'Month must be YYYY-MM' });

    const db = getDatabase();
    try {
        const changed = await applyCreditsToNextMonth(db, ym);
        db.close();
        res.json({
            success:      true,
            credit_month: ym,
            applied:      changed,
        });
    } catch (err) {
        db.close();
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;

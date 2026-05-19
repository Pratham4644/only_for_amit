'use strict';

/**
 * routes/payments.js — Payment Tracking System REST API
 *
 * Mount with: app.use('/api/payments', require('./routes/payments'));
 *
 * Endpoints:
 *   GET  /api/payments/fee-settings
 *   PUT  /api/payments/fee-settings
 *
 *   POST /api/payments/bills/generate
 *   GET  /api/payments/bills/:studentId
 *   GET  /api/payments/bills/:studentId/:month
 *
 *   POST   /api/payments/add
 *   GET    /api/payments/history/:studentId
 *   DELETE /api/payments/record/:id
 *
 *   GET /api/payments/balance/:studentId
 *   GET /api/payments/unpaid-current-month
 */

const express = require('express');
const router  = express.Router();
const { getDatabase } = require('../database/db');

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function isValidDate(str) {
    return /^\d{4}-\d{2}-\d{2}$/.test(str) && !isNaN(Date.parse(str));
}

function isValidYM(str) {
    return /^\d{4}-\d{2}$/.test(str);
}

/** Number of days in a given YYYY-MM month */
function daysInMonth(ym) {
    const [year, month] = ym.split('-').map(Number);
    return new Date(year, month, 0).getDate();
}

/** Current month as YYYY-MM */
function currentYM() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// FEE SETTINGS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/payments/fee-settings
 * Returns all fee_settings rows.
 */
router.get('/fee-settings', (req, res) => {
    const db = getDatabase();
    db.all('SELECT * FROM fee_settings ORDER BY meal_plan', [], (err, rows) => {
        db.close();
        if (err) return res.status(500).json({ success: false, error: 'DB_ERROR', message: err.message });
        res.json({ success: true, data: rows || [] });
    });
});

/**
 * PUT /api/payments/fee-settings
 * Body: array of { meal_plan, monthly_fee, vacation_threshold_days }
 */
router.put('/fee-settings', (req, res) => {
    const settings = req.body;
    if (!Array.isArray(settings) || settings.length === 0) {
        return res.status(400).json({ success: false, error: 'INVALID_INPUT', message: 'Body must be an array of fee settings' });
    }

    const db = getDatabase();
    let pending = settings.length;
    const errors = [];

    function finish() {
        if (errors.length > 0) {
            db.close();
            return res.status(400).json({ success: false, error: 'UPDATE_FAILED', message: errors.join('; ') });
        }
        db.all('SELECT * FROM fee_settings ORDER BY meal_plan', [], (err2, rows) => {
            db.close();
            if (err2) return res.status(500).json({ success: false, error: 'DB_ERROR', message: err2.message });
            res.json({ success: true, data: rows || [] });
        });
    }

    settings.forEach(s => {
        const { meal_plan, monthly_fee, vacation_threshold_days } = s;

        if (!meal_plan || !['FULL', 'LUNCH_ONLY', 'DINNER_ONLY'].includes(meal_plan)) {
            errors.push(`Invalid meal_plan: ${meal_plan}`);
            if (--pending === 0) finish();
            return;
        }
        const fee = parseFloat(monthly_fee);
        if (isNaN(fee) || fee <= 0) {
            errors.push(`monthly_fee must be > 0 for ${meal_plan}`);
            if (--pending === 0) finish();
            return;
        }
        const thresh = parseInt(vacation_threshold_days, 10);
        if (isNaN(thresh) || thresh < 0) {
            errors.push(`vacation_threshold_days must be >= 0 for ${meal_plan}`);
            if (--pending === 0) finish();
            return;
        }

        db.run(
            `INSERT INTO fee_settings (meal_plan, monthly_fee, vacation_threshold_days, updated_at)
             VALUES (?, ?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(meal_plan) DO UPDATE SET
               monthly_fee             = excluded.monthly_fee,
               vacation_threshold_days = excluded.vacation_threshold_days,
               updated_at              = CURRENT_TIMESTAMP`,
            [meal_plan, fee, thresh],
            (err) => {
                if (err) errors.push(err.message);
                if (--pending === 0) finish();
            }
        );
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// MONTHLY BILLS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/payments/bills/generate
 * Body: { student_id, month (YYYY-MM), absent_days, notes? }
 */
router.post('/bills/generate', (req, res) => {
    const { student_id, month, notes } = req.body;
    const absent_days = parseFloat(req.body.absent_days) || 0;

    if (!student_id || !month) {
        return res.status(400).json({ success: false, error: 'MISSING_FIELDS', message: 'student_id and month are required' });
    }
    if (!isValidYM(month)) {
        return res.status(400).json({ success: false, error: 'INVALID_MONTH', message: 'month must be YYYY-MM' });
    }
    if (absent_days < 0) {
        return res.status(400).json({ success: false, error: 'INVALID_ABSENT_DAYS', message: 'absent_days must be >= 0' });
    }
    // absent_days must be in 0.5 increments (half-days allowed)
    if ((absent_days * 2) % 1 !== 0) {
        return res.status(400).json({ success: false, error: 'INVALID_ABSENT_DAYS', message: 'absent_days must be in 0.5 increments' });
    }

    const db = getDatabase();

    db.get('SELECT * FROM students WHERE student_id = ?', [student_id], (err, student) => {
        if (err)      { db.close(); return res.status(500).json({ success: false, error: 'DB_ERROR', message: err.message }); }
        if (!student) { db.close(); return res.status(404).json({ success: false, error: 'STUDENT_NOT_FOUND', message: `Student ${student_id} not found` }); }

        db.get('SELECT * FROM fee_settings WHERE meal_plan = ?', [student.meal_plan], (err2, fee) => {
            if (err2) { db.close(); return res.status(500).json({ success: false, error: 'DB_ERROR', message: err2.message }); }
            if (!fee) { db.close(); return res.status(404).json({ success: false, error: 'FEE_NOT_FOUND', message: `No fee settings found for plan ${student.meal_plan}` }); }

            const totalDays = daysInMonth(month);  // actual calendar days (28/30/31)
            const baseFee   = (student.mess_price !== null && student.mess_price !== undefined) ? student.mess_price : fee.monthly_fee;
            const threshold = fee.vacation_threshold_days;

            /*
             * BILL CALCULATION LOGIC:
             *   per_day_rate = base_fee / total_days_in_month
             *   IF absent_days > threshold (STRICT >):
             *       deduction = round(per_day_rate × absent_days, 2)
             *   ELSE: deduction = 0 (student pays full fee)
             *   final_bill = max(0, base_fee - deduction)
             */
            let deduction = 0;
            if (absent_days > threshold) {
                const perDay = baseFee / totalDays;
                deduction = Math.round(perDay * absent_days * 100) / 100;
            }
            const finalBill = Math.max(0, Math.round((baseFee - deduction) * 100) / 100);

            db.run(
                `INSERT INTO monthly_bills
                   (student_id, month, meal_plan, base_fee, total_days_in_month,
                    absent_days, vacation_threshold_days, deduction, final_bill, notes, generated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                 ON CONFLICT(student_id, month) DO UPDATE SET
                   meal_plan               = excluded.meal_plan,
                   base_fee                = excluded.base_fee,
                   total_days_in_month     = excluded.total_days_in_month,
                   absent_days             = excluded.absent_days,
                   vacation_threshold_days = excluded.vacation_threshold_days,
                   deduction               = excluded.deduction,
                   final_bill              = excluded.final_bill,
                   notes                   = excluded.notes,
                   generated_at            = CURRENT_TIMESTAMP`,
                [student_id, month, student.meal_plan, baseFee, totalDays,
                 absent_days, threshold, deduction, finalBill, notes || null],
                function (err3) {
                    if (err3) { db.close(); return res.status(500).json({ success: false, error: 'DB_ERROR', message: err3.message }); }

                    db.get('SELECT * FROM monthly_bills WHERE student_id = ? AND month = ?', [student_id, month], (err4, bill) => {
                        db.close();
                        if (err4) return res.status(500).json({ success: false, error: 'DB_ERROR', message: err4.message });
                        res.json({ success: true, data: bill });
                    });
                }
            );
        });
    });
});

/**
 * GET /api/payments/bills/:studentId
 * All monthly bills for a student, newest first.
 */
router.get('/bills/:studentId', (req, res) => {
    const db = getDatabase();
    db.all(
        'SELECT * FROM monthly_bills WHERE student_id = ? ORDER BY month DESC',
        [req.params.studentId],
        (err, rows) => {
            db.close();
            if (err) return res.status(500).json({ success: false, error: 'DB_ERROR', message: err.message });
            res.json({ success: true, student_id: req.params.studentId, data: rows || [] });
        }
    );
});

/**
 * GET /api/payments/bills/:studentId/:month
 * Single bill for student + month (YYYY-MM).
 */
router.get('/bills/:studentId/:month', (req, res) => {
    const { studentId, month } = req.params;
    if (!isValidYM(month)) return res.status(400).json({ success: false, error: 'INVALID_MONTH', message: 'month must be YYYY-MM' });

    const db = getDatabase();
    db.get('SELECT * FROM monthly_bills WHERE student_id = ? AND month = ?', [studentId, month], (err, row) => {
        db.close();
        if (err)  return res.status(500).json({ success: false, error: 'DB_ERROR', message: err.message });
        if (!row) return res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Bill not found for this student and month' });
        res.json({ success: true, data: row });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// PAYMENT RECORDS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/payments/add
 * Body: { student_id, payment_date, amount, payment_mode, reference_note? }
 */
router.post('/add', (req, res) => {
    const { student_id, payment_date, payment_mode, reference_note } = req.body;
    const amount = parseFloat(req.body.amount);

    if (!student_id || !payment_date || !req.body.amount || !payment_mode) {
        return res.status(400).json({ success: false, error: 'MISSING_FIELDS', message: 'student_id, payment_date, amount and payment_mode are required' });
    }
    if (!isValidDate(payment_date)) {
        return res.status(400).json({ success: false, error: 'INVALID_DATE', message: 'payment_date must be YYYY-MM-DD' });
    }
    const today = new Date().toISOString().split('T')[0];
    if (payment_date > today) {
        return res.status(400).json({ success: false, error: 'FUTURE_DATE', message: 'payment_date cannot be in the future' });
    }
    if (isNaN(amount) || amount <= 0) {
        return res.status(400).json({ success: false, error: 'INVALID_AMOUNT', message: 'amount must be > 0' });
    }
    const mode = payment_mode.toUpperCase();
    if (!['CASH', 'UPI', 'BANK_TRANSFER', 'OTHER'].includes(mode)) {
        return res.status(400).json({ success: false, error: 'INVALID_MODE', message: 'payment_mode must be CASH, UPI, BANK_TRANSFER, or OTHER' });
    }

    const db = getDatabase();
    db.get('SELECT student_id, name, active FROM students WHERE student_id = ?', [student_id], (err, student) => {
        if (err)       { db.close(); return res.status(500).json({ success: false, error: 'DB_ERROR', message: err.message }); }
        if (!student)  { db.close(); return res.status(404).json({ success: false, error: 'STUDENT_NOT_FOUND', message: `Student ${student_id} not found` }); }
        if (!student.active) { db.close(); return res.status(400).json({ success: false, error: 'STUDENT_INACTIVE', message: 'Student is inactive' }); }

        db.run(
            `INSERT INTO payment_records (student_id, payment_date, amount, payment_mode, reference_note)
             VALUES (?, ?, ?, ?, ?)`,
            [student_id, payment_date, amount, mode, reference_note || null],
            function (err2) {
                if (err2) { db.close(); return res.status(500).json({ success: false, error: 'DB_ERROR', message: err2.message }); }
                const insertId = this.lastID;
                db.get('SELECT * FROM payment_records WHERE id = ?', [insertId], (err3, row) => {
                    db.close();
                    if (err3) return res.status(500).json({ success: false, error: 'DB_ERROR', message: err3.message });
                    res.status(201).json({ success: true, data: row });
                });
            }
        );
    });
});

/**
 * GET /api/payments/history/:studentId
 * All payment records for a student, newest first.
 */
router.get('/history/:studentId', (req, res) => {
    const db = getDatabase();
    db.all(
        'SELECT * FROM payment_records WHERE student_id = ? ORDER BY payment_date DESC, recorded_at DESC',
        [req.params.studentId],
        (err, rows) => {
            db.close();
            if (err) return res.status(500).json({ success: false, error: 'DB_ERROR', message: err.message });
            res.json({ success: true, student_id: req.params.studentId, data: rows || [] });
        }
    );
});

/**
 * DELETE /api/payments/record/:id
 * Delete a specific payment record.
 */
router.delete('/record/:id', (req, res) => {
    const db = getDatabase();
    db.get('SELECT * FROM payment_records WHERE id = ?', [req.params.id], (err, row) => {
        if (err)  { db.close(); return res.status(500).json({ success: false, error: 'DB_ERROR', message: err.message }); }
        if (!row) { db.close(); return res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Payment record not found' }); }

        db.run('DELETE FROM payment_records WHERE id = ?', [req.params.id], function (err2) {
            db.close();
            if (err2) return res.status(500).json({ success: false, error: 'DB_ERROR', message: err2.message });
            res.json({ success: true, message: 'Payment record deleted', deleted: this.changes });
        });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// BALANCE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/payments/balance/:studentId
 * Calculates total_billed, total_paid, balance, and status.
 */
router.get('/balance/:studentId', (req, res) => {
    const sid = req.params.studentId;
    const db  = getDatabase();

    db.get(
        `SELECT COALESCE(SUM(final_bill), 0) AS total_billed,
                MAX(month)                    AS last_bill_month
         FROM monthly_bills WHERE student_id = ?`,
        [sid],
        (err, billRow) => {
            if (err) { db.close(); return res.status(500).json({ success: false, error: 'DB_ERROR', message: err.message }); }

            db.get(
                `SELECT COALESCE(SUM(amount), 0) AS total_paid,
                        MAX(payment_date)         AS last_payment_date
                 FROM payment_records WHERE student_id = ?`,
                [sid],
                (err2, payRow) => {
                    db.close();
                    if (err2) return res.status(500).json({ success: false, error: 'DB_ERROR', message: err2.message });

                    const totalBilled = Math.round((billRow.total_billed  || 0) * 100) / 100;
                    const totalPaid   = Math.round((payRow.total_paid     || 0) * 100) / 100;
                    const balance     = Math.round((totalPaid - totalBilled) * 100) / 100;

                    let status;
                    if (balance > 0)      status = 'ADVANCE';
                    else if (balance < 0) status = 'DUE';
                    else                  status = 'SETTLED';

                    res.json({
                        success: true,
                        data: {
                            student_id:        sid,
                            total_billed:      totalBilled,
                            total_paid:        totalPaid,
                            balance,
                            status,
                            last_payment_date: payRow.last_payment_date || null,
                            last_bill_month:   billRow.last_bill_month  || null,
                        }
                    });
                }
            );
        }
    );
});

// ─────────────────────────────────────────────────────────────────────────────
// UNPAID CURRENT MONTH
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/payments/unpaid-current-month
 * Students who have NOT paid for the current month (DUE or NO_BILL).
 */
router.get('/unpaid-current-month', (req, res) => {
    const ym = currentYM();
    const db = getDatabase();

    db.all('SELECT student_id, name, meal_plan, phone_number FROM students WHERE active = 1', [], (err, students) => {
        if (err) { db.close(); return res.status(500).json({ success: false, error: 'DB_ERROR', message: err.message }); }
        if (!students || students.length === 0) {
            db.close();
            return res.json({ success: true, month: ym, data: [], count: 0 });
        }

        // Bills for current month
        db.all('SELECT * FROM monthly_bills WHERE month = ?', [ym], (err2, curBills) => {
            if (err2) { db.close(); return res.status(500).json({ success: false, error: 'DB_ERROR', message: err2.message }); }

            // Total billed per student (all time)
            db.all('SELECT student_id, SUM(final_bill) AS total_billed FROM monthly_bills GROUP BY student_id', [], (err3, allBills) => {
                if (err3) { db.close(); return res.status(500).json({ success: false, error: 'DB_ERROR', message: err3.message }); }

                // Total paid per student (all time)
                db.all('SELECT student_id, SUM(amount) AS total_paid FROM payment_records GROUP BY student_id', [], (err4, allPayments) => {
                    db.close();
                    if (err4) return res.status(500).json({ success: false, error: 'DB_ERROR', message: err4.message });

                    const curBillMap     = {};
                    curBills.forEach(b => { curBillMap[b.student_id] = b; });

                    const totalBilledMap = {};
                    allBills.forEach(b => { totalBilledMap[b.student_id] = b.total_billed || 0; });

                    const totalPaidMap   = {};
                    allPayments.forEach(p => { totalPaidMap[p.student_id] = p.total_paid || 0; });

                    const unpaid = [];

                    students.forEach(s => {
                        const curBill   = curBillMap[s.student_id];
                        const billed    = totalBilledMap[s.student_id] || 0;
                        const paid      = totalPaidMap[s.student_id]   || 0;
                        const balance   = Math.round((paid - billed) * 100) / 100;

                        if (!curBill) {
                            // No bill generated yet for current month
                            unpaid.push({
                                student_id:          s.student_id,
                                name:                s.name,
                                meal_plan:           s.meal_plan,
                                phone_number:        s.phone_number,
                                current_month_bill:  null,
                                balance,
                                status:              'NO_BILL',
                            });
                        } else if (balance < 0) {
                            // Bill exists, but student still owes money overall
                            unpaid.push({
                                student_id:          s.student_id,
                                name:                s.name,
                                meal_plan:           s.meal_plan,
                                phone_number:        s.phone_number,
                                current_month_bill:  curBill.final_bill,
                                balance,
                                status:              'DUE',
                            });
                        }
                    });

                    // Sort: most in debt first (most negative balance first)
                    unpaid.sort((a, b) => a.balance - b.balance);

                    res.json({ success: true, month: ym, data: unpaid, count: unpaid.length });
                });
            });
        });
    });
});

module.exports = router;

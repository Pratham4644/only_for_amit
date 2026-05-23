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

/** Calculate calendar days between two dates inclusive */
function calcDaysBetween(d1, d2) {
    const date1 = new Date(d1 + 'T00:00:00');
    const date2 = new Date(d2 + 'T00:00:00');
    const diffTime = date2.getTime() - date1.getTime();
    return Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;
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
 * POST /api/payments/bills/preview
 * Body: { student_id, month?, from_date?, to_date?, absent_days, notes? }
 * Does the exact calculation as generate but does not save to database.
 */
router.post('/bills/preview', (req, res) => {
    let { student_id, month, from_date, to_date, notes } = req.body;
    const absent_days = parseFloat(req.body.absent_days) || 0;

    if (!student_id) {
        return res.status(400).json({ success: false, error: 'MISSING_FIELDS', message: 'student_id is required' });
    }

    if (!from_date || !to_date) {
        if (!month) {
            return res.status(400).json({ success: false, error: 'MISSING_FIELDS', message: 'Either month or from_date & to_date must be provided' });
        }
        if (!isValidYM(month)) {
            return res.status(400).json({ success: false, error: 'INVALID_MONTH', message: 'month must be YYYY-MM' });
        }
        from_date = `${month}-01`;
        const [y, m] = month.split('-').map(Number);
        const lastDay = new Date(y, m, 0).getDate();
        to_date = `${month}-${String(lastDay).padStart(2, '0')}`;
    } else {
        if (!isValidDate(from_date) || !isValidDate(to_date)) {
            return res.status(400).json({ success: false, error: 'INVALID_DATE', message: 'Dates must be in YYYY-MM-DD format' });
        }
        if (from_date > to_date) {
            return res.status(400).json({ success: false, error: 'INVALID_RANGE', message: 'from_date must be less than or equal to to_date' });
        }
        month = `${from_date} to ${to_date}`;
    }

    if (absent_days < 0 || (absent_days * 2) % 1 !== 0) {
        return res.status(400).json({ success: false, error: 'INVALID_ABSENT_DAYS', message: 'absent_days must be >= 0 and in 0.5 increments' });
    }

    const db = getDatabase();

    db.get('SELECT * FROM students WHERE student_id = ?', [student_id], (err, student) => {
        if (err)      { db.close(); return res.status(500).json({ success: false, error: 'DB_ERROR', message: err.message }); }
        if (!student) { db.close(); return res.status(404).json({ success: false, error: 'STUDENT_NOT_FOUND', message: `Student ${student_id} not found` }); }

        db.get('SELECT * FROM fee_settings WHERE meal_plan = ?', [student.meal_plan], (err2, fee) => {
            db.close();
            if (err2) { return res.status(500).json({ success: false, error: 'DB_ERROR', message: err2.message }); }
            if (!fee) { return res.status(404).json({ success: false, error: 'FEE_NOT_FOUND', message: `No fee settings found for plan ${student.meal_plan}` }); }

            const totalDays = calcDaysBetween(from_date, to_date);
            const baseFee   = (student.mess_price !== null && student.mess_price !== undefined) ? student.mess_price : fee.monthly_fee;
            const threshold = fee.vacation_threshold_days;

            let perPlatePrice = 0;
            let mealsPerDay = 1;
            if (student.meal_plan === 'FULL') {
                perPlatePrice = baseFee / 60;
                mealsPerDay = 2;
            } else {
                perPlatePrice = baseFee / 30;
                mealsPerDay = 1;
            }

            const baseBill = totalDays * mealsPerDay * perPlatePrice;
            let deduction = 0;
            if (absent_days > threshold) {
                const absentMeals = absent_days * mealsPerDay;
                deduction = Math.round(absentMeals * perPlatePrice * 100) / 100;
            }
            const finalBill = Math.max(0, Math.round((baseBill - deduction) * 100) / 100);

            res.json({
                success: true,
                data: {
                    student_id, month, from_date, to_date, meal_plan: student.meal_plan,
                    base_fee: baseFee, total_days_in_month: totalDays, absent_days,
                    vacation_threshold_days: threshold, deduction, final_bill: finalBill, notes: notes || null
                }
            });
        });
    });
});

/**
 * POST /api/payments/bills/generate
 * Body: { student_id, month?, from_date?, to_date?, absent_days, notes? }
 */
router.post('/bills/generate', (req, res) => {
    let { student_id, month, from_date, to_date, notes } = req.body;
    const absent_days = parseFloat(req.body.absent_days) || 0;

    if (!student_id) {
        return res.status(400).json({ success: false, error: 'MISSING_FIELDS', message: 'student_id is required' });
    }

    if (!from_date || !to_date) {
        if (!month) {
            return res.status(400).json({ success: false, error: 'MISSING_FIELDS', message: 'Either month or from_date & to_date must be provided' });
        }
        if (!isValidYM(month)) {
            return res.status(400).json({ success: false, error: 'INVALID_MONTH', message: 'month must be YYYY-MM' });
        }
        from_date = `${month}-01`;
        const [y, m] = month.split('-').map(Number);
        const lastDay = new Date(y, m, 0).getDate();
        to_date = `${month}-${String(lastDay).padStart(2, '0')}`;
    } else {
        if (!isValidDate(from_date) || !isValidDate(to_date)) {
            return res.status(400).json({ success: false, error: 'INVALID_DATE', message: 'Dates must be in YYYY-MM-DD format' });
        }
        if (from_date > to_date) {
            return res.status(400).json({ success: false, error: 'INVALID_RANGE', message: 'from_date must be less than or equal to to_date' });
        }
        month = `${from_date} to ${to_date}`;
    }

    if (absent_days < 0 || (absent_days * 2) % 1 !== 0) {
        return res.status(400).json({ success: false, error: 'INVALID_ABSENT_DAYS', message: 'absent_days must be >= 0 and in 0.5 increments' });
    }

    const db = getDatabase();

    db.get('SELECT * FROM students WHERE student_id = ?', [student_id], (err, student) => {
        if (err)      { db.close(); return res.status(500).json({ success: false, error: 'DB_ERROR', message: err.message }); }
        if (!student) { db.close(); return res.status(404).json({ success: false, error: 'STUDENT_NOT_FOUND', message: `Student ${student_id} not found` }); }

        db.get('SELECT * FROM fee_settings WHERE meal_plan = ?', [student.meal_plan], (err2, fee) => {
            if (err2) { db.close(); return res.status(500).json({ success: false, error: 'DB_ERROR', message: err2.message }); }
            if (!fee) { db.close(); return res.status(404).json({ success: false, error: 'FEE_NOT_FOUND', message: `No fee settings found for plan ${student.meal_plan}` }); }

            const totalDays = calcDaysBetween(from_date, to_date);
            const baseFee   = (student.mess_price !== null && student.mess_price !== undefined) ? student.mess_price : fee.monthly_fee;
            const threshold = fee.vacation_threshold_days;

            let perPlatePrice = 0;
            let mealsPerDay = 1;
            if (student.meal_plan === 'FULL') {
                perPlatePrice = baseFee / 60;
                mealsPerDay = 2;
            } else {
                perPlatePrice = baseFee / 30;
                mealsPerDay = 1;
            }

            const baseBill = totalDays * mealsPerDay * perPlatePrice;
            let deduction = 0;
            if (absent_days > threshold) {
                const absentMeals = absent_days * mealsPerDay;
                deduction = Math.round(absentMeals * perPlatePrice * 100) / 100;
            }
            const finalBill = Math.max(0, Math.round((baseBill - deduction) * 100) / 100);

            db.run(
                `INSERT INTO monthly_bills
                   (student_id, month, from_date, to_date, meal_plan, base_fee, total_days_in_month,
                    absent_days, vacation_threshold_days, deduction, final_bill, notes, generated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                 ON CONFLICT(student_id, month) DO UPDATE SET
                   from_date               = excluded.from_date,
                   to_date                 = excluded.to_date,
                   meal_plan               = excluded.meal_plan,
                   base_fee                = excluded.base_fee,
                   total_days_in_month     = excluded.total_days_in_month,
                   absent_days             = excluded.absent_days,
                   vacation_threshold_days = excluded.vacation_threshold_days,
                   deduction               = excluded.deduction,
                   final_bill              = excluded.final_bill,
                   notes                   = excluded.notes,
                   generated_at            = CURRENT_TIMESTAMP`,
                [student_id, month, from_date, to_date, student.meal_plan, baseFee, totalDays,
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
 * Also computes meal_days: how many days of meals the balance covers
 * (positive = advance days remaining, negative = days owed).
 */
router.get('/balance/:studentId', (req, res) => {
    const sid = req.params.studentId;
    const db  = getDatabase();

    db.get(
        `SELECT COALESCE(SUM(final_bill), 0) AS total_billed,
                MAX(to_date)                  AS last_bill_to_date
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
                    if (err2) { db.close(); return res.status(500).json({ success: false, error: 'DB_ERROR', message: err2.message }); }

                    const totalBilled = Math.round((billRow.total_billed  || 0) * 100) / 100;
                    const totalPaid   = Math.round((payRow.total_paid     || 0) * 100) / 100;
                    const balance     = Math.round((totalPaid - totalBilled) * 100) / 100;

                    let status;
                    if (balance > 0)      status = 'ADVANCE';
                    else if (balance < 0) status = 'DUE';
                    else                  status = 'SETTLED';

                    // Fetch student + fee_settings to compute meal days and payment_upto
                    db.get(
                        `SELECT s.meal_plan,
                                s.join_date,
                                COALESCE(s.mess_price, f.monthly_fee) AS effective_fee
                         FROM students s
                         LEFT JOIN fee_settings f ON f.meal_plan = s.meal_plan
                         WHERE s.student_id = ?`,
                        [sid],
                        (err3, planRow) => {
                            db.close();

                            let meal_days = null;
                            let cost_per_day = null;
                            let meals_per_day = null;
                            let calculated_payment_upto = null;

                            if (!err3 && planRow && planRow.effective_fee > 0) {
                                // Logic mirrors bill generation:
                                if (planRow.meal_plan === 'FULL') {
                                    const perPlate = planRow.effective_fee / 60;
                                    meals_per_day  = 2;
                                    cost_per_day   = Math.round(perPlate * meals_per_day * 100) / 100;
                                } else {
                                    const perPlate = planRow.effective_fee / 30;
                                    meals_per_day  = 1;
                                    cost_per_day   = Math.round(perPlate * meals_per_day * 100) / 100;
                                }
                                
                                meal_days = cost_per_day > 0
                                    ? Math.round((balance / cost_per_day) * 10) / 10
                                    : null;
                                    
                                // Calculate the exact payment_upto date
                                if (cost_per_day > 0) {
                                    // Base Date: if bills exist, use the end date of the latest bill. Otherwise, use join_date.
                                    let baseDateStr = billRow.last_bill_to_date || planRow.join_date;
                                    if (!baseDateStr) {
                                        // Fallback to today if missing join_date
                                        baseDateStr = new Date().toISOString().split('T')[0];
                                    }
                                    
                                    const baseDate = new Date(baseDateStr);
                                    if (!isNaN(baseDate.getTime())) {
                                        // Add the meal_days to the base date
                                        baseDate.setDate(baseDate.getDate() + Math.floor(meal_days));
                                        calculated_payment_upto = baseDate.toISOString().split('T')[0];
                                    }
                                }
                            }

                            res.json({
                                success: true,
                                data: {
                                    student_id:        sid,
                                    total_billed:      totalBilled,
                                    total_paid:        totalPaid,
                                    balance,
                                    status,
                                    last_payment_date: payRow.last_payment_date || null,
                                    last_bill_to_date: billRow.last_bill_to_date || null,
                                    join_date:         planRow.join_date || null,
                                    meal_days,
                                    cost_per_day,
                                    meals_per_day,
                                    calculated_payment_upto
                                }
                            });
                        }
                    );
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
/**
 * GET /api/payments/absent-days/:studentId
 * Query: ?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Returns the sum of total_leaves in the given date range.
 */
router.get('/absent-days/:studentId', (req, res) => {
    const studentId = req.params.studentId;
    const { from, to } = req.query;
    
    if (!from || !to) {
        return res.status(400).json({ success: false, message: 'from and to dates are required' });
    }

    const db = getDatabase();
    db.get(
        `SELECT SUM(total_leaves) as total FROM absent_records 
         WHERE student_id = ? 
           AND from_date <= ? 
           AND to_date >= ?`,
        [studentId, to, from],
        (err, row) => {
            db.close();
            if (err) return res.status(500).json({ success: false, error: err.message });
            res.json({ success: true, data: row.total || 0 });
        }
    );
});

module.exports = router;

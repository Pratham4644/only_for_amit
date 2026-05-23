const express = require('express');
const router = express.Router();
const { getDatabase } = require('../database/db');
const { sendMealReminders, getAbsentStudents } = require('../utils/whatsapp-reminder');
const { getSchedulerStatus, triggerManualReminder } = require('../utils/meal-scheduler');

// GET reminder history for a student
router.get('/history/:student_id', (req, res) => {
    const studentId = req.params.student_id;
    const db = getDatabase();

    const query = `
        SELECT 
            id,
            student_id,
            date,
            meal_type,
            reminder_type,
            delivery_status,
            sent_at
        FROM reminders_sent
        WHERE student_id = ?
        ORDER BY sent_at DESC
        LIMIT 50
    `;

    db.all(query, [studentId], (err, rows) => {
        db.close();
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({
            student_id: studentId,
            reminders: rows || []
        });
    });
});

// GET reminders for a specific date
router.get('/date/:date', (req, res) => {
    const { date } = req.params;
    const { meal_type, status } = req.query;
    const db = getDatabase();

    let query = `
        SELECT 
            rs.*,
            s.name,
            s.meal_plan
        FROM reminders_sent rs
        JOIN students s ON rs.student_id = s.student_id
        WHERE rs.date = ?
    `;

    const params = [date];

    if (meal_type) {
        query += ` AND rs.meal_type = ?`;
        params.push(meal_type);
    }

    if (status) {
        query += ` AND rs.delivery_status = ?`;
        params.push(status);
    }

    query += ` ORDER BY rs.sent_at DESC`;

    db.all(query, params, (err, rows) => {
        db.close();
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({
            date,
            total: rows ? rows.length : 0,
            reminders: rows || []
        });
    });
});

// GET absent students for a meal
router.get('/absent/:meal_type', async (req, res) => {
    try {
        const mealType = req.params.meal_type.toUpperCase();
        const today = new Date().toISOString().split('T')[0];

        // Validate meal type
        if (!['LUNCH', 'DINNER'].includes(mealType)) {
            return res.status(400).json({ error: 'Invalid meal type. Use LUNCH or DINNER' });
        }

        const absentStudents = await getAbsentStudents(today, mealType);

        res.json({
            date: today,
            meal_type: mealType,
            total_absent: absentStudents.length,
            students: absentStudents.map(s => ({
                student_id: s.student_id,
                name: s.name,
                phone_number: s.phone_number,
                meal_plan: s.meal_plan
            }))
        });
    } catch (error) {
        console.error('Error fetching absent students:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST send reminders manually for a meal
router.post('/send/:meal_type', async (req, res) => {
    try {
        const mealType = req.params.meal_type.toUpperCase();
        const { reminder_type } = req.body;

        // Validate meal type
        if (!['LUNCH', 'DINNER'].includes(mealType)) {
            return res.status(400).json({ error: 'Invalid meal type. Use LUNCH or DINNER' });
        }

        const result = await sendMealReminders(mealType, reminder_type || 'MANUAL');

        res.json(result);
    } catch (error) {
        console.error('Error sending reminders:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET reminder statistics for today
router.get('/stats/today', (req, res) => {
    const db = getDatabase();
    const today = new Date().toISOString().split('T')[0];

    const query = `
        SELECT 
            meal_type,
            delivery_status,
            COUNT(*) as count
        FROM reminders_sent
        WHERE date = ?
        GROUP BY meal_type, delivery_status
    `;

    db.all(query, [today], (err, rows) => {
        db.close();
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        const stats = {
            date: today,
            lunch: { sent: 0, failed: 0, pending: 0 },
            dinner: { sent: 0, failed: 0, pending: 0 }
        };

        (rows || []).forEach(row => {
            const mealKey = row.meal_type.toLowerCase();
            const statusKey = row.delivery_status.toLowerCase();
            if (stats[mealKey]) {
                stats[mealKey][statusKey] = row.count;
            }
        });

        res.json(stats);
    });
});

// GET scheduler status
router.get('/scheduler/status', (req, res) => {
    const status = getSchedulerStatus();
    res.json(status);
});

// POST trigger manual reminder (for testing)
router.post('/trigger/:meal_type', async (req, res) => {
    try {
        const mealType = req.params.meal_type.toUpperCase();

        if (!['LUNCH', 'DINNER'].includes(mealType)) {
            return res.status(400).json({ error: 'Invalid meal type' });
        }

        const result = await triggerManualReminder(mealType);
        res.json(result);
    } catch (error) {
        console.error('Error triggering reminder:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const { getDatabase } = require('../database/db');

// GET all settings
router.get('/', (req, res) => {
    const db = getDatabase();

    db.all('SELECT * FROM settings', [], (err, rows) => {
        db.close();
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        // Convert to key-value object
        const settings = {};
        rows.forEach(row => {
            settings[row.key] = row.value;
        });

        res.json({ settings });
    });
});

// GET meal timings
router.get('/meal-timings', (req, res) => {
    const db = getDatabase();

    db.all('SELECT * FROM meal_timings WHERE active = 1', [], (err, rows) => {
        db.close();
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ meal_timings: rows });
    });
});

// PUT update meal timing
router.put('/meal-timings/:id', (req, res) => {
    const id = req.params.id;
    const { start_time, end_time, late_warning_time } = req.body;

    const db = getDatabase();

    let query = 'UPDATE meal_timings SET ';
    const params = [];
    const updates = [];

    if (start_time) {
        updates.push('start_time = ?');
        params.push(start_time);
    }
    if (end_time) {
        updates.push('end_time = ?');
        params.push(end_time);
    }
    if (late_warning_time !== undefined) {
        updates.push('late_warning_time = ?');
        params.push(late_warning_time);
    }

    if (updates.length === 0) {
        db.close();
        return res.status(400).json({ error: 'No fields to update' });
    }

    query += updates.join(', ') + ' WHERE id = ?';
    params.push(id);

    db.run(query, params, function (err) {
        if (err) {
            db.close();
            return res.status(500).json({ error: err.message });
        }

        db.get('SELECT * FROM meal_timings WHERE id = ?', [id], (err, row) => {
            db.close();
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({
                message: 'Meal timing updated successfully',
                meal_timing: row
            });
        });
    });
});

// PUT update setting
router.put('/:key', (req, res) => {
    const key = req.params.key;
    const { value } = req.body;

    if (value === undefined) {
        return res.status(400).json({ error: 'Value is required' });
    }

    const db = getDatabase();

    const query = `
        INSERT INTO settings (key, value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET 
            value = excluded.value,
            updated_at = CURRENT_TIMESTAMP
    `;

    db.run(query, [key, value], function (err) {
        db.close();
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({
            message: 'Setting updated successfully',
            key,
            value
        });
    });
});

// GET meal prices
router.get('/meal-prices', (req, res) => {
    const db = getDatabase();

    db.all('SELECT * FROM meal_prices', [], (err, rows) => {
        db.close();
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ meal_prices: rows });
    });
});

// PUT update meal price
router.put('/meal-prices/:meal_plan', (req, res) => {
    const meal_plan = req.params.meal_plan;
    const { price } = req.body;

    if (price === undefined) {
        return res.status(400).json({ error: 'Price is required' });
    }

    const db = getDatabase();

    const query = `
        UPDATE meal_prices 
        SET price = ?, updated_at = CURRENT_TIMESTAMP
        WHERE meal_plan = ?
    `;

    db.run(query, [price, meal_plan], function (err) {
        if (err) {
            db.close();
            return res.status(500).json({ error: err.message });
        }

        if (this.changes === 0) {
            db.close();
            return res.status(404).json({ error: 'Meal plan not found' });
        }

        db.get('SELECT * FROM meal_prices WHERE meal_plan = ?', [meal_plan], (err, row) => {
            db.close();
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({
                message: 'Meal price updated successfully',
                meal_price: row
            });
        });
    });
});

module.exports = router;

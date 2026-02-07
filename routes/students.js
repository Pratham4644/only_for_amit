const express = require('express');
const router = express.Router();
const { getDatabase } = require('../database/db');
const { generateQRCode, generateBulkQRCodes } = require('../utils/qr-generator');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for photo uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '../uploads/photos');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'student-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// GET all students (with today's attendance status)
router.get('/', (req, res) => {
    const db = getDatabase();
    const today = new Date().toISOString().split('T')[0];

    const query = `
        SELECT s.*, 
               (SELECT scan_time FROM attendance WHERE student_id = s.student_id AND date = ? AND meal_type = 'LUNCH') as lunch_time,
               (SELECT scan_time FROM attendance WHERE student_id = s.student_id AND date = ? AND meal_type = 'DINNER') as dinner_time
        FROM students s
        ORDER BY s.student_id
    `;

    db.all(query, [today, today], (err, rows) => {
        db.close();
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ students: rows });
    });
});

// GET single student
router.get('/:id', (req, res) => {
    const db = getDatabase();
    const studentId = req.params.id;

    db.get('SELECT * FROM students WHERE student_id = ?', [studentId], (err, row) => {
        db.close();
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (!row) {
            return res.status(404).json({ error: 'Student not found' });
        }
        res.json({ student: row });
    });
});

// POST create new student
router.post('/', upload.single('photo'), async (req, res) => {
    const { student_id, name, room_number, phone_number, meal_plan } = req.body;
    const photo_path = req.file ? req.file.path : null;

    if (!student_id || !name) {
        return res.status(400).json({ error: 'Student ID and name are required' });
    }

    const db = getDatabase();

    const query = `
        INSERT INTO students (student_id, name, room_number, phone_number, photo_path, meal_plan)
        VALUES (?, ?, ?, ?, ?, ?)
    `;

    db.run(query, [student_id, name, room_number, phone_number, photo_path, meal_plan || 'FULL'], function (err) {
        if (err) {
            db.close();
            return res.status(500).json({ error: err.message });
        }

        const insertId = this.lastID;

        db.get('SELECT * FROM students WHERE id = ?', [insertId], async (err, row) => {
            db.close();
            if (err) {
                return res.status(500).json({ error: err.message });
            }

            // Generate QR code
            try {
                const qrDataUrl = await generateQRCode(student_id);
                res.json({
                    message: 'Student created successfully',
                    student: row,
                    qr_code: qrDataUrl
                });
            } catch (qrError) {
                res.json({
                    message: 'Student created but QR generation failed',
                    student: row,
                    error: qrError.message
                });
            }
        });
    });
});

// PUT update student
router.put('/:id', upload.single('photo'), (req, res) => {
    const studentId = req.params.id;
    const { name, room_number, phone_number, meal_plan, active } = req.body;
    const photo_path = req.file ? req.file.path : null;

    const db = getDatabase();

    let query = 'UPDATE students SET ';
    const params = [];
    const updates = [];

    if (name) {
        updates.push('name = ?');
        params.push(name);
    }
    if (room_number !== undefined) {
        updates.push('room_number = ?');
        params.push(room_number);
    }
    if (phone_number !== undefined) {
        updates.push('phone_number = ?');
        params.push(phone_number);
    }
    if (meal_plan) {
        updates.push('meal_plan = ?');
        params.push(meal_plan);
    }
    if (active !== undefined) {
        updates.push('active = ?');
        params.push(active);
    }
    if (photo_path) {
        updates.push('photo_path = ?');
        params.push(photo_path);
    }

    if (updates.length === 0) {
        db.close();
        return res.status(400).json({ error: 'No fields to update' });
    }

    query += updates.join(', ') + ' WHERE student_id = ?';
    params.push(studentId);

    db.run(query, params, function (err) {
        if (err) {
            db.close();
            return res.status(500).json({ error: err.message });
        }

        db.get('SELECT * FROM students WHERE student_id = ?', [studentId], (err, row) => {
            db.close();
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({
                message: 'Student updated successfully',
                student: row
            });
        });
    });
});

// DELETE student
router.delete('/:id', (req, res) => {
    const studentId = req.params.id;
    const db = getDatabase();

    db.run('DELETE FROM students WHERE student_id = ?', [studentId], function (err) {
        db.close();
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({
            message: 'Student deleted successfully',
            changes: this.changes
        });
    });
});

// GET student's QR code
router.get('/:id/qr', async (req, res) => {
    const studentId = req.params.id;

    try {
        const qrDataUrl = await generateQRCode(studentId);
        res.json({
            student_id: studentId,
            qr_code: qrDataUrl
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST bulk import students from CSV
router.post('/bulk-import', (req, res) => {
    // This would parse CSV and create multiple students
    // Implementation depends on CSV format
    res.status(501).json({ message: 'Bulk import not yet implemented' });
});

module.exports = router;

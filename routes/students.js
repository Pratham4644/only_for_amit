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

// SEARCH students by ID or Name
router.get('/search', (req, res) => {
    const db = getDatabase();
    const query = req.query.q;

    if (!query) {
        db.close();
        return res.status(400).json({ error: 'Search query is required' });
    }

    const sql = `
        SELECT * FROM students 
        WHERE student_id = ? OR name LIKE ? OR student_department LIKE ?
        LIMIT 10
    `;
    const searchTerm = `%${query}%`;

    db.all(sql, [query, searchTerm, searchTerm], (err, rows) => {
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
    let { student_id, name, student_department, phone_number, meal_plan, join_date, mess_price, student_profile_update, payment_upto } = req.body;
    const photo_path = req.file ? req.file.path : null;

    if (!student_id || !name) {
        return res.status(400).json({ error: 'Student ID and name are required' });
    }

    if (!join_date) {
        join_date = new Date().toISOString().split('T')[0];
    }

    const db = getDatabase();

    const insertStudent = (price) => {
        const query = `
            INSERT INTO students (student_id, name, student_department, phone_number, photo_path, meal_plan, join_date, mess_price, student_profile_update, payment_upto)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        db.run(query, [student_id, name, student_department, phone_number, photo_path, meal_plan || 'FULL', join_date, price, student_profile_update || null, payment_upto || null], function (err) {
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
    };

    let numericPrice = parseFloat(mess_price);
    if (!isNaN(numericPrice) && numericPrice < 0) {
        return res.status(400).json({ error: 'Mess price cannot be negative' });
    }
    if (isNaN(numericPrice) || numericPrice === null || numericPrice === undefined) {
        db.get('SELECT monthly_fee FROM fee_settings WHERE meal_plan = ?', [meal_plan || 'FULL'], (err, row) => {
            if (err || !row) {
                let fallback = 3000.0;
                if (meal_plan === 'LUNCH_ONLY') fallback = 1800.0;
                else if (meal_plan === 'DINNER_ONLY') fallback = 1500.0;
                insertStudent(fallback);
            } else {
                insertStudent(row.monthly_fee);
            }
        });
    } else {
        insertStudent(numericPrice);
    }
});

// PUT update student
router.put('/:id', upload.single('photo'), (req, res) => {
    console.log('PUT student request body:', req.body);
    const studentId = req.params.id;
    const { student_id, name, student_department, phone_number, meal_plan, active, join_date, mess_price, student_profile_update, payment_upto } = req.body;
    const photo_path = req.file ? req.file.path : null;

    const db = getDatabase();
    const targetStudentId = student_id || studentId;

    const proceedWithUpdate = () => {
        let query = 'UPDATE students SET ';
        const params = [];
        const updates = [];

        if (name) {
            updates.push('name = ?');
            params.push(name);
        }
        if (student_department !== undefined) {
            updates.push('student_department = ?');
            params.push(student_department);
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
            params.push(active === 'true' || active === 1 || active === '1' ? 1 : 0);
        }
        if (photo_path) {
            updates.push('photo_path = ?');
            params.push(photo_path);
        }
        if (join_date !== undefined) {
            updates.push('join_date = ?');
            params.push(join_date);
        }
        if (mess_price !== undefined) {
            const parsedPrice = mess_price === '' || mess_price === null ? null : parseFloat(mess_price);
            if (parsedPrice !== null && parsedPrice < 0) {
                db.close();
                return res.status(400).json({ error: 'Mess price cannot be negative' });
            }
            updates.push('mess_price = ?');
            params.push(parsedPrice);
        }
        if (student_profile_update !== undefined) {
            updates.push('student_profile_update = ?');
            params.push(student_profile_update);
        }
        if (payment_upto !== undefined) {
            updates.push('payment_upto = ?');
            params.push(payment_upto);
        }

        if (updates.length === 0) {
            db.get('SELECT * FROM students WHERE student_id = ?', [targetStudentId], (err, row) => {
                db.close();
                if (err) return res.status(500).json({ error: err.message });
                return res.json({ message: 'No fields to update', student: row });
            });
            return;
        }

        query += updates.join(', ') + ' WHERE student_id = ?';
        params.push(targetStudentId);

        db.run(query, params, function (err) {
            if (err) {
                db.close();
                return res.status(500).json({ error: err.message });
            }

            db.get('SELECT * FROM students WHERE student_id = ?', [targetStudentId], (err, row) => {
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
    };

    if (student_id && student_id !== studentId) {
        // Cascading ID update across all SQLite tables
        db.serialize(() => {
            db.run('PRAGMA foreign_keys = OFF');
            db.run('UPDATE students SET student_id = ? WHERE student_id = ?', [student_id, studentId], (err) => {
                if (err) console.error('Error cascading students:', err);
            });
            db.run('UPDATE attendance SET student_id = ? WHERE student_id = ?', [student_id, studentId], (err) => {
                if (err) console.error('Error cascading attendance:', err);
            });
            db.run('UPDATE payment_records SET student_id = ? WHERE student_id = ?', [student_id, studentId], (err) => {
                if (err) console.error('Error cascading payment_records:', err);
            });
            db.run('UPDATE monthly_bills SET student_id = ? WHERE student_id = ?', [student_id, studentId], (err) => {
                if (err) console.error('Error cascading monthly_bills:', err);
            });
            db.run('UPDATE leave_requests SET student_id = ? WHERE student_id = ?', [student_id, studentId], (err) => {
                if (err) console.error('Error cascading leave_requests:', err);
            });
            db.run('UPDATE leave_credits SET student_id = ? WHERE student_id = ?', [student_id, studentId], (err) => {
                if (err) console.error('Error cascading leave_credits:', err);
            });
            db.run('UPDATE reminders_sent SET student_id = ? WHERE student_id = ?', [student_id, studentId], (err) => {
                if (err) console.error('Error cascading reminders_sent:', err);
            });
            db.run('PRAGMA foreign_keys = ON', (err) => {
                if (err) {
                    db.close();
                    return res.status(500).json({ error: 'Failed to re-enable foreign keys: ' + err.message });
                }
                proceedWithUpdate();
            });
        });
    } else {
        proceedWithUpdate();
    }
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

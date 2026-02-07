const express = require('express');
const router = express.Router();
const { getDatabase } = require('../database/db');
const { processScan, getCurrentMealType } = require('../utils/attendance-logic');

// POST process QR scan
router.post('/scan', async (req, res) => {
    const { student_id } = req.body;

    if (!student_id) {
        return res.status(400).json({
            success: false,
            error: 'Student ID is required'
        });
    }

    try {
        const result = await processScan(student_id);

        if (result.success) {
            res.json(result);
        } else {
            res.status(400).json(result);
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'SYSTEM_ERROR',
            message: error.message
        });
    }
});

// GET today's attendance
router.get('/today', (req, res) => {
    const db = getDatabase();
    const today = new Date().toISOString().split('T')[0];

    const query = `
        SELECT a.*, s.name, s.room_number, s.photo_path
        FROM attendance a
        JOIN students s ON a.student_id = s.student_id
        WHERE a.date = ?
        ORDER BY a.meal_type, a.scan_time
    `;

    db.all(query, [today], (err, rows) => {
        db.close();
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        // Separate by meal type
        const lunch = rows.filter(r => r.meal_type === 'LUNCH');
        const dinner = rows.filter(r => r.meal_type === 'DINNER');

        res.json({
            date: today,
            lunch: {
                count: lunch.length,
                records: lunch
            },
            dinner: {
                count: dinner.length,
                records: dinner
            },
            total: rows.length
        });
    });
});

// GET attendance count for today
router.get('/today/count', async (req, res) => {
    const db = getDatabase();
    const today = new Date().toISOString().split('T')[0];

    const query = `
        SELECT meal_type, COUNT(*) as count
        FROM attendance
        WHERE date = ?
        GROUP BY meal_type
    `;

    db.all(query, [today], async (err, rows) => {
        if (err) {
            db.close();
            return res.status(500).json({ error: err.message });
        }

        // Get total student count
        db.get('SELECT COUNT(*) as total FROM students WHERE active = 1', [], async (err, totalRow) => {
            db.close();
            if (err) {
                return res.status(500).json({ error: err.message });
            }

            const lunchCount = rows.find(r => r.meal_type === 'LUNCH')?.count || 0;
            const dinnerCount = rows.find(r => r.meal_type === 'DINNER')?.count || 0;
            const totalStudents = totalRow.total;

            // Get current meal type
            const currentMeal = await getCurrentMealType();

            res.json({
                date: today,
                total_students: totalStudents,
                lunch: {
                    present: lunchCount,
                    absent: totalStudents - lunchCount
                },
                dinner: {
                    present: dinnerCount,
                    absent: totalStudents - dinnerCount
                },
                current_meal: currentMeal ? currentMeal.meal_type : null
            });
        });
    });
});

// GET attendance report for a date range
router.get('/report', (req, res) => {
    const { start_date, end_date, meal_type, include_absent } = req.query;

    if (!start_date || !end_date) {
        return res.status(400).json({ error: 'Start date and end date are required' });
    }

    const db = getDatabase();

    // Strategy:
    // 1. If include_absent=true AND start_date=end_date, we list ALL students with LEFT JOIN attendance
    // 2. Otherwise, we list only attendance records (standard report)

    if (include_absent === 'true' && start_date === end_date) {
        // Single Day Full Report (Register)
        let query = `
            SELECT 
                s.student_id, 
                s.name, 
                s.room_number, 
                a.meal_type, 
                a.scan_time, 
                a.is_late,
                '${start_date}' as date
            FROM students s
            LEFT JOIN attendance a ON s.student_id = a.student_id 
                AND a.date = ?
        `;

        const params = [start_date];

        if (meal_type) {
            // If meal type is specified, we check attendance for THAT meal
            // But we still want all students. 
            // LEFT JOIN condition needs to include meal_type so we don't filter out students
            query = `
                SELECT 
                    s.student_id, 
                    s.name, 
                    s.room_number, 
                    '${meal_type}' as target_meal_type,
                    a.meal_type as actual_meal_type, 
                    a.scan_time, 
                    a.is_late,
                    '${start_date}' as date
                FROM students s
                LEFT JOIN attendance a ON s.student_id = a.student_id 
                    AND a.date = ? 
                    AND a.meal_type = ?
            `;
            params.push(meal_type);
        }

        query += ' ORDER BY s.student_id';

        db.all(query, params, (err, rows) => {
            db.close();
            if (err) {
                return res.status(500).json({ error: err.message });
            }

            // Process rows to set status
            const processedRows = rows.map(row => {
                let status = 'Absent';
                let type = row.meal_type || row.actual_meal_type;

                if (row.scan_time) {
                    status = row.is_late ? 'Late' : 'Present';
                }

                // If user filtered by meal_type, use that. If not, and no scan, type is null.
                // But for the export, we might want to say "Lunch: Absent"

                return {
                    date: row.date,
                    student_id: row.student_id,
                    name: row.name,
                    room_number: row.room_number,
                    meal_type: type || (meal_type || 'N/A'),
                    scan_time: row.scan_time || '-',
                    is_late: row.is_late,
                    status: status
                };
            });

            res.json({
                start_date,
                end_date,
                meal_type: meal_type || 'ALL',
                include_absent: true,
                records: processedRows,
                count: processedRows.length
            });
        });

    } else {
        // Standard Report (Only Present)
        let query = `
            SELECT a.*, s.name, s.room_number
            FROM attendance a
            JOIN students s ON a.student_id = s.student_id
            WHERE a.date BETWEEN ? AND ?
        `;

        const params = [start_date, end_date];

        if (meal_type) {
            query += ' AND a.meal_type = ?';
            params.push(meal_type);
        }

        query += ' ORDER BY a.date, a.meal_type, a.scan_time';

        db.all(query, params, (err, rows) => {
            db.close();
            if (err) {
                return res.status(500).json({ error: err.message });
            }

            // Add status field for consistency
            const processedRows = rows.map(row => ({
                ...row,
                status: row.is_late ? 'Late' : 'Present'
            }));

            res.json({
                start_date,
                end_date,
                meal_type: meal_type || 'ALL',
                records: processedRows,
                count: rows.length
            });
        });
    }
});

// GET absent students for a specific date and meal
router.get('/absent', (req, res) => {
    const { date, meal_type } = req.query;

    if (!date || !meal_type) {
        return res.status(400).json({ error: 'Date and meal type are required' });
    }

    const db = getDatabase();

    const query = `
        SELECT s.*
        FROM students s
        WHERE s.active = 1
        AND s.student_id NOT IN (
            SELECT student_id 
            FROM attendance 
            WHERE date = ? AND meal_type = ?
        )
        AND (
            s.meal_plan = 'FULL'
            OR (s.meal_plan = 'LUNCH_ONLY' AND ? = 'LUNCH')
            OR (s.meal_plan = 'DINNER_ONLY' AND ? = 'DINNER')
        )
        ORDER BY s.student_id
    `;

    db.all(query, [date, meal_type, meal_type, meal_type], (err, rows) => {
        db.close();
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({
            date,
            meal_type,
            absent_count: rows.length,
            absent_students: rows
        });
    });
});

// GET current meal status
router.get('/current-meal', async (req, res) => {
    try {
        const mealTiming = await getCurrentMealType();

        if (!mealTiming) {
            return res.json({
                active: false,
                message: 'No active meal time'
            });
        }

        res.json({
            active: true,
            meal_type: mealTiming.meal_type,
            start_time: mealTiming.start_time,
            end_time: mealTiming.end_time,
            late_warning_time: mealTiming.late_warning_time
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET Export Excel
router.get('/export-excel', async (req, res) => {
    const { start_date, end_date, meal_type } = req.query;
    const ExcelJS = require('exceljs');

    if (!start_date || !end_date) {
        return res.status(400).json({ error: 'Start date and end date are required' });
    }

    const db = getDatabase();

    // Logic similar to report: if single day, include absent students
    const includeAbsent = (start_date === end_date);

    let query = '';
    let params = [];

    if (includeAbsent) {
        query = `
            SELECT 
                s.student_id, 
                s.name, 
                s.room_number,
                a.meal_type, 
                a.scan_time, 
                a.is_late,
                '${start_date}' as date
            FROM students s
            LEFT JOIN attendance a ON s.student_id = a.student_id 
                AND a.date = ?
        `;
        params.push(start_date);

        if (meal_type) {
            query = `
                SELECT 
                    s.student_id, 
                    s.name, 
                    s.room_number, 
                    '${meal_type}' as target_meal_type,
                    a.meal_type as actual_meal_type, 
                    a.scan_time, 
                    a.is_late,
                    '${start_date}' as date
                FROM students s
                LEFT JOIN attendance a ON s.student_id = a.student_id 
                    AND a.date = ? 
                    AND a.meal_type = ?
            `;
            params = [start_date, meal_type];
        }
        query += ' ORDER BY s.student_id';
    } else {
        query = `
            SELECT a.*, s.name, s.room_number
            FROM attendance a
            JOIN students s ON a.student_id = s.student_id
            WHERE a.date BETWEEN ? AND ?
        `;
        params = [start_date, end_date];

        if (meal_type) {
            query += ' AND a.meal_type = ?';
            params.push(meal_type);
        }
        query += ' ORDER BY a.date, a.meal_type, a.scan_time';
    }

    db.all(query, params, async (err, rows) => {
        db.close();
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        // Create Workbook
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Attendance Report');

        // Styles
        const headerStyle = {
            font: { bold: true, size: 12, color: { argb: 'FFFFFFFF' } },
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF667EEA' } },
            alignment: { horizontal: 'center' }
        };

        // Add Title Row
        worksheet.mergeCells('A1:G1');
        const titleCell = worksheet.getCell('A1');
        titleCell.value = `Mess Attendance Report (${start_date} to ${end_date})`;
        titleCell.font = { size: 16, bold: true };
        titleCell.alignment = { horizontal: 'center' };

        // Add Headers
        const headerRow = worksheet.getRow(3);
        headerRow.values = ['Date', 'Student ID', 'Name', 'Room', 'Meal Type', 'Scan Time', 'Status'];
        headerRow.eachCell((cell) => {
            cell.style = headerStyle;
        });

        // Add Data
        rows.forEach(row => {
            let status = 'Absent';
            let type = row.meal_type || row.actual_meal_type || meal_type || 'N/A';
            let time = row.scan_time || '-';

            if (row.scan_time) {
                status = row.is_late ? 'Late' : 'Present';
            } else if (includeAbsent) {
                // If report is single day and no scan, it's Absent
                status = 'Absent';
            } else {
                // Should not happen in range report (only present records)
                status = 'Present';
            }

            worksheet.addRow([
                row.date,
                row.student_id,
                row.name,
                row.room_number || 'N/A',
                type,
                time,
                status
            ]);
        });

        // Auto-width columns (simplified)
        worksheet.columns.forEach(column => {
            column.width = 20;
        });
        worksheet.getColumn(3).width = 30; // Name column wider

        // Response Headers
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=attendance_${start_date}_report.xlsx`);

        await workbook.xlsx.write(res);
        res.end();
    });
});

module.exports = router;

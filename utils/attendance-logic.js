const { getDatabase } = require('../database/db');

/**
 * Get current meal type based on time
 * @param {string} currentTime - Time in HH:MM format
 * @returns {Promise<Object|null>} - Meal timing object or null if no active meal
 */
async function getCurrentMealType(currentTime = null) {
    return new Promise((resolve, reject) => {
        const db = getDatabase();

        // If no time provided, use current time
        if (!currentTime) {
            const now = new Date();
            currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        }

        const query = `
            SELECT * FROM meal_timings 
            WHERE active = 1 
            AND time(?) BETWEEN time(start_time) AND time(end_time)
            ORDER BY id
            LIMIT 1
        `;

        db.get(query, [currentTime], (err, row) => {
            db.close();
            if (err) {
                reject(err);
                return;
            }
            resolve(row || null);
        });
    });
}

/**
 * Check if student has already scanned for this meal today
 * @param {string} studentId - Student ID
 * @param {string} mealType - LUNCH or DINNER
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Promise<Object|null>} - Existing attendance record or null
 */
async function checkDuplicateScan(studentId, mealType, date = null) {
    return new Promise((resolve, reject) => {
        const db = getDatabase();

        // If no date provided, use today
        if (!date) {
            const now = new Date();
            date = now.toISOString().split('T')[0];
        }

        const query = `
            SELECT * FROM attendance 
            WHERE student_id = ? 
            AND meal_type = ? 
            AND date = ?
        `;

        db.get(query, [studentId, mealType, date], (err, row) => {
            db.close();
            if (err) {
                reject(err);
                return;
            }
            resolve(row || null);
        });
    });
}

/**
 * Check if scan time is late
 * @param {string} scanTime - Scan time in HH:MM format
 * @param {string} lateWarningTime - Late warning time in HH:MM format
 * @returns {boolean} - True if late
 */
function isLateScan(scanTime, lateWarningTime) {
    if (!lateWarningTime) return false;
    return scanTime > lateWarningTime;
}

/**
 * Validate student's meal plan
 * @param {string} studentId - Student ID
 * @param {string} mealType - LUNCH or DINNER
 * @returns {Promise<boolean>} - True if student is eligible for this meal
 */
async function validateMealPlan(studentId, mealType) {
    return new Promise((resolve, reject) => {
        const db = getDatabase();

        const query = `SELECT meal_plan FROM students WHERE student_id = ? AND active = 1`;

        db.get(query, [studentId], (err, row) => {
            db.close();
            if (err) {
                reject(err);
                return;
            }

            if (!row) {
                resolve(false);
                return;
            }

            const mealPlan = row.meal_plan;

            // Check eligibility
            if (mealPlan === 'FULL') {
                resolve(true);
            } else if (mealPlan === 'LUNCH_ONLY' && mealType === 'LUNCH') {
                resolve(true);
            } else if (mealPlan === 'DINNER_ONLY' && mealType === 'DINNER') {
                resolve(true);
            } else {
                resolve(false);
            }
        });
    });
}

/**
 * Mark attendance for a student
 * @param {string} studentId - Student ID
 * @param {string} mealType - LUNCH or DINNER
 * @param {string} scanTime - Scan time in HH:MM format
 * @param {boolean} isLate - Whether scan is late
 * @returns {Promise<Object>} - Attendance record
 */
async function markAttendance(studentId, mealType, scanTime, isLate = false) {
    return new Promise((resolve, reject) => {
        const db = getDatabase();

        const now = new Date();
        const date = now.toISOString().split('T')[0];

        const query = `
            INSERT INTO attendance (student_id, date, meal_type, scan_time, is_late)
            VALUES (?, ?, ?, ?, ?)
        `;

        db.run(query, [studentId, date, mealType, scanTime, isLate ? 1 : 0], function (err) {
            if (err) {
                db.close();
                reject(err);
                return;
            }

            const attendanceId = this.lastID;

            // Get the full record
            db.get('SELECT * FROM attendance WHERE id = ?', [attendanceId], (err, row) => {
                db.close();
                if (err) {
                    reject(err);
                    return;
                }
                resolve(row);
            });
        });
    });
}

/**
 * Process QR scan - main attendance logic
 * @param {string} studentId - Scanned student ID
 * @returns {Promise<Object>} - Result object with status and message
 */
async function processScan(studentId) {
    try {
        // Get current time
        const now = new Date();
        const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const currentDate = now.toISOString().split('T')[0];

        // 1. Check if it's a valid meal time
        const mealTiming = await getCurrentMealType(currentTime);
        if (!mealTiming) {
            return {
                success: false,
                error: 'NO_MEAL_TIME',
                message: 'कोई meal time active नहीं है'
            };
        }

        const mealType = mealTiming.meal_type;

        // 2. Get student details
        const student = await getStudentById(studentId);
        if (!student) {
            return {
                success: false,
                error: 'STUDENT_NOT_FOUND',
                message: 'Student नहीं मिला'
            };
        }

        if (!student.active) {
            return {
                success: false,
                error: 'STUDENT_INACTIVE',
                message: 'Student inactive है'
            };
        }

        // 3. Validate meal plan
        const isEligible = await validateMealPlan(studentId, mealType);
        if (!isEligible) {
            return {
                success: false,
                error: 'INVALID_MEAL_PLAN',
                message: `आपका ${mealType} plan नहीं है`
            };
        }

        // 4. Check for duplicate scan
        const duplicate = await checkDuplicateScan(studentId, mealType, currentDate);
        if (duplicate) {
            return {
                success: false,
                error: 'DUPLICATE_SCAN',
                message: `${student.name} - Already marked for ${mealType} at ${duplicate.scan_time}`,
                student: student,
                existingRecord: duplicate
            };
        }

        // 5. Check if late
        const isLate = isLateScan(currentTime, mealTiming.late_warning_time);

        // 6. Mark attendance
        const attendance = await markAttendance(studentId, mealType, currentTime, isLate);

        return {
            success: true,
            message: `✅ ${student.name} - ${mealType} marked${isLate ? ' (Late Entry)' : ''}`,
            student: student,
            attendance: attendance,
            mealType: mealType,
            isLate: isLate
        };

    } catch (error) {
        console.error('Error processing scan:', error);
        return {
            success: false,
            error: 'SYSTEM_ERROR',
            message: 'System error occurred'
        };
    }
}

/**
 * Get student by ID
 * @param {string} studentId - Student ID
 * @returns {Promise<Object|null>} - Student object or null
 */
async function getStudentById(studentId) {
    return new Promise((resolve, reject) => {
        const db = getDatabase();

        const query = `SELECT * FROM students WHERE student_id = ?`;

        db.get(query, [studentId], (err, row) => {
            db.close();
            if (err) {
                reject(err);
                return;
            }
            resolve(row || null);
        });
    });
}

module.exports = {
    getCurrentMealType,
    checkDuplicateScan,
    validateMealPlan,
    markAttendance,
    processScan,
    getStudentById
};

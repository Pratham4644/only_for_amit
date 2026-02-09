const { getDatabase } = require('../database/db');

/**
 * Send WhatsApp reminder message to student
 * Using WhatsApp Business API (can be configured with Twilio or local solution)
 */

// For local testing, use a simple HTTP POST to WhatsApp Business API
// In production, integrate with Twilio or similar service

async function sendWhatsAppReminder(studentName, phoneNumber, mealType, reminderTime) {
    try {
        // Format phone number (ensure it starts with country code, e.g., +91 for India)
        let formattedPhone = phoneNumber.trim();
        if (!formattedPhone.startsWith('+')) {
            formattedPhone = '+91' + formattedPhone.replace(/^\+91|^0/, '');
        }

        // Create reminder message based on meal type
        const mealInfo = mealType === 'LUNCH' ? '🍛 Lunch' : '🍜 Dinner';
        const message = `👋 Hi ${studentName}!\n\n${mealInfo} is closing soon at ${reminderTime}.\n\n⏰ Please visit the mess counter now to get your attendance marked.\n\n⚠️ Hurry up! Time is running out.\n\n- Mess Management`;

        console.log(`[WhatsApp] Sending reminder to ${formattedPhone} for ${mealType}`);

        // Method 1: Try using WhatsApp Business API via HTTP
        // This is a local/development approach - configure as needed
        const success = await sendViaAPI(formattedPhone, message, studentName, mealType);

        return {
            success,
            phone: formattedPhone,
            message,
            timestamp: new Date()
        };

    } catch (error) {
        console.error('Error sending WhatsApp reminder:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Send message via available API (local/testing approach)
 * Can be replaced with actual Twilio or WhatsApp Business API
 */
async function sendViaAPI(phoneNumber, message, studentName, mealType) {
    try {
        // For local development/testing:
        // 1. Log the message to console (for testing)
        // 2. In production, integrate with WhatsApp Business API or Twilio

        console.log(`
        ╔════════════════════════════════════════════╗
        ║       📱 WhatsApp Message Sent            ║
        ╠════════════════════════════════════════════╣
        ║ To: ${phoneNumber.padEnd(40)} ║
        ║ Student: ${studentName.padEnd(34)} ║
        ║ Meal: ${mealType.padEnd(38)} ║
        ╠════════════════════════════════════════════╣
        ║ Message:                                   ║
        ║ ${message.split('\n')[0].substring(0, 40).padEnd(40)} ║
        ╚════════════════════════════════════════════╝
        `);

        // Note: Replace this with actual API call in production
        // Example for Twilio:
        /*
        const twilio = require('twilio');
        const client = twilio(accountSid, authToken);
        await client.messages.create({
            from: 'whatsapp:+1234567890',
            to: 'whatsapp:' + phoneNumber,
            body: message
        });
        */

        return true;

    } catch (error) {
        console.error('API Error:', error);
        return false;
    }
}

/**
 * Record reminder in database
 */
async function recordReminder(studentId, date, mealType, phoneNumber, reminderType, deliveryStatus = 'SENT') {
    return new Promise((resolve, reject) => {
        const db = getDatabase();

        const query = `
            INSERT INTO reminders_sent 
            (student_id, date, meal_type, phone_number, reminder_type, delivery_status)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(student_id, date, meal_type, reminder_type) DO UPDATE SET
            delivery_status = excluded.delivery_status,
            sent_at = CURRENT_TIMESTAMP
        `;

        db.run(query, [studentId, date, mealType, phoneNumber, reminderType, deliveryStatus], function (err) {
            db.close();
            if (err) {
                console.error('Error recording reminder:', err);
                reject(err);
            } else {
                resolve({ id: this.lastID });
            }
        });
    });
}

/**
 * Get students who haven't reported yet
 */
async function getAbsentStudents(date, mealType) {
    return new Promise((resolve, reject) => {
        const db = getDatabase();

        // Get all active students eligible for this meal
        let query = `
            SELECT 
                s.student_id,
                s.name,
                s.phone_number,
                s.meal_plan
            FROM students s
            WHERE s.active = 1
            AND (s.meal_plan = 'FULL'
        `;

        if (mealType === 'LUNCH') {
            query += ` OR s.meal_plan = 'LUNCH_ONLY')`;
        } else {
            query += ` OR s.meal_plan = 'DINNER_ONLY')`;
        }

        query += `
            AND s.student_id NOT IN (
                SELECT student_id FROM attendance 
                WHERE date = ? AND meal_type = ?
            )
            AND s.phone_number IS NOT NULL
        `;

        db.all(query, [date, mealType], (err, rows) => {
            db.close();
            if (err) {
                console.error('Error fetching absent students:', err);
                reject(err);
            } else {
                resolve(rows || []);
            }
        });
    });
}

/**
 * Get meal timing
 */
async function getMealTiming(mealType) {
    return new Promise((resolve, reject) => {
        const db = getDatabase();

        const query = `
            SELECT 
                id,
                meal_type,
                start_time,
                end_time,
                late_warning_time
            FROM meal_timings 
            WHERE meal_type = ? AND active = 1
            LIMIT 1
        `;

        db.get(query, [mealType], (err, row) => {
            db.close();
            if (err) {
                console.error('Error fetching meal timing:', err);
                reject(err);
            } else {
                resolve(row);
            }
        });
    });
}

/**
 * Send reminders for a specific meal
 */
async function sendMealReminders(mealType, reminderType = 'WARNING') {
    try {
        const today = new Date().toISOString().split('T')[0];
        const mealTiming = await getMealTiming(mealType);

        if (!mealTiming) {
            console.log(`No meal timing found for ${mealType}`);
            return { success: false, error: 'Meal timing not found' };
        }

        const absentStudents = await getAbsentStudents(today, mealType);
        console.log(`\n📢 Sending ${reminderType} reminders for ${mealType}...`);
        console.log(`Found ${absentStudents.length} absent students`);

        let sentCount = 0;
        let failedCount = 0;

        for (const student of absentStudents) {
            try {
                // Send WhatsApp reminder
                const result = await sendWhatsAppReminder(
                    student.name,
                    student.phone_number,
                    mealType,
                    mealTiming.end_time
                );

                // Record in database
                if (result.success) {
                    await recordReminder(
                        student.student_id,
                        today,
                        mealType,
                        student.phone_number,
                        reminderType,
                        'SENT'
                    );
                    sentCount++;
                } else {
                    await recordReminder(
                        student.student_id,
                        today,
                        mealType,
                        student.phone_number,
                        reminderType,
                        'FAILED'
                    );
                    failedCount++;
                }
            } catch (err) {
                console.error(`Error sending reminder to ${student.name}:`, err);
                failedCount++;
            }
        }

        console.log(`✅ Sent: ${sentCount}, ❌ Failed: ${failedCount}\n`);

        return {
            success: true,
            mealType,
            reminderType,
            totalAbsent: absentStudents.length,
            sent: sentCount,
            failed: failedCount,
            timestamp: new Date()
        };

    } catch (error) {
        console.error('Error in sendMealReminders:', error);
        return { success: false, error: error.message };
    }
}

module.exports = {
    sendWhatsAppReminder,
    recordReminder,
    getAbsentStudents,
    getMealTiming,
    sendMealReminders
};

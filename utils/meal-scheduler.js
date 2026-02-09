/**
 * Meal Reminder Scheduler
 * Automatically sends WhatsApp reminders before meal closing times
 */

const { sendMealReminders, getMealTiming } = require('../utils/whatsapp-reminder');

// Store for scheduled jobs
let scheduledJobs = {};
let isSchedulerRunning = false;

/**
 * Parse time string (HH:MM) and return Date object
 */
function getNextMealReminderTime(timeString, minutesBefore = 15) {
    const [hours, minutes] = timeString.split(':').map(Number);
    const now = new Date();
    const reminderTime = new Date();

    reminderTime.setHours(hours, minutes - minutesBefore, 0, 0);

    // If time has passed today, schedule for tomorrow
    if (reminderTime <= now) {
        reminderTime.setDate(reminderTime.getDate() + 1);
    }

    return reminderTime;
}

/**
 * Calculate delay in milliseconds until next reminder
 */
function getDelayUntilReminder(targetTime) {
    const now = new Date();
    const delay = targetTime - now;
    return Math.max(0, delay);
}

/**
 * Start reminder scheduler
 */
function startScheduler() {
    if (isSchedulerRunning) {
        console.log('⏰ Scheduler is already running');
        return;
    }

    console.log('⏰ Starting meal reminder scheduler...\n');
    isSchedulerRunning = true;

    // Schedule lunch reminders (15 minutes before closing)
    scheduleLunchReminders();

    // Schedule dinner reminders (15 minutes before closing)
    scheduleDinnerReminders();

    // Log scheduled jobs
    console.log('📋 Scheduled Jobs:');
    Object.entries(scheduledJobs).forEach(([key, job]) => {
        console.log(`   - ${key}: ${job.nextRun}`);
    });
    console.log('');
}

/**
 * Schedule lunch reminders
 */
function scheduleLunchReminders() {
    const mealType = 'LUNCH';
    const minutesBefore = 15;

    getMealTiming(mealType).then(mealTiming => {
        if (!mealTiming) {
            console.log('❌ Lunch timing not configured');
            return;
        }

        const reminderTime = getNextMealReminderTime(mealTiming.end_time, minutesBefore);
        const delay = getDelayUntilReminder(reminderTime);

        scheduledJobs.lunch = {
            mealType,
            nextRun: reminderTime.toString(),
            timeMinutesBefore: minutesBefore
        };

        // Schedule the reminder
        setTimeout(() => {
            console.log(`👉 [${new Date().toLocaleTimeString()}] Sending Lunch reminders...`);
            sendMealReminders(mealType, 'WARNING')
                .then(result => {
                    if (result.success) {
                        console.log(`✅ Lunch reminders sent successfully: ${result.sent} sent, ${result.failed} failed`);
                    } else {
                        console.log(`❌ Error sending lunch reminders: ${result.error}`);
                    }
                    // Reschedule for tomorrow
                    scheduleLunchReminders();
                })
                .catch(err => {
                    console.error('Error in lunch reminder:', err);
                    scheduleLunchReminders();
                });
        }, delay);

        console.log(`✅ Lunch reminder scheduled for: ${reminderTime.toLocaleString()}`);
    }).catch(err => {
        console.error('Error scheduling lunch reminders:', err);
    });
}

/**
 * Schedule dinner reminders
 */
function scheduleDinnerReminders() {
    const mealType = 'DINNER';
    const minutesBefore = 15;

    getMealTiming(mealType).then(mealTiming => {
        if (!mealTiming) {
            console.log('❌ Dinner timing not configured');
            return;
        }

        const reminderTime = getNextMealReminderTime(mealTiming.end_time, minutesBefore);
        const delay = getDelayUntilReminder(reminderTime);

        scheduledJobs.dinner = {
            mealType,
            nextRun: reminderTime.toString(),
            timeMinutesBefore: minutesBefore
        };

        // Schedule the reminder
        setTimeout(() => {
            console.log(`👉 [${new Date().toLocaleTimeString()}] Sending Dinner reminders...`);
            sendMealReminders(mealType, 'WARNING')
                .then(result => {
                    if (result.success) {
                        console.log(`✅ Dinner reminders sent successfully: ${result.sent} sent, ${result.failed} failed`);
                    } else {
                        console.log(`❌ Error sending dinner reminders: ${result.error}`);
                    }
                    // Reschedule for tomorrow
                    scheduleDinnerReminders();
                })
                .catch(err => {
                    console.error('Error in dinner reminder:', err);
                    scheduleDinnerReminders();
                });
        }, delay);

        console.log(`✅ Dinner reminder scheduled for: ${reminderTime.toLocaleString()}`);
    }).catch(err => {
        console.error('Error scheduling dinner reminders:', err);
    });
}

/**
 * Stop the scheduler
 */
function stopScheduler() {
    isSchedulerRunning = false;
    scheduledJobs = {};
    console.log('⏰ Scheduler stopped');
}

/**
 * Get scheduler status
 */
function getSchedulerStatus() {
    return {
        running: isSchedulerRunning,
        jobs: scheduledJobs,
        nextReminders: Object.entries(scheduledJobs).map(([key, job]) => ({
            type: job.mealType,
            nextRun: job.nextRun,
            minutesBefore: job.timeMinutesBefore
        }))
    };
}

/**
 * Manually trigger reminders (for testing)
 */
async function triggerManualReminder(mealType) {
    console.log(`🚀 Manually triggering ${mealType} reminders...`);
    return await sendMealReminders(mealType, 'MANUAL_TEST');
}

module.exports = {
    startScheduler,
    stopScheduler,
    getSchedulerStatus,
    triggerManualReminder
};

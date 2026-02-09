# WhatsApp Reminder System Setup Guide

## Overview
This system automatically sends WhatsApp reminders to students who haven't reported to mess before meal closing times.

## Features
- ✅ Automatic reminders 15 minutes before meal closing time
- ✅ WhatsApp message delivery (free and local-friendly)
- ✅ Tracks sent reminders in database
- ✅ Manual trigger option for testing
- ✅ Admin dashboard to monitor reminder status
- ✅ Supports both Lunch and Dinner meals

## Database Schema
New table created: `reminders_sent`
```sql
CREATE TABLE reminders_sent (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT NOT NULL,
    date DATE NOT NULL,
    meal_type TEXT NOT NULL,           -- LUNCH or DINNER
    phone_number TEXT NOT NULL,
    reminder_type TEXT DEFAULT 'WARNING', -- WARNING, FINAL_CALL, MANUAL_TEST
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    delivery_status TEXT DEFAULT 'PENDING', -- PENDING, SENT, FAILED
    error_message TEXT
);
```

## How It Works

### 1. Automatic Scheduler
The system starts automatically when the server starts and:
- Reads meal timings from `meal_timings` table
- Calculates reminder time (15 minutes before meal closing)
- Schedules reminder jobs for each day
- Runs at the scheduled time and sends reminders to absent students

### 2. Reminder Flow
```
➊ Get absent students (those without attendance for today)
    ↓
➋ Get their WhatsApp phone numbers
    ↓
➌ Create WhatsApp message with meal info
    ↓
➍ Send message via WhatsApp
    ↓
➎ Record delivery status in database
```

### 3. WhatsApp Message Example
```
👋 Hi Rahul Kumar!

🍛 Lunch is closing soon at 15:00.

⏰ Please visit the mess counter now to get your attendance marked.

⚠️ Hurry up! Time is running out.

- Mess Management
```

## Configuration

### 1. Meal Timings
Set in Admin Panel → Settings → Meal Timings:
- **Lunch**: 12:00 PM - 3:00 PM (reminder at 2:45 PM)
- **Dinner**: 7:00 PM - 10:00 PM (reminder at 9:45 PM)

### 2. Student Phone Numbers
Students must have valid WhatsApp phone numbers with country code:
- Format: `+919876543210` or `9876543210`
- System automatically adds `+91` prefix if missing

## API Endpoints

### 1. Get Absent Students
```bash
GET /api/reminders/absent/:meal_type
Response: {
  date: "2026-02-08",
  meal_type: "LUNCH",
  total_absent: 5,
  students: [...]
}
```

### 2. Send Reminders Manually
```bash
POST /api/reminders/send/:meal_type
Body: { reminder_type: "WARNING" }
Response: {
  success: true,
  mealType: "LUNCH",
  sent: 5,
  failed: 0
}
```

### 3. Trigger Manual Test
```bash
POST /api/reminders/trigger/:meal_type
Response: { success: true, ... }
```

### 4. Get Reminder Statistics
```bash
GET /api/reminders/stats/today
Response: {
  date: "2026-02-08",
  lunch: { sent: 5, failed: 0, pending: 0 },
  dinner: { sent: 3, failed: 1, pending: 0 }
}
```

### 5. Get Scheduler Status
```bash
GET /api/reminders/scheduler/status
Response: {
  running: true,
  jobs: { lunch: {...}, dinner: {...} },
  nextReminders: [...]
}
```

### 6. Reminder History
```bash
GET /api/reminders/history/:student_id
Response: {
  student_id: "101",
  reminders: [...]
}
```

## Admin Dashboard Usage

### Access Reminders Section
1. Open Admin Panel → http://localhost:3000/admin
2. Click "📱 Reminders" in sidebar
3. View today's reminder statistics

### Features in Dashboard

#### Today's Reminders Section
- **Refresh Stats**: Update reminder statistics
- **Send Lunch Reminder**: Manually trigger lunch reminders
- **Send Dinner Reminder**: Manually trigger dinner reminders

#### Statistics Cards
- Shows sent, failed, and pending counts for each meal
- Real-time updates when refreshed

#### Absent Students List
- Tab view for Lunch and Dinner
- Shows all students who haven't reported yet
- Displays student ID, name, phone number, and meal plan
- Sorted by student ID

#### Automatic Scheduler Status
- Shows if scheduler is running
- Displays next scheduled reminder times
- Indicates system health

## Integration with WhatsApp

### Current Implementation (Development Mode)
- Logs messages to console for testing
- Shows formatted message preview

### Production Integration Options

#### Option 1: Twilio WhatsApp API (Recommended)
```javascript
// In whatsapp-reminder.js, replace sendViaAPI function
const twilio = require('twilio');
const client = twilio(accountSid, authToken);

await client.messages.create({
    from: 'whatsapp:+1234567890',
    to: 'whatsapp:' + phoneNumber,
    body: message
});
```

#### Option 2: WhatsApp Business API
Use official WhatsApp Business API with your phone number

#### Option 3: Local WhatsApp Web
Use `whatsapp-web.js` library for local automation

## Testing

### Test Manually
1. Go to Admin Panel → Reminders
2. Click "Send Lunch Reminder" or "Send Dinner Reminder"
3. Check console for message preview
4. View "Absent Students" list to confirm recipients

### Test Automatic Scheduler
1. Check server console for scheduler startup logs
2. Set meal timing close to current time (e.g., 10 minutes away)
3. Wait for scheduled reminder time
4. Check refresh stats for confirmation

## Reminder Status Codes
- **PENDING**: Message queued for sending
- **SENT**: Successfully delivered to student
- **FAILED**: Delivery failed, check error_message

## Troubleshooting

### Issue: No reminders sending
**Solution**: 
1. Check student phone numbers are valid (with country code)
2. Verify meal timings are configured in Settings
3. Check server logs for scheduler messages
4. Ensure students have no attendance mark for the day

### Issue: "No students found"
**Possible reasons**:
- All students already marked attendance
- No students have phone numbers saved
- Meal timing not configured

### Issue: Scheduler not starting
**Solution**:
1. Check database connection is successful
2. Verify meal_timings table has entries
3. Check server logs for errors
4. Restart server

## Database Queries for Analysis

### Get reminder statistics for today
```sql
SELECT meal_type, delivery_status, COUNT(*) as count
FROM reminders_sent
WHERE date = DATE('now')
GROUP BY meal_type, delivery_status;
```

### Get failed reminders
```sql
SELECT * FROM reminders_sent
WHERE delivery_status = 'FAILED'
ORDER BY sent_at DESC;
```

### Get most frequently reminded students
```sql
SELECT student_id, COUNT(*) as reminder_count
FROM reminders_sent
GROUP BY student_id
ORDER BY reminder_count DESC
LIMIT 10;
```

## Future Enhancements
- [ ] SMS fallback for WhatsApp failures
- [ ] Customizable reminder message templates
- [ ] Multiple reminder escalation (WARNING → FINAL_CALL)
- [ ] Student opt-in/opt-out preferences
- [ ] Reminder delivery analytics dashboard
- [ ] Integration with SMS APIs (Twilio, fast2sms)
- [ ] Email reminders as fallback

## Support
For issues or questions about the reminder system, check:
- Server console logs for diagnostic messages
- Database reminders_sent table for delivery status
- Admin dashboard Scheduler Status section

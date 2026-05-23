-- Mess Attendance System Database Schema

-- Students table: Master data for all students
CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT UNIQUE NOT NULL,  -- Unique student ID (e.g., "101", "102")
    name TEXT NOT NULL,
    student_department TEXT,
    phone_number TEXT,  -- Phone number for WhatsApp
    photo_path TEXT,  -- Path to student photo
    meal_plan TEXT DEFAULT 'FULL',  -- FULL, LUNCH_ONLY, DINNER_ONLY
    active INTEGER DEFAULT 1,  -- 1 = active, 0 = inactive
    join_date TEXT,  -- Student official enrollment/joining date
    mess_price REAL,  -- Individual monthly price override for the mess
    student_profile_update DATE,
    payment_upto DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Meal timings configuration
CREATE TABLE IF NOT EXISTS meal_timings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meal_type TEXT NOT NULL,  -- LUNCH or DINNER
    start_time TEXT NOT NULL,  -- Format: "HH:MM" (e.g., "12:00")
    end_time TEXT NOT NULL,    -- Format: "HH:MM" (e.g., "15:00")
    late_warning_time TEXT,    -- Time after which to show late warning
    active INTEGER DEFAULT 1
);

-- Attendance records
CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT NOT NULL,
    date DATE NOT NULL,
    meal_type TEXT NOT NULL,  -- LUNCH or DINNER
    scan_time TIME NOT NULL,
    is_late INTEGER DEFAULT 0,  -- 1 if scanned after late_warning_time
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(student_id),
    UNIQUE(student_id, date, meal_type)  -- Prevent duplicate scans
);

-- Reminder tracking table
CREATE TABLE IF NOT EXISTS reminders_sent (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT NOT NULL,
    date DATE NOT NULL,
    meal_type TEXT NOT NULL,  -- LUNCH or DINNER
    phone_number TEXT NOT NULL,
    reminder_type TEXT DEFAULT 'WARNING',  -- WARNING, FINAL_CALL
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    delivery_status TEXT DEFAULT 'PENDING',  -- PENDING, SENT, FAILED
    error_message TEXT,
    FOREIGN KEY (student_id) REFERENCES students(student_id),
    UNIQUE(student_id, date, meal_type, reminder_type)
);

-- System settings
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_meal ON attendance(meal_type);
CREATE INDEX IF NOT EXISTS idx_students_active ON students(active);
CREATE INDEX IF NOT EXISTS idx_reminders_sent ON reminders_sent(student_id, date, meal_type);
CREATE INDEX IF NOT EXISTS idx_reminders_delivery ON reminders_sent(delivery_status);

-- Insert default meal timings
INSERT OR IGNORE INTO meal_timings (meal_type, start_time, end_time, late_warning_time) VALUES
('LUNCH', '12:00', '15:00', '14:30'),
('DINNER', '19:00', '22:00', '21:00');

-- Insert default settings
INSERT OR IGNORE INTO settings (key, value) VALUES
('system_name', 'Mess Attendance System'),
('duplicate_prevention', 'true'),
('show_late_warnings', 'true');

-- Meal prices configuration
CREATE TABLE IF NOT EXISTS meal_prices (
    meal_plan TEXT PRIMARY KEY, -- FULL, LUNCH_ONLY, DINNER_ONLY
    price INTEGER NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert default meal prices
INSERT OR IGNORE INTO meal_prices (meal_plan, price) VALUES
('FULL', 2500),
('LUNCH_ONLY', 1500),
('DINNER_ONLY', 1600);
-- ─────────────────────────────────────────────────────────────────────────────
-- PAYMENT TRACKING SYSTEM
-- ─────────────────────────────────────────────────────────────────────────────

-- Fee settings: monthly fee per meal plan and vacation threshold
CREATE TABLE IF NOT EXISTS fee_settings (
    meal_plan TEXT PRIMARY KEY,                  -- 'FULL', 'LUNCH_ONLY', 'DINNER_ONLY'
    monthly_fee REAL NOT NULL,                   -- fee in rupees (e.g. 3000.00)
    vacation_threshold_days INTEGER DEFAULT 6,   -- If absent_days > threshold → deduct; else 0
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO fee_settings (meal_plan, monthly_fee, vacation_threshold_days) VALUES
    ('FULL',         3000, 6),
    ('LUNCH_ONLY',   1800, 6),
    ('DINNER_ONLY',  1500, 6);

-- Monthly bills: one row per student per month
CREATE TABLE IF NOT EXISTS monthly_bills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT NOT NULL,
    month TEXT NOT NULL,                          -- 'YYYY-MM'
    meal_plan TEXT NOT NULL,                      -- snapshot of plan at billing time
    base_fee REAL NOT NULL,                       -- fee_settings.monthly_fee at billing time
    total_days_in_month INTEGER NOT NULL,         -- e.g. 31 for May
    absent_days REAL NOT NULL DEFAULT 0,          -- can be 0.5 increments
    vacation_threshold_days INTEGER NOT NULL,
    deduction REAL NOT NULL DEFAULT 0,
    -- IF absent_days > vacation_threshold_days:
    --     deduction = round((base_fee / total_days_in_month) * absent_days, 2)
    -- ELSE: deduction = 0
    final_bill REAL NOT NULL,                     -- base_fee - deduction
    notes TEXT,
    generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(student_id),
    UNIQUE(student_id, month)
);

-- Payment records: every individual payment made by a student
CREATE TABLE IF NOT EXISTS payment_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT NOT NULL,
    payment_date DATE NOT NULL,                   -- 'YYYY-MM-DD'
    amount REAL NOT NULL,                         -- amount paid in rupees
    payment_mode TEXT NOT NULL,                   -- 'CASH', 'UPI', 'BANK_TRANSFER', 'OTHER'
    reference_note TEXT,                          -- optional UPI ref, cheque no, or any note
    recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(student_id)
);

-- Indexes for payment tables
CREATE INDEX IF NOT EXISTS idx_monthly_bills_student ON monthly_bills(student_id);
CREATE INDEX IF NOT EXISTS idx_monthly_bills_month   ON monthly_bills(month);
CREATE INDEX IF NOT EXISTS idx_payment_records_student ON payment_records(student_id);
CREATE INDEX IF NOT EXISTS idx_payment_records_date    ON payment_records(payment_date);

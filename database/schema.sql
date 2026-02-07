-- Mess Attendance System Database Schema

-- Students table: Master data for all students
CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT UNIQUE NOT NULL,  -- Unique student ID (e.g., "101", "102")
    name TEXT NOT NULL,
    room_number TEXT,
    phone_number TEXT,  -- Phone number for WhatsApp
    photo_path TEXT,  -- Path to student photo
    meal_plan TEXT DEFAULT 'FULL',  -- FULL, LUNCH_ONLY, DINNER_ONLY
    active INTEGER DEFAULT 1,  -- 1 = active, 0 = inactive
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

-- Insert default meal timings
INSERT OR IGNORE INTO meal_timings (meal_type, start_time, end_time, late_warning_time) VALUES
('LUNCH', '12:00', '15:00', '14:30'),
('DINNER', '19:00', '22:00', '21:00');

-- Insert default settings
INSERT OR IGNORE INTO settings (key, value) VALUES
('system_name', 'Mess Attendance System'),
('duplicate_prevention', 'true'),
('show_late_warnings', 'true');

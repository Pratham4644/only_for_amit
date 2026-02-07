# 🍽️ Mess Attendance System

A comprehensive QR code-based attendance system for mess/cafeteria management with time-based lunch and dinner tracking, duplicate prevention, and real-time reporting.

## ✨ Features

### Core Functionality
- **Single QR Card**: Each student gets one QR card for both lunch and dinner
- **Time-Based Detection**: System automatically detects whether it's lunch or dinner time
- **Duplicate Prevention**: Prevents students from scanning twice for the same meal
- **Real-Time Tracking**: Live attendance counting and statistics
- **Late Entry Warnings**: Configurable late entry detection
- **Meal Plan Support**: Different plans (Full, Lunch Only, Dinner Only)

### Counter Screen
- Live QR code scanner with webcam support
- Real-time student information display with photo
- Current meal type indicator
- Live attendance counter for lunch and dinner
- Success/error message display with animations

### Admin Panel
- **Dashboard**: Overview of today's attendance with statistics
- **Student Management**: Add, edit, delete students with photo upload
- **QR Code Generation**: Generate and print QR codes for students
- **Reports**: Date range reports with CSV export
- **Settings**: Configure meal timings and late warnings

## 🚀 Quick Start

### Prerequisites
- Node.js (v14 or higher)
- Webcam or QR scanner device for counter screen

### Installation

1. **Install dependencies**:
```bash
npm install
```

2. **Start the server**:
```bash
npm start
```

3. **Access the system**:
- Home Page: http://localhost:3000
- Counter Screen: http://localhost:3000/counter
- Admin Panel: http://localhost:3000/admin

## 📱 Usage Guide

### Setting Up Students

1. Go to Admin Panel → Students
2. Click "Add Student"
3. Fill in student details:
   - Student ID (required)
   - Name (required)
   - Room Number (optional)
   - Meal Plan (Full/Lunch Only/Dinner Only)
   - Photo (optional)
4. Click "Add Student"
5. QR code will be generated automatically
6. Print the QR code for the student

### Configuring Meal Timings

1. Go to Admin Panel → Settings
2. Configure timings for Lunch and Dinner:
   - Start Time (e.g., 12:00 for lunch)
   - End Time (e.g., 15:00 for lunch)
   - Late Warning Time (e.g., 14:30 for lunch)
3. Changes are saved automatically

### Using Counter Screen

1. Open Counter Screen on the computer at mess counter
2. Allow camera access when prompted
3. Students scan their QR cards
4. System automatically:
   - Detects current meal type (Lunch/Dinner)
   - Checks for duplicates
   - Validates meal plan
   - Marks attendance
   - Shows student info and confirmation

### Generating Reports

1. Go to Admin Panel → Reports
2. Select date range
3. Choose meal type (or All)
4. Click "Generate Report"
5. View results or click "Export CSV" to download

## 🗂️ Project Structure

```
buddy,s project/
├── database/
│   ├── schema.sql          # Database schema
│   ├── db.js              # Database connection
│   └── mess_attendance.db # SQLite database (auto-created)
├── routes/
│   ├── students.js        # Student API routes
│   ├── attendance.js      # Attendance API routes
│   └── settings.js        # Settings API routes
├── utils/
│   ├── qr-generator.js    # QR code generation
│   └── attendance-logic.js # Attendance processing logic
├── public/
│   ├── index.html         # Home page
│   ├── counter/           # Counter screen
│   │   ├── index.html
│   │   ├── style.css
│   │   └── scanner.js
│   └── admin/             # Admin panel
│       ├── index.html
│       ├── style.css
│       └── app.js
├── uploads/               # Student photos (auto-created)
├── server.js             # Main Express server
└── package.json          # Dependencies
```

## 🔧 API Endpoints

### Students
- `GET /api/students` - Get all students
- `GET /api/students/:id` - Get single student
- `POST /api/students` - Create new student
- `PUT /api/students/:id` - Update student
- `DELETE /api/students/:id` - Delete student
- `GET /api/students/:id/qr` - Get student's QR code

### Attendance
- `POST /api/attendance/scan` - Process QR scan
- `GET /api/attendance/today` - Get today's attendance
- `GET /api/attendance/today/count` - Get today's count
- `GET /api/attendance/report` - Generate report
- `GET /api/attendance/absent` - Get absent students
- `GET /api/attendance/current-meal` - Get current meal status

### Settings
- `GET /api/settings` - Get all settings
- `GET /api/settings/meal-timings` - Get meal timings
- `PUT /api/settings/meal-timings/:id` - Update meal timing

## 📊 Database Schema

### Students Table
- `student_id` - Unique student identifier
- `name` - Student name
- `room_number` - Room number
- `photo_path` - Path to photo
- `meal_plan` - FULL, LUNCH_ONLY, or DINNER_ONLY
- `active` - Active status

### Attendance Table
- `student_id` - Reference to student
- `date` - Attendance date
- `meal_type` - LUNCH or DINNER
- `scan_time` - Time of scan
- `is_late` - Late entry flag

### Meal Timings Table
- `meal_type` - LUNCH or DINNER
- `start_time` - Meal start time
- `end_time` - Meal end time
- `late_warning_time` - Late warning threshold

## 🎯 How It Works

### Attendance Flow

1. **Student Scans QR Code**
   - QR code contains student ID

2. **System Checks Current Time**
   - Determines if it's lunch time (12:00-15:00) or dinner time (19:00-22:00)
   - If outside meal times, shows error

3. **Validates Student**
   - Checks if student exists and is active
   - Validates meal plan eligibility

4. **Checks for Duplicates**
   - Searches for existing attendance for this student, date, and meal type
   - If found, shows warning with previous scan time

5. **Marks Attendance**
   - Records attendance with timestamp
   - Flags as late if after warning time
   - Shows success message with student info

6. **Updates Statistics**
   - Increments meal counter
   - Updates dashboard

## 🔐 Security Notes

- This is a basic implementation for local/internal use
- For production deployment, consider adding:
  - User authentication for admin panel
  - HTTPS encryption
  - Input validation and sanitization
  - Rate limiting
  - Backup mechanisms

## 🛠️ Troubleshooting

### Camera Not Working
- Check browser permissions for camera access
- Try different browsers (Chrome recommended)
- Ensure webcam is connected and working

### QR Code Not Scanning
- Ensure good lighting
- Hold QR code steady and clear
- Check QR code quality (print clearly)

### Database Errors
- Delete `database/mess_attendance.db` and restart server
- Check file permissions

## 📝 Future Enhancements

- SMS/WhatsApp notifications for absent students
- Monthly billing calculation
- Student mobile app
- Multiple shift support
- Biometric integration
- Cloud backup
- Multi-location support

## 📄 License

This project is open source and available for educational and commercial use.

## 👨‍💻 Support

For issues or questions, please check the code comments or create an issue in the repository.

---

**Built with ❤️ for efficient mess management**

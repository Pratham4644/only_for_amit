# Quick Start Guide - Mess Attendance System

## 🚀 Getting Started in 3 Steps

### Step 1: Start the Server
```bash
cd "c:\Users\bs529\OneDrive\Desktop\buddy,s project"
npm start
```

You should see:
```
✅ Server started on port 3000
📍 Counter Screen: http://localhost:3000/counter
📍 Admin Panel: http://localhost:3000/admin
```

### Step 2: Add Students (Admin Panel)

1. Open browser: `http://localhost:3000/admin`
2. Click **"Students"** in sidebar
3. Click **"+ Add Student"** button
4. Fill in details:
   - Student ID: `101`
   - Name: `Rahul Kumar`
   - Department: `Computer Science`
   - Meal Plan: `Full (Lunch + Dinner)`
5. Click **"Add Student"**
6. QR code will open in new window - **Print it!**

### Step 3: Start Scanning (Counter Screen)

1. Open browser: `http://localhost:3000/counter`
2. Allow camera access when prompted
3. Point camera at QR code
4. See instant attendance marking!

---

## 📱 Sample QR Cards

We've already added 5 test students for you:

| ID | Name | Department | Meal Plan |
|----|------|------|-----------|
| 101 | Rahul Kumar | 205 | Full |
| 102 | Priya Sharma | 301 | Full |
| 103 | Amit Patel | 208 | Full |
| 104 | Sneha Reddy | 405 | Lunch Only |
| 105 | Rohan Singh | 112 | Dinner Only |

**To get their QR codes:**
1. Go to Admin Panel → Students
2. Click "QR" button next to any student
3. Print the QR code

---

## ⏰ How Time-Based Detection Works

### Default Meal Timings:
- **Lunch**: 12:00 PM - 3:00 PM (Late after 2:30 PM)
- **Dinner**: 7:00 PM - 10:00 PM (Late after 9:00 PM)

### What Happens When You Scan:

**Scenario 1: Scan at 1:00 PM (Lunch Time)**
```
✅ Rahul Kumar - LUNCH marked - 1:00 PM
```

**Scenario 2: Scan at 8:00 PM (Dinner Time)**
```
✅ Rahul Kumar - DINNER marked - 8:00 PM
```

**Scenario 3: Scan at 5:00 PM (No Meal Time)**
```
❌ कोई meal time active नहीं है
```

**Scenario 4: Scan Twice at Lunch**
```
First scan (1:00 PM):
✅ Rahul Kumar - LUNCH marked - 1:00 PM

Second scan (1:10 PM):
⚠️ Rahul Kumar - Already marked for LUNCH at 1:00 PM
```

---

## 🎯 Common Tasks

### Change Meal Timings
1. Admin Panel → Settings
2. Update times for Lunch/Dinner
3. Changes apply immediately

### Generate Daily Report
1. Admin Panel → Reports
2. Select today's date for both start and end
3. Click "Generate Report"
4. Click "Export CSV" to download

### View Today's Attendance
1. Admin Panel → Dashboard
2. See live statistics:
   - Total students
   - Lunch present/absent
   - Dinner present/absent

### Print QR Cards for All Students
1. Admin Panel → Students
2. Click "QR" for each student
3. Print from browser (Ctrl+P)

---

## 🔧 Troubleshooting

### Camera Not Working?
- Check browser permissions (allow camera)
- Try Chrome browser (recommended)
- Ensure webcam is connected

### QR Not Scanning?
- Ensure good lighting
- Hold QR code steady
- Make sure QR is printed clearly

### Student Not Found?
- Check if student is added in Admin Panel
- Verify student is marked as "Active"

---

## 📊 Understanding the Counter Screen

```
┌─────────────────────────────────────┐
│  🍽️ MESS ATTENDANCE SYSTEM         │
│  Date: Monday, 3 February 2026      │
│  Time: 1:15:30 PM                   │
│  Current Meal: LUNCH                │ ← Auto-detected
├─────────────────────────────────────┤
│  [QR Scanner Camera View]           │
│  📱 Ready to scan...                │
├─────────────────────────────────────┤
│  ✅ LAST SCAN:                      │
│  [Photo] Rahul Kumar (101)          │
│          Department: Computer Science     │
│          LUNCH marked at 1:15 PM    │
├─────────────────────────────────────┤
│  Today's Count:                     │
│  🍛 Lunch:  45/100                  │ ← Live counter
│  🍜 Dinner: 0/100                   │
└─────────────────────────────────────┘
```

---

## 🎉 You're All Set!

The system is ready to use. Just:
1. ✅ Server is running
2. ✅ Test students are added
3. ✅ QR codes can be generated
4. ✅ Counter screen is ready
5. ✅ Admin panel is accessible

**Start scanning and tracking attendance!** 🚀

For detailed documentation, see [README.md](file:///c:/Users/bs529/OneDrive/Desktop/buddy,s%20project/README.md)

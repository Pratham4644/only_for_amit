import qrcode
import sqlite3
from datetime import datetime, timedelta
import cv2

# Connect to database
conn = sqlite3.connect('attendance.db')
cursor = conn.cursor()

cursor.execute('''
CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL 
)
''')

cursor.execute('''
CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER,
    timestamp TEXT NOT NULL,
    lunch_date TEXT NOT NULL,
    FOREIGN KEY (member_id) REFERENCES members (id)
)
''')

conn.commit()

def get_lunch_date(current_time):
    hour = current_time.hour
    if 12 <= hour < 15:  # 12-3pm
        return current_time.date()
    elif 19 <= hour < 23:  # 7-11pm
        return current_time.date() + timedelta(days=1)
    else:
        return None  # Not allowed time

def scan_qr():
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("Cannot open camera")
        return None

    detector = cv2.QRCodeDetector()
    print("Scanning QR code... Press 'q' to quit scanning.")
    while True:
        ret, frame = cap.read()
        if not ret:
            print("Failed to grab frame")
            break

        retval, decoded_info, points, straight_qrcode = detector.detectAndDecodeMulti(frame)
        if retval:
            for data in decoded_info:
                if data.startswith("Name:"):
                    name = data[5:]  # Remove "Name:" prefix
                    cap.release()
                    cv2.destroyAllWindows()
                    return name

        cv2.imshow('QR Scanner', frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()
    return None

while True:
    print("1. Add member and generate QR")
    print("2. Scan QR for attendance")
    print("3. View members")
    print("4. View attendance history")
    print("5. Exit")
    choice = input("Choose option: ")

    if choice == "1":
        name = input("Enter name: ")
        # Check if member exists, if not add
        cursor.execute('SELECT id FROM members WHERE name = ?', (name,))
        member = cursor.fetchone()
        if member is None:
            cursor.execute('INSERT INTO members (name) VALUES (?)', (name,))
            member_id = cursor.lastrowid
            print(f"New member added: {name}")
        else:
            member_id = member[0]
            print(f"Member already exists: {name}")

        # Generate QR code with just name
        data = f"Name:{name}"
        qr = qrcode.make(data)
        filename = f"{name}.png"
        qr.save(filename)
        print(f"QR code generated: {filename}\n")

    elif choice == "2":
        name = scan_qr()
        if name is None:
            print("No QR code scanned.\n")
            continue

        # Check if member exists
        cursor.execute('SELECT id FROM members WHERE name = ?', (name,))
        member = cursor.fetchone()
        if member is None:
            print(f"Member not found: {name}\n")
            continue
        member_id = member[0]

        # Get current time
        now = datetime.now()
        lunch_date = get_lunch_date(now)

        if lunch_date is None:
            print("Attendance not allowed at this time.\n")
            continue

        # Insert attendance record
        cursor.execute('INSERT INTO attendance (member_id, timestamp, lunch_date) VALUES (?, ?, ?)',
                       (member_id, now.isoformat(), lunch_date.isoformat()))
        conn.commit()

        print(f"Attendance recorded for {name} on {lunch_date.isoformat()}\n")

    elif choice == "3":
        cursor.execute('SELECT id, name FROM members')
        members = cursor.fetchall()
        if members:
            print("Members:")
            for member in members:
                print(f"ID: {member[0]}, Name: {member[1]}")
        else:
            print("No members found.")
        print()

    elif choice == "4":
        cursor.execute('''
        SELECT m.name, a.timestamp, a.lunch_date
        FROM attendance a
        JOIN members m ON a.member_id = m.id
        ORDER BY a.timestamp DESC
        ''')
        records = cursor.fetchall()
        if records:
            print("Attendance History:")
            for record in records:
                print(f"Name: {record[0]}, Timestamp: {record[1]}, Lunch Date: {record[2]}")
        else:
            print("No attendance records found.")
        print()

    elif choice == "5":
        break

    else:
        print("Invalid choice\n")

conn.close()

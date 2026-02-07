// API base URL
const API_BASE = '/api';

// QR Scanner instance
let html5QrCode;
let isScanning = false;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initializeScanner();
    updateDateTime();
    updateCurrentMeal();
    updateTodayCount();

    // Update time every second
    setInterval(updateDateTime, 1000);

    // Update meal and count every 30 seconds
    setInterval(updateCurrentMeal, 30000);
    setInterval(updateTodayCount, 30000);
});

// Update date and time display
function updateDateTime() {
    const now = new Date();

    const dateOptions = {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    };
    const dateStr = now.toLocaleDateString('en-IN', dateOptions);

    const timeStr = now.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });

    document.getElementById('currentDate').textContent = dateStr;
    document.getElementById('currentTime').textContent = timeStr;
}

// Update current meal indicator
async function updateCurrentMeal() {
    try {
        const response = await fetch(`${API_BASE}/attendance/current-meal`);
        const data = await response.json();

        const mealElement = document.getElementById('currentMeal');

        if (data.active) {
            mealElement.textContent = data.meal_type;
            mealElement.style.color = '#fff';
        } else {
            mealElement.textContent = 'No Active Meal';
            mealElement.style.opacity = '0.7';
        }
    } catch (error) {
        console.error('Error fetching current meal:', error);
        document.getElementById('currentMeal').textContent = 'Error';
    }
}

// Update today's count
// Update today's count
async function updateTodayCount() {
    try {
        const response = await fetch(`${API_BASE}/attendance/today/count`);
        const data = await response.json();

        // Update Lunch Stats
        document.getElementById('lunchPresent').textContent = data.lunch.present;
        document.getElementById('lunchAbsent').textContent = data.lunch.absent;
        document.getElementById('lunchTotal').textContent = data.total_students;

        // Update Dinner Stats
        document.getElementById('dinnerPresent').textContent = data.dinner.present;
        document.getElementById('dinnerAbsent').textContent = data.dinner.absent;
        document.getElementById('dinnerTotal').textContent = data.total_students;

        // Update Live Session Stats
        const sessionStats = document.getElementById('liveSessionStats');
        if (data.current_meal) {
            sessionStats.style.display = 'block';
            const currentMealLower = data.current_meal.toLowerCase();
            document.getElementById('sessionPresent').textContent = data[currentMealLower].present;
            document.getElementById('sessionAbsent').textContent = data[currentMealLower].absent;
        } else {
            sessionStats.style.display = 'none';
        }

    } catch (error) {
        console.error('Error fetching today count:', error);
    }
}

// Initialize QR scanner
function initializeScanner() {
    html5QrCode = new Html5Qrcode("qr-reader");

    const config = {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0
    };

    html5QrCode.start(
        { facingMode: "environment" },
        config,
        onScanSuccess,
        onScanError
    ).then(() => {
        isScanning = true;
        updateScannerStatus('Ready to scan...');
    }).catch(err => {
        console.error('Error starting scanner:', err);
        updateScannerStatus('Camera error. Please check permissions.');
    });
}

// Handle successful scan
async function onScanSuccess(decodedText, decodedResult) {
    if (!isScanning) return;

    // Temporarily pause scanning to prevent multiple scans
    isScanning = false;
    updateScannerStatus('Processing...');

    // Process the scan
    await processAttendance(decodedText);

    // Resume scanning after 2 seconds
    setTimeout(() => {
        isScanning = true;
        updateScannerStatus('Ready to scan...');
    }, 2000);
}

// Handle scan errors (ignore most)
function onScanError(errorMessage) {
    // Ignore common scanning errors
}

// Process attendance
async function processAttendance(studentId) {
    try {
        const response = await fetch(`${API_BASE}/attendance/scan`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ student_id: studentId })
        });

        const data = await response.json();

        if (data.success) {
            showSuccess(data);
        } else {
            showError(data);
        }

        // Update count
        updateTodayCount();

    } catch (error) {
        console.error('Error processing attendance:', error);
        showMessage('System error occurred', 'error');
    }
}

// Show success message
function showSuccess(data) {
    const messageBox = document.getElementById('messageBox');
    const studentInfo = document.getElementById('studentInfo');

    // Update message
    messageBox.textContent = data.message;
    messageBox.className = 'message-box success';

    // Show student info
    document.getElementById('studentName').textContent = data.student.name;
    document.getElementById('studentId').textContent = data.student.student_id;
    document.getElementById('studentRoom').textContent = data.student.room_number || 'N/A';
    document.getElementById('scanTime').textContent = data.attendance.scan_time;

    // Set photo
    const photoElement = document.getElementById('studentPhoto');
    if (data.student.photo_path) {
        photoElement.src = '/' + data.student.photo_path;
    } else {
        photoElement.src = 'https://via.placeholder.com/150?text=No+Photo';
    }

    studentInfo.style.display = 'flex';

    // Add to Recent Scans List
    addToRecentScans(data.student.name, data.attendance.scan_time);

    // Play success sound (optional)
    playSound('success');
}

// Add to Recent Scans List
function addToRecentScans(name, time) {
    const container = document.getElementById('recentScansContainer');
    const list = document.getElementById('recentScansList');

    container.style.display = 'block';

    const li = document.createElement('li');
    li.style.padding = '8px 0';
    li.style.borderBottom = '1px solid #f9f9f9';
    li.innerHTML = `
        <div style="display: flex; justify-content: space-between;">
            <span style="font-weight: 600;">${name}</span>
            <span style="color: #667eea; font-weight: 500;">${time}</span>
        </div>
    `;

    // Insert at top
    if (list.firstChild) {
        list.insertBefore(li, list.firstChild);
    } else {
        list.appendChild(li);
    }

    // Keep only last 10
    while (list.children.length > 10) {
        list.removeChild(list.lastChild);
    }
}

// Show error message
function showError(data) {
    const messageBox = document.getElementById('messageBox');
    const studentInfo = document.getElementById('studentInfo');

    messageBox.textContent = data.message;

    if (data.error === 'DUPLICATE_SCAN') {
        messageBox.className = 'message-box warning';

        // Show student info for duplicate
        if (data.student) {
            document.getElementById('studentName').textContent = data.student.name;
            document.getElementById('studentId').textContent = data.student.student_id;
            document.getElementById('studentRoom').textContent = data.student.room_number || 'N/A';
            document.getElementById('scanTime').textContent = data.existingRecord.scan_time;

            const photoElement = document.getElementById('studentPhoto');
            if (data.student.photo_path) {
                photoElement.src = '/' + data.student.photo_path;
            } else {
                photoElement.src = 'https://via.placeholder.com/150?text=No+Photo';
            }

            studentInfo.style.display = 'flex';
        }
    } else {
        messageBox.className = 'message-box error';
        studentInfo.style.display = 'none';
    }

    // Play error sound (optional)
    playSound('error');
}

// Show generic message
function showMessage(message, type = 'info') {
    const messageBox = document.getElementById('messageBox');
    messageBox.textContent = message;
    messageBox.className = `message-box ${type}`;
}

// Update scanner status
function updateScannerStatus(status) {
    document.getElementById('scannerStatus').innerHTML = `<p>📱 ${status}</p>`;
}

// Play sound (optional - requires audio files)
function playSound(type) {
    // You can add audio files and play them here
    // const audio = new Audio(`/sounds/${type}.mp3`);
    // audio.play();
}

// API base URL
const API_BASE = '/api';

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    loadDashboard();
    updateDate();
});

// Update date display
function updateDate() {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-IN', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    document.getElementById('dashDate').textContent = dateStr;
}

// Navigation
function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();

            // Remove active class from all
            navItems.forEach(nav => nav.classList.remove('active'));
            document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));

            // Add active class to clicked
            item.classList.add('active');
            const pageName = item.dataset.page;
            document.getElementById(`page-${pageName}`).classList.add('active');

            // Load page data
            loadPageData(pageName);
        });
    });
}

// Load page data
function loadPageData(pageName) {
    switch (pageName) {
        case 'dashboard':
            loadDashboard();
            break;
        case 'students':
            loadStudents();
            break;
        case 'reports':
            initReports();
            break;
        case 'settings':
            loadSettings();
            break;
        case 'leave':
            initLeavePage();
            break;
    }
}

// Dashboard
async function loadDashboard() {
    try {
        // Load stats
        const countResponse = await fetch(`${API_BASE}/attendance/today/count`);
        const countData = await countResponse.json();

        document.getElementById('totalStudents').textContent = countData.total_students;
        document.getElementById('lunchPresent').textContent = countData.lunch.present;
        document.getElementById('lunchAbsent').textContent = countData.lunch.absent;
        document.getElementById('dinnerPresent').textContent = countData.dinner.present;
        document.getElementById('dinnerAbsent').textContent = countData.dinner.absent;

        // Update Current Meal Banner
        const mealDash = document.getElementById('currentMealDash');
        const mealTime = document.getElementById('currentMealTime');
        const liveIndicator = document.getElementById('liveIndicator');
        const banner = document.getElementById('currentMealBanner');

        if (countData.current_meal) {
            mealDash.textContent = countData.current_meal;
            liveIndicator.style.display = 'flex';
            banner.classList.add('live');

            // Get timing details if available (we might need a separate call or update the API)
            // For now, let's assume we can fetch it or just show the name
            try {
                const mealResponse = await fetch(`${API_BASE}/attendance/current-meal`);
                const mealData = await mealResponse.json();
                if (mealData.active) {
                    mealTime.textContent = `${mealData.start_time} - ${mealData.end_time}`;
                }
            } catch (e) { }
        } else {
            mealDash.textContent = 'NO ACTIVE MEAL';
            mealTime.textContent = '';
            liveIndicator.style.display = 'none';
            banner.classList.remove('live');
        }

        // Load recent attendance
        const todayResponse = await fetch(`${API_BASE}/attendance/today`);
        const todayData = await todayResponse.json();

        const allRecords = [...todayData.lunch.records, ...todayData.dinner.records];
        allRecords.sort((a, b) => new Date(`${a.date} ${a.scan_time}`) - new Date(`${b.date} ${b.scan_time}`));
        const recentRecords = allRecords.slice(-10).reverse();

        const tbody = document.getElementById('recentTableBody');
        tbody.innerHTML = '';

        if (recentRecords.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center">No attendance records today</td></tr>';
        } else {
            recentRecords.forEach(record => {
                const isLate = record.is_late;
                const statusClass = isLate ? 'status-late' : 'status-present';
                const statusIcon = isLate ? '!' : '✓';
                const statusText = isLate ? 'Late' : 'Present';

                const row = `
                    <tr>
                        <td>${record.student_id}</td>
                        <td>${record.name}</td>
                        <td><span class="badge ${record.meal_type === 'LUNCH' ? 'badge-warning' : 'badge-success'}">${record.meal_type}</span></td>
                        <td>${record.scan_time}</td>
                        <td>
                            <div class="status-badge ${statusClass}">
                                <div class="status-dot">${statusIcon}</div>
                                <span>${statusText}</span>
                            </div>
                        </td>
                    </tr>
                `;
                tbody.innerHTML += row;
            });
        }
    } catch (error) {
        console.error('Error loading dashboard:', error);
    }
}

// Students
async function loadStudents() {
    try {
        const response = await fetch(`${API_BASE}/students`);
        const data = await response.json();

        const tbody = document.getElementById('studentsTableBody');
        tbody.innerHTML = '';

        let lunchPresent = 0;
        let dinnerPresent = 0;
        const totalEligibleLunch = data.students.filter(s => s.meal_plan === 'FULL' || s.meal_plan === 'LUNCH_ONLY').length;
        const totalEligibleDinner = data.students.filter(s => s.meal_plan === 'FULL' || s.meal_plan === 'DINNER_ONLY').length;

        if (data.students.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">No students found</td></tr>';
        } else {
            data.students.forEach(student => {
                const hasPhone = student.phone_number && student.phone_number.trim();

                // Attendance Status
                const isLunchPresent = student.lunch_time !== null;
                const isDinnerPresent = student.dinner_time !== null;
                if (isLunchPresent) lunchPresent++;
                if (isDinnerPresent) dinnerPresent++;

                const lunchBadge = isLunchPresent ?
                    `<span class="badge badge-success" title="Present at ${student.lunch_time}">L: ✓</span>` :
                    `<span class="badge badge-danger">L: ✗</span>`;

                const dinnerBadge = isDinnerPresent ?
                    `<span class="badge badge-success" title="Present at ${student.dinner_time}">D: ✓</span>` :
                    `<span class="badge badge-danger">D: ✗</span>`;

                const row = `
                    <tr>
                        <td>${student.student_id}</td>
                        <td>${student.name}</td>
                        <td>${student.student_department || 'N/A'}</td>
                        <td><span class="badge badge-warning" style="background:#e0e4ff; color:#6c5ce7;">${student.meal_plan}</span></td>
                        <td>
                            <div style="display: flex; gap: 5px;">
                                ${lunchBadge}
                                ${dinnerBadge}
                            </div>
                        </td>
                        <td>
                            <div style="display: flex; gap: 5px;">
                                ${hasPhone ?
                        `<button class="btn-success" style="padding: 5px 10px; font-size: 0.8rem;" onclick="sendQRWhatsApp('${student.student_id}', '${student.phone_number}', '${student.name}')">📱 WA</button>` :
                        `<button class="btn-success" style="padding: 5px 10px; font-size: 0.8rem;" onclick="viewQR('${student.student_id}')">QR</button>`
                    }
                                <button class="btn-danger" style="padding: 5px 10px; font-size: 0.8rem;" onclick="deleteStudent('${student.student_id}')">Del</button>
                            </div>
                        </td>
                    </tr>
                `;
                tbody.innerHTML += row;
            });
        }

        // Update stats
        document.getElementById('studentStatsLunch').textContent = `${lunchPresent} / ${totalEligibleLunch - lunchPresent}`;
        document.getElementById('studentStatsDinner').textContent = `${dinnerPresent} / ${totalEligibleDinner - dinnerPresent}`;

    } catch (error) {
        console.error('Error loading students:', error);
    }
}

function filterStudents() {
    const searchValue = document.getElementById('studentSearch').value.toLowerCase();
    const rows = document.querySelectorAll('#studentsTableBody tr');

    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(searchValue) ? '' : 'none';
    });
}

// Add Student Modal
function showAddStudentModal() {
    document.getElementById('addStudentModal').classList.add('active');
}

function closeAddStudentModal() {
    document.getElementById('addStudentModal').classList.remove('active');
    document.getElementById('addStudentForm').reset();
}

async function addStudent(event) {
    event.preventDefault();

    const form = event.target;
    const formData = new FormData(form);

    try {
        const response = await fetch(`${API_BASE}/students`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (response.ok) {
            alert('Student added successfully!');
            closeAddStudentModal();
            loadStudents();

            // Show QR code
            // If phone number provided, offer to send via WhatsApp
            if (data.student.phone_number && data.qr_code) {
                const sendNow = confirm(`Student added! Send QR code to ${data.student.name} via WhatsApp now?`);
                if (sendNow) {
                    sendQRWhatsApp(data.student.student_id, data.student.phone_number, data.student.name);
                }
            } else if (data.qr_code) {
                showQRCode(data.student.student_id, data.qr_code);
            }
        } else {
            alert('Error: ' + data.error);
        }
    } catch (error) {
        console.error('Error adding student:', error);
        alert('Error adding student');
    }
}

async function deleteStudent(studentId) {
    if (!confirm(`Are you sure you want to delete student ${studentId}?`)) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/students/${studentId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            alert('Student deleted successfully');
            loadStudents();
        } else {
            alert('Error deleting student');
        }
    } catch (error) {
        console.error('Error deleting student:', error);
        alert('Error deleting student');
    }
}

async function viewQR(studentId) {
    try {
        // Get student details first to get phone number
        const studentResponse = await fetch(`${API_BASE}/students/${studentId}`);
        const studentData = await studentResponse.json();

        const response = await fetch(`${API_BASE}/students/${studentId}/qr`);
        const data = await response.json();

        if (studentData.student) {
            showQRCode(studentId, data.qr_code, studentData.student.phone_number, studentData.student.name);
        } else {
            showQRCode(studentId, data.qr_code);
        }
    } catch (error) {
        console.error('Error fetching QR code:', error);
        alert('Error fetching QR code');
    }
}

async function sendQRWhatsApp(studentId, phoneNumber, studentName) {
    try {
        // Fetch QR code
        const response = await fetch(`${API_BASE}/students/${studentId}/qr`);
        const data = await response.json();

        if (!data.qr_code) {
            alert('Failed to generate QR code');
            return;
        }

        // Create message
        const message = `Hello ${studentName}! 👋\n\nHere is your Mess Attendance QR Card.\n\n📱 Student ID: ${studentId}\n🍽️ Use this QR code for both Lunch and Dinner attendance.\n\nPlease save this QR code and show it at the mess counter during meal times.\n\nThank you!`;

        // WhatsApp Web API - opens WhatsApp with pre-filled message
        // Note: QR code image needs to be sent separately by the user
        const whatsappUrl = `https://wa.me/${phoneNumber.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(message)}`;

        // Show QR code in new window for user to download and send
        const win = window.open('', '_blank', 'width=600,height=700');
        win.document.write(`
            <html>
            <head>
                <title>Send QR Code - ${studentId}</title>
                <style>
                    body { 
                        font-family: Arial; 
                        text-align: center; 
                        padding: 30px;
                        background: #f5f5f5;
                    }
                    .container {
                        background: white;
                        padding: 30px;
                        border-radius: 15px;
                        max-width: 500px;
                        margin: 0 auto;
                    }
                    h1 { color: #667eea; margin-bottom: 10px; }
                    .info { color: #666; margin-bottom: 20px; }
                    img { margin: 20px 0; max-width: 300px; }
                    .steps {
                        text-align: left;
                        background: #f9f9f9;
                        padding: 20px;
                        border-radius: 10px;
                        margin: 20px 0;
                    }
                    .steps h3 { color: #667eea; margin-bottom: 10px; }
                    .steps ol { padding-left: 20px; }
                    .steps li { margin: 10px 0; }
                    button {
                        padding: 15px 30px;
                        background: #25D366;
                        color: white;
                        border: none;
                        border-radius: 8px;
                        cursor: pointer;
                        font-size: 1.1rem;
                        margin: 10px;
                        font-weight: 600;
                    }
                    button:hover { background: #20BA5A; }
                    .btn-secondary {
                        background: #667eea;
                    }
                    .btn-secondary:hover { background: #5568d3; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>📱 Send QR Code via WhatsApp</h1>
                    <p class="info">Student: <strong>${studentName}</strong> (${studentId})</p>
                    
                    <img src="${data.qr_code}" alt="QR Code" id="qrImage">
                    
                    <div class="steps">
                        <h3>How to send:</h3>
                        <ol>
                            <li>Click "Download QR Code" to save the image</li>
                            <li>Click "Open WhatsApp" to open chat with student</li>
                            <li>Attach the downloaded QR code image in WhatsApp</li>
                            <li>Send the message!</li>
                        </ol>
                    </div>
                    
                    <button onclick="downloadQR()">⬇️ Download QR Code</button>
                    <br>
                    <button onclick="window.open('${whatsappUrl}', '_blank')">💬 Open WhatsApp</button>
                    <br>
                    <button class="btn-secondary" onclick="window.close()">Close</button>
                </div>
                
                <script>
                    function downloadQR() {
                        const link = document.createElement('a');
                        link.href = document.getElementById('qrImage').src;
                        link.download = 'QR_${studentId}_${studentName.replace(/\\s+/g, '_')}.png';
                        link.click();
                        alert('QR Code downloaded! Now click "Open WhatsApp" to send it.');
                    }
                </script>
            </body>
            </html>
        `);

    } catch (error) {
        console.error('Error sending QR via WhatsApp:', error);
        alert('Error preparing WhatsApp message');
    }
}

function showQRCode(studentId, qrDataUrl, phoneNumber = null, studentName = null) {
    const win = window.open('', '_blank', 'width=600,height=700');

    let whatsappSection = '';
    if (phoneNumber && studentName) {
        const message = `Hello ${studentName}! 👋\\n\\nHere is your Mess Attendance QR Card.\\n\\n📱 Student ID: ${studentId}\\n🍽️ Use this QR code for both Lunch and Dinner attendance.\\n\\nPlease save this QR code and show it at the mess counter during meal times.\\n\\nThank you!`;
        const whatsappUrl = `https://wa.me/${phoneNumber.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(message)}`;

        whatsappSection = `
            <div class="whatsapp-section">
                <h3>Has WhatsApp?</h3>
                <button class="btn-whatsapp" onclick="window.open('${whatsappUrl}', '_blank')">💬 Open WhatsApp Chat</button>
                <p class="small-hint">Download QR first, then attach in chat</p>
            </div>
        `;
    }

    win.document.write(`
        <html>
        <head>
            <title>QR Code - ${studentId}</title>
            <style>
                body { 
                    font-family: Arial; 
                    text-align: center; 
                    padding: 30px;
                    background: #f5f5f5;
                }
                .container {
                    background: white;
                    padding: 30px;
                    border-radius: 15px;
                    max-width: 500px;
                    margin: 0 auto;
                }
                h1 { color: #667eea; margin-bottom: 10px; }
                .warning { 
                    color: #f45c43; 
                    font-weight: 600; 
                    background: #fff3cd;
                    padding: 10px;
                    border-radius: 8px;
                    margin: 10px 0;
                }
                img { margin: 20px 0; max-width: 300px; }
                .info {
                    background: #e3f2fd;
                    padding: 15px;
                    border-radius: 8px;
                    margin: 20px 0;
                    text-align: left;
                }
                .info h3 { color: #667eea; margin-bottom: 10px; }
                .info p { margin: 5px 0; color: #666; }
                button {
                    padding: 15px 30px;
                    background: #667eea;
                    color: white;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 1.1rem;
                    margin: 10px;
                    font-weight: 600;
                }
                button:hover { background: #5568d3; }
                .btn-download {
                    background: #4CAF50;
                }
                .btn-download:hover { background: #45a049; }
                .btn-whatsapp {
                    background: #25D366;
                }
                .btn-whatsapp:hover { background: #20BA5A; }
                .whatsapp-section {
                    margin-top: 20px;
                    padding-top: 20px;
                    border-top: 1px solid #eee;
                }
                .small-hint {
                    font-size: 0.9rem;
                    color: #888;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>Student ID: ${studentId}</h1>
                ${!phoneNumber ? '<p class="warning">⚠️ No phone number on file</p>' : ''}
                
                <img src="${qrDataUrl}" alt="QR Code" id="qrImage">
                
                <div class="info">
                    <h3>📤 How to Send:</h3>
                    <p>1. Click "Download QR Code" below</p>
                    <p>2. Send the downloaded image via WhatsApp, Email, or any messaging app</p>
                    <p>3. Student can save it on their phone</p>
                </div>
                
                <button class="btn-download" onclick="downloadQR()">⬇️ Download QR Code</button>
                
                ${whatsappSection}
                
                <br>
                <button onclick="window.close()">Close</button>
            </div>
            
            <script>
                function downloadQR() {
                    const link = document.createElement('a');
                    link.href = document.getElementById('qrImage').src;
                    link.download = 'QR_${studentId}.png';
                    link.click();
                    alert('QR Code downloaded! You can now send it to the student via WhatsApp, Email, or any messaging app.');
                }
            </script>
        </body>
        </html>
    `);
}

// Reports
function initReports() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('reportStartDate').value = today;
    document.getElementById('reportEndDate').value = today;
}

async function generateReport() {
    const startDate = document.getElementById('reportStartDate').value;
    const endDate = document.getElementById('reportEndDate').value;
    const mealType = document.getElementById('reportMealType').value;

    if (!startDate || !endDate) {
        alert('Please select date range');
        return;
    }

    try {
        let url = `${API_BASE}/attendance/report?start_date=${startDate}&end_date=${endDate}&include_absent=true`;
        if (mealType) {
            url += `&meal_type=${mealType}`;
        }

        const response = await fetch(url);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (!data.records) {
            throw new Error('Invalid response format');
        }

        displayReport(data);
    } catch (error) {
        console.error('Error generating report:', error);
        alert('Error generating report: ' + error.message);
    }
}

function displayReport(data) {
    const container = document.getElementById('reportResults');

    if (!data.records || data.records.length === 0) {
        container.innerHTML = '<p class="text-center">No records found for selected criteria</p>';
        return;
    }

    let html = `
        <h3>Report: ${data.start_date} to ${data.end_date}</h3>
        <p>Total Records: ${data.count}</p>
        <div style="overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse;">
            <thead>
                <tr style="background-color: #f5f5f5;">
                    <th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">Date</th>
                    <th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">Student ID</th>
                    <th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">Name</th>
                    <th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">Department</th>
                    <th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">Meal Type</th>
                    <th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">Time</th>
                    <th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">Status</th>
                </tr>
            </thead>
            <tbody>
    `;

    data.records.forEach(record => {
        html += `
            <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 10px;">${record.date}</td>
                <td style="padding: 10px;">${record.student_id}</td>
                <td style="padding: 10px;">${record.name}</td>
                <td style="padding: 10px;">${record.student_department || 'N/A'}</td>
                <td style="padding: 10px;">${record.meal_type || 'N/A'}</td>
                <td style="padding: 10px;">${record.scan_time || '-'}</td>
                <td style="padding: 10px;"><span style="padding: 5px 10px; border-radius: 5px; font-weight: bold; ${record.status === 'Present' ? 'background-color: #4CAF50; color: white;' : record.status === 'Late' ? 'background-color: #FF9800; color: white;' : 'background-color: #f44336; color: white;'}">${record.status || 'Absent'}</span></td>
            </tr>
        `;
    });

    html += `
            </tbody>
        </table>
        </div>
    `;
    container.innerHTML = html;
}

function exportExcel() {
    const startDate = document.getElementById('reportStartDate').value;
    const endDate = document.getElementById('reportEndDate').value;
    const mealType = document.getElementById('reportMealType').value;

    if (!startDate || !endDate) {
        alert('Please select date range');
        return;
    }

    let url = `${API_BASE}/attendance/export-excel?start_date=${startDate}&end_date=${endDate}`;
    if (mealType) {
        url += `&meal_type=${mealType}`;
    }

    // Direct download by opening in new window/tab
    window.open(url, '_blank');
}

// Settings
async function loadSettings() {
    try {
        const response = await fetch(`${API_BASE}/settings/meal-timings`);
        const data = await response.json();

        const container = document.getElementById('mealTimingsContainer');
        container.innerHTML = '';

        // Get only one LUNCH and one DINNER timing
        const lunchTiming = data.meal_timings.find(timing => timing.meal_type === 'LUNCH');
        const dinnerTiming = data.meal_timings.find(timing => timing.meal_type === 'DINNER');
        const timingsToDisplay = [];
        if (lunchTiming) timingsToDisplay.push(lunchTiming);
        if (dinnerTiming) timingsToDisplay.push(dinnerTiming);

        // Helper function to convert 24-hour to 12-hour format
        function to12Hour(time24) {
            if (!time24) return '';
            const [hours, minutes] = time24.split(':');
            let hour = parseInt(hours);
            const ampm = hour >= 12 ? 'PM' : 'AM';
            hour = hour % 12 || 12;
            return `${hour}:${minutes} ${ampm}`;
        }

        // Helper function to convert 12-hour to 24-hour format
        function to24Hour(time12) {
            if (!time12) return '';
            const match = time12.match(/(\d+):(\d+)\s*(AM|PM)/i);
            if (!match) return time12;

            let [, hours, minutes, period] = match;
            hours = parseInt(hours);

            if (period.toUpperCase() === 'PM' && hours !== 12) {
                hours += 12;
            } else if (period.toUpperCase() === 'AM' && hours === 12) {
                hours = 0;
            }

            return `${hours.toString().padStart(2, '0')}:${minutes}`;
        }

        timingsToDisplay.forEach(timing => {
            const mealLabel = timing.meal_type === 'LUNCH' ? 'Lunch Time' : 'Dinner Time';
            const card = `
                <div class="timing-card">
                    <h3>${mealLabel}</h3>
                    <div class="timing-fields">
                        <div class="form-group">
                            <label>Start Time</label>
                            <input type="text" value="${to12Hour(timing.start_time)}" 
                                   placeholder="e.g., 12:00 PM"
                                   onchange="updateTiming12Hour(${timing.id}, 'start_time', this.value)">
                        </div>
                        <div class="form-group">
                            <label>End Time</label>
                            <input type="text" value="${to12Hour(timing.end_time)}"
                                   placeholder="e.g., 3:00 PM"
                                   onchange="updateTiming12Hour(${timing.id}, 'end_time', this.value)">
                        </div>
                        <div class="form-group">
                            <label>Late Warning Time</label>
                            <input type="text" value="${to12Hour(timing.late_warning_time || '')}"
                                   placeholder="e.g., 2:30 PM"
                                   onchange="updateTiming12Hour(${timing.id}, 'late_warning_time', this.value)">
                        </div>
                    </div>
                </div>
            `;
            container.innerHTML += card;
        });

        // Store the conversion function globally for use in updateTiming12Hour
        window.to24Hour = to24Hour;
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

async function updateTiming(id, field, value) {
    try {
        const response = await fetch(`${API_BASE}/settings/meal-timings/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ [field]: value })
        });

        if (response.ok) {
            alert('Timing updated successfully');
        } else {
            alert('Error updating timing');
        }
    } catch (error) {
        console.error('Error updating timing:', error);
        alert('Error updating timing');
    }
}

// New function to handle 12-hour format updates
async function updateTiming12Hour(id, field, value12Hour) {
    // Convert 12-hour format to 24-hour format
    const value24Hour = window.to24Hour(value12Hour);

    try {
        const response = await fetch(`${API_BASE}/settings/meal-timings/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ [field]: value24Hour })
        });

        if (response.ok) {
            alert('Timing updated successfully');
        } else {
            alert('Error updating timing');
        }
    } catch (error) {
        console.error('Error updating timing:', error);
        alert('Error updating timing');
    }
}

// ============== REMINDERS SECTION ==============

let currentAbsentTab = 'LUNCH';

// Load reminder statistics for today
async function loadReminderStats() {
    try {
        const response = await fetch(`${API_BASE}/reminders/stats/today`);
        const data = await response.json();

        // Update lunch stats
        document.getElementById('lunchSent').textContent = data.lunch.sent || 0;
        document.getElementById('lunchFailed').textContent = data.lunch.failed || 0;
        document.getElementById('lunchPending').textContent = data.lunch.pending || 0;

        // Update dinner stats
        document.getElementById('dinnerSent').textContent = data.dinner.sent || 0;
        document.getElementById('dinnerFailed').textContent = data.dinner.failed || 0;
        document.getElementById('dinnerPending').textContent = data.dinner.pending || 0;

        // Load absent students
        await loadAbsentStudents(currentAbsentTab);
        await loadSchedulerStatus();
    } catch (error) {
        console.error('Error loading reminder stats:', error);
        alert('Error loading reminder statistics');
    }
}

// Load absent students for a meal type
async function loadAbsentStudents(mealType) {
    try {
        const response = await fetch(`${API_BASE}/reminders/absent/${mealType}`);
        const data = await response.json();

        const listContainer = document.getElementById('absentStudentsList');

        if (data.students.length === 0) {
            listContainer.innerHTML = `<p class="text-center">✅ All students marked attendance for ${mealType}!</p>`;
            return;
        }

        let html = `
            <p class="text-center" style="color: #666; margin-bottom: 15px;">
                ${data.total_absent} students haven't reported yet
            </p>
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="background-color: #f5f5f5;">
                        <th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">Student ID</th>
                        <th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">Name</th>
                        <th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">Phone</th>
                        <th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">Plan</th>
                    </tr>
                </thead>
                <tbody>
        `;

        data.students.forEach(student => {
            html += `
                <tr style="border-bottom: 1px solid #eee;">
                    <td style="padding: 10px;">${student.student_id}</td>
                    <td style="padding: 10px;">${student.name}</td>
                    <td style="padding: 10px;">${student.phone_number || 'N/A'}</td>
                    <td style="padding: 10px;"><span style="background: #e0e4ff; color: #6c5ce7; padding: 5px 10px; border-radius: 5px;">${student.meal_plan}</span></td>
                </tr>
            `;
        });

        html += `
                </tbody>
            </table>
        `;

        listContainer.innerHTML = html;
    } catch (error) {
        console.error('Error loading absent students:', error);
        document.getElementById('absentStudentsList').innerHTML = '<p class="text-center" style="color: red;">Error loading absent students</p>';
    }
}

// Switch absent students tab
function switchAbsentTab(mealType) {
    currentAbsentTab = mealType;

    // Update button active states
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');

    // Load absent students
    loadAbsentStudents(mealType);
}

// Trigger manual reminder
async function triggerReminder(mealType) {
    if (!confirm(`Send manual ${mealType} reminder to all absent students?`)) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/reminders/trigger/${mealType}`, {
            method: 'POST'
        });

        const data = await response.json();

        if (data.success) {
            alert(`✅ ${data.mealType} reminders sent!\n\nSent: ${data.sent}\nFailed: ${data.failed}`);
            await loadReminderStats();
        } else {
            alert(`❌ Error: ${data.error}`);
        }
    } catch (error) {
        console.error('Error triggering reminder:', error);
        alert('Error sending reminders');
    }
}

// Load scheduler status
async function loadSchedulerStatus() {
    try {
        const response = await fetch(`${API_BASE}/reminders/scheduler/status`);
        const data = await response.json();

        const statusBox = document.getElementById('schedulerStatusBox');
        let html = '';

        if (data.running) {
            html += `
                <div style="background: #e8f5e9; border-left: 4px solid #4CAF50; padding: 15px; border-radius: 5px;">
                    <p style="color: #2e7d32; font-weight: bold;">✅ Scheduler is RUNNING</p>
                    <div style="margin-top: 10px; font-size: 0.9rem; color: #555;">
            `;

            data.nextReminders.forEach(reminder => {
                html += `<p>⏰ ${reminder.type}: ${new Date(reminder.nextRun).toLocaleString()}</p>`;
            });

            html += `
                    </div>
                </div>
            `;
        } else {
            html += `
                <div style="background: #ffebee; border-left: 4px solid #f44336; padding: 15px; border-radius: 5px;">
                    <p style="color: #c62828; font-weight: bold;">❌ Scheduler is STOPPED</p>
                    <p style="font-size: 0.9rem; color: #555; margin-top: 10px;">Automatic reminders are not active.</p>
                </div>
            `;
        }

        statusBox.innerHTML = html;
    } catch (error) {
        console.error('Error loading scheduler status:', error);
    }
}

// Add reminders to page load
(function () {
    const originalLoadPageData = window.loadPageData;
    window.loadPageData = function (pageName) {
        originalLoadPageData(pageName);

        if (pageName === 'reminders') {
            loadReminderStats();
        }
    };
})();

// ====================================================================
// LEAVE CREDITS MODULE
// ====================================================================

// ── State ────────────────────────────────────────────────────────────
let activeLeaveTab = 'requests';

// ── Init ─────────────────────────────────────────────────────────────
function initLeavePage() {
    // Default filter month = current month
    const today = new Date();
    const ym = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    document.getElementById('leaveFilterMonth').value  = ym;
    document.getElementById('creditFilterMonth').value = ym;
    document.getElementById('computeMonth') && (document.getElementById('computeMonth').value = ym);

    loadLeaveStats();
    loadLeaveRequests();
}

// ── Stats ─────────────────────────────────────────────────────────────
async function loadLeaveStats() {
    try {
        const [reqRes, credRes] = await Promise.all([
            fetch(`${API_BASE}/leave/requests`),
            fetch(`${API_BASE}/leave/credits`),
        ]);
        const reqData  = await reqRes.json();
        const credData = await credRes.json();

        const pending  = (reqData.requests  || []).filter(r => r.status === 'PENDING').length;
        const approved = (reqData.requests  || []).filter(r => r.status === 'APPROVED').length;
        const computed = (credData.credits  || []).length;
        const applied  = (credData.credits  || []).filter(c => c.status === 'APPLIED').length;

        document.getElementById('leaveStatPending').textContent  = pending;
        document.getElementById('leaveStatApproved').textContent = approved;
        document.getElementById('leaveStatCredits').textContent  = computed;
        document.getElementById('leaveStatApplied').textContent  = applied;
    } catch (e) {
        console.error('Error loading leave stats:', e);
    }
}

// ── Tabs ─────────────────────────────────────────────────────────────
function switchLeaveTab(tab) {
    activeLeaveTab = tab;

    document.querySelectorAll('.leave-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.leave-panel').forEach(panel => panel.classList.remove('active'));

    document.getElementById(`leaveTab_${tab}`).classList.add('active');
    document.getElementById(`leavePanel_${tab}`).classList.add('active');

    if (tab === 'requests') loadLeaveRequests();
    else loadCreditRecords();
}

// ── Leave Requests ────────────────────────────────────────────────────
async function loadLeaveRequests() {
    const status = document.getElementById('leaveFilterStatus').value;
    const month  = document.getElementById('leaveFilterMonth').value;

    let url = `${API_BASE}/leave/requests?`;
    if (status) url += `status=${status}&`;
    if (month)  url += `month=${month}&`;

    const tbody = document.getElementById('leaveRequestsBody');
    tbody.innerHTML = '<tr><td colspan="10" class="text-center">Loading…</td></tr>';

    try {
        const res  = await fetch(url);
        const data = await res.json();
        const rows = data.requests || [];

        if (rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" class="text-center">No leave requests found</td></tr>';
            return;
        }

        tbody.innerHTML = rows.map(r => {
            const statusClass = r.status === 'APPROVED' ? 'leave-status-approved'
                              : r.status === 'REJECTED' ? 'leave-status-rejected'
                              : 'leave-status-pending';

            const typeLabel = r.is_half_day
                ? `<span class="badge badge-warning">½ ${r.half_day_meal || ''}</span>`
                : `<span class="badge badge-success">Full</span>`;

            const actions = r.status === 'PENDING' ? `
                <div style="display:flex;gap:0.4rem;">
                    <button class="btn-success" style="padding:4px 10px;font-size:0.9rem;"
                        onclick="approveLeave(${r.id})">✓ Approve</button>
                    <button class="btn-danger" style="padding:4px 10px;font-size:0.9rem;"
                        onclick="rejectLeave(${r.id})">✗ Reject</button>
                    <button class="btn-secondary" style="padding:4px 8px;font-size:0.85rem;"
                        onclick="deleteLeave(${r.id})">🗑</button>
                </div>` : '—';

            return `
                <tr>
                    <td>${r.id}</td>
                    <td>
                        <strong>${r.student_id}</strong>
                        ${r.student_name ? `<br><small style="color:var(--text-secondary)">${r.student_name}</small>` : ''}
                    </td>
                    <td>${r.from_date}</td>
                    <td>${r.to_date}</td>
                    <td><strong>${r.total_days}</strong></td>
                    <td>${typeLabel}</td>
                    <td>${r.month}</td>
                    <td style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${r.reason || ''}">${r.reason || '—'}</td>
                    <td><span class="leave-status-badge ${statusClass}">${r.status}</span></td>
                    <td>${actions}</td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="10" class="text-center" style="color:red">Error: ${err.message}</td></tr>`;
    }
}

async function approveLeave(id) {
    if (!confirm(`Approve leave request #${id}?`)) return;
    try {
        const res  = await fetch(`${API_BASE}/leave/requests/${id}/approve`, { method: 'PUT' });
        const data = await res.json();
        if (res.ok) {
            showLeaveToast(`✅ Approved! ${data.days_credited} day(s) → credit month: ${data.credit_month}`);
            loadLeaveRequests();
            loadLeaveStats();
        } else {
            alert('Error: ' + data.error);
        }
    } catch (err) { alert('Error: ' + err.message); }
}

async function rejectLeave(id) {
    if (!confirm(`Reject leave request #${id}?`)) return;
    try {
        const res = await fetch(`${API_BASE}/leave/requests/${id}/reject`, { method: 'PUT' });
        if (res.ok) {
            showLeaveToast('❌ Request rejected.');
            loadLeaveRequests();
            loadLeaveStats();
        } else {
            const d = await res.json();
            alert('Error: ' + d.error);
        }
    } catch (err) { alert('Error: ' + err.message); }
}

async function deleteLeave(id) {
    if (!confirm(`Delete pending request #${id}?`)) return;
    try {
        const res = await fetch(`${API_BASE}/leave/requests/${id}`, { method: 'DELETE' });
        if (res.ok) {
            showLeaveToast('🗑 Request deleted.');
            loadLeaveRequests();
            loadLeaveStats();
        } else {
            const d = await res.json();
            alert('Error: ' + d.error);
        }
    } catch (err) { alert('Error: ' + err.message); }
}

// ── Credit Records ────────────────────────────────────────────────────
async function loadCreditRecords() {
    const month  = document.getElementById('creditFilterMonth').value;
    const status = document.getElementById('creditFilterStatus').value;

    let url = `${API_BASE}/leave/credits?`;
    if (month)  url += `month=${month}&`;
    if (status) url += `status=${status}&`;

    const tbody = document.getElementById('creditRecordsBody');
    tbody.innerHTML = '<tr><td colspan="7" class="text-center">Loading…</td></tr>';

    try {
        const res  = await fetch(url);
        const data = await res.json();
        const rows = data.credits || [];

        if (rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center">No credit records found</td></tr>';
            return;
        }

        tbody.innerHTML = rows.map(r => {
            const srcBadgeClass = r.source === 'manual' ? 'badge-warning'
                                : r.source === 'merged' ? 'badge-success'
                                : '';
            const statusClass = r.status === 'APPLIED' ? 'leave-status-approved' : 'leave-status-pending';

            return `
                <tr>
                    <td>
                        <strong>${r.student_id}</strong>
                        ${r.student_name ? `<br><small style="color:var(--text-secondary)">${r.student_name}</small>` : ''}
                    </td>
                    <td>${r.leave_month}</td>
                    <td>${r.credit_month}</td>
                    <td class="leave-credit-days">${r.absent_days}</td>
                    <td class="leave-credit-days" style="color:var(--success);">${r.credit_days}</td>
                    <td><span class="badge ${srcBadgeClass}" style="text-transform:uppercase;">${r.source}</span></td>
                    <td><span class="leave-status-badge ${statusClass}">${r.status}</span></td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="color:red">Error: ${err.message}</td></tr>`;
    }
}

// ── Leave Request Modal ───────────────────────────────────────────────
function showLeaveRequestModal() {
    document.getElementById('leaveRequestForm').reset();
    document.getElementById('halfDayMealGroup').style.display = 'none';
    document.getElementById('leaveDayPreview').style.display  = 'none';
    document.getElementById('leaveRequestModal').classList.add('active');
}

function closeLeaveRequestModal() {
    document.getElementById('leaveRequestModal').classList.remove('active');
}

function toggleHalfDayMeal() {
    const isHalfDay = document.getElementById('leaveIsHalfDay').checked;
    document.getElementById('halfDayMealGroup').style.display = isHalfDay ? 'block' : 'none';
    updateLeaveDayPreview();
}

function updateLeaveDayPreview() {
    const from = document.getElementById('leaveFromDate').value;
    const to   = document.getElementById('leaveToDate').value;
    const isHD = document.getElementById('leaveIsHalfDay').checked;
    const prev = document.getElementById('leaveDayPreview');

    if (!from || !to) { prev.style.display = 'none'; return; }

    let totalDays;
    if (isHD) {
        totalDays = 0.5;
    } else {
        const ms    = new Date(to) - new Date(from);
        totalDays   = Math.round(ms / 86400000) + 1;
    }

    const qualifies = totalDays >= 4;
    prev.style.display = 'block';
    prev.className = `leave-day-preview ${qualifies ? 'preview-qualifies' : 'preview-pending'}`;
    prev.innerHTML = `
        <span>📅 ${totalDays} day(s)</span>
        <span>${qualifies ? '✅ Qualifies for credit (≥ 4 days)' : `⚠️ ${(4 - totalDays).toFixed(1)} more day(s) needed`}</span>
    `;
}

async function submitLeaveRequest(event) {
    event.preventDefault();
    const student_id    = document.getElementById('leaveStudentId').value.trim();
    const from_date     = document.getElementById('leaveFromDate').value;
    const to_date       = document.getElementById('leaveToDate').value;
    const is_half_day   = document.getElementById('leaveIsHalfDay').checked;
    const half_day_meal = document.getElementById('leaveHalfDayMeal').value;
    const reason        = document.getElementById('leaveReason').value.trim();

    try {
        const res  = await fetch(`${API_BASE}/leave/request`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ student_id, from_date, to_date, is_half_day, half_day_meal, reason }),
        });
        const data = await res.json();

        if (res.ok) {
            closeLeaveRequestModal();
            showLeaveToast(`✅ Leave submitted! ${data.total_days} day(s) — ${data.month} — PENDING`);
            loadLeaveRequests();
            loadLeaveStats();
        } else {
            alert('Error: ' + data.error);
        }
    } catch (err) { alert('Error: ' + err.message); }
}

// ── Compute Modal ─────────────────────────────────────────────────────
function showComputeModal() {
    const today = new Date();
    const ym    = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    document.getElementById('computeMonth').value  = ym;
    document.getElementById('computeResult').innerHTML = '';
    document.getElementById('computeModal').classList.add('active');
}

function closeComputeModal() {
    document.getElementById('computeModal').classList.remove('active');
}

async function triggerCompute(mode) {
    const ym     = document.getElementById('computeMonth').value;
    const result = document.getElementById('computeResult');

    if (!ym) { alert('Please select a month first.'); return; }

    result.innerHTML = `<div class="compute-loading">⏳ Computing…</div>`;

    try {
        const url = `${API_BASE}/leave/credits/compute${mode === 'auto' ? '' : '-' + mode}/${ym}`;
        const res  = await fetch(url, { method: 'POST' });
        const data = await res.json();

        if (res.ok) {
            const list = (data.students || []).map(s =>
                `<li><strong>${s.student_id}</strong> — ${s.absent_days} absent day(s) → ${s.credit_days} credit(s) <span class="badge">${s.source}</span></li>`
            ).join('');

            result.innerHTML = `
                <div class="compute-result-box success">
                    <p>✅ <strong>${data.mode ? data.mode.toUpperCase() : mode.toUpperCase()}</strong> computation done for <strong>${ym}</strong></p>
                    <p>Credit Month: <strong>${data.credit_month}</strong> &nbsp;|&nbsp; Saved: <strong>${data.saved}</strong></p>
                    ${list ? `<ul style="margin-top:0.5rem;">${list}</ul>` : '<p>No students qualified.</p>'}
                </div>
            `;
            loadLeaveStats();
            if (activeLeaveTab === 'credits') loadCreditRecords();
        } else {
            result.innerHTML = `<div class="compute-result-box error">❌ ${data.error}</div>`;
        }
    } catch (err) {
        result.innerHTML = `<div class="compute-result-box error">❌ ${err.message}</div>`;
    }
}

async function triggerApply() {
    const ym     = document.getElementById('computeMonth').value;
    const result = document.getElementById('computeResult');

    if (!ym) { alert('Please select a month first.'); return; }

    if (!confirm(`Apply all PENDING credits for credit_month ${ym}? This marks them as APPLIED.`)) return;

    result.innerHTML = `<div class="compute-loading">⏳ Applying…</div>`;

    try {
        const res  = await fetch(`${API_BASE}/leave/credits/apply/${ym}`, { method: 'POST' });
        const data = await res.json();

        if (res.ok) {
            result.innerHTML = `
                <div class="compute-result-box success">
                    ✅ Applied <strong>${data.applied}</strong> credit record(s) for credit_month <strong>${ym}</strong>.
                </div>
            `;
            loadLeaveStats();
            if (activeLeaveTab === 'credits') loadCreditRecords();
        } else {
            result.innerHTML = `<div class="compute-result-box error">❌ ${data.error}</div>`;
        }
    } catch (err) {
        result.innerHTML = `<div class="compute-result-box error">❌ ${err.message}</div>`;
    }
}

// ── Toast ─────────────────────────────────────────────────────────────
function showLeaveToast(msg) {
    let toast = document.getElementById('leaveToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'leaveToast';
        toast.className = 'leave-toast';
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3500);
}

// ── Wire up date fields to live preview ───────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    ['leaveFromDate', 'leaveToDate'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', updateLeaveDayPreview);
    });
});

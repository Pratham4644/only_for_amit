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
                        <td>${student.room_number || 'N/A'}</td>
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
        let url = `${API_BASE}/attendance/report?start_date=${startDate}&end_date=${endDate}`;
        if (mealType) {
            url += `&meal_type=${mealType}`;
        }

        const response = await fetch(url);
        const data = await response.json();

        displayReport(data);
    } catch (error) {
        console.error('Error generating report:', error);
        alert('Error generating report');
    }
}

function displayReport(data) {
    const container = document.getElementById('reportResults');

    if (data.records.length === 0) {
        container.innerHTML = '<p class="text-center">No records found for selected criteria</p>';
        return;
    }

    let html = `
        <h3>Report: ${data.start_date} to ${data.end_date}</h3>
        <p>Total Records: ${data.count}</p>
        <table>
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Student ID</th>
                    <th>Name</th>
                    <th>Room</th>
                    <th>Meal Type</th>
                    <th>Time</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
    `;

    data.records.forEach(record => {
        html += `
            <tr>
                <td>${record.date}</td>
                <td>${record.student_id}</td>
                <td>${record.name}</td>
                <td>${record.room_number || 'N/A'}</td>
                <td>${record.meal_type}</td>
                <td>${record.scan_time}</td>
                <td>${record.is_late ? 'Late' : 'On Time'}</td>
            </tr>
        `;
    });

    html += '</tbody></table>';
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

        data.meal_timings.forEach(timing => {
            const card = `
                <div class="timing-card">
                    <h3>${timing.meal_type}</h3>
                    <div class="timing-fields">
                        <div class="form-group">
                            <label>Start Time</label>
                            <input type="time" value="${timing.start_time}" 
                                   onchange="updateTiming(${timing.id}, 'start_time', this.value)">
                        </div>
                        <div class="form-group">
                            <label>End Time</label>
                            <input type="time" value="${timing.end_time}"
                                   onchange="updateTiming(${timing.id}, 'end_time', this.value)">
                        </div>
                        <div class="form-group">
                            <label>Late Warning Time</label>
                            <input type="time" value="${timing.late_warning_time || ''}"
                                   onchange="updateTiming(${timing.id}, 'late_warning_time', this.value)">
                        </div>
                    </div>
                </div>
            `;
            container.innerHTML += card;
        });
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

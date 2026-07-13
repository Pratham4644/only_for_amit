// API base URL
const API_BASE = '/api';

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    loadDashboard();
    updateDate();
    initMealPlanPriceListener();
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
        case 'profile':
            document.getElementById('profileSearchInput').focus();
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

// Add Student Camera Capture State
let addStudentStream = null;
let addStudentBlob = null;

async function startAddStudentCamera() {
    stopAddStudentCamera(false); // Clean up existing stream first, keep blob if exists
    
    const video = document.getElementById('addStudentVideo');
    const photoImg = document.getElementById('addStudentCapturedPhoto');
    const placeholder = document.getElementById('addStudentCameraPlaceholder');
    
    const btnStart = document.getElementById('btnStartCamera');
    const btnCapture = document.getElementById('btnCapturePhoto');
    const btnRetake = document.getElementById('btnRetakePhoto');
    
    // Reset view
    video.style.display = 'none';
    photoImg.style.display = 'none';
    placeholder.style.display = 'flex';
    placeholder.innerHTML = `<span style="font-size: 2rem;">⏳</span><span>Requesting camera access...</span>`;
    
    btnStart.style.display = 'none';
    btnCapture.style.display = 'none';
    btnRetake.style.display = 'none';
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                facingMode: 'user'
            },
            audio: false
        });
        
        addStudentStream = stream;
        video.srcObject = stream;
        video.style.display = 'block';
        placeholder.style.display = 'none';
        
        btnStart.style.display = 'none';
        btnCapture.style.display = 'flex';
        btnRetake.style.display = 'none';
    } catch (err) {
        console.error('Camera access error:', err);
        placeholder.style.display = 'flex';
        placeholder.innerHTML = `<span style="font-size: 2.5rem; color: #ff7675;">⚠️</span><span style="color: #ff7675; font-weight: bold;">Camera Access Failed</span><span style="font-size: 0.85rem; padding: 0 10px;">${err.message || 'Permission denied or no camera device found.'}</span>`;
        btnStart.style.display = 'flex';
        btnCapture.style.display = 'none';
        btnRetake.style.display = 'none';
    }
}

function captureAddStudentPhoto() {
    const video = document.getElementById('addStudentVideo');
    const photoImg = document.getElementById('addStudentCapturedPhoto');
    
    const btnStart = document.getElementById('btnStartCamera');
    const btnCapture = document.getElementById('btnCapturePhoto');
    const btnRetake = document.getElementById('btnRetakePhoto');
    
    if (!addStudentStream) return;
    
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    
    const ctx = canvas.getContext('2d');
    // Mirror horizontally to match preview
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    photoImg.src = dataUrl;
    photoImg.style.display = 'block';
    video.style.display = 'none';
    
    canvas.toBlob((blob) => {
        addStudentBlob = blob;
    }, 'image/jpeg', 0.9);
    
    stopAddStudentCamera(false); // Stop video tracks, keep captured blob
    
    btnStart.style.display = 'none';
    btnCapture.style.display = 'none';
    btnRetake.style.display = 'flex';
}

function retakeAddStudentPhoto() {
    addStudentBlob = null;
    startAddStudentCamera();
}

function stopAddStudentCamera(clearBlob = true) {
    if (addStudentStream) {
        addStudentStream.getTracks().forEach(track => track.stop());
        addStudentStream = null;
    }
    
    const video = document.getElementById('addStudentVideo');
    if (video) video.srcObject = null;
    
    if (clearBlob) {
        addStudentBlob = null;
        const photoImg = document.getElementById('addStudentCapturedPhoto');
        if (photoImg) {
            photoImg.src = '';
            photoImg.style.display = 'none';
        }
    }
}

// Add Student Modal
function showAddStudentModal() {
    const today = new Date().toISOString().split('T')[0];
    const joinDateInput = document.getElementById('addStudentJoinDate');
    if (joinDateInput) {
        joinDateInput.value = today;
    }
    document.getElementById('addStudentModal').classList.add('active');
    startAddStudentCamera();
}

function closeAddStudentModal() {
    document.getElementById('addStudentModal').classList.remove('active');
    document.getElementById('addStudentForm').reset();
    stopAddStudentCamera(true);
}

async function addStudent(event) {
    event.preventDefault();

    const form = event.target;
    const formData = new FormData(form);

    if (addStudentBlob) {
        formData.append('photo', addStudentBlob, 'photo.jpg');
    }

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
    loadMealTimings();
    loadMealPrices();
}

async function loadMealTimings() {
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

async function loadMealPrices() {
    try {
        const response = await fetch(`${API_BASE}/settings/meal-prices`);
        const data = await response.json();

        const container = document.getElementById('mealPricesContainer');
        container.innerHTML = '';

        if (!data.meal_prices || data.meal_prices.length === 0) {
            container.innerHTML = '<p>No meal prices defined</p>';
            return;
        }

        data.meal_prices.forEach(item => {
            const planLabel = item.meal_plan.replace('_', ' ');
            const card = `
                <div class="timing-card">
                    <h3 style="text-transform: capitalize;">${planLabel.toLowerCase()}</h3>
                    <div class="timing-fields">
                        <div class="form-group" style="display: flex; gap: 10px; align-items: flex-end;">
                            <div style="flex: 1;">
                                <label>Price (₹)</label>
                                <input type="number" id="priceInput_${item.meal_plan}" value="${item.price}">
                            </div>
                            <button class="btn-primary" style="padding: 10px 20px; font-size: 1rem; height: 53px;" 
                                    onclick="updateMealPrice('${item.meal_plan}', document.getElementById('priceInput_${item.meal_plan}').value)">
                                Update
                            </button>
                        </div>
                    </div>
                </div>
            `;
            container.innerHTML += card;
        });

    } catch (error) {
        console.error('Error loading meal prices:', error);
    }
}

async function updateMealPrice(mealPlan, price) {
    try {
        const response = await fetch(`${API_BASE}/settings/meal-prices/${mealPlan}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ price: parseInt(price) })
        });

        if (response.ok) {
            alert(`Price for ${mealPlan} updated successfully`);
        } else {
            const data = await response.json();
            alert('Error updating price: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error updating meal price:', error);
        alert('Error updating meal price');
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

// ==========================================
// Deep Student Profile Feature
// ==========================================

async function searchStudentProfile() {
    const searchInput = document.getElementById('profileSearchInput').value.trim();
    if (!searchInput) {
        alert('Please enter a Student ID to search');
        return;
    }

    const contentContainer = document.getElementById('profileContentContainer');
    const errorContainer = document.getElementById('profileErrorContainer');

    // Reset UI
    contentContainer.style.display = 'none';
    errorContainer.style.display = 'none';

    try {
        // Use the new search endpoint
        const searchRes = await fetch(`${API_BASE}/students/search?q=${encodeURIComponent(searchInput)}`);
        const searchData = await searchRes.json();

        if (!searchRes.ok || !searchData.students || searchData.students.length === 0) {
            errorContainer.style.display = 'block';
            return;
        }

        // Use the first student found
        const student = searchData.students[0];
        const studentId = student.student_id;

        // Fetch QR Code
        const qrRes = await fetch(`${API_BASE}/students/${studentId}/qr`);
        const qrData = await qrRes.json();

        // Fetch Attendance History
        const historyRes = await fetch(`${API_BASE}/attendance/student/${studentId}`);
        const historyData = await historyRes.json();

        // Populate UI
        document.getElementById('profileName').textContent = student.name;
        document.getElementById('profileStudentId').textContent = student.student_id;
        document.getElementById('profileDept').textContent = student.student_department || 'N/A';
        document.getElementById('profilePhone').textContent = student.phone_number || 'N/A';
        
        const paymentUptoElem = document.getElementById('profilePaymentUpto');
        if (paymentUptoElem) {
            paymentUptoElem.textContent = student.payment_upto ? new Date(student.payment_upto).toLocaleDateString('en-IN') : 'N/A';
        }
        
        const mealPlanLabel = student.meal_plan ? student.meal_plan.replace('_', ' ') : 'FULL';
        document.getElementById('profileMealPlan').textContent = mealPlanLabel;

        const photoImg = document.getElementById('profilePhoto');
        if (student.photo_path) {
            photoImg.src = '/' + student.photo_path.replace(/\\/g, '/');
        } else {
            photoImg.src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'><rect width='100' height='100' fill='%23e0e4ff'/><text x='50' y='50' font-family='Arial' font-size='40' fill='%236c5ce7' text-anchor='middle' dy='.3em'>👤</text></svg>";
        }

        const statusBadge = document.getElementById('profileStatusBadge');
        const toggleBtn   = document.getElementById('toggleStatusBtn');
        if (student.active) {
            statusBadge.className   = 'badge badge-success';
            statusBadge.textContent = 'Active';
            if (toggleBtn) {
                toggleBtn.textContent = '⏸ Deactivate';
                toggleBtn.className   = 'btn-secondary';
                toggleBtn.style.cssText = 'padding:0.4rem 1rem;font-size:0.9rem;display:flex;align-items:center;gap:5px;';
            }
        } else {
            statusBadge.className   = 'badge badge-danger';
            statusBadge.textContent = 'Inactive';
            if (toggleBtn) {
                toggleBtn.textContent = '▶ Activate';
                toggleBtn.className   = 'btn-success';
                toggleBtn.style.cssText = 'padding:0.4rem 1rem;font-size:0.9rem;display:flex;align-items:center;gap:5px;';
            }
        }

        const qrImg = document.getElementById('profileQrCode');
        const qrPlaceholder = document.getElementById('profileQrPlaceholder');
        if (qrRes.ok && qrData.qr_code) {
            qrImg.src = qrData.qr_code;
            qrImg.style.display = 'block';
            qrPlaceholder.style.display = 'none';
        } else {
            qrImg.style.display = 'none';
            qrPlaceholder.style.display = 'block';
        }

        // Populate History
        const tbody = document.getElementById('profileHistoryBody');
        tbody.innerHTML = '';

        if (!historyRes.ok || !historyData.history || historyData.history.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center">No recent attendance found.</td></tr>';
        } else {
            historyData.history.forEach(record => {
                const statusClass = record.is_late ? 'status-late' : 'status-present';
                const statusIcon = record.is_late ? '!' : '✓';
                const mealBadgeClass = record.meal_type === 'LUNCH' ? 'badge-warning' : 'badge-success';
                
                const row = `
                    <tr>
                        <td>${record.date}</td>
                        <td><span class="badge ${mealBadgeClass}">${record.meal_type}</span></td>
                        <td>${record.scan_time || '-'}</td>
                        <td>
                            <div class="status-badge ${statusClass}">
                                <div class="status-dot">${statusIcon}</div>
                                <span>${record.status}</span>
                            </div>
                        </td>
                    </tr>
                `;
                tbody.innerHTML += row;
            });
        }

        contentContainer.style.display = 'block';

    } catch (error) {
        console.error('Error fetching profile data:', error);
        alert('Failed to load profile details. See console for errors.');
    }
}

// Toggle a student's active status from the profile page (no page reload)
async function toggleStudentStatus() {
    const studentId = document.getElementById('profileStudentId').textContent.trim();
    if (!studentId || studentId === '-') {
        alert('No student loaded');
        return;
    }

    const statusBadge = document.getElementById('profileStatusBadge');
    const currentlyActive = statusBadge.textContent.trim() === 'Active';

    // Confirm only when deactivating
    if (currentlyActive) {
        const ok = confirm(`Mark ${studentId} as inactive?\n\nThis student will no longer be able to use their QR for scanning.`);
        if (!ok) return;
    }

    try {
        const res  = await fetch(`${API_BASE}/students/${encodeURIComponent(studentId)}/status`, {
            method:  'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ active: !currentlyActive }),
        });
        const data = await res.json();

        if (!res.ok) {
            alert('Error: ' + (data.error || 'Unknown error'));
            return;
        }

        // Update badge + toggle button from the fresh student row
        const toggleBtn = document.getElementById('toggleStatusBtn');
        if (data.student.active) {
            statusBadge.className   = 'badge badge-success';
            statusBadge.textContent = 'Active';
            if (toggleBtn) {
                toggleBtn.textContent = '⏸ Deactivate';
                toggleBtn.className   = 'btn-secondary';
            }
            showPayToast('✅ Student activated successfully!');
        } else {
            statusBadge.className   = 'badge badge-danger';
            statusBadge.textContent = 'Inactive';
            if (toggleBtn) {
                toggleBtn.textContent = '▶ Activate';
                toggleBtn.className   = 'btn-success';
            }
            showPayToast('⏸ Student deactivated.');
        }
    } catch (err) {
        console.error('Error toggling student status:', err);
        alert('Failed to update status: ' + err.message);
    }
}

// ====================================================================
// PAYMENTS MODULE
// ====================================================================

// ── State ─────────────────────────────────────────────────────────────
let _payStudentId   = null;   // currently open student in payment modal
let _activeStudentId = null;
let _payStudentName = '';

// ── Helper: toast (reuse the leave toast element) ─────────────────────
function showPayToast(msg, isError = false) {
    let toast = document.getElementById('leaveToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'leaveToast';
        toast.className = 'leave-toast';
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.background = isError ? '#d63031' : '#2d3436';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3500);
}

// ── Helper: format rupees ──────────────────────────────────────────────
function fmt(n) {
    return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Init payments page ─────────────────────────────────────────────────
function initPaymentsPage() {
    loadFeeSettings();
    loadUnpaidSummary();
}

// ── Patch loadPageData to handle 'payments' & 'profiles' ──────────────────
(function () {
    const _orig = window.loadPageData;
    window.loadPageData = function (pageName) {
        _orig(pageName);
        if (pageName === 'payments') initPaymentsPage();
        if (pageName === 'profiles') loadProfiles();
    };
})();

// ── Also load unpaid widget on dashboard load ──────────────────────────
(function () {
    const _origDash = window.loadDashboard;
    window.loadDashboard = async function () {
        await _origDash();
        loadUnpaidWidget();
    };
})();

// ─────────────────────────────────────────────────────────────────────
// FEE SETTINGS
// ─────────────────────────────────────────────────────────────────────

async function loadFeeSettings() {
    const tbody = document.getElementById('feeSettingsBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="3" class="text-center">Loading…</td></tr>';
    try {
        const res  = await fetch(`${API_BASE}/payments/fee-settings`);
        const data = await res.json();
        if (!data.success) throw new Error(data.message);

        const planLabels = { FULL: 'Full (Lunch + Dinner)', LUNCH_ONLY: 'Lunch Only', DINNER_ONLY: 'Dinner Only' };

        tbody.innerHTML = (data.data || []).map(row => `
            <tr>
                <td><strong>${planLabels[row.meal_plan] || row.meal_plan}</strong></td>
                <td><input class="fee-input" type="number" min="1" step="0.01"
                        id="fee_${row.meal_plan}" value="${row.monthly_fee}"></td>
                <td><input class="fee-input" type="number" min="0" step="1"
                        id="thresh_${row.meal_plan}" value="${row.vacation_threshold_days}"></td>
            </tr>
        `).join('');
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="3" class="text-center" style="color:red;">Error: ${e.message}</td></tr>`;
    }
}

async function saveFeeSettings() {
    const plans = ['FULL', 'LUNCH_ONLY', 'DINNER_ONLY'];
    const payload = [];

    for (const p of plans) {
        const feeEl    = document.getElementById(`fee_${p}`);
        const threshEl = document.getElementById(`thresh_${p}`);
        if (!feeEl || !threshEl) continue;
        payload.push({
            meal_plan:               p,
            monthly_fee:             parseFloat(feeEl.value),
            vacation_threshold_days: parseInt(threshEl.value, 10),
        });
    }

    try {
        const res  = await fetch(`${API_BASE}/payments/fee-settings`, {
            method:  'PUT',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(payload),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message);
        showPayToast('✅ Fee settings saved!');
        loadFeeSettings();
    } catch (e) {
        showPayToast('❌ ' + e.message, true);
    }
}

// ─────────────────────────────────────────────────────────────────────
// UNPAID WIDGET (Dashboard)
// ─────────────────────────────────────────────────────────────────────

async function loadUnpaidWidget() {
    const body  = document.getElementById('unpaidWidgetBody');
    const badge = document.getElementById('unpaidCountBadge');
    if (!body) return;

    body.innerHTML = '<p class="text-center" style="color:var(--text-secondary);">Loading…</p>';

    try {
        const res  = await fetch(`${API_BASE}/payments/unpaid-current-month`);
        const data = await res.json();

        if (!data.success) throw new Error(data.message);

        const list = data.data || [];

        if (badge) {
            if (list.length > 0) {
                badge.textContent = `${list.length} pending`;
                badge.style.display = 'inline-block';
            } else {
                badge.style.display = 'none';
            }
        }

        if (list.length === 0) {
            body.innerHTML = '<p style="color:#00b894;font-weight:700;">✅ All students paid for this month!</p>';
            return;
        }

        body.innerHTML = list.map(s => {
            const statusClass = s.status === 'DUE' ? 'pay-status-due' : 'pay-status-nobill';
            const balText = s.status === 'DUE'
                ? fmt(s.balance)
                : (s.current_month_bill ? fmt(-s.current_month_bill) : '—');
            return `
                <div class="unpaid-widget-row" onclick="openStudentProfile('${s.student_id}','${s.name.replace(/'/g,"\\'")}')">
                    <span class="uw-name">${s.name}</span>
                    <span class="uw-plan">${s.meal_plan}</span>
                    <span class="uw-balance">${balText}</span>
                    <span class="pay-status-badge ${statusClass}">${s.status}</span>
                </div>
            `;
        }).join('');
    } catch (e) {
        body.innerHTML = `<p style="color:red;">Error loading unpaid students: ${e.message}</p>`;
    }
}

// ─────────────────────────────────────────────────────────────────────
// UNPAID SUMMARY (Payments Page)
// ─────────────────────────────────────────────────────────────────────

async function loadUnpaidSummary() {
    const tbody = document.getElementById('unpaidSummaryBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" class="text-center">Loading…</td></tr>';

    try {
        const res  = await fetch(`${API_BASE}/payments/unpaid-current-month`);
        const data = await res.json();
        if (!data.success) throw new Error(data.message);

        const list = data.data || [];
        if (list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center" style="color:#00b894;font-weight:700;">✅ All students paid for this month!</td></tr>';
            return;
        }

        tbody.innerHTML = list.map(s => {
            const statusClass = s.status === 'DUE' ? 'pay-status-due' : 'pay-status-nobill';
            return `
                <tr>
                    <td><strong>${s.name}</strong><br><small style="color:var(--text-secondary);">${s.student_id}</small></td>
                    <td><span class="badge badge-warning" style="background:#e0e4ff;color:#6c5ce7;">${s.meal_plan}</span></td>
                    <td>${s.current_month_bill != null ? fmt(s.current_month_bill) : '—'}</td>
                    <td style="color:${s.balance < 0 ? '#d63031' : '#636e72'};font-weight:700;">${fmt(s.balance)}</td>
                    <td><span class="pay-status-badge ${statusClass}">${s.status}</span></td>
                    <td>
                        <button class="btn-primary" style="padding:0.4rem 1rem;font-size:0.95rem;"
                            onclick="openStudentProfile('${s.student_id}','${s.name.replace(/'/g,"\\'")}')">
                            Open Account
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="color:red;">Error: ${e.message}</td></tr>`;
    }
}

// ─────────────────────────────────────────────────────────────────────
// STUDENT PROFILE & PAYMENT MODAL — Open / Close / Tabs
// ─────────────────────────────────────────────────────────────────────

function openPayStudentSearch() {
    document.getElementById('paySearchStudentId').value = '';
    document.getElementById('payStudentSearchModal').classList.add('active');
    setTimeout(() => document.getElementById('paySearchStudentId').focus(), 100);
}

function closePayStudentSearch() {
    document.getElementById('payStudentSearchModal').classList.remove('active');
}

async function openStudentPaymentModal() {
    const sid = document.getElementById('paySearchStudentId').value.trim();
    if (!sid) { alert('Please enter a student ID'); return; }
    closePayStudentSearch();
    await openStudentProfile(sid);
}

async function openStudentProfile(sid, name = '') {
    // Save details locally
    _activeStudentId = sid;
    _payStudentId   = sid;
    _payStudentName = name || sid;

    // Set defaults
    document.getElementById('payModalStudentName').textContent = _payStudentName;
    document.getElementById('payModalStudentMeta').textContent = `ID: ${sid}`;
    document.getElementById('payBalanceChip').textContent = 'Loading…';
    document.getElementById('payBalanceChip').className = 'pay-balance-chip';
    
    // Overview defaults
    document.getElementById('profPhone').textContent = '—';
    document.getElementById('profDept').textContent = '—';
    document.getElementById('profPlan').textContent = '—';
    document.getElementById('profMessPrice').textContent = '—';
    document.getElementById('profJoined').textContent = '—';
    document.getElementById('profStatus').textContent = '—';
    document.getElementById('profQRCode').innerHTML = '';
    document.getElementById('profileModalPhoto').innerHTML = '👤';

    // Reset to first tab (overview)
    switchProfileTab('overview');

    // Set today's date in payment form
    document.getElementById('payDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('payAmount').value = '';
    document.getElementById('payNote').value = '';

    // Set default date range in bill generator
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm   = String(today.getMonth() + 1).padStart(2, '0');
    const lastDay = new Date(yyyy, today.getMonth() + 1, 0).getDate();
    
    // genBillFromDate is dynamically set in refreshPayBalance()
    document.getElementById('genBillFromDate').value = '';
    document.getElementById('genBillToDate').value   = `${yyyy}-${mm}-${String(lastDay).padStart(2, '0')}`;
    document.getElementById('genBillAbsent').value = '0';
    document.getElementById('genBillNotes').value = '';

    document.getElementById('studentProfileModal').classList.add('active');

    // Fetch full student details
    try {
        const cleanSid = String(sid).trim();
        const sRes  = await fetch(`${API_BASE}/students/${encodeURIComponent(cleanSid)}`);
        const sData = await sRes.json();
        if (sData.student) {
            const st = sData.student;
            _payStudentName = st.name;
            document.getElementById('payModalStudentName').textContent = _payStudentName;
            document.getElementById('payModalStudentMeta').textContent =
                `ID: ${sid} · ${st.meal_plan} · ${st.student_department || ''}`;
                
            document.getElementById('profPhone').textContent = st.phone_number || 'N/A';
            document.getElementById('profDept').textContent = st.student_department || 'N/A';
            document.getElementById('profPlan').textContent = st.meal_plan || 'N/A';
            
            const profPaymentUptoElem = document.getElementById('profPaymentUpto');
            if (profPaymentUptoElem) {
                if (st.payment_upto) {
                    const parts = st.payment_upto.split('T')[0].split('-');
                    if (parts.length === 3) profPaymentUptoElem.textContent = `${parts[2]}/${parts[1]}/${parts[0]}`;
                    else profPaymentUptoElem.textContent = st.payment_upto;
                } else {
                    profPaymentUptoElem.textContent = 'N/A';
                }
            }
            
            // Populate mess price text display
            const priceVal = st.mess_price !== null && st.mess_price !== undefined ? st.mess_price : 'Default';
            document.getElementById('profMessPrice').textContent = priceVal;
            
            // Format Join Date from st.join_date, fallback to st.created_at
            const rawJoinDate = st.join_date || st.created_at;
            if (rawJoinDate) {
                const parts = rawJoinDate.split('T')[0].split('-');
                if (parts.length === 3) document.getElementById('profJoined').textContent = `${parts[2]}/${parts[1]}/${parts[0]}`;
                else document.getElementById('profJoined').textContent = new Date(rawJoinDate).toLocaleDateString('en-IN');
            } else {
                document.getElementById('profJoined').textContent = 'N/A';
            }
            
            document.getElementById('profStatus').innerHTML = st.active ? '<span style="color:#00b894;font-weight:bold;">Active</span>' : '<span style="color:#d63031;font-weight:bold;">Inactive</span>';
            
            if (st.photo_path) {
                document.getElementById('profileModalPhoto').innerHTML = `<img src="/uploads/photos/${st.photo_path.split(/\\|\//).pop()}" style="width:100%; height:100%; object-fit:cover;">`;
            }
            
            // Generate QR
            const qrUrl = `${API_BASE}/students/${sid}/qr`;
            document.getElementById('profQRCode').innerHTML = `<img src="${qrUrl}" alt="QR Code" style="max-width:150px;">`;
        }
    } catch (e) {
        console.error('Error fetching student profile:', e);
    }

    // Load balance + bills
    await refreshPayBalance();
    loadStudentBills();
}

function closeStudentProfileModal() {
    document.getElementById('studentProfileModal').classList.remove('active');
    _payStudentId   = null;
    _payStudentName = '';
}

function switchProfileTab(tab) {
    document.querySelectorAll('.pay-modal-tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.pay-modal-tab-panel').forEach(p => p.classList.remove('active'));
    document.getElementById(`pmtab_${tab}`).classList.add('active');
    document.getElementById(`payTab_${tab}`).classList.add('active');

    if (tab === 'bills') {
        loadStudentBills();
        fetchAutoAbsentDays();
    }
    if (tab === 'history') loadPaymentHistory();
    if (tab === 'absent')  loadAbsentRecords();
}

// ─────────────────────────────────────────────────────────────────────
// ABSENT DATES LOGIC
// ─────────────────────────────────────────────────────────────────────

function calculateAbsentDays() {
    const fromDate = document.getElementById('absentFromDate').value;
    const toDate = document.getElementById('absentToDate').value;
    
    if (fromDate && toDate) {
        if (fromDate > toDate) {
            document.getElementById('absentTotalLeaves').value = '';
            return;
        }
        const totalDays = Math.round((new Date(toDate) - new Date(fromDate)) / 86400000) + 1;
        document.getElementById('absentTotalLeaves').value = totalDays;
    }
}

async function saveAbsentRecord() {
    if (!_payStudentId) return;

    const from_date = document.getElementById('absentFromDate').value;
    const to_date = document.getElementById('absentToDate').value;
    const total_leaves = parseFloat(document.getElementById('absentTotalLeaves').value);
    const note = document.getElementById('absentNote').value.trim();

    if (!from_date || !to_date) {
        alert('Please select both From Date and To Date.');
        return;
    }
    if (from_date > to_date) {
        alert('From Date must be before or equal to To Date.');
        return;
    }
    if (isNaN(total_leaves) || total_leaves < 0) {
        alert('Please enter a valid number for Total Leaves.');
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/students/${_payStudentId}/absent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ from_date, to_date, total_leaves, note })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message);

        showPayToast(`✅ Absent record saved successfully!`);
        document.getElementById('absentForm').reset();
        loadAbsentRecords();
        fetchAutoAbsentDays();
    } catch (e) {
        showPayToast('❌ Error: ' + e.message, true);
    }
}

async function loadAbsentRecords() {
    const tbody = document.getElementById('absentRecordsBody');
    if (!tbody || !_payStudentId) return;
    
    tbody.innerHTML = '<tr><td colspan="5" class="text-center">Loading…</td></tr>';

    try {
        const res = await fetch(`${API_BASE}/students/${_payStudentId}/absent`);
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Failed to load absent records');

        const rows = data.data || [];
        if (rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center">No absent records found.</td></tr>';
            return;
        }

        tbody.innerHTML = rows.map(r => `
            <tr>
                <td>${r.from_date}</td>
                <td>${r.to_date}</td>
                <td><strong>${r.total_leaves}</strong></td>
                <td>${r.note || '—'}</td>
                <td style="color:var(--text-secondary);font-size:0.9rem;">${new Date(r.created_at).toLocaleDateString('en-IN')}</td>
            </tr>
        `).join('');
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center" style="color:red;">Error: ${e.message}</td></tr>`;
    }
}

function downloadProfileQR() {
    if (!_payStudentId) return;
    const a = document.createElement('a');
    a.href = `${API_BASE}/students/${_payStudentId}/qr?download=true`;
    a.download = `QR_${_payStudentId}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// ─────────────────────────────────────────────────────────────────────
// BALANCE SUMMARY
// ─────────────────────────────────────────────────────────────────────

async function refreshPayBalance() {
    if (!_payStudentId) return;
    try {
        const res  = await fetch(`${API_BASE}/payments/balance/${_payStudentId}`);
        const data = await res.json();
        if (!data.success) throw new Error(data.message);
        const d = data.data;

        document.getElementById('payTotalBilled').textContent = fmt(d.total_billed);
        document.getElementById('payTotalPaid').textContent   = fmt(d.total_paid);

        const balEl = document.getElementById('payBalance');
        balEl.textContent = fmt(d.balance);
        balEl.className   = 'pay-bal-val ' +
            (d.status === 'DUE' ? 'val-due' : d.status === 'ADVANCE' ? 'val-advance' : 'val-settled');
            
        // Dynamically update Payment Upto date based on the balance calculation
        const profPaymentUptoElem = document.getElementById('profPaymentUpto');
        if (profPaymentUptoElem && d.calculated_payment_upto) {
            // d.calculated_payment_upto is "YYYY-MM-DD", manually format to DD/MM/YYYY to prevent timezone shifting
            const [y, m, d_day] = d.calculated_payment_upto.split('-');
            profPaymentUptoElem.textContent = `${d_day}/${m}/${y}`;
            
            // Optional visual indicator if due/advance
            if (d.status === 'DUE') {
                profPaymentUptoElem.style.color = '#d63031';
                profPaymentUptoElem.style.fontWeight = 'bold';
            } else if (d.status === 'ADVANCE') {
                profPaymentUptoElem.style.color = '#00b894';
                profPaymentUptoElem.style.fontWeight = 'bold';
            } else {
                profPaymentUptoElem.style.color = 'inherit';
                profPaymentUptoElem.style.fontWeight = 'normal';
            }
        }
        
        // Dynamically set "From Date" for the Bill Generator
        const genBillFromDateEl = document.getElementById('genBillFromDate');
        if (genBillFromDateEl) {
            let nextFromDate = '';
            if (d.calculated_payment_upto) {
                try {
                    const parts = d.calculated_payment_upto.split('-');
                    if (parts.length === 3) {
                        const payDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
                        payDate.setDate(payDate.getDate() + 1);
                        const y = payDate.getFullYear();
                        const m = String(payDate.getMonth() + 1).padStart(2, '0');
                        const d_day = String(payDate.getDate()).padStart(2, '0');
                        nextFromDate = `${y}-${m}-${d_day}`;
                    }
                } catch (e) {
                    console.error(e);
                }
            }
            if (!nextFromDate && d.join_date) {
                nextFromDate = d.join_date.split('T')[0];
            }
            if (!nextFromDate) {
                const td = new Date();
                nextFromDate = `${td.getFullYear()}-${String(td.getMonth() + 1).padStart(2, '0')}-01`;
            }
            genBillFromDateEl.value = nextFromDate;
            fetchAutoAbsentDays(); // Trigger auto-fetch if to-date is somehow set
        }

        const chip = document.getElementById('payBalanceChip');
        const chipMap = { DUE: 'chip-due', ADVANCE: 'chip-advance', SETTLED: 'chip-settled' };
        chip.className   = 'pay-balance-chip ' + (chipMap[d.status] || '');
        chip.textContent = d.status === 'DUE'
            ? `Owes ${fmt(-d.balance)}`
            : d.status === 'ADVANCE'
            ? `Advance ${fmt(d.balance)}`
            : 'Settled ✓';
    } catch (e) {
        document.getElementById('payBalanceChip').textContent = 'Error';
    }
}

// ─────────────────────────────────────────────────────────────────────
// ADD PAYMENT
// ─────────────────────────────────────────────────────────────────────

async function submitAddPayment(event) {
    event.preventDefault();
    if (!_payStudentId) return;

    const btn = document.getElementById('submitPayBtn');
    btn.disabled = true;
    btn.textContent = 'Recording…';

    const payload = {
        student_id:     _payStudentId,
        payment_date:   document.getElementById('payDate').value,
        amount:         parseFloat(document.getElementById('payAmount').value),
        payment_mode:   document.getElementById('payMode').value,
        reference_note: document.getElementById('payNote').value.trim() || undefined,
    };

    try {
        const res  = await fetch(`${API_BASE}/payments/add`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(payload),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message);

        showPayToast(`✅ Payment of ${fmt(data.data.amount)} recorded!`);
        document.getElementById('addPaymentForm').reset();
        document.getElementById('payDate').value = new Date().toISOString().split('T')[0];
        await refreshPayBalance();
        loadUnpaidWidget();
        loadUnpaidSummary();

        // Show WhatsApp Receipt Modal
        const phoneText = document.getElementById('profPhone').textContent;
        if (phoneText && phoneText !== 'N/A' && phoneText.trim() !== '') {
            // Formatting the mode of payment nicely
            const modes = {
                'CASH': 'Cash',
                'UPI': 'UPI',
                'BANK_TRANSFER': 'Bank Transfer',
                'OTHER': 'Other'
            };
            const modeStr = modes[data.data.payment_mode] || data.data.payment_mode;
            
            // Format the date
            const dateParts = data.data.payment_date.split('-');
            const formattedDate = dateParts.length === 3 ? `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}` : data.data.payment_date;

            // Populate Modal
            document.getElementById('waReceiptStudentName').textContent = _payStudentName;
            document.getElementById('waReceiptAmount').textContent = fmt(data.data.amount);
            document.getElementById('waReceiptDate').textContent = formattedDate;
            document.getElementById('waReceiptMode').textContent = modeStr;

            // Set up button click
            const btnSend = document.getElementById('btnSendWaReceipt');
            btnSend.onclick = () => {
                const message = `Dear ${_payStudentName},\n\nThis is a confirmation that we have successfully received your payment of ${fmt(data.data.amount)} on ${formattedDate} via ${modeStr}.\n\nThank you.\n\nRegards,\nBuddy's Kitchen`;
                const whatsappUrl = `https://wa.me/${phoneText.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(message)}`;
                window.open(whatsappUrl, '_blank');
                closeWhatsappReceiptModal();
            };

            // Show Modal
            document.getElementById('whatsappReceiptModal').classList.add('active');
        }
    } catch (e) {
        showPayToast('❌ ' + e.message, true);
    } finally {
        btn.disabled = false;
        btn.textContent = '✅ Record Payment';
    }
}

// ─────────────────────────────────────────────────────────────────────
// BILLS
// ─────────────────────────────────────────────────────────────────────

async function loadStudentBills() {
    const tbody = document.getElementById('studentBillsBody');
    if (!tbody || !_payStudentId) return;
    tbody.innerHTML = '<tr><td colspan="8" class="text-center">Loading…</td></tr>';

    try {
        const res  = await fetch(`${API_BASE}/payments/bills/${_payStudentId}`);
        const data = await res.json();
        if (!data.success) throw new Error(data.message);

        const rows = data.data || [];
        if (rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center">No bills generated yet.</td></tr>';
            return;
        }

        tbody.innerHTML = rows.map(b => {
            // Build a readable date range label
            const rangeLabel = (b.from_date && b.to_date)
                ? `${b.from_date} &rarr; ${b.to_date}`
                : b.month;
            const totalDays = b.total_days_in_month || '—';
            return `
            <tr>
                <td><strong>${rangeLabel}</strong></td>
                <td style="text-align:center;">${totalDays}</td>
                <td><span class="badge badge-warning" style="background:#e0e4ff;color:#6c5ce7;">${b.meal_plan}</span></td>
                <td>${fmt(b.base_fee)}</td>
                <td>${b.absent_days}</td>
                <td style="color:${b.deduction > 0 ? '#d63031' : '#636e72'};">${fmt(b.deduction)}</td>
                <td><strong>${fmt(b.final_bill)}</strong></td>
                <td style="max-width:10rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${b.notes || ''}">${b.notes || '—'}</td>
            </tr>`;
        }).join('');
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center" style="color:red;">Error: ${e.message}</td></tr>`;
    }
}

let currentBillPayload = null;

async function fetchAutoAbsentDays() {
    if (!_payStudentId) return;
    const from_date = document.getElementById('genBillFromDate').value;
    const to_date = document.getElementById('genBillToDate').value;
    
    if (from_date && to_date) {
        if (from_date > to_date) {
            document.getElementById('genBillAbsent').value = 0;
            return;
        }
        try {
            const res = await fetch(`${API_BASE}/payments/absent-days/${_payStudentId}?from=${from_date}&to=${to_date}`);
            const data = await res.json();
            if (data.success) {
                document.getElementById('genBillAbsent').value = data.data || 0;
            }
        } catch (e) {
            console.error('Error fetching auto absent days:', e);
        }
    }
}

async function generateStudentBill() {
    if (!_payStudentId) return;

    const from_date   = document.getElementById('genBillFromDate').value;
    const to_date     = document.getElementById('genBillToDate').value;
    const absent_days = parseFloat(document.getElementById('genBillAbsent').value) || 0;
    const notes       = document.getElementById('genBillNotes').value.trim();

    if (!from_date || !to_date) { alert('Please select both From Date and To Date.'); return; }
    if (from_date > to_date)    { alert('From Date must be before or equal to To Date.'); return; }

    currentBillPayload = { student_id: _payStudentId, from_date, to_date, absent_days, notes: notes || undefined };

    try {
        const res = await fetch(`${API_BASE}/payments/bills/preview`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(currentBillPayload)
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message);

        const b = data.data;

        // Populate Preview Modal
        document.getElementById('previewBillFrom').textContent = b.from_date;
        document.getElementById('previewBillTo').textContent = b.to_date;
        document.getElementById('previewBillTotalDays').textContent = b.total_days_in_month;
        document.getElementById('previewBillAbsentDays').textContent = b.absent_days;
        document.getElementById('previewBillBaseFee').textContent = fmt(b.base_fee);
        document.getElementById('previewBillDeduction').textContent = fmt(b.deduction);
        document.getElementById('previewBillFinal').textContent = fmt(b.final_bill);

        // Show Modal
        document.getElementById('billPreviewModal').classList.add('active');
    } catch (e) {
        showPayToast('❌ Preview Error: ' + e.message, true);
    }
}

function closeBillPreviewModal() {
    document.getElementById('billPreviewModal').classList.remove('active');
    currentBillPayload = null;
}

async function confirmGenerateBill() {
    if (!currentBillPayload) return;

    try {
        const res  = await fetch(`${API_BASE}/payments/bills/generate`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(currentBillPayload),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message);

        const b = data.data;
        showPayToast(`✅ Bill generated (${b.from_date} → ${b.to_date}, ${b.total_days_in_month} days): ${fmt(b.final_bill)}`);
        
        closeBillPreviewModal();
        loadStudentBills();
        await refreshPayBalance();
        loadUnpaidWidget();
        loadUnpaidSummary();
    } catch (e) {
        showPayToast('❌ ' + e.message, true);
    }
}

// ─────────────────────────────────────────────────────────────────────
// PAYMENT HISTORY
// ─────────────────────────────────────────────────────────────────────

async function loadPaymentHistory() {
    const tbody = document.getElementById('payHistoryBody');
    if (!tbody || !_payStudentId) return;
    tbody.innerHTML = '<tr><td colspan="6" class="text-center">Loading…</td></tr>';

    try {
        const res  = await fetch(`${API_BASE}/payments/history/${_payStudentId}`);
        const data = await res.json();
        if (!data.success) throw new Error(data.message);

        const rows = data.data || [];
        if (rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">No payments recorded yet.</td></tr>';
            return;
        }

        tbody.innerHTML = rows.map(p => `
            <tr>
                <td>${p.payment_date}</td>
                <td><strong style="color:#00b894;">${fmt(p.amount)}</strong></td>
                <td><span class="badge badge-success">${p.payment_mode}</span></td>
                <td style="max-width:12rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${p.reference_note || ''}">${p.reference_note || '—'}</td>
                <td style="color:var(--text-secondary);font-size:0.9rem;">${new Date(p.recorded_at).toLocaleDateString('en-IN')}</td>
                <td>
                    <button class="btn-danger" style="padding:0.3rem 0.8rem;font-size:0.9rem;"
                        onclick="deletePaymentRecord(${p.id})">🗑</button>
                </td>
            </tr>
        `).join('');
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="color:red;">Error: ${e.message}</td></tr>`;
    }
}

async function deletePaymentRecord(id) {
    if (!confirm('Delete this payment record? This cannot be undone.')) return;

    try {
        const res  = await fetch(`${API_BASE}/payments/record/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (!data.success) throw new Error(data.message);

        showPayToast('🗑 Payment record deleted.');
        loadPaymentHistory();
        await refreshPayBalance();
        loadUnpaidWidget();
        loadUnpaidSummary();
    } catch (e) {
        showPayToast('❌ ' + e.message, true);
    }
}

// ─────────────────────────────────────────────────────────────────────
// PROFILES PAGE LOGIC
// ─────────────────────────────────────────────────────────────────────

async function loadProfiles() {
    const grid = document.getElementById('profilesGrid');
    if (!grid) return;
    grid.innerHTML = '<p class="text-center" style="grid-column: 1 / -1; color: var(--text-secondary);">Loading profiles...</p>';

    try {
        const response = await fetch(`${API_BASE}/students`);
        const data = await response.json();
        
        if (data.students.length === 0) {
            grid.innerHTML = '<p class="text-center" style="grid-column: 1 / -1;">No students found</p>';
            return;
        }

        grid.innerHTML = data.students.map(st => {
            const statusClass = st.active ? 'badge-success' : 'badge-danger';
            const statusText = st.active ? 'Active' : 'Inactive';
            const photoSrc = st.photo_path ? `/uploads/photos/${st.photo_path.split(/\\|\//).pop()}` : '';
            const photoEl = photoSrc 
                ? `<img src="${photoSrc}" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover; border: 2px solid var(--border-color);">`
                : `<div style="width: 60px; height: 60px; border-radius: 50%; background: #e0e4ff; color: #6c5ce7; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; font-weight: bold;">${st.name.charAt(0).toUpperCase()}</div>`;
            
            return `
                <div class="profile-card" data-search="${(st.name + ' ' + st.student_id + ' ' + (st.phone_number || '')).toLowerCase()}" onclick="openStudentProfile('${st.student_id}', '${st.name.replace(/'/g,"\\'")}')" style="background: var(--white); border-radius: 12px; padding: 1.5rem; box-shadow: var(--card-shadow); cursor: pointer; transition: transform 0.2s, box-shadow 0.2s; display: flex; align-items: center; gap: 1rem;">
                    ${photoEl}
                    <div style="flex: 1; min-width: 0;">
                        <h3 style="margin: 0 0 0.25rem 0; font-size: 1.2rem; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${st.name}</h3>
                        <p style="margin: 0 0 0.25rem 0; color: var(--text-secondary); font-size: 0.9rem;">ID: ${st.student_id} • <span class="badge ${statusClass}" style="font-size: 0.7rem; padding: 2px 6px;">${statusText}</span></p>
                        <p style="margin: 0; color: var(--text-secondary); font-size: 0.85rem;"><span class="badge badge-warning" style="background:#f8f9ff; color:var(--accent-purple); font-size:0.75rem;">${st.meal_plan}</span></p>
                    </div>
                </div>
            `;
        }).join('');
        
        // Add hover effect via JS since inline hover is tricky
        document.querySelectorAll('.profile-card').forEach(card => {
            card.addEventListener('mouseenter', () => {
                card.style.transform = 'translateY(-3px)';
                card.style.boxShadow = '0 8px 16px rgba(0,0,0,0.1)';
            });
            card.addEventListener('mouseleave', () => {
                card.style.transform = 'none';
                card.style.boxShadow = 'var(--card-shadow)';
            });
        });
        
    } catch (error) {
        grid.innerHTML = `<p class="text-center" style="grid-column: 1 / -1; color: red;">Error: ${error.message}</p>`;
    }
}

function filterProfilesGrid() {
    const searchValue = document.getElementById('profileSearch').value.toLowerCase();
    const cards = document.querySelectorAll('.profile-card');
    cards.forEach(card => {
        const text = card.getAttribute('data-search');
        if (text.includes(searchValue)) {
            card.style.display = 'flex';
        } else {
            card.style.display = 'none';
        }
    });
}

function closeWhatsappReceiptModal() {
    document.getElementById('whatsappReceiptModal').classList.remove('active');
}

// Pre-fill placeholder and value on meal plan select
function initMealPlanPriceListener() {
    const mealPlanSelect = document.querySelector('select[name="meal_plan"]');
    const priceInput = document.getElementById('addStudentMessPrice');
    
    if (mealPlanSelect && priceInput) {
        const updatePlaceholder = () => {
            const plan = mealPlanSelect.value;
            let defaultPrice = 3000;
            if (plan === 'LUNCH_ONLY') defaultPrice = 1800;
            else if (plan === 'DINNER_ONLY') defaultPrice = 1500;
            priceInput.placeholder = `Default: ${defaultPrice} Rs`;
            priceInput.value = defaultPrice;
        };
        
        mealPlanSelect.addEventListener('change', updatePlaceholder);
        // Set initial placeholder
        updatePlaceholder();
    }
}

// Update single student mess price
async function updateStudentMessPrice() {
    if (!_activeStudentId) {
        alert('No active student loaded');
        return;
    }
    
    const priceInput = document.getElementById('profMessPriceInput');
    if (!priceInput) return;
    
    const newPrice = parseFloat(priceInput.value);
    if (isNaN(newPrice) || newPrice < 0) {
        alert('Please enter a valid price (>= 0)');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/students/${_activeStudentId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ mess_price: newPrice })
        });
        
        const data = await response.json();
        if (response.ok) {
            showPayToast('✅ Student mess price updated successfully!');
            // Refresh student profile view
            openStudentProfile(_activeStudentId);
        } else {
            alert('Error updating price: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error updating mess price:', error);
        alert('Error updating mess price');
    }
}

// Trigger student edit modal from active deep profile page
function triggerEditFromProfile() {
    const sidElement = document.getElementById('profileStudentId');
    const sid = sidElement ? sidElement.textContent.trim() : '';
    if (!sid || sid === '-') {
        alert('No student loaded');
        return;
    }
    showEditStudentModal(sid);
}

// Safely formats any date string to YYYY-MM-DD for datepicker inputs
function formatToYYYYMMDD(dateStr) {
    if (!dateStr) return '';
    try {
        const match = String(dateStr).match(/^(\d{4}-\d{2}-\d{2})/);
        if (match) return match[1];
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) {
            return d.toISOString().split('T')[0];
        }
    } catch (e) {
        console.error('Error parsing date string:', dateStr, e);
    }
    return '';
}

// Show edit student modal pre-filled with student details
async function showEditStudentModal(sid) {
    try {
        if (!sid) throw new Error('Student ID is missing');
        const cleanSid = String(sid).trim();
        const res = await fetch(`${API_BASE}/students/${encodeURIComponent(cleanSid)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Student not found');
        
        const st = data.student || data.data;
        
        document.getElementById('editStudentOriginalId').value = st.student_id;
        document.getElementById('editStudentId').value = st.student_id;
        document.getElementById('editStudentName').value = st.name;
        document.getElementById('editStudentDept').value = st.student_department || '';
        document.getElementById('editStudentPhone').value = st.phone_number || '';
        document.getElementById('editStudentMealPlan').value = st.meal_plan || 'FULL';
        document.getElementById('editStudentMessPrice').value = st.mess_price !== null && st.mess_price !== undefined ? st.mess_price : '';
        
        // Safely extract YYYY-MM-DD join date with fallbacks to avoid blank date inputs
        const rawDate = st.join_date || st.created_at || new Date().toISOString().split('T')[0];
        document.getElementById('editStudentJoinDate').value = formatToYYYYMMDD(rawDate);
        
        document.getElementById('editStudentActive').value = st.active ? '1' : '0';
        
        // Attach live meal plan price listener to the Edit dropdown too
        const editPlanSelect = document.getElementById('editStudentMealPlan');
        const editPriceInput = document.getElementById('editStudentMessPrice');
        if (editPlanSelect && editPriceInput) {
            const updatePlaceholder = (e) => {
                const plan = editPlanSelect.value;
                let defaultPrice = 3000;
                if (plan === 'LUNCH_ONLY') defaultPrice = 1800;
                else if (plan === 'DINNER_ONLY') defaultPrice = 1500;
                editPriceInput.placeholder = `Default: ${defaultPrice} Rs`;
                if (e) editPriceInput.value = defaultPrice;
            };
            editPlanSelect.removeEventListener('change', editPlanSelect._handler);
            editPlanSelect._handler = updatePlaceholder;
            editPlanSelect.addEventListener('change', updatePlaceholder);
            updatePlaceholder();
        }
        
        document.getElementById('editStudentModal').classList.add('active');
    } catch (error) {
        console.error('Error opening edit student modal:', error);
        alert('Error fetching student details: ' + error.message);
    }
}

// Close edit student modal
function closeEditStudentModal() {
    document.getElementById('editStudentModal').classList.remove('active');
}

// Submit edit student profile form
async function submitEditStudentForm(event) {
    event.preventDefault();
    const originalId = document.getElementById('editStudentOriginalId').value;
    const form = document.getElementById('editStudentForm');
    const formData = new FormData(form);
    
    try {
        const res = await fetch(`${API_BASE}/students/${originalId}`, {
            method: 'PUT',
            body: formData
        });
        
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to update student');
        
        showPayToast('✅ Student profile updated successfully!');
        closeEditStudentModal();
        
        // Refresh active listings / dashboards
        loadDashboard();
        if (typeof loadStudentsList === 'function') {
            loadStudentsList();
        }
        if (typeof loadProfilesGrid === 'function') {
            loadProfilesGrid();
        }
        
        // If we are currently viewing this student in the profile tab, reload it!
        const currentViewedId = document.getElementById('profileStudentId').textContent;
        if (currentViewedId === originalId) {
            // Update search input to the new student_id in case it was renamed!
            document.getElementById('profileSearchInput').value = data.student.student_id;
            searchStudentProfile();
        }
    } catch (error) {
        console.error('Error saving student profile updates:', error);
        alert('Error: ' + error.message);
    }
}

// Trigger student edit modal from Account/Payment details popup
function triggerEditFromAccountModal() {
    if (!_payStudentId) {
        alert('No student loaded');
        return;
    }
    const studentIdToEdit = _payStudentId;
    closeStudentProfileModal();
    showEditStudentModal(studentIdToEdit);
}

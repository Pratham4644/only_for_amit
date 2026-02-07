const fetch = require('node-fetch');

const API_BASE = 'http://localhost:3000/api';

// Sample students to add
const sampleStudents = [
    {
        student_id: '101',
        name: 'Rahul Kumar',
        room_number: '205',
        meal_plan: 'FULL'
    },
    {
        student_id: '102',
        name: 'Priya Sharma',
        room_number: '301',
        meal_plan: 'FULL'
    },
    {
        student_id: '103',
        name: 'Amit Patel',
        room_number: '208',
        meal_plan: 'FULL'
    },
    {
        student_id: '104',
        name: 'Sneha Reddy',
        room_number: '405',
        meal_plan: 'LUNCH_ONLY'
    },
    {
        student_id: '105',
        name: 'Rohan Singh',
        room_number: '112',
        meal_plan: 'DINNER_ONLY'
    }
];

async function addSampleStudents() {
    console.log('🔄 Adding sample students...\n');

    for (const student of sampleStudents) {
        try {
            const formData = new URLSearchParams();
            formData.append('student_id', student.student_id);
            formData.append('name', student.name);
            formData.append('room_number', student.room_number);
            formData.append('meal_plan', student.meal_plan);

            const response = await fetch(`${API_BASE}/students`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: formData
            });

            const data = await response.json();

            if (response.ok) {
                console.log(`✅ Added: ${student.name} (${student.student_id})`);
            } else {
                console.log(`❌ Failed: ${student.name} - ${data.error}`);
            }
        } catch (error) {
            console.log(`❌ Error adding ${student.name}: ${error.message}`);
        }
    }

    console.log('\n✅ Sample students added!\n');
}

async function listStudents() {
    console.log('📋 Current students in database:\n');

    try {
        const response = await fetch(`${API_BASE}/students`);
        const data = await response.json();

        console.log(`Total Students: ${data.students.length}\n`);

        data.students.forEach(student => {
            console.log(`ID: ${student.student_id} | Name: ${student.name} | Room: ${student.room_number} | Plan: ${student.meal_plan}`);
        });

        console.log('\n');
    } catch (error) {
        console.log(`❌ Error fetching students: ${error.message}`);
    }
}

async function testScan(studentId) {
    console.log(`\n🔍 Testing scan for student ${studentId}...\n`);

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
            console.log(`✅ ${data.message}`);
            console.log(`   Student: ${data.student.name}`);
            console.log(`   Meal: ${data.mealType}`);
            console.log(`   Time: ${data.attendance.scan_time}`);
            console.log(`   Late: ${data.isLate ? 'Yes' : 'No'}`);
        } else {
            console.log(`❌ ${data.message}`);
            console.log(`   Error: ${data.error}`);
        }
    } catch (error) {
        console.log(`❌ Error: ${error.message}`);
    }
}

async function getTodayCount() {
    console.log('\n📊 Today\'s Attendance Count:\n');

    try {
        const response = await fetch(`${API_BASE}/attendance/today/count`);
        const data = await response.json();

        console.log(`Total Students: ${data.total_students}`);
        console.log(`Lunch Present: ${data.lunch.present} | Absent: ${data.lunch.absent}`);
        console.log(`Dinner Present: ${data.dinner.present} | Absent: ${data.dinner.absent}`);
        console.log(`Current Meal: ${data.current_meal || 'None'}`);
        console.log('\n');
    } catch (error) {
        console.log(`❌ Error: ${error.message}`);
    }
}

async function getCurrentMeal() {
    console.log('⏰ Current Meal Status:\n');

    try {
        const response = await fetch(`${API_BASE}/attendance/current-meal`);
        const data = await response.json();

        if (data.active) {
            console.log(`✅ Active Meal: ${data.meal_type}`);
            console.log(`   Time: ${data.start_time} - ${data.end_time}`);
            console.log(`   Late Warning: ${data.late_warning_time}`);
        } else {
            console.log(`❌ No active meal time`);
        }
        console.log('\n');
    } catch (error) {
        console.log(`❌ Error: ${error.message}`);
    }
}

// Main test function
async function runTests() {
    console.log('\n🚀 MESS ATTENDANCE SYSTEM - TEST SCRIPT\n');
    console.log('='.repeat(50) + '\n');

    // Add sample students
    await addSampleStudents();

    // List all students
    await listStudents();

    // Check current meal
    await getCurrentMeal();

    // Get today's count
    await getTodayCount();

    console.log('='.repeat(50));
    console.log('\n✅ Test script completed!\n');
    console.log('📝 Next steps:');
    console.log('   1. Open http://localhost:3000 in your browser');
    console.log('   2. Go to Admin Panel to manage students');
    console.log('   3. Go to Counter Screen to test QR scanning');
    console.log('   4. Use student IDs: 101, 102, 103, 104, 105\n');
}

// Run tests
runTests().catch(console.error);

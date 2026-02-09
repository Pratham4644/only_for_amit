const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3000/api';

async function testEndpoint(name, url) {
    try {
        const response = await fetch(url);
        const data = await response.json();

        console.log(`\nTesting ${name} (${url})...`);
        console.log(`Status: ${response.status} ${response.statusText}`);

        if (response.ok) {
            console.log('✅ Success');
            // Log a snippet of data to confirm structure
            if (Array.isArray(data)) {
                console.log(`Received ${data.length} items`);
            } else if (data.students && Array.isArray(data.students)) {
                console.log(`Received ${data.students.length} students`);
            } else if (data.lunch || data.dinner) {
                console.log('Received attendance data');
            } else {
                console.log('Data received');
            }
        } else {
            console.log('❌ Failed');
            console.log('Error:', data);
        }
    } catch (error) {
        console.log(`❌ Error testing ${name}:`, error.message);
    }
}

async function runTests() {
    console.log('🚀 Starting API Verification Check...\n');

    // Test Students API
    await testEndpoint('Students API', `${BASE_URL}/students`);

    // Test Attendance API
    await testEndpoint('Today\'s Attendance', `${BASE_URL}/attendance/today`);

    // Test Settings API
    // Note: settings route might be protected or have specific structure, checking existence
    await testEndpoint('Settings API', `${BASE_URL}/settings/meal-timings`);

    // Test Current Meal API
    await testEndpoint('Current Meal', `${BASE_URL}/attendance/current-meal`);

    console.log('\n✨ Verification Complete');
}

runTests();

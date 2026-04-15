'use strict';

/**
 * test-leave-credits.js — End-to-End Test Suite for Leave Credit System
 *
 * Requires the server to be running on localhost:3000.
 * Usage: node test-leave-credits.js
 */

const BASE = 'http://localhost:3000/api';

// Simple fetch wrapper (uses built-in fetch in Node 18+, or node-fetch)
let fetch;
try {
    fetch = global.fetch ?? require('node-fetch');
} catch {
    console.error('Please install node-fetch: npm install node-fetch@2');
    process.exit(1);
}

// ─── Test Utilities ───────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function pass(name) {
    console.log(`  ✅  ${name}`);
    passed++;
}

function fail(name, reason) {
    console.error(`  ❌  ${name}`);
    console.error(`      → ${reason}`);
    failed++;
}

async function api(method, path, body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const res  = await fetch(`${BASE}${path}`, opts);
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
}

// ─── Test Sections ────────────────────────────────────────────────────────────

async function testLeaveRequests() {
    console.log('\n📋  Leave Requests');

    const today   = new Date();
    const ym      = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const dayStr  = String(today.getDate()).padStart(2, '0');
    const from    = `${ym}-01`;
    const to      = `${ym}-${dayStr}`;
    const testSID = '__TEST_STUDENT__';

    // -- Require student to exist for a real test, so we use the first active student
    let firstStudent = null;
    {
        const { data } = await api('GET', '/students');
        if (data.students && data.students.length > 0) {
            firstStudent = data.students[0].student_id;
        }
    }

    if (!firstStudent) {
        console.log('  ⚠️  No active students found — skipping leave request tests');
        return { ym };
    }

    let leaveId = null;

    // Submit
    {
        const { status, data } = await api('POST', '/leave/request', {
            student_id: firstStudent,
            from_date:  from,
            to_date:    to,
            reason:     'Test leave',
        });
        if (status === 201 && data.id) {
            leaveId = data.id;
            pass(`POST /leave/request → ${status} (id=${leaveId})`);
        } else {
            fail('POST /leave/request', JSON.stringify(data));
        }
    }

    // Reject multi-month
    {
        const { status } = await api('POST', '/leave/request', {
            student_id: firstStudent,
            from_date:  `${ym}-28`,
            to_date:    `${ym.slice(0, 4)}-${String(Number(ym.slice(5)) + 1).padStart(2, '0')}-05`,
        });
        if (status === 400) pass('Rejects cross-month request → 400');
        else fail('Rejects cross-month request', `Got ${status}`);
    }

    // List all
    {
        const { status, data } = await api('GET', '/leave/requests');
        if (status === 200 && Array.isArray(data.requests)) pass('GET /leave/requests → 200');
        else fail('GET /leave/requests', JSON.stringify(data));
    }

    // Student list
    {
        const { status, data } = await api('GET', `/leave/requests/${firstStudent}`);
        if (status === 200) pass(`GET /leave/requests/${firstStudent} → 200`);
        else fail('GET /leave/requests/:id', JSON.stringify(data));
    }

    // Approve
    if (leaveId) {
        const { status, data } = await api('PUT', `/leave/requests/${leaveId}/approve`);
        if (status === 200 && data.status === 'APPROVED') pass(`PUT /leave/requests/${leaveId}/approve → APPROVED`);
        else fail('Approve leave request', JSON.stringify(data));
    }

    // Cannot approve again
    if (leaveId) {
        const { status } = await api('PUT', `/leave/requests/${leaveId}/approve`);
        if (status === 400) pass('Double-approve → 400 (correct)');
        else fail('Double-approve guard', `Got ${status}`);
    }

    return { ym, firstStudent, leaveId };
}

async function testHalfDayRequest(firstStudent, ym) {
    console.log('\n🌓  Half-Day Requests');

    if (!firstStudent) {
        console.log('  ⚠️  Skipped (no student)');
        return;
    }

    const today  = new Date();
    const dayStr = String(today.getDate()).padStart(2, '0');
    const date   = `${ym}-${dayStr}`;

    // Valid half-day
    {
        const { status, data } = await api('POST', '/leave/request', {
            student_id:    firstStudent,
            from_date:     date,
            to_date:       date,
            is_half_day:   true,
            half_day_meal: 'lunch',
            reason:        'Half-day test',
        });
        if (status === 201 && data.total_days === 0.5) pass('Half-day request → total_days = 0.5');
        else fail('Half-day request', JSON.stringify(data));
    }

    // Invalid half-day (no meal specified)
    {
        const { status } = await api('POST', '/leave/request', {
            student_id:  firstStudent,
            from_date:   date,
            to_date:     date,
            is_half_day: true,
        });
        if (status === 400) pass('Half-day without meal → 400');
        else fail('Half-day without meal guard', `Got ${status}`);
    }
}

async function testCredits(ym) {
    console.log('\n💰  Leave Credits');

    // Auto compute
    {
        const { status, data } = await api('POST', `/leave/credits/compute/${ym}`);
        if (status === 200) pass(`POST /leave/credits/compute/${ym} → 200 (${data.saved} saved)`);
        else fail('Auto compute', JSON.stringify(data));
    }

    // Manual compute
    {
        const { status, data } = await api('POST', `/leave/credits/compute-manual/${ym}`);
        if (status === 200) pass(`POST /leave/credits/compute-manual/${ym} → 200`);
        else fail('Manual compute', JSON.stringify(data));
    }

    // Merged compute
    {
        const { status, data } = await api('POST', `/leave/credits/compute-merged/${ym}`);
        if (status === 200) pass(`POST /leave/credits/compute-merged/${ym} → 200`);
        else fail('Merged compute', JSON.stringify(data));
    }

    // Month summary
    {
        const { status, data } = await api('GET', `/leave/credits/month/${ym}`);
        if (status === 200 && data.leave_month === ym) pass(`GET /leave/credits/month/${ym} → 200`);
        else fail('Month summary', JSON.stringify(data));
    }

    // All credits
    {
        const { status, data } = await api('GET', '/leave/credits');
        if (status === 200 && Array.isArray(data.credits)) pass('GET /leave/credits → 200');
        else fail('GET /leave/credits', JSON.stringify(data));
    }

    // Apply (next month)
    const cm = ym; // apply this month's pending (as if it's the 1st of next month)
    {
        const { status, data } = await api('POST', `/leave/credits/apply/${cm}`);
        if (status === 200) pass(`POST /leave/credits/apply/${cm} → 200 (applied: ${data.applied})`);
        else fail('Apply credits', JSON.stringify(data));
    }
}

async function testStudentBalance(firstStudent) {
    console.log('\n👤  Student Balance');

    if (!firstStudent) {
        console.log('  ⚠️  Skipped (no student)');
        return;
    }

    const { status, data } = await api('GET', `/leave/credits/student/${firstStudent}`);
    if (status === 200 && 'current_balance' in data) {
        pass(`GET /leave/credits/student/${firstStudent} → balance: ${data.current_balance}`);
    } else {
        fail('Student balance', JSON.stringify(data));
    }
}

// ─── Runner ───────────────────────────────────────────────────────────────────

(async () => {
    console.log('═══════════════════════════════════════════════');
    console.log('  Leave Credit System — Test Suite');
    console.log('  Target:', BASE);
    console.log('═══════════════════════════════════════════════');

    try {
        const { ym, firstStudent } = await testLeaveRequests();
        await testHalfDayRequest(firstStudent, ym);
        await testCredits(ym);
        await testStudentBalance(firstStudent);
    } catch (err) {
        console.error('\n💥 Unexpected error:', err.message);
        process.exit(1);
    }

    console.log('\n═══════════════════════════════════════════════');
    console.log(`  Results: ${passed} passed, ${failed} failed`);
    console.log('═══════════════════════════════════════════════\n');

    process.exit(failed > 0 ? 1 : 0);
})();

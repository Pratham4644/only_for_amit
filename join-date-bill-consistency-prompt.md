# Task: Prevent join_date / bill date inconsistency

## Context

Repo: `only_for_amit` — Node.js + Express + SQLite mess/cafeteria attendance
and billing system.

Relevant files:
- `routes/payments.js` — `POST /bills/preview` and `POST /bills/generate`
  (both take `student_id`, `from_date`, `to_date`, `month` in the body).
- `routes/students.js` — `PUT /:id` (the general student-update endpoint,
  handles `join_date` among other fields around line 337-339).

## The bug this fixes

We found a live case where a student's profile showed `join_date:
2026-07-17` (today), but an existing bill on file for that same student ran
from `2026-06-01` to `2026-07-31` — i.e. the system had already billed him
for six weeks before his profile says he joined. This produced a nonsensical
negative balance and a `payment_upto` date that displayed as being before
his join date, which looked like a calculation bug but wasn't — the
underlying data was just inconsistent, and nothing in the app prevented or
flagged it.

Two gaps allowed this:
1. `POST /bills/generate` doesn't check the bill's `from_date` against the
   student's `join_date` at all.
2. `PUT /:id` doesn't check whether changing `join_date` would contradict
   bills that already exist for that student.

## Requirements

### 1. Block bill generation before join_date

In both `POST /bills/preview` and `POST /bills/generate` (`routes/payments.js`),
after loading the student record (both routes already fetch it to get
`meal_plan`/`mess_price`), add a check:

```js
if (student.join_date && from_date < student.join_date) {
    return res.status(400).json({
        success: false,
        error: 'BILL_BEFORE_JOIN_DATE',
        message: `Bill start date (${from_date}) is before this student's join date (${student.join_date}). Update the student's join date first if it's wrong, or adjust the bill's date range.`
    });
}
```

Simple string comparison is fine since both are `YYYY-MM-DD` — no date
parsing needed. Apply this to **both** the preview and generate endpoints,
not just generate — the preview should show the same rejection so it's
caught before generation is even attempted.

### 2. Warn (don't silently allow) when editing join_date would contradict existing bills

In `PUT /:id` (`routes/students.js`), when `join_date` is being changed to a
later date than it currently is, check whether any existing bill for this
student has a `from_date` earlier than the *new* `join_date`. If so, don't
silently accept the edit — return a 409 with the conflicting bill info so
the admin can make an informed choice:

```js
if (join_date !== undefined && join_date) {
    db.get(
        `SELECT MIN(from_date) as earliest_bill FROM monthly_bills WHERE student_id = ?`,
        [studentId],
        (errBill, billRow) => {
            if (!errBill && billRow && billRow.earliest_bill && join_date > billRow.earliest_bill) {
                db.close();
                return res.status(409).json({
                    error: 'JOIN_DATE_CONTRADICTS_BILLS',
                    message: `This student has a bill starting ${billRow.earliest_bill}, which is before the new join date (${join_date}). Add ?force=true to the request to override anyway, or fix the bill first.`,
                    earliest_bill_date: billRow.earliest_bill
                });
            }
            // ... proceed with the existing update logic
        }
    );
}
```

Support an explicit `?force=true` query param (or `force: true` in the body
— match whatever convention the rest of this file already uses for
similar overrides, check `PUT /:id`'s existing param handling) so admins
who genuinely need to override this (e.g. fixing a real data-entry mistake)
aren't permanently blocked — they just can't do it *silently* by accident
anymore.

### 3. One-time data fix (do this manually, not via code)

Not part of the code change, but flag it in your PR description: student
IDs `1` and `2` currently have this exact inconsistency in the live data
(join_date newer than an existing bill's start date) and should be
corrected manually via the admin UI — set their `join_date` back to on or
before their earliest bill's `from_date` — once the guardrails above are in
place to prevent it recurring.

## Explicit non-goals

- Don't change the bill calculation formula itself (the perPlatePrice /
  mealsPerDay / deduction math) — this task is purely about preventing
  inconsistent dates, not billing amounts.
- Don't add this check to `PUT /:id` for fields other than `join_date`.
- Don't retroactively modify any existing bill or payment records — the
  one-time fix in requirement #3 only touches `students.join_date`, and
  it's a manual UI action, not something the code should do automatically.

## Acceptance criteria

1. `POST /bills/preview` and `POST /bills/generate` both reject (400,
   `BILL_BEFORE_JOIN_DATE`) a request where `from_date` is earlier than the
   student's `join_date`.
2. `PUT /:id` rejects (409, `JOIN_DATE_CONTRADICTS_BILLS`) a `join_date`
   change that would postdate an existing bill for that student, unless a
   `force` override is explicitly passed.
3. Editing any other field on a student (name, phone, meal plan, etc.)
   without touching `join_date` is completely unaffected — no new
   validation fires unless `join_date` itself is part of the request.
4. A brand-new student with no bills yet can have their `join_date` set to
   anything without triggering the check in #2 (there's nothing to
   contradict).

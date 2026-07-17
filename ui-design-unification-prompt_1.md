# Task: Unify the visual design across the app and remove the "AI-generated" tells

## Context

Repo: `only_for_amit` — a Node.js + Express + SQLite mess/cafeteria attendance
and billing system with plain HTML/CSS/JS frontends (no framework, no build
step).

Relevant files:
- `public/admin/index.html`, `public/admin/style.css`, `public/admin/app.js`
  — the admin dashboard (what the mess owner/staff use).
- `public/counter/index.html`, `public/counter/style.css`,
  `public/counter/scanner.js` — the QR scanner screen (what students see at
  the counter).

This is a **visual-only task**. Do not change any backend route, any billing
logic, any database schema, or any JavaScript business logic (fetch calls,
event handlers' underlying behavior, etc.) — only touch markup, styles, and
icon rendering.

## Problem

The two screens currently look like two different products:

- `public/admin/style.css` uses a purple-gradient palette:
  `--accent-purple: #6c5ce7`, `--primary-gradient: linear-gradient(135deg,
  #f0f2ff 0%, #e0e4ff 100%)`, `--sidebar-bg: #f8f9ff`.
- `public/counter/style.css` uses a completely unrelated navy/green palette:
  `--primary-color: #2c3e50`, `--accent-color: #27ae60`, `--bg-color:
  #f5f5f5`.

On top of that, both screens use **emoji as the entire icon system**
(📊 👥 📈 🗓️ ⚙️ 🔄 💰 ✅ 📋 🔍 🍽️ 👤 ⚠️ and dozens more — see inventory
below), which reads as unfinished/AI-generated rather than a deliberate
design choice.

## Requirements

### 1. Create one shared token file

Create `public/shared/tokens.css` containing a single set of CSS custom
properties — colors, spacing scale, font sizes, border radii, shadows — that
both `public/admin/style.css` and `public/counter/style.css` will use.

- Keep the admin panel's purple as the primary brand color (it's the more
  developed of the two palettes), but refine it into a proper semantic
  token set, e.g.:
  ```css
  :root {
    --color-primary: #6c5ce7;
    --color-primary-light: #e0e4ff;
    --color-bg: #f8f9ff;
    --color-surface: #ffffff;
    --color-text-primary: #2d3436;
    --color-text-secondary: #636e72;
    --color-success: #00b894;
    --color-danger: #d63031;
    --color-warning: #fdcb6e;
    --color-border: #dfe6e9;
    --shadow-card: 0 10px 30px rgba(0, 0, 0, 0.05);
    --radius-sm: 0.5rem;
    --radius-md: 0.9375rem;
    --font-size-base: 1rem;      /* NOT 25px — see note below */
  }
  ```
- **Fix the base font-size bug while you're in there:** `public/admin/style.css`
  currently sets `html { font-size: 25px; }` (156% of the browser default) and
  `public/counter/style.css` sets `html { font-size: 20px; }` — two different
  scales for the same rem values across the two screens, which is why
  identical-looking elements are sized differently between them. Set both to
  `font-size: 100%` (i.e. respect the user's browser default, typically 16px)
  in the shared tokens file, and adjust any `rem`-based sizes elsewhere that
  were tuned assuming the old base (spot check headers/buttons after the
  change — they'll render smaller than before at the new 16px base, so scale
  up the specific `rem` values that need it rather than reintroducing a
  non-standard root font-size).
- Link `public/shared/tokens.css` before `style.css` in both `index.html` files.
- Update `public/admin/style.css` and `public/counter/style.css` to reference
  the shared tokens instead of their own duplicate `:root` blocks. Keep any
  page-specific variables that genuinely don't belong in the shared file
  (there shouldn't be many).

### 2. Replace emoji with a real icon set

Use **Lucide icons** (https://lucide.dev), loaded via CDN — no build step
needed:
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/lucide-static/latest/lucide.min.js"></script>
```
or the standard Lucide web CDN (check current recommended embed snippet on
lucide.dev — use `<i data-lucide="icon-name"></i>` markup plus a single
`lucide.createIcons();` call after DOM content loads, in both `app.js` and
`scanner.js`).

**Priority order** (do structural/high-visibility icons first — the full
emoji inventory is large, ~90 instances total, many are one-off toast
messages that are lower priority):

**High priority — sidebar nav + page headers + stat cards** (in
`public/admin/index.html`):
| Current emoji | Context | Suggested Lucide icon |
|---|---|---|
| 📊 | Dashboard nav | `layout-dashboard` |
| 👥 | Students nav | `users` |
| 📈 | Reports/stats nav | `trending-up` |
| 🗓️ | Leave Credits nav | `calendar-days` |
| ⚙️ | Settings nav | `settings` |
| 👤 | Profile nav | `user` |
| 💰 | Payments/fees nav | `wallet` or `indian-rupee` |
| 🔍 | Search | `search` |
| 🔄 | Refresh/sync actions | `refresh-cw` |
| 🏦 | Bank/payment mode | `landmark` |

**Medium priority — action buttons and status badges** (`app.js` template
strings): ✅ → `check-circle`, ❌ → `x-circle`, ⚠️ → `alert-triangle`,
🗑️ → `trash-2`, 📱 → `smartphone`, ➕ → `plus`, ⬇️ → `download`,
📅 → `calendar`.

**Lower priority — meal-type icons** (🍽️ 🍛 🍜 🍲 across both admin and
counter screens): pick one consistent Lucide icon (`utensils`) rather than
three different food emoji standing in for "meal" — these were being used
somewhat decoratively/inconsistently anyway.

**Skip entirely, don't touch:** plain text checkmark/cross symbols used
inline in already-short toast/alert strings where the visual weight of a
full icon isn't warranted (e.g. `✓`/`✗` single characters in
`public/admin/app.js`) — converting every one of these to an SVG icon call is
low value; only convert the ones that are also full emoji already covered
above.

Match icon color to the semantic token it's replacing (a danger icon uses
`var(--color-danger)`, etc.) via the `color` CSS property, since Lucide
icons inherit `currentColor` by default.

### 3. Add a real tablet breakpoint

Both stylesheets currently jump straight from desktop to a single
`@media (max-width: 48rem)` (768px) mobile breakpoint — nothing in between,
so tablet-width screens (768px–1024px) get the full desktop layout squeezed
into less space. Add a second breakpoint:
```css
@media (max-width: 64rem) { /* 1024px — tablet */
  /* narrow the sidebar/stat grid moderately, not fully collapsed */
}
```
Test that the transition from desktop → tablet → mobile is gradual, not a
sudden jump.

### 4. Remove self-narrating code comments

These read as AI-generated and don't belong in shipped code — delete them
(the code itself doesn't need to change, just the comment):
- `public/admin/style.css`: `/* Base font size (increased 25% from 16px) */`
  (moot anyway once you fix requirement #1's font-size change)
- `public/counter/style.css`: `/* Base font size (increased 25% from 16px) */`
  and `/* Dominant Title */` on the `.header h1` rule
- Do a broader pass for any other comment that explains obvious arithmetic
  or restates what the next line already says (e.g. `/* 1400px */` next to
  `max-width: 87.5rem`) — remove those too. Keep comments that explain *why*
  something is done a certain way (there are legitimately few of these, and
  they're fine to keep).

### 5. Explicit non-goals

- Don't change any backend code, routes, or business logic.
- Don't change the actual page structure/layout (sidebar-left,
  content-right, card-based dashboard) — this is a re-skin, not a redesign.
- Don't remove functional color-coding (success=green, danger=red,
  warning=yellow) — just route those through the new shared tokens.
- Don't convert every single emoji if it's low-value busywork (see the
  "skip entirely" note in requirement #2) — prioritize what's visually
  prominent.

## Acceptance criteria

1. `public/admin/style.css` and `public/counter/style.css` both reference
   `public/shared/tokens.css` for their color/spacing/shadow values — no
   duplicate, conflicting `:root` color definitions remain between the two
   files.
2. Both screens render with the same brand color, same base font scale, and
   visually read as the same product when viewed side by side.
3. All nav items, page headers, and stat cards in the admin panel use Lucide
   icons instead of emoji. Meal-type emoji (🍽️🍛🍜🍲) are consolidated to one
   consistent icon.
4. A tablet-width viewport (e.g. 900px) shows a layout distinct from both the
   full desktop layout and the fully-collapsed mobile layout.
5. The two self-narrating comments called out in requirement #4 are gone,
   plus any other comment restating obvious code in plain arithmetic.
6. No backend file is touched. `git diff --stat` should show changes only
   under `public/`.

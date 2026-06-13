# Pipeskool Site Management Software

Internal mobile + web software for Pipeskool Projects Pvt. Ltd.

## CORE SITE OPERATIONS — all 6 modules complete

| # | Module | Web page | Mobile screen |
|---|--------|----------|---------------|
| 1 | Attendance & Labour | /dashboard /attendance /wages /workers | /m (punch), /m/muster, /m/verify, /m/add |
| 2 | Daily Progress (DPR) | /dpr , /dpr/report | /m/dpr |
| 3 | Expenses / Petty Cash / Salary Advance | /expenses | /m/money |
| 4 | Material Stock & Inventory | /stock | /m/stock |
| 5 | Material Indent & Purchase | /purchase , /purchase/po | /m/indent |
| 6 | Tools & Assets Register | /assets | /m/assets |

The mobile app is at the same web address under `/m`. Bottom bar shows
Punch · Muster · DPR · Stock · More (Indent, Money, Assets, Verify, Add worker).

The app runs in DEMO MODE until Supabase is connected — every screen shows
realistic sample data so you can explore the entire product immediately.

## Database setup

Run these SQL files in Supabase SQL Editor IN ORDER:
1. pipeskool_module1_database.sql   (sites, workers, attendance, wages)
2. pipeskool_module2_dpr.sql        (activities, DPR)
3. pipeskool_module3_expenses.sql   (expenses, salary advance, imprest)
4. pipeskool_module4_stock.sql      (item master, stock ledger)
5. pipeskool_module5_purchase.sql   (vendors, indents, PO, 3-way match)
6. pipeskool_module6_assets.sql     (tools & assets)

## Launch steps (one-time, ~20 min)

### Step 1 — GitHub (free)
github.com → New repository `pipeskool-dashboard` (Private) → upload all files.

### Step 2 — Vercel (free)
vercel.com → Continue with GitHub → Import the repo → Deploy.
You get a live link (demo mode). Open `/m` on a phone, "Add to Home screen".

### Step 3 — Supabase (free)
supabase.com → New project `pipeskool`, region Mumbai → run the 6 SQL files in order
→ Project Settings → API → copy Project URL + anon key.

### Step 4 — Connect
Vercel → Settings → Environment Variables:
- NEXT_PUBLIC_SUPABASE_URL = (Project URL)
- NEXT_PUBLIC_SUPABASE_ANON_KEY = (anon key)
Redeploy. Demo mode turns off; live data flows.

### Step 5 — Storage bucket (for photos)
Supabase → Storage → New bucket named `attendance-photos` (used by selfies,
bills, challans, DPR photos).

## Run locally (optional)
npm install && npm run dev → http://localhost:3000

Built and maintained with Claude (Anthropic). Bring this folder back to chat for any change.

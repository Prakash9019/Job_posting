# ApplyPilot — Execution & Testing Runbook

This runbook provides complete, step-by-step instructions for running and testing both the **frontend** and **backend** of ApplyPilot, verifying security controls, running automated test suites, and performing manual API audits.

---

## 🏗️ 1. Architecture Overview

ApplyPilot is built as a **unified full-stack Next.js application**:
* **Frontend:** Interactive React 19 UI with glassmorphic dark theme (`app/page.tsx`, `components/`).
* **Backend:** Next.js Server App Router API routes (`app/api/*`).
* **Database:** Local SQLite database with Prisma ORM 7 (`data/dev.db`).
* **Execution:** Both frontend and backend run concurrently on the same port: `http://localhost:3000`. No separate backend server process is needed.

---

## 📋 2. Prerequisites & Pre-Configured Credentials

All dependencies and local databases are already initialized.

### Default Test Credentials (from `.env`)

| User | User ID | Password | Role / Scope |
| :--- | :--- | :--- | :--- |
| **User A** | `user_a` | `UserA_PilotPass_2026!` | Tenant A (Strictly Isolated) |
| **User B** | `user_b` | `UserB_PilotPass_2026!` | Tenant B (Strictly Isolated) |

---

## 🚀 3. How to Start the Application

### Option A: Development Mode (Hot-Reloading)
Run the following in the repository root (`e:\Job_posting`):

```bash
npm run dev
```

* **URL:** `http://localhost:3000`
* **Backend API Base:** `http://localhost:3000/api`

> [!NOTE]
> When you first open the browser at `http://localhost:3000` while unauthenticated, you will see `GET /api/history 401` and `GET /api/resumes 401` in your console. This is **expected behavior** and proves that protected resources reject unauthenticated requests before login!

To stop the dev server, press `Ctrl + C` and type `Y`.

### Option B: Production Mode (Optimized Build)
To test the production build:

```bash
# 1. Build optimized bundle and run TypeScript checks
npm run build

# 2. Launch production server
npm start
```

---

## 🧪 4. Automated Testing Suites

Execute automated verification tests directly from your terminal:

### 1. Comprehensive Security Test Suite
Verifies credential derivation, rejection of unauthenticated requests, session signature tampering protection, cross-user 403 authorization barriers, and token encryption:

```bash
npm test
```
*(or `npm run test:security`)*

**Expected Result:**
```
==========================================================
🎉 ALL 52/52 SECURITY TESTS PASSED!
==========================================================
```

### 2. Audit Verification Suite
Tests cryptographic fallback, AES-256-GCM AEAD encryption, and RFC 2822 MIME mail generation:

```bash
npm run test:audit
```

**Expected Result:**
```
==========================================================
🎉 ALL 22/22 TESTS PASSED SUCCESSFULLY!
==========================================================
```

---

## 🖥️ 5. Frontend Walkthrough & Testing (Browser UI)

1. **Launch Dev Server:**
   ```bash
   npm run dev
   ```
2. **Open Browser:** Navigate to `http://localhost:3000`.
3. **Login as User A:**
   * Click the user profile / login button in the navigation bar.
   * Select **User A**.
   * Enter password: `UserA_PilotPass_2026!`.
   * Click **Authenticate**.
   * Browser stores a signed, secure `applypilot_session` HttpOnly cookie.
4. **Test Authenticated Features for User A:**
   * **Resume Management:** Click "Upload Resume" and upload a sample PDF.
   * **Job Post Screenshots:** Click "Upload Screenshots" and upload 1 or more LinkedIn post screenshots.
   * **Email Draft Review:** View generated cold emails, edit fields, and approve them.
5. **Verify Multi-Tenant Isolation (User B):**
   * Switch user to **User B**.
   * Enter password: `UserB_PilotPass_2026!`.
   * Confirm that User B's dashboard is completely clean and **cannot see** any resumes, batches, or drafts belonging to User A.
6. **Logout:**
   * Click **Logout** to clear the session cookie.

---

## 🛡️ 6. Manual API Security Verification (cURL / Terminal)

With the server running (`npm run dev`), test security barriers using `curl`:

### Test 1: POST /api/auth/session with only `userId` (MUST FAIL 401)
Attempts to obtain a session merely by supplying `userId`:
```bash
curl -i -X POST http://localhost:3000/api/auth/session ^
  -H "Content-Type: application/json" ^
  -d "{\"userId\": \"user_a\"}"
```
**Expected Response:** HTTP `401 Unauthorized`
```json
{
  "success": false,
  "authenticated": false,
  "error": "Authentication required. Supplying userId alone cannot issue a session; valid credentials (password or apiKey) must be provided."
}
```

### Test 2: Spoofed Client Headers (MUST FAIL 401)
Client sends spoofed `x-user-id` header:
```bash
curl -i -X POST http://localhost:3000/api/auth/session ^
  -H "Content-Type: application/json" ^
  -H "x-user-id: user_a" ^
  -d "{\"userId\": \"user_a\"}"
```
**Expected Response:** HTTP `401 Unauthorized` (headers are not trusted).

### Test 3: Cookie Manipulation Attack (MUST FAIL 401)
Client injects fake session cookie:
```bash
curl -i -X POST http://localhost:3000/api/auth/session ^
  -H "Content-Type: application/json" ^
  -H "Cookie: applypilot_session=forged_payload; active_user_id=user_a" ^
  -d "{\"userId\": \"user_a\"}"
```
**Expected Response:** HTTP `401 Unauthorized`.

### Test 4: Authenticate with Valid Credentials (MUST SUCCEED 200)
```bash
curl -i -X POST http://localhost:3000/api/auth/session ^
  -H "Content-Type: application/json" ^
  -d "{\"userId\": \"user_a\", \"password\": \"UserA_PilotPass_2026!\"}" ^
  -c cookies.txt
```
**Expected Response:** HTTP `200 OK`, sets `Set-Cookie: applypilot_session=...; HttpOnly; SameSite=Lax`.

### Test 5: Verify Active Session with Cookie (200 OK)
```bash
curl -i -X GET http://localhost:3000/api/auth/session -b cookies.txt
```
**Expected Response:** HTTP `200 OK` returning User A's profile.

### Test 6: Cross-Tenant Protection (MUST FAIL 403)
Attempting to access another user's resources will be rejected with HTTP `403 Forbidden`.

### Test 7: Terminate Session (DELETE)
```bash
curl -i -X DELETE http://localhost:3000/api/auth/session -b cookies.txt -c cookies.txt
```
**Expected Response:** HTTP `200 OK`, session cookie cleared with `Max-Age=0`.

---

## ❓ 7. Troubleshooting

* **Port 3000 in use?**
  * Check for running Node processes: `netstat -ano | findstr :3000`
  * Terminate via PID if needed: `taskkill /PID <PID> /F`
* **Database Reset / Reseed?**
  * Run `npx prisma db push` to synchronize SQLite schema.

---

## 🔑 8. What You Need to Add to Test Full End-to-End Working

To test the entire workflow (from AI screenshot analysis and email draft generation to live Gmail sending), you only need to configure three values in your `.env` file and prepare sample test files:

### A. Add to `.env`

Open your [.env](file:///e:/Job_posting/.env) file and add the following:

```env
# 1. Google Gemini API Key (Required for AI screenshot analysis & email generation)
# Get a free API key at: https://aistudio.google.com/
GEMINI_API_KEY="AIzaSy..."

# 2. Google Cloud OAuth 2.0 Credentials (Required for Gmail account connection & live sending)
# Create in Google Cloud Console: https://console.cloud.google.com/
GOOGLE_CLIENT_ID="xxxx.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="GOCSPX-xxxx"
```

#### Quick Setup Steps for Google Cloud OAuth:
1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Enable the **Gmail API** (under *APIs & Services* > *Library*).
3. In **OAuth consent screen** (*APIs & Services* > *OAuth consent screen*):
   - Choose User Type: **External**.
   - Add Scopes:
     - `https://www.googleapis.com/auth/gmail.send`
     - `https://www.googleapis.com/auth/userinfo.email`
     - `https://www.googleapis.com/auth/userinfo.profile`
   - Under **Test users**, add your personal Gmail address (e.g. `yourname@gmail.com`).
4. In **Credentials** (*APIs & Services* > *Credentials*):
   - Click **Create Credentials** > **OAuth client ID**.
   - Application type: **Web application**.
   - Authorized JavaScript origins: `http://localhost:3000`
   - Authorized redirect URIs: `http://localhost:3000/api/auth/google/callback`
5. Copy the generated **Client ID** and **Client Secret** into your `.env`.

---

### B. Sample Files to Prepare for Full Testing

To test the complete UI pipeline in the browser:

1. **A Sample PDF Resume:**
   - Any standard PDF resume (e.g. `resume.pdf`).
   - Used by Gemini to ground email drafts strictly in your actual skills and experience, and attached to outgoing emails.
2. **1 to 5 Sample Job Screenshots:**
   - Screenshots of LinkedIn job postings, recruiter posts, or hiring announcements (PNG or JPEG).
   - Gemini will extract the recruiter email, company, job title, and required skills, classify the post type, and create an approved/reviewable email draft.

---

## ☁️ 9. Vercel & PostgreSQL Deployment Guide (100% Production Ready)

ApplyPilot is architected with dual-database and cloud storage adapters to run identically on local SQLite and production Vercel + PostgreSQL.

### Step 1: Provision a PostgreSQL Database
Create a free database using any managed PostgreSQL provider (e.g. [Neon](https://neon.tech/), [Supabase](https://supabase.com/), [Vercel Postgres](https://vercel.com/docs/storage/vercel-postgres), or AWS RDS).
Obtain your connection string:
```
DATABASE_URL="postgresql://user:password@ep-sample.us-east-2.aws.neon.tech/neondb?sslmode=require"
```

### Step 2: Deploy Schema to PostgreSQL
In your terminal, deploy the Prisma 7 migrations to your remote PostgreSQL database:
```bash
# Push migrations to the PostgreSQL database
npm run db:deploy

# Seed initial User A and User B accounts in PostgreSQL
npx tsx prisma/seed.ts
```

### Step 3: Attach Vercel Blob Storage
Because Vercel serverless execution is ephemeral and read-only, persistent file uploads (resumes & screenshots) use **Vercel Blob**:
1. In your [Vercel Project Dashboard](https://vercel.com/), navigate to **Storage** tab.
2. Click **Create Database** > Select **Blob**.
3. Choose a store name and click **Create**. This automatically provisions and links `BLOB_READ_WRITE_TOKEN`.

### Step 4: Configure Vercel Environment Variables
In your Vercel Project Settings > **Environment Variables**, configure:

| Variable | Recommended Value | Notes |
| :--- | :--- | :--- |
| `DATABASE_URL` | `postgresql://user:pass@host/db?sslmode=require` | Your PostgreSQL connection URI |
| `STORAGE_PROVIDER` | `blob` | Switches storage to private Vercel Blob |
| `BLOB_READ_WRITE_TOKEN` | Automatically injected by Vercel | Used by `@vercel/blob` SDK |
| `GEMINI_API_KEY` | `AIzaSy...` | From [Google AI Studio](https://aistudio.google.com/) |
| `GEMINI_ATS_MODEL` | `gemini-2.5-flash` | Optimized model for ATS audits |
| `GEMINI_EXTRACTION_MODEL` | `gemini-3.8-flash` | Optimized for OCR & screenshot extraction |
| `GEMINI_EMAIL_MODEL` | `gemini-3.8-flash` | Optimized for personalized cold email writing |
| `NEXT_PUBLIC_APP_URL` | `https://your-project.vercel.app` | Your Vercel production domain |
| `ENCRYPTION_SECRET` | 64-char hex string | AES-256-GCM token encryption key |
| `SESSION_SECRET` | 64-char hex string | HMAC-SHA256 session signature key |
| `GOOGLE_CLIENT_ID` | `xxxx.apps.googleusercontent.com` | Google Cloud OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | `GOCSPX-xxxx` | Google Cloud OAuth Client Secret |
| `USER_A_PASSWORD` | `UserA_PilotPass_2026!` | Password for tenant User A |
| `USER_B_PASSWORD` | `UserB_PilotPass_2026!` | Password for tenant User B |

### Step 5: Update Google OAuth Redirect URI
In [Google Cloud Console](https://console.cloud.google.com/) > Credentials:
Add to **Authorized redirect URIs**:
```
https://your-project.vercel.app/api/auth/google/callback
```

---

## 📱 10. Mobile Responsiveness & ATS Checker Feature

### Mobile Workflow ("Upload on Mobile & Send All Emails at Once")
1. **Open on Phone:** Navigate to `https://your-project.vercel.app` (or `http://<your-local-ip>:3000` on local WiFi).
2. **Upload Screenshots:** Tap the prominent **Upload** button. The file dialog allows choosing screenshots directly from your phone's photo library or snapping photos using the camera.
3. **Select & Send All:**
   - Tap **Select All** in the Emails tab toolbar.
   - A floating sticky mobile action bar instantly appears at the bottom of the screen with **Approve All** and **Send All ({count})**.
   - Tap **Send All** to dispatch all generated emails via Gmail API in one thumb tap!

### ATS Resume Review & Mistake Inspector
1. **Accessing ATS:** Tap the glowing **ATS Score** button in the Navbar, or the **Inspect ATS Score** button in the dashboard banner or inside the Resume Management dialog.
2. **Analyze Resume & Target Job:**
   - Select your active resume, or take a photo/upload a PDF/DOCX of a new resume.
   - (Optional) Upload a screenshot of the target job posting or paste the job description text.
   - Tap **Start Full ATS Audit**.
3. **Actionable Findings:**
   - **Score Tier (0-100):** Visual status gauge with breakdown across Text Readability, Section Structure, Contact Details, and Quantifiable Impact.
   - **Mistake Inspector:** Filter by High, Medium, or Low severity. Shows exact resume line numbers, quoted text, why ATS filters reject it, and how to fix it.
   - **Job Keyword Gap:** Shows required vs preferred skills matched in experience vs skills section vs missing.
   - **One-Click Smart Rewrites:** Google XYZ formula ("Accomplished [X] measured by [Y] by doing [Z]"). Tap **Apply to Resume Text** to immediately update the live text and watch your score increase in real time!


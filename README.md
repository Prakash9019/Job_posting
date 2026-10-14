# ApplyPilot — Bulk LinkedIn Screenshot Job Application Manager

ApplyPilot is a full-featured web application designed to automate the process of capturing job opportunities from bulk LinkedIn screenshots, extracting structured recruiter contacts and job requirements with Gemini AI, matching them against verified candidate resumes, generating personalized email drafts, and sending approved job applications directly through authorized Gmail accounts using the Gmail API (OAuth 2.0).

Built for **two independent users (User A & User B)**, allowing each user to connect and dispatch from their own verified Gmail account with zero token sharing.

---

## 🚀 Key Features

1. **Dual-User Architecture (User A & User B)**:
   - Dedicated workspace for User A and User B.
   - Independent Gmail OAuth 2.0 connections with tokens encrypted at rest via AES-256-GCM.
   - Independent resume profiles and processing batch history.

2. **Bulk Screenshot Upload (1 to 80 items)**:
   - Drag-and-drop & file picker supporting PNG, JPG, JPEG, and PDF.
   - SHA-256 hash deduplication to eliminate duplicate uploads before processing.
   - Bounded concurrency with configurable rate limits and worker pools.
   - Selective retry for failed items without reprocessing successful extractions.

3. **Gemini Multi-Modal Extraction & Classification**:
   - Single structured extraction prompt with Zod schema validation.
   - Categories: `Job post`, `Recruiter contact`, `LinkedIn profile`, `Application form/portal`, `Unrelated`, `Uncertain`.
   - Fields extracted: Company, Job Title, Contact Email, LinkedIn URLs, Portal links, Description, Skills, Experience, Location/Mode.
   - Security: Screenshot text treated as untrusted data with strict prompt injection guardrails.

4. **Factual Resume Matching & Email Draft Generation**:
   - PDF & text resume parsing.
   - Strict factual grounding: Gemini only references skills, companies, and achievements present in the verified resume.
   - Automated attachment of the candidate's active PDF resume to outgoing applications.

5. **Email Review & Dispatch Dashboard**:
   - Select All scoped to filtered results, deselect, search, and status filtering (`Needs Review`, `Approved`, `Rejected`).
   - Inline draft editor for subject, body, recipient, and company.
   - AI draft regeneration action.
   - Individual draft approval & single send.
   - Bulk send with explicit safety confirmation modal detailing recipient count, sender identity, and resume attachment.
   - Actual email dispatch via Gmail API using RFC 2822 multipart/mixed MIME encoding.
   - Duplicate send prevention: guards against emailing the same opportunity twice.

6. **Dedicated Pipeline Tabs**:
   - **Emails**: Actionable drafts with validated recipient addresses.
   - **LinkedIn Links**: Deduplicated LinkedIn profile, job, and post URLs.
   - **Application Links**: External career portals (Greenhouse, Lever, Workday) with source previews.
   - **Manual Review**: Blurry images, missing emails, or low-confidence extractions with high-res inspector and retry options.
   - **Sent History**: Audit log of sent emails, sender identity, recipients, and Gmail API message IDs.
   - **Overview & Batches**: Batch metrics, progress indicators, and one-click CSV export.

---

## 🛠 Technology Stack

- **Framework**: Next.js 16 (App Router) with TypeScript
- **Styling**: Tailwind CSS with custom glassmorphism and dark theme
- **Database**: SQLite with Prisma ORM 7 & LibSQL driver adapter
- **AI Engine**: Google Gemini API (`@google/genai`)
- **Email Service**: Google Gmail API (`googleapis`) with OAuth 2.0
- **Validation**: Zod
- **Document Processing**: `pdf-parse`
- **Security**: Node.js `crypto` (AES-256-GCM)

---

## ⚙️ Environment Configuration

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Fill in the required configuration values:

| Variable | Description | Example |
| :--- | :--- | :--- |
| `DATABASE_URL` | SQLite database path | `"file:./data/dev.db"` |
| `GEMINI_API_KEY` | Google Gemini API key from [Google AI Studio](https://aistudio.google.com/) | `"AIzaSy..."` |
| `GOOGLE_CLIENT_ID` | OAuth 2.0 Client ID from Google Cloud Console | `"xxxx.apps.googleusercontent.com"` |
| `GOOGLE_CLIENT_SECRET` | OAuth 2.0 Client Secret from Google Cloud Console | `"GOCSPX-xxxx"` |
| `NEXT_PUBLIC_APP_URL` | Application root URL | `"http://localhost:3000"` |
| `ENCRYPTION_SECRET` | 32-byte hex secret for token AES-256-GCM encryption | Run `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `OLD_ENCRYPTION_SECRET` | Previous encryption secret for zero-downtime key rotation | Used automatically for fallback token decryption |
| `STORAGE_PROVIDER` | Storage backend (`local` or `s3`) | `"local"` |
| `UPLOAD_DIR` | Private filesystem folder for uploads | `"./uploads"` |
| `PROCESSING_CONCURRENCY` | Parallel Gemini extraction workers | `"3"` |
| `MAX_PROCESSING_RETRIES` | Max retry attempts for failed images | `"2"` |

---

## 🔐 Encryption Secret Rotation & Token Migration

If `ENCRYPTION_SECRET` is rotated or exposed:
1. Set the new secret as `ENCRYPTION_SECRET` in `.env`.
2. Set the old secret as `OLD_ENCRYPTION_SECRET` in `.env`. The application decryptor will automatically fallback to `OLD_ENCRYPTION_SECRET` without dropping token access.
3. Run the automated migration script to re-encrypt all existing tokens with the new key:
```bash
npm run migrate:secret
```
4. Once completed, `OLD_ENCRYPTION_SECRET` can be safely cleared from your environment.

---

## 🔑 Google Cloud OAuth 2.0 Setup & Persistence

To enable User A and User B to connect their own Gmail accounts:

1. Navigate to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new Project (e.g. `applypilot-job-manager`).
3. Enable the **Gmail API** in APIs & Services.
4. Configure the **OAuth Consent Screen**:
   - User Type: **External** (or Internal for Google Workspace).
   - App Name: `ApplyPilot`.
   - Add Scopes:
     - `https://www.googleapis.com/auth/gmail.send` (Send emails on user's behalf)
     - `https://www.googleapis.com/auth/userinfo.email` (Identify connected Gmail address)
     - `https://www.googleapis.com/auth/userinfo.profile`
   - Test Users: Add the Gmail addresses for **User A** and **User B** while in testing mode.
5. Create **Credentials** -> **OAuth 2.0 Client ID**:
   - Application type: **Web application**.
   - Authorized JavaScript origins: `http://localhost:3000`.
   - Authorized redirect URIs: `http://localhost:3000/api/auth/google/callback`.
6. Copy the **Client ID** and **Client Secret** into your `.env` file.

> [!IMPORTANT]
> **Gmail OAuth Refresh Token Persistence in Testing Mode**:
> In Google Cloud **Testing** mode, Google's policy automatically expires refresh tokens after **7 days** when sensitive/restricted scopes like `gmail.send` are requested.
> - To test sending persistence immediately: click **"Test Send"** next to the connected Gmail account in the top bar (or call `POST /api/auth/google/test-email`).
> - For long-term permanent persistence without 7-day expirations: Publish the app on Google Cloud Console or configure it as **Internal** (if using Google Workspace).

---

## 🛡️ User Isolation & Authorization

ApplyPilot strictly enforces multi-tenant user isolation across all endpoints:
- **Authentication Context**: Provided through the `x-user-id` request header, `?userId=` query parameter, or `active_user_id` cookie.
- **Resource Ownership Guards**: `assertBatchAccess`, `assertResumeAccess`, `assertDraftAccess`, and `assertFileAccess` verify that User B cannot read, modify, delete, or stream User A's resumes, batches, drafts, screenshots, Gmail tokens, or send history (returning `403 Forbidden`).
- **Private Storage Streaming**: Resumes and screenshot files are never exposed in `public/`; they are served exclusively through `/api/files/[type]/[id]` guarded by active user ownership.

To verify encryption, OAuth formatting, and user isolation guards across all resources:
```bash
npm run test:audit
```

---

## 🏃 Quick Start Guide

### 1. Install Dependencies
```bash
npm install
```

### 2. Synchronize Database & Seed Users
```bash
npx prisma db push
npx prisma db seed
```

### 3. Start Development Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

> [!TIP]
> For testing instructions, automated test commands, and manual cURL verification steps, see the dedicated [RUNBOOK.md](RUNBOOK.md).

---

## 📁 Project Architecture

```
├── app/
│   ├── api/
│   │   ├── auth/google/          # OAuth URL, callback, and disconnect handlers
│   │   ├── batches/              # Batch creation, processing, retry, and deletion
│   │   ├── drafts/               # Draft review, editing, regeneration, bulk-send
│   │   ├── files/                # Authenticated private file streaming (resumes & screenshots)
│   │   ├── history/              # Gmail dispatch audit logs
│   │   ├── links/                # Extracted LinkedIn and Application URLs
│   │   ├── overview/             # Metric stats and CSV export data
│   │   ├── resumes/              # Resume uploads, text extraction, active selection
│   │   └── users/                # Dual-user status and account management
│   ├── globals.css               # Styling tokens and glassmorphism utilities
│   ├── layout.tsx                # Dark layout and SEO metadata
│   └── page.tsx                  # Main interactive dashboard
├── components/
│   ├── Navbar.tsx                # Dual-user toggle, Gmail status badge, quick actions
│   ├── SummaryCards.tsx          # Metrics cards with active tab switching
│   ├── BatchUploadModal.tsx      # 1-80 screenshot uploader with hash deduplication
│   ├── ResumeModal.tsx           # Resume manager with extracted text inspector
│   ├── ConfirmationModal.tsx     # Dispatch confirmation dialog before Gmail sending
│   ├── ScreenshotViewerModal.tsx # High-res screenshot inspector
│   ├── icons/LinkedInIcon.tsx    # Standalone SVG icon
│   └── tabs/
│       ├── EmailsTab.tsx         # Email drafts reviewer, editor, and approvals
│       ├── LinkedInTab.tsx       # Extracted LinkedIn URLs catalog
│       ├── ApplicationsTab.tsx   # External career portals list
│       ├── ManualReviewTab.tsx   # Uncertain extractions and retry queue
│       ├── SentHistoryTab.tsx    # Send attempts and Gmail message IDs
│       └── OverviewTab.tsx       # Batch logs and CSV export
├── lib/
│   ├── ai/
│   │   ├── gemini.ts             # Structured extraction and resume-grounded email generation
│   │   └── resume.ts             # PDF and text resume parsing helper
│   ├── db/
│   │   └── prisma.ts             # LibSQL SQLite Prisma client singleton
│   ├── email/
│   │   └── gmail.ts              # Gmail OAuth client, token refresh, and MIME construction
│   ├── processing/
│   │   └── batch.ts              # Bounded concurrency processor and duplicate hashing
│   ├── security/
│   │   └── encryption.ts         # AES-256-GCM token encryption at rest
│   ├── storage/
│   │   ├── index.ts              # Storage factory
│   │   ├── local.ts              # Path-traversal protected local filesystem provider
│   │   └── types.ts              # StorageProvider interface
│   └── validation/
│       └── schemas.ts            # Zod validation schemas
├── prisma/
│   ├── schema.prisma             # Data models
│   └── seed.ts                   # Seeds User A and User B
├── data/                         # SQLite database storage (excluded from git)
├── uploads/                      # Private local uploaded files (excluded from git)
├── .env.example                  # Documented environment template
└── package.json
```

---

## 🔒 Security Best Practices

- **Zero Public Assets for Private Data**: Resumes and screenshots are stored exclusively in the private `uploads/` directory and served through authenticated, route-guarded streaming (`/api/files/[type]/[id]`).
- **Path Traversal Protection**: `LocalStorageProvider` verifies that every file key resolves inside the sandboxed uploads root.
- **Token Encryption**: Google OAuth tokens (`access_token`, `refresh_token`) are encrypted with AES-256-GCM before entering the SQLite database.
- **Untrusted Screenshot Input**: Prompts treat screenshot OCR text strictly as untrusted user data, preventing prompt injection attacks from overriding sending rules.
- **Mandatory Approval Before Sending**: Bulk and individual sending explicitly requires user approval (`reviewStatus: "APPROVED"`) and a confirmation modal. No automatic dispatch.

---

## ☁️ Future Cloud Deployment

The application is architected for zero-downtime transition to cloud hosting:
1. **Object Storage**: Swap `STORAGE_PROVIDER=local` for an S3/GCS provider implementing the simple `StorageProvider` interface in `lib/storage/types.ts`.
2. **Database**: Change the Prisma datasource in `prisma/schema.prisma` from `sqlite` to `postgresql` or `mysql` and supply a cloud connection string.
3. **Environment**: Deploy as a standard Next.js container on Vercel, AWS ECS, Google Cloud Run, or Railway.
# Sender details and tailored applications

For a bulk upload, open Emails and choose **Select All → Review & Send → Approve & Send**. Selection follows the current filters and skips rejected or pending sends. Each recipient receives a separate application. Successfully sent drafts leave the queue and remain in Sent History; failed drafts remain available for review and retry.

Save your name and From email in **Your sender details** before generating applications. The From address must belong to a Gmail account connected to your signed-in profile. Each draft shows From and To; sending rejects a missing or changed sender instead of silently choosing another account. Your saved name is used in the signature and outgoing sender header.

New and regenerated emails use the original job screenshot and extracted resume text to connect job requirements to specific resume evidence. Existing drafts keep their text until you click Regenerate. Editing or regenerating a draft resets its approval.

`GEMINI_EXTRACTION_MODEL` and `GEMINI_EMAIL_MODEL` independently override the default `gemini-3.8-flash`; the legacy `GEMINI_MODEL` is a fallback. Gemini 3 uses low thinking effort to control cost. API usage is billed separately from a Gemini app subscription.

Additional checks: `node --env-file=.env --import tsx scripts/test-sender-profile.ts` uses mocked persistence and never sends email. `node --env-file=.env --import tsx scripts/smoke-email-generation.ts` makes one billable Gemini call with fictional candidate data, without sending email.


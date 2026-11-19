# Cost Analysis: ATS Resume & Screenshot-to-Email Workflows

This document breaks down the exact AI models, API calls, and costs for **1 request** across the two primary workflows in ApplyPilot.

---

## 1. Summary at a Glance

| Workflow | Models Used | Calls per Request | Cost per Request (Gemini 2.5 Pro) | Cost per Request (Gemini 2.5 Flash) |
| :--- | :--- | :---: | :---: | :---: |
| **ATS Resume Generation** | `gemini-2.5-pro` (or `flash`) | **1 call** | **~$0.010 (1.0¢ / ₹0.85)** | **~$0.0006 (0.06¢ / ₹0.05)** |
| **Screenshot-to-Email** | `gemini-2.5-pro` (or `flash`) | **3 calls** | **~$0.020 (2.0¢ / ₹1.65)** | **~$0.0012 (0.12¢ / ₹0.10)** |

*Note: LaTeX formatting, single-page geometry optimization, Twice Rule recalculations, and TeXLive PDF compilation run locally or via free services at **$0.00 cost**.*

---

## 2. Models Used

Configured in `.env`:
- `GEMINI_ATS_MODEL`: `gemini-2.5-pro` (fallback: `gemini-2.5-flash`)
- `GEMINI_EXTRACTION_MODEL`: `gemini-2.5-pro` (fallback: `gemini-2.5-flash`)
- `GEMINI_EMAIL_MODEL`: `gemini-2.5-pro` (fallback: `gemini-2.5-flash`)

### Google Gemini Official Pricing (per 1M tokens)
| Model | Input Price (per 1M tokens) | Output Price (per 1M tokens) |
| :--- | :--- | :--- |
| **Gemini 2.5 Pro** | \$1.25 (\$0.00000125 / token) | \$5.00 (\$0.000005 / token) |
| **Gemini 2.5 Flash** | \$0.075 (\$0.000000075 / token) | \$0.30 (\$0.00000030 / token) |

---

## 3. Workflow 1: ATS Resume Generation

When a user submits a resume and a job description for ATS tailoring:

### What happens in 1 request:
1. **Document Parsing (Local):** PDF or DOCX is parsed locally using `pdf-parse` or `mammoth` (**\$0.00**).
2. **AI Analysis (`analyzeResume`):**
   - **Model:** `gemini-2.5-pro` (1 API call)
   - **Input:** ~2,500 tokens (ATS diagnostic rules + resume text + job description)
   - **Output:** ~1,500 tokens (JSON with section scoring, missing skills, Google XYZ/PAR rewrites)
3. **LaTeX Formatting & PDF Compilation:**
   - Single-page LaTeX generation runs in TypeScript code (**\$0.00**).
   - PDF compilation runs via TeXLive CGI (**\$0.00**).
   - Twice Rule audit recalculation runs on compiled PDF text locally (**\$0.00**).

### Cost Calculation (1 ATS Request):
- **Using Gemini 2.5 Pro (Default):**
  - Input: 2,500 tokens × \$0.00000125 = \$0.0031
  - Output: 1,500 tokens × \$0.000005 = \$0.0075
  - **Total per ATS Request: ~$0.0106 (~1.1 cents / ₹0.88 INR)**
- **Using Gemini 2.5 Flash (Economy):**
  - Input: 2,500 tokens × \$0.000000075 = \$0.00019
  - Output: 1,500 tokens × \$0.00000030 = \$0.00045
  - **Total per ATS Request: ~$0.00064 (~0.06 cents / ₹0.05 INR)**

---

## 4. Workflow 2: Screenshot-to-Email

When a user uploads a screenshot of a job posting to generate a tailored email draft + 1-page PDF attachment:

### What happens in 1 request (3 AI steps):
1. **Screenshot OCR & Extraction (`extractFromScreenshot`):**
   - **Model:** `gemini-2.5-pro` (Multimodal Vision)
   - **Input:** 1 image (~300 vision tokens) + prompt (~1,200 tokens) = ~1,500 tokens
   - **Output:** Extracted job details (company, role, email, JD text) = ~500 tokens
2. **Resume Tailoring (`autoTailorResumeToJD`):**
   - **Model:** `gemini-2.5-pro`
   - **Input:** Resume text + extracted JD = ~2,500 tokens
   - **Output:** Tailored audit & bullet suggestions = ~1,500 tokens
   - *(PDF compilation & Twice Rule weaving run locally at \$0.00)*
3. **Targeted Cold Email Generation (`generateApplicationEmail`):**
   - **Model:** `gemini-2.5-pro`
   - **Input:** Extracted job details + tailored resume + email guidelines = ~1,800 tokens
   - **Output:** Subject line + 95–135 word cold email body = ~350 tokens

### Cost Calculation (1 Screenshot-to-Email Request):
- **Total Tokens for all 3 calls:**
  - Input: ~5,800 tokens
  - Output: ~2,350 tokens
- **Using Gemini 2.5 Pro (Default):**
  - Input: 5,800 tokens × \$0.00000125 = \$0.00725
  - Output: 2,350 tokens × \$0.000005 = \$0.01175
  - **Total per Request: ~$0.019 (~2.0 cents / ₹1.60 INR)**
- **Using Gemini 2.5 Flash (Economy):**
  - Input: 5,800 tokens × \$0.000000075 = \$0.000435
  - Output: 2,350 tokens × \$0.00000030 = \$0.000705
  - **Total per Request: ~$0.00114 (~0.11 cents / ₹0.10 INR)**

---

## 5. Cost Scaling Table (USD & INR)

| Requests | ATS Resume (2.5 Pro) | ATS Resume (2.5 Flash) | Screenshot-to-Email (2.5 Pro) | Screenshot-to-Email (2.5 Flash) |
| :--- | :--- | :--- | :--- | :--- |
| **1 Request** | \$0.01 (₹0.85) | \$0.0006 (₹0.05) | \$0.02 (₹1.65) | \$0.0012 (₹0.10) |
| **100 Requests** | \$1.06 (₹88) | \$0.06 (₹5) | \$1.90 (₹160) | \$0.11 (₹10) |
| **500 Requests** | \$5.30 (₹440) | \$0.32 (₹27) | \$9.50 (₹800) | \$0.57 (₹48) |
| **1,000 Requests** | \$10.60 (₹880) | \$0.64 (₹53) | \$19.00 (₹1,600) | \$1.14 (₹95) |

---

## 6. Simple Takeaways

1. **Current Production Setup (Gemini 2.5 Pro):**
   - **ATS Resume:** Costs **~1 cent (₹0.85)** per request.
   - **Screenshot to Email:** Costs **~2 cents (₹1.65)** per request.
2. **If You Switch to Gemini 2.5 Flash:**
   - Both workflows become **~16x cheaper** (less than **0.1 cents** per request), which means 1,000 job applications would cost only **$1.14 total**.
3. **No Hidden Costs:**
   - PDF building, layout rendering, database queries, and Twice Rule verification are all executed locally in Node.js and cost **$0.00**.

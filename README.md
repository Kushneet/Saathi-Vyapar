<div align="center">
  <img src="public/Logo.png" alt="Saathi Vyapar Logo" width="160" />
  <h1>🤝 Saathi Vyapar (साथी व्यापार)</h1>
  <p><strong>AI-Driven Financial Structuring, Government Scheme Matching & Ledger Digitization for Rural Micro-Entrepreneurs</strong></p>

  <p>
    <a href="https://nextjs.org"><img src="https://img.shields.io/badge/Next.js-16.3-black?style=for-the-badge&logo=next.js" alt="Next.js 16" /></a>
    <a href="https://react.dev"><img src="https://img.shields.io/badge/React-19.2-61DAFB?style=for-the-badge&logo=react" alt="React 19" /></a>
    <a href="https://tailwindcss.com"><img src="https://img.shields.io/badge/Tailwind_CSS-v4.0-38BDF8?style=for-the-badge&logo=tailwindcss" alt="Tailwind CSS v4" /></a>
    <a href="https://supabase.com"><img src="https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=for-the-badge&logo=supabase" alt="Supabase" /></a>
    <a href="https://ai.google.dev"><img src="https://img.shields.io/badge/Google_Gemini-2.x-4285F4?style=for-the-badge&logo=google" alt="Google Gemini" /></a>
    <a href="https://vitest.dev"><img src="https://img.shields.io/badge/Vitest-38%2F38_Passed-78C370?style=for-the-badge&logo=vitest" alt="Vitest" /></a>
  </p>

  <p>
    <em>SIH Problem Statement: SIH26091 | Ministry of Social Justice & Empowerment | Developed by Team Pantheon Eternal</em>
  </p>
</div>

---

## 📌 Executive Overview

In rural India, millions of micro-entrepreneurs—ranging from local Kirana owners, street vendors, and artisans to small-scale tailors and dairy farmers—operate informally. They rely heavily on handwritten notebooks (*bahi-khatas*), lack formal financial literacy, and miss out on government schemes, subsidies, and credit opportunities designed for their growth.

**Saathi Vyapar (साथी व्यापार)** bridges the gap between rural informal businesses and formal financial ecosystems. It provides an all-in-one financial advisor accessible through **Web, WhatsApp, and SMS**. By pairing a **deterministic mathematical engine** with **privacy-first AI rephrasing**, Saathi Vyapar provides rural entrepreneurs with clear break-even targets, profit margin analytics, scheme eligibility scores, and digitized ledger keeping without risk of AI hallucination or privacy leaks.

---

## ✨ Core Capabilities & Features

### 🧮 1. Zero-Hallucination Financial Engine
- **Deterministic Math Core**: Computes exact unit economics, break-even sales volume, gross/net profit margins, working capital runway, and monthly cash flows using strict financial formulas.
- **Actionable Business Advisory**: Generates tailored operational advice (e.g. daily sales targets, expense optimization, inventory turnover) based on mathematical outputs.

### 📜 2. Explainable Government Scheme Matching Engine
- **Curated Database**: Evaluates business profiles against **15+ Central and State Government Schemes** (PMEGP, Mudra Shishu/Kishor/Tarun, PM SVANidhi, Stand-Up India, Credit Guarantee Fund, etc.).
- **Transparent Scoring & Reasons**: Provides exact percentage match scores, eligibility breakdowns, subsidy highlights (e.g. 15%–35% PMEGP capital subsidy), required document checklists, and direct official application portal links.

### 📷 3. Bahi-Khata Notebook OCR Digitization
- **Image-to-Ledger Conversion**: Powered by `Tesseract.js`, entrepreneurs or field facilitators can photograph physical paper ledgers (*bahi-khata*).
- **Automated Transaction Structuring**: Extracts income, expense, date, and customer entries directly into digital tables for automated cash flow tracking.

### 🗣️ 4. Multilingual Voice & Conversational Webhooks
- **WhatsApp Cloud API & Twilio SMS**: Entrepreneurs can onboard and interact using conversational text or voice messages.
- **Web Voice Assistant Mode**: Built-in browser speech recognition (`Web Speech API`) enables hands-free voice onboarding.
- **Vernacular Gemini AI**: Translates financial metrics into plain-language explanations in **Hindi, Marathi, Tamil, Telugu, and English** with strict **zero-PII data minimization** (no customer names, phone numbers, or personal IDs sent to LLM APIs).

### 👥 5. Field Facilitator & SHG Operations Hub
- **Facilitator Management Portal**: Designed for Self-Help Group (SHG) leaders, NGO workers, and Bank Sakhis to assist multiple entrepreneurs.
- **Multi-Enterprise Management**: Allows facilitators to register micro-businesses, upload paper ledgers, generate financial plans, and monitor scheme applications.

### 🔐 6. Secure Authentication & Data Privacy
- **Dual Authentication**: Supports Google OAuth (with PKCE flow and SSR cookie persistence) and Email/Password sign-in powered by Supabase Auth.
- **Row Level Security (RLS)**: Enforces multi-tenant isolation via strict Supabase PostgreSQL RLS policies.

---

## 🏗️ System Architecture

```
                                  ┌─────────────────────────────┐
                                  │   Entrepreneur / User UI    │
                                  │ (Web App / Voice Assistant) │
                                  └──────────────┬──────────────┘
                                                 │
  ┌───────────────────────────┐                  │                 ┌───────────────────────────┐
  │   WhatsApp Cloud API      ├──────────────────┼─────────────────┤     Twilio SMS Webhook    │
  └─────────────┬─────────────┘                  │                 └─────────────┬─────────────┘
                │                                │                               │
                └───────────────────────┐        │        ┌──────────────────────┘
                                        ▼        ▼        ▼
                                   ┌──────────────────────────┐
                                   │   Next.js 16 API Routes  │
                                   │  & Webhook Orchestrator  │
                                   └────────────┬─────────────┘
                                                │
         ┌──────────────────────────────────────┼──────────────────────────────────────┐
         ▼                                      ▼                                      ▼
┌──────────────────┐                  ┌──────────────────┐                  ┌──────────────────┐
│ Financial Engine │                  │  Scheme Matcher  │                  │   OCR Engine     │
│ (Pure Math Rules)│                  │(15+ Govt Schemes)│                  │  (Tesseract.js)  │
└────────┬─────────┘                  └────────┬─────────┘                  └────────┬─────────┘
         │                                     │                                     │
         └──────────────────┬──────────────────┘                                     │
                            ▼                                                        │
              ┌───────────────────────────┐                                          │
              │  Google Gemini 2.x API    │                                          │
              │ (Zero-PII Plain Language) │                                          │
              └─────────────┬─────────────┘                                          │
                            │                                                        │
                            └───────────────────┬────────────────────────────────────┘
                                                ▼
                                    ┌──────────────────────┐
                                    │ Supabase PostgreSQL  │
                                    │ Database & RLS Auth  │
                                    └──────────────────────┘
```

---

## 🛠️ Technology Stack

| Layer | Technologies Used |
|---|---|
| **Frontend Framework** | **Next.js 16 (App Router with Turbopack)**, **React 19**, **TypeScript** |
| **Styling & Design System** | **Tailwind CSS v4**, Google Fonts (Playfair Display, Inter, Space Grotesk, Bodoni Moda) |
| **Backend & Database** | **Supabase (PostgreSQL with RLS)**, `@supabase/ssr` SSR Client |
| **AI / Machine Learning** | **Google Gemini 2.x** (`@google/genai`), **Groq SDK** (`groq-sdk`) |
| **OCR & Vision** | **Tesseract.js** (Client-side & API-side OCR engine) |
| **Messaging Integration** | **Meta WhatsApp Cloud API**, **Twilio SMS Webhooks** |
| **Validation & Schema** | **Zod Schema Validation** |
| **Testing & Quality** | **Vitest** (Unit test suite with 38 test suites), **ESLint 9** |

---

## 📂 Repository Directory Layout

```
.
├── public/
│   ├── Logo.png                          # Brand identity logo
│   └── fonts/                            # Self-hosted Material Symbols & typography
├── src/
│   ├── app/                              # Next.js 16 App Router pages & API routes
│   │   ├── api/
│   │   │   ├── business-guide/generate/  # AI business expansion guide endpoint
│   │   │   ├── facilitator/              # Facilitator entrepreneur registration
│   │   │   ├── keepalive/                # Database keepalive ping route
│   │   │   ├── ledger/ocr/               # Bahi-khata notebook image OCR route
│   │   │   ├── onboarding/               # Multi-step conversational onboarding API
│   │   │   ├── plan/generate/            # Financial advisory calculation & response
│   │   │   ├── sms/webhook/              # Twilio SMS webhook handler
│   │   │   └── whatsapp/webhook/         # WhatsApp Cloud API webhook handler
│   │   ├── auth/
│   │   │   ├── callback/                 # Google OAuth PKCE callback handler
│   │   │   └── confirm/                  # Email confirmation redirect route
│   │   ├── dashboard/                    # Entrepreneur main dashboard & sub-views
│   │   │   ├── business-guide/           # Interactive Business Transformation Guide
│   │   │   └── schemes/                  # Yojana Kendra scheme matching portal
│   │   ├── facilitator/                  # Field Facilitator Management Portal
│   │   ├── folio/                        # Neoclassical Exhibition Showcase Folio
│   │   ├── login/                        # Unified Email/Password & Google OAuth page
│   │   ├── onboarding/                   # 8-Step Interactive Onboarding Funnel
│   │   ├── globals.css                   # Tailwind v4 theme variables & custom utilities
│   │   ├── layout.tsx                    # Root layout with brand metadata
│   │   └── page.tsx                      # Production landing page
│   ├── components/
│   │   ├── VoiceOnboardingModal.tsx      # Hands-free Web Speech voice modal
│   │   └── panels/                       # Stitch canvas & plates exhibition gallery
│   └── lib/
│       ├── engines/
│       │   ├── financialEngine.ts        # Pure financial calculation core
│       │   ├── financialEngine.test.ts   # 30 Unit tests for financial formulas
│       │   ├── schemeMatcher.ts          # Government scheme matching logic
│       │   └── schemeMatcher.test.ts     # 8 Unit tests for scheme eligibility
│       ├── orchestrator/
│       │   └── conversationOrchestrator.ts # Conversational state machine
│       └── supabase/
│           ├── client.ts                 # Supabase browser client
│           └── server.ts                 # Supabase SSR server client
└── supabase/
    ├── migrations/                       # Database migrations (001_init, 002_rls, 004_guides)
    └── seed/                             # 15+ Indian Government Schemes seed data
```

---

## ⚡ Getting Started & Local Setup

### Prerequisites
- **Node.js**: `v20.x` or higher
- **npm** / **yarn** / **pnpm**
- **Supabase Account**: A free Supabase project instance

### 1. Clone & Install Dependencies

```bash
# Clone the repository
git clone https://github.com/dev-lover-codes/Saathi-Vyapar.git
cd Saathi-Vyapar

# Install npm packages
npm install
```

### 2. Environment Configuration

Create a `.env.local` file in the project root:

```bash
cp .env.local.example .env.local
```

Populate the required environment variables:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# AI Provider Credentials
GEMINI_API_KEY=your-google-gemini-api-key
GROQ_API_KEY=your-groq-api-key

# Base Application URL
NEXT_PUBLIC_APP_URL=http://localhost:3000

# WhatsApp Cloud API Configuration
WHATSAPP_ACCESS_TOKEN=your-whatsapp-cloud-access-token
WHATSAPP_PHONE_NUMBER_ID=your-whatsapp-phone-number-id
WHATSAPP_VERIFY_TOKEN=your-custom-webhook-verify-token
# App Secret from Meta > App Settings > Basic. Required in production: inbound
# webhooks are rejected unless their X-Hub-Signature-256 verifies against it.
WHATSAPP_APP_SECRET=your-meta-app-secret

# Twilio SMS Configuration
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_PHONE_NUMBER=+1234567890
```

---

## 🗄️ Database Setup & Migrations

Execute the SQL scripts in the **Supabase SQL Editor** or via the Supabase CLI (`supabase db push`) in the exact order below:

1. **Database Schema Setup**: `supabase/migrations/001_init.sql`
   - Creates core tables: `users`, `business_profiles`, `schemes`, `financial_plans`, `ledger_entries`, `conversations`, `facilitators_entrepreneurs`, and `business_guides`.
2. **Seed Government Schemes**: `supabase/seed/schemes.sql`
   - Populates 15+ Central and State Government schemes with exact funding limits, subsidies, and eligibility criteria.
3. **Row Level Security Policies**: `supabase/migrations/002_rls_policies.sql`
   - Configures PostgreSQL RLS policies to isolate entrepreneur and facilitator records.
4. **Business Transformation Guides Table**: `supabase/migrations/004_business_guides.sql`
   - Creates cached storage for personalized business expansion roadmaps.

---

## 💬 WhatsApp & Twilio Webhook Configuration

### Meta WhatsApp Cloud API Setup
1. Open **[Meta for Developers](https://developers.facebook.com/)** > Your App > **WhatsApp** > **Configuration**.
2. Set **Callback URL**: `https://your-domain.com/api/whatsapp/webhook`
3. Set **Verify Token**: Enter the exact string configured in `WHATSAPP_VERIFY_TOKEN`.
4. Under **Webhook Fields**, subscribe to `messages`.

### Twilio SMS Setup
1. Open **[Twilio Console](https://console.twilio.com/)** > **Phone Numbers** > **Manage** > **Active Numbers**.
2. Select your virtual phone number.
3. Under **Messaging** -> **A MESSAGE COMES IN**:
   - Webhook URL: `https://your-domain.com/api/sms/webhook`
   - HTTP Method: `HTTP POST`

---

## 🧪 Testing & Code Quality

Saathi Vyapar includes unit tests covering financial formulas (break-even volume, profit margins, runway) and government scheme matcher eligibility logic.

```bash
# Run Vitest unit tests (38 tests)
npx vitest run

# Run ESLint check
npm run lint

# Build production bundle
npm run build
```

---

## 🚀 Deployment & Maintenance

### Vercel Deployment
1. Connect repository to [Vercel](https://vercel.com).
2. Configure environment variables in project settings.
3. Deploy! Next.js 16 App Router will build with Turbopack.

### Database Uptime Keepalive
To prevent Supabase free-tier projects from pausing during periods of low activity, Saathi Vyapar provides an ultra-lightweight ping endpoint:
- **Endpoint**: `GET /api/keepalive`
- **UptimeRobot Setup**:
  1. Register a free HTTP monitor at [UptimeRobot](https://uptimerobot.com).
  2. Set URL to `https://your-domain.com/api/keepalive`.
  3. Set interval to **Every 5 minutes**.

---

## 🏆 Team & Acknowledgements

Developed with ❤️ by **Team Pantheon Eternal** for the **Smart India Hackathon (SIH26091)** under the aegis of the **Ministry of Social Justice & Empowerment**.

- **Organization**: Ministry of Social Justice & Empowerment, Govt. of India
- **Repository**: [https://github.com/dev-lover-codes/Saathi-Vyapar](https://github.com/dev-lover-codes/Saathi-Vyapar)

---

<div align="center">
  <sub>Saathi Vyapar • Empowering Rural Indian Micro-Enterprises with Trust & AI</sub>
</div>
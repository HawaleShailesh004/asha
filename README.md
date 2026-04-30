# ASHA — Adaptive Survivorship & Health Agent

> WhatsApp-native cancer screening and survivorship support for community health workers in Africa and South Asia.

**342,000 women die of cervical cancer every year. 90% within reach of a CHW who had no tools.**  
ASHA changes that — via WhatsApp, on any phone, with no app installation required.

[![Live Demo](https://img.shields.io/badge/Live-Dashboard-00d4a0?style=flat)](https://your-vercel-url.vercel.app)
[![Backend](https://img.shields.io/badge/Backend-Railway-00d4a0?style=flat)](https://your-railway-url.railway.app/health)
[![WHO Protocol](https://img.shields.io/badge/WHO-Protocol%20Aligned-blue?style=flat)]()
[![SDG 3](https://img.shields.io/badge/SDG-3.1%20·%203.4%20·%203.8-blue?style=flat)]()

---

## What ASHA Does

| Flow | Description |
|---|---|
| **Cervical screening** | CHW types symptoms in WhatsApp → XGBoost ML risk score + clinical overrides → referral letter in 90 seconds |
| **Oral screening** | WHO-weighted 7-question engine → HIGH/ELEVATED/LOW → referral letter with quality validation |
| **Survivor check-ins** | Weekly WhatsApp prompts → fatigue/pain/mood tracking → personalised Ayurvedic protocol |
| **Referral follow-through** | 7 days post-referral → CHW asked if patient attended → completion rate tracked |
| **NGO dashboard** | Live patient feed, Africa burden map, follow-through analytics |

---

## Live URLs

| Surface | URL |
|---|---|
| Landing page | `https://your-vercel-url.vercel.app` |
| NGO Dashboard | `https://your-vercel-url.vercel.app/dashboard` |
| Mobile screening | `https://your-vercel-url.vercel.app/screen` |
| Web chat | `https://your-vercel-url.vercel.app/chat` |
| Backend health | `https://your-railway-url.railway.app/health` |

---

## Repository Structure

```
asha/
├── backend/
│   ├── main.py                    # FastAPI app, dispatcher, all API endpoints
│   ├── agents/
│   │   ├── screening.py           # Function-calling screening agent
│   │   ├── referral.py            # Letter generation + quality validation
│   │   ├── risk.py                # Risk scoring orchestration
│   │   └── survivorship.py        # Weekly check-in agent
│   ├── ml/
│   │   ├── train_cervical.py      # XGBoost model training + loading
│   │   ├── symptom_mapper.py      # Multilingual symptom normalisation
│   │   └── pii_scrubber.py        # spaCy NER PII scrubber
│   ├── services/
│   │   ├── supabase_service.py    # DB operations, session management
│   │   ├── twilio_service.py      # WhatsApp send/receive
│   │   ├── twilio_validator.py    # Signature validation
│   │   └── checkin_scheduler.py  # Weekly cron jobs
│   ├── demo_data.sql              # Seed Priya's survivorship data
│   └── requirements.txt
├── frontend/
│   ├── app/
│   │   ├── page.tsx               # Landing page
│   │   ├── dashboard/page.tsx     # NGO dashboard
│   │   ├── patients/page.tsx      # Patient registry
│   │   ├── survivorship/page.tsx  # Survivorship care journey
│   │   ├── screen/page.tsx        # Mobile screening interface
│   │   ├── chat/page.tsx          # Web chat interface
│   │   └── api/                   # Next.js proxy routes
│   ├── components/
│   │   ├── CancerBurdenMap.tsx    # Africa/South Asia SVG map (GLOBOCAN 2020)
│   │   ├── ImpactProjector.tsx    # Interactive CHW slider
│   │   ├── FollowUpTracker.tsx    # Referral completion widget
│   │   └── ClinicalShared.tsx     # Shared clinical UI components
│   └── package.json
├── ARCHITECTURE.md                # Full technical + clinical design doc
└── README.md
```

---

## Local Setup

### Prerequisites

- Python 3.11+
- Node.js 18+
- A Supabase project
- A Twilio account with WhatsApp sandbox enabled
- A Groq API key (free at console.groq.com)

---

### Backend

```bash
cd backend
pip install -r requirements.txt
```

Create `backend/.env`:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
GROQ_API_KEY=gsk_your-groq-key
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_FROM=whatsapp:+14155238886
ENV=development
UVICORN_RELOAD=true
```

Run:

```bash
python main.py
# Backend starts at http://127.0.0.1:8000
```

Verify:
```bash
curl http://localhost:8000/health
# {"status":"ok","version":"3.0.0"}
```

---

### Frontend

```bash
cd frontend
npm install
```

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_API_URLS=http://localhost:8000,https://your-live-backend.onrender.com
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Run:

```bash
npm run dev
# Frontend starts at http://localhost:3000
```

---

### Database

Run in Supabase SQL Editor (in order):

**1. Core tables:**

```sql
-- Sessions
create table sessions (
  phone text primary key,
  phase text default 'idle',
  history jsonb default '[]',
  patient_data jsonb default '{}',
  geography text default 'global',
  language text default 'en',
  updated_at timestamptz default now()
);

-- Patients
create table patients (
  id uuid default gen_random_uuid() primary key,
  chw_phone text not null,
  age int,
  risk_tier text,
  cervical_probability float,
  oral_score int,
  top_risk_factors text[],
  referral_generated boolean default false,
  referral_letter text,
  referral_quality_score float,
  raw_screening_data jsonb,
  created_at timestamptz default now()
);

-- Referral log
create table referral_log (
  id uuid default gen_random_uuid() primary key,
  patient_id uuid references patients(id),
  letter_content text,
  quality_score float,
  language text,
  created_at timestamptz default now()
);

-- Referral follow-through
create table referral_followup (
  id uuid default gen_random_uuid() primary key,
  patient_id uuid references patients(id),
  chw_phone text not null,
  patient_summary text,
  risk_tier text,
  referral_date timestamptz,
  followup_sent_at timestamptz,
  followup_response text,
  followup_responded_at timestamptz,
  created_at timestamptz default now()
);

-- Survivorship cohort
create table survivorship_cohort (
  phone text primary key,
  name text,
  cancer_type text,
  checkin_week int default 0,
  last_checkin timestamptz,
  chw_phone text,
  created_at timestamptz default now()
);

-- Survivorship check-ins
create table survivorship_checkins (
  id uuid default gen_random_uuid() primary key,
  survivor_phone text references survivorship_cohort(phone),
  week_number int,
  fatigue_score int,
  pain_score int,
  mood_score int,
  new_symptoms text,
  trajectory_alert text default 'STABLE',
  protocol_sent text,
  created_at timestamptz default now()
);
```

**2. Enable realtime** (for live dashboard updates):

In Supabase → Database → Replication → enable `patients` table.

**3. Seed demo data** (for survivorship demo):

```bash
# Run demo_data.sql in Supabase SQL Editor
# Seeds Priya Mehta with 3 weeks of check-in history
```

---

### WhatsApp (Twilio Sandbox)

1. Go to [Twilio Console → Messaging → Try WhatsApp](https://console.twilio.com)
2. Join sandbox: send `join blanket-never` to `+1 415 523 8886`
3. Set webhook URL: `https://your-railway-url.railway.app/webhook`
4. Method: `HTTP POST`

Test:
```
WhatsApp: help
Expected: ASHA menu with 5 commands

WhatsApp: screen
WhatsApp: 34yr old, smoker, bleeds after sex, 2 pregnancies, no IUD, no STDs, no contraceptives
Expected: HIGH RISK result + referral letter
```

---

## Deployment

### Backend → Railway

1. Connect GitHub repo to Railway
2. Set root directory: `backend`
3. Add all environment variables from `.env` above
4. Add `PORT=8000` to Railway env
5. Deploy — Railway auto-detects Python and runs `python main.py`

**Keep-alive:** Add UptimeRobot (free) to ping `https://your-railway-url.railway.app/health` every 5 minutes. Prevents Railway free tier from sleeping.

### Frontend → Vercel

1. Connect GitHub repo to Vercel
2. Set root directory: `frontend`
3. Add environment variables from `.env.local` above (set `NEXT_PUBLIC_API_URLS` with both live/local backends if you want automatic failover)
4. Deploy

---

## Manual Smoke Tests

Run these after every deployment:

```
☐ GET /health → {"status":"ok"}
☐ WhatsApp: help → menu appears
☐ WhatsApp: screen → asks age
☐ WhatsApp: 50yr old, smoker, bleeds after sex → HIGH RISK result
☐ WhatsApp: oral → starts oral screening
☐ WhatsApp: register survivor → asks name
☐ Dashboard loads at /dashboard with live data
☐ /screen → tap through 7 questions → risk reveal → PDF downloads
☐ /survivorship → Priya Mehta visible, Week 3, trajectory chart renders
☐ /patients → auto-selects HIGH risk patient, referral letter visible
```

---

## Environment Variables Reference

| Variable | Where | Description |
|---|---|---|
| `SUPABASE_URL` | Backend | Project URL from Supabase dashboard |
| `SUPABASE_SERVICE_KEY` | Backend | Service role key (never expose to frontend) |
| `GROQ_API_KEY` | Backend | From console.groq.com |
| `TWILIO_AUTH_TOKEN` | Backend | From Twilio Console |
| `TWILIO_ACCOUNT_SID` | Backend | From Twilio Console |
| `TWILIO_FROM` | Backend | `whatsapp:+14155238886` (sandbox) |
| `ENV` | Backend | `development` skips Twilio signature validation helper |
| `UVICORN_RELOAD` | Backend | `true` in dev only, `false` in production |
| `NEXT_PUBLIC_API_URL` | Frontend | Railway URL in production, `http://localhost:8000` in dev |
| `NEXT_PUBLIC_API_URLS` | Frontend | Comma-separated backend URLs; app probes `/health` and uses fastest healthy backend first |
| `BACKEND_URLS` | Frontend Server Runtime | Optional private comma-separated backend URLs used by Next.js API routes |
| `NEXT_PUBLIC_SUPABASE_URL` | Frontend | Same as backend SUPABASE_URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Frontend | Anon key (read-only RLS) |

---

## Tech Stack

**Backend:** Python · FastAPI · Uvicorn · APScheduler · Supabase Python SDK · Twilio SDK  
**AI/ML:** Groq API · XGBoost · scikit-learn · SentenceTransformers · spaCy · SMOTE (imbalanced-learn)  
**Frontend:** Next.js 14 · React 18 · TypeScript · Recharts · jsPDF · react-simple-maps  
**Data:** Supabase Postgres · Row-Level Security  
**Channel:** Twilio WhatsApp Business API

---

## Clinical References

- WHO Guide to Cancer Early Diagnosis (2017)
- GLOBOCAN 2020 — Global Cancer Observatory, IARC
- Lancet Global Health — Cervical cancer burden in Sub-Saharan Africa (Dec 2022)
- UCI Cervical Cancer Risk Factors — Fernandes et al. (IbPRIA 2017)
- IARC Monograph Vol. 100E — Betel quid, areca nut (Group 1 carcinogen)

---

*Cancer Aid Society India · GNEC Partner Network · WHO Protocol Aligned*  
*वसुधैव कुटुम्बकम्*

# ASHA Project Implementation Document

## 1) Product Overview

ASHA (Adaptive Survivorship & Health Agent) is a WhatsApp-first clinical support platform for community health workers (CHWs) to:

- run structured cervical and oral cancer risk screening,
- generate referral-ready clinical letters for high/elevated risk patients,
- register and longitudinally follow survivors through weekly check-ins,
- provide program-level visibility through a live dashboard and registry UI.

Core deployment target: low-resource settings in Africa and South Asia with low smartphone capability, low bandwidth, and minimal training bandwidth.

---

## 2) Product Goals

- **Early detection support:** identify high-risk cases faster using structured screening + model-based triage.
- **Clinical actionability:** produce referral letters that are useful to frontline clinics.
- **Operational realism:** support CHWs over WhatsApp (no native app dependency).
- **Program oversight:** provide NGO/program teams live operational insight via dashboard views.
- **Survivorship continuity:** keep post-treatment patients in regular follow-up loops.

---

## 3) System Architecture (High Level)

ASHA is split into:

- **Backend:** FastAPI orchestration, routing, AI/ML execution, Supabase persistence, Twilio channel.
- **Frontend:** Next.js App Router UI, chat/screen/dashboard surfaces, mixed data access (direct Supabase for realtime operational views + backend proxy routes for chat/referral workflows).
- **Data layer:** Supabase tables for sessions, patients, referrals, survivorship cohort/check-ins.
- **Messaging channel:** Twilio WhatsApp webhook + sender integration.
- **AI/ML layer:** Groq LLM/Vision + local model artifacts (XGBoost + symptom mapping + PII scrubber).

Main path:

1. CHW sends message to WhatsApp (or web chat proxy).
2. Backend loads session from Supabase.
3. Dispatcher routes by `phase` (`idle`, `screening`, `registration`, `survivorship`, `risk_scoring`).
4. Screening collects fields via function-calling agent.
5. Risk engine computes tier and factors.
6. Referral letter generated (if needed), validated, persisted, returned to channel.

---

## 4) Runtime Components and Responsibilities

### 4.1 Backend (`backend/`)

- `main.py`
  - FastAPI app bootstrap and lifespan model loading.
  - Twilio webhook endpoint and web chat/referral APIs.
  - Phase-based conversation dispatcher.
  - Error boundaries and session recovery.
  - Per-phone async lock for concurrency safety.

- `agents/screening.py`
  - Function-calling screening agent for cervical + oral protocols.
  - Supports one-question conversational style while still allowing bulk extraction.
  - Required-field guard before completion.

- `agents/referral.py`
  - Clinical referral letter generation and quality validation.
  - Multi-language behavior (English/Swahili/Hindi).
  - Persistence of referral artifacts to Supabase.

- `services/supabase_service.py`
  - Session lifecycle, history management, patient/referral/survivorship persistence.
  - Geography/language routing from phone prefixes.

- `services/twilio_validator.py`
  - Twilio signature validation helper (with dev bypass).

- `services/checkin_scheduler.py`
  - Weekly survivorship check-in trigger logic for due survivors.

### 4.2 Frontend (`frontend/`)

- `app/page.tsx`  
  - Story-first landing page, live demo, impact projector, CTA routing.

- `app/chat/page.tsx`  
  - Web chat interface with markdown rendering, quick commands, risk card parsing, PDF export, account/session switching, offline queue, photo analysis mode.

- `app/screen/page.tsx`  
  - Guided tap-based screening flow, risk reveal, referral fetch and PDF generation.

- `app/dashboard/page.tsx`  
  - Live operational dashboard and patient registry with modal detail/referral views.

- `app/patients/page.tsx`  
  - Two-panel detailed patient registry browser.

- `app/survivorship/page.tsx`  
  - Survivorship cohort, progression visualization, protocol history.

- `app/api/chat/route.ts`, `app/api/referral/route.ts`  
  - Next.js server-side proxy routes to FastAPI backend.

- `app/globals.css`  
  - Global tokenized design system + motion utilities + theme primitives.

---

## 5) Backend Request/Conversation Flow

## 5.1 Session and Phase Model

Session record includes:

- `phase`
- `history`
- `patient_data`
- `geography`
- `language`

Routing is phase-centric:

- `idle` -> command parsing or intake intent.
- `screening` -> screening agent turn.
- `registration` -> deterministic survivor registration steps.
- `survivorship` -> survivorship check-in agent.
- `risk_scoring` -> risk + referral pipeline.

Global hard-reset command is handled regardless of phase.

## 5.2 WhatsApp Webhook (`POST /webhook`)

- Accepts Twilio form payload (`From`, `Body` optional for callback tolerance).
- Ignores callback bodies without message payload.
- Normalizes phone and acquires per-phone lock.
- Applies PII scrubber only in screening phase.
- Applies symptom mapping only in screening phase.
- Dispatches and replies through Twilio.
- On internal errors, resets session and returns safe fallback instructions.

## 5.3 Web Chat API (`POST /api/chat`)

- Mirrors WhatsApp pipeline but without Twilio send step.
- Namespaces session phone as `web_<user_id>`.
- Supports image analysis route (`[PHOTO_SCREENING]` + base64 image).

## 5.4 Stateless Referral API (`POST /api/referral`)

- Accepts structured `patient_data`, language/phone context.
- Runs full risk + referral generation.
- Returns authoritative tier and referral payload for frontend rendering/PDF.

---

## 6) AI and ML Architecture

## 6.1 Models in Use

- **Groq LLM (text):** `llama-3.3-70b-versatile`
  - Screening function-calling extraction.
  - Referral generation.
  - Referral quality validation.

- **Groq Vision:** `llama-3.2-11b-vision-preview`
  - Oral photo-based descriptive triage assistance in web chat.

- **SentenceTransformer:** `paraphrase-multilingual-MiniLM-L12-v2`
  - Symptom normalization/mapping for multilingual free text.

- **XGBoost pipeline**
  - Cervical risk scoring.

- **WHO oral weighted score logic**
  - Oral risk scoring.

- **spaCy-based PII scrubber**
  - Scrubs sensitive text in screening phase.

## 6.2 Why this combination

- LLM for flexible conversation and language variation.
- Structured tool-calling to reduce hallucination in data capture.
- Deterministic model scoring for triage consistency.
- Clinical override rules for safety-critical symptom escalation.
- Vision as assistive context, not sole diagnosis path.

## 6.3 Guardrails

- Required-field completion checks before scoring.
- Phase-based routing to avoid command collisions.
- PII handling boundaries by phase.
- Error fallback + session reset on failures.
- Referral quality scoring pass before persistence.

---

## 7) Clinical Workflows

## 7.1 Screening Workflow (Cervical / Oral)

1. CHW initiates `screen` or `oral`.
2. Agent gathers required fields (can parse multiple in one message).
3. Backend computes risk tier and top factors.
4. If `HIGH`/`ELEVATED`, generate referral letter and include quality score.
5. Persist patient + referral artifacts.
6. Reset session for next case.

## 7.2 Survivor Registration Workflow

1. CHW sends `register survivor`.
2. Step machine collects name, phone, cancer type, treatment.
3. Saves to `survivorship_cohort` (upsert by phone).
4. Session resets.

## 7.3 Survivorship Weekly Check-In Workflow

1. Scheduler identifies due survivors (7+ days since last check-in / never checked in).
2. Sends weekly check-in prompt on WhatsApp.
3. Sets session phase to `survivorship`.
4. Survivorship responses are persisted as check-ins + protocol metadata.
5. Cohort week and last-check-in metadata updated.

---

## 8) Frontend Experience by Page

## 8.1 Landing (`/`)

- Problem framing and impact narrative.
- Live WhatsApp demo simulation.
- Operational flow explanation.
- Impact projector component.
- CTAs to `/screen`, `/dashboard`, `/chat`.

## 8.2 Chat (`/chat`)

- Direct conversational interface to backend pipeline.
- Markdown rendering (`react-markdown`, `remark-gfm`).
- Quick command chips.
- Structured risk card rendering from response parsing.
- In-browser A4 PDF output (`jspdf`) for referral.
- Photo upload/capture for vision analysis.
- Account drawer for session/language context simulation.
- Offline queue/replay behavior.

## 8.3 Screen (`/screen`)

- Mobile-first guided no-typing screening UX.
- Question-at-top / option-at-bottom structure.
- Immediate visual risk reveal.
- Referral retrieval from backend and PDF export.
- Uses backend tier as authoritative for final referral.
- PDF sanitization layer for problematic glyphs.

## 8.4 Dashboard (`/dashboard`)

- Live patient feed with Supabase realtime inserts.
- Key stats and burden trend chart.
- Geographic burden visualization.
- Action queue and urgent case highlights.
- Registry modal centered with scroll-contained referral panel.

## 8.5 Patients (`/patients`)

- Analytical two-pane registry with richer detail panel.
- Risk factors, referral quality, and raw screening data visibility.

## 8.6 Survivorship (`/survivorship`)

- Cohort list + selected survivor deep-dive.
- Week-by-week symptom trajectory and escalation visibility.
- Protocol history and narrative summary.

---

## 9) Design System and UX Foundation

- Global tokenized styling in `app/globals.css`.
- Two visual systems:
  - dark narrative/product surfaces,
  - light clinical operational surfaces (`.clinical` scope).
- Shared motion utilities:
  - `motion-enter`, `motion-pressable`,
  - modal and route transition classes.
- Accessibility:
  - reduced-motion support via `prefers-reduced-motion`.
- Consistency:
  - standardized risk color semantics,
  - iconography via `lucide-react` instead of emoji/text icons.

---

## 10) Data Model (Supabase Tables Used)

Implemented references in code indicate these key tables:

- `sessions`
  - conversational state per phone/session.
- `patients`
  - risk outputs, factors, referral metadata, raw screening payload.
- `referral_log`
  - generated referral letters and quality.
- `survivorship_cohort`
  - registered survivor records and check-in progress.
- `survivorship_checkins`
  - weekly check-in scores, alerts, protocol payload.

---

## 11) API Surface

Backend endpoints in active use:

- `GET /health`
- `POST /webhook`
- `GET /api/patients`
- `GET /api/risk-distribution`
- `GET /api/regional-risk`
- `POST /api/chat`
- `POST /api/referral`
- `GET /api/last-reply`
- `GET /api/stats`
- `GET /api/followup-stats`

Frontend internal proxy endpoints:

- `POST /api/chat` (Next.js -> FastAPI)
- `POST /api/referral` (Next.js -> FastAPI)

---

## 12) Configuration and Environment

## 12.1 Backend critical env

- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `GROQ_API_KEY`
- `TWILIO_AUTH_TOKEN`
- `ENV` (for signature validation behavior)
- `UVICORN_RELOAD` (`true` in dev only)

## 12.2 Frontend critical env

- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_API_URLS`
- `BACKEND_URLS` (optional; server-side Next.js runtime)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

## 13) Build/Run Commands

## 13.1 Backend

From `backend`:

- Install: `pip install -r requirements.txt`
- Run: `python main.py`

Notes:

- app listens on `http://127.0.0.1:8000`
- `UVICORN_RELOAD` defaults off unless explicitly set.

## 13.2 Frontend

From `frontend`:

- Install: `npm install`
- Dev: `npm run dev`
- Build: `npm run build`
- Start: `npm run start`

`dev`/`build` include a `.next` clean step to avoid stale artifact issues.

---

## 14) File Structure Guide (Key Paths)

```text
asha/
├─ backend/
│  ├─ main.py
│  ├─ agents/
│  │  ├─ screening.py
│  │  └─ referral.py
│  ├─ services/
│  │  ├─ supabase_service.py
│  │  ├─ twilio_validator.py
│  │  └─ checkin_scheduler.py
│  └─ requirements.txt
├─ frontend/
│  ├─ app/
│  │  ├─ page.tsx
│  │  ├─ chat/page.tsx
│  │  ├─ screen/page.tsx
│  │  ├─ dashboard/page.tsx
│  │  ├─ patients/page.tsx
│  │  ├─ survivorship/page.tsx
│  │  ├─ api/chat/route.ts
│  │  ├─ api/referral/route.ts
│  │  ├─ globals.css
│  │  └─ layout.tsx
│  ├─ components/
│  │  ├─ ClinicalHeader.tsx
│  │  ├─ ClinicalFooter.tsx
│  │  ├─ ClinicalShared.tsx
│  │  ├─ AppLogo.tsx
│  │  └─ ImpactProjector.tsx
│  ├─ lib/supabase.ts
│  └─ package.json
└─ PROJECT_IMPLEMENTATION.md
```

---

## 15) Reliability, Safety, and Production Readiness Status

Already implemented:

- per-phone concurrency lock on webhook processing,
- resilient webhook parsing for Twilio callback variance,
- phase-based deterministic dispatcher behavior,
- global reset recovery path,
- backend error boundary with session reset fallback,
- proxy timeout handling on frontend chat route,
- loader/motion consistency and reduced-motion support,
- route and modal transitions for calmer UI behavior.

Known improvement areas for next iteration:

- stronger referral prompt hardening to forbid symptom hallucination explicitly,
- add end-to-end automated tests for major workflows,
- add robust observability (structured logs + metrics + alerting),
- harden scheduler wiring and deployment-time cron guarantees,
- tighten API auth/rate limiting strategy for public web endpoints.

---

## 16) End-to-End User Journeys (Reference)

## Journey A: CHW screening via WhatsApp

1. CHW sends `screen` / `oral`.
2. Agent collects required fields.
3. Risk tier computed + factors assembled.
4. Referral generated if needed.
5. CHW gets actionable output and next step.

## Journey B: NGO dashboard monitoring

1. Program manager opens dashboard.
2. Views live insert stream and urgent queue.
3. Opens patient modal for referral details.
4. Tracks high-risk and referral coverage trend.

## Journey C: Survivorship follow-up

1. CHW registers survivor once.
2. Weekly prompts are sent.
3. Check-ins recorded and trajectory flagged.
4. Escalation alerts surfaced for clinical review.

---

## 17) Tech Stack Summary

- **Backend:** Python, FastAPI, Uvicorn, Supabase Python SDK, Twilio SDK, APScheduler
- **AI/ML:** Groq APIs, SentenceTransformers, XGBoost, spaCy, scikit-learn ecosystem
- **Frontend:** Next.js 14, React 18, TypeScript, Supabase JS, Recharts, jsPDF, lucide-react
- **Data:** Supabase Postgres
- **Channel:** Twilio WhatsApp

---

## 18) Onboarding Checklist for New Team Members

1. Run backend + frontend locally and validate health endpoints.
2. Read `backend/main.py` dispatcher and phase handlers first.
3. Read `backend/agents/screening.py` and `referral.py`.
4. Read `frontend/app/screen/page.tsx` and `chat/page.tsx` for primary UX flows.
5. Read `frontend/app/dashboard/page.tsx` + `survivorship/page.tsx` for ops workflows.
6. Verify environment variables and Supabase table availability.
7. Execute manual smoke tests for:
   - cervical flow,
   - oral flow,
   - register survivor,
   - referral generation,
   - chat + photo analysis,
   - dashboard live updates.

---

If needed, this document can be split next into:

- `ARCHITECTURE.md` (system/deployment),
- `CLINICAL_WORKFLOWS.md`,
- `RUNBOOK.md` (ops/support),
- `DEVELOPER_ONBOARDING.md`.

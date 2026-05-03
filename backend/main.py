"""
ASHA — FastAPI Backend (v3 — production architecture)

Routing contract:
  - Phase is the single source of truth for routing.
  - Global commands (reset, help, screen, oral, register survivor)
    are ONLY evaluated when phase == "idle".
  - When phase != "idle", the message goes directly to the phase handler.
    No exceptions. No content-based intercepts mid-flow.
  - PII scrubbing runs only during screening phase.
    Registration phase needs real names and phone numbers.

This eliminates:
  - "oral" triggering oral screening mid-registration
  - PII scrubber stripping survivor names
  - Any future command collision mid-flow
"""

import os
import logging
import threading
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level  = logging.INFO,
    format = "%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
log = logging.getLogger("asha")

_model_init_lock = threading.Lock()
_models_loading = False
_models_ready = False


def _load_models_sync(app: FastAPI):
    """Load heavy models in a background thread so startup can bind PORT quickly."""
    global _models_ready, _models_loading
    with _model_init_lock:
        if _models_ready:
            return
        _models_loading = True
        try:
            log.info("ASHA model loader — starting background model initialization")

            from sentence_transformers import SentenceTransformer
            st_model = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")
            log.info("SentenceTransformer loaded")

            from ml.symptom_mapper import SymptomMapper
            app.state.symptom_mapper = SymptomMapper(model=st_model)
            log.info("SymptomMapper ready")

            from ml.train_cervical import load_model as load_cervical
            app.state.cervical_model = load_cervical()
            log.info("Cervical model loaded")

            from ml.pii_scrubber import PIIScrubber
            app.state.pii_scrubber = PIIScrubber()
            log.info("PII scrubber loaded")

            _models_ready = True
            log.info("All models loaded — ASHA ready")
        except Exception as e:
            log.exception("Background model load failed: %s", e)
        finally:
            _models_loading = False


def _start_model_loader(app: FastAPI):
    if _models_ready or _models_loading:
        return
    t = threading.Thread(target=_load_models_sync, args=(app,), daemon=True)
    t.start()


def _are_models_ready() -> bool:
    return _models_ready


# ── Startup ───────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Boot fast for PaaS health checks; do not load heavy models at startup.
    # Models are lazy-loaded on first ML-dependent request.
    app.state.symptom_mapper = None
    app.state.cervical_model = None
    app.state.pii_scrubber = None
    log.info("ASHA starting up — binding server, model load is lazy")
    yield
    log.info("ASHA shutting down")


app = FastAPI(
    title    = "ASHA API",
    version  = "3.0.0",
    lifespan = lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "version": "3.0.0",
        "models_ready": _are_models_ready(),
        "models_loading": _models_loading,
        "ts": datetime.utcnow().isoformat(),
    }


@app.get("/")
async def root():
    return {"status": "ok", "service": "asha", "models_ready": _are_models_ready()}


# ── Webhook ───────────────────────────────────────────────────────────────────
@app.post("/webhook")
async def webhook(
    request: Request,
    From:    str = Form(...),
    Body:    str = Form(...),
):
    phone   = From.replace("whatsapp:", "").strip()
    message = Body.strip()

    if not phone or not message:
        return JSONResponse({"status": "ignored"})

    log.info("IN  | %s | %s", phone, message[:100])

    import services.supabase_service as db

    try:
        session = db.get_session(phone)
    except Exception as e:
        log.error("Session fetch failed for %s: %s", phone, e)
        return JSONResponse({"status": "temporary_db_error"}, status_code=200)

    phase        = session.get("phase", "idle")
    history      = session.get("history", [])
    patient_data = session.get("patient_data", {})
    geography    = session.get("geography", "global")
    language     = session.get("language", "en")

    # PII scrubbing — ONLY during screening, never registration or idle
    # Registration phase needs real names and phone numbers intact
    if phase == "screening":
        if _are_models_ready() and request.app.state.pii_scrubber:
            scrubbed = request.app.state.pii_scrubber.scrub(message)
            safe_msg = scrubbed["scrubbed_text"]
            if scrubbed["pii_detected"]:
                log.info("PII scrubbed: %s entities", scrubbed["entities_removed"])
        else:
            _start_model_loader(request.app)
            safe_msg = message
    else:
        safe_msg = message

    # Symptom mapping — only useful during screening
    sym_map = {"accepted": False, "clinical_term": None, "confidence": 0.0}
    if phase == "screening" and _are_models_ready() and request.app.state.symptom_mapper:
        sym_map = request.app.state.symptom_mapper.map(safe_msg)
        if sym_map["accepted"]:
            log.info("SYM | %s → %s (%.2f)", message[:40], sym_map["clinical_term"], sym_map["confidence"])

    try:
        db.append_to_history(phone, "user", message)
    except Exception as e:
        log.warning("History write failed (user) for %s: %s", phone, e)

    reply = await _dispatch(
        phase=phase, phone=phone, message=safe_msg, raw_message=message,
        history=history, patient_data=patient_data,
        geography=geography, language=language,
        sym_map=sym_map, app_state=request.app.state,
    )

    try:
        db.append_to_history(phone, "assistant", reply)
    except Exception as e:
        log.warning("History write failed (assistant) for %s: %s", phone, e)

    from services.twilio_service import send_whatsapp
    try:
        send_whatsapp(From, reply)
        log.info("OUT | %s | sent", phone)
    except Exception as e:
        log.error("Twilio error | %s | %s", phone, e)

    return JSONResponse({"status": "ok"})


# ── Dispatcher — phase is the ONLY routing key ────────────────────────────────
async def _dispatch(
    phase: str, phone: str, message: str, raw_message: str,
    history: list, patient_data: dict,
    geography: str, language: str,
    sym_map: dict, app_state,
) -> str:
    import services.supabase_service as db

    # Global reset must work from any phase.
    normalized_raw = (raw_message or "").lower().strip()
    if normalized_raw in ("reset", "restart", "start over"):
        db.reset_session(phone)
        return _help_text()

    # ── IDLE: the only phase where global commands are evaluated ──────────────
    if phase == "idle":
        return await _handle_idle(
            phone, message, history, geography, language, app_state, db
        )

    # ── SCREENING ─────────────────────────────────────────────────────────────
    if phase == "screening":
        return await _handle_screening(
            phone, message, history, patient_data,
            language, sym_map, app_state, db
        )

    # ── REGISTRATION — no command intercepts, message goes straight to agent ──
    if phase == "registration":
        return await _handle_registration(
            phone, message, raw_message, history, patient_data, geography, db
        )

    # ── FOLLOWUP — referral follow-through response ───────────────────────────
    if phase == "followup":
        return await _handle_followup(phone, message, db)

    # ── SURVIVORSHIP CHECK-IN ─────────────────────────────────────────────────
    if phase == "survivorship":
        return await _handle_survivorship(phone, message, history, geography, db)

    # ── RISK SCORING (re-entry guard) ─────────────────────────────────────────
    if phase == "risk_scoring":
        return await _handle_risk_scoring(phone, patient_data, language, app_state, db)

    # ── Unknown phase — reset and recover ─────────────────────────────────────
    log.warning("Unknown phase '%s' for %s — resetting", phase, phone)
    db.reset_session(phone)
    return _help_text()


# ── Phase handlers ────────────────────────────────────────────────────────────

async def _handle_idle(phone, message, history, geography, language, app_state, db) -> str:
    """
    Idle phase: evaluate global commands, then fall back to intake agent.
    This is the ONLY place global commands are checked.
    """
    msg = message.lower().strip()

    # Hard commands — exact or keyword match
    if msg in ("reset", "restart", "start over"):
        db.reset_session(phone)
        return _help_text()

    if msg in ("help", "menu", "?", "hi", "hello", "start"):
        return _help_text()

    if msg in ("oral", "oral screening", "screen oral", "mouth screening"):
        db.update_session(phone, {
            "phase":        "screening",
            "patient_data": {"screening_type": "oral"},
        })
        return "Starting oral cancer screening. How old is the patient?"

    if msg in ("screen", "screen patient", "new screening", "cervical"):
        db.update_session(phone, {
            "phase":        "screening",
            "patient_data": {"screening_type": "cervical"},
        })
        return "Starting cervical cancer screening. How old is the patient?"

    if "register survivor" in msg or "add survivor" in msg or "new survivor" in msg:
        db.update_session(phone, {
            "phase":        "registration",
            "patient_data": {"_step": "name"},
        })
        return "I'll register a survivor for weekly check-ins.\n\nWhat is the survivor's full name?"

    # Fall through to intake agent for natural language
    from agents.intake import handle_intake
    result = handle_intake(phone, message, history)
    db.update_session(phone, {"phase": result["new_phase"]})
    return result["reply"]


async def _handle_screening(phone, message, history, patient_data, language, sym_map, app_state, db) -> str:
    """Screening phase — function calling agent, no command intercepts."""
    from agents.screening import handle_screening

    # Apply symptom mapper only for long, high-confidence, symptom-specific messages
    SYMPTOM_TERMS = {
        "postcoital_bleeding", "oral_lesion", "white_patch_mouth",
        "unexplained_bleeding_mouth", "difficulty_swallowing",
    }
    TERM_TO_FIELD = {
        "postcoital_bleeding":        "postcoital_bleeding",
        "oral_lesion":                "oral_lesions",
        "white_patch_mouth":          "white_red_patches",
        "unexplained_bleeding_mouth": "unexplained_bleeding_mouth",
        "difficulty_swallowing":      "difficulty_swallowing",
    }
    if (sym_map["accepted"]
            and sym_map["clinical_term"] in SYMPTOM_TERMS
            and sym_map["confidence"] > 0.82
            and len(message.split()) > 5):
        field = TERM_TO_FIELD.get(sym_map["clinical_term"])
        if field and field not in patient_data:
            patient_data[field] = True
            db.merge_patient_data(phone, {field: True})
            log.info("SYM_APPLIED | %s = True", field)

    screening_type = patient_data.get("screening_type", "cervical")
    result = handle_screening(phone, message, history, patient_data, screening_type)

    db.update_session(phone, {
        "phase":        result["new_phase"],
        "patient_data": result["patient_data"],
    })

    if result["complete"]:
        return await _handle_risk_scoring(
            phone, result["patient_data"], language, app_state, db
        )

    return result["reply"]


async def _handle_registration(phone, message, raw_message, history, patient_data, geography, db) -> str:
    """
    Survivor registration — structured step machine.
    Uses raw_message (not PII-scrubbed) so names and phone numbers are preserved.
    No LLM — pure state machine for reliability.
    """
    step      = patient_data.get("_step", "name")
    collected = {k: v for k, v in patient_data.items() if not k.startswith("_")}
    text      = raw_message.strip()

    if step == "name":
        if len(text) < 2:
            return "Please enter the survivor's full name."
        collected["name"] = text
        db.update_session(phone, {"patient_data": {**collected, "_step": "phone"}})
        return f"Got it — {text}.\n\nWhat is their WhatsApp phone number? (include country code, e.g. +254712345678)"

    if step == "phone":
        # Normalise phone — strip spaces, dashes, parentheses
        import re
        cleaned = re.sub(r"[\s\-\(\)]", "", text)
        if not cleaned.startswith("+"):
            cleaned = "+" + cleaned.lstrip("0")
        if not re.match(r"^\+\d{7,15}$", cleaned):
            return f"That doesn't look like a valid phone number.\nPlease enter with country code, e.g. +254712345678"
        collected["survivor_phone"] = cleaned
        db.update_session(phone, {"patient_data": {**collected, "_step": "cancer_type"}})
        return f"Phone saved.\n\nWhat type of cancer did {collected.get('name', 'the survivor')} have?\n(e.g. cervical, breast, oral, colon)"

    if step == "cancer_type":
        if len(text) < 2:
            return "Please enter the cancer type (e.g. cervical, oral, breast)."
        collected["cancer_type"] = text.lower()
        db.update_session(phone, {"patient_data": {**collected, "_step": "treatment"}})
        return f"Noted — {text}.\n\nWhat treatment did they complete?\n(e.g. surgery, chemotherapy, radiation, or combination)"

    if step == "treatment":
        collected["treatment_type"] = text
        # All data collected — save to Supabase
        name          = collected.get("name", "Survivor")
        survivor_phone= collected.get("survivor_phone", phone)
        cancer_type   = collected.get("cancer_type", "unspecified")

        try:
            db.get_client().table("survivorship_cohort").upsert({
                "phone":        survivor_phone,
                "name":         name,
                "chw_phone":    phone,
                "cancer_type":  cancer_type,
                "checkin_week": 0,
            }, on_conflict="phone").execute()

            db.reset_session(phone)
            return (
                f"✅ *{name} registered successfully.*\n\n"
                f"Phone: {survivor_phone}\n"
                f"Cancer type: {cancer_type}\n"
                f"Treatment: {collected.get('treatment_type')}\n\n"
                f"ASHA will now send weekly check-in messages to {name}. "
                f"Ask them to save this number and reply to their weekly message.\n\n"
                f"Type *screen* to start a new patient screening."
            )
        except Exception as e:
            log.error("Registration save error: %s", e)
            db.reset_session(phone)
            return (
                "Registration failed due to a database error. "
                "Please try again or contact your supervisor."
            )

    # Unknown step — reset registration
    log.warning("Unknown registration step '%s' for %s", step, phone)
    db.update_session(phone, {"patient_data": {"_step": "name"}})
    return "Something went wrong. What is the survivor's full name?"


async def _handle_survivorship(phone, message, history, geography, db) -> str:
    """Survivorship check-in for registered survivors."""
    from agents.survivorship import handle_survivorship
    result = handle_survivorship(phone, message, history, geography)
    db.update_session(phone, {"phase": result["new_phase"]})
    if result.get("complete"):
        db.reset_session(phone)
    return result["reply"]


async def _handle_risk_scoring(phone, patient_data, language, app_state, db) -> str:
    """Run ML risk models and generate referral if needed."""
    if not _are_models_ready():
        return "ASHA is still loading clinical models. Please retry in 20-40 seconds."

    from agents.risk import compute_risk
    from agents.referral import generate_referral_letter, format_letter_for_whatsapp

    try:
        risk_result = compute_risk(patient_data, phone, app_state)
    except Exception as e:
        log.error("Risk scoring error for %s: %s", phone, e)
        db.reset_session(phone)
        return "Risk scoring failed. Please type *screen* to try again."

    tier       = risk_result["risk_tier"]
    patient_id = risk_result.get("patient_id")
    summary    = risk_result["overall_summary"]

    if tier in ("HIGH", "ELEVATED") and patient_id:
        try:
            ref    = generate_referral_letter(patient_data, risk_result, patient_id, phone, language)
            letter = format_letter_for_whatsapp(ref["letter"], risk_result)
            reply  = summary + "\n\n" + letter + f"\n\n_Letter quality: {ref['quality_score']}/10_"
        except Exception as e:
            log.error("Referral error for %s: %s", phone, e)
            reply = summary + "\n\n⚠️ Referral letter generation failed. Please contact your supervisor."
    else:
        reply = summary

    db.reset_session(phone)
    return reply


# ── Utilities ─────────────────────────────────────────────────────────────────
async def _handle_followup(phone: str, message: str, db) -> str:
    """Handle CHW response to a referral follow-up prompt."""
    response_map = {
        "1": "attended",    "yes": "attended",    "attended": "attended",
        "2": "not_yet",     "no":  "not_yet",     "not yet":  "not_yet",
        "3": "refused",     "refused": "refused", "unreachable": "refused",
    }
    normalized      = message.strip().lower()
    followup_status = response_map.get(normalized)
    session         = db.get_session(phone)
    patient_id      = session.get("followup_patient_id")

    if followup_status and patient_id:
        from datetime import datetime, timezone
        db.get_client().table("referral_followup").update({
            "followup_response":     followup_status,
            "followup_responded_at": datetime.now(timezone.utc).isoformat(),
        }).eq("patient_id", patient_id).execute()

        db.update_session(phone, {"phase": "idle", "followup_patient_id": None})

        replies = {
            "attended": "✅ Thank you. Glad she attended. Early treatment matters most.",
            "not_yet":  "⏳ Noted. Please follow up with her this week. Remind her: early treatment saves lives.",
            "refused":  "❌ Noted. If she changes her mind, please encourage her to attend.",
        }
        return replies[followup_status]

    # Unrecognised response — ask again
    return "Please reply *1* (attended), *2* (not yet), or *3* (refused/unreachable)."


def _help_text() -> str:
    return (
        "🌿 *ASHA — Cancer Screening Support*\n\n"
        "*Commands:*\n"
        "• *screen* — cervical cancer screening\n"
        "• *oral* — oral cancer screening\n"
        "• *register survivor* — add a survivor for weekly check-ins\n"
        "• *reset* — clear current session\n"
        "• *help* — show this menu"
    )


# ── Dashboard API ─────────────────────────────────────────────────────────────
@app.get("/api/patients")
async def api_patients(limit: int = 100):
    import services.supabase_service as db
    return db.get_patients_for_dashboard(limit)

@app.get("/api/risk-distribution")
async def api_risk_distribution():
    import services.supabase_service as db
    return db.get_risk_distribution()

@app.get("/api/regional-risk")
async def api_regional_risk():
    import services.supabase_service as db
    return db.get_regional_risk_table()

@app.post("/api/chat")
async def api_chat(request: Request):
    """
    Direct chat endpoint for the web interface.
    Same pipeline as WhatsApp webhook but returns reply directly —
    no Twilio, no polling, no race conditions.
    """
    body     = await request.json()
    user_id  = body.get("user_id", "").strip()
    message  = body.get("message", "").strip()
    image_b64= body.get("image")          # optional base64 image

    if not user_id or not message:
        return JSONResponse({"error": "missing fields"}, status_code=400)

    # Route image messages to vision analysis
    if image_b64 and message == "[PHOTO_SCREENING]":
        try:
            from groq import Groq
            import base64, re as re_mod

            # Strip data URL prefix if present
            img_data = re_mod.sub(r'^data:image/\w+;base64,', '', image_b64)

            client = Groq(api_key=os.environ["GROQ_API_KEY"])
            resp   = client.chat.completions.create(
                model="llama-3.2-11b-vision-preview",
                messages=[{
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/jpeg;base64,{img_data}"}
                        },
                        {
                            "type": "text",
                            "text": (
                                "You are an oral cancer screening assistant for community health workers. "
                                "Examine this image carefully. Describe: "
                                "1. Are there any white or red patches (leukoplakia/erythroplakia)? "
                                "2. Are there any non-healing sores or ulcers? "
                                "3. Any unusual growths, lumps, or lesions? "
                                "4. Overall oral health appearance. "
                                "Be specific and clinical. State clearly if the image quality is insufficient for assessment. "
                                "End with: REFER IMMEDIATELY, MONITOR CLOSELY, or NO CONCERNS FOUND."
                            )
                        }
                    ]
                }],
                max_tokens=400,
            )
            analysis = resp.choices[0].message.content or "Image could not be analysed."
            reply = f"📷 *Photo Analysis:*\n\n{analysis}\n\n_For a complete screening, type 'oral' to run the full questionnaire._"
        except Exception as e:
            log.error("Vision error: %s", e)
            reply = "Photo received but could not be analysed. Please describe what you see — type 'oral' to start the oral screening questionnaire."

        return JSONResponse({"reply": reply})

    import services.supabase_service as db

    # Phone prefix for web users — always English, global geography
    phone    = f"web_{user_id}"
    session  = db.get_session(phone)
    phase    = session.get("phase", "idle")
    history  = session.get("history", [])
    patient_data = session.get("patient_data", {})
    geography = "global"
    language  = "en"

    # PII scrubbing only during screening
    safe_msg = message
    if phase == "screening":
        if _are_models_ready() and request.app.state.pii_scrubber:
            scrubbed = request.app.state.pii_scrubber.scrub(message)
            safe_msg = scrubbed["scrubbed_text"]
        else:
            _start_model_loader(request.app)

    # Symptom mapping only during screening
    sym_map = {"accepted": False, "clinical_term": None, "confidence": 0.0}
    if phase == "screening" and _are_models_ready() and request.app.state.symptom_mapper:
        sym_map = request.app.state.symptom_mapper.map(safe_msg)

    db.append_to_history(phone, "user", message)

    reply = await _dispatch(
        phase=phase, phone=phone, message=safe_msg, raw_message=message,
        history=history, patient_data=patient_data,
        geography=geography, language=language,
        sym_map=sym_map, app_state=request.app.state,
    )

    db.append_to_history(phone, "assistant", reply)

    return JSONResponse({"reply": reply})


@app.post("/api/referral")
async def api_referral(request: Request):
    """
    Direct referral endpoint for the /screen mobile interface.
    Accepts structured patient data, runs full ML risk pipeline,
    generates and returns a clinical referral letter.
    No session management — stateless call.
    """
    body         = await request.json()
    patient_data = body.get("patient_data", {})
    language     = body.get("language", "en")

    if not patient_data:
        return JSONResponse({"error": "patient_data required"}, status_code=400)
    if not _are_models_ready():
        _start_model_loader(request.app)
        return JSONResponse({"error": "models warming up; retry in 20-40 seconds"}, status_code=503)

    # Detect language from phone if provided
    phone = body.get("phone", "web_screen")
    if phone.startswith("+91") or phone.startswith("91"):
        language = "hi"
    elif phone.startswith("+254") or phone.startswith("254"):
        language = "sw"

    try:
        from agents.risk import compute_risk
        from agents.referral import generate_referral_letter, format_letter_for_whatsapp

        risk_result = compute_risk(patient_data, phone, request.app.state)
        tier        = risk_result["risk_tier"]
        patient_id  = risk_result.get("patient_id")
        summary     = risk_result["overall_summary"]

        if tier in ("HIGH", "ELEVATED") and patient_id:
            ref    = generate_referral_letter(
                patient_data, risk_result, patient_id, phone, language
            )
            return JSONResponse({
                "tier":           tier,
                "summary":        summary,
                "letter":         ref["letter"],
                "quality_score":  ref["quality_score"],
                "cervical_pct":   round(risk_result.get("cervical_result", {}).get("probability", 0) * 100)
                                  if risk_result.get("cervical_result") else None,
                "oral_score":     risk_result.get("oral_result", {}).get("score")
                                  if risk_result.get("oral_result") else None,
                "top_factors":    risk_result.get("top_factors", []),
            })
        else:
            return JSONResponse({
                "tier":        tier,
                "summary":     summary,
                "letter":      None,
                "top_factors": risk_result.get("top_factors", []),
            })

    except Exception as e:
        log.error("api_referral error: %s", e)
        return JSONResponse({"error": str(e)}, status_code=500)


@app.get("/api/followup-stats")
async def api_followup_stats():
    """Referral completion rate for dashboard widget."""
    import services.supabase_service as db
    resp = db.get_client().table("referral_followup").select("*").execute()
    rows = resp.data or []
    total     = len(rows)
    attended  = sum(1 for r in rows if r.get("followup_response") == "attended")
    not_yet   = sum(1 for r in rows if r.get("followup_response") == "not_yet")
    refused   = sum(1 for r in rows if r.get("followup_response") == "refused")
    pending   = sum(1 for r in rows if r.get("followup_response") is None)
    rate      = round(attended / total * 100) if total else 0
    return {
        "total": total, "attended": attended,
        "not_yet": not_yet, "refused": refused,
        "pending": pending, "completion_rate": rate,
    }


@app.get("/api/last-reply")
async def last_reply(phone: str):
    """Test interface uses this to read the last assistant message from session history."""
    import services.supabase_service as db
    session = db.get_session(phone)
    history = session.get("history", [])
    for msg in reversed(history):
        if msg.get("role") == "assistant":
            return {"reply": msg.get("content", "")}
    return {"reply": ""}

@app.get("/api/stats")
async def api_stats():
    import services.supabase_service as db
    patients = db.get_patients_for_dashboard(500)
    today    = datetime.utcnow().date().isoformat()
    return {
        "total":    len(patients),
        "high":     sum(1 for p in patients if p.get("risk_tier") == "HIGH"),
        "elevated": sum(1 for p in patients if p.get("risk_tier") == "ELEVATED"),
        "low":      sum(1 for p in patients if p.get("risk_tier") == "LOW"),
        "referred": sum(1 for p in patients if p.get("referral_generated")),
        "today":    sum(1 for p in patients if p.get("created_at", "")[:10] == today),
    }


if __name__ == "__main__":
    import uvicorn
    from apscheduler.schedulers.background import BackgroundScheduler

    scheduler = BackgroundScheduler()

    # Weekly survivorship check-ins — Monday 07:00 UTC
    scheduler.add_job(
        lambda: __import__("services.checkin_scheduler", fromlist=["trigger_checkins"]).trigger_checkins(),
        "cron", day_of_week="mon", hour=7, minute=0,
        id="survivorship_checkins",
    )

    # Daily referral follow-through — 08:00 UTC every day
    scheduler.add_job(
        lambda: __import__("services.checkin_scheduler", fromlist=["trigger_followups"]).trigger_followups(),
        "cron", hour=8, minute=0,
        id="referral_followups",
    )

    scheduler.start()
    log.info("Scheduler started — survivorship Mon 07:00 UTC, follow-ups daily 08:00 UTC")

    uvicorn.run("main:app", host="0.0.0.0", port=8000,
                reload=os.getenv("UVICORN_RELOAD", "false").lower() == "true")
"""
ASHA Scheduler — Weekly jobs
1. Survivorship check-ins   — Monday 07:00 UTC
2. Referral follow-through  — Daily 08:00 UTC
   - 7 days after referral, ask CHW if patient attended clinic
   - Logs response to referral_followup table
   - Surfaces completion rate on dashboard
"""
import logging
from datetime import datetime, timezone, timedelta

log = logging.getLogger("asha.scheduler")


# ── Survivorship check-ins ────────────────────────────────────────────────────

def get_due_survivors() -> list[dict]:
    from services.supabase_service import get_client
    cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    resp = (
        get_client()
        .table("survivorship_cohort")
        .select("*")
        .or_(f"last_checkin.is.null,last_checkin.lt.{cutoff}")
        .execute()
    )
    return resp.data or []


def trigger_checkins():
    from services.supabase_service import update_session
    from services.twilio_service import send_whatsapp

    survivors = get_due_survivors()
    log.info("CRON | triggering check-ins for %d survivors", len(survivors))

    for s in survivors:
        phone = s.get("phone")
        name  = s.get("name", "")
        week  = (s.get("checkin_week") or 0) + 1
        if not phone:
            continue

        update_session(f"whatsapp:{phone}", {"phase": "survivorship"})
        message = (
            f"💙 *ASHA Weekly Check-in - Week {week}*\n\n"
            f"Hello {name}. Time for your weekly recovery check-in.\n\n"
            f"How have you been feeling this week? "
            f"Start by telling me your fatigue level from 1 to 10."
        )
        try:
            send_whatsapp(f"whatsapp:{phone}", message)
            log.info("CRON | sent check-in to %s (week %d)", phone, week)
        except Exception as e:
            log.error("CRON | failed to send to %s: %s", phone, e)


# ── Referral follow-through tracker ──────────────────────────────────────────

def get_pending_followups() -> list[dict]:
    """
    Find referrals generated 7+ days ago that haven't been followed up yet.
    Joins patients + referral_log, excludes already-sent follow-ups.
    """
    from services.supabase_service import get_client

    cutoff_min = (datetime.now(timezone.utc) - timedelta(days=8)).isoformat()
    cutoff_max = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()

    # Get referrals in the 7-day window
    resp = (
        get_client()
        .table("patients")
        .select("id, chw_phone, age, risk_tier, top_risk_factors, created_at")
        .eq("referral_generated", True)
        .in_("risk_tier", ["HIGH", "ELEVATED"])
        .gte("created_at", cutoff_min)
        .lte("created_at", cutoff_max)
        .execute()
    )
    patients = resp.data or []
    if not patients:
        return []

    # Exclude patients already followed up
    patient_ids = [p["id"] for p in patients]
    already = (
        get_client()
        .table("referral_followup")
        .select("patient_id")
        .in_("patient_id", patient_ids)
        .execute()
    )
    already_ids = {r["patient_id"] for r in (already.data or [])}

    return [p for p in patients if p["id"] not in already_ids]


def send_followup_prompt(patient: dict):
    """Send CHW a follow-up WhatsApp asking if the patient attended clinic."""
    from services.supabase_service import get_client, update_session
    from services.twilio_service import send_whatsapp

    chw_phone = patient.get("chw_phone", "")
    if not chw_phone:
        return

    age      = patient.get("age", "?")
    tier     = patient.get("risk_tier", "HIGH")
    factors  = patient.get("top_risk_factors") or []
    factor1  = factors[0] if factors else "risk factors identified"
    referral_date = patient.get("created_at", "")[:10]  # YYYY-MM-DD

    tier_emoji = "🔴" if tier == "HIGH" else "🟡"

    message = (
        f"{tier_emoji} *ASHA Follow-up*\n\n"
        f"7 days ago, you referred a patient:\n"
        f"• Age {age} · {tier} RISK\n"
        f"• {factor1}\n"
        f"• Referred: {referral_date}\n\n"
        f"Did the patient visit the clinic?\n\n"
        f"Reply:\n"
        f"*1* — Yes, attended ✅\n"
        f"*2* — Not yet ⏳\n"
        f"*3* — Refused / unreachable ❌"
    )

    wa_phone = chw_phone if chw_phone.startswith("whatsapp:") else f"whatsapp:{chw_phone}"

    try:
        send_whatsapp(wa_phone, message)

        # Log the follow-up as sent
        get_client().table("referral_followup").insert({
            "patient_id":       patient["id"],
            "chw_phone":        chw_phone,
            "patient_summary":  f"Age {age} · {tier} · {factor1}",
            "risk_tier":        tier,
            "referral_date":    patient["created_at"],
            "followup_sent_at": datetime.now(timezone.utc).isoformat(),
        }).execute()

        # Set CHW session to followup phase so their reply is routed
        update_session(wa_phone, {
            "phase":              "followup",
            "followup_patient_id": patient["id"],
        })

        log.info("CRON | follow-up sent to %s for patient %s", chw_phone, patient["id"])

    except Exception as e:
        log.error("CRON | follow-up failed for %s: %s", chw_phone, e)


def trigger_followups():
    """Daily job — send follow-up prompts for 7-day-old referrals."""
    pending = get_pending_followups()
    log.info("CRON | %d referral follow-ups due", len(pending))
    for patient in pending:
        send_followup_prompt(patient)
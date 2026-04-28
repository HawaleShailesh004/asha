"""
ASHA - Supabase Service (v2)
Adds geography detection for language routing.
"""

import os
from supabase import create_client, Client


def get_client() -> Client:
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_KEY"]
    )


# ── Geography / Language ──────────────────────────────────────────────────────
# Geography → Language routing
# Kenya (+254) → Swahili
# Tanzania (+255) → Swahili
# India (+91) → Hindi
# Nigeria (+234) → English
# Default → English
def detect_geography(phone: str) -> tuple[str, str]:
    """Returns (geography, language) based on phone prefix."""
    phone = phone.replace(" ", "").replace("-", "")
    if phone.startswith("+254") or phone.startswith("254"):
        return "kenya",    "sw"
    if phone.startswith("+255") or phone.startswith("255"):
        return "tanzania", "sw"
    if phone.startswith("+91")  or phone.startswith("91"):
        return "india",    "hi"
    if phone.startswith("+234") or phone.startswith("234"):
        return "nigeria",  "en"
    return "global", "en"


# ── Session ───────────────────────────────────────────────────────────────────
def get_session(phone: str) -> dict:
    db     = get_client()
    result = db.table("sessions").select("*").eq("phone", phone).execute()
    if result.data:
        return result.data[0]

    geography, language = detect_geography(phone)
    new_session = {
        "phone":        phone,
        "phase":        "idle",
        "history":      [],
        "patient_data": {},
        "geography":    geography,
        "language":     language,
    }
    db.table("sessions").insert(new_session).execute()
    return new_session


def update_session(phone: str, updates: dict) -> None:
    get_client().table("sessions").update(updates).eq("phone", phone).execute()


def reset_session(phone: str) -> None:
    update_session(phone, {
        "phase":        "idle",
        "history":      [],
        "patient_data": {},
    })


def append_to_history(phone: str, role: str, content: str) -> None:
    session = get_session(phone)
    history = session.get("history", [])
    history.append({"role": role, "content": content})
    if len(history) > 30:
        history = history[-30:]
    update_session(phone, {"history": history})


def merge_patient_data(phone: str, new_data: dict) -> dict:
    session      = get_session(phone)
    patient_data = session.get("patient_data", {})
    patient_data.update(new_data)
    update_session(phone, {"patient_data": patient_data})
    return patient_data


# ── Patients ──────────────────────────────────────────────────────────────────
def save_patient(record: dict) -> str | None:
    db     = get_client()
    result = db.table("patients").insert(record).execute()
    return result.data[0]["id"] if result.data else None


def get_patients_for_dashboard(limit: int = 100) -> list:
    db     = get_client()
    result = (
        db.table("patients")
        .select("*")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return result.data or []


def get_risk_distribution() -> dict:
    db     = get_client()
    result = db.table("patients").select("risk_tier").execute()
    counts = {"HIGH": 0, "ELEVATED": 0, "LOW": 0}
    for row in (result.data or []):
        tier = row.get("risk_tier", "LOW")
        if tier in counts:
            counts[tier] += 1
    return counts


def get_regional_risk_table() -> list:
    db     = get_client()
    result = db.table("patients").select("chw_phone, risk_tier").execute()
    summary: dict[str, dict] = {}
    for row in (result.data or []):
        phone = row.get("chw_phone", "unknown")
        tier  = row.get("risk_tier", "LOW")
        if phone not in summary:
            summary[phone] = {"chw_phone": phone, "total": 0, "high_count": 0}
        summary[phone]["total"] += 1
        if tier == "HIGH":
            summary[phone]["high_count"] += 1
    for v in summary.values():
        v["high_pct"] = round(100 * v["high_count"] / max(v["total"], 1), 1)
    return sorted(summary.values(), key=lambda x: x["high_pct"], reverse=True)


# ── Referral ──────────────────────────────────────────────────────────────────
def save_referral(record: dict) -> None:
    get_client().table("referral_log").insert(record).execute()


# ── Survivorship ──────────────────────────────────────────────────────────────
def get_survivor(phone: str) -> dict | None:
    db     = get_client()
    result = db.table("survivorship_cohort").select("*").eq("phone", phone).execute()
    return result.data[0] if result.data else None


def save_checkin(checkin: dict) -> None:
    db = get_client()
    db.table("survivorship_checkins").insert(checkin).execute()
    db.table("survivorship_cohort").update({
        "checkin_week": checkin["week_number"],
        "last_checkin": "now()",
    }).eq("phone", checkin["survivor_phone"]).execute()


def get_checkin_history(phone: str, last_n: int = 8) -> list:
    db     = get_client()
    result = (
        db.table("survivorship_checkins")
        .select("*")
        .eq("survivor_phone", phone)
        .order("created_at", desc=True)
        .limit(last_n)
        .execute()
    )
    return list(reversed(result.data or []))
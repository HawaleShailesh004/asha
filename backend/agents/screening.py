"""
ASHA - Agent 2: Screening Protocol Agent (v2)

Changes from v1:
  - ORAL screening branch fully implemented with dedicated tool + required fields
  - screening_type detection: if CHW says oral/mouth symptoms, switches to oral flow
  - Both branches use function calling - structured, no hallucination
  - History not managed here - webhook handler owns history

Cervical branch: 7 required fields (age, pregnancies, smokes, contraceptives, IUD, STDs, postcoital_bleeding)
Oral branch:     6 required fields (age, tobacco, betel_quid, oral_lesions, white_patches, difficulty_swallowing)
"""

import json
import os
from groq import Groq

# ── CERVICAL Tool ─────────────────────────────────────────────────────────────
CERVICAL_TOOL = {
    "type": "function",
    "function": {
        "name": "save_patient_field",
        "description": (
            "Save a collected patient data field. Call this IMMEDIATELY whenever "
            "the CHW provides information that fills one of the required fields. "
            "Do NOT store data in conversation - always call this tool."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "field_name": {
                    "type": "string",
                    "enum": [
                        "age", "num_pregnancies", "first_intercourse_age",
                        "num_sexual_partners", "smokes", "smokes_years",
                        "hormonal_contraceptives", "hc_years",
                        "iud", "iud_years", "stds_history", "postcoital_bleeding",
                    ]
                },
                "field_value": {
                    "description": "Parsed value: bool for yes/no fields, int for numbers."
                },
                "confirmation_message": {
                    "type": "string",
                    "description": "Brief warm confirmation under 15 words."
                }
            },
            "required": ["field_name", "field_value", "confirmation_message"]
        }
    }
}

# ── ORAL Tool ─────────────────────────────────────────────────────────────────
ORAL_TOOL = {
    "type": "function",
    "function": {
        "name": "save_patient_field",
        "description": (
            "Save a collected patient data field for oral cancer screening. "
            "Call this IMMEDIATELY whenever the CHW provides relevant information."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "field_name": {
                    "type": "string",
                    "enum": [
                        "age", "gender", "tobacco_use", "betel_quid_use",
                        "alcohol_consumption", "poor_oral_hygiene",
                        "oral_lesions", "white_red_patches",
                        "unexplained_bleeding_mouth", "difficulty_swallowing",
                        "family_history_cancer", "compromised_immune",
                        "chronic_sun_exposure", "diet_quality",
                    ]
                },
                "field_value": {
                    "description": "Bool for yes/no, string for diet_quality (Low/Moderate/High)."
                },
                "confirmation_message": {
                    "type": "string",
                    "description": "Brief warm confirmation under 15 words."
                }
            },
            "required": ["field_name", "field_value", "confirmation_message"]
        }
    }
}

# ── Required fields ───────────────────────────────────────────────────────────
CERVICAL_REQUIRED = {
    "age", "num_pregnancies", "smokes",
    "hormonal_contraceptives", "iud", "stds_history", "postcoital_bleeding",
}

ORAL_REQUIRED = {
    "age", "tobacco_use", "betel_quid_use",
    "oral_lesions", "white_red_patches", "difficulty_swallowing",
}

BOOL_FIELDS = {
    "smokes", "hormonal_contraceptives", "iud", "stds_history",
    "postcoital_bleeding", "tobacco_use", "betel_quid_use",
    "alcohol_consumption", "poor_oral_hygiene", "oral_lesions",
    "white_red_patches", "unexplained_bleeding_mouth",
    "difficulty_swallowing", "family_history_cancer",
    "compromised_immune", "chronic_sun_exposure",
}

INT_FIELDS = {
    "age", "num_pregnancies", "first_intercourse_age",
    "num_sexual_partners", "smokes_years", "hc_years", "iud_years",
}

CERVICAL_QUESTIONS = {
    "age":                    "How old is the patient?",
    "num_pregnancies":        "How many times has she been pregnant?",
    "first_intercourse_age":  "How old was she when she first had sex?",
    "num_sexual_partners":    "Approximately how many sexual partners has she had?",
    "smokes":                 "Does she smoke or use any tobacco?",
    "smokes_years":           "How many years has she been smoking?",
    "hormonal_contraceptives":"Does she use birth control pills or hormonal contraception?",
    "hc_years":               "How many years has she used hormonal contraception?",
    "iud":                    "Does she have an IUD or coil inserted?",
    "iud_years":              "How many years has she had the IUD?",
    "stds_history":           "Has she ever been treated for a sexually transmitted infection?",
    "postcoital_bleeding":    "Does she bleed after sex, or has she noticed any unusual bleeding?",
}

ORAL_QUESTIONS = {
    "age":                        "How old is the patient?",
    "gender":                     "Is the patient male or female?",
    "tobacco_use":                "Does the patient smoke or use any tobacco product?",
    "betel_quid_use":             "Does the patient chew betel nut, pan, or areca nut?",
    "alcohol_consumption":        "Does the patient drink alcohol regularly?",
    "poor_oral_hygiene":          "Does the patient have poor oral hygiene - broken teeth, not brushing?",
    "oral_lesions":               "Can you see any sores or wounds in the mouth not healed for over 2 weeks?",
    "white_red_patches":          "Are there any white or red patches inside the mouth or on the tongue?",
    "unexplained_bleeding_mouth": "Has there been any unexplained bleeding from the mouth?",
    "difficulty_swallowing":      "Does the patient have difficulty swallowing food or liquids?",
    "family_history_cancer":      "Has anyone in the patient's family had cancer?",
    "compromised_immune":         "Does the patient have HIV, diabetes, or any immune condition?",
    "chronic_sun_exposure":       "Does the patient work outdoors in the sun for long hours?",
    "diet_quality":               "How is the patient's diet? Do they eat fruits and vegetables? (Low / Moderate / High)",
}

CERVICAL_SYSTEM = """You are ASHA, helping CHWs screen patients for cervical cancer.

RULES:
1. Ask ONE question at a time
2. Call save_patient_field IMMEDIATELY when you have data to save
3. After saving, ask the next missing required field
4. When ALL required fields are collected, respond: SCREENING_COMPLETE
5. Keep responses under 60 words. Use simple English.
6. If CHW provides multiple facts at once, save ALL with separate tool calls.

Required fields: age, num_pregnancies, smokes, hormonal_contraceptives, iud, stds_history, postcoital_bleeding"""

ORAL_SYSTEM = """You are ASHA, helping CHWs screen patients for oral cancer and tobacco-related mouth conditions.

RULES:
1. Ask ONE question at a time
2. Call save_patient_field IMMEDIATELY when you have data to save
3. After saving, ask the next missing required field
4. When ALL required fields are collected, respond: SCREENING_COMPLETE
5. Keep responses under 60 words. Use simple English.
6. If CHW provides multiple facts at once, save ALL with separate tool calls.

Required fields: age, tobacco_use, betel_quid_use, oral_lesions, white_red_patches, difficulty_swallowing"""


def handle_screening(phone: str, message: str, history: list,
                     patient_data: dict, screening_type: str = "cervical") -> dict:
    """
    One turn of screening conversation via Groq function calling.
    Returns updated patient_data and whether screening is complete.
    """
    client = Groq(api_key=os.environ["GROQ_API_KEY"])

    # Select branch
    if screening_type == "oral":
        required  = ORAL_REQUIRED
        tool      = ORAL_TOOL
        questions = ORAL_QUESTIONS
        system    = ORAL_SYSTEM
    else:
        required  = CERVICAL_REQUIRED
        tool      = CERVICAL_TOOL
        questions = CERVICAL_QUESTIONS
        system    = CERVICAL_SYSTEM

    missing  = [f for f in required if f not in patient_data]
    collected_str = ", ".join(f"{k}={v}" for k, v in patient_data.items() if k in questions)

    state_ctx = (
        f"Collected: {collected_str or 'nothing yet'}. "
        f"Still needed: {', '.join(missing) if missing else 'ALL DONE'}. "
        f"CHW said: \"{message}\""
        + (f". Next to ask: {questions[missing[0]]}" if missing else
           ". ALL required fields collected - respond SCREENING_COMPLETE.")
    )

    messages = [{"role": "system", "content": system}]
    for msg in history[-16:]:
        role    = msg.get("role", "user")
        content = msg.get("content", "")
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": f"{message}\n\n[STATE: {state_ctx}]"})

    updated_data = patient_data.copy()
    final_reply  = None

    for _ in range(12):   # safety cap
        try:
            resp   = client.chat.completions.create(
                model       = "llama-3.3-70b-versatile",
                messages    = messages,
                tools       = [tool],
                tool_choice = "auto",
                max_tokens  = 300,
            )
        except Exception as e:
            # Groq API error (400, 429, 503 etc.) - graceful fallback
            missing_now = [f for f in required if f not in updated_data]
            fallback_q  = questions.get(missing_now[0], "Please continue.") if missing_now else "Thank you, calculating risk now..."
            return {
                "new_phase":    "screening" if missing_now else "risk_scoring",
                "reply":        f"Sorry, I had trouble processing that. {fallback_q}",
                "patient_data": updated_data,
                "complete":     not bool(missing_now),
            }
        choice  = resp.choices[0]
        msg_obj = choice.message

        if choice.finish_reason == "tool_calls" and msg_obj.tool_calls:
            tool_results = []
            for tc in msg_obj.tool_calls:
                try:
                    args        = json.loads(tc.function.arguments)
                    field_name  = args.get("field_name")
                    field_value = args.get("field_value")
                    confirmation= args.get("confirmation_message", "Got it.")

                    if field_name and field_value is not None:
                        parsed = _parse_value(field_name, field_value)
                        if parsed is not None:
                            updated_data[field_name] = parsed

                    tool_results.append({
                        "tool_call_id": tc.id,
                        "role":         "tool",
                        "name":         tc.function.name,
                        "content":      json.dumps({"saved": True, "msg": confirmation}),
                    })
                except Exception:
                    tool_results.append({
                        "tool_call_id": tc.id,
                        "role":         "tool",
                        "name":         "save_patient_field",
                        "content":      json.dumps({"saved": False}),
                    })

            messages.append({
                "role":       "assistant",
                "content":    msg_obj.content or "",
                "tool_calls": [
                    {"id": tc.id, "type": "function",
                     "function": {"name": tc.function.name, "arguments": tc.function.arguments}}
                    for tc in msg_obj.tool_calls
                ],
            })
            for tr in tool_results:
                messages.append(tr)

            # All required collected?
            still_missing = [f for f in required if f not in updated_data]
            if not still_missing:
                messages.append({
                    "role":    "user",
                    "content": "[All required fields collected. Respond: SCREENING_COMPLETE]"
                })
                final_resp  = client.chat.completions.create(
                    model="llama-3.3-70b-versatile",
                    messages=messages,
                    max_tokens=80,
                )
                final_reply = final_resp.choices[0].message.content
                break
            continue

        else:
            final_reply = msg_obj.content or ""
            break

    if final_reply is None:
        missing_now = [f for f in required if f not in updated_data]
        final_reply = questions.get(missing_now[0], "Please continue.") if missing_now else "SCREENING_COMPLETE"

    is_complete = (
        "SCREENING_COMPLETE" in (final_reply or "")
        or not [f for f in required if f not in updated_data]
    )

    # ── Premature completion guard ────────────────────────────────────────────
    # The LLM may declare SCREENING_COMPLETE before all required fields
    # are actually in updated_data. Override it - the schema is authoritative.
    actually_missing = [f for f in required if f not in updated_data]
    if is_complete and actually_missing:
        is_complete  = False
        final_reply  = questions.get(actually_missing[0], "Please continue.")

    clean_reply = final_reply.replace("SCREENING_COMPLETE", "").strip() if is_complete else final_reply
    if is_complete and not clean_reply:
        clean_reply = "Thank you. I have all the information I need. Calculating risk now..."

    return {
        "new_phase":    "risk_scoring" if is_complete else "screening",
        "reply":        clean_reply,
        "patient_data": updated_data,
        "complete":     is_complete,
    }


def detect_screening_type(message: str) -> str | None:
    """
    Detect if CHW is requesting oral screening specifically.
    Returns 'oral', 'cervical', or None (not a screening request).
    """
    msg = message.lower()
    oral_triggers = [
        "oral", "mouth", "betel", "gutka", "pan masala",
        "mdomo", "mdomoni", "muh", "cancer of mouth",
    ]
    if any(t in msg for t in oral_triggers):
        return "oral"
    cervical_triggers = [
        "screen", "cervical", "uterus", "womb",
        "bleeding", "gynae", "screen patient",
    ]
    if any(t in msg for t in cervical_triggers):
        return "cervical"
    return None


def _parse_value(field_name: str, raw_value):
    if field_name in BOOL_FIELDS:
        if isinstance(raw_value, bool):
            return raw_value
        return str(raw_value).lower() in ("true", "yes", "1", "y")
    if field_name in INT_FIELDS:
        try:
            return int(float(str(raw_value)))
        except (ValueError, TypeError):
            return None
    if field_name == "diet_quality":
        v = str(raw_value).strip().lower()
        if v in ("high", "good", "lots"):
            return "High"
        if v in ("low", "poor", "rarely", "little"):
            return "Low"
        return "Moderate"
    if field_name == "gender":
        v = str(raw_value).strip().lower()
        return "Male" if v in ("male", "m", "man") else "Female"
    return raw_value
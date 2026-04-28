"""
ASHA - Agent 1: Intake & Triage
Receives first message from CHW. Classifies intent. Routes to correct phase.
"""

from services.claude_service import call_agent

SYSTEM_PROMPT = """You are ASHA's Intake Agent for community health workers (CHWs) in Africa and South Asia.

Your job: classify the CHW's message into one of these intents:
- NEW_SCREENING: CHW wants to screen a patient for cancer
- SURVIVORSHIP: Message is about a cancer survivor's follow-up
- GREETING: Hello / how are you / testing the bot
- UNKNOWN: Cannot classify

Respond with ONLY a JSON object like this:
{"intent": "NEW_SCREENING", "confidence": 0.95, "message": "Starting patient screening. What is the patient's age?"}

For NEW_SCREENING, the message should warmly greet and ask for the patient's age.
For GREETING, respond warmly and explain what ASHA can do.
For SURVIVORSHIP, say you will check their follow-up status.
For UNKNOWN, ask the CHW to clarify.

Keep all responses under 100 words. Use simple English - CHWs may not be native speakers.
Never mention AI or machine learning. You are a clinical support tool."""


def handle_intake(phone: str, message: str, history: list) -> dict:
    """
    Classify CHW's message and return routing decision.

    Returns:
        {
            "new_phase": str,
            "reply": str,
            "intent": str
        }
    """
    import json

    raw = call_agent(SYSTEM_PROMPT, history, message)

    try:
        # Strip markdown code blocks if present
        clean = raw.strip().strip("```json").strip("```").strip()
        data  = json.loads(clean)
    except Exception:
        # Fallback if Claude doesn't return valid JSON
        data = {
            "intent":  "NEW_SCREENING",
            "message": "Welcome to ASHA. Let's screen your patient. What is the patient's age?"
        }

    intent = data.get("intent", "UNKNOWN")
    reply  = data.get("message", "Welcome to ASHA. How can I help you today?")

    phase_map = {
        "NEW_SCREENING": "screening",
        "SURVIVORSHIP":  "survivorship",
        "GREETING":      "idle",
        "UNKNOWN":       "idle",
    }
    new_phase = phase_map.get(intent, "idle")

    if intent == "GREETING":
        reply = "ASHA is ready. Type *screen* to start a new patient screening, or *reset* to start over."

    return {
        "new_phase": new_phase,
        "reply":     reply,
        "intent":    intent,
    }

"""
ASHA - Agent 4: Referral Letter Generator (v2)

Fixes from v1:
  - Explicit date injection (no more [Current Date] placeholder)
  - CHW phone explicitly passed as contact reference
  - Language properly injected into generation context
  - Quality validation unchanged
"""

import json
from datetime import date
from services.claude_service import call_agent
import services.supabase_service as db
from groq import Groq
import os

GROQ_MODEL = "llama-3.3-70b-versatile"

LANGUAGES = {"en": "English", "sw": "Swahili", "hi": "Hindi"}

GENERATION_SYSTEM = """You are a clinical documentation assistant generating referral letters for community health workers in Africa and South Asia.

Generate a professional referral letter that includes:
1. Date (use the exact date provided - never write [Current Date])
2. "To: Attending Clinician"
3. Patient summary (age, key symptoms - no name for privacy)
4. Risk assessment result (tier + probability/score)
5. Top 3 risk factors (specific, not generic)
6. Recommended next step (colposcopy / oral examination / biopsy)
7. CHW contact (use the exact phone number provided - never write [Reference])

Keep under 200 words. Plain medical language - not complex jargon.
If language is Swahili: write entirely in Swahili, medical terms in English in parentheses.
If language is Hindi: write entirely in Hindi (Devanagari script), medical terms in English in parentheses. Use formal Hindi appropriate for a clinical letter.
If language is English: write in clear plain English.
Output ONLY the letter. No preamble."""

GENERATION_SYSTEM_HI = """आप एक नैदानिक दस्तावेज़ीकरण सहायक हैं जो अफ्रीका और दक्षिण एशिया में सामुदायिक स्वास्थ्य कार्यकर्ताओं के लिए रेफरल पत्र तैयार करते हैं।

एक पेशेवर रेफरल पत्र तैयार करें जिसमें शामिल हों:
1. दिनांक (प्रदान की गई सटीक तारीख का उपयोग करें)
2. "प्रति: उपस्थित चिकित्सक"
3. रोगी सारांश (आयु, मुख्य लक्षण - गोपनीयता के लिए कोई नाम नहीं)
4. जोखिम मूल्यांकन परिणाम (स्तर + संभावना/स्कोर)
5. शीर्ष 3 जोखिम कारक (विशिष्ट)
6. अनुशंसित अगला कदम (colposcopy / मुख परीक्षण / biopsy)
7. CHW संपर्क (प्रदान किया गया फोन नंबर)

200 शब्दों से कम रखें। चिकित्सा शब्द अंग्रेजी में कोष्ठक में लिखें।
केवल पत्र का पाठ लिखें। कोई प्रस्तावना नहीं।"""

VALIDATION_SYSTEM = """Score this medical referral letter on three dimensions (1-10):
1. Clinical completeness - all relevant symptoms and risk factors included?
2. Actionability - does the receiving clinic know exactly what to do?
3. Clarity - would a rural nurse understand immediately?

Respond ONLY with valid JSON:
{"completeness": 8, "actionability": 9, "clarity": 8, "min_score": 8, "improvements": []}

min_score is the lowest of the three scores."""


def generate_referral_letter(patient_data: dict, risk_result: dict,
                              patient_id: str, chw_phone: str,
                              language: str = "en") -> dict:
    """Generate + validate referral letter. Regenerate once if quality < 7."""
    today     = date.today().strftime("%B %d, %Y")
    lang_name = LANGUAGES.get(language, "English")

    letter  = _generate(patient_data, risk_result, chw_phone, today, lang_name)
    quality = _validate(letter)

    if quality["min_score"] < 7 and quality.get("improvements"):
        improvements   = "; ".join(quality["improvements"])
        retry_prompt   = (
            f"Improve this letter addressing: {improvements}\n"
            f"Date is {today}. CHW contact: {chw_phone}\n"
            f"Original:\n{letter}"
        )
        letter  = _generate_retry(retry_prompt, lang_name)
        quality = _validate(letter)

    avg = round(
        (quality["completeness"] + quality["actionability"] + quality["clarity"]) / 3, 1
    )

    # Persist to Supabase
    db.save_referral({
        "patient_id":     patient_id,
        "chw_phone":      chw_phone,
        "language":       language,
        "letter_content": letter,
        "quality_score":  avg,
    })
    db.get_client().table("patients").update({
        "referral_generated":     True,
        "referral_language":      language,
        "referral_letter":        letter,
        "referral_quality_score": avg,
    }).eq("id", patient_id).execute()

    return {"letter": letter, "quality_score": avg, "language": language}


def _generate(patient_data: dict, risk_result: dict,
              chw_phone: str, today: str, lang_name: str) -> str:
    client   = Groq(api_key=os.environ["GROQ_API_KEY"])
    cervical = risk_result.get("cervical_result") or {}
    oral     = risk_result.get("oral_result")     or {}
    factors  = risk_result.get("top_factors", [])
    tier     = risk_result.get("risk_tier", "ELEVATED")

    # Use dedicated Hindi system prompt for cleaner output
    system = GENERATION_SYSTEM_HI if lang_name == "Hindi" else GENERATION_SYSTEM

    context = (
        f"Date: {today}\n"
        f"Language: {lang_name}\n"
        f"CHW contact number: {chw_phone}\n"
        f"Patient age: {patient_data.get('age', 'unknown')}\n"
        f"Overall risk tier: {tier}\n"
        f"Cervical cancer probability: {cervical.get('probability', 'N/A')}\n"
        f"Oral cancer score: {oral.get('score', 'N/A')}/30 ({oral.get('tier', 'N/A')})\n"
        f"Top risk factors: {', '.join(factors[:3]) if factors else 'See screening data'}\n"
        f"Cervical action: {cervical.get('action', '')}\n"
        f"Oral action: {oral.get('action', '')}\n"
        f"Symptoms: postcoital_bleeding={patient_data.get('postcoital_bleeding', False)}, "
        f"oral_lesions={patient_data.get('oral_lesions', False)}, "
        f"white_patches={patient_data.get('white_red_patches', False)}, "
        f"tobacco={patient_data.get('tobacco_use', patient_data.get('smokes', False))}"
    )

    resp = client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[
            {"role": "system", "content": system},
            {"role": "user",   "content": context},
        ],
        max_tokens=500,
    )
    return resp.choices[0].message.content or ""


def _generate_retry(prompt: str, lang_name: str) -> str:
    client = Groq(api_key=os.environ["GROQ_API_KEY"])
    resp   = client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[
            {"role": "system", "content": GENERATION_SYSTEM},
            {"role": "user",   "content": f"Language: {lang_name}\n{prompt}"},
        ],
        max_tokens=500,
    )
    return resp.choices[0].message.content or ""


def _validate(letter: str) -> dict:
    try:
        client = Groq(api_key=os.environ["GROQ_API_KEY"])
        resp   = client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[
                {"role": "system", "content": VALIDATION_SYSTEM},
                {"role": "user",   "content": letter},
            ],
            max_tokens=150,
        )
        raw   = resp.choices[0].message.content or ""
        clean = raw.strip().strip("```json").strip("```").strip()
        data  = json.loads(clean)
        if "min_score" not in data:
            scores = [data.get("completeness", 7),
                      data.get("actionability", 7),
                      data.get("clarity", 7)]
            data["min_score"] = min(scores)
        return data
    except Exception:
        return {"completeness": 7, "actionability": 7, "clarity": 7,
                "min_score": 7, "improvements": []}


def format_letter_for_whatsapp(letter: str, risk_result: dict) -> str:
    tier  = risk_result.get("risk_tier", "ELEVATED")
    emoji = {"HIGH": "🔴", "ELEVATED": "🟡", "LOW": "🟢"}.get(tier, "")
    return (
        f"{emoji} *REFERRAL LETTER*\n"
        f"{'─' * 30}\n"
        f"{letter}\n"
        f"{'─' * 30}\n"
        f"_Generated by ASHA Clinical Support_"
    )
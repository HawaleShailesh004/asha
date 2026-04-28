"""
ASHA - Agent 5: Survivorship Care Agent (v3)

Registration is now handled by a state machine in main.py.
This agent handles ONLY weekly check-ins for registered survivors.

Swahili output when geography == 'kenya' or 'tanzania'.
"""

import json
import os
from groq import Groq
import services.supabase_service as db

GROQ_MODEL = "llama-3.3-70b-versatile"

CHECKIN_SYSTEM_EN = """You are ASHA supporting a cancer survivor through their weekly recovery check-in.

Your job: collect fatigue score (1-10), pain score (1-10), mood score (1-10), and any new symptoms.
Ask ONE question at a time. Be warm, human, and encouraging - never clinical.

When you have all four pieces of information, respond ONLY with:
CHECKIN_COMPLETE
{"fatigue": 7, "pain": 4, "mood": 6, "new_symptoms": "mild headache"}

Rules:
- Never diagnose or prescribe
- If the person seems distressed, acknowledge their feelings first
- Keep each response under 80 words
- Do not re-ask for information already provided"""

CHECKIN_SYSTEM_SW = """Wewe ni ASHA unayesaidia mgonjwa aliyepona saratani katika ukaguzi wa kila wiki.

Kazi yako: kukusanya alama ya uchovu (1-10), maumivu (1-10), hisia (1-10), na dalili mpya yoyote.
Uliza swali MOJA kwa wakati mmoja. Kuwa na joto na kutia moyo.

Ukikamilisha ukusanyaji, jibu TU:
CHECKIN_COMPLETE
{"fatigue": 7, "pain": 4, "mood": 6, "new_symptoms": "maumivu ya kichwa"}

Jibu fupi, chini ya maneno 80."""

PROTOCOL_SYSTEM = """You are a clinical integrative oncology assistant.

Generate a personalised weekly recovery protocol. Include exactly:
1. ONE specific Yoga Nidra or restorative yoga exercise (matched to their fatigue/pain level)
2. ONE specific Pranayama technique with duration (e.g. Nadi Shodhana, 5 minutes)
3. TWO specific Ayurvedic recommendations (evidence-based: turmeric, ashwagandha, triphala, warm foods etc.)
4. ONE short encouraging affirmation

Format with emoji headers. Under 200 words. Make it personal - reference their cancer type and scores."""

PROTOCOL_SYSTEM_SW = """Wewe ni msaidizi wa oncology ya kiunganishi.

Tengeneza mpango wa kupona wa wiki moja kwa mgonjwa. Jumuisha:
1. Mazoezi MOJA ya Yoga Nidra au yoga ya kupumzika (yanayofaa kwa kiwango chao cha uchovu/maumivu)
2. Mbinu MOJA ya Pranayama na muda (maneno ya kimatibabu kwa Kiingereza mabano)
3. Mapendekezo MAWILI ya Ayurveda (yanayothibitishwa na utafiti)
4. MOJA kutia moyo kifupi

Maneno ya kimatibabu: weka Kiingereza kwenye mabano. Chini ya maneno 200."""

PROTOCOL_SYSTEM_HI = """आप एक एकीकृत ऑन्कोलॉजी सहायक हैं।

मरीज़ के लिए एक व्यक्तिगत साप्ताहिक उपचार प्रोटोकॉल तैयार करें। इसमें शामिल करें:
1. एक विशिष्ट Yoga Nidra या विश्राम योगासन (थकान/दर्द के स्तर के अनुसार)
2. एक विशिष्ट Pranayama तकनीक और अवधि (जैसे नाड़ी शोधन, 5 मिनट)
3. दो आयुर्वेदिक सुझाव (साक्ष्य-आधारित: हल्दी, अश्वगंधा, त्रिफला आदि)
4. एक प्रोत्साहन वाक्य

चिकित्सा शब्द अंग्रेजी में कोष्ठक में लिखें। 200 शब्दों से कम।"""

CHECKIN_SYSTEM_HI = """आप ASHA हैं, जो एक कैंसर से उबरे मरीज़ की साप्ताहिक जांच में सहायता कर रहे हैं।

आपका काम: थकान स्कोर (1-10), दर्द स्कोर (1-10), मनोदशा स्कोर (1-10), और कोई नए लक्षण एकत्र करना।
एक बार में केवल एक प्रश्न पूछें। गर्मजोशी से और प्रोत्साहित करते हुए बात करें।

जब सभी जानकारी मिल जाए, केवल यह लिखें:
CHECKIN_COMPLETE
{"fatigue": 7, "pain": 4, "mood": 6, "new_symptoms": "हल्का सिरदर्द"}

80 शब्दों से कम में उत्तर दें।"""


def handle_survivorship(phone: str, message: str, history: list,
                        geography: str = "global") -> dict:
    """Handle one turn of a weekly check-in conversation."""
    if geography in ("kenya", "tanzania"):
        lang = "sw"
    elif geography == "india":
        lang = "hi"
    else:
        lang = "en"

    survivor = db.get_survivor(phone)

    if not survivor:
        not_registered_msg = {
            "hi": "आप ASHA में एक survivor के रूप में पंजीकृत नहीं हैं।\n\nअपने सामुदायिक स्वास्थ्य कार्यकर्ता से *register survivor* टाइप करने के लिए कहें।",
            "sw": "Hujasajiliwa kama mgonjwa aliyepona katika ASHA.\n\nMwambie CHW wako aandike *register survivor*.",
            "en": "You are not registered as a survivor in ASHA.\n\nAsk your community health worker to register you by typing *register survivor* on their ASHA phone.",
        }
        return {
            "new_phase": "idle",
            "reply": not_registered_msg.get(lang, not_registered_msg["en"]),
        }

    name = survivor.get("name", "")
    week = survivor.get("checkin_week", 0) + 1

    system = (
        CHECKIN_SYSTEM_HI if lang == "hi"
        else CHECKIN_SYSTEM_SW if lang == "sw"
        else CHECKIN_SYSTEM_EN
    )
    context = (
        f"Survivor: {name}, Week {week} of recovery.\n"
        f"Cancer type: {survivor.get('cancer_type', 'unspecified')}.\n"
        f"Message: \"{message}\""
    )

    client   = Groq(api_key=os.environ["GROQ_API_KEY"])
    messages = [{"role": "system", "content": system}]
    for msg in history[-14:]:
        if msg.get("role") in ("user", "assistant") and msg.get("content"):
            messages.append({"role": msg["role"], "content": msg["content"]})
    messages.append({"role": "user", "content": f"{message}\n\n[STATE: {context}]"})

    resp = client.chat.completions.create(
        model=GROQ_MODEL, messages=messages, max_tokens=300
    )
    raw = resp.choices[0].message.content or ""

    if "CHECKIN_COMPLETE" in raw:
        scores = {"fatigue": 5, "pain": 3, "mood": 6, "new_symptoms": "none"}
        try:
            j = raw.find("{")
            k = raw.rfind("}") + 1
            if j >= 0:
                scores = json.loads(raw[j:k])
        except Exception:
            pass

        trajectory = _analyse_trajectory(phone, scores)
        protocol   = _generate_protocol(name, scores, survivor, lang)

        db.save_checkin({
            "survivor_phone":   phone,
            "week_number":      week,
            "fatigue_score":    scores.get("fatigue"),
            "pain_score":       scores.get("pain"),
            "mood_score":       scores.get("mood"),
            "new_symptoms":     str(scores.get("new_symptoms", "none")),
            "trajectory_alert": trajectory,
            "protocol_sent":    protocol,
        })

        reply = _build_reply(name, week, scores, trajectory, protocol, lang)
        return {"new_phase": "idle", "reply": reply, "complete": True}

    return {"new_phase": "survivorship", "reply": raw, "complete": False}


def _analyse_trajectory(phone: str, current: dict) -> str:
    history = db.get_checkin_history(phone, last_n=8)
    if len(history) < 3:
        return "STABLE"
    scores = [c.get("fatigue_score", 5) for c in history] + [current.get("fatigue", 5)]
    consecutive = 0
    for i in range(1, len(scores)):
        if scores[i] > scores[i - 1]:
            consecutive += 1
            if consecutive >= 3:
                return "ESCALATE"
        else:
            consecutive = 0
    return "STABLE"


def _generate_protocol(name: str, scores: dict, survivor: dict, lang: str) -> str:
    client = Groq(api_key=os.environ["GROQ_API_KEY"])
    system = (
        PROTOCOL_SYSTEM_HI if lang == "hi"
        else PROTOCOL_SYSTEM_SW if lang == "sw"
        else PROTOCOL_SYSTEM
    )
    context = (
        f"Name: {name}\n"
        f"Cancer type: {survivor.get('cancer_type', 'unspecified')}\n"
        f"Weeks since treatment: {survivor.get('checkin_week', 0)}\n"
        f"Fatigue: {scores.get('fatigue', 5)}/10\n"
        f"Pain: {scores.get('pain', 3)}/10\n"
        f"Mood: {scores.get('mood', 6)}/10\n"
        f"New symptoms: {scores.get('new_symptoms', 'none')}"
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


def _build_reply(name: str, week: int, scores: dict,
                 trajectory: str, protocol: str, lang: str) -> str:
    if lang == "sw":
        header  = f"Asante, {name}. Wiki {week} imekamilika. 💙\n\n"
        summary = (
            f"*Alama zako wiki hii:*\n"
            f"  Uchovu: {scores.get('fatigue', '?')}/10\n"
            f"  Maumivu: {scores.get('pain', '?')}/10\n"
            f"  Hisia: {scores.get('mood', '?')}/10\n\n"
        )
        alert = (
            "⚠️ *Uchovu wako unaongezeka kwa wiki kadhaa.*\n"
            "Wasiliana na kliniki yako haraka iwezekanavyo.\n\n"
        ) if trajectory == "ESCALATE" else ""
        protocol_header = "*Mpango wako wa kupona:*\n"

    elif lang == "hi":
        header  = f"धन्यवाद, {name}। सप्ताह {week} की जांच दर्ज की गई। 💙\n\n"
        summary = (
            f"*इस सप्ताह आपके स्कोर:*\n"
            f"  थकान: {scores.get('fatigue', '?')}/10\n"
            f"  दर्द: {scores.get('pain', '?')}/10\n"
            f"  मनोदशा: {scores.get('mood', '?')}/10\n\n"
        )
        alert = (
            "⚠️ *कई हफ्तों से आपकी थकान बढ़ रही है।*\n"
            "कृपया जल्द से जल्द अपने clinic या CHW से संपर्क करें।\n\n"
        ) if trajectory == "ESCALATE" else ""
        protocol_header = "*आपका साप्ताहिक उपचार प्रोटोकॉल:*\n"

    else:
        header  = f"Thank you, {name}. Week {week} check-in recorded. 💙\n\n"
        summary = (
            f"*Your scores this week:*\n"
            f"  Fatigue: {scores.get('fatigue', '?')}/10\n"
            f"  Pain: {scores.get('pain', '?')}/10\n"
            f"  Mood: {scores.get('mood', '?')}/10\n\n"
        )
        alert = (
            "⚠️ *Your fatigue has been increasing for several weeks.*\n"
            "Please contact your clinic or CHW as soon as possible.\n\n"
        ) if trajectory == "ESCALATE" else ""
        protocol_header = "*Your recovery protocol:*\n"

    return header + summary + alert + protocol_header + protocol
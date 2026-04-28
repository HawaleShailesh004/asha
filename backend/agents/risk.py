"""
ASHA - Agent 3: Risk Stratification
Calls ML models on collected patient data.
Returns risk tier, probability score, and top risk factors.
Saves patient record to Supabase.
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import services.supabase_service as db

# Lazy imports - models loaded at FastAPI startup via app.state
def compute_risk(patient_data: dict, chw_phone: str, app_state) -> dict:
    """
    Run risk models on collected screening data.

    Args:
        patient_data : dict collected by Screening Agent
        chw_phone    : CHW's WhatsApp number (for patient record)
        app_state    : FastAPI app.state (holds loaded models)

    Returns:
        {
            "risk_tier":         "HIGH" | "ELEVATED" | "LOW",
            "cervical_result":   dict | None,
            "oral_result":       dict | None,
            "overall_summary":   str,
            "patient_id":        str,
        }
    """
    cervical_result = None
    oral_result     = None

    # ── Cervical cancer risk ──────────────────────────────────────────────────
    screening_type = patient_data.get("screening_type", "cervical")

    if screening_type in ("cervical", "both"):
        from ml.train_cervical import predict_cervical_risk
        model, features, threshold = app_state.cervical_model
        cervical_result = predict_cervical_risk(
            _map_to_cervical_features(patient_data),
            model, features, threshold
        )
        # ── Clinical override layer ───────────────────────────────────────────
        # The UCI model does not include postcoital_bleeding as a feature.
        # Apply evidence-based overrides for symptoms the model cannot score.
        cervical_result = _apply_clinical_overrides(cervical_result, patient_data)

    # ── Oral cancer risk ──────────────────────────────────────────────────────
    if screening_type in ("oral", "both") or _has_oral_symptoms(patient_data):
        from ml.train_oral import score_oral_cancer_risk, result_to_dict
        oral_result_obj = score_oral_cancer_risk(_map_to_oral_features(patient_data))
        oral_result     = result_to_dict(oral_result_obj)

    # ── Overall risk tier - take worst of both ────────────────────────────────
    tier_rank = {"HIGH": 3, "ELEVATED": 2, "LOW": 1}
    tiers = []
    if cervical_result:
        tiers.append(cervical_result["tier"])
    if oral_result:
        tiers.append(oral_result["tier"])

    overall_tier = max(tiers, key=lambda t: tier_rank.get(t, 0)) if tiers else "LOW"

    # ── Combine top risk factors ──────────────────────────────────────────────
    top_factors = []
    if cervical_result:
        top_factors.extend(cervical_result.get("top_risk_factors", []))
    if oral_result:
        top_factors.extend(oral_result.get("top_risk_factors", []))
    top_factors = list(dict.fromkeys(top_factors))[:4]   # deduplicate, keep top 4

    # ── Save patient to Supabase ──────────────────────────────────────────────
    patient_record = {
        "chw_phone":           chw_phone,
        "age":                 patient_data.get("age"),
        "gender":              patient_data.get("gender", "Female"),
        "screening_type":      screening_type,
        "cervical_probability": cervical_result["probability"] if cervical_result else None,
        "cervical_tier":       cervical_result["tier"] if cervical_result else None,
        "oral_score":          oral_result["score"] if oral_result else None,
        "oral_tier":           oral_result["tier"] if oral_result else None,
        "risk_tier":           overall_tier,
        "top_risk_factors":    top_factors,
        "raw_screening_data":  patient_data,
    }
    patient_id = db.save_patient(patient_record)

    # ── Summary message for CHW ───────────────────────────────────────────────
    summary = _build_summary(overall_tier, cervical_result, oral_result, top_factors)

    return {
        "risk_tier":       overall_tier,
        "cervical_result": cervical_result,
        "oral_result":     oral_result,
        "top_factors":     top_factors,
        "overall_summary": summary,
        "patient_id":      patient_id,
    }


def _apply_clinical_overrides(result: dict, data: dict) -> dict:
    """
    Apply evidence-based clinical overrides on top of the ML model output.

    The UCI training dataset does not include postcoital bleeding, abnormal
    discharge, or pelvic pain - all strong clinical indicators of cervical
    pathology. These overrides apply WHO VIA screening criteria directly.

    This is documented in ARCHITECTURE.md as the Clinical Override Layer.
    """
    prob = result["probability"]
    tier = result["tier"]
    factors = result.get("top_risk_factors", [])

    # Postcoital bleeding - WHO Grade A indicator, immediate referral criterion
    if data.get("postcoital_bleeding"):
        prob  = max(prob, 0.72)
        tier  = "HIGH" if prob >= 0.65 else "ELEVATED"
        if "Postcoital bleeding (WHO Grade A indicator)" not in factors:
            factors = ["Postcoital bleeding (WHO Grade A indicator)"] + factors

    # Age > 40 with any bleeding - elevated risk
    if data.get("age", 0) > 40 and data.get("postcoital_bleeding"):
        prob = max(prob, 0.78)
        tier = "HIGH"

    # Smokes + postcoital bleeding - compounding risk
    if data.get("smokes") and data.get("postcoital_bleeding"):
        prob = max(prob, 0.75)
        tier = "HIGH"

    # High parity (≥5) alone is ELEVATED minimum per WHO
    if data.get("num_pregnancies", 0) >= 5 and tier == "LOW":
        prob = max(prob, 0.40)
        tier = "ELEVATED"

    # STD history + any other risk factor → ELEVATED minimum
    if data.get("stds_history") and (data.get("smokes") or data.get("postcoital_bleeding")):
        prob = max(prob, 0.45)
        tier = "ELEVATED" if tier == "LOW" else tier

    result["probability"] = round(prob, 3)
    result["tier"]        = tier
    result["top_risk_factors"] = factors[:4]

    # Update action based on new tier
    if tier == "HIGH":
        result["action"] = "Refer immediately to nearest cervical cancer screening clinic"
    elif tier == "ELEVATED":
        result["action"] = "Schedule follow-up screening within 2 weeks"

    return result


def _has_oral_symptoms(data: dict) -> bool:
    """Trigger oral screening if any oral symptom was reported during cervical screening."""
    return any(data.get(k) for k in (
        "oral_lesions", "white_red_patches",
        "unexplained_bleeding_mouth", "difficulty_swallowing",
        "tobacco_use", "betel_quid_use",
    ))


def _map_to_cervical_features(data: dict) -> dict:
    """Map patient_data keys to UCI feature names expected by the cervical model."""
    return {
        "Age":                              data.get("age", 30),
        "Number of sexual partners":        data.get("num_sexual_partners", 1),
        "First sexual intercourse":         data.get("first_intercourse_age", 20),
        "Num of pregnancies":               data.get("num_pregnancies", 0),
        "Smokes":                           int(data.get("smokes", False)),
        "Smokes (years)":                   data.get("smokes_years", 0),
        "Smokes (packs/year)":              data.get("smokes_packs", 0),
        "Hormonal Contraceptives":          int(data.get("hormonal_contraceptives", False)),
        "Hormonal Contraceptives (years)":  data.get("hc_years", 0),
        "IUD":                              int(data.get("iud", False)),
        "IUD (years)":                      data.get("iud_years", 0),
        "STDs":                             int(data.get("stds_history", False)),
    }


def _map_to_oral_features(data: dict) -> dict:
    """Map patient_data keys to oral scoring engine field names."""
    return {
        "Age":                              data.get("age", 30),
        "Gender":                           data.get("gender", "Female"),
        "Tobacco Use":                      data.get("tobacco_use", False),
        "Alcohol Consumption":              data.get("alcohol_consumption", False),
        "Betel Quid Use":                   data.get("betel_quid_use", False),
        "Poor Oral Hygiene":                data.get("poor_oral_hygiene", False),
        "Diet (Fruits & Vegetables Intake)":data.get("diet_quality", "Moderate"),
        "Family History of Cancer":         data.get("family_history_cancer", False),
        "Compromised Immune System":        data.get("compromised_immune", False),
        "Oral Lesions":                     data.get("oral_lesions", False),
        "Unexplained Bleeding":             data.get("unexplained_bleeding_mouth", False),
        "Difficulty Swallowing":            data.get("difficulty_swallowing", False),
        "White or Red Patches in Mouth":    data.get("white_red_patches", False),
        "Chronic Sun Exposure":             data.get("chronic_sun_exposure", False),
    }


def _build_summary(tier: str, cervical: dict, oral: dict, factors: list) -> str:
    """Build a clear, short WhatsApp summary message for the CHW."""
    emoji = {"HIGH": "🔴", "ELEVATED": "🟡", "LOW": "🟢"}.get(tier, "⚪")

    lines = [f"{emoji} *ASHA Risk Assessment*", f"Risk Level: *{tier}*", ""]

    if cervical:
        lines.append(f"Cervical Cancer Risk: {cervical['tier']} ({cervical['probability']:.0%})")
    if oral:
        lines.append(f"Oral Cancer Risk: {oral['tier']} (Score: {oral['score']}/30)")

    if factors:
        lines.append("\nKey risk factors:")
        for f in factors[:3]:
            lines.append(f"  • {f}")

    action_map = {
        "HIGH":     "\n⚠️ *Action required: Refer this patient to a clinic immediately.*\nGenerating referral letter...",
        "ELEVATED": "\n📋 *Action: Schedule follow-up within 2 weeks.*\nGenerating referral letter...",
        "LOW":      "\n✅ *No immediate action needed.* Recommend annual screening.",
    }
    lines.append(action_map.get(tier, ""))

    return "\n".join(lines)
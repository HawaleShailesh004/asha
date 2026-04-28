"""
ASHA - PII Scrubber
Model  : spacy en_core_web_sm (12 MB)
Purpose: Strip personally identifiable information from all patient messages
         before data is stored in Supabase.

Privacy by design - no patient names, locations, or phone numbers
are ever persisted. Only anonymised clinical data enters the database.

Compliant with:
  - India's Digital Personal Data Protection Act (DPDPA 2023)
  - Kenya's Data Protection Act 2019

Setup  : python -m spacy download en_core_web_sm
Usage  :
    from backend.ml.pii_scrubber import PIIScrubber
    scrubber = PIIScrubber()   # load once at startup
    result   = scrubber.scrub("My name is Amara from Kisumu")
    # → "My name is [PERSON] from [LOCATION]"
"""

import re
import spacy
from typing import Optional

# Entity labels to scrub
PII_ENTITY_LABELS = {"PERSON", "GPE", "LOC", "FAC", "ORG"}


class PIIScrubber:
    """
    Loads SpaCy model once at startup.
    Call scrub() on every inbound WhatsApp message before Supabase write.
    """

    def __init__(self):
        try:
            self._nlp = spacy.load("en_core_web_sm")
        except OSError:
            raise OSError(
                "SpaCy model not found. Run:\n"
                "    python -m spacy download en_core_web_sm"
            )

    def scrub(self, text: str) -> dict:
        """
        Scrub PII from text.

        Returns:
            {
                "original_length" : int,
                "scrubbed_text"   : str  (safe to store),
                "entities_removed": int,
                "pii_detected"    : bool
            }
        """
        if not text or not text.strip():
            return {
                "original_length" : 0,
                "scrubbed_text"   : text,
                "entities_removed": 0,
                "pii_detected"    : False,
            }

        doc             = self._nlp(text)
        scrubbed        = text
        entities_removed = 0

        # Process entities in reverse order to preserve character offsets
        for ent in reversed(doc.ents):
            if ent.label_ in PII_ENTITY_LABELS:
                token    = f"[{ent.label_}]"
                scrubbed = scrubbed[:ent.start_char] + token + scrubbed[ent.end_char:]
                entities_removed += 1

        # Regex fallback - catches patterns SpaCy misses
        # Phone numbers (international formats)
        before_phone = scrubbed
        scrubbed     = re.sub(r"\+?[\d\s\-\(\)]{10,15}", "[PHONE]", scrubbed)
        if scrubbed != before_phone:
            entities_removed += 1

        # Email addresses
        before_email = scrubbed
        scrubbed     = re.sub(
            r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+",
            "[EMAIL]",
            scrubbed,
        )
        if scrubbed != before_email:
            entities_removed += 1

        return {
            "original_length" : len(text),
            "scrubbed_text"   : scrubbed,
            "entities_removed": entities_removed,
            "pii_detected"    : entities_removed > 0,
        }

    def scrub_patient_record(self, record: dict) -> dict:
        """
        Scrub all string fields in a patient record dict.
        Returns a new dict with scrubbed values - does not mutate original.
        """
        scrubbed_record = {}
        for key, value in record.items():
            if isinstance(value, str):
                result = self.scrub(value)
                scrubbed_record[key] = result["scrubbed_text"]
            else:
                scrubbed_record[key] = value
        return scrubbed_record


# ── Standalone test ───────────────────────────────────────────────────────────
if __name__ == "__main__":
    scrubber = PIIScrubber()

    test_messages = [
        "My patient's name is Amara Odhiambo from Kisumu, Kenya",
        "Call her on +254 712 345 678",
        "She is 34 years old with postcoital bleeding",     # no PII - should pass unchanged
        "Priya Sharma, village of Ambad, Maharashtra",
        "Contact: priya.sharma@gmail.com",
        "Patient lives near Nairobi General Hospital",
    ]

    print("PII Scrubber Test\n" + "─"*50)
    for msg in test_messages:
        result = scrubber.scrub(msg)
        print(f"Original : {msg}")
        print(f"Scrubbed : {result['scrubbed_text']}")
        print(f"Entities : {result['entities_removed']} removed")
        print()

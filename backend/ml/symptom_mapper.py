"""
ASHA - Multilingual Symptom Mapper (v2)
Fix: Model is passed in at construction time - loaded once during FastAPI lifespan.
No lazy loading. No cold-start delay on first message.

Usage in main.py lifespan:
    from sentence_transformers import SentenceTransformer
    from ml.symptom_mapper import SymptomMapper
    model  = SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')
    app.state.symptom_mapper = SymptomMapper(model)

Usage at request time (near-zero latency - cosine similarity only):
    result = app.state.symptom_mapper.map("she bleeds after sex")
    # → {"clinical_term": "postcoital_bleeding", "confidence": 0.87, "accepted": True}
"""

import os
import json
import argparse
import numpy as np

BASE_DIR        = os.path.dirname(__file__)
EMBEDDINGS_PATH = os.path.join(BASE_DIR, "models", "symptom_embeddings.json")

SYMPTOM_PHRASINGS: dict[str, list[str]] = {

    "postcoital_bleeding": [
        "bleeding after sex", "bleeding after intercourse",
        "she bleeds after being with her husband",
        "blood after sleeping with husband",
        "bleeding when we are together",
        "blood comes after relations",
        "spotting after sex",
        "she bleeds sometimes after that",
        "damu baada ya tendo la ndoa",
        "anapata damu baada ya kuwa na mume wake",
        "kutoka damu baada ya kujamiiana",
        "sex ke baad khoon aata hai",
        "pati ke saath hone ke baad bleeding",
        "khoon aata hai baad mein",
        "after husband comes there is blood",
    ],

    "abnormal_vaginal_discharge": [
        "something coming out from down there",
        "discharge with bad smell",
        "funny smelling discharge",
        "liquid coming out of private parts",
        "watery discharge", "thick discharge",
        "yellowish discharge", "discharge with blood",
        "kutoka majimaji mdomoni wa uke",
        "harufu mbaya kutoka chini",
        "uchafu kutoka uke",
        "neeche se paani aata hai",
        "gandhi smell aayi hai neeche se",
        "safed paani bahut aata hai",
        "discharge ho raha hai bahut",
    ],

    "pelvic_pain": [
        "pain in the lower stomach",
        "pain down there", "heavy feeling inside",
        "pressure in the lower belly",
        "aching in the pelvic area",
        "constant pain in abdomen",
        "cramping all the time",
        "pain during sex",
        "maumivu chini ya tumbo",
        "maumivu ya uke", "tumbo la chini linaumia",
        "kihisi cha uzito ndani",
        "neeche pet mein dard",
        "kamar ke neeche dard bahut hai",
        "andar bahut dard hota hai",
        "feeling of heaviness down there",
    ],

    "oral_lesion": [
        "sore in the mouth that won't heal",
        "wound in mouth", "ulcer in mouth",
        "something growing in the mouth",
        "mouth sore for many weeks",
        "painful patch in mouth",
        "lump inside cheek",
        "bleeding from mouth sore",
        "vidonda mdomoni", "kidonda kinachoendelea mdomoni",
        "majeraha mdomoni hayaponi",
        "uvimbe mdomoni",
        "muh mein ghao hai", "muh ka zakhm thik nahi ho raha",
        "andar se muh mein dard",
        "mouth ke andar kuch hai",
    ],

    "white_patch_mouth": [
        "white patch in mouth", "white spot in mouth",
        "white coating on tongue",
        "red patch inside cheek",
        "white lining in mouth",
        "cannot scrape off white patch",
        "bright white area in mouth",
        "red and white patches",
        "doa jeupe mdomoni",
        "rangi nyeupe ndani ya mdomo",
        "matangazo mdomoni",
        "rangi nyekundu mdomoni",
        "muh mein safed daag",
        "muh ke andar safed patch hai",
        "muh ke andar laal daag",
        "tongue pe safed rang",
    ],

    "unexplained_bleeding_mouth": [
        "bleeding from the mouth",
        "blood in the mouth",
        "gums bleeding a lot",
        "blood when spitting",
        "mouth bleed without reason",
        "blood coming from tongue area",
        "bleeding when eating",
        "kutoka damu mdomoni",
        "damu wakati wa kula",
        "ufizi unavyotoka damu",
        "muh se khoon aata hai",
        "thook mein khoon hai",
        "khaate waqt muh se khoon",
        "muh mein blood hai",
        "gale se khoon",
    ],

    "difficulty_swallowing": [
        "hard to swallow", "pain when swallowing",
        "food getting stuck in throat",
        "difficulty eating solid food",
        "feels like something stuck",
        "swallowing is painful",
        "cannot swallow properly",
        "choking when eating",
        "kushindwa kumeza", "maumivu ya kumeza",
        "chakula kinakwama kooni",
        "ugumu wa kumeza",
        "nigalna mushkil hai",
        "khaana nigalne mein dard",
        "gala mein kuch atak raha hai",
        "solid khaana nahi ja raha",
    ],

    "tobacco_use": [
        "she smokes", "he smokes cigarettes",
        "uses tobacco", "chews tobacco",
        "smokes bidi", "uses gutka",
        "chews pan masala", "uses betel nut",
        "smokes shisha", "takes snuff",
        "anavuta sigara", "anatumia tumbaku",
        "anapiga koko", "anavuta bangi",
        "sigaret peeti hai", "tambaaku khaati hai",
        "gutka use karti hai", "bidi peeta hai",
        "pan masala khaata hai", "tobacco chbaata hai",
    ],
}


class SymptomMapper:
    """
    Pre-computed embeddings loaded at __init__.
    SentenceTransformer model passed in - loaded once at FastAPI startup.
    At request time: only cosine similarity on numpy arrays (< 5ms).
    """

    CONFIDENCE_THRESHOLD = 0.60

    def __init__(self, model=None):
        """
        Args:
            model: pre-loaded SentenceTransformer instance.
                   If None, will lazy-load (dev mode only).
        """
        if not os.path.exists(EMBEDDINGS_PATH):
            raise FileNotFoundError(
                f"Embeddings not found at {EMBEDDINGS_PATH}. "
                "Run: python backend/ml/symptom_mapper.py --build"
            )
        with open(EMBEDDINGS_PATH, "r") as f:
            data = json.load(f)

        self._embeddings: dict[str, np.ndarray] = {
            term: np.array(embs) for term, embs in data.items()
        }
        self._model = model  # None = lazy load on first map() call

    def map(self, text: str) -> dict:
        """Map free-text to clinical term. Near-zero latency at request time."""
        if self._model is None:
            from sentence_transformers import SentenceTransformer
            self._model = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")

        input_emb = self._model.encode([text.lower().strip()])[0]
        input_emb = input_emb / (np.linalg.norm(input_emb) + 1e-8)

        best_term  = None
        best_score = 0.0

        for term, emb_matrix in self._embeddings.items():
            norms  = np.linalg.norm(emb_matrix, axis=1, keepdims=True) + 1e-8
            normed = emb_matrix / norms
            scores = normed @ input_emb
            top    = float(scores.max())
            if top > best_score:
                best_score = top
                best_term  = term

        accepted = best_score >= self.CONFIDENCE_THRESHOLD

        return {
            "input"        : text,
            "clinical_term": best_term if accepted else None,
            "confidence"   : round(best_score, 3),
            "accepted"     : accepted,
        }

    def map_conversation(self, messages: list[str]) -> dict[str, bool]:
        detected = {}
        for msg in messages:
            result = self.map(msg)
            if result["accepted"] and result["clinical_term"]:
                detected[result["clinical_term"]] = True
        return detected


def build_embeddings() -> None:
    """Run once offline to pre-compute and save all embeddings."""
    print("Loading MiniLM model (118 MB)...")
    from sentence_transformers import SentenceTransformer
    model = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")

    print("Computing embeddings...")
    os.makedirs(os.path.dirname(EMBEDDINGS_PATH), exist_ok=True)
    embeddings_data = {}

    for term, phrasings in SYMPTOM_PHRASINGS.items():
        embs = model.encode(phrasings)
        embeddings_data[term] = embs.tolist()
        print(f"  ✓ {term:35s} ({len(phrasings)} phrasings)")

    with open(EMBEDDINGS_PATH, "w") as f:
        json.dump(embeddings_data, f)

    print(f"\nEmbeddings saved → {EMBEDDINGS_PATH}")

    mapper = SymptomMapper(model)
    test_cases = [
        ("she bleeds after being with her husband", "postcoital_bleeding"),
        ("vidonda mdomoni",                          "oral_lesion"),
        ("muh mein safed daag",                      "white_patch_mouth"),
        ("anavuta sigara",                           "tobacco_use"),
        ("food getting stuck in throat",             "difficulty_swallowing"),
    ]
    print("\nQuick test:")
    for text, expected in test_cases:
        r = mapper.map(text)
        status = "✓" if r["clinical_term"] == expected else "✗"
        print(f"  {status} '{text}' → {r['clinical_term']} ({r['confidence']})")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--build", action="store_true")
    parser.add_argument("--test",  type=str)
    args = parser.parse_args()

    if args.build:
        build_embeddings()
    elif args.test:
        mapper = SymptomMapper()
        r = mapper.map(args.test)
        print(f"Input:      {r['input']}")
        print(f"Mapped to:  {r['clinical_term']}")
        print(f"Confidence: {r['confidence']}")
    else:
        print("Usage: --build | --test 'phrase'")
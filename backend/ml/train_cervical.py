"""
ASHA - Cervical Cancer Risk Model (v2 Fixed)

Fix for v1 issues:
  - Model predicted all-zero (zero recall on cancer cases)
  - Root cause: scale_pos_weight not set, model biased toward majority class
  - Fix: scale_pos_weight ~14.6 + threshold optimisation for recall >= 0.60
  - Medical screening: false negatives far worse than false positives

Run: python ml/train_cervical.py
"""

import os
import numpy as np
import pandas as pd
import joblib
from ucimlrepo import fetch_ucirepo
from xgboost import XGBClassifier
from sklearn.calibration import CalibratedClassifierCV
from sklearn.model_selection import train_test_split, StratifiedKFold, cross_val_score
from sklearn.metrics import (
    roc_auc_score, classification_report,
    confusion_matrix, precision_recall_curve
)
from imblearn.over_sampling import SMOTE

MODELS_DIR     = os.path.join(os.path.dirname(__file__), "models")
os.makedirs(MODELS_DIR, exist_ok=True)
MODEL_PATH     = os.path.join(MODELS_DIR, "asha_cervical_model.pkl")
FEATURE_PATH   = os.path.join(MODELS_DIR, "cervical_feature_names.pkl")
THRESHOLD_PATH = os.path.join(MODELS_DIR, "cervical_threshold.pkl")

CHW_FEATURES = [
    "Age", "Number of sexual partners", "First sexual intercourse",
    "Num of pregnancies", "Smokes", "Smokes (years)", "Smokes (packs/year)",
    "Hormonal Contraceptives", "Hormonal Contraceptives (years)",
    "IUD", "IUD (years)", "STDs",
]
TARGET = "Biopsy"


def load_data():
    print("Fetching UCI Cervical Cancer dataset...")
    repo = fetch_ucirepo(id=383)
    X_full = repo.data.features
    y_full = repo.data.targets

    if X_full is None:
        raise ValueError("UCI loader returned no feature table.")

    df = X_full.copy()
    if y_full is not None and TARGET in y_full.columns:
        df[TARGET] = y_full[TARGET].values
    elif TARGET in df.columns:
        pass
    else:
        target_columns = list(y_full.columns) if y_full is not None else []
        raise ValueError(
            f"Could not locate target column '{TARGET}'. "
            f"Available target columns: {target_columns}"
        )
    df     = df.replace("?", np.nan).astype(float, errors="ignore")
    df     = df[CHW_FEATURES + [TARGET]].dropna(subset=[TARGET])
    for col in CHW_FEATURES:
        df[col] = df[col].fillna(df[col].median())
    X = df[CHW_FEATURES].astype(float)
    y = df[TARGET].astype(int)
    print(f"Positives: {y.sum()} ({y.mean()*100:.1f}%)  Negatives: {(y==0).sum()}")
    return X, y


def find_best_threshold(model, X_val, y_val):
    """Threshold that maximises F1 subject to recall >= 0.60."""
    probs = model.predict_proba(X_val)[:, 1]
    precisions, recalls, thresholds = precision_recall_curve(y_val, probs)
    best_f1, best_t = 0, 0.35
    for p, r, t in zip(precisions, recalls, thresholds):
        if r < 0.60:
            continue
        f1 = 2 * p * r / (p + r + 1e-8)
        if f1 > best_f1:
            best_f1, best_t = f1, t
    print(f"Best threshold: {best_t:.3f}  F1: {best_f1:.3f}")
    return best_t


def train(X, y):
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    X_tr, X_val, y_tr, y_val = train_test_split(
        X_train, y_train, test_size=0.2, random_state=42, stratify=y_train
    )

    n_pos = max(y_tr.sum(), 1)
    n_neg = (y_tr == 0).sum()
    pos_weight = n_neg / n_pos
    print(f"scale_pos_weight: {pos_weight:.1f}")

    smote        = SMOTE(random_state=42, k_neighbors=min(5, n_pos - 1))
    X_res, y_res = smote.fit_resample(X_tr, y_tr)

    base = XGBClassifier(
        n_estimators       = 300,
        max_depth          = 3,
        learning_rate      = 0.05,
        subsample          = 0.8,
        colsample_bytree   = 0.8,
        scale_pos_weight   = pos_weight,  # KEY FIX
        min_child_weight   = 1,
        random_state       = 42,
        eval_metric        = "aucpr",
        verbosity          = 0,
    )
    model = CalibratedClassifierCV(base, method="isotonic", cv=5)
    model.fit(X_res, y_res)

    threshold = find_best_threshold(model, X_val, y_val)

    y_prob = model.predict_proba(X_test)[:, 1]
    y_pred = (y_prob >= threshold).astype(int)
    auc    = roc_auc_score(y_test, y_prob)

    print(f"\n{'-'*55}")
    print(f"Test AUC-ROC   : {auc:.3f}")
    print(f"Threshold used : {threshold:.3f}")
    print(f"\n{classification_report(y_test, y_pred)}")
    cm = confusion_matrix(y_test, y_pred)
    print(f"Confusion Matrix:\n{cm}")

    # Unpack safely for binary case
    if cm.shape == (2, 2):
        tn, fp, fn, tp = cm.ravel()
        print(f"\nSensitivity : {tp/(tp+fn+1e-8):.3f}  (catching real cases)")
        print(f"Specificity : {tn/(tn+fp+1e-8):.3f}  (avoiding false alarms)")

    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    cv_scores = cross_val_score(
        CalibratedClassifierCV(
            XGBClassifier(n_estimators=300, max_depth=3,
                          scale_pos_weight=pos_weight,
                          random_state=42, verbosity=0),
            method="isotonic", cv=3,
        ),
        X, y, cv=cv, scoring="roc_auc",
    )
    print(f"\n5-fold CV AUC : {cv_scores.mean():.3f} ± {cv_scores.std():.3f}")
    print(f"{'-'*55}")

    joblib.dump(model,           MODEL_PATH)
    joblib.dump(list(X.columns), FEATURE_PATH)
    joblib.dump(threshold,       THRESHOLD_PATH)
    print(f"\nSaved model, features, threshold → {MODELS_DIR}")


def load_model():
    return (joblib.load(MODEL_PATH),
            joblib.load(FEATURE_PATH),
            joblib.load(THRESHOLD_PATH))


def predict_cervical_risk(patient_data: dict, model, features: list,
                           threshold: float = 0.35) -> dict:
    row  = {f: patient_data.get(f, 0) for f in features}
    X    = pd.DataFrame([row])[features].astype(float)
    prob = float(model.predict_proba(X)[0][1])

    # Screening-first cutoffs: prioritize sensitivity for triage.
    if prob >= 0.50:
        tier, action = "HIGH", "Refer immediately to nearest cervical cancer screening clinic"
    elif prob >= 0.20:
        tier, action = "ELEVATED", "Schedule follow-up screening within 2 weeks"
    else:
        tier, action = "LOW", "Recommend standard annual cervical cancer screening"

    factors = []
    if patient_data.get("Smokes", 0):
        yrs = patient_data.get("Smokes (years)", 0)
        factors.append(f"Tobacco use ({int(yrs)} years)" if yrs else "Tobacco use")
    if patient_data.get("STDs", 0):
        factors.append("History of STI")
    if patient_data.get("First sexual intercourse", 25) < 18:
        factors.append("Early first sexual intercourse (age < 18)")
    if patient_data.get("Num of pregnancies", 0) >= 5:
        factors.append("High parity (≥5 pregnancies)")
    if patient_data.get("Hormonal Contraceptives (years)", 0) >= 5:
        factors.append("Long-term hormonal contraceptive use")

    return {
        "probability"     : round(prob, 3),
        "tier"            : tier,
        "action"          : action,
        "top_risk_factors": factors[:3],
        "model_citation"  : (
            "XGBoost + isotonic calibration. UCI Cervical Cancer Risk Factors "
            "dataset (n=858). CHW-observable features only. Threshold optimised "
            "for sensitivity ≥ 0.60 in screening context."
        ),
    }


if __name__ == "__main__":
    X, y = load_data()
    train(X, y)
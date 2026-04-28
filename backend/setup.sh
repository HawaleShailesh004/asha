#!/bin/bash
# ASHA - Local Dev Setup
# Run this once after cloning the repo.
# Usage: bash setup.sh

set -e  # exit on first error

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║          ASHA - Setup Script             ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── Python environment ────────────────────────────────────────────────────────
echo "→ Creating virtual environment..."
python -m venv venv
source venv/bin/activate 2>/dev/null || . venv/Scripts/activate  # Windows compat

echo "→ Installing Python dependencies..."
pip install --upgrade pip -q
pip install -r requirements.txt -q

# ── SpaCy model ───────────────────────────────────────────────────────────────
echo "→ Downloading SpaCy en_core_web_sm (12 MB)..."
python -m spacy download en_core_web_sm -q

# ── Environment file ──────────────────────────────────────────────────────────
if [ ! -f .env ]; then
    echo "→ Creating .env from template..."
    cp .env.example .env
    echo ""
    echo "  ⚠  Fill in your .env file before running the app:"
    echo "     ANTHROPIC_API_KEY=your_key"
    echo "     SUPABASE_URL=your_url"
    echo "     SUPABASE_SERVICE_KEY=your_key"
    echo "     TWILIO_ACCOUNT_SID=your_sid"
    echo "     TWILIO_AUTH_TOKEN=your_token"
    echo "     TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886"
    echo ""
fi

# ── ML models directory ───────────────────────────────────────────────────────
mkdir -p backend/ml/models
mkdir -p backend/ml/data

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║         Next Steps                       ║"
echo "╠══════════════════════════════════════════╣"
echo "║  1. Fill in .env with your API keys      ║"
echo "║                                          ║"
echo "║  2. Train cervical model:                ║"
echo "║     python backend/ml/train_cervical.py  ║"
echo "║                                          ║"
echo "║  3. Download oral cancer dataset from:   ║"
echo "║     kaggle.com/datasets/ankushpanday2/   ║"
echo "║     oral-cancer-prediction-dataset       ║"
echo "║     → save to backend/ml/data/           ║"
echo "║     → rename to oral_cancer_dataset.csv  ║"
echo "║     Then run:                            ║"
echo "║     python backend/ml/train_oral.py      ║"
echo "║                                          ║"
echo "║  4. Build symptom embeddings:            ║"
echo "║     python backend/ml/symptom_mapper.py  ║"
echo "║             --build                      ║"
echo "║                                          ║"
echo "║  5. Test PII scrubber:                   ║"
echo "║     python backend/ml/pii_scrubber.py    ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "Setup complete ✓"

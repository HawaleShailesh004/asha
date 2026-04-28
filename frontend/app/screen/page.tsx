"use client";

/**
 * ASHA Mobile Screening Interface
 *
 * Designed for community health workers in rural areas.
 * No typing required. Every question is a tap.
 * Works on 5-year-old Android phones with small screens.
 * Touch targets minimum 44px per WCAG guidelines.
 *
 * Flow:
 * 1. Select screening type (Cervical / Oral)
 * 2. Full-screen card per question - tap YES/NO or a value
 * 3. Animated risk reveal (RED/AMBER/GREEN full screen)
 * 4. View referral letter + download PDF
 */

import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CircleDot,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  ClipboardList,
  ScanLine,
  HeartPulse,
  Download,
} from "lucide-react";
import AppLogo from "@/components/AppLogo";

// ── Types ─────────────────────────────────────────────────────────────────────
type AnswerType = "yesno" | "number" | "scale" | "choice";
type RiskTier = "HIGH" | "ELEVATED" | "LOW";

interface Question {
  id: string;
  text: string;
  subtext?: string;
  type: AnswerType;
  options?: string[];
  min?: number;
  max?: number;
  field: string;
  positiveLabel?: string; // shown as factor when value === true
}

interface Answer {
  field: string;
  value: string | number | boolean;
  label: string; // human-readable for summary
}

// ── Question banks ────────────────────────────────────────────────────────────
const CERVICAL_QUESTIONS: Question[] = [
  {
    id: "age",
    field: "age",
    text: "How old is the patient?",
    subtext: "Enter her age in years",
    type: "number",
    min: 15,
    max: 80,
  },
  {
    id: "pregnancies",
    field: "num_pregnancies",
    text: "How many times has she been pregnant?",
    subtext: "Include all pregnancies",
    type: "number",
    min: 0,
    max: 20,
  },
  {
    id: "smokes",
    field: "smokes",
    text: "Does she smoke or use any tobacco?",
    subtext: "Cigarettes, bidi, gutka, snuff, chewing tobacco",
    type: "yesno",
    positiveLabel: "Tobacco use",
  },
  {
    id: "iud",
    field: "iud",
    text: "Does she have an IUD or coil?",
    subtext: "An intrauterine device inserted by a nurse or doctor",
    type: "yesno",
    positiveLabel: "IUD use",
  },
  {
    id: "contraceptives",
    field: "hormonal_contraceptives",
    text: "Does she use birth control pills?",
    subtext: "Or any hormonal contraception",
    type: "yesno",
    positiveLabel: "Hormonal contraceptives",
  },
  {
    id: "stds",
    field: "stds_history",
    text: "Has she ever been treated for a sexual infection?",
    subtext: "Any sexually transmitted infection in the past",
    type: "yesno",
    positiveLabel: "STD history",
  },
  {
    id: "bleeding",
    field: "postcoital_bleeding",
    text: "Does she bleed after having sex?",
    subtext: "Or any unusual bleeding not related to her period",
    type: "yesno",
    positiveLabel: "Postcoital bleeding (WHO Grade A indicator)",
  },
];

const ORAL_QUESTIONS: Question[] = [
  {
    id: "age",
    field: "age",
    text: "How old is the patient?",
    subtext: "Enter their age in years",
    type: "number",
    min: 15,
    max: 90,
  },
  {
    id: "tobacco",
    field: "tobacco_use",
    text: "Does the patient use any tobacco?",
    subtext: "Cigarettes, bidi, gutka, chewing tobacco, snuff",
    type: "yesno",
    positiveLabel: "Tobacco use",
  },
  {
    id: "betel",
    field: "betel_quid_use",
    text: "Does the patient chew betel nut or pan?",
    subtext: "Areca nut, pan masala, betel quid",
    type: "yesno",
    positiveLabel: "Betel quid / areca nut use (primary carcinogen)",
  },
  {
    id: "lesions",
    field: "oral_lesions",
    text: "Can you see sores in their mouth?",
    subtext: "Any wound or ulcer that has not healed in over 2 weeks",
    type: "yesno",
    positiveLabel: "Non-healing oral lesion (>2 weeks)",
  },
  {
    id: "patches",
    field: "white_red_patches",
    text: "Are there white or red patches?",
    subtext: "Inside the mouth, cheeks, or on the tongue",
    type: "yesno",
    positiveLabel: "White or red patches (leukoplakia/erythroplakia)",
  },
  {
    id: "swallowing",
    field: "difficulty_swallowing",
    text: "Does the patient have difficulty swallowing?",
    subtext: "Pain or difficulty when eating or drinking",
    type: "yesno",
    positiveLabel: "Difficulty swallowing (dysphagia)",
  },
  {
    id: "hygiene",
    field: "poor_oral_hygiene",
    text: "Does the patient have poor oral hygiene?",
    subtext: "Missing teeth, rarely brushes, or unhealthy gums",
    type: "yesno",
    positiveLabel: "Poor oral hygiene",
  },
];

// ── Constants ─────────────────────────────────────────────────────────────────
const AGE_OPTIONS = [
  "15",
  "20",
  "25",
  "30",
  "35",
  "40",
  "45",
  "50",
  "55",
  "60",
  "65",
  "70",
  "75",
];
const PREG_OPTIONS = ["0", "1", "2", "3", "4", "5", "6", "7", "8+"];
const RISK_CONFIG: Record<
  RiskTier,
  {
    color: string;
    bg: string;
    icon: ReactNode;
    headline: string;
    action: string;
  }
> = {
  HIGH: {
    color: "#dc2626",
    bg: "#fef2f2",
    icon: <AlertTriangle size={42} />,
    headline: "High Risk",
    action: "Refer this patient to a clinic immediately.",
  },
  ELEVATED: {
    color: "#d97706",
    bg: "#fffbeb",
    icon: <CircleDot size={42} />,
    headline: "Elevated Risk",
    action: "Schedule a follow-up visit within 2 weeks.",
  },
  LOW: {
    color: "#16a34a",
    bg: "#f0fdf4",
    icon: <CheckCircle2 size={42} />,
    headline: "Low Risk",
    action: "Recommend annual screening. Advise on risk factors.",
  },
};

// ── Risk calculation (client-side estimate) ───────────────────────────────────
// This is a simplified front-end estimate only.
// The authoritative score comes from the FastAPI backend.
// Used only to show the animated result screen immediately.
function estimateRisk(answers: Answer[], type: "cervical" | "oral"): RiskTier {
  const get = (field: string) => answers.find((a) => a.field === field)?.value;

  if (type === "cervical") {
    // Clinical override: postcoital bleeding alone → HIGH
    if (get("postcoital_bleeding") === true) return "HIGH";

    let score = 0;
    if (get("smokes") === true) score += 2;
    if (get("stds_history") === true) score += 2;
    if (get("hormonal_contraceptives") === true) score += 1;
    if (get("iud") === true) score += 1;
    const age = Number(get("age") || 0);
    if (age >= 40) score += 2;
    if (age >= 50) score += 1;
    const preg = Number(get("num_pregnancies") || 0);
    if (preg >= 4) score += 1;

    if (score >= 5) return "HIGH";
    if (score >= 3) return "ELEVATED";
    return "LOW";
  }

  // Oral
  let score = 0;
  if (get("tobacco_use") === true) score += 4;
  if (get("betel_quid_use") === true) score += 5;
  if (get("oral_lesions") === true) score += 7;
  if (get("white_red_patches") === true) score += 8;
  if (get("difficulty_swallowing") === true) score += 4;
  if (get("poor_oral_hygiene") === true) score += 2;

  if (score >= 16) return "HIGH";
  if (score >= 8) return "ELEVATED";
  return "LOW";
}

// ── Screen: type selector ─────────────────────────────────────────────────────
function TypeSelector({
  onSelect,
}: {
  onSelect: (t: "cervical" | "oral") => void;
}) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f4f7f6",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        gap: 0,
      }}
    >
      {/* Logo */}
      <div style={{ marginBottom: 48, textAlign: "center" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginBottom: 16,
          }}
        >
          <AppLogo theme="light" />
        </div>
        <p
          style={{
            fontSize: 22,
            fontWeight: 600,
            color: "#102a25",
            letterSpacing: "-0.02em",
          }}
        >
          ASHA Screening
        </p>
        <p style={{ fontSize: 13, color: "#5f6f6c", marginTop: 4 }}>
          Select the type of screening
        </p>
      </div>

      {/* Options */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 14,
          width: "100%",
          maxWidth: 360,
        }}
      >
        {[
          {
            type: "cervical" as const,
            title: "Cervical Cancer",
            sub: "7 questions · 3 minutes",
            color: "#8b2323",
            border: "rgba(139,35,35,0.22)",
            bg: "#fff",
          },
          {
            type: "oral" as const,
            title: "Oral Cancer",
            sub: "7 questions · 3 minutes",
            color: "#7c4f11",
            border: "rgba(124,79,17,0.22)",
            bg: "#fff",
          },
        ].map((opt) => (
          <button
            key={opt.type}
            onClick={() => onSelect(opt.type)}
            style={{
              padding: "20px 24px",
              background: opt.bg,
              border: `1px solid ${opt.border}`,
              borderRadius: 16,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 16,
              transition:
                "transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease",
              boxShadow: "0 4px 14px rgba(16,42,37,0.08)",
              width: "100%",
              textAlign: "left",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow =
                "0 8px 20px rgba(16,42,37,0.12)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow =
                "0 4px 14px rgba(16,42,37,0.08)";
            }}
          >
            <span style={{ fontSize: 28, flexShrink: 0, color: opt.color }}>
              {opt.type === "cervical" ? (
                <HeartPulse size={26} />
              ) : (
                <ScanLine size={26} />
              )}
            </span>
            <div>
              <p
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  color: opt.color,
                  marginBottom: 3,
                }}
              >
                {opt.title}
              </p>
              <p style={{ fontSize: 12, color: "#5f6f6c" }}>{opt.sub}</p>
            </div>
            <span
              style={{ marginLeft: "auto", color: opt.color, fontSize: 18 }}
            >
              <ArrowRight size={16} />
            </span>
          </button>
        ))}
      </div>

      <p
        style={{
          marginTop: 40,
          fontSize: 11,
          color: "#768582",
          textAlign: "center",
        }}
      >
        WHO Protocol Aligned · No typing required · Works offline
      </p>
    </div>
  );
}

// ── Screen: question card ─────────────────────────────────────────────────────
function QuestionCard({
  question,
  questionIndex,
  total,
  onAnswer,
  previousAnswer,
  onBack,
  canGoBack,
}: {
  question: Question;
  questionIndex: number;
  total: number;
  onAnswer: (value: string | number | boolean, label: string) => void;
  previousAnswer: Answer | undefined;
  onBack?: () => void;
  canGoBack?: boolean;
}) {
  const [numInput, setNumInput] = useState<string>(
    previousAnswer ? String(previousAnswer.value) : "",
  );
  const progress = (questionIndex / total) * 100;

  const options =
    question.type === "number" && question.field === "age"
      ? AGE_OPTIONS
      : question.type === "number" && question.field === "num_pregnancies"
        ? PREG_OPTIONS
        : null;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f4f7f6",
        display: "flex",
        flexDirection: "column",
        animation: "fadeInScreen 220ms ease",
      }}
    >
      {/* Progress bar */}
      <div
        style={{ height: 4, background: "rgba(16,42,37,0.09)", flexShrink: 0 }}
      >
        <div
          style={{
            height: 4,
            background: "#166534",
            width: `${progress}%`,
            transition: "width 0.4s ease",
          }}
        />
      </div>

      {/* Header */}
      <div
        style={{
          padding: "16px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
          borderBottom: "1px solid rgba(16,42,37,0.09)",
          background: "#ffffff",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {canGoBack && onBack && (
            <button
              onClick={onBack}
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                background: "#ffffff",
                border: "1px solid rgba(16,42,37,0.14)",
                color: "#37504b",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ArrowLeft size={14} />
            </button>
          )}
          <span
            style={{
              fontSize: 12,
              color: "#6a7a77",
              fontFamily: "DM Mono, monospace",
            }}
          >
            {questionIndex + 1} / {total}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            gap: 4,
          }}
        >
          {Array.from({ length: total }).map((_, i) => (
            <div
              key={i}
              style={{
                width: i < questionIndex ? 20 : i === questionIndex ? 20 : 6,
                height: 4,
                borderRadius: 2,
                background:
                  i < questionIndex
                    ? "#166534"
                    : i === questionIndex
                      ? "#166534"
                      : "rgba(16,42,37,0.18)",
                transition: "all 0.3s ease",
              }}
            />
          ))}
        </div>
      </div>

      {/* Question */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          padding: "24px 24px 32px",
          justifyContent: "space-between",
          gap: 20,
        }}
      >
        <div>
          <p
            style={{
              fontSize: 11,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#5f6f6c",
              marginBottom: 8,
              fontWeight: 600,
            }}
          >
            Patient assessment question
          </p>
          <p
            style={{
              fontSize: "clamp(20px, 5vw, 26px)",
              fontWeight: 600,
              color: "#102a25",
              lineHeight: 1.3,
              marginBottom: 10,
              letterSpacing: "-0.02em",
            }}
          >
            {question.text}
          </p>
          {question.subtext && (
            <p style={{ fontSize: 14, color: "#5f6f6c", lineHeight: 1.5 }}>
              {question.subtext}
            </p>
          )}
        </div>

        {/* Answer options */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            marginTop: "auto",
            background: "#ffffff",
            border: "1px solid rgba(16,42,37,0.1)",
            borderRadius: 18,
            padding: 14,
            boxShadow: "0 8px 28px rgba(16,42,37,0.08)",
          }}
        >
          {/* YES / NO */}
          {question.type === "yesno" && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              {[
                {
                  value: true,
                  label: "Yes",
                  color: "#166534",
                  bg: "rgba(22,101,52,0.08)",
                  border: "rgba(22,101,52,0.3)",
                },
                {
                  value: false,
                  label: "No",
                  color: "#6a7a77",
                  bg: "#f8fbfa",
                  border: "rgba(16,42,37,0.18)",
                },
              ].map((opt) => (
                <button
                  key={String(opt.value)}
                  onClick={() => onAnswer(opt.value, opt.label)}
                  style={{
                    height: 72,
                    borderRadius: 14,
                    background:
                      previousAnswer?.value === opt.value ? opt.bg : "#ffffff",
                    border: `2px solid ${
                      previousAnswer?.value === opt.value
                        ? opt.color
                        : "rgba(16,42,37,0.12)"
                    }`,
                    color:
                      previousAnswer?.value === opt.value
                        ? opt.color
                        : "#6a7a77",
                    fontSize: 18,
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                    fontFamily: "DM Sans, sans-serif",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {/* Number - grid of options */}
          {question.type === "number" && options && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 8,
              }}
            >
              {options.map((opt) => (
                <button
                  key={opt}
                  onClick={() => onAnswer(parseInt(opt) || opt, opt)}
                  style={{
                    height: 52,
                    borderRadius: 10,
                    background:
                      previousAnswer?.label === opt
                        ? "rgba(22,101,52,0.1)"
                        : "#ffffff",
                    border: `1.5px solid ${
                      previousAnswer?.label === opt
                        ? "#166534"
                        : "rgba(16,42,37,0.12)"
                    }`,
                    color:
                      previousAnswer?.label === opt ? "#166534" : "#6a7a77",
                    fontSize: 16,
                    fontWeight: previousAnswer?.label === opt ? 600 : 400,
                    cursor: "pointer",
                    transition: "all 0.15s",
                    fontFamily: "DM Mono, monospace",
                  }}
                >
                  {opt}
                </button>
              ))}
            </div>
          )}

          {/* Number - free input if no options */}
          {question.type === "number" && !options && (
            <div>
              <div
                style={{
                  background: "#ffffff",
                  border: "1.5px solid rgba(16,42,37,0.16)",
                  borderRadius: 14,
                  padding: "16px 20px",
                  marginBottom: 12,
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <input
                  type="number"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  min={question.min}
                  max={question.max}
                  value={numInput}
                  onChange={(e) => setNumInput(e.target.value)}
                  placeholder={`${question.min}–${question.max}`}
                  style={{
                    flex: 1,
                    background: "none",
                    border: "none",
                    fontSize: 32,
                    color: "#102a25",
                    fontFamily: "DM Mono, monospace",
                    fontWeight: 300,
                    outline: "none",
                    width: "100%",
                  }}
                  autoFocus
                />
              </div>
              <button
                onClick={() => {
                  const n = parseInt(numInput);
                  if (!isNaN(n)) onAnswer(n, String(n));
                }}
                disabled={!numInput || isNaN(parseInt(numInput))}
                style={{
                  width: "100%",
                  height: 56,
                  borderRadius: 14,
                  background:
                    numInput && !isNaN(parseInt(numInput))
                      ? "#166534"
                      : "#edf2f1",
                  border: "none",
                  color: numInput ? "#ffffff" : "#6a7a77",
                  fontSize: 16,
                  fontWeight: 600,
                  cursor: numInput ? "pointer" : "default",
                  fontFamily: "DM Sans, sans-serif",
                  transition: "all 0.2s",
                }}
              >
                Confirm
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Screen: risk reveal ───────────────────────────────────────────────────────
function RiskReveal({
  tier,
  answers,
  screeningType,
  onViewLetter,
  onNewScreening,
}: {
  tier: RiskTier;
  answers: Answer[];
  screeningType: "cervical" | "oral";
  onViewLetter: () => void;
  onNewScreening: () => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const cfg = RISK_CONFIG[tier];

  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), 300);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: cfg.bg,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        transition: "background 0.6s ease",
      }}
    >
      {/* Risk icon */}
      <div
        style={{
          width: 100,
          height: 100,
          borderRadius: 50,
          background: revealed ? cfg.color : "rgba(16,42,37,0.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 42,
          marginBottom: 24,
          transition: "all 0.6s ease",
          boxShadow: revealed ? `0 0 40px ${cfg.color}40` : "none",
          transform: revealed ? "scale(1)" : "scale(0.8)",
        }}
      >
        <span>{cfg.icon}</span>
      </div>

      <p
        style={{
          fontSize: 32,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          color: cfg.color,
          marginBottom: 8,
          opacity: revealed ? 1 : 0,
          transform: revealed ? "translateY(0)" : "translateY(10px)",
          transition: "all 0.5s ease 0.2s",
        }}
      >
        {cfg.headline}
      </p>

      <p
        style={{
          fontSize: 16,
          color: revealed ? cfg.color : "#5f6f6c",
          textAlign: "center",
          marginBottom: 32,
          opacity: revealed ? 0.8 : 0,
          maxWidth: 300,
          lineHeight: 1.5,
          transition: "all 0.5s ease 0.3s",
        }}
      >
        {cfg.action}
      </p>

      {/* Summary chips */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          justifyContent: "center",
          marginBottom: 40,
          maxWidth: 360,
          opacity: revealed ? 1 : 0,
          transition: "opacity 0.5s ease 0.4s",
        }}
      >
        {answers
          .filter((a) => a.value === true)
          .map((a) => (
            <span
              key={a.field}
              style={{
                padding: "5px 12px",
                borderRadius: 100,
                background: `${cfg.color}15`,
                border: `1px solid ${cfg.color}40`,
                fontSize: 11,
                color: cfg.color,
              }}
            >
              {a.label}
            </span>
          ))}
      </div>

      {/* Actions */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          width: "100%",
          maxWidth: 360,
          opacity: revealed ? 1 : 0,
          transition: "opacity 0.5s ease 0.5s",
        }}
      >
        {tier !== "LOW" && (
          <button
            onClick={onViewLetter}
            style={{
              height: 56,
              borderRadius: 14,
              background: cfg.color,
              border: "none",
              color: "#fff",
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "DM Sans, sans-serif",
              boxShadow: `0 4px 20px ${cfg.color}40`,
            }}
          >
            View Referral Letter
          </button>
        )}
        <button
          onClick={onNewScreening}
          style={{
            height: 52,
            borderRadius: 14,
            background: "#ffffff",
            border: "1px solid rgba(16,42,37,0.16)",
            color: "#5f6f6c",
            fontSize: 14,
            cursor: "pointer",
            fontFamily: "DM Sans, sans-serif",
          }}
        >
          Screen another patient
        </button>
      </div>
    </div>
  );
}

// ── Screen: referral ──────────────────────────────────────────────────────────
function ReferralScreen({
  tier,
  answers,
  screeningType,
  onBack,
}: {
  tier: RiskTier;
  answers: Answer[];
  screeningType: "cervical" | "oral";
  onBack: () => void;
}) {
  const [fetching, setFetching] = useState(true);
  const [letter, setLetter] = useState<string | null>(null);
  const [quality, setQuality] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmedTier, setConfirmedTier] = useState<RiskTier>(tier);
  const cfg = RISK_CONFIG[confirmedTier];

  function resolveReferralContext() {
    const userId =
      typeof window !== "undefined"
        ? localStorage.getItem("asha_user_id") || "web_screen"
        : "web_screen";
    const country =
      typeof window !== "undefined"
        ? (localStorage.getItem("asha_country") || "").toLowerCase()
        : "";

    let language = "en";
    let phonePrefix = "+234";

    if (country.includes("india")) {
      language = "hi";
      phonePrefix = "+91";
    } else if (country.includes("kenya")) {
      language = "sw";
      phonePrefix = "+254";
    } else if (country.includes("tanzania")) {
      language = "sw";
      phonePrefix = "+255";
    } else if (country.includes("nigeria")) {
      language = "en";
      phonePrefix = "+234";
    }

    // Backend uses phone prefix for geography/language routing.
    const phone = `${phonePrefix}${userId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10) || "webscreen"}`;
    return { language, phone };
  }

  function sanitizeForPDF(text: string): string {
    return text
      .replace(/≥/g, ">=")
      .replace(/≤/g, "<=")
      .replace(/→/g, "->")
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/–/g, "-")
      .replace(/-/g, "-")
      .replace(/[^\x00-\x7F]/g, (c) => {
        const code = c.charCodeAt(0);
        if (code >= 0x0900 && code <= 0x097f) return c;
        return "";
      });
  }

  useEffect(() => {
    async function fetchReferral() {
      try {
        // Build patient_data from answers
        const patientData: Record<string, unknown> = {
          screening_type: screeningType,
        };
        answers.forEach((a) => {
          patientData[a.field] = a.value;
        });
        const { language, phone } = resolveReferralContext();

        // Proxy through Next.js API route to avoid CORS
        const res = await fetch("/api/referral", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            patient_data: patientData,
            language,
            phone,
          }),
        });

        const data = await res.json();
        if (data.tier && ["HIGH", "ELEVATED", "LOW"].includes(data.tier)) {
          setConfirmedTier(data.tier as RiskTier);
        }

        if (data.letter) {
          setLetter(data.letter);
          setQuality(data.quality_score || null);
        } else {
          // LOW risk - no referral letter needed
          setLetter(
            `${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}\n` +
              `To: Attending Clinician\n\n` +
              `Patient screening completed via ASHA mobile interface.\n\n` +
              `Risk tier: ${data.tier || confirmedTier}\n\n` +
              `${data.summary || "No immediate action required. Recommend annual screening."}\n\n` +
              `Generated by ASHA Clinical Support`,
          );
        }
      } catch (err) {
        // Fallback - backend unreachable, generate minimal letter client-side
        const today = new Date().toLocaleDateString("en-GB", {
          day: "numeric",
          month: "long",
          year: "numeric",
        });
        const riskFactors = answers
          .filter((a) => a.value === true)
          .map((a) => a.label)
          .slice(0, 3)
          .join(", ");

        setLetter(
          `${today}\nTo: Attending Clinician\n\n` +
            `A patient has been assessed using the ASHA mobile screening tool.\n\n` +
            `Risk classification: ${confirmedTier}\n` +
            `Screening type: ${screeningType}\n` +
            (riskFactors ? `Key risk factors: ${riskFactors}\n\n` : "\n") +
            `Recommended action: ${
              confirmedTier === "HIGH"
                ? "Refer immediately to the nearest cancer screening clinic for colposcopy/oral examination."
                : confirmedTier === "ELEVATED"
                  ? "Schedule follow-up within 2 weeks for further evaluation."
                  : "Annual screening recommended. Advise on tobacco and risk factor cessation."
            }\n\n` +
            `CHW contact: Available on request\n` +
            `Generated by ASHA Clinical Support · WHO Protocol Aligned`,
        );
      }
      setFetching(false);
    }
    fetchReferral();
  }, []);

  async function downloadPDF() {
    if (!letter) return;
    const { jsPDF } = await import("jspdf" as any);
    const doc = new jsPDF({ format: "a4" });
    const margin = 20;
    const pageW = 210;
    let y = 20;

    doc.setFillColor(22, 101, 52);
    doc.rect(0, 0, pageW, 26, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.text("ASHA - Clinical Referral Letter", margin, 14);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(200, 230, 210);
    doc.text(
      "WHO Protocol Aligned · Cancer Aid Society India · SDG 3",
      margin,
      22,
    );
    y = 40;

    const tierRGB: Record<RiskTier, [number, number, number]> = {
      HIGH: [220, 38, 38],
      ELEVATED: [217, 119, 6],
      LOW: [22, 163, 74],
    };
    const [r, g, b] = tierRGB[confirmedTier];
    doc.setFillColor(r, g, b);
    doc.roundedRect(margin, y, 40, 10, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text(`${confirmedTier} RISK`, margin + 5, y + 7);
    y += 20;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(40, 40, 40);
    const lines = letter.split("\n");
    lines.forEach((line) => {
      if (!line.trim()) {
        y += 4;
        return;
      }
      const wrapped = doc.splitTextToSize(
        sanitizeForPDF(line),
        pageW - margin * 2,
      );
      if (y + wrapped.length * 6 > 270) {
        doc.addPage();
        y = margin;
      }
      doc.text(wrapped, margin, y);
      y += wrapped.length * 6 + 2;
    });

    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text(
      "Generated by ASHA Clinical Support · For triage purposes only · Not a diagnosis",
      margin,
      287,
    );

    doc.save(
      `ASHA_Referral_${confirmedTier}_${new Date().toISOString().slice(0, 10)}.pdf`,
    );
  }

  function ReferralLoaderSkeleton() {
    return (
      <div className="motion-enter">
        <div
          style={{
            background: "#fff",
            borderRadius: 12,
            overflow: "hidden",
            marginBottom: 16,
            border: "1px solid rgba(16,42,37,0.12)",
            boxShadow: "0 8px 24px rgba(16,42,37,0.08)",
          }}
        >
          <div
            className="cl-skeleton"
            style={{ height: 40, borderRadius: 0 }}
          />
          <div
            style={{
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div className="cl-skeleton" style={{ height: 12, width: "42%" }} />
            <div className="cl-skeleton" style={{ height: 12, width: "88%" }} />
            <div className="cl-skeleton" style={{ height: 12, width: "92%" }} />
            <div className="cl-skeleton" style={{ height: 12, width: "75%" }} />
            <div className="cl-skeleton" style={{ height: 12, width: "90%" }} />
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div
            className="cl-skeleton"
            style={{ height: 52, borderRadius: 12 }}
          />
          <div
            className="cl-skeleton"
            style={{ height: 44, borderRadius: 12 }}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f4f7f6",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div
        style={{
          background: "#ffffff",
          borderBottom: "1px solid rgba(16,42,37,0.1)",
          padding: "12px 20px",
        }}
      >
        <div
          style={{
            maxWidth: 980,
            width: "100%",
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <button
            onClick={onBack}
            style={{
              background: "none",
              border: "none",
              color: "#5f6f6c",
              fontSize: 14,
              cursor: "pointer",
              fontFamily: "DM Sans, sans-serif",
            }}
          >
            <span
              style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
            >
              <ArrowLeft size={14} />
              Back
            </span>
          </button>
          <div
            style={{
              padding: "3px 12px",
              borderRadius: 100,
              fontSize: 11,
              fontWeight: 600,
              color: cfg.color,
              background: `${cfg.color}15`,
              border: `1px solid ${cfg.color}30`,
            }}
          >
            {confirmedTier} RISK
          </div>
        </div>
      </div>

      <div style={{ flex: 1, padding: "20px", overflowY: "auto" }}>
        <div
          className="motion-enter motion-enter-fast"
          style={{ maxWidth: 980, width: "100%", margin: "0 auto" }}
        >
          {fetching ? (
            <ReferralLoaderSkeleton />
          ) : (
            <>
              {/* Document */}
              <div
                style={{
                  background: "#fff",
                  borderRadius: 12,
                  overflow: "hidden",
                  marginBottom: 16,
                  border: "1px solid rgba(16,42,37,0.12)",
                  boxShadow: "0 8px 24px rgba(16,42,37,0.08)",
                }}
              >
                <div style={{ background: cfg.color, padding: "10px 16px" }}>
                  <p style={{ fontSize: 11, fontWeight: 600, color: "#fff" }}>
                    CLINICAL REFERRAL
                  </p>
                  <p style={{ fontSize: 9, color: "rgba(255,255,255,0.6)" }}>
                    ASHA · WHO Protocol Aligned
                  </p>
                </div>
                <div style={{ padding: "16px" }}>
                  <pre
                    style={{
                      fontSize: 12,
                      color: "#1e293b",
                      whiteSpace: "pre-wrap",
                      lineHeight: 1.8,
                      fontFamily: "Georgia, serif",
                      margin: 0,
                    }}
                  >
                    {letter}
                  </pre>
                </div>
                {quality && (
                  <div
                    style={{
                      padding: "8px 16px",
                      background: "#f8fafc",
                      borderTop: "1px solid #e2e8f0",
                      display: "flex",
                      justifyContent: "space-between",
                    }}
                  >
                    <span style={{ fontSize: 10, color: "#94a3b8" }}>
                      Quality assessment
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        color: "#16a34a",
                        fontWeight: 500,
                      }}
                    >
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <CheckCircle2 size={12} />
                        {quality}/10
                      </span>
                    </span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div
                style={{ display: "flex", flexDirection: "column", gap: 10 }}
              >
                <button
                  className="motion-pressable"
                  onClick={downloadPDF}
                  style={{
                    height: 52,
                    borderRadius: 12,
                    background: "#166534",
                    border: "1px solid #166534",
                    color: "#ffffff",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "DM Sans, sans-serif",
                  }}
                >
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <Download size={14} />
                    Download PDF
                  </span>
                </button>
                <button
                  className="motion-pressable"
                  onClick={() => {
                    navigator.clipboard.writeText(letter || "");
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  style={{
                    height: 44,
                    borderRadius: 12,
                    background: "#ffffff",
                    border: "1px solid rgba(16,42,37,0.16)",
                    color: copied ? "#166534" : "#5f6f6c",
                    fontSize: 13,
                    cursor: "pointer",
                    fontFamily: "DM Sans, sans-serif",
                  }}
                >
                  {copied ? "Copied" : "Copy to clipboard"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
type AppScreen = "type" | "question" | "result" | "referral";

export default function ScreenPage() {
  const [screen, setScreen] = useState<AppScreen>("type");
  const [screeningType, setScreeningType] = useState<"cervical" | "oral">(
    "cervical",
  );
  const [questions, setQuestions] = useState<Question[]>([]);
  const [qIndex, setQIndex] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [riskTier, setRiskTier] = useState<RiskTier>("LOW");

  function startScreening(type: "cervical" | "oral") {
    setScreeningType(type);
    setQuestions(type === "cervical" ? CERVICAL_QUESTIONS : ORAL_QUESTIONS);
    setAnswers([]);
    setQIndex(0);
    setScreen("question");
  }

  function handleAnswer(value: string | number | boolean, label: string) {
    const q = questions[qIndex];
    // Use positiveLabel for yes/no questions so factors read meaningfully
    const stored = value === true && q.positiveLabel ? q.positiveLabel : label;
    const newAns = answers.filter((a) => a.field !== q.field);
    newAns.push({ field: q.field, value, label: stored });
    setAnswers(newAns);

    if (qIndex < questions.length - 1) {
      setTimeout(() => setQIndex(qIndex + 1), 150);
    } else {
      // All questions answered
      const tier = estimateRisk(newAns, screeningType);
      setRiskTier(tier);
      setScreen("result");
    }
  }

  function handleBack() {
    if (qIndex > 0) {
      setQIndex(qIndex - 1);
    } else {
      setScreen("type");
    }
  }

  function resetAll() {
    setScreen("type");
    setAnswers([]);
    setQIndex(0);
  }

  // Back button in questions
  useEffect(() => {
    if (screen !== "question") return;
    const handler = (e: PopStateEvent) => {
      e.preventDefault();
      handleBack();
    };
    window.history.pushState(null, "", "");
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, [screen, qIndex]);

  if (screen === "type") {
    return <TypeSelector onSelect={startScreening} />;
  }

  if (screen === "question") {
    return (
      <div>
        <style jsx global>{`
          @keyframes fadeInScreen {
            from {
              opacity: 0;
              transform: translateY(6px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
        `}</style>
        <QuestionCard
          question={questions[qIndex]}
          questionIndex={qIndex}
          total={questions.length}
          onAnswer={handleAnswer}
          previousAnswer={answers.find(
            (a) => a.field === questions[qIndex].field,
          )}
          onBack={handleBack}
          canGoBack={qIndex > 0}
        />
      </div>
    );
  }

  if (screen === "result") {
    return (
      <RiskReveal
        tier={riskTier}
        answers={answers}
        screeningType={screeningType}
        onViewLetter={() => setScreen("referral")}
        onNewScreening={resetAll}
      />
    );
  }

  if (screen === "referral") {
    return (
      <ReferralScreen
        tier={riskTier}
        answers={answers}
        screeningType={screeningType}
        onBack={() => setScreen("result")}
      />
    );
  }

  return null;
}

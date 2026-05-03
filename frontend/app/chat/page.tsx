"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Settings,
  Camera,
  Mic,
  Square,
  SendHorizontal,
  Gauge,
  ImagePlus,
} from "lucide-react";
import AppLogo from "@/components/AppLogo";
import { getUserFriendlyError } from "@/lib/userError";

// ── Types ─────────────────────────────────────────────────────────────────────
type RiskTier = "HIGH" | "ELEVATED" | "LOW";

interface RiskResult {
  tier: RiskTier;
  cervical_pct: number | null;
  oral_score: number | null;
  oral_max: number | null;
  factors: string[];
  referral: string | null;
  quality: number | null;
}

interface Message {
  id: string;
  role: "user" | "asha";
  text: string;
  ts: string;
  image?: string;
  queued?: boolean;
  options?: string[];
  riskResult?: RiskResult; // structured risk result - renders as card
}

interface QueuedMsg {
  user_id: string;
  message: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const TIER_COLOR: Record<RiskTier, string> = {
  HIGH: "#ff4757",
  ELEVATED: "#ffa502",
  LOW: "#2ed573",
};
const TIER_BG: Record<RiskTier, string> = {
  HIGH: "rgba(255,71,87,0.1)",
  ELEVATED: "rgba(255,165,2,0.1)",
  LOW: "rgba(46,213,115,0.08)",
};
const TIER_BORDER: Record<RiskTier, string> = {
  HIGH: "rgba(255,71,87,0.3)",
  ELEVATED: "rgba(255,165,2,0.3)",
  LOW: "rgba(46,213,115,0.25)",
};

const QUICK_COMMANDS = [
  { label: "Screen patient", cmd: "screen" },
  { label: "Oral screening", cmd: "oral" },
  { label: "Register survivor", cmd: "register survivor" },
  { label: "Help", cmd: "help" },
  { label: "Reset", cmd: "reset" },
];

const YES_NO = ["Yes", "No"];
const AGE_OPTIONS = ["20", "25", "30", "35", "40", "45", "50", "55", "60"];
const PREG_OPTIONS = ["0", "1", "2", "3", "4", "5", "6", "7", "8+"];
const CANCER_TYPES = ["Cervical", "Oral", "Breast", "Colon", "Other"];
const DIET = ["Low (rarely)", "Moderate", "High (daily)"];
const SCORES = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];

// ── Utilities ─────────────────────────────────────────────────────────────────
function uid() {
  return Math.random().toString(36).slice(2, 9);
}
function now() {
  return new Date().toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function detectOptions(text: string): string[] | undefined {
  if (/how many times has she been pregnant|how many.*pregnan|pregnanc(y|ies)/i.test(text))
    return PREG_OPTIONS;
  if (/how old is the patient|enter.*age|age in years/i.test(text))
    return AGE_OPTIONS;
  if (
    /smoke|tobacco|betel|bleed|iud|contraceptiv|std|infect|lesion|patch|swallow|alcohol|hygiene|family.*cancer|immune|sun/i.test(
      text,
    )
  )
    return YES_NO;
  if (/cancer.*type|type.*cancer/i.test(text)) return CANCER_TYPES;
  if (/diet|fruits|vegetable/i.test(text)) return DIET;
  if (/fatigue|pain|mood/i.test(text) && /1.*10|scale/i.test(text))
    return SCORES;
  return undefined;
}

// Parse ASHA risk assessment message into structured data
function parseRiskResult(text: string): RiskResult | null {
  if (!text.includes("Risk Level") && !text.includes("ASHA Risk Assessment"))
    return null;

  const tierMatch = text.match(/Risk Level:?\s*\*?(HIGH|ELEVATED|LOW)\*?/i);
  if (!tierMatch) return null;
  const tier = tierMatch[1].toUpperCase() as RiskTier;

  const cervMatch = text.match(/Cervical.*?(\d+)%/);
  const oralMatch = text.match(/Oral.*?Score:?\s*(\d+)\/(\d+)/);

  const factors: string[] = [];
  const factorSection = text.match(
    /Key risk factors:([\s\S]*?)(?=⚠|✅|🔴|REFERRAL|$)/i,
  );
  if (factorSection) {
    const lines = factorSection[1]
      .split("\n")
      .filter((l) => l.trim().startsWith("•"));
    lines.forEach((l) => factors.push(l.replace(/^[•\s]+/, "").trim()));
  }

  // Extract referral letter
  let referral: string | null = null;
  const refMatch = text.match(/─{10,}([\s\S]*?)─{10,}/);
  if (refMatch) referral = refMatch[1].trim();

  const qualityMatch = text.match(/Letter quality.*?(\d+\.?\d*)\/10/);

  return {
    tier,
    cervical_pct: cervMatch ? parseInt(cervMatch[1]) : null,
    oral_score: oralMatch ? parseInt(oralMatch[1]) : null,
    oral_max: oralMatch ? parseInt(oralMatch[2]) : null,
    factors,
    referral,
    quality: qualityMatch ? parseFloat(qualityMatch[1]) : null,
  };
}

// ── PDF Generation with jsPDF ─────────────────────────────────────────────────
async function downloadPDF(result: RiskResult) {
  // Dynamic import - jsPDF is client-side only
  const { jsPDF } = await import("jspdf" as any);
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const pageW = 210;
  const margin = 20;
  const contentW = pageW - margin * 2;
  let y = margin;

  // ── Header bar ─────────────────────────────────────────────────────────────
  doc.setFillColor(26, 51, 35); // forest green
  doc.rect(0, 0, pageW, 28, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text("ASHA", margin, 12);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(200, 220, 210);
  doc.text(
    "Adaptive Survivorship & Health Agent  |  WHO Protocol Aligned  |  Cancer Aid Society India",
    margin,
    19,
  );

  doc.setFontSize(8);
  doc.setTextColor(150, 180, 165);
  doc.text(
    `Generated: ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}`,
    pageW - margin,
    19,
    { align: "right" },
  );

  y = 38;

  // ── Title ──────────────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(30, 30, 30);
  doc.text("CLINICAL REFERRAL LETTER", margin, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text("Community Cancer Screening Programme", margin, y + 6);

  y += 18;

  // ── Divider ────────────────────────────────────────────────────────────────
  doc.setDrawColor(220, 220, 210);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageW - margin, y);
  y += 8;

  // ── Risk tier badge ────────────────────────────────────────────────────────
  const tierRGB: Record<RiskTier, [number, number, number]> = {
    HIGH: [185, 28, 28],
    ELEVATED: [180, 83, 9],
    LOW: [21, 128, 61],
  };
  const tierBgRGB: Record<RiskTier, [number, number, number]> = {
    HIGH: [254, 226, 226],
    ELEVATED: [254, 243, 199],
    LOW: [220, 252, 231],
  };

  const [r, g, b] = tierRGB[result.tier];
  const [br, bg, bb] = tierBgRGB[result.tier];
  doc.setFillColor(br, bg, bb);
  doc.roundedRect(margin, y - 5, 40, 10, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(r, g, b);
  doc.text(result.tier + " RISK", margin + 5, y + 2);

  // Scores inline
  let scoreX = margin + 48;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);

  if (result.cervical_pct !== null) {
    doc.text(`Cervical: ${result.cervical_pct}%`, scoreX, y + 2);
    scoreX += 36;
  }
  if (result.oral_score !== null && result.oral_max !== null) {
    doc.text(`Oral: ${result.oral_score}/${result.oral_max}`, scoreX, y + 2);
  }

  y += 16;

  // ── Risk factors ───────────────────────────────────────────────────────────
  if (result.factors.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(30, 30, 30);
    doc.text("KEY RISK FACTORS", margin, y);
    y += 6;

    result.factors.forEach((f, i) => {
      doc.setFillColor(r, g, b);
      doc.circle(margin + 2, y - 1.5, 1.2, "F");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(50, 50, 50);
      const lines = doc.splitTextToSize(f, contentW - 8);
      doc.text(lines, margin + 6, y);
      y += lines.length * 5 + 2;
    });
    y += 4;
  }

  // ── Divider ────────────────────────────────────────────────────────────────
  doc.setDrawColor(220, 220, 210);
  doc.line(margin, y, pageW - margin, y);
  y += 8;

  // ── Referral letter body ───────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(30, 30, 30);
  doc.text("REFERRAL LETTER", margin, y);
  y += 8;

  if (result.referral) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(40, 40, 40);

    const paragraphs = result.referral.split("\n").filter((l) => l.trim());
    paragraphs.forEach((para) => {
      const lines = doc.splitTextToSize(para, contentW);
      if (y + lines.length * 6 > 270) {
        doc.addPage();
        y = margin;
      }
      doc.text(lines, margin, y);
      y += lines.length * 6 + 3;
    });
  }

  y += 6;

  // ── Quality score ──────────────────────────────────────────────────────────
  if (result.quality) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(
      `Letter quality score: ${result.quality}/10  (Clinical completeness · Actionability · Clarity)`,
      margin,
      y,
    );
    y += 6;
  }

  // ── Footer ─────────────────────────────────────────────────────────────────
  const footerY = 287;
  doc.setFillColor(245, 241, 234);
  doc.rect(0, footerY - 6, pageW, 16, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(120, 120, 120);
  doc.text(
    "This document was generated by ASHA (Adaptive Survivorship & Health Agent) for clinical triage purposes only. " +
      "It is not a diagnosis. All patients require clinical evaluation by a qualified healthcare provider.",
    margin,
    footerY,
    { maxWidth: contentW - 30 },
  );
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7);
  doc.setTextColor(100, 130, 115);
  doc.text("वसुधैव कुटुम्बकम्", pageW - margin, footerY, { align: "right" });

  doc.save(`ASHA_Referral_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ── Offline queue ─────────────────────────────────────────────────────────────
function loadQueue(): QueuedMsg[] {
  try {
    return JSON.parse(localStorage.getItem("asha_queue") || "[]");
  } catch {
    return [];
  }
}
function saveQueue(q: QueuedMsg[]) {
  localStorage.setItem("asha_queue", JSON.stringify(q));
}

// ── Speech ────────────────────────────────────────────────────────────────────
function useSpeech(onResult: (t: string) => void) {
  const recRef = useRef<any>(null);
  const [listening, setListening] = useState(false);

  const start = useCallback(() => {
    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SR) return alert("Voice input not supported in this browser");
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.onresult = (e: any) => {
      onResult(e.results[0][0].transcript);
      setListening(false);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  }, [onResult]);

  const stop = useCallback(() => {
    recRef.current?.stop();
    setListening(false);
  }, []);
  return { listening, start, stop };
}

// ── Risk Result Card ──────────────────────────────────────────────────────────
function RiskCard({ result }: { result: RiskResult }) {
  const [showLetter, setShowLetter] = useState(false);
  const color = TIER_COLOR[result.tier];
  const bg = TIER_BG[result.tier];
  const border = TIER_BORDER[result.tier];

  return (
    <div
      style={{
        background: "#161c28",
        border: `1px solid ${border}`,
        borderRadius: 16,
        overflow: "hidden",
        maxWidth: "88%",
      }}
    >
      {/* Tier header */}
      <div
        style={{
          background: bg,
          borderBottom: `1px solid ${border}`,
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              background: color,
              boxShadow: `0 0 8px ${color}`,
            }}
          />
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color,
              letterSpacing: "0.06em",
            }}
          >
            {result.tier} RISK
          </span>
        </div>
        <span
          style={{
            fontSize: 10,
            color: "rgba(232,234,240,0.4)",
            fontFamily: "DM Mono, monospace",
          }}
        >
          ASHA Assessment
        </span>
      </div>

      <div style={{ padding: "14px 16px" }}>
        {/* Scores */}
        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          {result.cervical_pct !== null && (
            <div
              style={{
                flex: 1,
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 10,
                padding: "10px 12px",
                textAlign: "center",
              }}
            >
              <p
                style={{
                  fontFamily: "DM Mono, monospace",
                  fontSize: 22,
                  color,
                  lineHeight: 1,
                }}
              >
                {result.cervical_pct}%
              </p>
              <p style={{ fontSize: 10, color: "#4a5568", marginTop: 4 }}>
                Cervical risk
              </p>
            </div>
          )}
          {result.oral_score !== null && result.oral_max !== null && (
            <div
              style={{
                flex: 1,
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 10,
                padding: "10px 12px",
                textAlign: "center",
              }}
            >
              <p
                style={{
                  fontFamily: "DM Mono, monospace",
                  fontSize: 22,
                  color,
                  lineHeight: 1,
                }}
              >
                {result.oral_score}
                <span style={{ fontSize: 12, color: "#4a5568" }}>
                  /{result.oral_max}
                </span>
              </p>
              <p style={{ fontSize: 10, color: "#4a5568", marginTop: 4 }}>
                Oral score
              </p>
            </div>
          )}
        </div>

        {/* Risk factors */}
        {result.factors.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <p
              style={{
                fontSize: 9,
                color: "#4a5568",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 8,
              }}
            >
              Risk factors
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {result.factors.map((f, i) => (
                <div
                  key={i}
                  style={{
                    padding: "6px 10px",
                    background:
                      i === 0 ? `${color}08` : "rgba(255,255,255,0.02)",
                    borderLeft: `2px solid ${i === 0 ? color : "rgba(255,255,255,0.1)"}`,
                    borderRadius: "0 6px 6px 0",
                  }}
                >
                  <p
                    style={{
                      fontSize: 11,
                      color: i === 0 ? color : "#8892a4",
                      lineHeight: 1.4,
                    }}
                  >
                    {f}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action */}
        <div
          style={{
            padding: "8px 12px",
            background:
              result.tier === "HIGH"
                ? "rgba(255,71,87,0.06)"
                : "rgba(255,165,2,0.05)",
            borderRadius: 8,
            marginBottom: 12,
          }}
        >
          <p
            style={{
              fontSize: 11,
              color: result.tier === "HIGH" ? "#ff4757" : "#ffa502",
            }}
          >
            {result.tier === "HIGH"
              ? "⚠ Refer this patient to a clinic immediately."
              : result.tier === "ELEVATED"
                ? "📋 Schedule follow-up within 2 weeks."
                : "✅ No immediate action needed. Annual screening recommended."}
          </p>
        </div>

        {/* Referral letter toggle + PDF */}
        {result.referral && (
          <div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setShowLetter(!showLetter)}
                style={{
                  flex: 1,
                  padding: "8px",
                  borderRadius: 8,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "#8892a4",
                  fontSize: 11,
                  cursor: "pointer",
                  fontFamily: "DM Sans, sans-serif",
                }}
              >
                {showLetter ? "▲ Hide letter" : "▼ View referral letter"}
                {result.quality && (
                  <span style={{ marginLeft: 6, color: "#2ed573" }}>
                    ✓ {result.quality}/10
                  </span>
                )}
              </button>
              <button
                onClick={() => downloadPDF(result)}
                style={{
                  padding: "8px 14px",
                  borderRadius: 8,
                  background: "rgba(0,212,160,0.1)",
                  border: "1px solid rgba(0,212,160,0.3)",
                  color: "#00d4a0",
                  fontSize: 11,
                  cursor: "pointer",
                  fontFamily: "DM Sans, sans-serif",
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  whiteSpace: "nowrap",
                }}
              >
                ↓ PDF
              </button>
            </div>

            {showLetter && (
              <pre
                style={{
                  marginTop: 10,
                  fontSize: 11,
                  color: "#8892a4",
                  whiteSpace: "pre-wrap",
                  fontFamily: "DM Mono, monospace",
                  lineHeight: 1.7,
                  background: "rgba(255,255,255,0.02)",
                  borderRadius: 8,
                  padding: "12px",
                  border: "1px solid rgba(255,255,255,0.06)",
                  maxHeight: 200,
                  overflowY: "auto",
                }}
              >
                {result.referral}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Message Bubble ─────────────────────────────────────────────────────────────
function MessageBubble({
  msg,
  lowData,
  onOptionClick,
}: {
  msg: Message;
  lowData: boolean;
  onOptionClick: (o: string) => void;
}) {
  const isUser = msg.role === "user";
  const markdownTextColor = isUser ? "#e9edef" : "#d8dee9";

  // Render risk card instead of text bubble
  if (!isUser && msg.riskResult) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 6,
        }}
      >
        <RiskCard result={msg.riskResult} />
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: isUser ? "flex-end" : "flex-start",
      }}
    >
      <div
        style={{
          maxWidth: "82%",
          background: isUser ? "#005c4b" : "#1f2c34",
          borderRadius: isUser ? "14px 2px 14px 14px" : "2px 14px 14px 14px",
          padding: "9px 12px",
        }}
      >
        {msg.image && !lowData && (
          <img
            src={msg.image}
            alt="Patient"
            style={{
              width: "100%",
              borderRadius: 8,
              marginBottom: 8,
              maxHeight: 200,
              objectFit: "cover",
            }}
          />
        )}
        <div
          style={{ fontSize: 13, color: markdownTextColor, lineHeight: 1.6 }}
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({ children }) => (
                <p style={{ margin: "0 0 8px 0" }}>{children}</p>
              ),
              ul: ({ children }) => (
                <ul style={{ margin: "0 0 8px 18px", padding: 0 }}>
                  {children}
                </ul>
              ),
              ol: ({ children }) => (
                <ol style={{ margin: "0 0 8px 18px", padding: 0 }}>
                  {children}
                </ol>
              ),
              li: ({ children }) => (
                <li style={{ marginBottom: 4 }}>{children}</li>
              ),
              strong: ({ children }) => (
                <strong style={{ fontWeight: 700 }}>{children}</strong>
              ),
              em: ({ children }) => (
                <em style={{ fontStyle: "italic" }}>{children}</em>
              ),
              code: ({ children, className }) => {
                const isBlock = Boolean(className);
                if (isBlock) {
                  return (
                    <code
                      style={{
                        display: "block",
                        background: "rgba(0,0,0,0.25)",
                        border: "1px solid rgba(255,255,255,0.12)",
                        borderRadius: 8,
                        padding: "10px 12px",
                        margin: "6px 0",
                        fontFamily: "DM Mono, monospace",
                        fontSize: 12,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {children}
                    </code>
                  );
                }
                return (
                  <code
                    style={{
                      background: "rgba(255,255,255,0.12)",
                      borderRadius: 4,
                      padding: "1px 5px",
                      fontFamily: "DM Mono, monospace",
                      fontSize: 12,
                    }}
                  >
                    {children}
                  </code>
                );
              },
              a: ({ href, children }) => (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "#7cd8ff", textDecoration: "underline" }}
                >
                  {children}
                </a>
              ),
            }}
          >
            {msg.text}
          </ReactMarkdown>
        </div>
        <p
          style={{
            fontSize: 10,
            color: "rgba(233,237,239,0.4)",
            textAlign: "right",
            marginTop: 4,
            fontFamily: "DM Mono, monospace",
          }}
        >
          {msg.ts} {isUser && "✓✓"} {msg.queued && "⏳"}
        </p>
      </div>

      {!isUser && msg.options && msg.options.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            marginTop: 6,
            maxWidth: "82%",
          }}
        >
          {msg.options.map((opt) => (
            <button
              key={opt}
              onClick={() => onOptionClick(opt)}
              style={{
                padding: "6px 14px",
                borderRadius: 100,
                background: "rgba(0,212,160,0.08)",
                border: "1px solid rgba(0,212,160,0.25)",
                color: "#00a884",
                fontSize: 12,
                cursor: "pointer",
                fontFamily: "DM Sans, sans-serif",
                transition: "all 0.15s",
              }}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Account Panel ─────────────────────────────────────────────────────────────
function AccountPanel({
  userId,
  onSwitch,
  onClose,
}: {
  userId: string;
  onSwitch: (id: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(localStorage.getItem("asha_name") || "");
  const [country, setCountry] = useState(
    localStorage.getItem("asha_country") || "🇮🇳 India (EN)",
  );

  const COUNTRIES = [
    "🇮🇳 India (EN)",
    "🇰🇪 Kenya (SW)",
    "🇳🇬 Nigeria (EN)",
    "🌍 Other (EN)",
  ];

  function save() {
    localStorage.setItem("asha_name", name);
    localStorage.setItem("asha_country", country);
    onClose();
  }

  function newSession() {
    const id = "web_" + Math.random().toString(36).slice(2, 9);
    localStorage.setItem("asha_user_id", id);
    onSwitch(id);
    onClose();
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "flex-end",
      }}
      onClick={onClose}
      className="modal-overlay-enter"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="modal-panel-enter modal-panel-enter-fast"
        style={{
          background: "#111620",
          width: 280,
          height: "100vh",
          borderLeft: "1px solid rgba(255,255,255,0.08)",
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <p style={{ fontSize: 13, fontWeight: 600, color: "#e8eaf0" }}>
            Account
          </p>
          <button
            className="motion-pressable"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "#4a5568",
              cursor: "pointer",
              fontSize: 18,
            }}
          >
            ✕
          </button>
        </div>

        {/* Current session */}
        <div
          style={{
            background: "rgba(0,212,160,0.06)",
            border: "1px solid rgba(0,212,160,0.15)",
            borderRadius: 10,
            padding: "10px 12px",
          }}
        >
          <p
            style={{
              fontSize: 9,
              color: "#4a5568",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: 4,
            }}
          >
            Current session
          </p>
          <p
            style={{
              fontSize: 11,
              color: "#00d4a0",
              fontFamily: "DM Mono, monospace",
              wordBreak: "break-all",
            }}
          >
            {userId}
          </p>
        </div>

        {/* Name */}
        <div>
          <p style={{ fontSize: 11, color: "#4a5568", marginBottom: 6 }}>
            Your name (optional)
          </p>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="CHW name"
            style={{
              width: "100%",
              padding: "8px 10px",
              background: "#1c2333",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8,
              color: "#e8eaf0",
              fontSize: 12,
              fontFamily: "DM Sans, sans-serif",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Country / Language */}
        <div>
          <p style={{ fontSize: 11, color: "#4a5568", marginBottom: 6 }}>
            Region (sets language)
          </p>
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 10px",
              background: "#1c2333",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8,
              color: "#e8eaf0",
              fontSize: 12,
              fontFamily: "DM Sans, sans-serif",
              outline: "none",
              boxSizing: "border-box",
            }}
          >
            {COUNTRIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <p style={{ fontSize: 10, color: "#4a5568", marginTop: 4 }}>
            Kenya/Tanzania → Swahili referral letters
          </p>
        </div>

        <button
          className="motion-pressable"
          onClick={save}
          style={{
            padding: "9px",
            borderRadius: 8,
            background: "rgba(0,212,160,0.1)",
            border: "1px solid rgba(0,212,160,0.3)",
            color: "#00d4a0",
            fontSize: 12,
            cursor: "pointer",
            fontWeight: 500,
            fontFamily: "DM Sans, sans-serif",
          }}
        >
          Save preferences
        </button>

        <div
          style={{
            borderTop: "1px solid rgba(255,255,255,0.06)",
            paddingTop: 16,
          }}
        >
          <p style={{ fontSize: 11, color: "#4a5568", marginBottom: 10 }}>
            Switch account - creates a new independent session
          </p>
          <button
            className="motion-pressable"
            onClick={newSession}
            style={{
              width: "100%",
              padding: "9px",
              borderRadius: 8,
              background: "rgba(255,71,87,0.08)",
              border: "1px solid rgba(255,71,87,0.2)",
              color: "#ff4757",
              fontSize: 12,
              cursor: "pointer",
              fontFamily: "DM Sans, sans-serif",
            }}
          >
            New session / Switch account
          </button>
        </div>

        <div
          style={{
            marginTop: "auto",
            paddingTop: 16,
            borderTop: "1px solid rgba(255,255,255,0.04)",
          }}
        >
          <p style={{ fontSize: 10, color: "#4a5568", lineHeight: 1.6 }}>
            ASHA v2.0 · Cancer Aid Society India
            <br />
            WHO Protocol Aligned · SDG 3.1, 3.4, 3.8
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [online, setOnline] = useState(true);
  const [userId, setUserId] = useState("");
  const [lowData, setLowData] = useState(false);
  const [queue, setQueue] = useState<QueuedMsg[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [photoMode, setPhotoMode] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const speech = useSpeech((text) => setInput((prev) => prev + " " + text));

  // Init
  useEffect(() => {
    let id = localStorage.getItem("asha_user_id");
    if (!id) {
      id = "web_" + uid();
      localStorage.setItem("asha_user_id", id);
    }
    setUserId(id);
    setQueue(loadQueue());
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    setOnline(navigator.onLine);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  // Welcome
  useEffect(() => {
    if (!userId) return;
    const name = localStorage.getItem("asha_name");
    setMessages([
      {
        id: uid(),
        role: "asha",
        ts: now(),
        text: `🌿 Welcome${name ? ", " + name : ""} to ASHA\n\nI help community health workers screen patients for cancer and support cancer survivors.\n\nTap a command to begin.`,
      },
    ]);
  }, [userId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Sync offline queue when back online
  useEffect(() => {
    if (!online || queue.length === 0 || syncing) return;
    (async () => {
      setSyncing(true);
      const remaining: QueuedMsg[] = [];
      for (const q of queue) {
        try {
          const reply = await callBackend(q.user_id, q.message);
          addMessage({
            id: uid(),
            role: "asha",
            text: reply,
            ts: now(),
            options: detectOptions(reply),
            riskResult: parseRiskResult(reply) || undefined,
          });
        } catch {
          remaining.push(q);
        }
      }
      setQueue(remaining);
      saveQueue(remaining);
      setSyncing(false);
      if (remaining.length === 0 && queue.length > 0)
        addMessage({
          id: uid(),
          role: "asha",
          text: "✓ All offline messages delivered.",
          ts: now(),
        });
    })();
  }, [online]);

  function addMessage(msg: Message) {
    setMessages((prev) => [...prev, msg]);
  }

  async function callBackend(uid: string, msg: string): Promise<string> {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: uid, message: msg }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.detail || data?.error || "backend error");
    return data.reply || "(no reply)";
  }

  async function send(text?: string) {
    const msg = (text || input).trim();
    if (!msg || loading) return;
    setInput("");
    addMessage({ id: uid(), role: "user", text: msg, ts: now() });
    setLoading(true);

    if (!online) {
      const q = { user_id: userId, message: msg };
      const newQ = [...queue, q];
      setQueue(newQ);
      saveQueue(newQ);
      addMessage({
        id: uid(),
        role: "asha",
        text: "📶 Offline - message queued. Will send when reconnected.",
        ts: now(),
        queued: true,
      });
      setLoading(false);
      return;
    }

    try {
      const reply = await callBackend(userId, msg);
      const riskResult = parseRiskResult(reply);
      addMessage({
        id: uid(),
        role: "asha",
        text: riskResult ? "" : reply,
        ts: now(),
        options: riskResult ? undefined : detectOptions(reply),
        riskResult: riskResult || undefined,
      });
    } catch (err) {
      addMessage({
        id: uid(),
        role: "asha",
        text: `⚠️ ${getUserFriendlyError(err, "chat_send")}`,
        ts: now(),
      });
    }
    setLoading(false);
  }

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      addMessage({
        id: uid(),
        role: "user",
        text: "📷 Photo sent for analysis",
        ts: now(),
        image: base64,
      });
      setLoading(true);
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: userId,
            message: "[PHOTO_SCREENING]",
            image: base64,
          }),
        });
        const data = await res.json();
        addMessage({ id: uid(), role: "asha", text: data.reply, ts: now() });
      } catch (err) {
        addMessage({
          id: uid(),
          role: "asha",
          text: `⚠️ ${getUserFriendlyError(err, "chat_photo")}`,
          ts: now(),
        });
      }
      setLoading(false);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
    setPhotoMode(false);
  }

  function handleSwitch(newId: string) {
    setUserId(newId);
    setMessages([]);
  }

  return (
    <div
      style={{
        height: "100dvh",
        overflow: "hidden",
        background: "#0a0e14",
        display: "flex",
        flexDirection: "column",
        fontFamily: "DM Sans, system-ui, sans-serif",
        boxSizing: "border-box",
      }}
    >
      {/* Account panel */}
      {showAccount && (
        <AccountPanel
          userId={userId}
          onSwitch={handleSwitch}
          onClose={() => setShowAccount(false)}
        />
      )}

      {/* Header */}
      <div
        style={{
          background: "#111620",
          borderBottom: "1px solid rgba(0,212,160,0.15)",
          height: 68,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            maxWidth: 920,
            margin: "0 auto",
            padding: "0 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            boxSizing: "border-box",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <AppLogo />
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 3,
                  background: online ? "#00d4a0" : "#ff4757",
                }}
              />
              <p
                style={{
                  fontSize: 9,
                  color: online ? "#00d4a0" : "#ff4757",
                  fontFamily: "DM Mono, monospace",
                }}
              >
                {syncing ? "Syncing..." : online ? "Online" : "Offline"}
              </p>
            </div>
          </div>

          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button
              className="motion-pressable"
              onClick={() => setLowData(!lowData)}
              style={{
                padding: "4px 9px",
                borderRadius: 6,
                fontSize: 10,
                cursor: "pointer",
                background: lowData
                  ? "rgba(0,212,160,0.1)"
                  : "rgba(255,255,255,0.04)",
                border: `1px solid ${lowData ? "rgba(0,212,160,0.3)" : "rgba(255,255,255,0.08)"}`,
                color: lowData ? "#00d4a0" : "#4a5568",
                fontFamily: "DM Mono, monospace",
              }}
            >
              <span
                style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
              >
                <Gauge size={11} />
                {lowData ? "2G" : "HD"}
              </span>
            </button>

            {/* Account button */}
            <button
              className="motion-pressable"
              onClick={() => setShowAccount(true)}
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                fontSize: 15,
                color: "#8892a4",
              }}
              title="Account & session settings"
            >
              <Settings size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* Quick commands */}
      <div
        style={{
          background: "#0d1118",
          flexShrink: 0,
          borderBottom: "1px solid rgba(255,255,255,0.04)",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 920,
            margin: "0 auto",
            padding: "7px 12px",
            display: "flex",
            gap: 6,
            overflowX: "auto",
          }}
        >
          {QUICK_COMMANDS.map(({ label, cmd }) => (
            <button
              className="motion-pressable"
              key={cmd}
              onClick={() => send(cmd)}
              style={{
                padding: "5px 12px",
                borderRadius: 100,
                flexShrink: 0,
                background: "rgba(0,212,160,0.06)",
                border: "1px solid rgba(0,212,160,0.18)",
                color: "#00a884",
                fontSize: 11,
                cursor: "pointer",
                fontFamily: "DM Sans, sans-serif",
                whiteSpace: "nowrap",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          background: "#0b141a",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 920,
            margin: "0 auto",
            padding: "14px 12px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              msg={msg}
              lowData={lowData}
              onOptionClick={send}
            />
          ))}
          {loading && (
            <div style={{ display: "flex", justifyContent: "flex-start" }}>
              <div
                style={{
                  background: "#1f2c34",
                  borderRadius: "2px 14px 14px 14px",
                  padding: "10px 16px",
                }}
              >
                <div style={{ display: "flex", gap: 4 }}>
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 3,
                        background: "#8696a0",
                        animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Photo mode banner */}
      {photoMode && (
        <div
          style={{
            background: "rgba(0,212,160,0.08)",
            borderTop: "1px solid rgba(0,212,160,0.2)",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 920,
              margin: "0 auto",
              padding: "8px 14px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <p
              style={{
                fontSize: 12,
                color: "#00d4a0",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <ImagePlus size={14} />
              Take or upload a photo of the patient's mouth
            </p>
            <button
              className="motion-pressable"
              onClick={() => fileRef.current?.click()}
              style={{
                padding: "6px 14px",
                borderRadius: 8,
                background: "#00d4a0",
                border: "none",
                color: "#0a0e14",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Choose
            </button>
          </div>
        </div>
      )}

      {/* Input bar */}
      <div
        style={{
          background: "#111620",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 920,
            margin: "0 auto",
            padding: "9px 12px",
          }}
        >
          <div style={{ display: "flex", gap: 7, alignItems: "flex-end" }}>
            <button
              className="motion-pressable"
              onClick={() => setPhotoMode(!photoMode)}
              title="Photo analysis"
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                flexShrink: 0,
                background: photoMode
                  ? "rgba(0,212,160,0.15)"
                  : "rgba(255,255,255,0.05)",
                border: `1px solid ${photoMode ? "rgba(0,212,160,0.4)" : "rgba(255,255,255,0.1)"}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                fontSize: 17,
              }}
            >
              <Camera size={16} />
            </button>

            <button
              className="motion-pressable"
              onClick={speech.listening ? speech.stop : speech.start}
              title="Voice input"
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                flexShrink: 0,
                background: speech.listening
                  ? "rgba(255,71,87,0.15)"
                  : "rgba(255,255,255,0.05)",
                border: `1px solid ${speech.listening ? "rgba(255,71,87,0.5)" : "rgba(255,255,255,0.1)"}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                fontSize: 17,
              }}
            >
              {speech.listening ? <Square size={16} /> : <Mic size={16} />}
            </button>

            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={
                speech.listening ? "Listening..." : "Type or speak..."
              }
              rows={1}
              style={{
                flex: 1,
                background: "#2a3942",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 10,
                padding: "10px 14px",
                color: "#e9edef",
                fontSize: 14,
                resize: "none",
                fontFamily: "DM Sans, system-ui, sans-serif",
                outline: "none",
                lineHeight: 1.5,
                maxHeight: 100,
                overflowY: "auto",
              }}
            />

            <button
              className="motion-pressable"
              onClick={() => send()}
              disabled={loading || !input.trim()}
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                flexShrink: 0,
                background: !loading && input.trim() ? "#00a884" : "#2a3942",
                border: "none",
                cursor: !loading && input.trim() ? "pointer" : "default",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 17,
                color: "#fff",
                transition: "background 0.2s",
              }}
            >
              <SendHorizontal size={16} />
            </button>
          </div>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handlePhoto}
        style={{ display: "none" }}
      />

      <style>{`
        @keyframes bounce { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-4px)} }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
      `}</style>
    </div>
  );
}

"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase, Patient, RiskTier } from "@/lib/supabase";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  AlertTriangle,
  Activity,
  Users,
  ArrowUpRight,
  RefreshCw,
  ClipboardList,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
} from "lucide-react";
import ClinicalHeader from "@/components/ClinicalHeader";
import ClinicalFooter from "@/components/ClinicalFooter";
import FollowUpTracker from "@/components/FollowUpTracker";
import {
  RiskBadge,
  StatCard,
  Skeleton,
  EmptyState,
  timeAgo,
  RISK_COLOR,
  RISK_BG,
  RISK_BORDER,
} from "@/components/ClinicalShared";
import dynamic from "next/dynamic";

// Load map client-side only (SVG projection needs window)
const CancerBurdenMap = dynamic(() => import("@/components/CancerBurdenMap"), {
  ssr: false,
  loading: () => (
    <div className="cl-skeleton" style={{ height: 300, borderRadius: 12 }} />
  ),
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function syncAgo(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ago`;
}

function buildWeeklyTrend(patients: Patient[]) {
  const weeks: Record<string, number> = {};
  patients.forEach((p) => {
    const d = new Date(p.created_at);
    const mon = new Date(d);
    mon.setDate(d.getDate() - d.getDay() + 1);
    const key = mon.toLocaleDateString("en-GB", {
      month: "short",
      day: "numeric",
    });
    weeks[key] = (weeks[key] || 0) + 1;
  });
  return Object.entries(weeks)
    .slice(-6)
    .map(([week, count]) => ({ week, count }));
}

// ── Urgent case card - hero element ──────────────────────────────────────────
function UrgentCaseCard({ patient }: { patient: Patient }) {
  const [open, setOpen] = useState(false);

  return (
    <div
      onClick={() => setOpen(!open)}
      className="cl-urgent-pulse"
      style={{
        background: "var(--cl-surface)",
        border: `1px solid var(--cl-high-border)`,
        borderLeft: `4px solid var(--cl-high)`,
        borderRadius: 12,
        padding: "16px 20px",
        cursor: "pointer",
        boxShadow: "var(--cl-shadow-md)",
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <RiskBadge tier="HIGH" />
          {patient.referral_generated && (
            <span className="cl-badge cl-badge-blue">
              <span
                style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
              >
                <ArrowUpRight size={10} />
                Referred
              </span>
            </span>
          )}
          <span
            style={{
              fontSize: 10,
              color: "var(--cl-text4)",
              fontFamily: "DM Mono, monospace",
            }}
          >
            {timeAgo(patient.created_at)}
          </span>
        </div>
        <div
          style={{
            padding: "4px 10px",
            borderRadius: 6,
            background: "var(--cl-high-bg)",
            border: "1px solid var(--cl-high-border)",
            fontSize: 10,
            color: "var(--cl-high)",
            fontWeight: 600,
          }}
        >
          NEEDS REFERRAL
        </div>
      </div>

      {/* Patient data */}
      <div
        style={{
          display: "flex",
          gap: 24,
          alignItems: "flex-end",
          marginBottom: 12,
        }}
      >
        {patient.age && (
          <div>
            <p
              style={{
                fontSize: 11,
                color: "var(--cl-text3)",
                marginBottom: 2,
              }}
            >
              Age
            </p>
            <p
              style={{
                fontFamily: "DM Mono, monospace",
                fontSize: 28,
                fontWeight: 400,
                color: "var(--cl-text)",
                lineHeight: 1,
              }}
            >
              {patient.age}
            </p>
          </div>
        )}
        {patient.cervical_probability != null && (
          <div>
            <p
              style={{
                fontSize: 11,
                color: "var(--cl-text3)",
                marginBottom: 2,
              }}
            >
              Cervical risk
            </p>
            <p
              style={{
                fontFamily: "DM Mono, monospace",
                fontSize: 28,
                fontWeight: 400,
                color: "var(--cl-high)",
                lineHeight: 1,
              }}
            >
              {Math.round(patient.cervical_probability * 100)}%
            </p>
          </div>
        )}
        {patient.oral_score != null && (
          <div>
            <p
              style={{
                fontSize: 11,
                color: "var(--cl-text3)",
                marginBottom: 2,
              }}
            >
              Oral score
            </p>
            <p
              style={{
                fontFamily: "DM Mono, monospace",
                fontSize: 28,
                fontWeight: 400,
                color: "var(--cl-elevated)",
                lineHeight: 1,
              }}
            >
              {patient.oral_score}
              <span style={{ fontSize: 14, color: "var(--cl-text4)" }}>
                /30
              </span>
            </p>
          </div>
        )}
      </div>

      {/* Risk factors */}
      {(patient.top_risk_factors || []).length > 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            marginBottom: 12,
          }}
        >
          {patient.top_risk_factors.slice(0, 3).map((f, i) => (
            <div
              key={i}
              style={{
                padding: "5px 10px",
                borderRadius: 6,
                background:
                  i === 0 ? "var(--cl-high-bg)" : "var(--cl-surface-2)",
                borderLeft: `2px solid ${i === 0 ? "var(--cl-high)" : "var(--cl-border-mid)"}`,
              }}
            >
              <p
                style={{
                  fontSize: 11,
                  color: i === 0 ? "var(--cl-high)" : "var(--cl-text2)",
                }}
              >
                {f}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Referral letter toggle */}
      {patient.referral_letter && (
        <div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setOpen(!open);
            }}
            style={{
              fontSize: 11,
              color: "var(--cl-primary)",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              fontFamily: "DM Sans, sans-serif",
            }}
          >
            <span
              style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
            >
              {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {open ? "Hide referral letter" : "View referral letter"}
            </span>
            {patient.referral_quality_score && (
              <span style={{ marginLeft: 6, color: "var(--cl-low)" }}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <CheckCircle2 size={11} />
                  Quality {patient.referral_quality_score}/10
                </span>
              </span>
            )}
          </button>
          {open && (
            <div className="referral-letter" style={{ marginTop: 10 }}>
              <div className="referral-letter-header">
                Referral Letter · ASHA Clinical Support
              </div>
              {patient.referral_letter}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Patient card (feed) ───────────────────────────────────────────────────────
function PatientFeedCard({
  patient,
  isNew,
  onClick,
}: {
  patient: Patient;
  isNew: boolean;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`cl-card cl-card-hover ${isNew ? "cl-fade-up" : ""}`}
      style={{
        padding: "12px 14px",
        cursor: "pointer",
        borderLeft: `3px solid ${RISK_COLOR[patient.risk_tier]}`,
        boxShadow: isNew
          ? `0 0 0 2px ${RISK_COLOR[patient.risk_tier]}30`
          : "var(--cl-shadow-sm)",
        minHeight: 156,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <RiskBadge tier={patient.risk_tier} size="sm" />
          {patient.referral_generated && (
            <span
              className="cl-badge cl-badge-blue"
              style={{ fontSize: 10, padding: "2px 8px" }}
            >
              <span
                style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
              >
                <ArrowUpRight size={10} />
                Referred
              </span>
            </span>
          )}
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 2,
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: 10,
              color: "var(--cl-text4)",
              fontFamily: "DM Mono, monospace",
            }}
          >
            {timeAgo(patient.created_at)}
          </span>
          <span
            style={{
              fontSize: 9,
              color: "var(--cl-text4)",
              fontFamily: "DM Sans, sans-serif",
              opacity: 0.8,
            }}
          >
            Tap for details
          </span>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "baseline",
          marginBottom: 8,
          flexWrap: "wrap",
        }}
      >
        {patient.age && (
          <span
            style={{
              fontFamily: "DM Mono, monospace",
              fontSize: 16,
              color: "var(--cl-text)",
              fontWeight: 500,
            }}
          >
            {patient.age}
            <span style={{ fontSize: 11, color: "var(--cl-text3)" }}>yr</span>
          </span>
        )}
        {patient.cervical_probability != null && (
          <span style={{ fontSize: 12, color: "var(--cl-text3)" }}>
            Cervical{" "}
            <span
              style={{
                fontFamily: "DM Mono, monospace",
                color: RISK_COLOR[patient.risk_tier],
              }}
            >
              {Math.round(patient.cervical_probability * 100)}%
            </span>
          </span>
        )}
        {patient.oral_score != null && (
          <span style={{ fontSize: 12, color: "var(--cl-text3)" }}>
            Oral{" "}
            <span
              style={{
                fontFamily: "DM Mono, monospace",
                color: "var(--cl-elevated)",
              }}
            >
              {patient.oral_score}/30
            </span>
          </span>
        )}
      </div>

      {!!patient.top_risk_factors?.[0] && (
        <p
          style={{
            marginTop: 2,
            fontSize: 11,
            color: "var(--cl-text3)",
            lineHeight: 1.35,
          }}
        >
          <span style={{ color: "var(--cl-text4)" }}>Key factor: </span>
          {patient.top_risk_factors[0]}
        </p>
      )}
    </div>
  );
}

function RegistryPatientModal({
  patient,
  onClose,
}: {
  patient: Patient;
  onClose: () => void;
}) {
  return (
    <div
      onClick={onClose}
      className="modal-overlay-enter"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(5, 8, 12, 0.64)",
        backdropFilter: "blur(3px)",
        zIndex: 220,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        overflow: "hidden",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="cl-card modal-panel-enter"
        style={{
          width: "min(900px, 100%)",
          maxHeight: "86vh",
          overflow: "auto",
          overscrollBehavior: "contain",
          padding: "16px 18px",
          borderLeft: `4px solid ${RISK_COLOR[patient.risk_tier]}`,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <RiskBadge tier={patient.risk_tier} />
            <span style={{ fontSize: 11, color: "var(--cl-text3)" }}>
              {patient.age ? `${patient.age}yr` : "Unknown age"}
              {patient.cervical_probability != null
                ? ` · Cervical ${Math.round(patient.cervical_probability * 100)}%`
                : ""}
              {patient.oral_score != null
                ? ` · Oral ${patient.oral_score}/30`
                : ""}
            </span>
          </div>
          <button
            className="motion-pressable"
            onClick={onClose}
            style={{
              background: "var(--cl-surface-2)",
              border: "1px solid var(--cl-border)",
              borderRadius: 8,
              color: "var(--cl-text3)",
              fontSize: 12,
              padding: "6px 10px",
              cursor: "pointer",
              fontFamily: "DM Sans, sans-serif",
            }}
          >
            Close
          </button>
        </div>

        {(patient.top_risk_factors || []).length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <p className="cl-label" style={{ marginBottom: 6 }}>
              Risk factors
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {(patient.top_risk_factors || []).map((f, i) => (
                <span
                  key={i}
                  style={{
                    padding: "4px 8px",
                    fontSize: 11,
                    borderRadius: 6,
                    background:
                      i === 0
                        ? RISK_BG[patient.risk_tier]
                        : "var(--cl-surface-2)",
                    color:
                      i === 0
                        ? RISK_COLOR[patient.risk_tier]
                        : "var(--cl-text3)",
                    border: `1px solid ${i === 0 ? RISK_BORDER[patient.risk_tier] : "var(--cl-border)"}`,
                  }}
                >
                  {f}
                </span>
              ))}
            </div>
          </div>
        )}

        {patient.referral_letter ? (
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <p className="cl-label">Referral letter</p>
              {patient.referral_quality_score != null && (
                <span style={{ fontSize: 11, color: "var(--cl-low)" }}>
                  Quality {patient.referral_quality_score}/10
                </span>
              )}
            </div>
            <div
              className="referral-letter"
              style={{
                maxHeight: 280,
                overflowY: "auto",
                fontSize: 11,
              }}
            >
              <div className="referral-letter-header">
                Referral Letter · ASHA Clinical Support
              </div>
              {patient.referral_letter}
            </div>
          </div>
        ) : (
          <p style={{ fontSize: 12, color: "var(--cl-text4)" }}>
            No referral letter available.
          </p>
        )}
      </div>
    </div>
  );
}

// ── Live status indicator ─────────────────────────────────────────────────────
function LiveIndicator({
  connected,
  lastSync,
}: {
  connected: boolean;
  lastSync: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 12px",
        borderRadius: 100,
        background: connected ? "var(--cl-primary-bg)" : "var(--cl-surface-2)",
        border: `1px solid ${connected ? "rgba(22,101,52,0.2)" : "var(--cl-border)"}`,
      }}
    >
      <span
        className="live-dot"
        style={{
          display: "block",
          width: 6,
          height: 6,
          borderRadius: 3,
          background: connected ? "var(--cl-primary)" : "var(--cl-text4)",
        }}
      />
      <span
        style={{
          fontSize: 11,
          fontFamily: "DM Mono, monospace",
          color: connected ? "var(--cl-primary)" : "var(--cl-text4)",
          fontWeight: connected ? 500 : 400,
        }}
      >
        {connected
          ? `Live · ${lastSync > 0 ? syncAgo(lastSync) : "synced"}`
          : "Connecting"}
      </span>
    </div>
  );
}

// ── Main dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [lastSync, setLastSync] = useState(0);
  const [registrySelected, setRegistrySelected] = useState<Patient | null>(
    null,
  );
  const [registryOpen, setRegistryOpen] = useState(false);
  const syncRef = useRef<number>(0);

  useEffect(() => {
    if (!registryOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [registryOpen]);

  const fetchPatients = useCallback(async () => {
    const { data } = await supabase
      .from("patients")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data) {
      setPatients(data as Patient[]);
      syncRef.current = Date.now();
      setLastSync(0);
    }
    setLoading(false);
  }, []);

  // Sync timer
  useEffect(() => {
    const t = setInterval(() => {
      if (syncRef.current > 0) setLastSync(Date.now() - syncRef.current);
    }, 5000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    fetchPatients();
    const ch = supabase
      .channel("asha_dashboard_live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "patients" },
        (payload) => {
          const p = payload.new as Patient;
          setPatients((prev) => [p, ...prev]);
          setNewIds((prev) => new Set([...prev, p.id]));
          syncRef.current = Date.now();
          setLastSync(0);
          setTimeout(
            () =>
              setNewIds((prev) => {
                const n = new Set(prev);
                n.delete(p.id);
                return n;
              }),
            10000,
          );
        },
      )
      .subscribe((s) => setConnected(s === "SUBSCRIBED"));
    return () => {
      supabase.removeChannel(ch);
    };
  }, [fetchPatients]);

  // Derived stats
  const total = patients.length;
  const high = patients.filter((p) => p.risk_tier === "HIGH").length;
  const elevated = patients.filter((p) => p.risk_tier === "ELEVATED").length;
  const referred = patients.filter((p) => p.referral_generated).length;
  const today = patients.filter(
    (p) => new Date(p.created_at).toDateString() === new Date().toDateString(),
  ).length;

  const mostUrgent =
    patients.find((p) => p.risk_tier === "HIGH" && !p.referral_generated) ||
    patients.find((p) => p.risk_tier === "HIGH");

  const weeklyTrend = buildWeeklyTrend(patients);

  // For map: count patients per country code based on CHW phone prefix
  const patientsByCountry: Record<string, number> = {};
  patients.forEach((p) => {
    const phone = p.chw_phone || "";
    if (phone.startsWith("+254") || phone.startsWith("254")) {
      patientsByCountry["KEN"] = (patientsByCountry["KEN"] || 0) + 1;
    } else if (phone.startsWith("+91") || phone.startsWith("91")) {
      patientsByCountry["IND"] = (patientsByCountry["IND"] || 0) + 1;
    } else if (phone.startsWith("+234") || phone.startsWith("234")) {
      patientsByCountry["NGA"] = (patientsByCountry["NGA"] || 0) + 1;
    } else if (phone.startsWith("+255") || phone.startsWith("255")) {
      patientsByCountry["TZA"] = (patientsByCountry["TZA"] || 0) + 1;
    }
  });

  return (
    <div
      className="clinical"
      style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}
    >
      <ClinicalHeader
        rightSlot={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <LiveIndicator connected={connected} lastSync={lastSync} />
            <button
              onClick={fetchPatients}
              className="motion-pressable"
              style={{
                width: 32,
                height: 32,
                borderRadius: 7,
                background: "var(--cl-surface-2)",
                border: "1px solid var(--cl-border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                fontSize: 14,
                color: "var(--cl-text3)",
                transition: "all 0.15s",
              }}
              title="Refresh"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        }
      />

      <main
        style={{
          flex: 1,
          maxWidth: 1280,
          margin: "0 auto",
          padding: "24px",
          width: "100%",
        }}
      >
        {/* ── Impact bar ─────────────────────────────────────────────────── */}
        {!loading && total > 0 && (
          <div
            className="cl-fade-up"
            style={{
              background: "var(--cl-primary-bg)",
              border: "1px solid rgba(22,101,52,0.15)",
              borderRadius: 10,
              padding: "10px 16px",
              marginBottom: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  background: "var(--cl-primary)",
                }}
              />
              <p
                style={{
                  fontSize: 12,
                  color: "var(--cl-primary)",
                  fontWeight: 500,
                }}
              >
                {total} patients screened this month
                {high > 0 && ` · ${high} high-risk detected`}
                {referred > 0 && ` · ${referred} referred to clinic`}
                {` · Est. $0.00 infrastructure cost`}
              </p>
            </div>
            <p
              style={{
                fontSize: 11,
                color: "var(--cl-primary)",
                opacity: 0.7,
                fontFamily: "DM Mono, monospace",
              }}
            >
              SDG 3.1 · 3.4 · 3.8
            </p>
          </div>
        )}

        {/* ── Hero: most urgent patient ─────────────────────────────────── */}
        {!loading && mostUrgent && (
          <div className="cl-fade-up" style={{ marginBottom: 20 }}>
            <p
              className="cl-label"
              style={{ marginBottom: 8, color: "var(--cl-high)" }}
            >
              <span
                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                <AlertTriangle size={14} />
                Most urgent - immediate referral required
              </span>
            </p>
            <UrgentCaseCard patient={mostUrgent} />
          </div>
        )}

        {/* ── Stat cards ────────────────────────────────────────────────── */}
        <div
          className="motion-enter"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 12,
            marginBottom: 20,
          }}
        >
          {loading ? (
            [1, 2, 3, 4].map((i) => <Skeleton key={i} height={100} />)
          ) : (
            <>
              <StatCard
                label="Total Screened"
                value={total}
                sub={`${today} today`}
                accentColor="var(--cl-primary)"
                icon={<Users size={14} />}
              />
              <StatCard
                label="High Risk"
                value={high}
                sub={
                  total
                    ? `${Math.round((100 * high) / total)}% of total`
                    : undefined
                }
                accentColor="var(--cl-high)"
                icon={<AlertTriangle size={14} />}
              />
              <StatCard
                label="Elevated Risk"
                value={elevated}
                sub={
                  total
                    ? `${Math.round((100 * elevated) / total)}% of total`
                    : undefined
                }
                accentColor="var(--cl-elevated)"
                icon={<Activity size={14} />}
              />
              <StatCard
                label="Referred"
                value={referred}
                sub={
                  total
                    ? `${Math.round((100 * referred) / total)}% rate`
                    : undefined
                }
                accentColor="var(--cl-blue)"
                icon={<ArrowUpRight size={14} />}
              />
            </>
          )}
        </div>

        {/* ── Middle: map + trend + active cases ───────────────────────── */}
        <div
          className="motion-enter motion-enter-slow"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 320px",
            gap: 16,
            marginBottom: 20,
            animationDelay: "80ms",
          }}
        >
          {/* Left: map */}
          <div className="cl-card" style={{ padding: "18px 20px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: 14,
              }}
            >
              <div>
                <p
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--cl-text)",
                    marginBottom: 2,
                  }}
                >
                  Cervical cancer burden
                </p>
                <p style={{ fontSize: 11, color: "var(--cl-text3)" }}>
                  Sub-Saharan Africa + South Asia · ASHA deployment regions
                </p>
              </div>
              <span
                style={{
                  fontSize: 9,
                  color: "var(--cl-text4)",
                  fontFamily: "DM Mono, monospace",
                  padding: "3px 8px",
                  borderRadius: 4,
                  background: "var(--cl-surface-2)",
                  border: "1px solid var(--cl-border)",
                }}
              >
                GLOBOCAN 2020
              </span>
            </div>
            {loading ? (
              <Skeleton height={300} />
            ) : (
              <CancerBurdenMap
                patientsByCountry={patientsByCountry}
                height={300}
              />
            )}
          </div>

          {/* Right: trend + active cases needing action */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Weekly trend */}
            <div className="cl-card" style={{ padding: "16px 18px" }}>
              <p
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--cl-text)",
                  marginBottom: 14,
                }}
              >
                Weekly screenings
              </p>
              {loading ? (
                <Skeleton height={80} />
              ) : weeklyTrend.length < 2 ? (
                <p
                  style={{
                    fontSize: 11,
                    color: "var(--cl-text4)",
                    textAlign: "center",
                    padding: "20px 0",
                  }}
                >
                  Collecting data...
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={80}>
                  <AreaChart
                    data={weeklyTrend}
                    margin={{ top: 4, right: 0, left: -28, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient
                        id="trendGrad"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="#166534"
                          stopOpacity={0.2}
                        />
                        <stop
                          offset="95%"
                          stopColor="#166534"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="week"
                      tick={{ fontSize: 9, fill: "#94a3b8" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 9, fill: "#94a3b8" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "white",
                        border: "1px solid #e2e8f0",
                        borderRadius: 8,
                        fontSize: 11,
                        boxShadow: "0 4px 6px rgba(15,23,42,0.07)",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke="#166534"
                      strokeWidth={2}
                      fill="url(#trendGrad)"
                      dot={{ r: 3, fill: "#166534" }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Cases needing action */}
            <div className="cl-card" style={{ padding: "16px 18px", flex: 1 }}>
              <p
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--cl-text)",
                  marginBottom: 10,
                }}
              >
                Needs action
                {high + elevated > 0 && (
                  <span
                    style={{
                      marginLeft: 8,
                      fontSize: 10,
                      padding: "2px 8px",
                      borderRadius: 100,
                      background: "var(--cl-high-bg)",
                      color: "var(--cl-high)",
                      border: "1px solid var(--cl-high-border)",
                    }}
                  >
                    {high + elevated}
                  </span>
                )}
              </p>
              {loading ? (
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 8 }}
                >
                  {[1, 2].map((i) => (
                    <Skeleton key={i} height={52} />
                  ))}
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    maxHeight: 200,
                    overflowY: "auto",
                  }}
                >
                  {patients
                    .filter((p) => p.risk_tier !== "LOW")
                    .slice(0, 5)
                    .map((p) => (
                      <div
                        key={p.id}
                        style={{
                          padding: "8px 10px",
                          background: RISK_BG[p.risk_tier],
                          border: `1px solid ${RISK_BORDER[p.risk_tier]}`,
                          borderRadius: 8,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            alignItems: "center",
                          }}
                        >
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: 3,
                              flexShrink: 0,
                              background: RISK_COLOR[p.risk_tier],
                            }}
                          />
                          <div>
                            <p
                              style={{
                                fontSize: 11,
                                fontWeight: 500,
                                color: RISK_COLOR[p.risk_tier],
                                fontFamily: "DM Mono, monospace",
                              }}
                            >
                              {p.age}yr
                              {p.cervical_probability != null &&
                                ` · ${Math.round(p.cervical_probability * 100)}%`}
                              {p.oral_score != null && ` · ${p.oral_score}/30`}
                            </p>
                            <p
                              style={{
                                fontSize: 10,
                                color: "var(--cl-text3)",
                                marginTop: 1,
                              }}
                            >
                              {(p.top_risk_factors || [])[0]?.slice(0, 32)}
                            </p>
                          </div>
                        </div>
                        <span
                          style={{
                            fontSize: 9,
                            color: "var(--cl-text4)",
                            fontFamily: "DM Mono, monospace",
                            flexShrink: 0,
                          }}
                        >
                          {timeAgo(p.created_at)}
                        </span>
                      </div>
                    ))}
                  {patients.filter((p) => p.risk_tier !== "LOW").length ===
                    0 && (
                    <p
                      style={{
                        fontSize: 11,
                        color: "var(--cl-text4)",
                        textAlign: "center",
                        padding: "16px 0",
                      }}
                    >
                      All patients are stable
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Referral follow-through ───────────────────────────────────── */}
        <div
          className="motion-enter"
          style={{ marginBottom: 20, animationDelay: "120ms" }}
        >
          <FollowUpTracker />
        </div>

        {/* ── Full patient registry ─────────────────────────────────────── */}
        <div
          className="cl-card motion-enter motion-enter-slow"
          style={{ padding: "20px 22px", animationDelay: "140ms" }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            <div>
              <p
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--cl-text)",
                }}
              >
                Patient registry
              </p>
              <p
                style={{ fontSize: 11, color: "var(--cl-text3)", marginTop: 2 }}
              >
                {total} total · tap any card to expand referral letter
              </p>
            </div>
            {high > 0 && (
              <div
                style={{
                  padding: "6px 14px",
                  borderRadius: 100,
                  background: "var(--cl-high-bg)",
                  border: "1px solid var(--cl-high-border)",
                  fontSize: 11,
                  color: "var(--cl-high)",
                  fontWeight: 600,
                }}
              >
                {high} need immediate referral
              </div>
            )}
          </div>

          {loading ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                gap: 10,
              }}
            >
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} height={100} />
              ))}
            </div>
          ) : patients.length === 0 ? (
            <EmptyState
              icon={<ClipboardList size={32} />}
              title="Your CHWs are in the field"
              subtitle="Screenings will appear here in real time as patients are assessed via WhatsApp."
            />
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                gap: 10,
                maxHeight: 600,
                overflowY: "auto",
                paddingRight: 4,
              }}
            >
              {patients.map((p, i) => (
                <div
                  key={p.id}
                  className="cl-fade-up"
                  style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
                >
                  <PatientFeedCard
                    patient={p}
                    isNew={newIds.has(p.id)}
                    onClick={() => {
                      setRegistrySelected(p);
                      setRegistryOpen(true);
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <ClinicalFooter />
      {registryOpen && registrySelected && (
        <RegistryPatientModal
          patient={registrySelected}
          onClose={() => setRegistryOpen(false)}
        />
      )}
    </div>
  );
}

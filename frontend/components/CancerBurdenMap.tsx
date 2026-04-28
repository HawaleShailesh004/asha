"use client";

/**
 * ASHA Cancer Burden Map
 *
 * Data sources:
 * - GLOBOCAN 2020 / WHO Global Cervical Cancer Elimination Initiative
 *   Lancet Global Health, Dec 2022 (DOI: 10.1016/S2214-109X(22)00501-0)
 * - Age-standardised incidence rates (ASR) per 100,000 women-years
 *
 * Countries shown: Sub-Saharan Africa + South Asia (ASHA deployment regions)
 */

import { useState } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  ZoomableGroup,
} from "react-simple-maps";

// ── WHO/GLOBOCAN 2020 ASR data (cervical cancer per 100,000 women-years) ─────
// Source: Lancet Global Health 2022
const BURDEN_DATA: Record<
  string,
  { asr: number; deaths: number; screening: number }
> = {
  // East Africa - highest burden
  ESW: { asr: 84.6, deaths: 648, screening: 10 }, // Eswatini (highest globally)
  ZMB: { asr: 70.1, deaths: 7200, screening: 12 }, // Zambia
  MWI: { asr: 67.9, deaths: 7100, screening: 11 }, // Malawi
  ZWE: { asr: 65.2, deaths: 5800, screening: 14 }, // Zimbabwe
  MOZ: { asr: 60.4, deaths: 9200, screening: 13 }, // Mozambique
  TZA: { asr: 54.3, deaths: 11200, screening: 7 }, // Tanzania
  UGA: { asr: 54.1, deaths: 10800, screening: 5 }, // Uganda
  KEN: { asr: 40.2, deaths: 3591, screening: 16 }, // Kenya - ASHA primary target
  ETH: { asr: 28.5, deaths: 14200, screening: 3 }, // Ethiopia
  RWA: { asr: 38.6, deaths: 1800, screening: 8 }, // Rwanda
  BDI: { asr: 42.1, deaths: 1600, screening: 4 }, // Burundi
  // West Africa
  NGA: { asr: 25.0, deaths: 26000, screening: 8 }, // Nigeria - OTU's country
  GHA: { asr: 26.3, deaths: 3800, screening: 7 }, // Ghana
  CMR: { asr: 29.1, deaths: 3900, screening: 6 }, // Cameroon
  CIV: { asr: 24.7, deaths: 3200, screening: 5 }, // Côte d'Ivoire
  SEN: { asr: 27.8, deaths: 2200, screening: 4 }, // Senegal
  // Central / Southern Africa
  COD: { asr: 35.2, deaths: 22000, screening: 3 }, // DRC
  COG: { asr: 31.4, deaths: 1100, screening: 4 }, // Congo
  AGO: { asr: 38.7, deaths: 7100, screening: 4 }, // Angola
  ZAF: { asr: 22.0, deaths: 7200, screening: 35 }, // South Africa (better screening)
  NAM: { asr: 43.5, deaths: 520, screening: 20 }, // Namibia
  BWA: { asr: 41.8, deaths: 400, screening: 18 }, // Botswana
  // South Asia
  IND: { asr: 18.0, deaths: 81000, screening: 9 }, // India - Priya's country
  BGD: { asr: 17.5, deaths: 8000, screening: 6 }, // Bangladesh
  PAK: { asr: 7.3, deaths: 4200, screening: 3 }, // Pakistan
  LKA: { asr: 10.5, deaths: 1200, screening: 11 }, // Sri Lanka
};

// Color scale based on ASR burden
function getBurdenColor(iso: string, hovered: boolean): string {
  const d = BURDEN_DATA[iso];
  if (!d) return hovered ? "#e2e8f0" : "#f1f5f9"; // Grey for unlisted countries

  const asr = d.asr;
  // Red-orange gradient: low burden → high burden
  // Using accessible colors on white background
  if (hovered) {
    if (asr >= 60) return "#dc2626"; // red-600
    if (asr >= 45) return "#ea580c"; // orange-600
    if (asr >= 30) return "#d97706"; // amber-600
    if (asr >= 15) return "#65a30d"; // lime-600
    return "#16a34a"; // green-600
  }
  if (asr >= 60) return "#fca5a5"; // red-300
  if (asr >= 45) return "#fdba74"; // orange-300
  if (asr >= 30) return "#fcd34d"; // amber-300
  if (asr >= 15) return "#bef264"; // lime-300
  return "#bbf7d0"; // green-200
}

// ASHA active deployment markers
const DEPLOYMENT_MARKERS = [
  { name: "Kenya", coords: [37.9, -0.5] as [number, number], active: true },
  { name: "Nigeria", coords: [8.7, 9.1] as [number, number], active: true },
  { name: "Tanzania", coords: [34.9, -6.4] as [number, number], active: false },
  { name: "India", coords: [78.9, 20.6] as [number, number], active: true },
  { name: "Uganda", coords: [32.3, 1.4] as [number, number], active: false },
];

// Natural Earth topojson for Africa + South Asia
// Using the standard world topo but filtered on render
const GEO_URL =
  "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

// ISO numeric to ISO alpha-3 mapping for key countries
const ISO_MAP: Record<string, string> = {
  "404": "KEN",
  "566": "NGA",
  "834": "TZA",
  "356": "IND",
  "800": "UGA",
  "716": "ZWE",
  "508": "MOZ",
  "854": "BFA",
  "710": "ZAF",
  "504": "MAR",
  "288": "GHA",
  "120": "CMR",
  "180": "COD",
  "174": "COM",
  "646": "RWA",
  "108": "BDI",
  "540": "MOZ",
  "024": "AGO",
  "516": "NAM",
  "072": "BWA",
  "748": "ESW",
  "454": "MWI",
  "894": "ZMB",
  "690": "SYC",
  "818": "EGY",
  "012": "DZA",
  "788": "TUN",
  "434": "LBY",
  "729": "SDN",
  "706": "SOM",
  "231": "ETH",
  "694": "SLE",
  "324": "GIN",
  "686": "SEN",
  "466": "MLI",
  "562": "NER",
  "204": "BEN",
  "768": "TGO",
  "288": "GHA",
  "384": "CIV",
  "276": "LBR",
  "624": "GNB",
  "270": "GMB",
  "132": "CPV",
  "050": "BGD",
  "586": "PAK",
  "144": "LKA",
  "524": "NPL",
  "064": "BTN",
};

interface TooltipData {
  name: string;
  iso: string;
  x: number;
  y: number;
}

interface BurdenMapProps {
  /** Live patient data from Supabase - used to show real deployment activity */
  patientsByCountry?: Record<string, number>;
  className?: string;
  height?: number;
}

export default function CancerBurdenMap({
  patientsByCountry = {},
  className = "",
  height = 340,
}: BurdenMapProps) {
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [hoveredIso, setHovered] = useState<string | null>(null);

  // Determine which countries to show (Africa + South Asia)
  // Using a bounding box approach: lat -35 to 40, lon -20 to 90
  function isInRegion(geo: any): boolean {
    const id = geo.id?.toString().padStart(3, "0");
    const iso = ISO_MAP[id] || "";
    // Show if we have burden data for this country
    if (BURDEN_DATA[iso]) return true;
    // Also show surrounding geography for context (North Africa, Middle East)
    const contextCountries = [
      "012",
      "818",
      "504",
      "434",
      "788",
      "729",
      "706",
      "231",
      "706",
      "682",
      "275",
      "400",
      "368",
      "364",
      "760",
      "422",
    ];
    if (contextCountries.includes(id)) return true;
    return false;
  }

  const maxPatients = Math.max(...Object.values(patientsByCountry), 1);

  return (
    <div
      data-map
      className={className}
      style={{ position: "relative", width: "100%", height }}
    >
      {/* Legend */}
      <div
        style={{
          position: "absolute",
          top: 8,
          left: 8,
          zIndex: 10,
          background: "rgba(255,255,255,0.92)",
          border: "1px solid var(--cl-border)",
          borderRadius: 8,
          padding: "8px 10px",
          boxShadow: "var(--cl-shadow-sm)",
        }}
      >
        <p
          style={{
            fontSize: 9,
            color: "var(--cl-text3)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            marginBottom: 6,
          }}
        >
          ASR per 100k women
        </p>
        {[
          { color: "#fca5a5", label: "60+ (critical)" },
          { color: "#fdba74", label: "45–60 (severe)" },
          { color: "#fcd34d", label: "30–45 (high)" },
          { color: "#bef264", label: "15–30 (moderate)" },
          { color: "#bbf7d0", label: "<15 (lower)" },
        ].map(({ color, label }) => (
          <div
            key={label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              marginBottom: 3,
            }}
          >
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                background: color,
                border: "1px solid rgba(0,0,0,0.1)",
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 9, color: "var(--cl-text2)" }}>
              {label}
            </span>
          </div>
        ))}
        <div
          style={{
            borderTop: "1px solid var(--cl-border)",
            marginTop: 6,
            paddingTop: 5,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              marginBottom: 3,
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                background: "#16a34a",
                border: "2px solid #fff",
                boxShadow: "0 0 0 1.5px #16a34a",
              }}
            />
            <span style={{ fontSize: 9, color: "var(--cl-text2)" }}>
              ASHA active
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                background: "#94a3b8",
                border: "2px solid #fff",
                boxShadow: "0 0 0 1.5px #94a3b8",
              }}
            />
            <span style={{ fontSize: 9, color: "var(--cl-text2)" }}>
              Planned
            </span>
          </div>
        </div>
      </div>

      {/* Source citation */}
      <div
        style={{
          position: "absolute",
          bottom: 4,
          right: 6,
          zIndex: 10,
        }}
      >
        <p style={{ fontSize: 8, color: "var(--cl-text4)" }}>
          Source: GLOBOCAN 2020 / WHO · Lancet Glob Health 2022
        </p>
      </div>

      {/* Tooltip */}
      {tooltip && BURDEN_DATA[tooltip.iso] && (
        <div
          style={{
            position: "absolute",
            left: Math.min(tooltip.x + 12, 300),
            top: Math.max(tooltip.y - 60, 4),
            zIndex: 20,
            background: "var(--cl-surface)",
            border: "1px solid var(--cl-border)",
            borderRadius: 8,
            padding: "8px 12px",
            boxShadow: "var(--cl-shadow-md)",
            pointerEvents: "none",
            minWidth: 160,
          }}
        >
          <p
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--cl-text)",
              marginBottom: 4,
            }}
          >
            {tooltip.name}
          </p>
          {BURDEN_DATA[tooltip.iso] &&
            (() => {
              const d = BURDEN_DATA[tooltip.iso];
              return (
                <>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 16,
                      marginBottom: 2,
                    }}
                  >
                    <span style={{ fontSize: 10, color: "var(--cl-text3)" }}>
                      ASR (incidence)
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        fontFamily: "DM Mono, monospace",
                        color: "var(--cl-high)",
                        fontWeight: 500,
                      }}
                    >
                      {d.asr} / 100k
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 16,
                      marginBottom: 2,
                    }}
                  >
                    <span style={{ fontSize: 10, color: "var(--cl-text3)" }}>
                      Annual deaths
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        fontFamily: "DM Mono, monospace",
                        color: "var(--cl-text)",
                      }}
                    >
                      ~{d.deaths.toLocaleString()}
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 16,
                    }}
                  >
                    <span style={{ fontSize: 10, color: "var(--cl-text3)" }}>
                      Ever screened
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        fontFamily: "DM Mono, monospace",
                        color:
                          d.screening < 15 ? "var(--cl-high)" : "var(--cl-low)",
                      }}
                    >
                      {d.screening}%
                    </span>
                  </div>
                  {patientsByCountry[tooltip.iso] > 0 && (
                    <div
                      style={{
                        marginTop: 6,
                        paddingTop: 6,
                        borderTop: "1px solid var(--cl-border)",
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    >
                      <span
                        style={{ fontSize: 10, color: "var(--cl-primary)" }}
                      >
                        ASHA screened
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          fontFamily: "DM Mono, monospace",
                          color: "var(--cl-primary)",
                          fontWeight: 500,
                        }}
                      >
                        {patientsByCountry[tooltip.iso]}
                      </span>
                    </div>
                  )}
                </>
              );
            })()}
        </div>
      )}

      <ComposableMap
        projection="geoMercator"
        projectionConfig={{
          center: [22, 2], // Centered on Africa
          scale: height * 1.15,
        }}
        width={600}
        height={height}
        style={{ width: "100%", height: "100%" }}
      >
        <Geographies geography={GEO_URL}>
          {({ geographies }) =>
            geographies.filter(isInRegion).map((geo) => {
              const id = geo.id?.toString().padStart(3, "0");
              const iso = ISO_MAP[id] || "";
              const isHovered = hoveredIso === iso;

              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={getBurdenColor(iso, isHovered)}
                  stroke="#ffffff"
                  strokeWidth={0.5}
                  style={{
                    default: { outline: "none", transition: "fill 0.15s" },
                    hover: { outline: "none", cursor: "pointer" },
                    pressed: { outline: "none" },
                  }}
                  onMouseEnter={(e) => {
                    setHovered(iso);
                    const containerRect = (e.target as SVGElement)
                      .closest("[data-map]")
                      ?.getBoundingClientRect();
                    if (containerRect) {
                      setTooltip({
                        name: geo.properties.name || iso,
                        iso,
                        x: e.clientX - containerRect.left,
                        y: e.clientY - containerRect.top,
                      });
                    }
                  }}
                  onMouseLeave={() => {
                    setHovered(null);
                    setTooltip(null);
                  }}
                />
              );
            })
          }
        </Geographies>

        {/* ASHA deployment markers */}
        {DEPLOYMENT_MARKERS.map(({ name, coords, active }) => (
          <Marker key={name} coordinates={coords}>
            {/* Pulse ring for active deployments */}
            {active && (
              <circle
                r={14}
                fill="rgba(22,163,74,0.12)"
                stroke="rgba(22,163,74,0.3)"
                strokeWidth={1}
                style={{ animation: "cl-pulse 2.5s ease-in-out infinite" }}
              />
            )}
            <circle
              r={5}
              fill={active ? "#16a34a" : "#94a3b8"}
              stroke="#ffffff"
              strokeWidth={2}
              style={{
                filter: active
                  ? "drop-shadow(0 0 4px rgba(22,163,74,0.6))"
                  : "none",
              }}
            />
            <text
              textAnchor="middle"
              y={-10}
              style={{
                fontSize: 9,
                fill: active ? "#166534" : "#64748b",
                fontFamily: "DM Sans, sans-serif",
                fontWeight: active ? 600 : 400,
                pointerEvents: "none",
              }}
            >
              {name}
            </text>
          </Marker>
        ))}
      </ComposableMap>

      <style>{`
        @keyframes cl-pulse {
          0%,100% { transform: scale(1); opacity: 0.6; }
          50%      { transform: scale(1.4); opacity: 0.2; }
        }
      `}</style>
    </div>
  );
}

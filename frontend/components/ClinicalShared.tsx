'use client'

import type { ReactNode } from 'react'
import { AlertTriangle, CircleDot, CheckCircle2 } from 'lucide-react'

export type RiskTier = 'HIGH' | 'ELEVATED' | 'LOW'

// ── Risk Badge ─────────────────────────────────────────────────────────────
const TIER_CLASS: Record<RiskTier, string>  = {
  HIGH:     'cl-badge cl-badge-high',
  ELEVATED: 'cl-badge cl-badge-elevated',
  LOW:      'cl-badge cl-badge-low',
}

const TIER_ICON: Record<RiskTier, ReactNode> = {
  HIGH: <AlertTriangle size={12} />,
  ELEVATED: <CircleDot size={12} />,
  LOW: <CheckCircle2 size={12} />,
}

export function RiskBadge({ tier, size = 'md' }: { tier: RiskTier; size?: 'sm' | 'md' }) {
  return (
    <span
      className={TIER_CLASS[tier]}
      style={{
        fontSize: size === 'sm' ? 10 : 11,
        padding: size === 'sm' ? '2px 8px' : '3px 10px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
      }}
    >
      {TIER_ICON[tier]} <span>{tier}</span>
    </span>
  )
}

// ── Stat Card ──────────────────────────────────────────────────────────────
export function StatCard({
  label, value, sub, accentColor, icon
}: {
  label:       string
  value:       number | string
  sub?:        string
  accentColor: string
  icon?:       ReactNode
}) {
  return (
    <div className="cl-card" style={{ padding: '18px 20px' }}>
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        marginBottom: 10,
      }}>
        <p className="cl-label">{label}</p>
        {icon && (
          <div style={{
            width: 28, height: 28, borderRadius: 7,
            background: `${accentColor}12`,
            border: `1px solid ${accentColor}25`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13,
          }}>{icon}</div>
        )}
      </div>
      <p className="cl-stat" style={{ color: accentColor === 'var(--cl-text)' ? 'var(--cl-text)' : accentColor }}>
        {value}
      </p>
      {sub && (
        <p style={{ fontSize: 11, color: 'var(--cl-text4)', marginTop: 4 }}>{sub}</p>
      )}
      {/* Accent bar at bottom */}
      <div style={{
        height: 2, borderRadius: 1,
        background: accentColor,
        opacity: 0.25,
        marginTop: 14,
        marginLeft: -20, marginRight: -20, marginBottom: -18,
      }} />
    </div>
  )
}

// ── Skeleton ───────────────────────────────────────────────────────────────
export function Skeleton({ height, borderRadius = 8 }: { height: number; borderRadius?: number }) {
  return (
    <div className="cl-skeleton" style={{ height, borderRadius }} />
  )
}

// ── Empty State ────────────────────────────────────────────────────────────
export function EmptyState({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle?: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 24px' }}>
      <div style={{ opacity: 0.35, marginBottom: 12, display: 'flex', justifyContent: 'center' }}>{icon}</div>
      <p style={{ fontSize: 14, color: 'var(--cl-text3)', fontWeight: 500 }}>{title}</p>
      {subtitle && (
        <p style={{ fontSize: 12, color: 'var(--cl-text4)', marginTop: 4, maxWidth: 280, margin: '6px auto 0' }}>
          {subtitle}
        </p>
      )}
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────
export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m    = Math.floor(diff / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export const RISK_COLOR: Record<RiskTier, string> = {
  HIGH:     'var(--cl-high)',
  ELEVATED: 'var(--cl-elevated)',
  LOW:      'var(--cl-low)',
}
export const RISK_BG: Record<RiskTier, string> = {
  HIGH:     'var(--cl-high-bg)',
  ELEVATED: 'var(--cl-elev-bg)',
  LOW:      'var(--cl-low-bg)',
}
export const RISK_BORDER: Record<RiskTier, string> = {
  HIGH:     'var(--cl-high-border)',
  ELEVATED: 'var(--cl-elev-border)',
  LOW:      'var(--cl-low-border)',
}
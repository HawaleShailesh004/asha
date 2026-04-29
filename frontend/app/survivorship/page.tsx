'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { AlertTriangle, HeartPulse, CheckCircle2, Pencil, Trash2, Plus, X } from 'lucide-react'
import ClinicalHeader from '@/components/ClinicalHeader'
import ClinicalFooter from '@/components/ClinicalFooter'
import { Skeleton, EmptyState } from '@/components/ClinicalShared'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Survivor {
  id:           string
  phone:        string
  name:         string | null
  cancer_type:  string | null
  checkin_week: number
  last_checkin: string | null
  created_at:   string
  chw_phone:    string | null
}

interface Checkin {
  id:              string
  survivor_phone:  string
  week_number:     number
  fatigue_score:   number | null
  pain_score:      number | null
  mood_score:      number | null
  new_symptoms:    string | null
  trajectory_alert:string
  protocol_sent:   string | null
  created_at:      string
}

function chooseBestDefaultSurvivor(
  survivors: Survivor[],
  checkinMap: Record<string, Checkin[]>
): Survivor | null {
  if (survivors.length === 0) return null

  const ranked = [...survivors].sort((a, b) => {
    const aCount = (checkinMap[a.phone] || []).length
    const bCount = (checkinMap[b.phone] || []).length
    if (bCount !== aCount) return bCount - aCount

    const aWeek = (checkinMap[a.phone] || []).at(-1)?.week_number || 0
    const bWeek = (checkinMap[b.phone] || []).at(-1)?.week_number || 0
    if (bWeek !== aWeek) return bWeek - aWeek

    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  return ranked[0] || null
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function generateSummary(name: string, checkins: Checkin[]): {
  text: string; tone: 'positive' | 'warning' | 'neutral'
} {
  const first = name.split(' ')[0]
  if (checkins.length === 0) {
    return { text: `${first} has just joined the survivorship programme. First check-in pending.`, tone: 'neutral' }
  }

  const latest   = checkins[checkins.length - 1]
  const prev     = checkins[checkins.length - 2]
  const hasAlert = checkins.some(c => c.trajectory_alert === 'ESCALATE')

  if (hasAlert) {
    return {
      text: `${first}'s symptoms are worsening across 3+ consecutive weeks. Clinical review is recommended immediately.`,
      tone: 'warning',
    }
  }

  if (!prev) {
    return {
      text: `${first} completed their first check-in in week ${latest.week_number}.`,
      tone: 'neutral',
    }
  }

  const fatigueDelta = (latest.fatigue_score || 5) - (prev.fatigue_score || 5)
  const moodDelta    = (latest.mood_score    || 5) - (prev.mood_score    || 5)

  if (fatigueDelta < -1 && moodDelta >= 0) {
    return {
      text: `${first}'s fatigue is improving and mood is rising. Recovery is progressing well. Continue current protocol.`,
      tone: 'positive',
    }
  }
  if (fatigueDelta > 1) {
    return {
      text: `${first}'s fatigue has increased since last week. Consider adjusting the recovery protocol intensity.`,
      tone: 'warning',
    }
  }
  if (moodDelta < -1) {
    return {
      text: `${first}'s mood has declined this week. Psychosocial support may be beneficial alongside the protocol.`,
      tone: 'warning',
    }
  }
  return {
    text: `${first} is stable. Fatigue and pain remain manageable. Continue weekly check-ins.`,
    tone: 'positive',
  }
}

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
}

// ── Score bar ─────────────────────────────────────────────────────────────────
function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontSize: 11, color: 'var(--cl-text3)' }}>{label}</span>
        <span style={{
          fontSize: 11, fontFamily: 'DM Mono, monospace',
          color, fontWeight: 500,
        }}>{value}/10</span>
      </div>
      <div style={{
        height: 5, borderRadius: 3,
        background: 'var(--cl-surface-2)',
        overflow: 'hidden',
        border: '1px solid var(--cl-border)',
      }}>
        <div style={{
          height: 5, borderRadius: 3,
          width: `${value * 10}%`,
          background: color,
          transition: 'width 0.5s ease',
        }} />
      </div>
    </div>
  )
}

// ── Week dot timeline ─────────────────────────────────────────────────────────
function WeekTimeline({
  checkins, totalWeeks,
}: { checkins: Checkin[]; totalWeeks: number }) {
  const checkedWeeks = new Set(checkins.map(c => c.week_number))
  const alertWeeks   = new Set(
    checkins.filter(c => c.trajectory_alert === 'ESCALATE').map(c => c.week_number)
  )
  const total = Math.max(totalWeeks, 12)
  const weeks = Array.from({ length: total }, (_, i) => i + 1)

  return (
    <div>
      <p className="cl-label" style={{ marginBottom: 8 }}>Check-in history</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {weeks.map(w => {
          const done  = checkedWeeks.has(w)
          const alert = alertWeeks.has(w)
          return (
            <div
              key={w}
              title={`Week ${w}: ${done ? (alert ? 'Escalation week' : 'Checked in') : 'Missed'}`}
              style={{
                width: 22, height: 22, borderRadius: 5,
                background: alert ? 'var(--cl-high-bg)'
                  : done  ? 'var(--cl-primary-lt)'
                  : 'var(--cl-surface-2)',
                border: `1px solid ${alert ? 'var(--cl-high-border)'
                  : done  ? 'rgba(22,101,52,0.3)'
                  : 'var(--cl-border)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s',
              }}
            >
              <span style={{
                fontSize: 8, fontFamily: 'DM Mono, monospace',
                color: alert ? 'var(--cl-high)'
                  : done  ? 'var(--cl-primary)'
                  : 'var(--cl-text4)',
              }}>{w}</span>
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
        {[
          { bg: 'var(--cl-primary-lt)', border: 'rgba(22,101,52,0.3)', color: 'var(--cl-primary)',    label: 'Checked in' },
          { bg: 'var(--cl-high-bg)',    border: 'var(--cl-high-border)', color: 'var(--cl-high)',     label: 'Escalation week' },
          { bg: 'var(--cl-surface-2)', border: 'var(--cl-border)',       color: 'var(--cl-text4)',    label: 'Missed' },
        ].map(({ bg, border, color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: bg, border: `1px solid ${border}` }} />
            <span style={{ fontSize: 9, color: 'var(--cl-text4)' }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Protocol card ─────────────────────────────────────────────────────────────
function ProtocolCard({ protocol, week }: { protocol: string; week: number }) {
  const lines = protocol.split('\n').filter(l => l.trim())
  return (
    <div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10,
      }}>
        <p className="cl-label" style={{ color: 'var(--cl-elevated)' }}>
          Integrative Recovery Protocol
        </p>
        <span style={{
          fontSize: 9, padding: '2px 8px', borderRadius: 100,
          background: 'var(--cl-elev-bg)', color: 'var(--cl-elevated)',
          border: '1px solid var(--cl-elev-border)',
          fontFamily: 'DM Mono, monospace',
        }}>Week {week} of recovery</span>
      </div>

      <div style={{
        background: 'var(--cl-surface)',
        border: '1px solid var(--cl-border)',
        borderLeft: '3px solid var(--cl-elevated)',
        borderRadius: '0 10px 10px 0',
        padding: '12px 14px',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        {lines.map((line, i) => {
          const emoji    = line.match(/^[\u{1F300}-\u{1FFFF}\u{2600}-\u{27FF}]/u)?.[0] || null
          const textPart = emoji ? line.slice(emoji.length).trim() : line.trim()
          return (
            <div key={i} style={{
              display: 'flex', gap: 8, alignItems: 'flex-start',
              padding: '6px 10px',
              background: 'var(--cl-surface-2)',
              borderRadius: 8,
              border: '1px solid var(--cl-border)',
            }}>
              {emoji ? (
                <span style={{ fontSize: 14, flexShrink: 0, lineHeight: 1.5 }}>{emoji}</span>
              ) : (
                <div style={{
                  width: 4, height: 4, borderRadius: 2, marginTop: 6,
                  background: 'var(--cl-elevated)', flexShrink: 0,
                }} />
              )}
              <p style={{ fontSize: 12, color: 'var(--cl-text2)', lineHeight: 1.6, flex: 1 }}>
                {textPart}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Journey timeline ──────────────────────────────────────────────────────────
function JourneyTimeline({ checkins }: { checkins: Checkin[] }) {
  if (checkins.length === 0) return null

  return (
    <div>
      <p className="cl-label" style={{ marginBottom: 12 }}>
        Week by week journey
      </p>
      <div style={{ position: 'relative' }}>
        {/* Vertical line */}
        <div style={{
          position: 'absolute', left: 15, top: 8, bottom: 8,
          width: 1, background: 'var(--cl-border)',
        }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {checkins.map((c, i) => {
            const isEscalation = c.trajectory_alert === 'ESCALATE'
            const isLatest     = i === checkins.length - 1
            const dotColor     = isEscalation ? 'var(--cl-high)'
              : isLatest  ? 'var(--cl-primary)'
              : 'var(--cl-border-mid)'

            return (
              <div key={c.id} style={{
                display: 'flex', gap: 16, alignItems: 'flex-start',
                paddingBottom: i < checkins.length - 1 ? 16 : 0,
              }}>
                {/* Timeline dot */}
                <div style={{
                  width: 30, flexShrink: 0, display: 'flex',
                  justifyContent: 'center', paddingTop: 2,
                }}>
                  <div style={{
                    width: 10, height: 10, borderRadius: 5,
                    background: dotColor,
                    border: `2px solid var(--cl-surface)`,
                    boxShadow: `0 0 0 1px ${dotColor}`,
                    position: 'relative', zIndex: 1,
                  }} />
                </div>

                {/* Week card */}
                <div style={{
                  flex: 1,
                  background: isLatest ? 'var(--cl-primary-bg)' : 'var(--cl-surface)',
                  border: `1px solid ${isEscalation ? 'var(--cl-high-border)'
                    : isLatest ? 'rgba(22,101,52,0.2)'
                    : 'var(--cl-border)'}`,
                  borderRadius: 10, padding: '12px 14px',
                  marginBottom: 2,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{
                        fontSize: 11, fontWeight: 600,
                        color: isLatest ? 'var(--cl-primary)' : 'var(--cl-text2)',
                        fontFamily: 'DM Mono, monospace',
                      }}>Week {c.week_number}</span>
                      {isLatest && (
                        <span style={{
                          fontSize: 9, padding: '1px 6px', borderRadius: 4,
                          background: 'var(--cl-primary-lt)',
                          color: 'var(--cl-primary)',
                          border: '1px solid rgba(22,101,52,0.2)',
                        }}>Latest</span>
                      )}
                      {isEscalation && (
                        <span style={{
                          fontSize: 9, padding: '1px 6px', borderRadius: 4,
                          background: 'var(--cl-high-bg)',
                          color: 'var(--cl-high)',
                          border: '1px solid var(--cl-high-border)',
                        }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <AlertTriangle size={10} />
                            Escalation
                          </span>
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: 10, color: 'var(--cl-text4)', fontFamily: 'DM Mono, monospace' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        Protocol sent <CheckCircle2 size={10} />
                      </span>
                    </span>
                  </div>

                  {/* Scores inline */}
                  <div style={{ display: 'flex', gap: 16 }}>
                    {[
                      { label: 'F', value: c.fatigue_score, color: '#f97316' },
                      { label: 'P', value: c.pain_score,    color: '#ef4444' },
                      { label: 'M', value: c.mood_score,    color: '#2563eb' },
                    ].map(({ label, value, color }) => value != null && (
                      <div key={label} style={{ textAlign: 'center' }}>
                        <p style={{
                          fontSize: 14, fontFamily: 'DM Mono, monospace',
                          fontWeight: 400, color, lineHeight: 1,
                        }}>{value}</p>
                        <p style={{ fontSize: 8, color: 'var(--cl-text4)', marginTop: 2 }}>
                          {label === 'F' ? 'Fatigue' : label === 'P' ? 'Pain' : 'Mood'}
                        </p>
                      </div>
                    ))}
                    {c.new_symptoms && c.new_symptoms !== 'none' && c.new_symptoms !== 'None' && (
                      <div style={{
                        padding: '2px 8px', borderRadius: 4, height: 'fit-content', marginTop: 2,
                        background: 'var(--cl-high-bg)',
                        border: '1px solid var(--cl-high-border)',
                        fontSize: 10, color: 'var(--cl-high)',
                      }}>
                        {c.new_symptoms}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Survivor list card ─────────────────────────────────────────────────────────
function SurvivorCard({
  survivor, checkins, selected, onClick, onEdit, onDelete,
}: {
  survivor: Survivor
  checkins: Checkin[]
  selected: boolean
  onClick:  () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const alert   = checkins.some(c => c.trajectory_alert === 'ESCALATE')
  const lastWk  = checkins[checkins.length - 1]
  const days    = daysSince(survivor.last_checkin)
  const overdue = days !== null && days >= 7

  return (
    <div
      onClick={onClick}
      className="cl-card-hover"
      style={{
        background: selected ? 'var(--cl-primary-bg)' : 'var(--cl-surface)',
        border: `1px solid ${selected ? 'rgba(22,101,52,0.3)'
          : alert   ? 'var(--cl-high-border)'
          : overdue ? 'var(--cl-elev-border)'
          : 'var(--cl-border)'}`,
        borderRadius: 10, padding: '14px 16px', cursor: 'pointer',
        transition: 'all 0.15s',
        boxShadow: selected ? 'var(--cl-shadow-md)' : 'var(--cl-shadow-sm)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <p style={{
              fontFamily: 'Instrument Serif, Georgia, serif',
              fontSize: 16, color: 'var(--cl-text)', lineHeight: 1.2,
            }}>
              {survivor.name || survivor.phone}
            </p>
            {alert && (
              <span style={{
                fontSize: 9, padding: '1px 7px', borderRadius: 100,
                background: 'var(--cl-high-bg)',
                color: 'var(--cl-high)',
                border: '1px solid var(--cl-high-border)',
                fontWeight: 500,
              }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <AlertTriangle size={10} />
                  Escalate
                </span>
              </span>
            )}
            {overdue && !alert && (
              <span style={{
                fontSize: 9, padding: '1px 7px', borderRadius: 100,
                background: 'var(--cl-elev-bg)',
                color: 'var(--cl-elevated)',
                border: '1px solid var(--cl-elev-border)',
              }}>Overdue {days}d</span>
            )}
          </div>
          <p style={{ fontSize: 11, color: 'var(--cl-text3)' }}>
            {survivor.cancer_type || 'Unspecified'} · Week {
              checkins.length > 0
                ? checkins[checkins.length - 1].week_number
                : 0
            }
          </p>
          <p style={{ fontSize: 10, color: 'var(--cl-text4)', marginTop: 2 }}>
            {checkins.length} check-ins completed
          </p>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
          {lastWk && (
            <p style={{
              fontSize: 10, fontFamily: 'DM Mono, monospace',
              color: (lastWk.fatigue_score || 0) >= 7 ? 'var(--cl-high)' : 'var(--cl-text4)',
            }}>
              F:{lastWk.fatigue_score} P:{lastWk.pain_score} M:{lastWk.mood_score}
            </p>
          )}
          <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
            <button
              onClick={(e) => { e.stopPropagation(); onEdit() }}
              style={{
                width: 26, height: 26, borderRadius: 7, cursor: 'pointer',
                border: '1px solid var(--cl-border)', background: 'var(--cl-surface-2)', color: 'var(--cl-text3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              title="Edit survivor"
            >
              <Pencil size={12} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete() }}
              style={{
                width: 26, height: 26, borderRadius: 7, cursor: 'pointer',
                border: '1px solid var(--cl-high-border)', background: 'var(--cl-high-bg)', color: 'var(--cl-high)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              title="Delete survivor"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Detail view ───────────────────────────────────────────────────────────────
function SurvivorDetail({
  survivor, checkins,
}: { survivor: Survivor; checkins: Checkin[] }) {
  const displayName = survivor.name || survivor.phone
  const firstName   = displayName.split(' ')[0]
  const latest      = checkins[checkins.length - 1]
  const hasAlert    = checkins.some(c => c.trajectory_alert === 'ESCALATE')
  const summary     = generateSummary(displayName, checkins)

  const chartData = checkins.map(c => ({
    week:    `W${c.week_number}`,
    Fatigue: c.fatigue_score,
    Pain:    c.pain_score,
    Mood:    c.mood_score,
  }))

  const weeksSince = checkins.length > 0
    ? checkins[checkins.length - 1].week_number
    : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Identity card */}
      <div className="cl-card" style={{ overflow: 'hidden' }}>
        {/* Header */}
        <div style={{
          background: hasAlert
            ? 'linear-gradient(135deg, #fef2f2, #fff)'
            : 'linear-gradient(135deg, var(--cl-primary-bg), var(--cl-surface))',
          borderBottom: '1px solid var(--cl-border)',
          padding: '18px 20px',
        }}>
          <p style={{
            fontFamily: 'Instrument Serif, Georgia, serif',
            fontSize: 24, color: 'var(--cl-text)', lineHeight: 1.2, marginBottom: 4,
          }}>
            {displayName}
          </p>
          <p style={{ fontSize: 12, color: 'var(--cl-text3)', marginBottom: 12 }}>
            {survivor.cancer_type || 'Cancer type unspecified'} · Survivorship cohort
          </p>

          {/* AI summary sentence */}
          {checkins.length > 0 && (
            <div style={{
              padding: '10px 14px',
              background: summary.tone === 'positive' ? 'var(--cl-primary-bg)'
                : summary.tone === 'warning' ? 'var(--cl-high-bg)'
                : 'var(--cl-surface-2)',
              border: `1px solid ${summary.tone === 'positive' ? 'rgba(22,101,52,0.2)'
                : summary.tone === 'warning' ? 'var(--cl-high-border)'
                : 'var(--cl-border)'}`,
              borderLeft: `3px solid ${summary.tone === 'positive' ? 'var(--cl-primary)'
                : summary.tone === 'warning' ? 'var(--cl-high)'
                : 'var(--cl-border-mid)'}`,
              borderRadius: '0 10px 10px 0',
            }}>
              <p style={{
                fontSize: 13, lineHeight: 1.6,
                fontStyle: 'italic',
                color: summary.tone === 'positive' ? 'var(--cl-primary)'
                  : summary.tone === 'warning' ? 'var(--cl-high)'
                  : 'var(--cl-text3)',
              }}>{summary.text}</p>
            </div>
          )}
        </div>

        <div style={{ padding: '16px 20px' }}>
          {/* Quick stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
            {[
              { label: 'Weeks',      value: weeksSince, mono: true },
              { label: 'Check-ins',  value: checkins.length, mono: true },
              {
                label: 'Trajectory',
                value: hasAlert ? 'Escalate' : 'Stable',
                mono: false,
                color: hasAlert ? 'var(--cl-high)' : 'var(--cl-low)',
              },
            ].map(({ label, value, mono, color }) => (
              <div key={label} style={{
                background: 'var(--cl-surface-2)',
                borderRadius: 10, padding: '12px',
                textAlign: 'center',
                border: '1px solid var(--cl-border)',
              }}>
                <p style={{
                  fontFamily: mono ? 'DM Mono, monospace' : 'DM Sans, sans-serif',
                  fontSize: mono ? 22 : 13,
                  fontWeight: 400,
                  color: color || 'var(--cl-text)',
                  lineHeight: 1,
                }}>{value}</p>
                <p style={{ fontSize: 10, color: 'var(--cl-text4)', marginTop: 4 }}>{label}</p>
              </div>
            ))}
          </div>

          {/* Latest scores */}
          {latest && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              <p className="cl-label" style={{ marginBottom: 4 }}>Week {latest.week_number} scores</p>
              <ScoreBar label="Fatigue" value={latest.fatigue_score || 0} color="#f97316" />
              <ScoreBar label="Pain"    value={latest.pain_score    || 0} color="#ef4444" />
              <ScoreBar label="Mood"    value={latest.mood_score    || 0} color="#2563eb" />
            </div>
          )}

          {/* Week heatmap */}
          <WeekTimeline checkins={checkins} totalWeeks={weeksSince} />
        </div>
      </div>

      {/* Area chart */}
      {chartData.length > 1 && (
        <div className="cl-card" style={{ padding: '18px 20px' }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--cl-text)', marginBottom: 4 }}>
            Symptom trajectory
          </p>
          <p style={{ fontSize: 11, color: 'var(--cl-text3)', marginBottom: 16 }}>
            Fatigue and pain falling while mood rises = recovery in progress
          </p>
          <ResponsiveContainer width="100%" height={150}>
            <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
              <defs>
                {[
                  { id: 'fatigue', color: '#f97316' },
                  { id: 'pain',    color: '#ef4444' },
                  { id: 'mood',    color: '#2563eb' },
                ].map(({ id, color }) => (
                  <linearGradient key={id} id={`grad-${id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={color} stopOpacity={0.15} />
                    <stop offset="95%" stopColor={color} stopOpacity={0}    />
                  </linearGradient>
                ))}
              </defs>
              <XAxis dataKey="week"
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                axisLine={false} tickLine={false} />
              <YAxis domain={[0, 10]}
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{
                background: 'white', border: '1px solid var(--cl-border)',
                borderRadius: 8, fontSize: 11,
                boxShadow: 'var(--cl-shadow-md)',
              }} />
              <Area type="monotone" dataKey="Fatigue" stroke="#f97316" strokeWidth={2}
                fill="url(#grad-fatigue)" dot={{ r: 3, fill: '#f97316' }} />
              <Area type="monotone" dataKey="Pain" stroke="#ef4444" strokeWidth={2}
                fill="url(#grad-pain)" dot={{ r: 3, fill: '#ef4444' }} />
              <Area type="monotone" dataKey="Mood" stroke="#2563eb" strokeWidth={2}
                fill="url(#grad-mood)" dot={{ r: 3, fill: '#2563eb' }} />
            </AreaChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', gap: 16, marginTop: 8, justifyContent: 'center' }}>
            {[['Fatigue','#f97316'],['Pain','#ef4444'],['Mood','#2563eb']].map(([l,c]) => (
              <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 12, height: 2, borderRadius: 1, background: c }} />
                <span style={{ fontSize: 10, color: 'var(--cl-text4)' }}>{l}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Care journey timeline */}
      {checkins.length > 0 && (
        <div className="cl-card" style={{ padding: '18px 20px' }}>
          <JourneyTimeline checkins={checkins} />
        </div>
      )}

      {/* Latest protocol */}
      {latest?.protocol_sent && (
        <div className="cl-card" style={{ padding: '18px 20px' }}>
          <ProtocolCard protocol={latest.protocol_sent} week={latest.week_number} />
        </div>
      )}

      {/* Alert if escalation */}
      {hasAlert && (
        <div style={{
          padding: '14px 18px',
          background: 'var(--cl-high-bg)',
          border: '1px solid var(--cl-high-border)',
          borderLeft: '4px solid var(--cl-high)',
          borderRadius: '0 10px 10px 0',
        }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--cl-high)', marginBottom: 4 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <AlertTriangle size={14} />
              Clinical escalation alert
            </span>
          </p>
          <p style={{ fontSize: 12, color: 'var(--cl-high)', lineHeight: 1.6 }}>
            {firstName}'s fatigue has been worsening for 3 or more consecutive weeks.
            Please contact the patient's CHW immediately and arrange a clinical review.
          </p>
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SurvivorshipPage() {
  const [survivors, setSurvivors] = useState<Survivor[]>([])
  const [checkins,  setCheckins]  = useState<Record<string, Checkin[]>>({})
  const [selected,  setSelected]  = useState<Survivor | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [editingSurvivor, setEditingSurvivor] = useState<Survivor | null | undefined>(undefined)
  const [survivorName, setSurvivorName] = useState('')
  const [survivorPhone, setSurvivorPhone] = useState('')
  const [survivorCancer, setSurvivorCancer] = useState('')
  const [survivorChwPhone, setSurvivorChwPhone] = useState('')
  const [addingCheckin, setAddingCheckin] = useState(false)
  const [checkinFatigue, setCheckinFatigue] = useState('5')
  const [checkinPain, setCheckinPain] = useState('5')
  const [checkinMood, setCheckinMood] = useState('5')
  const [checkinSymptoms, setCheckinSymptoms] = useState('none')
  const [checkinAlert, setCheckinAlert] = useState<'STABLE' | 'ESCALATE'>('STABLE')
  const [checkinProtocol, setCheckinProtocol] = useState('')

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('survivorship_cohort').select('*')
        .order('created_at', { ascending: false })

      if (data) {
        setSurvivors(data as Survivor[])
        const map: Record<string, Checkin[]> = {}
        for (const s of data) {
          const { data: cd } = await supabase
            .from('survivorship_checkins').select('*')
            .eq('survivor_phone', s.phone)
            .order('week_number', { ascending: true })
          if (cd) map[s.phone] = cd as Checkin[]
        }
        setCheckins(map)
        // Auto-select the strongest demo/useful record: most check-ins first.
        const best = chooseBestDefaultSurvivor(data as Survivor[], map)
        if (best) setSelected(best)
      }
      setLoading(false)
    }
    load()
  }, [])

  function openSurvivorEditor(survivor?: Survivor) {
    const base = survivor || null
    setEditingSurvivor(base)
    setSurvivorName(base?.name || '')
    setSurvivorPhone(base?.phone || '')
    setSurvivorCancer(base?.cancer_type || '')
    setSurvivorChwPhone(base?.chw_phone || '')
  }

  async function saveSurvivor() {
    const payload = {
      name: survivorName.trim() || null,
      phone: survivorPhone.trim(),
      cancer_type: survivorCancer.trim() || null,
      chw_phone: survivorChwPhone.trim() || null,
    }
    if (!payload.phone) return

    if (editingSurvivor) {
      const { data, error } = await supabase
        .from('survivorship_cohort')
        .update(payload)
        .eq('id', editingSurvivor.id)
        .select('*')
        .single()
      if (error || !data) return
      const updated = data as Survivor
      setSurvivors(prev => prev.map(s => s.id === updated.id ? updated : s))
      if (selected?.id === updated.id) setSelected(updated)
    } else {
      const { data, error } = await supabase
        .from('survivorship_cohort')
        .insert({ ...payload, checkin_week: 0 })
        .select('*')
        .single()
      if (error || !data) return
      const created = data as Survivor
      setSurvivors(prev => [created, ...prev])
      setSelected(created)
      setCheckins(prev => ({ ...prev, [created.phone]: [] }))
    }
    setEditingSurvivor(undefined)
  }

  async function deleteSurvivor(survivor: Survivor) {
    const ok = window.confirm(`Delete ${survivor.name || survivor.phone} and all related check-ins?`)
    if (!ok) return

    await supabase.from('survivorship_checkins').delete().eq('survivor_phone', survivor.phone)
    const { error } = await supabase.from('survivorship_cohort').delete().eq('id', survivor.id)
    if (error) return

    setSurvivors(prev => prev.filter(s => s.id !== survivor.id))
    setCheckins(prev => {
      const next = { ...prev }
      delete next[survivor.phone]
      return next
    })
    if (selected?.id === survivor.id) setSelected(null)
  }

  async function addCheckin() {
    if (!selected) return
    const nextWeek = ((checkins[selected.phone] || []).at(-1)?.week_number || 0) + 1
    const payload = {
      survivor_phone: selected.phone,
      week_number: nextWeek,
      fatigue_score: Number(checkinFatigue),
      pain_score: Number(checkinPain),
      mood_score: Number(checkinMood),
      new_symptoms: checkinSymptoms.trim() || 'none',
      trajectory_alert: checkinAlert,
      protocol_sent: checkinProtocol.trim() || null,
    }
    const { data, error } = await supabase.from('survivorship_checkins').insert(payload).select('*').single()
    if (error || !data) return
    const created = data as Checkin
    setCheckins(prev => ({ ...prev, [selected.phone]: [...(prev[selected.phone] || []), created] }))
    setAddingCheckin(false)
  }

  async function deleteCheckin(id: string) {
    if (!selected) return
    const ok = window.confirm('Delete this weekly check-in entry?')
    if (!ok) return
    const { error } = await supabase.from('survivorship_checkins').delete().eq('id', id)
    if (error) return
    setCheckins(prev => ({
      ...prev,
      [selected.phone]: (prev[selected.phone] || []).filter(c => c.id !== id),
    }))
  }

  const selectedCheckins = selected ? (checkins[selected.phone] || []) : []
  const totalSurvivors   = survivors.length
  const alertCount       = survivors.filter(s =>
    (checkins[s.phone] || []).some(c => c.trajectory_alert === 'ESCALATE')
  ).length

  return (
    <div className="clinical" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>

      <ClinicalHeader
        rightSlot={
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button
              className="motion-pressable"
              onClick={() => openSurvivorEditor()}
              style={{
                padding: '6px 10px', borderRadius: 8, cursor: 'pointer',
                border: '1px solid rgba(22,101,52,0.25)', background: 'var(--cl-primary-bg)', color: 'var(--cl-primary)',
                fontSize: 11, fontFamily: 'DM Sans, sans-serif',
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <Plus size={12} />
                Add survivor
              </span>
            </button>
            {alertCount > 0 && (
              <div style={{
                padding: '5px 12px', borderRadius: 100,
                background: 'var(--cl-high-bg)',
                border: '1px solid var(--cl-high-border)',
                fontSize: 11, color: 'var(--cl-high)', fontWeight: 600,
              }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <AlertTriangle size={12} />
                  {alertCount} need clinical review
                </span>
              </div>
            )}
            <p style={{
              fontSize: 11, color: 'var(--cl-text4)',
              fontFamily: 'DM Mono, monospace',
            }}>
              {totalSurvivors} active survivors
            </p>
          </div>
        }
      />

      <main className="motion-enter motion-enter-slow" style={{ flex: 1, maxWidth: 1280, margin: '0 auto', padding: '24px', width: '100%' }}>
        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[1,2,3].map(i => <Skeleton key={i} height={90} borderRadius={10} />)}
            </div>
            <Skeleton height={400} borderRadius={12} />
          </div>
        ) : survivors.length === 0 ? (
          <EmptyState
            icon={<HeartPulse size={32} />}
            title="No survivors registered yet"
            subtitle="CHWs register cancer survivors via WhatsApp by typing 'register survivor'. They then receive weekly check-in messages from ASHA."
          />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16, alignItems: 'start' }}>

            {/* Survivor list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, position: 'sticky', top: 72 }}>
              <p className="cl-label" style={{ marginBottom: 4 }}>Survivors</p>
              {survivors.map(s => (
                <SurvivorCard
                  key={s.id}
                  survivor={s}
                  checkins={checkins[s.phone] || []}
                  selected={selected?.id === s.id}
                  onClick={() => setSelected(s)}
                  onEdit={() => openSurvivorEditor(s)}
                  onDelete={() => deleteSurvivor(s)}
                />
              ))}
            </div>

            {/* Detail */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {selected ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button
                      className="motion-pressable"
                      onClick={() => setAddingCheckin(true)}
                      style={{
                        borderRadius: 8, border: '1px solid rgba(22,101,52,0.25)',
                        background: 'var(--cl-primary-bg)', color: 'var(--cl-primary)',
                        fontSize: 12, padding: '7px 10px', cursor: 'pointer',
                        fontFamily: 'DM Sans, sans-serif',
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <Plus size={12} />
                        Add check-in
                      </span>
                    </button>
                  </div>
                  <SurvivorDetail
                    survivor={selected}
                    checkins={selectedCheckins}
                  />
                  {selectedCheckins.length > 0 && (
                    <div className="cl-card" style={{ padding: '16px 18px' }}>
                      <p className="cl-label" style={{ marginBottom: 10 }}>Manage weekly check-ins</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {selectedCheckins.map(c => (
                          <div
                            key={c.id}
                            style={{
                              border: '1px solid var(--cl-border)', background: 'var(--cl-surface)',
                              borderRadius: 8, padding: '8px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            }}
                          >
                            <p style={{ fontSize: 12, color: 'var(--cl-text3)' }}>
                              Week {c.week_number} · F:{c.fatigue_score} P:{c.pain_score} M:{c.mood_score}
                            </p>
                            <button
                              onClick={() => deleteCheckin(c.id)}
                              style={{
                                width: 26, height: 26, borderRadius: 7, cursor: 'pointer',
                                border: '1px solid var(--cl-high-border)', background: 'var(--cl-high-bg)', color: 'var(--cl-high)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}
                              title="Delete check-in"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <EmptyState
                  icon={<HeartPulse size={32} />}
                  title="Select a survivor"
                  subtitle="Click any survivor to view their recovery journey."
                />
              )}
            </div>
          </div>
        )}
      </main>

      <ClinicalFooter />
      {editingSurvivor !== undefined && (
        <div
          onClick={() => setEditingSurvivor(undefined)}
          style={{
            position: 'fixed', inset: 0, zIndex: 240, background: 'rgba(5,8,12,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="cl-card"
            style={{ width: 'min(520px, 100%)', padding: '16px 18px' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--cl-text)' }}>
                {editingSurvivor ? 'Edit survivor' : 'Add survivor'}
              </p>
              <button onClick={() => setEditingSurvivor(undefined)} style={{ background: 'none', border: 'none', color: 'var(--cl-text4)', cursor: 'pointer' }}>
                <X size={14} />
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <input value={survivorName} onChange={e => setSurvivorName(e.target.value)} placeholder="Name" style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--cl-border)', background: 'var(--cl-surface)', color: 'var(--cl-text)', fontSize: 12 }} />
              <input value={survivorPhone} onChange={e => setSurvivorPhone(e.target.value)} placeholder="Phone (+countrycode...)" style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--cl-border)', background: 'var(--cl-surface)', color: 'var(--cl-text)', fontSize: 12 }} />
              <input value={survivorCancer} onChange={e => setSurvivorCancer(e.target.value)} placeholder="Cancer type" style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--cl-border)', background: 'var(--cl-surface)', color: 'var(--cl-text)', fontSize: 12 }} />
              <input value={survivorChwPhone} onChange={e => setSurvivorChwPhone(e.target.value)} placeholder="CHW phone" style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--cl-border)', background: 'var(--cl-surface)', color: 'var(--cl-text)', fontSize: 12 }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button onClick={() => setEditingSurvivor(undefined)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--cl-border)', background: 'var(--cl-surface)', color: 'var(--cl-text3)', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
              <button onClick={saveSurvivor} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(22,101,52,0.25)', background: 'var(--cl-primary-bg)', color: 'var(--cl-primary)', fontSize: 12, cursor: 'pointer' }}>Save</button>
            </div>
          </div>
        </div>
      )}
      {addingCheckin && selected && (
        <div
          onClick={() => setAddingCheckin(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 240, background: 'rgba(5,8,12,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="cl-card"
            style={{ width: 'min(520px, 100%)', padding: '16px 18px' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--cl-text)' }}>Add weekly check-in</p>
              <button onClick={() => setAddingCheckin(false)} style={{ background: 'none', border: 'none', color: 'var(--cl-text4)', cursor: 'pointer' }}>
                <X size={14} />
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              <input type="number" min={0} max={10} value={checkinFatigue} onChange={e => setCheckinFatigue(e.target.value)} placeholder="Fatigue" style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--cl-border)', background: 'var(--cl-surface)', color: 'var(--cl-text)', fontSize: 12 }} />
              <input type="number" min={0} max={10} value={checkinPain} onChange={e => setCheckinPain(e.target.value)} placeholder="Pain" style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--cl-border)', background: 'var(--cl-surface)', color: 'var(--cl-text)', fontSize: 12 }} />
              <input type="number" min={0} max={10} value={checkinMood} onChange={e => setCheckinMood(e.target.value)} placeholder="Mood" style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--cl-border)', background: 'var(--cl-surface)', color: 'var(--cl-text)', fontSize: 12 }} />
            </div>
            <input value={checkinSymptoms} onChange={e => setCheckinSymptoms(e.target.value)} placeholder="New symptoms (or none)" style={{ marginTop: 8, width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--cl-border)', background: 'var(--cl-surface)', color: 'var(--cl-text)', fontSize: 12 }} />
            <select value={checkinAlert} onChange={e => setCheckinAlert(e.target.value as 'STABLE' | 'ESCALATE')} style={{ marginTop: 8, width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--cl-border)', background: 'var(--cl-surface)', color: 'var(--cl-text)', fontSize: 12 }}>
              <option value="STABLE">STABLE</option>
              <option value="ESCALATE">ESCALATE</option>
            </select>
            <textarea value={checkinProtocol} onChange={e => setCheckinProtocol(e.target.value)} placeholder="Protocol sent (optional)" style={{ marginTop: 8, width: '100%', minHeight: 72, resize: 'vertical', padding: '10px', borderRadius: 8, border: '1px solid var(--cl-border)', background: 'var(--cl-surface)', color: 'var(--cl-text)', fontSize: 12 }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button onClick={() => setAddingCheckin(false)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--cl-border)', background: 'var(--cl-surface)', color: 'var(--cl-text3)', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
              <button onClick={addCheckin} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(22,101,52,0.25)', background: 'var(--cl-primary-bg)', color: 'var(--cl-primary)', fontSize: 12, cursor: 'pointer' }}>Add check-in</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
'use client'

import { useEffect, useState } from 'react'

interface FollowupStats {
  total:            number
  attended:         number
  not_yet:          number
  refused:          number
  pending:          number
  completion_rate:  number
}

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export default function FollowUpTracker() {
  const [stats,   setStats]   = useState<FollowupStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${API}/api/followup-stats`)
      .then(r => r.json())
      .then(d => { setStats(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="cl-card" style={{ padding: '18px 20px' }}>
      <div className="cl-skeleton" style={{ height: 120, borderRadius: 8 }} />
    </div>
  )

  if (!stats || stats.total === 0) return (
    <div className="cl-card" style={{ padding: '18px 20px' }}>
      <p className="cl-label" style={{ marginBottom: 8 }}>Referral Follow-through</p>
      <p style={{ fontSize: 12, color: 'var(--cl-text4)', textAlign: 'center', padding: '20px 0' }}>
        Follow-up prompts are sent 7 days after each referral.<br />
        Data will appear here once CHWs respond.
      </p>
    </div>
  )

  const rate     = stats.completion_rate
  const rateColor = rate >= 60 ? 'var(--cl-low)' : rate >= 40 ? 'var(--cl-elevated)' : 'var(--cl-high)'

  return (
    <div className="cl-card" style={{ padding: '18px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <p className="cl-label" style={{ marginBottom: 4 }}>Referral Follow-through</p>
          <p style={{ fontSize: 11, color: 'var(--cl-text4)' }}>
            CHW reports 7 days post-referral
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{
            fontFamily: 'DM Mono, monospace', fontSize: 28,
            fontWeight: 400, color: rateColor, lineHeight: 1,
          }}>
            {rate}%
          </p>
          <p style={{ fontSize: 10, color: 'var(--cl-text4)', marginTop: 2 }}>
            clinic attendance rate
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{
        height: 6, borderRadius: 3,
        background: 'var(--cl-surface-2)',
        overflow: 'hidden', marginBottom: 14,
        border: '1px solid var(--cl-border)',
      }}>
        <div style={{
          height: 6, borderRadius: 3,
          width: `${rate}%`,
          background: rateColor,
          transition: 'width 0.6s ease',
        }} />
      </div>

      {/* Breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {[
          { label: 'Attended',    value: stats.attended, color: 'var(--cl-low)' },
          { label: 'Not yet',     value: stats.not_yet,  color: 'var(--cl-elevated)' },
          { label: 'Refused',     value: stats.refused,  color: 'var(--cl-high)' },
          { label: 'Pending',     value: stats.pending,  color: 'var(--cl-text4)' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{
            background: 'var(--cl-surface-2)',
            border: '1px solid var(--cl-border)',
            borderRadius: 8, padding: '8px 10px', textAlign: 'center',
          }}>
            <p style={{
              fontFamily: 'DM Mono, monospace', fontSize: 18,
              fontWeight: 400, color, lineHeight: 1,
            }}>{value}</p>
            <p style={{ fontSize: 9, color: 'var(--cl-text4)', marginTop: 3 }}>{label}</p>
          </div>
        ))}
      </div>

      <p style={{ fontSize: 10, color: 'var(--cl-text4)', marginTop: 10 }}>
        {stats.total} referrals tracked · WHO target: 70% clinic attendance
      </p>
    </div>
  )
}
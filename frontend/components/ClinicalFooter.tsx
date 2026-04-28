'use client'

export default function ClinicalFooter() {
  return (
    <footer style={{
      borderTop: '1px solid var(--cl-border)',
      padding: '16px 24px',
      background: 'var(--cl-surface)',
      marginTop: 'auto',
    }}>
      <div style={{
        maxWidth: 1280, margin: '0 auto',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <p style={{ fontSize: 11, color: 'var(--cl-text4)', fontFamily: 'DM Mono, monospace' }}>
            ASHA v2.0
          </p>
          <span style={{ color: 'var(--cl-border-mid)', fontSize: 11 }}>·</span>
          <p style={{ fontSize: 11, color: 'var(--cl-text4)' }}>
            Cancer Aid Society India
          </p>
          <span style={{ color: 'var(--cl-border-mid)', fontSize: 11 }}>·</span>
          <p style={{ fontSize: 11, color: 'var(--cl-text4)' }}>
            WHO Protocol Aligned
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {['SDG 3.1', 'SDG 3.4', 'SDG 3.8'].map(s => (
            <span key={s} style={{
              fontSize: 10, padding: '2px 8px', borderRadius: 4,
              color: 'var(--cl-primary)',
              background: 'var(--cl-primary-bg)',
              border: '1px solid rgba(22,101,52,0.15)',
              fontFamily: 'DM Mono, monospace',
            }}>{s}</span>
          ))}
          <span style={{ color: 'var(--cl-border-mid)', fontSize: 11, margin: '0 4px' }}>·</span>
          <p style={{
            fontSize: 11, color: 'var(--cl-text4)',
            fontStyle: 'italic', fontFamily: 'Instrument Serif, Georgia, serif',
          }}>
            वसुधैव कुटुम्बकम्
          </p>
        </div>
      </div>
    </footer>
  )
}
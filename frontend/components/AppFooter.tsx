'use client'

export default function AppFooter() {
  return (
    <footer style={{
      marginTop: 24,
      padding: '24px 0 20px',
      borderTop: '1px solid rgba(255,255,255,0.06)',
    }}>
      <div style={{
        maxWidth: 1280,
        margin: '0 auto',
        padding: '0 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 16,
        flexWrap: 'wrap',
      }}>
        <p style={{ fontSize: 11, color: '#4a5568', fontFamily: 'DM Mono, monospace' }}>
          ASHA · Cancer Aid Society India · WHO Protocol Aligned
        </p>
        <p style={{ fontSize: 11, color: '#4a5568', fontFamily: 'DM Mono, monospace', fontStyle: 'italic' }}>
          वसुधैव कुटुम्बकम्
        </p>
      </div>
    </footer>
  )
}

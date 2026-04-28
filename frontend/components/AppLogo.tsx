'use client'

import Link from 'next/link'

export default function AppLogo({ theme = 'dark' }: { theme?: 'dark' | 'light' }) {
  const isLight = theme === 'light'
  return (
    <Link
      href="/"
      style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none' }}
      aria-label="Go to home page"
    >
      <div style={{
        width: 28, height: 28, borderRadius: 8,
        background: isLight ? 'rgba(22,101,52,0.1)' : 'rgba(0,212,160,0.1)',
        border: isLight ? '1px solid rgba(22,101,52,0.22)' : '1px solid rgba(0,212,160,0.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="16" height="20" viewBox="0 0 40 48" fill="none">
          <path d="M20 46 C13 39 5 30 5 18 A15 15 0 1 1 35 18 C35 30 27 39 20 46 Z" fill={isLight ? 'rgba(22,101,52,0.75)' : 'rgba(0,212,160,0.7)'} />
          <circle cx="20" cy="18" r="6" fill={isLight ? 'rgba(0,0,0,0.28)' : 'rgba(0,0,0,0.2)'} />
          <line x1="14" y1="18" x2="26" y2="18" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="20" y1="12" x2="20" y2="24" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      </div>
      <p style={{ fontSize: 14, fontWeight: 600, color: isLight ? '#102a25' : '#e8eaf0', letterSpacing: '-0.02em', lineHeight: 1 }}>
        ASHA
      </p>
    </Link>
  )
}

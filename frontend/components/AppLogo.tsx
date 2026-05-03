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
        <img
          src="/asha-mark.svg"
          alt="ASHA logo"
          width={16}
          height={20}
          style={{ display: 'block' }}
        />
      </div>
      <p style={{ fontSize: 14, fontWeight: 600, color: isLight ? '#102a25' : '#e8eaf0', letterSpacing: '-0.02em', lineHeight: 1 }}>
        ASHA
      </p>
    </Link>
  )
}

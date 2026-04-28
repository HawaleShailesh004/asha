'use client'

import type { ReactNode } from 'react'

export default function AppHeader({ children }: { children: ReactNode }) {
  return (
    <header style={{
      background: '#0d1118',
      padding: '0 32px',
      height: 56,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      position: 'sticky', top: 0, zIndex: 50,
      borderBottom: '1px solid rgba(255,255,255,0.08)',
    }}>
      {children}
    </header>
  )
}

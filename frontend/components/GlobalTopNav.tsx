'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const LINKS = [
  { href: '/', label: 'Home' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/patients', label: 'Patients' },
  { href: '/survivorship', label: 'Survivorship' },
  { href: '/screen', label: 'Screen' },
  { href: '/chat', label: 'Chat' },
]

const HIDE_ON = new Set(['/dashboard', '/patients', '/survivorship'])

export default function GlobalTopNav() {
  const pathname = usePathname()
  if (!pathname || HIDE_ON.has(pathname)) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 999,
        width: 'min(94vw, 900px)',
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      <nav
        style={{
          pointerEvents: 'auto',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
          padding: 8,
          borderRadius: 12,
          background: 'rgba(10,14,20,0.82)',
          border: '1px solid rgba(255,255,255,0.12)',
          backdropFilter: 'blur(10px)',
        }}
        aria-label="Primary navigation"
      >
        {LINKS.map((link) => {
          const active = pathname === link.href
          return (
            <Link
              key={link.href}
              href={link.href}
              style={{
                textDecoration: 'none',
                padding: '6px 10px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 500,
                color: active ? '#e8fff8' : '#c7d0dc',
                background: active ? 'rgba(0,212,160,0.2)' : 'transparent',
                border: active ? '1px solid rgba(0,212,160,0.4)' : '1px solid transparent',
                lineHeight: 1.1,
              }}
            >
              {link.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}

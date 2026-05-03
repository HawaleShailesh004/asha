'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

interface ClinicalHeaderProps {
  rightSlot?: ReactNode
}

const NAV = [
  { href: '/dashboard',    label: 'Dashboard'    },
  { href: '/patients',     label: 'Patients'     },
  { href: '/survivorship', label: 'Survivorship' },
  { href: '/screen',       label: 'Screen'       },
]

export default function ClinicalHeader({ rightSlot }: ClinicalHeaderProps) {
  const path = usePathname()

  return (
    <header style={{
      background: 'var(--cl-surface)',
      borderBottom: '1px solid var(--cl-border)',
      boxShadow: 'var(--cl-shadow-sm)',
      position: 'sticky', top: 0, zIndex: 50,
      height: 56,
      display: 'flex', alignItems: 'center',
      padding: '0 24px',
      gap: 0,
    }}>
      {/* Logo */}
      <Link href="/dashboard" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10, marginRight: 32 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 7,
          background: 'var(--cl-primary-lt)',
          border: '1px solid rgba(22,101,52,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <img
            src="/asha-mark.svg"
            alt="ASHA logo"
            width={14}
            height={17}
            style={{ display: 'block' }}
          />
        </div>
        <div>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--cl-text)', lineHeight: 1, letterSpacing: '-0.01em' }}>
            ASHA
          </p>
          <p style={{ fontSize: 9, color: 'var(--cl-text3)', lineHeight: 1, marginTop: 1, letterSpacing: '0.04em' }}>
            WHO Protocol · SDG 3
          </p>
        </div>
      </Link>

      {/* Nav */}
      <nav style={{ display: 'flex', gap: 2, flex: 1 }}>
        {NAV.map(({ href, label }) => {
          const active = path === href
          return (
            <Link key={href} href={href} style={{
              padding: '5px 12px', borderRadius: 7,
              fontSize: 13, fontWeight: active ? 500 : 400,
              color: active ? 'var(--cl-primary)' : 'var(--cl-text3)',
              background: active ? 'var(--cl-primary-bg)' : 'transparent',
              textDecoration: 'none',
              transition: 'all 0.15s',
              border: active ? '1px solid rgba(22,101,52,0.15)' : '1px solid transparent',
            }}>
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Right slot */}
      {rightSlot && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
          {rightSlot}
        </div>
      )}
    </header>
  )
}
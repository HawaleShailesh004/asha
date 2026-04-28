'use client'

import { usePathname } from 'next/navigation'

export default function AppTemplate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div key={pathname} className="route-transition">
      {children}
    </div>
  )
}

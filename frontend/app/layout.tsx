import type { Metadata } from 'next'
import './globals.css'
import GlobalTopNav from '@/components/GlobalTopNav'

export const metadata: Metadata = {
  title: 'ASHA - Cancer Screening for Community Health Workers',
  description: 'Adaptive Survivorship & Health Agent - WhatsApp-native cancer screening and survivorship support for CHWs in Africa and South Asia. WHO Protocol Aligned.',
  icons: {
    icon: '/asha-mark.svg',
    shortcut: '/asha-mark.svg',
    apple: '/asha-mark.svg',
  },
  openGraph: {
    title: 'ASHA - Cancer Screening for Community Health Workers',
    description: '342,000 women will die of cervical cancer this year. 90% within reach of a CHW who had no tools. Until now.',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500;1,300&family=Instrument+Serif:ital@0;1&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&family=Inter:wght@300;400;500;600&display=swap"
          rel="stylesheet"
        />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </head>
      <body>
        <GlobalTopNav />
        {children}
      </body>
    </html>
  )
}
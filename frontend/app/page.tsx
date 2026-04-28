'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Smartphone, Hexagon, FileText } from 'lucide-react'
import { Leaf, SendHorizontal, Brain, ShieldCheck, Languages, Bot, AlertTriangle, CheckCircle2 } from 'lucide-react'
import ImpactProjector from '@/components/ImpactProjector'

// ── Intersection observer hook ────────────────────────────────────────────────
function useInView(threshold = 0.15) {
  const ref  = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setInView(true); obs.disconnect() }
    }, { threshold })
    obs.observe(el)
    return () => obs.disconnect()
  }, [threshold])
  return { ref, inView }
}

// ── Animated counter ──────────────────────────────────────────────────────────
function AnimatedCounter({
  target, duration = 2000, color = '#ff4757', size = 'clamp(64px,10vw,110px)',
}: { target: number; duration?: number; color?: string; size?: string }) {
  const [count, setCount] = useState(0)
  const { ref, inView }   = useInView(0.3)
  const stateRef          = useRef({ started: false })

  useEffect(() => {
    if (!inView || stateRef.current.started) return
    stateRef.current.started = true

    let raf = 0
    let displayed = 0
    const startTime = performance.now()

    // Roller coaster velocity curve:
    // Slow climb → sudden drop (fast) → loop (fast) → brake → crawl to end
    // t = 0→1 (normalized time), returns velocity multiplier
    const velocity = (t: number) => {
      // Slow initial climb (0 → 0.18): anticipation, like going up the first hill
      if (t < 0.18) return 0.15 + t * 1.2

      // FIRST DROP (0.18 → 0.38): sudden massive acceleration
      if (t < 0.38) return 3.5 + Math.sin((t - 0.18) / 0.20 * Math.PI) * 4.5

      // Brief plateau (0.38 → 0.44): airtime moment — numbers blur
      if (t < 0.44) return 5.8 + Math.cos((t - 0.38) / 0.06 * Math.PI * 2) * 1.2

      // SECOND HILL (0.44 → 0.56): climbs again, slows
      if (t < 0.56) return 5.8 - Math.sin((t - 0.44) / 0.12 * Math.PI) * 3.2

      // SECOND DROP (0.56 → 0.70): another rush
      if (t < 0.70) return 2.6 + Math.sin((t - 0.56) / 0.14 * Math.PI) * 3.8

      // BRAKE ZONE (0.70 → 0.85): hard braking, dramatic deceleration
      if (t < 0.85) return 6.4 * Math.pow(1 - (t - 0.70) / 0.15, 2.4)

      // FINAL CRAWL (0.85 → 1.0): slow roll into station
      return 0.18 * Math.pow(1 - (t - 0.85) / 0.15, 1.5)
    }

    // Precompute integral → position lookup (2000 steps = silky smooth)
    const STEPS    = 2000
    const integral = new Float64Array(STEPS + 1)
    for (let i = 0; i < STEPS; i++) {
      integral[i + 1] = integral[i] + velocity(i / STEPS) / STEPS
    }
    const totalArea = integral[STEPS]

    const position = (t: number) => {
      const area = t * totalArea
      let lo = 0, hi = STEPS
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        integral[mid] < area ? (lo = mid + 1) : (hi = mid)
      }
      return lo / STEPS
    }

    const tick = (now: number) => {
      const t    = Math.min((now - startTime) / duration, 1)
      const pos  = position(t)
      const next = Math.round(target * pos)

      if (next !== displayed) {
        displayed = next
        setCount(next)
      }

      if (t < 1) {
        raf = requestAnimationFrame(tick)
      } else {
        setCount(target)
      }
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [inView, target, duration])

  return (
    <div ref={ref} style={{
      fontFamily: 'DM Mono, monospace', fontWeight: 300,
      fontSize: size, color, lineHeight: 1,
      textShadow: `0 0 80px ${color}40`,
      letterSpacing: '-0.04em',
    }}>
      {count.toLocaleString()}
    </div>
  )
}

// ── Animated WhatsApp conversation ────────────────────────────────────────────
const CONVERSATION = [
  { from: 'chw',  text: 'screen',                        delay: 0    },
  { from: 'asha', text: 'Starting cervical cancer screening. How old is the patient?', delay: 800  },
  { from: 'chw',  text: '34yr old, smoker, bleeds after sex, 2 pregnancies', delay: 2000 },
  { from: 'asha', text: 'Collecting all fields...',       delay: 3200 },
  { from: 'asha', text: '🔴 HIGH RISK — 79%\nPostcoital bleeding (WHO Grade A)\nRefer immediately to Kisumu Clinic.\n\nGenerating referral letter...', delay: 4200 },
  { from: 'asha', text: 'April 26, 2026\nTo: Attending Clinician\n\nA 34-year-old female presents with postcoital bleeding — a WHO Grade A referral indicator. Cervical cancer probability: 79%. Recommend immediate colposcopy.\n\nCHW: +254712345678', delay: 5600 },
]

function WhatsAppDemo() {
  const [visible, setVisible]   = useState<number[]>([])
  const [typing,  setTyping]    = useState(false)
  const { ref, inView }         = useInView(0.2)
  const started                 = useRef(false)
  const bottomRef               = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!inView || started.current) return
    started.current = true

    CONVERSATION.forEach((msg, i) => {
      // Show typing indicator before ASHA messages
      if (msg.from === 'asha') {
        setTimeout(() => setTyping(true),  msg.delay - 400)
        setTimeout(() => {
          setTyping(false)
          setVisible(prev => [...prev, i])
        }, msg.delay)
      } else {
        setTimeout(() => setVisible(prev => [...prev, i]), msg.delay)
      }
    })
  }, [inView])

  // Keep landing page static; avoid auto-scrolling behavior.

  return (
    <div ref={ref} style={{
      background: '#111b21',
      borderRadius: 20,
      overflow: 'hidden',
      width: '100%',
      maxWidth: 380,
      boxShadow: '0 40px 80px rgba(0,0,0,0.6)',
      border: '1px solid rgba(255,255,255,0.06)',
    }}>
      {/* WA header */}
      <div style={{
        background: '#202c33', padding: '12px 16px',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{
          width: 42, height: 42, borderRadius: 21,
          background: 'linear-gradient(135deg,rgba(0,212,160,0.3),rgba(0,212,160,0.1))',
          border: '1px solid rgba(0,212,160,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00d4a0',
        }}><Leaf size={18} /></div>
        <div>
          <p style={{ fontSize: 14, fontWeight: 600, color: '#e9edef' }}>ASHA</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 6, height: 6, borderRadius: 3, background: '#00a884' }} />
            <p style={{ fontSize: 11, color: '#00a884' }}>online</p>
          </div>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 11, color: '#8696a0', fontFamily: 'DM Mono, monospace' }}>
          WhatsApp · no app needed
        </div>
      </div>

      {/* Chat body */}
      <div style={{
        background: '#0b141a',
        padding: '16px 12px',
        minHeight: 360,
        maxHeight: 400,
        overflowY: 'auto',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        {CONVERSATION.map((msg, i) => (
          visible.includes(i) && (
            <div key={i} style={{
              display: 'flex',
              justifyContent: msg.from === 'chw' ? 'flex-end' : 'flex-start',
              animation: 'fadeUp 0.3s ease-out',
            }}>
              <div style={{
                maxWidth: '82%',
                background: msg.from === 'chw' ? '#005c4b' : '#1f2c34',
                borderRadius: msg.from === 'chw' ? '12px 2px 12px 12px' : '2px 12px 12px 12px',
                padding: '8px 12px',
                border: msg.text.includes('HIGH RISK') ? '1px solid rgba(255,71,87,0.4)' : 'none',
              }}>
                <pre style={{
                  fontSize: 12.5, color: msg.text.includes('HIGH RISK') ? '#ff8a95' : '#e9edef',
                  whiteSpace: 'pre-wrap', fontFamily: 'DM Sans, system-ui, sans-serif',
                  lineHeight: 1.6, margin: 0,
                }}>{msg.text}</pre>
                <p style={{ fontSize: 9.5, color: 'rgba(233,237,239,0.4)', textAlign: 'right', marginTop: 3, fontFamily: 'DM Mono, monospace' }}>
                  {msg.from === 'chw' ? '✓✓ ' : ''}
                  {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          )
        ))}

        {typing && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ background: '#1f2c34', borderRadius: '2px 12px 12px 12px', padding: '10px 16px' }}>
              <div style={{ display: 'flex', gap: 4 }}>
                {[0,1,2].map(i => (
                  <div key={i} style={{
                    width: 7, height: 7, borderRadius: 3.5, background: '#8696a0',
                    animation: `bounce 1.2s ease-in-out ${i*0.2}s infinite`,
                  }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div style={{
        background: '#202c33', padding: '10px 14px',
        display: 'flex', alignItems: 'center', gap: 10,
        borderTop: '1px solid rgba(255,255,255,0.04)',
      }}>
        <div style={{
          flex: 1, background: '#2a3942', borderRadius: 10,
          padding: '8px 14px', fontSize: 12.5, color: '#667781',
          fontFamily: 'DM Sans, sans-serif',
        }}>
          Type a message…
        </div>
        <div style={{
          width: 38, height: 38, borderRadius: 19,
          background: '#00a884',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0a0e14',
        }}><SendHorizontal size={16} /></div>
      </div>
    </div>
  )
}

// ── Crisis stat card ──────────────────────────────────────────────────────────
function CrisisCard({ flag, country, deaths, screening, delay = 0 }: {
  flag: string; country: string; deaths: string; screening: number; delay?: number
}) {
  const { ref, inView } = useInView(0.2)
  return (
    <div ref={ref} style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 14, padding: '16px 18px',
      opacity: inView ? 1 : 0,
      transform: inView ? 'translateY(0)' : 'translateY(16px)',
      transition: `all 0.5s ease ${delay}ms`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 22 }}>{flag}</span>
        <p style={{ fontSize: 13, fontWeight: 500, color: '#e8eaf0' }}>{country}</p>
      </div>
      <p style={{ fontFamily: 'DM Mono, monospace', fontSize: 22, color: '#ff4757', fontWeight: 300, lineHeight: 1 }}>
        {deaths}
      </p>
      <p style={{ fontSize: 10, color: '#4a5568', marginTop: 3 }}>deaths/year</p>
      <div style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 10, color: '#4a5568' }}>Ever screened</span>
          <span style={{ fontSize: 10, color: screening < 15 ? '#ff4757' : '#2ed573', fontFamily: 'DM Mono, monospace' }}>{screening}%</span>
        </div>
        <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
          <div style={{
            height: 3, borderRadius: 2, width: `${screening}%`,
            background: screening < 15 ? '#ff4757' : '#2ed573',
          }} />
        </div>
      </div>
    </div>
  )
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ children, style = {} }: { children: React.ReactNode; style?: React.CSSProperties }) {
  const { ref, inView } = useInView(0.1)
  return (
    <div ref={ref} style={{
      opacity: inView ? 1 : 0,
      transform: inView ? 'translateY(0)' : 'translateY(24px)',
      transition: 'all 0.6s ease',
      ...style,
    }}>
      {children}
    </div>
  )
}

// ── Tech proof strip ──────────────────────────────────────────────────────────
function TechProof() {
  const items = [
    { icon: <Brain size={16} />, label: 'XGBoost + SMOTE', sub: 'UCI cervical dataset · AUC 0.725 · Sensitivity 1.0' },
    { icon: <ShieldCheck size={16} />, label: 'WHO Oral Scoring', sub: '30-point weighted engine · GLOBOCAN-validated weights' },
    { icon: <Languages size={16} />, label: 'MiniLM-L12-v2', sub: 'Multilingual symptom mapper · EN / SW / HI' },
    { icon: <Bot size={16} />, label: 'Function Calling', sub: 'Groq llama-3.3-70b · Structured extraction · Bulk input' },
    { icon: <AlertTriangle size={16} />, label: 'Clinical Overrides', sub: 'Postcoital bleeding → HIGH · WHO Grade A criteria' },
    { icon: <ShieldCheck size={16} />, label: 'SpaCy NER', sub: 'PII scrubber · Patient data never stored as plaintext' },
  ]
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
      gap: 10,
    }}>
      {items.map((item, i) => (
        <div key={i} style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 10, padding: '12px 14px',
        }}>
          <p style={{ fontSize: 16, color: '#00d4a0', marginBottom: 6, display: 'flex', alignItems: 'center' }}>{item.icon}</p>
          <p style={{ fontSize: 12, fontWeight: 500, color: '#e8eaf0', marginBottom: 3 }}>{item.label}</p>
          <p style={{ fontSize: 10, color: '#4a5568', lineHeight: 1.4 }}>{item.sub}</p>
        </div>
      ))}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function LandingPage() {
  const router  = useRouter()
  const [loaded, setLoaded] = useState(false)

  useEffect(() => { const t = setTimeout(() => setLoaded(true), 80); return () => clearTimeout(t) }, [])

  return (
    <div style={{ background: '#0a0e14', minHeight: '100vh', overflowX: 'hidden', color: '#e8eaf0' }}>

      {/* ── Ambient background ── */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
        background: `
          radial-gradient(ellipse 70% 50% at 10% 60%, rgba(0,212,160,0.06) 0%, transparent 70%),
          radial-gradient(ellipse 50% 60% at 90% 20%, rgba(255,71,87,0.08) 0%, transparent 70%),
          radial-gradient(ellipse 60% 40% at 50% 100%, rgba(78,158,255,0.04) 0%, transparent 70%)
        `,
      }} />

      {/* ── Header ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(10,14,20,0.85)', backdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        padding: '0 40px', height: 56,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        opacity: loaded ? 1 : 0, transition: 'opacity 0.6s ease',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 9,
            background: 'rgba(0,212,160,0.12)', border: '1px solid rgba(0,212,160,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1C4.24 1 2 3.24 2 6c0 3.31 5 7 5 7s5-3.69 5-7c0-2.76-2.24-5-5-5z" fill="rgba(0,212,160,0.5)" />
              <circle cx="7" cy="6" r="2" fill="#00d4a0" />
            </svg>
          </div>
          <p style={{ fontSize: 14, fontWeight: 600, color: '#e8eaf0', letterSpacing: '-0.01em' }}>ASHA</p>
        </div>

        <nav style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Screen',    href: '/screen' },
            { label: 'Chat',      href: '/chat' },
          ].map(({ label, href }) => (
            <button key={href} onClick={() => router.push(href)} style={{
              padding: '5px 14px', borderRadius: 8,
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
              color: 'rgba(232,234,240,0.7)', fontSize: 12, cursor: 'pointer',
              fontFamily: 'DM Sans, sans-serif', transition: 'all 0.15s',
            }}>{label}</button>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginLeft: 8 }}>
            <div style={{ width: 6, height: 6, borderRadius: 3, background: '#00d4a0', animation: 'pulseDot 2s infinite' }} />
            <span style={{ fontSize: 11, color: '#00d4a0', fontFamily: 'DM Mono, monospace' }}>System operational</span>
          </div>
        </nav>
      </header>

      <div style={{ position: 'relative', zIndex: 1 }}>

        {/* ════════════════════════════════════════════════════════════════════
            SECTION 1 — HERO
            The number that stops you cold.
        ════════════════════════════════════════════════════════════════════ */}
        <section style={{
          minHeight: '92vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: '80px 24px 60px',
          textAlign: 'center',
        }}>
          <div style={{
            opacity: loaded ? 1 : 0,
            transform: loaded ? 'none' : 'translateY(20px)',
            transition: 'all 0.8s ease 0.1s',
          }}>
            <AnimatedCounter target={342000} />
          </div>

          <div style={{
            opacity: loaded ? 1 : 0,
            transform: loaded ? 'none' : 'translateY(16px)',
            transition: 'all 0.8s ease 0.3s',
          }}>
            <p style={{
              fontSize: 'clamp(18px, 2.5vw, 26px)', color: '#8892a4',
              marginTop: 16, fontWeight: 300, letterSpacing: '0.01em',
            }}>
              women will die of cervical cancer this year
            </p>
            <p style={{ fontSize: 'clamp(13px, 1.5vw, 16px)', color: 'rgba(136,146,164,0.55)', marginTop: 10 }}>
              90% within reach of a community health worker who had no tools to help them
            </p>
          </div>

          {/* Divider line */}
          <div style={{
            width: 1, height: 64,
            background: 'linear-gradient(180deg, transparent, rgba(0,212,160,0.5), transparent)',
            margin: '48px 0',
            opacity: loaded ? 1 : 0, transition: 'opacity 0.8s ease 0.6s',
          }} />

          {/* Product headline */}
          <div style={{
            opacity: loaded ? 1 : 0,
            transform: loaded ? 'none' : 'translateY(12px)',
            transition: 'all 0.8s ease 0.5s', maxWidth: 640,
          }}>
            <p style={{
              fontFamily: 'Instrument Serif, Georgia, serif',
              fontSize: 'clamp(28px, 4vw, 46px)',
              color: '#e8eaf0', lineHeight: 1.25,
              fontWeight: 400, letterSpacing: '-0.02em',
            }}>
              ASHA gives CHWs a <span style={{ color: '#00d4a0' }}>clinical tool</span> that works on any phone, in any village, with no training required.
            </p>
            <p style={{
              fontSize: 15, color: '#64748b', marginTop: 16, lineHeight: 1.7,
            }}>
              WhatsApp-native · ML risk scoring · Instant referral letters · Survivorship support
            </p>
          </div>

          {/* CTAs */}
          <div style={{
            display: 'flex', gap: 12, marginTop: 40, flexWrap: 'wrap', justifyContent: 'center',
            opacity: loaded ? 1 : 0, transition: 'opacity 0.8s ease 0.8s',
          }}>
            <button onClick={() => router.push('/screen')} style={{
              padding: '14px 32px', borderRadius: 12,
              background: '#00d4a0', border: 'none',
              color: '#0a0e14', fontSize: 14, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
              boxShadow: '0 8px 32px rgba(0,212,160,0.35)',
              transition: 'all 0.2s',
              letterSpacing: '0.01em',
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 12px 40px rgba(0,212,160,0.45)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'none'; (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 8px 32px rgba(0,212,160,0.35)' }}
            >
              Try Mobile Screening ↗
            </button>
            <button onClick={() => router.push('/dashboard')} style={{
              padding: '14px 32px', borderRadius: 12,
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
              color: '#e8eaf0', fontSize: 14, cursor: 'pointer',
              fontFamily: 'DM Sans, sans-serif', transition: 'all 0.2s',
            }}>
              View Live Dashboard
            </button>
          </div>

          {/* Scroll indicator */}
          <div style={{
            marginTop: 64, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
            opacity: loaded ? 0.4 : 0, transition: 'opacity 0.8s ease 1.2s',
            animation: 'bounce 2s ease-in-out infinite',
          }}>
            <p style={{ fontSize: 10, color: '#4a5568', letterSpacing: '0.1em', textTransform: 'uppercase' }}>scroll to see it work</p>
            <div style={{ fontSize: 16, color: '#4a5568' }}>↓</div>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════════════════
            SECTION 2 — THE CRISIS IS REAL
        ════════════════════════════════════════════════════════════════════ */}
        <section style={{ padding: '80px 40px', maxWidth: 1100, margin: '0 auto' }}>
          <Section>
            <div style={{ textAlign: 'center', marginBottom: 48 }}>
              <p style={{
                fontSize: 10, color: '#00d4a0', textTransform: 'uppercase',
                letterSpacing: '0.12em', marginBottom: 12,
                fontFamily: 'DM Mono, monospace',
              }}>The crisis</p>
              <p style={{
                fontFamily: 'Instrument Serif, Georgia, serif',
                fontSize: 'clamp(24px, 3.5vw, 38px)',
                color: '#e8eaf0', fontWeight: 400, lineHeight: 1.3,
              }}>
                18 of the 20 countries with the highest<br />
                cervical cancer burden are in Africa.
              </p>
              <p style={{ fontSize: 14, color: '#64748b', marginTop: 12 }}>
                Source: GLOBOCAN 2020 · WHO / Lancet Global Health 2022
              </p>
            </div>
          </Section>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
            {[
              { flag: '🇰🇪', country: 'Kenya',      deaths: '3,591',  screening: 16, delay: 0   },
              { flag: '🇹🇿', country: 'Tanzania',   deaths: '11,200', screening: 7,  delay: 80  },
              { flag: '🇺🇬', country: 'Uganda',     deaths: '10,800', screening: 5,  delay: 160 },
              { flag: '🇳🇬', country: 'Nigeria',    deaths: '26,000', screening: 8,  delay: 240 },
              { flag: '🇲🇿', country: 'Mozambique', deaths: '9,200',  screening: 13, delay: 320 },
              { flag: '🇮🇳', country: 'India',      deaths: '81,000', screening: 9,  delay: 400 },
            ].map(c => <CrisisCard key={c.country} {...c} />)}
          </div>

          <Section style={{ marginTop: 32, textAlign: 'center' }}>
            <div style={{
              display: 'inline-flex', gap: 8, alignItems: 'center',
              padding: '10px 20px', borderRadius: 100,
              background: 'rgba(255,71,87,0.08)', border: '1px solid rgba(255,71,87,0.2)',
            }}>
              <span style={{ color: '#ff4757', fontSize: 14, display: 'inline-flex' }}><AlertTriangle size={14} /></span>
              <p style={{ fontSize: 13, color: 'rgba(255,71,87,0.8)' }}>
                In most of these countries, fewer than 1 in 8 women has ever been screened.
              </p>
            </div>
          </Section>
        </section>

        {/* ════════════════════════════════════════════════════════════════════
            SECTION 3 — PRODUCT DEMO (the wow moment)
        ════════════════════════════════════════════════════════════════════ */}
        <section style={{
          padding: '80px 40px',
          background: 'linear-gradient(180deg, transparent, rgba(0,212,160,0.03), transparent)',
          borderTop: '1px solid rgba(255,255,255,0.04)',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
        }}>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <Section style={{ textAlign: 'center', marginBottom: 56 }}>
              <p style={{
                fontSize: 10, color: '#00d4a0', textTransform: 'uppercase',
                letterSpacing: '0.12em', marginBottom: 12, fontFamily: 'DM Mono, monospace',
              }}>Live demo</p>
              <p style={{
                fontFamily: 'Instrument Serif, Georgia, serif',
                fontSize: 'clamp(24px, 3.5vw, 38px)',
                color: '#e8eaf0', fontWeight: 400, lineHeight: 1.3,
              }}>
                This is what Amara's CHW does now.<br />
                <span style={{ color: '#00d4a0' }}>On any phone. No app. No training.</span>
              </p>
            </Section>

            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr',
              gap: 48, alignItems: 'center',
            }}>
              {/* Left — Amara's story */}
              <Section>
                <div style={{
                  background: 'linear-gradient(135deg, #161c28, #111620)',
                  border: '1px solid rgba(255,71,87,0.2)',
                  borderRadius: 20, padding: '28px',
                  position: 'relative', overflow: 'hidden',
                }}>
                  <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, height: 2,
                    background: 'linear-gradient(90deg, #ff4757, transparent)',
                  }} />

                  <div style={{ display: 'flex', gap: 14, marginBottom: 20 }}>
                    <div style={{
                      width: 52, height: 52, borderRadius: 14,
                      background: 'rgba(255,71,87,0.08)', border: '1px solid rgba(255,71,87,0.2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26,
                    }}>🇰🇪</div>
                    <div>
                      <p style={{ fontFamily: 'Instrument Serif, Georgia, serif', fontSize: 22, color: '#e8eaf0' }}>
                        Amara
                      </p>
                      <p style={{ fontSize: 11, color: '#8892a4', marginTop: 2 }}>34 · Rural Western Kenya</p>
                    </div>
                  </div>

                  <p style={{
                    fontSize: 14, color: 'rgba(232,234,240,0.75)',
                    lineHeight: 1.8, fontStyle: 'italic', marginBottom: 20,
                  }}>
                    "She has been bleeding for 6 weeks. The CHW visited her today — and for the first time, had a tool that knew what to do."
                  </p>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{
                      padding: '4px 12px', borderRadius: 100, fontSize: 11,
                      background: 'rgba(255,71,87,0.1)', border: '1px solid rgba(255,71,87,0.25)',
                      color: '#ff4757', fontWeight: 600,
                    }}>HIGH RISK · 79%</span>
                    <span style={{
                      padding: '4px 12px', borderRadius: 100, fontSize: 11,
                      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                      color: '#8892a4',
                    }}>Referred to Kisumu Clinic</span>
                    <span style={{
                      padding: '4px 12px', borderRadius: 100, fontSize: 11,
                      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                      color: '#8892a4',
                    }}>90 seconds total</span>
                  </div>

                  {/* Timeline */}
                  <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {[
                      { step: '01', text: 'CHW types "screen" on WhatsApp', done: true },
                      { step: '02', text: 'Describes patient in plain language', done: true },
                      { step: '03', text: 'ASHA scores risk via ML + WHO criteria', done: true },
                      { step: '04', text: 'Clinical referral letter delivered instantly', done: true },
                    ].map(({ step, text, done }) => (
                      <div key={step} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <div style={{
                          width: 20, height: 20, borderRadius: 10, flexShrink: 0,
                          background: done ? '#00d4a0' : 'rgba(255,255,255,0.06)',
                          border: done ? 'none' : '1px solid rgba(255,255,255,0.1)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 9, color: done ? '#0a0e14' : '#4a5568', fontWeight: 700,
                          fontFamily: 'DM Mono, monospace',
                        }}>{done ? <CheckCircle2 size={11} /> : step}</div>
                        <p style={{ fontSize: 12, color: done ? '#8892a4' : '#4a5568', lineHeight: 1.5 }}>
                          {text}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Priya card below */}
                <div style={{
                  marginTop: 16,
                  background: 'linear-gradient(135deg, #161c28, #111620)',
                  border: '1px solid rgba(0,212,160,0.2)',
                  borderRadius: 20, padding: '24px',
                  position: 'relative', overflow: 'hidden',
                }}>
                  <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, height: 2,
                    background: 'linear-gradient(90deg, #00d4a0, transparent)',
                  }} />
                  <div style={{ display: 'flex', gap: 14, marginBottom: 16 }}>
                    <div style={{
                      width: 52, height: 52, borderRadius: 14,
                      background: 'rgba(0,212,160,0.06)', border: '1px solid rgba(0,212,160,0.2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26,
                    }}>🇮🇳</div>
                    <div>
                      <p style={{ fontFamily: 'Instrument Serif, Georgia, serif', fontSize: 22, color: '#e8eaf0' }}>Priya</p>
                      <p style={{ fontSize: 11, color: '#8892a4', marginTop: 2 }}>36 · Rural Maharashtra · Survivor</p>
                    </div>
                  </div>
                  <p style={{ fontSize: 14, color: 'rgba(232,234,240,0.75)', lineHeight: 1.8, fontStyle: 'italic', marginBottom: 16 }}>
                    "3 months post-chemotherapy. ASHA checks in every week — and sends her a Yoga Nidra protocol for the fatigue no one else is treating."
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span style={{
                      padding: '4px 12px', borderRadius: 100, fontSize: 11,
                      background: 'rgba(0,212,160,0.08)', border: '1px solid rgba(0,212,160,0.2)',
                      color: '#00d4a0', fontWeight: 500,
                    }}>Stable · Week 3</span>
                    <span style={{
                      padding: '4px 12px', borderRadius: 100, fontSize: 11,
                      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                      color: '#8892a4',
                    }}>Recovery improving</span>
                  </div>
                </div>
              </Section>

              {/* Right — live WhatsApp demo */}
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <WhatsAppDemo />
              </div>
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════════════════
            SECTION 4 — HOW IT WORKS
        ════════════════════════════════════════════════════════════════════ */}
        <section style={{ padding: '80px 40px', maxWidth: 1000, margin: '0 auto' }}>
          <Section style={{ textAlign: 'center', marginBottom: 56 }}>
            <p style={{
              fontSize: 10, color: '#00d4a0', textTransform: 'uppercase',
              letterSpacing: '0.12em', marginBottom: 12, fontFamily: 'DM Mono, monospace',
            }}>How ASHA works</p>
            <p style={{
              fontFamily: 'Instrument Serif, Georgia, serif',
              fontSize: 'clamp(24px, 3.5vw, 36px)',
              color: '#e8eaf0', fontWeight: 400,
            }}>
              From symptom to referral in 90 seconds.
            </p>
          </Section>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2, position: 'relative' }}>
            {/* Connection line */}
            <div style={{
              position: 'absolute', top: '50%', left: '16.5%', right: '16.5%',
              height: 1, background: 'linear-gradient(90deg, rgba(0,212,160,0.4), rgba(0,212,160,0.1), rgba(0,212,160,0.4))',
              transform: 'translateY(-50%)', zIndex: 0,
            }} />

            {[
              {
                num:  '01',
                icon: <Smartphone size={24} />,
                title:'CHW screens patient',
                sub:  'Types symptoms into WhatsApp in any language — English, Swahili, Hindi. No app install. Works on 2G.',
                color:'#00d4a0',
              },
              {
                num:  '02',
                icon: <Hexagon size={22} />,
                title:'ASHA scores the risk',
                sub:  'XGBoost ML model + WHO oral cancer scoring + clinical override layer. Sensitivity 100% for positive cases.',
                color:'#4e9eff',
              },
              {
                num:  '03',
                icon: <FileText size={23} />,
                title:'Referral letter delivered',
                sub:  'Professional clinical letter on CHW\'s phone in seconds. Date, patient data, recommended action, CHW contact.',
                color:'#ffa502',
              },
            ].map((step, i) => (
              <Section key={i} style={{ position: 'relative', zIndex: 1 }}>
                <div style={{
                  background: '#111620',
                  border: `1px solid ${step.color}25`,
                  borderTop: `2px solid ${step.color}`,
                  borderRadius: '0 0 16px 16px',
                  padding: '28px 24px', textAlign: 'center',
                  margin: '0 8px',
                }}>
                  <div style={{
                    width: 56, height: 56, borderRadius: 16,
                    background: `${step.color}10`,
                    border: `1px solid ${step.color}25`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: step.color, margin: '0 auto 16px',
                  }}>{step.icon}</div>
                  <p style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: step.color, marginBottom: 8, letterSpacing: '0.08em' }}>
                    {step.num}
                  </p>
                  <p style={{ fontSize: 14, fontWeight: 600, color: '#e8eaf0', marginBottom: 8 }}>
                    {step.title}
                  </p>
                  <p style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>
                    {step.sub}
                  </p>
                </div>
              </Section>
            ))}
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════════════════
            SECTION 5 — IMPACT PROJECTOR
        ════════════════════════════════════════════════════════════════════ */}
        <section style={{
          padding: '80px 40px',
          borderTop: '1px solid rgba(255,255,255,0.04)',
          background: 'linear-gradient(180deg, transparent, rgba(0,212,160,0.02), transparent)',
        }}>
          <div style={{ maxWidth: 720, margin: '0 auto' }}>
            <Section style={{ textAlign: 'center', marginBottom: 32 }}>
              <p style={{
                fontSize: 10, color: '#00d4a0', textTransform: 'uppercase',
                letterSpacing: '0.12em', marginBottom: 12, fontFamily: 'DM Mono, monospace',
              }}>Scale it</p>
              <p style={{
                fontFamily: 'Instrument Serif, Georgia, serif',
                fontSize: 'clamp(22px, 3vw, 34px)',
                color: '#e8eaf0', fontWeight: 400,
              }}>
                How many lives could your network reach?
              </p>
            </Section>
            <ImpactProjector visible={true} />
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════════════════
            SECTION 6 — TECHNICAL PROOF (for WAY interns)
        ════════════════════════════════════════════════════════════════════ */}
        <section style={{ padding: '80px 40px', maxWidth: 1100, margin: '0 auto' }}>
          <Section style={{ marginBottom: 40 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16 }}>
              <div>
                <p style={{
                  fontSize: 10, color: '#00d4a0', textTransform: 'uppercase',
                  letterSpacing: '0.12em', marginBottom: 8, fontFamily: 'DM Mono, monospace',
                }}>Under the hood</p>
                <p style={{
                  fontFamily: 'Instrument Serif, Georgia, serif',
                  fontSize: 'clamp(22px, 3vw, 32px)', color: '#e8eaf0', fontWeight: 400,
                }}>Built for real clinical deployment.</p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {['5 AI agents', '2 ML models', 'WHO-validated', '$0 infra'].map(t => (
                  <span key={t} style={{
                    padding: '5px 12px', borderRadius: 100, fontSize: 11,
                    background: 'rgba(0,212,160,0.06)', border: '1px solid rgba(0,212,160,0.15)',
                    color: '#00d4a0',
                  }}>{t}</span>
                ))}
              </div>
            </div>
          </Section>
          <Section>
            <TechProof />
          </Section>

          {/* Pipeline diagram */}
          <Section style={{ marginTop: 32 }}>
            <div style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 16, padding: '20px 24px',
              overflowX: 'auto',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 0, minWidth: 600 }}>
                {[
                  { label: 'CHW', sub: 'WhatsApp', color: '#00d4a0' },
                  { label: 'Intake', sub: 'Intent classifier', color: '#4e9eff' },
                  { label: 'Screening', sub: 'Function calling', color: '#4e9eff' },
                  { label: 'Risk ML', sub: 'XGBoost + overrides', color: '#ffa502' },
                  { label: 'Referral', sub: 'Groq + quality gate', color: '#ff4757' },
                  { label: 'Clinic', sub: 'PDF letter', color: '#2ed573' },
                ].map((node, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', flex: i < 5 ? 1 : 0 }}>
                    <div style={{
                      background: `${node.color}10`,
                      border: `1px solid ${node.color}30`,
                      borderRadius: 10, padding: '10px 14px', textAlign: 'center',
                      minWidth: 80,
                    }}>
                      <p style={{ fontSize: 11, fontWeight: 600, color: node.color }}>{node.label}</p>
                      <p style={{ fontSize: 9, color: '#4a5568', marginTop: 2 }}>{node.sub}</p>
                    </div>
                    {i < 5 && (
                      <div style={{ flex: 1, height: 1, background: `${node.color}30`, position: 'relative' }}>
                        <div style={{
                          position: 'absolute', right: -4, top: '50%', transform: 'translateY(-50%)',
                          width: 0, height: 0,
                          borderLeft: `5px solid ${node.color}60`,
                          borderTop: '4px solid transparent',
                          borderBottom: '4px solid transparent',
                        }} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </Section>
        </section>

        {/* ════════════════════════════════════════════════════════════════════
            SECTION 7 — SPONSORS + SDGs
        ════════════════════════════════════════════════════════════════════ */}
        <section style={{
          padding: '60px 40px',
          borderTop: '1px solid rgba(255,255,255,0.04)',
          textAlign: 'center',
        }}>
          <Section>
            <p style={{ fontSize: 11, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 24 }}>
              In partnership with
            </p>
            <div style={{ display: 'flex', gap: 24, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 32 }}>
              {[
                'Cancer Aid Society India — GoodBye Tobacco Programme',
                'GNEC Partner Network',
                'WHO Protocol Aligned',
                'UN SDG 3 Initiative',
              ].map(p => (
                <span key={p} style={{ fontSize: 12, color: '#4a5568', fontStyle: 'italic' }}>{p}</span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              {['SDG 3.1 · Maternal mortality', 'SDG 3.4 · NCD premature deaths', 'SDG 3.8 · Universal health coverage'].map(s => (
                <span key={s} style={{
                  fontSize: 11, padding: '5px 14px', borderRadius: 100,
                  background: 'rgba(0,212,160,0.06)', border: '1px solid rgba(0,212,160,0.15)',
                  color: '#00d4a0', fontFamily: 'DM Mono, monospace',
                }}>{s}</span>
              ))}
            </div>
          </Section>
        </section>

        {/* ════════════════════════════════════════════════════════════════════
            SECTION 8 — FINAL CTA
        ════════════════════════════════════════════════════════════════════ */}
        <section style={{
          padding: '100px 40px',
          textAlign: 'center',
          background: 'linear-gradient(180deg, transparent, rgba(0,212,160,0.04), transparent)',
          borderTop: '1px solid rgba(255,255,255,0.04)',
        }}>
          <Section>
            <p style={{
              fontFamily: 'Instrument Serif, Georgia, serif',
              fontSize: 'clamp(26px, 4vw, 48px)',
              color: '#e8eaf0', fontWeight: 400, lineHeight: 1.2,
              maxWidth: 640, margin: '0 auto 20px',
            }}>
              50 CHWs. GNEC's network.<br />
              <span style={{ color: '#00d4a0' }}>WhatsApp. Ready today.</span>
            </p>
            <p style={{ fontSize: 14, color: '#64748b', maxWidth: 480, margin: '0 auto 40px', lineHeight: 1.7 }}>
              ASHA requires no app installation, no training, no infrastructure cost. Deploy to your entire CHW network this week.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button onClick={() => router.push('/screen')} style={{
                padding: '16px 40px', borderRadius: 14,
                background: '#00d4a0', border: 'none',
                color: '#0a0e14', fontSize: 15, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                boxShadow: '0 8px 40px rgba(0,212,160,0.4)',
                transition: 'all 0.2s',
              }}>
                Try Screening Now
              </button>
              <button onClick={() => router.push('/dashboard')} style={{
                padding: '16px 40px', borderRadius: 14,
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                color: '#e8eaf0', fontSize: 15, cursor: 'pointer',
                fontFamily: 'DM Sans, sans-serif',
              }}>
                View Live Dashboard
              </button>
              <button onClick={() => router.push('/chat')} style={{
                padding: '16px 40px', borderRadius: 14,
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                color: '#8892a4', fontSize: 15, cursor: 'pointer',
                fontFamily: 'DM Sans, sans-serif',
              }}>
                Open Chat
              </button>
            </div>
            <p style={{ fontSize: 11, color: '#334155', marginTop: 24 }}>
              Cancer Aid Society India · WHO Protocol Aligned · GNEC Partner Network · SDG 3.1 · 3.4 · 3.8
            </p>
          </Section>
        </section>

        {/* ── Footer ── */}
        <footer style={{
          borderTop: '1px solid rgba(255,255,255,0.04)',
          padding: '24px 40px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexWrap: 'wrap', gap: 12,
        }}>
          <p style={{ fontSize: 11, color: '#334155', fontFamily: 'DM Mono, monospace' }}>
            ASHA v2.0 · SDG 3.1 · 3.4 · 3.8
          </p>
          <p style={{ fontSize: 11, color: '#334155', fontFamily: 'DM Mono, monospace', fontStyle: 'italic' }}>
            वसुधैव कुटुम्बकम् — The world is one family
          </p>
        </footer>
      </div>

      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)} }
        @keyframes bounce { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-5px)} }
        @keyframes pulseDot { 0%,100%{opacity:1}50%{opacity:0.4} }

        /* Responsive grid collapse */
        @media (max-width: 900px) {
          .demo-grid { grid-template-columns: 1fr !important; }
          .steps-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 640px) {
          .crisis-grid { grid-template-columns: 1fr 1fr !important; }
        }

        /* Smooth scrolling */
        html { scroll-behavior: smooth; }

        /* Cursor pointer for all buttons */
        button { cursor: pointer; }
      `}</style>
    </div>
  )
}
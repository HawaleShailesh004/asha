import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseKey)

// ── Types ──────────────────────────────────────────────────────────────────
export type RiskTier = 'HIGH' | 'ELEVATED' | 'LOW'

export interface Patient {
  id: string
  chw_phone: string
  age: number | null
  gender: string | null
  screening_type: string
  cervical_probability: number | null
  cervical_tier: RiskTier | null
  oral_score: number | null
  oral_tier: RiskTier | null
  risk_tier: RiskTier
  top_risk_factors: string[]
  referral_generated: boolean
  referral_language: string | null
  referral_letter: string | null
  referral_quality_score: number | null
  raw_screening_data: Record<string, unknown>
  created_at: string
}

export interface RiskDistribution {
  HIGH: number
  ELEVATED: number
  LOW: number
}

export interface RegionalRisk {
  chw_phone: string
  total: number
  high_count: number
  high_pct: number
}

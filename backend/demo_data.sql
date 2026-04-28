-- ASHA Demo Data — Priya's survivorship record
-- Run this in Supabase SQL Editor before recording the demo
-- This seeds Priya as a registered survivor for the Priya demo flow

-- 1. Register Priya as a survivor
INSERT INTO survivorship_cohort (phone, name, chw_phone, cancer_type, checkin_week, created_at)
VALUES (
  '+919321556764',            -- use your own number for demo
  'Priya Mehta',
  '+919321556764',
  'cervical',
  3,
  now() - interval '3 weeks'
)
ON CONFLICT (phone) DO UPDATE SET
  name         = 'Priya Mehta',
  cancer_type  = 'cervical',
  checkin_week = 3;

-- 2. Insert 3 weeks of check-in history to show the trajectory chart
INSERT INTO survivorship_checkins
  (survivor_phone, week_number, fatigue_score, pain_score, mood_score,
   new_symptoms, trajectory_alert, protocol_sent, created_at)
VALUES
  ('+919321556764', 1, 6, 5, 5,
   'Some nausea',
   'STABLE',
   '🧘 Yoga Nidra: 20-minute body scan before sleep
🌬️ Nadi Shodhana pranayama: 5 minutes each morning
🌿 Ayurveda: Warm turmeric milk at night, ashwagandha with breakfast
💛 You are healing. Every day is a step forward.',
   now() - interval '3 weeks'),

  ('+919321556764', 2, 5, 4, 6,
   'None',
   'STABLE',
   '🧘 Restorative yoga: Legs-up-the-wall pose, 15 minutes
🌬️ Bhramari (humming bee breath): 5 rounds morning
🌿 Ayurveda: Ginger-honey tea twice daily, sesame oil self-massage
💛 Your energy is returning. Keep listening to your body.',
   now() - interval '2 weeks'),

  ('+919321556764', 3, 4, 3, 7,
   'None',
   'STABLE',
   '🧘 Yoga Nidra: Deep relaxation scan, 25 minutes
🌬️ Anulom Vilom pranayama: 10 minutes after waking
🌿 Ayurveda: Triphala at bedtime, warm ghee with meals
💛 Three weeks of courage. You are stronger than you know.',
   now() - interval '1 week');

-- Verify
SELECT name, cancer_type, checkin_week FROM survivorship_cohort WHERE phone = '+919321556764';
SELECT week_number, fatigue_score, pain_score, mood_score FROM survivorship_checkins
  WHERE survivor_phone = '+919321556764' ORDER BY week_number;

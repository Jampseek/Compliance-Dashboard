// Optional Supabase persistence. The Compliance Analyst Dashboard in the
// architecture is "React + Supabase". The demo runs fully in-memory by default;
// if you set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, this client becomes
// available for persisting alerts/cases/audit to a Supabase project.
//
// SQL schema for the Supabase tables lives in ../../supabase/schema.sql.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseEnabled = Boolean(url && key)

export const supabase: SupabaseClient | null = supabaseEnabled
  ? createClient(url as string, key as string)
  : null

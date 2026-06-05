
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://lssmeqgzgkibcngrxpgg.supabase.co'

const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_oFidJ90ECKwwmSDNZ2nflA_HM_X4gP8'

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey
)

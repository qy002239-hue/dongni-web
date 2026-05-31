
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://lssmeqgzgkibcngrxpgg.supabase.co'

const supabaseAnonKey = 'sb_publishable_oFidJ90ECKwwmSDNZ2nflA_HM_X4gP8'

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey
)

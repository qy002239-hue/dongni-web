
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://lssmeqgzgkibcngrxpgg.supabase.co'

const supabaseAnonKey = '先留空'

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey
)

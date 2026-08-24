import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env (veja .env.example)'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Todas as tabelas do checklist vivem no schema "checklist" (isolado das
// tabelas do sistema financeiro que já existe nesse mesmo projeto Supabase)
export const db = supabase.schema('checklist')

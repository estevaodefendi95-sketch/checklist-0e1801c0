import { supabase } from '../integrations/supabase/client'

export { supabase }

// Todas as tabelas do checklist vivem no schema "checklist" (isolado das
// tabelas do sistema financeiro que já existe nesse mesmo projeto Supabase)
export const db = supabase.schema('checklist')

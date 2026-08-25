import { supabase } from '../integrations/supabase/client'

export { supabase }

// Todas as tabelas do checklist vivem no schema "checklist" (isolado das
// tabelas do sistema financeiro que já existe nesse mesmo projeto Supabase).
// O arquivo de tipos gerado só cobre o schema "public", então relaxamos os
// tipos aqui para não travar o build.
export const db = (supabase as any).schema('checklist') as any

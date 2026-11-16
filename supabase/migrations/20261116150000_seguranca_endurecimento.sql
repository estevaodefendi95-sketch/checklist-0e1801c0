-- Endurecimento de segurança do schema checklist (2026-11-16)
-- 1) anon (sem login) não acessa nenhuma tabela/função do schema; as páginas públicas usam edge functions (service role)
revoke all on all tables in schema checklist from anon;
revoke all on all sequences in schema checklist from anon;
revoke execute on all functions in schema checklist from public, anon;
grant execute on all functions in schema checklist to authenticated, service_role;
alter default privileges in schema checklist revoke all on tables from anon;
alter default privileges in schema checklist revoke execute on functions from public, anon;
alter default privileges in schema checklist grant execute on functions to authenticated, service_role;

-- 2) tabelas só do servidor (PIN e chaves push): nem usuário logado acessa direto
revoke all on checklist.pdv_pins from authenticated;
revoke all on checklist.pdv_vapid from authenticated;

-- 3) fiscal e TEF: leitura/escrita só com permissão adequada (antes: qualquer usuário logado)
drop policy if exists pdv_fiscal_config_ler on checklist.pdv_fiscal_config;
drop policy if exists pdv_fiscal_config_escrever on checklist.pdv_fiscal_config;
create policy pdv_fiscal_config_ler on checklist.pdv_fiscal_config for select to authenticated
  using (checklist.pdv_pode('pdv_operar') or checklist.pdv_pode('pdv_caixa') or checklist.pdv_pode('pdv_fiscal') or checklist.pdv_pode('pdv_gerir'));
create policy pdv_fiscal_config_escrever on checklist.pdv_fiscal_config for all to authenticated
  using (checklist.pdv_pode('pdv_fiscal') or checklist.pdv_pode('pdv_gerir'))
  with check (checklist.pdv_pode('pdv_fiscal') or checklist.pdv_pode('pdv_gerir'));

drop policy if exists pdv_tef_config_ler on checklist.pdv_tef_config;
drop policy if exists pdv_tef_config_escrever on checklist.pdv_tef_config;
create policy pdv_tef_config_ler on checklist.pdv_tef_config for select to authenticated
  using (checklist.pdv_pode('pdv_fiscal') or checklist.pdv_pode('pdv_gerir'));
create policy pdv_tef_config_escrever on checklist.pdv_tef_config for all to authenticated
  using (checklist.pdv_pode('pdv_fiscal') or checklist.pdv_pode('pdv_gerir'))
  with check (checklist.pdv_pode('pdv_fiscal') or checklist.pdv_pode('pdv_gerir'));

drop policy if exists pdv_notas_ler on checklist.pdv_notas;
drop policy if exists pdv_notas_escrever on checklist.pdv_notas;
create policy pdv_notas_ler on checklist.pdv_notas for select to authenticated
  using (checklist.pdv_pode('pdv_operar') or checklist.pdv_pode('pdv_caixa') or checklist.pdv_pode('pdv_fiscal') or checklist.pdv_pode('pdv_gerir') or checklist.pdv_pode('pdv_ver_vendas'));
create policy pdv_notas_escrever on checklist.pdv_notas for all to authenticated
  using (checklist.pdv_pode('pdv_caixa') or checklist.pdv_pode('pdv_fiscal') or checklist.pdv_pode('pdv_gerir'))
  with check (checklist.pdv_pode('pdv_caixa') or checklist.pdv_pode('pdv_fiscal') or checklist.pdv_pode('pdv_gerir'));

-- 4) view respeita o RLS de quem consulta
alter view checklist.pdv_comanda_totais set (security_invoker = true);

-- 5) função de distância com search_path fixo
alter function checklist.pdv_distancia_m(double precision, double precision, double precision, double precision) set search_path = pg_catalog, public;

-- 6) auditoria de acesso a dados pessoais de clientes
create table if not exists checklist.pdv_auditoria_clientes (
  id bigint generated always as identity primary key,
  quando timestamptz not null default now(),
  usuario uuid default auth.uid(),
  acao text not null,
  cliente_id uuid,
  detalhe text
);
alter table checklist.pdv_auditoria_clientes enable row level security;
create policy pdv_aud_cli_ler on checklist.pdv_auditoria_clientes for select to authenticated using (checklist.pdv_pode('pdv_gerir'));
revoke all on checklist.pdv_auditoria_clientes from anon;
revoke insert, update, delete on checklist.pdv_auditoria_clientes from authenticated;
create index if not exists pdv_aud_cli_quando_idx on checklist.pdv_auditoria_clientes (quando desc);

create or replace function checklist.trg_pdv_clientes_auditoria() returns trigger
language plpgsql security definer set search_path = checklist, public as $$
begin
  if tg_op = 'DELETE' then
    insert into checklist.pdv_auditoria_clientes(acao, cliente_id, detalhe) values ('apagou', old.id, old.nome);
    return old;
  elsif tg_op = 'UPDATE' then
    insert into checklist.pdv_auditoria_clientes(acao, cliente_id, detalhe)
    select 'editou', new.id, d from (select concat_ws(',',
      case when new.telefone is distinct from old.telefone then 'telefone' end,
      case when new.nascimento is distinct from old.nascimento then 'nascimento' end,
      case when new.cpf is distinct from old.cpf then 'cpf' end,
      case when new.email is distinct from old.email then 'email' end,
      case when new.nome is distinct from old.nome then 'nome' end) as d) x where d <> '';
    return new;
  end if;
  return new;
end $$;
drop trigger if exists pdv_clientes_auditoria on checklist.pdv_clientes;
create trigger pdv_clientes_auditoria after update or delete on checklist.pdv_clientes
  for each row execute function checklist.trg_pdv_clientes_auditoria();

create or replace function checklist.pdv_log_exportacao(p_tipo text, p_qtd integer) returns void
language sql security definer set search_path = checklist, public as $$
  insert into checklist.pdv_auditoria_clientes(acao, detalhe) values ('exportou', p_tipo || ' (' || p_qtd || ' registros)')
$$;
revoke all on function checklist.pdv_log_exportacao(text, integer) from public, anon;
grant execute on function checklist.pdv_log_exportacao(text, integer) to authenticated;

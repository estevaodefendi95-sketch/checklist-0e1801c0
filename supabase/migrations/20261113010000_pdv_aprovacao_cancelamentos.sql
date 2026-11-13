-- Cancelar item, cancelar comanda e estornar pagamento só com aprovação (senha) de administrador.
-- A aprovação é conferida na função pdv-aprovar (service role); o banco recusa a mudança direta de usuários logados.
create table if not exists checklist.pdv_aprovacoes (
  id bigserial primary key,
  acao text not null,
  comanda_id uuid,
  item_id uuid,
  pagamento_id uuid,
  detalhe text,
  motivo text,
  solicitado_por uuid,
  aprovado_por uuid,
  criado_em timestamptz not null default now()
);
alter table checklist.pdv_aprovacoes enable row level security;
drop policy if exists pdv_aprov_ler on checklist.pdv_aprovacoes;
create policy pdv_aprov_ler on checklist.pdv_aprovacoes for select to authenticated using (checklist.pdv_pode('pdv_gerir') or checklist.pdv_pode('pdv_caixa'));
grant select on checklist.pdv_aprovacoes to authenticated;
grant all on checklist.pdv_aprovacoes to service_role;
grant usage, select on sequence checklist.pdv_aprovacoes_id_seq to service_role;

create table if not exists checklist.pdv_aprov_falhas (
  id bigserial primary key,
  user_id uuid not null,
  criado_em timestamptz not null default now()
);
alter table checklist.pdv_aprov_falhas enable row level security;
grant all on checklist.pdv_aprov_falhas to service_role;
grant usage, select on sequence checklist.pdv_aprov_falhas_id_seq to service_role;

create or replace function checklist.trg_exige_aprovacao() returns trigger
language plpgsql security definer set search_path = checklist, public as $$
begin
  if coalesce(auth.role(), '') <> 'authenticated' then return new; end if;
  if tg_table_name = 'pdv_pedido_itens' and new.status = 'cancelado' and old.status is distinct from 'cancelado' then
    raise exception 'Cancelar item exige aprovação de administrador.' using errcode = '42501';
  elsif tg_table_name = 'pdv_comandas' and new.status = 'cancelada' and old.status is distinct from 'cancelada' then
    raise exception 'Cancelar comanda exige aprovação de administrador.' using errcode = '42501';
  elsif tg_table_name = 'pdv_pagamentos' and new.estornado and not old.estornado then
    raise exception 'Estornar pagamento exige aprovação de administrador.' using errcode = '42501';
  end if;
  return new;
end $$;

revoke execute on function checklist.trg_exige_aprovacao() from public, anon, authenticated;
drop trigger if exists trg_exige_aprov on checklist.pdv_pedido_itens;
create trigger trg_exige_aprov before update on checklist.pdv_pedido_itens for each row execute function checklist.trg_exige_aprovacao();
drop trigger if exists trg_exige_aprov on checklist.pdv_comandas;
create trigger trg_exige_aprov before update on checklist.pdv_comandas for each row execute function checklist.trg_exige_aprovacao();
drop trigger if exists trg_exige_aprov on checklist.pdv_pagamentos;
create trigger trg_exige_aprov before update on checklist.pdv_pagamentos for each row execute function checklist.trg_exige_aprovacao();

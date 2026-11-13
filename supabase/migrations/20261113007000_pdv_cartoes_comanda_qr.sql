-- QR Code é do CARTÃO DA COMANDA (reutilizável, um por número), não da mesa.
-- O cliente lê o QR do cartão no tablet e o pedido entra na comanda aberta com aquele número.
create table if not exists checklist.pdv_cartoes (
  numero int primary key check (numero > 0),
  token uuid not null unique default gen_random_uuid(),
  criado_em timestamptz not null default now()
);
alter table checklist.pdv_cartoes enable row level security;
drop policy if exists pdv_cartoes_ler on checklist.pdv_cartoes;
drop policy if exists pdv_cartoes_gerir on checklist.pdv_cartoes;
create policy pdv_cartoes_ler on checklist.pdv_cartoes for select using (checklist.pdv_pode('pdv_operar') or checklist.pdv_pode('pdv_gerir'));
create policy pdv_cartoes_gerir on checklist.pdv_cartoes for all using (checklist.pdv_pode('pdv_gerir')) with check (checklist.pdv_pode('pdv_gerir'));
grant select, insert, update, delete on checklist.pdv_cartoes to authenticated;
grant all on checklist.pdv_cartoes to service_role;
insert into checklist.pdv_cartoes (numero) select g from generate_series(1, 60) g on conflict do nothing;

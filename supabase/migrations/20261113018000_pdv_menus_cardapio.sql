-- Menus do cardápio digital (agrupam categorias, com visibilidade e horário próprios) + horário nos banners
create table if not exists checklist.pdv_menus (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  icone text not null default 'cardapio',
  ordem integer not null default 0,
  visivel boolean not null default true,
  horarios jsonb,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
alter table checklist.pdv_menus enable row level security;
create policy pdv_menus_gerir on checklist.pdv_menus for all using (checklist.pdv_pode('pdv_gerir')) with check (checklist.pdv_pode('pdv_gerir'));
create policy pdv_menus_ler on checklist.pdv_menus for select using (checklist.pdv_pode('pdv_operar') or checklist.pdv_pode('pdv_gerir'));
grant select, insert, update, delete on checklist.pdv_menus to authenticated;
grant all on checklist.pdv_menus to service_role;

alter table checklist.pdv_categorias add column if not exists menu_id uuid references checklist.pdv_menus(id) on delete set null;
alter table checklist.pdv_banners add column if not exists horarios jsonb;

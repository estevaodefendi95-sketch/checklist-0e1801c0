-- Bateria dos tablets: cada aparelho avisa o nível; a gestão vê todos.
create table if not exists checklist.pdv_tablet_bateria (
  aparelho text primary key,
  mesa_id uuid references checklist.pdv_mesas(id) on delete cascade,
  nivel int not null check (nivel between 0 and 100),
  carregando boolean not null default false,
  atualizado_em timestamptz not null default now()
);
alter table checklist.pdv_tablet_bateria enable row level security;
drop policy if exists pdv_tablet_bateria_ler on checklist.pdv_tablet_bateria;
create policy pdv_tablet_bateria_ler on checklist.pdv_tablet_bateria for select to authenticated
  using (checklist.pdv_pode('pdv_operar') or checklist.pdv_pode('pdv_gerir'));
grant select on checklist.pdv_tablet_bateria to authenticated;
grant all on checklist.pdv_tablet_bateria to service_role;

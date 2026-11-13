-- Gestão do tablet: banners patrocinados, indicações de pratos, tela de mesa reservada, trava por senha de usuário

create table if not exists checklist.pdv_banners (
  id uuid primary key default gen_random_uuid(),
  titulo text not null default '',
  patrocinador text,
  imagem_url text not null,
  produto_id uuid references checklist.pdv_produtos(id) on delete set null,
  ativo boolean not null default true,
  ordem int not null default 0,
  inicio date,
  fim date,
  criado_em timestamptz not null default now()
);
alter table checklist.pdv_banners enable row level security;
drop policy if exists pdv_banners_ler on checklist.pdv_banners;
drop policy if exists pdv_banners_gerir on checklist.pdv_banners;
create policy pdv_banners_ler on checklist.pdv_banners for select using (checklist.pdv_pode('pdv_operar') or checklist.pdv_pode('pdv_gerir'));
create policy pdv_banners_gerir on checklist.pdv_banners for all using (checklist.pdv_pode('pdv_gerir')) with check (checklist.pdv_pode('pdv_gerir'));
grant select, insert, update, delete on checklist.pdv_banners to authenticated;
grant all on checklist.pdv_banners to service_role;

alter table checklist.pdv_produtos add column if not exists indicacao boolean not null default false;
alter table checklist.pdv_produtos add column if not exists indicacao_rotulo text;

alter table checklist.reservas add column if not exists liberada_tablet_em timestamptz;

-- tentativas erradas de senha no tablet (só a função do tablet, com service role, mexe aqui)
create table if not exists checklist.pdv_tablet_falhas (
  id bigserial primary key,
  token uuid not null,
  criado_em timestamptz not null default now()
);
alter table checklist.pdv_tablet_falhas enable row level security;
grant all on checklist.pdv_tablet_falhas to service_role;
grant usage, select on sequence checklist.pdv_tablet_falhas_id_seq to service_role;

insert into storage.buckets (id, name, public) values ('tablet', 'tablet', true) on conflict (id) do nothing;
drop policy if exists tablet_enviar on storage.objects;
drop policy if exists tablet_trocar on storage.objects;
drop policy if exists tablet_apagar on storage.objects;
create policy tablet_enviar on storage.objects for insert with check (bucket_id = 'tablet' and checklist.pdv_pode('pdv_gerir'));
create policy tablet_trocar on storage.objects for update using (bucket_id = 'tablet' and checklist.pdv_pode('pdv_gerir'));
create policy tablet_apagar on storage.objects for delete using (bucket_id = 'tablet' and checklist.pdv_pode('pdv_gerir'));

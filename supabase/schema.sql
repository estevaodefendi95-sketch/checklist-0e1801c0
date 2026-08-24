-- ============================================================
-- CHECKLIST RESTAURANTE — schema isolado "checklist"
-- Este projeto Supabase (Conta azul) já hospeda outro sistema
-- no schema "public" — por isso todo o checklist vive em um
-- schema próprio, sem conflito de nomes de tabela.
-- Rode este arquivo inteiro no SQL Editor do Supabase.
-- ============================================================

create schema if not exists checklist;

-- Tipos
create type checklist.user_role as enum ('admin', 'editor', 'visualizador');
create type checklist.checklist_tipo as enum ('abertura', 'fechamento');
create type checklist.campo_tipo as enum ('checkbox', 'quantidade', 'sim_nao', 'texto');

-- Áreas fixas
create table checklist.areas (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  created_at timestamptz not null default now()
);

insert into checklist.areas (nome) values ('Cozinha'), ('Bar'), ('Salão');

-- Perfis de usuário (estende auth.users)
create table checklist.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  role checklist.user_role not null default 'visualizador',
  areas_permitidas uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

-- Templates de checklist (um por área + tipo)
create table checklist.checklist_templates (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references checklist.areas(id) on delete cascade,
  tipo checklist.checklist_tipo not null,
  nome text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (area_id, tipo, nome)
);

-- Itens de cada template
create table checklist.checklist_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references checklist.checklist_templates(id) on delete cascade,
  nome_campo text not null,
  tipo_campo checklist.campo_tipo not null default 'checkbox',
  ordem int not null default 0,
  obrigatorio boolean not null default true,
  created_at timestamptz not null default now()
);

-- Execuções diárias — cada dia gera um registro novo, nunca sobrescreve
create table checklist.checklist_execucoes (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references checklist.checklist_templates(id),
  area_id uuid not null references checklist.areas(id),
  tipo checklist.checklist_tipo not null,
  data date not null default current_date,
  preenchido_por uuid not null references checklist.profiles(id),
  horario_inicio timestamptz not null default now(),
  horario_fim timestamptz,
  status text not null default 'em_andamento',
  created_at timestamptz not null default now(),
  unique (template_id, data)
);

-- Respostas de cada item dentro de uma execução
create table checklist.checklist_respostas (
  id uuid primary key default gen_random_uuid(),
  execucao_id uuid not null references checklist.checklist_execucoes(id) on delete cascade,
  item_id uuid not null references checklist.checklist_items(id),
  valor text,
  observacao text,
  updated_at timestamptz not null default now(),
  unique (execucao_id, item_id)
);

-- Aprovação — separada de quem preencheu
create table checklist.aprovacoes (
  id uuid primary key default gen_random_uuid(),
  execucao_id uuid not null unique references checklist.checklist_execucoes(id) on delete cascade,
  aprovado_por uuid not null references checklist.profiles(id),
  role_no_momento checklist.user_role not null,
  horario_aprovacao timestamptz not null default now()
);

-- ============================================================
-- Helpers
-- ============================================================

create or replace function checklist.auth_role() returns checklist.user_role
language sql stable security definer as $$
  select role from checklist.profiles where id = auth.uid()
$$;

create or replace function checklist.auth_areas_permitidas() returns uuid[]
language sql stable security definer as $$
  select areas_permitidas from checklist.profiles where id = auth.uid()
$$;

create or replace function checklist.pode_acessar_area(p_area_id uuid) returns boolean
language sql stable security definer as $$
  select
    checklist.auth_role() = 'admin'
    or p_area_id = any(checklist.auth_areas_permitidas())
$$;

-- ============================================================
-- RLS
-- ============================================================

alter table checklist.profiles enable row level security;
alter table checklist.areas enable row level security;
alter table checklist.checklist_templates enable row level security;
alter table checklist.checklist_items enable row level security;
alter table checklist.checklist_execucoes enable row level security;
alter table checklist.checklist_respostas enable row level security;
alter table checklist.aprovacoes enable row level security;

create policy "profiles_select" on checklist.profiles for select using (auth.uid() is not null);
create policy "profiles_update_admin" on checklist.profiles for update using (checklist.auth_role() = 'admin');
create policy "profiles_insert_admin" on checklist.profiles for insert with check (checklist.auth_role() = 'admin');

create policy "areas_select" on checklist.areas for select using (auth.uid() is not null);

create policy "templates_select" on checklist.checklist_templates for select using (checklist.pode_acessar_area(area_id));
create policy "templates_write_admin" on checklist.checklist_templates for all using (checklist.auth_role() = 'admin') with check (checklist.auth_role() = 'admin');

create policy "items_select" on checklist.checklist_items for select using (
  exists (select 1 from checklist.checklist_templates t where t.id = template_id and checklist.pode_acessar_area(t.area_id))
);
create policy "items_write_admin" on checklist.checklist_items for all using (checklist.auth_role() = 'admin') with check (checklist.auth_role() = 'admin');

create policy "execucoes_select" on checklist.checklist_execucoes for select using (checklist.pode_acessar_area(area_id));
create policy "execucoes_insert" on checklist.checklist_execucoes for insert with check (
  checklist.auth_role() in ('admin', 'editor') and checklist.pode_acessar_area(area_id)
);
create policy "execucoes_update" on checklist.checklist_execucoes for update using (
  checklist.auth_role() in ('admin', 'editor') and checklist.pode_acessar_area(area_id)
);

create policy "respostas_select" on checklist.checklist_respostas for select using (
  exists (select 1 from checklist.checklist_execucoes e where e.id = execucao_id and checklist.pode_acessar_area(e.area_id))
);
create policy "respostas_write" on checklist.checklist_respostas for all using (
  checklist.auth_role() in ('admin', 'editor')
  and exists (select 1 from checklist.checklist_execucoes e where e.id = execucao_id and checklist.pode_acessar_area(e.area_id))
) with check (
  checklist.auth_role() in ('admin', 'editor')
  and exists (select 1 from checklist.checklist_execucoes e where e.id = execucao_id and checklist.pode_acessar_area(e.area_id))
);

create policy "aprovacoes_select" on checklist.aprovacoes for select using (
  exists (select 1 from checklist.checklist_execucoes e where e.id = execucao_id and checklist.pode_acessar_area(e.area_id))
);
create policy "aprovacoes_insert" on checklist.aprovacoes for insert with check (
  checklist.auth_role() in ('admin', 'editor')
  and exists (select 1 from checklist.checklist_execucoes e where e.id = execucao_id and checklist.pode_acessar_area(e.area_id))
);

-- ============================================================
-- Trigger: criar profile automaticamente ao registrar usuário
-- ============================================================
create or replace function checklist.handle_new_user() returns trigger
language plpgsql security definer as $$
begin
  insert into checklist.profiles (id, nome, role, areas_permitidas)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', new.email), 'visualizador', '{}')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created_checklist
  after insert on auth.users
  for each row execute function checklist.handle_new_user();

-- Expor o schema pra API REST (PostgREST)
grant usage on schema checklist to anon, authenticated, service_role;
grant all on all tables in schema checklist to anon, authenticated, service_role;
grant all on all sequences in schema checklist to anon, authenticated, service_role;
alter default privileges in schema checklist grant all on tables to anon, authenticated, service_role;
alter default privileges in schema checklist grant all on sequences to anon, authenticated, service_role;

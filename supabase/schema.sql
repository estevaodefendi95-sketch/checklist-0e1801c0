-- ============================================================
-- CHECKLIST RESTAURANTE — schema completo
-- Rode este arquivo inteiro no SQL Editor do Supabase
-- ============================================================

-- Tipos
create type user_role as enum ('admin', 'editor', 'visualizador');
create type checklist_tipo as enum ('abertura', 'fechamento');
create type campo_tipo as enum ('checkbox', 'quantidade', 'sim_nao', 'texto');

-- Áreas fixas
create table areas (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  created_at timestamptz not null default now()
);

insert into areas (nome) values ('Cozinha'), ('Bar'), ('Salão');

-- Perfis de usuário (estende auth.users)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  role user_role not null default 'visualizador',
  areas_permitidas uuid[] not null default '{}', -- ids de 'areas'; ignorado se role = admin
  created_at timestamptz not null default now()
);

-- Templates de checklist (um por área + tipo)
create table checklist_templates (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references areas(id) on delete cascade,
  tipo checklist_tipo not null,
  nome text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (area_id, tipo, nome)
);

-- Itens de cada template
create table checklist_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references checklist_templates(id) on delete cascade,
  nome_campo text not null,
  tipo_campo campo_tipo not null default 'checkbox',
  ordem int not null default 0,
  obrigatorio boolean not null default true,
  created_at timestamptz not null default now()
);

-- Execuções diárias — cada dia gera uma linha nova, nunca sobrescreve
create table checklist_execucoes (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references checklist_templates(id),
  area_id uuid not null references areas(id),
  tipo checklist_tipo not null,
  data date not null default current_date,
  preenchido_por uuid not null references profiles(id),
  horario_inicio timestamptz not null default now(),
  horario_fim timestamptz,
  status text not null default 'em_andamento', -- em_andamento | concluido
  created_at timestamptz not null default now(),
  unique (template_id, data) -- um checklist por template por dia
);

-- Respostas de cada item dentro de uma execução
create table checklist_respostas (
  id uuid primary key default gen_random_uuid(),
  execucao_id uuid not null references checklist_execucoes(id) on delete cascade,
  item_id uuid not null references checklist_items(id),
  valor text, -- 'true'/'false', número, ou texto livre conforme tipo_campo
  observacao text,
  updated_at timestamptz not null default now(),
  unique (execucao_id, item_id)
);

-- Aprovação — separada de quem preencheu
create table aprovacoes (
  id uuid primary key default gen_random_uuid(),
  execucao_id uuid not null unique references checklist_execucoes(id) on delete cascade,
  aprovado_por uuid not null references profiles(id),
  role_no_momento user_role not null,
  horario_aprovacao timestamptz not null default now()
);

-- ============================================================
-- Helpers
-- ============================================================

create or replace function auth_role() returns user_role
language sql stable security definer as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function auth_areas_permitidas() returns uuid[]
language sql stable security definer as $$
  select areas_permitidas from profiles where id = auth.uid()
$$;

create or replace function pode_acessar_area(p_area_id uuid) returns boolean
language sql stable security definer as $$
  select
    auth_role() = 'admin'
    or p_area_id = any(auth_areas_permitidas())
$$;

-- ============================================================
-- RLS
-- ============================================================

alter table profiles enable row level security;
alter table areas enable row level security;
alter table checklist_templates enable row level security;
alter table checklist_items enable row level security;
alter table checklist_execucoes enable row level security;
alter table checklist_respostas enable row level security;
alter table aprovacoes enable row level security;

-- profiles: todo usuário autenticado pode ler todos os perfis (pra exibir "aprovado por X"); só admin edita
create policy "profiles_select" on profiles for select using (auth.uid() is not null);
create policy "profiles_update_admin" on profiles for update using (auth_role() = 'admin');
create policy "profiles_insert_admin" on profiles for insert with check (auth_role() = 'admin');

-- areas: leitura livre pra autenticados
create policy "areas_select" on areas for select using (auth.uid() is not null);

-- templates: leitura restrita por área; escrita só admin
create policy "templates_select" on checklist_templates for select using (pode_acessar_area(area_id));
create policy "templates_write_admin" on checklist_templates for all using (auth_role() = 'admin') with check (auth_role() = 'admin');

-- items: segue o template
create policy "items_select" on checklist_items for select using (
  exists (select 1 from checklist_templates t where t.id = template_id and pode_acessar_area(t.area_id))
);
create policy "items_write_admin" on checklist_items for all using (auth_role() = 'admin') with check (auth_role() = 'admin');

-- execuções: leitura restrita por área; escrita p/ admin e editor (na área permitida)
create policy "execucoes_select" on checklist_execucoes for select using (pode_acessar_area(area_id));
create policy "execucoes_insert" on checklist_execucoes for insert with check (
  auth_role() in ('admin', 'editor') and pode_acessar_area(area_id)
);
create policy "execucoes_update" on checklist_execucoes for update using (
  auth_role() in ('admin', 'editor') and pode_acessar_area(area_id)
);

-- respostas: segue a execução
create policy "respostas_select" on checklist_respostas for select using (
  exists (select 1 from checklist_execucoes e where e.id = execucao_id and pode_acessar_area(e.area_id))
);
create policy "respostas_write" on checklist_respostas for all using (
  auth_role() in ('admin', 'editor')
  and exists (select 1 from checklist_execucoes e where e.id = execucao_id and pode_acessar_area(e.area_id))
) with check (
  auth_role() in ('admin', 'editor')
  and exists (select 1 from checklist_execucoes e where e.id = execucao_id and pode_acessar_area(e.area_id))
);

-- aprovações: leitura segue execução; só admin e editor aprovam, na área permitida
create policy "aprovacoes_select" on aprovacoes for select using (
  exists (select 1 from checklist_execucoes e where e.id = execucao_id and pode_acessar_area(e.area_id))
);
create policy "aprovacoes_insert" on aprovacoes for insert with check (
  auth_role() in ('admin', 'editor')
  and exists (select 1 from checklist_execucoes e where e.id = execucao_id and pode_acessar_area(e.area_id))
);

-- ============================================================
-- Trigger: criar profile automaticamente ao registrar usuário
-- (novo usuário nasce como 'visualizador' sem áreas; admin ajusta depois)
-- ============================================================
create or replace function handle_new_user() returns trigger
language plpgsql security definer as $$
begin
  insert into public.profiles (id, nome, role, areas_permitidas)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', new.email), 'visualizador', '{}');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

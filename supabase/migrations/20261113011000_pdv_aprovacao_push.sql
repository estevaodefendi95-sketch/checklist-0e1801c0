-- Pedido de aprovação ao administrador com notificação push (Web Push / VAPID).
create table if not exists checklist.pdv_vapid (
  id int primary key default 1 check (id = 1),
  chave_publica text not null,
  chave_privada text not null,
  assunto text not null default 'https://checklistpaggio.lovable.app'
);
alter table checklist.pdv_vapid enable row level security; -- sem política: só service_role lê
grant all on checklist.pdv_vapid to service_role;
-- (a linha com as chaves é gravada à parte, fora do repositório)

create table if not exists checklist.pdv_push_subs (
  id bigserial primary key,
  user_id uuid not null default auth.uid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  criado_em timestamptz not null default now()
);
alter table checklist.pdv_push_subs enable row level security;
drop policy if exists push_subs_proprio on checklist.pdv_push_subs;
create policy push_subs_proprio on checklist.pdv_push_subs for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on checklist.pdv_push_subs to authenticated;
grant usage, select on sequence checklist.pdv_push_subs_id_seq to authenticated;
grant all on checklist.pdv_push_subs to service_role;

create table if not exists checklist.pdv_aprov_pedidos (
  id uuid primary key default gen_random_uuid(),
  acao text not null,
  alvo_id uuid not null,
  comanda_id uuid,
  detalhe text,
  motivo text,
  solicitado_por uuid not null,
  solicitante_nome text,
  status text not null default 'pendente' check (status in ('pendente','aprovado','recusado')),
  decidido_por uuid,
  decidido_em timestamptz,
  erro text,
  criado_em timestamptz not null default now()
);
alter table checklist.pdv_aprov_pedidos enable row level security;
drop policy if exists aprov_ped_ler on checklist.pdv_aprov_pedidos;
create policy aprov_ped_ler on checklist.pdv_aprov_pedidos for select to authenticated using (
  solicitado_por = auth.uid() or exists (select 1 from checklist.profiles p where p.id = auth.uid() and (p.role = 'admin' or p.is_master))
);
grant select on checklist.pdv_aprov_pedidos to authenticated;
grant all on checklist.pdv_aprov_pedidos to service_role;
alter publication supabase_realtime add table checklist.pdv_aprov_pedidos;

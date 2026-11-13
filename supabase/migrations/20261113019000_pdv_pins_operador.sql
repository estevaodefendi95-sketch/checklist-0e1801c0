-- PIN de operador: o administrador cadastra um PIN (4 a 6 dígitos) por usuário.
-- Serve para (1) identificar quem opera o Salão (abrir comanda, lançar, fechar), (2) autorizar cancelamentos
-- e (3) trocar a mesa do tablet. O PIN identifica a pessoa; o login do aparelho continua sendo o do sistema.
create extension if not exists pgcrypto with schema extensions;

create table if not exists checklist.pdv_pins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  pin_hash text not null unique,
  pode_autorizar boolean not null default false,
  atualizado_em timestamptz not null default now()
);
alter table checklist.pdv_pins enable row level security;   -- sem policies: só as funções abaixo acessam

create table if not exists checklist.pdv_pin_falhas (
  id uuid primary key default gen_random_uuid(),
  quem text not null,
  criado_em timestamptz not null default now()
);
alter table checklist.pdv_pin_falhas enable row level security;
create index if not exists pdv_pin_falhas_idx on checklist.pdv_pin_falhas (quem, criado_em desc);

-- quem fechou a conta e quem cancelou o item
alter table checklist.pdv_comandas add column if not exists fechada_por uuid;
alter table checklist.pdv_pedido_itens add column if not exists cancelado_por uuid;
create index if not exists idx_pdv_comandas_fechada_por on checklist.pdv_comandas(fechada_por);

create or replace function checklist.pdv_hash_pin(p text) returns text
language sql immutable set search_path = extensions, public as $$
  select encode(extensions.digest('paggio-pin:' || p, 'sha256'), 'hex')
$$;

-- administrador define ou troca o PIN de alguém
create or replace function checklist.pdv_definir_pin(p_user uuid, p_pin text, p_autoriza boolean default false) returns void
language plpgsql security definer set search_path = checklist, public as $$
begin
  if not checklist.pdv_pode('pdv_gerir') then raise exception 'Sem permissão.'; end if;
  if p_pin !~ '^[0-9]{4,6}$' then raise exception 'O PIN deve ter de 4 a 6 números.'; end if;
  begin
    insert into checklist.pdv_pins(user_id, pin_hash, pode_autorizar) values (p_user, checklist.pdv_hash_pin(p_pin), coalesce(p_autoriza, false))
    on conflict (user_id) do update set pin_hash = excluded.pin_hash, pode_autorizar = excluded.pode_autorizar, atualizado_em = now();
  exception when unique_violation then
    raise exception 'Esse PIN já é usado por outra pessoa. Escolha outro.';
  end;
end $$;

-- só muda a permissão de autorizar, sem mexer no PIN
create or replace function checklist.pdv_pin_autoriza(p_user uuid, p_autoriza boolean) returns void
language plpgsql security definer set search_path = checklist, public as $$
begin
  if not checklist.pdv_pode('pdv_gerir') then raise exception 'Sem permissão.'; end if;
  update checklist.pdv_pins set pode_autorizar = coalesce(p_autoriza, false), atualizado_em = now() where user_id = p_user;
end $$;

create or replace function checklist.pdv_remover_pin(p_user uuid) returns void
language plpgsql security definer set search_path = checklist, public as $$
begin
  if not checklist.pdv_pode('pdv_gerir') then raise exception 'Sem permissão.'; end if;
  delete from checklist.pdv_pins where user_id = p_user;
end $$;

create or replace function checklist.pdv_listar_pins() returns table(user_id uuid, nome text, tem_pin boolean, pode_autorizar boolean)
language plpgsql stable security definer set search_path = checklist, public as $$
begin
  if not checklist.pdv_pode('pdv_gerir') then raise exception 'Sem permissão.'; end if;
  return query
    select p.id, p.nome, (k.user_id is not null), coalesce(k.pode_autorizar, false)
    from checklist.profiles p left join checklist.pdv_pins k on k.user_id = p.id
    where coalesce(p.ativo, true)
    order by p.nome;
end $$;

-- núcleo: confere o PIN com limite de erros. Só o servidor (service_role) chama direto.
create or replace function checklist.pdv_validar_pin_interno(p_pin text, p_quem text) returns table(user_id uuid, nome text, pode_autorizar boolean)
language plpgsql security definer set search_path = checklist, public as $$
declare n int;
begin
  select count(*) into n from checklist.pdv_pin_falhas where quem = p_quem and criado_em > now() - interval '10 minutes';
  if n >= 8 then raise exception 'Muitas tentativas. Aguarde 10 minutos.'; end if;
  if p_pin is null or p_pin !~ '^[0-9]{4,6}$' then
    insert into checklist.pdv_pin_falhas(quem) values (p_quem);
    return;
  end if;
  return query
    select k.user_id, p.nome, k.pode_autorizar
    from checklist.pdv_pins k join checklist.profiles p on p.id = k.user_id
    where k.pin_hash = checklist.pdv_hash_pin(p_pin) and coalesce(p.ativo, true);
  if not found then insert into checklist.pdv_pin_falhas(quem) values (p_quem); end if;
end $$;
revoke all on function checklist.pdv_validar_pin_interno(text, text) from public, anon, authenticated;
grant execute on function checklist.pdv_validar_pin_interno(text, text) to service_role;

-- usado pelo app logado (Salão)
create or replace function checklist.pdv_validar_pin(p_pin text) returns table(user_id uuid, nome text, pode_autorizar boolean)
language plpgsql security definer set search_path = checklist, public as $$
begin
  if auth.uid() is null or not (checklist.pdv_pode('pdv_operar') or checklist.pdv_pode('pdv_caixa') or checklist.pdv_pode('pdv_gerir')) then
    raise exception 'Sem permissão.';
  end if;
  return query select * from checklist.pdv_validar_pin_interno(p_pin, 'u:' || auth.uid()::text);
end $$;

revoke all on function checklist.pdv_definir_pin(uuid, text, boolean), checklist.pdv_pin_autoriza(uuid, boolean), checklist.pdv_remover_pin(uuid), checklist.pdv_listar_pins(), checklist.pdv_validar_pin(text) from public, anon;
grant execute on function checklist.pdv_definir_pin(uuid, text, boolean), checklist.pdv_pin_autoriza(uuid, boolean), checklist.pdv_remover_pin(uuid), checklist.pdv_listar_pins(), checklist.pdv_validar_pin(text) to authenticated, service_role;
grant all on checklist.pdv_pins, checklist.pdv_pin_falhas to service_role;

-- evita travar o Salão enquanto nenhum PIN foi cadastrado
create or replace function checklist.pdv_tem_pins() returns boolean
language sql stable security definer set search_path = checklist, public as $$
  select exists (select 1 from checklist.pdv_pins)
$$;
revoke all on function checklist.pdv_tem_pins() from public, anon;
grant execute on function checklist.pdv_tem_pins() to authenticated, service_role;

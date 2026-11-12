-- ===== Reservas =====
create table if not exists checklist.reservas_config (
  id int primary key default 1 check (id = 1),
  ativo_online boolean not null default true,
  confirmacao_automatica boolean not null default true,
  duracao_min int not null default 120 check (duracao_min between 30 and 480),
  intervalo_min int not null default 30 check (intervalo_min in (15,30,60)),
  capacidade_pessoas int not null default 40 check (capacidade_pessoas > 0),
  max_pessoas int not null default 12 check (max_pessoas > 0),
  antecedencia_horas int not null default 2 check (antecedencia_horas >= 0),
  dias_futuro int not null default 60 check (dias_futuro between 1 and 365),
  horarios jsonb not null default '[]'
);
insert into checklist.reservas_config(id, horarios)
  select 1, jsonb_agg(jsonb_build_object('dia', d, 'inicio', '18:00', 'fim', '22:00')) from generate_series(0,6) d
on conflict (id) do nothing;
create table if not exists checklist.reservas_bloqueios (id uuid primary key default gen_random_uuid(), data date not null unique, motivo text);
create table if not exists checklist.reservas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references checklist.pdv_clientes(id) on delete set null,
  nome text not null check (length(trim(nome)) > 0),
  telefone text not null check (telefone ~ '^[0-9]{10,13}$'),
  pessoas int not null check (pessoas between 1 and 100),
  data date not null,
  hora time not null,
  duracao_min int not null default 120 check (duracao_min between 30 and 480),
  mesa_id uuid references checklist.pdv_mesas(id) on delete set null,
  status text not null default 'confirmada' check (status in ('pendente','confirmada','sentada','concluida','cancelada','nao_compareceu')),
  origem text not null default 'sistema' check (origem in ('sistema','site','whatsapp')),
  ocasiao text, observacao text,
  comanda_id uuid references checklist.pdv_comandas(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists reservas_data_idx on checklist.reservas(data, hora);
create index if not exists reservas_tel_idx on checklist.reservas(telefone);

create or replace function checklist.reservas_slots(p_data date, p_pessoas int)
returns table(hora text, livre boolean, restante int)
language plpgsql stable security definer set search_path = checklist, public as $$
declare cfg checklist.reservas_config; agora timestamp := now() at time zone 'America/Sao_Paulo'; f jsonb; dw int; t timestamp; ini timestamp; fim timestamp; slot_fim timestamp; ocup numeric;
begin
  select * into cfg from checklist.reservas_config where id = 1;
  if not found or p_data is null then return; end if;
  if exists (select 1 from checklist.reservas_bloqueios b where b.data = p_data) then return; end if;
  if p_data < agora::date or p_data > agora::date + cfg.dias_futuro then return; end if;
  dw := extract(dow from p_data)::int;
  for f in select e.value from jsonb_array_elements(cfg.horarios) e where (e.value->>'dia')::int = dw order by e.value->>'inicio' loop
    ini := p_data + (f->>'inicio')::time;
    fim := p_data + (f->>'fim')::time;
    if fim < ini then fim := fim + interval '1 day'; end if;
    t := ini;
    while t <= fim loop
      if t >= agora + make_interval(hours => cfg.antecedencia_horas) then
        slot_fim := t + make_interval(mins => cfg.duracao_min);
        select coalesce(sum(r.pessoas), 0) into ocup from checklist.reservas r
          where r.data = p_data and r.status in ('pendente','confirmada','sentada')
            and (r.data + r.hora) < slot_fim and (r.data + r.hora + make_interval(mins => r.duracao_min)) > t;
        hora := to_char(t, 'HH24:MI'); restante := cfg.capacidade_pessoas - ocup::int; livre := restante >= coalesce(p_pessoas, 1);
        return next;
      end if;
      t := t + make_interval(mins => cfg.intervalo_min);
    end loop;
  end loop;
end $$;

create or replace function checklist.reserva_criar(p_nome text, p_telefone text, p_pessoas int, p_data date, p_hora time,
  p_origem text default 'sistema', p_ocasiao text default null, p_obs text default null, p_mesa uuid default null, p_forcar boolean default false)
returns jsonb language plpgsql security definer set search_path = checklist, public as $$
declare cfg checklist.reservas_config; tel text := regexp_replace(coalesce(p_telefone,''), '\D', '', 'g'); staff boolean := coalesce(auth.role(), '') <> 'service_role'; cid uuid; rid uuid; st text; ok boolean;
begin
  if staff and not checklist.pdv_pode('pdv_operar') then raise exception 'sem permissão'; end if;
  select * into cfg from checklist.reservas_config where id = 1;
  if length(trim(coalesce(p_nome,''))) = 0 then raise exception 'Informe o nome.'; end if;
  if length(tel) > 11 and left(tel,2) = '55' then tel := substr(tel,3); end if;
  if length(tel) < 10 or length(tel) > 11 then raise exception 'Informe o telefone com DDD.'; end if;
  if p_pessoas is null or p_pessoas < 1 then raise exception 'Informe o número de pessoas.'; end if;
  if not staff then
    if not cfg.ativo_online then raise exception 'Reservas online indisponíveis. Ligue para nós.'; end if;
    if p_pessoas > cfg.max_pessoas then raise exception 'Para mais de % pessoas, fale com a gente.', cfg.max_pessoas; end if;
    if p_origem not in ('site','whatsapp') then raise exception 'origem inválida'; end if;
  end if;
  perform pg_advisory_xact_lock(hashtext('reserva' || p_data::text));
  if not (staff and p_forcar) then
    select exists (select 1 from checklist.reservas_slots(p_data, p_pessoas) s where s.hora = to_char(p_hora, 'HH24:MI') and s.livre) into ok;
    if not ok then raise exception 'Esse horário não está mais disponível.'; end if;
  end if;
  insert into checklist.pdv_clientes(nome, telefone) values (trim(p_nome), tel)
    on conflict (telefone) do update set atualizado_em = now() returning id into cid;
  st := case when staff or cfg.confirmacao_automatica then 'confirmada' else 'pendente' end;
  insert into checklist.reservas(cliente_id, nome, telefone, pessoas, data, hora, duracao_min, mesa_id, status, origem, ocasiao, observacao)
    values (cid, trim(p_nome), tel, p_pessoas, p_data, p_hora, cfg.duracao_min, p_mesa, st, case when staff then 'sistema' else p_origem end, nullif(trim(coalesce(p_ocasiao,'')), ''), nullif(trim(coalesce(p_obs,'')), ''))
    returning id into rid;
  return jsonb_build_object('id', rid, 'status', st);
end $$;
revoke execute on function checklist.reservas_slots(date,int) from public, anon;
revoke execute on function checklist.reserva_criar(text,text,int,date,time,text,text,text,uuid,boolean) from public, anon;
grant execute on function checklist.reservas_slots(date,int) to authenticated, service_role;
grant execute on function checklist.reserva_criar(text,text,int,date,time,text,text,text,uuid,boolean) to authenticated, service_role;

create or replace function checklist.trg_notif_reserva() returns trigger language plpgsql security definer set search_path = checklist, public as $$
begin
  if new.origem <> 'sistema' then
    perform checklist.pdv_notificar('reserva', 'info', 'Nova reserva (' || new.origem || ')', new.nome || ' · ' || new.pessoas || ' pessoa(s) · ' || to_char(new.data, 'DD/MM') || ' ' || to_char(new.hora, 'HH24:MI'), 'reservas', new.id);
  end if;
  return new;
end $$;
revoke execute on function checklist.trg_notif_reserva() from public, anon, authenticated;
create or replace trigger notif_reserva after insert on checklist.reservas for each row execute function checklist.trg_notif_reserva();

alter table checklist.reservas_config enable row level security;
alter table checklist.reservas_bloqueios enable row level security;
alter table checklist.reservas enable row level security;
create policy reservas_config_ler on checklist.reservas_config for select using (checklist.pdv_pode('pdv_operar'));
create policy reservas_config_editar on checklist.reservas_config for update using (checklist.pdv_pode('pdv_gerir')) with check (checklist.pdv_pode('pdv_gerir'));
create policy reservas_bloq_ler on checklist.reservas_bloqueios for select using (checklist.pdv_pode('pdv_operar'));
create policy reservas_bloq_escrever on checklist.reservas_bloqueios for all using (checklist.pdv_pode('pdv_gerir')) with check (checklist.pdv_pode('pdv_gerir'));
create policy reservas_ler on checklist.reservas for select using (checklist.pdv_pode('pdv_operar'));
create policy reservas_editar on checklist.reservas for update using (checklist.pdv_pode('pdv_operar')) with check (checklist.pdv_pode('pdv_operar'));
create policy reservas_apagar on checklist.reservas for delete using (checklist.pdv_pode('pdv_gerir'));

-- ===== WhatsApp (bot de reservas e envio de cardápio) =====
do $$ declare c text; begin
  select conname into c from pg_constraint where conrelid = 'checklist.pdv_dispositivos'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%agente_impressao%';
  if c is not null then execute format('alter table checklist.pdv_dispositivos drop constraint %I', c); end if;
end $$;
alter table checklist.pdv_dispositivos add constraint pdv_dispositivos_tipo_check check (tipo in ('tablet','garcom','caixa','agente_impressao','agente_whatsapp'));

create table if not exists checklist.wa_config (
  id int primary key default 1 check (id = 1),
  bot_ativo boolean not null default false,
  link_base text not null default 'https://checklistpaggio.lovable.app',
  boas_vindas text not null default 'Olá! 👋 Seja bem-vindo ao Paggio Gastrobar.',
  texto_info text not null default 'Estamos abertos todos os dias à noite. Para mais informações, escolha a opção 0 e fale com nossa equipe.',
  agente_ping timestamptz, agente_numero text, agente_qr text, agente_status text not null default 'desconectado'
);
insert into checklist.wa_config(id) values (1) on conflict do nothing;
create table if not exists checklist.wa_conversas (
  telefone text primary key,
  nome text,
  cliente_id uuid references checklist.pdv_clientes(id) on delete set null,
  estado text not null default 'menu',
  dados jsonb not null default '{}',
  humano boolean not null default false,
  nao_lidas int not null default 0,
  ultima_em timestamptz not null default now(),
  criado_em timestamptz not null default now()
);
create table if not exists checklist.wa_mensagens (
  id uuid primary key default gen_random_uuid(),
  telefone text not null,
  direcao text not null check (direcao in ('in','out')),
  texto text not null,
  status text not null default 'recebida' check (status in ('recebida','pendente','enviando','enviada','erro')),
  origem text not null default 'bot' check (origem in ('cliente','bot','humano','campanha')),
  erro text, tentativas int not null default 0,
  criado_em timestamptz not null default now()
);
create index if not exists wa_msg_tel_idx on checklist.wa_mensagens(telefone, criado_em);
create index if not exists wa_msg_fila_idx on checklist.wa_mensagens(status) where status in ('pendente','enviando');
alter table checklist.wa_config enable row level security;
alter table checklist.wa_conversas enable row level security;
alter table checklist.wa_mensagens enable row level security;
create policy wa_config_ler on checklist.wa_config for select using (checklist.pdv_pode('pdv_gerir'));
create policy wa_config_editar on checklist.wa_config for update using (checklist.pdv_pode('pdv_gerir')) with check (checklist.pdv_pode('pdv_gerir'));
create policy wa_conversas_ler on checklist.wa_conversas for select using (checklist.pdv_pode('pdv_operar'));
create policy wa_conversas_editar on checklist.wa_conversas for update using (checklist.pdv_pode('pdv_operar')) with check (checklist.pdv_pode('pdv_operar'));
create policy wa_msg_ler on checklist.wa_mensagens for select using (checklist.pdv_pode('pdv_operar'));
create policy wa_msg_enviar on checklist.wa_mensagens for insert with check (checklist.pdv_pode('pdv_operar') and direcao = 'out' and status = 'pendente' and origem in ('humano','campanha'));

do $$ begin
  begin alter publication supabase_realtime add table checklist.reservas; exception when others then null; end;
  begin alter publication supabase_realtime add table checklist.wa_mensagens; exception when others then null; end;
  begin alter publication supabase_realtime add table checklist.wa_conversas; exception when others then null; end;
end $$;

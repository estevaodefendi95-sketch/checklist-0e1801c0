-- Reservas por salão: o cliente escolhe o salão; a lotação é a soma dos lugares das mesas ativas do salão.
alter table checklist.reservas add column if not exists sala_id uuid references checklist.pdv_salas(id) on delete set null;
create index if not exists idx_reservas_sala_data on checklist.reservas(sala_id, data);

drop function if exists checklist.reservas_slots(date, integer);
create or replace function checklist.reservas_slots(p_data date, p_pessoas integer, p_sala uuid default null)
returns table(hora text, livre boolean, restante integer)
language plpgsql stable security definer set search_path to 'checklist', 'public' as $function$
declare cfg checklist.reservas_config; agora timestamp := now() at time zone 'America/Sao_Paulo'; f jsonb; dw int; t timestamp; ini timestamp; fim timestamp; slot_fim timestamp; ocup numeric; ocup_sala numeric; cap_sala int;
begin
  select * into cfg from checklist.reservas_config where id = 1;
  if not found or p_data is null then return; end if;
  if exists (select 1 from checklist.reservas_bloqueios b where b.data = p_data) then return; end if;
  if p_data < agora::date or p_data > agora::date + cfg.dias_futuro then return; end if;
  if p_sala is not null then
    select coalesce(sum(m.capacidade), 0) into cap_sala from checklist.pdv_mesas m where m.sala_id = p_sala and m.ativo;
  end if;
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
        hora := to_char(t, 'HH24:MI'); restante := cfg.capacidade_pessoas - ocup::int;
        if p_sala is not null then
          select coalesce(sum(r.pessoas), 0) into ocup_sala from checklist.reservas r
            where r.data = p_data and r.status in ('pendente','confirmada','sentada')
              and coalesce(r.sala_id, (select m.sala_id from checklist.pdv_mesas m where m.id = r.mesa_id)) = p_sala
              and (r.data + r.hora) < slot_fim and (r.data + r.hora + make_interval(mins => r.duracao_min)) > t;
          restante := least(restante, cap_sala - ocup_sala::int);
        end if;
        livre := restante >= coalesce(p_pessoas, 1);
        return next;
      end if;
      t := t + make_interval(mins => cfg.intervalo_min);
    end loop;
  end loop;
end $function$;

drop function if exists checklist.reserva_criar(text, text, integer, date, time, text, text, text, uuid, boolean);
create or replace function checklist.reserva_criar(p_nome text, p_telefone text, p_pessoas integer, p_data date, p_hora time, p_origem text default 'sistema', p_ocasiao text default null, p_obs text default null, p_mesa uuid default null, p_forcar boolean default false, p_sala uuid default null)
returns jsonb language plpgsql security definer set search_path to 'checklist', 'public' as $function$
declare cfg checklist.reservas_config; tel text := regexp_replace(coalesce(p_telefone,''), '\D', '', 'g'); staff boolean := coalesce(auth.role(), '') <> 'service_role'; cid uuid; rid uuid; st text; ok boolean; sala uuid := p_sala;
begin
  if staff and not checklist.pdv_pode('pdv_operar') then raise exception 'sem permissão'; end if;
  select * into cfg from checklist.reservas_config where id = 1;
  if length(trim(coalesce(p_nome,''))) = 0 then raise exception 'Informe o nome.'; end if;
  if length(tel) > 11 and left(tel,2) = '55' then tel := substr(tel,3); end if;
  if length(tel) < 10 or length(tel) > 11 then raise exception 'Informe o telefone com DDD.'; end if;
  if p_pessoas is null or p_pessoas < 1 then raise exception 'Informe o número de pessoas.'; end if;
  if sala is null and p_mesa is not null then select m.sala_id into sala from checklist.pdv_mesas m where m.id = p_mesa; end if;
  if sala is not null and not exists (select 1 from checklist.pdv_salas s where s.id = sala and s.ativo) then raise exception 'Salão indisponível.'; end if;
  if not staff then
    if not cfg.ativo_online then raise exception 'Reservas online indisponíveis. Ligue para nós.'; end if;
    if p_pessoas > cfg.max_pessoas then raise exception 'Para mais de % pessoas, fale com a gente.', cfg.max_pessoas; end if;
    if p_origem not in ('site','whatsapp') then raise exception 'origem inválida'; end if;
  end if;
  perform pg_advisory_xact_lock(hashtext('reserva' || p_data::text));
  if not (staff and p_forcar) then
    select exists (select 1 from checklist.reservas_slots(p_data, p_pessoas, sala) s where s.hora = to_char(p_hora, 'HH24:MI') and s.livre) into ok;
    if not ok then raise exception 'Esse horário não está mais disponível%.', case when sala is not null then ' neste salão' else '' end; end if;
  end if;
  insert into checklist.pdv_clientes(nome, telefone) values (trim(p_nome), tel)
    on conflict (telefone) do update set atualizado_em = now() returning id into cid;
  st := case when staff or cfg.confirmacao_automatica then 'confirmada' else 'pendente' end;
  insert into checklist.reservas(cliente_id, nome, telefone, pessoas, data, hora, duracao_min, mesa_id, sala_id, status, origem, ocasiao, observacao)
    values (cid, trim(p_nome), tel, p_pessoas, p_data, p_hora, cfg.duracao_min, p_mesa, sala, st, case when staff then 'sistema' else p_origem end, nullif(trim(coalesce(p_ocasiao,'')), ''), nullif(trim(coalesce(p_obs,'')), ''))
    returning id into rid;
  return jsonb_build_object('id', rid, 'status', st);
end $function$;

grant execute on function checklist.reservas_slots(date, int, uuid) to authenticated, service_role;
grant execute on function checklist.reserva_criar(text, text, int, date, time, text, text, text, uuid, boolean, uuid) to authenticated, service_role;

-- Caixa único do dia: só abre/fecha quem tem a permissão "abrir e fechar o caixa" (administrador sempre tem)
-- ou o agendamento automático. Quem tem permissão de caixa recebe pagamentos dentro do caixa aberto.
alter table checklist.permissoes add column if not exists pdv_caixa_abrir boolean not null default false;
alter table checklist.pdv_caixa_sessoes add column if not exists automatico boolean not null default false;
create unique index if not exists pdv_caixa_um_aberto on checklist.pdv_caixa_sessoes ((true)) where status = 'aberto';

drop policy if exists pdv_caixa_sessoes_escrever on checklist.pdv_caixa_sessoes;
create policy pdv_caixa_sessoes_abrir_fechar on checklist.pdv_caixa_sessoes for all to authenticated
  using (checklist.pdv_pode('pdv_caixa_abrir')) with check (checklist.pdv_pode('pdv_caixa_abrir'));

-- baixa de "a receber" entra no caixa aberto (não mais no caixa de quem recebeu)
create or replace function checklist.pdv_baixar_a_receber(p_id uuid, p_forma text, p_nsu text default null, p_maq text default null)
returns void language plpgsql security definer set search_path = checklist, public as $$
declare ar checklist.pdv_a_receber; ses uuid; novo uuid;
begin
  if not (checklist.pdv_pode('pdv_caixa') or checklist.pdv_pode('pdv_gerir')) then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  if p_forma not in ('dinheiro','credito','debito','pix','outros') then raise exception 'Forma de pagamento inválida.'; end if;
  select * into ar from checklist.pdv_a_receber where id = p_id for update;
  if not found then raise exception 'Conta não encontrada.'; end if;
  if ar.status <> 'aberto' then raise exception 'Essa conta já foi baixada.'; end if;
  select id into ses from checklist.pdv_caixa_sessoes where status = 'aberto' limit 1;
  if ses is null then raise exception 'O caixa está fechado. Só quem tem permissão de caixa pode abri-lo (PDV · Caixa).'; end if;
  insert into checklist.pdv_pagamentos (comanda_id, sessao_id, forma, valor, troco, tef_provedor, tef_status, tef_nsu, user_id, baixa_de)
  values (ar.comanda_id, ses, p_forma, ar.valor, 0,
          case when p_forma in ('credito','debito') then p_maq end,
          case when p_forma in ('credito','debito') then 'aprovado' end,
          nullif(trim(p_nsu), ''), auth.uid(), ar.pagamento_id)
  returning id into novo;
  update checklist.pdv_a_receber set status = 'pago', pago_em = now(), pago_forma = p_forma, baixado_por = auth.uid(), baixa_pagamento_id = novo where id = p_id;
end $$;

-- agenda de abertura e fechamento automáticos
create table if not exists checklist.pdv_caixa_agenda (
  id int primary key default 1 check (id = 1),
  ativo boolean not null default false,
  abrir_hora time not null default '17:00',
  fechar_hora time not null default '03:00',
  dias int[] not null default '{0,1,2,3,4,5,6}',   -- 0 = domingo
  fundo_inicial numeric not null default 0,
  nome_caixa text not null default 'Caixa do dia',
  atualizado_em timestamptz not null default now()
);
insert into checklist.pdv_caixa_agenda (id) values (1) on conflict do nothing;
alter table checklist.pdv_caixa_agenda enable row level security;
drop policy if exists pdv_caixa_agenda_ler on checklist.pdv_caixa_agenda;
drop policy if exists pdv_caixa_agenda_escrever on checklist.pdv_caixa_agenda;
create policy pdv_caixa_agenda_ler on checklist.pdv_caixa_agenda for select to authenticated using (checklist.pdv_pode('pdv_operar') or checklist.pdv_pode('pdv_gerir'));
create policy pdv_caixa_agenda_escrever on checklist.pdv_caixa_agenda for all to authenticated using (checklist.pdv_pode('pdv_caixa_abrir')) with check (checklist.pdv_pode('pdv_caixa_abrir'));
grant select, insert, update on checklist.pdv_caixa_agenda to authenticated;
grant all on checklist.pdv_caixa_agenda to service_role;

-- fecha um caixa sem contagem (contado = esperado) e manda o resumo para a impressora do caixa
create or replace function checklist.pdv_caixa_fechar_auto(p_id uuid, p_abertas int) returns void
language plpgsql security definer set search_path = checklist, public as $$
declare s checklist.pdv_caixa_sessoes; esp jsonb; din numeric; sang numeric; sup numeric; tot numeric; imp uuid;
begin
  select * into s from checklist.pdv_caixa_sessoes where id = p_id and status = 'aberto' for update;
  if not found then return; end if;
  select coalesce(jsonb_object_agg(forma, v), '{}'::jsonb), coalesce(sum(v), 0) into esp, tot
  from (select forma, sum(valor - troco) v from checklist.pdv_pagamentos
        where sessao_id = p_id and not estornado and forma not in ('folha','a_receber','cortesia') group by forma) x;
  select coalesce(sum(valor) filter (where tipo = 'sangria'), 0), coalesce(sum(valor) filter (where tipo = 'suprimento'), 0)
    into sang, sup from checklist.pdv_caixa_movs where sessao_id = p_id;
  din := coalesce((esp->>'dinheiro')::numeric, 0) + sup - sang;
  esp := jsonb_set(esp, '{dinheiro}', to_jsonb(din));
  update checklist.pdv_caixa_sessoes set status = 'fechado', fechado_em = now(), fechado_por = null, contado = esp,
    observacao = 'Fechamento automático, sem contagem de dinheiro' || case when p_abertas > 0 then ' · ' || p_abertas || ' comanda(s) ainda aberta(s)' else '' end
  where id = p_id;
  select id into imp from checklist.pdv_impressoras where funcao = 'caixa' and ativo limit 1;
  if imp is not null then
    insert into checklist.pdv_fila_impressao (impressora_id, tipo, conteudo)
    values (imp, 'fechamento_caixa', jsonb_build_object('caixa', s.caixa, 'aberto_em', s.aberto_em, 'sangrias', sang, 'suprimentos', sup,
      'esperado', esp, 'contado', esp, 'diferenca_dinheiro', 0, 'total_vendas', tot));
  end if;
end $$;

-- roda a cada 5 minutos: abre na hora marcada e fecha depois do horário de fechamento
create or replace function checklist.pdv_caixa_agendado() returns text
language plpgsql security definer set search_path = checklist, public as $$
declare ag checklist.pdv_caixa_agenda; agora timestamp := now() at time zone 'America/Sao_Paulo'; hoje date; ini timestamp; fim timestamp;
  s checklist.pdv_caixa_sessoes; fim_s timestamp; ab int; res text := 'nada';
begin
  select * into ag from checklist.pdv_caixa_agenda where id = 1;
  if not found or not ag.ativo then return 'inativo'; end if;
  hoje := agora::date;
  -- fechar caixas abertos automaticamente quando passou o horário (espera até 60 min por comandas abertas)
  for s in select * from checklist.pdv_caixa_sessoes where status = 'aberto' and automatico loop
    fim_s := (s.aberto_em at time zone 'America/Sao_Paulo')::date + ag.fechar_hora;
    if fim_s <= (s.aberto_em at time zone 'America/Sao_Paulo') then fim_s := fim_s + interval '1 day'; end if;
    if agora >= fim_s then
      select count(*) into ab from checklist.pdv_comandas where status in ('aberta','pedindo_conta');
      if ab = 0 or agora >= fim_s + interval '60 minutes' then perform checklist.pdv_caixa_fechar_auto(s.id, ab); res := 'fechado'; end if;
    end if;
  end loop;
  -- abrir
  ini := hoje + ag.abrir_hora;
  fim := case when ag.fechar_hora > ag.abrir_hora then hoje + ag.fechar_hora else (hoje + 1) + ag.fechar_hora end;
  if agora >= ini and agora < fim and extract(dow from hoje)::int = any (ag.dias)
     and not exists (select 1 from checklist.pdv_caixa_sessoes where status = 'aberto')
     and not exists (select 1 from checklist.pdv_caixa_sessoes where aberto_em >= (ini at time zone 'America/Sao_Paulo')) then
    insert into checklist.pdv_caixa_sessoes (caixa, fundo_inicial, aberto_por, automatico) values (ag.nome_caixa, ag.fundo_inicial, null, true);
    res := 'aberto';
  end if;
  return res;
end $$;
revoke all on function checklist.pdv_caixa_fechar_auto(uuid, int), checklist.pdv_caixa_agendado() from public, anon, authenticated;
grant execute on function checklist.pdv_caixa_fechar_auto(uuid, int), checklist.pdv_caixa_agendado() to service_role;

do $$ begin
  perform cron.unschedule('pdv-caixa-agendado') where exists (select 1 from cron.job where jobname = 'pdv-caixa-agendado');
exception when others then null; end $$;
select cron.schedule('pdv-caixa-agendado', '*/5 * * * *', $cron$select checklist.pdv_caixa_agendado()$cron$);

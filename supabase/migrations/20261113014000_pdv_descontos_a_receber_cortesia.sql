-- Descontos automáticos (cadastrados em Configurações), forma "A receber" (conta fiado/cobrança depois)
-- e "Consumo interno / cortesia" (libera a comanda sem cobrar). A receber e cortesia só com aprovação de administrador.

alter table checklist.pdv_pagamentos drop constraint if exists pdv_pagamentos_forma_check;
alter table checklist.pdv_pagamentos add constraint pdv_pagamentos_forma_check
  check (forma = any (array['dinheiro','credito','debito','pix','voucher','outros','folha','a_receber','cortesia']));
alter table checklist.pdv_pagamentos add column if not exists baixa_de uuid references checklist.pdv_pagamentos(id);
alter table checklist.pdv_comandas add column if not exists desconto_detalhe jsonb;
alter table checklist.pdv_aprov_pedidos add column if not exists dados jsonb;

-- o que já foi recebido (baixas de "a receber" não contam em dobro)
create or replace view checklist.pdv_comanda_totais as
 select c.id as comanda_id,
  coalesce(sum(i.qtd * i.preco_unit) filter (where i.status <> 'cancelado'), 0::numeric) as subtotal,
  round(coalesce(sum(i.qtd * i.preco_unit) filter (where i.status <> 'cancelado'), 0::numeric) * c.taxa_servico_pct / 100::numeric, 2) as servico,
  greatest(0::numeric, coalesce(sum(i.qtd * i.preco_unit) filter (where i.status <> 'cancelado'), 0::numeric)
    + round(coalesce(sum(i.qtd * i.preco_unit) filter (where i.status <> 'cancelado'), 0::numeric) * c.taxa_servico_pct / 100::numeric, 2) - c.desconto) as total,
  (select coalesce(sum(p.valor - p.troco), 0::numeric) from checklist.pdv_pagamentos p
    where p.comanda_id = c.id and not p.estornado and p.baixa_de is null and coalesce(p.tef_status, 'aprovado') = 'aprovado') as pago
 from checklist.pdv_comandas c left join checklist.pdv_pedido_itens i on i.comanda_id = c.id
 group by c.id;

-- regras de desconto automático
create table if not exists checklist.pdv_descontos_regras (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  pct numeric(5,2) not null check (pct >= 0 and pct <= 100),
  escopo text not null default 'todos' check (escopo in ('todos','produtos')),
  produto_ids uuid[] not null default '{}',
  inclui_couvert boolean not null default false,
  remove_servico boolean not null default true,
  ativo boolean not null default true,
  ordem int not null default 0,
  criado_em timestamptz not null default now()
);
alter table checklist.pdv_descontos_regras enable row level security;
drop policy if exists pdv_desc_ler on checklist.pdv_descontos_regras;
create policy pdv_desc_ler on checklist.pdv_descontos_regras for select to authenticated
  using (checklist.pdv_pode('pdv_operar') or checklist.pdv_pode('pdv_caixa') or checklist.pdv_pode('pdv_gerir'));
drop policy if exists pdv_desc_esc on checklist.pdv_descontos_regras;
create policy pdv_desc_esc on checklist.pdv_descontos_regras for all to authenticated
  using (checklist.pdv_pode('pdv_gerir')) with check (checklist.pdv_pode('pdv_gerir'));
grant select, insert, update, delete on checklist.pdv_descontos_regras to authenticated;
grant all on checklist.pdv_descontos_regras to service_role;

-- contas a receber (comandas liberadas para cobrança posterior)
create table if not exists checklist.pdv_a_receber (
  id uuid primary key default gen_random_uuid(),
  comanda_id uuid not null references checklist.pdv_comandas(id),
  pagamento_id uuid references checklist.pdv_pagamentos(id),
  cliente_nome text not null,
  telefone text not null,
  valor numeric(12,2) not null check (valor > 0),
  vencimento date,
  observacao text,
  status text not null default 'aberto' check (status in ('aberto','pago','cancelado')),
  criado_por uuid,
  aprovado_por uuid,
  criado_em timestamptz not null default now(),
  pago_em timestamptz,
  pago_forma text,
  baixado_por uuid,
  baixa_pagamento_id uuid
);
create index if not exists pdv_a_receber_status_idx on checklist.pdv_a_receber (status, criado_em desc);
create index if not exists pdv_a_receber_comanda_idx on checklist.pdv_a_receber (comanda_id);
alter table checklist.pdv_a_receber enable row level security;
drop policy if exists pdv_areceber_ler on checklist.pdv_a_receber;
create policy pdv_areceber_ler on checklist.pdv_a_receber for select to authenticated
  using (checklist.pdv_pode('pdv_caixa') or checklist.pdv_pode('pdv_gerir'));
grant select on checklist.pdv_a_receber to authenticated;
grant all on checklist.pdv_a_receber to service_role;

-- só o servidor (função pdv-aprovar, depois da aprovação) cria pagamento "a receber" ou "cortesia"
create or replace function checklist.trg_bloqueia_forma_aprovada() returns trigger
language plpgsql security definer set search_path = checklist, public as $$
begin
  if coalesce(auth.role(), '') <> 'authenticated' then return new; end if;
  if new.forma in ('a_receber','cortesia') and (tg_op = 'INSERT' or old.forma is distinct from new.forma) then
    raise exception 'A receber e consumo interno exigem aprovação de administrador.' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function checklist.trg_bloqueia_forma_aprovada() from public, anon, authenticated;
drop trigger if exists trg_forma_aprov on checklist.pdv_pagamentos;
create trigger trg_forma_aprov before insert or update on checklist.pdv_pagamentos for each row execute function checklist.trg_bloqueia_forma_aprovada();

-- baixa de uma conta a receber: o cliente pagou depois; entra no caixa de quem recebeu
create or replace function checklist.pdv_baixar_a_receber(p_id uuid, p_forma text, p_nsu text default null, p_maq text default null)
returns void language plpgsql security definer set search_path = checklist, public as $$
declare ar checklist.pdv_a_receber; ses uuid; novo uuid;
begin
  if not (checklist.pdv_pode('pdv_caixa') or checklist.pdv_pode('pdv_gerir')) then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  if p_forma not in ('dinheiro','credito','debito','pix','outros') then raise exception 'Forma de pagamento inválida.'; end if;
  select * into ar from checklist.pdv_a_receber where id = p_id for update;
  if not found then raise exception 'Conta não encontrada.'; end if;
  if ar.status <> 'aberto' then raise exception 'Essa conta já foi baixada.'; end if;
  select id into ses from checklist.pdv_caixa_sessoes where status = 'aberto' and aberto_por = auth.uid() limit 1;
  if ses is null then raise exception 'Abra o seu caixa do dia antes de receber (PDV · Caixa).'; end if;
  insert into checklist.pdv_pagamentos (comanda_id, sessao_id, forma, valor, troco, tef_provedor, tef_status, tef_nsu, user_id, baixa_de)
  values (ar.comanda_id, ses, p_forma, ar.valor, 0,
          case when p_forma in ('credito','debito') then p_maq end,
          case when p_forma in ('credito','debito') then 'aprovado' end,
          nullif(trim(p_nsu), ''), auth.uid(), ar.pagamento_id)
  returning id into novo;
  update checklist.pdv_a_receber set status = 'pago', pago_em = now(), pago_forma = p_forma, baixado_por = auth.uid(), baixa_pagamento_id = novo where id = p_id;
end $$;
revoke execute on function checklist.pdv_baixar_a_receber(uuid, text, text, text) from public, anon;
grant execute on function checklist.pdv_baixar_a_receber(uuid, text, text, text) to authenticated;

-- regras de exemplo, desligadas até o administrador ajustar
insert into checklist.pdv_descontos_regras (nome, pct, escopo, remove_servico, ativo, ordem)
select 'Familiar do proprietário', 50, 'todos', true, false, 1
where not exists (select 1 from checklist.pdv_descontos_regras);

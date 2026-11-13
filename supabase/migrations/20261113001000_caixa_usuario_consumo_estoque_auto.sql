-- ===== 1) Caixa: abertura diária por usuário, sem fundo de caixa =====
drop index if exists checklist.pdv_um_caixa_aberto;
create unique index if not exists pdv_caixa_aberto_por_usuario on checklist.pdv_caixa_sessoes (aberto_por) where status = 'aberto';
alter table checklist.pdv_caixa_sessoes alter column fundo_inicial set default 0;

-- ===== 2) Consumo de funcionários (consumação) =====
create table if not exists checklist.pdv_funcionarios (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cargo text,
  limite_mensal numeric,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
alter table checklist.pdv_funcionarios enable row level security;
drop policy if exists pdv_func_ler on checklist.pdv_funcionarios;
drop policy if exists pdv_func_gerir on checklist.pdv_funcionarios;
create policy pdv_func_ler on checklist.pdv_funcionarios for select using (checklist.pdv_pode('pdv_operar'));
create policy pdv_func_gerir on checklist.pdv_funcionarios for all using (checklist.pdv_pode('pdv_gerir')) with check (checklist.pdv_pode('pdv_gerir'));
alter table checklist.pdv_comandas add column if not exists funcionario_id uuid references checklist.pdv_funcionarios(id) on delete set null;
create index if not exists pdv_comandas_func_idx on checklist.pdv_comandas(funcionario_id) where funcionario_id is not null;
alter table checklist.pdv_config add column if not exists consumo_func_desconto_pct numeric not null default 100 check (consumo_func_desconto_pct between 0 and 100);
alter table checklist.pdv_config add column if not exists estoque_auto_desde date not null default current_date;
-- parte do consumo que o funcionário paga (desconto em folha) não entra no caixa
alter table checklist.pdv_pagamentos drop constraint if exists pdv_pagamentos_forma_check;
alter table checklist.pdv_pagamentos add constraint pdv_pagamentos_forma_check check (forma in ('dinheiro','credito','debito','pix','voucher','outros','folha'));

-- ===== 3) Baixa automática de estoque pelas vendas do PDV =====
create or replace function checklist.pdv_consumo_insumos(p_inicio date, p_fim date)
returns table(insumo_id uuid, dia date, quantidade numeric)
language sql stable set search_path to 'checklist', 'public' as $$
  select x.insumo_id, (i.criado_em at time zone 'America/Sao_Paulo')::date, sum(x.quantidade)
  from checklist.pdv_pedido_itens i
  join checklist.pdv_comandas c on c.id = i.comanda_id and c.status <> 'cancelada'
  join checklist.pdv_produtos p on p.id = i.produto_id and p.ficha_id is not null
  cross join lateral checklist.explodir_ficha(p.ficha_id, i.qtd) x
  where i.status <> 'cancelado' and i.tipo = 'produto'
    and (i.criado_em at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim
  group by 1, 2
$$;

-- consumo teórico = vendas importadas (antes da data de corte) + vendas do PDV (a partir dela)
create or replace function checklist.consumo_teorico(p_inicio date, p_fim date)
returns table(insumo_id uuid, quantidade numeric)
language sql stable set search_path to 'checklist', 'public' as $$
  with corte as (select coalesce((select estoque_auto_desde from checklist.pdv_config where id = 1), current_date) d),
  imp as (
    select x.insumo_id, sum(x.quantidade) q
    from checklist.vendas_itens vi
    join checklist.vendas_importacoes vp on vp.id = vi.importacao_id and vp.status = 'confirmada'
         and vp.data_fim between p_inicio and p_fim and vp.data_fim < (select d from corte)
    cross join lateral checklist.explodir_ficha(vi.ficha_id, vi.quantidade) x
    where vi.ficha_id is not null group by x.insumo_id
  ),
  pdv as (
    select insumo_id, sum(quantidade) q
    from checklist.pdv_consumo_insumos(greatest(p_inicio, (select d from corte)), p_fim) group by insumo_id
  )
  select insumo_id, sum(q) from (select * from imp union all select * from pdv) t group by insumo_id
$$;

-- ===== 4) Alertas de estoque baixo (contagem + entradas − vendas PDV, comparado ao mínimo) =====
create or replace function checklist.estoque_alertas()
returns table(item_id uuid, item text, area text, modelo text, unidade text, minimo numeric, saldo numeric,
              ultima_data date, contado numeric, entradas numeric, consumo numeric, insumo_id uuid, vinculado boolean, abaixo boolean)
language sql stable set search_path to 'checklist', 'public' as $$
  with it as (
    select ci.id, ci.nome_campo, ci.tipo_campo, ci.unidade, ci.estoque_minimo, ci.insumo_id,
           coalesce(nullif(ci.fator_contagem, 0), 1) fator, a.nome area, t.nome modelo
    from checklist.checklist_items ci
    join checklist.checklist_templates t on t.id = ci.template_id and t.contagem_estoque and t.ativo
    join checklist.areas a on a.id = t.area_id
  ),
  cont as (
    select distinct on (r.item_id) r.item_id, e.data,
           coalesce(r.quantidade, case when r.valor ~ '^[0-9]+([.,][0-9]+)?$' then replace(r.valor, ',', '.')::numeric end) q
    from checklist.checklist_respostas r
    join it on it.id = r.item_id
    join checklist.checklist_execucoes e on e.id = r.execucao_id
    where r.quantidade is not null or (it.tipo_campo = 'quantidade' and r.valor ~ '^[0-9]+([.,][0-9]+)?$')
    order by r.item_id, e.data desc, r.updated_at desc nulls last
  ),
  ent_chk as (
    select c.item_id, coalesce(sum(r.entrada), 0) q
    from cont c
    join checklist.checklist_respostas r on r.item_id = c.item_id
    join checklist.checklist_execucoes e on e.id = r.execucao_id and e.data > c.data
    group by c.item_id
  ),
  ent_ins as (
    select c.item_id, coalesce(sum(en.quantidade), 0) q
    from cont c join it on it.id = c.item_id and it.insumo_id is not null
    join checklist.estoque_entradas en on en.insumo_id = it.insumo_id and en.data > c.data
    group by c.item_id
  ),
  vend as (
    select * from checklist.pdv_consumo_insumos(
      greatest((select min(data) + 1 from cont), coalesce((select estoque_auto_desde from checklist.pdv_config where id = 1), current_date)),
      (now() at time zone 'America/Sao_Paulo')::date)
  ),
  cons as (
    select c.item_id, coalesce(sum(v.quantidade), 0) q
    from cont c join it on it.id = c.item_id and it.insumo_id is not null
    join vend v on v.insumo_id = it.insumo_id and v.dia > c.data
    group by c.item_id
  )
  select it.id, it.nome_campo, it.area, it.modelo, it.unidade, it.estoque_minimo,
         round(c.q + coalesce(ec.q, 0) + coalesce(ei.q, 0) / it.fator - coalesce(cs.q, 0) / it.fator, 3),
         c.data, c.q,
         round(coalesce(ec.q, 0) + coalesce(ei.q, 0) / it.fator, 3),
         round(coalesce(cs.q, 0) / it.fator, 3),
         it.insumo_id, it.insumo_id is not null,
         it.estoque_minimo is not null and (c.q + coalesce(ec.q, 0) + coalesce(ei.q, 0) / it.fator - coalesce(cs.q, 0) / it.fator) < it.estoque_minimo
  from it
  join cont c on c.item_id = it.id
  left join ent_chk ec on ec.item_id = it.id
  left join ent_ins ei on ei.item_id = it.id
  left join cons cs on cs.item_id = it.id
$$;
